import { defineConfig, devices } from '@playwright/test';

import {
  parseFullPlatformBaseUrl,
  parseFullPlatformExecutionMode,
  parseFullPlatformRunId,
} from './tests/browser/fullPlatformContract';

const baseURL = parseFullPlatformBaseUrl(process.env.FULL_PLATFORM_BASE_URL);
const executionMode = parseFullPlatformExecutionMode(process.env.FULL_PLATFORM_EXECUTION_MODE);
const runId = parseFullPlatformRunId(process.env.FULL_PLATFORM_RUN_ID);
const outputRoot = `output/playwright/${runId}`;

const campaignCases = [
  { name: 'process-analyst', grep: /Process Analyst: every visible authorized deterministic surface, accessibility, persistence and transport$/ },
  { name: 'ap-process-owner', grep: /AP Process Owner: every visible authorized deterministic surface, accessibility, persistence and transport$/ },
  { name: 'delivery-lead', grep: /Delivery Lead: every visible authorized deterministic surface, accessibility, persistence and transport$/ },
  { name: 'control-reviewer', grep: /Control Reviewer: every visible authorized deterministic surface, accessibility, persistence and transport$/ },
  { name: 'automation-contributor', grep: /Automation Contributor: every visible authorized deterministic surface, accessibility, persistence and transport$/ },
  { name: 'buyer-viewer', grep: /Buyer Viewer: every visible authorized deterministic surface, accessibility, persistence and transport$/ },
  { name: 'platform-admin', grep: /Platform Admin: every visible authorized deterministic surface, accessibility, persistence and transport$/ },
  { name: 'route-boundary', grep: /accepted sandbox descendants are distinct from a genuinely denied non-admin product view$/ },
] as const;

const deviceVariants = [
  { name: 'desktop-chrome', use: devices['Desktop Chrome'] },
  { name: 'pixel-7', use: devices['Pixel 7'] },
] as const;

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'fullPlatformCampaign.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: `${outputRoot}/test-results`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${outputRoot}/playwright-results.json` }],
    ['junit', { outputFile: `${outputRoot}/junit.xml` }],
    ['html', { outputFolder: `${outputRoot}/html-report`, open: 'never' }],
  ],
  metadata: {
    evidenceBoundary: executionMode === 'connected'
      ? 'server-preflight-bound-synthetic-sandbox-browser-not-connected-e2e'
      : 'deterministic-fixture-browser-only',
    executionMode,
  },
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    // Playwright traces can retain authorization headers. The campaign emits a
    // bounded, sanitized transport trace on failure instead.
    trace: 'off',
    video: 'off',
  },
  // A project boundary gives every persona and route-boundary case a fresh
  // browser worker. This prevents prior personas from influencing timing,
  // storage, accessibility, or transport evidence for a later case.
  projects: deviceVariants.flatMap(device => campaignCases.map(campaignCase => ({
    name: `full-platform-${device.name}-${campaignCase.name}`,
    grep: campaignCase.grep,
    use: { ...device.use },
  }))),
});
