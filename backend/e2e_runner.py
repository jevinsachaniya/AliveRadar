"""Isolated browser-test stack. Mail is captured locally; user data is never reset."""

import json
import os
import signal
import subprocess
import sys
import threading
import time
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen
from uuid import uuid4

import psycopg
from aiosmtpd.controller import Controller
from psycopg import sql
from sqlalchemy.engine import make_url

from backend.config import settings
from backend.db import create_db_engine, sqlalchemy_url
from backend.migrate import migrate
from backend.mock import Target


def run():
    original = make_url(settings().database_url)
    if settings().node_env == "production" or original.host not in {
        "localhost",
        "127.0.0.1",
        "::1",
    }:
        raise RuntimeError("Browser tests require a local development PostgreSQL server.")
    identifier = f"uptimepulse_e2e_{uuid4().hex}"
    admin_url, _ = sqlalchemy_url(
        original.set(database="postgres", host="127.0.0.1").render_as_string(hide_password=False)
    )
    admin_url = admin_url.replace("postgresql+psycopg://", "postgresql://")
    target = original.set(database=identifier, host="127.0.0.1").render_as_string(
        hide_password=False
    )
    stop, ready = threading.Event(), threading.Event()
    messages: list[dict] = []
    children: list[subprocess.Popen] = []
    started_servers: list[ThreadingHTTPServer] = []
    smtp_started = False

    class MailHandler:
        async def handle_DATA(self, server, session, envelope):
            message = BytesParser(policy=policy.default).parsebytes(envelope.content)
            plain = message.get_body(preferencelist=("plain",))
            messages.append(
                {
                    "to": envelope.rcpt_tos,
                    "subject": str(message["Subject"]),
                    "text": plain.get_content() if plain else "",
                }
            )
            return "250 Accepted"

    class Collector(BaseHTTPRequestHandler):
        def do_GET(self):
            url = urlsplit(self.path)
            body: dict | list
            if url.path == "/ready":
                status, body = (200, {"ready": True}) if ready.is_set() else (503, {"ready": False})
            elif url.path == "/messages":
                recipient = parse_qs(url.query).get("to", [""])[0]
                status, body = 200, [m for m in messages if recipient in m["to"]]
            else:
                status, body = 404, {}
            encoded = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_POST(self):
            if self.path != "/stop":
                self.send_error(404)
                return
            self.send_response(204)
            self.end_headers()
            stop.set()

        def log_message(self, format, *args):
            pass

    smtp = Controller(MailHandler(), hostname="127.0.0.1", port=4027, auth_required=False)
    collector = ThreadingHTTPServer(("127.0.0.1", 4030), Collector)
    mock = ThreadingHTTPServer(("127.0.0.1", 4007), Target)
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
                "PORT": "3002",
                "APP_ORIGIN": "http://localhost:5175",
                "API_PROXY_TARGET": "http://127.0.0.1:3002",
                "DEV_MOCK_ORIGIN": "http://127.0.0.1:4007",
                "SMTP_HOST": "127.0.0.1",
                "SMTP_PORT": "4027",
                "SMTP_SECURE": "false",
                "SMTP_USER": "",
                "SMTP_PASS": "",
                "SMTP_FROM": "AliveRadar <alerts@example.com>",
                "AUTH_OTP_SECRET": "browser-test-only-" + uuid4().hex,
            }
            smtp.start()
            smtp_started = True
            for server in [collector, mock]:
                threading.Thread(target=server.serve_forever, daemon=True).start()
                started_servers.append(server)
            commands = [
                [sys.executable, "-m", "backend.cli", "api"],
                [sys.executable, "-m", "backend.cli", "worker"],
                [
                    "node",
                    str(Path("node_modules/vite/bin/vite.js")),
                    "--config",
                    "apps/web/vite.config.ts",
                    "--port",
                    "5175",
                ],
            ]
            for command in commands:
                children.append(subprocess.Popen(command, env=env))
            for sig in [signal.SIGINT, signal.SIGTERM]:
                signal.signal(sig, lambda *_: stop.set())
            deadline = time.monotonic() + 60
            while not stop.wait(0.25):
                if any(child.poll() is not None for child in children):
                    raise RuntimeError("A browser test service stopped unexpectedly.")
                if ready.is_set():
                    continue
                try:
                    with (
                        urlopen("http://127.0.0.1:3002/ready", timeout=1),
                        urlopen("http://localhost:5175/login", timeout=1),
                    ):
                        ready.set()
                        print(
                            "Isolated browser stack ready; test mail stays on loopback.", flush=True
                        )
                except OSError:
                    if time.monotonic() > deadline:
                        raise RuntimeError("Browser test services did not become ready.") from None
        finally:
            ready.clear()
            for child in reversed(children):
                if child.poll() is not None:
                    continue
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill.exe", "/PID", str(child.pid), "/T", "/F"],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                else:
                    child.terminate()
                child.wait(timeout=15)
            if smtp_started:
                smtp.stop()
            for server in [collector, mock]:
                if server in started_servers:
                    server.shutdown()
                server.server_close()
            admin.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(identifier))
            )


if __name__ == "__main__":
    run()
