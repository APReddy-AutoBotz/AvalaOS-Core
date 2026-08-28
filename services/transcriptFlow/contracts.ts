/**
 * Browser-safe contracts for PR A of the governed multi-source transcript flow.
 *
 * These projections contain selectors, labels, statuses, and user-reviewable
 * values only. Authoritative hashes, provider policy, budget state, storage
 * coordinates, and authorization decisions remain server-side.
 */

export const TRANSCRIPT_FLOW_PROJECTION_VERSION = 'transcript-flow-pr-a-1' as const;
export const TRANSCRIPT_SOURCE_SET_MAX_MEMBERS = 20;
export const TRANSCRIPT_SOURCE_SET_MAX_EXTRACTED_CHARACTERS = 2_000_000;
export const TRANSCRIPT_ASSESS_APPLY_MAX_CANDIDATES = 100;

export const TRANSCRIPT_SOURCE_ROLES = [
  'primary',
  'supporting',
  'contradictory',
  'reference',
] as const;

export type TranscriptSourceRole = typeof TRANSCRIPT_SOURCE_ROLES[number];

export const TRANSCRIPT_ASSESS_APPLICATION_INTENTS = [
  'set_case_field',
  'create_primitive',
  'create_application_asset',
  'create_interaction',
  'create_decision_point',
  'create_exception_path',
  'set_registered_fact',
  'link_evidence_only',
] as const;

export type TranscriptAssessApplicationIntent = typeof TRANSCRIPT_ASSESS_APPLICATION_INTENTS[number];

export interface TranscriptFlowFeatureProjection {
  sourceSetsEnabled: boolean;
  assessMultisourceApplyEnabled: boolean;
  disabledReason?: string;
}

export interface TranscriptSourceVersionOptionProjection {
  sourceId: string;
  /** Opaque server-issued selector for one exact immutable source version. */
  versionSelector: string;
  displayName: string;
  versionLabel: string;
  mimeType: string;
  extractedCharacterCount: number;
  state: 'ready' | 'failed' | 'deleted' | 'pending';
  selectable: boolean;
  reuseState: 'unused' | 'already_selected_elsewhere';
}

export interface TranscriptSourceSetMemberProjection {
  sourceId: string;
  versionSelector: string;
  displayName: string;
  versionLabel: string;
  ordinal: number;
  role: TranscriptSourceRole;
  note?: string;
  extractedCharacterCount: number;
  state: 'ready' | 'failed' | 'missing' | 'deleted';
}

export interface TranscriptSourceSetProjection {
  id: string;
  /** Exact current immutable source-set version selector. */
  versionSelector: string;
  /** Optimistic-concurrency version paired with versionSelector. */
  version: number;
  ownerModule: 'assess';
  label: string;
  description?: string;
  versionLabel: string;
  status: 'draft' | 'locked' | 'superseded' | 'archived';
  sourceCount: number;
  extractedCharacterCount: number;
  members: TranscriptSourceSetMemberProjection[];
  lockState: 'ready' | 'blocked' | 'locked';
  blockers: string[];
  updatedAt: string;
}

export interface TranscriptSourceSetVersionLineageProjection {
  /** Stable source-set aggregate/root identity. */
  sourceSetId: string;
  /** Exact immutable source-set version identity bound into the bundle. */
  sourceSetVersionSelector: string;
  /** Numeric version paired with sourceSetVersionSelector. */
  sourceSetVersion: number;
  ordinal: number;
}

export interface TranscriptInputBundleProjection {
  id: string;
  /** Exact current immutable input-bundle version selector. */
  versionSelector: string;
  /** Optimistic-concurrency version paired with versionSelector. */
  version: number;
  ownerModule: 'assess';
  label: string;
  versionLabel: string;
  status: 'draft' | 'locked' | 'superseded';
  sourceSetIds: string[];
  sourceSetVersions: TranscriptSourceSetVersionLineageProjection[];
  sourceVersionSelectors: string[];
  sourceCount: number;
  extractedCharacterCount: number;
  lockedAt?: string;
}

