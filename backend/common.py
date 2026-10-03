import json
import logging
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import inspect

from backend.models import Base


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message
        super().__init__(message)


def serialized(value):
    if isinstance(value, Base):
        mapper = inspect(type(value))
        return {
            column.columns[0].name: serialized(getattr(value, column.key))
            for column in mapper.column_attrs
        }
    if isinstance(value, datetime):
        date = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return date.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: serialized(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialized(item) for item in value]
    return value


def public_user(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "isDemo": user.is_demo,
        "createdAt": user.created_at,
    }


def public_monitor(monitor):
    values = serialized(monitor)
    values.pop("leaseToken", None)
    values.pop("leaseUntil", None)
    return values


class JsonFormatter(logging.Formatter):
    def format(self, record):
        # Deliberately exclude exception text, HTTP bodies, URL queries, and credentials.
        return json.dumps(
            {
                "level": record.levelname.lower(),
                "time": datetime.now(UTC).isoformat(),
                "message": record.getMessage(),
                **getattr(record, "fields", {}),
            }
        )


logger = logging.getLogger("uptimepulse")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
