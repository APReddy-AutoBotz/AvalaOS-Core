import { defineConfig, devices } from '@playwright/test';
import { validateHostedUrl } from './scripts/verify-hosted-pilot-evidence.mjs';

const rawUrl = process.env.HOSTED_PILOT_URL;
if (!rawUrl) throw new Error('HOSTED_PILOT_URL is required; accessibility/performance acceptance cannot silently use localhost');
const hostedOrigin = validateHostedUrl(rawUrl);

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'hostedAccessibilityPerformance.spec.ts',
  forbidOnly: true,
  retries: 0,
  timeout: 45_000,
  use: { baseURL: hostedOrigin, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'hosted-accessibility-performance-desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'hosted-accessibility-performance-pixel-7', use: { ...devices['Pixel 7'] } },
  ],
});
