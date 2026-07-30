import {
  renderStudioPrivateArtifact,
  type StudioRenderedArtifact,
  type StudioRenditionFormat,
} from './studioPrivateArtifactRenderer.ts';
import type {
  StudioApprovedContent,
  StudioDeletionExecuteClaim,
  StudioPrivateArtifactType,
  StudioRenditionExecuteClaim,
} from './studioPrivateArtifactRpcContract.ts';
import {
  buildStudioPrivateArtifactObjectKey,
  StudioStorageError,
  type StudioPrivateArtifactStorage,
  type StudioStoredObjectExpectation,
} from './studioPrivateArtifactStorage.ts';

export type StudioSagaPublicReceipt = Readonly<{
  attemptId: string;
  renditionId: string;
  format: StudioRenditionFormat;
  state: 'requested' | 'rendering' | 'uploading' | 'available' | 'failed' | 'reconciliation_required';
}>;
export type StudioSagaFailureCode =
  | 'RENDER_FAILED'
  | 'RENDER_METADATA_PERSIST_FAILED'
  | 'UPLOAD_OUTCOME_UNKNOWN'
  | 'STORAGE_OBJECT_MISMATCH'
  | 'STORAGE_OBJECT_MISSING'
  | 'AVAILABLE_COMPLETION_FAILED'
  | 'RECONCILIATION_EXHAUSTED';

type ExecuteClaim = StudioRenditionExecuteClaim;
type ReplayClaim = Readonly<{ disposition: 'replay'; receipt: StudioSagaPublicReceipt }>;
export type StudioRenditionClaim = ExecuteClaim | ReplayClaim;

export type StudioCommittedRenditionWork = Readonly<{
  attemptId: string;
  renditionId: string;
  organizationId: string;
  workspaceId: string;
  objectKey: string;
  format: StudioRenditionFormat;
  artifactType: StudioPrivateArtifactType;
  artifactId: string;
  artifactVersionId: string;
  opaqueObjectId: string;
  approvedContent: StudioApprovedContent;
  contentSchemaVersion: string;
  byteLength: number;
  sha256: string;
  mimeType: string;
  filename: string;
  rendererVersion: StudioRenderedArtifact['rendererVersion'];
  templateVersion: StudioRenderedArtifact['templateVersion'];
  state: 'rendered' | 'uploading' | 'completion_pending' | 'available' | 'failed';
  reconciliationCount: number;
}>;

export interface StudioRenditionSagaDatabase {
  claim(requestId: string): Promise<StudioRenditionClaim>;
  startAttempt(input: { attemptId: string }): Promise<void>;
  persistRendered(input: Omit<StudioCommittedRenditionWork, 'state' | 'reconciliationCount'>): Promise<void>;
  markAvailable(input: { attemptId: string }): Promise<StudioSagaPublicReceipt>;
  markFailed(input: { attemptId: string; failureCode: StudioSagaFailureCode }): Promise<StudioSagaPublicReceipt>;
  markReconciliationRequired(input: { attemptId: string; failureCode: StudioSagaFailureCode }): Promise<StudioSagaPublicReceipt>;
  loadReconciliation(attemptId: string): Promise<StudioCommittedRenditionWork | null>;
}

export type StudioRenditionSagaResult =
  | Readonly<{ outcome: 'available'; receipt: StudioSagaPublicReceipt }>
  | Readonly<{ outcome: 'replay'; receipt: StudioSagaPublicReceipt }>
  | Readonly<{ outcome: 'failed'; receipt: StudioSagaPublicReceipt; failureCode: StudioSagaFailureCode }>
  | Readonly<{ outcome: 'reconciliation_required'; receipt: StudioSagaPublicReceipt; failureCode: StudioSagaFailureCode }>;

