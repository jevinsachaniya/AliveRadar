from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from backend.config import settings


def now() -> datetime:
    """Match the existing timestamp(3) columns and JavaScript's millisecond precision."""
    instant = datetime.now(UTC)
    return instant.replace(tzinfo=None, microsecond=instant.microsecond // 1000 * 1000)


def new_id() -> str:
    return uuid4().hex


def sqlalchemy_url(raw: str) -> tuple[str, int]:
    url = make_url(raw).set(drivername="postgresql+psycopg")
    connection_limit = url.query.get("connection_limit", "10")
    if not isinstance(connection_limit, str):
        raise ValueError("Specify connection_limit once.")
    pool_size = min(30, max(1, int(connection_limit)))
    # Prisma-only options must not be forwarded to libpq.
    url = url.difference_update_query(["connection_limit", "schema", "pool_timeout"])
    return url.render_as_string(hide_password=False), pool_size


def create_db_engine(raw: str) -> Engine:
    url, pool_size = sqlalchemy_url(raw)
    return create_engine(
        url,
        pool_size=pool_size,
        max_overflow=0,
        pool_pre_ping=True,
        pool_timeout=15,
        connect_args={
            "connect_timeout": 5,
            "options": "-c timezone=UTC -c statement_timeout=15000",
        },
    )


@lru_cache
def engine() -> Engine:
    return create_db_engine(settings().database_url)


def get_db() -> Iterator[Session]:
    with Session(engine(), expire_on_commit=False) as db:
        yield db
