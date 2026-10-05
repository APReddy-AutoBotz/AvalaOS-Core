import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-oracle-binding-'));
const manifestPath = path.join(temp, 'oracle.json');
const sutManifestPath = path.join(temp, 'sut.json');
const identity = {
  RELEASE_SHA: 'a'.repeat(40),
  GITHUB_RUN_ID: '123456',
  GITHUB_RUN_ATTEMPT: '2',
  ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request',
  ACCEPTANCE_WORKFLOW_PATH: '.github/workflows/exhaustive-acceptance.yml',
};
const run = extra => spawnSync(process.execPath, ['scripts/runAssessV1AcceptanceOracle.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    ...identity,
    ORACLE_RESULTS_MANIFEST: manifestPath,
    SUT_RESULTS_MANIFEST: sutManifestPath,
    ...extra,
  },
});

try {
  const exact = run();
  assert.equal(exact.status, 0, exact.stderr);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sut = JSON.parse(readFileSync(sutManifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(sut.schemaVersion, 2);
  assert.equal(manifest.environment, 'pull-request');
  assert.equal(manifest.workflowAttempt, identity.GITHUB_RUN_ATTEMPT);
  assert.equal(manifest.command, 'node scripts/runAssessV1AcceptanceOracle.mjs');
  assert.deepEqual(manifest.evidenceIdentity, sut.evidenceIdentity);
  assert.equal(manifest.results.length, 13);
  assert.equal(sut.results.length, 13);
  assert.equal(new Set(manifest.results.map(item => item.testId)).size, 13);
  assert.equal(manifest.results.every(item => item.status === 'PASS'), true);
  assert.equal(manifest.results.every(item => item.assertionOutcomes.length === 1 && item.assertionOutcomes[0].status === 'PASS'), true);
  assert.equal(manifest.results.every(item => item.persistentMutationCount === 0), true);
  assert.equal(manifest.results.every(item => item.scope.evidenceScope === 'executed-deterministic-oracle'
    && item.scope.fixtureId === 'TRANSCRIPT-001'
    && item.scope.persistentMutationCount === 0
    && !('organizationId' in item.scope)
    && !('workspaceId' in item.scope)), true);
  assert.equal(manifest.results.every(item => item.actual.matched === true
    && JSON.stringify(item.actual.oracle) === JSON.stringify(item.actual.production)), true);
  assert.equal(new Set(manifest.results.map(item => item.inputDigest)).size, 12, 'only ASSESS-009 and ASSESS-015 intentionally share the same exact input');
  for (const digest of [
    ...Object.values(manifest.evidenceIdentity.sourceDigests),
    manifest.evidenceIdentity.fixture.digest,
    manifest.evidenceIdentity.scenarioContractDigest,
    ...manifest.results.flatMap(item => [item.inputDigest, item.oracleOutputDigest, item.productionOutputDigest]),
  ]) assert.match(digest, /^sha256:[0-9a-f]{64}$/u);

  const stable = run({ ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'stable-release' });
  assert.equal(stable.status, 0, stable.stderr);
  const stableManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(stableManifest.environment, 'stable-release');
  assert.equal(stableManifest.results.every(item => item.status === 'PASS'), true);

  assert.notEqual(run({ ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'substituted-preview' }).status, 0, 'non-canonical environment must fail before execution');
  assert.notEqual(run({ ACCEPTANCE_WORKFLOW_PATH: '.github/workflows/substituted.yml' }).status, 0, 'substituted workflow must fail before execution');

  const plannedProvenance = JSON.parse(readFileSync('tests/acceptance/source-provenance.json', 'utf8'));
  for (const contract of plannedProvenance.contracts) {
    if (/^ASSESS-0(?:0[5-9]|1[0-7])$/u.test(contract.testId)) {
      contract.scope = { evidenceScope: 'planned-fixture', fixtureId: 'TRANSCRIPT-001', organizationId: null, workspaceId: null };
    }
  }
  const plannedPath = path.join(temp, 'planned-provenance.json');
  writeFileSync(plannedPath, JSON.stringify(plannedProvenance));
  const planned = run({ ACCEPTANCE_PROVENANCE: plannedPath });
  assert.equal(planned.status, 0, planned.stderr);
  const plannedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(plannedManifest.results.every(item => item.status === 'BLOCKED'), true, 'planned scope cannot be promoted by green calculations');
  assert.equal(plannedManifest.results.every(item => item.scope.evidenceScope === 'planned-fixture'), true);

  const bindings = JSON.parse(readFileSync('tests/acceptance/execution-bindings.json', 'utf8'));
  bindings.oracleTests.find(item => item.testId === 'ASSESS-005').scenario = 'coordinated-fake-scenario';
  const bindingPath = path.join(temp, 'substituted-bindings.json');
  writeFileSync(bindingPath, JSON.stringify(bindings));
  const coordinated = run({ ACCEPTANCE_BINDINGS: bindingPath });
  assert.notEqual(coordinated.status, 0, 'coordinated scenario substitution must fail against the fixed 13-case input contract');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('assessment oracle exact comparator, identity, and scope tests passed');
