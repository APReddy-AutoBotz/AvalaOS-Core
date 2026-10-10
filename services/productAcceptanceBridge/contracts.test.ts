import assert from 'node:assert/strict';
import {
  StudioDeliveryContractError,
  decodeStudioDeliveryCommand,
  decodeStudioDeliveryCommandSuccess,
  decodeStudioDeliveryOutcomeQueryResult,
  decodeStudioDeliveryPackQuery,
  decodeStudioDeliveryPackQueryResult,
  decodeStudioDeliveryAssigneeQuery,
  decodeStudioDeliveryAssigneeQueryResult,
  type StudioDeliveryCommandEnvelope,
  type StudioDeliveryOutcomeQueryRequest,
} from './contracts';

const U = Array.from({ length: 16 }, (_, index) => `${String(index + 1).padStart(8, '0')}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const publish: StudioDeliveryCommandEnvelope<'studio.approved-artifact.publish'> = {
  schemaVersion: 'studio-delivery-command.v1', action: 'studio.approved-artifact.publish', organizationId: U[0], workspaceId: U[1],
  expectedAuthorizationVersion: 7, requestId: U[2], idempotencyKey: 'studio-delivery.publish.contract-1',
  payload: { artifactId: U[3], expectedArtifactVersionId: U[4], expectedAggregateVersion: 5, projectId: U[5],
    workItems: [{ type: 'Story', title: 'Publish governed work', description: 'Human-approved structured work.', acceptanceCriteria: ['Exact ancestry is retained.'] }] },
};
const publication = { publicationId: U[6], documentGenerationId: U[7], projectId: U[5], artifactId: U[3], artifactVersionId: U[4],
  artifactVersion: 3, artifactContentHash: 'a'.repeat(64), sourceProcessId: U[8], sourceAssessmentId: U[9], governResolutionId: U[10],
  workItemCount: 1, workItemDigest: `sha256:${'b'.repeat(64)}`, publishedAt: '2026-10-10T05:11:00Z' };
assert.deepEqual(decodeStudioDeliveryCommand(publish), publish);
assert.deepEqual(decodeStudioDeliveryCommandSuccess({ ok: true, schemaVersion: publish.schemaVersion, action: publish.action,
  outcome: 'committed', receiptId: U[11], resource: publication }, publish).resource, publication);
assert.throws(() => decodeStudioDeliveryCommand({ ...publish, payload: { ...publish.payload, generatedFromProse: true } }), StudioDeliveryContractError);
assert.throws(() => decodeStudioDeliveryCommand({ ...publish, payload: { ...publish.payload, workItems: [] } }), StudioDeliveryContractError);
assert.throws(() => decodeStudioDeliveryCommandSuccess({ ok: true, schemaVersion: publish.schemaVersion, action: publish.action,
  outcome: 'committed', receiptId: U[11], resource: { ...publication, workItemCount: 2 } }, publish), StudioDeliveryContractError);

const outcome: StudioDeliveryCommandEnvelope<'delivery.outcome.record'> = { ...publish, action: 'delivery.outcome.record',
  idempotencyKey: 'studio-delivery.outcome.contract-1', payload: { taskId: U[12], expectedTaskVersion: 2, expectedOutcomeVersion: null,
    status: 'achieved', label: 'Cycle time reduced', detail: 'The operator confirmed the realized outcome.' } };
assert.deepEqual(decodeStudioDeliveryCommand(outcome), outcome);
assert.throws(() => decodeStudioDeliveryCommand({ ...outcome, payload: { ...outcome.payload, expectedOutcomeVersion: 0 } }), StudioDeliveryContractError);
const outcomeResource = { outcomeId: U[13], version: 1, taskId: U[12], taskVersion: 2,
  projectId: U[5], status: 'achieved', label: 'Cycle time reduced', detail: 'The operator confirmed the realized outcome.', documentGenerationId: U[7],
  studioArtifactId: U[3], studioArtifactVersionId: U[4], recordedBy: U[14], recordedAt: '2026-10-10T05:12:00+00:00' };
const outcomeSuccess = { ok: true, schemaVersion: outcome.schemaVersion, action: outcome.action,
  outcome: 'committed', receiptId: U[15], resource: outcomeResource };
assert.deepEqual(decodeStudioDeliveryCommandSuccess(outcomeSuccess, outcome).resource, outcomeResource);
for (const changed of [
  { taskId: U[11] }, { taskVersion: 3 }, { version: 2 }, { status: 'partial' },
  { label: 'Substituted label' }, { detail: 'Substituted detail' },
]) assert.throws(() => decodeStudioDeliveryCommandSuccess({ ...outcomeSuccess, resource: { ...outcomeResource, ...changed } }, outcome), StudioDeliveryContractError);

const pack: StudioDeliveryCommandEnvelope<'delivery.pack.snapshot'> = { ...publish, action: 'delivery.pack.snapshot',
  idempotencyKey: 'studio-delivery.pack.contract-1', payload: { projectId: U[5] } };
assert.deepEqual(decodeStudioDeliveryCommand(pack), pack);
const packResource = { snapshotId: U[6], version: 1, projectId: U[5], taskCount: 2, boundTaskCount: 1,
  taskSetHash: `sha256:${'c'.repeat(64)}`, createdAt: '2026-10-10T05:13:00Z' };
const packSuccess = { ok: true, schemaVersion: pack.schemaVersion, action: pack.action, outcome: 'committed', receiptId: U[7], resource: packResource };
assert.deepEqual(decodeStudioDeliveryCommandSuccess(packSuccess, pack).resource, packResource);
assert.throws(() => decodeStudioDeliveryCommandSuccess({ ...packSuccess, resource: { ...packResource, projectId: U[4] } }, pack), StudioDeliveryContractError);
assert.throws(() => decodeStudioDeliveryCommand({ ...pack, payload: { ...pack.payload, taskIds: [U[12]] } }), StudioDeliveryContractError);

const query: StudioDeliveryOutcomeQueryRequest = { schemaVersion: 'studio-delivery-outcome-query.v1', organizationId: U[0], workspaceId: U[1],
  expectedAuthorizationVersion: 7, projectId: U[5], limit: 50, cursor: null };
const result = { ok: true, schemaVersion: query.schemaVersion, projectId: U[5], items: [outcomeResource],
  page: { limit: 50, nextCursor: null, hasMore: false } };
assert.deepEqual(decodeStudioDeliveryOutcomeQueryResult(result, query), result);
assert.throws(() => decodeStudioDeliveryOutcomeQueryResult({ ...result, inferred: true }, query), StudioDeliveryContractError);
const packQuery = decodeStudioDeliveryPackQuery({ schemaVersion: 'studio-delivery-pack-query.v1', organizationId: U[0], workspaceId: U[1],
  expectedAuthorizationVersion: 7, projectId: U[5] });
assert.deepEqual(decodeStudioDeliveryPackQueryResult({ ok: true, schemaVersion: packQuery.schemaVersion, projectId: U[5], latestSnapshot: packResource }, packQuery).latestSnapshot, packResource);
assert.throws(() => decodeStudioDeliveryPackQueryResult({ ok: true, schemaVersion: packQuery.schemaVersion, projectId: U[5], latestSnapshot: { ...packResource, projectId: U[4] } }, packQuery), StudioDeliveryContractError);
const assigneeQuery = decodeStudioDeliveryAssigneeQuery({ schemaVersion: 'studio-delivery-assignee-query.v1', organizationId: U[0], workspaceId: U[1],
  expectedAuthorizationVersion: 7, projectId: U[5] });
const assigneeResult = { ok: true, schemaVersion: assigneeQuery.schemaVersion, projectId: U[5], items: [
  { id: U[1], displayName: 'Delivery reviewer' }, { id: U[2], displayName: 'Delivery owner' },
] };
assert.deepEqual(decodeStudioDeliveryAssigneeQueryResult(assigneeResult, assigneeQuery), assigneeResult);
assert.throws(() => decodeStudioDeliveryAssigneeQueryResult({ ...assigneeResult, items: [{ id: U[1], displayName: 'A', email: 'hidden@example.invalid' }] }, assigneeQuery), StudioDeliveryContractError);
assert.throws(() => decodeStudioDeliveryAssigneeQueryResult({ ...assigneeResult, items: [{ id: U[1], displayName: 'A' }, { id: U[1], displayName: 'B' }] }, assigneeQuery), StudioDeliveryContractError);
console.log('studio delivery contracts: exact bounded publish, versioned outcome, immutable pack and read-only assignee/outcome queries passed');
