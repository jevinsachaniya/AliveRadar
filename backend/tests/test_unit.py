from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from backend.analytics import next_state, retry_delay
from backend.auth import hash_password, password_valid
from backend.db import now, sqlalchemy_url
from backend.schemas import MonitorInput, MonitorPatch, Registration, validate_url
from backend.security import PinnedResolver, public_address, safe_destination
from backend.website_state import overall_status, website_origin


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com",
        "file:///etc/passwd",
        "https://user:pass@example.com",
        "https://example.com/#secret",
        "https://example.com\\@localhost",
        "https://example.com:bad",
    ],
)
def test_invalid_url(url):
    with pytest.raises(ValueError):
        validate_url(url)


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "192.168.1.5",
        "169.254.169.254",
        "0.0.0.0",
        "100.64.0.1",
        "224.0.0.1",
        "198.18.0.1",
        "::1",
        "::",
        "fc00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "2001:db8::1",
        "2002:7f00:1::",
        "not-an-ip",
    ],
)
def test_blocked_address(address):
    assert not public_address(address)


@pytest.mark.parametrize("address", ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])
def test_public_address(address):
    assert public_address(address)


async def test_mixed_dns_and_pinning():
    calls = []

    async def mixed(host, port):
        return [("93.184.216.34", 2), ("127.0.0.1", 2)]

    with pytest.raises(ValueError):
        await safe_destination("https://example.com", mixed)

    async def public(host, port):
        calls.append((host, port))
        return [("93.184.216.34", 2)]

    destination = await safe_destination("https://example.com", public)
    resolver = PinnedResolver(destination)
    assert (await resolver.resolve("example.com", 443))[0]["host"] == "93.184.216.34"
    assert len(calls) == 1
    with pytest.raises(ValueError):
        await resolver.resolve("other.example.com", 443)


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost",
        "http://metadata.internal",
        "https://example.com:8080",
        "http://127.0.0.2:4006",
    ],
)
async def test_restricted_destinations(url):
    with pytest.raises(ValueError):
        await safe_destination(url)


def test_thresholds():
    monitor = SimpleNamespace(
        current_status="PENDING",
        consecutive_failures=0,
        consecutive_successes=0,
        failure_threshold=2,
        recovery_threshold=2,
    )
    for success, expected in [(False, "PENDING"), (False, "DOWN"), (True, "DOWN"), (True, "UP")]:
        state = next_state(monitor, success)
        assert state["current_status"] == expected
        monitor.__dict__.update(state)
    assert monitor.consecutive_failures == 0
    assert [retry_delay(i) for i in [1, 2, 3, 20]] == [30000, 60000, 120000, 3600000]


def test_validation_and_legacy_hashes():
    with pytest.raises(ValidationError):
        MonitorInput(name="Site", url="https://example.com", intervalSeconds=1)
    assert MonitorInput(name="Site", url="https://example.com").expected_status_codes == [200]
    assert MonitorPatch(name="Rename").model_dump(exclude_unset=True) == {"name": "Rename"}
    with pytest.raises(ValidationError):
        Registration(name="Test", email="test@example.com", password="😊" * 20)
    hashed = hash_password("a-secure-password-123")
    assert password_valid("a-secure-password-123", hashed)
    # bcryptjs's $2a$ hashes remain usable after migration.
    assert password_valid("a-secure-password-123", "$2a$" + hashed[4:])
    assert not password_valid("wrong", hashed)


def test_prisma_url_compatibility():
    url, size = sqlalchemy_url(
        "postgresql://pulse:secret@localhost/db?connection_limit=4&schema=public"
    )
    assert size == 4
    assert "connection_limit" not in url and "schema" not in url
    assert url.startswith("postgresql+psycopg://")
    assert now().microsecond % 1000 == 0


