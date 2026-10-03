import { useEffect } from 'react';

export const ORIGIN_TOKEN = '__ALIVERADAR_ORIGIN__';
export const socialImage = '/brand/aliveradar-mark.png';
export const publicPages = ['/', '/overview'] as const;
export type Metadata = {
  title: string;
  description: string;
  indexable: boolean;
  notFound?: boolean;
};
export const pages: Record<string, Metadata> = {
  '/': {
    title: 'Website Uptime Monitoring & Page Alerts | AliveRadar',
    description:
      'Monitor every URL of your website with AliveRadar. Track page uptime and response times, spot failed pages, get email alerts and share public status pages.',
    indexable: true,
  },
  '/overview': {
    title: 'Website Monitoring Features & Email Alerts | AliveRadar',
    description:
      'Explore AliveRadar website monitoring: independent URL checks, UP, DEGRADED and DOWN health, page incident history, email alerts and public status pages.',
    indexable: true,
  },
  ...Object.fromEntries(
    [
      ['/login', 'Sign in'],
      ['/register', 'Create an account'],
      ['/login/otp', 'Verify your sign-in code'],
      ['/register/otp', 'Verify your email'],
      ['/forgot-password', 'Reset your password'],
      ['/reset-password', 'Choose a new password'],
      ['/websites', 'Your websites'],
      ['/monitors', 'Your monitors'],
      ['/incidents', 'Your incidents'],
      ['/status-pages', 'Your status pages'],
      ['/notifications', 'Email notifications'],
      ['/settings', 'Account settings'],
    ].map(([path, title]) => [
      path,
      {
        title: `${title} | AliveRadar`,
        description: 'Secure access to your AliveRadar account and website monitoring.',
        indexable: false,
      },
    ]),
  ),
};
export const dynamicPages = [
  { pattern: '^/websites/[A-Za-z0-9_-]+$', title: 'Website details' },
  { pattern: '^/monitors/[A-Za-z0-9_-]+$', title: 'Monitor details' },
  { pattern: '^/incidents/[A-Za-z0-9_-]+$', title: 'Incident details' },
  { pattern: '^/status/[a-z0-9-]+$', title: 'Live service status' },
];
export const notFound: Metadata = {
  title: 'Page Not Found | AliveRadar',
  description: 'This page could not be found. Return to AliveRadar to explore website monitoring.',
  indexable: false,
  notFound: true,
};

export function pageMetadata(path: string): Metadata {
  const normalized = path === '/' ? path : path.replace(/\/$/, '');
  const page = pages[normalized];
  if (page) return page;
  const dynamic = dynamicPages.find(({ pattern }) => new RegExp(pattern).test(normalized));
  return dynamic
    ? {
        title: `${dynamic.title} | AliveRadar`,
        description: 'Website availability and incident information on AliveRadar.',
        indexable: false,
      }
    : notFound;
}

export function structuredData(path: string, origin: string) {
  if (!publicPages.includes(path as (typeof publicPages)[number])) return null;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'AliveRadar',
        url: `${origin}/`,
        logo: { '@type': 'ImageObject', url: `${origin}${socialImage}` },
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: 'AliveRadar',
        url: `${origin}/`,
        inLanguage: 'en',
        publisher: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'WebPage',
        '@id': `${origin}${path}#webpage`,
        url: `${origin}${path}`,
        name: pages[path].title,
        description: pages[path].description,
        inLanguage: 'en',
        isPartOf: { '@id': `${origin}/#website` },
      },
      ...(path === '/overview'
        ? [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'Website monitoring features',
                  item: `${origin}/overview`,
                },
              ],
            },
          ]
        : []),
    ],
  };
}

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
    document.head.append(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
}

export function updateSeo(path: string, signedIn = false) {
  const metadata = pageMetadata(path);
  const normalized = path === '/' ? path : path.replace(/\/$/, '');
  const configured = document.querySelector<HTMLMetaElement>(
    'meta[name="aliveradar-origin"]',
  )?.content;
  const origin =
    configured?.startsWith('https://') || configured?.startsWith('http://')
      ? configured
      : window.location.origin;
  const enabled =
    document.querySelector<HTMLMetaElement>('meta[name="aliveradar-indexable"]')?.content ===
    'true';
  const indexable = enabled && metadata.indexable && !(signedIn && normalized === '/overview');
  document.title = metadata.title;
  setMeta('meta[name="description"]', { name: 'description', content: metadata.description });
  setMeta('meta[name="robots"]', {
    name: 'robots',
    content: indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow',
  });
  ['og:title', 'twitter:title'].forEach((name) =>
    setMeta(`meta[${name.startsWith('og:') ? 'property' : 'name'}="${name}"]`, {
      [name.startsWith('og:') ? 'property' : 'name']: name,
      content: metadata.title,
    }),
  );
  ['og:description', 'twitter:description'].forEach((name) =>
    setMeta(`meta[${name.startsWith('og:') ? 'property' : 'name'}="${name}"]`, {
      [name.startsWith('og:') ? 'property' : 'name']: name,
      content: metadata.description,
    }),
  );
  setMeta('meta[property="og:image"]', {
    property: 'og:image',
    content: `${origin}${socialImage}`,
  });
  setMeta('meta[name="twitter:image"]', {
    name: 'twitter:image',
    content: `${origin}${socialImage}`,
  });
  if (metadata.notFound) {
    document.querySelector('link[rel="canonical"]')?.remove();
    document.querySelector('meta[property="og:url"]')?.remove();
  } else {
    setMeta('link[rel="canonical"]', { rel: 'canonical', href: `${origin}${normalized}` });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: `${origin}${normalized}` });
  }
  let schema = document.getElementById('site-schema');
  const data = structuredData(normalized, origin);
  if (!data) schema?.remove();
  else {
    if (!schema) {
      schema = document.createElement('script');
      schema.id = 'site-schema';
      schema.setAttribute('type', 'application/ld+json');
      document.head.append(schema);
    }
    schema.textContent = JSON.stringify(data);
  }
}

export function useSeo(path: string, signedIn: boolean) {
  useEffect(() => updateSeo(path, signedIn), [path, signedIn]);
}
