import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EI_ACCEPTANCE_EXACT_ACTUAL,
  EI_ACCEPTANCE_SOURCE_REFERENCES,
  EI_ACCEPTANCE_TEST_IDS,
  buildEnterpriseIntelligenceAcceptanceProducer,
  classifyEnterpriseIntelligenceAcceptanceCaseFailure,
  completeEnterpriseIntelligenceAcceptanceSetupBlocked,
  currentEnterpriseIntelligenceAcceptanceSourceDigests,
  finalizeEnterpriseIntelligenceAcceptanceExecution,
  validateEnterpriseIntelligenceAcceptanceActuals,
  validateEnterpriseIntelligenceAcceptanceProducer,
} from './enterpriseIntelligenceAcceptanceEvidence.mjs';

const fixtureActuals = JSON.parse(readFileSync(
  'tests/acceptance/fixtures/enterprise-intelligence-evidence-unit-results.json', 'utf8',
));
const identity = {
  releaseSha: 'a'.repeat(40), workflowRunId: '123', workflowAttempt: '2',
  environment: 'ci-disposable-postgres',
  workflowPath: '.github/workflows/exhaustive-acceptance.yml',
};
const command = 'node scripts/testEnterpriseIntelligenceAcceptancePostgres.mjs';

test('Enterprise Intelligence exact actual fixture is complete and canonical', () => {
  assert.deepEqual(fixtureActuals, EI_ACCEPTANCE_EXACT_ACTUAL);
  assert.deepEqual(validateEnterpriseIntelligenceAcceptanceActuals(fixtureActuals), []);
});

test('Enterprise Intelligence producer binds identity, sources, branches and exact actuals', () => {
  const emitted = buildEnterpriseIntelligenceAcceptanceProducer({
    actualByTestId: fixtureActuals, identity, command, cleanupVerified: true,
  });
  assert.equal(emitted.results.length, 5);
  assert.deepEqual(validateEnterpriseIntelligenceAcceptanceProducer({ emitted, identity, command }), []);
  assert.deepEqual(emitted.results.map(item => item.testId), EI_ACCEPTANCE_TEST_IDS);
  assert.deepEqual(emitted.results[0].sourceReferences, EI_ACCEPTANCE_SOURCE_REFERENCES);
  assert.deepEqual(emitted.results[0].sourceDigests, currentEnterpriseIntelligenceAcceptanceSourceDigests());
});

test('Enterprise Intelligence accepts measured object properties in execution order only at exact values', () => {
  const reordered = Object.fromEntries(Object.entries(fixtureActuals).map(([id, actual]) => [
    id, Object.fromEntries(Object.entries(actual).reverse()),
  ]));
  const emitted = buildEnterpriseIntelligenceAcceptanceProducer({
    actualByTestId: reordered, identity, command, cleanupVerified: true,
  });
  assert.deepEqual(validateEnterpriseIntelligenceAcceptanceProducer({ emitted, identity, command }), []);
  emitted.results[0].actual.logicalMutationCount = 0;
  assert.ok(validateEnterpriseIntelligenceAcceptanceProducer({ emitted, identity, command })
    .includes('enterprise-intelligence-actual:EI-001'));
});

test('Enterprise Intelligence preserves FAIL and BLOCKED independently with retained transport', () => {
  const actualByTestId = structuredClone(fixtureActuals);
  delete actualByTestId['EI-002'];
  delete actualByTestId['EI-005'];
  const failuresByTestId = { 'EI-002': { failureCode: 'assertion_failed' } };
  const blockedByTestId = completeEnterpriseIntelligenceAcceptanceSetupBlocked({ actualByTestId, failuresByTestId });
  assert.deepEqual(blockedByTestId, { 'EI-005': { failureCode: 'setup_failed' } });
  const emitted = buildEnterpriseIntelligenceAcceptanceProducer({
    actualByTestId, failuresByTestId, blockedByTestId, identity, command, cleanupVerified: true,
  });
  assert.deepEqual(validateEnterpriseIntelligenceAcceptanceProducer({ emitted, identity, command }), []);
  assert.deepEqual(finalizeEnterpriseIntelligenceAcceptanceExecution({
    actualByTestId, failuresByTestId, blockedByTestId, retainedResultPath: 'retained.json',
  }), { counts: { passed: 3, failed: 1, blocked: 1 }, shouldFailProcess: false });
  assert.equal(finalizeEnterpriseIntelligenceAcceptanceExecution({
    actualByTestId, failuresByTestId, blockedByTestId,
  }).shouldFailProcess, true);
});

