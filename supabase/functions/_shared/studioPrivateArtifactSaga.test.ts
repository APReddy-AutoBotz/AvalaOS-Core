import assert from 'node:assert/strict';
import test from 'node:test';
import { renderStudioPrivateArtifact, type StudioApprovedContent, type StudioRenditionFormat } from './studioPrivateArtifactRenderer';
import { DeterministicFakeStudioPrivateArtifactStorage } from './studioPrivateArtifactStorage';
import {
  executeStudioDeletionSaga,
  executeStudioRenditionSaga,
  reconcileStudioDeletion,
  reconcileStudioRendition,
  type StudioDeletionReceipt,
  type StudioDeletionSagaDatabase,
  type StudioRenditionClaim,
  type StudioRenditionSagaDatabase,
  type StudioSagaFailureCode,
  type StudioSagaPublicReceipt,
} from './studioPrivateArtifactSaga';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const opaqueObjectId = '33333333-3333-4333-8333-333333333333';
const content: StudioApprovedContent = { title: 'Brief', summary: 'Summary', sections: [{ title: 'Decision', content: 'Governed.' }] };
const renderingAuthority = { artifactType: 'brd' as const, contentSchemaVersion: 'studio-artifact-1', templateVersion: 'studio-brd-1', rendererVersion: 'studio-markdown-1' as const };
const executeClaim: StudioRenditionClaim = {
  disposition: 'execute', requestId: 'request-1', attemptId: 'attempt-1', renditionId: 'rendition-1', organizationId, workspaceId, opaqueObjectId,
  artifactId: 'artifact-1', artifactVersionId: 'artifact-version-1', artifactType: 'brd', format: 'markdown', approvedContent: content,
  contentSchemaVersion: 'studio-artifact-1', rendererVersion: 'studio-markdown-1', templateVersion: 'studio-brd-1', reconciliationCount: 0,
};
const receipt = (state: StudioSagaPublicReceipt['state']): StudioSagaPublicReceipt => ({ attemptId: 'attempt-1', renditionId: 'rendition-1', format: 'markdown', state });

class FakeRenditionDb implements StudioRenditionSagaDatabase {
  claimValue: StudioRenditionClaim = executeClaim;
  work: any = null;
  failPersist = false;
  failAvailable = false;
  availableCalls = 0;
  failedCodes: StudioSagaFailureCode[] = [];
  reconciliationCodes: StudioSagaFailureCode[] = [];
  async claim(_requestId: string) { return this.claimValue; }
  async startAttempt(_input: { attemptId: string }) {}
  async persistRendered(input: any) {
    if (this.failPersist) throw new Error('db');
    this.work = { ...input, state: 'rendered', reconciliationCount: 0 };
  }
  async markAvailable(_input: any) {
    this.availableCalls += 1;
    if (this.failAvailable) { this.failAvailable = false; throw new Error('db'); }
    if (this.work) this.work.state = 'available';
    return receipt('available');
  }
  async markFailed(input: { attemptId: string; failureCode: StudioSagaFailureCode }) {
    this.failedCodes.push(input.failureCode);
    if (this.work) this.work.state = 'failed';
    return receipt('failed');
  }
  async markReconciliationRequired(input: { attemptId: string; failureCode: StudioSagaFailureCode }) {
    this.reconciliationCodes.push(input.failureCode);
    if (this.work) { this.work.state = 'completion_pending'; this.work.reconciliationCount += 1; }
    return receipt('reconciliation_required');
  }
  async loadReconciliation(_attemptId: string) { return this.work; }
}

