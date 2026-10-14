import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticatedLifecycleValidateSetupLabels,
  createAuthenticatedLifecycleControl,
  createAuthenticatedLifecycleWorkQueue,
} from './authenticatedLifecycleHarness';

const setupLabels = (projectName: string, processName: string, deliveryProjectName: string) => ({
  projectName,
  deliveryProject: { id: 'fixture-project', name: deliveryProjectName },
  aliases: {
    case: 'primary-case-1', review: 'primary-review-1', handoff: 'primary-handoff-1',
    artifact: 'primary-artifact-1', process: processName,
  },
});

test('setup labels are exact locally and share one bounded hosted run binding', () => {
  assert.deepEqual(authenticatedLifecycleValidateSetupLabels(setupLabels(
    'desktop-chromium',
    'desktop-chromium connected lifecycle',
    'desktop-chromium delivery project',
  ), 'desktop-chromium', false), {
    processName: 'desktop-chromium connected lifecycle',
    deliveryProjectName: 'desktop-chromium delivery project',
    suffix: null,
  });
  const suffix = '[run 123.2 abcdef012345]';
  assert.deepEqual(authenticatedLifecycleValidateSetupLabels(setupLabels(
    'desktop-chromium',
    `desktop-chromium connected lifecycle ${suffix}`,
    `desktop-chromium delivery project ${suffix}`,
  ), 'desktop-chromium', true), {
    processName: `desktop-chromium connected lifecycle ${suffix}`,
    deliveryProjectName: `desktop-chromium delivery project ${suffix}`,
    suffix,
  });
});

test('setup labels reject project drift, non-exact local labels and malformed or unequal hosted suffixes', () => {
  const suffix = '[run 123.2 abcdef012345]';
  const rejected = [
    [setupLabels('pixel-7-chromium', 'desktop-chromium connected lifecycle',
      'desktop-chromium delivery project'), false],
    [setupLabels('desktop-chromium', 'desktop-chromium connected lifecycle retained',
      'desktop-chromium delivery project'), false],
    [setupLabels('desktop-chromium', 'desktop-chromium connected lifecycle',
      'desktop-chromium delivery project retained'), false],
    [setupLabels('desktop-chromium', 'desktop-chromium connected lifecycle',
      'desktop-chromium delivery project'), true],
    [setupLabels('desktop-chromium', `desktop-chromium connected lifecycle ${suffix}`,
      'desktop-chromium delivery project [run 123.3 abcdef012345]'), true],
    [setupLabels('desktop-chromium', `pixel-7-chromium connected lifecycle ${suffix}`,
      `pixel-7-chromium delivery project ${suffix}`), true],
    [setupLabels('desktop-chromium', `desktop-chromium connected lifecycle ${suffix} retained`,
      `desktop-chromium delivery project ${suffix} retained`), true],
    [setupLabels('desktop-chromium', 'desktop-chromium connected lifecycle [run 0.2 abcdef012345]',
      'desktop-chromium delivery project [run 0.2 abcdef012345]'), true],
    [setupLabels('desktop-chromium', 'desktop-chromium connected lifecycle [run 123456789012345678901.2 abcdef012345]',
      'desktop-chromium delivery project [run 123456789012345678901.2 abcdef012345]'), true],
    [setupLabels('desktop-chromium', 'desktop-chromium connected lifecycle [run 123.01 abcdef012345]',
      'desktop-chromium delivery project [run 123.01 abcdef012345]'), true],
    [setupLabels('desktop-chromium', 'desktop-chromium connected lifecycle [run 123.9999999999999999 abcdef012345]',
      'desktop-chromium delivery project [run 123.9999999999999999 abcdef012345]'), true],
    [setupLabels('desktop-chromium', 'desktop-chromium connected lifecycle [run 123.2 ABCDEF012345]',
      'desktop-chromium delivery project [run 123.2 ABCDEF012345]'), true],
  ] as const;
  for (const [setup, hosted] of rejected) {
    assert.throws(() => authenticatedLifecycleValidateSetupLabels(setup, 'desktop-chromium', hosted),
      error => error instanceof Error
        && error.message === 'ENTERPRISE_LIFECYCLE_BROWSER_SETUP_LABELS_REJECTED');
  }
});

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