@pytest.mark.parametrize(
    "states,expected",
    [
        ([], None),
        (["UP"], "UP"),
        (["UP", "UP"], "UP"),
        (["UP", "DOWN"], "DEGRADED"),
        (["DOWN", "DOWN"], "DOWN"),
        (["PENDING"], None),
        (["UP", "PENDING"], None),
        (["DOWN", "PENDING"], "DEGRADED"),
        (["UP", "PAUSED"], "UP"),
        (["PAUSED"], None),
        (["UNKNOWN", "UP"], None),
    ],
)
def test_website_overall_status(states, expected):
    pages = [SimpleNamespace(current_status=value, is_active=value != "PAUSED") for value in states]
    assert overall_status(pages) == expected


@pytest.mark.parametrize(
    "url,origin",
    [
        ("https://EXAMPLE.com:443/about", "https://example.com"),
        ("http://example.com:80", "http://example.com"),
        ("https://example.com:8443/path?q=1", "https://example.com:8443"),
        ("http://[::1]:4006/ok", "http://[::1]:4006"),
    ],
)
def test_website_origin(url, origin):
    assert website_origin(url) == origin


@pytest.mark.parametrize("secure", [False, True])
def test_smtp_verified_tls_authentication_and_message(monkeypatch, secure):
    import ssl

    from backend import mail

    cfg = SimpleNamespace(
        email_configured=True,
        smtp_host="smtp-relay.brevo.com",
        smtp_port=465 if secure else 587,
        smtp_secure=secure,
        smtp_user="fixture-login",
        smtp_pass="fixture-secret",
        smtp_from="Alerts <owner@example.com>",
        node_env="development",
    )
    monkeypatch.setattr(mail, "settings", lambda: cfg)
    events, messages = [], []

    class Transport:
        def __init__(self, host, port, timeout, context=None):
            assert timeout == 15
            if secure:
                assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
            events.append("connect")

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def ehlo(self):
            events.append("ehlo")

        def has_extn(self, value):
            return value == "starttls"

        def starttls(self, context):
            assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
            events.append("starttls")

        def login(self, user, password):
            assert secure or "starttls" in events
            assert (user, password) == ("fixture-login", "fixture-secret")
            events.append("login")

        def send_message(self, message):
            messages.append(message)
            return {}

    monkeypatch.setattr(mail.smtplib, "SMTP", Transport)
    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", Transport)
    mail.send_mail(
        "owner@example.com", "Page <down>", "URL: https://example.com", "<delivery@uptimepulse>"
    )
    message = messages[0]
    assert (
        message["To"] == "owner@example.com" and message["Message-ID"] == "<delivery@uptimepulse>"
    )
    assert "Page &lt;down&gt;" in message.get_body(preferencelist=("html",)).get_content()
    assert "fixture-secret" not in message.as_string()


def test_authenticated_smtp_refuses_plaintext_connection(monkeypatch):
    from backend import mail

    cfg = SimpleNamespace(
        email_configured=True,
        smtp_host="smtp-relay.brevo.com",
        smtp_port=587,
        smtp_secure=False,
        smtp_user="fixture-login",
        smtp_pass="fixture-secret",
        smtp_from="Alerts <owner@example.com>",
        node_env="development",
    )
    monkeypatch.setattr(mail, "settings", lambda: cfg)

    class Transport:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def ehlo(self):
            pass

        def has_extn(self, value):
            return False

        def login(self, *args):
            pytest.fail("Credentials must never be sent without TLS")

    monkeypatch.setattr(mail.smtplib, "SMTP", Transport)
    with pytest.raises(RuntimeError, match="require TLS"):
        mail.send_mail("owner@example.com", "Down", "Failed")


@pytest.mark.parametrize(
    "sender,configured",
    [
        ("Alerts <alerts@example.com>", False),
        ("invalid", False),
        ("Alerts <owner@gmail.com>", True),
    ],
)
def test_brevo_requires_a_real_sender(sender, configured):
    from backend.config import Settings

    cfg = Settings(
        _env_file=None,
        database_url="postgresql://localhost/fixture",
        smtp_host="smtp-relay.brevo.com",
        smtp_user="fixture-login",
        smtp_pass="fixture-secret",
        smtp_from=sender,
    )
    assert cfg.email_provider == "brevo" and cfg.email_configured == configured
