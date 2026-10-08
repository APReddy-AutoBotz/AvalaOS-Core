import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  GOVERN_ACCEPTANCE_EXACT_ACTUAL,
  GOVERN_ACCEPTANCE_SOURCE_REFERENCES,
  GOVERN_ACCEPTANCE_TEST_IDS,
  buildGovernAcceptanceProducer,
  classifyGovernAcceptanceCaseFailure,
  completeGovernAcceptanceSetupBlocked,
  currentGovernAcceptanceSourceDigests,
  finalizeGovernAcceptanceExecution,
  validateGovernAcceptanceActuals,
  validateGovernAcceptanceProducer,
} from './governAcceptanceEvidence.mjs';

const fixtureActuals = JSON.parse(readFileSync('tests/acceptance/fixtures/govern-evidence-unit-results.json', 'utf8'));
const identity = {
  releaseSha: 'a'.repeat(40),
  workflowRunId: '123',
  workflowAttempt: '2',
  environment: 'ci-disposable-postgres',
  workflowPath: '.github/workflows/exhaustive-acceptance.yml',
};
const command = 'node scripts/testGovernAcceptancePostgres.mjs';

test('Govern exact actual fixture is complete and canonical', () => {
  assert.deepEqual(fixtureActuals, GOVERN_ACCEPTANCE_EXACT_ACTUAL);
  assert.deepEqual(validateGovernAcceptanceActuals(fixtureActuals), []);
});

test('Govern producer binds exact identity, sources, branches and actuals', () => {
  const emitted = buildGovernAcceptanceProducer({
    actualByTestId: fixtureActuals,
    identity,
    command,
    cleanupVerified: true,
  });
  assert.equal(emitted.results.length, 3);
  assert.deepEqual(validateGovernAcceptanceProducer({ emitted, identity, command }), []);
  assert.deepEqual(emitted.results.map(item => item.testId), GOVERN_ACCEPTANCE_TEST_IDS);
  assert.deepEqual(emitted.results[0].sourceReferences, GOVERN_ACCEPTANCE_SOURCE_REFERENCES);
  assert.deepEqual(emitted.results[0].sourceDigests, currentGovernAcceptanceSourceDigests());
});

test('Govern accepts measured object properties in execution order without relaxing values', () => {
  const actualByTestId = Object.fromEntries(Object.entries(fixtureActuals).map(([id, actual]) => [
    id, Object.fromEntries(Object.entries(actual).reverse()),
  ]));
  const emitted = buildGovernAcceptanceProducer({ actualByTestId, identity, command, cleanupVerified: true });
  assert.deepEqual(validateGovernAcceptanceProducer({ emitted, identity, command }), []);
  emitted.results[0].actual.logicalMutationCount = 0;
  assert.ok(validateGovernAcceptanceProducer({ emitted, identity, command }).includes('govern-actual:GOVERN-008'));
});

test('Govern producer preserves assertion failures and setup blocks independently', () => {
  const failedActuals = structuredClone(fixtureActuals);
  delete failedActuals['GOVERN-009'];
  const failed = buildGovernAcceptanceProducer({
    actualByTestId: failedActuals,
    failuresByTestId: { 'GOVERN-009': { failureCode: 'assertion_failed' } },
    identity,
    command,
    cleanupVerified: true,
  });
  assert.deepEqual(failed.results[1], {
    ...failed.results[1], status: 'FAIL', actual: null, failureCode: 'assertion_failed',
  });
  assert.deepEqual(validateGovernAcceptanceProducer({ emitted: failed, identity, command }), []);

  const blockedActuals = structuredClone(fixtureActuals);
  delete blockedActuals['GOVERN-010'];
  const blocked = buildGovernAcceptanceProducer({
    actualByTestId: blockedActuals,
    blockedByTestId: { 'GOVERN-010': { failureCode: 'setup_failed' } },
    identity,
    command,
    cleanupVerified: true,
  });
  assert.deepEqual({
    status: blocked.results[2].status,
    actual: blocked.results[2].actual,
    failureCode: blocked.results[2].failureCode,
    assertionOutcomes: blocked.results[2].assertionOutcomes,
  }, {
    status: 'BLOCKED',
    actual: null,
    failureCode: 'setup_failed',
    assertionOutcomes: [{ assertionId: 'govern-postgres-acceptance::GOVERN-010', status: 'BLOCKED' }],
  });
  assert.deepEqual(validateGovernAcceptanceProducer({ emitted: blocked, identity, command }), []);
});

test('Govern case failure classification distinguishes setup from behavior', () => {
  assert.deepEqual(classifyGovernAcceptanceCaseFailure('setup-approved-review'), {
    status: 'BLOCKED', failureCode: 'setup_failed',
  });
  assert.deepEqual(classifyGovernAcceptanceCaseFailure('stale-authority-denial'), {
    status: 'FAIL', failureCode: 'assertion_failed',
  });
});

