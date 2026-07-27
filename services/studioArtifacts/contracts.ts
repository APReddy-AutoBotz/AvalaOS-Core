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

export type StudioConditions = readonly string[];
export type StudioReviewOutcome = 'approve' | 'changes_requested' | 'reject';
export type StudioApprovalOutcome = 'approve' | 'reject';

export interface StudioCommandPayloads {
  'studio.artifact.generation.request': { studioHandoffId: string; artifactType: StudioArtifactType };
  'studio.artifact.draft.revise': { artifactId: string; parentVersionId: string; content: Record<string, unknown> };
  'studio.artifact.review.submit': { artifactId: string; artifactVersionId: string };
  'studio.artifact.review.assign': { artifactId: string; artifactVersionId: string; reviewerId: string };
  'studio.artifact.review.resolve': { artifactId: string; artifactVersionId: string; outcome: StudioReviewOutcome; rationale: string; conditions: StudioConditions };
  'studio.artifact.approval.resolve': { artifactId: string; artifactVersionId: string; outcome: StudioApprovalOutcome; rationale: string; conditions: StudioConditions };
}

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
  decisionVersion: string;
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
  review: StudioArtifactReviewDto | null;
  approval: StudioArtifactApprovalDto | null;
  readOnly: boolean;
}

export interface StudioArtifactReviewDto {
  assignmentId: string;
  reviewerId: string;
  outcome: 'approved' | 'changes_requested' | 'rejected' | null;
  rationale: string | null;
  conditions: StudioConditions;
}

export interface StudioArtifactApprovalDto {
  approverId: string;
  outcome: 'approved' | 'rejected';
  rationale: string;
  conditions: StudioConditions;
  supersededVersionId: string | null;
}

export type StudioCommandOutcome = 'committed' | 'replayed' | 'generation_completed' | 'generation_failed';
export interface StudioCommandResponse {
  ok: true;
  outcome: StudioCommandOutcome;
  receiptId: string;
  resourceId: string;
  resource: Record<string, unknown>;
}

export const STUDIO_CAPABILITIES = [
  'studio.artifacts.read',
  'studio.artifacts.generate',
  'studio.artifacts.edit',
  'studio.artifacts.review',
  'studio.artifacts.approve',
] as const;
export type StudioCapability = (typeof STUDIO_CAPABILITIES)[number];
