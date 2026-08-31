import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'studioPrivateArtifacts.spec.ts',
  forbidOnly: true,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4190',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-pixel-7', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.STUDIO_PRIVATE_ARTIFACT_EXTERNAL_SERVER === 'true' ? undefined : {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4190',
    url: 'http://127.0.0.1:4190',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      STUDIO_PRIVATE_ARTIFACT_BROWSER_TEST_BUILD: 'true',
      VITE_AVALA_RUNTIME_MODE: 'pilot',
      VITE_SUPABASE_URL: 'https://127.0.0.1:59999',
      VITE_SUPABASE_ANON_KEY: 'browser-test-placeholder',
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
    },
  },
});
