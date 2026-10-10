import assert from 'node:assert/strict';
import {
  StudioDeliveryBoundaryError,
  buildStudioDeliveryCommand,
  buildStudioDeliveryOutcomeQuery,
  executeStudioDeliveryCommand,
  queryStudioDeliveryOutcomes,
  queryStudioDeliveryAssignees,
  retryStudioDeliveryCommand,
  type StudioDeliveryScope,
  type StudioDeliveryTransport,
} from './client';

const id = (n: number) => `ab000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope: StudioDeliveryScope = { actorId: id(1), organizationId: id(2).toUpperCase(), workspaceId: id(3).toUpperCase(), authorizationVersion: 7 };
const payload = { artifactId: id(4), expectedArtifactVersionId: id(5), expectedAggregateVersion: 5, projectId: id(6),
  workItems: [{ type: 'Task' as const, title: 'Human-authored task', description: 'Exact structured payload.', acceptanceCriteria: ['Bound to approved source'] }] };
const success = (command: ReturnType<typeof buildStudioDeliveryCommand>) => ({ ok: true, schemaVersion: 'studio-delivery-command.v1', action: command.action,
  outcome: 'committed', receiptId: id(7), resource: { publicationId: id(8), documentGenerationId: id(9), projectId: id(6), artifactId: id(4),
    artifactVersionId: id(5), artifactVersion: 1, artifactContentHash: 'a'.repeat(64), sourceProcessId: id(10), sourceAssessmentId: id(11),
    governResolutionId: id(12), workItemCount: 1, workItemDigest: `sha256:${'b'.repeat(64)}`, publishedAt: '2026-10-10T00:00:00.000Z' } });

async function main() {
  const identity = { requestId: id(20), idempotencyKey: 'studio-delivery.client-retry' };
  let calls = 0;
  const retryTransport: StudioDeliveryTransport = {
    async command(command) { calls += 1; if (calls === 1) throw new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE'); return success(command); },
    async query() { throw new Error('not used'); },
  };
  let pendingKey = '';
  await assert.rejects(
    () => executeStudioDeliveryCommand(scope, 'studio.approved-artifact.publish', payload, identity, retryTransport),
    error => { pendingKey = (error as StudioDeliveryBoundaryError).pendingKey ?? ''; return error instanceof StudioDeliveryBoundaryError && error.code === 'PERSISTENCE_UNAVAILABLE' && Boolean(pendingKey); },
  );
  const replayed = await retryStudioDeliveryCommand({ ...scope, authorizationVersion: 8 }, pendingKey, retryTransport);
  assert.equal(replayed.action, 'studio.approved-artifact.publish');
  assert.ok('artifactVersionId' in replayed.resource); assert.equal(replayed.resource.artifactVersionId, id(5)); assert.equal(calls, 2);

  const queryRequest = buildStudioDeliveryOutcomeQuery(scope, { projectId: id(6), limit: 25 });
  assert.equal(queryRequest.organizationId, id(2)); assert.equal(queryRequest.workspaceId, id(3));
  const outcome = { outcomeId: id(30), version: 2, taskId: id(31), taskVersion: 3, projectId: id(6), status: 'partial', label: 'Partial result',
    detail: 'Human-recorded bounded outcome.', documentGenerationId: id(9), studioArtifactId: id(4), studioArtifactVersionId: id(5),
    recordedBy: id(1), recordedAt: '2026-10-10T00:01:00.000Z' };
  const queryTransport: StudioDeliveryTransport = { async command() { throw new Error('not used'); }, async query(request) { return { ok: true,
    schemaVersion: 'studio-delivery-outcome-query.v1', projectId: request.projectId, items: [outcome], page: { limit: request.limit, nextCursor: null, hasMore: false } }; } };
  const projection = await queryStudioDeliveryOutcomes(scope, { projectId: id(6), limit: 25 }, queryTransport);
  assert.equal(projection.items[0].taskId, id(31)); assert.equal(projection.page.hasMore, false);

  const assignees = await queryStudioDeliveryAssignees(scope, id(6), { ...queryTransport,
    async assigneeQuery(request) { return { ok: true, schemaVersion: request.schemaVersion, projectId: request.projectId,
      items: [{ id: id(32), displayName: 'Eligible reviewer' }] }; } });
  assert.deepEqual(assignees.items, [{ id: id(32), displayName: 'Eligible reviewer' }]);

  console.log('studio delivery client: retained exact identity, refreshed authority, normalized scope and bounded read-only query decoding passed');
}

void main();
