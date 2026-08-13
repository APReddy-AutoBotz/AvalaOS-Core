import assert from 'node:assert/strict';
import {
  evaluateHostedTest,
  evaluateRetainedTest,
  validateOracleManifest,
  validateRetainedManifest,
} from './exhaustiveAcceptanceEvidence.mjs';

const expected = { releaseSha: 'a'.repeat(40), workflowRunId: '123', workflowAttempt: '1' };
const retained = {
  schemaVersion: 1,
  releaseSha: expected.releaseSha,
  workflowRunId: expected.workflowRunId,
  workflowAttempt: expected.workflowAttempt,
  suites: [{ suiteId: 'suite-a', status: 'PASS' }],
};
assert.deepEqual(validateRetainedManifest(retained, expected), []);
assert.ok(validateRetainedManifest({ ...retained, releaseSha: 'b'.repeat(40) }, expected).includes('release-sha'));
assert.ok(validateRetainedManifest({ ...retained, suites: [...retained.suites, retained.suites[0]] }, expected).some(item => item.startsWith('duplicate-or-missing-suite:')));

const suiteIndex = new Map(retained.suites.map(item => [item.suiteId, item]));
assert.equal(evaluateRetainedTest({ requiredSuiteIds: ['suite-a'], suiteIndex, manifestErrors: [] }).status, 'PASS');
assert.equal(evaluateRetainedTest({ requiredSuiteIds: ['missing'], suiteIndex, manifestErrors: [] }).status, 'BLOCKED');
assert.equal(evaluateRetainedTest({ requiredSuiteIds: ['suite-a'], suiteIndex: new Map([['suite-a', { suiteId: 'suite-a', status: 'FAIL' }]]), manifestErrors: [] }).status, 'FAIL');

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
