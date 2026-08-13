import assert from 'node:assert/strict';
import {
  evaluateHostedTest,
  evaluateRetainedTest,
  validateOracleManifest,
  validateRetainedManifest,
  validateRetainedProducerResults,
} from './exhaustiveAcceptanceEvidence.mjs';

const expected = { releaseSha: 'a'.repeat(40), workflowRunId: '123', workflowAttempt: '1' };
const retainedBindings = new Map([
  ['TEST-001', ['suite-a']],
  ['TEST-002', ['suite-a']],
  ['TEST-B', ['suite-b']],
]);
const retained = {
  schemaVersion: 2,
  releaseSha: expected.releaseSha,
  workflowRunId: expected.workflowRunId,
  workflowAttempt: expected.workflowAttempt,
  suites: [
    { suiteId: 'suite-a', status: 'PASS' },
    { suiteId: 'suite-b', status: 'PASS' },
  ],
  results: [{
    suiteId: 'suite-a',
    testId: 'TEST-001',
    status: 'PASS',
    releaseSha: expected.releaseSha,
    workflowRunId: expected.workflowRunId,
    workflowAttempt: expected.workflowAttempt,
  }],
};
assert.deepEqual(validateRetainedManifest(retained, expected, retainedBindings), []);
assert.ok(validateRetainedManifest({ ...retained, releaseSha: 'b'.repeat(40) }, expected, retainedBindings).includes('release-sha'));
assert.ok(validateRetainedManifest({ ...retained, suites: [...retained.suites, retained.suites[0]] }, expected, retainedBindings).some(item => item.startsWith('duplicate-or-missing-suite:')));
assert.ok(validateRetainedManifest({ ...retained, results: [...retained.results, retained.results[0]] }, expected, retainedBindings).some(item => item.startsWith('duplicate-or-missing-result:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], releaseSha: 'b'.repeat(40) }] }, expected, retainedBindings).some(item => item.startsWith('result-release-sha:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], workflowRunId: 'stale' }] }, expected, retainedBindings).some(item => item.startsWith('result-workflow-run:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], workflowAttempt: '2' }] }, expected, retainedBindings).some(item => item.startsWith('result-workflow-attempt:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], testId: 'UNBOUND-001' }] }, expected, retainedBindings).some(item => item.startsWith('result-binding-mismatch:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], suiteId: 'missing-suite' }] }, expected, retainedBindings).some(item => item.startsWith('result-suite-missing:')));

const suiteIndex = new Map(retained.suites.map(item => [item.suiteId, item]));
const resultIndex = new Map(retained.results.map(item => [`${item.suiteId}:${item.testId}`, item]));
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'PASS');
assert.equal(evaluateRetainedTest({ testId: 'TEST-002', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'BLOCKED', 'aggregate suite PASS cannot promote an unproven configured Test ID');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['missing'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'BLOCKED');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex: new Map([['suite-a', { suiteId: 'suite-a', status: 'FAIL' }]]), resultIndex, manifestErrors: [] }).status, 'FAIL');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex: new Map([['suite-a:TEST-001', { ...retained.results[0], status: 'FAIL' }]]), manifestErrors: [] }).status, 'FAIL');

const suiteA = { suiteId: 'suite-a', testIds: ['TEST-001', 'TEST-002'] };
assert.deepEqual(validateRetainedProducerResults({ suite: suiteA, emitted: { results: [retained.results[0]] } }), []);
assert.ok(validateRetainedProducerResults({ suite: suiteA, emitted: { results: [{ ...retained.results[0], suiteId: 'suite-b', testId: 'TEST-B' }] } }).some(item => item.startsWith('producer-suite-mismatch:')), 'suite-a process cannot impersonate suite-b evidence');
assert.ok(validateRetainedProducerResults({ suite: suiteA, emitted: { results: [{ ...retained.results[0], testId: 'TEST-B' }] } }).some(item => item.startsWith('producer-test-id-mismatch:')), 'producer cannot emit a Test ID outside its own configured suite');

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

console.log('Exhaustive acceptance evidence adversarial tests passed.');
