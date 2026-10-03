import re
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from email import policy
from email.parser import Parser
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

import pytest
from aiosmtpd.controller import Controller
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.analytics import analytics
from backend.app import app
from backend.auth import digest
from backend.checks import CheckResult, perform_check
from backend.config import settings
from backend.db import engine, now
from backend.deployment import database_ready
from backend.migrate import migrate, verify_legacy
from backend.models import (
    AuthSession,
    EmailOtpChallenge,
    Incident,
    Monitor,
    MonitorCheck,
    NotificationDelivery,
    PasswordReset,
    User,
    Website,
)
from backend.notifications import process_notifications
from backend.scheduler import claim_monitors, commit_check
from backend.security import Destination

pytestmark = pytest.mark.integration
ORIGIN, TARGET = "http://localhost:5173", "http://127.0.0.1:4006"
success = CheckResult("UP", 200, 120)
failure = CheckResult("DOWN", 503, 120, "HTTP", "Unexpected HTTP 503.")
state = {"private_hits": 0, "reject_mail": False, "mail": [], "hosts": []}


class TargetHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        state["hosts"].append(self.headers.get("Host"))
        if self.path == "/timeout":
            time.sleep(0.2)
            return
        if self.path == "/disconnect":
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        if self.path == "/private":
            state["private_hits"] += 1
        self.send_response(
            302 if self.path == "/redirect" else 503 if self.path == "/fail" else 200
        )
        if self.path == "/redirect":
            self.send_header("Location", f"{TARGET}/private")
        self.send_header("Content-Length", "7")
        self.end_headers()
        self.wfile.write(b"fixture")

    def log_message(self, format, *args):
        pass


class SMTPHandler:
    async def handle_DATA(self, server, session, envelope):
        if state["reject_mail"]:
            return "451 Temporary test rejection"
        state["mail"].append(envelope.content.decode())
        return "250 Accepted"


@pytest.fixture(scope="module", autouse=True)
def servers():
    if not make_url(settings().database_url).database.startswith("uptimepulse_test_"):
        pytest.fail("Disposable database required: use npm run test:integration.")
    server = ThreadingHTTPServer(("127.0.0.1", 4006), TargetHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    smtp = Controller(SMTPHandler(), hostname="127.0.0.1", port=4026, auth_required=False)
    smtp.start()
    yield
    server.shutdown()
    server.server_close()
    smtp.stop()
    engine().dispose()


@pytest.fixture(autouse=True)
def clean():
    with Session(engine()) as db:
        db.execute(delete(EmailOtpChallenge))
        db.execute(delete(User))
        db.commit()
    state.update(private_hits=0, reject_mail=False, mail=[], hosts=[])
    middleware = app.middleware_stack
    while middleware is not None:
        if hasattr(middleware, "limits"):
            middleware.limits.clear()
        middleware = getattr(middleware, "app", getattr(middleware, "inner", None))


def latest_otp():
    message = Parser(policy=policy.default).parsestr(state["mail"][-1])
    return re.search(
        r"code is: ([0-9]{6})", message.get_body(preferencelist=("plain",)).get_content()
    ).group(1)


def test_render_database_health_does_not_require_running_worker():
    from backend.deployment import schema_current, schema_heads
    from backend.models import WorkerHeartbeat

    with Session(engine()) as db:
        db.execute(delete(WorkerHeartbeat))
        db.commit()
    client = TestClient(app)
    assert database_ready()
    assert client.get("/health/database").json() == {"status": "ready", "database": True}
    assert client.get("/ready").status_code == 503
    # Release validates the exact revision; health stays available across rolling migrations.
    try:
        with engine().begin() as connection:
            connection.execute(text("UPDATE alembic_version SET version_num = 'unknown_revision'"))
        assert not schema_current()
        assert client.get("/health/database").status_code == 200
    finally:
        with engine().begin() as connection:
            connection.execute(
                text("UPDATE alembic_version SET version_num = :revision"),
                {"revision": next(iter(schema_heads()))},
            )
    assert client.get("/health/database").status_code == 200


def test_production_email_otp_uses_secure_cookie_and_origin(monkeypatch):
    from backend import auth, mail
    from backend.deployment import release

    cfg = settings()
    origin = "https://aliveradar-web.onrender.com"
    monkeypatch.setattr(cfg, "node_env", "production")
    monkeypatch.setattr(cfg, "app_origin", origin)
    release()
    release()
    assert not state["mail"]

    def capture_mail(recipient, subject, body, message_id=None, template=None):
        # Capture production MIME at the delivery boundary; never send real email in tests.
        state["mail"].append(
            mail.build_message(recipient, subject, body, message_id, template).as_string()
        )

    monkeypatch.setattr(auth, "send_mail", capture_mail)
    client = TestClient(app, base_url=origin)
    payload = {
        "name": "Production User",
        "email": "production@example.com",
        "password": "a-secure-password-123",
    }
    assert (
        client.post("/api/v1/auth/register", headers={"Origin": ORIGIN}, json=payload).status_code
        == 403
    )
    pending = client.post("/api/v1/auth/register", headers={"Origin": origin}, json=payload)
    assert pending.status_code == 202, pending.text
    assert not client.cookies.get("pulse_session")
    response = client.post(
        "/api/v1/auth/register/verify-otp",
        headers={"Origin": origin},
        json={"token": pending.json()["token"], "code": latest_otp()},
    )
    assert response.status_code == 201, response.text
    cookie = response.headers["set-cookie"].lower()
    assert "secure" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    assert client.get("/api/v1/auth/me").status_code == 200
    assert (
        client.post(
            "/api/v1/auth/logout",
            headers={"Origin": origin, "X-CSRF-Token": response.json()["csrfToken"]},
        ).status_code
        == 204
    )


def complete_otp(client, challenge, purpose="register"):
    return client.post(
        f"/api/v1/auth/{purpose}/verify-otp",
        headers={"Origin": ORIGIN},
        json={"token": challenge["token"], "code": latest_otp()},
    )


def account(email="a@example.com"):
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/register",
        headers={"Origin": ORIGIN},
        json={"name": "Test User", "email": email, "password": "a-secure-password-123"},
    )
    assert response.status_code == 202, response.text
    response = complete_otp(client, response.json())
    assert response.status_code == 201, response.text
    client.headers.update({"Origin": ORIGIN, "X-CSRF-Token": response.json()["csrfToken"]})
    state["mail"].clear()
    return client, response.json()["user"]["id"]


