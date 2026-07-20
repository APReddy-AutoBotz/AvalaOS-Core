import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  testIgnore: 'pr1d.spec.ts',
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      VITE_AVALA_RUNTIME_MODE: 'local_demo',
      VITE_SUPABASE_URL: 'http://127.0.0.1:59999',
      VITE_SUPABASE_ANON_KEY: 'browser-test-placeholder',
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
      PR1A_BROWSER_TEST_BUILD: 'true',
    },
  },
});
