import assert from 'node:assert/strict';

import {
  CANONICAL_AP_ASSUMPTIONS,
  CANONICAL_AP_ASSESSMENT_ID,
  CANONICAL_AP_ASSESSMENT_RESPONSES,
  CANONICAL_AP_EVIDENCE_ITEMS,
  CANONICAL_AP_PROCESS_ID,
  CANONICAL_AP_PROCESS_NAME,
  CANONICAL_DEMO_ENABLED_MODULES,
  CANONICAL_DEMO_ORG_ID,
  CANONICAL_DEMO_ORG_NAME,
  CANONICAL_DEMO_ORG_PROFILE,
  MOCK_ASSESS_PROCESSES,
  MOCK_LOGIN_PROFILES,
  MOCK_USERS,
} from './mockData';
import {
  getDecisionGovernanceControlItems,
  getDecisionRationaleItems,
  getReadinessValue,
  getRequiredDocumentTypes,
} from '../components/assess/decisionPackRenderModel';
import { calculateAssessmentScores } from '../services/scoringEngine';
import { buildAvalaGovernLiteCard } from '../services/avalaGovernLiteService';
import { hasViewPermission, resolveViewAccess } from '../services/viewAccessGuard';
import { Assessment, Organization, ScopeType, View } from '../types';

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

const canonicalMetadata: Assessment['metadata'] = {
  completionQuality: 100,
  templateFit: true,
  lastSavedAt: canonicalProcess.updatedAt,
  stakeholderCoverage: 4,
  evidenceQuality: 5,
  assumptionQuality: 5,
};

const canonicalScores = calculateAssessmentScores(
  CANONICAL_AP_ASSESSMENT_RESPONSES,
  canonicalMetadata,
  {
    assessmentId: CANONICAL_AP_ASSESSMENT_ID,
    processId: canonicalProcess.id,
    organizationId: canonicalProcess.orgId,
    processName: canonicalProcess.name,
    processDescription: canonicalProcess.description,
    department: canonicalProcess.department,
    evidenceItems: CANONICAL_AP_EVIDENCE_ITEMS,
    assumptions: CANONICAL_AP_ASSUMPTIONS,
    status: 'Approved',
  },
);

const canonicalAssessment: Assessment = {
  id: CANONICAL_AP_ASSESSMENT_ID,
  processId: canonicalProcess.id,
  orgId: canonicalProcess.orgId,
  status: 'Approved',
  metadata: canonicalMetadata,
  responses: CANONICAL_AP_ASSESSMENT_RESPONSES,
  evidenceItems: CANONICAL_AP_EVIDENCE_ITEMS,
  assumptions: CANONICAL_AP_ASSUMPTIONS,
  completionBySection: {
    processStructure: 100,
    workPattern: 100,
    dataProfile: 100,
    judgment: 100,
    systems: 100,
    risk: 100,
    evidenceAndAssumptions: 100,
  },
  scores: canonicalScores,
};

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
  scope: { type: ScopeType.PROJECT, id: 'proj-1', name: 'AP Invoice Automation' },
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

assert.equal(canonicalAssessment.scores?.scoreVersion, 'assess-core-2026-05');
assert.notEqual(canonicalAssessment.scores?.gateDecision, 'No-Go');
assert.ok(canonicalAssessment.scores?.decisionPack);
assert.ok(canonicalAssessment.scores?.handoffPack);
assert.ok(canonicalAssessment.scores?.handoffPack?.evidenceReferences.includes('ev-ap-exception-map'));
assert.ok(canonicalAssessment.scores?.decisionPack?.assumptionSummary.some(item => item.includes('Volume:')));
assert.ok(getDecisionRationaleItems(canonicalAssessment.scores).length > 0);
assert.ok(getDecisionGovernanceControlItems(canonicalAssessment.scores).length > 0);
assert.ok(getRequiredDocumentTypes(canonicalAssessment.scores).length > 0);
assert.ok(getReadinessValue(canonicalAssessment.scores) > 0);

const governLiteCard = buildAvalaGovernLiteCard(canonicalAssessment, canonicalProcess);
assert.equal(governLiteCard.mappedProcessId, CANONICAL_AP_PROCESS_ID);
assert.equal(governLiteCard.humanApprovalRequired, true);
assert.notEqual(governLiteCard.autonomyLevel, 'L4 Autonomous Within Guardrails');
assert.ok(governLiteCard.blockedActions.includes('Change deterministic scores or final gates'));
assert.ok(governLiteCard.allowedActions.includes('Prepare decision and handoff evidence'));

const canonicalSeedText = JSON.stringify({
  users: MOCK_USERS,
  process: canonicalProcess,
  evidence: CANONICAL_AP_EVIDENCE_ITEMS,
  assumptions: CANONICAL_AP_ASSUMPTIONS,
});
const healthRepoLabel = ['K', 'larityFlow', ' Health'].join('');
const unsupportedCompliancePhrases = [
  ['HIPAA', 'compliant'].join(' '),
  ['SOC 2', 'compliant'].join(' '),
];
assert.equal(canonicalSeedText.includes(healthRepoLabel), false);
assert.equal(unsupportedCompliancePhrases.some(phrase => canonicalSeedText.includes(phrase)), false);

console.log('Canonical demo seed foundation regression passed.');
