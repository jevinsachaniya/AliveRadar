# Verification progress

The website redesign is complete. AliveRadar now has an original public homepage, horizontal navigation, explanatory sections and a shared footer. Warm cream, forest green and lime styling carries through monitoring, incidents, settings, authentication and public status pages. Existing data and Python monitoring services are preserved. See [website design](WEBSITE_DESIGN.md) for references and implementation details.

## AliveRadar branding on 3 October 2026

Rebranded the website as **AliveRadar**, with the tagline **“Every page, on your radar.”** Updated the shared logo with a radar icon, favicon, homepage copy, authentication screens, footer, public status-page attribution and search/social metadata. Content explains multiple named pages, independent monitoring, overall website health and outage/recovery emails. Homepage and footer website actions lead to multi-page website management.

API documentation, monitoring User-Agent, password-reset emails and new outage/recovery subjects use AliveRadar. The SMTP sender display name changed to AliveRadar while keeping the verified sender address and credentials. Existing monitoring history, queued email payloads, account identifiers and local origins remain intact. No domain extension has been assumed or activated.

- **55 Python unit tests, 27 disposable PostgreSQL integration tests and 7 frontend form tests passed.** Email checks used the local SMTP test server.
- **15 desktop/mobile Playwright tests passed; 3 desktop-only skips** for mobile layout cases. Header alignment passed at 320–1600 px, and long content stayed inside cards on twelve routes at 320, 390 and 600 px. Desktop and mobile homepage screenshots were inspected.
- TypeScript/mypy, ESLint/Ruff, source formatting and the production build passed. The running API reports **AliveRadar API**, Brevo configuration is ready, and database/worker readiness is healthy.

### Supplied A/R radar logo

Replaced the generic radar icon with the supplied A/R artwork, adapted to forest green, emerald and soft lime using the built-in imagegen tool. The selected transparent PNG is stored in `apps/web/public/brand/aliveradar-mark.png`; shared header/footer/authentication branding, homepage illustration, favicon and Apple touch icon use it. The original download is preserved. See [logo asset and final prompt](BRAND_LOGO.md).

**4 focused desktop/mobile Playwright checks passed**, including header geometry at 320–1600 px, public homepage/navigation and registration layout. Image decoding, PNG favicon loading and dark-mode readability were verified, including mobile containment at 320 px. Light/dark desktop and mobile screenshots were inspected. TypeScript/mypy, lint, formatting and production build passed; the logo is included in the production output.

## Website verification on 2 October 2026

### Brevo SMTP configuration

Brevo SMTP replaces the previous email API integration. Removed the previous provider's runtime code, environment entries, UI messages and active setup instructions. SMTP uses `smtp-relay.brevo.com:587` with verified STARTTLS before authentication. Authenticated connections refuse servers without TLS. Placeholder sender addresses and incomplete Brevo credentials disable processing and leave queued mail pending until corrected.

The supplied SMTP credentials authenticated successfully with code **235** over verified TLS. The operator supplied and then corrected the sender address; `.env` contains the corrected sender. A configuration test to the corrected address was **accepted by Brevo SMTP**. The first test had already been accepted before the correction arrived. Inbox receipt has not been independently verified. Credentials are never printed, stored in source, or returned to the frontend.

API and worker were restarted to load Brevo settings. Outage/recovery notifications and password reset now use SMTP. Frozen outbox payloads and stable Message-ID remain; provider acceptance is recorded, with the usual SMTP crash/redelivery limits.

- **55 Python unit tests passed**, including verified STARTTLS/implicit TLS, refusing plaintext authentication, escaped HTML and sender configuration checks.
- **27 disposable PostgreSQL integration tests passed**, including real local SMTP outage/recovery, reset links, acceptance/rejection and retries. Development data was preserved.
- **4 focused desktop/mobile Playwright tests passed** for multi-page monitoring, email preferences and provider configuration. TypeScript/mypy, lint, production build and formatting passed. Database and worker readiness are healthy.

### Earlier multiple page monitoring and Resend email alerts

Added owned website groups with named, independently checked URLs. Website creation accepts page paths or full URLs, rejects duplicate/cross-origin pages and creates the group atomically. Existing monitor IDs, checks and incidents are preserved by migration `0002_websites`; monitors on the same account/origin join the group automatically. PostgreSQL enforces matching website/page owners with a composite foreign key.

