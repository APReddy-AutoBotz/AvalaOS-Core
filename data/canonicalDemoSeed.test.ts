import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CANONICAL_AP_ASSUMPTIONS,
  CANONICAL_AP_ASSESSMENT,
  CANONICAL_AP_ASSESSMENT_ID,
  CANONICAL_AP_ASSESSMENT_RESPONSES,
  CANONICAL_AP_DELIVERY_PACK_ID,
  CANONICAL_AP_DOCUMENT_GENERATION_ID,
  CANONICAL_AP_DOCUMENT_ARTIFACTS,
  CANONICAL_AP_EVIDENCE_ITEMS,
  CANONICAL_AP_GOVERN_LITE_CARD,
  CANONICAL_AP_HANDOFF_DOCS_DELIVERY_ID,
  CANONICAL_AP_HANDOFF_LEDGER_ENTRIES,
  CANONICAL_AP_PROCESS,
  CANONICAL_AP_PROCESS_ID,
  CANONICAL_AP_PROCESS_NAME,
  CANONICAL_AP_PROJECT_ID,
  CANONICAL_AP_STUDIO_SOURCE_CONTEXT,
  CANONICAL_AP_WORKFLOW_NAME,
  CANONICAL_DEMO_ENABLED_MODULES,
  CANONICAL_DEMO_ORG_ID,
  CANONICAL_DEMO_ORG_NAME,
  CANONICAL_DEMO_ORG_PROFILE,
  MOCK_ASSESS_PROCESSES,
  MOCK_DOCUMENT_GENERATIONS,
  MOCK_EPICS,
  MOCK_LOGIN_PROFILES,
  MOCK_PROJECTS,
  MOCK_SPRINTS,
  MOCK_TASKS,
  MOCK_USERS,
} from './mockData';
import { MOCK_DOC_TEMPLATES } from './docTemplates';
import {
  getDecisionGovernanceControlItems,
  getDecisionRationaleItems,
  getReadinessValue,
  getRequiredDocumentTypes,
} from '../components/assess/decisionPackRenderModel';
import { buildDeliveryPack } from '../services/deliveryPackService';
import { hasViewPermission, resolveViewAccess } from '../services/viewAccessGuard';
import { Organization, ScopeType, View } from '../types';

const requiredRoleTitles = [
  'Platform Admin',
  'AP Process Owner',
  'Process Analyst',
  'Delivery Lead',
  'Control Reviewer',
  'Automation Contributor',
  'Buyer Viewer',
];

const canonicalOrganization: Organization = {
  id: CANONICAL_DEMO_ORG_ID,
  name: CANONICAL_DEMO_ORG_NAME,
  profile: CANONICAL_DEMO_ORG_PROFILE,
  subscriptionTier: 'Enterprise',
  enabledModules: CANONICAL_DEMO_ENABLED_MODULES,
  members: MOCK_USERS.map(user => ({ userId: user.id, role: user.orgRole || 'Contributor' })),
};

const canonicalProcess = MOCK_ASSESS_PROCESSES.find(process => process.id === CANONICAL_AP_PROCESS_ID);
assert.ok(canonicalProcess);

console.log('Running canonical demo seed foundation regression tests...');

assert.equal(CANONICAL_DEMO_ORG_NAME, 'Avala Demo Enterprise');
assert.deepEqual(CANONICAL_DEMO_ENABLED_MODULES, ['assess', 'docs', 'delivery', 'monitor']);
assert.equal(CANONICAL_DEMO_ORG_PROFILE.industry, 'Finance Operations / Shared Services');

assert.equal(MOCK_ASSESS_PROCESSES.length, 1);
assert.equal(canonicalProcess.name, CANONICAL_AP_PROCESS_NAME);
assert.equal(canonicalProcess.department, 'Finance Operations / Accounts Payable');
assert.equal(canonicalProcess.status, 'Completed');
assert.equal(canonicalProcess.orgId, CANONICAL_DEMO_ORG_ID);
assert.ok(!MOCK_ASSESS_PROCESSES.some(process => /Support|Onboarding|Claims|Month-End|Close/i.test(process.name)));

assert.deepEqual(
  requiredRoleTitles.map(roleTitle => MOCK_USERS.some(user => user.roleTitle === roleTitle)),
  requiredRoleTitles.map(() => true),
);
assert.equal(MOCK_LOGIN_PROFILES.length, requiredRoleTitles.length);
assert.ok(MOCK_USERS.every(user => user.email.endsWith('@avala-demo.example')));