test('Govern setup completion and retained transport preserve per-case results', () => {
  const actualByTestId = { 'GOVERN-008': fixtureActuals['GOVERN-008'] };
  const failuresByTestId = { 'GOVERN-009': { failureCode: 'assertion_failed' } };
  const blockedByTestId = completeGovernAcceptanceSetupBlocked({ actualByTestId, failuresByTestId });
  assert.deepEqual(blockedByTestId, { 'GOVERN-010': { failureCode: 'setup_failed' } });
  assert.deepEqual(finalizeGovernAcceptanceExecution({
    actualByTestId, failuresByTestId, blockedByTestId,
    retainedResultPath: 'retained-results.json',
  }), {
    counts: { passed: 1, failed: 1, blocked: 1 },
    shouldFailProcess: false,
  });
  assert.equal(finalizeGovernAcceptanceExecution({
    actualByTestId, failuresByTestId, blockedByTestId,
  }).shouldFailProcess, true);
});

test('Govern producer fails closed on mutated actuals, cleanup and source digests', () => {
  const changed = structuredClone(fixtureActuals);
  changed['GOVERN-010'].duplicateEffectDelta = 1;
  assert.deepEqual(validateGovernAcceptanceActuals(changed), ['govern-actual:GOVERN-010']);
  assert.throws(() => buildGovernAcceptanceProducer({
    actualByTestId: fixtureActuals,
    identity,
    command,
    cleanupVerified: false,
  }), /govern-cleanup/u);
  const emitted = buildGovernAcceptanceProducer({
    actualByTestId: fixtureActuals,
    identity,
    command,
    cleanupVerified: true,
  });
  emitted.results[0].sourceDigests[GOVERN_ACCEPTANCE_SOURCE_REFERENCES[0]] = '0'.repeat(64);
  assert.ok(validateGovernAcceptanceProducer({ emitted, identity, command })
    .some(error => error.startsWith('govern-source-digests:')));
});

test('Govern producer rejects identity, scope, binding and malformed result substitutions', () => {
  const fresh = () => buildGovernAcceptanceProducer({
    actualByTestId: fixtureActuals,
    identity,
    command,
    cleanupVerified: true,
  });
  const adversarial = [
    [value => { value.results[0].releaseSha = 'b'.repeat(40); }, 'govern-releaseSha:GOVERN-008'],
    [value => { value.results[0].scope = { ...value.results[0].scope, workspaceId: '95000000-0000-4000-8000-000000000011' }; }, 'govern-scope:GOVERN-008'],
    [value => { value.results[0].command = 'node other.mjs'; }, 'govern-command:GOVERN-008'],
    [value => { value.results[0].branchIds = ['GOVERN-WEAKENED']; }, 'govern-branch:GOVERN-008'],
    [value => { value.results[0].testId = 'GOVERN-999'; }, 'govern-result-identity:GOVERN-999'],
    [value => { value.results[1] = structuredClone(value.results[0]); }, 'govern-result-identity:GOVERN-008'],
    [value => { value.results.pop(); }, 'govern-result-count'],
    [value => { value.results[0].actual = null; }, 'govern-actual:GOVERN-008'],
    [value => { value.results[0].status = 'FAIL'; value.results[0].failureCode = null; }, 'govern-failure:GOVERN-008'],
    [value => { value.results[0].status = 'BLOCKED'; value.results[0].actual = null; value.results[0].failureCode = 'assertion_failed'; }, 'govern-blocked:GOVERN-008'],
  ];
  for (const [mutate, expected] of adversarial) {
    const emitted = fresh();
    mutate(emitted);
    assert.ok(validateGovernAcceptanceProducer({ emitted, identity, command }).includes(expected));
  }
});

test('Govern actual validation rejects unknown, partial and ambiguous result sets', () => {
  const unknown = structuredClone(fixtureActuals);
  unknown['GOVERN-999'] = unknown['GOVERN-008'];
  assert.ok(validateGovernAcceptanceActuals(unknown).includes('govern-result-set'));
  const partial = structuredClone(fixtureActuals);
  delete partial['GOVERN-010'];
  assert.ok(validateGovernAcceptanceActuals(partial).includes('govern-result-set'));
  assert.ok(validateGovernAcceptanceActuals(fixtureActuals, {
    'GOVERN-008': { failureCode: 'assertion_failed' },
  }).includes('govern-result-ambiguous:GOVERN-008'));
  assert.ok(validateGovernAcceptanceActuals(partial, {}, {
    'GOVERN-010': { failureCode: 'assertion_failed' },
  }).includes('govern-blocked:GOVERN-010'));
});
