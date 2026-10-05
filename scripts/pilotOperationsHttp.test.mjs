import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPilotOperationsHttpFixture,
  syntheticPilotOperationsCommandBody,
  syntheticPilotOperationsHttp,
  syntheticPilotOperationsQueryBody,
} from './pilotOperationsHttpFixture.mjs';

const endpoint = kind => `http://127.0.0.1/${kind}`;
const request = (kind, body, { method = 'POST', token = syntheticPilotOperationsHttp.bearerToken } = {}) => new Request(endpoint(kind), {
  method,
  headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : undefined,
  body: body === undefined ? undefined : JSON.stringify(body),
});
const assertCors = (response, { json = true } = {}) => {
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /authorization/);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  if (json) {
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
};

for (const kind of ['query', 'command']) {
  test(`${kind} actual entrypoint serves CORS preflight`, async () => {
    const fixture = createPilotOperationsHttpFixture({ kind });
    const response = await fixture.handler(request(kind, undefined, { method: 'OPTIONS', token: null }));
    assert.equal(response.status, 200);
    assertCors(response, { json: false });
    assert.equal(fixture.rpcCalls.length, 0);
  });

  test(`${kind} actual entrypoint keeps method denial CORS-readable and uncached`, async () => {
    const fixture = createPilotOperationsHttpFixture({ kind });
    const response = await fixture.handler(request(kind, undefined, { method: 'GET', token: null }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: 'ACCESS_DENIED' });
    assertCors(response);
    assert.equal(fixture.rpcCalls.length, 0);
  });
}

test('query success preserves actor, tenant scope and authorization version', async () => {
  const fixture = createPilotOperationsHttpFixture({ kind: 'query' });
  const response = await fixture.handler(request('query', syntheticPilotOperationsQueryBody()));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).release, null);
  assertCors(response);
  assert.equal(fixture.rpcCalls.length, 1);
  assert.deepEqual(fixture.authorityCalls, [{
    actor: syntheticPilotOperationsHttp.actorId,
    target: {
      organizationId: syntheticPilotOperationsHttp.organizationId,
      workspaceId: syntheticPilotOperationsHttp.workspaceId,
      expectedAuthorizationVersion: syntheticPilotOperationsHttp.authorizationVersion,
    },
  }]);
  assert.deepEqual(fixture.rpcCalls[0], {
    pathname: '/rest/v1/rpc/pilot_operations_projection',
    method: 'POST',
    body: {
      p_actor: syntheticPilotOperationsHttp.actorId,
      p_org: syntheticPilotOperationsHttp.organizationId,
      p_workspace: syntheticPilotOperationsHttp.workspaceId,
      p_authorization_version: syntheticPilotOperationsHttp.authorizationVersion,
    },
  });
});

test('query denies missing authentication before persistence', async () => {
  const fixture = createPilotOperationsHttpFixture({ kind: 'query' });
  const response = await fixture.handler(request('query', syntheticPilotOperationsQueryBody(), { token: null }));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'ACCESS_DENIED' });
  assertCors(response);
  assert.equal(fixture.rpcCalls.length, 0);
});

test('query denies missing operations.read before persistence', async () => {
  const fixture = createPilotOperationsHttpFixture({ kind: 'query', authority: {
    userId: syntheticPilotOperationsHttp.actorId,
    organizationId: syntheticPilotOperationsHttp.organizationId,
    workspaceId: syntheticPilotOperationsHttp.workspaceId,
    authorizationVersion: syntheticPilotOperationsHttp.authorizationVersion,
    capabilities: [],
  } });
  const response = await fixture.handler(request('query', syntheticPilotOperationsQueryBody()));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'ACCESS_DENIED' });
  assertCors(response);
  assert.equal(fixture.rpcCalls.length, 0);
});

test('query preserves stale-authority response and makes no persistence request', async () => {
  const fixture = createPilotOperationsHttpFixture({ kind: 'query', authorityError: 'AUTHORIZATION_STALE' });
  const response = await fixture.handler(request('query', syntheticPilotOperationsQueryBody()));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: 'AUTHORIZATION_STALE' });
  assertCors(response);
  assert.equal(fixture.rpcCalls.length, 0);
});

test('query keeps allowlisted persistence failures CORS-readable', async () => {
  const fixture = createPilotOperationsHttpFixture({
    kind: 'query',
    persistenceResponse: { status: 409, body: { message: 'VERSION_CONFLICT: synthetic detail' } },
  });
  const response = await fixture.handler(request('query', syntheticPilotOperationsQueryBody()));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: 'VERSION_CONFLICT' });
  assertCors(response);
});

test('query sanitizes unknown persistence failures', async () => {
  const fixture = createPilotOperationsHttpFixture({
    kind: 'query',
    persistenceResponse: { status: 500, body: { message: 'synthetic database detail must not escape' } },
  });
  const response = await fixture.handler(request('query', syntheticPilotOperationsQueryBody()));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'PERSISTENCE_UNAVAILABLE' });
  assertCors(response);
});

test('command success preserves scope, versions and canonical payload', async () => {
  const fixture = createPilotOperationsHttpFixture({ kind: 'command', featureEnabled: true });
  const command = syntheticPilotOperationsCommandBody();
  const response = await fixture.handler(request('command', command));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { receiptId: '00000000-0000-4000-8000-000000000006', aggregateVersion: 3, replayed: false });
  assertCors(response);
  assert.equal(fixture.rpcCalls.length, 1);
  const body = fixture.rpcCalls[0].body;
  assert.equal(body.p_actor, syntheticPilotOperationsHttp.actorId);
  assert.equal(body.p_org, syntheticPilotOperationsHttp.organizationId);
  assert.equal(body.p_workspace, syntheticPilotOperationsHttp.workspaceId);
  assert.equal(body.p_authorization_version, syntheticPilotOperationsHttp.authorizationVersion);
  assert.equal(body.p_expected_version, command.expectedVersion);
  assert.equal(body.p_idempotency_key, command.idempotencyKey);
  assert.equal(body.p_request_payload, JSON.stringify({
    operation: command.operation,
    organizationId: command.organizationId,
    workspaceId: command.workspaceId,
    expectedVersion: command.expectedVersion,
    payload: command.payload,
  }));
});

test('command feature gate returns CORS-readable denial before persistence', async () => {
  const fixture = createPilotOperationsHttpFixture({ kind: 'command', featureEnabled: false });
  const response = await fixture.handler(request('command', syntheticPilotOperationsCommandBody()));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'FEATURE_DISABLED' });
  assertCors(response);
  assert.equal(fixture.rpcCalls.length, 0);
});

test('command denies missing authentication before authority and persistence', async () => {
  const fixture = createPilotOperationsHttpFixture({ kind: 'command', featureEnabled: true });
  const response = await fixture.handler(request('command', syntheticPilotOperationsCommandBody(), { token: null }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'ACCESS_DENIED' });
  assertCors(response);
  assert.equal(fixture.authorityCalls.length, 0);
  assert.equal(fixture.rpcCalls.length, 0);
});
