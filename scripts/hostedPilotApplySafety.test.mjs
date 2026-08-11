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
  constructor(failAt = -1, rows) { this.failAt = failAt; this.calls = []; this.mutationCount = 0; this.rows = rows ?? nativeRows('extensions'); }
  async query(sql, params) {
    this.calls.push(sql);
    if (sql.startsWith('select n.nspname')) {
      if (this.calls.includes('revoke all on function public.digest(text,text),public.digest(bytea,text) from public')) {
        let verified = this.rows.filter(row => row.schema_name === 'public');
        if (verified.length === 0) verified = bridgeRows();
        return { rows: [...verified.map(row => ({ ...row, public_execute: false, anon_execute: false, authenticated_execute: false, service_execute: true })), ...this.rows.filter(row => row.schema_name === 'extensions')] };
      }
      return { rows: this.rows };
    }
    if (sql.startsWith('select exists')) return { rows: [{ present: true }] };
    if (!['begin', 'rollback', 'commit'].includes(sql)) {
      if (this.mutationCount++ === this.failAt) throw new Error('simulated interruption');
    }
    return { rows: [] };
  }
}

const baseRow = (schema, args) => ({ schema_name: schema, identity_arguments: args, language_name: 'c', source: 'digest', provolatile: 'i', proisstrict: true, proparallel: 's', configuration: [], owner_name: 'postgres', current_user_name: 'postgres', extension_name: 'pgcrypto', extension_owner: 'postgres', public_execute: true, anon_execute: true, authenticated_execute: true, service_execute: true });
const nativeRows = schema => ['bytea, text', 'text, text'].map(args => baseRow(schema, args));
const bridgeRows = () => ['bytea, text', 'text, text'].map(args => ({ ...baseRow('public', args), language_name: 'sql', source: 'select extensions.digest($1,$2)', configuration: ['search_path=pg_catalog, extensions'], extension_name: null, extension_owner: null }));

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

test('approved existing native and bridge implementations receive atomic least-privilege ACL repair', async () => {
  for (const [rows, mode] of [
    [nativeRows('public'), 'public_pgcrypto'],
    [[...bridgeRows(), ...nativeRows('extensions')], 'supabase_extensions_bridge'],
  ]) {
    const client = new BridgeClient(-1, rows);
    assert.equal((await ensureHostedPgcryptoCompatibility(client)).mode, mode);
    assert.ok(client.calls.includes('begin'));
    assert.ok(client.calls.some(sql => sql.includes('from public')));
    assert.equal(client.calls.at(-1), 'commit');
  }
});

test('pgcrypto-not-installed is mutation-free and unknown or attacker overloads fail closed', async () => {
  const absent = new BridgeClient(-1, []);
  assert.equal((await ensureHostedPgcryptoCompatibility(absent)).mode, 'pgcrypto_not_installed_yet');
  assert.equal(absent.calls.length, 1);
  const hostileCases = [
    [baseRow('public', 'text, text')],
    nativeRows('public').map(row => ({ ...row, extension_name: null, extension_owner: null, language_name: 'sql', source: 'select evil.digest($1,$2)' })),
    [...bridgeRows().map(row => ({ ...row, owner_name: 'attacker' })), ...nativeRows('extensions')],
    [...bridgeRows(), ...nativeRows('extensions').map(row => ({ ...row, extension_name: 'other_extension' }))],
  ];
  for (const rows of hostileCases) {
    const client = new BridgeClient(-1, rows);
    await assert.rejects(ensureHostedPgcryptoCompatibility(client), /PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH/);
    assert.ok(!client.calls.includes('begin'));
  }
});

test('ACL verification failure rolls back rather than exposing browser execution', async () => {
  const client = new BridgeClient();
  const original = client.query.bind(client);
  client.query = async (sql, params) => {
    const result = await original(sql, params);
    if (sql.startsWith('select n.nspname') && client.calls.includes('begin')) result.rows = [...bridgeRows(), ...nativeRows('extensions')];
    return result;
  };
  await assert.rejects(ensureHostedPgcryptoCompatibility(client), /PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH/);
  assert.equal(client.calls.at(-1), 'rollback');
});
