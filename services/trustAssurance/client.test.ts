import assert from 'node:assert/strict';
import { commandTrustAssurance, queryTrustAssurance } from './client';
import type { TrustCommandRequest } from './contracts';

declare global {
  var __trustConfigured: boolean;
  var __trustDataAccess: string;
  var __trustInvoke: (name: string, options: { body: Record<string, unknown> }) => Promise<{
    data: unknown;
    error: unknown;
    response?: Response;
  }>;
}

const organizationId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const resourceId = '44444444-4444-4444-8444-444444444444';
const scope = { organizationId, workspaceId, authorizationVersion: 2 };
const command: TrustCommandRequest = {
  requestId: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: 'transport-test',
  operation: 'snapshot.publish',
  organizationId,
  workspaceId,
  expectedAuthorizationVersion: 2,
  expectedVersion: 1,
  payload: { snapshotId: resourceId },
};
const internal = {
  mode: 'server_authoritative', organizationId, workspaceId, authorizationVersion: 2, readOnly: false,
  claims: [], evidence: [], relationships: [], reviewQueueCount: 0, snapshotHistory: [], currentPublication: null,
};

const httpError = (status: number, body: unknown) => {
  const context = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  return { data: null, error: { name: 'FunctionsHttpError', context }, response: context };
};

const main = async () => {
  globalThis.__trustConfigured = true;
  globalThis.__trustDataAccess = 'server';

  const invocations: { name: string; options: { body: Record<string, unknown> } }[] = [];
  globalThis.__trustInvoke = async (name, options) => {
    invocations.push({ name, options });
    return name === 'trust-assurance-query'
      ? { data: internal, error: null }
      : { data: { ok: true, replayed: false, resourceId, version: 2, body: {} }, error: null };
  };
  assert.deepEqual(await queryTrustAssurance(scope, 'internal'), internal);
  assert.deepEqual(await commandTrustAssurance(command), { ok: true, replayed: false, resourceId, version: 2, body: {} });
  assert.deepEqual(invocations.map(item => item.name), ['trust-assurance-query', 'trust-assurance-command']);
  assert.deepEqual(invocations[0].options, { body: { ...scope, view: 'internal' } });
  assert.deepEqual(invocations[1].options, { body: command });
  assert.equal('headers' in invocations[0].options, false, 'authentication is supplied only by the canonical Supabase client');
  assert.equal('authorization' in invocations[0].options.body, false, 'callers cannot inject authenticated identity');

  for (const [status, code] of [[400, 'VALIDATION_FAILED'], [403, 'ACCESS_DENIED'], [409, 'VERSION_CONFLICT'], [503, 'PERSISTENCE_UNAVAILABLE']] as const) {
    globalThis.__trustInvoke = async () => httpError(status, { ok: false, code, message: 'raw transport text must not escape' });
    const result = await commandTrustAssurance(command);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, code);
      assert.notEqual(result.message, 'raw transport text must not escape');
    }
  }

  globalThis.__trustInvoke = async () => httpError(409, { code: 'AUTHORIZATION_STALE', message: 'bounded' });
  await assert.rejects(queryTrustAssurance(scope, 'internal'), /AUTHORIZATION_STALE/);
  globalThis.__trustInvoke = async () => httpError(404, { code: 'NO_PUBLICATION', message: 'bounded' });
  assert.equal(await queryTrustAssurance(scope, 'buyer'), null);
  globalThis.__trustInvoke = async () => httpError(500, { message: 'unclassified' });
  await assert.rejects(queryTrustAssurance(scope, 'internal'), /PERSISTENCE_UNAVAILABLE/);

  globalThis.__trustInvoke = async () => ({ data: { ok: true, resourceId, version: 2 }, error: null });
  const malformed = await commandTrustAssurance(command);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.code, 'PERSISTENCE_UNAVAILABLE');

  globalThis.__trustConfigured = false;
  let invokedWithoutConfiguration = false;
  globalThis.__trustInvoke = async () => { invokedWithoutConfiguration = true; throw new Error('must not invoke'); };
  await assert.rejects(queryTrustAssurance(scope, 'internal'), /PERSISTENCE_UNAVAILABLE/);
  const unavailable = await commandTrustAssurance(command);
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.code, 'PERSISTENCE_UNAVAILABLE');
  assert.equal(invokedWithoutConfiguration, false);

  globalThis.__trustConfigured = true;
  globalThis.__trustDataAccess = 'local';
  await assert.rejects(queryTrustAssurance(scope, 'internal'), /PERSISTENCE_UNAVAILABLE/);
  assert.equal(invokedWithoutConfiguration, false);
  console.log('Trust Assurance authenticated client transport tests passed');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
