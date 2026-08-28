/**
 * Public, non-authoritative contracts for governed Studio artifacts.
 *
 * The browser may select exact identities and submit authored values, but the
 * server reloads every source package, template, handoff, lifecycle, hash,
 * route and authorization decision. Provider configuration and source hashes
 * are intentionally absent from these safe projections.
 */
export const STUDIO_ARTIFACT_CONTRACT_VERSION = 'studio-artifact-2' as const;
export const STUDIO_WORKSPACE_CONTRACT_VERSION = 'studio-workspace-2' as const;
export const STUDIO_ARTIFACT_SUMMARY_CONTRACT_VERSION = 'studio-artifact-summary-2' as const;
export const LEGACY_STUDIO_ARTIFACT_CONTRACT_VERSION = 'studio-artifact-1' as const;
export type StudioArtifactContractVersion =
  | typeof STUDIO_ARTIFACT_CONTRACT_VERSION
  | typeof LEGACY_STUDIO_ARTIFACT_CONTRACT_VERSION;

/** Retained verbatim for accepted PR A clients and proof contracts. */
export const STUDIO_ARTIFACT_TYPES = ['brd', 'frd', 'pdd'] as const;
export type StudioArtifactType = (typeof STUDIO_ARTIFACT_TYPES)[number];
export const STUDIO_TEMPLATE_ARTIFACT_CLASSES = ['brd', 'frd', 'pdd', 'custom'] as const;
export type StudioTemplateArtifactClass = (typeof STUDIO_TEMPLATE_ARTIFACT_CLASSES)[number];

export const STUDIO_SOURCE_MODES = [
  'assess_handoff', 'direct_transcript_bundle', 'assess_plus_transcript_bundle', 'manual_brief',
] as const;
export type StudioSourceMode = (typeof STUDIO_SOURCE_MODES)[number];
export type StudioAssessmentLabel = 'assessed' | 'mixed' | 'not_assessed';
export type StudioPlanningLabel = 'governed_assessed' | 'planning_only';

export const STUDIO_SECTION_NON_SOURCE_LABELS = ['human_authored', 'template_required', 'assumption'] as const;
export type StudioSectionNonSourceLabel = (typeof STUDIO_SECTION_NON_SOURCE_LABELS)[number];

export const STUDIO_ARTIFACT_LIFECYCLES = [
  'draft', 'reviewer_ready', 'in_review', 'changes_requested', 'review_rejected',
  'approval_ready', 'approved', 'approval_rejected', 'superseded',
] as const;
export type StudioArtifactLifecycle = (typeof STUDIO_ARTIFACT_LIFECYCLES)[number];
export const STUDIO_TEMPLATE_LIFECYCLES = [
  'draft', 'reviewer_ready', 'in_review', 'changes_requested', 'rejected',
  'approval_ready', 'approved', 'deprecated', 'replaced',
] as const;
export type StudioTemplateLifecycle = (typeof STUDIO_TEMPLATE_LIFECYCLES)[number];
export const STUDIO_HANDOFF_LIFECYCLES = [
  'draft', 'requested', 'target_review', 'changes_requested', 'rejected',
  'approved', 'accepted', 'consumed', 'withdrawn', 'stale',
] as const;
export type StudioHandoffLifecycle = (typeof STUDIO_HANDOFF_LIFECYCLES)[number];
export const STUDIO_GENERATION_STATES = [
  'requested', 'claimed', 'generating', 'staged', 'reconciling', 'completed', 'failed', 'stale', 'uncertain',
] as const;
export type StudioGenerationState = (typeof STUDIO_GENERATION_STATES)[number];

/** Accepted PR A commands remain stable. */
export const STUDIO_COMMAND_TYPES = [
  'studio.artifact.generation.request', 'studio.artifact.draft.revise',
  'studio.artifact.review.submit', 'studio.artifact.review.assign',
  'studio.artifact.review.resolve', 'studio.artifact.approval.resolve',
] as const;
export type StudioCommandType = (typeof STUDIO_COMMAND_TYPES)[number];

