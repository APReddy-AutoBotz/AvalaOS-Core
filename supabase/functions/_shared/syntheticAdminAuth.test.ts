import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmsSyntheticAuthBan, createSyntheticAdminAuthAdapter,
  matchesSyntheticAuthUser } from './syntheticAdminAuth.ts';
import { SyntheticAdminError } from '../../../services/syntheticAdminContract.ts';

const reservationId = '44444444-4444-4444-8444-444444444444';
const authUserId = '55555555-5555-4555-8555-555555555555';
const fingerprint = `sha256:${'a'.repeat(64)}`;
const email = `synthetic-${reservationId}@avalaos.invalid`;
const user = { id: authUserId, email, app_metadata: {
  synthetic_admin_reservation_id: reservationId, synthetic_admin_target: fingerprint,
} };
const input = { authUserId, syntheticEmail: email, reservationId, targetFingerprint: fingerprint,
  password: 'Local-only-password-123' };
const expectedError = (error: unknown) => error instanceof SyntheticAdminError
  && error.errorCode === 'RECONCILIATION_REQUIRED';
const adapter = (fetcher: typeof fetch, timeoutMs = 100) => createSyntheticAdminAuthAdapter({
  url: 'https://dedicated-synthetic.invalid', serviceRoleKey: 'mock-server-only', fetcher, timeoutMs,
});

test('Auth create sends one exact reserved UUID/metadata body and accepts exact owned response', async () => {
  let effects = 0;
  const client = adapter(async (url, init) => {
    effects++;
    assert.equal(url, 'https://dedicated-synthetic.invalid/auth/v1/admin/users');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.id, authUserId);
    assert.equal(body.email, email);
    assert.equal(body.password, input.password);
    assert.deepEqual(body.app_metadata, user.app_metadata);
    return Response.json({ user });
  });
  const observed = await client.createUser(input);
  assert.equal(effects, 1);
  assert.equal(matchesSyntheticAuthUser(observed, input), true);
  assert.equal(matchesSyntheticAuthUser({ ...user, id: reservationId }, input), false);
});

test('uncertain lookup uses only getUserById with exact reserved UUID', async () => {
  let effects = 0;
  const client = adapter(async (url, init) => {
    effects++;
    assert.equal(url, `https://dedicated-synthetic.invalid/auth/v1/admin/users/${authUserId}`);
    assert.equal(init?.method, 'GET');
    return new Response('', { status: 404 });
  });
  assert.equal(await client.getUserById(authUserId), null);
  assert.equal(effects, 1);
});

test('Auth adapter aborts a hanging effect within its fixed deadline', async () => {
  let aborted = false;
  const client = adapter(async (_url, init) => new Promise<Response>(() => {
    init?.signal?.addEventListener('abort', () => { aborted = true; });
  }), 20);
  await assert.rejects(client.createUser(input), expectedError);
  assert.equal(aborted, true);
});

test('Auth adapter rejects oversized declared and streamed responses without decoding them', async () => {
  const declared = adapter(async () => new Response('not-needed', {
    headers: { 'Content-Length': '32769' },
  }));
  await assert.rejects(declared.getUserById(authUserId), expectedError);
  const streamed = adapter(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(32769)); controller.close(); },
  }), { headers: { 'Content-Length': '1' } }));
  await assert.rejects(streamed.getUserById(authUserId), expectedError);
});

test('Auth adapter deadline covers a response stream that stops mid-body', async () => {
  const stalled = adapter(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"user":')); },
  })), 20);
  await assert.rejects(stalled.getUserById(authUserId), expectedError);
});

test('ban confirmation needs exact UUID and an actual future banned_until', () => {
  const future = new Date(Date.now() + 60000).toISOString();
  assert.equal(confirmsSyntheticAuthBan({ ...user, banned_until: future }, authUserId), true);
  assert.equal(confirmsSyntheticAuthBan({ ...user, banned_until: future }, reservationId), false);
  assert.equal(confirmsSyntheticAuthBan({ ...user, banned_until: new Date(Date.now() - 1000).toISOString() }, authUserId), false);
  assert.equal(confirmsSyntheticAuthBan(user, authUserId), false);
});
