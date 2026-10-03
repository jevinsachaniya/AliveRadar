"""Table-based AliveRadar email layouts with escaped, frozen event details."""

import html
from datetime import UTC, datetime
from typing import Literal, TypedDict
from urllib.parse import urlsplit

LOGO_CID = "aliveradar-logo@inline"


class EmailContext(TypedDict, total=False):
    kind: Literal["outage", "recovery", "password_reset", "login_otp", "register_otp", "message"]
    otp_code: str
    website_name: str | None
    page_name: str | None
    page_url: str | None
    website_status: str | None
    started_at: str | None
    resolved_at: str | None
    action_url: str | None


def action_link(value: str | None, origin: str) -> str | None:
    if not value or any(character in value for character in "\r\n"):
        return None
    try:
        target, site = urlsplit(value), urlsplit(origin)
        if (
            target.scheme not in {"http", "https"}
            or target.scheme != site.scheme
            or target.netloc != site.netloc
            or target.username
            or target.password
        ):
            return None
    except ValueError:
        return None
    return html.escape(value, quote=True)


def timestamp(value: str | None) -> str:
    if not value:
        return "Not yet recorded"
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if date.tzinfo is None:
            date = date.replace(tzinfo=UTC)
        return date.astimezone(UTC).strftime("%d %b %Y, %H:%M:%S UTC")
    except ValueError:
        return value


