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

const captureFailure = async (input: {
  body?: string;
  status: number;
  readError?: Error;
}) => {
  let textReads = 0;
  globalThis.fetch = async () => ({
    ok: false,
    status: input.status,
    text: async () => {
      textReads += 1;
      if (input.readError) throw input.readError;
      return input.body || '';
    },
  } as Response);
  let captured: unknown;
  try { await rpc('test_domain_failure', { secret: 'must-not-survive' }); }
  catch (error) { captured = error; }
  assert.equal(textReads, 1);
  assert.ok(captured instanceof Error);
  return captured;
};

const domain = await captureFailure({
  status: 409,
  body: JSON.stringify({
    code: 'P0001',
    message: 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT',
    details: 'ENTERPRISE_AI_EXECUTION_PLAN_CONFLICT',
    hint: 'ENTERPRISE_AI_COMMAND_IN_PROGRESS',
  }),
});
assert.ok(domain instanceof SupabaseRpcError);
assert.equal(domain.status, 409);
assert.equal(domain.code, 'P0001');
assert.equal(domain.databaseMessage, 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT');
assert.equal(supabaseRpcErrorHasSignal(domain, 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT'), true);

const transientCases = [
  { status: 502, body: '', classification: 'transient_http_502' },
  { status: 502, body: JSON.stringify({ code: 'PGRST003', message: 'upstream unavailable' }), classification: 'transient_http_502' },
  { status: 503, body: '<html>proxy unavailable</html>', classification: 'transient_http_503' },
  { status: 504, body: '{malformed-json', classification: 'transient_http_504' },
] as const;
for (const testCase of transientCases) {
  const error = await captureFailure(testCase);
  assert.ok(error instanceof SupabaseRpcTransportError);
  assert.deepEqual({
    classification: error.classification,
    responseReceived: error.responseReceived,
  }, {
    classification: testCase.classification,
    responseReceived: true,
  });
}

const readFailure = await captureFailure({
  status: 409,
  readError: new Error('raw unreadable response secret must not survive'),
});
assert.ok(readFailure instanceof SupabaseRpcTransportError);
assert.equal(readFailure.classification, 'response_read_failed');
assert.equal(readFailure.responseReceived, true);
assert.equal(JSON.stringify(readFailure).includes('raw unreadable response secret'), false);

const governedSignals = [
  'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT',
  'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE',
  'ENTERPRISE_AI_STALE_EXECUTION_FENCE',
  'ENTERPRISE_PROVIDER_PERMISSION_DENIED',
  'ENTERPRISE_AI_COMMAND_NOT_EXECUTABLE',
  'ENTERPRISE_EVIDENCE_CANDIDATE_STALE',
  'ENTERPRISE_PROVIDER_ROUTE_BLOCKED',
  'ENTERPRISE_DELIVERY_IDEMPOTENCY_CONFLICT',
  'ENTERPRISE_DELIVERY_COMMAND_IN_PROGRESS',
  'ENTERPRISE_DELIVERY_PERMISSION_DENIED',
  'ENTERPRISE_DELIVERY_RESOURCE_UNAVAILABLE',
  'ENTERPRISE_DELIVERY_RESOURCE_STALE',
  'ENTERPRISE_DELIVERY_HANDOFF_STALE',
  'ENTERPRISE_DELIVERY_FEATURE_DISABLED',
  'ENTERPRISE_DELIVERY_READ_ONLY',
  'ENTERPRISE_DELIVERY_COMMAND_BLOCKED',
] as const;
for (const [index, signal] of governedSignals.entries()) {
  const status = [502, 503, 504][index % 3];
  const error = await captureFailure({ status, body: JSON.stringify({ code: 'P0001', message: signal }) });
  assert.ok(error instanceof SupabaseRpcError);
  assert.equal(error.status, status);
  assert.equal(supabaseRpcErrorHasSignal(error, signal), true);
}

const governed500 = await captureFailure({
  status: 500,
  body: JSON.stringify({ code: 'P0001', message: 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT' }),
});
assert.ok(governed500 instanceof SupabaseRpcError);
assert.equal(supabaseRpcErrorHasSignal(governed500, 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT'), true);

const ordinary4xx = await captureFailure({
  status: 403,
  body: JSON.stringify({ code: '42501', message: 'ENTERPRISE_PROVIDER_PERMISSION_DENIED' }),
});
assert.ok(ordinary4xx instanceof SupabaseRpcError);
assert.equal(ordinary4xx.code, '42501');
assert.equal(supabaseRpcErrorHasSignal(ordinary4xx, 'ENTERPRISE_PROVIDER_PERMISSION_DENIED'), true);

const arbitraryToken = await captureFailure({
  status: 400,
  body: JSON.stringify({
    code: '23505',
    message: 'ENTERPRISE_PROXY_UNAVAILABLE',
    details: 'duplicate key value violates unique constraint enterprise_secret_raw_key',
    hint: 'select * from private_table',
  }),
});
assert.ok(arbitraryToken instanceof SupabaseRpcError);
assert.equal(arbitraryToken.code, '23505');
assert.equal(arbitraryToken.databaseMessage, undefined);
assert.equal(arbitraryToken.details, undefined);
assert.equal(arbitraryToken.hint, undefined);

const serialized = JSON.stringify(arbitraryToken);
for (const forbidden of [
  'ENTERPRISE_PROXY_UNAVAILABLE', 'enterprise_secret_raw_key', 'private_table',
  'must-not-survive', 'service-role-test-value', 'supabase.invalid', 'Authorization',
]) {
  assert.equal(serialized.includes(forbidden), false);
}
assert.equal(arbitraryToken.message, 'Supabase RPC failed.');

const internalDeliverySignal = await captureFailure({
  status: 409,
  body: JSON.stringify({ code: 'P0001', message: 'DELIVERY_PARENT_NOT_IN_PACKAGE' }),
});
assert.ok(internalDeliverySignal instanceof SupabaseRpcError);
assert.equal(internalDeliverySignal.databaseMessage, undefined);
assert.equal(supabaseRpcErrorHasSignal(internalDeliverySignal, 'DELIVERY_PARENT_NOT_IN_PACKAGE'), false);

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

console.log('Supabase RPC error tests: governed domain signals and transient response uncertainty remain bounded.');
