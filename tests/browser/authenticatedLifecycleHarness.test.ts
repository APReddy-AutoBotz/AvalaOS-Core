import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAuthenticatedLifecycleControl,
  createAuthenticatedLifecycleWorkQueue,
} from './authenticatedLifecycleHarness';

test('control transport failures retain only the closed transport code', async () => {
  const control = createAuthenticatedLifecycleControl({
    baseUrl: 'http://127.0.0.1:48123',
    token: 'fixture-control-token',
    fetchImpl: async () => { throw new Error('private transport detail'); },
  });
  await assert.rejects(control('/control/setup'), error => (
    error instanceof Error
    && error.message === 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TRANSPORT_REJECTED'
    && !error.message.includes('private')
  ));
});

test('successful control responses with invalid JSON retain only the closed response code', async () => {
  const control = createAuthenticatedLifecycleControl({
    baseUrl: 'http://localhost:48123',
    token: 'fixture-control-token',
    fetchImpl: async () => new Response('private invalid response', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  await assert.rejects(control('/control/setup'), error => (
    error instanceof Error
    && error.message === 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_RESPONSE_REJECTED'
    && !error.message.includes('private')
  ));
});

test('work queue attaches an immediate rejection handler and retains its first failure', async () => {
  const queue = createAuthenticatedLifecycleWorkQueue();
  const first = new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_ACTION_REJECTED');
  let laterOperationRan = false;
  let unhandled = 0;
  const onUnhandled = () => { unhandled += 1; };
  process.on('unhandledRejection', onUnhandled);
  try {
    queue.enqueue(async () => { throw first; });
    queue.enqueue(async () => { laterOperationRan = true; });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(queue.drain(), error => error === first);
    await assert.rejects(queue.drain(), error => error === first);
    assert.equal(laterOperationRan, false);
    assert.equal(unhandled, 0);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('work queue drains work appended by an owning operation exactly once', async () => {
  const queue = createAuthenticatedLifecycleWorkQueue();
  const observed: string[] = [];
  queue.enqueue(async () => {
    observed.push('first');
    queue.enqueue(async () => { observed.push('appended'); });
  });
  await queue.drain();
  await queue.drain();
  assert.deepEqual(observed, ['first', 'appended']);
});

test('work queue converts a non-error rejection to the closed fail-safe code', async () => {
  const queue = createAuthenticatedLifecycleWorkQueue();
  queue.enqueue(async () => Promise.reject(undefined));
  await assert.rejects(queue.drain(), error => (
    error instanceof Error
    && error.message === 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED'
  ));
});
