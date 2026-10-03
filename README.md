# AliveRadar

**Every page, on your radar.** AliveRadar monitors multiple named URLs for each website, tracks each page independently and shows the website’s overall UP, DEGRADED or DOWN status. Find failed pages by name, receive outage and recovery emails, and share public status pages.

The website has a public homepage and feature overview, top navigation and a React/TypeScript interface, a **Python FastAPI API**, PostgreSQL with SQLAlchemy/Alembic, and an independent **Python asyncio worker**. Adding websites and accessing account monitoring use password plus email OTP authentication. Monitor management, analytics, incidents, SMTP alerts and password reset are included.

## Deploy on Render

Use the root [render.yaml](render.yaml) Blueprint for an HTTPS website/API, an always-on Python monitoring worker and private PostgreSQL. Production migrations and configuration checks run before deployment. See [the Render deployment guide](docs/RENDER.md) for the three Brevo values to enter, paid-plan requirements, verification and connecting your AliveRadar domain.

## Start on Windows

Requires Node.js 24 for the frontend. The setup helper installs Python 3.13 and dependencies into this workspace; an existing Python 3.12+ installation with uv also works.

```powershell
npm.cmd ci
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-python.ps1
# Only for a fresh checkout; preserve your existing .env:
Copy-Item .env.example .env
# Generate a private AUTH_OTP_SECRET for .env and configure Brevo SMTP:
python -c "import secrets; print(secrets.token_hex(32))"
npm.cmd run db:local
```

Keep the database terminal open. In another terminal:

```powershell
npm.cmd run db:migrate
npm.cmd run dev
```

Open **http://localhost:5173** to browse the homepage, how-it-works, FAQ and public `/overview` without signing in. **Start monitoring** or **Add website** opens login. New users choose **Create an account** and verify their email on `/register/otp`; existing users enter their password and verify the emailed code on `/login/otp`. After verification, the Add Website form opens automatically. Monitoring and account data require a verified session; published status-page links are public. Codes last five minutes, with a 60-second resend cooldown and five wrong-code attempts. Automatic demo access is removed; optional seeded records remain preserved in the database. See [authentication API](docs/API.md) and [website design](docs/WEBSITE_DESIGN.md).

If Python and uv are already installed, use `uv sync --extra dev --python 3.13` instead of the setup helper. On macOS/Linux use npm without `.cmd`, set `DATABASE_URL` to an existing PostgreSQL 14+ database, and skip `db:local`. `PG_BIN` optionally points the Python local database launcher to native PostgreSQL binaries. On Windows, the npm development dependency provides those binaries; no Node database service is used. Local data, Python runtime, virtual environment, and secrets are ignored by Git.

## Python migration and existing data

All active API, monitoring, SMTP, database and maintenance code is in `backend/`. SQLAlchemy maps existing table and column names; IDs, bcrypt passwords, monitors, checks, incidents and status pages are preserved. The authentication contract now uses the two-step OTP flow described in [API usage](docs/API.md). Migration `0003_email_otp` retains old session records but requires a fresh OTP login before they can authorize access.

`db:migrate` verifies the previous migration checksums, table columns and required indexes before recording an Alembic baseline. It refuses an unknown or modified legacy schema. Fresh installations apply the preserved SQL through Alembic. Do not edit the baseline SQL files: their bytes are used for verification. Later schema changes use Alembic revisions. See [migration details](docs/PYTHON_MIGRATION.md).

The former TypeScript backend is archived intact in `.local/legacy-typescript-backend` on this machine. It is excluded from execution, builds and tests. Express and Prisma are removed from active npm dependencies. `scripts/python.mjs` only forwards npm commands to `.venv` Python, allowing familiar commands; backend services can run directly without Node.

## Commands

| Purpose                        | npm convenience command     | Direct Python command                                   |
| ------------------------------ | --------------------------- | ------------------------------------------------------- |
| API with reload                | `npm.cmd run dev:api`       | `.venv/Scripts/python.exe -m backend.cli api --reload`  |
| Monitoring worker              | `npm.cmd run start:worker`  | `.venv/Scripts/python.exe -m backend.cli worker`        |
| Apply migrations               | `npm.cmd run db:migrate`    | `.venv/Scripts/python.exe -m backend.cli migrate`       |
| Development seed               | `npm.cmd run db:seed`       | `.venv/Scripts/python.exe -m backend.cli seed`          |
| Development HTTP target        | `npm.cmd run mock`          | `.venv/Scripts/python.exe -m backend.cli mock`          |
| Local PostgreSQL               | `npm.cmd run db:local`      | `.venv/Scripts/python.exe -m backend.cli local-db`      |
| API/database/worker health     | `npm.cmd run health`        | `.venv/Scripts/python.exe -m backend.cli health`        |
| Independent worker observation | `npm.cmd run verify:worker` | `.venv/Scripts/python.exe -m backend.cli verify-worker` |

On Linux/macOS replace `.venv/Scripts/python.exe` with `.venv/bin/python`. Frontend development is `npm run dev:web`; `npm run build` outputs the static app to `dist/web`. `npm run dev:built` starts the Python API without reload alongside the worker, frontend and mock target.

