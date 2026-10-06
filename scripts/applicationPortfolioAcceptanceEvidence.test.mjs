import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildApplicationPortfolioAcceptanceProducer,
  validateApplicationPortfolioAcceptanceProducer,
} from './applicationPortfolioAcceptanceEvidence.mjs';
import { loadExecutionBindings } from './exhaustiveAcceptanceModel.mjs';

// Validator inputs only; these records are not PostgreSQL execution evidence.
const unitActuals = () => JSON.parse(readFileSync('tests/acceptance/fixtures/application-portfolio-evidence-unit-results.json', 'utf8'));
const identity = {
  releaseSha: 'a'.repeat(40),
  workflowRunId: '123456',
  workflowAttempt: '2',
  environment: 'pull-request',
  workflowPath: '.github/workflows/exhaustive-acceptance.yml',
};
const command = loadExecutionBindings().retainedSuites.find(suite => suite.suiteId === 'application-portfolio').command.join(' ');
const options = () => ({ actualByTestId: unitActuals(), identity, command, cleanupVerified: true });
const validate = emitted => validateApplicationPortfolioAcceptanceProducer({ emitted, identity, command });

test('Application Portfolio producer requires all five measured outcomes and verified cleanup', () => {
  const mutations = [
    ['missing outcome', value => { delete value.actualByTestId['APPS-004']; }],
    ['unexpected outcome', value => { value.actualByTestId['APPS-006'] = {}; }],
    ['extra mutation', value => { value.actualByTestId['APPS-001'].applicationMutationCount = 2; }],
    ['missing audit', value => { value.actualByTestId['APPS-003'].auditDelta = 0; }],
    ['failed cleanup', value => { value.cleanupVerified = false; }],
    ['missing cleanup', value => { delete value.cleanupVerified; }],
    ['failed denial', value => { value.actualByTestId['APPS-004'].foreignWorkspaceDenied = false; }],
    ['wrong disposition', value => { value.actualByTestId['APPS-003'].disposition = 'Insufficient evidence'; }],
  ];
  for (const [name, mutate] of mutations) {
    const value = options(); mutate(value);
    assert.throws(() => buildApplicationPortfolioAcceptanceProducer(value), /APPLICATION_PORTFOLIO_ACCEPTANCE_EVIDENCE_INVALID/u, name);
  }
  assert.deepEqual(validate(buildApplicationPortfolioAcceptanceProducer(options())), []);
});

test('Application Portfolio validator rejects substituted execution, scope, source and results', () => {
  const mutations = [
    ['stale release', value => { value.results[0].releaseSha = 'b'.repeat(40); }],
    ['stale run', value => { value.results[0].workflowRunId = '123455'; }],
    ['stale attempt', value => { value.results[0].workflowAttempt = '1'; }],
    ['wrong environment', value => { value.results[0].environment = 'stable-release'; }],
    ['wrong workflow', value => { value.results[0].workflowPath = '.github/workflows/other.yml'; }],
    ['wrong command', value => { value.results[0].command = 'node aggregate-only.mjs'; }],
    ['wrong scope', value => { value.results[0].scope = { ...value.results[0].scope, workspaceId: 'unexecuted' }; }],
    ['planned scope', value => { value.results[0].scope = { ...value.results[0].scope, evidenceScope: 'planned-fixture' }; }],
    ['changed source', value => { const key = Object.keys(value.results[0].sourceDigests)[0]; value.results[0].sourceDigests[key] = '0'.repeat(64); }],
    ['missing source', value => { delete value.results[0].sourceDigests; }],
    ['duplicate case', value => { value.results[4] = structuredClone(value.results[0]); }],
    ['missing case', value => { value.results.pop(); }],
    ['extra case', value => { value.results.push(structuredClone(value.results[0])); }],
    ['wrong suite', value => { value.results[0].suiteId = 'aggregate-only'; }],
    ['missing result', value => { value.results[0].actual = null; }],
    ['changed replay', value => { value.results[4].actual.replayEffectDelta = 1; }],
    ['cleanup changed', value => { value.results[0].cleanupVerified = false; }],
    ['unproven pass', value => { value.results[0].failureCode = 'assertion_failed'; }],
  ];
  for (const [name, mutate] of mutations) {
    const value = structuredClone(buildApplicationPortfolioAcceptanceProducer(options())); mutate(value);
    assert.ok(validate(value).length > 0, name);
  }
});

test('executed Application Portfolio assertion failure stays FAIL and cannot be relabeled PASS', () => {
  const value = options();
  delete value.actualByTestId['APPS-004'];
  value.failuresByTestId = { 'APPS-004': { failureCode: 'assertion_failed' } };
  const emitted = buildApplicationPortfolioAcceptanceProducer(value);
  assert.deepEqual(validate(emitted), []);
  const failed = emitted.results.find(item => item.testId === 'APPS-004');
  assert.equal(failed.status, 'FAIL');
  assert.equal(failed.assertionOutcomes[0].status, 'FAIL');
  failed.status = 'PASS';
  failed.assertionOutcomes[0].status = 'PASS';
  assert.ok(validate(emitted).length > 0);
});
