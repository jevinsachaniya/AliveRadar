import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { baseURL: 'http://localhost:5175', trace: 'retain-on-failure' },
  globalTeardown: './tests/e2e/teardown.ts',
  webServer: {
    command: 'node scripts/python.mjs -m backend.e2e_runner',
    url: 'http://127.0.0.1:4030/ready',
    reuseExistingServer: false,
    timeout: 90000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
