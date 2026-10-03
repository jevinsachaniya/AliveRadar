import re
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic.alias_generators import to_camel


class Input(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="ignore", str_strip_whitespace=True
    )


def validate_url(value: str) -> str:
    url = urlsplit(value)
    if (
        url.scheme not in {"http", "https"}
        or not url.hostname
        or url.username is not None
        or url.password is not None
        or url.fragment
        or any(ord(c) < 33 for c in value)
        or "\\" in value
    ):
        raise ValueError("Use an HTTP or HTTPS URL without credentials or a fragment.")
    _ = url.port
    return value


class MonitorInput(Input):
    name: str = Field(min_length=1, max_length=100)
    url: str = Field(max_length=2048)
    method: Literal["GET", "HEAD"] = "GET"
    interval_seconds: int = Field(default=60, ge=30, le=86400)
    timeout_ms: int = Field(default=10000, ge=1000, le=30000)
    expected_status_codes: list[Annotated[int, Field(ge=100, le=599)]] = Field(
        default_factory=lambda: [200], min_length=1, max_length=30
    )
    failure_threshold: int = Field(default=2, ge=1, le=10)
    recovery_threshold: int = Field(default=1, ge=1, le=10)
    is_active: bool = True
    website_id: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("url")
    @classmethod
    def http_url(cls, value: str) -> str:
        return validate_url(value)


class MonitorPatch(MonitorInput):
    # Same defaults/validators; only model_fields_set are applied by PATCH.
    name: str = Field(default="", max_length=100)
    url: str = Field(default="", max_length=2048)

    @field_validator("name")
    @classmethod
    def nonempty_name(cls, value: str) -> str:
        if not value:
            raise ValueError("Give your monitor a name.")
        return value


class Registration(Input):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=12, max_length=72)

    @field_validator("email")
    @classmethod
    def lower_email(cls, value: str) -> str:
        return value.lower()

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Use at least two characters for your name.")
        return value

    @field_validator("password")
    @classmethod
    def password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must fit within 72 UTF-8 bytes.")
        return value


class Login(Input):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)

    @field_validator("email")
    @classmethod
    def lower_email(cls, value: str) -> str:
        return value.lower()


class ResetRequest(Input):
    email: EmailStr


class ResetPassword(Input):
    model_config = ConfigDict(extra="ignore")
    token: str = Field(pattern=r"^[a-f0-9]{64}$")
    password: str = Field(min_length=12, max_length=72)

    @field_validator("password")
    @classmethod
    def password_bytes(cls, value: str) -> str:
        return Registration.password_bytes(value)


class PreferenceInput(Input):
    monitor_id: str | None = None
    email_enabled: bool
    outage_notifications: bool
    recovery_notifications: bool


class StatusPageInput(Input):
    name: str = Field(min_length=2, max_length=100)
    slug: str = Field(min_length=3, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    is_public: bool = False
    monitor_ids: list[str] = Field(default_factory=list, max_length=100)


class WebsitePageInput(Input):
    name: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=2048)


class WebsiteInput(Input):
    name: str = Field(min_length=1, max_length=100)
    url: str = Field(max_length=2048)
    pages: list[WebsitePageInput] = Field(min_length=1, max_length=50)
    email_enabled: bool = False
    interval_seconds: int = Field(default=60, ge=30, le=86400)
    failure_threshold: int = Field(default=2, ge=1, le=10)
    recovery_threshold: int = Field(default=1, ge=1, le=10)

    @field_validator("url")
    @classmethod
    def http_url(cls, value: str) -> str:
        return validate_url(value)


class WebsitePatch(Input):
    name: str = Field(min_length=1, max_length=100)
    email_enabled: bool


class Pagination(Input):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    search: str = Field(default="", max_length=100)
    status: Literal["UP", "DOWN", "PAUSED", "PENDING", "UNKNOWN"] | None = None
    sort: Literal["name", "createdAt", "lastCheckedAt"] = "createdAt"
    order: Literal["asc", "desc"] = "desc"


def days_window(days: int) -> int:
    if days not in {1, 7, 30}:
        raise ValueError("Choose 1, 7, or 30 days.")
    return days


def model_data(data: Input, partial: bool = False) -> dict:
    # Reject explicit nulls: none of the monitor configuration fields are nullable.
    values = data.model_dump(exclude_unset=partial)
    if partial and any(value is None for key, value in values.items() if key != "website_id"):
        raise ValueError("Configuration fields cannot be null.")
    return values


CAMEL_PATTERN = re.compile(r"_([a-z])")
