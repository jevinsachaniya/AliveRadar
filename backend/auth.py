import hashlib
import secrets
from datetime import UTC, timedelta
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.common import ApiError, logger, public_user, serialized
from backend.config import settings
from backend.db import get_db, now
from backend.mail import send_mail
from backend.models import AuthSession, NotificationPreference, PasswordReset, User
from backend.schemas import Login, Registration, ResetPassword, ResetRequest

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])
DB = Annotated[Session, Depends(get_db)]
DUMMY_HASH = bcrypt.hashpw(b"constant-invalid-password", bcrypt.gensalt(rounds=12))


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def password_valid(password: str, password_hash: str | None) -> bool:
    try:
        # bcryptjs historically truncates login inputs to 72 UTF-8 bytes.
        return bcrypt.checkpw(
            password.encode("utf-8")[:72], password_hash.encode() if password_hash else DUMMY_HASH
        )
    except ValueError:
        return False


def require_user(request: Request) -> str:
    session = getattr(request.state, "auth", None)
    if session is None:
        raise ApiError(401, "Sign in to continue.")
    return session["user_id"]


UserId = Annotated[str, Depends(require_user)]


def create_session(db: Session, user_id: str, response: Response) -> str:
    raw, csrf = secrets.token_hex(32), secrets.token_hex(32)
    expires = now() + timedelta(days=settings().session_days)
    db.add(AuthSession(id=digest(raw), user_id=user_id, csrf_token=csrf, expires_at=expires))
    db.flush()
    response.set_cookie(
        "pulse_session",
        raw,
        expires=expires.replace(tzinfo=UTC),
        httponly=True,
        secure=settings().node_env == "production",
        samesite="lax",
        path="/",
    )
    return csrf


@router.post("/register", status_code=201)
def register(body: Registration, response: Response, db: DB):
    user = User(name=body.name, email=str(body.email), password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    db.add(NotificationPreference(user_id=user.id, email_enabled=False))
    csrf = create_session(db, user.id, response)
    db.commit()
    return serialized({"user": public_user(user), "csrfToken": csrf})


@router.post("/login")
def login(body: Login, response: Response, db: DB):
    user = db.scalar(select(User).where(User.email == str(body.email)))
    valid = password_valid(body.password, user.password_hash if user else None)
    if not user or not valid:
        raise ApiError(401, "Email or password is incorrect.")
    csrf = create_session(db, user.id, response)
    db.commit()
    return serialized({"user": public_user(user), "csrfToken": csrf})


@router.post("/demo", include_in_schema=False)
def demo(response: Response, db: DB):
    if settings().node_env != "development":
        raise ApiError(404, "Endpoint not found.")
    user = db.scalar(select(User).where(User.is_demo.is_(True)))
    if not user:
        raise ApiError(503, "Run the development seed to create the demo workspace.")
    csrf = create_session(db, user.id, response)
    db.commit()
    return serialized({"user": public_user(user), "csrfToken": csrf})


@router.get("/me")
def me(request: Request, user_id: UserId, db: DB):
    user = db.get(User, user_id)
    if not user:
        raise ApiError(401, "Sign in to continue.")
    return serialized({"user": public_user(user), "csrfToken": request.state.auth["csrf_token"]})


@router.post("/logout", status_code=204)
def logout(request: Request, user_id: UserId, db: DB):
    db.execute(delete(AuthSession).where(AuthSession.id == request.state.auth["session_id"]))
    db.commit()
    response = Response(status_code=204)
    response.delete_cookie(
        "pulse_session",
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings().node_env == "production",
    )
    return response


@router.post("/forgot-password")
def forgot_password(body: ResetRequest, db: DB):
    if not settings().email_configured:
        raise ApiError(
            503, "Password reset needs email delivery. Contact the service administrator."
        )
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if user:
        raw = secrets.token_hex(32)
        db.add(
            PasswordReset(id=digest(raw), user_id=user.id, expires_at=now() + timedelta(minutes=30))
        )
        db.commit()
        try:
            send_mail(
                user.email,
                "Reset your AliveRadar password",
                f"Reset your AliveRadar password within 30 minutes: {settings().app_origin}/reset-password?token={raw}",
            )
        except (OSError, RuntimeError):
            db.execute(delete(PasswordReset).where(PasswordReset.id == digest(raw)))
            db.commit()
            logger.warning("Password reset delivery failed")
    return {"message": "If that account exists, a reset link has been requested."}


@router.post("/reset-password")
def reset_password(body: ResetPassword, response: Response, db: DB):
    hashed = hash_password(body.password)
    reset = db.scalar(
        select(PasswordReset).where(PasswordReset.id == digest(body.token)).with_for_update()
    )
    if reset is None or reset.expires_at < now():
        raise ApiError(400, "Reset link is invalid or expired.")
    user = db.get(User, reset.user_id)
    if user is None:
        raise ApiError(400, "Reset link is invalid or expired.")
    user.password_hash = hashed
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()
    response.delete_cookie(
        "pulse_session",
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings().node_env == "production",
    )
    return {"message": "Password updated. Sign in with your new password."}
