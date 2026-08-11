import { defineConfig, devices } from '@playwright/test';

const rawUrl = process.env.HOSTED_PILOT_URL;
if (!rawUrl) throw new Error('HOSTED_PILOT_URL is required; hosted acceptance cannot silently use localhost');
const url = new URL(rawUrl);
const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1'
  || /^127(?:\.|$)/.test(hostname) || /^::ffff:(?:127\.|7f[0-9a-f]{2}:)/i.test(hostname);
if (url.protocol !== 'https:' || url.username || url.password || loopback || !hostname.includes('.')) {
  throw new Error('HOSTED_PILOT_URL must be a credential-free hosted HTTPS origin');
}

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'hostedPilot.spec.ts',
  forbidOnly: true,
  retries: 0,
  timeout: 45_000,
  use: { baseURL: url.origin, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'hosted-desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'hosted-pixel-7', use: { ...devices['Pixel 7'] } },
  ],
});
