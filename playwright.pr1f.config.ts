import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',testMatch:'pr1f.spec.ts',use:{browserName:'chromium'},workers:1});