const expectation = (work: Pick<StudioCommittedRenditionWork, 'organizationId' | 'workspaceId' | 'objectKey' | 'byteLength' | 'sha256' | 'mimeType'>): StudioStoredObjectExpectation => ({
  organizationId: work.organizationId,
  workspaceId: work.workspaceId,
  objectKey: work.objectKey,
  byteLength: work.byteLength,
  sha256: work.sha256,
  mimeType: work.mimeType,
});
const failed = async (db: StudioRenditionSagaDatabase, attemptId: string, failureCode: StudioSagaFailureCode): Promise<StudioRenditionSagaResult> => ({
  outcome: 'failed', failureCode, receipt: await db.markFailed({ attemptId, failureCode }),
});
const reconcilable = async (db: StudioRenditionSagaDatabase, attemptId: string, failureCode: StudioSagaFailureCode): Promise<StudioRenditionSagaResult> => ({
  outcome: 'reconciliation_required', failureCode, receipt: await db.markReconciliationRequired({ attemptId, failureCode }),
});

export const executeStudioRenditionSaga = async (
  requestId: string,
  deps: Readonly<{
    database: StudioRenditionSagaDatabase;
    storage: StudioPrivateArtifactStorage;
    render?: typeof renderStudioPrivateArtifact;
  }>,
): Promise<StudioRenditionSagaResult> => {
  const claim = await deps.database.claim(requestId);
  if (claim.disposition === 'replay') return { outcome: 'replay', receipt: claim.receipt };
  if (claim.requestId !== requestId) throw new Error('RENDITION_REQUEST_MISMATCH');
  try {
    await deps.database.startAttempt({ attemptId: claim.attemptId });
  } catch {
    return failed(deps.database, claim.attemptId, 'RENDER_METADATA_PERSIST_FAILED');
  }
  let rendered: StudioRenderedArtifact;
  try {
    rendered = await (deps.render ?? renderStudioPrivateArtifact)(
      claim.approvedContent,
      claim.format,
      {
        artifactType: claim.artifactType,
        contentSchemaVersion: claim.contentSchemaVersion,
        templateVersion: claim.templateVersion,
        rendererVersion: claim.rendererVersion,
      },
    );
  } catch {
    return failed(deps.database, claim.attemptId, 'RENDER_FAILED');
  }
  const objectKey = buildStudioPrivateArtifactObjectKey({
    organizationId: claim.organizationId,
    workspaceId: claim.workspaceId,
    opaqueObjectId: claim.opaqueObjectId,
    format: claim.format,
  });
  const committed = {
    attemptId: claim.attemptId,
    renditionId: claim.renditionId,
    organizationId: claim.organizationId,
    workspaceId: claim.workspaceId,
    objectKey,
    format: claim.format,
    artifactType: claim.artifactType,
    artifactId: claim.artifactId,
    artifactVersionId: claim.artifactVersionId,
    opaqueObjectId: claim.opaqueObjectId,
    approvedContent: claim.approvedContent,
    contentSchemaVersion: claim.contentSchemaVersion,
    byteLength: rendered.byteLength,
    sha256: rendered.sha256,
    mimeType: rendered.mimeType,
    filename: rendered.filename,
    rendererVersion: rendered.rendererVersion,
    templateVersion: rendered.templateVersion,
  } as const;
  try {
    await deps.database.persistRendered(committed);
  } catch {
    return failed(deps.database, claim.attemptId, 'RENDER_METADATA_PERSIST_FAILED');
  }
  try {
    await deps.storage.uploadCreateOnly({ ...expectation(committed), bytes: rendered.bytes });
  } catch (error) {
    if (error instanceof StudioStorageError && error.code === 'OBJECT_MISMATCH') {
      return failed(deps.database, claim.attemptId, 'STORAGE_OBJECT_MISMATCH');
    }
    return reconcilable(deps.database, claim.attemptId, 'UPLOAD_OUTCOME_UNKNOWN');
  }
  try {
    const receipt = await deps.database.markAvailable({
      attemptId: claim.attemptId,
    });
    return { outcome: 'available', receipt };
  } catch {
    return reconcilable(deps.database, claim.attemptId, 'AVAILABLE_COMPLETION_FAILED');
  }
};

