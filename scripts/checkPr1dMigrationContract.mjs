import fs from 'node:fs';
import assert from 'node:assert/strict';

const foundation = fs.readFileSync(
  'supabase/migrations/20260714120000_pr1d_assess_v2_decision_intelligence.sql',
  'utf8',
);
const correction = fs.readFileSync(
  'supabase/migrations/20260715120000_pr1d_decision_integrity_correction.sql',
  'utf8',
);
const factValidation = fs.readFileSync(
  'supabase/migrations/20260719130000_pr1d_author_fact_validation.sql',
  'utf8',
);
const hardening = fs.readFileSync(
  'supabase/migrations/20260720100000_pr1d_fact_source_and_create_hash_hardening.sql',
  'utf8',
);
const migrationHarness = fs.readFileSync('scripts/testPr1dMigrations.mjs', 'utf8');
const compatibility = fs.readFileSync('services/assessV1Compatibility.ts', 'utf8');
const handler = fs.readFileSync('supabase/functions/_shared/assessV2Handlers.ts', 'utf8');
const cloneContractVersion = compatibility.match(/ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION = '([^']+)'/)?.[1];
assert.ok(cloneContractVersion, 'canonical TypeScript clone contract version missing');
assert.ok(correction.includes(`'cloneContractVersion','${cloneContractVersion}'`), 'SQL clone contract version drifted from TypeScript');
assert.ok(correction.includes('p_clone_contract_version text'), 'SQL clone RPC must accept the server-bound contract version');
assert.ok(correction.includes(`p_clone_contract_version IS DISTINCT FROM '${cloneContractVersion}'`), 'SQL clone precheck drifted from the canonical TypeScript contract');
assert.ok(handler.includes('assertRuntimeCloneContract(result.resource, command.serverCloneProjection)'), 'clone command must enforce the runtime conversion contract and exact imported counts');
assert.ok(handler.includes('contractVersion: ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION'), 'clone command must bind the canonical contract before database execution');
const cloneHandlerStart = handler.indexOf("if (envelope.commandType === 'assessment_v2.clone_from_v1') {");
const cloneReplayPreflight = handler.indexOf('return await dependencies.executeAtomicCommand(command);', cloneHandlerStart);
const cloneSourceLoad = handler.indexOf('loadFrozenV1AssessmentForClone', cloneHandlerStart);
assert.ok(cloneHandlerStart >= 0 && cloneReplayPreflight > cloneHandlerStart && cloneSourceLoad > cloneReplayPreflight, 'Edge clone retries must replay before the mutable V1 source lookup');
const cloneAuthorityStart = correction.indexOf('CREATE OR REPLACE FUNCTION public.pr1d_clone_assess_v2_from_v1(');
const cloneSourceRead = correction.indexOf('SELECT * INTO a FROM public.assessments', cloneAuthorityStart);
assert.ok(cloneAuthorityStart >= 0 && cloneSourceRead > cloneAuthorityStart, 'SQL clone authority/source-read boundary missing');
const cloneAuthorityBoundary = correction.slice(cloneAuthorityStart, cloneSourceRead);
for (const capability of ['assess.v2.clone', 'assess.v2.create', 'assess.read']) {
  assert.ok(cloneAuthorityBoundary.includes(`public.pr1b_assert_command_authority(p_actor_id,p_org_id,p_workspace_id,'${capability}',p_authorization_version)`), `SQL clone must require ${capability} before reading V1`);
}
for (const field of ['p_source_process_id uuid', 'p_source_v1 jsonb', 'p_imported_facts jsonb', 'p_imported_evidence jsonb', 'p_agent_necessity jsonb']) {
  assert.ok(correction.includes(field), `SQL clone projection missing ${field}`);
}
assert.ok(correction.includes("p_source_v1 IS DISTINCT FROM jsonb_build_object("), 'SQL must independently bind canonical V1 provenance');
assert.ok(correction.includes('p_source_process_id IS DISTINCT FROM a.process_id'), 'SQL must independently bind V1 process ancestry');
assert.ok(correction.includes('p_imported_facts IS DISTINCT FROM expected_imported_facts'), 'SQL must compare imported facts exactly with the locked V1 row projection');
assert.ok(correction.includes('p_imported_evidence IS DISTINCT FROM expected_imported_evidence'), 'SQL must compare imported evidence exactly with the locked V1 row projection');
for (const field of ['importedFactCount', 'importedEvidenceCount']) {
  assert.ok(compatibility.includes(`'${field}'`) && correction.includes(`'${field}'`), `clone response contract missing ${field}`);
}

