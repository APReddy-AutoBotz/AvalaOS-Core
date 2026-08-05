import assert from 'node:assert/strict';
import { rpc, SupabaseRpcError, supabaseRpcErrorHasSignal } from './supabase';

const secrets = {
  SUPABASE_URL: 'https://supabase.invalid',
  SUPABASE_ANON_KEY: 'anon-test-value',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-value',
};
(globalThis as typeof globalThis & { Deno: unknown }).Deno = {
  env: { get: (key: keyof typeof secrets) => secrets[key] },
};

const runFailure = async (body: string, status = 409) => {
  let textReads = 0;
  globalThis.fetch = async () => ({
    ok: false,
    status,
    text: async () => { textReads += 1; return body; },
  } as Response);
  let captured: unknown;
  try { await rpc('test_domain_failure', { secret: 'must-not-survive' }); }
  catch (error) { captured = error; }
  assert.equal(textReads, 1);
  assert.ok(captured instanceof SupabaseRpcError);
  return captured;
};

const domain = await runFailure(JSON.stringify({
  code: 'P0001',
  message: 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT',
  details: 'ENTERPRISE_AI_EXECUTION_PLAN_CONFLICT',
  hint: 'ENTERPRISE_AI_COMMAND_IN_PROGRESS',
}));
assert.equal(domain.status, 409);
assert.equal(domain.code, 'P0001');
assert.equal(domain.databaseMessage, 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT');
assert.equal(supabaseRpcErrorHasSignal(domain, 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT'), true);

const malformed = await runFailure('<html>gateway failure</html>', 502);
assert.equal(malformed.status, 502);
assert.equal(malformed.databaseMessage, undefined);

const unsafe = await runFailure(JSON.stringify({
  code: '23505',
  message: 'duplicate key value violates unique constraint enterprise_secret_raw_key',
  details: 'Bearer raw-token https://storage.invalid/customer/object',
  hint: 'select * from private_table',
}));
assert.equal(unsafe.code, '23505');
assert.equal(unsafe.databaseMessage, undefined);
assert.equal(unsafe.details, undefined);
assert.equal(unsafe.hint, undefined);
const serialized = JSON.stringify(unsafe);
for (const forbidden of ['raw-token', 'storage.invalid', 'private_table', 'must-not-survive', 'service-role-test-value']) {
  assert.equal(serialized.includes(forbidden), false);
}
assert.equal(unsafe.message, 'Supabase RPC failed.');
console.log('Supabase RPC error tests: bounded structured domain signals preserved; unsafe and malformed bodies discarded.');
