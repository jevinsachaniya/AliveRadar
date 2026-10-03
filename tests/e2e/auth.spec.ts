import { test, expect } from '@playwright/test';
import { completeOtp, emailCode } from './auth-helpers';

test('guest gate and separate registration/login OTP pages', async ({
  page,
  context,
}, testInfo) => {
  const email = `otp-${testInfo.project.name}-${Date.now()}@example.com`;
  for (const path of ['/settings', '/websites', '/login/otp', '/register/otp']) {
    await page.goto(path);
    await expect(page).toHaveURL(
      (url) => url.pathname === (path === '/register/otp' ? '/register' : '/login'),
    );
  }
  await page.goto('/login');
  await expect(page.getByText('Explore demo monitoring')).toHaveCount(0);
  await page.getByRole('link', { name: 'Create an account', exact: true }).first().click();
  await page.getByLabel('Your name').fill('OTP Tester');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('otp-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(/\/register\/otp$/);
  await expect(page.getByRole('button', { name: /Resend code in/ })).toBeDisabled();
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  expect(
    (await context.cookies()).find((cookie) => cookie.name === 'pulse_session'),
  ).toBeUndefined();
  await page.reload();
  await expect(page.getByLabel('Verification code')).toBeVisible();
  const code = await emailCode(page, email);
  await page.getByLabel('Verification code').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Verify & create account' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Incorrect code. Check your email and try again.',
  );
  for (const width of testInfo.project.name === 'mobile' ? [320, 390, 600] : [1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByLabel('Verification code')).toHaveCSS('font-size', '28px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`register-otp-${width}.png`),
      fullPage: true,
    });
  }
  await completeOtp(page, email);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('otp-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login\/otp$/);
  await expect(page.getByRole('heading', { name: 'Verify your sign-in.' })).toBeVisible();
  expect((await page.request.get('/api/v1/overview')).status()).toBe(401);
  await page.screenshot({ path: testInfo.outputPath('login-otp.png'), fullPage: true });
  await completeOtp(page, email, 'login');
  await page.goto('/login');
  await expect(page).toHaveURL('http://localhost:5175/');
  await page.goto('/register/otp');
  await expect(page).toHaveURL('http://localhost:5175/');
});

test('browse public pages then resume adding a website after registration and login', async ({
  page,
}, testInfo) => {
  const email = `public-${testInfo.project.name}-${Date.now()}@example.com`;
  const privateRequests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/v1/') && !path.startsWith('/api/v1/auth/'))
      privateRequests.push(path);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  await expect(page).toHaveURL('http://localhost:5175/');
  await page.getByText('Does my browser need to stay open?', { exact: true }).click();
  await expect(
    page.getByText('No. Monitoring continues in the background even when you close this website.', {
      exact: false,
    }),
  ).toBeVisible();
  if (testInfo.project.name === 'mobile') await page.getByLabel('Open navigation').click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Overview.', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Every URL gets its own check.' })).toBeVisible();
  for (const width of testInfo.project.name === 'mobile' ? [320, 390, 600] : [1024, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: testInfo.outputPath(`public-overview-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole('link', { name: 'Email notifications', exact: true }).click();
  await expect(page).toHaveURL(/\/overview#email-alerts$/);
  expect(privateRequests).toEqual([]);
  await page.getByRole('link', { name: 'Add website', exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/login' && url.searchParams.get('next') === '/websites?add=website',
  );
  await page.getByRole('link', { name: 'Create an account', exact: true }).first().click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/register' && url.searchParams.get('next') === '/websites?add=website',
  );
  await page.getByLabel('Your name').fill('Public Visitor');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('public-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/register/otp' && url.searchParams.get('next') === '/websites?add=website',
  );
  await page.reload();
  await page.getByLabel('Verification code').fill(await emailCode(page, email));
  await page.getByRole('button', { name: 'Verify & create account' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Website name', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  await page.getByRole('link', { name: 'Start monitoring', exact: true }).first().click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('public-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/login/otp' && url.searchParams.get('next') === '/websites?add=website',
  );
  await page.getByLabel('Verification code').fill(await emailCode(page, email));
  await page.getByRole('button', { name: 'Verify & sign in' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Website name', { exact: true })).toBeVisible();
});

test('public website stays available when the auth API is unavailable', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Auth temporarily unavailable' } } }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Overview.', exact: true })).toBeVisible();
});
