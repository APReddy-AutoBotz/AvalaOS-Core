import assert from 'node:assert/strict';
import {
  evaluateHostedTest,
  evaluateCompositeTest,
  evaluateRetainedTest,
  validateOracleManifest,
  validateRetainedManifest,
  validateRetainedProducerResults,
  validateServerManifest,
} from './exhaustiveAcceptanceEvidence.mjs';

const scope = { evidenceScope: 'executed-fixture', fixtureId: 'fixture-1', organizationId: '10000000-0000-4000-8000-000000000001', workspaceId: '20000000-0000-4000-8000-000000000001' };
const provenance = {
  branchId: 'BRANCH-1', testId: 'TEST-001', sourceReferences: ['tests/example.test.ts#assertion-1'], scope,
  ownership: [
    { kind: 'retained-assertion', ownerId: 'suite-a', assertionId: 'assertion-1', scenarioId: 'scenario-1' },
    { kind: 'server-assertion', ownerId: 'suite-a', assertionIds: ['assertion-1'] },
  ],
};
const expected = {
  releaseSha: 'a'.repeat(40), workflowRunId: '123', workflowAttempt: '1', environment: 'stable-release', workflowPath: '.github/workflows/exhaustive-acceptance.yml',
  branchIdsByTestId: new Map([['TEST-001', ['BRANCH-1']]]),
  provenanceByTestId: new Map([['TEST-001', provenance]]),
  canonicalCommandBySuiteId: new Map([['suite-a', 'node suite-a'], ['suite-b', 'node suite-b']]),
};
const retainedBindings = new Map([
  ['TEST-001', ['suite-a']],
  ['TEST-002', ['suite-a']],
  ['TEST-B', ['suite-b']],
]);
const retained = {
  schemaVersion: 3,
  manifestKind: 'retained',
  releaseSha: expected.releaseSha,
  workflowRunId: expected.workflowRunId,
  workflowAttempt: expected.workflowAttempt,
  environment: expected.environment,
  workflowPath: expected.workflowPath,
  suites: [
    { suiteId: 'suite-a', status: 'PASS', command: 'node suite-a' },
    { suiteId: 'suite-b', status: 'PASS', command: 'node suite-b' },
  ],
  results: [{
    suiteId: 'suite-a',
    testId: 'TEST-001',
    status: 'PASS',
    releaseSha: expected.releaseSha,
    workflowRunId: expected.workflowRunId,
    workflowAttempt: expected.workflowAttempt,
    environment: expected.environment,
    workflowPath: expected.workflowPath,
    jobId: 'suite-a',
    command: 'node suite-a',
    assertionIds: ['assertion-1'],
    scenarioIds: ['scenario-1'],
    branchIds: ['BRANCH-1'],
    sourceReferences: ['tests/example.test.ts#assertion-1'],
    scope,
    assertionOutcomes: [{ assertionId: 'assertion-1', status: 'PASS' }],
  }],
};
assert.deepEqual(validateRetainedManifest(retained, expected, retainedBindings), []);
assert.ok(validateRetainedManifest({ ...retained, releaseSha: 'b'.repeat(40) }, expected, retainedBindings).includes('release-sha'));
assert.ok(validateRetainedManifest({ ...retained, suites: [...retained.suites, retained.suites[0]] }, expected, retainedBindings).some(item => item.startsWith('duplicate-or-missing-suite:')));
assert.ok(validateRetainedManifest({ ...retained, results: [...retained.results, retained.results[0]] }, expected, retainedBindings).some(item => item.startsWith('duplicate-or-missing-result:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], releaseSha: 'b'.repeat(40) }] }, expected, retainedBindings).some(item => item.startsWith('result-release-sha:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], workflowRunId: 'stale' }] }, expected, retainedBindings).some(item => item.startsWith('result-workflow-run:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], workflowAttempt: '2' }] }, expected, retainedBindings).some(item => item.startsWith('result-workflow-attempt:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], environment: 'preview' }] }, expected, retainedBindings).some(item => item.startsWith('result-environment:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], sourceReferences: ['https://unsafe.invalid/raw'] }] }, expected, retainedBindings).some(item => item.startsWith('result-unsafe-source:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], assertionIds: [] }] }, expected, retainedBindings).some(item => item.startsWith('result-assertionIds:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], branchIds: ['WRONG'] }] }, expected, retainedBindings).some(item => item.startsWith('result-branch-mismatch:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], command: 'node wrong' }] }, expected, retainedBindings).some(item => item.startsWith('result-command:')));
assert.ok(validateRetainedManifest({ ...retained, suites: [{ ...retained.suites[0], command: 'node substituted' }, retained.suites[1]] }, expected, retainedBindings).some(item => item.startsWith('suite-command:')), 'manifest cannot redefine the canonical command');
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], scope: { ...scope, workspaceId: '20000000-0000-4000-8000-000000000099' } }] }, expected, retainedBindings).some(item => item.startsWith('result-scope-binding:')), 'wrong tenant/workspace scope must fail closed');
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], scope: { evidenceScope:'planned-fixture',fixtureId:'fixture-1',organizationId:null,workspaceId:null } }] }, expected, retainedBindings).some(item => item.startsWith('result-scope-')), 'planned scope can never support an exact PASS');
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], assertionOutcomes: [{ assertionId: 'assertion-1', status: 'BLOCKED' }] }] }, expected, retainedBindings).some(item => item.startsWith('result-status-not-derived:')), 'green result cannot hide a skipped assertion');
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], testId: 'UNBOUND-001' }] }, expected, retainedBindings).some(item => item.startsWith('result-binding-mismatch:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], suiteId: 'missing-suite' }] }, expected, retainedBindings).some(item => item.startsWith('result-suite-missing:')));
const serverExpected = { ...expected, environment: 'disposable-ci' };
const serverManifest = {
  ...retained,
  manifestKind: 'server',
  environment: 'disposable-ci',
  suites: [{ suiteId: 'suite-a', status: 'PASS', command: 'node suite-a' }],
  results: [{ ...retained.results[0], environment: 'disposable-ci' }],
};
assert.deepEqual(validateServerManifest(serverManifest, serverExpected, retainedBindings), []);
assert.ok(validateServerManifest({ ...serverManifest, manifestKind: 'retained' }, serverExpected, retainedBindings).includes('server-manifest-kind'));
assert.ok(validateServerManifest({ ...serverManifest, workflowRunId: 'other-run' }, serverExpected, retainedBindings).includes('workflow-run'));
assert.ok(validateServerManifest({ ...serverManifest, workflowAttempt: '2' }, serverExpected, retainedBindings).includes('workflow-attempt'));
assert.ok(validateServerManifest({ ...serverManifest, results: [...serverManifest.results, serverManifest.results[0]] }, serverExpected, retainedBindings).some(item => item.startsWith('duplicate-or-missing-result:')));

const suiteIndex = new Map(retained.suites.map(item => [item.suiteId, item]));
const resultIndex = new Map(retained.results.map(item => [`${item.suiteId}:${item.testId}`, item]));
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'PASS');
assert.equal(evaluateRetainedTest({ testId: 'TEST-002', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'BLOCKED', 'aggregate suite PASS cannot promote an unproven configured Test ID');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['missing'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'BLOCKED');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex: new Map([['suite-a', { suiteId: 'suite-a', status: 'FAIL' }]]), resultIndex, manifestErrors: [] }).status, 'FAIL');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex: new Map([['suite-a:TEST-001', { ...retained.results[0], status: 'FAIL' }]]), manifestErrors: [] }).status, 'FAIL');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex: new Map([['suite-a:TEST-001', { ...retained.results[0], status: 'BLOCKED' }]]), manifestErrors: [] }).status, 'BLOCKED');

