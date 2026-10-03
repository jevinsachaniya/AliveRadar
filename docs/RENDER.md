# Deploy AliveRadar on Render

Use the repository's [render.yaml](../render.yaml) Blueprint. It creates three resources in Singapore:

| Resource            | Purpose                                                            | Compute plan |
| ------------------- | ------------------------------------------------------------------ | ------------ |
| `aliveradar-web`    | Compiled React website and Python FastAPI on one HTTPS origin      | `0.5c-512mb` |
| `aliveradar-worker` | Continuous URL checks, incident handling, queued email and cleanup | `0.5c-512mb` |
| `aliveradar-db`     | Private managed PostgreSQL 18 with 5 GB storage                    | `0.1c-256mb` |

These are paid resources. Review the cost shown by Render before creating the Blueprint. Render Free web services block SMTP ports 25, 465 and 587 and sleep after inactivity; Free Postgres expires after 30 days. The existing Brevo SMTP OTP system therefore requires a paid web service. The monitoring worker must stay running. See [Render Free limits](https://render.com/docs/free) and [Blueprint options](https://render.com/docs/blueprint-spec).

## 1. Push the project to GitHub

Upload the complete project, including `render.yaml`, `infra/render.Dockerfile`, `package-lock.json`, `requirements.txt`, `backend/migrations`, `backend/assets`, `alembic.ini`, `apps/web` and `packages/shared`. Keep the repository root as the build context; do not set Root Directory to `apps/web` or `backend`.

Keep `.env`, `.local`, `.venv`, database files and credentials out of Git. The Docker build copies specific application paths and excludes `.env`. Local development and Docker Compose remain supported, but their localhost database URL and the Nginx `api:3001` hostname do not belong in the Render configuration.

## 2. Create a Blueprint

In Render choose **New > Blueprint**, connect the GitHub repository, select the intended branch and use the root `render.yaml`. Render loads the database, web service and background worker configuration from this file.

Enter the three requested environment values:

| Field       | Value                                                                             |
| ----------- | --------------------------------------------------------------------------------- |
| `SMTP_USER` | Your Brevo **SMTP login** from the local configuration                            |
| `SMTP_PASS` | Your Brevo **SMTP key**, not an HTTP API key                                      |
| `SMTP_FROM` | `AliveRadar <jevinsachaniya1@gmail.com>` if this sender remains verified in Brevo |

Do not paste a whole `.env` file into Render. The Blueprint already supplies `NODE_ENV=production`, the internal database URL, HTTPS `APP_ORIGIN`, a generated persistent `AUTH_OTP_SECRET`, Brevo port 587 with verified STARTTLS, and an empty `DEV_MOCK_ORIGIN`. It shares the email credentials, origin and OTP secret with the worker. The runtime listens on `0.0.0.0:10000`; `PORT` remains configurable.

`APP_ORIGIN` initially references Render's assigned `RENDER_EXTERNAL_URL`, so no guessed hostname is required. Keep the generated OTP secret stable across releases. Never use the local PostgreSQL URL or enable development mock exceptions in production.

## 3. Let both services deploy

Both use `infra/render.Dockerfile`, which builds React with Node 24, installs hash-pinned production dependencies on Python 3.13, bundles the website and email logo, and starts a non-root Python process. No npm development server, Nginx Compose service or local database launcher runs in production.

Before either service starts, Render runs:

```sh
python -m backend.cli release
```

This checks production settings and email configuration, applies Alembic migrations and verifies the current schema. Migration jobs serialize with a PostgreSQL advisory lock, so the API and worker can both run the command safely. Invalid configuration or failed migrations stop that service's release. The command does not send email or seed demo data.

The web health check is `/health/database`, which verifies database connectivity without depending on worker startup. The exact Alembic revision is checked by the pre-deploy release command, so compatible rolling migrations do not mark the previous instance unhealthy. `/ready` additionally requires a recent worker heartbeat. Each service receives up to 60 seconds to shut down; the API's request shutdown timeout is 40 seconds.

Automatic deploys are initially off. For later releases, push the changes, sync the Blueprint when infrastructure/environment references change, and manually deploy **both** services from the same commit. Keep future migrations compatible with rolling releases; do not change baseline SQL or reset the production database. Enable automatic deploys after a test-gated release workflow is in place.

## 4. Verify the deployed site

Open the web service's assigned HTTPS URL:

- `/` and `/overview` must work without login, including a browser refresh.
- `/health` should return `status: ok`.
- `/health/database` should return HTTP 200 with `database: true`.
- `/ready` should return HTTP 200 with `database: true` and `worker: true` once the worker has started. Check worker logs if it continues returning 503.
- Register using an email you control, receive the OTP, and verify on `/register/otp`. Then test password plus OTP login on `/login/otp`.
- Add a real public website and multiple page URLs. Checks should continue with the browser closed. Verify named-page failures and website UP/DEGRADED/DOWN state.
- Test one outage and recovery with website and account email preferences enabled. Confirm delivery and the inline AliveRadar logo. Provider acceptance alone does not prove inbox delivery.

The frontend calls `/api/v1` on the same origin. The backend protects account APIs; serving the static application never grants a session. Static files and health probes do not query session cookies or consume API rate limits. Hashed assets are immutable; HTML is revalidated so a release picks up the new bundle. Missing assets, unknown API endpoints and hidden files return 404. Unknown website routes show a real HTML 404 page.

Public homepage and overview content is pre-rendered for search engines. The Blueprint enables production indexing with `SEO_INDEXABLE=true`; previews should set it to false. Canonical URLs, social previews and `/sitemap.xml` use `APP_ORIGIN`. After connecting the domain, verify Search Console ownership and submit the sitemap. See [SEO setup](SEO.md).

`FORWARDED_ALLOW_IPS` trusts loopback and private-network proxy ranges for Render's ingress, rather than arbitrary public proxies. If a networking change alters the proxy addresses, update the trusted ranges. Confirm separate users do not share one proxy IP for rate limiting before scaling. The application uses one API process initially; rate limits are per process and each API/worker process has a bounded database pool.

## 5. Connect the AliveRadar domain later

When you have purchased the domain, add it under the web service's **Settings > Custom Domains**, apply Render's DNS records and wait for HTTPS verification. Only use the exact domain you own; these instructions do not assume which extension you will buy.

In `render.yaml`, replace the web service's `APP_ORIGIN` reference with the canonical HTTPS origin, for example:

```yaml
- key: APP_ORIGIN
  value: https://aliveradar.com
```

Remove that entry's `fromService` block. Keep the worker's reference to `aliveradar-web`'s `APP_ORIGIN`. Sync the Blueprint and redeploy both services so email action links and origin checks use the same domain. `RENDER_EXTERNAL_URL` remains the `onrender.com` URL; attaching a custom domain does not change it. Do not include a trailing slash or path.

Use the canonical domain for login and monitoring. Redirect secondary domains to it, or disable the Render subdomain using `renderSubdomainPolicy: disabled` after the custom domain works. Requests that submit authentication from a different origin are intentionally rejected.

## Troubleshooting

| Symptom                                      | Check                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Image build cannot find package files        | Keep Root Directory empty and Docker Context `.`; use `infra/render.Dockerfile`                                              |
| Nginx says `host not found in upstream api`  | The root Dockerfile's Nginx target is for Compose; use the Render Dockerfile                                                 |
| Release rejects HTTPS/OTP configuration      | Use Blueprint values; keep `APP_ORIGIN` exact and `AUTH_OTP_SECRET` at least 32 characters                                   |
| Release rejects email configuration          | Fill all three requested Brevo values and verify the sender                                                                  |
| OTP email fails or SMTP times out            | Use paid web compute, SMTP login/key, verified sender and port 587 with `SMTP_SECURE=false`; inspect Brevo delivery activity |
| Database connection fails                    | API, worker and database must share the same region and use the internal `fromDatabase` URL                                  |
| `/health/database` is 503                    | Read pre-deploy logs and fix the migration/database issue; do not seed or drop data                                          |
| `/ready` is 503 while database health is 200 | Check that the worker deployed, has the shared env values and is updating its heartbeat                                      |
| Browser says origin is not allowed           | Browse the configured canonical origin and redeploy both services after changing it                                          |
| Old interface after a deploy                 | Refresh; verify the HTML references the current hashed assets and that both services use the intended commit                 |

Render creates a new empty database. Existing local users and monitoring history are not copied automatically. If you need them, back up and restore into the production database using a planned migration before accepting new production writes. Do not use a local database as the production service. Keep external database access blocked, configure backups and rehearse restoring them. Upgrade database storage/compute and worker capacity as monitor volume grows.

The configuration can be tested locally, but a successful image build, Render provisioning, DNS and Brevo delivery must still be verified on the actual deployed services. See [general deployment and operations](DEPLOYMENT.md).
