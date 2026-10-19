import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { authenticatedAcceptanceMode } from './scripts/authenticatedV2ReloadDiagnostic.mjs';

const baseURL = process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL;
if (!baseURL) throw new Error('AUTHENTICATED_HOSTED_BASE_URL_REQUIRED');
const target = new URL(baseURL);
const acceptanceMode = authenticatedAcceptanceMode(process.env);
const executionKind = process.env.AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND;
const localBuild = executionKind === 'local_real_backend_authenticated';
if (target.origin !== baseURL || target.username || target.password
  || (localBuild ? baseURL !== 'http://127.0.0.1:4173'
    : executionKind !== 'hosted_authenticated_synthetic'
      || target.protocol !== 'https:' || target.hostname !== 'avalaos-pilot.netlify.app')) {
  throw new Error('AUTHENTICATED_HOSTED_BASE_URL_REJECTED');
}
if (process.env.ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH !== 'true'
  || process.env.ENTERPRISE_LIFECYCLE_AUTHENTICATED !== 'true') {
  throw new Error('AUTHENTICATED_HOSTED_REAL_AUTH_REQUIRED');
}
const ownedPath = (name: string) => {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value)) throw new Error('AUTHENTICATED_HOSTED_OUTPUT_PATH_REQUIRED');
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(value));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('AUTHENTICATED_HOSTED_OUTPUT_PATH_REJECTED');
  }
  return value;
};
const playwrightOutputDir = ownedPath('AUTHENTICATED_HOSTED_PLAYWRIGHT_OUTPUT_DIR');
ownedPath('ENTERPRISE_LIFECYCLE_OUTPUT_DIR');
ownedPath('AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH');

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser/enterpriseLifecycleAcceptance',
  testMatch: 'enterpriseLifecycleAcceptance.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  reporter: [['./scripts/authenticatedHostedPlaywrightReporter.mjs']],
  outputDir: playwrightOutputDir,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: acceptanceMode === 'v2_primary_prefix_diagnostic'
    ? [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }]
    : [
      { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
    ],
});
