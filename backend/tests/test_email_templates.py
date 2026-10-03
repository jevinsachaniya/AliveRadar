from pathlib import Path

import pytest

from backend.email_templates import LOGO_CID, action_link, render_email
from backend.mail import logo_bytes

ORIGIN = "https://aliveradar.test"


@pytest.mark.parametrize(
    "kind,heading",
    [("outage", "An outage was detected."), ("recovery", "Your page has recovered.")],
)
def test_incident_template_escapes_names_and_retains_event_details(kind, heading):
    markup = render_email(
        "AliveRadar update",
        "Plain-text fallback",
        ORIGIN,
        {
            "kind": kind,
            "website_name": 'Store <script>alert("x")</script>',
            "page_name": '<img src="x" onerror="alert(1)">',
            "page_url": "https://shop.test/checkout?cart=a&view=b",
            "website_status": "DEGRADED",
            "started_at": "2026-10-03T04:00:00Z",
            "resolved_at": "2026-10-03T04:05:00Z" if kind == "recovery" else None,
            "action_url": f"{ORIGIN}/incidents/fixture?view=a&filter=b",
        },
    )
    assert heading in markup and "DEGRADED" in markup
    assert "03 Oct 2026, 04:00:00 UTC" in markup
    assert "<script>" not in markup and '<img src="x"' not in markup
    assert "&lt;script&gt;" in markup and "&lt;img" in markup
    assert 'href="https://aliveradar.test/incidents/fixture?view=a&amp;filter=b"' in markup
    assert "View incident" in markup and f'src="cid:{LOGO_CID}"' in markup
    assert ("03 Oct 2026, 04:05:00 UTC" in markup) == (kind == "recovery")


def test_password_reset_has_expiring_action_and_no_alert_preferences():
    url = f"{ORIGIN}/reset-password?token=preview-only"
    markup = render_email(
        "Reset your AliveRadar password",
        f"Reset link: {url}",
        ORIGIN,
        {"kind": "password_reset", "action_url": url},
    )
    assert "Reset your password." in markup and "30 minutes" in markup
    assert f'href="{url}"' in markup and "Button not working?" in markup
    assert "Manage email alerts" not in markup and "SIGNAL DETAILS" not in markup


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "https://phishing.invalid/reset",
        "https://aliveradar.test@phishing.invalid/reset",
        "http://aliveradar.test/reset",
        "https://aliveradar.test/reset\r\nInjected: yes",
    ],
)
def test_actions_reject_script_cross_origin_and_header_injection(url):
    assert action_link(url, ORIGIN) is None
    markup = render_email(
        "Reset", "Fallback", ORIGIN, {"kind": "password_reset", "action_url": url}
    )
    assert "href=" not in markup


def test_backend_logo_matches_the_website_asset():
    source = Path(__file__).resolve().parents[2] / "apps/web/public/brand/aliveradar-mark.png"
    assert logo_bytes() == source.read_bytes()
