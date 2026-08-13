import { defineConfig, devices } from '@playwright/test';
import { validateResolvedHostedUrl } from './scripts/verify-hosted-pilot-evidence.mjs';

const rawUrl = process.env.HOSTED_PILOT_URL;
if (!rawUrl) throw new Error('HOSTED_PILOT_URL is required; exhaustive hosted acceptance cannot silently use localhost');
const hostedOrigin = await validateResolvedHostedUrl(rawUrl);

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'exhaustiveHostedAcceptance.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: 'artifacts/exhaustive-acceptance/playwright-output',
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/exhaustive-acceptance/playwright-results.json' }],
    ['junit', { outputFile: 'artifacts/exhaustive-acceptance/junit.xml' }],
    ['html', { outputFolder: 'artifacts/exhaustive-acceptance/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: hostedOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'hosted-desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'hosted-pixel-7-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
