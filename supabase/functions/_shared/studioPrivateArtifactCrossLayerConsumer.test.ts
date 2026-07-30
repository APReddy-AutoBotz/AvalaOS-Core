import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  decodeStudioDeletionClaim,
  decodeStudioDownloadClaim,
  decodeStudioRenditionClaim,
} from './studioPrivateArtifactRpcContract.ts';
import {
  executeStudioDeletionSaga,
  executeStudioRenditionSaga,
  type StudioDeletionSagaDatabase,
  type StudioRenditionSagaDatabase,
} from './studioPrivateArtifactSaga.ts';
import {
  renderStudioPrivateArtifact,
  sha256Hex,
} from './studioPrivateArtifactRenderer.ts';
import {
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
  const claim = decodeStudioDeletionClaim(input.claim);
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
} else {
  throw new Error(`unknown cross-layer mode: ${mode}`);
}
})().catch(error => {
  console.error(error);
  throw error;
});
