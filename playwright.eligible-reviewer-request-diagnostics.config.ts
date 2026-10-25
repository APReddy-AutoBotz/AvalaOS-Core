import { defineConfig, devices } from '@playwright/test';

const outputDir = process.env.ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTICS_PLAYWRIGHT_OUTPUT;
if (!outputDir) throw new Error('ELIGIBLE_REVIEWER_DIAGNOSTICS_OUTPUT_REQUIRED');

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'eligibleReviewerRequestDiagnostics.browser.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['./scripts/authenticatedHostedPlaywrightReporter.mjs']],
  outputDir,
  timeout: 30_000,
  expect: { timeout: 15_000 },
  use: { actionTimeout: 15_000, navigationTimeout: 15_000, trace: 'off', screenshot: 'off', video: 'off',
    serviceWorkers: 'block' },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }],
});