Home and Overview show each website's overall UP, DEGRADED or DOWN status and links to failed pages. Website detail shows every page's status, URL and check time with existing edit/pause/resume/delete actions. Website settings manage the name and email switch. Paused pages are excluded from the aggregate, and unchecked pages remain waiting. New cards, forms and page rows wrap long content on mobile.

At this earlier stage, Resend was configured server-side in the ignored local `.env`. A read-only provider credential check returned HTTP 200 and zero verified domains. The local sender was restricted to the account owner's email. No external inbox test was attempted at this stage. This integration has since been removed and replaced by Brevo SMTP, as described above.

Confirmed page outages create one email event per incident, with website/page names, the failed URL and website status. Recovery has a separate event. Continued failures do not spam. The website switch and effective account/page preferences both apply. Outbox payloads freeze on the first attempt, and stable Resend idempotency keys protect retries. SMTP remains supported; password reset uses either configured provider.

- **50 Python unit tests passed**, including aggregate status rules, canonical origins and Resend request/acceptance/rejection behavior through an isolated transport fixture.
- **27 disposable PostgreSQL integration tests passed**, including named-page grouping, UP → DEGRADED → DOWN → recovery transitions, paused pages, tenant isolation, cross-origin/duplicate rejection, preserved legacy history, deletion cascades, immutable retry payloads and real local SMTP page alerts without duplicate outage emails.
- **7 frontend form tests passed**, including multi-page submission and cross-origin validation before requests.
- **15 desktop/mobile Playwright tests passed; 3 desktop-only skips** for mobile layout cases. Real independent worker checks, failed page links on Overview, website/page CRUD, website email settings and existing portal features passed. Long names, URLs and failed-page content stayed within cards on twelve routes at 320, 390 and 600 px. Desktop and mobile screenshots were inspected.
- TypeScript/mypy, ESLint/Ruff, production build and source formatting passed. Readiness confirms the database and worker are healthy. Existing development monitors and history were preserved; no reset or reseed was performed.

### Header alignment and feature checks

The desktop header uses equal side columns around centered navigation. Links and utility buttons have consistent alignment, spacing and hit areas; narrow screens use a scrollable menu with outside-click, Escape and resize dismissal. Overview is accessible from navigation, and monitor search is available as a button, mobile link and Ctrl/Cmd + K shortcut.

Fixed monitor search losing focus when query changes replaced the page with a loading state. Search now debounces requests and preserves its controls and previous results during refreshes; errors offer an inline retry. Shortcut focus happens after the page is ready, including slow loads. The login password has an explicit accessible label excluding the adjacent recovery link.

- Header geometry and menu interactions checked at 320, 390, 600, 768, 960, 1024, 1280 and 1600 px; desktop/mobile screenshots inspected.
- Browser checks cover slow-load keyboard search, typing without losing focus, sorting, retry after a simulated search failure, Overview reporting periods, monitor CRUD/pause/resume and real checks, status-page creation/editing/publication/deletion, persistent notification preferences, login/logout, themes and mobile text containment.
- Backend feature integration checks passed against a disposable test database. API readiness confirmed the database and independent worker are healthy.
- At the time of these earlier header checks, SMTP was unconfigured. The current Brevo configuration is documented above; local SMTP acceptance/rejection and reset behavior remain covered by integration tests.

### Mobile card overflow fixes

Monitor filters now use two rows on small screens, and the desktop monitor table becomes labeled mobile rows with the status, uptime, response, history and action visible. Long names, URLs, email addresses, incident text and status-page slugs wrap within their cards. Page headings stack above their actions; card controls and footers wrap when needed. Dense check/delivery tables retain scrolling inside their own wrapper. Table accessibility roles remain explicit when its visual layout changes.

Regression checks exercise ten portal pages with long names, unbroken identifiers and URLs at 320, 390 and 600 px, including list/grid views and action spacing. Read-only browser fixtures preserve the development data. The desktop/mobile monitoring journeys also passed, and screenshots of the existing Bittrif Web list were inspected. Build, type checks, lint and source formatting passed.

