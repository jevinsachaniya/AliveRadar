"""Optional monitoring worker inside the single web process on Render Free."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.config import settings
from backend.worker import run


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings().worker_in_api:
        yield
        return
    stopped = asyncio.Event()
    task = asyncio.create_task(run(stopped, handle_signals=False), name="monitoring-worker")
    try:
        yield
    finally:
        stopped.set()
        # Render allows 60 seconds for requests plus active HTTP/email checks to finish.
        await asyncio.wait_for(task, timeout=40)
