import assert from 'node:assert/strict';
import {
  attachAssessToStudioSourceContext,
  buildAssessToStudioHandoffPayload,
  getAssessToStudioSourceContextSummary,
  renderAssessToStudioSourceContext,
  withoutAssessToStudioSourceContext,
} from './assessToStudioHandoff';
import {
  Assessment,
  AssessProcess,
  AvalaGovernLiteCard,
  DecisionPack,
  GeneratedArtifacts,
  HandoffPack,
} from '../types';

const process: AssessProcess = {
  id: 'process-1',
  orgId: 'org-1',
  name: 'Invoice exception handling',
  description: 'Resolve invoice exceptions before payment release.',
  ownerId: 'owner-1',
  department: 'Finance',
  criticality: 'High',
  status: 'Approved',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
};

const decisionPack: DecisionPack = {
  executiveSummary: 'Use a governed workflow pattern for invoice exception handling.',
  finalDecision: 'Conditional Go',
  recommendedOperatingModel: {
    category: 'Workflow with HITL',
    primaryTechnology: 'Workflow',
    secondaryTechnology: 'Document Intelligence',
    executionLayer: 'Avala Studio draft workflow',
    controlLayer: 'Human review',
    governanceLayer: 'Avala Govern Lite',
    requiredHumanOversight: 'Process owner approval',
    notRecommendedTechnologies: ['Unsupervised automation'],
    whyThis: ['Exceptions require auditable reviewer context.'],
    whyNotOthers: ['Full autonomy is not appropriate for this risk tier.'],
    cautionNotes: ['Validate source evidence before handoff.'],
    nextActions: ['Generate BRD and PDD drafts from the handoff pack.'],
  },
  businessValue: {
    rawValueScore: 78,
    annualVolume: 12000,
    avgEffortHoursPerCase: 0.25,
    annualManualEffortHours: 3000,
    annualEffortSavedHours: 1800,
    averageHourlyCost: 45,
    annualLaborCost: 135000,
    estimatedAnnualSavings: 81000,
    estimatedBuildCost: 30000,
    estimatedAnnualRunCost: 12000,
    estimatedNetFirstYearSavings: 39000,
    paybackBand: '3 to 6 months',
    buildComplexity: 'Medium',
    runComplexity: 'Medium',
    roiConfidence: 'High',
  },
  governance: {
    riskTier: 'Moderate',
    gateDecision: 'Conditional Go',
    requiredApprovalLevel: 'Process owner',
    auditControls: ['Archive decision pack'],
    dataControls: ['Mask restricted invoice data'],
    monitoringControls: ['Review exception volume monthly'],
    securityControls: ['Restrict approver access'],
    modelProviderControls: ['Use governed provider path only'],
    redFlags: [],
  },
  confidenceBand: 'High',
  priorityTier: 'Tier 1 - Strategic Quick Win',
  handoffEligibility: 'Ready for Docs',
  docsHandoffReadiness: 'Ready for Docs',
  deliveryHandoffReadiness: 'Ready for Docs, Not Delivery',
  evidenceSummary: ['Sample invoice evidence attached.'],
  assumptionSummary: ['Exception rates remain stable.'],
  scoringFormulaSummary: ['Deterministic scoring version v1.0.'],
  reviewerComments: ['Approved for document drafting.'],
  approvalHistory: ['owner-1 approved review.'],
  auditTrailRef: 'audit-trail-1',
};

const handoffPack: HandoffPack = {
  assessmentId: 'assessment-1',
  processId: 'process-1',
  organizationId: 'org-1',
  assessmentVersion: 'v1',
  scoreVersion: 'v1.0',
  recommendationCategory: 'Workflow with HITL',
  operatingModelRecommendation: decisionPack.recommendedOperatingModel,
  approvedDecision: 'Conditional Go',
  processSummary: 'Invoice exceptions require structured review.',
  currentStateSummary: 'Manual review happens in email and spreadsheets.',
  painPoints: ['Cycle time delay'],
  systemsInvolved: ['ERP', 'Email'],
  dataSources: ['Invoice export'],
  evidenceReferences: ['evidence-1'],
  assumptions: ['Exception rate is stable.'],
  risks: ['Incorrect payment release'],
  governanceControls: ['Owner approval before handoff'],
  hitlDesign: 'Reviewer approves every exception before release.',
  businessValueEstimate: decisionPack.businessValue,
  requiredDocumentTypes: ['BRD', 'PDD'],
  suggestedBacklogItems: [{ type: 'Story', title: 'Capture exception intake', rationale: 'Needed for governed workflow.' }],
  openQuestions: ['Who owns escalation SLA?'],
  reviewerNotes: ['Use read-only source context.'],
  approvalMetadata: { status: 'Approved', generatedAt: '2026-05-03T00:00:00.000Z' },
};

