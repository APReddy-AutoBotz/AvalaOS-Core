import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  decodeStudioDeletionClaim,
  decodeStudioDeletionExecutionBinding,
  decodeStudioDownloadClaim,
  decodeStudioRenditionReconciliationClaim,
  decodeStudioRenditionClaim,
} from './studioPrivateArtifactRpcContract.ts';
import {
  executeStudioDeletionSaga,
  executeStudioRenditionSaga,
  reconcileStudioDeletion,
  reconcileStudioRendition,
  type StudioDeletionSagaDatabase,
  type StudioRenditionSagaDatabase,
} from './studioPrivateArtifactSaga.ts';
import {
  renderStudioPrivateArtifact,
  sha256Hex,
} from './studioPrivateArtifactRenderer.ts';
import {
  createStudioPrivateArtifactStorage,
  DeterministicFakeStudioPrivateArtifactStorage,
  type StudioStoredObjectExpectation,
} from './studioPrivateArtifactStorage.ts';

const inputPath = process.env.STUDIO_PRIVATE_CROSS_LAYER_INPUT;
const outputPath = process.env.STUDIO_PRIVATE_CROSS_LAYER_OUTPUT;
const mode = process.env.STUDIO_PRIVATE_CROSS_LAYER_MODE;
assert.ok(inputPath && outputPath && mode, 'cross-layer paths and mode are required');

const input = JSON.parse(readFileSync(inputPath, 'utf8')) as Record<string, unknown>;
const write = (value: unknown) =>
  writeFileSync(outputPath, `${JSON.stringify(value)}\n`, 'utf8');

