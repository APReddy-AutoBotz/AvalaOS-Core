import {
  TRANSCRIPT_ASSESS_APPLICATION_INTENTS,
  TRANSCRIPT_ASSESS_APPLY_MAX_CANDIDATES,
  type TranscriptAssessApplicationIntent,
  type TranscriptAssessCandidateProjection,
} from './contracts';

export interface TranscriptAssessTargetDefinition {
  key: string;
  allowedIntents: readonly TranscriptAssessApplicationIntent[];
  currentManualValue?: string;
}

export interface TranscriptAssessApplySelection {
  candidateId: string;
  candidateVersion: number;
  intent: TranscriptAssessApplicationIntent;
  target: string;
}

export interface TranscriptAssessApplyPlan {
  assessDraftId: string;
  expectedDraftVersion: number;
  selections: TranscriptAssessApplySelection[];
  conflicts: Array<{
    field: string;
    candidateIds: string[];
    manualValue?: string;
    type: 'manual_conflict' | 'cross_source_conflict';
  }>;
  evidenceOnlyCandidateIds: string[];
  scoringMutation: false;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Builds a deterministic validation plan. The database command repeats these
 * checks under lock and creates one immutable Assess draft version or none.
 */
export const planTranscriptAssessApply = (input: {
  assessDraftId: string;
  expectedDraftVersion: number;
  candidates: readonly TranscriptAssessCandidateProjection[];
  selections: readonly TranscriptAssessApplySelection[];
  targets: readonly TranscriptAssessTargetDefinition[];
}): TranscriptAssessApplyPlan => {
  if (!uuid.test(input.assessDraftId) || !Number.isSafeInteger(input.expectedDraftVersion) || input.expectedDraftVersion < 1) {
    throw new Error('TRANSCRIPT_ASSESS_TARGET_STALE');
  }
  if (!Array.isArray(input.selections) || input.selections.length < 1 || input.selections.length > TRANSCRIPT_ASSESS_APPLY_MAX_CANDIDATES) {
    throw new Error('TRANSCRIPT_ASSESS_BATCH_LIMIT');
  }
  const candidates = new Map(input.candidates.map(candidate => [candidate.id, candidate]));
  const targets = new Map(input.targets.map(target => [target.key, target]));
  const selectedIds = new Set<string>();
  const normalized: TranscriptAssessApplySelection[] = [];
  const evidenceOnlyCandidateIds: string[] = [];
  for (const selection of input.selections) {
    if (!uuid.test(selection.candidateId) || selectedIds.has(selection.candidateId)) throw new Error('TRANSCRIPT_ASSESS_SELECTION_INVALID');
    selectedIds.add(selection.candidateId);
    const candidate = candidates.get(selection.candidateId);
    if (!candidate || candidate.candidateVersion !== selection.candidateVersion) throw new Error('TRANSCRIPT_ASSESS_CANDIDATE_STALE');
    if (!['accepted', 'edited'].includes(candidate.status) || candidate.provenanceState !== 'anchored') {
      throw new Error('TRANSCRIPT_ASSESS_CANDIDATE_NOT_APPLICABLE');
    }
    if (!TRANSCRIPT_ASSESS_APPLICATION_INTENTS.includes(selection.intent)) throw new Error('TRANSCRIPT_ASSESS_INTENT_INVALID');
    if (selection.intent === 'link_evidence_only') {
      evidenceOnlyCandidateIds.push(candidate.id);
    } else {
      const target = targets.get(selection.target);
      if (!target || !target.allowedIntents.includes(selection.intent)) throw new Error('TRANSCRIPT_ASSESS_TARGET_INVALID');
    }
    normalized.push({ ...selection });
  }

  const conflicts: TranscriptAssessApplyPlan['conflicts'] = [];
  const byTarget = new Map<string, TranscriptAssessApplySelection[]>();
  normalized.filter(selection => selection.intent !== 'link_evidence_only').forEach(selection => {
    byTarget.set(selection.target, [...(byTarget.get(selection.target) || []), selection]);
  });
  for (const [targetKey, targetSelections] of byTarget) {
    const values = new Set(targetSelections.map(selection => candidates.get(selection.candidateId)?.value));
    const target = targets.get(targetKey);
    if (values.size > 1) {
      conflicts.push({ field: targetKey, candidateIds: targetSelections.map(selection => selection.candidateId), type: 'cross_source_conflict' });
    }
    const candidateValue = candidates.get(targetSelections[0].candidateId)?.value;
    if (target?.currentManualValue !== undefined && target.currentManualValue !== candidateValue) {
      conflicts.push({ field: targetKey, candidateIds: targetSelections.map(selection => selection.candidateId), manualValue: target.currentManualValue, type: 'manual_conflict' });
    }
  }
  return {
    assessDraftId: input.assessDraftId.toLowerCase(),
    expectedDraftVersion: input.expectedDraftVersion,
    selections: normalized,
    conflicts,
    evidenceOnlyCandidateIds,
    scoringMutation: false,
  };
};

export const assertTranscriptAssessFinalizable = (conflicts: readonly { material: boolean; resolution: string }[]) => {
  if (conflicts.some(conflict => conflict.material && conflict.resolution === 'unresolved')) {
    throw new Error('TRANSCRIPT_ASSESS_MATERIAL_CONFLICT_UNRESOLVED');
  }
};
