import hashlib
import hmac
import secrets
from datetime import UTC, timedelta
from typing import Annotated, Literal

import bcrypt
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.orm import Session

from backend.common import ApiError, logger, public_user, serialized
from backend.config import settings
from backend.db import get_db, now
from backend.mail import send_mail
from backend.models import (
    AuthSession,
    EmailOtpChallenge,
    NotificationPreference,
    PasswordReset,
    User,
)
from backend.schemas import (
    Login,
    OtpToken,
    OtpVerification,
    Registration,
    ResetPassword,
    ResetRequest,
)

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
    db.add(
        AuthSession(
            id=digest(raw),
            user_id=user_id,
            csrf_token=csrf,
            expires_at=expires,
            otp_verified_at=now(),
        )
    )
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


Purpose = Literal["login", "register"]


def otp_ready():
    if not settings().email_configured or len(settings().auth_otp_secret) < 32:
        raise ApiError(503, "Email verification is unavailable. Contact the service administrator.")


def otp_hash(identifier: str, purpose: str, code: str) -> str:
    return hmac.new(
        settings().auth_otp_secret.encode(),
        f"{identifier}:{purpose}:{code}".encode(),
        hashlib.sha256,
    ).hexdigest()


def challenge_data(challenge: EmailOtpChallenge, token: str):
    return serialized(
        {
            "token": token,
            "email": challenge.email,
            "purpose": challenge.purpose,
            "expiresAt": challenge.expires_at,
            "resendAvailableAt": challenge.last_sent_at + timedelta(seconds=60),
        }
    )


def deliver_otp(db: Session, challenge: EmailOtpChallenge, code: str):
    registration = challenge.purpose == "register"
    try:
        # Keep the row/issuance locks until SMTP completes. Verification cannot race delivery.
        send_mail(
            challenge.email,
            "Verify your AliveRadar account" if registration else "Your AliveRadar sign-in code",
            f"Your AliveRadar {'account verification' if registration else 'sign-in'} code is: {code}\n\n"
            "Valid for 5 minutes. Use this code only on AliveRadar. Never share it.\n"
            "If you did not request this code, ignore this email.",
            template={"kind": "register_otp" if registration else "login_otp", "otp_code": code},
        )
    except (OSError, RuntimeError):
        challenge.consumed_at = now()
        db.commit()
        logger.warning("Email verification delivery failed")
        raise ApiError(503, "We could not send your code. Please try again in a minute.") from None
    db.commit()


def issue_otp(
    db: Session,
    purpose: Purpose,
    email: str,
    password_hash: str,
    *,
    name: str | None = None,
    user_id: str | None = None,
):
    otp_ready()
    # Serialize issuance per address even across API processes; restarting cannot reset the limit.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"otp:{purpose}:{email}"},
    )
    instant = now()
    recent = list(
        db.scalars(
            select(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.email == email,
                EmailOtpChallenge.purpose == purpose,
                EmailOtpChallenge.last_sent_at > instant - timedelta(hours=1),
            )
            .with_for_update()
        )
    )
    if sum(c.send_count for c in recent) >= 5:
        raise ApiError(429, "Too many verification emails. Please try again in an hour.")
    if any(c.last_sent_at > instant - timedelta(seconds=60) for c in recent):
        raise ApiError(429, "Please wait a minute before requesting another code.")
    for previous in recent:
        previous.consumed_at = instant
    raw, code = secrets.token_hex(32), f"{secrets.randbelow(1000000):06d}"
    challenge = EmailOtpChallenge(
        id=digest(raw),
        purpose=purpose,
        email=email,
        user_id=user_id,
        name=name,
        password_hash=password_hash,
        code_hash=otp_hash(digest(raw), purpose, code),
        created_at=instant,
        last_sent_at=instant,
        expires_at=instant + timedelta(minutes=5),
    )
    db.add(challenge)
    db.flush()
    deliver_otp(db, challenge, code)
    return challenge_data(challenge, raw)


def active_challenge(db: Session, token: str, purpose: Purpose) -> EmailOtpChallenge:
    otp_ready()
    challenge = db.scalar(
        select(EmailOtpChallenge)
        .where(
            EmailOtpChallenge.id == digest(token),
            EmailOtpChallenge.purpose == purpose,
        )
        .with_for_update()
    )
    if (
        challenge is None
        or challenge.consumed_at
        or challenge.expires_at <= now()
        or challenge.attempts >= 5
    ):
        raise ApiError(400, "This verification has expired or is no longer valid. Start again.")
    return challenge


