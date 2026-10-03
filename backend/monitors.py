import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, or_, select, update

from backend.analytics import analytics
from backend.auth import DB, UserId
from backend.common import ApiError, public_monitor, serialized
from backend.db import now
from backend.models import Incident, Monitor, MonitorCheck
from backend.schemas import MonitorInput, MonitorPatch, Pagination, days_window, model_data
from backend.security import safe_destination
from backend.website_service import ensure_website, owned_website
from backend.website_state import website_origin

router = APIRouter(prefix="/api/v1/monitors", tags=["Monitors"])
Paging = Annotated[Pagination, Depends()]


def owned_monitor(db, monitor_id: str, user_id: str, lock=False):
    query = select(Monitor).where(Monitor.id == monitor_id, Monitor.user_id == user_id)
    monitor = db.scalar(query.with_for_update() if lock else query)
    if monitor is None:
        raise ApiError(404, "Monitor not found.")
    return monitor


def validate_destination(url: str):
    try:
        asyncio.run(safe_destination(url))
    except (ValueError, OSError, TimeoutError):
        raise ApiError(
            400,
            "Destination is unavailable or blocked. Use a public HTTP/HTTPS website on its standard port.",
        ) from None


def page_result(db, query, count_query, paging, transform=serialized):
    items = db.scalars(query.offset((paging.page - 1) * paging.limit).limit(paging.limit)).all()
    return serialized(
        {
            "items": [transform(item) for item in items],
            "total": db.scalar(count_query),
            "page": paging.page,
            "limit": paging.limit,
        }
    )


def reset_monitor(db, monitor):
    monitor.current_status = "PENDING" if monitor.is_active else "PAUSED"
    monitor.consecutive_failures = monitor.consecutive_successes = 0
    monitor.lease_token = monitor.lease_until = None
    monitor.next_check_at = now()
    db.execute(
        update(Incident)
        .where(Incident.monitor_id == monitor.id, Incident.status == "OPEN")
        .values(status="RESOLVED", resolved_at=now())
    )


@router.get("/options")
def options(db: DB, user_id: UserId):
    return {
        "items": [
            {"id": m.id, "name": m.name, "currentStatus": m.current_status}
            for m in db.scalars(
                select(Monitor).where(Monitor.user_id == user_id).order_by(Monitor.name)
            )
        ]
    }


@router.get("")
def list_monitors(db: DB, user_id: UserId, q: Paging):
    filters = [Monitor.user_id == user_id]
    if q.status:
        filters.append(Monitor.current_status == q.status)
    if q.search:
        # Escape SQL wildcard characters to preserve literal substring search.
        term = q.search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        filters.append(
            or_(
                Monitor.name.ilike(f"%{term}%", escape="\\"),
                Monitor.url.ilike(f"%{term}%", escape="\\"),
            )
        )
    column = {
        "name": Monitor.name,
        "createdAt": Monitor.created_at,
        "lastCheckedAt": Monitor.last_checked_at,
    }[q.sort]

    def enriched(m):
        return {
            **public_monitor(m),
            "latestCheck": db.scalar(
                select(MonitorCheck)
                .where(MonitorCheck.monitor_id == m.id)
                .order_by(MonitorCheck.checked_at.desc())
                .limit(1)
            ),
            "analytics": analytics(db, m.id, 1),
        }

    return page_result(
        db,
        select(Monitor)
        .where(*filters)
        .order_by(column.asc() if q.order == "asc" else column.desc()),
        select(func.count()).select_from(Monitor).where(*filters),
        q,
        enriched,
    )


@router.post("", status_code=201)
def create_monitor(body: MonitorInput, db: DB, user_id: UserId):
    validate_destination(body.url)
    website = (
        owned_website(db, body.website_id, user_id)
        if body.website_id
        else ensure_website(db, user_id, body.url)
    )
    if website_origin(body.url) != website.url:
        raise ApiError(400, "Use a page URL from this website's origin.")
    monitor = Monitor(
        **body.model_dump(exclude={"website_id"}),
        user_id=user_id,
        website_id=website.id,
        current_status="PENDING" if body.is_active else "PAUSED",
    )
    db.add(monitor)
    db.commit()
    return {"id": monitor.id}


@router.get("/{monitor_id}")
def get_monitor(monitor_id: str, db: DB, user_id: UserId):
    return public_monitor(owned_monitor(db, monitor_id, user_id))


@router.patch("/{monitor_id}")
def patch_monitor(monitor_id: str, body: MonitorPatch, db: DB, user_id: UserId):
    values = model_data(body, partial=True)
    if "url" in values:
        validate_destination(values["url"])
    # Use the same lock order as website creation/settings before locking a page.
    if "url" in values or "website_id" in values:
        from backend.models import User

        db.scalar(select(User).where(User.id == user_id).with_for_update())
    monitor = owned_monitor(db, monitor_id, user_id, lock=True)
    if "url" in values or "website_id" in values:
        url = values.get("url", monitor.url)
        website = (
            owned_website(db, values["website_id"], user_id)
            if values.get("website_id")
            else ensure_website(db, user_id, url)
        )
        if website_origin(url) != website.url:
            raise ApiError(400, "Use a page URL from this website's origin.")
        values["website_id"] = website.id
    reset = any(
        key in values and values[key] != getattr(monitor, key)
        for key in (
            "url",
            "method",
            "expected_status_codes",
            "failure_threshold",
            "recovery_threshold",
            "timeout_ms",
            "is_active",
        )
    )
    for key, value in values.items():
        setattr(monitor, key, value)
    if reset:
        reset_monitor(db, monitor)
    db.commit()
    return {"id": monitor.id}


@router.delete("/{monitor_id}", status_code=204)
def delete_monitor(monitor_id: str, db: DB, user_id: UserId):
    db.delete(owned_monitor(db, monitor_id, user_id))
    db.commit()
    return Response(status_code=204)


def activity(monitor_id, active, db, user_id):
    monitor = owned_monitor(db, monitor_id, user_id, lock=True)
    if monitor.is_active != active:
        monitor.is_active = active
        reset_monitor(db, monitor)
    db.commit()
    return {"id": monitor.id}


@router.post("/{monitor_id}/pause")
def pause(monitor_id: str, db: DB, user_id: UserId):
    return activity(monitor_id, False, db, user_id)


@router.post("/{monitor_id}/resume")
def resume(monitor_id: str, db: DB, user_id: UserId):
    return activity(monitor_id, True, db, user_id)


@router.get("/{monitor_id}/analytics")
def monitor_analytics(monitor_id: str, db: DB, user_id: UserId, days: int = 1):
    owned_monitor(db, monitor_id, user_id)
    return serialized(analytics(db, monitor_id, days_window(days)))


@router.get("/{monitor_id}/checks")
def checks(monitor_id: str, db: DB, user_id: UserId, q: Paging):
    owned_monitor(db, monitor_id, user_id)
    where = MonitorCheck.monitor_id == monitor_id
    return page_result(
        db,
        select(MonitorCheck).where(where).order_by(MonitorCheck.checked_at.desc()),
        select(func.count()).select_from(MonitorCheck).where(where),
        q,
    )


@router.get("/{monitor_id}/incidents")
def incidents(monitor_id: str, db: DB, user_id: UserId, q: Paging):
    owned_monitor(db, monitor_id, user_id)
    where = Incident.monitor_id == monitor_id
    return page_result(
        db,
        select(Incident).where(where).order_by(Incident.started_at.desc()),
        select(func.count()).select_from(Incident).where(where),
        q,
    )
