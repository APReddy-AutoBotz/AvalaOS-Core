import { defineConfig, devices } from '@playwright/test';

const outputDir = process.env.GOVERN_DISABLED_REPRO_PLAYWRIGHT_OUTPUT_DIRECTORY;
if (!outputDir) throw new Error('GOVERN_DISABLED_REPRO_PLAYWRIGHT_OUTPUT_DIRECTORY_REQUIRED');

export default defineConfig({
  testDir: '.',
  testMatch: 'governDisabledControlRepro.spec.ts',
  forbidOnly: true,
  workers: 1,
  reporter: 'list',
  outputDir,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  ],
});
