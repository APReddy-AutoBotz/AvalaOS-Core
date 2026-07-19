import assert from 'node:assert/strict';
import { buildDecisionCanonicalV2, canonicalizeDecisionPayload, isSha256Hex, sha256Hex } from './canonical';
import { buildDecisionPackRenderModel, buildDecisionVersionV2 } from './decisionVersion';
import { deriveEvidenceConfidence, evaluateAgentNecessity, evaluateAssessmentV2, evaluateCandidateFit, evaluateInteractionReadiness, registeredDecisionFieldIds, validateAssessmentV2 } from './evaluator';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from './fixture';
import { FIELD_REGISTRY, RULE_REGISTRY, validateDecisionFieldInputs, validateEvidenceLinks, validateFieldRegistry } from './registry';
import { ASSESS_V2_DECISION_VERSION, ASSESS_V2_RULE_SET_VERSION, AgentNecessityFacts, CaseFact, Component, createUnknownAgentNecessityFacts } from './types';

const fact = (fieldId: string, value: boolean | null, evidenceIds: string[] = []): CaseFact<boolean> => ({ fieldId, value, status: value === null ? 'unknown' : 'known', evidenceIds, source: 'user' });
const agentFacts = (value: boolean | null, evidenceIds: string[] = []): AgentNecessityFacts => ({
  irreducibleAmbiguity: fact('agent.irreducibleAmbiguity', value, evidenceIds),
  adaptiveNextStep: fact('agent.adaptiveNextStep', value, evidenceIds),
  toolOrPathSelection: fact('agent.toolOrPathSelection', value, evidenceIds),
  incrementalValue: fact('agent.incrementalValue', value, evidenceIds),
  controllable: fact('agent.controllable', value, evidenceIds),
});

