/**
 * Browser-safe contract for governed supporting-document mapping into Assess V2.
 *
 * The model may select only an opaque server-issued target and propose a typed
 * literal. Tenant selectors, JSON paths, identities, evidence approval and
 * deterministic decision outputs are never model-authored.
 */

export const ASSESS_DOCUMENT_MAPPING_SCHEMA_VERSION = 'assess-supporting-document-map-v1' as const;
export const ASSESS_DOCUMENT_MAPPING_MAX_PROPOSALS = 100;
export const ASSESS_DOCUMENT_MAPPING_MAX_PROVIDER_BYTES = 120_000;

export type AssessMappingJsonValue = null | boolean | number | string | AssessMappingJsonValue[] | { [key: string]: AssessMappingJsonValue };

export const ASSESS_MAPPING_TARGET_KINDS = [
  'case_field', 'primitive_field', 'primitive_fact', 'agent_fact', 'asset_field',
  'interaction_field', 'interaction_fact', 'create_primitive', 'create_asset',
  'create_interaction', 'create_decision_point', 'create_exception_path', 'evidence_only',
] as const;
export type AssessMappingTargetKind = typeof ASSESS_MAPPING_TARGET_KINDS[number];

export const ASSESS_MAPPING_OPERATIONS = ['set_field', 'set_fact', 'create_entity', 'link_evidence'] as const;
export type AssessMappingOperation = typeof ASSESS_MAPPING_OPERATIONS[number];

export const ASSESS_MAPPING_VALUE_TYPES = [
  'text', 'boolean', 'ratio', 'number', 'text_list', 'primitive_type', 'business_disposition',
  'interaction_mode', 'data_classification', 'asset_strategic_lifespan',
  'asset_technical_health', 'asset_business_criticality', 'asset_ownership_model',
  'asset_vendor_roadmap', 'asset_operating_stability', 'primitive_constructor',
  'asset_constructor', 'interaction_constructor', 'decision_constructor',
  'exception_constructor', 'evidence',
] as const;
export type AssessMappingValueType = typeof ASSESS_MAPPING_VALUE_TYPES[number];

export interface AssessMappingTargetDescriptor {
  selectorId: string;
  catalogId: string;
  caseId: string;
  caseVersion: number;
  assessSchemaVersion: string;
  targetKind: AssessMappingTargetKind;
  operation: AssessMappingOperation;
  entityId?: string;
  fieldId: string;
  label: string;
  contextLabel: string;
  valueType: AssessMappingValueType;
  allowedValues?: string[];
  currentValue?: AssessMappingJsonValue;
  currentValueHash: string;
  manual: boolean;
}

export interface AssessMappingCatalogProjection {
  id: string;
  caseId: string;
  caseVersion: number;
  assessSchemaVersion: string;
  catalogVersion: 1;
  catalogHash: string;
  status: 'current' | 'stale';
  targets: AssessMappingTargetDescriptor[];
  createdAt: string;
}

export interface AssessMappingSourceAnchor {
  sourceVersionId: string;
  parserVersion: string;
  locator: string;
  anchorHash: string;
  safeExcerpt: string;
}

export type AssessMappingProposalStatus = 'suggested' | 'accepted' | 'rejected' | 'edited';

export interface AssessMappingProposalProjection {
  id: string;
  version: number;
  catalogId: string;
  targetSelectorId: string;
  caseId: string;
  caseVersion: number;
  inputBundleId: string;
  inputBundleVersionId: string;
  extractionJobId: string;
  extractionBindingId: string;
  sourceId: string;
  sourceVersionId: string;
  proposedValue: AssessMappingJsonValue;
  effectiveValue: AssessMappingJsonValue;
  confidence: number;
  rationale?: string;
  sourceAnchor: AssessMappingSourceAnchor;
  status: AssessMappingProposalStatus;
  relationship: 'neutral' | 'supporting' | 'contradictory';
  reviewState: 'pending' | 'reviewed_by_you' | 'reviewed_by_another';
  reviewedAt?: string;
}

