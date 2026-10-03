import json
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, parseaddr
from functools import lru_cache
from http.client import HTTPException, HTTPSConnection
from pathlib import Path

from backend.config import settings
from backend.email_templates import LOGO_CID, EmailContext, render_email


@lru_cache(maxsize=1)
def logo_bytes() -> bytes:
    return (Path(__file__).parent / "assets" / "aliveradar-mark.png").read_bytes()


def build_message(
    recipient: str,
    subject: str,
    text: str,
    message_id: str | None = None,
    template: EmailContext | None = None,
) -> EmailMessage:
    cfg = settings()
    message = EmailMessage()
    message["From"] = cfg.smtp_from
    message["To"] = recipient
    message["Subject"] = subject
    message["Date"] = formatdate(usegmt=True)
    if message_id:
        message["Message-ID"] = message_id
    message.set_content(text)
    message.add_alternative(
        render_email(subject, text, cfg.app_origin, template),
        subtype="html",
    )
    html_part = message.get_body(preferencelist=("html",))
    assert html_part is not None
    html_part.add_related(
        logo_bytes(),
        maintype="image",
        subtype="png",
        cid=f"<{LOGO_CID}>",
        disposition="inline",
        filename="aliveradar-mark.png",
    )
    return message


def send_mail(
    recipient: str,
    subject: str,
    text: str,
    message_id: str | None = None,
    template: EmailContext | None = None,
):
    cfg = settings()
    if not cfg.email_configured:
        raise RuntimeError(cfg.email_configuration_issue or "Email delivery is not configured.")
    if cfg.email_transport == "brevo_api":
        name, sender = parseaddr(cfg.smtp_from)
        payload = {
            "sender": {"email": sender, "name": name or "AliveRadar"},
            "to": [{"email": recipient}],
            "subject": subject,
            "textContent": text,
            "htmlContent": render_email(subject, text, cfg.app_origin, template, hosted_logo=True),
        }
        if message_id:
            payload["headers"] = {"X-Aliveradar-Delivery": message_id}
        connection = HTTPSConnection(
            "api.brevo.com", timeout=15, context=ssl.create_default_context()
        )
        try:
            connection.request(
                "POST",
                "/v3/smtp/email",
                body=json.dumps(payload).encode("utf-8"),
                headers={
                    "api-key": cfg.brevo_api_key,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            response = connection.getresponse()
            response.read(16384)
            if response.status != 201:
                raise RuntimeError(f"Brevo HTTPS email rejected (HTTP {response.status}).")
        except (OSError, HTTPException):
            raise RuntimeError("Brevo HTTPS email request failed.") from None
        finally:
            connection.close()
        return
    message = build_message(recipient, subject, text, message_id, template)
    transport = (
        smtplib.SMTP_SSL(
            cfg.smtp_host, cfg.smtp_port, timeout=15, context=ssl.create_default_context()
        )
        if cfg.smtp_secure
        else smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=15)
    )
    with transport as smtp:
        smtp.ehlo()
        if not cfg.smtp_secure:
            if smtp.has_extn("starttls"):
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            elif cfg.node_env == "production" or cfg.smtp_user:
                raise RuntimeError("Authenticated and production SMTP require TLS.")
        if cfg.smtp_user:
            smtp.login(cfg.smtp_user, cfg.smtp_pass)
        rejected = smtp.send_message(message)
        if rejected:
            raise RuntimeError("SMTP provider rejected the delivery.")