const run = async () => {
  console.log('Running Assess V2 domain, registry, evaluator, and snapshot tests...');
  assert.deepEqual(validateFieldRegistry(), []);
  assert.ok(FIELD_REGISTRY.every(item => item.use === 'context' || item.ruleIds.length));
  assert.ok(RULE_REGISTRY.every(rule => FIELD_REGISTRY.some(item => item.ruleIds.includes(rule.ruleId)) || rule.ruleId === 'EVID-002'));
  assert.match(validateDecisionFieldInputs([{ fieldId: 'unknown.field', value: true, unit: 'boolean' }])[0], /unknown field/);
  assert.ok(validateDecisionFieldInputs([
    { fieldId: 'interaction.mode', value: 'ui', unit: 'category', contextId: 'interaction-1' },
    { fieldId: 'interaction.uiStable', value: true, unit: 'count', contextId: 'interaction-1' },
  ]).some(error => /expected boolean/.test(error)));
  assert.ok(validateDecisionFieldInputs([
    { fieldId: 'interaction.mode', value: 'read', unit: 'category', contextId: 'interaction-1' },
    { fieldId: 'interaction.uiStable', value: true, unit: 'boolean', contextId: 'interaction-1', applicable: true },
  ]).some(error => /supplied applicability|not applicable/.test(error)));
  assert.ok(validateEvidenceLinks([{ id: 'template', claimIds: ['claim'], sourceType: 'template', status: 'validated', validated: true, owner: 'owner' } as unknown as import('./types').EvidenceLink]).length);

  assert.equal(canonicalizeDecisionPayload({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(canonicalizeDecisionPayload({ tiny: 1e-7, huge: 1e21, negativeZero: -0 }), '{"huge":1000000000000000000000,"negativeZero":0,"tiny":0.0000001}');
  assert.equal(await sha256Hex({ b: 2, a: 1 }), '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
  assert.throws(() => canonicalizeDecisionPayload({ invalid: undefined }), /undefined/);
  assert.throws(() => canonicalizeDecisionPayload({ invalid: Number.NaN }), /non-finite/);

  assert.deepEqual(validateAssessmentV2(AP_INVOICE_EXCEPTION_V2_FIXTURE), []);
  const unknownEvidenceClaim = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  unknownEvidenceClaim.evidence[0].claimIds = ['assessment.scope'];
  assert.ok(validateAssessmentV2(unknownEvidenceClaim).some(error => /assessment\.scope.*not a registered decision field/.test(error)));
  const unboundV1EvidenceClaim = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  unboundV1EvidenceClaim.evidence[0].claimIds = ['v1.evidence.legacy-evidence-1'];
  assert.ok(validateAssessmentV2(unboundV1EvidenceClaim).some(error => /v1\.evidence\.legacy-evidence-1.*not a registered decision field/.test(error)));
  const importedFactClaim = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const importedV1EvidenceClaim = 'v1.evidence.legacy-evidence-1';
  importedFactClaim.sourceV1 = {
    assessmentId: 'legacy-assessment',
    scoreVersion: 'assess-core-2026-05',
    clonedAt: '2026-07-14T00:00:00.000Z',
    importedAs: 'unverified-source-facts',
    importedEvidenceClaimIds: [importedV1EvidenceClaim],
  };
  importedFactClaim.importedFacts = [{
    fieldId: 'v1.responses.processStructure.trigger',
    value: 'invoice-received',
    status: 'assumed',
    evidenceIds: [importedFactClaim.evidence[0].id],
    source: 'v1-import',
  }];
  importedFactClaim.evidence[0].claimIds = ['v1.responses.processStructure.trigger', importedV1EvidenceClaim];
  assert.deepEqual(validateAssessmentV2(importedFactClaim), []);
  const fabricatedV1EvidenceClaim = structuredClone(importedFactClaim);
  fabricatedV1EvidenceClaim.evidence[0].claimIds = ['v1.evidence.fabricated-but-valid'];
  assert.ok(validateAssessmentV2(fabricatedV1EvidenceClaim).some(error => /v1\.evidence\.fabricated-but-valid.*not a registered decision field/.test(error)));
  const unprojectedV1EvidenceClaim = structuredClone(importedFactClaim);
  unprojectedV1EvidenceClaim.sourceV1!.importedEvidenceClaimIds = [];
  assert.ok(validateAssessmentV2(unprojectedV1EvidenceClaim).some(error => /v1\.evidence\.legacy-evidence-1.*not a registered decision field/.test(error)));
  const decision = evaluateAssessmentV2(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  assert.equal(ASSESS_V2_RULE_SET_VERSION, 'assess-v2-rules-2026-07', 'the existing INT-006 rule-set contract remains stable');
  assert.equal(ASSESS_V2_DECISION_VERSION, 'assess-v2-decision-2026-07-19', 'corrected action and evidence-time output uses a new decision version');
  assert.equal(decision.decisionVersion, ASSESS_V2_DECISION_VERSION);
  assert.equal(decision.confidence, 'Partially Evidenced');
  assert.equal(decision.processReadiness, 'Provisional');
  assert.ok(decision.composedOperatingModel.some(item => item.components.includes('Document Intelligence')));
  const erp = decision.modernization[0];
  assert.ok(erp.dispositions.includes('Retain'));
  assert.ok(!erp.dispositions.some(item => ['Replace', 'Retire', 'Incremental Rebuild'].includes(item)));
  assert.ok(decision.composedOperatingModel.flatMap(item => item.components).includes('Dynamic Case Management'));
  const extractId = AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives.find(item => item.type === 'Extract')!.id;
  assert.deepEqual(decision.composedOperatingModel.find(item => item.primitiveId === extractId)?.components, ['Document Intelligence']);


  const stableBefore = evaluateAssessmentV2(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const stableAfter = evaluateAssessmentV2(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  assert.deepEqual(stableAfter, stableBefore);
  const evaluatedAfterExpiry = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  evaluatedAfterExpiry.updatedAt = '2028-07-14T00:00:00.000Z';
  assert.equal(deriveEvidenceConfidence(evaluatedAfterExpiry), 'Insufficient Evidence');
  const mismatchedClaim = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  mismatchedClaim.evidence[1].claimIds = mismatchedClaim.evidence[1].claimIds.filter(id => id !== 'primitive.documentQualityRepresentative');
  assert.equal(deriveEvidenceConfidence(mismatchedClaim), 'Partially Evidenced');
  const mismatchedExtract = mismatchedClaim.primitives.find(item => item.type === 'Extract')!;
  assert.equal(evaluateCandidateFit(mismatchedExtract, 'Document Intelligence', mismatchedClaim.evidence, mismatchedClaim.createdAt).confidence, 'Assumption-Led');
  const mismatchedCandidateTrace = evaluateAssessmentV2(mismatchedClaim).trace.find(item => item.subjectId === mismatchedExtract.id && item.ruleId === 'CAND-001' && item.outcome.startsWith('Document Intelligence'))!;
  assert.ok(!mismatchedCandidateTrace.evidenceIds.includes(mismatchedClaim.evidence[1].id) || mismatchedClaim.evidence[1].claimIds.some(claimId => mismatchedCandidateTrace.fieldIds.includes(claimId)));

  const missingRequiredEvidence = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const missingEvidenceExtract = missingRequiredEvidence.primitives.find(item => item.type === 'Extract')!;
  missingEvidenceExtract.facts['primitive.exceptionSamplesAvailable'].evidenceIds = [];
  assert.equal(evaluateCandidateFit(missingEvidenceExtract, 'Document Intelligence', missingRequiredEvidence.evidence, missingRequiredEvidence.createdAt).confidence, 'Assumption-Led');
  assert.equal(deriveEvidenceConfidence(missingRequiredEvidence), 'Partially Evidenced');
  const missingRequiredDecision = evaluateAssessmentV2(missingRequiredEvidence);
  assert.notEqual(missingRequiredDecision.confidence, 'Verified');
  assert.ok(missingRequiredDecision.evidenceGaps.includes('primitive.exceptionSamplesAvailable has no claim-linked evidence.'));

  const falseAndUnknown = agentFacts(true);
  falseAndUnknown.irreducibleAmbiguity = fact('agent.irreducibleAmbiguity', false);
  falseAndUnknown.adaptiveNextStep = fact('agent.adaptiveNextStep', null);
  assert.equal(evaluateAgentNecessity('primitive', falseAndUnknown).fit, 'Ineligible');
  assert.equal(evaluateAgentNecessity('primitive', agentFacts(true)).fit, 'Conditional Fit');
  assert.equal(evaluateAgentNecessity('primitive', agentFacts(true)).confidence, 'Assumption-Led');
  const evidenceId = AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence[1].id;
  const evidencedAgent = evaluateAgentNecessity('primitive', agentFacts(true, [evidenceId]), AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence);
  assert.equal(evidencedAgent.fit, 'Conditional Fit');
  assert.equal(evidencedAgent.confidence, 'Assumption-Led');
  assert.ok(evidencedAgent.fieldIds.length === 5 && evidencedAgent.evidenceIds.length === 1);
  assert.equal(evaluateAgentNecessity('primitive', createUnknownAgentNecessityFacts()).fit, 'Weak Fit');
  assert.ok(!decision.candidateEvaluations.some(item => item.component === 'Bounded Agent' && item.primitiveId === AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives.find(p => p.type === 'Extract')!.id));

  const base = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions[0]);
  const read = evaluateInteractionReadiness(base);
  assert.equal(read.readiness.read, 'Ready');
  assert.equal(read.readiness.write, 'Not Applicable');
  assert.ok(read.allowedActions.every(action => action.startsWith('read:')));
  const readWithWriteOnlyDeclarations = structuredClone(base);
  readWithWriteOnlyDeclarations.facts.highImpact = true;
  readWithWriteOnlyDeclarations.facts.financialAction = true;
  readWithWriteOnlyDeclarations.facts.auditable = null;
  readWithWriteOnlyDeclarations.facts.rollback = null;
  readWithWriteOnlyDeclarations.facts.idempotent = null;
  readWithWriteOnlyDeclarations.facts.compensatable = null;
  const readWithWriteOnlyDecision = evaluateInteractionReadiness(readWithWriteOnlyDeclarations);
  assert.deepEqual(readWithWriteOnlyDecision.requiredControls, ['Audit correlation']);
  assert.deepEqual(readWithWriteOnlyDecision.prohibitedActions, []);
  assert.ok(!readWithWriteOnlyDecision.evidenceGaps.some(gap => /auditable|rollback|idempotent|compensatable/.test(gap)));
  assert.ok(!readWithWriteOnlyDecision.ruleIds.some(ruleId => ['INT-005', 'INT-006', 'INT-007'].includes(ruleId)));

  const notApplicableInteractionEvidence = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const readInteraction = notApplicableInteractionEvidence.interactions.find(item => item.mode === 'read')!;
  readInteraction.facts.machineIdentity = null;
  readInteraction.facts.leastPrivilege = null;
  readInteraction.facts.uiStable = null;
  readInteraction.facts.auditable = null;
  readInteraction.facts.idempotent = null;
  readInteraction.facts.compensatable = null;
  readInteraction.facts.rollback = null;
  readInteraction.facts.testEnvironment = null;
  readInteraction.facts.accountableOwner = null;
  readInteraction.facts.eventSemantics = null;
  readInteraction.facts.monitored = null;
  readInteraction.facts.capacityKnown = null;
  assert.equal(deriveEvidenceConfidence(notApplicableInteractionEvidence), 'Partially Evidenced');
  assert.ok(!evaluateAssessmentV2(notApplicableInteractionEvidence).evidenceGaps.some(gap =>
    gap.startsWith(`${readInteraction.id}:`) && /machineIdentity|leastPrivilege|uiStable|auditable|idempotent|compensatable|rollback|testEnvironment|accountableOwner|eventSemantics|monitored|capacityKnown/.test(gap)));
  const ui = structuredClone(base); ui.mode = 'ui'; ui.facts.interfaceAvailable = false; ui.facts.operationCovered = false; ui.facts.uiStable = true;
  const uiDecision = evaluateInteractionReadiness(ui);
  assert.equal(uiDecision.readiness.ui, 'Conditional');
  assert.equal(uiDecision.readiness.read, 'Not Applicable');
  assert.ok(![...uiDecision.allowedActions, ...uiDecision.approvalBoundActions].some(action => /read:|write:|event:/.test(action)));
  const apiWithUnstableUi = structuredClone(base); apiWithUnstableUi.facts.uiStable = false;
  assert.equal(evaluateInteractionReadiness(apiWithUnstableUi).readiness.read, 'Ready');
  const operational = structuredClone(base); operational.mode = 'operational'; operational.facts.capacityKnown = null;
  assert.equal(evaluateInteractionReadiness(operational).readiness.operational, 'Unknown');
  operational.facts.capacityKnown = true; operational.facts.accountableOwner = null;
  assert.equal(evaluateInteractionReadiness(operational).readiness.operational, 'Unknown');
  const write = structuredClone(base); write.mode = 'write'; write.facts.machineIdentity = null;
  assert.equal(evaluateInteractionReadiness(write).readiness.write, 'Unknown');
  assert.equal(evaluateInteractionReadiness(write).allowedActions.length, 0);
  assert.deepEqual(evaluateInteractionReadiness(write).ruleIds, ['INT-014', 'INT-001', 'INT-002', 'INT-003']);
  write.facts.highImpact = true;
  assert.deepEqual(evaluateInteractionReadiness(write).ruleIds, ['INT-014', 'INT-001', 'INT-002', 'INT-003', 'INT-005', 'INT-007']);
  write.facts.financialAction = true;
  assert.deepEqual(evaluateInteractionReadiness(write).ruleIds, ['INT-014', 'INT-001', 'INT-002', 'INT-003', 'INT-005', 'INT-007', 'INT-006']);
  const readyFinancialWrite = structuredClone(base);
  readyFinancialWrite.mode = 'write';
  readyFinancialWrite.facts.financialAction = true;
  const readyFinancialDecision = evaluateInteractionReadiness(readyFinancialWrite);
  assert.equal(readyFinancialDecision.readiness.write, 'Ready', 'financial approval changes the action boundary, not technical readiness');
  assert.deepEqual(readyFinancialDecision.allowedActions, []);
  assert.deepEqual(readyFinancialDecision.approvalBoundActions, [`write with controls: ${readyFinancialWrite.operationName}`]);
  assert.deepEqual(readyFinancialDecision.prohibitedActions, [`autonomous financial action: ${readyFinancialWrite.operationName}`]);
  assert.ok(readyFinancialDecision.requiredControls.includes('Human approval'));
  const readyFinancialCase = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  readyFinancialCase.interactions[0] = readyFinancialWrite;
  const readyFinancialPack = evaluateAssessmentV2(readyFinancialCase, '2026-07-14T01:00:00.000Z');
  const readyFinancialTrace = readyFinancialPack.trace.find(item => item.subjectId === readyFinancialWrite.id && item.ruleId === 'INT-006');
  assert.deepEqual(readyFinancialTrace?.fieldIds, ['interaction.mode', 'interaction.financialAction', 'interaction.idempotent', 'interaction.compensatable']);
  assert.match(readyFinancialTrace!.outcome, /interaction\.financialAction=true.*interaction\.idempotent=true.*interaction\.compensatable=true.*=> Ready/);
  assert.deepEqual(evaluateAssessmentV2(readyFinancialCase, '2026-07-14T01:00:00.000Z'), readyFinancialPack, 'financial action trace is deterministic');

  const extract = AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives.find(item => item.type === 'Extract')!;
  const strong = evaluateCandidateFit(extract, 'Document Intelligence', AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence);
  assert.equal(strong.fit, 'Strong Fit');
  const unknownExtract = structuredClone(extract); unknownExtract.facts['primitive.documentQualityRepresentative'].value = null; unknownExtract.facts['primitive.documentQualityRepresentative'].status = 'unknown';
  assert.equal(evaluateCandidateFit(unknownExtract, 'Document Intelligence', AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence).fit, 'Conditional Fit');
  assert.equal(evaluateCandidateFit(extract, 'Bounded Agent' as Component, AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence).fit, 'Not Applicable');

  const confidenceChanged = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  confidenceChanged.evidence[0].status = 'suggested';
  assert.equal(deriveEvidenceConfidence(confidenceChanged), 'Partially Evidenced');
  assert.ok(!evaluateAssessmentV2(AP_INVOICE_EXCEPTION_V2_FIXTURE).candidateEvaluations.some(item => item.confidence === 'Verified'), 'PR 1D submitted evidence cannot produce Verified confidence');
  assert.deepEqual(evaluateAssessmentV2(confidenceChanged).candidateEvaluations.map(item => item.fit), decision.candidateEvaluations.map(item => item.fit));
  const contextChanged = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  contextChanged.primitives[0].businessDisposition = 'Human-Led';
  assert.deepEqual(evaluateAssessmentV2(contextChanged).candidateEvaluations.map(item => item.fit), decision.candidateEvaluations.map(item => item.fit));
  const agentChanged = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  agentChanged.primitives.find(item => item.type === 'Investigate')!.agentNecessity!.controllable.value = false;
  assert.deepEqual(evaluateAssessmentV2(agentChanged).modernization, decision.modernization);

  const unknownModernization = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  unknownModernization.assets[0].strategicLifespan = 'unknown';
  unknownModernization.assets[0].technicalHealth = 'unknown';
  unknownModernization.assets[0].vendorRoadmap = 'unknown';
  assert.deepEqual(evaluateAssessmentV2(unknownModernization).modernization[0].dispositions, ['Retain']);

  const unrelatedLifecycleEvidence = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  unrelatedLifecycleEvidence.evidence[0].claimIds = unrelatedLifecycleEvidence.evidence[0].claimIds.filter(claimId => !claimId.startsWith('asset.'));
  const lifecycleTrace = evaluateAssessmentV2(unrelatedLifecycleEvidence).trace.find(item => item.ruleId === 'MOD-001' && item.subjectId === unrelatedLifecycleEvidence.assets[0].id)!;
  assert.deepEqual(lifecycleTrace.evidenceIds, [], 'MOD-001 must not attach evidence that does not claim a lifecycle field.');

  assert.ok(decision.trace.length > 0);
  const extractComposition = decision.trace.filter(item => item.subjectId === extractId && item.ruleId === 'COMPOSE-001');
  assert.equal(extractComposition.length, 1);
  assert.equal(extractComposition[0].outcome, 'Selected Document Intelligence');
  assert.deepEqual(extractComposition[0].fieldIds, ['primitive.type', 'primitive.documentQualityRepresentative', 'primitive.exceptionSamplesAvailable']);
  assert.ok(!decision.trace.some(item => item.ruleId === 'COMPOSE-001' && /Validation/.test(item.outcome) && item.subjectId === extractId));
  const plainWriteTraceRules = evaluateAssessmentV2({ ...AP_INVOICE_EXCEPTION_V2_FIXTURE, interactions: [{ ...AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions[1], facts: { ...AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions[1].facts, highImpact: false, financialAction: false } }] }).trace.filter(item => item.subjectId === AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions[1].id).map(item => item.ruleId);
  assert.ok(!plainWriteTraceRules.some(rule => ['INT-005', 'INT-006', 'INT-007'].includes(rule)));
  assert.deepEqual(decision.trace.find(item => item.ruleId === 'INT-006')?.fieldIds, ['interaction.mode', 'interaction.financialAction', 'interaction.idempotent', 'interaction.compensatable']);
  assert.match(decision.trace.find(item => item.ruleId === 'INT-006')!.outcome, /interaction\.financialAction=true.*interaction\.idempotent=true.*interaction\.compensatable=true.*Conditional/);
  assert.ok(decision.trace.find(item => item.ruleId === 'INT-006')!.evidenceIds.every(id => AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence.find(item => item.id === id)!.claimIds.some(claimId => decision.trace.find(item => item.ruleId === 'INT-006')!.fieldIds.includes(claimId))));
  const investigateId = AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives.find(item => item.type === 'Investigate')!.id;
  const expectedAgentTraceFields: Record<string, string> = {
    'AGENT-001': 'agent.irreducibleAmbiguity',
    'AGENT-002': 'agent.adaptiveNextStep',
    'AGENT-003': 'agent.toolOrPathSelection',
    'AGENT-004': 'agent.incrementalValue',
    'AGENT-005': 'agent.controllable',
  };
  for (const [ruleId, fieldId] of Object.entries(expectedAgentTraceFields)) {
    const agentTrace = decision.trace.find(item => item.subjectId === investigateId && item.ruleId === ruleId)!;
    assert.deepEqual(agentTrace.fieldIds, [fieldId]);
    assert.ok(agentTrace.evidenceIds.length > 0);
    assert.ok(agentTrace.evidenceIds.every(id => AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence.find(item => item.id === id)!.claimIds.includes(fieldId)));
  }
  const registered = registeredDecisionFieldIds();
  for (const trace of decision.trace) {
    assert.ok(trace.ruleId && trace.subjectId && trace.fieldIds.length && trace.rationale);
    assert.ok(trace.fieldIds.every(fieldId => registered.has(fieldId)), `unregistered trace field: ${trace.fieldIds.join(',')}`);
    assert.ok(trace.evidenceIds.every(id => AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence.some(item => item.id === id)));
  }
  const minimal = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  minimal.primitives = [minimal.primitives[0]]; minimal.edges = []; minimal.decisionPoints = []; minimal.exceptionPaths = []; minimal.assets = []; minimal.interactions = []; minimal.evidence = [];
  assert.ok(validateAssessmentV2(minimal).some(error => /At least two|edge, decision/.test(error)));
  assert.throws(() => evaluateAssessmentV2(minimal), /Invalid Assess V2 case/);

  const scaffold = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  for (const primitive of scaffold.primitives) primitive.facts = {};
  for (const asset of scaffold.assets) {
    asset.strategicLifespan = 'unknown'; asset.technicalHealth = 'unknown'; asset.businessCriticality = 'unknown';
    asset.ownershipModel = 'unknown'; asset.vendorRoadmap = 'unknown'; asset.operatingStability = 'unknown'; asset.accountableOwner = null;
  }
  for (const interaction of scaffold.interactions) {
    interaction.dataClassification = 'Unknown';
    for (const key of Object.keys(interaction.facts) as Array<keyof typeof interaction.facts>) {
      if (!['highImpact', 'financialAction', 'untrustedContentWithTools'].includes(key)) interaction.facts[key] = null;
    }
  }
  scaffold.decisionPoints[0].outcomeLabels = ['Continue'];
  scaffold.exceptionPaths[0].resolutionPrimitiveIds = [];
  scaffold.evidence = scaffold.evidence.map(item => ({ ...item, sourceType: 'template', status: 'suggested', validated: false, claimIds: [] }));
  const scaffoldErrors = validateAssessmentV2(scaffold);
  assert.ok(scaffoldErrors.some(error => /meaningful finalization/.test(error)));
  assert.throws(() => evaluateAssessmentV2(scaffold), /meaningful finalization/);
  await assert.rejects(() => buildDecisionVersionV2(scaffold, 'server-actor', '2026-07-14T01:00:00.000Z'), /meaningful finalization/);

  const input = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const immutable = await buildDecisionVersionV2(input, 'server-actor', '2026-07-14T01:00:00.000Z');
  assert.ok([immutable.inputHash, immutable.evidenceHash, immutable.outputHash].every(isSha256Hex));
  assert.equal(JSON.parse(immutable.inputCanonical).payload.id, input.id);
  assert.equal(immutable.inputCanonical, buildDecisionCanonicalV2('input', { organizationId: input.organizationId, workspaceId: input.workspaceId, caseId: input.id, sourceCaseVersion: input.version, schemaVersion: input.schemaVersion, ruleSetVersion: input.ruleSetVersion, decisionVersion: immutable.outputSnapshot.decisionVersion }, immutable.inputSnapshot));
  assert.equal(Object.isFrozen(immutable.outputSnapshot), true);
  assert.equal(input.status, 'draft');
  const expiresBeforeFinalization = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
  expiresBeforeFinalization.updatedAt = '2026-07-14T00:15:00.000Z';
  for (const evidence of expiresBeforeFinalization.evidence) evidence.validUntil = '2026-07-14T00:30:00.000Z';
  assert.equal(deriveEvidenceConfidence(expiresBeforeFinalization), 'Partially Evidenced', 'evidence is current at the draft timestamp');
  const finalizedAfterExpiry = await buildDecisionVersionV2(expiresBeforeFinalization, 'server-actor', '2026-07-14T01:00:00.000Z');
  assert.equal(finalizedAfterExpiry.outputSnapshot.confidence, 'Insufficient Evidence', 'finalization evaluates freshness at the server-supplied decision timestamp');
  assert.equal(finalizedAfterExpiry.createdAt, '2026-07-14T01:00:00.000Z');
  assert.equal(finalizedAfterExpiry.ruleSetVersion, ASSESS_V2_RULE_SET_VERSION);
  assert.equal(finalizedAfterExpiry.decisionVersion, ASSESS_V2_DECISION_VERSION);
  assert.equal(finalizedAfterExpiry.outputSnapshot.decisionVersion, ASSESS_V2_DECISION_VERSION);
  await assert.rejects(() => buildDecisionVersionV2(input, '   ', '2026-07-14T01:00:00.000Z'), /actor is required/);
  await assert.rejects(() => buildDecisionVersionV2(input, 'server-actor', 'not-a-timestamp'), /timestamp is required/);
  const render = buildDecisionPackRenderModel(immutable);
  assert.ok(render.allowedActions.length && render.prohibitedActions.length && render.approvalBoundActions.length);
  assert.ok(render.candidateAlternatives.length && render.interactions.length && render.modernization.length && render.evidenceAndAssumptions.evidence.length);
  assert.ok(render.nonClaims.some(claim => claim.includes('No V2 approval')));
  console.log('Assess V2 domain, registry, evaluator, and snapshot tests passed.');
};

run().catch(error => { console.error(error); process.exitCode = 1; });
