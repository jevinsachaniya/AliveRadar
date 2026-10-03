from datetime import timedelta
from typing import cast

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from backend.db import now
from backend.models import Incident, MonitorCheck


def next_state(monitor, success: bool) -> dict:
    failures = 0 if success else monitor.consecutive_failures + 1
    successes = monitor.consecutive_successes + 1 if success else 0
    status = monitor.current_status
    if not success and failures >= monitor.failure_threshold:
        status = "DOWN"
    if success and successes >= monitor.recovery_threshold:
        status = "UP"
    return {
        "current_status": status,
        "consecutive_failures": failures,
        "consecutive_successes": successes,
    }


def retry_delay(attempt: int) -> int:
    return min(3600000, 30000 * 2 ** max(0, attempt - 1))


def analytics(db: Session, monitor_id: str, days: int, until=None) -> dict:
    until = until or now()
    since = until - timedelta(days=days)
    where = (
        MonitorCheck.monitor_id == monitor_id,
        MonitorCheck.checked_at >= since,
        MonitorCheck.checked_at <= until,
        MonitorCheck.result_status.in_(["UP", "DOWN"]),
    )
    total, up, avg, minimum, maximum = db.execute(
        select(
            func.count(),
            func.count().filter(MonitorCheck.result_status == "UP"),
            func.avg(MonitorCheck.response_time_ms),
            func.min(MonitorCheck.response_time_ms),
            func.max(MonitorCheck.response_time_ms),
        ).where(*where)
    ).one()
    total, up = cast(int, total), cast(int, up)
    latest = db.scalar(
        select(MonitorCheck).where(*where).order_by(MonitorCheck.checked_at.desc()).limit(1)
    )
    incidents = list(
        db.scalars(
            select(Incident).where(
                Incident.monitor_id == monitor_id,
                Incident.started_at <= until,
                (Incident.resolved_at.is_(None) | (Incident.resolved_at >= since)),
            )
        )
    )
    bucket = "15 minutes" if days == 1 else "1 hour" if days == 7 else "6 hours"
    chart = [
        dict(row)
        for row in db.execute(
            text("""
        SELECT date_bin(CAST(:bucket AS interval), "checkedAt", '2000-01-01'::timestamp) AS time,
        ROUND(AVG("responseTimeMs"))::float AS "responseMs", COUNT(*)::int AS checks,
        COUNT(*) FILTER (WHERE "resultStatus"='UP')::int AS up FROM "MonitorCheck"
        WHERE "monitorId"=:monitor AND "checkedAt">=:since AND "checkedAt"<=:until
        AND "resultStatus" IN ('UP','DOWN') GROUP BY time ORDER BY time
        """),
            {"bucket": bucket, "monitor": monitor_id, "since": since, "until": until},
        ).mappings()
    ]
    daily = [
        dict(row)
        for row in db.execute(
            text("""
        SELECT date_trunc('day', "checkedAt") AS day, COUNT(*)::int AS checks,
        COUNT(*) FILTER (WHERE "resultStatus"='UP')::int AS up FROM "MonitorCheck"
        WHERE "monitorId"=:monitor AND "checkedAt">=:since AND "checkedAt"<=:until
        AND "resultStatus" IN ('UP','DOWN') GROUP BY day ORDER BY day
        """),
            {"monitor": monitor_id, "since": until - timedelta(days=30), "until": until},
        ).mappings()
    ]
    downtime = sum(
        max(
            0,
            (min(incident.resolved_at or until, until) - max(incident.started_at, since))
            // timedelta(milliseconds=1),
        )
        for incident in incidents
    )
    return {
        "uptime": up / total * 100 if total else None,
        "totalChecks": total,
        "averageResponseMs": round(float(cast(float, avg))) if avg is not None else None,
        "latestResponseMs": latest.response_time_ms if latest else None,
        "minResponseMs": minimum,
        "maxResponseMs": maximum,
        "totalIncidents": len(incidents),
        "downtimeMs": int(downtime),
        "since": since,
        "until": until,
        "chart": chart,
        "daily": daily,
    }
