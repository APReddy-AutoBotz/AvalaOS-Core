import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleSyntheticAdminRequest } from './syntheticAdminEndpoint.ts';

const actor = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const workspace = '33333333-3333-4333-8333-333333333333';
const reservation = '44444444-4444-4444-8444-444444444444';
const authId = '55555555-5555-4555-8555-555555555555';
const banClaimId = '66666666-6666-4666-8666-666666666666';
const fingerprint = `sha256:${'a'.repeat(64)}`;
const syntheticEmail = `synthetic-${reservation}@avalaos.invalid`;
const base = { organizationId: org, workspaceId: workspace, expectedAuthorizationVersion: 3,
  requestId: actor, idempotencyKey: 'fixed-request-key-1' };
const request = (value: unknown) => new Request('https://synthetic.invalid/functions/v1/synthetic-admin', {
  method: 'POST', headers: { Authorization: 'Bearer opaque', 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});
const config = () => ({ enabled: true, fingerprint });

test('Auth-incompatible password lengths reject before authorization, SQL claim or Auth effect', async () => {
  for (const length of [73, 128]) {
    let effects = 0;
    const unexpected = async () => { effects++; throw new Error('Must not execute'); };
    const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'execute',
      payload: { reservationId: reservation, password: 'Aa1!' + 'x'.repeat(length - 4) } }), {
      targetConfig: config, getUser: unexpected, rpc: unexpected, createAuth: unexpected,
    });
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { errorCode: 'INVALID_REQUEST' });
    assert.equal(effects, 0);
  }
});

test('execute sends password to Auth once, never to SQL, and activates exact reserved identity', async () => {
  const calls: string[] = [];
  const password = 'Local-only-password-123';
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'execute',
    payload: { reservationId: reservation, password } }), {
    targetConfig: config,
    getUser: async () => ({ id: actor }),
    rpc: async (name: string, args: Record<string, unknown>): Promise<any> => {
      calls.push(name);
      assert.equal(JSON.stringify(args).includes(password), false);
      assert.equal(args.p_org, org);
      assert.equal(args.p_workspace, workspace);
      assert.equal(args.p_version, 3);
      if (name === 'synthetic_admin_claim_execution') return {
        status: 'execution_claimed', reservationId: reservation, version: 2,
        externalCreateAllowed: true, authUserId: authId, syntheticEmail,
      };
      return { status: 'active', reservationId: reservation, version: 3 };
    },
    createAuth: async (input) => {
      calls.push('auth_create');
      assert.equal(input.authUserId, authId);
      assert.equal(input.password, password);
      return { id: authId, email: syntheticEmail, app_metadata: {
        synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint,
      } };
    },
  } as any);
  assert.deepEqual(calls, ['synthetic_admin_claim_execution', 'auth_create', 'synthetic_admin_reconcile']);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'active', reservationId: reservation, version: 3 });
});

test('claimed replay cannot make a second Auth user even with a new password', async () => {
  let authCreates = 0;
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'execute',
    payload: { reservationId: reservation, password: 'Different-long-password-123' } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async () => ({ status: 'reconciliation_required', reservationId: reservation,
      version: 2, externalCreateAllowed: false }),
    createAuth: async () => { authCreates++; throw new Error('must not run'); },
  } as any);
  assert.equal(authCreates, 0);
  assert.deepEqual(await response.json(), { status: 'reconciliation_required', reservationId: reservation, version: 2 });
});

test('uncertain Auth create reconciles only exact reserved id and never retries creation', async () => {
  let creates = 0;
  let reads = 0;
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'execute',
    payload: { reservationId: reservation, password: 'Local-only-password-123' } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async (name: string) => name === 'synthetic_admin_claim_execution'
      ? { status: 'execution_claimed', reservationId: reservation, version: 2,
        externalCreateAllowed: true, authUserId: authId, syntheticEmail }
      : { status: 'active', reservationId: reservation, version: 3 },
    createAuth: async () => { creates++; throw new Error('opaque provider failure'); },
    readAuth: async (id: string) => { reads++; assert.equal(id, authId); return {
      id: authId, email: syntheticEmail, app_metadata: {
        synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint,
      } }; },
  } as any);
  assert.equal(creates, 1);
  assert.equal(reads, 1);
  assert.equal((await response.json()).status, 'active');
});

