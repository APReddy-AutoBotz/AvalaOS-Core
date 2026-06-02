import {
  AssessProcess,
  Assessment,
  AvalaGovernAutonomyLevel,
  AvalaGovernLiteCard,
  AvalaGovernRiskLevel,
  RiskTier,
} from '../types';

const splitSystems = (...values: Array<string | undefined>) =>
  values
    .flatMap(value => (value || '').split(/[,\n;]/))
    .map(value => value.trim())
    .filter(Boolean);

const highestDataSensitivity = (assessment: Assessment): string => {
  const linkedSensitivity = assessment.evidenceItems
    .map(item => item.sensitivity)
    .filter(Boolean);

  if (linkedSensitivity.includes('Restricted')) return 'Restricted';
  if (linkedSensitivity.includes('Confidential')) return 'Confidential';
  if (linkedSensitivity.includes('Internal')) return 'Internal';
  if (assessment.responses.dataProfile.piiOrFinancialData || (assessment.responses.dataProfile.dataSensitivity || 0) >= 4) {
    return 'Confidential';
  }
  return 'Internal';
};

const mapRiskLevel = (assessment: Assessment, process: AssessProcess): AvalaGovernRiskLevel => {
  const riskTier = assessment.scores?.riskTier;
  const gateDecision = assessment.scores?.gateDecision;
  if (gateDecision === 'No-Go' || riskTier === 'Unacceptable') return 'Blocked';

  const tierMap: Record<RiskTier, AvalaGovernRiskLevel> = {
    Minimal: 'Low',
    Limited: 'Medium',
    Moderate: 'High',
    High: 'Critical',
    Unacceptable: 'Blocked',
  };

  if (riskTier) return tierMap[riskTier];
  if (process.criticality === 'Critical') return 'Critical';
  if (process.criticality === 'High') return 'High';
  return process.criticality;
};

const mapAutonomyLevel = (assessment: Assessment): AvalaGovernAutonomyLevel => {
  const judgment = assessment.responses.judgment;
  const numericLevel = judgment.autonomyLevel || 0;

  if (judgment.autonomousExecutionAllowed && numericLevel >= 4) {
    return 'Autonomous Within Guardrails';
  }
  if (judgment.humanApprovalBeforeAction || numericLevel >= 3) {
    return 'Act With Approval';
  }
  if ((judgment.judgmentIntensity || 0) >= 3 || (judgment.domainExpertiseRequired || 0) >= 3) {
    return 'Advise';
  }
  return 'Observe';
};

const reviewFrequencyFor = (riskLevel: AvalaGovernRiskLevel) => {
  if (riskLevel === 'Blocked') return 'Before resubmission';
  if (riskLevel === 'Critical') return 'Every release or material change';
  if (riskLevel === 'High') return 'Monthly';
  if (riskLevel === 'Medium') return 'Quarterly';
  return 'Semi-annually';
};

export const buildAvalaGovernLiteCard = (
  assessment: Assessment,
  process: AssessProcess,
): AvalaGovernLiteCard => {
  const riskLevel = mapRiskLevel(assessment, process);
  const autonomyLevel = mapAutonomyLevel(assessment);
  const recommendation = assessment.scores?.recommendation;
  const systemsAccessed = splitSystems(
    assessment.responses.systems.primarySystems,
    assessment.responses.systems.secondarySystems,
  );
  const humanApprovalRequired = Boolean(
    assessment.responses.judgment.humanApprovalBeforeAction ||
    riskLevel === 'High' ||
    riskLevel === 'Critical' ||
    riskLevel === 'Blocked' ||
    assessment.scores?.gateDecision !== 'Go',
  );
  const evidenceRequired = assessment.evidenceItems.length === 0 || riskLevel !== 'Low';

  const blockedActions = [
    'Change deterministic scores or final gates',
    'Execute production actions without approved handoff',
    'Store raw provider keys in the browser',
  ];

  if (!assessment.responses.judgment.externalCommunicationAllowed) {
    blockedActions.push('Send external communications without human approval');
  }
  if (autonomyLevel !== 'Autonomous Within Guardrails') {
    blockedActions.push('Operate autonomously outside approved guardrails');
  }

  return {
    agentOrAutomationName: `${process.name} governance card`,
    mappedProcessId: process.id,
    businessOwner: process.ownerId,
    technicalOwner: 'Not assigned',
    technologyPattern: recommendation?.primaryTechnology || recommendation?.category || 'Pending technical pattern',
    systemsAccessed: systemsAccessed.length ? systemsAccessed : ['Systems not documented'],
    toolsUsed: [recommendation?.primaryTechnology, recommendation?.secondaryTechnology]
      .filter((item): item is string => Boolean(item)),
    dataSensitivity: highestDataSensitivity(assessment),
    autonomyLevel,
    riskLevel,
    allowedActions: [
      'Prepare decision and handoff evidence',
      'Generate editable documentation drafts',
      'Create delivery work item candidates for approval',
    ],
    blockedActions,
    humanApprovalRequired,
    evidenceRequired,
    reviewFrequency: reviewFrequencyFor(riskLevel),
    auditStatus: evidenceRequired ? 'Evidence review required' : 'Ready for reviewer validation',
  };
};
