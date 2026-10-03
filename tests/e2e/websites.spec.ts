import { test, expect } from '@playwright/test';
import { completeOtp } from './auth-helpers';

test('create a website with independently checked URLs, show failed pages and manage alerts', async ({
  page,
}, testInfo) => {
  const name = `Website journey ${testInfo.project.name} ${Date.now()}`;
  const email = `website-${testInfo.project.name}-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Website Tester');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('website-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await completeOtp(page, email);
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  await page.goto('/websites');
  await page.getByRole('button', { name: 'Add website', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Website name', { exact: true }).fill(name);
  await dialog.getByPlaceholder('https://example.com').fill('http://127.0.0.1:4007');
  await dialog.getByLabel('Page 1 name', { exact: true }).fill('Home page');
  await dialog.getByLabel('Page 1 URL', { exact: true }).fill('/website');
  await dialog.getByLabel('Page 2 name', { exact: true }).fill('Checkout page');
  await dialog.getByLabel('Page 2 URL', { exact: true }).fill('/store?status=503');
  // Disposable example.com accounts must not send external test email.
  await dialog.getByRole('checkbox').uncheck();
  await dialog.getByText('Advanced settings', { exact: true }).click();
  await dialog.getByLabel('Failures before alert').fill('1');
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
  }
  await dialog.getByRole('button', { name: 'Start monitoring website' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const websiteUrl = page.url();
  await expect(page.locator('.website-status')).toHaveText('DEGRADED', { timeout: 20000 });
  const failed = page.getByRole('region', { name: 'Failed pages' });
  await expect(failed.getByRole('link', { name: 'Checkout page' })).toBeVisible();
  const home = page
    .locator('.website-page-row')
    .filter({ has: page.getByRole('link', { name: 'Home page', exact: true }) });
  const checkout = page
    .locator('.website-page-row')
    .filter({ has: page.getByRole('link', { name: 'Checkout page', exact: true }) });
  await expect(home.locator('.status-badge')).toHaveText('Up');
  await expect(checkout.locator('.status-badge')).toHaveText('Down');
  await page.screenshot({ path: testInfo.outputPath('website-degraded.png'), fullPage: true });
  await page.goto('/overview');
  const card = page
    .locator('.website-group-card')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(card.locator('.website-status')).toHaveText('DEGRADED');
  await expect(
    card.locator('.website-failures').getByRole('link', { name: 'Checkout page' }),
  ).toBeVisible();
  await page.goto(websiteUrl);
  await page.getByLabel('Actions for Checkout page').click();
  await page.getByRole('button', { name: 'Pause monitoring' }).click();
  await expect(page.locator('.website-status')).toHaveText('UP');
  await page.getByLabel('Actions for Home page').click();
  await page.getByRole('button', { name: 'Edit monitor', exact: true }).click();
  await page
    .getByPlaceholder('https://example.com')
    .fill('http://127.0.0.1:4007/website?status=503');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.website-status')).toHaveText('DOWN', { timeout: 20000 });
  await page.getByRole('button', { name: 'Website settings' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save website settings' }).click();
  await expect(
    page.getByText('Page outage and recovery emails enabled', { exact: false }),
  ).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByRole('switch', { name: 'Enable email notifications' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const mailResponse = await page.request.get('/api/v1/notifications/preferences');
  expect(mailResponse.ok()).toBe(true);
  const emailSettings = await mailResponse.json();
  await expect(
    page.getByText(
      emailSettings.emailConfigured
        ? 'Email delivery is configured'
        : 'Email delivery is not configured yet',
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto(websiteUrl);
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await page.getByLabel('Monitor name').fill('About page');
  await page.getByPlaceholder('https://example.com').fill('http://127.0.0.1:4007/about');
  await page.getByRole('button', { name: 'Create monitor' }).click();
  await expect(page.getByRole('link', { name: 'About page', exact: true })).toBeVisible();
  for (const width of testInfo.project.name === 'mobile' ? [320, 390, 600] : [1024, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const row of await page.locator('.website-page-row').all())
      expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
        true,
      );
  }
  await page.getByLabel(`Delete ${name}`).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(
    page.getByRole('heading', { name: 'One website. Every important page.' }),
  ).toBeVisible();
});
