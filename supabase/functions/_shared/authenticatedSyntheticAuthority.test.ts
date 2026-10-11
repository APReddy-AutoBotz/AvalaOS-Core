import assert from 'node:assert/strict';
import {
  authenticatedSyntheticPayloadHash,
  authenticatedSyntheticRequestBinding,
  consumeAuthenticatedSyntheticProcessFault,
  consumeAuthenticatedSyntheticStudioPermit,
  resolveAuthenticatedSyntheticStudioTransport,
} from './authenticatedSyntheticAuthority.ts';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const PERMIT = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const token = (payload: Record<string, unknown>) => `e30.${btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`;
const request = (payload = { sub: ACTOR, session_id: SESSION }) => new Request('https://example.invalid', { headers: { Authorization: `Bearer ${token(payload)}` } });

const main = async () => {
  assert.equal(await authenticatedSyntheticPayloadHash({ b: 2, a: [true, 'x'] }), await authenticatedSyntheticPayloadHash({ a: [true, 'x'], b: 2 }));
  const ordinalCanonical = '{"A":{"B":3,"b":2},"a":4,"z":1}';
  const ordinalDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ordinalCanonical));
  const ordinalHash = Array.from(new Uint8Array(ordinalDigest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(await authenticatedSyntheticPayloadHash({ z: 1, a: 4, A: { b: 2, B: 3 } }), ordinalHash);
  const binding = await authenticatedSyntheticRequestBinding(request(), ACTOR, { x: 1 });
  assert.equal(binding.sessionId, SESSION);
  assert.equal(binding.payloadHash.length, 64);
  await assert.rejects(() => authenticatedSyntheticRequestBinding(request({ sub: crypto.randomUUID(), session_id: SESSION }), ACTOR, {}));

  const body = { commandType: 'studio.generation.request' };
  const command = {
    actorId: ACTOR, organizationId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), requestId: REQUEST,
    idempotencyKey: 'studio-test-0001', authorizationVersion: 3, expectedAggregateVersion: 7,
    contractVersion: 'studio-artifact-2', commandType: 'studio.generation.request', payload: {},
  } as never;
  let args: Record<string, unknown> = {};
  const resolved = await resolveAuthenticatedSyntheticStudioTransport(request(), body, command, async <T>(_name: string, input: Record<string, unknown>) => {
    args = input; return { active: true, permitId: PERMIT, kind: 'studio_deterministic_success' } as T;
  });
  assert.equal(resolved?.permitId, PERMIT);
  assert.equal(args.p_session_id, SESSION);
  assert.ok(!('output' in (resolved ?? {})));
  await assert.rejects(() => resolveAuthenticatedSyntheticStudioTransport(request(), body, command,
    async <T>() => ({ active: true, permitId: PERMIT, kind: 'studio_deterministic_success', output: {} }) as T));
  const ordinary = await resolveAuthenticatedSyntheticStudioTransport(
    new Request('https://example.invalid', { headers: { Authorization: 'Bearer connected-fixture-token' } }),
    body, command, async <T>(_name, input) => {
      assert.equal(input.p_session_id, null);
      return { active: false } as T;
    },
  );
  assert.equal(ordinary, null);

  const common = { permitId: PERMIT, actorId: ACTOR, organizationId: crypto.randomUUID(), workspaceId: crypto.randomUUID(),
    sessionId: SESSION, requestId: REQUEST, payloadHash: 'a'.repeat(64), expectedVersion: 2,
    attemptId: crypto.randomUUID(), executionToken: crypto.randomUUID(), executionFence: 1 };
  const success = await consumeAuthenticatedSyntheticStudioPermit(common,
    async <T>() => ({ consumed: true, kind: 'studio_deterministic_success' }) as T);
  assert.equal(success.kind, 'studio_deterministic_success');
  await assert.rejects(() => consumeAuthenticatedSyntheticStudioPermit(common,
    async <T>() => ({ consumed: true, kind: 'studio_deterministic_success', output: { caller: 'forbidden' } }) as T));
  const failure = await consumeAuthenticatedSyntheticStudioPermit(common,
    async <T>() => ({ consumed: true, kind: 'studio_failure_after_claim' }) as T);
  assert.equal(failure.kind, 'studio_failure_after_claim');
  const consumed = await consumeAuthenticatedSyntheticProcessFault({ request: request(), body: {}, actorId: ACTOR,
    organizationId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), commandType: 'process.update',
    requestId: REQUEST, expectedVersion: 1 }, async <T>() => ({ consumed: true }) as T);
  assert.equal(consumed, true);
  const ordinaryProcess = await consumeAuthenticatedSyntheticProcessFault({
    request: new Request('https://example.invalid', { headers: { Authorization: 'Bearer connected-fixture-token' } }),
    body: {}, actorId: ACTOR, organizationId: crypto.randomUUID(), workspaceId: crypto.randomUUID(),
    commandType: 'process.update', requestId: REQUEST, expectedVersion: 1,
  }, async <T>(_name, input) => {
    assert.equal(input.p_session_id, null);
    return { consumed: false } as T;
  });
  assert.equal(ordinaryProcess, false);
  console.log('authenticated synthetic authority: exact binding and response validation passed');
};
main().catch(error => { console.error(error); process.exitCode = 1; });