void test('rendition saga follows durable render metadata, upload, verification, then available completion', async () => {
  const database = new FakeRenditionDb();
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await executeStudioRenditionSaga('request-1', { database, storage });
  assert.equal(result.outcome, 'available');
  assert.equal(database.work.state, 'available');
  assert.equal(storage.operationCounts.upload, 1);
  assert.equal(database.availableCalls, 1);
});
void test('rendition exact replay returns committed receipt with no render or storage claim', async () => {
  const database = new FakeRenditionDb();
  database.claimValue = { disposition: 'replay', receipt: receipt('available') };
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  let renders = 0;
  const result = await executeStudioRenditionSaga('request-1', { database, storage, render: async (...args) => { renders += 1; return renderStudioPrivateArtifact(...args); } });
  assert.equal(result.outcome, 'replay');
  assert.equal(renders, 0);
  assert.equal(storage.operationCounts.upload, 0);
});
void test('rendition render failure is durable and never available', async () => {
  const database = new FakeRenditionDb();
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await executeStudioRenditionSaga('request-1', { database, storage, render: async () => { throw new Error('render'); } });
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(database.failedCodes, ['RENDER_FAILED']);
  assert.equal(database.availableCalls, 0);
});
void test('rendition metadata persistence failure prevents upload', async () => {
  const database = new FakeRenditionDb(); database.failPersist = true;
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await executeStudioRenditionSaga('request-1', { database, storage });
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(database.failedCodes, ['RENDER_METADATA_PERSIST_FAILED']);
  assert.equal(storage.operationCounts.upload, 0);
});
void test('rendition upload outcome failure remains reconcilable and not available', async () => {
  const database = new FakeRenditionDb();
  const storage = new DeterministicFakeStudioPrivateArtifactStorage(); storage.failNextUpload();
  const result = await executeStudioRenditionSaga('request-1', { database, storage });
  assert.equal(result.outcome, 'reconciliation_required');
  assert.deepEqual(database.reconciliationCodes, ['UPLOAD_OUTCOME_UNKNOWN']);
  assert.equal(database.availableCalls, 0);
});
void test('upload success plus database completion failure preserves object for reconciliation', async () => {
  const database = new FakeRenditionDb(); database.failAvailable = true;
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await executeStudioRenditionSaga('request-1', { database, storage });
  assert.equal(result.outcome, 'reconciliation_required');
  assert.equal(storage.hasObjectForTest(database.work.objectKey), true);
  assert.deepEqual(database.reconciliationCodes, ['AVAILABLE_COMPLETION_FAILED']);
});
void test('reconciliation verifies an existing object and completes without a second upload', async () => {
  const database = new FakeRenditionDb(); database.failAvailable = true;
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  await executeStudioRenditionSaga('request-1', { database, storage });
  const result = await reconcileStudioRendition('attempt-1', { database, storage });
  assert.equal(result.outcome, 'available');
  assert.equal(storage.operationCounts.upload, 1);
  assert.equal(storage.operationCounts.probe, 1);
});
void test('reconciliation recreates a missing object only from committed server content', async () => {
  const database = new FakeRenditionDb();
  const rendered = await renderStudioPrivateArtifact(content, 'markdown', renderingAuthority);
  const objectKey = `${organizationId}/${workspaceId}/studio-artifacts/${opaqueObjectId}.md`;
  database.work = { ...executeClaim, objectKey, byteLength: rendered.byteLength, sha256: rendered.sha256, mimeType: rendered.mimeType, filename: rendered.filename, rendererVersion: rendered.rendererVersion, templateVersion: rendered.templateVersion, state: 'completion_pending', reconciliationCount: 1 };
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await reconcileStudioRendition('attempt-1', { database, storage });
  assert.equal(result.outcome, 'available');
  assert.equal(storage.operationCounts.probe, 1);
  assert.equal(storage.operationCounts.upload, 1);
});
void test('reconciliation rejects deterministic render metadata drift', async () => {
  const database = new FakeRenditionDb();
  const rendered = await renderStudioPrivateArtifact(content, 'markdown', renderingAuthority);
  database.work = { ...executeClaim, objectKey: `${organizationId}/${workspaceId}/studio-artifacts/${opaqueObjectId}.md`, byteLength: rendered.byteLength, sha256: '0'.repeat(64), mimeType: rendered.mimeType, filename: rendered.filename, rendererVersion: rendered.rendererVersion, templateVersion: rendered.templateVersion, state: 'completion_pending', reconciliationCount: 1 };
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await reconcileStudioRendition('attempt-1', { database, storage });
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(database.failedCodes, ['STORAGE_OBJECT_MISMATCH']);
  assert.equal(storage.operationCounts.upload, 0);
});
void test('reconciliation fails closed on corrupt existing object', async () => {
  const database = new FakeRenditionDb(); database.failAvailable = true;
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  await executeStudioRenditionSaga('request-1', { database, storage });
  storage.corruptObjectForTest(database.work.objectKey);
  const result = await reconcileStudioRendition('attempt-1', { database, storage });
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(database.failedCodes, ['STORAGE_OBJECT_MISMATCH']);
});
void test('rendition reconciliation is bounded after three committed attempts', async () => {
  const database = new FakeRenditionDb();
  database.work = { ...executeClaim, objectKey: `${organizationId}/${workspaceId}/studio-artifacts/${opaqueObjectId}.md`, byteLength: 1, sha256: '0'.repeat(64), mimeType: 'text/markdown; charset=utf-8', filename: 'studio-artifact-rendition.md', rendererVersion: 'studio-markdown-1', templateVersion: 'studio-brd-1', contentSchemaVersion: 'studio-artifact-1', state: 'completion_pending', reconciliationCount: 3 };
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await reconcileStudioRendition('attempt-1', { database, storage });
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(database.failedCodes, ['RECONCILIATION_EXHAUSTED']);
  assert.equal(storage.operationCounts.probe, 0);
});
void test('available rendition reconciliation is a read-only replay', async () => {
  const database = new FakeRenditionDb();
  database.work = { ...executeClaim, state: 'available', reconciliationCount: 0 };
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await reconcileStudioRendition('attempt-1', { database, storage });
  assert.equal(result.outcome, 'replay');
  assert.equal(storage.operationCounts.probe, 0);
});

