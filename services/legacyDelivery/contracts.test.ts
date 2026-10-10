import assert from 'node:assert/strict';
import {
  LegacyDeliveryContractError,
  decodeLegacyDeliveryCommand,
  decodeLegacyDeliveryCommandSuccess,
  decodeLegacyDeliveryQueryResult,
  type LegacyDeliveryCommandEnvelope,
  type LegacyDeliveryQueryRequest,
  type LegacyDeliveryTaskProjection,
} from './contracts';

const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  org: '22222222-2222-4222-8222-222222222222',
  workspace: '33333333-3333-4333-8333-333333333333',
  project: '44444444-4444-4444-8444-444444444444',
  request: '55555555-5555-4555-8555-555555555555',
  task: '66666666-6666-4666-8666-666666666666',
  source: '77777777-7777-4777-8777-777777777777',
};
const digest = `sha256:${'a'.repeat(64)}`;
const task: LegacyDeliveryTaskProjection = {
  id: ids.task,
  version: 1,
  mutable: true,
  projectId: ids.project,
  title: 'Map order intake',
  description: 'Confirm the governed intake path.',
  status: 'To Do',
  priority: 'High',
  type: 'Task',
  assigneeIds: [ids.actor],
  dependencyIds: [],
  ownerId: ids.actor,
  reporterId: ids.actor,
  sourceLineage: null,
  sourceEpicIndex: null,
  sourceEpicTitle: null,
  retentionState: 'active',
  retentionClass: 'none',
  retentionReason: null,
  deletionRequestedAt: null,
  deletionRequestedBy: null,
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
};
const command: LegacyDeliveryCommandEnvelope<'task.create'> = {
  schemaVersion: 'legacy-delivery-command.v1',
  action: 'task.create',
  organizationId: ids.org,
  workspaceId: ids.workspace,
  expectedAuthorizationVersion: 7,
  requestId: ids.request,
  idempotencyKey: 'legacy-delivery.create.contract-1',
  payload: {
    projectId: ids.project,
    task: { title: task.title, description: task.description, priority: 'High', type: 'Task', assigneeIds: [ids.actor], dependencyIds: [] },
  },
};
const query: LegacyDeliveryQueryRequest = {
  schemaVersion: 'legacy-delivery-query.v1',
  organizationId: ids.org,
  workspaceId: ids.workspace,
  expectedAuthorizationVersion: 7,
  projectId: ids.project,
  limit: 100,
  cursor: null,
  sourceGenerationId: ids.source,
  includeRetained: true,
};

assert.deepEqual(decodeLegacyDeliveryCommand(command), command);
assert.throws(() => decodeLegacyDeliveryCommand({
  ...command,
  payload: { ...command.payload, title: 'browser supplied authority' },
}), LegacyDeliveryContractError);
const importCommand: LegacyDeliveryCommandEnvelope<'import'> = {
  ...command,
  action: 'import',
  payload: { projectId: ids.project, sourceGenerationId: ids.source, expectedSourceDigest: digest, sourceItemIndices: [0, 2] },
};
assert.deepEqual(decodeLegacyDeliveryCommand(importCommand), importCommand);
assert.throws(() => decodeLegacyDeliveryCommand({
  ...importCommand,
  payload: { ...importCommand.payload, items: [{ title: 'browser content must never be authoritative' }] },
}), LegacyDeliveryContractError);
assert.throws(() => decodeLegacyDeliveryCommand({
  ...importCommand,
  payload: { ...importCommand.payload, sourceItemIndices: [1, 1] },
}), LegacyDeliveryContractError);

const created = decodeLegacyDeliveryCommandSuccess({
  ok: true,
  schemaVersion: 'legacy-delivery-command.v1',
  action: 'task.create',
  resource: task,
}, command);
assert.equal((created.resource as LegacyDeliveryTaskProjection).id, ids.task);
const databaseTimestamp = '2026-10-10T04:22:33.123456+00:00';
assert.equal((decodeLegacyDeliveryCommandSuccess({
  ok: true, schemaVersion: 'legacy-delivery-command.v1', action: 'task.create',
  resource: { ...task, createdAt: databaseTimestamp, updatedAt: databaseTimestamp },
}, command).resource as LegacyDeliveryTaskProjection).createdAt, databaseTimestamp);
assert.throws(() => decodeLegacyDeliveryCommandSuccess({
  ok: true,
  schemaVersion: 'legacy-delivery-command.v1',
  action: 'task.create',
  resource: { ...task, projectId: ids.source },
}, command), LegacyDeliveryContractError);

const queryResult = decodeLegacyDeliveryQueryResult({
  ok: true,
  schemaVersion: 'legacy-delivery-query.v1',
  projectId: ids.project,
  items: [task, { ...task, id: ids.request, version: null, mutable: false, ownerId: null }],
  page: { limit: 100, nextCursor: null, hasMore: false },
  source: {
    id: ids.source,
    digest,
    items: [{ sourceIndex: 0, type: 'Epic', title: 'Order intake', description: '', acceptanceCriteria: ['Evidence recorded'] }],
  },
}, query);
assert.equal(queryResult.items[1].mutable, false);
assert.equal(queryResult.items[1].ownerId, null);
assert.throws(() => decodeLegacyDeliveryQueryResult({
  ...queryResult,
  items: [{ ...task, ownerId: null }],
}, query), LegacyDeliveryContractError);
assert.equal(queryResult.source?.items[0].sourceIndex, 0);
assert.throws(() => decodeLegacyDeliveryQueryResult({
  ...queryResult,
  source: { ...queryResult.source, digest: 'a'.repeat(64) },
}, query), LegacyDeliveryContractError);
assert.throws(() => decodeLegacyDeliveryQueryResult({
  ...queryResult,
  items: [{ ...task, mutable: false, version: 1 }],
}, query), LegacyDeliveryContractError);

console.log('legacy delivery contracts: exact authority, lineage, replay and historical projection checks passed');