void (async () => {
if (mode === 'rendition') {
  const claim = decodeStudioRenditionClaim(input.claim);
  let persisted: Parameters<StudioRenditionSagaDatabase['persistRendered']>[0] | null =
    null;
  let capturedBytes: Uint8Array | null = null;
  let startCount = 0;
  let completionCount = 0;
  const database: StudioRenditionSagaDatabase = {
    async claim() {
      return claim;
    },
    async startAttempt() {
      startCount += 1;
    },
    async persistRendered(value) {
      persisted = value;
    },
    async markAvailable() {
      completionCount += 1;
      return {
        attemptId: claim.attemptId,
        renditionId: claim.renditionId,
        format: claim.format,
        state: 'available',
      };
    },
    async markFailed() {
      throw new Error('unexpected rendition failure');
    },
    async markReconciliationRequired() {
      throw new Error('unexpected rendition reconciliation');
    },
    async loadReconciliation() {
      return null;
    },
  };
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await executeStudioRenditionSaga(claim.requestId, {
    database,
    storage,
    render: async (...args) => {
      const rendered = await renderStudioPrivateArtifact(...args);
      capturedBytes = rendered.bytes;
      return rendered;
    },
  });
  assert.equal(result.outcome, 'available');
  assert.ok(persisted && capturedBytes);
  write({
    outcome: result.outcome,
    startCount,
    completionCount,
    uploadCount: storage.operationCounts.upload,
    objectCount: storage.hasObjectForTest(persisted.objectKey) ? 1 : 0,
    persisted,
    bytesBase64: Buffer.from(capturedBytes).toString('base64'),
  });
} else if (mode === 'download') {
  const first = decodeStudioDownloadClaim(input.claim);
  const replay = decodeStudioDownloadClaim(input.replayClaim);
  assert.deepEqual(replay, first, 'download replay must return the same private claim');
  const bytes = new Uint8Array(Buffer.from(String(input.bytesBase64), 'base64'));
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  await storage.uploadCreateOnly({ ...first, bytes });
  const firstBytes = await storage.downloadExact(first);
  const replayBytes = await storage.downloadExact(replay);
  assert.deepEqual(replayBytes, firstBytes);
  write({
    downloadCount: storage.operationCounts.download,
    objectCount: storage.hasObjectForTest(first.objectKey) ? 1 : 0,
    byteLength: firstBytes.byteLength,
    sha256: await sha256Hex(firstBytes),
  });
} else if (mode === 'deletion') {
  const pending = decodeStudioDeletionClaim(input.claim);
  const execution = decodeStudioDeletionExecutionBinding(input.execution);
  assert.ok(execution);
  const claim = { ...execution, disposition: 'execute' as const, requestId: pending.requestId };
  const expectation = input.expectation as StudioStoredObjectExpectation;
  const bytes = new Uint8Array(Buffer.from(String(input.bytesBase64), 'base64'));
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  await storage.uploadCreateOnly({ ...expectation, bytes });
  let tombstoneCount = 0;
  const database: StudioDeletionSagaDatabase = {
    async claimDeletion() {
      return claim;
    },
    async markTombstone({ providerOutcome }) {
      tombstoneCount += 1;
      return {
        deletionAttemptId: claim.deletionAttemptId,
        renditionId: claim.renditionId,
        state: providerOutcome === 'deleted' || providerOutcome === 'missing'
          ? 'deleted'
          : 'deletion_failed',
      };
    },
    async markDeletionFailure() {
      throw new Error('unexpected deletion failure');
    },
    async markDeletionReconciliationRequired() {
      throw new Error('unexpected deletion reconciliation');
    },
    async loadDeletionReconciliation() {
      return claim;
    },
  };
  const result = await executeStudioDeletionSaga(claim.requestId, {
    database,
    storage,
  });
  assert.equal(result.outcome, 'deleted');
  write({
    outcome: result.outcome,
    providerDeleteCount: storage.operationCounts.delete,
    tombstoneCount,
    objectCount: storage.hasObjectForTest(claim.objectKey) ? 1 : 0,
  });
} else if (mode === 'renditionReconciliation') {
  const claim = decodeStudioRenditionReconciliationClaim(input.claim);
  assert.ok(claim);
  assert.equal(claim.phase, 'verify_or_upload');
  if (claim.phase !== 'verify_or_upload') throw new Error('expected post-render reconciliation claim');
  const rendered = await renderStudioPrivateArtifact(claim.approvedContent, claim.format, { artifactType: claim.artifactType, contentSchemaVersion: claim.contentSchemaVersion, templateVersion: claim.templateVersion, rendererVersion: claim.rendererVersion });
  assert.deepEqual({ byteLength: rendered.byteLength, sha256: rendered.sha256, mimeType: rendered.mimeType, filename: rendered.filename }, { byteLength: claim.byteLength, sha256: claim.sha256, mimeType: claim.mimeType, filename: claim.filename });
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const expectation = { organizationId: claim.organizationId, workspaceId: claim.workspaceId, objectKey: claim.objectKey, byteLength: claim.byteLength, sha256: claim.sha256, mimeType: claim.mimeType };
  if (input.objectStatus === 'exists' || input.objectStatus === 'mismatch') { await storage.uploadCreateOnly({ ...expectation, bytes: rendered.bytes }); if (input.objectStatus === 'mismatch') storage.corruptObjectForTest(claim.objectKey); }
  storage.operationCounts.upload = 0; storage.operationCounts.probe = 0;
  let completionCount = 0; const failures: string[] = []; const reconciliations: string[] = [];
  const database: StudioRenditionSagaDatabase = {
    async claim() { throw new Error('reconciliation only'); }, async startAttempt() { throw new Error('reconciliation only'); }, async persistRendered() { throw new Error('reconciliation only'); },
    async markAvailable() { completionCount += 1; if (input.failCompletion === true) throw new Error('completion'); return { attemptId: claim.attemptId, renditionId: claim.renditionId, format: claim.format, state: 'available' }; },
    async markFailed(value) { failures.push(value.failureCode); return { attemptId: claim.attemptId, renditionId: claim.renditionId, format: claim.format, state: 'failed' }; },
    async markReconciliationRequired(value) { reconciliations.push(value.failureCode); return { attemptId: claim.attemptId, renditionId: claim.renditionId, format: claim.format, state: 'reconciliation_required' }; },
    async loadReconciliation() { return { ...claim, state: 'completion_pending' }; },
  };
  const result = await reconcileStudioRendition(claim.attemptId, { database, storage });
  write({ outcome: result.outcome, failureCode: 'failureCode' in result ? result.failureCode : null, completionCount, failures, reconciliations, provider: { probes: storage.operationCounts.probe, uploads: storage.operationCounts.upload } });
} else if (mode === 'deletionReconciliation') {
  const claim = decodeStudioDeletionExecutionBinding(input.claim);
  assert.ok(claim);
  let exists = input.objectStatus === 'exists'; let presence = 0; let deletes = 0;
  const storage = {
    async uploadCreateOnly() { throw new Error('not used'); }, async probeExact() { throw new Error('not used'); }, async downloadExact() { throw new Error('not used'); },
    async probePresence() { presence += 1; return { status: exists ? 'exists' as const : 'missing' as const }; },
    async deleteExact() { deletes += 1; if (input.deleteOutcomeUnknown === true) throw new Error('unknown'); const status = exists ? 'deleted' as const : 'missing' as const; exists = false; return { status }; },
  };
  let tombstones = 0; const failures: string[] = []; const reconciliations: string[] = [];
  const executable = { ...claim, disposition: 'execute' as const, requestId: claim.deletionAttemptId };
  const database: StudioDeletionSagaDatabase = {
    async claimDeletion() { throw new Error('reconciliation only'); },
    async markTombstone() { tombstones += 1; if (input.failTombstone === true) throw new Error('completion'); return { deletionAttemptId: claim.deletionAttemptId, renditionId: claim.renditionId, state: 'deleted' }; },
    async markDeletionFailure(value) { failures.push(value.failureCode); return { deletionAttemptId: claim.deletionAttemptId, renditionId: claim.renditionId, state: 'deletion_failed' }; },
    async markDeletionReconciliationRequired(value) { reconciliations.push(value.failureCode); return { deletionAttemptId: claim.deletionAttemptId, renditionId: claim.renditionId, state: 'reconciliation_required' }; },
    async loadDeletionReconciliation() { return executable; },
  };
  const result = await reconcileStudioDeletion(claim.deletionAttemptId, { database, storage });
  write({ outcome: result.outcome, failureCode: 'failureCode' in result ? result.failureCode : null, provider: { presence, deletes, exists }, tombstones, failures, reconciliations });
} else if (mode === 'bucketAuthority') {
  let requests = 0; let rejected = false;
  try { createStudioPrivateArtifactStorage({ supabaseUrl: 'https://example.invalid', serviceRoleKey: 'service-only', configuredBucket: String(input.bucket), configuredBucketAllowlist: String(input.allowlist), fetch: (async () => { requests += 1; return new Response(); }) as typeof fetch }); } catch { rejected = true; }
  write({ rejected, providerRequests: requests });
} else {
  throw new Error('unknown cross-layer mode: ' + mode);
}
})().catch(error => {
  console.error(error);
  throw error;
});
