import path from 'node:path';
import { tmpdir } from 'node:os';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser/deliveryMonitorPrC',
  testMatch: 'deliveryMonitorPrC.spec.ts',
  outputDir: path.join(tmpdir(), 'avalaos-delivery-monitor-pr-c-playwright', String(process.pid)),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:4198', trace: 'off' },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Pixel 7', use: { ...devices['Pixel 7'] } },
  ],
});
