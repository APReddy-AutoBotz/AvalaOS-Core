import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAssessV2AcceptanceProducer,
  validateAssessV2AcceptanceProducer,
} from './assessV2AcceptanceEvidence.mjs';

const actualByTestId = () => ({
  'ASSESS-021': {
    logicalMutationCount: 1, versionDelta: 1, receiptDelta: 1, auditDelta: 1,
    committedCount: 1, versionConflictCount: 1, rejectedEffectDelta: 0,
  },
  'ASSESS-022': {
    logicalMutationCount: 1, versionDelta: 1, receiptDelta: 1, auditDelta: 1,
    idempotencyConflict: true, originalReceiptPreserved: true,
    committedStatePreserved: true, conflictEffectDelta: 0,
  },
});
const identity = {
  releaseSha: 'a'.repeat(40), workflowRunId: '123456', workflowAttempt: '2',
  environment: 'pull-request', workflowPath: '.github/workflows/exhaustive-acceptance.yml',
};
const command = 'node scripts/testPr1dMigrations.mjs';
const options = () => ({ actualByTestId: actualByTestId(), identity, command, cleanupVerified: true });
const validate = emitted => validateAssessV2AcceptanceProducer({ emitted, identity, command });

test('Assess V2 producer requires both exact measured outcomes and verified cleanup', () => {
  const mutations = [
    ['missing outcome', value => { delete value.actualByTestId['ASSESS-021']; }],
    ['unexpected outcome', value => { value.actualByTestId['ASSESS-023'] = {}; }],
    ['extra mutation', value => { value.actualByTestId['ASSESS-021'].logicalMutationCount = 2; }],
    ['missing audit', value => { value.actualByTestId['ASSESS-022'].auditDelta = 0; }],
    ['failed cleanup', value => { value.cleanupVerified = false; }],
    ['missing cleanup', value => { delete value.cleanupVerified; }],
  ];
  for (const [name, mutate] of mutations) {
    const value = options(); mutate(value);
    assert.throws(() => buildAssessV2AcceptanceProducer(value), /ASSESS_V2_ACCEPTANCE_EVIDENCE_INVALID/u, name);
  }
  assert.deepEqual(validate(buildAssessV2AcceptanceProducer(options())), []);
});

test('Assess V2 validator rejects substituted identity, scope, sources and outcomes', () => {
  const mutations = [
    ['stale release', value => { value.results[0].releaseSha = 'b'.repeat(40); }],
    ['stale run', value => { value.results[0].workflowRunId = '123455'; }],
    ['stale attempt', value => { value.results[0].workflowAttempt = '1'; }],
    ['wrong environment', value => { value.results[0].environment = 'stable-release'; }],
    ['wrong workflow', value => { value.results[0].workflowPath = '.github/workflows/other.yml'; }],
    ['wrong command', value => { value.results[0].command = 'node aggregate-only.mjs'; }],
    ['wrong scope', value => { value.results[0].scope.workspaceId = 'unexecuted'; }],
    ['planned scope', value => { value.results[0].scope.evidenceScope = 'planned-fixture'; }],
    ['changed source', value => { const key = Object.keys(value.results[0].sourceDigests)[0]; value.results[0].sourceDigests[key] = '0'.repeat(64); }],
    ['missing source', value => { delete value.results[0].sourceDigests; }],
    ['wrong branch', value => { value.results[0].branchIds = ['ASSESS-V2_IDEMPOTENCY_CONFLICT']; }],
    ['duplicate case', value => { value.results[1] = structuredClone(value.results[0]); }],
    ['missing case', value => { value.results.pop(); }],
    ['extra case', value => { value.results.push(structuredClone(value.results[0])); }],
    ['wrong suite', value => { value.results[0].suiteId = 'aggregate-only'; }],
    ['missing result', value => { value.results[0].actual = null; }],
    ['changed conflict count', value => { value.results[0].actual.versionConflictCount = 0; }],
    ['cleanup changed', value => { value.results[0].cleanupVerified = false; }],
    ['unproven pass', value => { value.results[0].failureCode = 'assertion_failed'; }],
  ];
  for (const [name, mutate] of mutations) {
    const value = structuredClone(buildAssessV2AcceptanceProducer(options())); mutate(value);
    assert.ok(validate(value).length > 0, name);
  }
});

test('executed Assess V2 assertion failure stays FAIL and cannot be relabeled PASS', () => {
  const value = options();
  delete value.actualByTestId['ASSESS-022'];
  value.failuresByTestId = { 'ASSESS-022': { failureCode: 'assertion_failed' } };
  const emitted = buildAssessV2AcceptanceProducer(value);
  assert.deepEqual(validate(emitted), []);
  const failed = emitted.results.find(item => item.testId === 'ASSESS-022');
  assert.equal(failed.status, 'FAIL');
  failed.status = 'PASS';
  failed.assertionOutcomes[0].status = 'PASS';
  assert.ok(validate(emitted).length > 0);
});