for (const token of [
  'assess_v2_cases',
  'assess_v2_case_versions',
  'assess_v2_decision_versions',
  'assess_v2_decision_points',
  'assess_v2_exception_paths',
  'assess_v2_candidate_evaluations',
  'assess_v2_gate_results',
  'assess_v2_control_requirements',
  'assess_v2_modernization_dispositions',
  'FOREIGN KEY(decision_id,case_id,workspace_id,org_id)',
  'ENABLE ROW LEVEL SECURITY',
  'FORCE ROW LEVEL SECURITY',
  'assessment_v2.finalize',
  'p_source_case jsonb',
  'p_input_hash text',
  'TO service_role',
  'FROM PUBLIC,anon,authenticated',
  "p_authoring->'decisionPoints'",
  "p_authoring->'exceptionPaths'",
]) assert.ok(foundation.includes(token), `foundation migration missing ${token}`);

for (const token of [
  'ADD COLUMN imported_facts jsonb NOT NULL',
  'pr1d_imported_facts_array_check',
  'public.pr1d_v1_import_facts',
  'public.pr1d_v1_evidence_id',
  "(1,'processStructure'),(2,'workPattern'),(3,'dataProfile'),(4,'judgment'),(5,'systems'),(6,'risk')",
  "evidence->>'status' <> 'submitted'",
  "evidence->'validated' <> 'false'::jsonb",
  "'source', 'v1-import'",
  "'factCount'",
  "'evidenceCount'",
  "'importedFacts',v.imported_facts",
  'SELECT current_evidence.id,current_evidence.payload',
  'AND NOT EXISTS (',
  'clone_version.version=1',
  'imported_evidence.id=current_evidence.id',
  "imported_evidence.payload - ARRAY['reviewerIds','contradictory']",
  "AND imported_evidence.id::text=x->>'id'",
  "errorCode','INVALID_COMMAND",
  'p_input_canonical text',
  'p_evidence_canonical text',
  'p_output_canonical text',
  'public.pr1d_verify_bound_canonical',
  "convert_to(p_canonical,'UTF8')",
  'p_canonical::jsonb',
  "'canonicalizationVersion','avala-canonical-json-1'",
  "'organizationId',p_org_id::text",
  "'workspaceId',p_workspace_id::text",
  "'caseId',p_case_id::text",
  "'sourceCaseVersion',p_source_version",
  "'schemaVersion',p_schema_version",
  "'ruleSetVersion',p_rule_set_version",
  "'decisionVersion',p_decision_version",
  "'payload',p_snapshot",
  'DROP FUNCTION public.pr1d_finalize_assess_v2_case(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text,text,text,text,timestamptz,uuid,text,bigint)',
  'REVOKE ALL ON FUNCTION public.pr1d_assert_enabled(),public.pr1d_resource(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role',
  'REVOKE ALL ON FUNCTION public.pr1d_clone_assess_v2_from_v1(uuid,uuid,uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,text,bigint) FROM PUBLIC,anon,authenticated',
  'GRANT EXECUTE ON FUNCTION public.pr1d_clone_assess_v2_from_v1(uuid,uuid,uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,text,bigint) TO service_role',
  'REVOKE ALL ON FUNCTION public.pr1d_replay_assess_v2_clone(uuid,uuid,uuid,uuid,uuid,text,text,text,bigint) FROM PUBLIC,anon,authenticated',
  'GRANT EXECUTE ON FUNCTION public.pr1d_replay_assess_v2_clone(uuid,uuid,uuid,uuid,uuid,text,text,text,bigint) TO service_role',
  'REVOKE ALL ON FUNCTION public.pr1d_finalize_assess_v2_case(uuid,uuid,uuid,uuid,bigint,jsonb,text,jsonb,text,jsonb,text,text,text,text,text,text,timestamptz,uuid,text,bigint) FROM PUBLIC,anon,authenticated',
  'GRANT EXECUTE ON FUNCTION public.pr1d_finalize_assess_v2_case(uuid,uuid,uuid,uuid,bigint,jsonb,text,jsonb,text,jsonb,text,text,text,text,text,text,timestamptz,uuid,text,bigint) TO service_role',
]) assert.ok(correction.includes(token), `correction migration missing ${token}`);
assert.ok(
  !correction.includes('current_evidence.version_id=v.id AND current_evidence.id=imported_evidence.id'),
  'current draft evidence must never shadow immutable imported V1 evidence',
);
for (const token of [
  'public.pr1d_author_fact_valid',
  'public.pr1d_author_agent_necessity_valid',
  'public.pr1d_authoring_facts_valid',
  "p_fact ?& ARRAY['fieldId','value','status','evidenceIds','source']",
  "p_fact->>'source' NOT IN ('user','system','template')",
  "jsonb_typeof(p_fact->'evidenceIds')<>'array'",
  "p_fact->>'source'='template' AND p_fact->>'status'='known'",
  "jsonb_typeof(p_fact->'value')<>'boolean'",
  "RETURN jsonb_build_object('errorCode','INVALID_COMMAND')",
  'prior.imported_facts',
  'FROM PUBLIC,anon,authenticated,service_role',
  'TO service_role',
]) assert.ok(factValidation.includes(token), `fact-validation migration missing ${token}`);
const factGuard = factValidation.indexOf('IF NOT public.pr1d_authoring_facts_valid(p_authoring)');
const receiptClaim = factValidation.indexOf('r:=public.pr1b_claim_command', factGuard);
const versionInsert = factValidation.indexOf('INSERT INTO public.assess_v2_case_versions', factGuard);
assert.ok(factGuard >= 0 && receiptClaim > factGuard && versionInsert > receiptClaim, 'author fact validation must precede receipt claim and persistence');
assert.doesNotMatch(
  factValidation,
  /GRANT EXECUTE ON FUNCTION public\.pr1d_(?:author_fact_valid|author_agent_necessity_valid|authoring_facts_valid)[^;]+TO (?:PUBLIC|anon|authenticated|service_role)/,
);
for (const token of [
  "jsonb_typeof(p_fact->'source')<>'string'",
  "request_payload jsonb:=jsonb_build_object(",
  "h text:=encode(public.digest(request_payload::text,'sha256'),'hex')",
  "legacy_h text:=encode(public.digest(concat_ws('|',p_org_id,p_workspace_id,p_case_id,p_process_id,p_name,p_description),'sha256'),'hex')",
  'existing_version.name IS NOT DISTINCT FROM p_name',
  'existing_version.description IS NOT DISTINCT FROM p_description',
]) assert.ok(hardening.includes(token), `hardening migration missing ${token}`);
assert.ok(
  hardening.indexOf("r.request_hash<>legacy_h") < hardening.indexOf('existing_version.name IS NOT DISTINCT FROM p_name'),
  'legacy create receipt replay must verify persisted request fields',
);
assert.ok(
  migrationHarness.includes("const hardening = '20260720100000_pr1d_fact_source_and_create_hash_hardening.sql';")
    && migrationHarness.includes('await apply(test, [hardening]);'),
  'PR 1D migration matrix must apply the hardening migration',
);

assert.doesNotMatch(foundation + correction, /UPDATE public\.privileged_audit_events/);
assert.doesNotMatch(
  correction,
  /GRANT EXECUTE ON FUNCTION public\.pr1d_finalize_assess_v2_case\([^;]+\) TO (?:PUBLIC|anon|authenticated)/,
);
assert.doesNotMatch(
  correction,
  /GRANT EXECUTE ON FUNCTION public\.pr1d_(?:assert_enabled|resource)\([^;]*\) TO (?:PUBLIC|anon|authenticated|service_role)/,
);

console.log('PR 1D additive migration contract passed.');
