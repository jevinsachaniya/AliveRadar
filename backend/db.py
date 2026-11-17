from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any
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
    url = make_url(raw)
    if url.drivername.startswith("mysql"):
        url = url.set(drivername="mysql+pymysql")
    else:
        url = url.set(drivername="postgresql+psycopg")
    connection_limit = url.query.get("connection_limit", "10")
    if not isinstance(connection_limit, str):
        raise ValueError("Specify connection_limit once.")
    pool_size = min(30, max(1, int(connection_limit)))
    # Prisma-only and custom driver options must not be forwarded in query.
    url = url.difference_update_query(["connection_limit", "schema", "pool_timeout", "ssl_mode"])
    return url.render_as_string(hide_password=False), pool_size


def create_db_engine(raw: str) -> Engine:
    original_url = make_url(raw)
    url, pool_size = sqlalchemy_url(raw)
    connect_args: dict[str, Any] = {}
    if "mysql" in url:
        connect_args["connect_timeout"] = 10
        ssl_mode = original_url.query.get("ssl_mode")
        if ssl_mode or "ssl" in original_url.query or "aivencloud" in (original_url.host or ""):
            connect_args["ssl"] = {"ssl_mode": ssl_mode or "REQUIRED"}
    else:
        connect_args["connect_timeout"] = 5
        connect_args["options"] = "-c timezone=UTC -c statement_timeout=15000"
    return create_engine(
        url,
        pool_size=pool_size,
        max_overflow=0,
        pool_pre_ping=True,
        pool_timeout=15,
        connect_args=connect_args,
    )


@lru_cache
def engine() -> Engine:
    return create_db_engine(settings().database_url)


def get_db() -> Iterator[Session]:
    with Session(engine(), expire_on_commit=False) as db:
        yield db
