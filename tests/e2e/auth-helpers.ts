import { expect, type Page } from '@playwright/test';

export async function emailCode(page: Page, email: string) {
  const response = await page.request.get(
    `http://127.0.0.1:4030/messages?to=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
  const messages: { text: string }[] = await response.json();
  const code = messages.at(-1)?.text.match(/code is: ([0-9]{6})/)?.[1];
  expect(code).toBeTruthy();
  return code!;
}

export async function completeOtp(
  page: Page,
  email: string,
  purpose: 'login' | 'register' = 'register',
) {
  await expect(page).toHaveURL(new RegExp(`/${purpose}/otp$`));
  await page.getByLabel('Verification code').fill(await emailCode(page, email));
  await page
    .getByRole('button', {
      name: purpose === 'login' ? 'Verify & sign in' : 'Verify & create account',
    })
    .click();
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
}

export async function authenticatedPage(page: Page, withMonitor = false) {
  const email = `browser-${crypto.randomUUID()}@example.com`;
  const origin = 'http://localhost:5175';
  const start = await page.request.post('/api/v1/auth/register', {
    headers: { Origin: origin },
    data: { name: 'Browser Tester', email, password: 'browser-password-123' },
  });
  expect(start.status()).toBe(202);
  const challenge = await start.json();
  const verified = await page.request.post('/api/v1/auth/register/verify-otp', {
    headers: { Origin: origin },
    data: { token: challenge.token, code: await emailCode(page, email) },
  });
  expect(verified.status()).toBe(201);
  const data = await verified.json();
  if (withMonitor) {
    const created = await page.request.post('/api/v1/monitors', {
      headers: { Origin: origin, 'X-CSRF-Token': data.csrfToken },
      data: { name: 'Browser endpoint', url: 'http://127.0.0.1:4007/website' },
    });
    expect(created.status()).toBe(201);
  }
  return email;
}
