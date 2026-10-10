import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { manifestFixture } from './authenticatedAcceptanceTestFixtures.mjs';
import { canonicalDigest } from './assessV1OracleEvidence.mjs';
import { canonicalSourceSha256 } from './exhaustiveAcceptanceModel.mjs';
import { AUTHENTICATED_ACCEPTANCE_TEST_IDS } from './authenticatedAcceptanceCases.mjs';

// This test exercises report rejection with invented data in a private temp
// directory. It does not execute product cases or publish acceptance evidence.
test('aggregate report separates real-auth contract data from local, partial and stale proof', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avalaos-authenticated-report-test-'));
  const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
  const provenance = JSON.parse(fs.readFileSync('tests/acceptance/source-provenance.json', 'utf8'));
  for (const ref of Object.keys(provenance.sourceDigests)) provenance.sourceDigests[ref] = canonicalSourceSha256(fs.readFileSync(ref));
  const provenancePath = path.join(directory, 'test-provenance.json');
  fs.writeFileSync(provenancePath, JSON.stringify(provenance));
  const manifest = manifestFixture();
  const p = manifest.binding;
  p.catalogDigest = canonicalDigest(catalog);
  p.sourceDigest = canonicalDigest(provenance.sourceDigests);
  const environment = {
    ...process.env, ACCEPTANCE_RESULTS_DIR: directory, ACCEPTANCE_PROVENANCE: provenancePath,
    AUTHENTICATED_RESULTS_MANIFEST: path.join(directory, 'input.json'),
    RETAINED_RESULTS_MANIFEST: path.join(directory, 'absent-retained.json'),
    ORACLE_RESULTS_MANIFEST: path.join(directory, 'absent-oracle.json'),
    SERVER_RESULTS_MANIFEST: path.join(directory, 'absent-server.json'),
    PLAYWRIGHT_JSON: path.join(directory, 'absent-browser.json'),
    ACCEPTANCE_EXECUTION_DISPOSITION: 'EXECUTED',
    AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: p.executionKind,
    AUTHENTICATED_ACCEPTANCE_AUTH_KIND: p.authKind,
    RELEASE_SHA: p.releaseSha, GITHUB_SHA: p.checkoutSha,
    HOSTED_PILOT_URL: p.origin, NETLIFY_DEPLOY_ID: p.deploymentId,
    GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: p.workflow.repository,
    GITHUB_WORKFLOW_REF: p.workflow.ref, GITHUB_EVENT_NAME: p.workflow.event,
    GITHUB_RUN_ID: p.workflow.runId, GITHUB_RUN_ATTEMPT: p.workflow.attempt, GITHUB_JOB: p.workflow.job,
    AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST: p.backendDigest,
    AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: p.migrationVersion,
    AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST: p.migrationDigest,
    AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST: p.exerciseDigest,
    AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST: p.baselineDigest,
    AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY: 'true', AUTHENTICATED_ACCEPTANCE_PRODUCTION: 'false',
    AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA: 'false', AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED: 'false',
    AUTHENTICATED_ACCEPTANCE_PAID_CALLS: 'false',
    AUTHENTICATED_ACCEPTANCE_ACTOR_BINDINGS: JSON.stringify(p.actors),
    AUTHENTICATED_ACCEPTANCE_STARTED_AT: p.window.startedAt,
    AUTHENTICATED_ACCEPTANCE_COMPLETED_AT: p.window.completedAt,
  };
  const run = (input, extra = {}) => {
    fs.writeFileSync(environment.AUTHENTICATED_RESULTS_MANIFEST, JSON.stringify(input));
    const child = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
      env: { ...environment, ...extra }, encoding: 'utf8', windowsHide: true,
    });
    assert.ok([0, 1].includes(child.status));
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'acceptance-results.json'), 'utf8'));
    assert.equal(report.results.length, 108, child.stderr);
    return report.results.filter(row => AUTHENTICATED_ACCEPTANCE_TEST_IDS.includes(row.testId));
  };
  try {
    assert.equal(run(manifest).filter(row => row.status === 'PASS').length, 47);
    for (const [change, extra] of [
      [m => { m.binding.authKind = 'fixture_transport'; }, {}],
      [m => { m.binding.workflow.attempt = '2'; }, {}],
      [m => { m.cleanup.sessionsRevoked = false; }, {}],
      [m => m, { GITHUB_ACTIONS: 'false' }],
      [m => m, { ACCEPTANCE_EXECUTION_DISPOSITION: 'NOT_EXECUTED' }],
    ]) {
      const candidate = structuredClone(manifest); change(candidate);
      assert.ok(run(candidate, extra).every(row => row.status === 'BLOCKED'));
    }
    const partial = structuredClone(manifest);
    partial.cases = partial.cases.filter(row => !(row.testId === 'MONITOR-002' && row.project === 'pixel-7-chromium'));
    assert.equal(run(partial).find(row => row.testId === 'MONITOR-002').status, 'BLOCKED');
    const failed = structuredClone(manifest);
    const row = failed.cases.find(item => item.testId === 'DELIVERY-001');
    row.status = 'FAIL'; row.failureCode = 'assertion_failed'; row.assertions[0].status = 'FAIL';
    assert.equal(run(failed).find(item => item.testId === 'DELIVERY-001').status, 'FAIL');
  } finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('avalaos-authenticated-report-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