export interface TranscriptJourneyProjection {
  id: string;
  entryModule: 'assess';
  desiredExitModule: 'assess' | 'studio' | 'delivery' | 'monitor';
  currentModule: 'assess';
  lineage: 'assessed';
  planningOnly: boolean;
  status: 'active' | 'stopped' | 'completed' | 'blocked' | 'archived';
  version: number;
  updatedAt: string;
}

export interface TranscriptAssessCandidateProjection {
  id: string;
  candidateVersion: number;
  inputBundleId: string;
  inputBundleVersionSelector: string;
  extractionBindingId: string;
  extractionJobId: string;
  sourceId: string;
  sourceVersionSelector: string;
  sourceLabel: string;
  sourceVersionLabel: string;
  field: string;
  value: string;
  safeExcerpt?: string;
  sourceLocator: string;
  confidence: number;
  status: 'suggested' | 'accepted' | 'rejected' | 'edited' | 'unresolved';
  relationship: 'neutral' | 'supporting' | 'contradictory';
  applicationIntent: TranscriptAssessApplicationIntent;
  applyTarget?: string;
  provenanceState: 'anchored' | 'incomplete';
  reviewState: 'pending' | 'reviewed_by_you' | 'reviewed_by_another';
  editCount: number;
  reviewedAt?: string;
}

export interface TranscriptBoundAssessCandidateProjection extends TranscriptAssessCandidateProjection {
  sourceSetId: string;
  sourceSetVersionSelector: string;
  sourceSetVersion: number;
}

export interface TranscriptAssessApplyChangeProjection {
  candidateId: string;
  intent: TranscriptAssessApplicationIntent;
  target: string;
  summary: string;
  conflictState: 'none' | 'manual_conflict' | 'cross_source_conflict';
}

export interface TranscriptAssessConflictProjection {
  id: string;
  field: string;
  candidateIds: string[];
  candidateSummaries: string[];
  manualValue?: string;
  material: boolean;
  resolution: 'unresolved' | 'choose_candidate' | 'retain_manual' | 'authored_resolution';
  resolvedValue?: string;
  rationale?: string;
  resolutionVersion: number;
}

export interface TranscriptAssessApplyPreviewProjection {
  id: string;
  previewIds: string[];
  assessDraftId: string;
  inputBundleId: string;
  inputBundleVersionSelector: string;
  inputBundleVersion: number;
  sourceSetVersionSelectors: string[];
  expectedDraftVersion: number;
  candidateIds: string[];
  changes: TranscriptAssessApplyChangeProjection[];
  conflicts: TranscriptAssessConflictProjection[];
  status: 'ready' | 'blocked' | 'applied' | 'stale';
  expiresAt: string;
}

export interface TranscriptAssessRunProjection {
  id: string;
  inputBundleId: string;
  inputBundleVersionSelector: string;
  extractionBindingIds: string[];
  extractionJobIds: string[];
  extractionBindings: Array<{
    extractionBindingId: string;
    extractionJobId: string;
    sourceSetId: string;
    sourceSetVersionSelector: string;
    sourceSetVersion: number;
    sourceVersionSelector: string;
  }>;
  sourceSetVersions: TranscriptSourceSetVersionLineageProjection[];
  sourceVersionSelectors: string[];
  state: 'requested' | 'processing' | 'review_required' | 'draft_ready' | 'completed' | 'failed' | 'blocked';
  selectedSourceCount: number;
  completedSourceCount: number;
  candidateCount: number;
  failureCode?: 'SOURCE_INCOMPLETE' | 'BUDGET_EXHAUSTED' | 'PROVIDER_UNAVAILABLE' | 'AUTHORIZATION_UNAVAILABLE';
  updatedAt: string;
}

