import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capturePreactivationSignInRequestCorrelationAnnotation,
  createPreactivationSignInRequestCorrelationCollector,
  PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_BYTE_CAP,
  validatePreactivationSignInRequestCorrelation,
} from './preactivationSignInRequestCorrelation.mjs';

const request = route => ({ url: () => `https://backend.example.invalid${route}` });
const gate = { armed: false, waiting: true, released: false };

test('same request identity is idempotent across route, event and admission observations', () => {
  const collector = createPreactivationSignInRequestCorrelationCollector();
  const target = request('/functions/v1/tenant-session');
  collector.requestDiagnostics.onRoute(target);
  collector.requestDiagnostics.onRoute(target);
  collector.requestDiagnostics.onRequest(target);
  collector.actionDiagnostics.onStart(target, { kind: 'business-action', route: '/functions/v1/tenant-session' });
  const snapshot = collector.freeze({ targetRequest: target, gate, pendingActionStarts: 1, activeActionCount: 0 });
  assert.equal(snapshot.state, 'captured');
  assert.deepEqual(snapshot.target, { ordinal: 1, route: 'tenant-session', requestEventSeen: true,
    routeSeen: true, admissionStarted: true, admissionSettled: false, gate });
  assert.deepEqual(snapshot.pendingAdmissions, [{ ordinal: 1, route: 'tenant-session' }]);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.target), true);
  assert.equal(Object.isFrozen(snapshot.target.gate), true);
  assert.equal(Object.isFrozen(snapshot.pendingAdmissions), true);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_BYTE_CAP);
  assert.equal(validatePreactivationSignInRequestCorrelation(snapshot), snapshot);
});

test('missing target and inconsistent global pending count are explicitly incomplete', () => {
  const missing = createPreactivationSignInRequestCorrelationCollector().freeze({
    targetRequest: null, gate, pendingActionStarts: 0, activeActionCount: 0,
  });
  assert.equal(missing.state, 'incomplete');
  assert.equal(missing.target, null);

  const collector = createPreactivationSignInRequestCorrelationCollector();
  const target = request('/functions/v1/tenant-session');
  collector.actionDiagnostics.onStart(target, { route: '/functions/v1/tenant-session' });
  const inconsistent = collector.freeze({ targetRequest: target, gate,
    pendingActionStarts: 0, activeActionCount: 0 });
  assert.equal(inconsistent.state, 'incomplete');
  assert.equal(inconsistent.overflow, true);
});

test('ordinary app asset observations do not consume bounded product admission ordinals', () => {
  const collector = createPreactivationSignInRequestCorrelationCollector();
  for (let index = 0; index < 120; index += 1) {
    const asset = request(`/assets/chunk-${index}.js`);
    collector.requestDiagnostics.onRoute(asset);
    collector.requestDiagnostics.onRequest(asset);
  }
  const target = request('/functions/v1/tenant-session');
  collector.requestDiagnostics.onRoute(target);
  collector.requestDiagnostics.onRequest(target);
  const snapshot = collector.freeze({ targetRequest: target, gate,
    pendingActionStarts: 0, activeActionCount: 0 });
  assert.equal(snapshot.state, 'captured');
  assert.equal(snapshot.target.ordinal, 1);
  assert.equal(snapshot.overflow, false);
});

test('distinct requests, unrelated pending admissions and out-of-order settle remain distinct', () => {
  const collector = createPreactivationSignInRequestCorrelationCollector();
  const target = request('/functions/v1/tenant-session');
  const unrelated = request('/functions/v1/process-command');
  collector.actionDiagnostics.onSettled(target, { kind: 'business-action', route: '/functions/v1/tenant-session' });
  collector.actionDiagnostics.onStart(unrelated, { kind: 'business-action', route: '/functions/v1/process-command' });
  collector.requestDiagnostics.onRoute(target);
  collector.requestDiagnostics.onRequest(unrelated);
  const snapshot = collector.freeze({ targetRequest: target, gate, pendingActionStarts: 1, activeActionCount: 2 });
  assert.equal(snapshot.target.ordinal, 1);
  assert.equal(snapshot.target.admissionSettled, true);
  assert.deepEqual(snapshot.pendingAdmissions, [{ ordinal: 2, route: 'process-command' }]);
  assert.deepEqual(snapshot.counts, { pendingAdmissions: 1, activeActions: 2 });
});

