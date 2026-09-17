import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateSyntheticStudioFacts as evaluate } from './syntheticAiCampaignOracle.mjs';
const draft = scope => ({ summary: scope, sections: [{ body: 'Review invoice exceptions. The AP analyst investigates. A finance manager approves amounts above USD 5000.' }] });
test('equivalent unconditional scope exclusions pass in summary or section text', () => {
  for (const scope of ['Payment execution is outside scope.', 'Payment execution is out-of-scope.', 'No payment may be executed by this workflow.', 'This workflow strictly prohibits any payment execution; no payments may be made through this process.']) {
    assert.ok(Object.values(evaluate(draft(scope))).every(Boolean));
  }
});
test('corrupted actor, lost threshold, invented compliance and conditional permission fail', () => {
  const good = draft('No payment may be executed by this workflow.');
  assert.equal(evaluate(JSON.parse(JSON.stringify(good).replace('AP analyst', 'API analyst'))).roles, false);
  assert.equal(evaluate(JSON.parse(JSON.stringify(good).replace('5000', '1000'))).threshold, false);
  assert.equal(evaluate(draft('Ensures regulatory compliance.')).noInventedCompliance, false);
  assert.equal(evaluate(draft('No payment may be executed unless approved.')).noConditionalPaymentPermission, false);
  assert.equal(evaluate(draft('Payments are permitted.')).scope, false);
});
