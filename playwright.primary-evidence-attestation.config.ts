import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser/enterpriseLifecycleAcceptance',
  testMatch: ['evidenceAttestation.spec.ts', 'actorEntryNavigation.spec.ts'],
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '.agent/primary-evidence-attestation-playwright',
  timeout: 30_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:51999',
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block',
  },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }],
});