export interface AssessMappingPreviewChangeProjection {
  proposalId: string;
  targetSelectorId: string;
  label: string;
  currentValue?: AssessMappingJsonValue;
  proposedValue: AssessMappingJsonValue;
  conflictState: 'none' | 'manual_conflict' | 'cross_source_conflict';
}

export interface AssessMappingConflictProjection {
  id: string;
  targetSelectorId: string;
  label: string;
  proposalIds: string[];
  currentValue?: AssessMappingJsonValue;
  material: boolean;
  resolution: 'unresolved' | 'choose_candidate' | 'retain_manual' | 'authored_resolution';
  resolvedValue?: AssessMappingJsonValue;
  rationale?: string;
  resolutionVersion: number;
}

export interface AssessMappingPreviewManifest {
  previewBatchId: string;
  manifestVersion: number;
  catalogId: string;
  catalogHash: string;
  caseId: string;
  caseVersion: number;
  inputBundleId: string;
  inputBundleVersionId: string;
  targetCount: number;
  sourceCount: number;
  itemCount: number;
  reviewedCount: number;
  conflictCount: number;
  unresolvedConflictCount: number;
  itemSetHash: string;
  conflictSetHash: string;
  resolutionSetHash: string;
  displayedSetHash: string;
}

export interface AssessMappingPreviewProjection {
  id: string;
  catalogId: string;
  catalogHash: string;
  caseId: string;
  expectedCaseVersion: number;
  inputBundleId: string;
  inputBundleVersionId: string;
  proposalIds: string[];
  changes: AssessMappingPreviewChangeProjection[];
  conflicts: AssessMappingConflictProjection[];
  manifest: AssessMappingPreviewManifest;
  projectionComplete: boolean;
  status: 'ready' | 'blocked' | 'applied' | 'stale';
  expiresAt: string;
}

export interface AssessMappingRunProjection {
  id: string;
  catalogId: string;
  caseId: string;
  caseVersion: number;
  inputBundleId: string;
  inputBundleVersionId: string;
  extractionJobIds: string[];
  state: 'requested' | 'processing' | 'review_required' | 'failed' | 'blocked';
  proposalCount: number;
  projectionComplete: boolean;
  warnings?: string[];
  analyzedSources?: Array<{
    sourceId: string;
    sourceVersionId: string;
    parserVersion: string;
    extractedByteCount: number;
    sheetCount: number;
    cellCount: number;
    warnings: string[];
  }>;
  failureCode?: 'SOURCE_TOO_LARGE' | 'SOURCE_INCOMPLETE' | 'BUDGET_EXHAUSTED' | 'PROVIDER_UNAVAILABLE' | 'AUTHORIZATION_UNAVAILABLE';
  updatedAt: string;
}

export interface AssessDocumentMappingProjection {
  schemaVersion: typeof ASSESS_DOCUMENT_MAPPING_SCHEMA_VERSION;
  features: { enabled: boolean; disabledReason?: string };
  catalogs: AssessMappingCatalogProjection[];
  proposals: AssessMappingProposalProjection[];
  previews: AssessMappingPreviewProjection[];
  conflicts: AssessMappingConflictProjection[];
  runs: AssessMappingRunProjection[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const only = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const bounded = (value: unknown, maximum = 12_000) => typeof value === 'string' && Array.from(value).length <= maximum;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const integer = (value: unknown, minimum = 0) => Number.isSafeInteger(value) && Number(value) >= minimum;
const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T);

export const isAssessMappingJsonValue = (value: unknown, depth = 0): value is AssessMappingJsonValue => {
  if (depth > 6) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return typeof value !== 'string' || Array.from(value).length <= 12_000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => isAssessMappingJsonValue(item, depth + 1));
  return record(value) && Object.keys(value).length <= 40
    && Object.entries(value).every(([key, item]) => /^[A-Za-z][A-Za-z0-9]*$/.test(key) && isAssessMappingJsonValue(item, depth + 1));
};

export const emptyAssessDocumentMappingProjection = (): AssessDocumentMappingProjection => ({
  schemaVersion: ASSESS_DOCUMENT_MAPPING_SCHEMA_VERSION,
  features: { enabled: false, disabledReason: 'Supporting-document mapping is disabled.' },
  catalogs: [], proposals: [], previews: [], conflicts: [], runs: [],
});

