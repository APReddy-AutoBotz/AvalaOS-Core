import path from 'node:path';
import { tmpdir } from 'node:os';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser/studioPrB',testMatch:'studioPrB.spec.ts',globalTeardown:'./tests/browser/studioPrB/globalTeardown.mjs',outputDir:path.join(tmpdir(),'avalaos-studio-pr-b-playwright',String(process.pid)),workers:1,fullyParallel:false,retries:0,timeout:90_000,reporter:'line',use:{baseURL:'http://127.0.0.1:4197',trace:'off'},projects:[{name:'Desktop Chrome',use:{...devices['Desktop Chrome']}},{name:'Pixel 7',use:{...devices['Pixel 7']}}],webServer:{command:'node tests/browser/studioPrB/server.mjs',url:'http://127.0.0.1:4197/tests/browser/studioPrB/harness.html',reuseExistingServer:false,timeout:120_000}});
