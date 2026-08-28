import assert from 'node:assert/strict';
import type { TranscriptAssessCandidateProjection } from './contracts';
import { assertTranscriptAssessFinalizable, planTranscriptAssessApply } from './assessApply';

const ASSESS = '10000000-0000-4000-8000-000000000001';
const FIRST = '20000000-0000-4000-8000-000000000002';
const SECOND = '30000000-0000-4000-8000-000000000003';

const candidate = (id: string, value: string, sourceLabel: string): TranscriptAssessCandidateProjection => ({
  id,
  candidateVersion: 1,
  inputBundleId: ASSESS,
  inputBundleVersionSelector: ASSESS,
  extractionBindingId: id,
  extractionJobId: id,
  sourceId: id,
  sourceVersionSelector: id,
  sourceLabel,
  sourceVersionLabel: 'Source version 1',
  field: 'process_objective',
  value,
  sourceLocator: '00:00:01.000-00:00:05.000',
  confidence: 0.9,
  status: 'accepted',
  relationship: 'neutral',
  applicationIntent: 'set_case_field',
  applyTarget: 'case.process_objective',
  provenanceState: 'anchored',
  reviewState: 'reviewed_by_you',
  editCount: 0,
});

const candidates = [candidate(FIRST, 'Reduce handling time', 'Interview A'), candidate(SECOND, 'Reduce rework', 'Interview B')];
const selections = candidates.map(item => ({ candidateId: item.id, candidateVersion: 1, intent: 'set_case_field' as const, target: 'case.process_objective' }));

const plan = planTranscriptAssessApply({
  assessDraftId: ASSESS,
  expectedDraftVersion: 7,
  candidates,
  selections,
  targets: [{ key: 'case.process_objective', allowedIntents: ['set_case_field'], currentManualValue: 'Preserve manual objective' }],
});
assert.equal(plan.scoringMutation, false);
assert.equal(plan.selections.length, 2);
assert.deepEqual(plan.conflicts.map(conflict => conflict.type).sort(), ['cross_source_conflict', 'manual_conflict']);

const evidenceOnly = planTranscriptAssessApply({
  assessDraftId: ASSESS,
  expectedDraftVersion: 7,
  candidates: [candidates[0]],
  selections: [{ candidateId: FIRST, candidateVersion: 1, intent: 'link_evidence_only', target: 'unused' }],
  targets: [],
});
assert.deepEqual(evidenceOnly.evidenceOnlyCandidateIds, [FIRST]);

assert.throws(() => planTranscriptAssessApply({
  assessDraftId: ASSESS,
  expectedDraftVersion: 7,
  candidates: [{ ...candidates[0], provenanceState: 'incomplete' }],
  selections: [selections[0]],
  targets: [{ key: 'case.process_objective', allowedIntents: ['set_case_field'] }],
}), /TRANSCRIPT_ASSESS_CANDIDATE_NOT_APPLICABLE/);

assert.throws(
  () => assertTranscriptAssessFinalizable([{ material: true, resolution: 'unresolved' }]),
  /TRANSCRIPT_ASSESS_MATERIAL_CONFLICT_UNRESOLVED/,
);
assert.doesNotThrow(() => assertTranscriptAssessFinalizable([{ material: false, resolution: 'unresolved' }]));
assert.throws(() => planTranscriptAssessApply({
  assessDraftId: 'not-a-uuid', expectedDraftVersion: 0, candidates, selections,
  targets: [{ key: 'case.process_objective', allowedIntents: ['set_case_field'] }],
}), /TRANSCRIPT_ASSESS_TARGET_STALE/);
assert.throws(() => planTranscriptAssessApply({
  assessDraftId: ASSESS, expectedDraftVersion: 7, candidates, selections: [], targets: [],
}), /TRANSCRIPT_ASSESS_BATCH_LIMIT/);
assert.throws(() => planTranscriptAssessApply({
  assessDraftId: ASSESS, expectedDraftVersion: 7, candidates,
  selections: [{ ...selections[0], candidateId: 'not-a-uuid' }],
  targets: [{ key: 'case.process_objective', allowedIntents: ['set_case_field'] }],
}), /TRANSCRIPT_ASSESS_SELECTION_INVALID/);
assert.throws(() => planTranscriptAssessApply({
  assessDraftId: ASSESS, expectedDraftVersion: 7, candidates,
  selections: [{ ...selections[0], intent: 'create_primitive' }],
  targets: [{ key: 'case.process_objective', allowedIntents: ['set_case_field'] }],
}), /TRANSCRIPT_ASSESS_TARGET_INVALID/);

console.log('Transcript Assess apply domain tests passed.');