test('substituted Auth identity remains uncertain and is never activated', async () => {
  const calls: string[] = [];
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'execute',
    payload: { reservationId: reservation, password: 'Local-only-password-123' } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async (name: string) => { calls.push(name); return {
      status: 'execution_claimed', reservationId: reservation, version: 2,
      externalCreateAllowed: true, authUserId: authId, syntheticEmail,
    }; },
    createAuth: async () => ({ id: actor, email: syntheticEmail, app_metadata: {
      synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint,
    } }),
  } as any);
  assert.deepEqual(calls, ['synthetic_admin_claim_execution','synthetic_admin_reconcile']);
  assert.equal((await response.json()).status, 'reconciliation_required');
});

test('Auth create ignoring the reserved UUID never retries creation or activates the returned user', async () => {
  let creates = 0;
  let observedExact = 0;
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'execute',
    payload: { reservationId: reservation, password: 'Local-only-password-123' } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async (name: string) => name === 'synthetic_admin_claim_execution'
      ? { status: 'execution_claimed', reservationId: reservation, version: 2,
        externalCreateAllowed: true, authUserId: authId, syntheticEmail }
      : { status: 'reconciliation_required', reservationId: reservation, version: 3 },
    createAuth: async () => { creates++; return { id: actor, email: syntheticEmail,
      app_metadata: { synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint } }; },
    readAuth: async () => { observedExact++; throw new Error('must not trust ignored ID response'); },
  } as any);
  assert.equal((await response.json()).status, 'reconciliation_required');
  assert.equal(creates, 1);
  assert.equal(observedExact, 0);
});

test('revoke disables database authority before one Auth ban; uncertain ban stays visible', async () => {
  const calls: string[] = [];
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'revoke',
    payload: { reservationId: reservation, expectedVersion: 4 } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === 'synthetic_admin_revoke') return {
        status: 'ban_required', reservationId: reservation, version: 5,
        externalBanAllowed: true, authUserId: authId, syntheticEmail, banClaimId,
      };
      assert.equal(args.p_confirmed, false);
      assert.equal(args.p_request_id, actor);
      assert.equal(args.p_claim_id, banClaimId);
      return { status: 'ban_uncertain', reservationId: reservation, version: 6 };
    },
    readAuth: async (id: string) => { calls.push('auth_read'); assert.equal(id, authId); return {
      id: authId, email: syntheticEmail, app_metadata: {
        synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint,
      },
    }; },
    banAuth: async () => { calls.push('auth_ban'); throw new Error('opaque'); },
  } as any);
  assert.deepEqual(calls, ['synthetic_admin_revoke', 'auth_read', 'auth_ban', 'auth_read', 'synthetic_admin_complete_ban']);
  assert.equal((await response.json()).status, 'ban_uncertain');
});

test('ban success requires returned future ban state before marking revoked', async () => {
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'revoke',
    payload: { reservationId: reservation, expectedVersion: 4 } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async (name: string, args: Record<string, unknown>) => name === 'synthetic_admin_revoke'
      ? { status: 'ban_required', reservationId: reservation, version: 5,
        externalBanAllowed: true, authUserId: authId, syntheticEmail, banClaimId }
      : { status: args.p_confirmed ? 'revoked' : 'ban_uncertain', reservationId: reservation, version: 6 },
    readAuth: async () => ({ id: authId, email: syntheticEmail, app_metadata: {
      synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint,
    } }),
    banAuth: async () => ({ id: authId, email: syntheticEmail,
      banned_until: new Date(Date.now() + 60000).toISOString() }),
  } as any);
  assert.equal((await response.json()).status, 'revoked');
});

