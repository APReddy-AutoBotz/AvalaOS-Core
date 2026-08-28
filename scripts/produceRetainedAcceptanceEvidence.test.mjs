import assert from 'node:assert/strict';
import { loadExecutionBindings, loadSourceProvenance } from './exhaustiveAcceptanceModel.mjs';
import { produceRetainedAcceptanceEvidence } from './produceRetainedAcceptanceEvidence.mjs';
import { validateRetainedManifest, evaluateRetainedTest } from './exhaustiveAcceptanceEvidence.mjs';

const bindings = loadExecutionBindings();
const suite = bindings.retainedSuites.find(item => item.testIds.length);
const testId = suite.testIds[0];
const provenance = loadSourceProvenance().contracts.find(item => item.testId === testId);
const owner = provenance.ownership.find(item => item.kind === 'retained-assertion' && item.ownerId === suite.suiteId);
const executedProvenance = {...provenance,scope:{...provenance.scope,evidenceScope:'executed-fixture',organizationId:'10000000-0000-4000-8000-000000000001',workspaceId:'20000000-0000-4000-8000-000000000001'}};
const identity = {
  releaseSha: 'a'.repeat(40), workflowRunId: '1', workflowAttempt: '1',
  environment: 'pull-request', workflowPath: '.github/workflows/exhaustive-acceptance.yml',
};
const explicitResult = {
  testId,
  status: 'PASS',
  assertionIds: [owner.assertionId],
  assertionOutcomes: [{ assertionId: owner.assertionId, status: 'PASS' }],
  scenarioIds: [owner.scenarioId],
  branchIds: [provenance.branchId],
  sourceReferences: provenance.sourceReferences,
  scope: executedProvenance.scope,
};

assert.throws(
  () => produceRetainedAcceptanceEvidence({ suite, identity }),
  /RETAINED_ASSERTION_RESULTS_REQUIRED/,
  'aggregate suite success and catalog metadata cannot synthesize Test-ID PASS',
);

const produced = produceRetainedAcceptanceEvidence({ suite, identity, assertionResults: [explicitResult] });
assert.equal(produced.schemaVersion, 2);
assert.deepEqual(produced.results.map(item => item.testId), [testId]);

const manifest = {
  schemaVersion: 3,
  manifestKind: 'retained',
  ...identity,
  suites: [{ suiteId: suite.suiteId, status: 'PASS', command: suite.command.join(' ') }],
  results: produced.results,
};
const expected = {
  ...identity,
  branchIdsByTestId: new Map([[testId, [provenance.branchId]]]),
  provenanceByTestId: new Map([[testId, executedProvenance]]),
  canonicalCommandBySuiteId: new Map([[suite.suiteId, suite.command.join(' ')]]),
};
assert.deepEqual(validateRetainedManifest(manifest, expected, new Map([[testId, [suite.suiteId]]])), []);

const suiteIndex = new Map([[suite.suiteId, manifest.suites[0]]]);
assert.equal(evaluateRetainedTest({
  testId,
  requiredSuiteIds: [suite.suiteId],
  suiteIndex,
  resultIndex: new Map(),
  manifestErrors: [],
}).status, 'BLOCKED', 'missing exact assertion output must remain blocked under a green suite');

const skipped = structuredClone(produced.results[0]);
skipped.status = 'BLOCKED';
skipped.assertionOutcomes[0].status = 'BLOCKED';
assert.equal(evaluateRetainedTest({
  testId,
  requiredSuiteIds: [suite.suiteId],
  suiteIndex,
  resultIndex: new Map([[suite.suiteId + ':' + testId, skipped]]),
  manifestErrors: [],
}).status, 'BLOCKED', 'a skipped assertion cannot inherit aggregate suite PASS');

console.log('Retained acceptance evidence requires explicit scoped assertion outputs; aggregate, missing, and skipped results fail closed.');
