import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { bootstrapSyntheticAdmin, readBootstrapBinding } from './bootstrapSyntheticAdmin.mjs';

function fixture() {
  // Deterministically synthetic selectors; all fetch calls below are injected.
  const origin = `https://${'a'.repeat(20)}.supabase.co`;
  const ids = ['70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000003'];
  return {
    AVALA_EXPLORATORY_BOOTSTRAP_AUTHORIZATION: 'approved-dedicated-synthetic-target',
    AVALA_EXPLORATORY_SUPABASE_URL: origin,
    AVALA_EXPLORATORY_ORGANIZATION_ID: ids[0], AVALA_EXPLORATORY_WORKSPACE_ID: ids[1], AVALA_EXPLORATORY_OPERATOR_ID: ids[2],
    AVALA_EXPLORATORY_EXPECTED_TARGET_FINGERPRINT: `sha256:${createHash('sha256').update(JSON.stringify([origin, ...ids])).digest('hex')}`,
    AVALA_EXPLORATORY_SERVICE_ROLE_KEY: 'synthetic-mock-operator-credential-not-a-real-key',
  };
}
test('check mode verifies independent binding without network or effects', async () => {
  const result = await bootstrapSyntheticAdmin({ env: fixture(), fetchImpl: () => { throw new Error('must not call'); } });
  assert.deepEqual(result, { status: 'SYNTHETIC_BOOTSTRAP_CONFIGURATION_VALID', databaseChecked: false, applied: false });
});
test('missing approval, foreign target, changed actor, and substituted fingerprint fail before network', async () => {
  for (const patch of [
    { AVALA_EXPLORATORY_BOOTSTRAP_AUTHORIZATION: '' },
    { AVALA_EXPLORATORY_SUPABASE_URL: 'https://avalaos.com' },
    { AVALA_EXPLORATORY_SUPABASE_URL: `${fixture().AVALA_EXPLORATORY_SUPABASE_URL}/other` },
    { AVALA_EXPLORATORY_SUPABASE_URL: `https://${'b'.repeat(20)}.supabase.co` },
    { AVALA_EXPLORATORY_OPERATOR_ID: '70000000-0000-4000-8000-000000000004' },
    { AVALA_EXPLORATORY_EXPECTED_TARGET_FINGERPRINT: 'sha256:' + '0'.repeat(64) },
  ]) {
    let calls = 0;
    await assert.rejects(bootstrapSyntheticAdmin({ env: { ...fixture(), ...patch }, apply: true, fetchImpl: () => { calls++; } }));
    assert.equal(calls, 0);
  }
});
test('apply calls only the pinned bootstrap RPC and returns no credentials or selectors', async () => {
  const env = fixture(); const binding = readBootstrapBinding(env); let calls = 0;
  const result = await bootstrapSyntheticAdmin({ env, apply: true, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, `${binding.origin}/rest/v1/rpc/synthetic_admin_bootstrap_operator`);
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { p_actor: binding.operatorId, p_org: binding.organizationId, p_workspace: binding.workspaceId, p_fingerprint: binding.fingerprint });
    return new Response(JSON.stringify({ status: 'configured', targetId: '70000000-0000-4000-8000-000000000005' }));
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: 'SYNTHETIC_ADMIN_BOOTSTRAPPED', applied: true, refreshAuthorizationRequired: true });
});
test('lost response, denial and malformed success remain unconfirmed without retry or disclosure', async () => {
  for (const responder of [
    () => { throw new Error('private transport diagnostic'); },
    () => new Response('private backend body', { status: 403 }),
    () => new Response(JSON.stringify({ status: 'configured', targetId: 'not-an-id' })),
    () => new Response(JSON.stringify({ status: 'configured', targetId: '70000000-0000-4000-8000-000000000005', password: 'never-return' })),
  ]) {
    let calls = 0;
    await assert.rejects(bootstrapSyntheticAdmin({ env: fixture(), apply: true, fetchImpl: async () => { calls++; return responder(); } }),
      { message: 'SYNTHETIC_BOOTSTRAP_OUTCOME_UNCONFIRMED_RECONCILE_BEFORE_RETRY' });
    assert.equal(calls, 1);
  }
});
