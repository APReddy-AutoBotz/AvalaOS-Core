import { defineConfig, devices } from '@playwright/test';
import {
  createAcceptanceReportMetadata,
  decodeAcceptanceExecutionProfile,
} from './scripts/acceptanceExecutionProfile.mjs';
import { validateResolvedHostedUrl } from './scripts/verify-hosted-pilot-evidence.mjs';
import { createHostedAcceptanceWorkflowRuntime } from './scripts/hostedAcceptanceReportProvenance.mjs';

const executionProfile = decodeAcceptanceExecutionProfile(process.env);
const hostedOrigin = executionProfile.executionKind === 'hosted_preview'
  ? await validateResolvedHostedUrl(executionProfile.targetOrigin!)
  : undefined;
const reportMetadata = createAcceptanceReportMetadata({
  profile: executionProfile,
  exactCommand: ['npx', 'playwright', 'test', '--config=playwright.controller-navigation-history.config.ts', '--workers=1'],
  configPath: 'playwright.controller-navigation-history.config.ts',
  sourcePaths: ['tests/browser/controllerNavigationHistory.spec.ts'],
});
const metadata = executionProfile.executionKind === 'hosted_preview'
  ? {
      ...reportMetadata,
      workflowRuntime: createHostedAcceptanceWorkflowRuntime({
        environment: process.env,
        workflowPath: '.github/workflows/preview-exhaustive-browser-qa.yml',
        releaseSha: executionProfile.releaseSha,
      }),
    }
  : reportMetadata;

export default defineConfig({
  testDir: './tests/browser', testMatch: 'controllerNavigationHistory.spec.ts', forbidOnly: true,
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000,
  outputDir: 'artifacts/controller-navigation-history/playwright-output',
  reporter: [['list'], ['json', { outputFile: 'artifacts/controller-navigation-history/playwright-results.json' }]],
  metadata,
  use: { baseURL: hostedOrigin, trace: 'off', screenshot: 'only-on-failure', video: 'off' },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } }],
});
