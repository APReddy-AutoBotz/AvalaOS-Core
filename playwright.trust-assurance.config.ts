import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/browser',testMatch:'trustAssurance.spec.ts',workers:1,retries:1,use:{browserName:'chromium',trace:'retain-on-failure'}});
