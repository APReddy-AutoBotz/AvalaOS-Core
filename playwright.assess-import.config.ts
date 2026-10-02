import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const runId = process.env.ASSESS_IMPORT_BROWSER_RUN_ID || '';
if (!/^[0-9a-f]{24}$/.test(runId)) throw new Error('ASSESS_IMPORT_BROWSER_RUN_ID_REQUIRED');
const resultsRoot = path.join('output', 'playwright', 'assess-import', runId);

export default defineConfig({
  captureGitInfo: { commit:false, diff:false },
  testDir: './tests/browser',
  testMatch: 'assessImport.spec.ts',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  outputDir: path.join(resultsRoot, 'artifacts'),
  reporter: [['list'], ['json', { outputFile:path.join(resultsRoot, 'results.json') }]],
  use: { baseURL:'http://127.0.0.1:4189', trace:'retain-on-failure', screenshot:'only-on-failure' },
  projects: [
    { name:'chromium-desktop', use:{ ...devices['Desktop Chrome'] } },
    { name:'chromium-mobile', use:{ ...devices['Pixel 7'] } },
  ],
});
