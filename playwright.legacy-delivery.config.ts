import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.LEGACY_DELIVERY_APP_BASE_URL ?? 'http://127.0.0.1:4432';

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'legacyDeliveryAuthority.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.agent/legacy-delivery-authority-playwright/report', open: 'never' }],
  ],
  outputDir: '.agent/legacy-delivery-authority-playwright/results',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