def add(client, url=f"{TARGET}/ok"):
    response = client.post("/api/v1/monitors", json={"name": "Test site", "url": url})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def count(model):
    with Session(engine()) as db:
        return db.scalar(select(func.count()).select_from(model))


def result(identifier, failed=False):
    with Session(engine()) as db:
        db.execute(
            update(Monitor)
            .where(Monitor.id == identifier)
            .values(next_check_at=now() - timedelta(days=1))
        )
        db.commit()
    claim = claim_monitors(1)[0]
    assert claim.id == identifier
    assert commit_check(claim, failure if failed else success)


def create_site(client, email=True):
    response = client.post(
        "/api/v1/websites",
        json={
            "name": "Our website",
            "url": TARGET,
            "emailEnabled": email,
            "pages": [
                {"name": "Home page", "url": "/ok"},
                {"name": "Checkout page", "url": "/fail"},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_website_pages_status_and_real_email():
    client, _ = account()
    site_id = create_site(client)

    def detail():
        return client.get(f"/api/v1/websites/{site_id}").json()

    assert detail()["overallStatus"] is None
    pages = {page["name"]: page["id"] for page in detail()["pages"]}
    result(pages["Home page"])
    result(pages["Checkout page"])
    assert detail()["overallStatus"] == "UP"
    with Session(engine()) as db:
        observed = await perform_check(db.get(Monitor, pages["Checkout page"]))
    assert observed.http_status_code == 503
    result(pages["Checkout page"], True)
    assert detail()["overallStatus"] == "UP"  # One failure is below the configured threshold.
    result(pages["Checkout page"], True)
    data = detail()
    assert data["overallStatus"] == "DEGRADED"
    assert [page["name"] for page in data["failedPages"]] == ["Checkout page"]
    assert (
        client.get("/api/v1/overview").json()["websites"][0]["failedPages"][0]["name"]
        == "Checkout page"
    )
    assert count(NotificationDelivery) == 1
    await process_notifications()
    from email import message_from_string

    message = message_from_string(state["mail"][0])
    body = message.get_payload(0).get_payload(decode=True).decode()
    assert "Our website" in str(message["Subject"]) and "Checkout page" in str(message["Subject"])
    assert "DEGRADED" in body and f"{TARGET}/fail" in body
    result(pages["Checkout page"], True)
    await process_notifications()
    assert len(state["mail"]) == 1  # Continued failures do not spam.
    result(pages["Home page"], True)
    result(pages["Home page"], True)
    assert detail()["overallStatus"] == "DOWN"
    result(pages["Checkout page"])
    assert detail()["overallStatus"] == "DEGRADED"
    result(pages["Home page"])
    assert detail()["overallStatus"] == "UP"
    assert (
        client.patch(f"/api/v1/monitors/{pages['Home page']}", json={"isActive": False}).status_code
        == 200
    )
    assert detail()["overallStatus"] == "UP" and detail()["paused"] == 1
    assert client.delete(f"/api/v1/websites/{site_id}").status_code == 204
    assert count(Website) == count(Monitor) == count(Incident) == count(NotificationDelivery) == 0


def test_website_origin_validation_and_tenant_isolation():
    client, _ = account()
    site_id = create_site(client, False)
    other, _ = account("outsider@example.com")
    for method in ("get", "delete"):
        assert getattr(other, method)(f"/api/v1/websites/{site_id}").status_code == 404
    assert (
        other.patch(
            f"/api/v1/websites/{site_id}", json={"name": "Stolen", "emailEnabled": True}
        ).status_code
        == 404
    )
    assert (
        other.post(
            "/api/v1/monitors",
            json={"name": "Foreign", "url": f"{TARGET}/ok", "websiteId": site_id},
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/websites",
            json={
                "name": "Duplicate",
                "url": TARGET + "/path",
                "pages": [{"name": "New", "url": "/new"}],
            },
        ).status_code
        == 409
    )
    for url in ("https://example.com/checkout", "ftp://example.com", "/ok#secret", "/bad\\url"):
        response = other.post(
            "/api/v1/websites",
            json={
                "name": "Invalid",
                "url": TARGET,
                "pages": [{"name": "Invalid page", "url": url}],
            },
        )
        assert response.status_code == 400, response.text
    assert (
        other.post(
            "/api/v1/websites",
            json={
                "name": "Repeated",
                "url": TARGET,
                "pages": [{"name": "A", "url": "/"}, {"name": "B", "url": TARGET}],
            },
        ).status_code
        == 400
    )
    assert other.get("/api/v1/websites").json()["items"] == []
    page_id = client.post(
        "/api/v1/monitors",
        json={"name": "About page", "url": TARGET + "/about", "websiteId": site_id},
    ).json()["id"]
    assert client.get(f"/api/v1/monitors/{page_id}").json()["websiteId"] == site_id
    auto_id = add(client, TARGET + "/contact")
    assert client.get(f"/api/v1/monitors/{auto_id}").json()["websiteId"] == site_id


async def test_website_email_switch_and_immutable_retry_payload():
    client, _ = account()
    site_id = create_site(client, False)
    page_id = client.get(f"/api/v1/websites/{site_id}").json()["pages"][0]["id"]
    enable(client)
    result(page_id, True)
    result(page_id, True)
    assert count(NotificationDelivery) == 0
    assert (
        client.patch(
            f"/api/v1/websites/{site_id}", json={"name": "Our website", "emailEnabled": True}
        ).status_code
        == 200
    )
    result(page_id)
    sent = []

    def sender(*message):
        sent.append(message)
        if len(sent) == 1:
            raise RuntimeError("Retry fixture")

    await process_notifications(sender, True)
    client.patch(f"/api/v1/monitors/{page_id}", json={"name": "Renamed page"})
    with Session(engine()) as db:
        db.execute(
            update(NotificationDelivery).values(next_attempt_at=now() - timedelta(seconds=1))
        )
        db.commit()
    await process_notifications(sender, True)
    assert len(sent) == 2 and sent[0] == sent[1]
    assert sent[0][4]["kind"] == "recovery" and sent[0][4]["page_name"] != "Renamed page"


def test_authentication():
    client, uid = account()
    with Session(engine()) as db:
        assert "a-secure-password" not in db.get(User, uid).password_hash
        assert db.scalar(select(AuthSession.id)) != client.cookies["pulse_session"]
    assert "passwordHash" not in client.get("/api/v1/auth/me").text
    other = TestClient(app)
    assert (
        other.post(
            "/api/v1/auth/login",
            headers={"Origin": ORIGIN},
            json={"email": "a@example.com", "password": "wrong"},
        ).status_code
        == 401
    )
    login = other.post(
        "/api/v1/auth/login",
        headers={"Origin": ORIGIN},
        json={"email": "a@example.com", "password": "a-secure-password-123"},
    )
    assert login.status_code == 202
    assert "set-cookie" not in login.headers
    assert other.get("/api/v1/auth/me").status_code == 401
    verified = complete_otp(other, login.json(), "login")
    assert verified.status_code == 200
    assert "HttpOnly" in verified.headers["set-cookie"]
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def start_registration(client, email="pending@example.com"):
    return client.post(
        "/api/v1/auth/register",
        headers={"Origin": ORIGIN},
        json={"name": "Pending User", "email": email, "password": "a-secure-password-123"},
    )


def age_challenge(token, **values):
    with Session(engine()) as db:
        db.execute(
            update(EmailOtpChallenge).where(EmailOtpChallenge.id == digest(token)).values(**values)
        )
        db.commit()


def test_registration_waits_for_email_and_single_use_code():
    client = TestClient(app)
    response = start_registration(client)
    assert response.status_code == 202
    challenge, code = response.json(), latest_otp()
    assert code not in response.text and "set-cookie" not in response.headers
    assert count(User) == 0 and count(AuthSession) == 0
    assert client.get("/api/v1/monitors").status_code == 401
    with Session(engine()) as db:
        stored = db.get(EmailOtpChallenge, digest(challenge["token"]))
        assert stored.id != challenge["token"] and stored.code_hash != code
        assert stored.password_hash != "a-secure-password-123"
    mail = Parser(policy=policy.default).parsestr(state["mail"][-1])
    markup = mail.get_body(preferencelist=("html",)).get_content()
    assert code in markup and "5 minutes" in markup and "cid:aliveradar-logo@inline" in markup
    assert (
        client.post(
            "/api/v1/auth/login/verify-otp",
            headers={"Origin": ORIGIN},
            json={"token": challenge["token"], "code": code},
        ).status_code
        == 400
    )
    verified = complete_otp(client, challenge)
    assert verified.status_code == 201 and count(User) == 1 and count(AuthSession) == 1
    client.headers.update({"Origin": ORIGIN, "X-CSRF-Token": verified.json()["csrfToken"]})
    assert complete_otp(client, challenge).status_code == 400
    assert start_registration(TestClient(app)).status_code == 409


def test_wrong_otp_lockout_and_expiry():
    client = TestClient(app)
    challenge = start_registration(client).json()
    code = latest_otp()
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert (
            client.post(
                "/api/v1/auth/register/verify-otp",
                headers={"Origin": ORIGIN},
                json={"token": challenge["token"], "code": wrong},
            ).status_code
            == 400
        )
    assert complete_otp(client, challenge).status_code == 400
    assert count(User) == 0 and count(AuthSession) == 0
    challenge = start_registration(client, "expired@example.com").json()
    age_challenge(challenge["token"], expires_at=now() - timedelta(seconds=1))
    assert complete_otp(client, challenge).status_code == 400
    assert (
        client.post(
            "/api/v1/auth/register/resend-otp",
            headers={"Origin": ORIGIN},
            json={"token": challenge["token"]},
        ).status_code
        == 400
    )


def test_resend_cooldown_invalidates_old_code_and_keeps_attempt_budget():
    client = TestClient(app)
    challenge = start_registration(client).json()
    old = latest_otp()
    payload = {"token": challenge["token"]}
    assert (
        client.post(
            "/api/v1/auth/register/resend-otp", headers={"Origin": ORIGIN}, json=payload
        ).status_code
        == 429
    )
    assert start_registration(client).status_code == 429
    age_challenge(challenge["token"], last_sent_at=now() - timedelta(seconds=61), attempts=2)
    response = client.post(
        "/api/v1/auth/register/resend-otp", headers={"Origin": ORIGIN}, json=payload
    )
    assert response.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/register/verify-otp",
            headers={"Origin": ORIGIN},
            json={**payload, "code": old},
        ).status_code
        == 400
    )
    with Session(engine()) as db:
        stored = db.get(EmailOtpChallenge, digest(challenge["token"]))
        assert stored.attempts == 3 and stored.send_count == 2
    assert complete_otp(client, challenge).status_code == 201


def test_otp_delivery_failure_never_creates_account_or_session():
    state["reject_mail"] = True
    response = start_registration(TestClient(app))
    assert response.status_code == 503 and "set-cookie" not in response.headers
    assert count(User) == 0 and count(AuthSession) == 0
    with Session(engine()) as db:
        assert db.scalar(select(EmailOtpChallenge)).consumed_at is not None


def test_otp_issuance_limit_survives_new_challenges():
    client = TestClient(app)
    for _ in range(5):
        challenge = start_registration(client).json()
        assert "token" in challenge
        age_challenge(challenge["token"], last_sent_at=now() - timedelta(seconds=61))
    assert start_registration(client).status_code == 429
    assert count(User) == 0


def test_otp_parallel_replay_creates_only_one_session():
    from concurrent.futures import ThreadPoolExecutor

    client = TestClient(app)
    challenge = start_registration(client).json()
    payload = {"token": challenge["token"], "code": latest_otp()}

    def verify(_):
        with TestClient(app) as parallel:
            return parallel.post(
                "/api/v1/auth/register/verify-otp", headers={"Origin": ORIGIN}, json=payload
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(verify, [1, 2])) == [201, 400]
    assert count(User) == 1 and count(AuthSession) == 1


def test_old_sessions_demo_and_password_reset_cannot_bypass_otp():
    client, uid = account()
    with Session(engine()) as db:
        db.execute(update(AuthSession).values(otp_verified_at=None))
        db.commit()
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.post("/api/v1/auth/demo").status_code == 404
    login = client.post(
        "/api/v1/auth/login", json={"email": "a@example.com", "password": "a-secure-password-123"}
    ).json()
    with Session(engine()) as db:
        db.add(
            PasswordReset(id=digest("b" * 64), user_id=uid, expires_at=now() + timedelta(minutes=1))
        )
        db.commit()
    assert (
        client.post(
            "/api/v1/auth/reset-password",
            json={"token": "b" * 64, "password": "different-password-123"},
        ).status_code
        == 200
    )
    assert complete_otp(client, login, "login").status_code == 400
    assert count(AuthSession) == 0


def test_origin_csrf_and_body_limit():
    assert TestClient(app).get("/api/v1/monitors").status_code == 401
    client, _ = account()
    assert (
        client.post(
            "/api/v1/monitors",
            headers={"X-CSRF-Token": ""},
            json={"name": "X", "url": f"{TARGET}/ok"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/monitors",
            headers={"Origin": "https://evil.test"},
            json={"name": "X", "url": f"{TARGET}/ok"},
        ).status_code
        == 403
    )
    assert client.post("/api/v1/monitors", content=b"x" * 33000).status_code == 413


def test_tenant_isolation():
    client, _ = account()
    identifier = add(client)
    other, _ = account("b@example.com")
    for suffix in ["", "/analytics", "/checks", "/incidents"]:
        assert other.get(f"/api/v1/monitors/{identifier}{suffix}").status_code == 404
    assert other.patch(f"/api/v1/monitors/{identifier}", json={"name": "stolen"}).status_code == 404
    assert (
        other.post(
            "/api/v1/status-pages",
            json={"name": "Status", "slug": "test-status", "monitorIds": [identifier]},
        ).status_code
        == 400
    )


def test_single_use_reset_revokes_sessions():
    client, uid = account()
    token = "a" * 64
    with Session(engine()) as db:
        db.add(
            PasswordReset(id=digest(token), user_id=uid, expires_at=now() + timedelta(minutes=1))
        )
        db.commit()
    anonymous = TestClient(app)
    body = {"token": token, "password": "new-secure-password-123"}
    assert (
        anonymous.post(
            "/api/v1/auth/reset-password", headers={"Origin": ORIGIN}, json=body
        ).status_code
        == 200
    )
    assert (
        anonymous.post(
            "/api/v1/auth/reset-password", headers={"Origin": ORIGIN}, json=body
        ).status_code
        == 400
    )
    assert client.get("/api/v1/auth/me").status_code == 401


def test_crud_and_pagination():
    client, _ = account()
    identifier = add(client)
    assert (
        client.patch(f"/api/v1/monitors/{identifier}", json={"name": "Updated site"}).status_code
        == 200
    )
    assert client.get("/api/v1/monitors?search=Updated").json()["total"] == 1
    assert client.get("/api/v1/monitors?limit=101").status_code == 400
    assert client.get(f"/api/v1/monitors/{identifier}/analytics?days=3").status_code == 400
    for action in ["pause", "resume"]:
        assert client.post(f"/api/v1/monitors/{identifier}/{action}").status_code == 200
    assert client.get(f"/api/v1/monitors/{identifier}").json()["currentStatus"] == "PENDING"
    assert "leaseToken" not in client.get(f"/api/v1/monitors/{identifier}").text
    result(identifier)
    assert client.delete(f"/api/v1/monitors/{identifier}").status_code == 204
    assert count(MonitorCheck) == 0


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com",
        "http://169.254.169.254",
        "http://10.0.0.1",
        "http://localhost:8080",
        "https://user:pass@example.com",
    ],
)
def test_unsafe_monitor(url):
    client, _ = account()
    assert client.post("/api/v1/monitors", json={"name": "Unsafe", "url": url}).status_code == 400


