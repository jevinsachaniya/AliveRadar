# Website redesign

Requested change: present AliveRadar as a website rather than a SaaS dashboard.

## AliveRadar branding

The website uses **AliveRadar** with the tagline **“Every page, on your radar.”** The supplied A/R radar artwork, adapted to forest green and soft lime with a transparent background, appears in the shared logo, favicon and homepage illustration. See [logo asset and prompt](BRAND_LOGO.md). Homepage, authentication, footer, public status-page attribution, page metadata, API documentation and email content use the same name. Copy explains multiple named URLs, independent page checks, overall website health, failed page names and outage/recovery email alerts.

The domain extension has not been supplied. Production origins and canonical URLs should use the purchased domain after it is confirmed; local URLs remain usable. The email sender display name is AliveRadar and retains the existing verified sender address.

## Direction and references

Reviewed the public homepages of [UptimeRobot](https://uptimerobot.com/), [StatusCake](https://www.statuscake.com/) and [Better Stack uptime](https://betterstack.com/uptime) for website navigation, hero sections, explanatory content and status-page presentation. Chrome control was unavailable in this session; reference pages were read through web browsing. The implementation uses original text, Lucide icons and code-drawn visuals, with no copied screenshots, unsupported feature claims, pricing, testimonials or invented customer counts.

## Implementation

- A public homepage at `/` with an editorial hero, website-watch illustration, live authenticated service observations, setup steps, status-page explanation, accessible questions and a final monitoring action.
- A shared top navigation and website footer replace the sidebar and workspace switcher. Account, notifications, theme and keyboard search remain available. Mobile navigation closes on navigation, including the current page, and Escape.
- Warm paper surfaces, forest-green typography and lime accents replace the purple dashboard theme. Management pages, forms, dialogs, account screens and public status pages share the design, including dark mode.
- Guests can browse the homepage, public feature `/overview`, how-it-works and FAQ. Header/footer feature links stay public. Start monitoring and Add Website require login; separate `/login/otp` and `/register/otp` pages verify email, then return users to the requested monitoring action. Authenticated `/overview` shows the account's actual observations. Public browsing remains available during an auth outage and makes no private data requests. Published status pages remain public. Illustrations are labeled and live status uses actual API data.
- Monitor management, analytics, incidents, notifications, public page publishing and authentication continue using the Python backend. Existing monitoring data is preserved.
- Responsive layouts, reduced-motion support, keyboard focus, a skip link and semantic content sections are included. Page metadata and favicon match the new design.

## Verification

Frontend type checks, ESLint and production build; existing form tests; desktop/mobile Playwright journeys covering registration, actual worker observations, monitor/page lifecycle, themes, filters and mobile navigation; new public-homepage, questions and overflow checks. Test-generated screenshots are inspected for desktop and mobile layout. Final results are recorded in PROGRESS.md.
