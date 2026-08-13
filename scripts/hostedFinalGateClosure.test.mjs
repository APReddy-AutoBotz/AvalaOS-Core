import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {assertOwnerOnlyEvidenceTableCatalog} from './hostedPilotDatabaseVerify.mjs';

const verifier=await readFile(new URL('./hostedPilotDatabaseVerify.mjs',import.meta.url),'utf8');
const waiter=await readFile(new URL('./wait-hosted-pilot-evidence-families.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/hosted-pilot-activation-evidence-producer.yml',import.meta.url),'utf8');
const bridge=await readFile(new URL('../.github/workflows/hosted-pilot-dispatch-bridge.yml',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20260812171000_hosted_evidence_execution_gate_closure.sql',import.meta.url),'utf8');

test('owner-controlled hosted evidence tables reject direct service-role mutation',()=>{
  const exact=['hosted_pilot_exercise_evidence_families','hosted_pilot_verification_run_results'].map(relname=>({
    relname,owner:'postgres',rls_enabled:true,force_rls:true,public_mutation:false,anon_mutation:false,authenticated_mutation:false,service_role_mutation:false,
  }));
  assert.doesNotThrow(()=>assertOwnerOnlyEvidenceTableCatalog(exact));
  assert.throws(()=>assertOwnerOnlyEvidenceTableCatalog(exact.map((row,index)=>index?{...row,service_role_mutation:true}:row)),/EVIDENCE_TABLE_ACL_MISMATCH/);
  assert.throws(()=>assertOwnerOnlyEvidenceTableCatalog(exact.slice(1)),/EVIDENCE_TABLE_ACL_MISMATCH/);
});

test('database verifier inspects PUBLIC ACLs without treating PUBLIC as a login role',()=>{
  assert.doesNotMatch(verifier,/has_(?:table|function)_privilege\('PUBLIC'/);
  assert.match(verifier,/aclexplode\(coalesce\(c\.relacl,acldefault\('r',c\.relowner\)\)\)/);
  assert.match(verifier,/service_role_mutation/);
  assert.match(verifier,/assertOwnerOnlyEvidenceTableCatalog/);
});

test('producer compares live preflight fingerprint before any evidence mutation and then waits for owner proof',()=>{
  const preflight=workflow.indexOf('ACTUAL_TARGET_FINGERPRINT');
  const compare=workflow.indexOf('HOSTED_PILOT_TARGET_FINGERPRINT_MISMATCH');
  const wait=workflow.indexOf('wait-hosted-pilot-evidence-families.mjs');
  const record=workflow.indexOf('record-hosted-pilot-executed-evidence.mjs');
  assert.ok(preflight>0&&compare>preflight&&wait>compare&&record>wait);
});

test('owner evidence wait is exact-run bound, bounded and complete',()=>{
  for(const family of ['tenant-adversarial','provider-simulation-zero-egress','canonical-journey','backup-restore','recovery-rollback']) assert.match(waiter,new RegExp(`'${family}'`));
  for(const binding of ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','HOSTED_PILOT_TARGET_FINGERPRINT','HOSTED_PILOT_EXERCISE_RUN_ID']) assert.match(waiter,new RegExp(binding));
  assert.match(waiter,/HOSTED_PILOT_EVIDENCE_WAIT_TIMEOUT/);
  assert.match(waiter,/HOSTED_PILOT_EVIDENCE_BINDING_CONFLICT/);
});

test('forward migration revokes direct service-role table authority but retains final recorder execution',()=>{
  assert.match(migration,/REVOKE ALL ON TABLE public\.hosted_pilot_verification_run_results FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.hosted_pilot_record_verification_result[\s\S]+TO service_role/);
  assert.match(migration,/migration_tip='20260812171000'/);
});

test('dispatch bridge is owner-only, current-main-only and passes exact non-production inputs',()=>{
  assert.match(bridge,/on:\s*\n\s*create:/);
  assert.match(bridge,/actions: write/);
  assert.match(bridge,/github\.actor == 'APReddy-AutoBotz'/);
  assert.match(bridge,/hosted-pilot-dispatch--/);
  assert.match(bridge,/HOSTED_PILOT_DISPATCH_NOT_CURRENT_MAIN/);
  assert.match(bridge,/git rev-parse origin\/main/);
  assert.match(bridge,/--arg ref 'main'/);
  assert.doesNotMatch(bridge,/--arg ref "\$RELEASE_SHA"/);
  assert.match(bridge,/hosted-pilot-activation-evidence-producer\.yml\/dispatches/);
  for(const value of [
    'sha256:865561c471b54b7df5e92a5ee29cc66a7a739d39c6b27bef93781830b7c7aaed',
    'https://avalaos-pilot.netlify.app',
    '24de1bb5-ad49-4224-80b1-9d26b6dcfc15',
    '06165d6f-19c9-4a0c-8847-f9cb6c63e9d2',
    '6d65da73-84b0-4eb3-9be5-d7f1e53c0151',
  ]) assert.match(bridge,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(bridge,/--argjson recovery_authorization_version 5/);
});
