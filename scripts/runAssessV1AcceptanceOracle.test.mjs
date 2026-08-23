import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-oracle-binding-'));
const manifestPath = path.join(temp, 'oracle.json');
const sutManifestPath = path.join(temp, 'sut.json');
const governanceManifestPath = path.join(temp, 'governance.json');
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
    GOVERNANCE_SUT_RESULTS_MANIFEST: governanceManifestPath,
    ...extra,
  },
});

try {
  const exact = run();
  assert.equal(exact.status, 0, exact.stderr);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.environment, 'pull-request');
  assert.equal(manifest.workflowAttempt, identity.GITHUB_RUN_ATTEMPT);
  assert.equal(manifest.command, 'node scripts/runAssessV1AcceptanceOracle.mjs');
  assert.equal(manifest.results.length, 13);
  assert.equal(manifest.results.every(item => item.status === 'BLOCKED'), true, 'planned fixture scope must remain BLOCKED even when every oracle assertion is green');
  assert.equal(manifest.results.every(item => item.assertionOutcomes.length === 1 && item.assertionOutcomes[0].status === 'PASS'), true);
  assert.equal(manifest.results.every(item => item.scope.evidenceScope === 'planned-fixture' && item.scope.organizationId === null && item.scope.workspaceId === null), true);

  const stable = run({ ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'stable-release' });
  assert.equal(stable.status, 0, stable.stderr);
  const stableManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(stableManifest.environment, 'stable-release');
  assert.equal(stableManifest.results.every(item => item.status === 'BLOCKED'), true, 'stable execution also requires separately validated executed scope before promotion');

  assert.notEqual(run({ ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'substituted-preview' }).status, 0, 'non-canonical environment must fail before execution');
  assert.notEqual(run({ ACCEPTANCE_WORKFLOW_PATH: '.github/workflows/substituted.yml' }).status, 0, 'substituted workflow must fail before execution');

  const bindings = JSON.parse(readFileSync('tests/acceptance/execution-bindings.json', 'utf8'));
  const provenance = JSON.parse(readFileSync('tests/acceptance/source-provenance.json', 'utf8'));
  const proofOwners = JSON.parse(readFileSync('tests/acceptance/proof-owner-registry.json', 'utf8'));
  bindings.oracleTests.find(item => item.testId === 'ASSESS-005').scenario = 'coordinated-fake-scenario';
  provenance.contracts.find(item => item.testId === 'ASSESS-005').ownership[0] = {
    kind: 'oracle-scenario', ownerId: 'coordinated-fake-scenario',
    assertionIds: ['assess-v1-oracle::ASSESS-005::coordinated-fake-scenario'], scenarioIds: ['coordinated-fake-scenario'],
  };
  proofOwners.contracts.find(item => item.testId === 'ASSESS-005').ownership = structuredClone(provenance.contracts.find(item => item.testId === 'ASSESS-005').ownership);
  const bindingPath = path.join(temp, 'substituted-bindings.json');
  const provenancePath = path.join(temp, 'substituted-provenance.json');
  const proofOwnersPath = path.join(temp, 'substituted-proof-owners.json');
  writeFileSync(bindingPath, JSON.stringify(bindings));
  writeFileSync(provenancePath, JSON.stringify(provenance));
  writeFileSync(proofOwnersPath, JSON.stringify(proofOwners));
  const coordinated = run({ ACCEPTANCE_BINDINGS: bindingPath, ACCEPTANCE_PROVENANCE: provenancePath, ACCEPTANCE_PROOF_OWNERS: proofOwnersPath });
  assert.notEqual(coordinated.status, 0, 'coordinated binding, provenance, and registry substitution must fail against the source contract');
  assert.match(coordinated.stderr, /proof-owner-source-contract/u);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('assessment oracle exact execution and planned-scope binding tests passed');