def render_email(
    subject: str,
    text: str,
    origin: str,
    template: EmailContext | None = None,
    *,
    hosted_logo: bool = False,
) -> str:
    logo_src = html.escape(
        f"{origin}/brand/aliveradar-mark.png" if hosted_logo else f"cid:{LOGO_CID}", quote=True
    )
    data = template or {}
    kind = data.get("kind", "message")
    page = data.get("page_name") or "Your page"
    page_name = html.escape(page)
    rows: list[tuple[str, str]] = []
    if kind in {"outage", "recovery"}:
        outage = kind == "outage"
        kicker = "OUTAGE DETECTED" if outage else "RECOVERY CONFIRMED"
        heading = "An outage was detected." if outage else "Your page has recovered."
        preheader = f"{page}: {'outage detected' if outage else 'recovery confirmed'}."
        accent, tint = ("#a4473f", "#fff0ec") if outage else ("#14765b", "#eaf2e9")
        badge = "OUTAGE ALERT" if outage else "RECOVERY ALERT"
        intro = (
            f"AliveRadar confirmed an outage for <strong>{page_name}</strong>. "
            "Open the incident to see the affected page and the latest observations."
            if outage
            else f"A healthy response was confirmed for <strong>{page_name}</strong>. "
            "Review the incident and check how the rest of your website is doing."
        )
        if data.get("website_name"):
            rows.append(("Website", data["website_name"] or ""))
        rows.append(("Page", page))
        if data.get("page_url"):
            rows.append(("Monitored URL", data["page_url"] or ""))
        if data.get("website_status"):
            rows.append(("Website status", data["website_status"] or ""))
        rows.append(("Incident started", timestamp(data.get("started_at"))))
        if kind == "recovery" or data.get("resolved_at"):
            rows.append(("Recovery confirmed", timestamp(data.get("resolved_at"))))
        button = "View incident"
        note = "For the latest page and website status, open AliveRadar."
        footer = (
            "You received this update because page alerts are enabled in your AliveRadar account."
        )
        footer_note = "Monitoring updates use observed checks. Incident times are shown in UTC."
    elif kind in {"login_otp", "register_otp"}:
        registration = kind == "register_otp"
        kicker = "ACCOUNT SECURITY"
        heading = "Welcome to your radar." if registration else "Your sign-in code."
        preheader = "Your AliveRadar verification code expires in 5 minutes."
        accent, tint = "#14765b", "#eaf2e9"
        badge = "VERIFY YOUR EMAIL" if registration else "VERIFY YOUR SIGN-IN"
        intro = (
            "One last step before your websites are on our radar. Enter this code on the account verification page to create your AliveRadar account."
            if registration
            else "Enter this code on the sign-in verification page to securely access your AliveRadar account."
        )
        button = ""
        note = "This code expires in 5 minutes and can be used only once. If you requested another code, use the newest email."
        footer = "Never share this code. AliveRadar will never ask you to send it to anyone. If you did not request it, ignore this email."
        footer_note = "Secure account updates from AliveRadar."
    elif kind == "password_reset":
        kicker, heading = "ACCOUNT SECURITY", "Reset your password."
        preheader = "Your AliveRadar password-reset link expires in 30 minutes."
        accent, tint, badge = "#14765b", "#eaf2e9", "PASSWORD RESET"
        intro = "We received a request to reset your AliveRadar password. Use the button below to choose a new one."
        button = "Reset password"
        note = "This link expires in 30 minutes. If you did not request it, you can safely ignore this email."
        footer = "Your password stays the same until you complete the reset. Never share this link."
        footer_note = "Secure account updates from AliveRadar."
    else:
        kicker, heading = "YOUR RADAR UPDATE", subject
        preheader = subject
        accent, tint, badge = "#14765b", "#eaf2e9", "ALIVERADAR"
        intro = html.escape(text).replace("\n", "<br>")
        button = "Open AliveRadar"
        note = "Keep every page, and every change, on your radar."
        footer = "Manage your email preferences in your AliveRadar account."
        footer_note = "Website monitoring, page by page."

    action = action_link(data.get("action_url"), origin)
    if kind == "message":
        action = action or action_link(origin, origin)
    detail_rows = "".join(
        f'<tr><td style="padding:14px 18px;border-top:1px solid #e1e5dd;">'
        f'<div style="font-size:11px;font-weight:bold;letter-spacing:.5px;color:#627269;margin-bottom:6px;">{html.escape(label).upper()}</div>'
        f'<div style="font-size:14px;line-height:22px;color:#183d32;word-break:break-all;overflow-wrap:anywhere;">{html.escape(value)}</div></td></tr>'
        for label, value in rows
    )
    details = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border:1px solid #e1e5dd;border-radius:12px;background:#faf9f5;margin:24px 0;">'
        f'<tr><td style="padding:14px 18px;font-size:10px;letter-spacing:1.5px;color:#627269;font-weight:bold;">SIGNAL DETAILS</td></tr>{detail_rows}</table>'
        if rows
        else ""
    )
    if kind in {"login_otp", "register_otp"}:
        code = html.escape(data.get("otp_code", ""))
        details = (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;margin:24px 0;background:#f1f2e9;border:1px solid #e1e5dd;border-radius:12px;">'
            '<tr><td align="center" style="padding:24px 8px;">'
            '<div style="font-size:10px;font-weight:bold;letter-spacing:1px;color:#627269;margin-bottom:12px;">YOUR VERIFICATION CODE</div>'
            f'<div style="font-family:Consolas,monospace;font-size:30px;font-weight:bold;letter-spacing:6px;color:#153e30;">{code}</div>'
            '<div style="font-size:11px;color:#627269;margin-top:12px;">Valid for 5 minutes</div></td></tr></table>'
        )
    cta = (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 18px;"><tr><td bgcolor="#d2ef88" style="border-radius:8px;">'
        f'<a href="{action}" style="display:inline-block;padding:16px 24px;border:1px solid #d2ef88;border-radius:8px;color:#153e30;font-size:14px;font-weight:bold;text-decoration:none;">{button} &#8594;</a></td></tr></table>'
        if action
        else ""
    )
    fallback = (
        f'<p style="margin:18px 0 0;font-size:11px;line-height:18px;color:#627269;word-break:break-all;overflow-wrap:anywhere;">Button not working? Open this link:<br><a href="{action}" style="color:#14765b;">{action}</a></p>'
        if kind == "password_reset" and action
        else ""
    )
    preferences = action_link(f"{origin}/notifications", origin)
    preference_link = (
        f'<p style="margin:12px 0 0;"><a href="{preferences}" style="color:#14765b;font-size:12px;text-decoration:underline;">Manage email alerts</a></p>'
        if kind not in {"password_reset", "login_otp", "register_otp"} and preferences
        else ""
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{html.escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#faf9f5;font-family:Arial,Helvetica,sans-serif;color:#183d32;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;" aria-hidden="true">{html.escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#faf9f5"><tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;table-layout:fixed;border:1px solid #e1e5dd;border-radius:18px;background:#ffffff;">
<tr><td bgcolor="#153e30" style="padding:24px;border-radius:18px 18px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="56" style="width:56px;"><img src="{logo_src}" width="48" height="48" alt="AliveRadar logo" style="display:block;width:48px;height:48px;background:#f1f2e9;border:4px solid #f1f2e9;border-radius:14px;"></td><td style="padding-left:14px;"><div style="color:#ffffff;font-size:23px;line-height:28px;letter-spacing:-.7px;font-weight:bold;">Alive<span style="color:#d2ef88;">Radar</span><span style="color:#d2ef88;">.</span></div><div style="color:#c3d7c8;font-size:11px;line-height:18px;">Every page, on your radar.</div></td></tr></table>
</td></tr>
<tr><td style="padding:30px 24px 26px;">
<span style="display:inline-block;padding:7px 10px;background:{tint};border-radius:6px;color:{accent};font-size:10px;line-height:14px;letter-spacing:1px;font-weight:bold;">{badge}</span>
<p style="margin:24px 0 10px;color:{accent};font-size:10px;letter-spacing:1.6px;font-weight:bold;">{kicker}</p>
<h1 style="margin:0 0 16px;color:#153e30;font-size:30px;line-height:38px;letter-spacing:-.8px;word-break:break-word;">{html.escape(heading)}</h1>
<p style="margin:0;font-size:14px;line-height:24px;color:#627269;word-break:break-word;overflow-wrap:anywhere;">{intro}</p>
{details}{cta}
<p style="margin:0;padding:16px 18px;background:#f1f2e9;border-radius:8px;color:#627269;font-size:12px;line-height:20px;">{html.escape(note)}</p>
{fallback}
</td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #e1e5dd;">
<p style="margin:0;color:#627269;font-size:11px;line-height:19px;">{html.escape(footer)}</p>{preference_link}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:600px;margin:20px 0 0;color:#747f77;font-size:10px;line-height:18px;">ALIVERADAR &middot; EVERY PAGE, ON YOUR RADAR.<br>{footer_note}</p>
</td></tr></table></body></html>"""
