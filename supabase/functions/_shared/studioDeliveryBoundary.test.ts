import assert from 'node:assert/strict';
import type { StudioDeliveryAssigneeQueryRequest, StudioDeliveryCommandEnvelope, StudioDeliveryOutcomeQueryRequest } from '../../../services/productAcceptanceBridge/contracts';
import { handleStudioDeliveryCommand, type StudioDeliveryCommandDependencies } from './studioDeliveryCommand';
import { handleStudioDeliveryOutcomeQuery, type StudioDeliveryOutcomeQueryDependencies } from './studioDeliveryOutcomeQuery';
import type { TenantContext } from './tenantAuthority';

const U = Array.from({ length: 16 }, (_, index) => `${String(index + 1).padStart(8, '0')}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const command: StudioDeliveryCommandEnvelope<'studio.approved-artifact.publish'> = {
  schemaVersion: 'studio-delivery-command.v1', action: 'studio.approved-artifact.publish', organizationId: U[0], workspaceId: U[1],
  expectedAuthorizationVersion: 7, requestId: U[2], idempotencyKey: 'studio-delivery.publish.handler-1', payload: {
    artifactId: U[3], expectedArtifactVersionId: U[4], expectedAggregateVersion: 5, projectId: U[5],
    workItems: [{ type: 'Task', title: 'Verify authority', description: '', acceptanceCriteria: [] }],
  },
};
const context: TenantContext = { userId: U[6], organizationId: U[0], workspaceId: U[1], authorizationVersion: 7, capabilities: ['studio.artifacts.publish'] };
const success = { ok: true, schemaVersion: command.schemaVersion, action: command.action, outcome: 'committed', receiptId: U[7], resource: {
  publicationId: U[8], documentGenerationId: U[9], projectId: U[5], artifactId: U[3], artifactVersionId: U[4], artifactVersion: 3,
  artifactContentHash: 'a'.repeat(64), sourceProcessId: U[10], sourceAssessmentId: U[11], governResolutionId: U[12], workItemCount: 1,
  workItemDigest: `sha256:${'b'.repeat(64)}`, publishedAt: '2026-10-10T05:11:00Z',
} };
const request = (body: unknown, target = 'command') => new Request(`https://example.test/${target}`, { method: 'POST', body: JSON.stringify(body) });
const commandExercise = async (overrides: Partial<StudioDeliveryCommandDependencies> = {}) => {
  let effects = 0; let checks = 0;
  const dependencies: StudioDeliveryCommandDependencies = { authenticate: overrides.authenticate ?? (async () => ({ id: U[6] })),
    authority: async (...args) => { checks += 1; return overrides.authority ? overrides.authority(...args) : context; },
    apply: async (...args) => { effects += 1; return overrides.apply ? overrides.apply(...args) : success; } };
  const response = await handleStudioDeliveryCommand(request(command), dependencies);
  return { response, body: await response.json() as Record<string, unknown>, effects, checks };
};
const main = async () => {
  const allowed = await commandExercise();
  assert.equal(allowed.response.status, 200); assert.equal(allowed.effects, 1); assert.equal(allowed.checks, 2);
  const denied = await commandExercise({ authority: async () => ({ ...context, capabilities: ['studio.artifacts.read'] }) });
  assert.equal(denied.response.status, 404); assert.equal(denied.effects, 0);
  let sequence = 0;
  const revoked = await commandExercise({ authority: async () => (++sequence === 1 ? context : { ...context, capabilities: [] }) });
  assert.equal(revoked.response.status, 404); assert.equal(revoked.effects, 1);
  const conflict = await commandExercise({ apply: async () => ({ ok: false, errorCode: 'VERSION_CONFLICT' }) });
  assert.equal(conflict.response.status, 409);

  const query: StudioDeliveryOutcomeQueryRequest = { schemaVersion: 'studio-delivery-outcome-query.v1', organizationId: U[0], workspaceId: U[1],
    expectedAuthorizationVersion: 7, projectId: U[5], limit: 50, cursor: null };
  const queryContext: TenantContext = { ...context, capabilities: ['delivery.outcomes.read'] };
  const queryResult = { ok: true, schemaVersion: query.schemaVersion, projectId: U[5], items: [], page: { limit: 50, nextCursor: null, hasMore: false } };
  let queryEffects = 0; let queryChecks = 0;
  const queryDependencies: StudioDeliveryOutcomeQueryDependencies = { authenticate: async () => ({ id: U[6] }), authority: async () => { queryChecks += 1; return queryContext; },
    query: async () => { queryEffects += 1; return queryResult; }, packQuery: async () => { throw new Error('unexpected pack query'); },
    assigneeQuery: async () => { throw new Error('unexpected assignee query'); } };
  const read = await handleStudioDeliveryOutcomeQuery(request(query, 'query'), queryDependencies);
  assert.equal(read.status, 200); assert.equal(queryEffects, 1); assert.equal(queryChecks, 2);
  const foreign = await handleStudioDeliveryOutcomeQuery(request(query, 'query'), { ...queryDependencies,
    authority: async () => ({ ...queryContext, workspaceId: U[5] }), query: async () => { throw new Error('must not run'); } });
  assert.equal(foreign.status, 404);
  const assigneeQuery: StudioDeliveryAssigneeQueryRequest = { schemaVersion: 'studio-delivery-assignee-query.v1', organizationId: U[0],
    workspaceId: U[1], expectedAuthorizationVersion: 7, projectId: U[5] };
  const assigneeResult = { ok: true, schemaVersion: assigneeQuery.schemaVersion, projectId: U[5], items: [{ id: U[4], displayName: 'Eligible member' }] };
  let assigneeEffects = 0; let assigneeChecks = 0;
  const assigneeDependencies: StudioDeliveryOutcomeQueryDependencies = { ...queryDependencies,
    authority: async () => { assigneeChecks += 1; return { ...context, capabilities: ['task.assign'] }; },
    assigneeQuery: async () => { assigneeEffects += 1; return assigneeResult; } };
  const assigneeRead = await handleStudioDeliveryOutcomeQuery(request(assigneeQuery, 'query'), assigneeDependencies);
  assert.equal(assigneeRead.status, 200); assert.equal(assigneeEffects, 1); assert.equal(assigneeChecks, 2);
  const assigneeDenied = await handleStudioDeliveryOutcomeQuery(request(assigneeQuery, 'query'), { ...assigneeDependencies,
    authority: async () => ({ ...context, capabilities: ['task.update.own'] }), assigneeQuery: async () => { throw new Error('must not run'); } });
  assert.equal(assigneeDenied.status, 404);
  console.log('studio delivery handlers: current authority, no-effect denial and scoped read-only assignee/outcome queries passed');
};
main().catch(error => { console.error(error); process.exitCode = 1; });
