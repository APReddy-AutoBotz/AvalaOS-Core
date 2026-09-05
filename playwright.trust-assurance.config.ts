import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/trust-assurance/browser',
  testMatch: 'trustAssurance.spec.ts',
  globalSetup: './tests/trust-assurance/browser/trustAssuranceBuiltPreviewPreflight.ts',
  timeout: 180_000,
  workers: 1,
  retries: 1,
  webServer: process.env.TRUST_ASSURANCE_EXTERNAL_SERVER === 'true' ? undefined : {
    command: 'npx vite preview --config vite.trust-assurance.config.ts --host 127.0.0.1 --port 4417 --strictPort',
    url: 'http://127.0.0.1:4417/tests/trust-assurance/browser/trustAssuranceHarness.html',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4417',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Pixel 7', use: { ...devices['Pixel 7'] } },
  ],
});
