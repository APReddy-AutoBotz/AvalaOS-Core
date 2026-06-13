import assert from 'node:assert/strict';

import {
  CANONICAL_AP_ASSESSMENT,
  CANONICAL_AP_ASSESSMENT_ID,
  CANONICAL_AP_DELIVERY_PACK_ID,
  CANONICAL_AP_DOCUMENT_GENERATION_ID,
  CANONICAL_AP_HANDOFF_LEDGER_ENTRIES,
  CANONICAL_AP_PROCESS,
  CANONICAL_AP_PROCESS_ID,
  CANONICAL_AP_PROJECT_ID,
  MOCK_DOCUMENT_GENERATIONS,
  MOCK_PROJECTS,
  MOCK_TASKS,
  MOCK_USERS,
} from '../data/mockData';
import { MOCK_DOC_TEMPLATES } from '../data/docTemplates';
import { buildDeliveryPack } from './deliveryPackService';
import {
  renderDeliveryPackJson,
  renderDeliveryPackMarkdown,
} from './deliveryPackExportService';
import { Task } from '../types';

const buildDemoPack = (overrides: Partial<Parameters<typeof buildDeliveryPack>[0]> = {}) => buildDeliveryPack({
  project: MOCK_PROJECTS.find(project => project.id === CANONICAL_AP_PROJECT_ID)!,
  tasks: MOCK_TASKS.filter(task => task.projectId === CANONICAL_AP_PROJECT_ID),
  users: MOCK_USERS,
  documentGenerations: MOCK_DOCUMENT_GENERATIONS.filter(generation => generation.projectId === CANONICAL_AP_PROJECT_ID),
  docTemplates: MOCK_DOC_TEMPLATES,
  handoffEntries: CANONICAL_AP_HANDOFF_LEDGER_ENTRIES,
  process: CANONICAL_AP_PROCESS,
  assessment: CANONICAL_AP_ASSESSMENT,
  generatedAt: '2026-06-13T10:00:00.000Z',
  exportedAt: '2026-06-13T10:00:00.000Z',
  ...overrides,
});

console.log('Running Delivery Pack service regression tests...');

{
  const pack = buildDemoPack();

  assert.equal(pack.id, CANONICAL_AP_DELIVERY_PACK_ID);
  assert.equal(pack.projectId, CANONICAL_AP_PROJECT_ID);
  assert.equal(pack.decisionSummary?.assessmentId, CANONICAL_AP_ASSESSMENT_ID);
  assert.equal(pack.governLite?.mappedProcessId, CANONICAL_AP_PROCESS_ID);
  assert.ok(pack.documents.some(document => document.id === CANONICAL_AP_DOCUMENT_GENERATION_ID));
  assert.equal(pack.workItems.length, 5);
  assert.ok(pack.workItems.every(item => item.lineageStatus === 'Linked'));
  assert.ok(pack.sources.some(source => source.type === 'Decision Pack'));
  assert.ok(pack.sources.some(source => source.type === 'Document Generation'));
  assert.ok(pack.sources.some(source => source.type === 'Work Items'));
  assert.equal(pack.auditSummary.length, 2);
}

{
  const orphanTask: Task = {
    ...MOCK_TASKS[0],
    id: 'task-orphan',
    title: 'Orphaned delivery work item',
    sourceLineage: undefined,
  };
  const pack = buildDemoPack({ tasks: [...MOCK_TASKS, orphanTask] });

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
    ...MOCK_TASKS[1],
    id: 'task-blocked-ap',
    title: 'Blocked AP approval item',
    status: 'Blocked',
  };
  const pack = buildDemoPack({ tasks: [...MOCK_TASKS, blockedTask] });

  assert.equal(pack.status, 'Blocked');
  assert.ok(pack.blockers.some(blocker => blocker.id === 'blocked-work-item-task-blocked-ap'));
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
  assert.equal(json.exportMetadata.exportedAt, '2026-06-13T10:00:00.000Z');
  assert.equal(json.decisionSummary.scoreVersion, 'assess-core-2026-05');
  assert.equal(json.governLite.autonomyLevel, pack.governLite?.autonomyLevel);
  assert.equal(json.workItems[0].lineageStatus, pack.workItems[0].lineageStatus);
}

{
  const assessment = CANONICAL_AP_ASSESSMENT;
  const beforeScores = JSON.parse(JSON.stringify(assessment.scores));
  const pack = buildDemoPack({ assessment });
  const json = JSON.parse(renderDeliveryPackJson(pack));

  assert.equal(json.id, pack.id);
  assert.deepEqual(assessment.scores, beforeScores);
}

{
  const pack = buildDeliveryPack({
    project: MOCK_PROJECTS.find(project => project.id === CANONICAL_AP_PROJECT_ID)!,
    tasks: MOCK_TASKS.filter(task => task.projectId === CANONICAL_AP_PROJECT_ID),
    users: MOCK_USERS,
    documentGenerations: MOCK_DOCUMENT_GENERATIONS.filter(generation => generation.projectId === CANONICAL_AP_PROJECT_ID),
    docTemplates: MOCK_DOC_TEMPLATES,
    process: CANONICAL_AP_PROCESS,
    assessment: CANONICAL_AP_ASSESSMENT,
    generatedAt: '2026-06-13T10:00:00.000Z',
    exportedAt: '2026-06-14T11:30:00.000Z',
  });

  assert.equal(pack.exportMetadata.generatedAt, '2026-06-13T10:00:00.000Z');
  assert.equal(pack.exportMetadata.exportedAt, '2026-06-14T11:30:00.000Z');
}

console.log('Delivery Pack service regression tests passed.');
