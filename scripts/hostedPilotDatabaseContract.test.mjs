import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertAuthorityTableCatalog, assertExactMigrationLedger, assertSecurityDefinerCatalog, assertServiceOnlyRoutineCatalog, SERVICE_ONLY_HOSTED_RPCS } from './hostedPilotDatabaseVerify.mjs';
import { CATALOG_LIMITS, inventoryConnectedHostedTarget } from './hostedPilotDatabaseInventory.mjs';

const migration=await readFile(new URL('../supabase/migrations/20260811120000_hosted_nonproduction_pilot_activation.sql',import.meta.url),'utf8');
const hardeningMigration=await readFile(new URL('../supabase/migrations/20260811130000_hosted_security_advisor_hardening.sql',import.meta.url),'utf8');
const recoveryOperatorMigration=await readFile(new URL('../supabase/migrations/20260811140000_hosted_recovery_promotion_operator.sql',import.meta.url),'utf8');
const closureMigration=await readFile(new URL('../supabase/migrations/20260811160000_hosted_closure_root_convergence.sql',import.meta.url),'utf8');
const verificationMigration=await readFile(new URL('../supabase/migrations/20260811170000_hosted_verification_run_evidence.sql',import.meta.url),'utf8');
const identityConvergenceMigration=await readFile(new URL('../supabase/migrations/20260811180000_hosted_forward_migration_identity_convergence.sql',import.meta.url),'utf8');
const recoveryAuthorityMigration=await readFile(new URL('../supabase/migrations/20260811150000_hosted_recovery_operator_authority_convergence.sql',import.meta.url),'utf8');
const applyScript=await readFile(new URL('./hostedPilotApply.mjs',import.meta.url),'utf8');
const applySafety=await readFile(new URL('./hostedPilotApplySafety.mjs',import.meta.url),'utf8');
const verifyScript=await readFile(new URL('./hostedPilotDatabaseVerify.mjs',import.meta.url),'utf8');

