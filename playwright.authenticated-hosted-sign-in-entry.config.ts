import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_APP_URL ?? '';
const outputDir = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_OUTPUT_DIR ?? '';
const certificateSpki = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TLS_SPKI ?? '';
const tlsBridge = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TLS_BRIDGE ?? '';
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
  reporter: 'list',
  outputDir,
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
