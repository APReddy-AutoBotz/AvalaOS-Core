import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/20260811120000_hosted_nonproduction_pilot_activation.sql',import.meta.url),'utf8');
const hardeningMigration=await readFile(new URL('../supabase/migrations/20260811130000_hosted_security_advisor_hardening.sql',import.meta.url),'utf8');
const recoveryOperatorMigration=await readFile(new URL('../supabase/migrations/20260811140000_hosted_recovery_promotion_operator.sql',import.meta.url),'utf8');
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
  assert.match(applySafety,/revoke all on function public\.digest\(text,text\),public\.digest\(bytea,text\) from public/i);
  assert.match(applySafety,/grant execute on function public\.digest\(text,text\),public\.digest\(bytea,text\) to service_role/i);
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
test('database verifier derives the expected tip from canonical migration inventory',()=>{
  assert.match(verifyScript,/readdir\(new URL\('\.\.\/supabase\/migrations\/'/);
  assert.match(verifyScript,/const expectedMigrationTip = latestMigration\.slice\(0, 14\)/);
  assert.match(verifyScript,/marker\.migration_tip !== expectedMigrationTip/);
  assert.doesNotMatch(verifyScript,/marker\.migration_tip !== '20260811120000'/);
});