test('identity and mutation surfaces fail closed',()=>{
  assert.match(migration,/product_key = 'avalaos-core'/);
  assert.match(migration,/CHECK \(NOT production_authorized\)/);
  assert.match(migration,/HOSTED_PILOT_IDENTITY_MISMATCH/);
  assert.match(migration,/FORCE ROW LEVEL SECURITY/g);
  assert.match(migration,/FROM PUBLIC,anon,authenticated/);
});
test('bootstrap is bounded, synthetic, idempotent and deprovisionable',()=>{
  for(const role of ['owner','operator','reviewer','revoked','cross_tenant']) assert.match(migration,new RegExp(`'${role}'`));
  assert.match(migration,/synthetic_only boolean NOT NULL DEFAULT true CHECK \(synthetic_only\)/);
  assert.match(migration,/ON CONFLICT\(org_id,workspace_id,subject_key\) DO UPDATE/);
  assert.match(migration,/p_operation NOT IN \('bootstrap','deprovision','replay'\)/);
});
test('provider simulator is deterministic and cannot perform egress',()=>{
  assert.match(migration,/avalaos-deterministic-simulator-v1/);
  assert.match(migration,/zero_egress boolean NOT NULL DEFAULT true CHECK \(zero_egress\)/);
  assert.match(migration,/'realProviderCalled',false/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/hosted_pilot_provider_simulations_immutable/);
  assert.doesNotMatch(migration,/https?:\/\//i);
  assert.doesNotMatch(migration,/openai|anthropic|gemini|groq|azure/i);
});
test('hosted apply bridges Supabase pgcrypto schema without weakening authority',()=>{
  assert.match(applySafety,/to_regprocedure\('public\.digest\(text,text\)'\)/);
  assert.match(applySafety,/to_regprocedure\('extensions\.digest\(text,text\)'\)/);
  assert.match(applySafety,/begin[\s\S]+create function public\.digest\(data text[\s\S]+create function public\.digest\(data bytea[\s\S]+revoke all[\s\S]+grant execute[\s\S]+commit/i);
  assert.match(applySafety,/select extensions\.digest\(\$1,\$2\)/);
  assert.match(applySafety,/PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH/);
  assert.match(applySafety,/protectedSchemas[\s\S]+revoke all on function \${schema}\.digest/);
  assert.match(applySafety,/\['extensions','public'\]/);
  assert.match(applySafety,/grant execute on function \${schema}\.digest\(text,text\),\${schema}\.digest\(bytea,text\) to service_role/i);
});
test('hosted apply re-inventories and binds the live target while holding the advisory lock',()=>{
  assert.match(applyScript,/pg_advisory_lock[\s\S]+inventoryConnectedHostedTarget[\s\S]+validateLockedTarget[\s\S]+ensureHostedPgcryptoCompatibility/);
  assert.match(applySafety,/targetFingerprint !== environmentFingerprint/);
  assert.match(applySafety,/inventoryDigest !== preflightClassification\.inventoryDigest/);
  assert.match(applySafety,/content_sha256 !== canonical\.migrations/);
});
test('forward hosted hardening advances the marker without weakening stop gates',()=>{
  assert.match(hardeningMigration,/migration_tip = '20260811130000'/);
  assert.match(hardeningMigration,/NOT production_authorized/);
  assert.match(hardeningMigration,/NOT customer_data_authorized/);
  assert.match(hardeningMigration,/NOT real_provider_calls_authorized/);
});
test('dedicated recovery operator is synthetic, promotion-only, tenant-bound and non-production',()=>{
  assert.match(recoveryOperatorMigration,/hosted_pilot_recovery_operators/);
  assert.match(recoveryOperatorMigration,/SYNTHETIC_IDENTITY_REQUIRED/);
  assert.match(recoveryOperatorMigration,/RECOVERY_OPERATOR_AUTHORITY_INVALID/);
  assert.match(recoveryOperatorMigration,/SEPARATION_OF_DUTY_REQUIRED/);
  assert.match(recoveryOperatorMigration,/capability_key IN \('operations\.read','release\.promote'\)/);
  assert.doesNotMatch(recoveryOperatorMigration,/capability_key IN \([^)]*(?:release\.approve|org\.admin|byok\.manage|provider\.manage)/);
  for(const boundary of ['production_authorized','customer_data_authorized','real_provider_calls_authorized']) assert.match(recoveryOperatorMigration,new RegExp(`NOT ${boundary}`));
  assert.match(recoveryOperatorMigration,/migration_tip='20260811140000'/);
});
test('recovery authority is exact-workspace provisioned and checked before rollback delegation',()=>{
  assert.match(recoveryAuthorityMigration,/'workspace','\[\]','active'/);
  assert.match(recoveryAuthorityMigration,/UPDATE public\.workspace_memberships SET role_id=recovery_role/);
  assert.match(recoveryAuthorityMigration,/Hosted Recovery Identity/);
  assert.match(recoveryAuthorityMigration,/DELETE FROM public\.role_capabilities WHERE role_id=identity_role/);
  assert.match(recoveryAuthorityMigration,/WHERE org_id=p_org AND workspace_id=p_workspace AND actor_id=p_actor AND lifecycle='active'/);
  assert.match(recoveryAuthorityMigration,/FOR UPDATE/);
  assert.match(recoveryAuthorityMigration,/hosted-recovery:'\|\|p_org::text\|\|':'\|\|p_workspace::text/);
  const operatorGate=recoveryAuthorityMigration.indexOf("WHERE org_id=p_org AND workspace_id=p_workspace AND actor_id=p_actor AND lifecycle='active'");
  const delegate=recoveryAuthorityMigration.indexOf('RETURN public.pilot_operations_command_v7');
  assert.ok(operatorGate>0 && delegate>operatorGate,'active exact-workspace operator gate must precede receipt/lifecycle delegation');
  assert.doesNotMatch(recoveryAuthorityMigration,/scope,'organization','\[\]','active',false,p_actor,p_actor\)\s*ON CONFLICT[^;]+RETURNING id INTO recovery_role/s);
  for(const boundary of ['production_authorized','customer_data_authorized','real_provider_calls_authorized']) assert.match(recoveryAuthorityMigration,new RegExp(`NOT ${boundary}`));
  assert.match(recoveryAuthorityMigration,/migration_tip='20260811150000'/);
});

test('closure migration enforces immutable historical SoD and exclusive recovery rotation',()=>{
  assert.match(closureMigration,/UNIQUE INDEX hosted_pilot_one_active_recovery_owner[\s\S]+WHERE lifecycle='active'/);
  assert.match(closureMigration,/SET role_id=NULL[\s\S]+lifecycle='revoked'/);
  assert.match(closureMigration,/event_type IN \('approved','promoted_non_live'\)/);
  assert.doesNotMatch(closureMigration,/DECLARE candidate_id uuid/);
  assert.match(closureMigration,/e\.candidate_id=rollback_candidate_id/);
  const operatorGate=closureMigration.indexOf("lifecycle='active' AND synthetic_only");
  const currentAuthorityGate=closureMigration.indexOf("'release.promote',p_authorization_version");
  const historyGate=closureMigration.indexOf("event_type IN ('approved','promoted_non_live')");
  const delegate=closureMigration.indexOf('RETURN public.pilot_operations_command_v8');
  assert.ok(currentAuthorityGate>0&&operatorGate>currentAuthorityGate&&historyGate>operatorGate&&delegate>historyGate);
  assert.match(closureMigration,/migration_tip='20260811160000'/);
});

test('database verification requires the exact ordered canonical ledger',()=>{
  const canonical={migrations:[{name:'20260101000000_a.sql',sha256:'a'.repeat(64)},{name:'20260101000001_b.sql',sha256:'b'.repeat(64)}]};
  const exact=canonical.migrations.map(({name,sha256})=>({filename:name,content_sha256:sha256}));
  assert.doesNotThrow(()=>assertExactMigrationLedger(exact,canonical));
  for(const rows of [exact.slice(0,1),[exact[1],exact[0]],[exact[0],{...exact[1],content_sha256:'c'.repeat(64)}],[...exact,{filename:'20260101000002_c.sql',content_sha256:'c'.repeat(64)}]])
    assert.throws(()=>assertExactMigrationLedger(rows,canonical),/LEDGER_MISMATCH/);
});

test('database verification blocks browser ACL drift on every service-only hosted RPC',()=>{
  const exact=SERVICE_ONLY_HOSTED_RPCS.map(identity=>({identity,owner:'postgres',security_definer:true,safe_search_path:true,public_execute:false,anon_execute:false,authenticated_execute:false,service_role_execute:true}));
  assert.doesNotThrow(()=>assertServiceOnlyRoutineCatalog(exact));
  for(const role of ['public_execute','anon_execute','authenticated_execute']) {
    const drift=exact.map((row,index)=>index===0?{...row,[role]:true}:row);
    assert.throws(()=>assertServiceOnlyRoutineCatalog(drift),/RPC_ACL_MISMATCH/);
  }
  assert.throws(()=>assertServiceOnlyRoutineCatalog(exact.slice(1)),/RPC_ACL_MISMATCH/);
  assert.throws(()=>assertServiceOnlyRoutineCatalog(exact.map((row,index)=>index===0?{...row,safe_search_path:false}:row)),/RPC_ACL_MISMATCH/);
});

test('database verifier derives the expected tip from canonical migration inventory',()=>{
  assert.match(verifyScript,/loadCanonicalMigrationInventory/);
  assert.match(verifyScript,/const expectedMigrationTip = canonical\.tip\.slice\(0, 14\)/);
  assert.match(verifyScript,/marker\.migration_tip !== expectedMigrationTip/);
  assert.match(verifyScript,/assertExactMigrationLedger\(ledger, canonical\)/);
  assert.doesNotMatch(verifyScript,/marker\.migration_tip !== '20260811120000'/);
});

test('complete authority catalogs reject omitted or browser-mutable tables and unsafe definers',()=>{
  const tables=[{owner:'postgres',rls_enabled:true,force_rls:true,public_mutation:false,anon_mutation:false,authenticated_mutation:false}];
  assert.doesNotThrow(()=>assertAuthorityTableCatalog(tables));
  assert.throws(()=>assertAuthorityTableCatalog([]),/AUTHORITY_TABLE/);
  assert.throws(()=>assertAuthorityTableCatalog([{...tables[0],authenticated_mutation:true}]),/AUTHORITY_TABLE/);
  const definers=[{owner:'postgres',safe_search_path:true,public_execute:false,anon_execute:false}];
  assert.doesNotThrow(()=>assertSecurityDefinerCatalog(definers));
  assert.throws(()=>assertSecurityDefinerCatalog([{...definers[0],public_execute:true}]),/SECURITY_DEFINER/);
});

test('hosted verification evidence is exact workspace and exercise-run bound',()=>{
  assert.match(verificationMigration,/PRIMARY KEY\(org_id,workspace_id,exercise_run_id\)/);
  assert.match(verificationMigration,/IDEMPOTENCY_CONFLICT/);
  assert.match(verificationMigration,/tenant_adversarial[\s\S]+provider_zero_egress[\s\S]+recovery_rollback/);
  assert.match(verifyScript,/exercise_run_id=\$4/);
  assert.match(verifyScript,/operator\.org_id=\$2 AND operator\.workspace_id=\$3/);
});

test('operational identity follows the DB-owned migration ledger instead of a stale literal tip',()=>{
  assert.match(identityConvergenceMigration,/CREATE OR REPLACE FUNCTION public\.hosted_pilot_assert_current_identity\(\)/);
  assert.match(identityConvergenceMigration,/FROM avalaos_migrations\.applied[\s\S]+ORDER BY filename DESC LIMIT 1/);
  assert.match(identityConvergenceMigration,/marker\.migration_tip<>latest_tip/);
  assert.match(identityConvergenceMigration,/marker\.product_key<>'avalaos-core'/);
  for(const boundary of ['production_authorized','customer_data_authorized','real_provider_calls_authorized'])
    assert.match(identityConvergenceMigration,new RegExp(`marker\\.${boundary}`));
  assert.equal((identityConvergenceMigration.match(/PERFORM public\.hosted_pilot_assert_current_identity\(\)/g)??[]).length,2);
  assert.doesNotMatch(identityConvergenceMigration,/migration_tip='202608111[67]0000'/);
  assert.match(identityConvergenceMigration,/migration_tip='20260811180000'/);
  assert.match(identityConvergenceMigration,/REVOKE ALL ON FUNCTION public\.hosted_pilot_assert_current_identity\(\) FROM PUBLIC,anon,authenticated,service_role/);
});

test('catalog inventory applies hard ceilings before detail materialization',()=>{
  assert.ok(CATALOG_LIMITS.relations<=512 && CATALOG_LIMITS.routines<=1024 && CATALOG_LIMITS.payloadBytes<=2_000_000);
});

test('oversized catalogs fail before relation or routine details are fetched',async()=>{
  let detailFetched=false;
  const client={query:async sql=>{
    if(String(sql).startsWith('set statement_timeout')) return {rows:[]};
    if(String(sql).includes('pg_control_system')) return {rows:[{system_identifier:'s',database_name:'d',database_role:'r'}]};
    if(String(sql).includes('select count(*) from pg_namespace')) return {rows:[{schemas:2,relations:CATALOG_LIMITS.relations+1,routines:0}]};
    detailFetched=true; return {rows:[]};
  }};
  await assert.rejects(inventoryConnectedHostedTarget(client),/CATALOG_RELATIONS_LIMIT/);
  assert.equal(detailFetched,false);
});

test('migration apply uses exact Git-tree bytes rather than mutable worktree SQL',()=>{
  assert.match(applyScript,/loadCanonicalMigrationInventoryFromGit\(checkoutReleaseSha\)/);
  assert.match(applyScript,/const sql = migration\.sql/);
  assert.doesNotMatch(applyScript,/readFile\(new URL\(`\.\.\/supabase\/migrations/);
});
