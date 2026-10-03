from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Response
from sqlalchemy import delete, func, select

from backend.analytics import analytics
from backend.auth import DB, UserId
from backend.common import ApiError, serialized
from backend.config import settings
from backend.db import now
from backend.models import (
    Incident,
    Monitor,
    NotificationDelivery,
    NotificationPreference,
    StatusPage,
    StatusPageMonitor,
    User,
    WorkerHeartbeat,
)
from backend.monitors import Paging, owned_monitor, page_result
from backend.schemas import PreferenceInput, StatusPageInput, days_window
from backend.website_service import website_summaries

router = APIRouter(prefix="/api/v1", tags=["Workspace"])


def incident_data(db, incident):
    monitor = db.get(Monitor, incident.monitor_id)
    return {**serialized(incident), "monitor": {"id": monitor.id, "name": monitor.name}}


@router.get("/overview")
def overview(db: DB, user_id: UserId, days: int = 1):
    monitors = db.scalars(select(Monitor).where(Monitor.user_id == user_id)).all()
    stats = [analytics(db, m.id, days_window(days)) for m in monitors]
    total = sum(s["totalChecks"] for s in stats)
    observed = [s for s in stats if s["averageResponseMs"] is not None]
    charts: dict[Any, list[float]] = {}
    for stat in stats:
        for point in stat["chart"]:
            if point["responseMs"] is not None:
                bucket = charts.setdefault(point["time"], [0, 0])
                bucket[0] += point["responseMs"] * point["checks"]
                bucket[1] += point["checks"]
    recent = db.scalars(
        select(Incident)
        .join(Monitor)
        .where(Monitor.user_id == user_id)
        .order_by(Incident.started_at.desc())
        .limit(5)
    ).all()
    return serialized(
        {
            "total": len(monitors),
            "websites": website_summaries(db, user_id),
            "up": sum(m.current_status == "UP" for m in monitors),
            "down": sum(m.current_status == "DOWN" for m in monitors),
            "paused": sum(m.current_status == "PAUSED" for m in monitors),
            "pending": sum(m.current_status in {"PENDING", "UNKNOWN"} for m in monitors),
            "uptime": sum((s["uptime"] or 0) * s["totalChecks"] for s in stats) / total
            if total
            else None,
            "averageResponseMs": round(
                sum(s["averageResponseMs"] * s["totalChecks"] for s in observed)
                / sum(s["totalChecks"] for s in observed)
            )
            if observed
            else None,
            "totalChecks": total,
            "recentIncidents": [incident_data(db, i) for i in recent],
            "chart": [
                {"time": key, "responseMs": round(value[0] / value[1])}
                for key, value in sorted(charts.items())
            ],
            "workerHealthy": bool(
                db.scalar(
                    select(WorkerHeartbeat.id)
                    .where(WorkerHeartbeat.updated_at >= now() - timedelta(seconds=30))
                    .limit(1)
                )
            ),
        }
    )


@router.get("/incidents")
def incidents(db: DB, user_id: UserId, q: Paging):
    where = Monitor.user_id == user_id
    return page_result(
        db,
        select(Incident).join(Monitor).where(where).order_by(Incident.started_at.desc()),
        select(func.count()).select_from(Incident).join(Monitor).where(where),
        q,
        lambda i: incident_data(db, i),
    )


@router.get("/incidents/{incident_id}")
def incident_detail(incident_id: str, db: DB, user_id: UserId):
    incident = db.scalar(
        select(Incident).join(Monitor).where(Incident.id == incident_id, Monitor.user_id == user_id)
    )
    if incident is None:
        raise ApiError(404, "Incident not found.")
    deliveries = db.scalars(
        select(NotificationDelivery).where(NotificationDelivery.incident_id == incident_id)
    )
    return serialized(
        {
            **incident_data(db, incident),
            "deliveries": [
                {
                    k: serialized(d)[k]
                    for k in ("id", "eventType", "status", "attempts", "deliveredAt")
                }
                for d in deliveries
            ],
        }
    )


@router.get("/notifications/preferences")
def preferences(db: DB, user_id: UserId):
    return serialized(
        {
            "preferences": db.scalars(
                select(NotificationPreference).where(NotificationPreference.user_id == user_id)
            ).all(),
            "smtpConfigured": settings().smtp_configured,
            "emailConfigured": settings().email_configured,
            "emailProvider": settings().email_provider,
            "emailConfigurationIssue": settings().email_configuration_issue,
        }
    )


@router.patch("/notifications/preferences")
def update_preferences(body: PreferenceInput, db: DB, user_id: UserId):
    if body.monitor_id:
        owned_monitor(db, body.monitor_id, user_id)
    db.scalar(select(User).where(User.id == user_id).with_for_update())
    pref = db.scalar(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
            NotificationPreference.monitor_id == body.monitor_id,
        )
    )
    if pref is None:
        pref = NotificationPreference(user_id=user_id)
        db.add(pref)
    for key, value in body.model_dump().items():
        setattr(pref, key, value)
    db.commit()
    return {"message": "Preferences saved."}


