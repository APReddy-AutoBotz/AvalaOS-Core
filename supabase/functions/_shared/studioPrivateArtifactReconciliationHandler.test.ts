import assert from 'node:assert/strict';
import test from 'node:test';
import { handleStudioPrivateArtifactReconciliation } from './studioPrivateArtifactReconciliationHandler.ts';

const secret = 'studio-worker-secret-32-characters-minimum';
const attemptId = '11111111-1111-4111-8111-111111111111';
const calls = { rendition: 0, deletion: 0 };
const dependencies = {
  configuredWorkerSecret: secret,
  async reconcileRendition() { calls.rendition += 1; return { status: 'available' as const }; },
  async reconcileDeletion() { calls.deletion += 1; return { status: 'deleted' as const }; },
};
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://example.invalid/functions/v1/studio-private-artifact-reconcile/rendition', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-avala-studio-worker-secret': secret, ...headers },
  body: JSON.stringify(body),
});

test('worker endpoint is POST-only and emits no CORS grant', async () => {
  const result = await handleStudioPrivateArtifactReconciliation(new Request('https://example.invalid', { method: 'OPTIONS' }), 'rendition', dependencies);
  assert.equal(result.status, 405);
  assert.equal(result.headers.has('access-control-allow-origin'), false);
});

test('missing worker configuration fails closed before execution', async () => {
  const result = await handleStudioPrivateArtifactReconciliation(request({ attemptId }), 'rendition', { ...dependencies, configuredWorkerSecret: undefined });
  assert.equal(result.status, 401);
  assert.equal(calls.rendition, 0);
});

test('user JWT and browser-origin requests are rejected even with worker secret', async () => {
  for (const headers of [{ authorization: 'Bearer user-token' }, { origin: 'https://browser.invalid' }]) {
    const result = await handleStudioPrivateArtifactReconciliation(request({ attemptId }, headers), 'rendition', dependencies);
    assert.equal(result.status, 401);
  }
  assert.equal(calls.rendition, 0);
});

test('wrong worker secret fails closed', async () => {
  const result = await handleStudioPrivateArtifactReconciliation(request({ attemptId }, { 'x-avala-studio-worker-secret': 'wrong-secret-value-that-is-still-long' }), 'rendition', dependencies);
  assert.equal(result.status, 401);
  assert.equal(calls.rendition, 0);
});

test('request body is exact and contains only an attempt ID', async () => {
  for (const body of [{}, { attemptId: 'not-a-uuid' }, { attemptId, renditionId: attemptId }]) {
    const result = await handleStudioPrivateArtifactReconciliation(request(body), 'rendition', dependencies);
    assert.equal(result.status, 400);
  }
  assert.equal(calls.rendition, 0);
});

test('authorized rendition worker response is sanitized', async () => {
  const result = await handleStudioPrivateArtifactReconciliation(request({ attemptId }), 'rendition', dependencies);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'available' });
  assert.equal(calls.rendition, 1);
});

test('authorized deletion worker dispatches only deletion operation', async () => {
  const result = await handleStudioPrivateArtifactReconciliation(request({ attemptId }), 'deletion', dependencies);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'deleted' });
  assert.equal(calls.deletion, 1);
});

test('internal failures are sanitized without claim or provider fields', async () => {
  const result = await handleStudioPrivateArtifactReconciliation(request({ attemptId }), 'rendition', { ...dependencies, reconcileRendition: async () => { throw new Error('bucket/object/provider detail'); } });
  assert.equal(result.status, 503);
  const serialized = await result.text();
  assert.equal(serialized, JSON.stringify({ status: 'unavailable' }));
  for (const forbidden of ['bucket', 'object', 'provider', attemptId]) assert.equal(serialized.includes(forbidden), false);
});