/** PR B commands use an independently versioned surface. */
export const STUDIO_GOVERNED_COMMAND_TYPES = [
  'studio.source-package.create',
  'studio.handoff.request', 'studio.handoff.review.resolve', 'studio.handoff.approval.resolve',
  'studio.handoff.withdraw', 'studio.handoff.consume',
  'studio.template.create', 'studio.template.revise', 'studio.template.review.submit', 'studio.template.review.resolve',
  'studio.template.approval.resolve', 'studio.template.deprecate', 'studio.template.replace',
  'studio.generation.request',
] as const;
export type StudioGovernedCommandType = (typeof STUDIO_GOVERNED_COMMAND_TYPES)[number];
export type StudioServerCommandType = StudioCommandType | StudioGovernedCommandType;

export type StudioConditions = readonly string[];
export type StudioReviewOutcome = 'approve' | 'changes_requested' | 'reject';
export type StudioApprovalOutcome = 'approve' | 'reject';
export type StudioHandoffTargetOutcome = 'accept' | 'changes_requested' | 'reject';

export interface StudioExactVersionSelector { id: string; version: number }
export type StudioExactTemplateSelector =
  | { kind: 'system'; versionId: string; version: string }
  | { kind: 'tenant'; templateId: string; versionId: string; version: number };

export type StudioSourcePackageCreatePayload =
  | { sourceMode: 'direct_transcript_bundle'; artifactType: StudioArtifactType; studioInputBundle: { id: string; versionId: string; version: number }; manualBrief: null }
  | { sourceMode: 'manual_brief'; artifactType: StudioArtifactType; studioInputBundle: null; manualBrief: string };

export interface StudioTemplateSectionDefinition {
  id: string;
  title: string;
  required: boolean;
  fieldKind: 'narrative' | 'requirements' | 'rules' | 'controls' | 'risks' | 'interfaces' | 'acceptance_criteria';
}

export interface StudioCommandPayloads {
  'studio.artifact.generation.request': { studioHandoffId: string; artifactType: StudioArtifactType };
  'studio.artifact.draft.revise': { artifactId: string; parentVersionId: string; content: Record<string, unknown> };
  'studio.artifact.review.submit': { artifactId: string; artifactVersionId: string };
  'studio.artifact.review.assign': { artifactId: string; artifactVersionId: string; reviewerId: string };
  'studio.artifact.review.resolve': { artifactId: string; artifactVersionId: string; outcome: StudioReviewOutcome; rationale: string; conditions: StudioConditions };
  'studio.artifact.approval.resolve': { artifactId: string; artifactVersionId: string; outcome: StudioApprovalOutcome; rationale: string; conditions: StudioConditions };
}

export interface StudioGovernedCommandPayloads {
  'studio.source-package.create': StudioSourcePackageCreatePayload;
  'studio.handoff.request': { upstreamHandoffId: string; artifactType: StudioArtifactType; targetInputBundle: { id: string; versionId: string; version: number } | null };
  'studio.handoff.review.resolve': { handoffId: string; handoffVersion: number; outcome: StudioReviewOutcome; rationale: string; conditions: StudioConditions };
  'studio.handoff.approval.resolve': { handoffId: string; handoffVersion: number; outcome: StudioApprovalOutcome; rationale: string; conditions: StudioConditions };
  'studio.handoff.withdraw': { handoffId: string; handoffVersion: number; rationale: string };
  'studio.handoff.consume': { handoffId: string; handoffVersion: number };
  'studio.template.create': { name: string; description: string; artifactClass: StudioTemplateArtifactClass; rendererVersion: string; sections: readonly StudioTemplateSectionDefinition[] };
  'studio.template.revise': { templateId: string; parentVersionId: string; name: string; description: string; rendererVersion: string; sections: readonly StudioTemplateSectionDefinition[] };
  'studio.template.review.submit': { templateId: string; templateVersionId: string };
  'studio.template.review.resolve': { templateId: string; templateVersionId: string; outcome: StudioReviewOutcome; rationale: string; conditions: StudioConditions };
  'studio.template.approval.resolve': { templateId: string; templateVersionId: string; outcome: StudioApprovalOutcome; rationale: string; conditions: StudioConditions };
  'studio.template.deprecate': { templateId: string; templateVersionId: string; rationale: string };
  'studio.template.replace': { templateId: string; templateVersionId: string; replacementTemplateId: string; replacementTemplateVersionId: string; rationale: string };
  'studio.generation.request': {
    artifactId: string;
    sourcePackageId: string;
    sourcePackageVersion: number;
    template: StudioExactTemplateSelector;
    expectedCurrentVersionId: string | null;
    expectedApprovedVersionId: string | null;
  };
}