test('frozen state ignores later observations and observer inputs never expose raw values', () => {
  const collector = createPreactivationSignInRequestCorrelationCollector();
  const target = request('/functions/v1/tenant-session?token=Bearer-private');
  collector.requestDiagnostics.onRoute(target);
  const first = collector.freeze({ targetRequest: target, gate, pendingActionStarts: 0, activeActionCount: 0 });
  collector.actionDiagnostics.onStart(target, { route: '/functions/v1/process-command', raw: 'private' });
  const second = collector.freeze({ targetRequest: request('/functions/v1/other'), gate,
    pendingActionStarts: 9, activeActionCount: 9 });
  assert.deepEqual(second, first);
  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes('Bearer-private'), false);
  assert.equal(serialized.includes('private'), false);
});

test('annotation capture is synchronous, passive and cannot replace a primary assertion error', () => {
  const primary = new Error('PRIMARY_ASSERTION');
  const throwingCollector = { freeze: () => { throw new Error('DIAGNOSTIC_FAILURE'); } };
  assert.equal(capturePreactivationSignInRequestCorrelationAnnotation({
    collector: throwingCollector, annotations: [], input: {},
  }), false);
  const collector = createPreactivationSignInRequestCorrelationCollector();
  const target = request('/functions/v1/tenant-session');
  collector.actionDiagnostics.onStart(target, { route: '/functions/v1/tenant-session' });
  const throwingAnnotations = { push: () => { throw new Error('ANNOTATION_FAILURE'); } };
  let retained;
  try { throw primary; } catch (error) {
    capturePreactivationSignInRequestCorrelationAnnotation({ collector,
      annotations: throwingAnnotations, input: { targetRequest: target, gate,
        pendingActionStarts: 1, activeActionCount: 0 } });
    retained = error;
  }
  assert.equal(retained, primary);
});

test('captured schema rejects impossible target and pending relationships', () => {
  const collector = createPreactivationSignInRequestCorrelationCollector();
  const target = request('/functions/v1/tenant-session');
  collector.actionDiagnostics.onStart(target, { route: '/functions/v1/tenant-session' });
  const snapshot = collector.freeze({ targetRequest: target, gate,
    pendingActionStarts: 1, activeActionCount: 0 });
  assert.equal(validatePreactivationSignInRequestCorrelation({ ...snapshot,
    counts: { ...snapshot.counts, pendingAdmissions: 0 } }), null);
  assert.equal(validatePreactivationSignInRequestCorrelation({ ...snapshot,
    pendingAdmissions: [{ ordinal: snapshot.target.ordinal, route: 'process-command' }] }), null);
  assert.equal(validatePreactivationSignInRequestCorrelation({ ...snapshot,
    target: { ...snapshot.target, admissionSettled: true } }), null);
  assert.equal(validatePreactivationSignInRequestCorrelation({ ...snapshot,
    pendingAdmissions: [] }), null);
});

test('caps and overflow are truthful and schema rejects malformed or extra data', () => {
  const collector = createPreactivationSignInRequestCorrelationCollector();
  const requests = Array.from({ length: 18 }, (_, index) => request(`/functions/v1/route-${index}`));
  for (const candidate of requests) {
    collector.actionDiagnostics.onStart(candidate, { kind: 'business-action', route: '/functions/v1/other' });
  }
  const snapshot = collector.freeze({ targetRequest: requests[0], gate,
    pendingActionStarts: 18, activeActionCount: 0 });
  assert.equal(snapshot.state, 'incomplete');
  assert.equal(snapshot.overflow, true);
  assert.equal(snapshot.pendingAdmissions.length, 16);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_BYTE_CAP);
  assert.equal(validatePreactivationSignInRequestCorrelation({ ...snapshot, extra: 'secret' }), null);
  assert.equal(validatePreactivationSignInRequestCorrelation({ ...snapshot, pendingAdmissions: [
    { ordinal: 1, route: 'tenant-session', raw: 'secret' },
  ] }), null);
});
