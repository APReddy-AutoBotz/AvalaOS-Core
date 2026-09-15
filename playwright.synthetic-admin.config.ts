import { defineConfig, devices } from '@playwright/test';

const runId = process.env.CREATION_ACCESS_BROWSER_RUN_ID;
if (!runId || !/^[0-9a-f]{24}$/.test(runId)) throw new Error('Use npm run test:creation-access:browser to start the owned synthetic server.');
const outputDir = `output/playwright/creation-access/${runId}`;

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'syntheticAdmin.spec.ts',
  forbidOnly: true,
  workers: 1,
  outputDir,
  reporter: [['list'],['json',{outputFile:`${outputDir}/results.json`}]],
  use: { baseURL: 'http://127.0.0.1:4179', trace: 'off', screenshot: 'only-on-failure', video: 'off' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
