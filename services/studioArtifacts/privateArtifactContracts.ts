/**
 * Strict public contracts for Studio PR B.
 *
 * These DTOs deliberately exclude every private Storage coordinate and every
 * authority-bearing renderer, template, ancestry, hash, size, MIME, and
 * lifecycle input. The server derives those values; the browser only projects
 * committed state and submits public identifiers, expected versions, formats,
 * bounded reasons, and governed outcomes.
 */
export const STUDIO_PRIVATE_ARTIFACT_FORMATS = ['markdown', 'pdf', 'docx'] as const;
export type StudioPrivateArtifactFormat = (typeof STUDIO_PRIVATE_ARTIFACT_FORMATS)[number];

export const STUDIO_PRIVATE_ARTIFACT_PROJECTION_RPC = {
  name: 'studio_private_artifact_projection',
  argumentKeys: ['p_org', 'p_workspace', 'p_artifact_version'],
} as const;
export type StudioPrivateArtifactProjectionRpcArgumentKey =
  (typeof STUDIO_PRIVATE_ARTIFACT_PROJECTION_RPC.argumentKeys)[number];
export type StudioPrivateArtifactProjectionRpcArguments = Record<
  StudioPrivateArtifactProjectionRpcArgumentKey,
  string
>;

export const STUDIO_RENDITION_STATES = [
  'requested',
  'rendering',
  'uploading',
  'reconciliation_required',
  'reconciling',
  'available',
  'failed',
  'deletion_requested',
  'deleting',
  'deletion_reconciliation_required',
  'deletion_reconciling',
  'deleted',
  'deletion_failed',
] as const;
export type StudioRenditionState = (typeof STUDIO_RENDITION_STATES)[number];

export const STUDIO_PRIVATE_ARTIFACT_COMMAND_TYPES = [
  'studio.rendition.generate',
  'studio.retention.policy.publish',
  'studio.rendition.retention.extend',
  'studio.legal_hold.place',
  'studio.legal_hold.release',
  'studio.rendition.deletion.request',
  'studio.rendition.deletion.resolve',
] as const;
export type StudioPrivateArtifactCommandType = (typeof STUDIO_PRIVATE_ARTIFACT_COMMAND_TYPES)[number];

export const STUDIO_PRIVATE_ARTIFACT_CAPABILITIES = [
  'studio.artifacts.rendition.generate',
  'studio.artifacts.download',
  'studio.artifacts.retention.manage',
  'studio.artifacts.legal_hold.manage',
  'studio.artifacts.delete.request',
  'studio.artifacts.delete.approve',
] as const;
export type StudioPrivateArtifactCapability = (typeof STUDIO_PRIVATE_ARTIFACT_CAPABILITIES)[number];

export type StudioDeletionOutcome = 'approve' | 'reject';
export type StudioRetentionMode = 'until' | 'indefinite';

export interface StudioPrivateArtifactCommandPayloads {
  'studio.rendition.generate': {
    artifactId: string;
    artifactVersionId: string;
    format: StudioPrivateArtifactFormat;
  };
  'studio.retention.policy.publish': {
    artifactType: 'brd' | 'frd' | 'pdd';
    retentionDays: number | null;
    reason: string;
  };
  'studio.rendition.retention.extend': {
    renditionId: string;
    retentionUntil: string | null;
    reason: string;
  };
  'studio.legal_hold.place': {
    renditionId: string;
    reason: string;
  };
  'studio.legal_hold.release': {
    renditionId: string;
    holdId: string;
    reason: string;
  };
  'studio.rendition.deletion.request': {
    renditionId: string;
    reason: string;
  };
  'studio.rendition.deletion.resolve': {
    renditionId: string;
    deletionRequestId: string;
    outcome: StudioDeletionOutcome;
    reason: string;
  };
}

export interface StudioPrivateArtifactCommandEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  requestId: string;
  idempotencyKey: string;
  commandType: StudioPrivateArtifactCommandType;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  expectedArtifactVersion: number | null;
  expectedRenditionVersion: number | null;
  payload: TPayload;
}

export interface StudioDeletionProjectionDto {
  requestId: string;
  state: 'pending' | 'approved' | 'rejected';
  requesterIsCurrentActor: boolean;
}

export interface StudioActiveHoldProjectionDto {
  holdId: string;
  placedAt: string;
}

export interface StudioRenditionProjectionDto {
  id: string;
  version: number;
  format: StudioPrivateArtifactFormat;
  state: StudioRenditionState;
  mimeType: string | null;
  filename: string | null;
  byteLength: number | null;
  sha256: string | null;
  rendererVersion: string;
  retentionMode: StudioRetentionMode | null;
  retentionUntil: string | null;
  legalHoldActive: boolean;
  activeHolds: readonly StudioActiveHoldProjectionDto[];
  deletion: StudioDeletionProjectionDto | null;
  failureCode: string | null;
  updatedAt: string;
}

export interface StudioPrivateArtifactProjectionDto {
  artifactId: string;
  artifactVersionId: string;
  artifactVersion: number;
  artifactType: 'brd' | 'frd' | 'pdd';
  approved: true;
  readOnly: boolean;
  renditions: readonly StudioRenditionProjectionDto[];
}

export type StudioPrivateArtifactCommandOutcome =
  | 'committed'
  | 'replayed'
  | 'rendition_available'
  | 'rendition_failed'
  | 'deletion_completed'
  | 'deletion_failed';

export interface StudioPrivateArtifactCommandResponse {
  ok: true;
  outcome: StudioPrivateArtifactCommandOutcome;
  receiptId: string;
  resourceId: string;
  resource: Record<string, unknown>;
}

export interface StudioPrivateArtifactDownloadRequest {
  requestId: string;
  idempotencyKey: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  renditionId: string;
}

export interface StudioPrivateArtifactDownload {
  bytes: Blob;
  filename: string;
  mimeType: string;
}
