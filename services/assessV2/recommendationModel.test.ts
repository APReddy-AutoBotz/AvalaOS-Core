import assert from 'node:assert/strict';
import { evaluateAssessmentV2 } from './evaluator.ts';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from './fixture.ts';
import { buildAssessmentRecommendationModel } from './recommendationModel.ts';

const hybridDecision = evaluateAssessmentV2(AP_INVOICE_EXCEPTION_V2_FIXTURE);
const hybrid = buildAssessmentRecommendationModel(AP_INVOICE_EXCEPTION_V2_FIXTURE, hybridDecision);
assert.equal(hybrid.aiUseStatus, 'unproven', 'an incompletely evidenced recommended design needs more evidence');
assert.match(hybrid.headline, /more evidence/i);
assert.ok(hybrid.steps.some(step => step.humanJudgment && /human|person/i.test(step.humanJudgmentReason ?? '')));
const validation = hybrid.steps.find(step => step.name === 'PO and GRN validation')!;
assert.equal(validation.apiStatus, 'ready');
assert.ok(validation.components.includes('Native API Integration'));
assert.ok(validation.apiOperations.some(operation => /PO, GRN/.test(operation.name)));
assert.ok(validation.alternatives.length > 0);

const apiUnknown = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
for (const interaction of apiUnknown.interactions.filter(item => item.primitiveId === validation.primitiveId && ['read', 'write'].includes(item.mode))) {
  interaction.facts.interfaceAvailable = null;
}
const apiUnknownModel = buildAssessmentRecommendationModel(apiUnknown, evaluateAssessmentV2(apiUnknown));
const apiUnknownStep = apiUnknownModel.steps.find(step => step.primitiveId === validation.primitiveId)!;
assert.equal(apiUnknownStep.apiStatus, 'unproven');
assert.ok(!apiUnknownStep.components.includes('Native API Integration'), 'presentation must not recommend an API whose readiness is unknown');
assert.ok(apiUnknownStep.evidenceGaps.some(gap => /interface|machineIdentity|authorization/i.test(gap)));

const noAi = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
const retainedIds = new Set(noAi.primitives.filter(item => ['Capture', 'Validate', 'Route', 'Approve'].includes(item.type)).map(item => item.id));
noAi.primitives = noAi.primitives.filter(item => retainedIds.has(item.id));
noAi.edges = noAi.edges.filter(item => retainedIds.has(item.fromPrimitiveId) && retainedIds.has(item.toPrimitiveId));
noAi.edges = [
  { id: '74000000-0000-4000-8000-000000000101', fromPrimitiveId: noAi.primitives[0].id, toPrimitiveId: noAi.primitives[1].id },
  { id: '74000000-0000-4000-8000-000000000102', fromPrimitiveId: noAi.primitives[1].id, toPrimitiveId: noAi.primitives[2].id, condition: 'exception' },
  { id: '74000000-0000-4000-8000-000000000103', fromPrimitiveId: noAi.primitives[2].id, toPrimitiveId: noAi.primitives[3].id },
];
noAi.decisionPoints = noAi.decisionPoints.filter(item => retainedIds.has(item.primitiveId));
noAi.exceptionPaths = noAi.exceptionPaths.map(item => ({
  ...item,
  fromPrimitiveId: noAi.primitives[1].id,
  resolutionPrimitiveIds: [noAi.primitives[2].id, noAi.primitives[3].id],
}));
noAi.primitives.find(item => item.type === 'Approve')!.businessDisposition = 'Human-Led';
noAi.interactions = noAi.interactions.filter(item => item.primitiveId === noAi.primitives.find(primitive => primitive.type === 'Validate')!.id && item.mode === 'read');
const noAiDecision = evaluateAssessmentV2(noAi);
const noAiModel = buildAssessmentRecommendationModel(noAi, noAiDecision);
assert.equal(noAiModel.aiUseStatus, 'unnecessary');
assert.match(noAiModel.headline, /^No AI required/);
assert.ok(noAiModel.steps.every(step => step.components.length > 0));
assert.ok(noAiModel.steps.every(step => !step.components.some(component => ['GenAI Assistant', 'Bounded Agent'].includes(component))));
assert.ok(noAiModel.steps.find(step => step.type === 'Approve')?.humanJudgment);

const unresolved = structuredClone(noAiDecision);
unresolved.processReadiness = 'Insufficient evidence';
assert.equal(buildAssessmentRecommendationModel(noAi, unresolved).aiUseStatus, 'unproven');

const emptyAssessment = structuredClone(noAi);
emptyAssessment.primitives = [];
const emptyDecision = structuredClone(noAiDecision);
emptyDecision.composedOperatingModel = [];
emptyDecision.candidateEvaluations = [];
assert.equal(buildAssessmentRecommendationModel(emptyAssessment, emptyDecision).aiUseStatus, 'unproven', 'an empty process cannot prove that AI is unnecessary');

const weakStepEvidence = structuredClone(noAiDecision);
weakStepEvidence.candidateEvaluations = weakStepEvidence.candidateEvaluations.map(item => ({ ...item, confidence: 'Assumption-Led' }));
assert.equal(buildAssessmentRecommendationModel(noAi, weakStepEvidence).aiUseStatus, 'unproven', 'assumption-led step recommendations cannot prove that AI is unnecessary');

