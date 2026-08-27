import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../migrations/20260825165350_governed_transcript_source_sets_assess.sql', import.meta.url), 'utf8');
const forwardMigration = readFileSync(new URL('../../migrations/20260826151538_governed_transcript_authority_forward_fix.sql', import.meta.url), 'utf8');
const command = readFileSync(new URL('./enterpriseIntelligenceCommand.ts', import.meta.url), 'utf8');

const body = name => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = migration.indexOf('\nEND$$;', start);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return migration.slice(start, end + 7);
};

const forwardBody = name => {
  const start = forwardMigration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `missing forward function ${name}`);
  const end = forwardMigration.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `unterminated forward function ${name}`);
  return forwardMigration.slice(start, end + 4);
};

test('SRCSET: workspace features are default-off and exact ordered existing versions are immutable', () => {
  for (const flag of [
    'transcript_source_sets_enabled boolean NOT NULL DEFAULT false',
    'assess_multisource_apply_enabled boolean NOT NULL DEFAULT false',
    'unified_byok_gateway_enabled boolean NOT NULL DEFAULT false',
    'governed_journeys_enabled boolean NOT NULL DEFAULT false',
  ]) assert.match(migration, new RegExp(flag.replaceAll(' ', '\\s+')));
  assert.match(migration, /jsonb_array_length\(p_items\) NOT BETWEEN 1 AND 20/);
  assert.match(migration, /ORDER BY \(value->>'ordinal'\)::int/);
  assert.match(migration, /REFERENCES public\.enterprise_evidence_source_versions\(id,source_id,org_id,workspace_id\) ON DELETE RESTRICT/);
  assert.match(migration, /enterprise_transcript_reject_immutable/);
  assert.match(migration, /'enterprise_source_set_versions','enterprise_source_set_version_items'/);
});

test('AUTH: mutation RPCs authorize before resource inspection and all new tables force RLS', () => {
  for (const name of [
    'enterprise_transcript_create_source_set_version',
    'enterprise_transcript_lock_input_bundle',
    'enterprise_transcript_review_assess_candidate',
    'enterprise_transcript_create_assess_apply_preview_batch',
    'enterprise_transcript_commit_assess_apply_preview_batch',
    'enterprise_transcript_resolve_assess_conflict',
    'enterprise_transcript_set_journey_state',
    'enterprise_transcript_bind_assess_extraction',
  ]) {
    const sql = body(name);
    assert.ok(sql.indexOf('enterprise_transcript_assert_receipt(') < sql.indexOf('SELECT * INTO'), `${name} must authorize first`);
  }
  assert.match(migration, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.enterprise_transcript_assess_projection\(uuid,uuid\) TO authenticated/);
  assert.doesNotMatch(migration, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL) ON TABLE public\.enterprise_/);
});

test('ASSESS-TR: exact locked lineage prevents mixed or unselected-source influence', () => {
  const bind = body('enterprise_transcript_bind_assess_extraction');
  assert.match(bind, /b\.bundle_hash IS DISTINCT FROM p_bundle_hash/);
  assert.match(bind, /bi\.input_bundle_version_id=b\.id AND si\.source_id=p_source AND si\.source_version_id=p_source_version/);
  assert.ok(bind.indexOf('enterprise_transcript_assert_receipt(') < bind.indexOf('SELECT * INTO b FROM public.enterprise_module_input_bundle_versions'));
  const review = body('enterprise_transcript_review_assess_candidate');
  assert.match(review, /job_id=c\.ai_job_id/);
  assert.match(review, /enterprise_evidence_candidate_relationship_reviews/);
  assert.match(review, /'neutral','supporting','contradictory'/);
  const preview = body('enterprise_transcript_create_assess_apply_preview_batch');
  assert.match(preview, /jsonb_array_length\(p_selections\) NOT BETWEEN 1 AND 100/);
  assert.match(preview, /first_bundle IS NOT NULL AND b\.id IS DISTINCT FROM first_bundle/);
});

test('ASSESS-TR: one invalid member of 100 rolls back before the single draft version write', () => {
  const commit = body('enterprise_transcript_commit_assess_apply_batch');
  const validationLoop = commit.indexOf('-- Lock and validate the entire batch before the first version/child write.');
  const loopEnd = commit.indexOf('END LOOP;', validationLoop);
  const versionInsert = commit.indexOf('INSERT INTO public.assess_v2_case_versions');
  assert.ok(validationLoop > 0 && loopEnd > validationLoop && versionInsert > loopEnd);
  assert.equal((commit.match(/INSERT INTO public\.assess_v2_case_versions/g) || []).length, 1);
  assert.match(commit, /candidate\.version IS DISTINCT FROM p\.candidate_version/);
  assert.match(commit, /candidate\.provenance_hash IS DISTINCT FROM p\.candidate_provenance_hash/);
  assert.match(commit, /p\.expires_at<=statement_timestamp\(\)/);
});

