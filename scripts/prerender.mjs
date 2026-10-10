import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const output = resolve(root, 'dist/web');
const temporary = resolve(root, 'dist/seo-build');
if (relative(root, temporary).startsWith(`..${sep}`) || temporary === root)
  throw new Error('Invalid prerender build directory');
await build({
  configFile: false,
  root: resolve(root, 'apps/web'),
  plugins: [react()],
  build: {
    ssr: 'src/prerender.tsx',
    outDir: temporary,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'prerender.mjs' } },
  },
});
try {
  const seo = await import(pathToFileURL(resolve(temporary, 'prerender.mjs')).href);
  const template = await readFile(resolve(output, 'index.html'), 'utf8');
  await mkdir(resolve(output, '.prerender'), { recursive: true });
  const prerender = {};
  for (const [path, filename] of [
    ['/', 'home.html'],
    ['/overview', 'overview.html'],
    ['/about', 'about.html'],
    ['/contact', 'contact.html'],
    ['/ssl-dns-checker', 'ssl-dns-checker.html'],
    ['/blog', 'blog.html'],
    ['/blog/devsload-com', 'devsload-com.html'],
    ['/blog/how-to-check-if-a-website-is-down', 'how-to-check-if-a-website-is-down.html'],
    ['/blog/what-is-website-uptime-monitoring', 'what-is-website-uptime-monitoring.html'],
    ['/blog/how-to-monitor-website-response-time', 'how-to-monitor-website-response-time.html'],
    [
      '/blog/how-to-get-alerts-when-your-website-goes-down',
      'how-to-get-alerts-when-your-website-goes-down.html',
    ],
    ['/not-found', '404.html'],
  ]) {
    const markup = seo.renderPage(path);
    if (!markup.includes('<h1') || markup.includes('<!--$!-->'))
      throw new Error(`Prerender failed for ${path}`);
    const html = template.replace(
      '<div id="root"></div>',
      `<div id="root" data-prerender="true">${markup}</div>`,
    );
    if (!html.includes('data-prerender="true"')) throw new Error('Frontend root template changed');
    await writeFile(resolve(output, '.prerender', filename), html);
    prerender[path] = `.prerender/${filename}`;
  }
  await writeFile(
    resolve(output, '.seo.json'),
    JSON.stringify({
      pages: seo.pages,
      dynamicPages: seo.dynamicPages,
      notFound: seo.notFound,
      publicPages: seo.publicPages,
      socialImage: seo.socialImage,
      prerender,
      schemas: Object.fromEntries(
        seo.publicPages.map((path) => [path, seo.structuredData(path, seo.ORIGIN_TOKEN)]),
      ),
    }),
  );
  console.log('SEO prerender: homepage, overview and 404 generated from the React pages.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
