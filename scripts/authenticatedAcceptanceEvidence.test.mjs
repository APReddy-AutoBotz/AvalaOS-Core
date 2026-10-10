import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { profileFixture, manifestFixture } from './authenticatedAcceptanceTestFixtures.mjs';
import { AUTHENTICATED_ACCEPTANCE_PROJECTS, AUTHENTICATED_ACCEPTANCE_TEST_IDS, AUTHENTICATED_CASE_ASSERTIONS, authenticatedAcceptanceScenario } from './authenticatedAcceptanceCases.mjs';
import { validateAuthenticatedAcceptanceManifest, evaluateAuthenticatedAcceptanceCase } from './authenticatedAcceptanceEvidence.mjs';
import { validateAuthenticatedCatalogRevision } from './authenticatedAcceptanceCriteria.mjs';

const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
const digest = value => `sha256:${value.repeat(64)}`;
const evaluate = (manifest, testId, expected = profileFixture()) => evaluateAuthenticatedAcceptanceCase({
  testCase: catalog.cases.find(c => c.testId === testId), manifest, expected, catalog,
});

test('approved catalog changes are precisely bounded and preserve the synthetic privileged write', () => {
  assert.deepEqual(validateAuthenticatedCatalogRevision(catalog), []);
  assert.equal(AUTHENTICATED_ACCEPTANCE_TEST_IDS.length, 47);
  for (const change of [
    c => { c.cases.find(x => x.testId === 'MONITOR-002').expectedMutationCount = 1; },
    c => { c.cases.find(x => x.testId === 'AI-004').expectedMutationCount = 0; },
    c => { c.criteriaChanges.readOnlyChanges.pop(); },
    c => { c.cases.find(x => x.testId === 'ASSESS-018').environment = 'hosted_sandbox'; },
  ]) { const c = structuredClone(catalog); change(c); assert.ok(validateAuthenticatedCatalogRevision(c).length); }
});

test('each of 47 cases requires its business assertions and both authenticated browser projects', () => {
  const manifest = manifestFixture();
  assert.deepEqual(validateAuthenticatedAcceptanceManifest(manifest, profileFixture(), catalog), []);
  for (const id of AUTHENTICATED_ACCEPTANCE_TEST_IDS) assert.equal(evaluate(manifest, id).status, 'PASS');
  manifest.cases = manifest.cases.filter(r => !(r.testId === 'E2E-001' && r.project === 'pixel-7-chromium'));
  assert.equal(evaluate(manifest, 'E2E-001').status, 'BLOCKED');
  assert.equal(evaluate(manifest, 'DELIVERY-001').status, 'PASS');
  manifest.cases[0].assertions.pop();
  assert.ok(validateAuthenticatedAcceptanceManifest(manifest, profileFixture(), catalog).some(e => e.includes('business-assertions')));
});

test('local auth, altered actors, duplicates, stale run, cleanup failure and provider effects cannot pass', () => {
  for (const change of [
    m => { m.binding.authKind = 'fixture_transport'; },
    m => { m.cases[0].auth.actorHash = digest('9'); },
    m => { m.cases[0].auth.sessionHash = digest('9'); },
    m => { m.cases.push(structuredClone(m.cases[0])); },
    m => { m.binding.workflow.attempt = '2'; },
    m => { m.cleanup.sessionsRevoked = false; },
    m => { m.cleanup.retainedHistoryPreserved = false; },
    m => { m.cases[0].measurements.providerCalls = 1; },
    m => { m.cases[0].ui.secretExposure = true; },
    m => { m.cases[0].observedAt = '2026-10-10T06:00:00.000Z'; },
    m => { m.cases[0].accessToken = 'forbidden'; },
  ]) {
    const m = manifestFixture(); change(m);
    assert.ok(validateAuthenticatedAcceptanceManifest(m, profileFixture(), catalog).length);
    assert.equal(evaluate(m, 'ASSESS-002').status, 'BLOCKED');
  }
});

test('read-only cases reject manufactured writes and outcome claims without measured UI observations', () => {
  for (const change of [
    row => { row.measurements.auditWrites = 1; },
    row => { row.measurements.afterHash = digest('f'); },
    row => { row.measurements.setupExcluded = false; },
    row => { row.ui.resultObserved = false; },
    row => { row.lineage.chainDigest = 'generic-fallback'; },
    row => { row.assertions[0].status = 'BLOCKED'; },
  ]) {
    const m = manifestFixture(); change(m.cases.find(r => r.testId === 'MONITOR-002'));
    assert.equal(evaluate(m, 'MONITOR-002').status, 'BLOCKED');
  }
});

test('failed generation preserves the artifact and exposes its exact operational journal', () => {
  for (const change of [
    row => { row.measurements.generationAttemptWrites = 0; },
    row => { row.measurements.receiptWrites = 0; },
    row => { row.measurements.auditWrites = 0; },
    row => { row.measurements.domainWrites = 1; },
    row => { row.measurements.afterHash = digest('f'); },
  ]) {
    const m = manifestFixture(); change(m.cases.find(r => r.testId === 'STUDIO-003'));
    assert.equal(evaluate(m, 'STUDIO-003').status, 'BLOCKED');
  }
  const m = manifestFixture();
  m.cases.find(r => r.testId === 'ADMIN-004').measurements.generationAttemptWrites = 1;
  assert.equal(evaluate(m, 'ADMIN-004').status, 'BLOCKED');
});

test('AI configuration needs its exact write, receipt and audit; real assertion failure remains FAIL', () => {
  const m = manifestFixture(); m.cases.find(r => r.testId === 'AI-004').measurements.auditWrites = 0;
  assert.equal(evaluate(m, 'AI-004').status, 'BLOCKED');
  const failed = manifestFixture(); const row = failed.cases.find(r => r.testId === 'DELIVERY-001');
  row.status = 'FAIL'; row.failureCode = 'assertion_failed'; row.assertions[0].status = 'FAIL';
  assert.equal(evaluate(failed, 'DELIVERY-001').status, 'FAIL');
  assert.equal(evaluateAuthenticatedAcceptanceCase({ testCase: catalog.cases.find(c => c.testId === 'DELIVERY-001'),
    manifest: { schemaVersion: 'local-authenticated-lifecycle-v1' }, expected: null, catalog }).status, 'BLOCKED');
});