def test_real_analytics_and_passive_dashboard():
    client, _ = account()
    identifier = add(client)
    assert client.get(f"/api/v1/monitors/{identifier}/analytics").json()["uptime"] is None
    result(identifier)
    result(identifier, True)
    stats = client.get(f"/api/v1/monitors/{identifier}/analytics").json()
    assert stats["uptime"] == 50 and stats["totalChecks"] == 2 and stats["chart"]
    assert client.get("/api/v1/overview").status_code == 200
    assert client.get("/api/v1/monitors").status_code == 200
    assert count(MonitorCheck) == 2


def test_incident_thresholds_and_duplicate_commit():
    client, _ = account()
    identifier = add(client)
    result(identifier, True)
    assert count(Incident) == 0
    result(identifier, True)
    result(identifier, True)
    assert count(Incident) == 1
    assert (
        client.patch(
            f"/api/v1/monitors/{identifier}", json={"name": "Renamed site", "isActive": True}
        ).status_code
        == 200
    )
    client.post(f"/api/v1/monitors/{identifier}/resume")
    with Session(engine()) as db:
        assert db.scalar(select(Incident)).status == "OPEN"
        db.execute(update(Monitor).values(next_check_at=now() - timedelta(days=1)))
        db.commit()
    claim = claim_monitors(1)[0]
    with ThreadPoolExecutor(2) as pool:
        commits = list(pool.map(lambda _: commit_check(claim, success), range(2)))
    assert commits.count(True) == 1
    with Session(engine()) as db:
        assert db.scalar(select(Incident)).status == "RESOLVED"
        assert db.scalar(select(Incident)).resolved_at is not None
    assert count(MonitorCheck) == 4


