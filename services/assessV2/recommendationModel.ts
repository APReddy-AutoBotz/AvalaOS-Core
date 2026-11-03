import type {
  AssessmentCaseV2,
  BusinessDisposition,
  Component,
  DecisionPackV2,
  EvidenceConfidence,
  FitBand,
  InteractionMode,
  Readiness,
} from './types.ts';

const AI_COMPONENTS = new Set<Component>(['GenAI Assistant', 'Bounded Agent', 'RAG', 'Conventional ML']);
const API_MODES = new Set<InteractionMode>(['read', 'write']);

export type AiUseStatus = 'included' | 'unnecessary' | 'unproven';
export type ApiUseStatus = 'ready' | 'conditional' | 'mixed' | 'unproven' | 'not-applicable';

export interface RecommendationAlternative {
  component: Component;
  fit: FitBand;
  reason: string;
  optionalAi: boolean;
  confidence: EvidenceConfidence;
}

export interface StepRecommendation {
  primitiveId: string;
  name: string;
  type: string;
  businessDisposition?: BusinessDisposition;
  components: Component[];
  reasons: string[];
  alternatives: RecommendationAlternative[];
  evidenceConfidence: EvidenceConfidence;
  evidenceGaps: string[];
  apiStatus: ApiUseStatus;
  apiOperations: {
    interactionId: string;
    name: string;
    mode: InteractionMode;
    readiness: Readiness;
    evidenceGaps: string[];
  }[];
  humanJudgment: boolean;
  humanJudgmentReason?: string;
}

export interface AssessmentRecommendationModel {
  aiUseStatus: AiUseStatus;
  headline: string;
  explanation: string;
  steps: StepRecommendation[];
  evidenceGaps: string[];
  assumptions: string[];
}

const unique = <T,>(values: readonly T[]): T[] => Array.from(new Set(values));

const weakestConfidence = (values: readonly EvidenceConfidence[]): EvidenceConfidence => {
  const order: EvidenceConfidence[] = ['Insufficient Evidence', 'Assumption-Led', 'Partially Evidenced', 'Verified'];
  return order.find(value => values.includes(value)) ?? 'Insufficient Evidence';
};

const apiReadinessForStep = (
  assessment: AssessmentCaseV2,
  decision: DecisionPackV2,
  primitiveId: string,
) => {
  const decisions = new Map(decision.interactionDecisions.map(item => [item.interactionId, item]));
  const relevant = assessment.interactions.filter(item => item.primitiveId === primitiveId && API_MODES.has(item.mode));
  const operations = relevant.map(interaction => {
    const recorded = decisions.get(interaction.id);
    const readiness: Readiness = recorded?.readiness[interaction.mode] ?? 'Unknown';
    return { interactionId: interaction.id, name: interaction.operationName, mode: interaction.mode,
      readiness, evidenceGaps: recorded?.evidenceGaps ?? [] };
  });
  const supported = operations.filter(item => item.readiness === 'Ready' || item.readiness === 'Conditional');
  let status: ApiUseStatus = 'not-applicable';
  if (operations.length) {
    if (!supported.length) status = 'unproven';
    else if (supported.length < operations.length) status = 'mixed';
    else status = supported.some(item => item.readiness === 'Conditional') ? 'conditional' : 'ready';
  }
  return { status, operations, supported };
};

const humanJudgmentForStep = (
  assessment: AssessmentCaseV2,
  decision: DecisionPackV2,
  primitiveId: string,
  disposition: BusinessDisposition | undefined,
  components: readonly Component[],
) => {
  if (disposition === 'Human-Led') return 'The process owner marked this step as human-led.';
  if (components.includes('Human Approval')) return 'A person must make or approve the material decision.';
  const interactionIds = new Set(assessment.interactions.filter(item => item.primitiveId === primitiveId).map(item => item.id));
  if (decision.interactionDecisions.some(item => interactionIds.has(item.interactionId) && item.approvalBoundActions.length)) {
    return 'At least one action is permitted only with human approval.';
  }
  return undefined;
};

