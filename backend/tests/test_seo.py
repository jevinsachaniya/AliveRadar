import base64
import json
from hashlib import sha256
from html.parser import HTMLParser
from types import SimpleNamespace
from xml.etree.ElementTree import fromstring

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException

from backend.app import SecurityMiddleware, http_error
from backend.frontend import mount_website
from backend.seo import install_seo_routes


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.meta, self.links = {}, {}
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta[attrs.get("name", attrs.get("property"))] = attrs.get("content")
        elif tag == "link":
            self.links[attrs.get("rel")] = attrs.get("href")


@pytest.fixture
def site(seo_directory, monkeypatch):
    from backend import app as api
    from backend import seo

    cfg = SimpleNamespace(
        node_env="production", app_origin="https://aliveradar.example", seo_indexable=True
    )
    monkeypatch.setattr(api, "settings", lambda: cfg)
    monkeypatch.setattr(seo, "settings", lambda: cfg)
    app = FastAPI()
    app.add_exception_handler(HTTPException, http_error)
    app.add_middleware(SecurityMiddleware)
    install_seo_routes(app)
    mount_website(app, str(seo_directory))
    return TestClient(app, base_url=cfg.app_origin), cfg


@pytest.mark.parametrize(
    "path,heading", [("/", "Website uptime monitoring"), ("/overview", "Independent page checks")]
)
def test_public_html_has_content_and_route_metadata_without_javascript(site, path, heading):
    client, cfg = site
    response = client.get(path + "?utm_source=test")
    assert response.status_code == 200
    assert f"<h1>{heading}</h1>" in response.text
    doc = Document(response.text)
    assert doc.links["canonical"] == cfg.app_origin + path
    assert doc.meta["og:url"] == doc.links["canonical"]
    assert doc.meta["og:image"] == cfg.app_origin + "/brand/aliveradar-mark.png"
    assert doc.meta["twitter:image"] == doc.meta["og:image"]
    assert doc.meta["robots"].startswith("index, follow")
    assert response.headers["x-robots-tag"] == doc.meta["robots"]
    assert "utm_source" not in response.text and "__ALIVERADAR_ORIGIN__" not in response.text


def test_titles_descriptions_and_jsonld_are_valid_and_escaped(site):
    client, cfg = site
    home, overview = client.get("/"), client.get("/overview")
    assert Document(home.text).meta["description"] != Document(overview.text).meta["description"]
    assert "<title>Features &amp; Alerts | AliveRadar</title>" in overview.text
    assert (
        Document(overview.text).meta["description"] == 'Explore page monitoring and "email alerts".'
    )
    markup = overview.text.split('id="site-schema">')[1].split("</script>")[0]
    data = json.loads(markup)
    assert data["url"] == cfg.app_origin + "/overview"
    digest = base64.b64encode(sha256(markup.encode()).digest()).decode()
    assert f"'sha256-{digest}'" in overview.headers["content-security-policy"]
    assert (
        "'unsafe-inline'" not in overview.headers["content-security-policy"].split("style-src")[0]
    )


@pytest.mark.parametrize(
    "path",
    [
        "/login",
        "/register",
        "/login/otp",
        "/register/otp",
        "/reset-password?token=private-token",
        "/websites",
        "/websites/abc",
        "/status/published-page",
    ],
)
def test_account_and_user_status_routes_are_excluded_from_search(site, path):
    client, _ = site
    response = client.get(path)
    assert response.status_code == 200
    assert Document(response.text).meta["robots"] == "noindex, follow"
    assert response.headers["x-robots-tag"] == "noindex, follow"
    assert 'id="site-schema"' not in response.text and "private-token" not in response.text


def test_unknown_browser_url_returns_real_404_and_no_canonical(site):
    client, _ = site
    response = client.get("/this-page-does-not-exist")
    assert response.status_code == 404 and "<h1>Page not found</h1>" in response.text
    assert Document(response.text).meta["robots"] == "noindex, follow"
    assert "canonical" not in Document(response.text).links
    assert client.get("/.seo.json").status_code == 404
    assert client.get("/.prerender/home.html").status_code == 404


def test_canonical_redirect_and_head_conditional_requests(site):
    client, _ = site
    response = client.get("/overview/?utm_source=direct", follow_redirects=False)
    assert response.status_code == 308
    assert response.headers["location"] == "/overview?utm_source=direct"
    assert client.get("/index.html", follow_redirects=False).headers["location"] == "/"
    document = client.get("/overview")
    head = client.head("/overview")
    assert head.status_code == 200 and not head.content
    assert head.headers["etag"] == document.headers["etag"]
    assert (
        client.get("/overview", headers={"If-None-Match": document.headers["etag"]}).status_code
        == 304
    )


def test_sitemap_lists_only_canonical_public_urls_and_robots_allow_resources(site):
    client, cfg = site
    response = client.get("/sitemap.xml")
    assert response.status_code == 200 and response.headers["content-type"].startswith(
        "application/xml"
    )
    root = fromstring(response.content)
    assert [
        node.text for node in root.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
    ] == [cfg.app_origin + "/", cfg.app_origin + "/overview"]
    robots = client.get("/robots.txt")
    assert "Allow: /" in robots.text and f"Sitemap: {cfg.app_origin}/sitemap.xml" in robots.text


@pytest.mark.parametrize("mode,indexable", [("development", True), ("production", False)])
def test_local_and_staging_indexing_disabled_consistently(site, mode, indexable):
    client, cfg = site
    cfg.node_env, cfg.seo_indexable = mode, indexable
    assert Document(client.get("/").text).meta["robots"].startswith("noindex")
    assert "Disallow: /" in client.get("/robots.txt").text
    assert not list(fromstring(client.get("/sitemap.xml").content))
