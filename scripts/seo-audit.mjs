import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'dist/web');
const origin = 'https://aliveradar.com';
const catalog = JSON.parse(await readFile(resolve(output, '.seo.json'), 'utf8'));
const robots = await readFile(resolve(output, 'robots.txt'), 'utf8');
const sitemap = await readFile(resolve(output, 'sitemap.xml'), 'utf8');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const publicPages = catalog.publicPages;
assert(Array.isArray(publicPages) && publicPages.length > 0, 'No public pages are registered.');
assert(new Set(publicPages).size === publicPages.length, 'Public page paths must be unique.');
assert(catalog.socialImage?.startsWith('/'), 'The social image must use a site-relative path.');

const titles = publicPages.map((path) => catalog.pages[path]?.title);
const descriptions = publicPages.map((path) => catalog.pages[path]?.description);
assert(
  titles.every((title) => typeof title === 'string' && title.length >= 20),
  'Each public page needs a descriptive title.',
);
assert(new Set(titles).size === titles.length, 'Public page titles must be unique.');
assert(
  descriptions.every(
    (description) =>
      typeof description === 'string' && description.length >= 70 && description.length <= 180,
  ),
  'Each public page needs a unique, useful 70–180 character description.',
);
assert(
  new Set(descriptions).size === descriptions.length,
  'Public page descriptions must be unique.',
);

for (const path of publicPages) {
  const filename = catalog.prerender?.[path];
  assert(typeof filename === 'string', `${path} is missing prerender output.`);
  if (typeof filename !== 'string') continue;
  const html = await readFile(resolve(output, filename), 'utf8');
  assert((html.match(/<h1\b/gi) ?? []).length === 1, `${path} must have exactly one H1.`);
  assert(
    !/â€”|â€™|Â·/.test(html),
    `${path} contains malformed text encoding that can affect search snippets.`,
  );
  for (const image of html.matchAll(/<img\b[^>]*>/gi))
    assert(/\balt=("[^"]*"|'[^']*')/i.test(image[0]), `${path} has an image without alt text.`);

  const schema = catalog.schemas?.[path];
  const graph = schema?.['@graph'];
  assert(Array.isArray(graph), `${path} is missing JSON-LD.`);
  if (!Array.isArray(graph)) continue;
  const types = new Set(graph.map((entry) => entry['@type']));
  assert(types.has('Organization'), `${path} schema is missing Organization.`);
  assert(types.has('WebSite'), `${path} schema is missing WebSite.`);
  assert(types.has('WebPage'), `${path} schema is missing WebPage.`);
  if (path === '/') assert(types.has('FAQPage'), 'Homepage schema is missing its FAQPage.');
  if (path === '/blog') assert(types.has('Blog'), 'Blog landing schema is missing Blog.');
  if (path === '/blog/devsload-com')
    assert(types.has('Article'), 'Blog post schema is missing Article.');
  if (path !== '/')
    assert(types.has('BreadcrumbList'), `${path} schema is missing BreadcrumbList.`);
}

const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert(
  JSON.stringify(sitemapUrls) === JSON.stringify(publicPages.map((path) => origin + path)),
  'The sitemap must contain each public canonical URL once and no private URL.',
);
assert(robots.includes('Allow: /'), 'robots.txt must allow public content.');
for (const path of ['/api/', '/health', '/health/database', '/ready', '/openapi.json'])
  assert(robots.includes(`Disallow: ${path}`), `robots.txt must exclude ${path}.`);
assert(
  robots.includes(`Sitemap: ${origin}/sitemap.xml`),
  'robots.txt must reference the canonical sitemap.',
);

if (errors.length) {
  console.error('SEO audit failed:\n' + errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `SEO audit passed: ${publicPages.length} canonical public pages, unique metadata, prerendered H1s, JSON-LD, sitemap and robots policy verified.`,
  );
}