export const buildAssessmentRecommendationModel = (
  assessment: AssessmentCaseV2,
  decision: DecisionPackV2,
): AssessmentRecommendationModel => {
  const compositions = new Map(decision.composedOperatingModel.map(item => [item.primitiveId, item]));
  const steps = assessment.primitives.map(primitive => {
    const composition = compositions.get(primitive.id);
    const candidates = decision.candidateEvaluations.filter(item => item.primitiveId === primitive.id);
    const api = apiReadinessForStep(assessment, decision, primitive.id);
    const selected = (composition?.components ?? []).filter(component =>
      component !== 'Native API Integration' || api.supported.length > 0);
    const candidateByComponent = new Map(candidates.map(item => [item.component, item]));
    const selectedCandidates = selected.flatMap(component => {
      const candidate = candidateByComponent.get(component);
      return candidate ? [candidate] : [];
    });
    const reasons = unique(selectedCandidates.flatMap(item => item.rationale));
    const evidenceGaps = unique([
      ...decision.interactionDecisions
        .filter(item => assessment.interactions.some(interaction => interaction.id === item.interactionId && interaction.primitiveId === primitive.id))
        .flatMap(item => item.evidenceGaps),
      ...(composition?.components.includes('Native API Integration') && api.status === 'unproven'
        ? ['A suitable interface and its authorization controls have not been established for this step.']
        : []),
    ]);
    const humanJudgmentReason = humanJudgmentForStep(
      assessment,
      decision,
      primitive.id,
      composition?.businessDisposition,
      selected,
    );
    const alternatives = candidates
      .filter(item => !selected.includes(item.component)
        && (item.component !== 'Native API Integration' || api.supported.length > 0)
        && (item.fit === 'Strong Fit' || item.fit === 'Conditional Fit'))
      .map(item => ({ component: item.component, fit: item.fit, reason: item.rationale.join(' '),
        optionalAi: AI_COMPONENTS.has(item.component) && (item.confidence === 'Verified' || item.confidence === 'Partially Evidenced'),
        confidence: item.confidence }));
    return {
      primitiveId: primitive.id,
      name: primitive.name,
      type: primitive.type,
      ...(composition?.businessDisposition ? { businessDisposition: composition.businessDisposition } : {}),
      components: selected,
      reasons,
      alternatives,
      evidenceConfidence: weakestConfidence(selectedCandidates.map(item => item.confidence)),
      evidenceGaps,
      apiStatus: api.status,
      apiOperations: api.operations,
      humanJudgment: Boolean(humanJudgmentReason),
      ...(humanJudgmentReason ? { humanJudgmentReason } : {}),
    } satisfies StepRecommendation;
  });

  const selectedComponents = unique(steps.flatMap(step => step.components));
  const aiSelected = selectedComponents.some(component => AI_COMPONENTS.has(component));
  const everyStepCovered = steps.length > 0 && steps.every(step =>
    (step.components.length > 0 || ['Human-Led', 'Simplify', 'Monitor / Do Nothing'].includes(step.businessDisposition ?? ''))
    && (step.evidenceConfidence === 'Verified' || step.evidenceConfidence === 'Partially Evidenced'));
  const everySelectionConclusive = steps.every(step => {
    const selectedCandidates = decision.candidateEvaluations.filter(item =>
      item.primitiveId === step.primitiveId && step.components.includes(item.component));
    if ((compositions.get(step.primitiveId)?.components.length ?? 0) !== step.components.length) return false;
    return step.components.every(component => {
      const candidate = selectedCandidates.find(item => item.component === component);
      return component === 'Native API Integration'
        ? step.apiStatus === 'ready' && (!candidate || candidate.fit === 'Strong Fit')
        : candidate?.fit === 'Strong Fit';
    });
  });
  const aiUseStatus: AiUseStatus = aiSelected
    ? 'included'
    : everyStepCovered && everySelectionConclusive && decision.processReadiness !== 'Insufficient evidence'
      ? 'unnecessary'
      : 'unproven';
  const coverage = selectedComponents.length ? selectedComponents.join(', ') : 'human work and unresolved design questions';
  const headline = aiUseStatus === 'included'
    ? 'Bounded AI is part of the proposed operating model'
    : aiUseStatus === 'unnecessary'
      ? 'No AI required for the recommended design'
      : 'More evidence is needed to decide whether AI is required';
  const explanation = aiUseStatus === 'included'
    ? `The deterministic assessment selected ${coverage}. AI remains bounded by the listed controls and human decisions.`
    : aiUseStatus === 'unnecessary'
      ? `The evidence-supported composition is covered by ${coverage}. These steps can proceed without AI.`
      : `The current facts do not justify an AI conclusion. The components under consideration are ${coverage}. Review the alternatives and evidence gaps before deciding.`;

  return {
    aiUseStatus,
    headline,
    explanation,
    steps,
    evidenceGaps: decision.evidenceGaps,
    assumptions: decision.assumptions,
  };
};