@router.get("/notifications/deliveries")
def deliveries(db: DB, user_id: UserId, q: Paging):
    def safe_delivery(delivery):
        result = {
            key: serialized(delivery)[key]
            for key in ("id", "eventType", "status", "attempts", "createdAt", "deliveredAt")
        }
        monitor = db.scalar(
            select(Monitor).join(Incident).where(Incident.id == delivery.incident_id)
        )
        result["incident"] = {"monitor": {"name": monitor.name if monitor else "Deleted monitor"}}
        return result

    return page_result(
        db,
        select(NotificationDelivery)
        .join(Incident)
        .join(Monitor)
        .where(Monitor.user_id == user_id)
        .order_by(NotificationDelivery.created_at.desc()),
        select(func.count())
        .select_from(NotificationDelivery)
        .join(Incident)
        .join(Monitor)
        .where(Monitor.user_id == user_id),
        q,
        safe_delivery,
    )


@router.get("/status-pages")
def status_pages(db: DB, user_id: UserId):
    pages = db.scalars(
        select(StatusPage)
        .where(StatusPage.user_id == user_id)
        .order_by(StatusPage.created_at.desc())
    )
    return serialized(
        {
            "items": [
                {
                    **serialized(page),
                    "monitors": [
                        {"monitorId": mid}
                        for mid in db.scalars(
                            select(StatusPageMonitor.monitor_id).where(
                                StatusPageMonitor.status_page_id == page.id
                            )
                        )
                    ],
                }
                for page in pages
            ]
        }
    )


def save_page(db, user_id, body, page=None):
    ids = list(dict.fromkeys(body.monitor_ids))
    if db.scalar(
        select(func.count())
        .select_from(Monitor)
        .where(Monitor.id.in_(ids), Monitor.user_id == user_id)
    ) != len(ids):
        raise ApiError(400, "Choose monitors in your workspace.")
    if page is None:
        page = StatusPage(user_id=user_id)
        db.add(page)
    page.name, page.slug, page.is_public = body.name, body.slug, body.is_public
    db.flush()
    db.execute(delete(StatusPageMonitor).where(StatusPageMonitor.status_page_id == page.id))
    db.add_all([StatusPageMonitor(status_page_id=page.id, monitor_id=mid) for mid in ids])
    db.commit()
    return {"id": page.id}


@router.post("/status-pages", status_code=201)
def create_page(body: StatusPageInput, db: DB, user_id: UserId):
    return save_page(db, user_id, body)


@router.patch("/status-pages/{page_id}")
def patch_page(page_id: str, body: StatusPageInput, db: DB, user_id: UserId):
    page = db.scalar(
        select(StatusPage)
        .where(StatusPage.id == page_id, StatusPage.user_id == user_id)
        .with_for_update()
    )
    if page is None:
        raise ApiError(404, "Status page not found.")
    return save_page(db, user_id, body, page)


@router.delete("/status-pages/{page_id}", status_code=204)
def delete_page(page_id: str, db: DB, user_id: UserId):
    identifier = db.scalar(
        delete(StatusPage)
        .where(StatusPage.id == page_id, StatusPage.user_id == user_id)
        .returning(StatusPage.id)
    )
    if identifier is None:
        raise ApiError(404, "Status page not found.")
    db.commit()
    return Response(status_code=204)


@router.get("/public/status/{slug}", tags=["Public status"])
def public_status(slug: str, db: DB):
    page = db.scalar(
        select(StatusPage).where(StatusPage.slug == slug, StatusPage.is_public.is_(True))
    )
    if page is None:
        raise ApiError(404, "This status page is unavailable.")
    monitors = db.scalars(
        select(Monitor)
        .join(StatusPageMonitor)
        .where(StatusPageMonitor.status_page_id == page.id)
        .order_by(Monitor.name)
    )
    components = []
    for monitor in monitors:
        stat = analytics(db, monitor.id, 30)
        incidents = db.scalars(
            select(Incident)
            .where(Incident.monitor_id == monitor.id)
            .order_by(Incident.started_at.desc())
            .limit(10)
        )
        components.append(
            {
                "name": monitor.name,
                "currentStatus": monitor.current_status,
                "lastCheckedAt": monitor.last_checked_at,
                "uptime": stat["uptime"],
                "daily": stat["daily"],
                "incidents": [
                    {key: serialized(i)[key] for key in ("id", "startedAt", "resolvedAt", "status")}
                    for i in incidents
                ],
            }
        )
    return serialized({"name": page.name, "slug": page.slug, "components": components})
