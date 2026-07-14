import { buildDecisionDigestV2, DecisionDigestBinding, isSha256Hex } from './canonical';
import { evaluateAssessmentV2 } from './evaluator';
import { AssessmentCaseV2, ImmutableDecisionVersionV2 } from './types';

const deepFreeze = <T>(value: T): T => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; };
export interface BuildDecisionVersionOptions { supersedesDecisionId?: string }

export const buildDecisionVersionV2 = async (input: AssessmentCaseV2, createdBy: string, createdAt: string, options: BuildDecisionVersionOptions = {}): Promise<ImmutableDecisionVersionV2> => {
  if (!createdBy.trim()) throw new Error('A server-validated decision actor is required.');
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('A valid decision timestamp is required.');
  const inputSnapshot = structuredClone(input), evidenceSnapshot = structuredClone(input.evidence), outputSnapshot = evaluateAssessmentV2(inputSnapshot);
  const binding: DecisionDigestBinding = { organizationId: input.organizationId, workspaceId: input.workspaceId, caseId: input.id, sourceCaseVersion: input.version, schemaVersion: input.schemaVersion, ruleSetVersion: input.ruleSetVersion, decisionVersion: outputSnapshot.decisionVersion };
  const decision: ImmutableDecisionVersionV2 = {
    caseId: input.id, sourceCaseVersion: input.version, ruleSetVersion: input.ruleSetVersion, decisionVersion: outputSnapshot.decisionVersion,
    inputSnapshot, evidenceSnapshot, outputSnapshot,
    inputHash: await buildDecisionDigestV2('input', binding, inputSnapshot),
    evidenceHash: await buildDecisionDigestV2('evidence', binding, evidenceSnapshot),
    outputHash: await buildDecisionDigestV2('output', binding, outputSnapshot),
    ...(options.supersedesDecisionId ? { supersedesDecisionId: options.supersedesDecisionId } : {}), createdBy, createdAt, validationStatus: 'reviewer-ready',
  };
  if (![decision.inputHash, decision.evidenceHash, decision.outputHash].every(isSha256Hex)) throw new Error('Decision snapshot hashing failed closed.');
  return deepFreeze(decision);
};

export const buildDecisionPackRenderModel = (decision: ImmutableDecisionVersionV2) => ({
  title: 'Avala Assess V2 Decision Pack', subtitle: 'Composed operating model across eligible components', executiveDecision: decision.outputSnapshot.executiveDecision,
  assessmentBoundary: decision.outputSnapshot.assessmentBoundary, confidence: decision.outputSnapshot.confidence, processReadiness: decision.outputSnapshot.processReadiness,
  primitivesDecisionsAndExceptions: { primitives: decision.inputSnapshot.primitives, decisionPoints: decision.inputSnapshot.decisionPoints ?? [], exceptionPaths: decision.inputSnapshot.exceptionPaths ?? [] },
  candidateAlternatives: decision.outputSnapshot.candidateEvaluations, composition: decision.outputSnapshot.composedOperatingModel, interactions: decision.outputSnapshot.interactionDecisions,
  allowedActions: decision.outputSnapshot.interactionDecisions.flatMap(item => item.allowedActions), prohibitedActions: decision.outputSnapshot.interactionDecisions.flatMap(item => item.prohibitedActions),
  controlsAndApprovals: decision.outputSnapshot.controls, modernization: decision.outputSnapshot.modernization,
  evidenceAndAssumptions: { evidence: decision.evidenceSnapshot, gaps: decision.outputSnapshot.evidenceGaps, assumptions: decision.outputSnapshot.assumptions },
  openRemediationActions: decision.outputSnapshot.openRemediationActions ?? [], whatWouldChangeDecision: decision.outputSnapshot.whatWouldChangeDecision,
  references: { schemaVersion: decision.outputSnapshot.schemaVersion, ruleSetVersion: decision.ruleSetVersion, decisionVersion: decision.decisionVersion, inputHash: decision.inputHash, evidenceHash: decision.evidenceHash, outputHash: decision.outputHash },
  nonClaims: decision.outputSnapshot.nonClaims,
});
