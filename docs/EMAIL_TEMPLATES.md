# AliveRadar email templates

Outage, recovery, password-reset and email verification messages share the website's forest-green masthead, A/R logo and cream surfaces. Incident emails show named pages, URLs, website health and UTC incident times. Reset emails include the 30-minute expiry, a lime reset action, a fallback link and guidance for an unexpected request. Separate registration and sign-in OTP emails show a prominent six-digit code, five-minute expiry, and a reminder never to share the code. OTP emails are sent directly without persisting plaintext codes in the notification outbox. Generic and previously queued messages keep a branded fallback layout.

`backend/email_templates.py` renders table-based HTML with inline styles, a hidden preview line and links restricted to `APP_ORIGIN`. Dynamic names, URLs, subjects and values are escaped. Each message includes a plain-text alternative. The supplied PNG is attached as an inline MIME image; HTML references its Content-ID, so the logo does not need a public image host or a request to localhost.

The matching logo is bundled in `backend/assets/aliveradar-mark.png`, included by Python package data and the existing Docker server's backend copy. Update both the website and backend asset when replacing the brand image; a test checks they match. API and worker should be restarted after replacing the cached logo or changing their code/configuration.

New notification payloads freeze structured template details with the existing recipient, subject and text on the first attempt. Renames and later status changes do not rewrite a retry's content. Existing frozen records without template data use the fallback HTML without requiring a database migration. Stable Message-ID and the current SMTP retry/acceptance rules remain.

Production buttons use `APP_ORIGIN`; set it to the purchased HTTPS domain when deploying. Local links continue to use the local project origin. Sample HTML, email files and screenshots are in `.local/email-previews/`; their reset tokens and incident IDs are placeholders. No external test email is needed to generate them.

Verification includes MIME logo references and image payloads, plaintext/HTML alternatives, user-content escaping, unsafe/cross-origin action rejection, preserved retry metadata and local SMTP outage/reset delivery. Desktop and mobile sample layouts are checked at 760, 390 and 320 px. These are local rendering and delivery checks, not a claim of testing every inbox client.
