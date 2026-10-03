import { test, expect, type Page } from '@playwright/test';

const longToken = 'longidentifier'.repeat(9);
const longName =
  `Customer website ${longToken} ${'with an unusually long service name '.repeat(3)}`.trim();
const checkedAt = new Date().toISOString();
const analytics = {
  uptime: 98.15,
  totalChecks: 123456,
  averageResponseMs: 1234,
  latestResponseMs: 1234,
  minResponseMs: 1200,
  maxResponseMs: 1500,
  totalIncidents: 1,
  downtimeMs: 120000,
  since: checkedAt,
  until: checkedAt,
  chart: [],
  daily: [],
};
const monitor = {
  id: 'layout-monitor',
  name: longName,
  url: `https://${longToken}.example.com/${longToken}`,
  method: 'GET',
  intervalSeconds: 60,
  timeoutMs: 10000,
  expectedStatusCodes: [200],
  failureThreshold: 2,
  recoveryThreshold: 2,
  isActive: true,
  currentStatus: 'UP',
  lastCheckedAt: checkedAt,
  createdAt: checkedAt,
  latestCheck: { responseTimeMs: 1234 },
  analytics,
};
const incident = {
  id: 'layout-incident',
  monitorId: monitor.id,
  monitor: { id: monitor.id, name: longName },
  startedAt: checkedAt,
  resolvedAt: checkedAt,
  cause: `Unexpected response from ${longToken}`,
  status: 'RESOLVED',
  deliveries: [],
};
const statusPage = {
  id: 'layout-page',
  name: longName,
  slug: longToken,
  isPublic: true,
  monitors: [{ monitorId: monitor.id }],
};
const website = {
  id: 'layout-website',
  name: longName,
  url: monitor.url,
  emailEnabled: true,
  accountEmailEnabled: true,
  overallStatus: 'DEGRADED',
  totalPages: 2,
  activePages: 2,
  up: 1,
  down: 1,
  pending: 0,
  paused: 0,
  failedPages: [{ id: 'layout-failed-page', name: longName, url: monitor.url }],
  pages: [monitor, { ...monitor, id: 'layout-failed-page', currentStatus: 'DOWN' }],
  createdAt: checkedAt,
};
const paginated = (items: unknown[]) => ({ items, total: items.length, page: 1, limit: 10 });

async function useLongContent(page: Page) {
  // Read-only browser fixtures exercise long content without changing the user's data.
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const responses: Record<string, unknown> = {
      '/auth/me': {
        user: {
          id: 'layout-user',
          name: longName,
          email: `${longToken}@example.com`,
          isDemo: false,
          createdAt: checkedAt,
        },
        csrfToken: 'layout-only',
      },
      '/overview': {
        total: 1,
        up: 1,
        down: 0,
        paused: 0,
        pending: 0,
        uptime: 98.15,
        averageResponseMs: 1234,
        totalChecks: 123456,
        recentIncidents: [incident],
        chart: [],
        workerHealthy: true,
        websites: [website],
      },
      '/websites': { items: [website] },
      '/websites/layout-website': website,
      '/monitors': paginated([monitor]),
      '/monitors/options': { items: [monitor] },
      '/monitors/layout-monitor': monitor,
      '/monitors/layout-monitor/analytics': analytics,
      '/monitors/layout-monitor/checks': paginated([
        {
          id: 'layout-check',
          checkedAt,
          resultStatus: 'UP',
          httpStatusCode: 200,
          responseTimeMs: 1234,
          errorType: null,
          sanitizedErrorMessage: null,
        },
      ]),
      '/monitors/layout-monitor/incidents': paginated([incident]),
      '/incidents': paginated([incident]),
      '/incidents/layout-incident': incident,
      '/status-pages': { items: [statusPage] },
      '/notifications/preferences': { preferences: [], smtpConfigured: false },
      '/notifications/deliveries': paginated([]),
      '/public/status/layout-status': {
        name: longName,
        slug: statusPage.slug,
        components: [
          {
            name: longName,
            currentStatus: 'UP',
            lastCheckedAt: checkedAt,
            incidents: [incident],
            uptime: 98.15,
            daily: [],
          },
        ],
      },
    };
    await route.fulfill({ status: path in responses ? 200 : 404, json: responses[path] ?? {} });
  });
}

async function expectContainedContent(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const overflowingText = await page.locator('.website-main').evaluate((main) => {
    const problems: string[] = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      // Dense check/delivery tables intentionally scroll inside their own wrapper.
      if (!parent || parent.closest('.data-table, svg')) continue;
      const card = parent.closest(
        '.panel, .website-group-card, .website-down-banner, .website-live-card, .website-status-card, .feature-art, .visual-caption, .smtp-banner',
      );
      if (!card) continue;
      const bounds = card.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (
          rect.width &&
          rect.height &&
          (rect.left < bounds.left - 2 || rect.right > bounds.right + 2)
        ) {
          problems.push(node.textContent.trim().slice(0, 80));
          break;
        }
      }
    }
    return problems;
  });
  expect(overflowingText).toEqual([]);
}

for (const width of [320, 390, 600]) {
  test(`mobile cards contain long text at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile');
    await page.setViewportSize({ width, height: 844 });
    await useLongContent(page);
    const screens = [
      ['/', 'Your website. On our radar.'],
      ['/overview', 'Overview.'],
      ['/websites', 'Websites.'],
      ['/websites/layout-website', longName],
      ['/monitors', 'Monitors.'],
      ['/monitors/layout-monitor', longName],
      ['/incidents', 'Incidents.'],
      ['/incidents/layout-incident', longName],
      ['/status-pages', 'Status pages.'],
      ['/notifications', 'Notifications.'],
      ['/settings', 'Settings.'],
      ['/status/layout-status', longName],
    ];
    for (const [url, heading] of screens) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
      await expectContainedContent(page);
      if (url === '/websites/layout-website')
        await page.screenshot({
          path: testInfo.outputPath(`website-long-content-${width}.png`),
          fullPage: true,
        });
      if (url === '/monitors') {
        const filters = page.getByRole('group', { name: 'Filter monitor status' });
        expect(
          await filters.evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true);
        await expect(page.getByLabel(`Actions for ${longName}`)).toBeVisible();
        const identity = await page.locator('.monitor-table .monitor-identity').boundingBox();
        const actions = await page.getByLabel(`Actions for ${longName}`).boundingBox();
        expect(identity).not.toBeNull();
        expect(actions).not.toBeNull();
        expect(identity!.x + identity!.width).toBeLessThanOrEqual(actions!.x);
        const title = page.getByRole('heading', { name: 'Monitors.', exact: true });
        expect(
          await title.evaluate(
            (element) => element.clientHeight / parseFloat(getComputedStyle(element).lineHeight),
          ),
        ).toBeLessThan(1.2);
        await page.screenshot({ path: testInfo.outputPath('mobile-monitors.png'), fullPage: true });
        await page.getByRole('button', { name: 'Grid view' }).click();
        await expectContainedContent(page);
      }
    }
  });
}
