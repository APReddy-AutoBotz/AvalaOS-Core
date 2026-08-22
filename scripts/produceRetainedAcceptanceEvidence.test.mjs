import assert from 'node:assert/strict';
import { loadExecutionBindings, retainedBindingMap } from './exhaustiveAcceptanceModel.mjs';
import { produceRetainedAcceptanceEvidence } from './produceRetainedAcceptanceEvidence.mjs';
import { validateRetainedManifest } from './exhaustiveAcceptanceEvidence.mjs';

const suites = loadExecutionBindings().retainedSuites.filter(item => item.testIds.length);
const identity = { releaseSha: 'a'.repeat(40), workflowRunId: '1', workflowAttempt: '1', environment: 'pull-request', workflowPath: '.github/workflows/exhaustive-acceptance.yml' };
const all = suites.flatMap(suite => produceRetainedAcceptanceEvidence({ suite, identity }).results);
assert.equal(all.length, 60);
assert.equal(new Set(all.map(item => item.testId)).size, 60);
for (const item of all) assert.ok(item.assertionIds.length && item.scenarioIds.length && item.branchIds.length && item.sourceReferences.length);
const branchIdsByTestId = new Map(all.map(item => [item.testId, item.branchIds]));
const manifest = {
  schemaVersion: 3, manifestKind: 'retained', ...identity,
  suites: suites.map(suite => ({ suiteId: suite.suiteId, status: 'PASS', command: suite.command.join(' ') })),
  results: all,
};
assert.deepEqual(validateRetainedManifest(manifest, { ...identity, branchIdsByTestId }, retainedBindingMap(loadExecutionBindings())), []);
const target = 'GOVERN-004';
const withheld = suites.flatMap(suite => produceRetainedAcceptanceEvidence({ suite, identity, withheldTestIds: [target] }).results);
assert.equal(withheld.length, 59);
assert.equal(withheld.some(item => item.testId === target), false);
assert.deepEqual(withheld.map(item => item.testId), all.filter(item => item.testId !== target).map(item => item.testId));
console.log('Retained acceptance producers emitted 60 independently withholdable exact Test IDs.');
