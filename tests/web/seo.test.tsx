import { beforeEach, describe, expect, it } from 'vitest';
import { pageMetadata, structuredData, updateSeo } from '../../apps/web/src/seo';

beforeEach(() => {
  document.head.innerHTML =
    '<meta name="aliveradar-origin" content="https://aliveradar.example"><meta name="aliveradar-indexable" content="true">';
});

describe('public and private route metadata', () => {
  it('updates metadata on navigation and preserves a single canonical', () => {
    updateSeo('/');
    const home = document.title;
    updateSeo('/overview');
    expect(document.title).not.toBe(home);
    expect(document.querySelectorAll('link[rel=canonical]')).toHaveLength(1);
    expect(document.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe(
      'https://aliveradar.example/overview',
    );
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      'https://aliveradar.example/overview',
    );
    expect(document.querySelector('meta[name=robots]')?.getAttribute('content')).toContain(
      'index, follow',
    );
    updateSeo('/register/otp');
    expect(document.querySelector('meta[name=robots]')?.getAttribute('content')).toBe(
      'noindex, follow',
    );
    expect(document.getElementById('site-schema')).toBeNull();
    updateSeo('/overview');
    expect(document.querySelector('meta[name=robots]')?.getAttribute('content')).toContain(
      'index, follow',
    );
  });
  it('keeps account overview and unknown routes out of the index', () => {
    updateSeo('/overview', true);
    expect(document.querySelector('meta[name=robots]')?.getAttribute('content')).toBe(
      'noindex, follow',
    );
    updateSeo('/unknown-address');
    expect(document.title).toBe('Page Not Found | AliveRadar');
    expect(document.querySelector('link[rel=canonical]')).toBeNull();
  });
  it('only defines structured data for the public website pages', () => {
    expect(pageMetadata('/login').indexable).toBe(false);
    expect(pageMetadata('/websites/abc').indexable).toBe(false);
    expect(pageMetadata('/unknown').notFound).toBe(true);
    const schema = structuredData('/overview', 'https://aliveradar.example');
    expect(schema?.['@graph'].map((item) => item['@type'])).toContain('BreadcrumbList');
    expect(JSON.stringify(schema)).not.toContain('aggregateRating');
    expect(structuredData('/settings', 'https://aliveradar.example')).toBeNull();
  });
});
