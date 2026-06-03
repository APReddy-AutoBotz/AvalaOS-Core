import assert from 'node:assert/strict';

import { MOCK_PROJECTS, MOCK_TASKS, MOCK_USERS, MOCK_ASSESS_PROCESSES, MOCK_DOCUMENT_GENERATIONS } from '../data/mockData';
import { MOCK_DOC_TEMPLATES } from '../data/docTemplates';
import { buildDeliveryPack } from './deliveryPackService';
import {
  renderDeliveryPackJson,
  renderDeliveryPackMarkdown,
} from './deliveryPackExportService';
import { Assessment, AssessmentScoreResult, Task } from '../types';

const monthEndProject = MOCK_PROJECTS.find(project => project.id === 'proj-5')!;
const monthEndTasks = MOCK_TASKS.filter(task => task.projectId === 'proj-5');
const monthEndProcess = MOCK_ASSESS_PROCESSES.find(process => process.id === 'proc-close-pack')!;
const monthEndDocuments = MOCK_DOCUMENT_GENERATIONS.filter(generation => generation.projectId === 'proj-5');

const baseScores: AssessmentScoreResult = {
  scoreVersion: 'm2-test-v1',
  calculatedAt: '2026-04-26T18:10:00.000Z',
  gatesTriggered: [],
  primaryGatingOutcome: 'Passed',
  techFitScores: {
    RPA: 24,
    Workflow: 86,
    GenAI: 28,
    Agentic: 22,
  },
  supportingScores: {
    rawValue: 74,
    hitlScore: 44,
    mandatoryHITL: true,
    confidence: 88,
  },
  riskTier: 'Limited',
  gateDecision: 'Conditional Go',
  confidenceBand: 'High',
  priorityTier: 'Tier 1 - Strategic Quick Win',
  handoffEligibility: 'Ready for Docs, Not Delivery',
  recommendation: {
    category: 'Workflow automation with governed evidence review',
    primaryTechnology: 'Workflow',
    executionLayer: 'Workflow orchestration',
    controlLayer: 'Avala Govern Lite',
    governanceLayer: 'Human approval and evidence review',
    requiredHumanOversight: 'Finance owner approval before any downstream close handoff.',
    notRecommendedTechnologies: ['Agentic'],
    whyThis: ['Close readiness is workflow and evidence-reference oriented.'],
    whyNotOthers: ['Autonomous execution is outside the approved boundary.'],
    cautionNotes: ['Evidence references must not expose raw source content.'],
    nextActions: ['Complete owner approval and evidence review before handoff.'],
  },
};