const decodeAnchor = (value: unknown): value is AssessMappingSourceAnchor => record(value)
  && only(value, ['sourceVersionId', 'parserVersion', 'locator', 'anchorHash', 'safeExcerpt'])
  && typeof value.sourceVersionId === 'string' && uuid.test(value.sourceVersionId)
  && bounded(value.parserVersion, 120) && bounded(value.locator, 500)
  && typeof value.anchorHash === 'string' && digest.test(value.anchorHash)
  && bounded(value.safeExcerpt, 1_000);

const decodePreviewManifest = (value: unknown): value is AssessMappingPreviewManifest => record(value)
  && only(value, ['previewBatchId', 'manifestVersion', 'catalogId', 'catalogHash', 'caseId', 'caseVersion', 'inputBundleId', 'inputBundleVersionId',
    'targetCount', 'sourceCount', 'itemCount', 'reviewedCount', 'conflictCount', 'unresolvedConflictCount', 'itemSetHash', 'conflictSetHash', 'resolutionSetHash', 'displayedSetHash'])
  && ['previewBatchId', 'catalogId', 'caseId', 'inputBundleId', 'inputBundleVersionId'].every(key => uuid.test(String(value[key])))
  && ['catalogHash', 'itemSetHash', 'conflictSetHash', 'resolutionSetHash', 'displayedSetHash'].every(key => digest.test(String(value[key])))
  && integer(value.caseVersion, 1) && integer(value.manifestVersion, 1)
  && ['targetCount', 'sourceCount', 'itemCount', 'reviewedCount', 'conflictCount', 'unresolvedConflictCount'].every(key => integer(value[key]));