const MAX_RECONCILIATION_ATTEMPTS = 3;
export const reconcileStudioRendition = async (
  attemptId: string,
  deps: Readonly<{
    database: StudioRenditionSagaDatabase;
    storage: StudioPrivateArtifactStorage;
    render?: typeof renderStudioPrivateArtifact;
  }>,
): Promise<StudioRenditionSagaResult> => {
  const work = await deps.database.loadReconciliation(attemptId);
  if (!work) throw new Error('RENDITION_RECONCILIATION_NOT_FOUND');
  if (work.state === 'available') {
    return { outcome: 'replay', receipt: { attemptId: work.attemptId, renditionId: work.renditionId, format: work.format, state: 'available' } };
  }
  if (work.state === 'failed' || work.reconciliationCount >= MAX_RECONCILIATION_ATTEMPTS) {
    return failed(deps.database, work.attemptId, 'RECONCILIATION_EXHAUSTED');
  }
  const expected = expectation(work);
  let probe;
  try {
    probe = await deps.storage.probeExact(expected);
  } catch (error) {
    if (error instanceof StudioStorageError && error.code === 'OBJECT_MISMATCH') {
      return failed(deps.database, work.attemptId, 'STORAGE_OBJECT_MISMATCH');
    }
    return reconcilable(deps.database, work.attemptId, 'UPLOAD_OUTCOME_UNKNOWN');
  }
  if (probe.status === 'missing') {
    let rendered: StudioRenderedArtifact;
    try {
      rendered = await (deps.render ?? renderStudioPrivateArtifact)(
        work.approvedContent,
        work.format,
        {
          artifactType: work.artifactType,
          contentSchemaVersion: work.contentSchemaVersion,
          templateVersion: work.templateVersion,
          rendererVersion: work.rendererVersion,
        },
      );
    } catch {
      return failed(deps.database, work.attemptId, 'RENDER_FAILED');
    }
    if (rendered.byteLength !== work.byteLength || rendered.sha256 !== work.sha256 ||
        rendered.mimeType !== work.mimeType || rendered.rendererVersion !== work.rendererVersion ||
        rendered.templateVersion !== work.templateVersion ||
        rendered.contentSchemaVersion !== work.contentSchemaVersion ||
        rendered.filename !== work.filename) {
      return failed(deps.database, work.attemptId, 'STORAGE_OBJECT_MISMATCH');
    }
    try {
      await deps.storage.uploadCreateOnly({ ...expected, bytes: rendered.bytes });
    } catch (error) {
      if (error instanceof StudioStorageError && error.code === 'OBJECT_MISMATCH') {
        return failed(deps.database, work.attemptId, 'STORAGE_OBJECT_MISMATCH');
      }
      return reconcilable(deps.database, work.attemptId, 'UPLOAD_OUTCOME_UNKNOWN');
    }
  }
  try {
    const receipt = await deps.database.markAvailable({
      attemptId: work.attemptId,
    });
    return { outcome: 'available', receipt };
  } catch {
    return reconcilable(deps.database, work.attemptId, 'AVAILABLE_COMPLETION_FAILED');
  }
};

export type StudioDeletionReceipt = Readonly<{
  deletionAttemptId: string;
  renditionId: string;
  state: 'deleting' | 'deleted' | 'deletion_failed' | 'reconciliation_required';
}>;
type ExecuteDeletionClaim = StudioDeletionExecuteClaim;
type ReplayDeletionClaim = Readonly<{ disposition: 'replay'; receipt: StudioDeletionReceipt }>;
export type StudioDeletionClaim = ExecuteDeletionClaim | ReplayDeletionClaim;
export interface StudioDeletionSagaDatabase {
  claimDeletion(requestId: string): Promise<ExecuteDeletionClaim | ReplayDeletionClaim>;
  markTombstone(input: { deletionAttemptId: string; providerOutcome: 'deleted' | 'missing' }): Promise<StudioDeletionReceipt>;
  markDeletionFailure(input: { deletionAttemptId: string; failureCode: 'DELETION_RECONCILIATION_EXHAUSTED' }): Promise<StudioDeletionReceipt>;
  markDeletionReconciliationRequired(input: { deletionAttemptId: string; failureCode: 'DELETE_OUTCOME_UNKNOWN' | 'TOMBSTONE_COMPLETION_FAILED' }): Promise<StudioDeletionReceipt>;
  loadDeletionReconciliation(deletionAttemptId: string): Promise<ExecuteDeletionClaim | null>;
}
export type StudioDeletionSagaResult =
  | { outcome: 'deleted'; receipt: StudioDeletionReceipt; providerOutcome: 'deleted' | 'missing' }
  | { outcome: 'replay'; receipt: StudioDeletionReceipt }
  | { outcome: 'failed'; receipt: StudioDeletionReceipt; failureCode: 'DELETION_RECONCILIATION_EXHAUSTED' }
  | { outcome: 'reconciliation_required'; receipt: StudioDeletionReceipt; failureCode: 'DELETE_OUTCOME_UNKNOWN' | 'TOMBSTONE_COMPLETION_FAILED' };

