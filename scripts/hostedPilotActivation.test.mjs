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
  const tables = first.creates.map(relation => { const [qualified,kindName] = relation.split(':'); const [schema,name]=qualified.split('.'); const kinds={table:'r',view:'v',materialized_view:'m',sequence:'S',foreign_table:'f'}; return { schema,name,kind:kinds[kindName] }; });
  const result = classifyHostedTarget({ ...base, tables, appliedMigrations: [first.name] }, canonical);
  assert.equal(result.classification, 'avalaos_compatible');
  assert.equal(buildAdditiveMigrationPlan(result, canonical).pending.length, canonical.count - 1);
});

test('repository and Supabase migration ledgers are canonical infrastructure, not foreign schemas', () => {
  const result = classifyHostedTarget({ ...base, schemas: [...base.schemas, 'avalaos_migrations', 'supabase_migrations'] }, canonical);
  assert.equal(result.mutationAllowed, true);
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

test('relations introduced after the recorded ledger prefix fail closed and clean retry remains valid', () => {
  const laterIndex = canonical.migrations.findIndex((migration, index) => index > 0 && migration.creates.length > 0);
  assert.ok(laterIndex > 0, 'fixture requires a later canonical relation');
  const later = canonical.migrations[laterIndex].creates[0];
  const [qualified,kindName] = later.split(':'); const [schema,name]=qualified.split('.'); const kind={table:'r',view:'v',materialized_view:'m',sequence:'S',foreign_table:'f'}[kindName];
  for (const appliedMigrations of [[], canonical.migrations.slice(0, laterIndex).map(migration => migration.name)]) {
    const result = classifyHostedTarget({ ...base, tables: [{ schema, name, kind }], appliedMigrations }, canonical);
    assert.equal(result.mutationAllowed, false);
    assert.ok(result.reasons.includes('relations_ahead_of_migration_ledger'));
  }
  const cleanPrefix = canonical.migrations.slice(0, laterIndex + 1);
  const cleanTables = [...new Set(cleanPrefix.flatMap(migration => migration.creates))].map(relation => {
    const [qualifiedName,kindName]=relation.split(':'); const [tableSchema,tableName]=qualifiedName.split('.'); const kinds={table:'r',view:'v',materialized_view:'m',sequence:'S',foreign_table:'f'}; return {schema:tableSchema,name:tableName,kind:kinds[kindName]};
  });
  assert.equal(classifyHostedTarget({ ...base, tables: cleanTables, appliedMigrations: cleanPrefix.map(migration => migration.name) }, canonical).mutationAllowed, true);
});


test('foreign executable and non-table objects cannot masquerade as a dedicated target',()=>{
  assert.equal(classifyHostedTarget({...base,routines:[{schema:'public',name:'foreign_rpc',arguments:'',owner:'attacker',acl:'=X/attacker'}]},canonical).mutationAllowed,false);
  assert.equal(classifyHostedTarget({...base,tables:[{schema:'public',name:'foreign_view',kind:'v',owner:'attacker'}]},canonical).mutationAllowed,false);
  const canonicalRoutine=canonical.migrations.find(m=>m.routines?.length)?.routines[0];
  if(canonicalRoutine){
    const match=/^([^.]+)\.([^()]+)\((.*)\)$/.exec(canonicalRoutine);
    const result=classifyHostedTarget({...base,routines:[{schema:match[1],name:match[2],arguments:match[3],owner:'attacker',acl:'=X/attacker'}]},canonical);
    assert.ok(result.reasons.includes('foreign_object_authority'));
  }
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
