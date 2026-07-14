import assert from 'node:assert/strict';
import { canonicalizeDecisionPayload, isSha256Hex, sha256Hex } from './canonical';
import { buildDecisionPackRenderModel, buildDecisionVersionV2 } from './decisionVersion';
import { deriveEvidenceConfidence, evaluateAgentNecessity, evaluateAssessmentV2, evaluateInteractionReadiness, validateAssessmentV2 } from './evaluator';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from './fixture';
import { AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION } from './index';
import { FIELD_REGISTRY, validateDecisionFieldInputs, validateEvidenceLinks, validateFieldRegistry } from './registry';

const run = async () => {
  console.log('Running Assess V2 domain, registry, evaluator, and snapshot tests...');
  assert.deepEqual(validateFieldRegistry(), []);
  assert.ok(FIELD_REGISTRY.every(field => field.use === 'context' || field.ruleIds.length));
  assert.match(validateDecisionFieldInputs([{ fieldId: 'unknown.field', value: true, unit: 'boolean' }])[0], /unknown field/);
  assert.match(validateDecisionFieldInputs([{ fieldId: 'interaction.uiStable', value: true, unit: 'count' }])[0], /expected boolean/);
  assert.match(validateDecisionFieldInputs([{ fieldId: 'interaction.uiStable', value: true, unit: 'boolean', applicable: false }])[0], /not applicable/);
  assert.ok(validateEvidenceLinks([{ id: 'template', claimIds: ['claim'], sourceType: 'template', status: 'validated', validated: true, owner: 'owner' }]).length);

  assert.equal(canonicalizeDecisionPayload({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(await sha256Hex({ b: 2, a: 1 }), '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
  assert.throws(() => canonicalizeDecisionPayload({ invalid: undefined }), /undefined/);
  assert.throws(() => canonicalizeDecisionPayload({ invalid: Number.NaN }), /non-finite/);

  assert.deepEqual(validateAssessmentV2(AP_INVOICE_EXCEPTION_V2_FIXTURE), []);
  const decision = evaluateAssessmentV2(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  assert.deepEqual(decision, AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION);
  assert.equal(decision.confidence, 'Verified');
  assert.equal(decision.processReadiness, 'Ready for controlled design');
  const validateComposition = decision.composedOperatingModel.find(item => item.primitiveId === 'validate')!;
  assert.ok(['Deterministic Rules', 'Native API Integration', 'RPA / UI Automation'].every(component => validateComposition.components.includes(component as never)));
  assert.deepEqual(decision.modernization.find(item => item.assetId === 'sap')?.dispositions, ['Retain', 'API Facade']);
  assert.ok(!decision.modernization.some(item => item.dispositions.includes('Replace')));
  const post = decision.interactionDecisions.find(item => item.interactionId === 'sap-post')!;
  assert.equal(post.readiness.write, 'Conditional');
  assert.ok(post.requiredControls.includes('Human approval'));
  assert.ok(post.prohibitedActions.some(action => action.includes('autonomous financial action')));
  assert.equal(decision.interactionDecisions.find(item => item.interactionId === 'sap-ui-gap')?.readiness.ui, 'Conditional');

  for (const key of Object.keys(AP_INVOICE_EXCEPTION_V2_FIXTURE.agentNecessity) as Array<keyof typeof AP_INVOICE_EXCEPTION_V2_FIXTURE.agentNecessity>) {
    assert.notEqual(evaluateAgentNecessity('exception', { ...AP_INVOICE_EXCEPTION_V2_FIXTURE.agentNecessity, [key]: false }).fit, 'Strong Fit');
  }
  assert.ok(!decision.candidateEvaluations.some(item => item.primitiveId === 'extract' && item.component === 'Bounded Agent'));

  const confidenceChanged = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  confidenceChanged.evidence[0].validated = false;
  confidenceChanged.evidence[0].status = 'submitted';
  assert.equal(deriveEvidenceConfidence(confidenceChanged), 'Partially Evidenced');
  assert.deepEqual(evaluateAssessmentV2(confidenceChanged).candidateEvaluations, decision.candidateEvaluations);
  const businessChanged = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  businessChanged.importedFacts = [{ fieldId: 'context.businessValue', value: 999, status: 'assumed', evidenceIds: [], source: 'v1-import' }];
  assert.deepEqual(evaluateAssessmentV2(businessChanged).candidateEvaluations, decision.candidateEvaluations);
  const hitlChanged = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  hitlChanged.primitives[2].businessDisposition = 'Human-Led';
  assert.deepEqual(evaluateAssessmentV2(hitlChanged).candidateEvaluations, decision.candidateEvaluations);
  const lowAgent = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  lowAgent.agentNecessity.controllable = false;
  lowAgent.primitives.find(item => item.id === 'exception')!.agentNecessity!.controllable = false;
  assert.deepEqual(evaluateAssessmentV2(lowAgent).modernization, decision.modernization);

  const baseInteraction = AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions[0];
  const uiChanged = structuredClone(baseInteraction); uiChanged.facts.uiStable = true;
  assert.equal(evaluateInteractionReadiness(uiChanged).readiness.read, evaluateInteractionReadiness(baseInteraction).readiness.read);
  const apiChanged = structuredClone(baseInteraction); apiChanged.facts.interfaceAvailable = false;
  assert.equal(evaluateInteractionReadiness(apiChanged).readiness.ui, evaluateInteractionReadiness(baseInteraction).readiness.ui);

  const input = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const immutable = await buildDecisionVersionV2(input, 'server-actor', '2026-07-14T01:00:00.000Z');
  assert.ok([immutable.inputHash, immutable.evidenceHash, immutable.outputHash].every(isSha256Hex));
  assert.equal(Object.isFrozen(immutable.outputSnapshot), true);
  assert.equal(input.status, 'draft');
  await assert.rejects(() => buildDecisionVersionV2(input, '   ', '2026-07-14T01:00:00.000Z'), /actor is required/);
  await assert.rejects(() => buildDecisionVersionV2(input, 'server-actor', 'not-a-timestamp'), /timestamp is required/);
  const superseding = await buildDecisionVersionV2(input, 'server-actor', '2026-07-14T02:00:00.000Z', { supersedesDecisionId: 'prior-decision' });
  assert.equal(superseding.supersedesDecisionId, 'prior-decision');
  const render = buildDecisionPackRenderModel(immutable);
  assert.ok(render.allowedActions.length && render.prohibitedActions.length);
  assert.ok(render.nonClaims.some(claim => claim.includes('No V2 approval')));
  console.log('Assess V2 domain, registry, evaluator, and snapshot tests passed.');
};

run().catch(error => { console.error(error); process.exitCode = 1; });