const runCommittedDeletion = async (
  claim: ExecuteDeletionClaim,
  deps: Readonly<{ database: StudioDeletionSagaDatabase; storage: StudioPrivateArtifactStorage }>,
): Promise<StudioDeletionSagaResult> => {
  let providerOutcome: 'deleted' | 'missing';
  try {
    providerOutcome = (await deps.storage.deleteExact(claim)).status;
  } catch {
    const receipt = await deps.database.markDeletionReconciliationRequired({ deletionAttemptId: claim.deletionAttemptId, failureCode: 'DELETE_OUTCOME_UNKNOWN' });
    return { outcome: 'reconciliation_required', receipt, failureCode: 'DELETE_OUTCOME_UNKNOWN' };
  }
  try {
    const receipt = await deps.database.markTombstone({ deletionAttemptId: claim.deletionAttemptId, providerOutcome });
    return { outcome: 'deleted', receipt, providerOutcome };
  } catch {
    const receipt = await deps.database.markDeletionReconciliationRequired({ deletionAttemptId: claim.deletionAttemptId, failureCode: 'TOMBSTONE_COMPLETION_FAILED' });
    return { outcome: 'reconciliation_required', receipt, failureCode: 'TOMBSTONE_COMPLETION_FAILED' };
  }
};

export const executeStudioDeletionSaga = async (
  requestId: string,
  deps: Readonly<{ database: StudioDeletionSagaDatabase; storage: StudioPrivateArtifactStorage }>,
): Promise<StudioDeletionSagaResult> => {
  const claim = await deps.database.claimDeletion(requestId);
  if (claim.disposition === 'replay') return { outcome: 'replay', receipt: claim.receipt };
  if (claim.requestId !== requestId) throw new Error('DELETION_REQUEST_MISMATCH');
  return runCommittedDeletion(claim, deps);
};

export const reconcileStudioDeletion = async (
  deletionAttemptId: string,
  deps: Readonly<{ database: StudioDeletionSagaDatabase; storage: StudioPrivateArtifactStorage }>,
): Promise<StudioDeletionSagaResult> => {
  const claim = await deps.database.loadDeletionReconciliation(deletionAttemptId);
  if (!claim) throw new Error('DELETION_RECONCILIATION_NOT_FOUND');
  if (claim.reconciliationCount >= MAX_RECONCILIATION_ATTEMPTS) {
    const receipt = await deps.database.markDeletionFailure({ deletionAttemptId, failureCode: 'DELETION_RECONCILIATION_EXHAUSTED' });
    return { outcome: 'failed', receipt, failureCode: 'DELETION_RECONCILIATION_EXHAUSTED' };
  }
  let presence;
  try { presence = await deps.storage.probePresence(claim); } catch {
    const receipt = await deps.database.markDeletionReconciliationRequired({ deletionAttemptId, failureCode: 'DELETE_OUTCOME_UNKNOWN' });
    return { outcome: 'reconciliation_required', receipt, failureCode: 'DELETE_OUTCOME_UNKNOWN' };
  }
  if (presence.status === 'missing') {
    try {
      const receipt = await deps.database.markTombstone({ deletionAttemptId, providerOutcome: 'missing' });
      return { outcome: 'deleted', receipt, providerOutcome: 'missing' };
    } catch {
      const receipt = await deps.database.markDeletionReconciliationRequired({ deletionAttemptId, failureCode: 'TOMBSTONE_COMPLETION_FAILED' });
      return { outcome: 'reconciliation_required', receipt, failureCode: 'TOMBSTONE_COMPLETION_FAILED' };
    }
  }
  return runCommittedDeletion(claim, deps);
};