const platformAdmin = MOCK_USERS.find(user => user.roleTitle === 'Platform Admin')!;
const processAnalyst = MOCK_USERS.find(user => user.roleTitle === 'Process Analyst')!;
const apOwner = MOCK_USERS.find(user => user.roleTitle === 'AP Process Owner')!;
const deliveryLead = MOCK_USERS.find(user => user.roleTitle === 'Delivery Lead')!;
const buyerViewer = MOCK_USERS.find(user => user.roleTitle === 'Buyer Viewer')!;

assert.equal(hasViewPermission(platformAdmin, ['docs.generate']), true);
assert.equal(hasViewPermission(processAnalyst, ['assessment.edit', 'assessment.review']), true);
assert.equal(hasViewPermission(apOwner, ['process.approve', 'assessment.review']), true);

assert.equal(resolveViewAccess({
  user: processAnalyst,
  authLoading: false,
  organization: canonicalOrganization,
  enabledModules: CANONICAL_DEMO_ENABLED_MODULES,
  view: View.PROCESS_CATALOG,
  scope: { type: ScopeType.MY_WORK },
}).allowed, true);

assert.equal(resolveViewAccess({
  user: processAnalyst,
  authLoading: false,
  organization: canonicalOrganization,
  enabledModules: CANONICAL_DEMO_ENABLED_MODULES,
  view: View.GUIDED_ASSESSMENT,
  scope: { type: ScopeType.MY_WORK },
}).allowed, true);

assert.equal(resolveViewAccess({
  user: processAnalyst,
  authLoading: false,
  organization: canonicalOrganization,
  enabledModules: CANONICAL_DEMO_ENABLED_MODULES,
  view: View.DOCS_FORGE,
  scope: { type: ScopeType.MY_WORK },
}).allowed, true);

assert.equal(resolveViewAccess({
  user: deliveryLead,
  authLoading: false,
  organization: canonicalOrganization,
  enabledModules: CANONICAL_DEMO_ENABLED_MODULES,
  view: View.BOARDS,
  scope: { type: ScopeType.PROJECT, id: CANONICAL_AP_PROJECT_ID, name: CANONICAL_AP_WORKFLOW_NAME },
}).allowed, true);

assert.equal(resolveViewAccess({
  user: buyerViewer,
  authLoading: false,
  organization: canonicalOrganization,
  enabledModules: CANONICAL_DEMO_ENABLED_MODULES,
  view: View.PORTFOLIO,
  scope: { type: ScopeType.MY_WORK },
}).allowed, true);

assert.equal(CANONICAL_AP_EVIDENCE_ITEMS.length, 6);
assert.equal(CANONICAL_AP_ASSUMPTIONS.length, 5);
assert.ok(CANONICAL_AP_EVIDENCE_ITEMS.every(item => item.description.startsWith('Demo evidence:')));
assert.ok(CANONICAL_AP_EVIDENCE_ITEMS.every(item => item.owner && item.linkedField));
assert.ok(CANONICAL_AP_ASSUMPTIONS.every(item => item.owner && item.linkedField));

assert.equal(CANONICAL_AP_ASSESSMENT.scores?.scoreVersion, 'assess-core-2026-05');
assert.notEqual(CANONICAL_AP_ASSESSMENT.scores?.gateDecision, 'No-Go');
assert.ok(CANONICAL_AP_ASSESSMENT.scores?.decisionPack);
assert.ok(CANONICAL_AP_ASSESSMENT.scores?.handoffPack);
assert.ok(CANONICAL_AP_ASSESSMENT.scores?.handoffPack?.evidenceReferences.includes('ev-ap-exception-map'));
assert.ok(CANONICAL_AP_ASSESSMENT.scores?.decisionPack?.assumptionSummary.some(item => item.includes('Volume:')));
assert.ok(getDecisionRationaleItems(CANONICAL_AP_ASSESSMENT.scores).length > 0);
assert.ok(getDecisionGovernanceControlItems(CANONICAL_AP_ASSESSMENT.scores).length > 0);
assert.ok(getRequiredDocumentTypes(CANONICAL_AP_ASSESSMENT.scores).length > 0);
assert.ok(getReadinessValue(CANONICAL_AP_ASSESSMENT.scores) > 0);

const governLiteCard = CANONICAL_AP_GOVERN_LITE_CARD;
assert.equal(governLiteCard.mappedProcessId, CANONICAL_AP_PROCESS_ID);
assert.equal(governLiteCard.humanApprovalRequired, true);
assert.notEqual(governLiteCard.autonomyLevel, 'L4 Autonomous Within Guardrails');
assert.ok(governLiteCard.blockedActions.includes('Change deterministic scores or final gates'));
assert.ok(governLiteCard.allowedActions.includes('Prepare decision and handoff evidence'));
assert.equal(CANONICAL_AP_STUDIO_SOURCE_CONTEXT.governLiteSummary?.governanceStatus, governLiteCard.governanceStatus);