const suiteA = { suiteId: 'suite-a', testIds: ['TEST-001', 'TEST-002'] };
const emitted = { schemaVersion: 2, results: [retained.results[0]] };
assert.deepEqual(validateRetainedProducerResults({ suite: suiteA, emitted, identity: expected, provenanceByTestId: expected.provenanceByTestId }), []);
assert.ok(validateRetainedProducerResults({ suite: suiteA, emitted: { schemaVersion: 2, results: [{ ...retained.results[0], suiteId: 'suite-b', testId: 'TEST-B' }] }, identity: expected, provenanceByTestId: expected.provenanceByTestId }).some(item => item.startsWith('producer-suite-mismatch:')), 'suite-a process cannot impersonate suite-b evidence');
assert.ok(validateRetainedProducerResults({ suite: suiteA, emitted: { schemaVersion: 2, results: [{ ...retained.results[0], testId: 'TEST-B' }] }, identity: expected, provenanceByTestId: expected.provenanceByTestId }).some(item => item.startsWith('producer-test-id-mismatch:')), 'producer cannot emit a Test ID outside its own configured suite');

const oracle = {
  schemaVersion: 1,
  releaseSha: expected.releaseSha,
  workflowRunId: expected.workflowRunId,
  workflowAttempt: expected.workflowAttempt,
  results: [{ testId: 'ASSESS-005', status: 'PASS' }],
};
assert.deepEqual(validateOracleManifest(oracle, expected), []);
assert.ok(validateOracleManifest({ ...oracle, results: [...oracle.results, oracle.results[0]] }, expected).some(item => item.startsWith('duplicate-or-missing-oracle:')));

const passedExecution = {
  title: '[SANDBOX-001] Sandbox: access',
  project: 'desktop-chromium',
  results: [{ status: 'passed', attachments: [] }],
};
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  executions: [passedExecution],
  requiredProjects: ['desktop-chromium'],
}).status, 'PASS');
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  executions: [],
  requiredProjects: ['desktop-chromium'],
}).status, 'BLOCKED');
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  executions: [passedExecution, passedExecution],
  requiredProjects: ['desktop-chromium'],
}).status, 'BLOCKED');
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  executions: [{ ...passedExecution, results: [{ status: 'failed', error: { message: 'deterministic failure' }, attachments: [] }] }],
  requiredProjects: ['desktop-chromium'],
}).status, 'FAIL');

assert.equal(evaluateCompositeTest([{ name: 'hosted', status: 'PASS' }, { name: 'server', status: 'PASS' }]).status, 'PASS');
assert.equal(evaluateCompositeTest([{ name: 'hosted', status: 'PASS' }, { name: 'server', status: 'BLOCKED' }]).status, 'BLOCKED');
assert.equal(evaluateCompositeTest([{ name: 'hosted', status: 'PASS' }, { name: 'server', status: 'FAIL' }]).status, 'FAIL');

console.log('Exhaustive acceptance evidence adversarial tests passed.');
