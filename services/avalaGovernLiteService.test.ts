import assert from 'node:assert/strict';

import { buildAvalaGovernLiteCard } from './avalaGovernLiteService';
import {
  renderAssessmentDecisionPackJson,
  renderAssessmentDecisionPackMarkdown,
} from './assessmentExportService';
import { Assessment, AssessmentScoreResult, AssessProcess } from '../types';

const baseProcess: AssessProcess = {
  id: 'proc-govern-lite',
  orgId: 'org-demo',
  name: 'Govern Lite Demo Process',
  description: 'Demo process used for deterministic Govern Lite controls.',
  ownerId: 'Finance Operations',
  department: 'Finance',
  criticality: 'Medium',
  status: 'Completed',
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
};

const baseScores: AssessmentScoreResult = {
  scoreVersion: 'test-v1',
  calculatedAt: '2026-06-02T00:00:00.000Z',
  gatesTriggered: [],
  primaryGatingOutcome: 'Passed',
  techFitScores: {
    RPA: 20,
    Workflow: 82,
    GenAI: 35,
    Agentic: 25,
  },
  supportingScores: {
    rawValue: 68,
    hitlScore: 20,
    mandatoryHITL: false,
    confidence: 92,
  },
  riskTier: 'Minimal',
  gateDecision: 'Go',
  priorityTier: 'Tier 2 - Standard Backlog',
  recommendation: {
    category: 'Workflow automation with review controls',
    primaryTechnology: 'Workflow',
    executionLayer: 'Workflow orchestration',
    controlLayer: 'Avala Govern Lite',
    governanceLayer: 'Human review checkpoints',
    requiredHumanOversight: 'Documented review before production adoption.',
    notRecommendedTechnologies: [],
    whyThis: ['Existing Assess score selected workflow automation.'],
    whyNotOthers: ['Other options are not needed for this test fixture.'],
    cautionNotes: ['Govern Lite consumes Assess score outputs only.'],
    nextActions: ['Review Govern Lite controls before handoff.'],
  },
};

const createAssessment = (overrides: Partial<Assessment> = {}): Assessment => ({
  id: 'assessment-govern-lite',
  processId: baseProcess.id,
  orgId: baseProcess.orgId,
  status: 'Completed',
  metadata: {
    completionQuality: 92,
    templateFit: true,
    lastSavedAt: '2026-06-02T00:00:00.000Z',
    stakeholderCoverage: 90,
    evidenceQuality: 90,
    assumptionQuality: 88,
  },
  responses: {
    processStructure: {
      standardization: 5,
      ruleDeterminism: 5,
      exceptionPredictability: 4,
    },
    workPattern: {
      volume: 4,
      manualEffort: 4,
      expectedBenefitConfidence: 5,
    },
    dataProfile: {
      dataSensitivity: 2,
      dataQuality: 4,
      dataOwnershipClarity: 5,
    },
    judgment: {
      autonomyLevel: 4,
      autonomousExecutionAllowed: true,
      externalCommunicationAllowed: false,
      humanApprovalBeforeAction: false,
      rollbackPossible: true,
      explainabilityNeed: 3,
    },
    systems: {
      primarySystems: 'ERP, Shared Inbox',
      secondarySystems: 'Reporting Workspace',
      loggingAvailability: 4,
    },
    risk: {
      riskCriticality: 2,
      governanceSensitivity: 2,
      auditRequirement: 3,
    },
  },
  evidenceItems: [{
    id: 'ev-1',
    type: 'Control Document',
    description: 'Documented process controls and rollback notes.',
    owner: 'Finance Operations',
    sensitivity: 'Internal',
    linkedField: 'judgment.rollbackPossible',
  }],
  assumptions: [],
  completionBySection: {
    processStructure: 100,
    workPattern: 100,
    dataProfile: 100,
    judgment: 100,
    systems: 100,
    risk: 100,
    evidenceAndAssumptions: 100,
  },
  scores: baseScores,
  ...overrides,
});

console.log('Running Avala Govern Lite service regression tests...');

{
  const assessment = createAssessment();
  const card = buildAvalaGovernLiteCard(assessment, baseProcess);

  assert.equal(card.autonomyLevel, 'L4 Autonomous Within Guardrails');
  assert.equal(card.riskLevel, 'Low');
  assert.equal(card.governanceStatus, 'Ready for Review');
  assert.equal(card.humanApprovalRequired, false);
  assert.equal(card.evidenceRequired, false);
  assert.ok(card.allowedActions.includes('Prepare decision and handoff evidence'));
  assert.ok(card.blockedActions.includes('Send external communications without human approval'));
}

