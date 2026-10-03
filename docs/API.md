# API usage

The REST API is versioned at `/api/v1`. Swagger UI is at `/api/docs`, and `/api/v1/openapi.json` exposes request schemas and route descriptions. The error shape is `{ "error": { "message": "...", "details": [{ "field": "url", "message": "..." }] } }`; details are optional. Errors never expose stack traces or database queries.

Register/login respond with `{ user, csrfToken }` and an HttpOnly session cookie. Send the cookie for private requests. Use `/auth/me` to restore the authenticated user and CSRF token after refresh. Every state-changing request must send `Origin` equal to APP_ORIGIN. Authenticated writes also require `X-CSRF-Token`. Tokens belong in memory; do not persist them in localStorage. The UI stores only its theme preference there.

Monitors support name, url, GET/HEAD method, intervalSeconds (30–86400), timeoutMs (1000–30000), expectedStatusCodes, failureThreshold, recoveryThreshold, and isActive. POST creates; PATCH accepts partial input; pause/resume are explicit POST operations; DELETE cascades related records. GET monitor lists accept page, limit (1–100), search, status, sort (name/createdAt/lastCheckedAt), and order (asc/desc). Responses have `{ items, total, page, limit }` and each item includes latestCheck and 24-hour analytics. Private URLs are visible only to the owner.

Checks and incidents are paginated. Analytics supports `days=1`, `7`, or `30` and returns observed uptime, counts, response statistics, incident count, clipped downtime, UTC boundaries, chart aggregates, and daily history. `/overview?days=1` supports the same windows for workspace metrics. Requests never trigger monitor checks.

Website groups expose these private endpoints:

| Method | Path            | Behavior                                                         |
| ------ | --------------- | ---------------------------------------------------------------- |
| GET    | `/websites`     | `{ items }` with owned website summaries and named pages         |
| POST   | `/websites`     | Create a website and 1–50 independent page monitors atomically   |
| GET    | `/websites/:id` | Website status, counts, failed page names/URLs and page monitors |
| PATCH  | `/websites/:id` | Update `name` and `emailEnabled`                                 |
| DELETE | `/websites/:id` | Permanently remove the website, monitors and related history     |

Creation accepts `name`, `url`, `pages: [{ name, url }]`, `emailEnabled` (default false), `intervalSeconds` (default 60), `failureThreshold` (default 2), and `recoveryThreshold` (default 1). Page paths resolve against the canonical website origin. All pages must have the same protocol, hostname and port, without credentials or fragments. Repeated URLs return 400; an existing website origin for the account returns 409. Ownership failures return 404. A composite foreign key enforces website/page account ownership in PostgreSQL.

`overallStatus` is UP for all active pages up, DEGRADED for some down, DOWN for all down, or null for waiting/empty/fully paused groups. Paused pages are excluded. `failedPages` lists active DOWN pages. `/overview` also includes `websites` summaries. Monitor creation accepts an optional `websiteId`; without it, matching origins join an account's existing group or create one. URL edits preserve the monitor ID and history while updating group membership as needed.

Notification preferences support a global record (`monitorId: null`) and optional monitor-specific overrides. EmailEnabled, outageNotifications, and recoveryNotifications are booleans. A monitor override takes precedence over the global preference; the website email switch also gates all its page alerts. Enabling a website's emails also enables global outage/recovery notifications. The UI manages global defaults; overrides are available through the API. Preference reads include `emailConfigured`, `emailProvider` (brevo/smtp/null), `emailConfigurationIssue` (a safe configuration message or null), and the legacy `smtpConfigured` flag. Provider credentials remain server-side. Delivery history records status, attempts, and provider-accepted timestamps. Without configured email delivery, events stay pending and monitoring continues.

Status-page POST/PATCH accept name, unique slug, isPublic, and monitorIds owned by the caller. PATCH replaces component assignments. Unpublishing makes the public route return 404. `/public/status/:slug` is read-only and returns only public component fields. `/health` and `/ready` are outside the version prefix.

The UI intentionally omits maintenance notices, billing, team roles, webhook channels, custom request credentials, redirects, custom ports, and internal network monitoring from this MVP.