def test_parallel_claims_and_lease_fencing():
    client, _ = account()
    identifier = add(client)
    with ThreadPoolExecutor(2) as pool:
        claims = list(pool.map(lambda _: claim_monitors(1), range(2)))
    assert sum(len(c) for c in claims) == 1
    stale = (claims[0] + claims[1])[0]
    with Session(engine()) as db:
        db.execute(
            update(Monitor)
            .where(Monitor.id == identifier)
            .values(lease_until=now() - timedelta(minutes=1))
        )
        db.commit()
    fresh = claim_monitors(1)[0]
    assert fresh.lease_token != stale.lease_token
    assert not commit_check(stale, success)
    assert commit_check(fresh, success)
    assert count(MonitorCheck) == 1


@pytest.mark.parametrize("change", ["pause", "configuration"])
def test_configuration_fences_inflight_results(change):
    client, _ = account()
    identifier = add(client)
    claim = claim_monitors(1)[0]
    if change == "pause":
        client.post(f"/api/v1/monitors/{identifier}/pause")
        assert not claim_monitors(1)
    else:
        client.patch(f"/api/v1/monitors/{identifier}", json={"timeoutMs": 1500})
    assert not commit_check(claim, success)
    assert count(MonitorCheck) == 0


async def test_real_http_and_redirect_policy():
    base = dict(url=f"{TARGET}/ok", method="GET", timeout_ms=1000, expected_status_codes=[200])
    assert (await perform_check(SimpleNamespace(**base))).result_status == "UP"
    for path, kind in [("fail", "HTTP"), ("disconnect", "CONNECTION"), ("timeout", "TIMEOUT")]:
        result = await perform_check(
            SimpleNamespace(**{**base, "url": f"{TARGET}/{path}", "timeout_ms": 40})
        )
        assert result.error_type == kind
    assert (
        await perform_check(
            SimpleNamespace(**{**base, "url": f"{TARGET}/fail", "expected_status_codes": [503]})
        )
    ).result_status == "UP"
    assert (
        await perform_check(SimpleNamespace(**{**base, "url": f"{TARGET}/redirect"}))
    ).http_status_code == 302
    assert state["private_hits"] == 0
    assert (
        await perform_check(SimpleNamespace(**{**base, "url": "http://169.254.169.254"}))
    ).error_type == "BLOCKED"


