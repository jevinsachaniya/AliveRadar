import { test, expect } from '@playwright/test';
import { authenticatedPage, completeOtp } from './auth-helpers';
test('register, monitor lifecycle, and published status page', async ({ page }, testInfo) => {
  const slug = `journey-${testInfo.project.name}-${Date.now()}`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Journey Tester');
  await page.getByLabel('Email address').fill(`${slug}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('journey-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await completeOtp(page, `${slug}@example.com`);
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('website-home.png'), fullPage: true });
  await page.screenshot({ path: testInfo.outputPath('website-home-viewport.png') });
  await expect(page.getByRole('heading', { name: 'Meet your first monitor' })).toBeVisible();
  await page.getByRole('button', { name: 'Add monitor', exact: true }).click();
  await page.getByLabel('Monitor name').fill('Journey endpoint');
  await page.getByPlaceholder('https://example.com').fill('http://127.0.0.1:4007/website');
  await page.getByRole('button', { name: 'Create monitor' }).click();
  await page.goto('/monitors');
  await expect(page.getByRole('link', { name: 'Journey endpoint', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Journey endpoint', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Journey endpoint', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '200', exact: true }).first()).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Edit monitor', exact: true }).click();
  await page.getByLabel('Monitor name').fill('Journey updated');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Journey updated', exact: true })).toBeVisible();
  await page.getByLabel('Actions for Journey updated').click();
  await page.getByRole('button', { name: 'Pause monitoring' }).click();
  await expect(page.getByText('Paused', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Actions for Journey updated').click();
  await page.getByRole('button', { name: 'Resume monitoring' }).click();
  await page.goto('/status-pages');
  await page.getByRole('button', { name: 'Create status page', exact: true }).click();
  await page.getByLabel('Page name').fill('Journey status');
  await page.getByLabel('Public slug').fill(slug);
  await page.getByLabel('Journey updated').check();
  await page.getByLabel('Publish this page for anyone with the link').check();
  await page.getByRole('button', { name: 'Save status page' }).click();
  await expect(page.getByRole('heading', { name: 'Journey status' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit page' }).click();
  await page.getByLabel('Page name').fill('Journey published status');
  await page.getByRole('button', { name: 'Save status page' }).click();
  await expect(page.getByRole('heading', { name: 'Journey published status' })).toBeVisible();
  await page.goto(`/status/${slug}`);
  await expect(page.getByRole('heading', { name: 'Journey published status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Journey updated' })).toBeVisible();
  await expect(page.getByText('127.0.0.1:4007')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('website-public-status.png'), fullPage: true });
  await page.goto('/monitors');
  await page.getByLabel('Actions for Journey updated').click();
  await page.getByRole('button', { name: 'Delete monitor', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('heading', { name: 'Meet your first monitor' })).toBeVisible();
  await page.goto('/status-pages');
  await page.getByLabel('Delete Journey published status').click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('heading', { name: 'Your services, out in the open' })).toBeVisible();
  await page.goto('/notifications');
  const emailToggle = page.getByRole('switch', { name: 'Enable email notifications' });
  await emailToggle.click();
  await expect(emailToggle).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(emailToggle).toHaveAttribute('aria-checked', 'true');
  await emailToggle.click();
  await expect(emailToggle).toHaveAttribute('aria-checked', 'false');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email address').fill(`${slug}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('journey-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await completeOtp(page, `${slug}@example.com`, 'login');
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
});
test('authenticated layout, filters, theme, and navigation', async ({ page }, testInfo) => {
  await authenticatedPage(page, true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  await page.goto('/monitors');
  const overviewResponse = await page.request.get('/api/v1/overview');
  expect(overviewResponse.ok()).toBe(true);
  const overview = (await overviewResponse.json()) as { total: number; paused: number };
  await page.getByRole('button', { name: /^Paused \d+$/ }).click();
  if (overview.paused === 0) {
    await expect(page.getByText('Try another search or status filter.')).toBeVisible();
  } else {
    const pausedResponse = await page.request.get('/api/v1/monitors?status=PAUSED&limit=6');
    expect(pausedResponse.ok()).toBe(true);
    const paused = (await pausedResponse.json()) as { items: { name: string }[] };
    await expect(page.getByRole('link', { name: paused.items[0].name, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: /^All monitors \d+$/ }).click();
  await page.screenshot({ path: testInfo.outputPath('website-monitor-list.png'), fullPage: true });
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('.monitor-card')).toHaveCount(Math.min(6, overview.total));
  await page.screenshot({ path: testInfo.outputPath('website-monitors.png'), fullPage: true });
  await page.getByLabel('Switch to dark theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Switch to light theme').click();
  if (testInfo.project.name === 'mobile') {
    await page.getByLabel('Open navigation').click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.getByRole('link', { name: 'Incidents', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Incidents.' })).toBeVisible();
  }
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications.' })).toBeVisible();
  const preferenceResponse = await page.request.get('/api/v1/notifications/preferences');
  expect(preferenceResponse.ok()).toBe(true);
  const preferences = (await preferenceResponse.json()) as {
    smtpConfigured: boolean;
    emailConfigured?: boolean;
  };
  if (!(preferences.emailConfigured ?? preferences.smtpConfigured)) {
    await expect(page.getByText('Email delivery is not configured yet')).toBeVisible();
  }
});

test('website questions, sign out and guest navigation', async ({ page }, testInfo) => {
  await authenticatedPage(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await page.getByText('Does my browser need to stay open?', { exact: true }).click();
  await expect(
    page.getByText('No. Monitoring continues in the background even when you close this website.', {
      exact: false,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('website-public-home.png'), fullPage: true });
  await page.screenshot({ path: testInfo.outputPath('website-public-home-viewport.png') });
  if (testInfo.project.name === 'mobile') {
    await page.getByLabel('Open navigation').click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.getByRole('link', { name: 'Home', exact: true }).first().click();
    await expect(page.getByLabel('Open navigation')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 720 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  await expect(page).toHaveURL('http://localhost:5175/');
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create an account', exact: true }).first().click();
  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('website-register.png'), fullPage: true });
});
