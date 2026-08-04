import assert from 'node:assert/strict';
import test from 'node:test';
import { handleStudioPrivateArtifactReconciliation } from './studioPrivateArtifactReconciliationHandler.ts';

const secret = 'studio-worker-secret-32-characters-minimum';
const attemptId = '11111111-1111-4111-8111-111111111111';
const deletionAttemptId = '22222222-2222-4222-8222-222222222222';
const calls = { rendition: 0, deletion: 0 };
const dependencies = {
  configuredWorkerSecret: secret,
  async loadDue() {
    return [
      { kind: 'rendition' as const, attemptId },
      { kind: 'deletion' as const, attemptId: deletionAttemptId },
    ];
  },
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

test('due worker requires one bounded limit and emits aggregate counts only', async () => {
  for (const body of [{}, { limit: 0 }, { limit: 51 }, { limit: 2, attemptId }]) {
    const result = await handleStudioPrivateArtifactReconciliation(
      request(body),
      'due',
      dependencies,
    );
    assert.equal(result.status, 400);
  }
  const result = await handleStudioPrivateArtifactReconciliation(
    request({ limit: 2 }),
    'due',
    dependencies,
  );
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body, {
    status: 'processed',
    attempted: 2,
    available: 1,
    deleted: 1,
    replay: 0,
    failed: 0,
    reconciliation_required: 0,
    not_executable: 0,
    unavailable: 0,
  });
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes(attemptId), false);
  assert.equal(serialized.includes(deletionAttemptId), false);
});

test('due worker isolates an item failure and continues the bounded batch', async () => {
  let secondRan = false;
  const result = await handleStudioPrivateArtifactReconciliation(
    request({ limit: 2 }),
    'due',
    {
      ...dependencies,
      reconcileRendition: async () => { throw new Error('private provider detail'); },
      reconcileDeletion: async () => {
        secondRan = true;
        return { status: 'deleted' as const };
      },
    },
  );
  assert.equal(result.status, 200);
  assert.equal(secondRan, true);
  const body = await result.json();
  assert.equal(body.unavailable, 1);
  assert.equal(body.deleted, 1);
});