const governCard: AvalaGovernLiteCard = {
  agentOrAutomationName: 'Invoice exception handling governance card',
  mappedProcessId: 'process-1',
  businessOwner: 'owner-1',
  technicalOwner: 'tech-1',
  technologyPattern: 'Workflow',
  systemsAccessed: ['ERP'],
  toolsUsed: ['Workflow'],
  dataSensitivity: 'Internal',
  autonomyLevel: 'L3 Act With Approval',
  riskLevel: 'High',
  autonomyRationale: ['Human approval remains required.'],
  riskRationale: ['Moderate risk tier with financial process exposure.'],
  approvalPolicy: 'Process owner approval required before handoff',
  approvalRationale: ['Financial process requires owner review.'],
  evidencePolicy: 'Evidence review required before approval or handoff',
  evidenceGaps: [{ label: 'Evidence ownership is incomplete.', severity: 'High', nextAction: 'Assign an evidence owner.' }],
  allowedActions: ['Generate editable documentation drafts'],
  blockedActions: ['Execute production actions without approved handoff'],
  humanApprovalRequired: true,
  evidenceRequired: true,
  reviewFrequency: 'Monthly',
  auditStatus: 'Evidence review required',
  governanceStatus: 'Evidence Review Required',
  nextGovernanceAction: 'Assign an evidence owner.',
};

const assessment: Assessment = {
  id: 'assessment-1',
  processId: 'process-1',
  orgId: 'org-1',
  status: 'Handed Off to Docs',
  metadata: {
    completionQuality: 100,
    templateFit: true,
    lastSavedAt: '2026-05-03T00:00:00.000Z',
    stakeholderCoverage: 90,
    evidenceQuality: 82,
    assumptionQuality: 76,
  },
  responses: {
    processStructure: {},
    workPattern: {},
    dataProfile: {},
    judgment: {},
    systems: {},
    risk: {},
  },
  evidenceItems: [{
    id: 'evidence-1',
    type: 'SOP',
    description: 'Invoice exception SOP',
    owner: 'owner-1',
    sensitivity: 'Internal',
    linkedField: 'processStructure.sopAvailability',
  }],
  assumptions: [{
    id: 'assumption-1',
    category: 'Volume',
    description: 'Monthly exception volume remains within current range.',
    confidence: 80,
    owner: 'owner-1',
    validated: false,
    linkedField: 'workPattern.volume',
  }],
  completionBySection: {
    processStructure: 100,
    workPattern: 100,
    dataProfile: 100,
    judgment: 100,
    systems: 100,
    risk: 100,
    evidenceAndAssumptions: 100,
  },
  scores: {
    scoreVersion: 'v1.0',
    calculatedAt: '2026-05-03T00:00:00.000Z',
    gatesTriggered: [],
    primaryGatingOutcome: 'Passed',
    techFitScores: {
      RPA: 35,
      Workflow: 82,
      GenAI: 52,
      Agentic: 30,
    },
    supportingScores: {
      rawValue: 78,
      hitlScore: 72,
      mandatoryHITL: true,
      confidence: 85,
      handoffReadiness: 91,
    },
    riskTier: 'Moderate',
    gateDecision: 'Conditional Go',
    confidenceBand: 'High',
    priorityTier: 'Tier 1 - Strategic Quick Win',
    handoffEligibility: 'Ready for Docs',
    recommendation: decisionPack.recommendedOperatingModel,
    decisionPack,
    handoffPack,
    engineOutputs: [],
  },
};

const payload = buildAssessToStudioHandoffPayload({
  process,
  assessment,
  governCard,
  createdAt: '2026-05-04T00:00:00.000Z',
});

