import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/20260811120000_hosted_nonproduction_pilot_activation.sql',import.meta.url),'utf8');
const hardeningMigration=await readFile(new URL('../supabase/migrations/20260811130000_hosted_security_advisor_hardening.sql',import.meta.url),'utf8');
const applyScript=await readFile(new URL('./hostedPilotApply.mjs',import.meta.url),'utf8');
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
  assert.match(applyScript,/to_regprocedure\('public\.digest\(text,text\)'\)/);
  assert.match(applyScript,/to_regprocedure\('extensions\.digest\(text,text\)'\)/);
  assert.match(applyScript,/create or replace function public\.digest\(data text, algorithm text\)/i);
  assert.match(applyScript,/create or replace function public\.digest\(data bytea, algorithm text\)/i);
  assert.match(applyScript,/select extensions\.digest\(\$1,\$2\)/);
  assert.match(applyScript,/PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH/);
  assert.match(applyScript,/revoke all on function public\.digest\(text,text\),public\.digest\(bytea,text\) from public/i);
  assert.match(applyScript,/grant execute on function public\.digest\(text,text\),public\.digest\(bytea,text\) to service_role/i);
});
test('forward hosted hardening advances the marker without weakening stop gates',()=>{
  assert.match(hardeningMigration,/migration_tip = '20260811130000'/);
  assert.match(hardeningMigration,/NOT production_authorized/);
  assert.match(hardeningMigration,/NOT customer_data_authorized/);
  assert.match(hardeningMigration,/NOT real_provider_calls_authorized/);
});
test('database verifier derives the expected tip from canonical migration inventory',()=>{
  assert.match(verifyScript,/readdir\(new URL\('\.\.\/supabase\/migrations\/'/);
  assert.match(verifyScript,/const expectedMigrationTip = latestMigration\.slice\(0, 14\)/);
  assert.match(verifyScript,/marker\.migration_tip !== expectedMigrationTip/);
  assert.doesNotMatch(verifyScript,/marker\.migration_tip !== '20260811120000'/);
});
