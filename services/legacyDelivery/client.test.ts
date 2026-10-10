import assert from 'node:assert/strict';
import {
  LegacyDeliveryBoundaryError,
  buildLegacyDeliveryCommand,
  executeLegacyDeliveryCommand,
  getPendingLegacyDeliveryCommand,
  queryLegacyDelivery,
  retryPendingLegacyDeliveryCommand,
  type LegacyDeliveryScope,
  type LegacyDeliveryTransport,
} from './client';
import type { LegacyDeliveryCommandEnvelope, LegacyDeliveryTaskProjection } from './contracts';

const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  otherActor: '12111111-1111-4111-8111-111111111111',
  org: '22222222-2222-4222-8222-222222222222',
  workspace: '33333333-3333-4333-8333-333333333333',
  project: '44444444-4444-4444-8444-444444444444',
  request: '55555555-5555-4555-8555-555555555555',
  task: '66666666-6666-4666-8666-666666666666',
  source: '77777777-7777-4777-8777-777777777777',
};
const scope: LegacyDeliveryScope = { actorId: ids.actor, organizationId: ids.org, workspaceId: ids.workspace, authorizationVersion: 7 };
const createPayload = {
  projectId: ids.project,
  task: { title: 'Confirm intake', description: '', priority: 'High' as const, type: 'Task' as const, assigneeIds: [], dependencyIds: [] },
};
const task: LegacyDeliveryTaskProjection = {
  id: ids.task, version: 1, mutable: true, projectId: ids.project, title: 'Confirm intake', description: '', status: 'To Do',
  priority: 'High', type: 'Task', assigneeIds: [], dependencyIds: [], ownerId: ids.actor, reporterId: ids.actor,
  sourceLineage: null, sourceEpicIndex: null, sourceEpicTitle: null, retentionState: 'active', retentionClass: 'none',
  retentionReason: null, deletionRequestedAt: null, deletionRequestedBy: null,
  createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
};
const success = (command: LegacyDeliveryCommandEnvelope) => ({
  ok: true, schemaVersion: 'legacy-delivery-command.v1', action: command.action, resource: task,
});
const failingTransport = (code: LegacyDeliveryBoundaryError['code'], seen: LegacyDeliveryCommandEnvelope[]): LegacyDeliveryTransport => ({
  query: async () => null,
  command: async command => { seen.push(structuredClone(command)); throw new LegacyDeliveryBoundaryError(code); },
});

