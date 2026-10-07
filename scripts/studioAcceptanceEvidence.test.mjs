import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  STUDIO_ACCEPTANCE_EXACT_ACTUAL,
  STUDIO_ACCEPTANCE_SOURCE_REFERENCES,
  STUDIO_ACCEPTANCE_TEST_IDS,
  buildStudioAcceptanceProducer,
  currentStudioAcceptanceSourceDigests,
  validateStudioAcceptanceActuals,
  validateStudioAcceptanceProducer,
} from './studioAcceptanceEvidence.mjs';

const fixtureActuals = JSON.parse(readFileSync('tests/acceptance/fixtures/studio-evidence-unit-results.json', 'utf8'));
const identity = {
  releaseSha: 'a'.repeat(40),
  workflowRunId: '123',
  workflowAttempt: '2',
  environment: 'ci-disposable-postgres',
  workflowPath: '.github/workflows/exhaustive-acceptance.yml',
};
const command = 'node scripts/testStudioAcceptancePostgres.mjs';

test('Studio exact actual fixture is complete and canonical', () => {
  assert.deepEqual(fixtureActuals, STUDIO_ACCEPTANCE_EXACT_ACTUAL);
  assert.deepEqual(validateStudioAcceptanceActuals(fixtureActuals), []);
});

test('Studio producer binds exact identity, sources, branches and actuals', () => {
  const emitted = buildStudioAcceptanceProducer({
    actualByTestId: fixtureActuals,
    identity,
    command,
    cleanupVerified: true,
  });
  assert.equal(emitted.results.length, 7);
  assert.deepEqual(validateStudioAcceptanceProducer({ emitted, identity, command }), []);
  assert.deepEqual(emitted.results.map(item => item.testId), STUDIO_ACCEPTANCE_TEST_IDS);
  assert.deepEqual(emitted.results[0].sourceReferences, STUDIO_ACCEPTANCE_SOURCE_REFERENCES);
  assert.deepEqual(emitted.results[0].sourceDigests, currentStudioAcceptanceSourceDigests());
});

test('Studio producer preserves genuine assertion failures as FAIL', () => {
  const actualByTestId = structuredClone(fixtureActuals);
  delete actualByTestId['STUDIO-010'];
  const emitted = buildStudioAcceptanceProducer({
    actualByTestId,
    failuresByTestId: { 'STUDIO-010': { failureCode: 'assertion_failed' } },
    identity,
    command,
    cleanupVerified: true,
  });
  const result = emitted.results.find(item => item.testId === 'STUDIO-010');
  assert.deepEqual({ status: result.status, actual: result.actual, failureCode: result.failureCode }, {
    status: 'FAIL', actual: null, failureCode: 'assertion_failed',
  });
  assert.deepEqual(validateStudioAcceptanceProducer({ emitted, identity, command }), []);
});

test('Studio producer fails closed on mutated actuals, missing cleanup and stale source digest', () => {
  const changed = structuredClone(fixtureActuals);
  changed['STUDIO-006'].fakeStorageUploadCount = 0;
  assert.deepEqual(validateStudioAcceptanceActuals(changed), ['studio-actual:STUDIO-006']);
  assert.throws(() => buildStudioAcceptanceProducer({
    actualByTestId: fixtureActuals,
    identity,
    command,
    cleanupVerified: false,
  }), /studio-cleanup/u);
  const emitted = buildStudioAcceptanceProducer({
    actualByTestId: fixtureActuals,
    identity,
    command,
    cleanupVerified: true,
  });
  emitted.results[0].sourceDigests[STUDIO_ACCEPTANCE_SOURCE_REFERENCES[0]] = '0'.repeat(64);
  assert.ok(validateStudioAcceptanceProducer({ emitted, identity, command }).some(error => error.startsWith('studio-source-digests:')));
});

test('Studio producer rejects identity, scope, binding and result-set substitutions', () => {
  const fresh = () => buildStudioAcceptanceProducer({
    actualByTestId: fixtureActuals,
    identity,
    command,
    cleanupVerified: true,
  });
  const adversarial = [
    ['releaseSha', value => { value.results[0].releaseSha = 'b'.repeat(40); }, 'studio-releaseSha:STUDIO-004'],
    ['workflowRunId', value => { value.results[0].workflowRunId = '999'; }, 'studio-workflowRunId:STUDIO-004'],
    ['workflowAttempt', value => { value.results[0].workflowAttempt = '9'; }, 'studio-workflowAttempt:STUDIO-004'],
    ['environment', value => { value.results[0].environment = 'hosted'; }, 'studio-environment:STUDIO-004'],
    ['workflowPath', value => { value.results[0].workflowPath = 'other.yml'; }, 'studio-workflowPath:STUDIO-004'],
    ['scope', value => { value.results[0].scope = { ...value.results[0].scope, workspaceId: '98000000-0000-4000-8000-000000000011' }; }, 'studio-scope:STUDIO-004'],
    ['command', value => { value.results[0].command = 'node other.mjs'; }, 'studio-command:STUDIO-004'],
    ['branch', value => { value.results[0].branchIds = ['STUDIO-WEAKENED']; }, 'studio-branch:STUDIO-004'],
    ['assertion', value => { value.results[0].assertionIds = ['wrong']; }, 'studio-assertion:STUDIO-004'],
    ['scenario', value => { value.results[0].scenarioIds = ['wrong']; }, 'studio-scenario:STUDIO-004'],
    ['unknown', value => { value.results[0].testId = 'STUDIO-999'; }, 'studio-result-identity:STUDIO-999'],
    ['duplicate', value => { value.results[1] = structuredClone(value.results[0]); }, 'studio-result-identity:STUDIO-004'],
    ['partial', value => { value.results.pop(); }, 'studio-result-count'],
    ['malformed-pass', value => { value.results[0].actual = null; }, 'studio-actual:STUDIO-004'],
    ['malformed-fail', value => { value.results[0].status = 'FAIL'; value.results[0].failureCode = null; }, 'studio-failure:STUDIO-004'],
  ];
  for (const [label, mutate, expected] of adversarial) {
    const emitted = fresh();
    mutate(emitted);
    const errors = validateStudioAcceptanceProducer({ emitted, identity, command });
    assert.ok(errors.includes(expected), `${label}: ${errors.join(',')}`);
  }
});

test('Studio actual validation rejects unknown, duplicate-source and partial result sets', () => {
  const unknown = structuredClone(fixtureActuals);
  unknown['STUDIO-999'] = unknown['STUDIO-004'];
  assert.ok(validateStudioAcceptanceActuals(unknown).includes('studio-result-set'));
  const partial = structuredClone(fixtureActuals);
  delete partial['STUDIO-011'];
  assert.ok(validateStudioAcceptanceActuals(partial).includes('studio-result-set'));
  assert.ok(validateStudioAcceptanceActuals(fixtureActuals, {
    'STUDIO-004': { failureCode: 'assertion_failed' },
  }).includes('studio-result-ambiguous:STUDIO-004'));
});
