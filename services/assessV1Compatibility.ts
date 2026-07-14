import { Assessment } from '../types';
import { ASSESS_V2_RULE_SET_VERSION, ASSESS_V2_SCHEMA_VERSION, AssessmentCaseV2, CaseFact, EvidenceLink } from './assessV2/types';

export const ASSESS_V1_SCORE_VERSION = 'assess-core-2026-05' as const;
export const ASSESS_V1_BUYER_LABEL = 'Legacy deterministic heuristic' as const;
export const GOVERN_LITE_EVIDENCE_THRESHOLD_PERCENT = 70 as const;

export interface NormalizedV1EvidenceQuality {
  readonly sourceScale: 'v1-1-to-5' | 'legacy-percent';
  readonly sourceValue: number;
  readonly percent: number;
}

export const normalizeV1EvidenceQuality = (value: number): NormalizedV1EvidenceQuality => {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError('V1 evidence quality must be on the inclusive 1–5 scale or legacy 0–100 percent scale.');
  if (value >= 1 && value <= 5) return Object.freeze({ sourceScale: 'v1-1-to-5', sourceValue: value, percent: value * 20 });
  return Object.freeze({ sourceScale: 'legacy-percent', sourceValue: value, percent: value });
};

export const meetsGovernLiteEvidenceThreshold = (value: number): boolean => normalizeV1EvidenceQuality(value).percent >= GOVERN_LITE_EVIDENCE_THRESHOLD_PERCENT;

const sourceScoreVersion = (assessment: Assessment): string | undefined => assessment.scores?.scoreVersion ?? assessment.scoreVersion;

export const assertFrozenV1Assessment = (assessment: Assessment): typeof ASSESS_V1_SCORE_VERSION => {
  const version = sourceScoreVersion(assessment);
  if (version !== ASSESS_V1_SCORE_VERSION) throw new Error(`Only ${ASSESS_V1_SCORE_VERSION} assessments may cross the V1 compatibility boundary.`);
  return ASSESS_V1_SCORE_VERSION;
};

const flattenValues = (value: unknown, prefix: string, output: CaseFact[]): void => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value as Record<string, unknown>).sort()) flattenValues((value as Record<string, unknown>)[key], `${prefix}.${key}`, output);
    return;
  }
  const unknown = value === null || value === undefined || value === '';
  output.push({ fieldId: prefix, value: unknown ? null : structuredClone(value), status: unknown ? 'unknown' : 'assumed', evidenceIds: [], source: 'v1-import' });
};

export interface CloneV1AssessmentOptions {
  caseId: string;
  organizationId: string;
  workspaceId: string;
  ownerId: string;
  clonedAt: string;
}

export const cloneV1AssessmentToV2 = (assessment: Assessment, options: CloneV1AssessmentOptions): AssessmentCaseV2 => {
  const scoreVersion = assertFrozenV1Assessment(assessment);
  if (assessment.orgId !== options.organizationId) throw new Error('V1 source and V2 target organization ancestry must match.');
  if (assessment.workspaceId && assessment.workspaceId !== options.workspaceId) throw new Error('V1 source and V2 target workspace ancestry must match.');
  if (!options.caseId.trim() || !options.workspaceId.trim() || !options.ownerId.trim()) throw new Error('V2 case, workspace, and owner identifiers are required.');
  if (!Number.isFinite(Date.parse(options.clonedAt))) throw new Error('A valid clone timestamp is required.');

  const importedFacts: CaseFact[] = [];
  flattenValues(assessment.responses, 'v1.responses', importedFacts);
  for (const assumption of assessment.assumptions) importedFacts.push({
    fieldId: `v1.assumptions.${assumption.id}`,
    value: assumption.description,
    status: 'assumed',
    evidenceIds: [],
    source: 'v1-import',
  });

  const importedEvidence: EvidenceLink[] = assessment.evidenceItems.map(item => ({
    id: `v1-${assessment.id}-${item.id}`,
    claimIds: [item.linkedField ? `v1.responses.${item.linkedField}` : `v1.evidence.${item.id}`],
    sourceType: 'document',
    status: 'submitted',
    validated: false,
    owner: item.owner,
  }));
  const evidenceForClaim = new Map(importedEvidence.flatMap(item => item.claimIds.map(claimId => [claimId, item.id] as const)));
  for (const fact of importedFacts) {
    const evidenceId = evidenceForClaim.get(fact.fieldId);
    if (evidenceId) fact.evidenceIds.push(evidenceId);
  }

  return {
    id: options.caseId,
    organizationId: options.organizationId,
    workspaceId: options.workspaceId,
    sourceProcessId: assessment.processId,
    ownerId: options.ownerId,
    status: 'draft',
    version: 1,
    schemaVersion: ASSESS_V2_SCHEMA_VERSION,
    ruleSetVersion: ASSESS_V2_RULE_SET_VERSION,
    sourceV1: { assessmentId: assessment.id, scoreVersion, clonedAt: options.clonedAt, importedAs: 'unverified-source-facts' },
    importedFacts,
    primitives: [],
    edges: [],
    decisionPoints: [],
    exceptionPaths: [],
    assets: [],
    interactions: [],
    evidence: importedEvidence,
    agentNecessity: { irreducibleAmbiguity: null, adaptiveNextStep: null, toolOrPathSelection: null, incrementalValue: null, controllable: null },
    createdAt: options.clonedAt,
    updatedAt: options.clonedAt,
  };
};
