from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from uvicorn.config import Config

from backend.app import SecurityMiddleware, http_error
from backend.config import Settings
from backend.frontend import mount_website


@pytest.fixture
def website(tmp_path, monkeypatch):
    from backend import app as api

    (tmp_path / "index.html").write_text('<html><div id="root">AliveRadar</div></html>')
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets/app-abcd1234.js").write_text("console.log('AliveRadar');")
    (tmp_path / "brand").mkdir()
    (tmp_path / "brand/logo.png").write_bytes(b"png-fixture")
    (tmp_path / ".env").write_text("private-do-not-serve")
    cfg = SimpleNamespace(node_env="production", app_origin="https://aliveradar-web.onrender.com")
    monkeypatch.setattr(api, "settings", lambda: cfg)
    monkeypatch.setattr(
        api, "lookup_session", lambda raw: pytest.fail("Static files must not query sessions")
    )
    site = FastAPI()
    from starlette.exceptions import HTTPException

    site.add_exception_handler(HTTPException, http_error)
    site.add_middleware(SecurityMiddleware)

    @site.get("/api/v1/private")
    def private():
        raise HTTPException(401, "Authentication required.")

    @site.get("/health")
    def health():
        return {"status": "ok"}

    mount_website(site, str(tmp_path))
    return TestClient(site, base_url=cfg.app_origin)


@pytest.mark.parametrize(
    "path",
    [
        "/",
        "/overview",
        "/login",
        "/login/otp",
        "/register/otp",
        "/websites/abc",
        "/status/public-page",
    ],
)
def test_production_browser_routes_and_security(website, path):
    website.cookies.set("pulse_session", "expired-cookie")
    response = website.get(path)
    assert response.status_code == 200 and "AliveRadar" in response.text
    assert response.headers["cache-control"] == "no-cache"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert "max-age=31536000" in response.headers["strict-transport-security"]


@pytest.mark.parametrize(
    "path",
    [
        "/api",
        "/api/missing",
        "/health/missing",
        "/ready/missing",
        "/assets/missing.js",
        "/assets/missing",
        "/brand/missing.png",
        "/.env",
        "/%2e%2e/.env",
        "/assets/%2e%2e/%2e%2e/.env",
    ],
)
def test_missing_api_assets_and_private_files_never_use_spa_fallback(website, path):
    response = website.get(path)
    assert response.status_code == 404 and response.headers["content-type"] == "application/json"
    assert "private-do-not-serve" not in response.text and "<html" not in response.text


def test_static_cache_and_private_api_precedence(website):
    asset = website.get("/assets/app-abcd1234.js")
    assert asset.status_code == 200
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert asset.headers["content-type"].startswith(("text/javascript", "application/javascript"))
    assert website.get("/brand/logo.png").status_code == 200
    response = website.get("/api/v1/private")
    assert response.status_code == 401 and response.headers["cache-control"] == "private, no-store"
    assert website.get("/health").json() == {"status": "ok"}


def test_health_and_frontend_do_not_consume_api_rate_limit(website):
    for _ in range(245):
        assert website.get("/health").status_code == 200
    assert website.get("/overview").status_code == 200
    assert website.get("/api/v1/private").status_code == 401


def test_missing_frontend_build_fails_at_startup(tmp_path):
    with pytest.raises(RuntimeError, match="Build the frontend"):
        mount_website(FastAPI(), str(tmp_path))


def test_render_port_and_private_proxy_settings(monkeypatch):
    monkeypatch.setenv("PORT", "10000")
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "127.0.0.1,10.0.0.0/8")
    cfg = Settings(_env_file=None, database_url="postgres://user:pass@db.internal/aliveradar")
    assert cfg.port == 10000
    assert Config("backend.app:app").forwarded_allow_ips == "127.0.0.1,10.0.0.0/8"


@pytest.mark.parametrize(
    "origin,secret,mock",
    [
        ("http://example.com", "a" * 32, ""),
        ("https://example.com", "short", ""),
        ("https://example.com", "a" * 32, "http://localhost:4005"),
    ],
)
def test_production_rejects_insecure_deployment_settings(origin, secret, mock):
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            database_url="postgres://user:pass@db.internal/aliveradar",
            node_env="production",
            app_origin=origin,
            auth_otp_secret=secret,
            dev_mock_origin=mock,
        )


def test_release_validates_email_before_migrating(monkeypatch):
    from backend import deployment

    cfg = SimpleNamespace(
        node_env="production",
        email_configured=False,
        email_configuration_issue="Brevo SMTP credentials are incomplete.",
    )
    monkeypatch.setattr(deployment, "settings", lambda: cfg)
    monkeypatch.setattr(
        deployment, "migrate", lambda: pytest.fail("Invalid production settings must not migrate")
    )
    with pytest.raises(RuntimeError, match="credentials are incomplete"):
        deployment.release()


def test_render_database_url_supported():
    from backend.db import sqlalchemy_url

    url, pool_size = sqlalchemy_url("postgres://aliveradar:p%40ss@dpg-db.internal/aliveradar")
    assert url == "postgresql+psycopg://aliveradar:p%40ss@dpg-db.internal/aliveradar"
    assert pool_size == 10


def test_database_health_fails_without_exposing_database_credentials(monkeypatch):
    from backend import deployment
    from backend.app import app

    def unavailable():
        raise RuntimeError("private-database-connection-information")

    monkeypatch.setattr(deployment, "engine", unavailable)
    response = TestClient(app).get("/health/database")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": False}
    assert "private-database" not in response.text


def test_release_blocks_wrong_schema_revision(monkeypatch):
    from backend import deployment

    cfg = SimpleNamespace(node_env="production", email_configured=True, web_dist_dir="")
    monkeypatch.setattr(deployment, "settings", lambda: cfg)
    monkeypatch.setattr(deployment, "migrate", lambda: None)
    monkeypatch.setattr(deployment, "schema_current", lambda: False)
    with pytest.raises(RuntimeError, match="schema verification failed"):
        deployment.release()
