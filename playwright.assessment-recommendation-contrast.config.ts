import { defineConfig } from '@playwright/test';

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'assessmentRecommendationContrast.spec.ts',
  forbidOnly: true,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4198',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/browser/assessmentRecommendationContrastServer.mjs',
    url: 'http://127.0.0.1:4198/tests/browser/assessmentRecommendationContrastHarness.html',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