const deletionClaim = { disposition: 'execute' as const, requestId: 'delete-request', deletionAttemptId: 'delete-1', renditionId: 'rendition-1', organizationId, workspaceId, objectKey: `${organizationId}/${workspaceId}/studio-artifacts/${opaqueObjectId}.md`, reconciliationCount: 0 };
class FakeDeletionDb implements StudioDeletionSagaDatabase {
  claimValue: any = deletionClaim;
  loadValue: any = deletionClaim;
  failTombstone = false;
  tombstones: Array<'deleted' | 'missing'> = [];
  failures: string[] = [];
  reconciliation = 0;
  async claimDeletion(_requestId: string) { return this.claimValue; }
  async markTombstone(input: { deletionAttemptId: string; providerOutcome: 'deleted' | 'missing' }) {
    if (this.failTombstone) { this.failTombstone = false; throw new Error('db'); }
    this.tombstones.push(input.providerOutcome);
    return { deletionAttemptId: 'delete-1', renditionId: 'rendition-1', state: 'deleted' as const };
  }
  async markDeletionFailure(input: { deletionAttemptId: string; failureCode: 'PROVIDER_DELETE_FAILED' | 'DELETION_RECONCILIATION_EXHAUSTED' }) {
    this.failures.push(input.failureCode);
    return { deletionAttemptId: 'delete-1', renditionId: 'rendition-1', state: 'deletion_failed' as const };
  }
  async markDeletionReconciliationRequired(_input: { deletionAttemptId: string; failureCode: 'TOMBSTONE_COMPLETION_FAILED' }) {
    this.reconciliation += 1;
    return { deletionAttemptId: 'delete-1', renditionId: 'rendition-1', state: 'reconciliation_required' as const };
  }
  async loadDeletionReconciliation(_deletionAttemptId: string) { return this.loadValue; }
}
const seedDeletionObject = async (storage: DeterministicFakeStudioPrivateArtifactStorage) => {
  const rendered = await renderStudioPrivateArtifact(content, 'markdown', renderingAuthority);
  await storage.uploadCreateOnly({ organizationId, workspaceId, objectKey: deletionClaim.objectKey, byteLength: rendered.byteLength, sha256: rendered.sha256, mimeType: rendered.mimeType, bytes: rendered.bytes });
};

void test('deletion saga tombstones only after provider deletion success', async () => {
  const database = new FakeDeletionDb(); const storage = new DeterministicFakeStudioPrivateArtifactStorage(); await seedDeletionObject(storage);
  const result = await executeStudioDeletionSaga('delete-request', { database, storage });
  assert.equal(result.outcome, 'deleted');
  assert.deepEqual(database.tombstones, ['deleted']);
  assert.equal(storage.hasObjectForTest(deletionClaim.objectKey), false);
});
void test('deletion saga treats provider-confirmed missing as an unambiguous tombstone outcome', async () => {
  const database = new FakeDeletionDb(); const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await executeStudioDeletionSaga('delete-request', { database, storage });
  assert.equal(result.outcome, 'deleted');
  assert.deepEqual(database.tombstones, ['missing']);
});
void test('deletion provider failure invokes failure callback and never tombstones', async () => {
  const database = new FakeDeletionDb(); const storage = new DeterministicFakeStudioPrivateArtifactStorage(); storage.failNextDelete();
  const result = await executeStudioDeletionSaga('delete-request', { database, storage });
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(database.failures, ['PROVIDER_DELETE_FAILED']);
  assert.deepEqual(database.tombstones, []);
});
void test('deletion exact replay makes no provider call', async () => {
  const database = new FakeDeletionDb();
  const replayReceipt: StudioDeletionReceipt = { deletionAttemptId: 'delete-1', renditionId: 'rendition-1', state: 'deleted' };
  database.claimValue = { disposition: 'replay', receipt: replayReceipt };
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await executeStudioDeletionSaga('delete-request', { database, storage });
  assert.equal(result.outcome, 'replay');
  assert.equal(storage.operationCounts.delete, 0);
});
void test('delete success plus tombstone completion failure stays reconcilable', async () => {
  const database = new FakeDeletionDb(); database.failTombstone = true;
  const storage = new DeterministicFakeStudioPrivateArtifactStorage(); await seedDeletionObject(storage);
  const result = await executeStudioDeletionSaga('delete-request', { database, storage });
  assert.equal(result.outcome, 'reconciliation_required');
  assert.equal(database.reconciliation, 1);
  assert.equal(storage.hasObjectForTest(deletionClaim.objectKey), false);
});
void test('deletion reconciliation confirms missing object and completes tombstone', async () => {
  const database = new FakeDeletionDb(); database.failTombstone = true;
  const storage = new DeterministicFakeStudioPrivateArtifactStorage(); await seedDeletionObject(storage);
  await executeStudioDeletionSaga('delete-request', { database, storage });
  const result = await reconcileStudioDeletion('delete-1', { database, storage });
  assert.equal(result.outcome, 'deleted');
  assert.deepEqual(database.tombstones, ['missing']);
});
void test('deletion reconciliation is bounded after three committed attempts', async () => {
  const database = new FakeDeletionDb(); database.loadValue = { ...deletionClaim, reconciliationCount: 3 };
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const result = await reconcileStudioDeletion('delete-1', { database, storage });
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(database.failures, ['DELETION_RECONCILIATION_EXHAUSTED']);
  assert.equal(storage.operationCounts.delete, 0);
});
