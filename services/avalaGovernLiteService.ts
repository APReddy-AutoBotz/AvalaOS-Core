import {
  AssessProcess,
  Assessment,
  AvalaGovernAutonomyLevel,
  AvalaGovernEvidenceGap,
  AvalaGovernLiteCard,
  AvalaGovernRiskLevel,
  AvalaGovernStatus,
  RiskTier,
} from '../types';

const splitSystems = (...values: Array<string | undefined>) =>
  values
    .flatMap(value => (value || '').split(/[,\n;]/))
    .map(value => value.trim())
    .filter(Boolean);

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const hasBlockedGate = (assessment: Assessment) =>
  assessment.scores?.gateDecision === 'No-Go'
  || assessment.scores?.primaryGatingOutcome === 'No-Go'
  || assessment.scores?.riskTier === 'Unacceptable'
  || assessment.scores?.gatesTriggered?.includes('No-Go')
  || assessment.scores?.priorityTier === 'Blocked - Governance Risk';

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

const isHighDataSensitivity = (dataSensitivity: string, assessment: Assessment) =>
  dataSensitivity === 'Restricted'
  || dataSensitivity === 'Confidential'
  || assessment.responses.dataProfile.piiOrFinancialData
  || (assessment.responses.dataProfile.dataSensitivity || 0) >= 4;

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

const riskRationaleFor = (assessment: Assessment, process: AssessProcess, riskLevel: AvalaGovernRiskLevel, dataSensitivity: string) => {
  const rationale = [
    assessment.scores?.riskTier ? `Assess risk tier is ${assessment.scores.riskTier}.` : `Process criticality is ${process.criticality}.`,
    assessment.scores?.gateDecision ? `Assess gate decision is ${assessment.scores.gateDecision}.` : '',
    `Data sensitivity is ${dataSensitivity}.`,
  ];

  if (riskLevel === 'Blocked') rationale.push('A blocked or no-go gate prevents downstream execution until governance review resolves it.');
  if (riskLevel === 'Critical') rationale.push('Critical governance risk requires formal owner review before handoff.');
  if (riskLevel === 'High') rationale.push('High governance risk requires explicit approval and evidence review.');

  return rationale.filter(Boolean);
};

const evidenceGapsFor = (assessment: Assessment, riskLevel: AvalaGovernRiskLevel): AvalaGovernEvidenceGap[] => {
  const gaps: AvalaGovernEvidenceGap[] = [];

  if (assessment.evidenceItems.length === 0) {
    gaps.push({
      label: 'No evidence items linked to this assessment.',
      severity: riskLevel === 'Low' ? 'Medium' : riskLevel,
      nextAction: 'Attach source evidence before approval or handoff.',
    });
  }

  if (assessment.evidenceItems.some(item => !item.owner?.trim())) {
    gaps.push({
      label: 'Evidence ownership is incomplete.',
      severity: riskLevel === 'Low' ? 'Medium' : riskLevel,
      nextAction: 'Assign an evidence owner.',
    });
  }

  if (riskLevel !== 'Low' && !assessment.evidenceItems.some(item => item.linkedField)) {
    gaps.push({
      label: 'No evidence is linked to a scored field or governance input.',
      severity: riskLevel,
      nextAction: 'Link evidence to protected scoring or governance fields.',
    });
  }

  if ((assessment.metadata.evidenceQuality || 0) < 70) {
    gaps.push({
      label: 'Evidence confidence is below Govern Lite threshold.',
      severity: riskLevel === 'Low' ? 'Medium' : riskLevel,
      nextAction: 'Add stronger source evidence or reviewer notes.',
    });
  }

  return gaps;
};

const reviewFrequencyFor = (riskLevel: AvalaGovernRiskLevel) => {
  if (riskLevel === 'Blocked') return 'Before resubmission';
  if (riskLevel === 'Critical') return 'Every release or material change';
  if (riskLevel === 'High') return 'Monthly';
  if (riskLevel === 'Medium') return 'Quarterly';
  return 'Semi-annually';
};

const approvalPolicyFor = (riskLevel: AvalaGovernRiskLevel, humanApprovalRequired: boolean, blocked: boolean) => {
  if (blocked || riskLevel === 'Blocked') return 'Blocked pending governance resolution';
  if (riskLevel === 'Critical') return 'Formal owner and executive review required';
  if (riskLevel === 'High') return 'Explicit owner approval required';
  if (riskLevel === 'Medium' || humanApprovalRequired) return 'Process owner approval required before handoff';
  return 'Reviewer validation recommended';
};

const governanceStatusFor = (
  riskLevel: AvalaGovernRiskLevel,
  humanApprovalRequired: boolean,
  evidenceRequired: boolean,
): AvalaGovernStatus => {
  if (riskLevel === 'Blocked') return 'Blocked';
  if (humanApprovalRequired) return 'Approval Required';
  if (evidenceRequired) return 'Evidence Review Required';
  return 'Ready for Review';
};

