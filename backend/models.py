from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, ENUM, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from backend.db import new_id, now

monitor_status = ENUM(
    "UP", "DOWN", "PAUSED", "PENDING", "UNKNOWN", name="MonitorStatus", create_type=False
)
incident_status = ENUM("OPEN", "RESOLVED", name="IncidentStatus", create_type=False)
delivery_status = ENUM(
    "PENDING", "SENDING", "DELIVERED", "FAILED", name="DeliveryStatus", create_type=False
)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "User"
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column("passwordHash", Text)
    is_demo: Mapped[bool] = mapped_column("isDemo", Boolean, default=False)
    email_verified_at: Mapped[datetime | None] = mapped_column("emailVerifiedAt", DateTime)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, default=now, onupdate=now)


class EmailOtpChallenge(Base):
    __tablename__ = "EmailOtpChallenge"
    __table_args__ = (
        CheckConstraint("purpose IN ('login', 'register')", name="EmailOtpChallenge_purpose"),
        Index("EmailOtpChallenge_email_purpose_created", "email", "purpose", "createdAt"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    purpose: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    user_id: Mapped[str | None] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    name: Mapped[str | None] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column("passwordHash", Text)
    code_hash: Mapped[str] = mapped_column("codeHash", Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    send_count: Mapped[int] = mapped_column("sendCount", Integer, default=1)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)
    last_sent_at: Mapped[datetime] = mapped_column("lastSentAt", DateTime)
    expires_at: Mapped[datetime] = mapped_column("expiresAt", DateTime, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column("consumedAt", DateTime)


class AuthSession(Base):
    __tablename__ = "Session"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    csrf_token: Mapped[str] = mapped_column("csrfToken", Text)
    otp_verified_at: Mapped[datetime | None] = mapped_column("otpVerifiedAt", DateTime)
    expires_at: Mapped[datetime] = mapped_column("expiresAt", DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)


class PasswordReset(Base):
    __tablename__ = "PasswordReset"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column("expiresAt", DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)


class Website(Base):
    __tablename__ = "Website"
    __table_args__ = (
        UniqueConstraint("userId", "url", name="Website_user_origin_unique"),
        UniqueConstraint("id", "userId", name="Website_id_user_unique"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    email_enabled: Mapped[bool] = mapped_column("emailEnabled", Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, default=now, onupdate=now)


class Monitor(Base):
    __tablename__ = "Monitor"
    __table_args__ = (
        ForeignKeyConstraint(
            ["websiteId", "userId"],
            ["Website.id", "Website.userId"],
            ondelete="CASCADE",
            name="Monitor_website_owner_fk",
        ),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    website_id: Mapped[str | None] = mapped_column("websiteId", Text, index=True)
    name: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    method: Mapped[str] = mapped_column(String, default="GET")
    interval_seconds: Mapped[int] = mapped_column("intervalSeconds", Integer, default=60)
    timeout_ms: Mapped[int] = mapped_column("timeoutMs", Integer, default=10000)
    expected_status_codes: Mapped[list[int]] = mapped_column(
        "expectedStatusCodes", ARRAY(Integer), default=lambda: [200]
    )
    failure_threshold: Mapped[int] = mapped_column("failureThreshold", Integer, default=2)
    recovery_threshold: Mapped[int] = mapped_column("recoveryThreshold", Integer, default=1)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, default=True)
    current_status: Mapped[str] = mapped_column("currentStatus", monitor_status, default="PENDING")
    consecutive_failures: Mapped[int] = mapped_column("consecutiveFailures", Integer, default=0)
    consecutive_successes: Mapped[int] = mapped_column("consecutiveSuccesses", Integer, default=0)
    last_checked_at: Mapped[datetime | None] = mapped_column("lastCheckedAt", DateTime)
    next_check_at: Mapped[datetime] = mapped_column("nextCheckAt", DateTime, default=now)
    lease_until: Mapped[datetime | None] = mapped_column("leaseUntil", DateTime)
    lease_token: Mapped[str | None] = mapped_column("leaseToken", Text)
    dns_status: Mapped[str] = mapped_column("dnsStatus", String, default="UNKNOWN")
    dns_address: Mapped[str | None] = mapped_column("dnsAddress", Text)
    dns_error: Mapped[str | None] = mapped_column("dnsError", Text)
    dns_checked_at: Mapped[datetime | None] = mapped_column("dnsCheckedAt", DateTime)
    tls_status: Mapped[str] = mapped_column("tlsStatus", String, default="NOT_APPLICABLE")
    tls_expires_at: Mapped[datetime | None] = mapped_column("tlsExpiresAt", DateTime)
    tls_days_remaining: Mapped[int | None] = mapped_column("tlsDaysRemaining", Integer)
    tls_error: Mapped[str | None] = mapped_column("tlsError", Text)
    tls_checked_at: Mapped[datetime | None] = mapped_column("tlsCheckedAt", DateTime)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, default=now, onupdate=now)


class MonitorCheck(Base):
    __tablename__ = "MonitorCheck"
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    monitor_id: Mapped[str] = mapped_column(
        "monitorId", ForeignKey("Monitor.id", ondelete="CASCADE")
    )
    checked_at: Mapped[datetime] = mapped_column("checkedAt", DateTime, default=now)
    result_status: Mapped[str] = mapped_column("resultStatus", monitor_status)
    http_status_code: Mapped[int | None] = mapped_column("httpStatusCode", Integer)
    response_time_ms: Mapped[int | None] = mapped_column("responseTimeMs", Integer)
    error_type: Mapped[str | None] = mapped_column("errorType", Text)
    sanitized_error_message: Mapped[str | None] = mapped_column("sanitizedErrorMessage", Text)


class Incident(Base):
    __tablename__ = "Incident"
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    monitor_id: Mapped[str] = mapped_column(
        "monitorId", ForeignKey("Monitor.id", ondelete="CASCADE")
    )
    started_at: Mapped[datetime] = mapped_column("startedAt", DateTime)
    resolved_at: Mapped[datetime | None] = mapped_column("resolvedAt", DateTime)
    cause: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(incident_status, default="OPEN")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)


class NetworkAlert(Base):
    __tablename__ = "NetworkAlert"
    __table_args__ = (Index("NetworkAlert_monitor_kind_started", "monitorId", "kind", "startedAt"),)
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    monitor_id: Mapped[str] = mapped_column(
        "monitorId", ForeignKey("Monitor.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String)
    cause: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(incident_status, default="OPEN")
    started_at: Mapped[datetime] = mapped_column("startedAt", DateTime, default=now)
    resolved_at: Mapped[datetime | None] = mapped_column("resolvedAt", DateTime)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)


class NotificationPreference(Base):
    __tablename__ = "NotificationPreference"
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    monitor_id: Mapped[str | None] = mapped_column(
        "monitorId", ForeignKey("Monitor.id", ondelete="CASCADE")
    )
    email_enabled: Mapped[bool] = mapped_column("emailEnabled", Boolean, default=False)
    outage_notifications: Mapped[bool] = mapped_column("outageNotifications", Boolean, default=True)
    recovery_notifications: Mapped[bool] = mapped_column(
        "recoveryNotifications", Boolean, default=True
    )


class NotificationDelivery(Base):
    __tablename__ = "NotificationDelivery"
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    incident_id: Mapped[str | None] = mapped_column(
        "incidentId", ForeignKey("Incident.id", ondelete="CASCADE")
    )
    network_alert_id: Mapped[str | None] = mapped_column(
        "networkAlertId", ForeignKey("NetworkAlert.id", ondelete="CASCADE")
    )
    monitor_id: Mapped[str | None] = mapped_column(
        "monitorId", ForeignKey("Monitor.id", ondelete="CASCADE")
    )
    channel: Mapped[str] = mapped_column(Text, default="EMAIL")
    event_type: Mapped[str] = mapped_column("eventType", Text)
    status: Mapped[str] = mapped_column(delivery_status, default="PENDING")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    message_payload: Mapped[dict | None] = mapped_column("messagePayload", JSONB)
    next_attempt_at: Mapped[datetime] = mapped_column("nextAttemptAt", DateTime, default=now)
    lease_until: Mapped[datetime | None] = mapped_column("leaseUntil", DateTime)
    lease_token: Mapped[str | None] = mapped_column("leaseToken", Text)
    delivered_at: Mapped[datetime | None] = mapped_column("deliveredAt", DateTime)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)


class StatusPage(Base):
    __tablename__ = "StatusPage"
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    is_public: Mapped[bool] = mapped_column("isPublic", Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, default=now, onupdate=now)


class StatusPageMonitor(Base):
    __tablename__ = "StatusPageMonitor"
    status_page_id: Mapped[str] = mapped_column(
        "statusPageId", ForeignKey("StatusPage.id", ondelete="CASCADE"), primary_key=True
    )
    monitor_id: Mapped[str] = mapped_column(
        "monitorId", ForeignKey("Monitor.id", ondelete="CASCADE"), primary_key=True
    )


class WorkerHeartbeat(Base):
    __tablename__ = "WorkerHeartbeat"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, default=now)
    started_at: Mapped[datetime] = mapped_column("startedAt", DateTime, default=now)
