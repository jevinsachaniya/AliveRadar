from urllib.parse import urljoin, urlsplit

from fastapi import APIRouter, Response
from sqlalchemy import select

from backend.auth import DB, UserId
from backend.common import ApiError
from backend.models import Monitor, User, Website
from backend.monitors import validate_destination
from backend.schemas import MonitorInput, WebsiteInput, WebsitePatch
from backend.website_service import (
    enable_account_emails,
    owned_website,
    website_data,
    website_summaries,
)
from backend.website_state import website_origin

router = APIRouter(prefix="/api/v1/websites", tags=["Websites"])


@router.get("")
def list_websites(db: DB, user_id: UserId):
    return {"items": website_summaries(db, user_id)}


@router.post("", status_code=201)
def create_website(body: WebsiteInput, db: DB, user_id: UserId):
    origin = website_origin(body.url)
    pages, seen = [], set()
    for page in body.pages:
        if any(ord(char) < 32 for char in page.url) or "\\" in page.url:
            raise ApiError(400, "Page URLs cannot contain control characters or backslashes.")
        url = urljoin(origin + "/", page.url)
        try:
            validated = MonitorInput(
                name=page.name,
                url=url,
                interval_seconds=body.interval_seconds,
                failure_threshold=body.failure_threshold,
                recovery_threshold=body.recovery_threshold,
            )
        except ValueError as error:
            raise ApiError(
                400, "Use valid HTTP/HTTPS page URLs without credentials or fragments."
            ) from error
        if website_origin(validated.url) != origin:
            raise ApiError(400, "All pages must belong to this website's HTTP/HTTPS origin.")
        parts = urlsplit(validated.url)
        validated.url = origin + (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
        if validated.url in seen:
            raise ApiError(400, "Each page URL must be unique within this website.")
        seen.add(validated.url)
        pages.append(validated)
    validate_destination(origin)
    db.scalar(select(User).where(User.id == user_id).with_for_update())
    if db.scalar(select(Website.id).where(Website.user_id == user_id, Website.url == origin)):
        raise ApiError(409, "This website is already monitored. Open it to add more pages.")
    website = Website(user_id=user_id, name=body.name, url=origin, email_enabled=body.email_enabled)
    db.add(website)
    db.flush()
    db.add_all(
        [
            Monitor(
                **page.model_dump(exclude={"website_id"}), user_id=user_id, website_id=website.id
            )
            for page in pages
        ]
    )
    if body.email_enabled:
        enable_account_emails(db, user_id)
    db.commit()
    return {"id": website.id}


@router.get("/{website_id}")
def get_website(website_id: str, db: DB, user_id: UserId):
    return website_data(db, owned_website(db, website_id, user_id))


@router.patch("/{website_id}")
def patch_website(website_id: str, body: WebsitePatch, db: DB, user_id: UserId):
    db.scalar(select(User).where(User.id == user_id).with_for_update())
    website = owned_website(db, website_id, user_id, lock=True)
    website.name, website.email_enabled = body.name, body.email_enabled
    if body.email_enabled:
        enable_account_emails(db, user_id)
    db.commit()
    return {"id": website.id}


@router.delete("/{website_id}", status_code=204)
def delete_website(website_id: str, db: DB, user_id: UserId):
    db.delete(owned_website(db, website_id, user_id))
    db.commit()
    return Response(status_code=204)
