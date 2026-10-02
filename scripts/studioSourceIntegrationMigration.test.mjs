import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = 'supabase/migrations/20260924052038_studio_independent_source_integration.sql';
const sql = await readFile(path, 'utf8');

const validate = source => {
  assert.match(source, /ADD COLUMN studio_source_integration_enabled boolean NOT NULL DEFAULT false/);
  assert.match(source, /SELECT count\(\*\)::integer INTO campaign_count FROM public\.synthetic_ai_campaign_authorities/);
  assert.match(source, /IF campaign_count>0 THEN/);
  assert.match(source, /active_until:=public\.synthetic_ai_campaign_active_until\(campaign\.id\)/);
  assert.match(source, /campaign\.provider_config_id IS DISTINCT FROM p_provider_config/);
  assert.match(source, /p_capability='studio\.document\.generate' AND p_route=campaign\.studio_route_id/);
  assert.match(source, /WHEN p_capability='studio\.evidence\.extract' THEN 'studio\.sources\.manage'/);
  assert.match(source, /required_capability:=public\.synthetic_ai_campaign_required_budget_capability/);
  assert.match(source, /reservation\.estimated_input_tokens IS DISTINCT FROM p_estimated_input_tokens/);
  assert.match(source, /reservation\.maximum_output_tokens IS DISTINCT FROM p_maximum_output_tokens/);
  assert.match(source, /studio_source_budget_transition_authority/);
  assert.match(source, /WHEN p_capability=''studio\.evidence\.extract'' THEN ''studio\.sources\.manage''/);

  assert.match(source, /CREATE OR REPLACE FUNCTION public\.studio_source_create_preflight_v1/);
  assert.match(source, /PERFORM public\.studio_source_assert_receipt_v1\(p_receipt,p_actor,p_org,p_workspace,'studio\.source\.create'/);
  assert.match(source, /receipt:=public\.studio_source_assert_receipt_v1\(p_receipt,p_actor,\(p_source->>'org_id'\)::uuid,\(p_source->>'workspace_id'\)::uuid/);
  assert.match(source, /owner='assess' AND EXISTS\(SELECT 1 FROM public\.studio_source_version_ownerships/);
  assert.doesNotMatch(source, /owner='studio' AND NOT EXISTS\(SELECT 1 FROM public\.studio_source_version_ownerships/);
  const claim = source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.studio_claim_source_extraction_v1'), source.indexOf('CREATE OR REPLACE FUNCTION public.studio_stage_source_extraction_v1'));
  assert.doesNotMatch(claim, /JOIN public\.studio_source_version_ownerships/);
  assert.match(source, /CREATE TRIGGER enterprise_assess_extraction_owner_guard_before_insert/);
  assert.match(source, /CREATE TABLE public\.studio_source_extraction_bindings/);
  assert.match(source, /CREATE TABLE public\.studio_legacy_extraction_binding_compatibility/);
  assert.match(source, /INSERT INTO public\.studio_legacy_extraction_binding_compatibility/);
  assert.match(source, /bundle\.owner_module='studio'/);
  assert.match(source, /CREATE TABLE public\.studio_source_candidate_decisions/);
  assert.match(source, /CREATE TRIGGER studio_legacy_extraction_binding_compatibility_immutable/);
  assert.match(source, /GRANT SELECT ON TABLE public\.studio_legacy_extraction_binding_compatibility,public\.studio_source_candidate_decisions TO service_role/);
  assert.match(source, /FOREIGN KEY\(input_bundle_version_id,input_bundle_id,org_id,workspace_id\)/);
  assert.match(source, /FOREIGN KEY\(source_set_version_id,source_set_id,org_id,workspace_id\)/);
  assert.match(source, /FOREIGN KEY\(source_version_id,source_id,org_id,workspace_id\)/);
  assert.match(source, /next_excerpt_hash:=CASE WHEN p_status='edited' THEN public\.enterprise_evidence_excerpt_anchor_hash\(/);
  assert.match(source, /SET value=next_value,excerpt_hash=next_excerpt_hash/);
  assert.match(source, /INSERT INTO public\.studio_source_candidate_decisions/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.enterprise_assert_assess_evidence_authority_v1/);
  assert.match(source, /CREATE TRIGGER enterprise_assess_evidence_job_owner_guard_before_insert/);
  assert.match(source, /CREATE TRIGGER enterprise_assess_promotion_owner_guard_before_insert/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.enterprise_review_evidence_candidate\(uuid,uuid,uuid,text,text,text,uuid,text,text\) FROM service_role/);
  assert.match(source, /status='uncertain',failure_code='RECOVERY_AFTER_UNCONFIRMED_ATTEMPT'/);
  assert.match(source, /candidate\.suggestion_status IN\('accepted','edited'\)/);
  assert.match(source, /decision\.decision_status=candidate\.suggestion_status/);
  assert.match(source, /flags\.studio_multisource_enabled AND flags\.studio_source_integration_enabled/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.studio_artifact_source_package_create\(p_command jsonb\)/);
  assert.doesNotMatch(source, /package\.candidate_manifest INTO manifest FROM public\.studio_artifact_source_packages/);
  const packageCreate = source.slice(source.lastIndexOf('CREATE OR REPLACE FUNCTION public.studio_artifact_source_package_create(p_command jsonb)'));
  assert.ok(packageCreate.indexOf("IF receipt.status='committed' THEN RETURN receipt.response||jsonb_build_object('outcome','replayed')") > 0);
  assert.ok(packageCreate.indexOf("IF receipt.status='committed' THEN RETURN receipt.response||jsonb_build_object('outcome','replayed')") < packageCreate.indexOf("IF flags.org_id IS NULL OR NOT flags.direct_studio_planning_enabled"));
  assert.ok(packageCreate.indexOf("IF flags.org_id IS NULL OR NOT flags.direct_studio_planning_enabled") < packageCreate.indexOf('candidate_manifest:=public.studio_pr_b_candidate_manifest'));
  assert.match(source, /ALTER TABLE public\.studio_source_version_ownerships ENABLE ROW LEVEL SECURITY/);
  assert.match(source, /public\.studio_legacy_extraction_binding_compatibility,public\.studio_source_candidate_decisions FROM PUBLIC,anon,authenticated,service_role/);

  assert.match(source, /old_bootstrap text:='marker\.migration_tip=''20260923190853'''/);
  assert.match(source, /new_bootstrap text:='marker\.migration_tip=''20260924052038'''/);
  assert.match(source, /constraint_expression='\(migration_tip = ''20260923190853''::text\)'/);
  assert.match(source, /UPDATE public\.hosted_pilot_environment_identity SET migration_tip='20260924052038'/);
  assert.match(source, /CHECK\(migration_tip='20260924052038'\)/);
  assert.doesNotMatch(source, /SET migration_tip='20260904120000'/);
  assert.doesNotMatch(source, /assess\.evidence\.extract'\s+THEN\s+'studio\.sources\.manage'/);
};

validate(sql);

const mutations = [
  sql.replace('IF campaign_count>0 THEN', 'IF campaign_count=1 THEN'),
  sql.replace("active_until:=public.synthetic_ai_campaign_active_until(campaign.id);", "active_until:=campaign.expires_at;"),
  sql.replace("WHEN p_capability='studio.evidence.extract' THEN 'studio.sources.manage'", "WHEN p_capability='studio.evidence.extract' THEN 'docs.approve'"),
  sql.replace("owner='assess' AND EXISTS", "owner='studio' AND NOT EXISTS"),
  sql.replace('SET value=next_value,excerpt_hash=next_excerpt_hash', 'SET value=next_value'),
  sql.replace("bundle.owner_module='studio'", "bundle.owner_module='assess'"),
  sql.replaceAll('decision.decision_status=candidate.suggestion_status', 'decision.decision_status IS NOT NULL'),
  sql.replace('flags.studio_multisource_enabled AND flags.studio_source_integration_enabled', 'flags.studio_multisource_enabled'),
  sql.replace("IF receipt.status='committed' THEN RETURN receipt.response||jsonb_build_object('outcome','replayed');END IF;", "IF receipt.status='claimed' THEN RETURN receipt.response||jsonb_build_object('outcome','replayed');END IF;"),
  sql.replace("old_bootstrap text:='marker.migration_tip=''20260923190853'''", "old_bootstrap text:='marker.migration_tip=''20260904120000'''"),
  sql.replace("UPDATE public.hosted_pilot_environment_identity SET migration_tip='20260924052038'", "UPDATE public.hosted_pilot_environment_identity SET migration_tip='20260904120000'"),
];
for (const [index, mutation] of mutations.entries()) {
  assert.notEqual(mutation, sql, `mutation ${index + 1} must alter the contract fixture`);
  assert.throws(() => validate(mutation), undefined, `mutation ${index + 1} must fail closed`);
}

console.log(`studio source integration migration contract passed with ${mutations.length} adversarial mutations`);