assert.equal(MOCK_PROJECTS.length, 1);
assert.equal(MOCK_PROJECTS[0].id, CANONICAL_AP_PROJECT_ID);
assert.equal(MOCK_PROJECTS[0].name, CANONICAL_AP_WORKFLOW_NAME);
assert.equal(MOCK_PROJECTS[0].healthStatus, 'On Track');
assert.equal(MOCK_EPICS.every(epic => epic.projectId === CANONICAL_AP_PROJECT_ID), true);
assert.equal(MOCK_SPRINTS.every(sprint => sprint.projectId === CANONICAL_AP_PROJECT_ID), true);

assert.equal(CANONICAL_AP_STUDIO_SOURCE_CONTEXT.processId, CANONICAL_AP_PROCESS_ID);
assert.equal(CANONICAL_AP_STUDIO_SOURCE_CONTEXT.assessmentId, CANONICAL_AP_ASSESSMENT_ID);
assert.equal(CANONICAL_AP_STUDIO_SOURCE_CONTEXT.sourceLabel, `${CANONICAL_AP_PROCESS_NAME} Assess source context`);
assert.ok(CANONICAL_AP_STUDIO_SOURCE_CONTEXT.evidenceRefs.some(ref => ref.id === 'ev-ap-owner-review'));
assert.ok(CANONICAL_AP_STUDIO_SOURCE_CONTEXT.decisionPack?.auditTrailRef);
assert.ok(CANONICAL_AP_STUDIO_SOURCE_CONTEXT.handoffPack?.requiredDocumentTypes.length);

assert.equal(MOCK_DOCUMENT_GENERATIONS.length, 1);
assert.equal(MOCK_DOCUMENT_GENERATIONS[0].id, CANONICAL_AP_DOCUMENT_GENERATION_ID);
assert.equal(MOCK_DOCUMENT_GENERATIONS[0].projectId, CANONICAL_AP_PROJECT_ID);
assert.equal(MOCK_DOCUMENT_GENERATIONS[0].artifacts.sourceContext?.assessmentId, CANONICAL_AP_ASSESSMENT_ID);
assert.equal(MOCK_DOCUMENT_GENERATIONS[0].artifacts.workItems.length, 5);
assert.ok(CANONICAL_AP_DOCUMENT_ARTIFACTS.brd.sections.some(section => section.content.includes('review artifact')));
assert.ok(CANONICAL_AP_DOCUMENT_ARTIFACTS.pdd.sections.some(section => section.content.includes('Generated documents remain review artifacts')));
assert.ok(CANONICAL_AP_DOCUMENT_ARTIFACTS.approvals.every(approval => approval.status === 'Pending'));

assert.equal(MOCK_TASKS.length, 5);
assert.equal(MOCK_TASKS.every(task => task.projectId === CANONICAL_AP_PROJECT_ID), true);
assert.equal(MOCK_TASKS.every(task => task.sourceLineage?.lineageCompleteness === 'complete'), true);
assert.equal(MOCK_TASKS.every(task => task.sourceLineage?.documentGenerationId === CANONICAL_AP_DOCUMENT_GENERATION_ID), true);
assert.equal(MOCK_TASKS.every(task => task.sourceLineage?.deliveryPackId === CANONICAL_AP_DELIVERY_PACK_ID), true);
assert.equal(MOCK_TASKS.every(task => (task.sourceLineage?.evidenceRefs || []).includes('ev-ap-owner-review')), true);
assert.equal(MOCK_TASKS.every(task => (task.sourceLineage?.handoffLedgerEntryIds || []).includes(CANONICAL_AP_HANDOFF_DOCS_DELIVERY_ID)), true);

assert.equal(CANONICAL_AP_HANDOFF_LEDGER_ENTRIES.length, 2);
assert.deepEqual(
  CANONICAL_AP_HANDOFF_LEDGER_ENTRIES.map(entry => `${entry.fromModule}->${entry.toModule}`),
  ['assess->docs', 'docs->delivery'],
);
assert.equal(CANONICAL_AP_HANDOFF_LEDGER_ENTRIES.every(entry => entry.evidenceRefs.includes('ev-ap-exception-map')), true);

const canonicalDeliveryPack = buildDeliveryPack({
  project: MOCK_PROJECTS[0],
  tasks: MOCK_TASKS,
  users: MOCK_USERS,
  documentGenerations: MOCK_DOCUMENT_GENERATIONS,
  docTemplates: MOCK_DOC_TEMPLATES,
  handoffEntries: CANONICAL_AP_HANDOFF_LEDGER_ENTRIES,
  process: CANONICAL_AP_PROCESS,
  assessment: CANONICAL_AP_ASSESSMENT,
  generatedAt: '2026-06-13T10:00:00.000Z',
  exportedAt: '2026-06-13T10:00:00.000Z',
});

