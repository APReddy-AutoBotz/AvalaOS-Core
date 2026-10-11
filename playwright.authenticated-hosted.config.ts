import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL;
if (!baseURL) throw new Error('AUTHENTICATED_HOSTED_BASE_URL_REQUIRED');
const target = new URL(baseURL);
if (target.protocol !== 'https:' || target.origin !== baseURL
  || target.hostname !== 'avalaos-pilot.netlify.app') {
  throw new Error('AUTHENTICATED_HOSTED_BASE_URL_REJECTED');
}
if (process.env.ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH !== 'true'
  || process.env.ENTERPRISE_LIFECYCLE_AUTHENTICATED !== 'true') {
  throw new Error('AUTHENTICATED_HOSTED_REAL_AUTH_REQUIRED');
}

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser/enterpriseLifecycleAcceptance',
  testMatch: 'enterpriseLifecycleAcceptance.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  reporter: 'list',
  outputDir: '.agent/authenticated-hosted-playwright',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
