import html
import smtplib
import ssl
from email.message import EmailMessage

from backend.config import settings


def send_mail(recipient: str, subject: str, text: str, message_id: str | None = None):
    cfg = settings()
    if not cfg.email_configured:
        raise RuntimeError(cfg.email_configuration_issue or "Email delivery is not configured.")
    markup = f'<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;color:#153e30"><h2 style="color:#245747">AliveRadar</h2><p style="font-size:13px;color:#627268">Every page, on your radar.</p><h3>{html.escape(subject)}</h3><p style="line-height:1.7;white-space:pre-line">{html.escape(text)}</p><hr><p style="font-size:12px;color:#777">Manage preferences in your AliveRadar account.</p></div>'
    message = EmailMessage()
    message["From"] = cfg.smtp_from
    message["To"] = recipient
    message["Subject"] = subject
    if message_id:
        message["Message-ID"] = message_id
    message.set_content(text)
    message.add_alternative(
        markup,
        subtype="html",
    )
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