test('ASSESS-TR: competing source values materialize a governed conflict and identical values collapse deterministically', () => {
  const batch = body('enterprise_transcript_create_assess_apply_preview_batch');
  assert.match(batch, /HAVING count\(\*\)>1 AND count\(DISTINCT p\.proposed_value\)>1/);
  assert.match(batch, /array_agg\(p\.candidate_id ORDER BY p\.candidate_id\)/);
  assert.match(batch, /candidateBindings/);
  assert.match(batch, /'materialConflictCount',material_conflict_count/);
  const resolution = body('enterprise_transcript_preview_resolution');
  assert.match(resolution, /p\.candidate_id=ANY\(conflict\.candidate_ids\)/);
  assert.match(resolution, /peer\.proposed_value=p\.proposed_value AND peer\.candidate_id<p\.candidate_id/);
  assert.doesNotMatch(migration, /ENTERPRISE_TRANSCRIPT_APPLY_BATCH_DUPLICATE_TARGET/);
});

test('IDEMP: generated identities and exact bindings persist before effects and changed bindings fail closed', () => {
  assert.match(command, /ensureExecutionPlan\(receipt, authority, \{ transcriptSourceSetId: sourceSetId \}\)/);
  assert.match(command, /ensureExecutionPlan\(receipt, authority, \{ transcriptInputBundleId: inputBundleId \}\)/);
  assert.match(command, /ensureExecutionPlan\(receipt, authority, \{ transcriptApplyPreviewBatchId: previewBatchId \}\)/);
  assert.match(migration, /UNIQUE\(org_id,workspace_id,binding_hash\)/);
  assert.match(migration, /UNIQUE\(receipt_id\)/);
  assert.match(migration, /binding\.input_bundle_version_id IS DISTINCT FROM b\.id/);
  assert.match(command, /inputBundleVersionSelector/);
  assert.match(command, /sourceSetVersionSelector/);
  assert.match(command, /extractionBindingId/);
  assert.match(command, /extractionJobId/);
  assert.match(command, /deriveTranscriptCommandRequestBinding/);
  assert.match(command, /serverBinding: transcriptCommandBinding/);
  assert.match(command, /ensureExecutionPlan\(receipt, disclosureAuthority, \{ transcriptCommandBinding \}\)/);
});

