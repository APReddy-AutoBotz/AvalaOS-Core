import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../tests/browser/enterpriseLifecycleAcceptance',
  testMatch: 'studioHandoffPersonaContract.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['./authenticatedHostedPlaywrightReporter.mjs']],
  outputDir: process.env.STUDIO_HANDOFF_PERSONA_PLAYWRIGHT_OUTPUT_DIRECTORY,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
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