export interface TranscriptFlowProjection {
  schemaVersion: typeof TRANSCRIPT_FLOW_PROJECTION_VERSION;
  features: TranscriptFlowFeatureProjection;
  sourceVersions: TranscriptSourceVersionOptionProjection[];
  sourceSets: TranscriptSourceSetProjection[];
  inputBundles: TranscriptInputBundleProjection[];
  journeys: TranscriptJourneyProjection[];
  assessCandidates: TranscriptBoundAssessCandidateProjection[];
  assessConflicts: TranscriptAssessConflictProjection[];
  assessApplyPreviews: TranscriptAssessApplyPreviewProjection[];
  assessRuns: TranscriptAssessRunProjection[];
}

const projectionUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const isFiniteDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isBoundedString = (value: unknown, maximum = 12_000) => typeof value === 'string' && Array.from(value).length <= maximum;
const isUuid = (value: unknown) => typeof value === 'string' && projectionUuid.test(value);
const isStringArray = (value: unknown, maximum = 100) => Array.isArray(value) && value.length <= maximum && value.every(item => isBoundedString(item, 500));
const isSafeInteger = (value: unknown, minimum = 0) => Number.isSafeInteger(value) && Number(value) >= minimum;
const includes = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T);
const sourceSetVersionLineageInvalid = (entry: unknown, index: number) => !isRecord(entry)
  || !isUuid(entry.sourceSetId) || !isUuid(entry.sourceSetVersionSelector)
  || !isSafeInteger(entry.sourceSetVersion, 1) || entry.ordinal !== index + 1;

