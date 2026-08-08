import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'enterpriseIntelligence.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '.agent/enterprise-intelligence-playwright',
  use: {
    baseURL: 'http://127.0.0.1:4191',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4191',
    url: 'http://127.0.0.1:4191/tests/browser/enterpriseIntelligenceHarness.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_AVALA_RUNTIME_MODE: 'pilot',
      VITE_SUPABASE_URL: 'http://127.0.0.1:59999',
      VITE_SUPABASE_ANON_KEY: 'browser-test-placeholder',
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
    },
  },
});
