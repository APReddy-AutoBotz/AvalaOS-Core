import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const file of ['services/processService.ts', 'services/handoffLedgerService.ts']) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.includes('createContextRequestGate'), `${file} must use the shared in-memory context gate`);
  assert.ok(source.includes('setEntries([])') || source.includes('setProcesses([])'), `${file} must clear visible data when context changes`);
  assert.equal(source.includes('localStorage'), false, `${file} must not persist scoped responses`);
  assert.equal(source.includes('sessionStorage'), false, `${file} must not persist scoped responses`);
}

console.log('client context safety: 8 service-integration, invalidation, and no-persistence assertions passed');