assert.ok(payload, 'Expected scored assessment to create an Assess-to-Studio payload.');
assert.equal(payload.processId, process.id);
assert.equal(payload.assessmentId, assessment.id);
assert.equal(payload.gateDecision, 'Conditional Go');
assert.equal(payload.recommendationCategory, 'Workflow with HITL');
assert.equal(payload.decisionPack, decisionPack);
assert.equal(payload.handoffPack, handoffPack);
assert.equal(payload.governLiteSummary?.governanceStatus, 'Evidence Review Required');
assert.deepEqual(payload.handoffPack?.requiredDocumentTypes, ['BRD', 'PDD']);
assert.ok(payload.evidenceRefs.some(ref => ref.id === 'audit-trail-1' && ref.type === 'Decision Pack'));
assert.ok(payload.evidenceRefs.some(ref => ref.id === 'evidence-1' && ref.type === 'SOP'));
assert.equal(payload.assumptionSummary[0]?.id, 'assumption-1');

const summary = getAssessToStudioSourceContextSummary(payload);
assert.equal(summary?.title, 'Invoice exception handling Assess source context');
assert.equal(summary?.evidenceCount, 4);
assert.equal(summary?.assumptionCount, 1);
assert.deepEqual(summary?.documentTypes, ['BRD', 'PDD']);

const renderedSource = renderAssessToStudioSourceContext(payload);
assert.match(renderedSource, /Avala Assess Source Context/);
assert.match(renderedSource, /Invoice exception handling/);
assert.match(renderedSource, /Decision Pack/);
assert.match(renderedSource, /Handoff Pack/);
assert.doesNotMatch(renderedSource, /undefined/);

const partialAssessment = {
  ...assessment,
  id: 'assessment-partial',
  evidenceItems: [],
  assumptions: [],
  scores: {
    scoreVersion: 'v1.0',
    calculatedAt: '2026-05-03T00:00:00.000Z',
    gatesTriggered: [],
    primaryGatingOutcome: 'Passed',
    techFitScores: {
      RPA: 10,
      Workflow: 20,
      GenAI: 30,
      Agentic: 40,
    },
    supportingScores: {
      rawValue: 50,
      hitlScore: 60,
      mandatoryHITL: false,
      confidence: 70,
    },
  },
} as Assessment;

const partialPayload = buildAssessToStudioHandoffPayload({
  process,
  assessment: partialAssessment,
  createdAt: '2026-05-04T00:00:00.000Z',
});

assert.ok(partialPayload, 'Expected partial score records to create a safe payload.');
assert.equal(partialPayload.decisionPack, undefined);
assert.equal(partialPayload.handoffPack, undefined);
assert.equal(partialPayload.evidenceRefs.length, 3);
assert.deepEqual(getAssessToStudioSourceContextSummary(partialPayload)?.documentTypes, []);

const unscoredPayload = buildAssessToStudioHandoffPayload({
  process,
  assessment: { ...assessment, scores: undefined },
});

assert.equal(unscoredPayload, null);

const approvedButNotHandedOffPayload = buildAssessToStudioHandoffPayload({
  process,
  assessment: { ...assessment, status: 'Approved' },
  requireCommittedHandoff: true,
});

assert.equal(approvedButNotHandedOffPayload, null);

const artifacts: GeneratedArtifacts = {
  brd: { title: 'BRD', sections: [] },
  frd: { title: 'FRD', sections: [] },
  pdd: { title: 'PDD', sections: [] },
  qualityGate: { title: 'Quality Gate', ambiguityPoints: [], gapPoints: [] },
  diagrams: {
    asIs: { title: 'As Is', mermaidCode: 'flowchart TD' },
    toBe: { title: 'To Be', mermaidCode: 'flowchart TD' },
  },
  workItems: [],
  approvals: [],
};

const artifactsWithSource = attachAssessToStudioSourceContext(artifacts, payload);
assert.equal(artifactsWithSource.sourceContext?.assessmentId, 'assessment-1');
assert.equal(artifacts.sourceContext, undefined);

const manualArtifacts = attachAssessToStudioSourceContext(artifactsWithSource, null);
assert.equal(manualArtifacts.sourceContext, undefined);
assert.equal(artifactsWithSource.sourceContext?.assessmentId, 'assessment-1');

const clearedArtifacts = withoutAssessToStudioSourceContext(artifactsWithSource);
assert.equal(clearedArtifacts.sourceContext, undefined);
assert.equal(artifactsWithSource.sourceContext?.assessmentId, 'assessment-1');

console.log('Assess-to-Studio handoff payload regression passed.');
