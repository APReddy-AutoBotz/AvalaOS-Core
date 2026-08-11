import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdditiveMigrationPlan, classifyHostedTarget, createPreflightToken, loadCanonicalMigrationInventory, sanitizeStructuralInventory, verifyPreflightToken } from './hostedPilotActivation.mjs';

const canonical = await loadCanonicalMigrationInventory();
const base = { schemas: ['public', 'auth'], tables: [], appliedMigrations: [], authUserCount: 0 };

test('canonical migration inventory has deterministic digest and tip', () => {
  assert.match(canonical.digest, /^[0-9a-f]{64}$/);
  assert.equal(canonical.tip, canonical.migrations.at(-1).name);
  assert.equal(canonical.count, canonical.migrations.length);
});

test('dedicated empty target passes and receives additive-only full plan', () => {
  const result = classifyHostedTarget(base, canonical);
  assert.equal(result.classification, 'dedicated_empty');
  const plan = buildAdditiveMigrationPlan(result, canonical);
  assert.equal(plan.destructiveResetPermitted, false);
  assert.equal(plan.pending.length, canonical.count);
});

test('known MockMate shape and auth users fail closed', () => {
  const result = classifyHostedTarget({ ...base, tables: [{ schema: 'public', name: 'career_context_profiles' }, { schema: 'public', name: 'usage_ledger' }], authUserCount: 2 }, canonical);
  assert.equal(result.mutationAllowed, false);
  assert.ok(result.reasons.includes('known_foreign_product_schema'));
  assert.ok(result.reasons.includes('auth_users_on_uninitialized_target'));
  assert.throws(() => buildAdditiveMigrationPlan(result, canonical), /target rejected/);
});

test('stale canonical prefix is compatible and plans only forward migrations', () => {
  const first = canonical.migrations[0];
  const tables = first.creates.map(relation => { const [schema, name] = relation.split('.'); return { schema, name }; });
  const result = classifyHostedTarget({ ...base, tables, appliedMigrations: [first.name] }, canonical);
  assert.equal(result.classification, 'avalaos_compatible');
  assert.equal(buildAdditiveMigrationPlan(result, canonical).pending.length, canonical.count - 1);
});

test('dirty, reordered, unknown and partially initialized states fail closed', () => {
  const secondOnly = classifyHostedTarget({ ...base, appliedMigrations: [canonical.migrations[1].name] }, canonical);
  assert.ok(secondOnly.reasons.includes('migration_history_not_canonical_prefix'));
  const reordered = classifyHostedTarget({ ...base, appliedMigrations: [canonical.migrations[1].name, canonical.migrations[0].name] }, canonical);
  assert.ok(reordered.reasons.includes('migration_history_not_canonical_prefix'));
  const partial = classifyHostedTarget({ ...base, appliedMigrations: [canonical.migrations[0].name] }, canonical);
  if (canonical.migrations[0].creates.length) assert.ok(partial.reasons.includes('partially_initialized_or_dirty_schema'));
  assert.equal(classifyHostedTarget({ ...base, schemas: ['public', 'mockmate'] }, canonical).mutationAllowed, false);
});

test('inventory rejects unsafe identifiers rather than reflecting them', () => {
  assert.throws(() => sanitizeStructuralInventory({ ...base, tables: [{ schema: 'public', name: 'x; select secret' }] }), /unsafe identifier/);
  assert.throws(() => sanitizeStructuralInventory({ ...base, appliedMigrations: ['../../secret'] }), /invalid/);
});

test('preflight token binds release, target fingerprint, inventory and chain', () => {
  const classification = classifyHostedTarget(base, canonical);
  const args = { classification, canonical, expectedReleaseSha: 'a'.repeat(40), environmentFingerprint: 'b'.repeat(64), nonce: 'single-use-operation-id', signingKey: 'test-only-signing-key' };
  const token = createPreflightToken(args);
  const expected = { expectedReleaseSha: args.expectedReleaseSha, environmentFingerprint: args.environmentFingerprint, inventoryDigest: classification.inventoryDigest, migrationDigest: canonical.digest, nonce: args.nonce };
  assert.equal(verifyPreflightToken({ token, signingKey: args.signingKey, expected }), true);
  assert.equal(verifyPreflightToken({ token, signingKey: args.signingKey, expected: { ...expected, environmentFingerprint: 'c'.repeat(64) } }), false);
  assert.equal(verifyPreflightToken({ token: `${token}x`, signingKey: args.signingKey, expected }), false);
});
