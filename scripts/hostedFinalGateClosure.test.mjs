import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {assertAuthorityTableCatalog,assertOwnerOnlyEvidenceTableCatalog,HOSTED_AUTHORITY_TABLES} from './hostedPilotDatabaseVerify.mjs';

const verifier=await readFile(new URL('./hostedPilotDatabaseVerify.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/hosted-pilot-activation-evidence-producer.yml',import.meta.url),'utf8');
const bridge=await readFile(new URL('../.github/workflows/hosted-pilot-dispatch-bridge.yml',import.meta.url),'utf8');
const closureMigration=await readFile(new URL('../supabase/migrations/20260812171000_hosted_evidence_execution_gate_closure.sql',import.meta.url),'utf8');
const oidcMigration=await readFile(new URL('../supabase/migrations/20260813020000_hosted_oidc_verifier_bridge.sql',import.meta.url),'utf8');
const oidcFunction=await readFile(new URL('../supabase/functions/hosted-pilot-github-verifier/index.ts',import.meta.url),'utf8');
const supabaseConfig=await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8');
const netlifyProxy=await readFile(new URL('../netlify/functions/hosted-pilot-github-verifier-proxy.mjs',import.meta.url),'utf8');

const forbiddenHostedProjectRef='fcsfvonhvyrevwhyvano';

test('owner-controlled hosted evidence tables reject direct service-role mutation',()=>{
  const exact=['hosted_pilot_exercise_evidence_families','hosted_pilot_verification_run_results'].map(relname=>({
    relname,owner:'postgres',rls_enabled:true,force_rls:true,public_mutation:false,anon_mutation:false,authenticated_mutation:false,service_role_mutation:false,
  }));
  assert.doesNotThrow(()=>assertOwnerOnlyEvidenceTableCatalog(exact));
  assert.throws(()=>assertOwnerOnlyEvidenceTableCatalog(exact.map((row,index)=>index?{...row,service_role_mutation:true}:row)),/EVIDENCE_TABLE_ACL_MISMATCH/);
  assert.throws(()=>assertOwnerOnlyEvidenceTableCatalog(exact.slice(1)),/EVIDENCE_TABLE_ACL_MISMATCH/);
});

test('hosted authority catalog is exact and does not treat all product tables as controller tables',()=>{
  assert.equal(HOSTED_AUTHORITY_TABLES.length,20);
  const exact=HOSTED_AUTHORITY_TABLES.map(relname=>({relname,owner:'postgres',rls_enabled:true,force_rls:true,public_mutation:false,anon_mutation:false,authenticated_mutation:false}));
  assert.doesNotThrow(()=>assertAuthorityTableCatalog(exact));
  assert.throws(()=>assertAuthorityTableCatalog(exact.slice(1)),/AUTHORITY_TABLE_MISMATCH/);
  assert.throws(()=>assertAuthorityTableCatalog(exact.map((row,index)=>index?row:{...row,authenticated_mutation:true})),/AUTHORITY_TABLE_MISMATCH/);
  assert.match(verifier,/c\.relname=ANY\(\$1::text\[\]\)/);
  assert.doesNotMatch(verifier,/WHERE c\.relnamespace='public'::regnamespace AND c\.relkind IN \('r','p'\) ORDER BY c\.relname/);
});