export interface StudioCommandEnvelope<TPayload extends Record<string, unknown>, TCommand extends StudioServerCommandType = StudioCommandType> {
  contractVersion?: StudioArtifactContractVersion;
  requestId: string;
  idempotencyKey: string;
  commandType: TCommand;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  expectedAggregateVersion: number;
  expectedArtifactVersion: number | null;
  payload: TPayload;
}

/** Accepted `studio-artifact-1` ancestry remains readable without reinterpretation. */
export interface StudioLegacyArtifactAncestryDto {
  organizationId: string; workspaceId: string; caseId: string; sourceCaseVersionId: string;
  sourceCaseVersion: number; decisionId: string; decisionVersion: string; reviewResolutionId: string;
  governResolutionId: string; studioHandoffId: string; sourcePackageHash: string;
  sourceSchemaVersion: string; ruleSetVersion: string; reviewSchemaVersion: string; reviewSequence: number;
}

interface StudioArtifactV2AncestryBaseDto {
  contractVersion: typeof STUDIO_ARTIFACT_CONTRACT_VERSION;
  organizationId: string;
  workspaceId: string;
  sourcePackageId: string;
  sourcePackageVersion: number;
  sourcePackageHash: string;
  sourceSchemaVersion: string;
  ruleSetVersion: string;
}

interface StudioArtifactAssessAncestryFields {
  caseId: string;
  sourceCaseVersionId: string;
  sourceCaseVersion: number;
  decisionId: string;
  decisionVersion: string;
  reviewResolutionId: string;
  governResolutionId: string;
  studioHandoffId: string;
  reviewSchemaVersion: string;
  reviewSequence: number;
}

interface StudioArtifactNotAssessedFields {
  caseId: null;
  sourceCaseVersionId: null;
  sourceCaseVersion: null;
  decisionId: null;
  decisionVersion: null;
  reviewResolutionId: null;
  governResolutionId: null;
  studioHandoffId: null;
  reviewSchemaVersion: null;
  reviewSequence: null;
}

export interface StudioAssessHandoffArtifactAncestryDto
  extends StudioArtifactV2AncestryBaseDto, StudioArtifactAssessAncestryFields {
  sourceMode: 'assess_handoff';
  assessmentLabel: 'assessed';
  planningLabel: 'governed_assessed';
  studioInputBundleId: null;
  studioInputBundleVersionId: null;
  studioInputBundleVersion: null;
}

export interface StudioMixedArtifactAncestryDto
  extends StudioArtifactV2AncestryBaseDto, StudioArtifactAssessAncestryFields {
  sourceMode: 'assess_plus_transcript_bundle';
  assessmentLabel: 'mixed';
  planningLabel: 'governed_assessed';
  studioInputBundleId: string;
  studioInputBundleVersionId: string;
  studioInputBundleVersion: number;
}

export interface StudioDirectArtifactAncestryDto
  extends StudioArtifactV2AncestryBaseDto, StudioArtifactNotAssessedFields {
  sourceMode: 'direct_transcript_bundle';
  assessmentLabel: 'not_assessed';
  planningLabel: 'planning_only';
  studioInputBundleId: string;
  studioInputBundleVersionId: string;
  studioInputBundleVersion: number;
}

export interface StudioManualArtifactAncestryDto
  extends StudioArtifactV2AncestryBaseDto, StudioArtifactNotAssessedFields {
  sourceMode: 'manual_brief';
  assessmentLabel: 'not_assessed';
  planningLabel: 'planning_only';
  studioInputBundleId: null;
  studioInputBundleVersionId: null;
  studioInputBundleVersion: null;
}

export type StudioArtifactV2AncestryDto =
  | StudioAssessHandoffArtifactAncestryDto
  | StudioMixedArtifactAncestryDto
  | StudioDirectArtifactAncestryDto
  | StudioManualArtifactAncestryDto;

