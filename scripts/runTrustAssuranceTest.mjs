import { spawnSync } from 'node:child_process';
const suites=[['types.ts','services/trustCenterModel.ts','services/trustAssurance/contracts.ts','services/trustAssurance/domain.ts','services/trustAssurance/domain.test.ts'],['types.ts','services/trustCenterModel.ts','services/trustAssurance/contracts.ts','services/trustAssurance/decoder.ts','services/trustAssurance/decoder.test.ts']];
for(const files of suites){const run=spawnSync(process.execPath,['scripts/runTypeScriptTest.mjs',...files],{stdio:'inherit'});if(run.status)process.exit(run.status)}