test('injection: provider routing and budgets are server-owned and strict staging precedes settlement', () => {
  const extractStart = command.indexOf('const commandTranscriptAssessExtract');
  const extractEnd = command.indexOf('const commandTranscriptAssessCandidateReview', extractStart);
  const publicExtract = command.slice(extractStart, extractEnd);
  assert.match(publicExtract, /'inputBundleId', 'inputBundleVersionSelector', 'expectedInputBundleVersion'/);
  assert.match(publicExtract, /'sourceSetId', 'sourceSetVersionSelector', 'expectedSourceSetVersion', 'sourceVersionSelector'/);
  assert.doesNotMatch(publicExtract, /payload\.(provider|model|route|bundleHash|sourceId)/);
  assert.match(command, /taskInstruction,\s*untrustedSource: text/);
  assert.match(command, /estimateMaximumProviderInputTokens\(\{\s*capability: 'assess\.evidence\.extract', taskInstruction, untrustedSource: text/);
  const beforeSettle = command.indexOf('beforeSettle: async providerResult');
  const stage = command.indexOf("rpc('enterprise_stage_evidence_extraction_result'", beforeSettle);
  assert.ok(beforeSettle > 0 && stage > beforeSettle);
  assert.match(command, /parseJsonObjectResponse/);
  assert.match(command, /buildGroundedEvidenceCandidate/);
});

test('forward fix: exact immutable lineage is additive and browser-visible selectors never substitute current roots', () => {
  assert.match(forwardMigration, /ADD COLUMN source_set_id uuid/);
  assert.match(forwardMigration, /ADD COLUMN source_set_version_id uuid/);
  assert.match(forwardMigration, /ENTERPRISE_TRANSCRIPT_UPGRADE_LINEAGE_AMBIGUOUS/);
  assert.match(forwardMigration, /ALTER COLUMN source_set_id SET NOT NULL/);
  assert.match(forwardMigration, /ALTER COLUMN source_set_version_id SET NOT NULL/);
  const exactBundle = forwardBody('enterprise_transcript_assert_exact_bundle_lineage');
  assert.match(exactBundle, /id=p_input_bundle_version AND input_bundle_id=p_input_bundle/);
  assert.match(exactBundle, /version=p_expected_input_bundle_version/);
  assert.match(exactBundle, /EXCEPT[\s\S]+sourceSetVersionSelector/);
  const bind = forwardBody('enterprise_transcript_bind_assess_extraction_v2');
  assert.match(bind, /source_set_id,source_set_version_id/);
  assert.match(bind, /binding\.job_id IS DISTINCT FROM job\.id/);
  assert.doesNotMatch(command.slice(command.indexOf('const commandTranscriptAssessExtract'), command.indexOf('const commandTranscriptAssessCandidateReview')), /current_version/);
});

test('forward fix: source-set concurrency and append-only selective staleness preserve consumed authority', () => {
  assert.match(forwardMigration, /CREATE TABLE public\.enterprise_transcript_staleness_events/);
  assert.match(forwardMigration, /UNIQUE\(resource_kind,resource_id\)/);
  assert.match(forwardMigration, /BEFORE UPDATE OR DELETE ON public\.enterprise_transcript_staleness_events/);
  assert.match(forwardMigration, /AFTER INSERT ON public\.enterprise_source_set_versions/);
  const stale = forwardBody('enterprise_transcript_record_selective_staleness');
  assert.match(stale, /NEW\.version-1/);
  assert.match(stale, /ENTERPRISE_TRANSCRIPT_SOURCE_SET_VERSION_GAP/);
  assert.match(stale, /NOT EXISTS\([\s\S]+enterprise_assess_candidate_applications/);
  assert.match(stale, /'input_bundle_version'/);
  assert.match(stale, /'extraction_binding'/);
  assert.match(stale, /'apply_preview'/);
  assert.match(stale, /'apply_preview_batch'/);
  assert.doesNotMatch(stale, /UPDATE public\.(?:assess_v2_case_versions|enterprise_assess_candidate_applications|enterprise_evidence_candidates)/);
  assert.match(forwardMigration, /Append-only selective invalidation of unconsumed bundle/);
});

test('forward fix: preview and commit use the real batch id plus exact draft, bundle, and source-set selectors', () => {
  const preview = forwardBody('enterprise_transcript_create_assess_apply_preview_batch_v2');
  const commit = forwardBody('enterprise_transcript_commit_assess_apply_preview_batch_v2');
  assert.match(preview, /'previewBatchId',p_batch/);
  assert.match(preview, /enterprise_transcript_assert_exact_bundle_lineage/);
  assert.match(commit, /WHERE id=p_batch AND org_id=p_org AND workspace_id=p_workspace FOR SHARE/);
  assert.match(commit, /batch\.expected_case_version IS DISTINCT FROM p_expected_case_version/);
  assert.match(commit, /batch\.input_bundle_version_id IS DISTINCT FROM p_input_bundle_version/);
  assert.match(commit, /batch\.source_set_version_ids IS DISTINCT FROM submitted_source_sets/);
  assert.match(forwardMigration, /REVOKE ALL ON FUNCTION[\s\S]+enterprise_transcript_create_assess_apply_preview_batch_v2/);
  assert.match(forwardMigration, /GRANT EXECUTE ON FUNCTION[\s\S]+enterprise_transcript_commit_assess_apply_preview_batch_v2[\s\S]+TO service_role/);
});

test('forward fix: budget transition identity may acquire row locks on PostgreSQL 16', () => {
  const transitionIdentity = forwardBody('enterprise_ai_assert_budget_transition_identity');
  assert.match(transitionIdentity, /RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER/);
  assert.match(transitionIdentity, /enterprise_ai_command_receipts[\s\S]+FOR SHARE/);
  assert.match(transitionIdentity, /enterprise_ai_job_ledger[\s\S]+FOR SHARE/);
  assert.doesNotMatch(transitionIdentity, /LANGUAGE plpgsql STABLE/);
});

test('finalization remains blocked by unresolved material conflicts and legacy Assess lineage is preserved', () => {
  assert.match(migration, /enterprise_transcript_assess_finalize_guard/);
  assert.match(migration, /r\.id IS NULL OR r\.resolution='unresolved'/);
  const commit = body('enterprise_transcript_commit_assess_apply_batch');
  assert.match(commit, /oldv\.agent_necessity,'draft_upsert',oldv\.source_snapshot,oldv\.imported_facts/);
  assert.match(migration, /Existing single-source ingestion and\s+-- Assess promotion history remain canonical and unchanged/);
});
