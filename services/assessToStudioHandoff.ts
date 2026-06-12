import {
  AssessProcess,
  Assessment,
  AssessToStudioAssumptionSummary,
  AssessToStudioEvidenceRef,
  AssessToStudioGovernLiteSummary,
  AssessToStudioHandoffPayload,
  AvalaGovernLiteCard,
  GeneratedArtifacts,
} from '../types';

interface BuildAssessToStudioHandoffPayloadInput {
  process: AssessProcess;
  assessment: Assessment;
  governCard?: AvalaGovernLiteCard | null;
  createdAt?: string;
}

export interface AssessToStudioSourceContextSummary {
  title: string;
  subtitle: string;
  chips: string[];
  evidenceCount: number;
  assumptionCount: number;
  documentTypes: string[];
}

const compactStrings = (items: Array<string | undefined | null>) =>
  items
    .map(item => item?.trim())
    .filter((item): item is string => Boolean(item));

const uniqueEvidenceRefs = (refs: AssessToStudioEvidenceRef[]) => {
  const seen = new Set<string>();
  const result: AssessToStudioEvidenceRef[] = [];

  for (const ref of refs) {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }

  return result;
};

const mapGovernLiteSummary = (governCard?: AvalaGovernLiteCard | null): AssessToStudioGovernLiteSummary | undefined => {
  if (!governCard) return undefined;

  return {
    governanceStatus: governCard.governanceStatus,
    riskLevel: governCard.riskLevel,
    autonomyLevel: governCard.autonomyLevel,
    approvalPolicy: governCard.approvalPolicy,
    evidencePolicy: governCard.evidencePolicy,
    nextGovernanceAction: governCard.nextGovernanceAction,
    evidenceGaps: governCard.evidenceGaps.map(gap => `${gap.label} (${gap.severity})`),
    blockedActions: [...governCard.blockedActions],
  };
};

const buildEvidenceRefs = (assessment: Assessment, payloadLabel: string): AssessToStudioEvidenceRef[] => {
  const scores = assessment.scores;
  const explicitEvidence = Array.isArray(assessment.evidenceItems)
    ? assessment.evidenceItems.map(item => ({
      id: item.id,
      type: item.type,
      description: item.description,
      owner: item.owner,
      sensitivity: item.sensitivity,
      linkedField: item.linkedField,
    }))
    : [];

  return uniqueEvidenceRefs([
    {
      id: assessment.id,
      type: 'Assessment',
      description: `${payloadLabel} assessment score record`,
    },
    {
      id: scores?.decisionPack?.auditTrailRef || `${assessment.id}:decision-pack`,
      type: 'Decision Pack',
      description: 'Deterministic Decision Pack source used for Avala Studio context',
    },
    {
      id: `${assessment.id}:handoff-pack`,
      type: 'Handoff Pack',
      description: 'Handoff Pack source used for Avala Studio document planning',
    },
    ...explicitEvidence,
  ]);
};

const buildAssumptionSummary = (assessment: Assessment): AssessToStudioAssumptionSummary[] =>
  Array.isArray(assessment.assumptions)
    ? assessment.assumptions.map(item => ({
      id: item.id,
      category: item.category,
      description: item.description,
      confidence: item.confidence,
      owner: item.owner,
      validated: item.validated,
      linkedField: item.linkedField,
    }))
    : [];

