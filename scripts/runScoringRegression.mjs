import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, [
  'scripts/runTypeScriptTest.mjs',
  'services/scoringEngine.ts',
  'services/scoringEngine.test.ts',
], { stdio: 'inherit' });
