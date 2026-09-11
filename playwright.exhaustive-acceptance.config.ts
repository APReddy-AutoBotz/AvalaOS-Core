import { defineConfig, devices } from '@playwright/test';
import {
  createAcceptanceReportMetadata,
  decodeAcceptanceExecutionProfile,
} from './scripts/acceptanceExecutionProfile.mjs';
import { validateResolvedHostedUrl } from './scripts/verify-hosted-pilot-evidence.mjs';
import {
  createHostedAcceptanceWorkflowRuntime,
  EXHAUSTIVE_ACCEPTANCE_WORKFLOW,
  PREVIEW_EXHAUSTIVE_BROWSER_WORKFLOW,
  resolveHostedAcceptanceWorkflowPath,
} from './scripts/hostedAcceptanceReportProvenance.mjs';

const executionProfile = decodeAcceptanceExecutionProfile(process.env);
const hostedOrigin = executionProfile.executionKind === 'hosted_preview'
  ? await validateResolvedHostedUrl(executionProfile.targetOrigin!)
  : undefined;
const reportMetadata = createAcceptanceReportMetadata({
  profile: executionProfile,
  exactCommand: ['npx', 'playwright', 'test', '--config=playwright.exhaustive-acceptance.config.ts', '--workers=1'],
  configPath: 'playwright.exhaustive-acceptance.config.ts',
  sourcePaths: ['tests/browser/exhaustiveHostedAcceptance.spec.ts'],
});
const workflowPath = resolveHostedAcceptanceWorkflowPath({
  environment: process.env,
  allowedWorkflowPaths: [EXHAUSTIVE_ACCEPTANCE_WORKFLOW, PREVIEW_EXHAUSTIVE_BROWSER_WORKFLOW],
});
const metadata = executionProfile.executionKind === 'hosted_preview'
  ? {
      ...reportMetadata,
      workflowRuntime: createHostedAcceptanceWorkflowRuntime({
        environment: process.env,
        workflowPath,
        releaseSha: executionProfile.releaseSha,
      }),
    }
  : reportMetadata;

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
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
  metadata,
  use: {
    baseURL: hostedOrigin,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