const createAssessment = (overrides: Partial<Assessment> = {}): Assessment => ({
  id: 'assess-proc-close-pack',
  processId: monthEndProcess.id,
  orgId: monthEndProcess.orgId,
  status: 'Completed',
  metadata: {
    completionQuality: 94,
    templateFit: true,
    lastSavedAt: '2026-04-26T18:10:00.000Z',
    stakeholderCoverage: 92,
    evidenceQuality: 91,
    assumptionQuality: 87,
  },
  responses: {
    processStructure: {
      standardization: 5,
      ruleDeterminism: 4,
      exceptionPredictability: 4,
      processMaturity: 4,
    },
    workPattern: {
      volume: 4,
      manualEffort: 4,
      expectedBenefitConfidence: 4,
    },
    dataProfile: {
      dataSensitivity: 3,
      dataQuality: 4,
      dataOwnershipClarity: 5,
      piiOrFinancialData: true,
    },
    judgment: {
      autonomyLevel: 3,
      autonomousExecutionAllowed: false,
      externalCommunicationAllowed: false,
      humanApprovalBeforeAction: true,
      rollbackPossible: true,
      explainabilityNeed: 4,
    },
    systems: {
      primarySystems: 'ERP, Close Management Workspace',
      secondarySystems: 'Document Repository',
      loggingAvailability: 4,
    },
    risk: {
      riskCriticality: 3,
      governanceSensitivity: 4,
      auditRequirement: 4,
    },
  },
  evidenceItems: [
    {
      id: 'ev-close-map',
      type: 'Process Map',
      description: 'Month-end close evidence flow map.',
      owner: 'Finance Process Owner',
      sensitivity: 'Internal',
      linkedField: 'processStructure.standardization',
    },
    {
      id: 'ev-close-sop',
      type: 'SOP',
      description: 'Close review SOP reference.',
      owner: 'Finance Process Owner',
      sensitivity: 'Internal',
      linkedField: 'risk.auditRequirement',
    },
    {
      id: 'ev-close-sample',
      type: 'Sample Transaction',
      description: 'Sample reconciliation packet reference.',
      owner: 'Controller Review',
      sensitivity: 'Confidential',
      linkedField: 'dataProfile.piiOrFinancialData',
    },
  ],
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

const buildDemoPack = (overrides: Partial<Parameters<typeof buildDeliveryPack>[0]> = {}) => buildDeliveryPack({
  project: monthEndProject,
  tasks: monthEndTasks,
  users: MOCK_USERS,
  documentGenerations: monthEndDocuments,
  docTemplates: MOCK_DOC_TEMPLATES,
  handoffEntries: [],
  process: monthEndProcess,
  assessment: createAssessment(),
  generatedAt: '2026-05-01T10:00:00.000Z',
  exportedAt: '2026-05-01T10:00:00.000Z',
  ...overrides,
});

console.log('Running Delivery Pack service regression tests...');

{
  const pack = buildDemoPack();

  assert.equal(pack.id, 'pack-month-end-close');
  assert.equal(pack.projectId, 'proj-5');
  assert.equal(pack.decisionSummary?.assessmentId, 'assess-proc-close-pack');
  assert.equal(pack.governLite?.mappedProcessId, 'proc-close-pack');
  assert.ok(pack.documents.some(document => document.id === 'docgen-5'));
  assert.equal(pack.workItems.length, 3);
  assert.ok(pack.workItems.every(item => item.lineageStatus === 'Linked'));
  assert.ok(pack.sources.some(source => source.type === 'Decision Pack'));
  assert.ok(pack.sources.some(source => source.type === 'Document Generation'));
  assert.ok(pack.sources.some(source => source.type === 'Work Items'));
}

{
  const orphanTask: Task = {
    ...monthEndTasks[0],
    id: 'task-orphan',
    title: 'Orphaned delivery work item',
    sourceLineage: undefined,
  };
  const pack = buildDemoPack({ tasks: [...monthEndTasks, orphanTask] });

  assert.equal(pack.workItems.find(item => item.id === 'task-orphan')?.lineageStatus, 'Missing');
  assert.equal(pack.status, 'Lineage Incomplete');
  assert.ok(pack.blockers.some(blocker => blocker.id === 'lineage-task-orphan'));
}

{
  const pack = buildDemoPack();
  const approvalLabels = pack.approvalChecklist.map(item => item.label);
  const evidenceLabels = pack.evidenceChecklist.map(item => item.label);

  assert.ok(approvalLabels.includes('Govern Lite human approval requirement'));
  assert.ok(pack.approvalChecklist.some(item => item.status === 'Action Required'));
  assert.ok(evidenceLabels.includes('Assessment evidence references linked'));
  assert.ok(pack.evidenceChecklist.some(item => item.id === 'work-item-evidence-linked' && item.status === 'Complete'));
}

{
  const blockedTask: Task = {
    ...monthEndTasks[1],
    id: 'task-blocked-close',
    title: 'Blocked close approval item',
    status: 'Blocked',
  };
  const pack = buildDemoPack({ tasks: [...monthEndTasks, blockedTask] });

  assert.equal(pack.status, 'Blocked');
  assert.ok(pack.blockers.some(blocker => blocker.id === 'blocked-work-item-task-blocked-close'));
}

{
  const pack = buildDemoPack();
  const markdown = renderDeliveryPackMarkdown(pack);

  assert.ok(markdown.includes('# AvalaOS Core Governed Delivery Pack'));
  assert.ok(markdown.includes('## Source References'));
  assert.ok(markdown.includes('## Decision Summary'));
  assert.ok(markdown.includes('## Avala Govern Lite'));
  assert.ok(markdown.includes('## Studio Document References'));
  assert.ok(markdown.includes('## Delivery Work Items'));
  assert.ok(markdown.includes('## Approval Checklist'));
  assert.ok(markdown.includes('## Evidence Checklist'));
  assert.ok(markdown.includes('## Blockers'));
  assert.ok(markdown.includes('## Audit Summary'));
  assert.ok(markdown.includes('## Export Metadata'));
  assert.ok(markdown.includes('Omitted Content Policy'));
}

{
  const pack = buildDemoPack();
  const json = JSON.parse(renderDeliveryPackJson(pack));

  assert.equal(json.id, pack.id);
  assert.equal(json.exportMetadata.exportedAt, '2026-05-01T10:00:00.000Z');
  assert.equal(json.decisionSummary.scoreVersion, 'm2-test-v1');
  assert.equal(json.governLite.autonomyLevel, pack.governLite?.autonomyLevel);
  assert.equal(json.workItems[0].lineageStatus, pack.workItems[0].lineageStatus);
}

{
  const assessment = createAssessment();
  const beforeScores = JSON.parse(JSON.stringify(assessment.scores));
  const pack = buildDemoPack({ assessment });
  const json = JSON.parse(renderDeliveryPackJson(pack));

  assert.equal(json.id, pack.id);
  assert.deepEqual(assessment.scores, beforeScores);
}

{
  const pack = buildDeliveryPack({
    project: monthEndProject,
    tasks: monthEndTasks,
    users: MOCK_USERS,
    documentGenerations: monthEndDocuments,
    docTemplates: MOCK_DOC_TEMPLATES,
    process: monthEndProcess,
    assessment: createAssessment(),
    generatedAt: '2026-05-01T10:00:00.000Z',
    exportedAt: '2026-05-02T11:30:00.000Z',
  });

  assert.equal(pack.exportMetadata.generatedAt, '2026-05-01T10:00:00.000Z');
  assert.equal(pack.exportMetadata.exportedAt, '2026-05-02T11:30:00.000Z');
}

console.log('Delivery Pack service regression tests passed.');