export type StudioArtifactAncestryDto = StudioLegacyArtifactAncestryDto | StudioArtifactV2AncestryDto;

const STUDIO_V2_ANCESTRY_KEYS = [
  'contractVersion', 'organizationId', 'workspaceId', 'sourceMode', 'assessmentLabel', 'planningLabel',
  'sourcePackageId', 'sourcePackageVersion', 'sourcePackageHash', 'sourceSchemaVersion', 'ruleSetVersion',
  'studioInputBundleId', 'studioInputBundleVersionId', 'studioInputBundleVersion', 'caseId',
  'sourceCaseVersionId', 'sourceCaseVersion', 'decisionId', 'decisionVersion', 'reviewResolutionId',
  'governResolutionId', 'studioHandoffId', 'reviewSchemaVersion', 'reviewSequence',
] as const;
const studioContractObject = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const studioContractUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const studioContractHash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value);
const studioContractPositive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const studioContractText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Strict safe-projection decoder. Provider output never supplies this server-owned lineage. */
export const decodeStudioArtifactV2Ancestry = (value: unknown): StudioArtifactV2AncestryDto => {
  if (!studioContractObject(value)
    || Object.keys(value).length !== STUDIO_V2_ANCESTRY_KEYS.length
    || Object.keys(value).some(key => !STUDIO_V2_ANCESTRY_KEYS.includes(key as typeof STUDIO_V2_ANCESTRY_KEYS[number]))
    || value.contractVersion !== STUDIO_ARTIFACT_CONTRACT_VERSION
    || !studioContractUuid(value.organizationId) || !studioContractUuid(value.workspaceId)
    || !studioContractUuid(value.sourcePackageId) || !studioContractPositive(value.sourcePackageVersion)
    || !studioContractHash(value.sourcePackageHash) || !studioContractText(value.sourceSchemaVersion)
    || !studioContractText(value.ruleSetVersion)) throw new Error('INVALID_STUDIO_ARTIFACT_ANCESTRY');

  const hasAssessAncestry = studioContractUuid(value.caseId) && studioContractUuid(value.sourceCaseVersionId)
    && studioContractPositive(value.sourceCaseVersion) && studioContractUuid(value.decisionId)
    && studioContractText(value.decisionVersion) && studioContractUuid(value.reviewResolutionId)
    && studioContractUuid(value.governResolutionId) && studioContractUuid(value.studioHandoffId)
    && studioContractText(value.reviewSchemaVersion) && studioContractPositive(value.reviewSequence);
  const hasNoAssessAncestry = [
    value.caseId, value.sourceCaseVersionId, value.sourceCaseVersion, value.decisionId, value.decisionVersion,
    value.reviewResolutionId, value.governResolutionId, value.studioHandoffId, value.reviewSchemaVersion,
    value.reviewSequence,
  ].every(item => item === null);
  const hasStudioBundle = studioContractUuid(value.studioInputBundleId)
    && studioContractUuid(value.studioInputBundleVersionId) && studioContractPositive(value.studioInputBundleVersion);
  const hasNoStudioBundle = value.studioInputBundleId === null
    && value.studioInputBundleVersionId === null && value.studioInputBundleVersion === null;

  const valid = value.sourceMode === 'assess_handoff'
    ? value.assessmentLabel === 'assessed' && value.planningLabel === 'governed_assessed'
      && hasAssessAncestry && hasNoStudioBundle
    : value.sourceMode === 'assess_plus_transcript_bundle'
      ? value.assessmentLabel === 'mixed' && value.planningLabel === 'governed_assessed'
        && hasAssessAncestry && hasStudioBundle
      : value.sourceMode === 'direct_transcript_bundle'
        ? value.assessmentLabel === 'not_assessed' && value.planningLabel === 'planning_only'
          && hasNoAssessAncestry && hasStudioBundle
        : value.sourceMode === 'manual_brief'
          ? value.assessmentLabel === 'not_assessed' && value.planningLabel === 'planning_only'
            && hasNoAssessAncestry && hasNoStudioBundle
          : false;
  if (!valid) throw new Error('INVALID_STUDIO_ARTIFACT_ANCESTRY');
  return value as unknown as StudioArtifactV2AncestryDto;
};

