import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser', testMatch:'pilotOperations.spec.ts', forbidOnly:true, fullyParallel:false, workers:1, reporter:'list', outputDir:'.agent/pilot-operations-playwright',
  use:{baseURL:'http://127.0.0.1:4427',trace:'retain-on-failure',screenshot:'only-on-failure',video:'off'},
  projects:[{name:'Desktop Chrome',use:{...devices['Desktop Chrome']}},{name:'Pixel 7',use:{...devices['Pixel 7']}}],
  webServer:process.env.PILOT_OPERATIONS_EXTERNAL_SERVER==='true'?undefined:{command:'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4427 --strictPort',url:'http://127.0.0.1:4427/tests/browser/pilotOperationsHarness.html',reuseExistingServer:!process.env.CI,timeout:120_000,env:{...process.env,VITE_AVALA_RUNTIME_MODE:'automated_test',VITE_AI_EDGE_FUNCTIONS_ENABLED:'false'}},
});
