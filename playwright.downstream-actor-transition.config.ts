import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser/enterpriseLifecycleAcceptance',
  testMatch: ['downstreamActorTransition.spec.ts', 'canonicalRetainedRecordTargeting.spec.ts'],
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '.agent/downstream-actor-transition-playwright',
  timeout: 30_000,
  expect: { timeout: 15_000 },
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
