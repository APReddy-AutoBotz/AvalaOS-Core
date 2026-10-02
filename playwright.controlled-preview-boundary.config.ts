import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import {
  CONTROLLED_PREVIEW_ORIGIN,
  CONTROLLED_PREVIEW_EVIDENCE_PROFILE,
  decodeControlledPreviewGitHubRuntime,
} from './scripts/previewBrowserEvidenceContract.mjs';
import {
  createAcceptanceReportMetadata,
  decodeAcceptanceExecutionProfile,
} from './scripts/acceptanceExecutionProfile.mjs';
import { validateResolvedHostedUrl } from './scripts/verify-hosted-pilot-evidence.mjs';

const SHA = /^[0-9a-f]{40}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const expectedHead = process.env.EXPECTED_RELEASE_SHA;
const expectedDeployId = process.env.EXPECTED_NETLIFY_DEPLOY_ID;
const aliasUrl = process.env.CONTROLLED_PREVIEW_ALIAS_URL;
const immutableUrl = process.env.CONTROLLED_PREVIEW_IMMUTABLE_URL;

if (!SHA.test(expectedHead ?? '')) throw new Error('EXPECTED_RELEASE_SHA must be the exact lowercase PR head');
if (!DEPLOY_ID.test(expectedDeployId ?? '')) throw new Error('EXPECTED_NETLIFY_DEPLOY_ID must be the exact lowercase preview deploy ID');
if (process.env.ACCEPTANCE_EXECUTION_KIND !== 'hosted_preview') throw new Error('controlled preview browser evidence requires hosted_preview execution kind');
if (aliasUrl !== CONTROLLED_PREVIEW_ORIGIN) throw new Error('controlled preview browser evidence requires the canonical PR #264 alias');
if (immutableUrl !== `https://${expectedDeployId}--avalaos-pilot.netlify.app`) throw new Error('controlled preview browser evidence requires the exact immutable deploy origin');

await validateResolvedHostedUrl(aliasUrl);
await validateResolvedHostedUrl(immutableUrl);

const profile = CONTROLLED_PREVIEW_EVIDENCE_PROFILE;
const eventPayload = process.env.GITHUB_ACTIONS === 'true'
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'))
  : null;
const workflowRuntime = decodeControlledPreviewGitHubRuntime(process.env, eventPayload);
if (workflowRuntime && workflowRuntime.releaseSha !== expectedHead) {
  throw new Error('controlled preview GitHub event head does not match the exact execution head');
}
const executionProfile = decodeAcceptanceExecutionProfile(process.env);
if (executionProfile.executionKind !== 'hosted_preview'
  || executionProfile.releaseSha !== expectedHead
  || executionProfile.deployId !== expectedDeployId
  || executionProfile.targetOrigin !== aliasUrl) {
  throw new Error('controlled preview execution profile does not match the exact alias, head, and deploy');
}
const metadata = {
  ...createAcceptanceReportMetadata({
    profile: executionProfile,
    exactCommand: ['npx', 'playwright', 'test', '--config=playwright.controlled-preview-boundary.config.ts', '--workers=1'],
    configPath: profile.configPath,
    sourcePaths: [
      'tests/browser/controlledPreviewBoundary.spec.ts',
      'scripts/previewBrowserEvidenceContract.mjs',
    ],
  }),
  previewEvidenceKind: profile.evidenceKind,
  titlePrefix: profile.titlePrefix,
  canonicalAlias: CONTROLLED_PREVIEW_ORIGIN,
  immutableDeployOriginDigest: `sha256:${createHash('sha256').update(immutableUrl).digest('hex')}`,
  workflowRuntime,
};

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'controlledPreviewBoundary.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  outputDir: 'artifacts/controlled-preview-boundary/playwright-output',
  reporter: [
    ['list'],
    ['json', { outputFile: profile.artifactPath }],
    ['junit', { outputFile: 'artifacts/controlled-preview-boundary/junit.xml' }],
  ],
  metadata,
  use: {
    baseURL: aliasUrl,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: profile.projects[0], use: { ...devices['Desktop Chrome'] } },
    { name: profile.projects[1], use: { ...devices['Pixel 7'] } },
  ],
});
