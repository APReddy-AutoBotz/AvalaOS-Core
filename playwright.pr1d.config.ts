import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'pr1d.spec.ts',
  forbidOnly: true,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4183', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4183',
    url: 'http://127.0.0.1:4183',
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_AVALA_RUNTIME_MODE: 'pilot',
      VITE_SUPABASE_URL: 'http://127.0.0.1:59999',
      VITE_SUPABASE_ANON_KEY: 'browser-test-placeholder',
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
    },
  },
});