/** Strict decoder for the minimized transcript-flow portion of the browser projection. */
export const decodeTranscriptFlowProjection = (value: unknown): TranscriptFlowProjection => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'features', 'sourceVersions', 'sourceSets', 'inputBundles', 'journeys', 'assessCandidates', 'assessConflicts', 'assessApplyPreviews', 'assessRuns'])) {
    throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  }
  if (value.schemaVersion !== TRANSCRIPT_FLOW_PROJECTION_VERSION || !isRecord(value.features)
    || !hasOnlyKeys(value.features, ['sourceSetsEnabled', 'assessMultisourceApplyEnabled', 'disabledReason'])
    || typeof value.features.sourceSetsEnabled !== 'boolean'
    || typeof value.features.assessMultisourceApplyEnabled !== 'boolean'
    || (value.features.disabledReason !== undefined && !isBoundedString(value.features.disabledReason, 500))) {
    throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  }
  const collectionKeys = ['sourceVersions', 'sourceSets', 'inputBundles', 'journeys', 'assessCandidates', 'assessConflicts', 'assessApplyPreviews', 'assessRuns'] as const;
  if (collectionKeys.some(key => !Array.isArray(value[key]))) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  if ((value.sourceVersions as unknown[]).some(entry => !isRecord(entry)
    || !isUuid(entry.sourceId) || !isUuid(entry.versionSelector)
    || !isBoundedString(entry.displayName, 240) || !isBoundedString(entry.versionLabel, 120) || !isBoundedString(entry.mimeType, 160)
    || !isSafeInteger(entry.extractedCharacterCount) || !includes(['ready', 'failed', 'deleted', 'pending'] as const, entry.state)
    || typeof entry.selectable !== 'boolean' || !includes(['unused', 'already_selected_elsewhere'] as const, entry.reuseState))) {
    throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  }
  if ((value.sourceSets as unknown[]).some(entry => {
    if (!isRecord(entry) || !isUuid(entry.id) || !isUuid(entry.versionSelector) || !isSafeInteger(entry.version, 1) || entry.ownerModule !== 'assess' || !isBoundedString(entry.label, 240)
      || (entry.description !== undefined && !isBoundedString(entry.description, 1_000)) || !isBoundedString(entry.versionLabel, 120)
      || !includes(['draft', 'locked', 'superseded', 'archived'] as const, entry.status)
      || !isSafeInteger(entry.sourceCount) || !isSafeInteger(entry.extractedCharacterCount)
      || !Array.isArray(entry.members) || entry.members.length > TRANSCRIPT_SOURCE_SET_MAX_MEMBERS
      || !includes(['ready', 'blocked', 'locked'] as const, entry.lockState) || !isStringArray(entry.blockers, 50) || !isFiniteDate(entry.updatedAt)) return true;
    return entry.members.some((member, index) => !isRecord(member) || !isUuid(member.sourceId) || !isUuid(member.versionSelector)
      || !isBoundedString(member.displayName, 240) || !isBoundedString(member.versionLabel, 120)
      || member.ordinal !== index + 1 || !includes(TRANSCRIPT_SOURCE_ROLES, member.role)
      || (member.note !== undefined && !isBoundedString(member.note, 500)) || !isSafeInteger(member.extractedCharacterCount)
      || !includes(['ready', 'failed', 'missing', 'deleted'] as const, member.state));
  })) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  if ((value.inputBundles as unknown[]).some(entry => !isRecord(entry) || !isUuid(entry.id) || !isUuid(entry.versionSelector) || !isSafeInteger(entry.version, 1) || entry.ownerModule !== 'assess'
    || !isBoundedString(entry.label, 240) || !isBoundedString(entry.versionLabel, 120)
    || !includes(['draft', 'locked', 'superseded'] as const, entry.status) || !Array.isArray(entry.sourceSetIds)
    || entry.sourceSetIds.some(id => !isUuid(id)) || new Set(entry.sourceSetIds).size !== entry.sourceSetIds.length
    || !Array.isArray(entry.sourceSetVersions)
    || entry.sourceSetVersions.length !== entry.sourceSetIds.length || entry.sourceSetVersions.length > TRANSCRIPT_SOURCE_SET_MAX_MEMBERS
    || entry.sourceSetVersions.some(sourceSetVersionLineageInvalid)
    || new Set(entry.sourceSetVersions.map(lineage => isRecord(lineage) ? lineage.sourceSetVersionSelector : '')).size !== entry.sourceSetVersions.length
    || entry.sourceSetVersions.some((lineage, index) => !isRecord(lineage) || lineage.sourceSetId !== entry.sourceSetIds[index])
    || !Array.isArray(entry.sourceVersionSelectors) || entry.sourceVersionSelectors.some(id => !isUuid(id))
    || !isSafeInteger(entry.sourceCount) || !isSafeInteger(entry.extractedCharacterCount)
    || (entry.lockedAt !== undefined && !isFiniteDate(entry.lockedAt)))) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  if ((value.journeys as unknown[]).some(entry => !isRecord(entry) || !isUuid(entry.id) || entry.entryModule !== 'assess'
    || !includes(['assess', 'studio', 'delivery', 'monitor'] as const, entry.desiredExitModule) || entry.currentModule !== 'assess'
    || entry.lineage !== 'assessed' || typeof entry.planningOnly !== 'boolean'
    || !includes(['active', 'stopped', 'completed', 'blocked', 'archived'] as const, entry.status)
    || !isSafeInteger(entry.version, 1) || !isFiniteDate(entry.updatedAt))) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  if ((value.assessCandidates as unknown[]).some(entry => !isRecord(entry) || !isUuid(entry.id) || !isSafeInteger(entry.candidateVersion, 1)
    || !isUuid(entry.inputBundleId) || !isUuid(entry.inputBundleVersionSelector) || !isUuid(entry.extractionBindingId) || !isUuid(entry.extractionJobId)
    || !isUuid(entry.sourceSetId) || !isUuid(entry.sourceSetVersionSelector) || !isSafeInteger(entry.sourceSetVersion, 1)
    || !isUuid(entry.sourceId) || !isUuid(entry.sourceVersionSelector) || !isBoundedString(entry.sourceLabel, 240) || !isBoundedString(entry.sourceVersionLabel, 120)
    || !isBoundedString(entry.field, 160) || !isBoundedString(entry.value) || (entry.safeExcerpt !== undefined && !isBoundedString(entry.safeExcerpt, 1_000))
    || !isBoundedString(entry.sourceLocator, 400) || typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1
    || !includes(['suggested', 'accepted', 'rejected', 'edited', 'unresolved'] as const, entry.status)
    || !includes(['neutral', 'supporting', 'contradictory'] as const, entry.relationship)
    || !includes(TRANSCRIPT_ASSESS_APPLICATION_INTENTS, entry.applicationIntent)
    || (entry.applyTarget !== undefined && !isBoundedString(entry.applyTarget, 240))
    || !includes(['anchored', 'incomplete'] as const, entry.provenanceState)
    || !includes(['pending', 'reviewed_by_you', 'reviewed_by_another'] as const, entry.reviewState)
    || !isSafeInteger(entry.editCount) || (entry.reviewedAt !== undefined && !isFiniteDate(entry.reviewedAt)))) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  const conflictInvalid = (entry: unknown) => !isRecord(entry) || !isUuid(entry.id) || !isBoundedString(entry.field, 240)
    || !Array.isArray(entry.candidateIds) || entry.candidateIds.some(id => !isUuid(id)) || !isStringArray(entry.candidateSummaries, 100)
    || (entry.manualValue !== undefined && !isBoundedString(entry.manualValue)) || typeof entry.material !== 'boolean'
    || !includes(['unresolved', 'choose_candidate', 'retain_manual', 'authored_resolution'] as const, entry.resolution)
    || (entry.resolvedValue !== undefined && !isBoundedString(entry.resolvedValue)) || (entry.rationale !== undefined && !isBoundedString(entry.rationale, 2_000))
    || !isSafeInteger(entry.resolutionVersion);
  if ((value.assessConflicts as unknown[]).some(conflictInvalid)) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  if ((value.assessApplyPreviews as unknown[]).some(entry => !isRecord(entry) || !isUuid(entry.id)
    || !Array.isArray(entry.previewIds) || entry.previewIds.length < 1 || entry.previewIds.length > 100 || entry.previewIds.some(id => !isUuid(id))
    || !isUuid(entry.assessDraftId) || !isUuid(entry.inputBundleId) || !isUuid(entry.inputBundleVersionSelector)
    || !isSafeInteger(entry.inputBundleVersion, 1) || !Array.isArray(entry.sourceSetVersionSelectors)
    || entry.sourceSetVersionSelectors.length < 1 || entry.sourceSetVersionSelectors.some(id => !isUuid(id))
    || !isSafeInteger(entry.expectedDraftVersion, 1) || !Array.isArray(entry.candidateIds) || entry.candidateIds.some(id => !isUuid(id))
    || !Array.isArray(entry.changes) || entry.changes.some(change => !isRecord(change) || !isUuid(change.candidateId)
      || !includes(TRANSCRIPT_ASSESS_APPLICATION_INTENTS, change.intent) || !isBoundedString(change.target, 240)
      || !isBoundedString(change.summary, 1_000) || !includes(['none', 'manual_conflict', 'cross_source_conflict'] as const, change.conflictState))
    || !Array.isArray(entry.conflicts) || entry.conflicts.some(conflictInvalid)
    || !includes(['ready', 'blocked', 'applied', 'stale'] as const, entry.status) || !isFiniteDate(entry.expiresAt))) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  if ((value.assessRuns as unknown[]).some(entry => !isRecord(entry) || !isUuid(entry.id) || !isUuid(entry.inputBundleId)
    || !isUuid(entry.inputBundleVersionSelector) || !Array.isArray(entry.extractionBindingIds) || entry.extractionBindingIds.some(id => !isUuid(id))
    || !Array.isArray(entry.extractionJobIds) || entry.extractionJobIds.some(id => !isUuid(id))
    || !Array.isArray(entry.extractionBindings) || entry.extractionBindings.length !== entry.extractionBindingIds.length
    || new Set(entry.extractionBindingIds).size !== entry.extractionBindingIds.length || new Set(entry.extractionJobIds).size !== entry.extractionJobIds.length
    || entry.extractionBindings.some((binding, index) => !isRecord(binding)
      || !isUuid(binding.extractionBindingId) || binding.extractionBindingId !== entry.extractionBindingIds[index]
      || !isUuid(binding.extractionJobId) || binding.extractionJobId !== entry.extractionJobIds[index]
      || !isUuid(binding.sourceSetId) || !isUuid(binding.sourceSetVersionSelector) || !isSafeInteger(binding.sourceSetVersion, 1)
      || !isUuid(binding.sourceVersionSelector))
    || !Array.isArray(entry.sourceSetVersions) || entry.sourceSetVersions.some(sourceSetVersionLineageInvalid)
    || !Array.isArray(entry.sourceVersionSelectors) || entry.sourceVersionSelectors.some(id => !isUuid(id))
    || !includes(['requested', 'processing', 'review_required', 'draft_ready', 'completed', 'failed', 'blocked'] as const, entry.state)
    || !isSafeInteger(entry.selectedSourceCount) || !isSafeInteger(entry.completedSourceCount) || !isSafeInteger(entry.candidateCount)
    || (entry.failureCode !== undefined && !includes(['SOURCE_INCOMPLETE', 'BUDGET_EXHAUSTED', 'PROVIDER_UNAVAILABLE', 'AUTHORIZATION_UNAVAILABLE'] as const, entry.failureCode))
    || !isFiniteDate(entry.updatedAt))) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  const inputBundlesByVersion = new Map((value.inputBundles as TranscriptInputBundleProjection[]).map(bundle => [bundle.versionSelector, bundle]));
  if ((value.assessCandidates as TranscriptBoundAssessCandidateProjection[]).some(candidate => {
    const bundle = inputBundlesByVersion.get(candidate.inputBundleVersionSelector);
    return !bundle || bundle.id !== candidate.inputBundleId
      || !bundle.sourceSetVersions.some(lineage => lineage.sourceSetId === candidate.sourceSetId
        && lineage.sourceSetVersionSelector === candidate.sourceSetVersionSelector
        && lineage.sourceSetVersion === candidate.sourceSetVersion)
      || !bundle.sourceVersionSelectors.includes(candidate.sourceVersionSelector);
  })) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  if ((value.assessRuns as TranscriptAssessRunProjection[]).some(run => {
    const bundle = inputBundlesByVersion.get(run.inputBundleVersionSelector);
    return !bundle || bundle.id !== run.inputBundleId
      || JSON.stringify(run.sourceSetVersions) !== JSON.stringify(bundle.sourceSetVersions)
      || run.extractionBindings.some(binding => !run.sourceSetVersions.some(lineage => lineage.sourceSetId === binding.sourceSetId
        && lineage.sourceSetVersionSelector === binding.sourceSetVersionSelector
        && lineage.sourceSetVersion === binding.sourceSetVersion));
  })) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  const assessRuns = value.assessRuns as TranscriptAssessRunProjection[];
  if ((value.assessCandidates as TranscriptBoundAssessCandidateProjection[]).some(candidate => !assessRuns.some(run =>
    run.inputBundleId === candidate.inputBundleId && run.inputBundleVersionSelector === candidate.inputBundleVersionSelector
    && run.extractionBindings.some(binding => binding.extractionBindingId === candidate.extractionBindingId
      && binding.extractionJobId === candidate.extractionJobId && binding.sourceSetId === candidate.sourceSetId
      && binding.sourceSetVersionSelector === candidate.sourceSetVersionSelector && binding.sourceSetVersion === candidate.sourceSetVersion
      && binding.sourceVersionSelector === candidate.sourceVersionSelector)))) throw new Error('TRANSCRIPT_FLOW_PROJECTION_INVALID');
  return structuredClone(value) as unknown as TranscriptFlowProjection;
};

export const emptyTranscriptFlowProjection = (): TranscriptFlowProjection => ({
  schemaVersion: TRANSCRIPT_FLOW_PROJECTION_VERSION,
  features: {
    sourceSetsEnabled: false,
    assessMultisourceApplyEnabled: false,
    disabledReason: 'Governed multi-source transcript processing is disabled for this workspace.',
  },
  sourceVersions: [],
  sourceSets: [],
  inputBundles: [],
  journeys: [],
  assessCandidates: [],
  assessConflicts: [],
  assessApplyPreviews: [],
  assessRuns: [],
});
