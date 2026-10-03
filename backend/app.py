import asyncio
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException

from backend import auth, monitors, resources, websites
from backend.common import ApiError, logger
from backend.config import settings
from backend.db import engine, now
from backend.deployment import database_ready
from backend.frontend import mount_website
from backend.models import AuthSession, WorkerHeartbeat

app = FastAPI(
    title="AliveRadar API",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/v1/openapi.json",
)


def error(status, message, details=None):
    value = {"message": message}
    if details:
        value["details"] = details
    return JSONResponse({"error": value}, status_code=status)


@app.exception_handler(ApiError)
async def api_error(request, exc):
    return error(exc.status, exc.message)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return error(
        400,
        "Please check your input.",
        [
            {"field": ".".join(str(part) for part in item["loc"][1:]), "message": item["msg"]}
            for item in exc.errors()
        ],
    )


@app.exception_handler(ValueError)
async def value_error(request, exc):
    return error(400, "Please check your input.")


@app.exception_handler(IntegrityError)
async def conflict(request, exc):
    return error(409, "That email, slug, or record already exists. Refresh and try again.")


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return error(
        exc.status_code, "Endpoint not found." if exc.status_code == 404 else str(exc.detail)
    )


@app.exception_handler(Exception)
async def unexpected(request, exc):
    logger.error("Request failed")
    return error(500, "An unexpected error occurred.")


def lookup_session(raw):
    with Session(engine()) as db:
        record = db.scalar(
            select(AuthSession).where(
                AuthSession.id == auth.digest(raw),
                AuthSession.expires_at > now(),
                AuthSession.otp_verified_at.is_not(None),
            )
        )
        return (
            {"session_id": record.id, "user_id": record.user_id, "csrf_token": record.csrf_token}
            if record
            else None
        )


class SecurityMiddleware:
    def __init__(self, app):
        self.inner = app
        self.limits = defaultdict(deque)

    def limited(self, key, limit, window):
        instant = time.monotonic()
        events = self.limits[key]
        while events and events[0] <= instant - window:
            events.popleft()
        if len(events) >= limit:
            return True
        events.append(instant)
        if len(self.limits) > 10000:
            self.limits = defaultdict(
                deque, {k: v for k, v in self.limits.items() if v and v[-1] > instant - 900}
            )
        return False

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.inner(scope, receive, send)
        request = Request(scope)

        async def secure_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(
                    [
                        (b"x-content-type-options", b"nosniff"),
                        (b"x-frame-options", b"DENY"),
                        (b"referrer-policy", b"no-referrer"),
                    ]
                )
                if not any(name.lower() == b"cache-control" for name, _ in headers):
                    headers.append((b"cache-control", b"private, no-store"))
                policy = (
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                    "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
                )
                if request.url.path == "/api/docs":
                    policy = (
                        "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
                        "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
                        "img-src 'self' data: https://fastapi.tiangolo.com; frame-ancestors 'none'"
                    )
                headers.append((b"content-security-policy", policy.encode()))
                if settings().node_env == "production":
                    headers.append(
                        (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
                    )
                message["headers"] = headers
            await send(message)

        async def reject(status, message):
            await error(status, message)(scope, receive, secure_send)

        ip = scope.get("client", ("unknown",))[0]
        is_api = request.url.path == "/api" or request.url.path.startswith("/api/")
        if is_api and self.limited((ip, "global"), 240, 60):
            return await reject(429, "Too many requests. Try again shortly.")
        if request.url.path.startswith("/api/v1/auth/") and request.url.path.rsplit("/", 1)[
            -1
        ] not in {"me", "logout"}:
            action = request.url.path.rsplit("/", 1)[-1]
            category, limit = (
                ("otp-verify", 60)
                if action == "verify-otp"
                else ("otp-resend", 20)
                if action == "resend-otp"
                else ("auth", 40)
            )
            if self.limited((ip, category), limit, 900):
                return await reject(429, "Too many sign-in attempts. Try again later.")
        chunks, size = [], 0
        while True:
            part = await receive()
            if part["type"] == "http.disconnect":
                return
            size += len(part.get("body", b""))
            if size > 32768:
                return await reject(413, "Request body is too large.")
            chunks.append(part.get("body", b""))
            if not part.get("more_body", False):
                break
        raw = request.cookies.get("pulse_session") if is_api else None
        scope.setdefault("state", {})["auth"] = (
            await asyncio.to_thread(lookup_session, raw) if raw else None
        )
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            if request.headers.get("origin") != settings().app_origin:
                return await reject(403, "Request origin is not allowed.")
            session = scope["state"]["auth"]
            if session and not secrets.compare_digest(
                request.headers.get("x-csrf-token", ""), session["csrf_token"]
            ):
                return await reject(403, "Invalid CSRF token. Refresh and try again.")
        used = False

        async def replay():
            nonlocal used
            if not used:
                used = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.inner(scope, replay, secure_send)


app.add_middleware(SecurityMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings().app_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
app.include_router(auth.router)
app.include_router(monitors.router)
app.include_router(resources.router)
app.include_router(websites.router)


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "api"}


@app.get("/health/database", tags=["Health"])
def database_health():
    ready = database_ready()
    return JSONResponse(
        {"status": "ready" if ready else "degraded", "database": ready},
        status_code=200 if ready else 503,
    )


@app.get("/ready", tags=["Health"])
def ready():
    try:
        with Session(engine()) as db:
            db.execute(text("SELECT 1"))
            worker = bool(
                db.scalar(
                    select(WorkerHeartbeat.id)
                    .where(WorkerHeartbeat.updated_at >= now() - timedelta(seconds=30))
                    .limit(1)
                )
            )
        return JSONResponse(
            {"status": "ready" if worker else "degraded", "database": True, "worker": worker},
            status_code=200 if worker else 503,
        )
    except Exception:
        return JSONResponse(
            {"status": "degraded", "database": False, "worker": False}, status_code=503
        )


if settings().web_dist_dir:
    mount_website(app, settings().web_dist_dir)
