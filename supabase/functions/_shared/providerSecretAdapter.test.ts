import assert from 'node:assert/strict';
import {
  createProviderSecretBackend,
  EnvironmentProviderSecretBackend,
  ProviderSecretBackendError,
  SupabaseVaultProviderSecretBackend,
  VaultProviderSecretBackend,
  fingerprintProviderSecret,
} from './providerSecretAdapter';
import { SupabaseRpcError, SupabaseRpcTransportError } from './supabase';

const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const withServerEnv = (values: Record<string, string | undefined>, callback: () => void) => {
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: { env: { get: (key: string) => values[key] } } });
  try { callback(); } finally {
    if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
    else Reflect.deleteProperty(globalThis, 'Deno');
  }
};

withServerEnv({ AVALA_PROVIDER_SECRET_BACKEND: 'supabase_vault' }, () => {
  assert.ok(createProviderSecretBackend() instanceof SupabaseVaultProviderSecretBackend);
});
withServerEnv({ AVALA_PROVIDER_SECRET_BACKEND: 'hashicorp_vault', AVALA_VAULT_ADDR: 'https://vault.example.test', AVALA_VAULT_TOKEN: 'fixture' }, () => {
  assert.ok(createProviderSecretBackend() instanceof VaultProviderSecretBackend);
});
withServerEnv({ AVALA_VAULT_ADDR: 'https://vault.example.test', AVALA_VAULT_TOKEN: 'fixture' }, () => {
  assert.ok(createProviderSecretBackend() instanceof VaultProviderSecretBackend);
});
withServerEnv({}, () => { assert.ok(createProviderSecretBackend() instanceof EnvironmentProviderSecretBackend); });
for (const values of [
  { AVALA_PROVIDER_SECRET_BACKEND: 'supabase_vault', AVALA_VAULT_ADDR: 'https://vault.example.test' },
  { AVALA_PROVIDER_SECRET_BACKEND: 'environment', AVALA_VAULT_TOKEN: 'fixture' },
  { AVALA_PROVIDER_SECRET_BACKEND: 'unknown' },
]) withServerEnv(values, () => {
  assert.throws(() => createProviderSecretBackend(),
    (error: unknown) => error instanceof ProviderSecretBackendError && error.code === 'SECRET_BACKEND_UNAVAILABLE');
});
console.log('ok - explicit native selection rejects drift while absent selection preserves legacy routing');

const organizationId = '33333333-3333-4333-8333-333333333333';
const receiptId = '11111111-1111-4111-8111-111111111111';
const executionToken = '22222222-2222-4222-8222-222222222222';
const keyRefId = '44444444-4444-4444-8444-444444444444';
const secretRef = 'AVALA_PROVIDER_SECRET_GROQ_33333333333343338333333333333333_NATIVE';
const value = 'synthetic-provider-secret-value';
const safeFingerprint = await fingerprintProviderSecret(value);
const receiptBinding = { kind: 'receipt' as const, receiptId, executionToken, executionFence: 7, keyRefId, safeFingerprint };

const calls: Array<{ name: string; args: Record<string, unknown>; signal?: AbortSignal }> = [];
const backend = new SupabaseVaultProviderSecretBackend(async (name, args, options) => {
  calls.push({ name, args, signal: options?.signal });
  if (name === 'enterprise_provider_secret_resolve_for_receipt') return null as never;
  if (name === 'enterprise_provider_secret_write') {
    return { outcome: 'created', backendKind: 'supabase_vault', safeFingerprint } as never;
  }
  if (name === 'enterprise_provider_secret_resolve') return value as never;
  return { outcome: 'deleted', backendKind: 'supabase_vault', safeFingerprint } as never;
});

assert.equal(await backend.resolve({ provider: 'groq', secretRef, organizationId, binding: receiptBinding }), undefined);
await backend.write({ provider: 'groq', secretRef, organizationId, value, binding: receiptBinding });
assert.deepEqual(calls.slice(0, 2).map(call => call.name), [
  'enterprise_provider_secret_resolve_for_receipt', 'enterprise_provider_secret_write',
]);
assert.equal(JSON.stringify(calls).includes(value), true);
assert.equal(calls[1].args.p_execution_fence, 7);
console.log('ok - native write is bound to one exact receipt token, fence, key, and fingerprint');

const keyRefBinding = { kind: 'key_ref' as const, keyRefId, safeFingerprint };
assert.equal(await backend.resolve({ provider: 'groq', secretRef, organizationId, binding: keyRefBinding }), value);
assert.equal(calls.at(-1)?.name, 'enterprise_provider_secret_resolve');
console.log('ok - committed native resolution requires exact key reference ownership');

const abortController = new AbortController();
await backend.remove({ provider: 'groq', secretRef, organizationId, signal: abortController.signal, binding: receiptBinding });
assert.equal(calls.at(-1)?.name, 'enterprise_provider_secret_delete_for_receipt');
assert.equal(calls.at(-1)?.signal, abortController.signal);
console.log('ok - native deletion carries its abort signal to the fenced RPC');

let writeCalls = 0;
const uncertain = new SupabaseVaultProviderSecretBackend(async () => {
  writeCalls += 1;
  throw new SupabaseRpcTransportError('response_read_failed', true);
});
await assert.rejects(
  () => uncertain.write({ provider: 'groq', secretRef, organizationId, value, binding: receiptBinding }),
  (error: unknown) => error instanceof ProviderSecretBackendError && error.code === 'SECRET_BACKEND_UNAVAILABLE',
);
assert.equal(writeCalls, 1);
console.log('ok - uncertain native write is not repeated inside the adapter');

const conflict = new SupabaseVaultProviderSecretBackend(async () => {
  throw new SupabaseRpcError({ status: 400, databaseMessage: 'ENTERPRISE_PROVIDER_SECRET_CONFLICT' });
});
await assert.rejects(
  () => conflict.write({ provider: 'groq', secretRef, organizationId, value, binding: receiptBinding }),
  (error: unknown) => error instanceof ProviderSecretBackendError && error.code === 'SECRET_CONFLICT'
    && !JSON.stringify(error).includes(value),
);
console.log('ok - native conflicts stay bounded and secret-free');

await assert.rejects(
  () => backend.resolve({ provider: 'groq', secretRef, organizationId }),
  (error: unknown) => error instanceof ProviderSecretBackendError && error.code === 'SECRET_BACKEND_UNAVAILABLE',
);
console.log('ok - native operations reject missing immutable ownership context');
