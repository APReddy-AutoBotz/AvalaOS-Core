import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL ?? 'http://127.0.0.1:4431';
const authenticated = process.env.ENTERPRISE_LIFECYCLE_AUTHENTICATED === 'true';
const connectedBrowserIdentity = (() => {
  if (!authenticated) return null;
  try { return JSON.parse(process.env.CONNECTED_BROWSER_DIAGNOSTIC_IDENTITY_JSON ?? 'null'); } catch { return null; }
})();

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser/enterpriseLifecycleAcceptance',
  testMatch: 'enterpriseLifecycleAcceptance.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  maxFailures: authenticated ? 1 : undefined,
  reporter: authenticated
    ? [['./scripts/connectedBrowserPlaywrightReporter.mjs', { identity: connectedBrowserIdentity }]]
    : 'list',
  outputDir: '.agent/enterprise-lifecycle-acceptance-playwright',
  preserveOutput: authenticated ? 'never' : 'always',
  timeout: authenticated ? 300_000 : 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: authenticated ? 'off' : 'retain-on-failure',
    screenshot: authenticated ? 'off' : 'only-on-failure',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
