import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import { buildAdditiveMigrationPlan, canonicalObjectsAtPrefix, classifyHostedTarget, createPreflightToken, extractObjectOperations, loadCanonicalMigrationInventory, normalizeRoutineIdentityArguments, sanitizeStructuralInventory, stripSqlComments, verifyPreflightToken } from './hostedPilotActivation.mjs';

const canonical = await loadCanonicalMigrationInventory();
const base = { schemas: ['public', 'auth'], tables: [], appliedMigrations: [], authUserCount: 0 };

test('canonical migration inventory has deterministic digest and tip', () => {
  assert.match(canonical.digest, /^[0-9a-f]{64}$/);
  assert.equal(canonical.tip, canonical.migrations.at(-1).name);
  assert.equal(canonical.count, canonical.migrations.length);
});

test('canonical object extraction is comment-safe, final-state aware, and PostgreSQL identity compatible',()=>{
  const sql=`-- CREATE TABLE public.phantom(id int);\n/* CREATE FUNCTION public.phantom() RETURNS void */\nCREATE TABLE public.real_table(id int);\nCREATE FUNCTION public.defaulted(p_id uuid, p_note text DEFAULT NULL, p_count int4 = 3) RETURNS void LANGUAGE sql AS 'select';\nCREATE FUNCTION public.removed(p_id uuid) RETURNS void LANGUAGE sql AS 'select';\nDROP FUNCTION public.removed(uuid);`;
  assert.doesNotMatch(stripSqlComments(sql),/phantom/);
  assert.equal(normalizeRoutineIdentityArguments('p_id uuid, p_note text DEFAULT NULL, p_count int4 = 3'),'uuid, text, integer');
  assert.deepEqual(extractObjectOperations(sql).map(op=>`${op.action}:${op.identity}`),[
    'create:public.real_table:table','create:public.defaulted(uuid, text, integer)','create:public.removed(uuid)','drop:public.removed(uuid)']);
  assert.equal(canonical.routines.some(identity=>identity.includes('legacy_untrusted')),false,'deliberately dropped legacy routines must not remain canonical');
  assert.equal(canonical.relations.some(identity=>identity.includes('IF')),false,'commented pseudo-DDL must not create phantom relations');
});

test('canonical replay models routine and relation renames in migration order',()=>{
  const first=extractObjectOperations(`
    CREATE FUNCTION public.command(p_id uuid) RETURNS void LANGUAGE sql AS 'select';
    CREATE FUNCTION public.command(p_id text) RETURNS void LANGUAGE sql AS 'select';
    ALTER FUNCTION public.command(uuid) RENAME TO command_v1;
    CREATE TABLE public."Old_queue"(id uuid);
    ALTER TABLE public."Old_queue" RENAME TO "current_queue";
  `);
  const second=extractObjectOperations(`
    CREATE OR REPLACE FUNCTION public.command_v1(p_id uuid DEFAULT gen_random_uuid()) RETURNS void LANGUAGE sql AS 'select';
    ALTER FUNCTION public.command_v1(uuid) RENAME TO command_v2;
    DROP FUNCTION public.command_v2(uuid);
  `);
  assert.deepEqual(first.filter(op=>op.action==='rename'),[
    {kind:'routine',action:'rename',identity:'public.command(uuid)',newIdentity:'public.command_v1(uuid)'},
    {kind:'relation',action:'rename',identity:'public.Old_queue',newIdentity:'public.current_queue'},
  ]);
  const afterFirst=canonicalObjectsAtPrefix([{objectOperations:first}]);
  assert.deepEqual([...afterFirst.routines].sort(),['public.command(text)','public.command_v1(uuid)']);
  assert.deepEqual([...afterFirst.relations],['public.current_queue:table']);
  const final=canonicalObjectsAtPrefix([{objectOperations:first},{objectOperations:second}]);
  assert.deepEqual([...final.routines],['public.command(text)'],'rename then drop must remove only the exact overload');
  assert.deepEqual([...final.relations],['public.current_queue:table']);
});

test('rename parsing remains comment-safe and preserves quoted lowercase identities',()=>{
  const operations=extractObjectOperations(`
    -- ALTER FUNCTION public.fake(uuid) RENAME TO leaked;
    CREATE PROCEDURE "public"."quoted_command"("p_id" uuid) LANGUAGE sql AS 'select';
    ALTER PROCEDURE "public"."quoted_command"("p_id" uuid) RENAME TO "quoted_command_v2";
  `);
  assert.deepEqual(operations.map(op=>op.action==='rename'?`${op.identity}->${op.newIdentity}`:op.identity),[
    'public.quoted_command(uuid)',
    'public.quoted_command(uuid)->public.quoted_command_v2(uuid)',
  ]);
});

test('canonical inventory hashes and counts literal migration blob bytes',async()=>{
  const crlf=canonical.migrations.find(m=>m.name==='20260720100000_pr1d_fact_source_and_create_hash_hardening.sql');
  assert.ok(crlf);
  const bytes=await readFile(`supabase/migrations/${crlf.name}`);
  assert.equal(crlf.bytes,bytes.length);
  assert.equal(crlf.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(crlf.sql.includes('\r\n'),true);
});

test('dedicated empty target passes and receives additive-only full plan', () => {
  const result = classifyHostedTarget(base, canonical);
  assert.equal(result.classification, 'dedicated_empty');
  const plan = buildAdditiveMigrationPlan(result, canonical);
  assert.equal(plan.destructiveResetPermitted, false);
  assert.equal(plan.pending.length, canonical.count);
  assert.ok(plan.pending.every((migration,index)=>migration.sql===canonical.migrations[index].sql && Buffer.byteLength(migration.sql)===migration.bytes));
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
  const args = { classification, canonical, expectedReleaseSha: 'a'.repeat(40), environmentFingerprint: `sha256:${'b'.repeat(64)}`, nonce: 'single-use-operation-id', signingKey: 'test-only-signing-key' };
  const token = createPreflightToken(args);
  const expected = { expectedReleaseSha: args.expectedReleaseSha, environmentFingerprint: args.environmentFingerprint, inventoryDigest: classification.inventoryDigest, migrationDigest: canonical.digest, nonce: args.nonce };
  assert.equal(verifyPreflightToken({ token, signingKey: args.signingKey, expected }), true);
  assert.equal(verifyPreflightToken({ token, signingKey: args.signingKey, expected: { ...expected, environmentFingerprint: `sha256:${'c'.repeat(64)}` } }), false);
  assert.equal(verifyPreflightToken({ token: `${token}x`, signingKey: args.signingKey, expected }), false);
});
