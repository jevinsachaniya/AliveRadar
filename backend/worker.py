import asyncio
import signal
import time
from datetime import timedelta

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.checks import perform_check, perform_network_check
from backend.common import logger
from backend.config import settings
from backend.db import engine, new_id, now
from backend.models import (
    AuthSession,
    EmailOtpChallenge,
    MonitorCheck,
    PasswordReset,
    WorkerHeartbeat,
)
from backend.notifications import process_notifications
from backend.scheduler import claim_monitors, commit_check


def heartbeat(identifier, cleanup=False):
    with Session(engine()) as db:
        statement = insert(WorkerHeartbeat).values(
            id=identifier, updated_at=now(), started_at=now()
        )
        db.execute(
            statement.on_conflict_do_update(
                index_elements=[WorkerHeartbeat.id], set_={"updatedAt": now()}
            )
        )
        if cleanup:
            for model, where in [
                (
                    MonitorCheck,
                    MonitorCheck.checked_at < now() - timedelta(days=settings().retention_days),
                ),
                (AuthSession, AuthSession.expires_at < now()),
                (PasswordReset, PasswordReset.expires_at < now()),
                (EmailOtpChallenge, EmailOtpChallenge.last_sent_at < now() - timedelta(hours=1)),
                (WorkerHeartbeat, WorkerHeartbeat.updated_at < now() - timedelta(days=1)),
            ]:
                db.execute(delete(model).where(where))
        db.commit()


async def run(stopped: asyncio.Event | None = None, *, handle_signals: bool = True):
    stopped = stopped if stopped is not None else asyncio.Event()
    loop = asyncio.get_running_loop()

    def stop(signum, frame):
        loop.call_soon_threadsafe(stopped.set)

    if handle_signals:
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, stop)
    identifier = new_id()

    async def pause(seconds):
        try:
            await asyncio.wait_for(stopped.wait(), timeout=seconds)
        except TimeoutError:
            pass

    async def check(claim):
        network_result, destination = await perform_network_check(claim)
        result = await perform_check(claim, destination=destination)
        await asyncio.to_thread(commit_check, claim, result, network_result)

    async def checks_loop():
        while not stopped.is_set():
            try:
                claims = await asyncio.to_thread(claim_monitors, settings().worker_concurrency)
                await asyncio.gather(*(check(claim) for claim in claims))
            except Exception:
                logger.error("Monitoring batch failed")
            await pause(settings().worker_poll_ms / 1000)

    async def mail_loop():
        while not stopped.is_set():
            try:
                await process_notifications()
            except Exception:
                logger.error("Notification batch failed")
            await pause(5)

    async def maintenance_loop():
        cleaned = 0.0
        while not stopped.is_set():
            try:
                cleanup = time.monotonic() - cleaned >= 3600
                await asyncio.to_thread(heartbeat, identifier, cleanup)
                if cleanup:
                    cleaned = time.monotonic()
            except Exception:
                logger.error("Worker heartbeat failed")
            await pause(10)

    logger.info("Python worker started")
    await asyncio.gather(checks_loop(), mail_loop(), maintenance_loop())
    logger.info("Python worker stopped")


if __name__ == "__main__":
    asyncio.run(run())