// Model the retained lookup: user-confirmed workflow facts, a ready read, and no step evidence links.
const lookup = structuredClone(noAi);
const read = lookup.primitives.find(step => step.type === 'Validate')!;
const route = lookup.primitives.find(step => step.type === 'Route')!;
read.type = 'Retrieve';
lookup.primitives = [read, route];
lookup.edges = [{ id: noAi.edges[0].id, fromPrimitiveId: read.id, toPrimitiveId: route.id }];
lookup.exceptionPaths = [{ ...noAi.exceptionPaths[0], fromPrimitiveId: read.id, resolutionPrimitiveIds: [route.id] }];
lookup.decisionPoints = [{ ...noAi.decisionPoints[0], primitiveId: read.id, ruleDescription: "Exact match or human exception", outcomeLabels: ["Matched", "Exception"] }];
for (const step of lookup.primitives) {
  step.evidenceIds = [];
  delete step.businessDisposition;
  step.facts = Object.fromEntries(['primitive.rulesStable', 'primitive.workflowPatternKnown',
    'primitive.controlRequirementsKnown', 'primitive.interfaceDependencyKnown'].map(fieldId =>
    [fieldId, { fieldId, value: true, status: 'known', source: 'user', evidenceIds: [] }]));
}
const lookupDecision = evaluateAssessmentV2(lookup);
const lookupModel = buildAssessmentRecommendationModel(lookup, lookupDecision);
assert.equal(lookupModel.aiUseStatus, 'unnecessary');
assert.match(lookupModel.explanation, /Link supporting evidence/);
assert.ok(lookupModel.steps.every(step => step.evidenceGaps.some(gap => /step fact has no linked evidence/.test(gap))));
assert.ok(lookupModel.steps.every(step => step.evidenceConfidence === 'Insufficient Evidence'));
route.facts['primitive.rulesStable'].status = 'unknown';
assert.equal(buildAssessmentRecommendationModel(lookup, evaluateAssessmentV2(lookup)).aiUseStatus, 'unproven');

const unknownAiEligibility = structuredClone(noAiDecision);
unknownAiEligibility.candidateEvaluations.push({
  primitiveId: noAi.primitives[0].id,
  component: 'Bounded Agent',
  fit: 'Ineligible',
  confidence: 'Insufficient Evidence',
  rationale: ['A necessity condition is asserted false without supporting evidence.'],
  ruleIds: ['AGENT-001'],
  fieldIds: ['agent.irreducibleAmbiguity'],
  evidenceIds: [],
});
assert.equal(buildAssessmentRecommendationModel(noAi, unknownAiEligibility).aiUseStatus, 'unnecessary', 'uncertain eligibility of an unused alternative cannot change the evidence for the selected design');
const optionalAi = structuredClone(noAiDecision);
optionalAi.candidateEvaluations.push({ ...unknownAiEligibility.candidateEvaluations.at(-1)!, component: 'GenAI Assistant',
  fit: 'Conditional Fit', confidence: 'Partially Evidenced', rationale: ['Could summarize exceptions for an operator.'] });
const withOption = buildAssessmentRecommendationModel(noAi, optionalAi);
assert.equal(withOption.aiUseStatus, 'unnecessary');
assert.ok(withOption.steps[0].alternatives.some(item => item.optionalAi && item.reason.includes('summarize')));
optionalAi.composedOperatingModel[0].components.push('GenAI Assistant');
assert.equal(buildAssessmentRecommendationModel(noAi, optionalAi).aiUseStatus, 'included');

const mixedApi = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
const readyValidationRead = mixedApi.interactions.find(item => item.primitiveId === validation.primitiveId && item.mode === 'read')!;
mixedApi.interactions.push({
  ...structuredClone(readyValidationRead),
  id: '76000000-0000-4000-8000-000000000106',
  operationName: 'Read conditionally classified supplier data',
  dataClassification: 'Unknown',
  facts: { ...readyValidationRead.facts, dataClassified: null },
});
const mixedApiModel = buildAssessmentRecommendationModel(mixedApi, evaluateAssessmentV2(mixedApi));
const mixedApiStep = mixedApiModel.steps.find(step => step.primitiveId === validation.primitiveId)!;
assert.equal(mixedApiStep.apiStatus, 'conditional', 'one Ready operation must not hide a different Conditional operation');
assert.ok(mixedApiStep.apiOperations.some(operation => operation.readiness === 'Ready'));
assert.ok(mixedApiStep.apiOperations.some(operation => operation.readiness === 'Conditional' && operation.name.includes('supplier')));
for (const withheld of ['Unknown', 'Prohibited'] as const) {
  const decision = evaluateAssessmentV2(mixedApi);
  const supplier = mixedApi.interactions.at(-1)!;
  decision.interactionDecisions.find(item => item.interactionId === supplier.id)!.readiness.read = withheld;
  const step = buildAssessmentRecommendationModel(mixedApi, decision).steps.find(item => item.primitiveId === validation.primitiveId)!;
  assert.equal(step.apiStatus, 'mixed');
  assert.ok(step.components.includes('Native API Integration'));
  assert.equal(step.apiOperations.find(item => item.interactionId === readyValidationRead.id)?.readiness, 'Ready');
  assert.equal(step.apiOperations.find(item => item.interactionId === supplier.id)?.readiness, withheld);
}

console.log('Assess recommendation presentation model tests passed.');