async def test_dns_pinning_preserves_hostname():
    url, calls = "http://never-resolve.invalid:4006/ok", []

    async def resolve(raw):
        calls.append(raw)
        return Destination(raw, "never-resolve.invalid", "127.0.0.1", socket.AF_INET, 4006)

    result = await perform_check(
        SimpleNamespace(url=url, method="GET", timeout_ms=1000, expected_status_codes=[200]),
        resolve,
    )
    assert result.result_status == "UP" and calls == [url]
    assert state["hosts"] == ["never-resolve.invalid:4006"]


def enable(client):
    assert (
        client.patch(
            "/api/v1/notifications/preferences",
            json={"emailEnabled": True, "outageNotifications": True, "recoveryNotifications": True},
        ).status_code
        == 200
    )


async def test_smtp_acceptance_and_rejection():
    client, _ = account()
    identifier = add(client)
    enable(client)
    result(identifier, True)
    result(identifier, True)
    await process_notifications()
    assert (
        len(state["mail"]) == 1
        and "Outage detected" in state["mail"][0]
        and "text/html" in state["mail"][0]
    )
    message = Parser(policy=policy.default).parsestr(state["mail"][0])
    markup = message.get_body(preferencelist=("html",)).get_content()
    assert "An outage was detected." in markup and "View incident" in markup
    assert 'src="cid:aliveradar-logo@inline"' in markup
    assert len([part for part in message.walk() if part.get_content_type() == "image/png"]) == 1
    with Session(engine()) as db:
        assert db.scalar(select(NotificationDelivery)).status == "DELIVERED"
    result(identifier)
    state["reject_mail"] = True
    await process_notifications()
    with Session(engine()) as db:
        recovery = db.scalar(
            select(NotificationDelivery).where(NotificationDelivery.event_type == "RECOVERY")
        )
        assert recovery.status == "PENDING" and recovery.delivered_at is None
        assert recovery.next_attempt_at > now()
    assert len(state["mail"]) == 1