test('database verifier inspects PUBLIC ACLs without treating PUBLIC as a login role',()=>{
  assert.doesNotMatch(verifier,/has_(?:table|function)_privilege\('PUBLIC'/);
  assert.match(verifier,/aclexplode\(coalesce\(c\.relacl,acldefault\('r',c\.relowner\)\)\)/);
  assert.match(verifier,/service_role_mutation/);
  assert.match(verifier,/assertOwnerOnlyEvidenceTableCatalog/);
});

test('producer uses short-lived GitHub OIDC through the same-site protected proxy and never requires a database URL secret',()=>{
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(workflow,/audience=avalaos-hosted-pilot/);
  assert.match(workflow,/\.netlify\/functions\/hosted-pilot-github-verifier-proxy/);
  assert.match(workflow,/HOSTED_PILOT_VERIFIER_PROXY_TARGET_INVALID/);
  assert.match(workflow,/call_verifier preflight/);
  assert.match(workflow,/call_verifier status/);
  assert.match(workflow,/call_verifier finalize/);
  assert.ok(workflow.indexOf('call_verifier preflight')<workflow.indexOf('call_verifier status'));
  assert.ok(workflow.indexOf('call_verifier status')<workflow.indexOf('call_verifier finalize'));
  assert.doesNotMatch(workflow,/HOSTED_PILOT_DATABASE_URL/);
  assert.doesNotMatch(workflow,/secrets\.HOSTED_PILOT_DATABASE_URL/);
  assert.doesNotMatch(workflow,/\.supabase\.co\/functions\/v1\/hosted-pilot-github-verifier/);
  assert.ok(!workflow.includes(forbiddenHostedProjectRef));
});

test('Netlify proxy keeps the Supabase project identifier in protected Functions configuration only and binds exact deploy truth',()=>{
  assert.match(netlifyProxy,/Netlify\.env\.get\('HOSTED_PILOT_VERIFIER_UPSTREAM'\)/);
  assert.match(netlifyProxy,/url\.hostname\.endsWith\('\.supabase\.co'\)/);
  assert.match(netlifyProxy,/url\.pathname !== '\/functions\/v1\/hosted-pilot-github-verifier'/);
  assert.match(netlifyProxy,/context\?\.deploy\?\.context !== 'production'/);
  assert.match(netlifyProxy,/context\?\.site\?\.name !== 'avalaos-pilot'/);
  assert.match(netlifyProxy,/payload\.deploymentId !== context\.deploy\.id/);
  assert.match(netlifyProxy,/x-avalaos-release/);
  assert.match(netlifyProxy,/x-avalaos-environment/);
  assert.match(netlifyProxy,/authorization/);
  assert.match(netlifyProxy,/AbortSignal\.timeout/);
  assert.ok(!netlifyProxy.includes(forbiddenHostedProjectRef));
  assert.doesNotMatch(netlifyProxy,/console\.(?:log|error)\([^)]*authorization/i);
});

test('Supabase gateway delegates authentication only for the GitHub OIDC verifier function',()=>{
  assert.match(supabaseConfig,/\[functions\.hosted-pilot-github-verifier\]\s*\nverify_jwt = false/);
  assert.match(supabaseConfig,/\[functions\.studio-private-artifact-reconcile\]\s*\nverify_jwt = false/);
});

test('OIDC verifier binds the signed token to the exact repository, workflow, immutable ref, SHA and run',()=>{
  for(const binding of [
    "const ISSUER='https://token.actions.githubusercontent.com'","const AUDIENCE='avalaos-hosted-pilot'",
    "const REPOSITORY='APReddy-AutoBotz/AvalaOS-Core'","const REPOSITORY_ID='1256880940'",
    "const WORKFLOW_PATH='.github/workflows/hosted-pilot-activation-evidence-producer.yml'",
    "claims.event_name!=='workflow_dispatch'","claims.sha!==release","claims.ref!==ref","claims.run_id!==runId",
    'claims.workflow_ref!==`${REPOSITORY}/${WORKFLOW_PATH}@${ref}`',
  ]) assert.ok(oidcFunction.includes(binding),`missing OIDC binding: ${binding}`);
  assert.match(oidcFunction,/crypto\.subtle\.verify/);
  assert.match(oidcFunction,/RSASSA-PKCS1-v1_5/);
  assert.match(oidcFunction,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(oidcFunction,/console\.log\(token|console\.error\(token/);
});

test('OIDC database bridge validates migration truth, table and privileged-RPC ACLs, fail-closed recovery and exact evidence',()=>{
  assert.match(oidcMigration,/hosted_pilot_oidc_preflight/);
  assert.match(oidcMigration,/HOSTED_PILOT_TARGET_FINGERPRINT_MISMATCH/);
  assert.match(oidcMigration,/HOSTED_PILOT_MIGRATION_LEDGER_MISMATCH/);
  assert.match(oidcMigration,/authority_table_count <> cardinality\(expected_authority_tables\)/);
  assert.match(oidcMigration,/evidence_service_mutation_count <> 0/);
  assert.match(oidcMigration,/expected_service_routines/);
  assert.match(oidcMigration,/pilot_operations_command\(uuid,uuid,uuid,text,uuid,text,text,bigint,bigint,jsonb\)/);
  assert.match(oidcMigration,/has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.match(oidcMigration,/NOT has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  assert.match(oidcMigration,/service_routine_count <> cardinality\(expected_service_routines\)/);
  assert.match(oidcMigration,/HOSTED_PILOT_RPC_ACL_MISMATCH/);
  assert.match(oidcMigration,/maintenance AND read_only/);
  assert.match(oidcMigration,/HOSTED_PILOT_RECOVERY_EVIDENCE_MISSING/);
  assert.match(oidcMigration,/HOSTED_PILOT_ROLLBACK_EVIDENCE_MISSING/);
  assert.match(oidcMigration,/hosted_pilot_record_verification_result/);
  assert.match(oidcMigration,/REVOKE ALL ON FUNCTION public\.hosted_pilot_oidc_preflight/);
  assert.match(oidcMigration,/TO service_role/);
  assert.match(oidcMigration,/migration_tip='20260813020000'/);
});

test('forward migration revokes direct service-role table authority but retains final recorder execution',()=>{
  assert.match(closureMigration,/REVOKE ALL ON TABLE public\.hosted_pilot_verification_run_results FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(closureMigration,/GRANT EXECUTE ON FUNCTION public\.hosted_pilot_record_verification_result[\s\S]+TO service_role/);
});

test('dispatch bridge launches both exact-head evidence workflows with safe string inputs',()=>{
  assert.match(bridge,/on:\s*\n\s*create:/);
  assert.match(bridge,/actions: write/);
  assert.match(bridge,/github\.actor == 'APReddy-AutoBotz'/);
  assert.match(bridge,/hosted-pilot-dispatch--/);
  assert.match(bridge,/HOSTED_PILOT_DISPATCH_NOT_CURRENT_MAIN/);
  assert.match(bridge,/git rev-parse origin\/main/);
  assert.match(bridge,/--arg ref "\$CREATED_REF"/);
  assert.doesNotMatch(bridge,/--arg ref "\$RELEASE_SHA"/);
  assert.doesNotMatch(bridge,/--arg ref 'main'/);
  assert.match(bridge,/pilot-operations\.yml\/dispatches/);
  assert.match(bridge,/hosted-pilot-activation-evidence-producer\.yml\/dispatches/);
  assert.ok(bridge.indexOf('pilot-operations.yml/dispatches') < bridge.indexOf('hosted-pilot-activation-evidence-producer.yml/dispatches'));
  assert.match(bridge,/--arg recovery_authorization_version '5'/);
  assert.doesNotMatch(bridge,/--argjson recovery_authorization_version/);
});