def resend_otp(body: OtpToken, purpose: Purpose, db: Session):
    # Match issuance lock ordering before locking the row, preventing resend/start deadlocks.
    address = db.scalar(
        select(EmailOtpChallenge.email).where(
            EmailOtpChallenge.id == digest(body.token), EmailOtpChallenge.purpose == purpose
        )
    )
    if address is None:
        raise ApiError(400, "This verification is no longer valid. Start again.")
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"otp:{purpose}:{address}"},
    )
    challenge = active_challenge(db, body.token, purpose)
    if challenge.last_sent_at > now() - timedelta(seconds=60):
        raise ApiError(429, "Please wait a minute before requesting another code.")
    sent = db.scalar(
        select(func.coalesce(func.sum(EmailOtpChallenge.send_count), 0)).where(
            EmailOtpChallenge.email == address,
            EmailOtpChallenge.purpose == purpose,
            EmailOtpChallenge.last_sent_at > now() - timedelta(hours=1),
        )
    )
    if challenge.send_count >= 3 or (sent or 0) >= 5:
        raise ApiError(429, "Verification email limit reached. Please start again later.")
    code = f"{secrets.randbelow(1000000):06d}"
    while hmac.compare_digest(challenge.code_hash, otp_hash(challenge.id, purpose, code)):
        code = f"{secrets.randbelow(1000000):06d}"
    challenge.code_hash = otp_hash(challenge.id, purpose, code)
    challenge.last_sent_at = now()
    challenge.expires_at = now() + timedelta(minutes=5)
    challenge.send_count += 1
    deliver_otp(db, challenge, code)
    return challenge_data(challenge, body.token)


def verify_otp(body: OtpVerification, purpose: Purpose, response: Response, db: Session):
    challenge = active_challenge(db, body.token, purpose)
    if not hmac.compare_digest(challenge.code_hash, otp_hash(challenge.id, purpose, body.code)):
        challenge.attempts += 1
        if challenge.attempts >= 5:
            challenge.consumed_at = now()
        db.commit()
        raise ApiError(
            400,
            "Too many incorrect codes. Start again."
            if challenge.attempts >= 5
            else "Incorrect code. Check your email and try again.",
        )
    user: User | None
    if purpose == "register":
        if db.scalar(select(User.id).where(User.email == challenge.email)):
            challenge.consumed_at = now()
            db.commit()
            raise ApiError(409, "An account with this email already exists. Sign in instead.")
        user = User(
            name=challenge.name or "",
            email=challenge.email,
            password_hash=challenge.password_hash,
            email_verified_at=now(),
        )
        db.add(user)
        db.flush()
        db.add(NotificationPreference(user_id=user.id, email_enabled=False))
    else:
        user = db.scalar(select(User).where(User.id == challenge.user_id).with_for_update())
        if user is None or not hmac.compare_digest(user.password_hash, challenge.password_hash):
            raise ApiError(400, "Your account changed. Sign in again to request a new code.")
        user.email_verified_at = now()
    challenge.consumed_at = now()
    csrf = create_session(db, user.id, response)
    db.commit()
    return serialized({"user": public_user(user), "csrfToken": csrf})


@router.post("/register", status_code=202)
def register(body: Registration, db: DB):
    if db.scalar(select(User.id).where(User.email == str(body.email))):
        raise ApiError(409, "An account with this email already exists. Sign in instead.")
    return issue_otp(db, "register", str(body.email), hash_password(body.password), name=body.name)


@router.post("/login", status_code=202)
def login(body: Login, db: DB):
    user = db.scalar(select(User).where(User.email == str(body.email)))
    valid = password_valid(body.password, user.password_hash if user else None)
    if not user or not valid:
        raise ApiError(401, "Email or password is incorrect.")
    return issue_otp(db, "login", user.email, user.password_hash, user_id=user.id)


@router.post("/register/verify-otp", status_code=201)
def verify_registration(body: OtpVerification, response: Response, db: DB):
    return verify_otp(body, "register", response, db)


@router.post("/login/verify-otp")
def verify_login(body: OtpVerification, response: Response, db: DB):
    return verify_otp(body, "login", response, db)


@router.post("/register/resend-otp")
def resend_registration(body: OtpToken, db: DB):
    return resend_otp(body, "register", db)


@router.post("/login/resend-otp")
def resend_login(body: OtpToken, db: DB):
    return resend_otp(body, "login", db)


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
                template={
                    "kind": "password_reset",
                    "action_url": f"{settings().app_origin}/reset-password?token={raw}",
                },
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
    list(
        db.scalars(
            select(EmailOtpChallenge)
            .where(EmailOtpChallenge.user_id == reset.user_id)
            .order_by(EmailOtpChallenge.id)
            .with_for_update()
        )
    )
    user = db.scalar(select(User).where(User.id == reset.user_id).with_for_update())
    if user is None:
        raise ApiError(400, "Reset link is invalid or expired.")
    user.password_hash = hashed
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.execute(
        update(EmailOtpChallenge)
        .where(EmailOtpChallenge.user_id == user.id)
        .values(consumed_at=now())
    )
    db.commit()
    response.delete_cookie(
        "pulse_session",
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings().node_env == "production",
    )
    return {"message": "Password updated. Sign in with your new password."}
