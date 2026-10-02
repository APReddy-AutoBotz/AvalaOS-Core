import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.LOCAL_CONTROLLED_BOUNDARY_BASE_URL;
const invocationId = process.env.LOCAL_CONTROLLED_BOUNDARY_INVOCATION_ID;
if (process.env.LOCAL_CONTROLLED_BOUNDARY_EXECUTION !== 'isolated'
  || !/^http:\/\/127[.]0[.]0[.]1:\d{2,5}$/u.test(baseURL ?? '')
  || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(invocationId ?? '')) {
  throw new Error('LOCAL_CONTROLLED_BOUNDARY_ISOLATED_RUNNER_REQUIRED');
}

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'localControlledBoundary.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  outputDir: `output/playwright/local-controlled-boundary/${invocationId}/test-output`,
  reporter: [
    ['list'],
    ['json', { outputFile: `output/playwright/local-controlled-boundary/${invocationId}/results.json` }],
  ],
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
