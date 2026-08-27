import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',testMatch:'studioArtifacts.spec.ts',workers:1,reporter:'list',use:{baseURL:'http://127.0.0.1:4187',trace:'retain-on-failure'},projects:[{name:'chromium-desktop',use:{...devices['Desktop Chrome']}},{name:'chromium-mobile',use:{...devices['Pixel 7']}}]});
