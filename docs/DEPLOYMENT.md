# Deployment and operations

Run the static frontend, Python FastAPI API, independent Python worker and PostgreSQL as separate components. API and worker require Python 3.12+; Python 3.13 is pinned for local setup and images. Node 24 builds the frontend. The worker needs an always-on service.

## Configuration

| Variable              | Expected value                                                                   |
| --------------------- | -------------------------------------------------------------------------------- |
| NODE_ENV              | production; legacy name retained for compatibility                               |
| DATABASE_URL          | Private PostgreSQL URL, TLS for remote connections; optional connection_limit=10 |
| APP_ORIGIN            | Exact HTTPS origin with no trailing slash                                        |
| PORT                  | API port, default 3001                                                           |
| SESSION_DAYS          | 1–30, default 7                                                                  |
| DEV_MOCK_ORIGIN       | Empty in production                                                              |
| WORKER_CONCURRENCY    | 1–32, default 4 per worker                                                       |
| WORKER_POLL_MS        | At least 250 ms, default 2000                                                    |
| RETENTION_DAYS        | At least 30, default 90                                                          |
| SMTP_HOST/PORT/SECURE | Provider settings; implicit TLS when SECURE=true                                 |
| SMTP_USER/PASS/FROM   | Credentials and verified sender                                                  |

Use a secret manager and private database networking. PostgreSQL 14+ is required for date_bin aggregation. Allocate connection budgets across replicas. A runtime role needs CRUD, a release migration role needs DDL, and only local integration tests need CREATEDB. Prisma-only URL options are removed before psycopg connects; connection_limit still bounds SQLAlchemy's pool.

## Build and release

```sh
npm ci
npm run build
uv sync --frozen --no-dev
.venv/bin/python -m backend.cli migrate
# Separate managed processes:
.venv/bin/python -m backend.cli api
.venv/bin/python -m backend.cli worker
```

On Windows use `.venv/Scripts/python.exe`. Use the Docker `server` target for Python API, worker and migration jobs; `web` includes Nginx and the frontend build. The server installs hash-pinned `requirements.txt` generated from `uv.lock`. Regenerate it with `uv export --no-dev --no-emit-project --format requirements-txt --output-file requirements.txt` after dependency updates.

Migrate once before releasing compatible API/worker versions. The first Python migration verifies existing legacy checksums, tables, columns and required indexes before stamping the baseline. Fresh databases execute the preserved SQL. Do not modify baseline SQL or downgrade destructively. Add subsequent changes as Alembic revisions and make them compatible with rolling releases. Do not seed production.

Compose defaults to local development at localhost:8080. For production terminate HTTPS at ingress and set COMPOSE_NODE_ENV=production and COMPOSE_APP_ORIGIN=https://your-domain. Keep the API unreachable directly and restrict database exposure. Supply trusted proxy headers and ingress rate limits when scaling replicas. The Nginx configuration serves static assets and routes /api, /health and /ready. Swagger's documentation location has a separate CSP allowing its CDN assets; dashboard scripts remain same-origin.

## Worker behavior

Workers claim due monitors with FOR UPDATE SKIP LOCKED and 90-second leases. Requests have at most 30-second DNS+HTTP deadlines. A result transaction locks its monitor and checks the lease token, activity and expiry. Expired jobs are reclaimed after restart; stale checks cannot overwrite newer results or configuration changes. Incidents have a partial unique open-per-monitor constraint and notification events have unique keys.

Separate monitoring, email and maintenance loops prevent delivery delays from blocking checks. Heartbeats update every ten seconds; /ready expects a heartbeat within 30 seconds. /health is process liveness. The worker-health command checks fleet liveness; a service manager must also track individual replicas. SIGTERM/SIGINT stop new claims and finish active work. Allow at least 40 seconds for shutdown.

Email attempts use bounded timeouts, six attempts and exponential backoff beginning at 30 seconds. Expired final-attempt claims become FAILED. Brevo uses `smtp-relay.brevo.com`, SMTP login/key and a sender verified in Brevo. Port 587 with SMTP_SECURE=false upgrades to verified STARTTLS; port 465 with SMTP_SECURE=true uses implicit TLS. Credentials are never sent without TLS or returned to the browser. Placeholder senders and missing Brevo credentials disable email processing until corrected. Restart API and worker after changing environment values. A payload frozen on the first attempt keeps retries consistent. Website groups and immutable outbox payloads are added by migration `0002_websites`; existing monitor/check/incident IDs remain intact.

Stable Message-ID helps SMTP deduplication. SMTP and PostgreSQL cannot commit atomically, so a crash after acceptance can cause redelivery. DELIVERED means provider acceptance, not guaranteed inbox receipt.

Collect JSON logs and alert on heartbeat, scheduling, persistence and delivery errors. API rate limits are per process; use a shared ingress limiter for multiple replicas. Large installations should add analytics rollups and batched retention cleanup.

## Backups and verification

Schedule encrypted PostgreSQL backups outside the database host and test restore into a separate database. Use pg_dump/pg_restore with protected credentials and rehearse recovery. Record RPO/RTO; use point-in-time recovery where needed. Cleanup runs hourly and removes expired sessions/reset tokens and check history older than RETENTION_DAYS. Incidents remain until monitor deletion. Monitor deletion cascades related data; page deletion preserves monitors. Compose down retains volumes.

Before release run typecheck, lint, pytest/Vitest, disposable PostgreSQL integration tests, desktop/mobile Playwright, build, formatting and dependency audits. Check actual deployment health, tenant isolation, CSRF, public-page privacy, observations with the browser closed, outage/recovery and restart behavior. Validate SMTP with your provider and test backups. See PROGRESS.md for checks actually run and tooling limitations.
