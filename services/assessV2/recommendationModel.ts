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
export type ApiUseStatus = 'ready' | 'conditional' | 'unproven' | 'not-applicable';

export interface RecommendationAlternative {
  component: Component;
  fit: FitBand;
  reason: string;
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
  apiOperations: string[];
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
  const observed = relevant.map(interaction => {
    const readiness = decisions.get(interaction.id)?.readiness[interaction.mode] ?? 'Unknown';
    return { operationName: interaction.operationName, readiness };
  });
  const available = observed.filter((item): item is { operationName: string; readiness: 'Ready' | 'Conditional' } =>
    item.readiness === 'Ready' || item.readiness === 'Conditional');
  const status: ApiUseStatus = !relevant.length
    ? 'not-applicable'
    : observed.some(item => item.readiness !== 'Ready' && item.readiness !== 'Conditional')
      ? 'unproven'
      : available.some(item => item.readiness === 'Conditional')
      ? 'conditional'
      : 'ready';
  return { status, available };
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
      component !== 'Native API Integration' || api.status === 'ready' || api.status === 'conditional');
    const candidateByComponent = new Map(candidates.map(item => [item.component, item]));
    const selectedCandidates = selected.flatMap(component => {
      const candidate = candidateByComponent.get(component);
      return candidate ? [candidate] : [];
    });
    const reasons = unique([
      ...selectedCandidates.flatMap(item => item.rationale),
      ...api.available.map(operation => operation.readiness === 'Ready'
        ? `${operation.operationName} has a declared interface that passed the deterministic readiness gates.`
        : `${operation.operationName} has a conditional interface path. Its listed gaps and controls remain required.`),
    ]);
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
      .filter(item => !selected.includes(item.component) && (item.fit === 'Strong Fit' || item.fit === 'Conditional Fit'))
      .map(item => ({ component: item.component, fit: item.fit, reason: item.rationale.join(' ') }));
    return {
      primitiveId: primitive.id,
      name: primitive.name,
      type: primitive.type,
      ...(composition?.businessDisposition ? { businessDisposition: composition.businessDisposition } : {}),
      components: selected,
      reasons: reasons.length ? reasons : ['No suitable automated component has been established for this step.'],
      alternatives,
      evidenceConfidence: weakestConfidence(selectedCandidates.map(item => item.confidence)),
      evidenceGaps,
      apiStatus: api.status,
      apiOperations: api.available.map(item => item.operationName),
      humanJudgment: Boolean(humanJudgmentReason),
      ...(humanJudgmentReason ? { humanJudgmentReason } : {}),
    } satisfies StepRecommendation;
  });

  const selectedComponents = unique(steps.flatMap(step => step.components));
  const aiSelected = selectedComponents.some(component => AI_COMPONENTS.has(component));
  const aiCandidates = decision.candidateEvaluations.filter(item => AI_COMPONENTS.has(item.component));
  const aiEligibilityConclusive = aiCandidates.every(item =>
    (item.fit === 'Ineligible' && (item.confidence === 'Verified' || item.confidence === 'Partially Evidenced'))
    || item.fit === 'Not Applicable');
  const everyStepCovered = steps.length > 0 && steps.every(step =>
    (step.components.length > 0 || ['Human-Led', 'Simplify', 'Monitor / Do Nothing'].includes(step.businessDisposition ?? ''))
    && (step.evidenceConfidence === 'Verified' || step.evidenceConfidence === 'Partially Evidenced'));
  const everySelectionConclusive = steps.every(step => {
    const selectedCandidates = decision.candidateEvaluations.filter(item =>
      item.primitiveId === step.primitiveId && step.components.includes(item.component));
    return step.components.every(component => {
      const candidate = selectedCandidates.find(item => item.component === component);
      return component === 'Native API Integration'
        ? step.apiStatus === 'ready' && (!candidate || candidate.fit === 'Strong Fit')
        : candidate?.fit === 'Strong Fit';
    });
  });
  const aiUseStatus: AiUseStatus = aiSelected
    ? 'included'
    : aiEligibilityConclusive && everyStepCovered && everySelectionConclusive && decision.processReadiness !== 'Insufficient evidence'
      ? 'unnecessary'
      : 'unproven';
  const coverage = selectedComponents.length ? selectedComponents.join(', ') : 'human work and unresolved design questions';
  const headline = aiUseStatus === 'included'
    ? 'Bounded AI is part of the proposed operating model'
    : aiUseStatus === 'unnecessary'
      ? 'AI is unnecessary for the proposed operating model'
      : 'AI necessity remains unproven';
  const explanation = aiUseStatus === 'included'
    ? `The deterministic assessment selected ${coverage}. AI remains bounded by the listed controls and human decisions.`
    : aiUseStatus === 'unnecessary'
      ? `The evidence-supported composition is covered by ${coverage}. No AI candidate is eligible or required.`
      : `The current facts do not justify an AI conclusion. The proposed non-AI components are ${coverage}. Review the alternatives and evidence gaps before deciding.`;

  return {
    aiUseStatus,
    headline,
    explanation,
    steps,
    evidenceGaps: decision.evidenceGaps,
    assumptions: decision.assumptions,
  };
};
