import { defineConfig, devices } from '@playwright/test';
import { validateHostedUrl, validateResolvedHostedUrl } from './scripts/verify-hosted-pilot-evidence.mjs';

const rawUrl = process.env.HOSTED_PILOT_URL;
if (!rawUrl) throw new Error('HOSTED_PILOT_URL is required; controller navigation QA cannot silently use localhost');
const exact = process.env.NETLIFY_DEPLOY_ID && process.env.NETLIFY_DEPLOY_ID !== 'pull-request-not-deployed';
const hostedOrigin = exact ? await validateResolvedHostedUrl(rawUrl) : validateHostedUrl(rawUrl);

export default defineConfig({
  testDir: './tests/browser', testMatch: 'controllerNavigationHistory.spec.ts', forbidOnly: true,
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000,
  outputDir: 'artifacts/controller-navigation-history/playwright-output',
  reporter: [['list'], ['json', { outputFile: 'artifacts/controller-navigation-history/playwright-results.json' }]],
  use: { baseURL: hostedOrigin, trace: 'off', screenshot: 'only-on-failure', video: 'off' },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } }],
});
