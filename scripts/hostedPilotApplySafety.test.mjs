import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdditiveMigrationPlan, classifyHostedTarget, loadCanonicalMigrationInventory } from './hostedPilotActivation.mjs';
import { ensureHostedPgcryptoCompatibility, validateLockedTarget } from './hostedPilotApplySafety.mjs';

const canonical = await loadCanonicalMigrationInventory();
const fingerprint = 'a'.repeat(64);
const baseInventory = { schemas: ['auth', 'extensions', 'public'], tables: [], appliedMigrations: [], authUserCount: 0 };
const preflightClassification = classifyHostedTarget(baseInventory, canonical);
const preflightPlan = buildAdditiveMigrationPlan(preflightClassification, canonical);
const locked = inventory => ({ targetFingerprint: fingerprint, inventory, appliedRows: [] });

test('locked apply accepts only the unchanged connected target and canonical ledger', () => {
  assert.equal(validateLockedTarget({ lockedTarget: locked(baseInventory), preflightClassification, canonical, environmentFingerprint: fingerprint, preflightPlan }).plan.pending.length, canonical.count);
  assert.throws(() => validateLockedTarget({ lockedTarget: { ...locked(baseInventory), targetFingerprint: 'b'.repeat(64) }, preflightClassification, canonical, environmentFingerprint: fingerprint, preflightPlan }), /DATABASE_CHANGED_SINCE_PREFLIGHT/);
  for (const inventory of [
    { ...baseInventory, schemas: [...baseInventory.schemas, 'foreign_product'] },
    { ...baseInventory, tables: [{ schema: 'public', name: 'foreign_table' }] },
    { ...baseInventory, authUserCount: 1 },
    { ...baseInventory, appliedMigrations: [canonical.migrations[1].name] },
  ]) assert.throws(() => validateLockedTarget({ lockedTarget: locked(inventory), preflightClassification, canonical, environmentFingerprint: fingerprint, preflightPlan }), /DATABASE_CHANGED_SINCE_PREFLIGHT/);
});

test('locked apply rejects missing expected relations and dirty ledger checksums', () => {
  const first = canonical.migrations.find(migration => migration.creates.length > 0);
  const index = canonical.migrations.indexOf(first);
  const prefix = canonical.migrations.slice(0, index + 1);
  const expectedTables = prefix.flatMap(migration => migration.creates).map(relation => {
    const [schema, name] = relation.split('.'); return { schema, name };
  });
  const inventory = { ...baseInventory, tables: expectedTables, appliedMigrations: prefix.map(migration => migration.name) };
  const classification = classifyHostedTarget(inventory, canonical);
  const plan = buildAdditiveMigrationPlan(classification, canonical);
  const appliedRows = prefix.map(migration => ({ filename: migration.name, content_sha256: migration.sha256 }));
  const target = { targetFingerprint: fingerprint, inventory, appliedRows };
  assert.doesNotThrow(() => validateLockedTarget({ lockedTarget: target, preflightClassification: classification, canonical, environmentFingerprint: fingerprint, preflightPlan: plan }));
  assert.throws(() => validateLockedTarget({ lockedTarget: { ...target, inventory: { ...inventory, tables: expectedTables.slice(1) } }, preflightClassification: classification, canonical, environmentFingerprint: fingerprint, preflightPlan: plan }), /DATABASE_CHANGED_SINCE_PREFLIGHT/);
  assert.throws(() => validateLockedTarget({ lockedTarget: { ...target, appliedRows: [{ ...appliedRows[0], content_sha256: '0'.repeat(64) }, ...appliedRows.slice(1)] }, preflightClassification: classification, canonical, environmentFingerprint: fingerprint, preflightPlan: plan }), /DATABASE_CHANGED_SINCE_PREFLIGHT/);
});

class BridgeClient {
  constructor(failAt = -1) { this.failAt = failAt; this.calls = []; this.mutationCount = 0; }
  async query(sql, params) {
    this.calls.push(sql);
    if (sql.startsWith('select\n')) return { rows: [{ public_text_digest: false, public_bytea_digest: false, extensions_text_digest: true, extensions_bytea_digest: true }] };
    if (sql.startsWith('select exists')) return { rows: [{ present: true }] };
    if (!['begin', 'rollback', 'commit'].includes(sql)) {
      if (this.mutationCount++ === this.failAt) throw new Error('simulated interruption');
    }
    return { rows: [] };
  }
}

test('pgcrypto bridge creation and browser-role ACLs commit atomically', async () => {
  const client = new BridgeClient();
  await ensureHostedPgcryptoCompatibility(client);
  assert.equal(client.calls[1], 'begin');
  assert.equal(client.calls.at(-1), 'commit');
  const commit = client.calls.indexOf('commit');
  for (const required of ['create function public.digest(data text', 'create function public.digest(data bytea', 'from public', 'from anon', 'from authenticated', 'to service_role']) {
    assert.ok(client.calls.findIndex(sql => sql.includes(required)) > 1);
    assert.ok(client.calls.findIndex(sql => sql.includes(required)) < commit);
  }
});

test('interruptions after either CREATE or before ACL completion roll back and a clean retry converges', async () => {
  for (const failAt of [1, 2, 3]) {
    const interrupted = new BridgeClient(failAt);
    await assert.rejects(ensureHostedPgcryptoCompatibility(interrupted), /simulated interruption/);
    assert.equal(interrupted.calls.at(-1), 'rollback');
    assert.ok(!interrupted.calls.includes('commit'));
    const retry = new BridgeClient();
    assert.equal((await ensureHostedPgcryptoCompatibility(retry)).mode, 'supabase_extensions_bridge');
    assert.equal(retry.calls.at(-1), 'commit');
  }
});

test('normal public pgcrypto and pgcrypto-not-installed layouts remain mutation-free', async () => {
  for (const [state, mode] of [
    [{ public_text_digest: true, public_bytea_digest: true, extensions_text_digest: false, extensions_bytea_digest: false }, 'public_pgcrypto'],
    [{ public_text_digest: false, public_bytea_digest: false, extensions_text_digest: false, extensions_bytea_digest: false }, 'pgcrypto_not_installed_yet'],
  ]) {
    const calls = [];
    const client = { query: async sql => { calls.push(sql); return { rows: [state] }; } };
    assert.equal((await ensureHostedPgcryptoCompatibility(client)).mode, mode);
    assert.equal(calls.length, 1);
  }
});
