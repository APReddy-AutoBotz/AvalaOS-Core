import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261105140001_assessed_planning_review.sql', 'utf8');
const edge = readFileSync('supabase/functions/_shared/assessV2ReviewCommand.ts', 'utf8');
const database = readFileSync('supabase/functions/_shared/assessV2ReviewDb.ts', 'utf8');
const client = readFileSync('services/assessV2ReviewClient.ts', 'utf8');
const presentation = readFileSync('services/assessV2/currentAssessmentPresentation.ts', 'utf8');

test('planning approval is distinct from Verified and Govern authority', () => {
  assert.match(migration, /resolution IN\('approved','planning_approved','changes_requested','rejected'\)/);
  assert.match(migration, /resolution='planning_approved' AND approval_purpose='documentation_planning'/);
  assert.match(migration, /govern_resolution_id IS NULL/);
  assert.match(migration, /EXISTS\(SELECT 1 FROM public\.assess_v2_govern_resolutions/);
  assert.match(migration, /actual_confidence:=d\.output_snapshot->>'confidence'/);
  assert.match(migration, /'reviewedConfidence',rr\.reviewed_confidence/);
  assert.doesNotMatch(migration, /reviewed_confidence[^\n]*'Verified'/);
});

test('planning package preserves exact assessed lineage, evidence and questions', () => {
  assert.match(migration, /'schema','assess-v2-reviewed-planning-handoff\.v1'/);
  assert.match(migration, /'reviewResolutionId',rr\.id,'governResolutionId',NULL/);
  assert.match(migration, /'process',d\.input_snapshot,'decision',d\.output_snapshot/);
  assert.match(migration, /'evidenceSubmissions',d\.evidence_snapshot/);
  assert.match(migration, /'acceptedEvidence',claim_sets->'acceptedEvidence'/);
  assert.match(migration, /'unresolvedQuestions',claim_sets->'unresolvedQuestions'/);
  assert.match(migration, /jsonb_agg\(evidence\.id ORDER BY evidence\.id\)/,
    'accepted-evidence arrays contain only evidence IDs with a current accepted attestation');
  assert.match(migration, /ORDER BY latest\.reviewed_at DESC,latest\.id DESC LIMIT 1\)='accepted'/);
});

test('planning commands retain server authority, replay and source-current gates', () => {
  for (const command of ['assessment_v2.review.plan', 'assessment_v2.studio.plan_handoff']) {
    assert.match(edge, new RegExp(command.replaceAll('.', '\\.')));
    assert.match(client, new RegExp(command.replaceAll('.', '\\.')));
  }
  assert.match(database, /'assessment_v2\.review\.plan':'pr1e_resolve_assess_v2_planning'/);
  assert.match(database, /'assessment_v2\.studio\.plan_handoff':'pr1e_handoff_assess_v2_planning'/);
  assert.match(migration, /pr1b_assert_command_authority\(p_actor_id,p_org_id,p_workspace_id,[\s\S]*?'assess\.v2\.approve'/);
  assert.match(migration, /a\.assigned_reviewer_authorization_version<>p_authorization_version/);
  assert.match(migration, /d\.source_version_id<>c\.head_version_id/);
  assert.match(migration, /RETURN jsonb_build_object\('outcome','replayed','resource',r\.response\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.pr1e_resolve_assess_v2_planning[\s\S]*?FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.pr1e_resolve_assess_v2_planning[\s\S]*?TO service_role/);
});

test('current presentation survives planning handoff without creating a compatibility assessment', () => {
  assert.match(migration, /c\.status='handed_off' AND rr\.resolution='planning_approved'[\s\S]*?THEN 'planning_approved'/);
  assert.match(presentation, /Approved for documentation and planning · Studio handoff committed/);
  assert.match(client, /resolution === 'planning_approved' \? 'assessment_v2\.review\.plan'/);
  assert.match(client, /projection\.approvalPurpose === 'documentation_planning' \? 'assessment_v2\.studio\.plan_handoff'/);
});
