from email.utils import parseaddr
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", case_sensitive=False, hide_input_in_errors=True
    )

    node_env: Literal["development", "test", "production"] = "development"
    database_url: str
    app_origin: str = "http://localhost:5173"
    web_dist_dir: str = ""
    seo_indexable: bool = True
    port: int = Field(default=3001, ge=1, le=65535)
    session_days: int = Field(default=7, ge=1, le=30)
    auth_otp_secret: str = Field(default="", repr=False)
    worker_concurrency: int = Field(default=4, ge=1, le=32)
    worker_poll_ms: int = Field(default=2000, ge=250)
    retention_days: int = Field(default=90, ge=30)
    dev_mock_origin: str = ""
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_secure: bool = False
    smtp_user: str = ""
    smtp_pass: str = Field(default="", repr=False)
    smtp_from: str = "AliveRadar <alerts@example.com>"

    @model_validator(mode="after")
    def production_security(self):
        url = urlsplit(self.app_origin)
        if (
            url.scheme not in {"http", "https"}
            or not url.netloc
            or self.app_origin != f"{url.scheme}://{url.netloc}"
        ):
            raise ValueError(
                "APP_ORIGIN must be an exact HTTP/HTTPS origin without a trailing slash."
            )
        if self.node_env == "production":
            if len(self.auth_otp_secret) < 32:
                raise ValueError("Production AUTH_OTP_SECRET requires at least 32 characters.")
            if self.dev_mock_origin:
                raise ValueError("Development mock exceptions are forbidden in production.")
            if url.scheme != "https":
                raise ValueError("Production APP_ORIGIN requires HTTPS.")
        return self

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host)

    @property
    def email_configured(self) -> bool:
        return self.smtp_configured and self.email_configuration_issue is None

    @property
    def email_provider(self) -> str | None:
        if not self.smtp_configured:
            return None
        return "brevo" if self.smtp_host.lower() == "smtp-relay.brevo.com" else "smtp"

    @property
    def email_configuration_issue(self) -> str | None:
        if not self.smtp_configured:
            return "Email delivery is not configured."
        if self.email_provider == "brevo":
            if not self.smtp_user or not self.smtp_pass:
                return "Brevo SMTP credentials are incomplete."
            sender = parseaddr(self.smtp_from)[1]
            local, separator, domain = sender.rpartition("@")
            domain = domain.lower()
            if (
                not local
                or not separator
                or "." not in domain
                or domain
                in {
                    "example.com",
                    "example.net",
                    "example.org",
                    "smtp-brevo.com",
                }
            ):
                return "Brevo needs a verified sender email."
        return None


@lru_cache
def settings() -> Settings:
    return Settings()
