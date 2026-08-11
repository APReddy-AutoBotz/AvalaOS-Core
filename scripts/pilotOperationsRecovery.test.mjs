import assert from 'node:assert/strict';
import { createDisposableBackup, evaluateRecoveryReplay, verifyDisposableBackup } from './pilotOperationsRecovery.mjs';

const records = Object.fromEntries(['organizations', 'workspaces', 'memberships', 'releaseCandidates', 'environments', 'approvals', 'receipts', 'auditEvents'].map((name, index) => [name, [{ id: `${name}_${index}`, synthetic: true, status: 'retained' }]]));
const expected = { schemaVersion: 'pilot-operations-2026-08', environmentBinding: 'env_123456789abc' };
const backup = createDisposableBackup({ ...expected, records });
const verified = verifyDisposableBackup(backup, expected);
assert.equal(verified.accepted, true);
assert.equal(verified.requiredRestoreMode, 'clean_disposable_read_only');
assert.equal(verified.authorityMintCount, 0);

const clone = value => structuredClone(value);
const corruptions = [
  bundle => { bundle.payload.records.approvals[0].status = 'changed'; },
  bundle => { bundle.manifest.byteLength -= 1; },
  bundle => { bundle.manifest.schemaVersion = 'pilot-operations-2026-09'; },
  bundle => { bundle.payload.environmentBinding = 'env_abcdefghijkl'; },
  bundle => { delete bundle.payload.records.auditEvents; },
  bundle => { bundle.manifest.collectionCounts.receipts = 99; },
  bundle => { bundle.payload.records.environments[0].databaseUrl = 'postgresql://example.invalid/db'; },
  bundle => { bundle.payload.records.environments[0].detail = 'https://example.invalid/x?token=raw'; },
];
for (const corrupt of corruptions) {
  const changed = clone(backup); corrupt(changed);
  const result = verifyDisposableBackup(changed, expected);
  assert.equal(result.accepted, false);
  assert.equal(result.restoreMutationCount, 0);
  assert.equal(result.authorityMintCount, 0);
}

assert.throws(() => createDisposableBackup({ ...expected, records: { ...records, receipts: [{ secretRef: 'not-allowed' }] } }), /BACKUP_CONTAINS_PROHIBITED_DATA/);

assert.deepEqual(evaluateRecoveryReplay({ receiptStatus: 'committed', requestDigest: 'same', committedDigest: 'same', currentlyAuthorized: true, environmentActive: true }), { code: 'EXACT_REPLAY', disclosed: true, effectDelta: 0, auditDelta: 0 });
assert.deepEqual(evaluateRecoveryReplay({ receiptStatus: 'effect_committed', requestDigest: 'same', committedDigest: 'same', currentlyAuthorized: true, environmentActive: true }), { code: 'RECONCILED', disclosed: true, effectDelta: 0, auditDelta: 0 });
for (const replay of [
  { receiptStatus: 'committed', requestDigest: 'same', committedDigest: 'same', currentlyAuthorized: false, environmentActive: true },
  { receiptStatus: 'committed', requestDigest: 'same', committedDigest: 'same', currentlyAuthorized: true, environmentActive: false },
  { receiptStatus: 'committed', requestDigest: 'changed', committedDigest: 'same', currentlyAuthorized: true, environmentActive: true },
]) {
  const result = evaluateRecoveryReplay(replay);
  assert.equal(result.disclosed, false);
  assert.equal(result.effectDelta, 0);
  assert.equal(result.auditDelta, 0);
}

console.log('Pilot Operations recovery: verified backup plus 12 corruption, leakage, and replay failures passed.');