- Frontend form tests: **5 passed**.
- Desktop/mobile Playwright journeys: **6 passed**, covering registration, real worker observations, monitor CRUD/pause/resume, public status-page publishing, filters, themes, mobile navigation and the signed-out homepage/FAQ. Focused follow-up runs also passed after adding screenshots and verifying no horizontal overflow at **320 px**.
- TypeScript and Python mypy checks, ESLint and Ruff, production frontend build and formatting checks passed. Harmless third-party Zod build annotation warnings remain.
- Test-generated desktop and mobile screenshots were inspected for the homepage, monitoring page, registration and public status-page layout. An initial literal HTML line-break rendering issue and same-page mobile-menu closing issue were corrected before verification.
- Public reference pages were reviewed through web browsing because Chrome control is unavailable. No manual Chrome or in-app browser inspection is claimed.
- The app remains available at **http://localhost:5173**. This change required no database reset, fixture replacement or backend changes.

## Backend migration

The requested backend migration is complete. All active API, worker, SMTP, database and operational logic runs in Python. The React frontend remains TypeScript. Express, Prisma and the old Node backend dependencies are removed from the active workspace. The previous implementation is preserved in `.local/legacy-typescript-backend` and excluded from execution and checks.

## Verification on 2 October 2026

- Python unit tests: **34 passed**, covering URL/configuration validation, IP policy, mixed DNS answers, pinned resolution, thresholds, bounded retries and legacy bcrypt compatibility.
- Disposable PostgreSQL integration tests: **24 passed**, covering auth, token digests, Origin/CSRF/body limits, tenant isolation, CRUD, pagination, UTC analytics, passive dashboard reads, real HTTP, expected statuses, redirects, timeout/disconnect, hostname preservation, parallel claims, stale leases, paused/configuration fencing, incident transitions, SMTP acceptance/rejection, password reset, outbox retry/crash recovery, public privacy and legacy database adoption. Adoption tests preserve an existing user, session, monitor and observation and reject a tampered migration checksum.
- Frontend form tests: **5 passed**.
- Desktop/mobile Playwright journeys: **4 passed** against the Python API and Python worker. Registration, actual worker checks, monitor CRUD/pause/resume, public-page lifecycle, filters, theme and mobile navigation passed. A stale test assumption about six demo fixtures was corrected to use actual workspace counts; existing customized data was preserved.
- Python mypy and Ruff checks and frontend TypeScript/ESLint checks passed.
- Production frontend build passed; routes load on demand and the largest JavaScript chunks remain under 500 kB before gzip. Existing harmless third-party Zod annotation warnings remain.
- npm audit: **zero known vulnerabilities**. Python pip-audit: **no known vulnerabilities** in external dependencies; the local application package is unpublished and correctly skipped.
- Existing development PostgreSQL schema was verified and adopted by Alembic. Re-running migrations is idempotent; the seed preserves existing data. Current users, sessions, monitor history and public pages remain in the same database.
- API health/readiness returned 200 with PostgreSQL and Python worker healthy. Independent verification observed a new persisted check without browser/API requests. After running the worker with outbound network access, the existing Bittrif Web monitor recorded **HTTP 200 / UP**.
- Source formatting uses Prettier for frontend/config/docs and Ruff for Python.
- Services remain running at **http://localhost:5173**, API port 3001, mock target 4005 and PostgreSQL 54329. The API and worker run Python; Vite serves the frontend.

## Environment and operating limits

Python was not preinstalled. A workspace-local Python 3.13.16 runtime and `.venv` were installed with uv, and dependencies are recorded in uv.lock and hash-locked production requirements.txt. The local PostgreSQL server is a real native PostgreSQL 18 instance; Compose uses PostgreSQL 17. Windows sandbox restrictions required elevated tool execution for native PostgreSQL, Vite/esbuild, Chromium and the worker's public outbound requests. The supplied commands run normally from a regular user terminal.

Docker is unavailable on this host, so actual Docker/Compose image execution remains untested. Python image definitions, one-shot Alembic migrations, independent services and health checks are provided. SMTP was tested with a real local SMTP server; provider credentials and inbox placement require operator verification. The in-app browser runtime has no browsers; Playwright verified desktop/mobile flows. No manual in-app visual inspection is claimed.

An automatic approval review rejected irreversible deletion of the previous source/history. Archiving it intact completed the migration reversibly. PostgreSQL was restarted with the Python launcher and recovered normally; no development database was reset or reseeded.

SMTP cannot guarantee exactly-once inbox delivery across a crash after acceptance. API rate limits are per process; use shared ingress limits for multiple replicas. Large installations need analytics rollups and batched retention cleanup. Production backups, HTTPS, network egress controls and external SMTP verification remain operational responsibilities. Billing, teams, maintenance notices and multiple monitoring regions are outside this MVP.