API documentation: **http://localhost:5173/api/docs**. OpenAPI: `/api/v1/openapi.json`. `/health` checks process liveness; `/ready` checks PostgreSQL and worker heartbeat.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run format:check
npm.cmd audit
npm.cmd run audit:python
```

Pytest covers backend behavior; Vitest/React Testing Library cover frontend forms. The integration runner creates and migrates a unique local `uptimepulse_test_*` database and drops only that database afterward. It refuses remote databases and production mode. PostgreSQL requires a local role with CREATEDB. Tests use real HTTP on port 4006 and actual SMTP on port 4026. Playwright starts its own isolated `uptimepulse_e2e_*` database, API (3002), worker, frontend (5175), mock target (4007), SMTP receiver (4027) and loopback mail collector (4030). Teardown stops only its own processes and drops only its own test database. Browser journeys complete real OTP verification using captured local email. Test mail never uses Brevo, and development accounts/history are never reset. See [verification results](docs/PROGRESS.md).

## Docker and production

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f api worker
```

Set `POSTGRES_PASSWORD` first. Stop the portable database before using Compose's port 54329. Open **http://localhost:8080** and register. Compose runs PostgreSQL, a one-shot Python Alembic migration, the Python API, Python worker, and Nginx frontend separately. API/worker images use Python 3.13 and hash-locked requirements; Node is used in the frontend build stage. `docker compose down` retains the database volume. Docker execution was unavailable on this host.

For production set `NODE_ENV=production` (the legacy configuration key is retained), `APP_ORIGIN=https://your-domain`, a private PostgreSQL URL, and an empty `DEV_MOCK_ORIGIN`. Production requires HTTPS and Secure cookies. Run `uv sync --frozen --no-dev`, migrate once, and start API and worker as separate managed Python processes. An always-on worker is necessary. Serve `dist/web` through Nginx or an equivalent same-origin API proxy. See [deployment and backups](docs/DEPLOYMENT.md).

## Notifications and monitoring

Open **Websites → Add website**, enter its address, and add named page URLs or paths such as `/`, `/login`, and `/checkout`. Each URL has its own checks, thresholds, incidents and history. The dashboard lists failed page names. Existing monitors are grouped by their account and HTTP/HTTPS origin without replacing their history; additional monitors on that origin join the group automatically.

The overall website status is **UP** when all active pages are up, **DEGRADED** when some are down, and **DOWN** when all are down. Paused pages are excluded. Pending pages remain unknown until their checks complete; they are never assumed up. Website settings manage the name and email switch. Deleting a website permanently deletes its page monitors and their history.

Email uses **Brevo SMTP**. Set `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, your Brevo `SMTP_USER`, an SMTP key in `SMTP_PASS`, and `SMTP_FROM=AliveRadar <your-verified-sender>`. The app upgrades port 587 to verified STARTTLS before authentication; `SMTP_SECURE=false` means it does not start with implicit SSL. Use port 465 with `SMTP_SECURE=true` for implicit TLS. SMTP keys and HTTP API keys are different. See [Brevo SMTP setup](https://developers.brevo.com/docs/smtp-integration).

Outage, recovery, password-reset and OTP verification messages use branded HTML templates with the supplied A/R logo embedded as an inline image, plus a plain-text alternative. See [email templates](docs/EMAIL_TEMPLATES.md) for previews, bundled assets and deployment details.

Restart API and worker after updating `.env`, and enable website/account notifications. The Notifications page shows Brevo as the provider. Placeholder sender addresses and incomplete Brevo credentials leave delivery disabled and queued events pending. Other SMTP providers remain compatible. Website email permission and the effective global/per-page preference both apply. Enabling website emails explicitly also enables account outage/recovery preferences. Each confirmed page outage creates one alert with the website name, page name, URL and website status; continued failures do not create repeated alerts. Recovery has its own notification. There are six attempts with bounded exponential backoff. Frozen outbox payloads and stable Message-ID keep retries consistent, although SMTP cannot guarantee exactly-once delivery after a crash. Provider acceptance is recorded; inbox placement is not guaranteed. Authenticated SMTP always requires TLS.

For a development outage, monitor `http://127.0.0.1:4005/website?status=503`. `?delay=15000` demonstrates a timeout. Only the configured development mock origin bypasses private-address blocking; production rejects that setting. Public destinations use DNS-pinned requests, verified TLS, and no redirects. Defaults confirm an outage after two failed checks and recover after one success.

Uptime measures successful observed checks within UTC rolling windows. Missing history returns unknown. Dashboard requests never trigger checks. Check history defaults to 90-day retention. Deleting monitors intentionally cascades related data; deleting public status pages preserves monitors.

- [Security](docs/SECURITY.md), [analytics](docs/ANALYTICS.md), [API usage](docs/API.md).
- `backend/`: FastAPI, Pydantic, SQLAlchemy, Alembic, psycopg, aiohttp, bcrypt, SMTP, worker and operational commands.
- `apps/web/`: React, TypeScript, Tailwind, Router, React Query, Recharts, React Hook Form and Zod.
- `packages/shared/`: frontend input validation.

Billing, teams, maintenance scheduling and multiple monitoring regions are outside this MVP.
