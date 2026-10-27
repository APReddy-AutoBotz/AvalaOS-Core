import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  PREACTIVATION_SIGN_IN_PHASES,
  validatePreactivationSignInIdentity,
} from './scripts/preactivationSignInDiagnostics.mjs';

const baseURL = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_APP_URL ?? '';
const outputDir = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_OUTPUT_DIR ?? '';
const certificateSpki = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TLS_SPKI ?? '';
const tlsBridge = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TLS_BRIDGE ?? '';
const diagnosticContextJson = process.env.PREACTIVATION_SIGN_IN_DIAGNOSTIC_IDENTITY_JSON ?? '';
let diagnosticContext: { identity: Record<string, string>; phase: string; phaseNonce: string } | null = null;
if (diagnosticContextJson) {
  try {
    const parsed = JSON.parse(diagnosticContextJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.keys(parsed).sort().join(',') !== 'identity,phase,phaseNonce'
      || !validatePreactivationSignInIdentity(parsed.identity)
      || !PREACTIVATION_SIGN_IN_PHASES.includes(parsed.phase)
      || !/^[a-f0-9]{64}$/u.test(parsed.phaseNonce)) throw new Error();
    diagnosticContext = parsed;
  } catch { throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_CONTEXT_REJECTED'); }
}
if (!/^http:\/\/127[.]0[.]0[.]1:\d+$/u.test(tlsBridge)) {
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TLS_BRIDGE_REQUIRED');
}
if (!/^[A-Za-z0-9+/]{43}=$/u.test(certificateSpki)) {
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TLS_SPKI_REQUIRED');
}
for (const [name, value] of Object.entries({ baseURL, outputDir })) {
  if (!value) throw new Error(`AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_${name.toUpperCase()}_REQUIRED`);
}
const parsed = new URL(baseURL);
if (parsed.origin !== 'https://deploy-preview-264--avalaos-pilot.netlify.app' || parsed.pathname !== '/') {
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_BASE_URL_REJECTED');
}

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/browser',
  testMatch: 'authenticatedHostedSignInEntry.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  reporter: diagnosticContext ? [[path.resolve('scripts/preactivationSignInPlaywrightReporter.mjs'), {
    workspaceRoot: process.cwd(), ...diagnosticContext,
  }]] : 'list',
  outputDir,
  preserveOutput: 'never',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    serviceWorkers: 'block',
    launchOptions: { args: [`--ignore-certificate-errors-spki-list=${certificateSpki}`] },
    proxy: { server: tlsBridge },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
