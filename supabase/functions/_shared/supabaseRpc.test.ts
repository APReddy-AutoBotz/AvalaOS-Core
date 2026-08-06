import assert from 'node:assert/strict';
import {
  rpc,
  SupabaseRpcError,
  SupabaseRpcTransportError,
  supabaseRpcErrorHasSignal,
} from './supabase';

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

globalThis.fetch = async () => { throw new TypeError('raw relay secret must not survive'); };
let fetchFailure: unknown;
try { await rpc('test_transport_failure', { secret: 'must-not-survive' }); }
catch (error) { fetchFailure = error; }
assert.ok(fetchFailure instanceof SupabaseRpcTransportError);
assert.deepEqual({
  operation: fetchFailure.operation,
  classification: fetchFailure.classification,
  responseReceived: fetchFailure.responseReceived,
}, { operation: 'rpc', classification: 'connection_failed', responseReceived: false });
assert.equal(JSON.stringify(fetchFailure).includes('raw relay secret'), false);

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => { throw new SyntaxError('raw response must not survive'); },
} as unknown as Response);
let decodeFailure: unknown;
try { await rpc('test_decode_failure', {}); }
catch (error) { decodeFailure = error; }
assert.ok(decodeFailure instanceof SupabaseRpcTransportError);
assert.equal(decodeFailure.classification, 'response_decode_failed');
assert.equal(decodeFailure.responseReceived, true);
assert.equal(JSON.stringify(decodeFailure).includes('raw response'), false);

console.log('Supabase RPC error tests: bounded domain and typed transport dispositions preserve no raw failure data.');