{
  const assessment = createAssessment({
    scores: {
      ...baseScores,
      riskTier: 'Limited',
      gateDecision: 'Go',
      supportingScores: {
        ...baseScores.supportingScores,
        mandatoryHITL: false,
      },
    },
    responses: {
      ...createAssessment().responses,
      judgment: {
        autonomyLevel: 4,
        autonomousExecutionAllowed: true,
        externalCommunicationAllowed: false,
        humanApprovalBeforeAction: false,
        rollbackPossible: true,
      },
    },
  });

  const card = buildAvalaGovernLiteCard(assessment, baseProcess);

  assert.equal(card.riskLevel, 'Medium');
  assert.equal(card.humanApprovalRequired, true);
  assert.equal(card.approvalPolicy, 'Process owner approval required before handoff');
  assert.equal(card.governanceStatus, 'Approval Required');
}

{
  const assessment = createAssessment({
    scores: {
      ...baseScores,
      gateDecision: 'Go',
      supportingScores: {
        ...baseScores.supportingScores,
        mandatoryHITL: true,
      },
    },
    responses: {
      ...createAssessment().responses,
      judgment: {
        autonomyLevel: 4,
        autonomousExecutionAllowed: true,
        externalCommunicationAllowed: false,
        humanApprovalBeforeAction: false,
        rollbackPossible: true,
      },
    },
  });

  const card = buildAvalaGovernLiteCard(assessment, baseProcess);

  assert.equal(card.riskLevel, 'Low');
  assert.equal(card.humanApprovalRequired, true);
  assert.equal(card.governanceStatus, 'Approval Required');
  assert.ok(card.approvalRationale.some((reason) => reason.includes('Assess HITL output')));
}

{
  const assessment = createAssessment({
    metadata: {
      completionQuality: 92,
      templateFit: true,
      lastSavedAt: '2026-06-02T00:00:00.000Z',
      stakeholderCoverage: 90,
      evidenceQuality: 90,
      assumptionQuality: 88,
    },
    responses: {
      ...createAssessment().responses,
      dataProfile: {
        dataSensitivity: 5,
      },
      judgment: {
        autonomyLevel: 4,
        autonomousExecutionAllowed: true,
        externalCommunicationAllowed: false,
        humanApprovalBeforeAction: false,
        rollbackPossible: true,
      },
    },
    evidenceItems: [{
      id: 'ev-2',
      type: 'Policy Document',
      description: 'Sensitive-data handling note.',
      owner: 'Risk Office',
      sensitivity: 'Restricted',
      linkedField: 'dataProfile.dataSensitivity',
    }],
  });

  const card = buildAvalaGovernLiteCard(assessment, baseProcess);

  assert.notEqual(card.autonomyLevel, 'L4 Autonomous Within Guardrails');
  assert.equal(card.autonomyLevel, 'L3 Act With Approval');
  assert.equal(card.humanApprovalRequired, true);
  assert.ok(card.autonomyRationale.some((reason) => reason.includes('prevents L4 outcome')));
}

{
  const assessment = createAssessment({
    scores: {
      ...baseScores,
      gatesTriggered: ['No-Go'],
      primaryGatingOutcome: 'No-Go',
      riskTier: 'Unacceptable',
      gateDecision: 'No-Go',
      priorityTier: 'Blocked - Governance Risk',
    },
  });

  const card = buildAvalaGovernLiteCard(assessment, baseProcess);

  assert.equal(card.autonomyLevel, 'L5 Blocked / Not Allowed');
  assert.equal(card.riskLevel, 'Blocked');
  assert.equal(card.governanceStatus, 'Blocked');
  assert.ok(card.blockedReason);
  assert.equal(card.nextGovernanceAction, 'Resolve blocked gate and record governance owner decision before handoff.');
}

