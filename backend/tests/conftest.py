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
        ("about.html", "Every page deserves to stay on your radar"),
        ("contact.html", "Let's keep your important pages visible"),
        ("ssl-dns-checker.html", "SSL & DNS Checker"),
        ("blog.html", "Useful notes for people who keep websites online"),
        ("devsload-com.html", "DevsLoad.com: simple online tools for everyday digital work"),
        ("how-to-check-if-a-website-is-down.html", "How to Check If a Website Is Down"),
        ("what-is-website-uptime-monitoring.html", "What Is Website Uptime Monitoring?"),
        ("how-to-monitor-website-response-time.html", "How to Monitor Website Response Time"),
        (
            "how-to-get-alerts-when-your-website-goes-down.html",
            "How to Get Alerts When Your Website Goes Down",
        ),
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
        "/about": {
            "title": "About AliveRadar | Page-by-Page Website Monitoring",
            "description": "Learn about AliveRadar.",
            "indexable": True,
        },
        "/contact": {
            "title": "Contact AliveRadar | Website Monitoring Support",
            "description": "Contact AliveRadar.",
            "indexable": True,
        },
        "/ssl-dns-checker": {
            "title": "Free SSL & DNS Checker | AliveRadar",
            "description": "Check DNS and SSL health.",
            "indexable": True,
        },
        "/blog": {
            "title": "AliveRadar Blog | Website Monitoring Notes",
            "description": "Website monitoring notes and resources from AliveRadar.",
            "indexable": True,
        },
        "/blog/devsload-com": {
            "title": "DevsLoad.com | AliveRadar",
            "description": "A guide to DevsLoad.",
            "indexable": True,
        },
        "/blog/how-to-check-if-a-website-is-down": {
            "title": "How to Check If a Website Is Down | AliveRadar",
            "description": "A practical guide to checking a website outage and the next troubleshooting steps.",
            "indexable": True,
        },
        "/blog/what-is-website-uptime-monitoring": {
            "title": "What Is Website Uptime Monitoring? | AliveRadar",
            "description": "A practical guide to observed website uptime monitoring and page-level checks.",
            "indexable": True,
        },
        "/blog/how-to-monitor-website-response-time": {
            "title": "How to Monitor Website Response Time | AliveRadar",
            "description": "A practical guide to tracking website response time and slow pages.",
            "indexable": True,
        },
        "/blog/how-to-get-alerts-when-your-website-goes-down": {
            "title": "How to Get Alerts When Your Website Goes Down | AliveRadar",
            "description": "A practical guide to website downtime alerts and recovery messages.",
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
        "publicPages": [
            "/",
            "/overview",
            "/about",
            "/contact",
            "/ssl-dns-checker",
            "/blog",
            "/blog/devsload-com",
            "/blog/how-to-check-if-a-website-is-down",
            "/blog/what-is-website-uptime-monitoring",
            "/blog/how-to-monitor-website-response-time",
            "/blog/how-to-get-alerts-when-your-website-goes-down",
        ],
        "socialImage": "/brand/aliveradar-mark.png",
        "prerender": {
            "/": ".prerender/home.html",
            "/overview": ".prerender/overview.html",
            "/about": ".prerender/about.html",
            "/contact": ".prerender/contact.html",
            "/ssl-dns-checker": ".prerender/ssl-dns-checker.html",
            "/blog": ".prerender/blog.html",
            "/blog/devsload-com": ".prerender/devsload-com.html",
            "/blog/how-to-check-if-a-website-is-down": ".prerender/how-to-check-if-a-website-is-down.html",
            "/blog/what-is-website-uptime-monitoring": ".prerender/what-is-website-uptime-monitoring.html",
            "/blog/how-to-monitor-website-response-time": ".prerender/how-to-monitor-website-response-time.html",
            "/blog/how-to-get-alerts-when-your-website-goes-down": ".prerender/how-to-get-alerts-when-your-website-goes-down.html",
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
