import secrets
from datetime import timedelta

from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from backend.analytics import next_state
from backend.db import engine, now
from backend.models import (
    Incident,
    Monitor,
    MonitorCheck,
    NotificationDelivery,
    NotificationPreference,
    Website,
)


def claim_monitors(limit: int, lease_seconds: int = 90):
    with Session(engine(), expire_on_commit=False) as db:
        query = text(
            """WITH due AS (SELECT id FROM "Monitor" WHERE "isActive"=true AND "nextCheckAt"<=NOW() AND ("leaseUntil" IS NULL OR "leaseUntil"<NOW()) ORDER BY "nextCheckAt" FOR UPDATE SKIP LOCKED LIMIT :limit) UPDATE "Monitor" m SET "leaseUntil"=NOW()+(:seconds*interval '1 second'), "leaseToken"=:token FROM due WHERE m.id=due.id RETURNING m.*"""
        )
        rows = list(
            db.scalars(
                select(Monitor).from_statement(query),
                {"limit": limit, "seconds": lease_seconds, "token": secrets.token_hex(32)},
            )
        )
        db.commit()
        return rows


def effective_preference(db, monitor):
    prefs = list(
        db.scalars(
            select(NotificationPreference).where(
                NotificationPreference.user_id == monitor.user_id,
                or_(
                    NotificationPreference.monitor_id == monitor.id,
                    NotificationPreference.monitor_id.is_(None),
                ),
            )
        )
    )
    return next(
        (p for p in prefs if p.monitor_id == monitor.id),
        next((p for p in prefs if p.monitor_id is None), None),
    )


def notification_enabled(pref, event, website=None):
    return bool(
        pref
        and (website is None or website.email_enabled)
        and pref.email_enabled
        and (pref.outage_notifications if event == "OUTAGE" else pref.recovery_notifications)
    )


def commit_check(claim, result):
    with Session(engine()) as db:
        monitor = db.scalar(select(Monitor).where(Monitor.id == claim.id).with_for_update())
        instant = now()
        if (
            not monitor
            or not monitor.is_active
            or monitor.lease_token != claim.lease_token
            or not monitor.lease_until
            or monitor.lease_until < instant
        ):
            return False
        state = next_state(monitor, result.result_status == "UP")
        db.add(MonitorCheck(monitor_id=monitor.id, checked_at=instant, **result.values()))
        for key, value in state.items():
            setattr(monitor, key, value)
        monitor.last_checked_at, monitor.next_check_at = (
            instant,
            instant + timedelta(seconds=monitor.interval_seconds),
        )
        monitor.lease_token = monitor.lease_until = None
        opened = db.scalar(
            select(Incident).where(Incident.monitor_id == monitor.id, Incident.status == "OPEN")
        )
        event = None
        if monitor.current_status == "DOWN" and not opened:
            opened = Incident(
                monitor_id=monitor.id,
                started_at=instant,
                cause=result.sanitized_error_message or "Check failed.",
            )
            db.add(opened)
            db.flush()
            event = "OUTAGE"
        elif monitor.current_status == "UP" and opened:
            opened.status, opened.resolved_at = "RESOLVED", instant
            event = "RECOVERY"
        website = db.get(Website, monitor.website_id) if monitor.website_id else None
        if (
            event
            and opened
            and notification_enabled(effective_preference(db, monitor), event, website)
        ):
            db.add(NotificationDelivery(incident_id=opened.id, event_type=event))
        db.commit()
        return True