const nextActionFor = (
  governanceStatus: AvalaGovernStatus,
  evidenceGaps: AvalaGovernEvidenceGap[],
  riskLevel: AvalaGovernRiskLevel,
) => {
  if (governanceStatus === 'Blocked') return 'Resolve blocked gate and record governance owner decision before handoff.';
  if (evidenceGaps.length > 0) return evidenceGaps[0].nextAction;
  if (governanceStatus === 'Approval Required') return 'Capture required human approval and rationale before Docs or Delivery handoff.';
  if (riskLevel === 'High' || riskLevel === 'Critical') return 'Schedule governance review and confirm blocked actions.';
  return 'Proceed with reviewer validation and keep evidence linked.';
};

const blockedReasonFor = (assessment: Assessment, riskLevel: AvalaGovernRiskLevel) => {
  if (riskLevel !== 'Blocked') return undefined;
  if (assessment.scores?.gateDecision === 'No-Go') return 'Assess gate decision is No-Go.';
  if (assessment.scores?.riskTier === 'Unacceptable') return 'Assess risk tier is Unacceptable.';
  if (assessment.scores?.gatesTriggered?.includes('No-Go')) return 'No-Go gate was triggered.';
  return 'Governance policy marked this use case as blocked.';
};

const mapAutonomyLevel = (
  assessment: Assessment,
  riskLevel: AvalaGovernRiskLevel,
  dataSensitivity: string,
  humanApprovalRequired: boolean,
  evidenceGaps: AvalaGovernEvidenceGap[],
): { autonomyLevel: AvalaGovernAutonomyLevel; autonomyRationale: string[] } => {
  const judgment = assessment.responses.judgment;
  const numericLevel = judgment.autonomyLevel || 0;
  const blocked = hasBlockedGate(assessment) || riskLevel === 'Blocked';
  const evidenceConfidenceSufficient = assessment.evidenceItems.length > 0
    && evidenceGaps.length === 0
    && (assessment.metadata.evidenceQuality || 0) >= 70;
  const riskAllowsL4 = !(['High', 'Critical', 'Blocked'] as AvalaGovernRiskLevel[]).includes(riskLevel);
  const l4Allowed = Boolean(
    judgment.autonomousExecutionAllowed
    && numericLevel >= 4
    && !blocked
    && riskAllowsL4
    && !isHighDataSensitivity(dataSensitivity, assessment)
    && !judgment.externalCommunicationAllowed
    && judgment.rollbackPossible
    && evidenceConfidenceSufficient
    && !judgment.humanApprovalBeforeAction
    && !humanApprovalRequired,
  );

  const rationale = [
    `Requested autonomy input is ${numericLevel || 'not specified'}.`,
    judgment.autonomousExecutionAllowed ? 'L4 guardrail flag was explicitly set.' : 'L4 guardrail flag was not set.',
    judgment.humanApprovalBeforeAction ? 'Human approval before action is mandatory.' : '',
    blocked ? 'A blocked or no-go gate prevents L4 outcome.' : '',
    isHighDataSensitivity(dataSensitivity, assessment) ? `Data sensitivity (${dataSensitivity}) prevents L4 outcome.` : '',
    judgment.externalCommunicationAllowed ? 'External communication requires human-governed handling.' : '',
    !judgment.rollbackPossible && numericLevel >= 3 ? 'Rollback is not confirmed for higher-autonomy action.' : '',
    !evidenceConfidenceSufficient ? 'Evidence confidence is not sufficient for L4 autonomy.' : '',
  ].filter(Boolean);

  if (blocked) {
    return { autonomyLevel: 'L5 Blocked / Not Allowed', autonomyRationale: unique([...rationale, 'Governance outcome is blocked until owner review resolves the gate.']) };
  }
  if (l4Allowed) {
    return { autonomyLevel: 'L4 Autonomous Within Guardrails', autonomyRationale: unique([...rationale, 'All L4 guardrails are satisfied for bounded operation review.']) };
  }
  if (humanApprovalRequired || judgment.humanApprovalBeforeAction || numericLevel >= 3 || riskLevel === 'High' || riskLevel === 'Critical') {
    return { autonomyLevel: 'L3 Act With Approval', autonomyRationale: unique([...rationale, 'Action requires explicit human approval before handoff.']) };
  }
  if ((judgment.judgmentIntensity || 0) >= 3 || (judgment.domainExpertiseRequired || 0) >= 3 || numericLevel >= 1) {
    return { autonomyLevel: 'L2 Advise', autonomyRationale: unique([...rationale, 'The system may advise, but action remains human-owned.']) };
  }
  return { autonomyLevel: 'L1 Observe', autonomyRationale: unique([...rationale, 'Read-only observation is the governed default.']) };
};

