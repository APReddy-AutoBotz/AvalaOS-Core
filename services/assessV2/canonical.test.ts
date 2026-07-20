import assert from 'node:assert/strict';
import { ASSESS_V2_DECISION_VERSION } from './types';
import { buildDecisionDigestV2, DecisionDigestBinding } from './canonical';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from './fixture';

const run = async () => {
  const binding: DecisionDigestBinding = {
    organizationId: AP_INVOICE_EXCEPTION_V2_FIXTURE.organizationId,
    workspaceId: AP_INVOICE_EXCEPTION_V2_FIXTURE.workspaceId,
    caseId: AP_INVOICE_EXCEPTION_V2_FIXTURE.id,
    sourceCaseVersion: AP_INVOICE_EXCEPTION_V2_FIXTURE.version,
    schemaVersion: AP_INVOICE_EXCEPTION_V2_FIXTURE.schemaVersion,
    ruleSetVersion: AP_INVOICE_EXCEPTION_V2_FIXTURE.ruleSetVersion,
    decisionVersion: ASSESS_V2_DECISION_VERSION,
  };
  const ordered = { alpha: 1, nested: { beta: true, gamma: 'value' } };
  const reordered = { nested: { gamma: 'value', beta: true }, alpha: 1 };
  const first = await buildDecisionDigestV2('input', binding, ordered);
  assert.equal(first, await buildDecisionDigestV2('input', binding, ordered), 'digest must be deterministic');
  assert.equal(first, await buildDecisionDigestV2('input', binding, reordered), 'object key order must not alter the digest');
  assert.notEqual(first, await buildDecisionDigestV2('input', binding, { ...ordered, alpha: 2 }), 'material payload changes must alter the digest');
  assert.notEqual(first, await buildDecisionDigestV2('evidence', binding, ordered), 'digest domains must be separated');
  assert.notEqual(first, await buildDecisionDigestV2('input', { ...binding, organizationId: 'other-org' }, ordered), 'tenant binding must alter the digest');
  assert.notEqual(first, await buildDecisionDigestV2('input', { ...binding, workspaceId: 'other-workspace' }, ordered), 'workspace binding must alter the digest');
  assert.notEqual(first, await buildDecisionDigestV2('input', { ...binding, caseId: 'other-case' }, ordered), 'case binding must alter the digest');
  assert.notEqual(first, await buildDecisionDigestV2('input', { ...binding, sourceCaseVersion: 2 }, ordered), 'case-version binding must alter the digest');
  assert.notEqual(first, await buildDecisionDigestV2('input', { ...binding, ruleSetVersion: 'other-rule-set' }, ordered), 'rule-set binding must alter the digest');
  await assert.rejects(buildDecisionDigestV2('input', { ...binding, organizationId: '' }, ordered), /bindings are required/);
  console.log('Assess V2 canonical digest binding tests passed.');
};
run().catch(error => { console.error(error); process.exitCode = 1; });
