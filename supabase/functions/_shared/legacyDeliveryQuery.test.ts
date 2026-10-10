import assert from 'node:assert/strict';
import type { LegacyDeliveryQueryRequest, LegacyDeliveryTaskProjection } from '../../../services/legacyDelivery/contracts';
import { handleLegacyDeliveryQuery, type LegacyDeliveryQueryDependencies } from './legacyDeliveryQuery';
import type { TenantContext } from './tenantAuthority';

const ids = {
  actor: '11111111-1111-4111-8111-111111111111', org: '22222222-2222-4222-8222-222222222222',
  workspace: '33333333-3333-4333-8333-333333333333', project: '44444444-4444-4444-8444-444444444444',
  legacy: '55555555-5555-4555-8555-555555555555', source: '66666666-6666-4666-8666-666666666666',
};
const query: LegacyDeliveryQueryRequest = {
  schemaVersion: 'legacy-delivery-query.v1', organizationId: ids.org, workspaceId: ids.workspace, expectedAuthorizationVersion: 7,
  projectId: ids.project, limit: 100, cursor: null, sourceGenerationId: ids.source, includeRetained: true,
};
const context: TenantContext = { userId: ids.actor, organizationId: ids.org, workspaceId: ids.workspace, authorizationVersion: 7, capabilities: ['task.read'] };
const historical: LegacyDeliveryTaskProjection = {
  id: ids.legacy, version: null, mutable: false, projectId: ids.project, title: 'Historical task', description: '', status: 'Done', priority: 'Medium', type: 'Task',
  assigneeIds: [], dependencyIds: [], ownerId: ids.actor, reporterId: null, sourceLineage: null, sourceEpicIndex: null, sourceEpicTitle: null,
  retentionState: 'retained', retentionClass: 'lineage', retentionReason: 'Historical projection', deletionRequestedAt: null, deletionRequestedBy: null,
  createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
};
const result = { ok: true, schemaVersion: 'legacy-delivery-query.v1', projectId: ids.project, items: [historical],
  page: { limit: 100, nextCursor: null, hasMore: false },
  source: { id: ids.source, digest: `sha256:${'b'.repeat(64)}`, items: [{ sourceIndex: 0, type: 'Epic', title: 'Intake', description: '', acceptanceCriteria: [] }] } };
const request = (body: unknown) => new Request('https://example.test/legacy-delivery-query', { method: 'POST', body: JSON.stringify(body) });

const exercise = async (overrides: Partial<LegacyDeliveryQueryDependencies> = {}) => {
  let queryCalls = 0;
  let authorityCalls = 0;
  const dependencies: LegacyDeliveryQueryDependencies = {
    authenticate: overrides.authenticate ?? (async () => ({ id: ids.actor })),
    authority: async (...args) => {
      authorityCalls += 1;
      return overrides.authority ? overrides.authority(...args) : context;
    },
    query: async (...args) => {
      queryCalls += 1;
      return overrides.query ? overrides.query(...args) : result;
    },
  };
  const response = await handleLegacyDeliveryQuery(request(query), dependencies);
  return { response, body: await response.json() as Record<string, unknown>, queryCalls, authorityCalls };
};

const main = async () => {
  const allowed = await exercise();
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.queryCalls, 1);
  assert.equal(allowed.authorityCalls, 2);
  assert.equal((((allowed.body.items as unknown[])[0] as Record<string, unknown>).mutable), false);

  const denied = await exercise({ authority: async () => ({ ...context, capabilities: [] }) });
  assert.equal(denied.response.status, 404);
  assert.equal(denied.queryCalls, 0);

  const administrator = await exercise({ authority: async () => ({ ...context, capabilities: ['org.admin'] }) });
  assert.equal(administrator.response.status, 200);

  let checks = 0;
  const revoked = await exercise({ authority: async () => {
    checks += 1;
    return checks === 1 ? context : { ...context, organizationId: ids.workspace };
  } });
  assert.equal(revoked.response.status, 404);
  assert.equal(revoked.queryCalls, 1);

  const stale = await exercise({ query: async () => ({ ok: false, errorCode: 'AUTHORIZATION_STALE' }) });
  assert.equal(stale.response.status, 409);
  assert.equal((stale.body.error as { code: string }).code, 'AUTHORIZATION_STALE');

  const leakedMetadata = await exercise({ query: async () => ({ ...result, internal: { table: 'delivery_work_items' } }) });
  assert.equal(leakedMetadata.response.status, 503);
  assert.equal((leakedMetadata.body.error as { code: string }).code, 'PERSISTENCE_UNAVAILABLE');

  let invalidEffects = 0;
  const invalid = await handleLegacyDeliveryQuery(request({ ...query, limit: 101 }), {
    authenticate: async () => ({ id: ids.actor }), authority: async () => context,
    query: async () => { invalidEffects += 1; return result; },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalidEffects, 0);
  console.log('legacy delivery query handler: retained projection, current authority, safe errors and no-effects denial passed');
};

main().catch(error => { console.error(error); process.exitCode = 1; });
