import { useEffect } from 'react';

export const ORIGIN_TOKEN = '__ALIVERADAR_ORIGIN__';
export const socialImage = '/brand/aliveradar-mark.png';
export const socialImageAlt = 'AliveRadar logo for website uptime monitoring';
export const publicPages = ['/', '/overview', '/about', '/contact'] as const;
export type Metadata = {
  title: string;
  description: string;
  indexable: boolean;
  notFound?: boolean;
};

export const homeFaqs = [
  [
    'What can I monitor?',
    'Add a website to AliveRadar, group its URLs and give each page a name. Pages are checked independently. See UP, DEGRADED or DOWN for the website, with the exact page names when an outage occurs.',
  ],
  [
    'Does my browser need to stay open?',
    'No. Monitoring continues in the background even when you close this website. Return whenever you want to see the latest observations.',
  ],
  [
    'How is uptime calculated?',
    'Uptime is the percentage of successful observed checks in the selected period. Times without checks remain unknown, rather than being counted as successful.',
  ],
  [
    'Does AliveRadar check SSL certificates or DNS records?',
    'AliveRadar currently focuses on HTTP and HTTPS URL availability, response time and downtime monitoring. Dedicated SSL certificate and DNS record checks are not included.',
  ],
  [
    'Can I share a status page?',
    'Yes. Choose which monitors appear on a status page and publish it. Visitors see service names, availability and incident history; your monitor URLs and account details stay private.',
  ],
  [
    'How do email alerts work?',
    'Enable email alerts for your website and outage and recovery notifications in your account. AliveRadar emails your account address when a page has a confirmed outage and when it recovers, including the page name and URL.',
  ],
] as const;

export const pages: Record<string, Metadata> = {
  '/': {
    title: 'Website Uptime Monitoring, Status & Alerts | AliveRadar',
    description:
      'Monitor website uptime page by page. Check URL availability and response time, receive downtime alerts, and share website status updates with AliveRadar.',
    indexable: true,
  },
  '/overview': {
    title: 'Website Monitoring Features: Uptime, Status & Alerts | AliveRadar',
    description:
      'Explore page-by-page website monitoring: independent uptime checks, website status, response time history, downtime alerts and public status pages.',
    indexable: true,
  },
  '/about': {
    title: 'About AliveRadar | Page-by-Page Website Monitoring',
    description:
      'Learn how AliveRadar helps teams monitor critical URLs, understand website uptime and respond when a page outage affects visitors.',
    indexable: true,
  },
  '/contact': {
    title: 'Contact AliveRadar | Website Monitoring Support',
    description:
      'Contact AliveRadar for help with website uptime monitoring, page status, downtime alerts, product feedback or support.',
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
  const breadcrumbs = {
    '/overview': 'Website monitoring features',
    '/about': 'About AliveRadar',
    '/contact': 'Contact AliveRadar',
  } as const;
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: 'AliveRadar',
      url: `${origin}/`,
      email: 'aliveradar@gmail.com',
      logo: { '@type': 'ImageObject', url: `${origin}${socialImage}` },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'aliveradar@gmail.com',
        availableLanguage: 'en',
      },
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
      about: { '@id': `${origin}/#organization` },
    },
  ];
  const breadcrumbName = breadcrumbs[path as keyof typeof breadcrumbs];
  if (breadcrumbName) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: breadcrumbName, item: `${origin}${path}` },
      ],
    });
  }
  if (path === '/') {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: homeFaqs.map(([name, text]) => ({
        '@type': 'Question',
        name,
        acceptedAnswer: { '@type': 'Answer', text },
      })),
    });
  }
  return {
    '@context': 'https://schema.org',
    '@graph': graph,
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
  setMeta('meta[property="og:image:alt"]', {
    property: 'og:image:alt',
    content: socialImageAlt,
  });
  setMeta('meta[property="og:image:type"]', { property: 'og:image:type', content: 'image/png' });
  setMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'AliveRadar' });
  setMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  setMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'en_US' });
  setMeta('meta[name="twitter:image"]', {
    name: 'twitter:image',
    content: `${origin}${socialImage}`,
  });
  setMeta('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt', content: socialImageAlt });
  setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' });
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