test('Enterprise Intelligence failure classification distinguishes setup from behavior', () => {
  assert.deepEqual(classifyEnterpriseIntelligenceAcceptanceCaseFailure('setup-fixture'), {
    status: 'BLOCKED', failureCode: 'setup_failed',
  });
  assert.deepEqual(classifyEnterpriseIntelligenceAcceptanceCaseFailure('oversize-denial'), {
    status: 'FAIL', failureCode: 'assertion_failed',
  });
});

test('Enterprise Intelligence producer fails closed on cleanup, actual and digest changes', () => {
  const changed = structuredClone(fixtureActuals);
  changed['EI-004'].correlationAttemptDelta = 0;
  assert.deepEqual(validateEnterpriseIntelligenceAcceptanceActuals(changed), ['enterprise-intelligence-actual:EI-004']);
  assert.throws(() => buildEnterpriseIntelligenceAcceptanceProducer({
    actualByTestId: fixtureActuals, identity, command, cleanupVerified: false,
  }), /enterprise-intelligence-cleanup/u);
  const emitted = buildEnterpriseIntelligenceAcceptanceProducer({
    actualByTestId: fixtureActuals, identity, command, cleanupVerified: true,
  });
  emitted.results[0].sourceDigests[EI_ACCEPTANCE_SOURCE_REFERENCES[0]] = '0'.repeat(64);
  assert.ok(validateEnterpriseIntelligenceAcceptanceProducer({ emitted, identity, command })
    .some(error => error.startsWith('enterprise-intelligence-source-digests:')));
});

test('Enterprise Intelligence producer rejects binding and malformed result substitutions', () => {
  const fresh = () => buildEnterpriseIntelligenceAcceptanceProducer({
    actualByTestId: fixtureActuals, identity, command, cleanupVerified: true,
  });
  const adversarial = [
    [value => { value.results[0].releaseSha = 'b'.repeat(40); }, 'enterprise-intelligence-releaseSha:EI-001'],
    [value => { value.results[0].scope = { ...value.results[0].scope, workspaceId: 'other' }; }, 'enterprise-intelligence-scope:EI-001'],
    [value => { value.results[0].command = 'node other.mjs'; }, 'enterprise-intelligence-command:EI-001'],
    [value => { value.results[0].branchIds = ['WEAKENED']; }, 'enterprise-intelligence-branch:EI-001'],
    [value => { value.results[0].testId = 'EI-999'; }, 'enterprise-intelligence-result-identity:EI-999'],
    [value => { value.results[1] = structuredClone(value.results[0]); }, 'enterprise-intelligence-result-identity:EI-001'],
    [value => { value.results.pop(); }, 'enterprise-intelligence-result-count'],
    [value => { value.results[0].actual = null; }, 'enterprise-intelligence-actual:EI-001'],
    [value => { value.results[0].status = 'FAIL'; value.results[0].failureCode = null; }, 'enterprise-intelligence-failure:EI-001'],
    [value => { value.results[0].status = 'BLOCKED'; value.results[0].actual = null; value.results[0].failureCode = 'assertion_failed'; }, 'enterprise-intelligence-blocked:EI-001'],
  ];
  for (const [mutate, expected] of adversarial) {
    const emitted = fresh();
    mutate(emitted);
    assert.ok(validateEnterpriseIntelligenceAcceptanceProducer({ emitted, identity, command }).includes(expected));
  }
});

test('Enterprise Intelligence actual validation rejects unknown, partial and ambiguous sets', () => {
  const unknown = structuredClone(fixtureActuals);
  unknown['EI-999'] = unknown['EI-001'];
  assert.ok(validateEnterpriseIntelligenceAcceptanceActuals(unknown).includes('enterprise-intelligence-result-set'));
  const partial = structuredClone(fixtureActuals);
  delete partial['EI-005'];
  assert.ok(validateEnterpriseIntelligenceAcceptanceActuals(partial).includes('enterprise-intelligence-result-set'));
  assert.ok(validateEnterpriseIntelligenceAcceptanceActuals(fixtureActuals, {
    'EI-001': { failureCode: 'assertion_failed' },
  }).includes('enterprise-intelligence-result-ambiguous:EI-001'));
  assert.ok(validateEnterpriseIntelligenceAcceptanceActuals(partial, {}, {
    'EI-005': { failureCode: 'assertion_failed' },
  }).includes('enterprise-intelligence-blocked:EI-005'));
});
