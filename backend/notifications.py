import asyncio
import secrets
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from backend.analytics import retry_delay
from backend.common import logger, serialized
from backend.config import settings
from backend.db import engine, now
from backend.mail import send_mail
from backend.models import Incident, Monitor, NotificationDelivery, User, Website
from backend.scheduler import effective_preference, notification_enabled
from backend.website_state import overall_status


def claim_deliveries():
    token = secrets.token_hex(32)
    with Session(engine()) as db:
        db.execute(
            update(NotificationDelivery)
            .where(
                NotificationDelivery.status == "SENDING",
                NotificationDelivery.attempts >= 6,
                NotificationDelivery.lease_until < now(),
            )
            .values(status="FAILED", lease_until=None, lease_token=None)
        )
        claims: Sequence[str] = (
            db.execute(
                text(
                    """WITH due AS (SELECT id FROM "NotificationDelivery" WHERE ((status='PENDING' AND "nextAttemptAt"<=NOW()) OR (status='SENDING' AND "leaseUntil"<NOW())) AND attempts<6 ORDER BY "nextAttemptAt" FOR UPDATE SKIP LOCKED LIMIT 5) UPDATE "NotificationDelivery" d SET status='SENDING',attempts=attempts+1,"leaseUntil"=NOW()+interval '60 seconds',"leaseToken"=:token FROM due WHERE d.id=due.id RETURNING d.id"""
                ),
                {"token": token},
            )
            .scalars()
            .all()
        )
        db.commit()
        return [(identifier, token) for identifier in claims]


def message_for(identifier, token):
    with Session(engine()) as db:
        delivery = db.scalar(
            select(NotificationDelivery)
            .where(NotificationDelivery.id == identifier)
            .with_for_update()
        )
        if not delivery or delivery.lease_token != token:
            return None
        incident = db.get(Incident, delivery.incident_id)
        if incident is None:
            return None
        monitor = db.get(Monitor, incident.monitor_id)
        if monitor is None:
            return None
        website = db.get(Website, monitor.website_id) if monitor.website_id else None
        if not notification_enabled(
            effective_preference(db, monitor), delivery.event_type, website
        ):
            delivery.status, delivery.lease_token, delivery.lease_until = "FAILED", None, None
            db.commit()
            return None
        if delivery.message_payload:
            message = delivery.message_payload
            return (
                message["recipient"],
                message["subject"],
                message["text"],
                f"<{delivery.id}@uptimepulse>",
                delivery.attempts,
            )
        user = db.get(User, monitor.user_id)
        if user is None:
            return None
        label = (
            " ".join(f"{website.name} / {monitor.name}".splitlines())
            if website
            else " ".join(monitor.name.splitlines())
        )
        title = f"AliveRadar | {'Outage detected' if delivery.event_type == 'OUTAGE' else 'Service recovered'}: {label}"
        website_info = ""
        if website:
            pages = list(db.scalars(select(Monitor).where(Monitor.website_id == website.id)))
            status = overall_status(pages) or "Waiting for checks"
            website_info = (
                f"Website: {website.name}\nCurrent website status at delivery: {status}\n"
            )
        body = f"{website_info}Page: {monitor.name}\nURL: {monitor.url}\nThis page is {'down' if delivery.event_type == 'OUTAGE' else 'back online'}.\n\nIncident started: {serialized(incident.started_at)}\nResolved: {serialized(incident.resolved_at)}\n\nView incident: {settings().app_origin}/incidents/{incident.id}"
        # Freeze the payload so retries reuse the same provider idempotency key and body.
        delivery.message_payload = {"recipient": user.email, "subject": title, "text": body}
        db.commit()
        return user.email, title, body, f"<{delivery.id}@uptimepulse>", delivery.attempts


def finish_delivery(identifier, token, attempts, accepted):
    with Session(engine()) as db:
        values: dict[str, Any] = {
            "status": "DELIVERED" if accepted else "FAILED" if attempts >= 6 else "PENDING",
            "lease_token": None,
            "lease_until": None,
        }
        if accepted:
            values["delivered_at"] = now()
        else:
            values["next_attempt_at"] = now() + timedelta(milliseconds=retry_delay(attempts))
        db.execute(
            update(NotificationDelivery)
            .where(NotificationDelivery.id == identifier, NotificationDelivery.lease_token == token)
            .values(**values)
        )
        db.commit()


async def process_notifications(sender=send_mail, enabled=None):
    if not (settings().email_configured if enabled is None else enabled):
        return

    async def deliver(identifier, token):
        message = await asyncio.to_thread(message_for, identifier, token)
        if not message:
            return
        accepted = False
        try:
            await asyncio.to_thread(sender, *message[:4])
            accepted = True
        except Exception:
            logger.warning("Notification delivery failed; retry recorded")
        await asyncio.to_thread(finish_delivery, identifier, token, message[4], accepted)

    claims = await asyncio.to_thread(claim_deliveries)
    await asyncio.gather(*(deliver(*claim) for claim in claims))