const main = async () => {
  const queried: unknown[] = [];
  const queryTransport: LegacyDeliveryTransport = {
    command: async () => null,
    query: async request => {
      queried.push(structuredClone(request));
      return { ok: true, schemaVersion: 'legacy-delivery-query.v1', projectId: ids.project, items: [task],
        page: { limit: 100, nextCursor: null, hasMore: false },
        source: { id: ids.source, digest: `sha256:${'a'.repeat(64)}`, items: [] } };
    },
  };
  const query = await queryLegacyDelivery(scope, { projectId: ids.project, sourceGenerationId: ids.source }, queryTransport);
  assert.equal(query.items[0].id, ids.task);
  assert.equal((queried[0] as { includeRetained: boolean }).includeRetained, true);

  const seen: LegacyDeliveryCommandEnvelope[] = [];
  let calls = 0;
  const responseLossThenReplay: LegacyDeliveryTransport = {
    query: async () => null,
    command: async command => {
      seen.push(structuredClone(command));
      calls += 1;
      if (calls === 1) throw new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
      return success(command);
    },
  };
  const committed = await executeLegacyDeliveryCommand(scope, 'task.create', createPayload,
    { requestId: ids.request, idempotencyKey: 'legacy-delivery.create.response-loss' }, responseLossThenReplay);
  assert.equal((committed.resource as LegacyDeliveryTaskProjection).id, ids.task);
  assert.deepEqual(seen[0], seen[1], 'an immediate response-loss retry must preserve the exact envelope');

  const uncertainSeen: LegacyDeliveryCommandEnvelope[] = [];
  let pendingKey = '';
  await assert.rejects(
    executeLegacyDeliveryCommand(scope, 'task.create', createPayload,
      { requestId: ids.request, idempotencyKey: 'legacy-delivery.create.pending' }, failingTransport('PERSISTENCE_UNAVAILABLE', uncertainSeen)),
    (error: unknown) => {
      assert.ok(error instanceof LegacyDeliveryBoundaryError);
      assert.equal(error.code, 'PERSISTENCE_UNAVAILABLE');
      assert.ok(error.pendingKey?.startsWith(`${ids.actor}:`));
      pendingKey = error.pendingKey ?? '';
      return true;
    },
  );
  assert.equal(uncertainSeen.length, 2);
  assert.deepEqual(uncertainSeen[0], uncertainSeen[1]);
  assert.deepEqual(getPendingLegacyDeliveryCommand(scope, pendingKey), uncertainSeen[0]);
  assert.equal(getPendingLegacyDeliveryCommand({ ...scope, actorId: ids.otherActor }, pendingKey), null,
    'a different signed-in actor cannot inspect another actor pending command');
  assert.equal(getPendingLegacyDeliveryCommand({ ...scope, workspaceId: ids.project }, pendingKey), null,
    'a workspace switch cannot expose a pending command payload');

  const laterSeen: LegacyDeliveryCommandEnvelope[] = [];
  const replayTransport: LegacyDeliveryTransport = {
    query: async () => null,
    command: async command => { laterSeen.push(structuredClone(command)); return success(command); },
  };
  await assert.rejects(executeLegacyDeliveryCommand({ ...scope, authorizationVersion: 8 }, 'task.create',
    { ...createPayload, task: { ...createPayload.task, title: 'A new click must not replace uncertain work' } },
    { requestId: '88888888-8888-4888-8888-888888888888', idempotencyKey: 'legacy-delivery.create.fresh-must-wait' }, replayTransport),
  (error: unknown) => error instanceof LegacyDeliveryBoundaryError && error.code === 'COMMAND_IN_PROGRESS' && error.pendingKey === pendingKey);
  assert.equal(laterSeen.length, 0, 'new user intent must not be reported as the retained command success');
  await retryPendingLegacyDeliveryCommand({ ...scope, authorizationVersion: 8 }, pendingKey, replayTransport);
  const { expectedAuthorizationVersion: oldVersion, ...oldIdentityAndIntent } = uncertainSeen[0];
  const { expectedAuthorizationVersion: refreshedVersion, ...refreshedIdentityAndIntent } = laterSeen[0];
  assert.equal(oldVersion, 7);
  assert.equal(refreshedVersion, 8);
  assert.deepEqual(refreshedIdentityAndIntent, oldIdentityAndIntent,
    'explicit reconciliation may refresh only the authorization fence and must preserve request identity and payload');

  const actorSeen: LegacyDeliveryCommandEnvelope[] = [];
  await executeLegacyDeliveryCommand({ ...scope, actorId: ids.otherActor }, 'task.create', createPayload,
    { requestId: '99999999-9999-4999-8999-999999999999', idempotencyKey: 'legacy-delivery.create.other-actor' }, {
      query: async () => null,
      command: async command => { actorSeen.push(structuredClone(command)); return success(command); },
    });
  assert.equal(actorSeen[0].requestId, '99999999-9999-4999-8999-999999999999');

  const conflictSeen: LegacyDeliveryCommandEnvelope[] = [];
  await assert.rejects(executeLegacyDeliveryCommand(scope, 'task.create', createPayload,
    { requestId: ids.request, idempotencyKey: 'legacy-delivery.create.conflict' }, failingTransport('VERSION_CONFLICT', conflictSeen)),
  (error: unknown) => error instanceof LegacyDeliveryBoundaryError && error.code === 'VERSION_CONFLICT' && error.pendingKey === undefined);

  await assert.rejects(retryPendingLegacyDeliveryCommand(scope, 'missing'),
    (error: unknown) => error instanceof LegacyDeliveryBoundaryError && error.code === 'INVALID_COMMAND');
  console.log('legacy delivery client: exact retries, retained reconciliation, actor isolation and definitive errors passed');
};

main().catch(error => { console.error(error); process.exitCode = 1; });
