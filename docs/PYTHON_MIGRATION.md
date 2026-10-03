# Python backend migration

Requested change: replace every backend service and maintenance tool with Python, keeping the React frontend and the existing PostgreSQL database.

## Design

- FastAPI and Pydantic replace Express/Zod server validation; public API paths, camelCase JSON, UTC timestamps, error envelopes, session cookies, and CSRF behavior remain compatible.
- SQLAlchemy 2 and psycopg replace Prisma. Models map to the existing quoted PostgreSQL table/column/enum names. Existing user passwords remain bcrypt-compatible; existing sessions and IDs remain valid.
- Alembic adopts existing Prisma-created databases only after schema checks, with a recorded baseline; new installations run the preserved initial SQL through an Alembic revision. Subsequent migrations use Alembic. No data is dropped or reseeded.
- A separate asyncio Python worker preserves SKIP LOCKED claims, fenced leases, threshold transitions, incident uniqueness, outbox retries, retention, and heartbeat.
- aiohttp uses a validated pinned resolver, rejects forbidden networks and redirects, verifies TLS against the original hostname, and bounds DNS plus HTTP by a single timeout.
- Python SMTP delivery uses plain-text/HTML templates and records acceptance only after the SMTP transaction succeeds.
- Database seed, local PostgreSQL launcher, mock target, health checks, integration runner, and live-worker verification become Python commands.
- Node remains the frontend build/test tool only. Remove obsolete TypeScript backend implementations, Prisma runtime dependencies, and backend tests after Python parity is verified.

## Verification

- Python unit tests for validation, IP/DNS policy, state transitions, analytics, and retry behavior.
- Disposable PostgreSQL integration tests for migration/adoption, legacy bcrypt/session compatibility, auth/CSRF/isolation, CRUD, real checks, concurrency/restarts, incident transitions, SMTP, password reset, and public privacy.
- Existing frontend form tests and desktop/mobile Playwright journeys run against the Python API and worker.
- Python lint/type checks, frontend lint/type checks, production web build, dependency audits, health, and independent worker observations.

## Progress

- [x] Inspected existing API, database schema, worker, scripts, tests, and deployment files.
- [x] Python runtime/dependency setup.
- [x] SQLAlchemy models and safe Alembic adoption.
- [x] FastAPI routes and security.
- [x] Python worker and SMTP.
- [x] Python development/maintenance commands and Docker.
- [x] Port tests and verify existing-data compatibility.
- [x] Remove obsolete backend code/dependencies and update documentation.
- [x] Final verification and running app.

The previous backend was archived intact in `.local/legacy-typescript-backend`; an automatic approval review rejected irreversible source deletion. The archive is excluded from active builds, tests and execution. The migration preserves baseline SQL bytes and legacy database metadata for audit.
