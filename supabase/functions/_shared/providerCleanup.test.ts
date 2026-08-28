import assert from 'node:assert/strict';
import { processNextProviderSecretCleanup, type ProviderSecretCleanupJob } from './providerCleanup';
import type { ProviderSecretBackend } from './providerSecretAdapter';

const job: ProviderSecretCleanupJob = {
  state: 'claimed', jobId: '11111111-1111-4111-8111-111111111111',
  keyRefId: '22222222-2222-4222-8222-222222222222', organizationId: '33333333-3333-4333-8333-333333333333',
  provider: 'groq', attemptCount: 1,
};
const material = { id: job.keyRefId, org_id: job.organizationId, provider: job.provider,
  resolver_type: 'server_reference', secret_ref: 'AVALA_PROVIDER_SECRET_GROQ_33333333333343338333333333333333_RETIRED' };

for (const provider of ['openai','azure_openai','anthropic','gemini','groq','openai_compatible'] as const) {
  let removed = 0; let completed = 0;
  const backend: ProviderSecretBackend = { kind: 'vault', writable: true, resolve: async () => undefined,
    remove: async input => { assert.equal(input.provider, provider); removed += 1; } };
  const result = await processNextProviderSecretCleanup({ executionToken: '44444444-4444-4444-8444-444444444444', backend,
    claim: async () => ({ ...job, provider }), load: async () => ({ ...material, provider }),
    complete: async () => { completed += 1; }, fail: async () => { throw new Error('must not fail'); } });
  assert.equal(result.state, 'completed'); assert.equal(removed, 1); assert.equal(completed, 1);
}
console.log('ok - PROVIDER-001..006 retirement cleanup includes Groq and all unified providers');

let attempts = 0; let failures = 0; let successes = 0;
const recoveringBackend: ProviderSecretBackend = { kind: 'vault', writable: true, resolve: async () => undefined,
  remove: async () => { attempts += 1; if (attempts === 1) throw new Error('sanitized cleanup failure'); } };
const common = { executionToken: '44444444-4444-4444-8444-444444444444', backend: recoveringBackend,
  claim: async () => job, load: async () => material, complete: async () => { successes += 1; }, fail: async () => { failures += 1; } };
assert.equal((await processNextProviderSecretCleanup(common)).state, 'retry_scheduled');
assert.equal((await processNextProviderSecretCleanup(common)).state, 'completed');
assert.deepEqual({ attempts, failures, successes }, { attempts: 2, failures: 1, successes: 1 });
assert.equal(JSON.stringify({ attempts, failures, successes }).includes(material.secret_ref), false);
console.log('ok - cleanup failure schedules retry and recovery remains idempotent and secret-free');

let responseLossFailures = 0;
const responseLoss = await processNextProviderSecretCleanup({ executionToken: '44444444-4444-4444-8444-444444444444', backend: {
  kind: 'vault', writable: true, resolve: async () => undefined, remove: async () => undefined,
}, claim: async () => job, load: async () => material,
complete: async () => { throw new Error('sanitized response loss'); }, fail: async () => { responseLossFailures += 1; } });
assert.equal(responseLoss.state, 'completion_uncertain'); assert.equal(responseLossFailures, 0);
console.log('ok - cleanup completion response loss preserves fenced recovery ownership');