assert.equal(canonicalDeliveryPack.id, CANONICAL_AP_DELIVERY_PACK_ID);
assert.equal(canonicalDeliveryPack.projectId, CANONICAL_AP_PROJECT_ID);
assert.equal(canonicalDeliveryPack.decisionSummary?.assessmentId, CANONICAL_AP_ASSESSMENT_ID);
assert.ok(canonicalDeliveryPack.documents.some(document => document.id === CANONICAL_AP_DOCUMENT_GENERATION_ID));
assert.equal(canonicalDeliveryPack.workItems.every(item => item.lineageStatus === 'Linked'), true);
assert.equal(canonicalDeliveryPack.auditSummary.length, 2);
assert.notEqual(canonicalDeliveryPack.status, 'Lineage Incomplete');

const monitorOpenTasks = MOCK_TASKS.filter(task => task.status !== 'Done').length;
const monitorReviewTasks = MOCK_TASKS.filter(task => ['In Review', 'Testing', 'Ready for Release'].includes(task.status)).length;
const monitorBlockedTasks = MOCK_TASKS.filter(task => task.status === 'Blocked').length;
assert.equal(monitorOpenTasks, 4);
assert.equal(monitorReviewTasks, 3);
assert.equal(monitorBlockedTasks, 0);
assert.equal(CANONICAL_AP_HANDOFF_LEDGER_ENTRIES.flatMap(entry => entry.evidenceRefs).length > 0, true);

const canonicalSeedText = JSON.stringify({
  users: MOCK_USERS,
  process: canonicalProcess,
  evidence: CANONICAL_AP_EVIDENCE_ITEMS,
  assumptions: CANONICAL_AP_ASSUMPTIONS,
  sourceContext: CANONICAL_AP_STUDIO_SOURCE_CONTEXT,
  documents: MOCK_DOCUMENT_GENERATIONS,
  tasks: MOCK_TASKS,
});
const healthRepoLabel = ['K', 'larityFlow', ' Health'].join('');
const unsupportedCompliancePhrases = [
  ['HIPAA', 'compliant'].join(' '),
  ['SOC 2', 'compliant'].join(' '),
];
assert.equal(canonicalSeedText.includes(healthRepoLabel), false);
assert.equal(unsupportedCompliancePhrases.some(phrase => canonicalSeedText.includes(phrase)), false);

const buyerVisibleDemoSources = [
  'components/auth/LoginView.tsx',
  'constants.ts',
  'docs/demo/primary-demo-story.md',
  'docs/demo/wow-demo-script.md',
  'docs/demo/m4.2d-buyer-demo-golden-path-validation-runbook.md',
  'docs/schema/demo_seed_acme.sql',
  'docs/schema/demo_seed_delivery.sql',
];
const legacyBuyerDemoStories = [
  'AP Invoice Automation',
  'Customer Support AI Assist',
  'Employee Onboarding Workflow',
  'Claims Intake Agentic Triage',
  'Month-End Close Control Pack',
  'Month-End Close Evidence Pack',
  'Vendor Invoice Intake and SAP Posting',
  'Tier 1 Support Case Summarization',
  'New Hire Onboarding Request Flow',
  'Claims Intake Document Triage',
];

for (const sourcePath of buyerVisibleDemoSources) {
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  assert.ok(
    sourceText.includes(CANONICAL_AP_PROCESS_NAME) || sourceText.includes(CANONICAL_AP_WORKFLOW_NAME),
    `${sourcePath} should reference the canonical AP demo story.`,
  );
  for (const legacyStory of legacyBuyerDemoStories) {
    assert.equal(
      sourceText.includes(legacyStory),
      false,
      `${sourcePath} should not present legacy buyer-demo story "${legacyStory}".`,
    );
  }
}

const loginCopy = fs.readFileSync('components/auth/LoginView.tsx', 'utf8');
assert.ok(loginCopy.includes('AvalaOS = Assess. Validate. Align. Launch. Audit.'));
assert.ok(loginCopy.includes('Avala Govern'));
assert.ok(loginCopy.includes('Avala Delivery'));
assert.equal(loginCopy.includes('Avala Govern Lite'), false);
assert.equal(loginCopy.includes('Avala Delivery Lite'), false);
assert.ok(loginCopy.includes('Demo story'));

console.log('Canonical demo seed foundation regression passed.');
