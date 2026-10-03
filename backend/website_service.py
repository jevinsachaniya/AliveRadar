from urllib.parse import urlsplit

from sqlalchemy import select

from backend.common import ApiError, public_monitor, serialized
from backend.models import Monitor, NotificationPreference, User, Website
from backend.website_state import overall_status, website_origin


def owned_website(db, identifier, user_id, lock=False):
    query = select(Website).where(Website.id == identifier, Website.user_id == user_id)
    website = db.scalar(query.with_for_update() if lock else query)
    if website is None:
        raise ApiError(404, "Website not found.")
    return website


def ensure_website(db, user_id, url):
    origin = website_origin(url)
    # Serialize origin assignment for concurrent page creation by the same account.
    db.scalar(select(User).where(User.id == user_id).with_for_update())
    website = db.scalar(select(Website).where(Website.user_id == user_id, Website.url == origin))
    if website is None:
        website = Website(user_id=user_id, name=urlsplit(url).hostname or origin, url=origin)
        db.add(website)
        db.flush()
    return website


def enable_account_emails(db, user_id):
    pref = db.scalar(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id, NotificationPreference.monitor_id.is_(None)
        )
    )
    if pref is None:
        pref = NotificationPreference(user_id=user_id)
        db.add(pref)
    pref.email_enabled = pref.outage_notifications = pref.recovery_notifications = True


def website_data(db, website, pages=None, preference=None):
    if pages is None:
        pages = list(
            db.scalars(
                select(Monitor)
                .where(Monitor.website_id == website.id, Monitor.user_id == website.user_id)
                .order_by(Monitor.name)
            )
        )
    active = [page for page in pages if page.is_active]
    if preference is None:
        preference = db.scalar(
            select(NotificationPreference).where(
                NotificationPreference.user_id == website.user_id,
                NotificationPreference.monitor_id.is_(None),
            )
        )
    return serialized(
        {
            "id": website.id,
            "name": website.name,
            "url": website.url,
            "emailEnabled": website.email_enabled,
            "accountEmailEnabled": bool(preference and preference.email_enabled),
            "overallStatus": overall_status(pages),
            "totalPages": len(pages),
            "activePages": len(active),
            "up": sum(page.current_status == "UP" for page in active),
            "down": sum(page.current_status == "DOWN" for page in active),
            "pending": sum(page.current_status in {"PENDING", "UNKNOWN"} for page in active),
            "paused": len(pages) - len(active),
            "failedPages": [
                {"id": page.id, "name": page.name, "url": page.url}
                for page in active
                if page.current_status == "DOWN"
            ],
            "pages": [public_monitor(page) for page in pages],
            "createdAt": website.created_at,
        }
    )


def website_summaries(db, user_id):
    pages = list(
        db.scalars(select(Monitor).where(Monitor.user_id == user_id).order_by(Monitor.name))
    )
    grouped: dict[str | None, list[Monitor]] = {}
    for page in pages:
        grouped.setdefault(page.website_id, []).append(page)
    preference = db.scalar(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id, NotificationPreference.monitor_id.is_(None)
        )
    )
    return [
        website_data(db, website, grouped.get(website.id, []), preference)
        for website in db.scalars(
            select(Website).where(Website.user_id == user_id).order_by(Website.name)
        )
    ]
