/**
 * Shared public contract for the governed Studio artifact boundary.
 * Authority-bearing ancestry, templates, schemas, and lifecycle transitions are
 * always derived and validated by the server; these types are projections only.
 */
export const STUDIO_ARTIFACT_TYPES = ['brd', 'frd', 'pdd'] as const;
export type StudioArtifactType = (typeof STUDIO_ARTIFACT_TYPES)[number];

export const STUDIO_ARTIFACT_LIFECYCLES = [
  'draft', 'reviewer_ready', 'in_review', 'changes_requested',
  'review_rejected', 'approval_ready', 'approved', 'approval_rejected', 'superseded',
] as const;
export type StudioArtifactLifecycle = (typeof STUDIO_ARTIFACT_LIFECYCLES)[number];

export const STUDIO_GENERATION_STATES = ['requested', 'generating', 'completed', 'failed'] as const;
export type StudioGenerationState = (typeof STUDIO_GENERATION_STATES)[number];

export const STUDIO_COMMAND_TYPES = [
  'studio.artifact.generation.request',
  'studio.artifact.draft.revise',
  'studio.artifact.review.submit',
  'studio.artifact.review.assign',
  'studio.artifact.review.resolve',
  'studio.artifact.approval.resolve',
] as const;
export type StudioCommandType = (typeof STUDIO_COMMAND_TYPES)[number];

export interface StudioCommandEnvelope<TPayload extends Record<string, unknown>> {
  requestId: string;
  idempotencyKey: string;
  commandType: StudioCommandType;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  expectedAggregateVersion: number;
  expectedArtifactVersion: number | null;
  payload: TPayload;
}

export interface StudioArtifactAncestryDto {
  organizationId: string;
  workspaceId: string;
  caseId: string;
  sourceCaseVersionId: string;
  sourceCaseVersion: number;
  decisionId: string;
  decisionVersion: number;
  reviewResolutionId: string;
  governResolutionId: string;
  studioHandoffId: string;
  sourcePackageHash: string;
  sourceSchemaVersion: string;
  ruleSetVersion: string;
  reviewSchemaVersion: string;
  reviewSequence: number;
}

export interface StudioArtifactVersionDto {
  id: string;
  version: number;
  parentVersionId: string | null;
  lifecycle: StudioArtifactLifecycle;
  templateVersion: string;
  contentSchemaVersion: string;
  projectionVersion: string;
  content: Record<string, unknown>;
  contentHash: string;
  authorId: string;
  createdAt: string;
}

export interface StudioArtifactProjectionDto {
  id: string;
  artifactType: StudioArtifactType;
  aggregateVersion: number;
  lifecycle: StudioArtifactLifecycle;
  ancestry: StudioArtifactAncestryDto;
  currentVersion: StudioArtifactVersionDto;
  currentApprovedVersion: StudioArtifactVersionDto | null;
  versions: readonly StudioArtifactVersionDto[];
  readOnly: boolean;
}

export const STUDIO_CAPABILITIES = [
  'studio.artifacts.read',
  'studio.artifacts.generate',
  'studio.artifacts.edit',
  'studio.artifacts.review',
  'studio.artifacts.approve',
] as const;
export type StudioCapability = (typeof STUDIO_CAPABILITIES)[number];
