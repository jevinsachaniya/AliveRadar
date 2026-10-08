# AliveRadar SEO

## Sitemap and robots files for aliveradar.com

The generated files are [robots.txt](../apps/web/public/robots.txt) and [sitemap.xml](../apps/web/public/sitemap.xml). Vite copies them to the website root during builds. The sitemap contains six public canonical pages: `/`, `/overview`, `/about`, `/contact`, `/blog`, and `/blog/devsload-com`. Login, OTP, account data and user status pages remain excluded. Account HTML also carries `noindex`. Robots allows crawlers to read public pages and their rendering resources while excluding API and health endpoints.

Regenerate the files after changing the canonical domain or public route list:

```sh
npm run seo:files -- --origin https://aliveradar.com --indexable
```

The command generates UTF-8 files using the same rules as the backend routes. It does not connect to the database, send email or change `.env`. Without explicit options, it uses `APP_ORIGIN` and the current production indexing policy. Use `--no-indexable` for a preview export: robots blocks crawling and the sitemap is empty. `--output-directory` optionally changes the export folder.

For the actual production domain, configure `APP_ORIGIN=https://aliveradar.com`, `NODE_ENV=production` and `SEO_INDEXABLE=true`, then rebuild/deploy after the domain is connected. The Python routes at `/robots.txt` and `/sitemap.xml` take precedence over exported static files and use these runtime settings, so local and Render test installs keep their own origin and noindex policy. Do not enable production indexing on the temporary Render test site.

After deployment, verify `https://aliveradar.com/robots.txt` and `https://aliveradar.com/sitemap.xml`, then submit the sitemap in Search Console. Only canonical public URLs are included, following [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). No estimated modification dates, priorities or change frequencies are added.

## Existing page SEO

Production builds pre-render the public homepage, feature overview, About, Contact, blog landing and published blog article pages from the actual React components. Crawlers and visitors receive headings, feature text, links and native FAQ answers before JavaScript runs. React hydrates that HTML for interaction. This follows [Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

| Pages                                                                 | Search behavior                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| `/`, `/overview`, `/about`, `/contact`, `/blog`, `/blog/devsload-com` | Indexable in production; included in sitemap             |
| Login, register, OTP, password reset and account routes               | Noindex; excluded from sitemap                           |
| User-published `/status/:slug`                                        | Publicly shareable; excluded from marketing search index |
| Unknown website routes                                                | HTTP 404, recovery page, noindex and no canonical        |
| API and health endpoints                                              | `X-Robots-Tag: noindex, nofollow`                        |

Public pages have unique titles/descriptions, canonicals, Open Graph/Twitter previews using the AliveRadar logo, and Organization/WebSite/WebPage JSON-LD. The homepage also provides FAQPage markup, while non-home public pages include breadcrumbs. Browser navigation updates metadata without duplicates. Authentication protects account data; indexing rules do not provide access control.

Canonical URLs, sitemap entries, structured data and social images use **`APP_ORIGIN`** at runtime. Query strings/fragments stay out of canonicals. `/overview/` redirects permanently to `/overview`; `/index.html` redirects to `/`. Public HTML supports ETag revalidation, hashed assets use immutable caching, and the Python frontend server compresses content. Account dialogs, validation and charts stay in separate chunks. Existing mobile layouts, semantic landmarks, skip links, image dimensions and native FAQ remain supported.

## Configuration

- `NODE_ENV=production` is required for indexing.
- `APP_ORIGIN` is the exact canonical HTTPS origin, without a trailing slash.
- `SEO_INDEXABLE=true` enables the production public pages; use `false` for previews/staging.
- `WEB_DIST_DIR=/app/dist/web` selects the compiled website in deployment images.

Local development remains excluded. The example local environment sets `SEO_INDEXABLE=false`; manually deploying from it requires enabling indexing. Render's Blueprint sets the production value separately. When disabled, pages use noindex, robots disallows crawling and the sitemap is empty.

Production `robots.txt` permits crawling, including CSS/JavaScript, links to `/sitemap.xml`, and excludes API and health endpoints. Account pages remain crawlable so their noindex directives can be read. The XML sitemap lists the six public canonical URLs. See [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) and [noindex rules](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

## Deploy and verify

1. Run `npm run build` and ship all of `dist/web`, including hidden `.prerender` files and `.seo.json`. Docker copies them automatically; release rejects missing SEO output.
2. Follow [Render deployment](RENDER.md). Compose's API also includes the compiled website; Nginx serves hashed assets and proxies pages to Python for runtime metadata.
3. Set production `APP_ORIGIN` to the AliveRadar domain you purchase and `SEO_INDEXABLE=true`. Update the worker origin for email links. Redirect secondary hostnames or disable the Render subdomain after custom-domain verification.
4. View source or disable JavaScript on all public pages: verify content, one canonical, unique metadata, JSON-LD, absolute preview-image URLs and index directives. Check robots, sitemap, a real 404 and private-route authentication.
5. Verify ownership in [Google Search Console](https://search.google.com/search-console/about), submit `sitemap.xml`, inspect both URLs and request indexing. These steps need your Google/DNS access and have not been performed by the code change.
6. Run `npm run seo:audit` before deployment to verify prerendered headings, metadata, JSON-LD, sitemap and robots policy. Check PageSpeed Insights on the deployed domain and monitor Search Console indexing and [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals). Field measurements depend on real traffic and hosting.

Edit public React pages and metadata in `apps/web/src/seo.ts`, then rebuild/deploy. New indexable routes need public content, prerender output, metadata and sitemap entries. Release checks ensure public routes and sitemap configuration match.

Technical SEO is configured. Live indexing, social preview caches and rankings must still be checked on the deployed domain.
