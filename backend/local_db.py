import os
import signal
import subprocess
import tempfile
import threading
from pathlib import Path

import psycopg
from psycopg import sql


def run():
    root = Path(__file__).resolve().parents[1]
    directory = root / ".local" / "postgres"
    directory.parent.mkdir(exist_ok=True)
    native = Path(
        os.environ.get(
            "PG_BIN",
            str(root / "node_modules" / "@embedded-postgres" / "windows-x64" / "native" / "bin"),
        )
    )
    suffix = ".exe" if os.name == "nt" else ""
    control = native / f"pg_ctl{suffix}"
    if not control.exists():
        raise RuntimeError(
            "Set PG_BIN to the PostgreSQL bin directory, or run npm install on Windows."
        )

    def execute(program, *args, check=True):
        return subprocess.run(
            [str(native / f"{program}{suffix}"), *map(str, args)],
            check=check,
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )

    if not (directory / "PG_VERSION").exists():
        with tempfile.NamedTemporaryFile(mode="w", delete=False, dir=directory.parent) as password:
            password.write("pulse_local_only")
        try:
            execute(
                "initdb",
                "-D",
                directory,
                "-U",
                "pulse",
                "--auth=scram-sha-256",
                f"--pwfile={password.name}",
            )
        finally:
            Path(password.name).unlink()
    already_running = execute("pg_ctl", "status", "-D", directory, check=False).returncode == 0
    if not already_running:
        result = execute(
            "pg_ctl",
            "start",
            "-D",
            directory,
            "-l",
            directory.parent / "postgres.log",
            "-o",
            "-h 127.0.0.1 -p 54329 -c timezone=UTC",
            check=False,
        )
        if result.returncode:
            raise RuntimeError(f"PostgreSQL startup failed: {result.stdout} {result.stderr}")
    try:
        with psycopg.connect(
            "postgresql://pulse:pulse_local_only@127.0.0.1:54329/postgres", autocommit=True
        ) as db:
            if not db.execute(
                "SELECT 1 FROM pg_database WHERE datname=%s", ("uptimepulse",)
            ).fetchone():
                db.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier("uptimepulse")))
        print("Local PostgreSQL ready on 127.0.0.1:54329. Leave this terminal open.", flush=True)
        stopped = threading.Event()
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: stopped.set())
        stopped.wait()
    finally:
        if not already_running:
            execute("pg_ctl", "stop", "-D", directory, "-m", "fast", check=False)
