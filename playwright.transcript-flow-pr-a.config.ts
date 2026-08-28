import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'transcriptFlowPrA.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  outputDir: `${process.env.TEMP || process.env.TMP || '.'}/avalaos-transcript-flow-pr-a-playwright`,
  use: {
    baseURL: 'http://127.0.0.1:4193',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
