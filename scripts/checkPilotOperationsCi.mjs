import assert from 'node:assert/strict'; import fs from 'node:fs';
const workflow=fs.readFileSync('.github/workflows/pilot-operations.yml','utf8'), config=fs.readFileSync('playwright.pilot-operations.config.ts','utf8');
for(const value of ['permissions:','contents: read','actions: read','disposable-postgresql-16','backup-restore-recovery','browser-desktop-pixel7','evidence-manifest','LIVE_ACTIVATION_NOT_AUTHORIZED','verify-pilot-operations.mjs --authoritative'])assert.ok(workflow.includes(value),`missing CI boundary: ${value}`);
assert.doesNotMatch(workflow,/deploy|environment:\s*production|cloud credential/i); for(const value of ["devices['Desktop Chrome']","devices['Pixel 7']",'pilotOperations.spec.ts'])assert.ok(config.includes(value));
console.log('Pilot Operations CI contract: non-live jobs, exact devices, manifest, and deployment exclusion passed.');