async def test_legacy_frozen_email_payload_keeps_content_and_gets_inline_logo():
    client, _ = account()
    identifier = add(client)
    enable(client)
    result(identifier, True)
    result(identifier, True)
    payload = {
        "recipient": "saved-recipient@example.com",
        "subject": "Saved alert",
        "text": "Keep the original alert text.",
    }
    with Session(engine()) as db:
        delivery = db.scalar(select(NotificationDelivery))
        delivery.message_payload = payload
        delivery_id = delivery.id
        db.commit()
    await process_notifications()
    assert len(state["mail"]) == 1
    message = Parser(policy=policy.default).parsestr(state["mail"][0])
    assert message["To"] == payload["recipient"] and message["Subject"] == payload["subject"]
    assert message["Message-ID"] == f"<{delivery_id}@uptimepulse>"
    assert message.get_body(preferencelist=("plain",)).get_content().strip() == payload["text"]
    assert (
        'src="cid:aliveradar-logo@inline"'
        in message.get_body(preferencelist=("html",)).get_content()
    )
    with Session(engine()) as db:
        delivery = db.get(NotificationDelivery, delivery_id)
        assert delivery.status == "DELIVERED" and delivery.message_payload == payload


def test_smtp_password_reset():
    client, _ = account()
    assert (
        client.post("/api/v1/auth/forgot-password", json={"email": "a@example.com"}).status_code
        == 200
    )
    assert len(state["mail"]) == 1
    message = Parser(policy=policy.default).parsestr(state["mail"][0])
    markup = message.get_body(preferencelist=("html",)).get_content()
    assert "Reset your password." in markup and "30 minutes" in markup
    assert 'src="cid:aliveradar-logo@inline"' in markup
    decoded = state["mail"][0].replace("=\r\n", "").replace("=3D", "=")
    token = re.search(r"token=([a-f0-9]{64})", decoded).group(1)
    response = TestClient(app).post(
        "/api/v1/auth/reset-password",
        headers={"Origin": ORIGIN},
        json={"token": token, "password": "reset-with-smtp-123"},
    )
    assert response.status_code == 200
    assert count(PasswordReset) == 0 and client.get("/api/v1/auth/me").status_code == 401