test('lost revoke SQL response recovers through a fresh exact-ID ban claim, never another revoke', async () => {
  const calls: string[] = [];
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'reconcile',
    payload: { reservationId: reservation } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === 'synthetic_admin_reconcile') return { status: 'ban_required', reservationId: reservation, version: 5 };
      if (name === 'synthetic_admin_claim_ban_retry') {
        assert.equal(args.p_request_id, actor);
        assert.equal(args.p_reservation_id, reservation);
        return { status: 'ban_required', reservationId: reservation, version: 6,
          externalBanAllowed: true, authUserId: authId, syntheticEmail, banClaimId };
      }
      assert.equal(args.p_claim_id, banClaimId);
      assert.equal(args.p_confirmed, true);
      return { status: 'revoked', reservationId: reservation, version: 7 };
    },
    readAuth: async () => { calls.push('auth_read'); return { id: authId, email: syntheticEmail,
      app_metadata: { synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint } }; },
    banAuth: async () => { calls.push('auth_ban'); return { id: authId,
      banned_until: new Date(Date.now() + 60000).toISOString() }; },
  } as any);
  assert.equal((await response.json()).status, 'revoked');
  assert.deepEqual(calls, ['synthetic_admin_reconcile','synthetic_admin_claim_ban_retry',
    'auth_read','auth_ban','synthetic_admin_complete_ban']);
});

test('lost response after Auth ban observes the same owned user and completes without a second ban', async () => {
  let bans = 0;
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'reconcile',
    payload: { reservationId: reservation } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async (name: string) => name === 'synthetic_admin_reconcile'
      ? { status: 'ban_uncertain', reservationId: reservation, version: 6 }
      : name === 'synthetic_admin_claim_ban_retry'
        ? { status: 'ban_required', reservationId: reservation, version: 7,
          externalBanAllowed: true, authUserId: authId, syntheticEmail, banClaimId }
        : { status: 'revoked', reservationId: reservation, version: 8 },
    readAuth: async () => ({ id: authId, email: syntheticEmail,
      app_metadata: { synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint },
      banned_until: new Date(Date.now() + 60000).toISOString() }),
    banAuth: async () => { bans++; throw new Error('must not retry'); },
  } as any);
  assert.equal((await response.json()).status, 'revoked');
  assert.equal(bans, 0);
});

test('foreign or ignored reserved Auth identity is never banned or activated', async () => {
  let bans = 0;
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'reconcile',
    payload: { reservationId: reservation } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async (name: string, args: Record<string, unknown>) => name === 'synthetic_admin_reconcile'
      ? { status: 'ban_uncertain', reservationId: reservation, version: 6 }
      : name === 'synthetic_admin_claim_ban_retry'
        ? { status: 'ban_required', reservationId: reservation, version: 7,
          externalBanAllowed: true, authUserId: authId, syntheticEmail, banClaimId }
        : (assert.equal(args.p_confirmed, false), { status: 'ban_uncertain', reservationId: reservation, version: 8 }),
    readAuth: async () => ({ id: actor, email: syntheticEmail,
      app_metadata: { synthetic_admin_reservation_id: reservation, synthetic_admin_target: fingerprint } }),
    banAuth: async () => { bans++; throw new Error('must not ban foreign ID'); },
  } as any);
  assert.equal((await response.json()).status, 'ban_uncertain');
  assert.equal(bans, 0);
});

test('disabled server target rejects before reading identity or hitting SQL/Auth', async () => {
  let anyEffect = false;
  const response = await handleSyntheticAdminRequest(request({ ...base, operation: 'reserve',
    payload: { label: 'A', rolePreset: 'author' } }), {
    targetConfig: () => ({ enabled: false, fingerprint }),
    getUser: async () => { anyEffect = true; return { id: actor }; },
    rpc: async () => { anyEffect = true; return {}; },
  } as any);
  assert.equal(anyEffect, false);
  assert.deepEqual(await response.json(), { errorCode: 'FEATURE_DISABLED' });
});

test('a forged roster row cannot disclose an Auth UUID or arbitrary SQL fields', async () => {
  const response = await handleSyntheticAdminRequest(request({ organizationId: org, workspaceId: workspace,
    expectedAuthorizationVersion: 3, operation: 'list', payload: { limit: 20 } }), {
    targetConfig: config, getUser: async () => ({ id: actor }),
    rpc: async () => ({ status: 'listed', roster: [{ reservationId: reservation,
      label: 'Author A', loginId: syntheticEmail, rolePreset: 'author', state: 'active',
      version: 3, authUserId: authId }], nextCursor: null }),
  } as any);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { errorCode: 'TEMPORARY_FAILURE' });
});
