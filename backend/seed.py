import math
import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import hash_password
from backend.config import settings
from backend.db import engine, now
from backend.models import (
    Incident,
    Monitor,
    MonitorCheck,
    NotificationPreference,
    StatusPage,
    StatusPageMonitor,
    User,
    Website,
)


def seed():
    if (
        settings().node_env != "development"
        or settings().dev_mock_origin != "http://127.0.0.1:4005"
    ):
        raise RuntimeError("Demo seed requires development mode and the local mock target.")
    with Session(engine()) as db:
        if db.scalar(select(User.id).where(User.is_demo.is_(True)).limit(1)):
            print("Demo workspace already exists. Preserving existing data.")
            return
        user = User(
            name="Alex Morgan",
            email="demo@uptimepulse.local",
            is_demo=True,
            password_hash=hash_password(secrets.token_hex(32)),
        )
        db.add(user)
        db.flush()
        db.add(NotificationPreference(user_id=user.id, email_enabled=False))
        website = Website(user_id=user.id, name="Demo website", url=settings().dev_mock_origin)
        db.add(website)
        db.flush()
        components = [
            ("Main website", "website", 180),
            ("Production API", "api", 95),
            ("Documentation", "docs", 245),
            ("Storefront", "store", 340),
            ("Authentication", "auth", 120),
            ("Asset CDN", "cdn", 65),
        ]
        instant, ids = now(), []
        for index, (name, path, baseline) in enumerate(components):
            paused = index == 5
            monitor = Monitor(
                user_id=user.id,
                website_id=website.id,
                name=name,
                url=f"{settings().dev_mock_origin}/{path}",
                current_status="PAUSED" if paused else "UP",
                is_active=not paused,
                last_checked_at=instant - timedelta(minutes=1),
                created_at=instant - timedelta(days=30),
            )
            db.add(monitor)
            db.flush()
            ids.append(monitor.id)
            samples = [
                (
                    hour * 3600,
                    index == 1 and 75 <= hour <= 77 or index == 3 and 140 <= hour <= 141,
                    round(baseline + 30 * math.sin(hour / 5 + index) + 12 * math.cos(hour / 2)),
                )
                for hour in range(720, 23, -1)
                if not (paused and hour < 48)
            ]
            if not paused:
                samples += [
                    (
                        quarter * 900,
                        index == 1 and 8 <= quarter <= 10 or index == 3 and 40 <= quarter <= 41,
                        round(
                            baseline
                            + 25 * math.sin(quarter / 7 + index)
                            + 18 * math.cos(quarter / 3)
                        ),
                    )
                    for quarter in range(95, 0, -1)
                ]
            db.add_all(
                [
                    MonitorCheck(
                        monitor_id=monitor.id,
                        checked_at=instant - timedelta(seconds=age),
                        result_status="DOWN" if failed else "UP",
                        http_status_code=503 if failed else 200,
                        response_time_ms=latency,
                        error_type="HTTP" if failed else None,
                        sanitized_error_message="Demo observation: unexpected HTTP 503."
                        if failed
                        else None,
                    )
                    for age, failed, latency in samples
                ]
            )
            if index in {1, 3}:
                db.add(
                    Incident(
                        monitor_id=monitor.id,
                        started_at=instant - timedelta(seconds=(10 if index == 1 else 41) * 900),
                        resolved_at=instant - timedelta(seconds=(7 if index == 1 else 39) * 900),
                        cause="Demo incident: unexpected HTTP 503.",
                        status="RESOLVED",
                    )
                )
        page = StatusPage(
            user_id=user.id, name="AliveRadar demo", slug="pulse-demo", is_public=True
        )
        db.add(page)
        db.flush()
        db.add_all([StatusPageMonitor(status_page_id=page.id, monitor_id=mid) for mid in ids[:5]])
        db.commit()
    print(
        "Development demo seeded. Historical observations are fixtures; new checks use the real local HTTP target."
    )