async def test_final_attempt_crash_and_preference_cancellation():
    client, _ = account()
    identifier = add(client)
    enable(client)
    result(identifier, True)
    result(identifier, True)
    with Session(engine()) as db:
        db.execute(
            update(NotificationDelivery).values(
                status="SENDING",
                attempts=6,
                lease_until=now() - timedelta(minutes=1),
                lease_token="abandoned",
            )
        )
        db.commit()
    await process_notifications()
    with Session(engine()) as db:
        assert db.scalar(select(NotificationDelivery)).status == "FAILED"
    result(identifier)
    client.patch(
        "/api/v1/notifications/preferences",
        json={"emailEnabled": False, "outageNotifications": True, "recoveryNotifications": True},
    )
    await process_notifications()
    with Session(engine()) as db:
        assert all(d.status == "FAILED" for d in db.scalars(select(NotificationDelivery)))
    assert not state["mail"]


async def test_outbox_uniqueness_and_retry():
    client, _ = account()
    identifier = add(client)
    enable(client)
    result(identifier, True)
    result(identifier, True)
    result(identifier, True)
    assert count(NotificationDelivery) == 1
    attempts = []

    def sender(*args):
        attempts.append(args)
        if len(attempts) == 1:
            raise RuntimeError("Provider rejected")

    await process_notifications(sender, True)
    with Session(engine()) as db:
        delivery = db.scalar(select(NotificationDelivery))
        assert (
            delivery.status == "PENDING"
            and delivery.attempts == 1
            and delivery.delivered_at is None
        )
        delivery.next_attempt_at = now() - timedelta(minutes=1)
        db.commit()
    await process_notifications(sender, True)
    with Session(engine()) as db:
        delivery = db.scalar(select(NotificationDelivery))
        assert (
            delivery.status == "DELIVERED"
            and delivery.attempts == 2
            and delivery.delivered_at is not None
        )
    result(identifier)
    assert count(NotificationDelivery) == 2


