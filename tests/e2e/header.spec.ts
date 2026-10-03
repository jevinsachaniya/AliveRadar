import { test, expect } from '@playwright/test';

test('header stays aligned and its menu works across screen widths', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your website. On our radar.' })).toBeVisible();
  const header = page.locator('.site-header');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  for (const width of [320, 390, 600, 768, 960, 1024, 1280, 1600]) {
    await page.setViewportSize({ width, height: 844 });
    const brand = await header.getByRole('link', { name: 'AliveRadar home' }).boundingBox();
    const actions = await page.locator('.site-header-actions').boundingBox();
    expect(brand).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(actions!.x - 4);
    expect(Math.abs(brand!.y + brand!.height / 2 - actions!.y - actions!.height / 2)).toBeLessThan(
      2,
    );
    expect(await header.evaluate((element) => element.scrollWidth <= innerWidth)).toBe(true);
    if (width > 960) {
      await expect(navigation).toBeVisible();
      await expect(page.getByLabel('Open navigation')).toBeHidden();
      const nav = await navigation.boundingBox();
      expect(Math.abs(nav!.x + nav!.width / 2 - width / 2)).toBeLessThan(2);
    } else {
      await expect(navigation).toBeHidden();
      await page.getByLabel('Open navigation').click();
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(navigation).toBeHidden();
      await expect(page.getByLabel('Open navigation')).toBeFocused();
      await page.getByLabel('Open navigation').click();
      await page.mouse.click(10, 830);
      await expect(navigation).toBeHidden();
    }
    if ([390, 768, 1024, 1280].includes(width))
      await header.screenshot({ path: testInfo.outputPath(`header-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Open navigation').click();
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(navigation).toBeHidden();
});

test('search opens after a slow page load and keeps focus while filtering', async ({
  page,
}, testInfo) => {
  await page.route('**/api/v1/overview*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.continue();
  });
  await page.goto('/incidents');
  await expect(page.getByRole('heading', { name: 'Incidents.' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox', { name: 'Search monitors', exact: true });
  await expect(page).toHaveURL(/\/monitors\?focus=search$/);
  await expect(search).toBeFocused();
  await search.pressSequentially('nothing-matches-this-monitor');
  await expect(page.getByRole('heading', { name: 'No matching monitors' })).toBeVisible();
  await expect(search).toBeFocused();
  await search.press('Control+a');
  await search.press('Backspace');
  await expect(page.locator('.table-footer')).toHaveAttribute('aria-busy', 'false');
  await expect(search).toBeFocused();
  const sorted = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/v1/monitors' &&
      url.searchParams.get('sort') === 'name' &&
      url.searchParams.get('order') === 'asc' &&
      response.status() === 200
    );
  });
  await page.getByRole('combobox', { name: 'Sort monitors' }).selectOption('name');
  await sorted;
  let failures = 0;
  await page.route('**/api/v1/monitors?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('search') === 'temporaryfailure' && failures++ < 2)
      await route.fulfill({ status: 503, json: { error: { message: 'Simulated search outage' } } });
    else await route.continue();
  });
  await search.fill('temporaryfailure');
  await expect(page.getByText('Simulated search outage', { exact: true })).toBeVisible();
  await expect(search).toBeFocused();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching monitors' })).toBeVisible();
  await search.fill('');
  await expect(page.locator('.table-footer')).toHaveAttribute('aria-busy', 'false');
  const overview = page.getByRole('navigation', { name: 'Main navigation' });
  if (testInfo.project.name === 'mobile') await page.getByLabel('Open navigation').click();
  await overview.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview.' })).toBeVisible();
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page.getByRole('button', { name: '7d', exact: true })).toHaveClass('selected');
  await expect(page.getByRole('heading', { name: 'Overview.' })).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await page.getByLabel('Open navigation').click();
    await overview.getByRole('link', { name: 'Search monitors', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Search monitors', exact: true }).click();
  }
  await expect(search).toBeFocused();
});
