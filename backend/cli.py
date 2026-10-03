import argparse
import sys
import time
from datetime import timedelta
from urllib.request import urlopen

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.common import serialized
from backend.config import settings
from backend.db import engine, now
from backend.models import Monitor, MonitorCheck, User, WorkerHeartbeat


def health():
    with urlopen(f"http://127.0.0.1:{settings().port}/ready", timeout=5) as response:
        print(response.read().decode())


def worker_health():
    with Session(engine()) as db:
        alive = bool(
            db.scalar(
                select(WorkerHeartbeat.id)
                .where(WorkerHeartbeat.updated_at >= now() - timedelta(seconds=30))
                .limit(1)
            )
        )
    sys.exit(0 if alive else 1)


def verify_worker():
    with Session(engine()) as db:
        monitor = db.scalar(
            select(Monitor)
            .join(User)
            .where(Monitor.is_active.is_(True), User.is_demo.is_(True))
            .limit(1)
        )
        if monitor is None:
            raise RuntimeError("An active development demo monitor is required.")
        identifier, name = monitor.id, monitor.name
        before = (
            db.scalar(
                select(func.count())
                .select_from(MonitorCheck)
                .where(MonitorCheck.monitor_id == identifier)
            )
            or 0
        )
    deadline = time.monotonic() + 75
    while time.monotonic() < deadline:
        time.sleep(2)
        with Session(engine()) as db:
            after = (
                db.scalar(
                    select(func.count())
                    .select_from(MonitorCheck)
                    .where(MonitorCheck.monitor_id == identifier)
                )
                or 0
            )
            if after > before:
                latest = db.scalar(
                    select(MonitorCheck)
                    .where(MonitorCheck.monitor_id == identifier)
                    .order_by(MonitorCheck.checked_at.desc())
                    .limit(1)
                )
                assert latest is not None
                print(
                    {
                        "monitor": name,
                        "before": before,
                        "after": after,
                        "lastCheckedAt": serialized(latest.checked_at),
                        "status": latest.result_status,
                        "httpStatus": latest.http_status_code,
                        "responseTimeMs": latest.response_time_ms,
                        "browserRequests": 0,
                    }
                )
                return
    raise RuntimeError("No new independent worker observation arrived within 75 seconds.")


def main():
    parser = argparse.ArgumentParser(description="AliveRadar Python backend commands")
    parser.add_argument(
        "command",
        choices=[
            "api",
            "worker",
            "migrate",
            "seed",
            "mock",
            "local-db",
            "health",
            "worker-health",
            "verify-worker",
            "test-integration",
        ],
    )
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    if args.command == "api":
        import uvicorn

        uvicorn.run(
            "backend.app:app",
            host="0.0.0.0",
            port=settings().port,
            reload=args.reload,
            access_log=False,
        )
    elif args.command == "worker":
        import asyncio

        from backend.worker import run

        asyncio.run(run())
    elif args.command == "migrate":
        from backend.migrate import migrate

        migrate()
    elif args.command == "seed":
        from backend.seed import seed

        seed()
    elif args.command == "mock":
        from backend.mock import run

        run()
    elif args.command == "local-db":
        from backend.local_db import run

        run()
    elif args.command == "test-integration":
        from backend.integration_runner import run

        sys.exit(run())
    else:
        {"health": health, "worker-health": worker_health, "verify-worker": verify_worker}[
            args.command
        ]()


if __name__ == "__main__":
    main()
