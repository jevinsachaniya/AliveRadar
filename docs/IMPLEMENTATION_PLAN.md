# Implementation plan

The application uses a React/Vite frontend, Python FastAPI API, PostgreSQL with SQLAlchemy/Alembic, and a separate Python asyncio worker.

1. Map the existing PostgreSQL schema, preserve camelCase JSON and all IDs, bcrypt hashes and session digests.
2. Verify existing migration checksums and schema before Alembic adoption; apply baseline SQL for fresh databases.
3. Preserve authentication, Origin/CSRF checks, bounded inputs, safe errors, owner scoping and session expiry.
4. Implement monitor CRUD, filters, pagination, threshold configuration and fenced pause/resume.
5. Schedule actual HTTP checks with SKIP LOCKED, expiring token leases, bounded concurrency, DNS pinning, TLS verification and SSRF rejection.
6. Persist observations and incident transitions atomically; enqueue unique outage/recovery notifications.
7. Deliver SMTP from an independent loop with provider acceptance, six attempts, backoff and lease recovery.
8. Aggregate observed UTC analytics and expose safe public status pages.
9. Port seed, mock target, local PostgreSQL launcher, migration, health and verification tools to Python.
10. Verify with pytest unit/disposable PostgreSQL integration tests and existing React/Playwright tests.
11. Preserve the old backend in a local archive; remove it from builds and execution and remove Node backend dependencies.
12. Supply Python Docker services, lockfiles, deployment instructions and actual verification results.

See [migration record](PYTHON_MIGRATION.md), [security](SECURITY.md), [analytics](ANALYTICS.md) and [progress](PROGRESS.md).