{
  const assessment = createAssessment({
    metadata: {
      completionQuality: 92,
      templateFit: true,
      lastSavedAt: '2026-06-02T00:00:00.000Z',
      stakeholderCoverage: 90,
      evidenceQuality: 55,
      assumptionQuality: 88,
    },
    evidenceItems: [{
      id: 'ev-3',
      type: 'System Screenshot',
      description: 'Unowned screenshot.',
      sensitivity: 'Internal',
    }],
  });

  const card = buildAvalaGovernLiteCard(assessment, baseProcess);

  assert.equal(card.evidenceRequired, true);
  assert.equal(card.governanceStatus, 'Evidence Review Required');
  assert.ok(card.evidenceGaps.some((gap) => gap.label === 'Evidence ownership is incomplete.'));
  assert.ok(card.evidenceGaps.some((gap) => gap.label === 'Evidence confidence is below Govern Lite threshold.'));
}

{
  const assessment = createAssessment({
    scores: {
      ...baseScores,
      supportingScores: {
        ...baseScores.supportingScores,
        mandatoryHITL: true,
      },
      gateDecision: 'Conditional Go',
    },
    responses: {
      ...createAssessment().responses,
      judgment: {
        autonomyLevel: 3,
        autonomousExecutionAllowed: false,
        externalCommunicationAllowed: false,
        humanApprovalBeforeAction: true,
        rollbackPossible: true,
      },
    },
  });

  const card = buildAvalaGovernLiteCard(assessment, baseProcess);

  assert.equal(card.autonomyLevel, 'L3 Act With Approval');
  assert.equal(card.humanApprovalRequired, true);
  assert.equal(card.governanceStatus, 'Approval Required');
  assert.ok(card.approvalRationale.some((reason) => reason.includes('human approval before action')));
}

{
  const lowFivePointEvidence = createAssessment({
    metadata: { ...createAssessment().metadata, evidenceQuality: 3 },
  });
  const acceptableFivePointEvidence = createAssessment({
    metadata: { ...createAssessment().metadata, evidenceQuality: 4 },
  });

  assert.ok(buildAvalaGovernLiteCard(lowFivePointEvidence, baseProcess).evidenceGaps.some(
    gap => gap.label === 'Evidence confidence is below Govern Lite threshold.',
  ));
  assert.equal(buildAvalaGovernLiteCard(acceptableFivePointEvidence, baseProcess).evidenceGaps.some(
    gap => gap.label === 'Evidence confidence is below Govern Lite threshold.',
  ), false);
}

{
  const { evidenceQuality: _omittedEvidenceQuality, ...metadataWithoutEvidenceQuality } = createAssessment().metadata;
  const missingEvidenceQuality = createAssessment({
    metadata: metadataWithoutEvidenceQuality as Assessment['metadata'],
  });
  const undefinedEvidenceQuality = createAssessment({
    metadata: { ...createAssessment().metadata, evidenceQuality: undefined as unknown as number },
  });

  for (const assessment of [missingEvidenceQuality, undefinedEvidenceQuality]) {
    const card = buildAvalaGovernLiteCard(assessment, baseProcess);
    assert.equal(card.evidenceRequired, true);
    assert.equal(card.governanceStatus, 'Evidence Review Required');
    assert.notEqual(card.autonomyLevel, 'L4 Autonomous Within Guardrails');
    assert.ok(card.evidenceGaps.some(
      gap => gap.label === 'Evidence confidence is below Govern Lite threshold.',
    ));
  }
}

{
  for (const malformedEvidenceQuality of [Number.NaN, -1, 101, Number.POSITIVE_INFINITY, null, '4']) {
    const assessment = createAssessment({
      metadata: {
        ...createAssessment().metadata,
        evidenceQuality: malformedEvidenceQuality as unknown as number,
      },
    });

    assert.throws(
      () => buildAvalaGovernLiteCard(assessment, baseProcess),
      /V1 evidence quality must be on the inclusive 1-5 scale or legacy 0-100 percent scale/,
    );
  }
}

{
  const assessment = createAssessment();
  const governCard = buildAvalaGovernLiteCard(assessment, baseProcess);
  const markdown = renderAssessmentDecisionPackMarkdown(assessment, baseProcess.name, governCard);
  const json = JSON.parse(renderAssessmentDecisionPackJson(assessment, baseProcess.name, governCard));

  assert.ok(markdown.includes('## Avala Govern'));
  assert.ok(markdown.includes(`Autonomy Level: ${governCard.autonomyLevel}`));
  assert.equal(json.avalaGovernLite.autonomyLevel, governCard.autonomyLevel);
  assert.deepEqual(json.avalaGovernLite.blockedActions, governCard.blockedActions);
}

console.log('Avala Govern Lite service regression tests passed.');
