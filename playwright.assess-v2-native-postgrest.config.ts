import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL ?? 'http://127.0.0.1:4431';

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'assessV2NativePostgrest.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '.agent/assess-v2-native-postgrest-playwright',
  timeout: 180_000,
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