/** Canonical persisted/revision identity. Display enrichment is projection-only. */
export interface StudioCanonicalSourceAnchorDto {
  sourceVersionId: string;
  locator: string;
  anchorHash: string;
}
export interface StudioSafeSourceAnchorDto extends StudioCanonicalSourceAnchorDto {
  sourceLabel: string;
  sourceVersion: number;
}
export interface StudioArtifactSectionDto {
  id: string; title: string; body: string; sourceAnchors: readonly StudioCanonicalSourceAnchorDto[];
  labels: readonly StudioSectionNonSourceLabel[];
}

/**
 * Tenant-safe Studio workspace projection returned by
 * `studio_artifact_workspace_projection_v2`. Raw source text, candidate values,
 * manual briefs, provider secrets/configuration and private rendition identity
 * are intentionally absent.
 */
export interface StudioWorkspaceSelectedSourceDto {
  sourceId: string;
  sourceVersionId: string;
  sourceVersion: number;
  label: string;
  sourceKind: string;
  semanticRoles: readonly ('primary' | 'supporting' | 'contradictory' | 'reference')[];
}

export interface StudioWorkspaceSelectedSourcePageDto {
  items: readonly StudioWorkspaceSelectedSourceDto[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface StudioWorkspaceCitationDto {
  sectionId: string;
  sourceVersionId: string;
  locator: string;
  anchorHash: string;
}

export interface StudioWorkspaceConflictDto {
  conflictKey: string;
  sourceVersionIds: readonly string[];
  status: 'unresolved' | 'resolved';
}

export interface StudioWorkspaceCoverageDto {
  selectedSourceVersionIds: readonly string[];
  coveredSourceVersionIds: readonly string[];
  uncoveredSourceVersionIds: readonly string[];
  complete: boolean;
  citations: readonly StudioWorkspaceCitationDto[];
  conflicts: readonly StudioWorkspaceConflictDto[];
}

export interface StudioWorkspaceProviderAvailabilityDto {
  available: boolean;
  reason: 'available' | 'feature_disabled' | 'read_only' | 'permission_denied' | 'route_unavailable' | 'source_stale' | 'template_unavailable';
}

export interface StudioArtifactWorkspaceProjectionDto {
  contractVersion: typeof STUDIO_WORKSPACE_CONTRACT_VERSION;
  organizationId: string;
  workspaceId: string;
  artifact: {
    id: string;
    artifactType: StudioArtifactType;
    aggregateVersion: number;
    lifecycle: StudioArtifactLifecycle;
    currentVersionId: string | null;
    currentApprovedVersionId: string | null;
    sections: readonly StudioArtifactSectionDto[];
  };
  sourcePackage: {
    id: string;
    version: number;
    hash: string;
    mode: StudioSourceMode;
    lineageClassification: StudioAssessmentLabel;
    planningOnly: boolean;
    inputBundle: { id: string; versionId: string; version: number } | null;
  };
  selectedSources: StudioWorkspaceSelectedSourcePageDto;
  coverage: StudioWorkspaceCoverageDto;
  providerAvailability: StudioWorkspaceProviderAvailabilityDto;
  actions: readonly string[];
}

export interface StudioArtifactSummaryDto {
  id: string;
  artifactType: StudioArtifactType;
  aggregateVersion: number;
  lifecycle: StudioArtifactLifecycle;
  currentVersionId: string | null;
  currentApprovedVersionId: string | null;
  sourceMode: StudioSourceMode;
  lineageClassification: StudioAssessmentLabel;
  planningOnly: boolean;
  displayLabel: string;
  updatedAt: string;
  actions: readonly string[];
}

export interface StudioArtifactSummaryPageDto {
  contractVersion: typeof STUDIO_ARTIFACT_SUMMARY_CONTRACT_VERSION;
  organizationId: string;
  workspaceId: string;
  items: readonly StudioArtifactSummaryDto[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface StudioSourcePackageProjectionDto {
  contractVersion: typeof STUDIO_ARTIFACT_CONTRACT_VERSION;
  id: string; version: number; sourceMode: StudioSourceMode;
  assessmentLabel: StudioAssessmentLabel; planningLabel: StudioPlanningLabel;
  assessHandoff: { id: string; version: number; status: StudioHandoffLifecycle; sourceLabel: string } | null;
  studioInputBundle: { id: string; version: number; sourceCount: number; sourceLabels: readonly string[] } | null;
  manualBriefPresent: boolean;
  coverage: { selectedSources: number; coveredSources: number; complete: boolean; blockers: readonly string[] };
  stale: boolean;
}

export interface StudioTemplateProjectionDto {
  ownership: 'system' | 'tenant'; templateId: string; templateVersionId: string; version: string | number;
  name: string; description: string; artifactClass: StudioTemplateArtifactClass;
  lifecycle: StudioTemplateLifecycle; templateHash: string;
  rendererVersion: string; contentSchemaVersion: string;
  sections: readonly StudioTemplateSectionDefinition[];
  replacement: { templateId: string; templateVersionId: string; version: string | number } | null;
  actions: readonly string[];
}

export interface StudioTemplateProjectionRootDto {
  organizationId: string;
  workspaceId: string;
  templates: readonly StudioTemplateProjectionDto[];
}

export interface StudioHandoffProjectionDto {
  contractVersion: typeof STUDIO_ARTIFACT_CONTRACT_VERSION;
  id: string; version: number; direction: 'inbox' | 'outbox'; status: StudioHandoffLifecycle;
  sourceLabel: string; sourceVersion: number; targetWorkspaceLabel: string;
  planningLabel: StudioPlanningLabel; stale: boolean; actions: readonly string[];
}

export interface StudioArtifactVersionDto {
  id: string; version: number; parentVersionId: string | null; lifecycle: StudioArtifactLifecycle;
  templateVersion: string; contentSchemaVersion: string; projectionVersion: string;
  content: Record<string, unknown>; contentHash: string; authorId: string; createdAt: string;
}

export interface StudioArtifactProjectionDto {
  id: string; artifactType: StudioArtifactType; aggregateVersion: number; lifecycle: StudioArtifactLifecycle;
  ancestry: StudioArtifactAncestryDto; currentVersion: StudioArtifactVersionDto;
  currentApprovedVersion: StudioArtifactVersionDto | null; versions: readonly StudioArtifactVersionDto[];
  review: StudioArtifactReviewDto | null; approval: StudioArtifactApprovalDto | null; readOnly: boolean;
  contractVersion?: StudioArtifactContractVersion; sourcePackage?: StudioSourcePackageProjectionDto;
  template?: StudioTemplateProjectionDto; sections?: readonly StudioArtifactSectionDto[];
  assessmentLabel?: StudioAssessmentLabel; planningLabel?: StudioPlanningLabel;
}

export interface StudioArtifactReviewDto {
  assignmentId: string; reviewerId: string; outcome: 'approved' | 'changes_requested' | 'rejected' | null;
  rationale: string | null; conditions: StudioConditions;
}
export interface StudioArtifactApprovalDto {
  approverId: string; outcome: 'approved' | 'rejected'; rationale: string;
  conditions: StudioConditions; supersededVersionId: string | null;
}

export type StudioCommandOutcome = 'committed' | 'replayed' | 'generation_completed' | 'generation_failed'
  | 'generation_stale' | 'generation_uncertain' | 'command_in_progress';
export interface StudioCommandResponse {
  ok: true; outcome: StudioCommandOutcome; receiptId: string; resourceId: string; resource: Record<string, unknown>;
}

export const STUDIO_CAPABILITIES = [
  'studio.artifacts.read', 'studio.artifacts.generate', 'studio.artifacts.edit',
  'studio.artifacts.review', 'studio.artifacts.approve', 'studio.sources.read', 'studio.sources.manage',
  'studio.handoffs.read', 'studio.handoffs.request', 'studio.handoffs.review', 'studio.handoffs.approve',
  'studio.handoffs.consume', 'studio.templates.read', 'studio.templates.manage', 'studio.templates.review', 'studio.templates.approve',
] as const;
export type StudioCapability = (typeof STUDIO_CAPABILITIES)[number];