def test_public_status_and_ownership():
    client, _ = account()
    identifier = add(client)
    body = {
        "name": "Our services",
        "slug": "our-services",
        "isPublic": False,
        "monitorIds": [identifier],
    }
    creation = client.post("/api/v1/status-pages", json=body)
    assert creation.status_code == 201
    assert TestClient(app).get("/api/v1/public/status/our-services").status_code == 404
    pid = creation.json()["id"]
    assert (
        client.patch(f"/api/v1/status-pages/{pid}", json={**body, "isPublic": True}).status_code
        == 200
    )
    response = TestClient(app).get("/api/v1/public/status/our-services")
    assert response.status_code == 200
    assert len(response.json()["components"]) == 1
    assert TARGET not in response.text and "a@example.com" not in response.text
    assert response.json()["components"][0]["uptime"] is None
    assert client.get("/api/v1/status-pages").json()["items"][0]["monitors"] == [
        {"monitorId": identifier}
    ]
    assert client.delete(f"/api/v1/status-pages/{pid}").status_code == 204


def test_utc_window_clips_downtime_and_ignores_paused_samples():
    client, _ = account()
    identifier = add(client)
    instant = now()
    with Session(engine()) as db:
        db.add_all(
            [
                MonitorCheck(
                    monitor_id=identifier,
                    checked_at=instant - timedelta(hours=1),
                    result_status="UP",
                    response_time_ms=100,
                ),
                MonitorCheck(
                    monitor_id=identifier,
                    checked_at=instant - timedelta(minutes=30),
                    result_status="DOWN",
                    response_time_ms=300,
                ),
                MonitorCheck(monitor_id=identifier, checked_at=instant, result_status="PAUSED"),
                Incident(
                    monitor_id=identifier,
                    started_at=instant - timedelta(hours=25),
                    resolved_at=instant - timedelta(hours=23),
                    status="RESOLVED",
                    cause="fixture",
                ),
            ]
        )
        db.commit()
        stats = analytics(db, identifier, 1, instant)
        assert (
            stats["uptime"] == 50
            and stats["averageResponseMs"] == 200
            and stats["downtimeMs"] == 3600000
        )


def test_legacy_schema_adoption_preserves_data():
    client, uid = account()
    identifier = add(client)
    result(identifier)
    root = Path(__file__).resolve().parents[1] / "migrations/sql"
    with engine().begin() as connection:
        connection.execute(text('DROP TABLE "EmailOtpChallenge"'))
        connection.execute(text('ALTER TABLE "User" DROP COLUMN "emailVerifiedAt"'))
        connection.execute(text('ALTER TABLE "Session" DROP COLUMN "otpVerifiedAt"'))
        connection.execute(text('ALTER TABLE "Monitor" DROP COLUMN "websiteId"'))
        connection.execute(text('ALTER TABLE "NotificationDelivery" DROP COLUMN "messagePayload"'))
        connection.execute(text('DROP TABLE "Website"'))
        connection.execute(text("DROP TABLE alembic_version"))
        connection.execute(
            text(
                "CREATE TABLE _prisma_migrations (migration_name text, checksum text, finished_at timestamp, rolled_back_at timestamp)"
            )
        )
        for name, filename in [
            ("20261002000000_initial", "initial.sql"),
            ("20261002001000_constraints", "constraints.sql"),
        ]:
            connection.execute(
                text("INSERT INTO _prisma_migrations VALUES (:name, :checksum, NOW(), NULL)"),
                {"name": name, "checksum": sha256((root / filename).read_bytes()).hexdigest()},
            )
    migrate()
    assert client.get("/api/v1/auth/me").status_code == 401
    response = client.post(
        "/api/v1/auth/login", json={"email": "a@example.com", "password": "a-secure-password-123"}
    )
    verified = complete_otp(client, response.json(), "login")
    client.headers["X-CSRF-Token"] = verified.json()["csrfToken"]
    assert client.get("/api/v1/auth/me").json()["user"]["id"] == uid
    assert (
        client.get(f"/api/v1/monitors/{identifier}").status_code == 200 and count(MonitorCheck) == 1
    )
    with engine().begin() as connection:
        connection.execute(text("UPDATE _prisma_migrations SET checksum='tampered'"))
        with pytest.raises(RuntimeError, match="modified"):
            verify_legacy(connection)
        connection.execute(text("DROP TABLE _prisma_migrations"))
