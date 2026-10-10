import assert from 'node:assert/strict';
import type { LegacyDeliveryCommandEnvelope, LegacyDeliveryTaskProjection } from '../../../services/legacyDelivery/contracts';
import { handleLegacyDeliveryCommand, type LegacyDeliveryCommandDependencies } from './legacyDeliveryCommand';
import type { TenantContext } from './tenantAuthority';

const ids = {
  actor: '11111111-1111-4111-8111-111111111111', org: '22222222-2222-4222-8222-222222222222',
  workspace: '33333333-3333-4333-8333-333333333333', project: '44444444-4444-4444-8444-444444444444',
  request: '55555555-5555-4555-8555-555555555555', task: '66666666-6666-4666-8666-666666666666',
};
const command: LegacyDeliveryCommandEnvelope<'task.create'> = {
  schemaVersion: 'legacy-delivery-command.v1', action: 'task.create', organizationId: ids.org, workspaceId: ids.workspace,
  expectedAuthorizationVersion: 7, requestId: ids.request, idempotencyKey: 'legacy-delivery.create.handler-1',
  payload: { projectId: ids.project, task: { title: 'Confirm intake', description: '', priority: 'High', type: 'Task', assigneeIds: [], dependencyIds: [] } },
};
const context: TenantContext = { userId: ids.actor, organizationId: ids.org, workspaceId: ids.workspace, authorizationVersion: 7, capabilities: ['task.create'] };
const task: LegacyDeliveryTaskProjection = {
  id: ids.task, version: 1, mutable: true, projectId: ids.project, title: 'Confirm intake', description: '', status: 'To Do', priority: 'High', type: 'Task',
  assigneeIds: [], dependencyIds: [], ownerId: ids.actor, reporterId: ids.actor, sourceLineage: null, sourceEpicIndex: null, sourceEpicTitle: null,
  retentionState: 'active', retentionClass: 'none', retentionReason: null, deletionRequestedAt: null, deletionRequestedBy: null,
  createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
};
const success = { ok: true, schemaVersion: 'legacy-delivery-command.v1', action: 'task.create', resource: task };
const request = (body: unknown) => new Request('https://example.test/legacy-delivery-command', { method: 'POST', body: JSON.stringify(body) });

const exercise = async (overrides: Partial<LegacyDeliveryCommandDependencies> = {}) => {
  let applyCalls = 0;
  let authorityCalls = 0;
  const dependencies: LegacyDeliveryCommandDependencies = {
    authenticate: overrides.authenticate ?? (async () => ({ id: ids.actor })),
    authority: async (...args) => {
      authorityCalls += 1;
      return overrides.authority ? overrides.authority(...args) : context;
    },
    apply: async (...args) => {
      applyCalls += 1;
      return overrides.apply ? overrides.apply(...args) : success;
    },
  };
  const response = await handleLegacyDeliveryCommand(request(command), dependencies);
  return { response, body: await response.json() as Record<string, unknown>, applyCalls, authorityCalls };
};

const main = async () => {
  const committed = await exercise();
  assert.equal(committed.response.status, 200);
  assert.equal(committed.applyCalls, 1);
  assert.equal(committed.authorityCalls, 2, 'success and replay both require authority after the transaction');

  const unauthenticated = await exercise({ authenticate: async () => { throw new Error('session'); } });
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.applyCalls, 0);

  const crossTenant = await exercise({ authority: async () => ({ ...context, workspaceId: ids.project }) });
  assert.equal(crossTenant.response.status, 404);
  assert.equal(crossTenant.applyCalls, 0);

  const denied = await exercise({ authority: async () => ({ ...context, capabilities: ['task.read'] }) });
  assert.equal(denied.response.status, 404);
  assert.equal(denied.applyCalls, 0);

  const administrator = await exercise({ authority: async () => ({ ...context, capabilities: ['security.manage'] }) });
  assert.equal(administrator.response.status, 200);
  const legacyCreator = await exercise({ authority: async () => ({ ...context, capabilities: ['backlog.manage'] }) });
  assert.equal(legacyCreator.response.status, 200);

  let authorityCalls = 0;
  const revokedAfterCommit = await exercise({ authority: async () => {
    authorityCalls += 1;
    return authorityCalls === 1 ? context : { ...context, capabilities: [] };
  } });
  assert.equal(revokedAfterCommit.response.status, 404);
  assert.equal(revokedAfterCommit.applyCalls, 1);
  assert.equal((revokedAfterCommit.body.error as { code: string }).code, 'RESOURCE_UNAVAILABLE');

  const conflict = await exercise({ apply: async () => ({ ok: false, errorCode: 'VERSION_CONFLICT' }) });
  assert.equal(conflict.response.status, 409);
  assert.equal((conflict.body.error as { code: string }).code, 'VERSION_CONFLICT');

  const malformedPersistence = await exercise({ apply: async () => ({ ...success, resource: { ...task, internalMetadata: 'must not cross boundary' } }) });
  assert.equal(malformedPersistence.response.status, 503);
  assert.equal((malformedPersistence.body.error as { code: string }).code, 'PERSISTENCE_UNAVAILABLE');

  let invalidEffects = 0;
  const invalid = await handleLegacyDeliveryCommand(request({ ...command, actorId: ids.actor }), {
    authenticate: async () => ({ id: ids.actor }), authority: async () => context,
    apply: async () => { invalidEffects += 1; return success; },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalidEffects, 0);
  assert.equal(invalid.headers.get('Cache-Control'), 'no-store');
  assert.equal(invalid.headers.get('Access-Control-Allow-Origin'), '*');
  console.log('legacy delivery command handler: authorization, no-effects denial, replay reauthorization and safe errors passed');
};

main().catch(error => { console.error(error); process.exitCode = 1; });
