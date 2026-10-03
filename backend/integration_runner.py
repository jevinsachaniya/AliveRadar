import os
import subprocess
import sys
from uuid import uuid4

import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

from backend.config import settings
from backend.db import create_db_engine, sqlalchemy_url
from backend.migrate import migrate


def run():
    original = make_url(settings().database_url)
    if settings().node_env == "production" or original.host not in {
        "localhost",
        "127.0.0.1",
        "::1",
    }:
        raise RuntimeError("Integration runner requires a local development PostgreSQL server.")
    identifier = f"uptimepulse_test_{uuid4().hex}"
    admin_url, _ = sqlalchemy_url(
        original.set(database="postgres", host="127.0.0.1").render_as_string(hide_password=False)
    )
    admin_url = admin_url.replace("postgresql+psycopg://", "postgresql://")
    target = original.set(database=identifier, host="127.0.0.1").render_as_string(
        hide_password=False
    )
    with psycopg.connect(admin_url, autocommit=True, connect_timeout=5) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(identifier)))
        try:
            db_engine = create_db_engine(target)
            try:
                migrate(db_engine)
            finally:
                db_engine.dispose()
            env = {
                **os.environ,
                "DATABASE_URL": target,
                "NODE_ENV": "test",
                "APP_ORIGIN": "http://localhost:5173",
                "DEV_MOCK_ORIGIN": "http://127.0.0.1:4006",
                "SMTP_HOST": "127.0.0.1",
                "SMTP_PORT": "4026",
                "SMTP_SECURE": "false",
                "SMTP_USER": "",
                "SMTP_PASS": "",
                "SMTP_FROM": "AliveRadar <alerts@example.com>",
            }
            return subprocess.run(
                [sys.executable, "-m", "pytest", "-m", "integration", *sys.argv[2:]],
                env=env,
                check=False,
            ).returncode
        finally:
            admin.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(identifier))
            )
