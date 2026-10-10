import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL ?? 'http://127.0.0.1:4431';

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser/enterpriseLifecycleAcceptance',
  testMatch: 'enterpriseLifecycleAcceptance.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  maxFailures: process.env.ENTERPRISE_LIFECYCLE_AUTHENTICATED === 'true' ? 1 : undefined,
  reporter: 'list',
  outputDir: '.agent/enterprise-lifecycle-acceptance-playwright',
  timeout: process.env.ENTERPRISE_LIFECYCLE_AUTHENTICATED === 'true' ? 300_000 : 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
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