export const buildAvalaGovernLiteCard = (
  assessment: Assessment,
  process: AssessProcess,
): AvalaGovernLiteCard => {
  const riskLevel = mapRiskLevel(assessment, process);
  const recommendation = assessment.scores?.recommendation;
  const systemsAccessed = splitSystems(
    assessment.responses.systems.primarySystems,
    assessment.responses.systems.secondarySystems,
  );
  const dataSensitivity = highestDataSensitivity(assessment);
  const blocked = hasBlockedGate(assessment) || riskLevel === 'Blocked';
  const mandatoryHITL = Boolean(assessment.scores?.supportingScores?.mandatoryHITL);
  const humanApprovalRequired = Boolean(
    assessment.responses.judgment.humanApprovalBeforeAction
    || mandatoryHITL
    || isHighDataSensitivity(dataSensitivity, assessment)
    || riskLevel === 'Medium'
    || riskLevel === 'High'
    || riskLevel === 'Critical'
    || riskLevel === 'Blocked'
    || assessment.scores?.gateDecision !== 'Go',
  );
  const preliminaryEvidenceGaps = evidenceGapsFor(assessment, riskLevel);
  const { autonomyLevel, autonomyRationale } = mapAutonomyLevel(
    assessment,
    riskLevel,
    dataSensitivity,
    humanApprovalRequired,
    preliminaryEvidenceGaps,
  );
  const evidenceGaps = preliminaryEvidenceGaps;
  const evidenceRequired = evidenceGaps.length > 0 || riskLevel !== 'Low';
  const riskRationale = riskRationaleFor(assessment, process, riskLevel, dataSensitivity);
  const approvalRationale = unique([
    humanApprovalRequired ? 'Approval is required by risk, gate, or judgment policy.' : 'No mandatory approval trigger is active.',
    mandatoryHITL ? 'Assess HITL output marks human-in-the-loop approval as mandatory.' : '',
    riskLevel === 'Medium' ? 'Medium risk requires process owner approval before handoff.' : '',
    riskLevel === 'High' || riskLevel === 'Critical' ? `${riskLevel} risk requires owner review.` : '',
    assessment.responses.judgment.humanApprovalBeforeAction ? 'Assessment input requires human approval before action.' : '',
    assessment.scores?.gateDecision && assessment.scores.gateDecision !== 'Go' ? `Gate decision ${assessment.scores.gateDecision} requires approval handling.` : '',
  ]);

  const blockedActions = [
    'Change deterministic scores or final gates',
    'Execute production actions without approved handoff',
    'Store raw provider keys in the browser',
  ];

  if (!assessment.responses.judgment.externalCommunicationAllowed) {
    blockedActions.push('Send external communications without human approval');
  } else {
    blockedActions.push('Treat external communication as autonomous without explicit governance review');
  }
  if (autonomyLevel !== 'L4 Autonomous Within Guardrails') {
    blockedActions.push('Operate autonomously outside approved guardrails');
  }
  if (blocked) {
    blockedActions.push('Proceed to Docs or Delivery handoff until blocked governance outcome is resolved');
  }

  const governanceStatus = governanceStatusFor(riskLevel, humanApprovalRequired, evidenceRequired);
  const nextGovernanceAction = nextActionFor(governanceStatus, evidenceGaps, riskLevel);

  return {
    agentOrAutomationName: `${process.name} governance card`,
    mappedProcessId: process.id,
    businessOwner: process.ownerId,
    technicalOwner: 'Not assigned',
    technologyPattern: recommendation?.primaryTechnology || recommendation?.category || 'Pending technical pattern',
    systemsAccessed: systemsAccessed.length ? systemsAccessed : ['Systems not documented'],
    toolsUsed: [recommendation?.primaryTechnology, recommendation?.secondaryTechnology]
      .filter((item): item is string => Boolean(item)),
    dataSensitivity,
    autonomyLevel,
    riskLevel,
    autonomyRationale,
    riskRationale,
    approvalPolicy: approvalPolicyFor(riskLevel, humanApprovalRequired, blocked),
    approvalRationale,
    evidencePolicy: evidenceRequired ? 'Evidence review required before approval or handoff' : 'Evidence link review recommended',
    evidenceGaps,
    allowedActions: [
      'Prepare decision and handoff evidence',
      'Generate editable documentation drafts',
      'Create delivery work item candidates for approval',
    ],
    blockedActions: unique(blockedActions),
    humanApprovalRequired,
    evidenceRequired,
    reviewFrequency: reviewFrequencyFor(riskLevel),
    auditStatus: governanceStatus === 'Blocked'
      ? 'Blocked by governance policy'
      : evidenceRequired
        ? 'Evidence review required'
        : 'Ready for reviewer validation',
    governanceStatus,
    blockedReason: blockedReasonFor(assessment, riskLevel),
    nextGovernanceAction,
  };
};
