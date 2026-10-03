import json

import pytest


@pytest.fixture
def seo_directory(tmp_path):
    shell = '<!doctype html><html lang="en"><head><!-- seo:start --><!-- seo:end --></head><body><div id="root">AliveRadar</div></body></html>'
    (tmp_path / "index.html").write_text(shell, encoding="utf-8")
    (tmp_path / ".prerender").mkdir()
    for filename, text in [
        ("home.html", "Website uptime monitoring"),
        ("overview.html", "Independent page checks"),
        ("404.html", "Page not found"),
    ]:
        (tmp_path / ".prerender" / filename).write_text(
            shell.replace("AliveRadar</div>", f"<h1>{text}</h1><p>AliveRadar</p></div>"),
            encoding="utf-8",
        )
    pages = {
        "/": {
            "title": "Website Uptime Monitoring | AliveRadar",
            "description": "Track every page and get email alerts.",
            "indexable": True,
        },
        "/overview": {
            "title": "Features & Alerts | AliveRadar",
            "description": 'Explore page monitoring and "email alerts".',
            "indexable": True,
        },
        **{
            path: {
                "title": "Account | AliveRadar",
                "description": "Secure access to your account.",
                "indexable": False,
            }
            for path in [
                "/login",
                "/register",
                "/login/otp",
                "/register/otp",
                "/forgot-password",
                "/reset-password",
                "/websites",
                "/monitors",
                "/incidents",
                "/settings",
                "/notifications",
                "/status-pages",
            ]
        },
    }
    catalog = {
        "pages": pages,
        "dynamicPages": [
            {"pattern": "^/websites/[A-Za-z0-9_-]+$", "title": "Website details"},
            {"pattern": "^/status/[a-z0-9-]+$", "title": "Live service status"},
        ],
        "notFound": {
            "title": "Page Not Found | AliveRadar",
            "description": "Return home.",
            "indexable": False,
            "notFound": True,
        },
        "publicPages": ["/", "/overview"],
        "socialImage": "/brand/aliveradar-mark.png",
        "prerender": {
            "/": ".prerender/home.html",
            "/overview": ".prerender/overview.html",
            "/not-found": ".prerender/404.html",
        },
        "schemas": {
            path: {
                "@context": "https://schema.org",
                "@type": "WebPage",
                "url": f"__ALIVERADAR_ORIGIN__{path}",
                "name": page["title"],
            }
            for path, page in pages.items()
            if page["indexable"]
        },
    }
    (tmp_path / ".seo.json").write_text(json.dumps(catalog), encoding="utf-8")
    return tmp_path
