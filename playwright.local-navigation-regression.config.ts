import { defineConfig, devices } from '@playwright/test';
import {
  createAcceptanceReportMetadata,
  decodeAcceptanceExecutionProfile,
} from './scripts/acceptanceExecutionProfile.mjs';

const profile = decodeAcceptanceExecutionProfile(process.env, {
  expectedCheckoutSha: process.env.ACCEPTANCE_CHECKOUT_SHA,
});
if (profile.executionKind !== 'local_source_fixture') throw new Error('LOCAL_NAVIGATION_REGRESSION_PROFILE_REQUIRED');
const outputRoot = `output/playwright/pr264-synthetic-regression/${profile.releaseSha}/navigation/${profile.invocationId}`;
const metadata = createAcceptanceReportMetadata({
  profile,
  exactCommand: ['node', 'scripts/runTranscriptFlowBrowser.mjs', '--preview-navigation-regression'],
  configPath: 'playwright.local-navigation-regression.config.ts',
  sourcePaths: ['tests/browser/controllerNavigationHistory.spec.ts'],
});

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'controllerNavigationHistory.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: `${outputRoot}/playwright-output`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${outputRoot}/playwright-results.json` }],
    ['junit', { outputFile: `${outputRoot}/junit.xml` }],
    ['html', { outputFolder: `${outputRoot}/playwright-report`, open: 'never' }],
  ],
  metadata,
  use: {
    baseURL: profile.targetOrigin,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
