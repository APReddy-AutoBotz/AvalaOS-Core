import assert from 'node:assert/strict';
import test from 'node:test';
import { createObservationTimings, validateObservationTimings } from './authenticatedObservationTimings.mjs';
import { AUTHENTICATED_HOSTED_CAPTURE_QUERY } from './authenticatedHostedObservationAdapter.mjs';
import { createAuthenticatedHostedRunDiagnostic, validateAuthenticatedHostedRunDiagnostic } from './authenticatedHostedDiagnostics.mjs';

test('observation timings attribute nested work without retaining arguments or changing results', async () => {
  let clock = 0;
  const timings = createObservationTimings({ now: () => clock });
  const calls = [], secret = 'fixture-private-token-and-row';
  const result = { rows: [{ private: secret }] };
  const database = { query: async (sql, values) => { calls.push([sql, values]); clock += 4; return result; } };
  const sessionSql = 'SELECT id FROM auth.sessions WHERE id=$1';
  await timings.admission(async () => {
    await timings.identity(async () => { clock += 6; await timings.query(database, sessionSql, [secret]); });
    await timings.observe(async () => {
      assert.equal(await timings.query(database, AUTHENTICATED_HOSTED_CAPTURE_QUERY, [secret]), result);
      clock += 3;
    });
  });
  await timings.prepare(() => timings.observe(() => timings.query(database, AUTHENTICATED_HOSTED_CAPTURE_QUERY, [secret])));
  await timings.finish(async () => { clock += 4; });
  // Setup and cleanup are outside an action and do not inflate its cost.
  await timings.query(database, sessionSql, [secret]);
  const snapshot = timings.snapshot();
  assert.equal(snapshot.admission.totalMs, 17);
  assert.equal(snapshot.identity.totalMs, 10);
  assert.equal(snapshot.sessionQuery.totalMs, 4);
  assert.equal(snapshot.beforeObservation.totalMs, 7);
  assert.equal(snapshot.beforeCaptureQuery.totalMs, 4);
  assert.equal(snapshot.prepare.totalMs, 4);
  assert.equal(snapshot.finish.totalMs, 4);
  assert.equal(snapshot.afterCaptureQuery.count, 1);
  assert.equal(calls.length, 4);
  assert.equal(calls[0][1][0], secret);
  assert.ok(!JSON.stringify(snapshot).includes(secret));
  assert.equal(snapshot.sessionQuery.count, 1);
});

test('concurrent actions keep separate phases and expose outstanding work without serialization', async () => {
  const timings = createObservationTimings();
  const releases = [];
  const database = { query: () => new Promise(resolve => releases.push(resolve)) };
  const before = timings.admission(() => timings.query(database, AUTHENTICATED_HOSTED_CAPTURE_QUERY, []));
  const after = timings.finish(() => timings.query(database, AUTHENTICATED_HOSTED_CAPTURE_QUERY, []));
  assert.equal(releases.length, 2);
  const pending = timings.snapshot();
  assert.equal(pending.beforeCaptureQuery.inFlight, 1);
  assert.equal(pending.afterCaptureQuery.inFlight, 1);
  releases[1]('after'); releases[0]('before');
  assert.deepEqual(await Promise.all([before, after]), ['before', 'after']);
  assert.equal(timings.snapshot().beforeCaptureQuery.inFlight, 0);
  assert.equal(pending.beforeCaptureQuery.inFlight, 1, 'snapshot is detached from live counters');
});

test('failure identity and single execution survive timing; envelope rejects open metadata', async () => {
  const timings = createObservationTimings();
  const failure = new Error('private failure text');
  let calls = 0;
  await assert.rejects(timings.finish(async () => { calls++; throw failure; }), error => error === failure);
  assert.equal(calls, 1);
  const observationTimings = timings.snapshot();
  assert.equal(observationTimings.finish.failed, 1);
  const { prepare: _prepare, ...legacyObservationTimings } = observationTimings;
  assert.deepEqual(validateObservationTimings(legacyObservationTimings), legacyObservationTimings,
    'the exact retained eight-key timing vocabulary remains readable');
  const { finish: _finish, ...arbitrarilyIncomplete } = observationTimings;
  assert.equal(validateObservationTimings(arbitrarilyIncomplete), null,
    'the nine-key vocabulary cannot omit an arbitrary metric');
  const value = createAuthenticatedHostedRunDiagnostic({
    failure: { phase: 'BROWSER_EXECUTION', category: 'EXIT_NONZERO' },
    primary: { phase: 'BROWSER_EXECUTION', category: 'EXIT_NONZERO' },
    cleanup: 'verified', observationTimings,
  });
  assert.deepEqual(validateAuthenticatedHostedRunDiagnostic(value), value);
  assert.equal(validateObservationTimings({ ...observationTimings, raw: failure.message }), null);
  for (const entry of [
    { ...observationTimings.finish, raw: failure.message },
    { ...observationTimings.finish, count: '1' },
    { ...observationTimings.finish, failed: 2 },
    { ...observationTimings.finish, maxMs: Infinity },
  ]) assert.equal(validateAuthenticatedHostedRunDiagnostic({ ...value,
    observationTimings: { ...observationTimings, finish: entry } }), null);
  assert.ok(!JSON.stringify(value).includes(failure.message));
});
