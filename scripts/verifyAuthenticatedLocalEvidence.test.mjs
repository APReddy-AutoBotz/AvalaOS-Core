import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { AUTHENTICATED_ACCEPTANCE_PROJECTS, AUTHENTICATED_ACCEPTANCE_TEST_IDS, AUTHENTICATED_CASE_ASSERTIONS } from './authenticatedAcceptanceCases.mjs';
import { AUTHENTICATED_LOCAL_COUNTERS, authenticatedLocalDigest, createAuthenticatedLocalManifest, validateAuthenticatedLocalEvidence } from './verifyAuthenticatedLocalEvidence.mjs';

// Invented validator input only. No data from this file is product evidence.
const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
const sourceDigests = [{ path: 'validator-fixture-only', sha256: authenticatedLocalDigest('fixture') }];
const execution = { headSha: 'a'.repeat(40), runId: '123', runAttempt: '1', executionId: 'validator-only-00000001',
  startedAt: '2026-10-10T00:00:00.000Z', completedAt: '2026-10-10T00:01:00.000Z' };
const options = { execution, sourceDigests, catalog };
const fixture = () => createAuthenticatedLocalManifest({ execution, sourceDigests,
  cleanup: { database: true, server: true, preview: true, browserState: true, secretBackend: true },
  cases: AUTHENTICATED_ACCEPTANCE_TEST_IDS.flatMap(testId => AUTHENTICATED_ACCEPTANCE_PROJECTS.map(project => {
    const mutation = catalog.cases.find(c => c.testId === testId).expectedMutationCount;
    const before = Object.fromEntries(AUTHENTICATED_LOCAL_COUNTERS.map(key => [key, 0]));
    const delta = { ...before, logicalMutations: mutation, domainWrites: mutation,
      receiptWrites: testId === 'STUDIO-003' ? 1 : mutation, auditWrites: testId === 'STUDIO-003' ? 2 : mutation,
      generationAttemptWrites: testId === 'STUDIO-003' ? 1 : 0, secretWrites: testId === 'AI-004' ? 1 : 0 };
    return { testId, project, status: 'passed', proofMode: 'actual-ui',
      sourceBinding: { executionId: execution.executionId, sourceDigestSetHash: authenticatedLocalDigest(sourceDigests) },
      controls: { assertions: AUTHENTICATED_CASE_ASSERTIONS[testId].map(id => ({ id, status: 'passed' })) },
      observations: { browser: { actions: [{ action: 'click', target: 'fixture-only' }], result: { observed: true,
        ...(testId === 'STUDIO-003' ? { reservationCounterAdvancedExactlyOnce: true } : {}) } },
        api: { productionRoutes: ['/functions/v1/fixture-only'], responses: [{ classification: 'OBSERVED', status: 200 }] } },
      measurements: { setupExcluded: true, before, after: { ...delta }, delta,
        stateBeforeHash: authenticatedLocalDigest('before'), stateAfterHash: authenticatedLocalDigest(mutation ? 'after' : 'before') },
      cleanup: { verified: true } };
  })),
});

test('local verifier requires all 47 cases in both projects and preserves local-only identity', () => {
  assert.deepEqual(validateAuthenticatedLocalEvidence(fixture(), options), []);
  const missing = fixture(); missing.cases.pop();
  assert.ok(validateAuthenticatedLocalEvidence(missing, options).some(e => e.startsWith('local-case-missing')));
  const forged = fixture(); forged.authKind = 'supabase_auth';
  assert.deepEqual(validateAuthenticatedLocalEvidence(forged, options), ['local-profile-invalid']);
});

test('source, execution, real actions, assertions and independent cleanup cannot be substituted', () => {
  for (const change of [
    m => { m.sourceDigests = []; },
    m => { m.execution = { ...m.execution, runAttempt: '2' }; },
    m => { m.cases[0].sourceBinding.executionId = 'another-execution'; },
    m => { m.cases[0].controls.assertions.pop(); },
    m => { m.cases[0].observations.browser.actions = []; },
    m => { m.cases[0].observations.rawResponse = 'unapproved detail'; },
    m => { m.cases[0].observations.browser.result.observed = false; },
    m => { m.cases[0].proofMode = 'actual-api'; },
    m => { m.cases[0].status = 'blocked'; },
    m => { m.cleanup.secretBackend = false; },
    m => { m.cases[0].cleanup.verified = false; },
    m => { m.cases.push(structuredClone(m.cases[0])); },
  ]) { const manifest = fixture(); change(manifest); assert.ok(validateAuthenticatedLocalEvidence(manifest, options).length); }
});

test('actual counters must reconcile and zero-write queries cannot conceal effects', () => {
  for (const change of [
    row => { row.measurements.delta.auditWrites = 1; },
    row => { row.measurements.after.providerCalls = row.measurements.delta.providerCalls = 1; },
    row => { row.measurements.after.auditWrites = row.measurements.delta.auditWrites = 1; },
    row => { row.measurements.stateAfterHash = authenticatedLocalDigest('changed'); },
    row => { row.measurements.setupExcluded = false; },
    row => { row.measurements.before = null; },
  ]) {
    const manifest = fixture(); change(manifest.cases.find(c => c.testId === 'MONITOR-002'));
    assert.ok(validateAuthenticatedLocalEvidence(manifest, options).length);
  }
  const manifest = fixture();
  const failure = manifest.cases.find(c => c.testId === 'STUDIO-003');
  failure.measurements.after.auditWrites = failure.measurements.delta.auditWrites = 0;
  assert.ok(validateAuthenticatedLocalEvidence(manifest, options).some(e => e.includes('journal')));
  const omittedReservation = fixture();
  delete omittedReservation.cases.find(c => c.testId === 'STUDIO-003').observations.browser.result.reservationCounterAdvancedExactlyOnce;
  assert.ok(validateAuthenticatedLocalEvidence(omittedReservation, options).some(e => e.includes('reservation-measurement')));
  const unaudited = fixture();
  const approval = unaudited.cases.find(c => c.testId === 'GOVERN-005');
  approval.measurements.after.auditWrites = approval.measurements.delta.auditWrites = 0;
  assert.ok(validateAuthenticatedLocalEvidence(unaudited, options).some(e => e.includes('privileged-audit')));
});
