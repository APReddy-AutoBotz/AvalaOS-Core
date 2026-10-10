import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticatedControlsFixture } from './authenticatedControlsFixture.mjs';

const id = ordinal => `00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const scope = { organizationId: id(1), workspaceId: id(2), providerConfigId: id(26) };
const actors = {
  author: { token: 'admin-token', user: { id: id(10) } },
  reviewer: { token: 'reviewer-token', user: { id: id(11) } },
};
const request = (pathname, token, body) => new Request(`http://fixture.invalid${pathname}`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const pilotProjection = {
  truthClassification: 'configured_not_live_verified', liveActivationAuthorized: false,
  environment: { id: id(40), type: 'pilot_candidate', lifecycle: 'active_non_live', version: 1,
    maintenance: false, readOnly: true, disabledFeatures: [] },
  release: { id: null, gitSha: null, lifecycle: null, version: null }, promotedRelease: null,
  provider: null, health: { schemaCompatible: false, queueState: 'not_proven', reconciliationState: 'not_proven' },
  recovery: { backupState: 'not_run', restoreState: 'not_run' }, blockers: ['CANDIDATE_NOT_APPROVED'],
  liveStopGates: ['LIVE_ACTIVATION_NOT_AUTHORIZED','HOSTED_LIVE_NOT_PROVEN'],
  rollback: { eligible: false, reason: 'ROLLBACK_CURRENT_NOT_PROMOTED', targetCandidateId: null, targetVersion: null, targetLabel: null },
};
const fixture = ({ denyAdmin = false } = {}) => {
  const calls = [];
  const controls = createAuthenticatedControlsFixture({
    scope, actors,
    serviceQuery: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.includes('synthetic_admin_list') && denyAdmin) throw new Error('PR1B_NOT_FOUND');
      if (sql.includes('pilot_operations_projection')) return { rows: [{ value: pilotProjection }] };
      return { rows: [] };
    },
    actorQuery: async actorId => ({ rows: [{ value: {
      userId: actorId, organizationId: scope.organizationId, workspaceId: scope.workspaceId,
      authorizationVersion: 1,
      capabilities: actorId === actors.author.user.id
        ? ['admin.synthetic.users.manage','byok.manage','operations.read','org.admin','security.manage']
        : ['assess.read','studio.artifacts.read'],
    } }] }),
  });
  return { controls, calls };
};

test('provider lifecycle route delegates only after the PostgreSQL adapter is mounted', async () => {
  const { controls } = fixture();
  const body = { operation: 'provider.secret.bind', organizationId: scope.organizationId,
    workspaceId: scope.workspaceId, expectedAuthorizationVersion: 1,
    payload: { providerConfigId: id(50), providerKey: 'synthetic-key-123456' } };
  assert.equal((await controls.handle(request('/functions/v1/enterprise-provider-lifecycle', 'admin-token', body))).status, 503);
  let delegated = false;
  controls.mountPostgresAdapter({ observations: {}, handleRequest: async (_request, actorId) => {
    delegated = actorId === actors.author.user.id;
    return Response.json({ ok: true, status: 'pending_review', secretBound: true });
  } });
  const response = await controls.handle(request('/functions/v1/enterprise-provider-lifecycle', 'admin-token', body));
  assert.equal(response.status, 200);
  assert.equal(delegated, true);
  assert.equal(JSON.stringify(await response.json()).includes(body.payload.providerKey), false);
});

test('synthetic admin denial is derived from the database RPC signal', async () => {
  const { controls, calls } = fixture({ denyAdmin: true });
  const response = await controls.handle(request('/functions/v1/synthetic-admin', 'reviewer-token', {
    operation: 'list', organizationId: scope.organizationId, workspaceId: scope.workspaceId,
    expectedAuthorizationVersion: 1, payload: { limit: 20 },
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { errorCode: 'PERMISSION_DENIED' });
  assert.equal(calls.some(call => call.sql.includes('synthetic_admin_list')), true);
});

test('private download uses fresh authority and denies before storage', async () => {
  const { controls } = fixture();
  const response = await controls.handle(request('/functions/v1/studio-artifact-download', 'reviewer-token', {
    requestId: id(30), idempotencyKey: 'studio-download-denied-001',
    organizationId: scope.organizationId, workspaceId: scope.workspaceId,
    authorizationVersion: 1, renditionId: id(31),
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'PERMISSION_DENIED');
  const observed = controls.snapshot();
  assert.equal(observed.storageClaims, 0);
  assert.equal(observed.storageReads, 0);
});

test('read-only Enterprise Intelligence and Pilot Operations use database-backed projections', async () => {
  const { controls, calls } = fixture();
  const projection = await controls.handle(request('/functions/v1/enterprise-intelligence-query', 'admin-token', {
    organizationId: scope.organizationId, workspaceId: scope.workspaceId, expectedAuthorizationVersion: 1,
  }));
  assert.equal(projection.status, 200);
  assert.ok((await projection.json()).projection);
  const operations = await controls.handle(request('/functions/v1/pilot-operations-query', 'admin-token', {
    organizationId: scope.organizationId, workspaceId: scope.workspaceId, expectedAuthorizationVersion: 1,
  }));
  assert.equal(operations.status, 200);
  assert.equal(calls.some(call => call.sql.includes('pilot_operations_projection')), true);
  assert.equal(controls.snapshot().projectionLoads, 1);
});