export const decodeAssessDocumentMappingProjection = (value: unknown): AssessDocumentMappingProjection => {
  if (!record(value) || !only(value, ['schemaVersion', 'features', 'catalogs', 'proposals', 'previews', 'conflicts', 'runs'])
    || value.schemaVersion !== ASSESS_DOCUMENT_MAPPING_SCHEMA_VERSION
    || !record(value.features) || !only(value.features, ['enabled', 'disabledReason']) || typeof value.features.enabled !== 'boolean'
    || (value.features.disabledReason !== undefined && !bounded(value.features.disabledReason, 500))
    || !Array.isArray(value.catalogs) || !Array.isArray(value.proposals) || !Array.isArray(value.previews)
    || !Array.isArray(value.conflicts) || !Array.isArray(value.runs)
    || value.catalogs.length > 100 || value.proposals.length > 1_000 || value.previews.length > 200
    || value.conflicts.length > 1_000 || value.runs.length > 100) throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  const catalogs = value.catalogs as unknown[];
  if (catalogs.some(item => !record(item) || !only(item, ['id', 'caseId', 'caseVersion', 'assessSchemaVersion', 'catalogVersion', 'catalogHash', 'status', 'targets', 'createdAt'])
    || !uuid.test(String(item.id)) || !uuid.test(String(item.caseId))
    || !integer(item.caseVersion, 1) || item.catalogVersion !== 1 || !bounded(item.assessSchemaVersion, 120)
    || typeof item.catalogHash !== 'string' || !digest.test(item.catalogHash) || !oneOf(['current', 'stale'] as const, item.status)
    || !date(item.createdAt) || !Array.isArray(item.targets) || item.targets.length > 2_000
    || item.targets.some(target => !record(target) || !only(target, ['selectorId', 'catalogId', 'caseId', 'caseVersion', 'assessSchemaVersion', 'targetKind', 'operation', 'entityId', 'fieldId', 'label', 'contextLabel', 'valueType', 'allowedValues', 'currentValue', 'currentValueHash', 'manual']) || !uuid.test(String(target.selectorId))
      || target.catalogId !== item.id || target.caseId !== item.caseId || target.caseVersion !== item.caseVersion
      || target.assessSchemaVersion !== item.assessSchemaVersion || !oneOf(ASSESS_MAPPING_TARGET_KINDS, target.targetKind)
      || !oneOf(ASSESS_MAPPING_OPERATIONS, target.operation) || (target.entityId !== undefined && !uuid.test(String(target.entityId)))
      || !bounded(target.fieldId, 160) || !bounded(target.label, 240) || !bounded(target.contextLabel, 240)
      || !oneOf(ASSESS_MAPPING_VALUE_TYPES, target.valueType) || (target.allowedValues !== undefined
        && (!Array.isArray(target.allowedValues) || target.allowedValues.length > 50 || target.allowedValues.some(option => !bounded(option, 200))))
      || (target.currentValue !== undefined && !isAssessMappingJsonValue(target.currentValue))
      || typeof target.currentValueHash !== 'string' || !digest.test(target.currentValueHash) || typeof target.manual !== 'boolean'))) {
    throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  }
  const proposals = value.proposals as unknown[];
  if (proposals.some(item => !record(item) || !only(item, ['id', 'version', 'catalogId', 'targetSelectorId', 'caseId', 'caseVersion', 'inputBundleId', 'inputBundleVersionId', 'extractionJobId', 'extractionBindingId', 'sourceId', 'sourceVersionId', 'proposedValue', 'effectiveValue', 'confidence', 'rationale', 'sourceAnchor', 'status', 'relationship', 'reviewState', 'reviewedAt'])
    || !uuid.test(String(item.id)) || !integer(item.version, 1)
    || !['catalogId', 'targetSelectorId', 'caseId', 'inputBundleId', 'inputBundleVersionId', 'extractionJobId', 'extractionBindingId', 'sourceId', 'sourceVersionId'].every(key => uuid.test(String(item[key])))
    || !integer(item.caseVersion, 1) || !isAssessMappingJsonValue(item.proposedValue) || !isAssessMappingJsonValue(item.effectiveValue)
    || typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1
    || (item.rationale !== undefined && !bounded(item.rationale, 2_000)) || !decodeAnchor(item.sourceAnchor)
    || !oneOf(['suggested', 'accepted', 'rejected', 'edited'] as const, item.status)
    || !oneOf(['neutral', 'supporting', 'contradictory'] as const, item.relationship)
    || !oneOf(['pending', 'reviewed_by_you', 'reviewed_by_another'] as const, item.reviewState)
    || (item.reviewedAt !== undefined && !date(item.reviewedAt)))) throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  const conflicts = value.conflicts as unknown[];
  if (conflicts.some(item => !record(item) || !only(item, ['id', 'targetSelectorId', 'label', 'proposalIds', 'currentValue', 'material', 'resolution', 'resolvedValue', 'rationale', 'resolutionVersion'])
    || !uuid.test(String(item.id)) || !uuid.test(String(item.targetSelectorId))
    || !bounded(item.label, 240) || !Array.isArray(item.proposalIds) || item.proposalIds.some(id => !uuid.test(String(id)))
    || (item.currentValue !== undefined && !isAssessMappingJsonValue(item.currentValue)) || typeof item.material !== 'boolean'
    || !oneOf(['unresolved', 'choose_candidate', 'retain_manual', 'authored_resolution'] as const, item.resolution)
    || (item.resolvedValue !== undefined && !isAssessMappingJsonValue(item.resolvedValue))
    || (item.rationale !== undefined && !bounded(item.rationale, 2_000)) || !integer(item.resolutionVersion))) {
    throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  }
  const previews = value.previews as unknown[];
  if (previews.some(item => !record(item) || !only(item, ['id', 'catalogId', 'catalogHash', 'caseId', 'expectedCaseVersion', 'inputBundleId', 'inputBundleVersionId', 'proposalIds', 'changes', 'conflicts', 'manifest', 'projectionComplete', 'status', 'expiresAt'])
    || !uuid.test(String(item.id)) || !uuid.test(String(item.catalogId))
    || typeof item.catalogHash !== 'string' || !digest.test(item.catalogHash) || !uuid.test(String(item.caseId))
    || !integer(item.expectedCaseVersion, 1) || !uuid.test(String(item.inputBundleId)) || !uuid.test(String(item.inputBundleVersionId))
    || !Array.isArray(item.proposalIds) || item.proposalIds.some(id => !uuid.test(String(id)))
    || !Array.isArray(item.changes) || item.changes.length > 100 || item.changes.some(change => !record(change)
      || !only(change, ['proposalId', 'targetSelectorId', 'label', 'currentValue', 'proposedValue', 'conflictState'])
      || !uuid.test(String(change.proposalId)) || !uuid.test(String(change.targetSelectorId)) || !bounded(change.label, 240)
      || (change.currentValue !== undefined && !isAssessMappingJsonValue(change.currentValue)) || !isAssessMappingJsonValue(change.proposedValue)
      || !oneOf(['none', 'manual_conflict', 'cross_source_conflict'] as const, change.conflictState))
    || !Array.isArray(item.conflicts) || item.conflicts.length > 200 || !decodePreviewManifest(item.manifest) || typeof item.projectionComplete !== 'boolean'
    || !oneOf(['ready', 'blocked', 'applied', 'stale'] as const, item.status) || !date(item.expiresAt))) {
    throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  }
  const runs = value.runs as unknown[];
  if (runs.some(item => !record(item) || !only(item, ['id', 'catalogId', 'caseId', 'caseVersion', 'inputBundleId', 'inputBundleVersionId', 'extractionJobIds', 'state', 'proposalCount', 'projectionComplete', 'warnings', 'analyzedSources', 'failureCode', 'updatedAt'])
    || !uuid.test(String(item.id)) || !uuid.test(String(item.catalogId))
    || !uuid.test(String(item.caseId)) || !integer(item.caseVersion, 1) || !uuid.test(String(item.inputBundleId))
    || !uuid.test(String(item.inputBundleVersionId)) || !Array.isArray(item.extractionJobIds)
    || item.extractionJobIds.some(id => !uuid.test(String(id)))
    || !oneOf(['requested', 'processing', 'review_required', 'failed', 'blocked'] as const, item.state)
    || !integer(item.proposalCount) || typeof item.projectionComplete !== 'boolean' || (item.warnings !== undefined && (!Array.isArray(item.warnings) || item.warnings.length > 40 || item.warnings.some(warning => !bounded(warning, 500))))
    || (item.analyzedSources !== undefined && (!Array.isArray(item.analyzedSources) || item.analyzedSources.length > 20
      || item.analyzedSources.some(source => !record(source) || !only(source, ['sourceId', 'sourceVersionId', 'parserVersion', 'extractedByteCount', 'sheetCount', 'cellCount', 'warnings'])
        || !uuid.test(String(source.sourceId)) || !uuid.test(String(source.sourceVersionId)) || !bounded(source.parserVersion, 120)
        || !integer(source.extractedByteCount) || !integer(source.sheetCount) || !integer(source.cellCount)
        || !Array.isArray(source.warnings) || source.warnings.length > 40 || source.warnings.some(warning => !bounded(warning, 500)))))
    || (item.failureCode !== undefined && !oneOf(['SOURCE_TOO_LARGE', 'SOURCE_INCOMPLETE', 'BUDGET_EXHAUSTED', 'PROVIDER_UNAVAILABLE', 'AUTHORIZATION_UNAVAILABLE'] as const, item.failureCode))
    || !date(item.updatedAt))) throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  const decoded = value as unknown as AssessDocumentMappingProjection;
  const unique = (items: readonly string[]) => new Set(items).size === items.length;
  if (!unique(decoded.catalogs.map(item => item.id)) || !unique(decoded.proposals.map(item => item.id))
    || !unique(decoded.previews.map(item => item.id)) || !unique(decoded.conflicts.map(item => item.id)) || !unique(decoded.runs.map(item => item.id))) {
    throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  }
  const catalogById = new Map(decoded.catalogs.map(item => [item.id, item]));
  const targetById = new Map<string, AssessMappingTargetDescriptor>();
  for (const catalog of decoded.catalogs) {
    if (!unique(catalog.targets.map(target => target.selectorId))) throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
    for (const target of catalog.targets) {
      if (targetById.has(target.selectorId)) throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
      targetById.set(target.selectorId, target);
    }
  }
  const proposalById = new Map(decoded.proposals.map(item => [item.id, item]));
  if (decoded.proposals.some(proposal => {
    const catalog = catalogById.get(proposal.catalogId); const target = targetById.get(proposal.targetSelectorId);
    return !catalog || !target || target.catalogId !== catalog.id || proposal.caseId !== catalog.caseId
      || proposal.caseVersion !== catalog.caseVersion || proposal.sourceAnchor.sourceVersionId !== proposal.sourceVersionId;
  })) throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  const conflictById = new Map(decoded.conflicts.map(item => [item.id, item]));
  if (decoded.conflicts.some(conflict => {
    const target = targetById.get(conflict.targetSelectorId);
    return !target || !unique(conflict.proposalIds) || conflict.proposalIds.length > 100
      || conflict.proposalIds.some(id => {
        const proposal = proposalById.get(id);
        return !proposal || proposal.targetSelectorId !== target.selectorId || proposal.catalogId !== target.catalogId;
      });
  })) throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  if (decoded.previews.some(preview => {
    const catalog = catalogById.get(preview.catalogId);
    const run = decoded.runs.find(candidate => candidate.catalogId === preview.catalogId
      && candidate.caseId === preview.caseId && candidate.caseVersion === preview.expectedCaseVersion
      && candidate.inputBundleId === preview.inputBundleId && candidate.inputBundleVersionId === preview.inputBundleVersionId);
    return !catalog || preview.catalogHash !== catalog.catalogHash || preview.caseId !== catalog.caseId
      || preview.expectedCaseVersion !== catalog.caseVersion || !unique(preview.proposalIds)
      || preview.manifest.previewBatchId !== preview.id || preview.manifest.catalogId !== preview.catalogId
      || preview.manifest.catalogHash !== preview.catalogHash || preview.manifest.caseId !== preview.caseId
      || preview.manifest.caseVersion !== preview.expectedCaseVersion || preview.manifest.inputBundleId !== preview.inputBundleId
      || preview.manifest.inputBundleVersionId !== preview.inputBundleVersionId
      || (preview.projectionComplete && (preview.manifest.itemCount !== preview.proposalIds.length
        || preview.manifest.reviewedCount !== preview.changes.length || preview.manifest.conflictCount !== preview.conflicts.length
        || preview.manifest.unresolvedConflictCount !== preview.conflicts.filter(conflict => conflict.resolution === 'unresolved').length
        || preview.manifest.targetCount !== catalog.targets.length || !run?.projectionComplete
        || preview.manifest.sourceCount !== run.extractionJobIds.length))
      || preview.proposalIds.some(id => !proposalById.has(id))
      || preview.changes.some(change => !preview.proposalIds.includes(change.proposalId)
        || proposalById.get(change.proposalId)?.targetSelectorId !== change.targetSelectorId)
      || preview.proposalIds.some(id => {
        const proposal = proposalById.get(id);
        return !proposal || proposal.catalogId !== preview.catalogId || proposal.caseId !== preview.caseId
          || proposal.caseVersion !== preview.expectedCaseVersion || proposal.inputBundleId !== preview.inputBundleId
          || proposal.inputBundleVersionId !== preview.inputBundleVersionId;
      })
      || preview.conflicts.some(conflict => {
        const canonical = conflictById.get(conflict.id);
        return !canonical || JSON.stringify(canonical) !== JSON.stringify(conflict);
      });
  }) || decoded.runs.some(run => {
    const catalog = catalogById.get(run.catalogId);
    return !catalog || run.caseId !== catalog.caseId || run.caseVersion !== catalog.caseVersion || !unique(run.extractionJobIds)
      || (run.analyzedSources !== undefined && (!unique(run.analyzedSources.map(source => source.sourceVersionId))
        || run.analyzedSources.length !== run.extractionJobIds.length));
  })) throw new Error('ASSESS_DOCUMENT_MAPPING_PROJECTION_INVALID');
  return structuredClone(decoded);
};