export const buildAssessToStudioHandoffPayload = ({
  process,
  assessment,
  governCard,
  createdAt = new Date().toISOString(),
}: BuildAssessToStudioHandoffPayloadInput): AssessToStudioHandoffPayload | null => {
  const scores = assessment.scores;
  if (!scores) return null;

  const decisionPack = scores.decisionPack;
  const handoffPack = scores.handoffPack;
  const operatingModelRecommendation = decisionPack?.recommendedOperatingModel || scores.recommendation;
  const sourceLabel = `${process.name} Assess source context`;

  return {
    sourceModule: 'assess',
    targetModule: 'docs',
    sourceType: 'Decision Pack / Handoff Pack',
    sourceLabel,
    createdAt,
    processId: process.id,
    processName: process.name,
    assessmentId: assessment.id,
    assessmentStatus: assessment.status,
    gateDecision: decisionPack?.finalDecision || scores.gateDecision,
    riskTier: scores.riskTier,
    confidenceBand: scores.confidenceBand,
    priorityTier: scores.priorityTier,
    recommendationCategory: operatingModelRecommendation?.category,
    operatingModelRecommendation,
    scoreVersion: scores.scoreVersion,
    calculatedAt: scores.calculatedAt,
    decisionPack,
    handoffPack,
    governLiteSummary: mapGovernLiteSummary(governCard),
    evidenceRefs: buildEvidenceRefs(assessment, process.name),
    assumptionSummary: buildAssumptionSummary(assessment),
    readiness: {
      handoffEligibility: scores.handoffEligibility,
      docsHandoffReadiness: decisionPack?.docsHandoffReadiness,
      deliveryHandoffReadiness: decisionPack?.deliveryHandoffReadiness,
    },
  };
};

export const getAssessToStudioSourceContextSummary = (
  payload?: AssessToStudioHandoffPayload | null,
): AssessToStudioSourceContextSummary | null => {
  if (!payload) return null;

  return {
    title: payload.sourceLabel,
    subtitle: `${payload.assessmentStatus} assessment, ${payload.gateDecision || 'decision pending'}, ${payload.riskTier || 'risk pending'}`,
    chips: compactStrings([
      payload.sourceType,
      payload.recommendationCategory,
      payload.confidenceBand,
      payload.priorityTier,
      payload.readiness.docsHandoffReadiness,
    ]),
    evidenceCount: payload.evidenceRefs.length,
    assumptionCount: payload.assumptionSummary.length,
    documentTypes: payload.handoffPack?.requiredDocumentTypes || [],
  };
};

export const renderAssessToStudioSourceContext = (payload: AssessToStudioHandoffPayload): string => {
  const contextEnvelope = {
    sourceModule: payload.sourceModule,
    targetModule: payload.targetModule,
    sourceType: payload.sourceType,
    sourceLabel: payload.sourceLabel,
    createdAt: payload.createdAt,
    processId: payload.processId,
    processName: payload.processName,
    assessmentId: payload.assessmentId,
    assessmentStatus: payload.assessmentStatus,
    gateDecision: payload.gateDecision,
    riskTier: payload.riskTier,
    confidenceBand: payload.confidenceBand,
    priorityTier: payload.priorityTier,
    recommendationCategory: payload.recommendationCategory,
    readiness: payload.readiness,
    operatingModelRecommendation: payload.operatingModelRecommendation,
    decisionPack: payload.decisionPack,
    handoffPack: payload.handoffPack,
    governLiteSummary: payload.governLiteSummary,
    evidenceRefs: payload.evidenceRefs,
    assumptionSummary: payload.assumptionSummary,
  };

  return [
    '# Avala Assess Source Context',
    '',
    `Source Label: ${payload.sourceLabel}`,
    `Assessment ID: ${payload.assessmentId}`,
    `Process: ${payload.processName}`,
    `Assessment Status: ${payload.assessmentStatus}`,
    `Gate Decision: ${payload.gateDecision || 'Not recorded'}`,
    `Risk Tier: ${payload.riskTier || 'Not recorded'}`,
    `Recommendation: ${payload.recommendationCategory || 'Not recorded'}`,
    '',
    'Use this read-only source context to draft governed documents for human review. Do not change deterministic scores, gates, risk tiers, or recommendations.',
    '',
    '```json',
    JSON.stringify(contextEnvelope, null, 2),
    '```',
  ].join('\n');
};

export const attachAssessToStudioSourceContext = (
  artifacts: GeneratedArtifacts,
  sourceContext?: AssessToStudioHandoffPayload | null,
): GeneratedArtifacts =>
  sourceContext
    ? {
      ...artifacts,
      sourceContext,
    }
    : artifacts;
