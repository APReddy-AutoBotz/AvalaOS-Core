import assert from 'node:assert/strict';
import { ADMIN_WORKBENCH_SECTIONS } from './adminWorkbenchModel';
import { CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT } from './buyerAcceptanceAdminWalkthrough';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughExecutionBoundary';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_EXECUTION_APPROVAL_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughManualExecutionApproval';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughManualRunbook';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughPlan';
import { CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT } from './buyerAcceptancePackModel';
import { CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT } from './buyerAcceptanceReviewGate';
import {
  CURRENT_BUYER_ACCEPTANCE_MANUAL_BROWSER_PRE_EXECUTION_READINESS_SNAPSHOT,
  buildBuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot,
  type BuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot,
} from './buyerAcceptanceManualBrowserPreExecutionReadiness';

console.log('Running Buyer Acceptance Manual Browser Pre-Execution Readiness tests...');

const snapshot = buildBuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot();

assert.deepEqual(
  CURRENT_BUYER_ACCEPTANCE_MANUAL_BROWSER_PRE_EXECUTION_READINESS_SNAPSHOT,
  buildBuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot(),
);
assert.deepEqual(snapshot, buildBuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot());
assert.equal(snapshot.generatedAt, '2026-07-05T00:00:00.000Z');

const forbiddenReadinessStatusValues = [
  'browser_ready',
  'buyer_ready',
  'production_ready',
  'approved',
  'complete',
  'verified',
  'passed',
  'success',
];
assert.equal(forbiddenReadinessStatusValues.includes(snapshot.readinessStatus), false);
assert.equal(snapshot.readinessStatus, 'ready_for_ap_decision');
assert.equal(snapshot.executionPermissionStatus === 'not_approved' || snapshot.executionPermissionStatus === 'ap_decision_required', true);
assert.notEqual(snapshot.executionPermissionStatus, 'approved');

assert.notEqual(snapshot.sourceApprovalDecisionStatus, 'approved');
assert.equal(['not_executed', 'ap_approval_required'].includes(snapshot.sourceManualRunbookExecutionStatus), true);
assert.equal(['approved'].includes(snapshot.sourceBoundaryApprovalStatus as string), false);
assert.equal(snapshot.sourcePlanStatus, 'planned');
assert.equal(['ready', 'success'].includes(snapshot.sourceAdminWalkthroughStatus as string), false);
assert.equal(snapshot.sourcePackStatus, 'evidence_required');
assert.notEqual(snapshot.sourceReviewGateStatus, 'review_ready');

assert.deepEqual(
  snapshot.adminSectionOrder,
  ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
);

const readinessCheckCopy = snapshot.readinessChecks.flatMap(check => [
  check.id,
  check.label,
  check.source,
  check.requirement,
  check.blockerIfMissing,
  check.proofBoundary,
]).join('\n');

for (const check of snapshot.readinessChecks) {
  assert.equal(check.evidenceAvailable, true, `${check.id} should be available for AP decision.`);
  assert.equal(check.status, 'ready_for_ap_decision', `${check.id} should be ready only for AP decision.`);
}

for (const phrase of [
  'Browser Walkthrough Rehearsal Plan',
  'Execution Boundary Contract',
  'Manual Runbook and Sanitized Evidence Template',
  'Manual Execution Approval Record',
  'deterministic placeholders',
  'sanitized evidence rules',
  'redaction checklist',
  'stop conditions',
  'required-before-approval checklist',
  'deferred items',
  'proof-boundary wording',
  'buyer-copy guardrails',
]) {
  assert.match(readinessCheckCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const goDecisionCopy = snapshot.goDecisionRequirements.join('\n');
for (const phrase of [
  'approve exact manual execution scope',
  'confirm manual browser mode',
  'confirm local app view only',
  'confirm sections to inspect',
  'confirm output policy',
  'confirm sanitized textual evidence only',
  'confirm no screenshots',
  'confirm no export/PDF/download',
  'confirm no approval/status changes',
  'confirm no readiness claims',
  'confirm stop conditions',
  'confirm redaction checklist',
]) {
  assert.match(goDecisionCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const noGoCopy = snapshot.noGoReasons.join('\n');
for (const phrase of [
  'AP does not explicitly approve',
  'Browser mode not selected',
  'Output policy not accepted',
  'Redaction checklist not accepted',
  'Stop conditions not accepted',
  'Screenshots requested without future screenshot policy',
  'Export/PDF/download requested',
  'Approval/status change requested',
  'Readiness claim requested',
  'DB/RLS/artifact/hosted/deployment/proof command requested',
  'Sensitive/local-machine data would be exposed',
]) {
  assert.match(noGoCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const allowedNextActionsCopy = snapshot.allowedNextActions.join('\n');
for (const phrase of [
  'AP reviews the pre-execution readiness summary',
  'AP gives explicit go/no-go decision in a future instruction',
  'If AP says no-go, keep execution deferred',
  'If AP says go, create a separate future manual execution PR/prompt',
]) {
  assert.match(allowedNextActionsCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
assert.doesNotMatch(allowedNextActionsCopy, /launch browser|run browser automation|capture screenshot|generate export|generate PDF|generate download|change status|run approval workflow/i);

const prohibitedActionsCopy = snapshot.prohibitedActions.join('\n');
for (const phrase of [
  'granting approval in this slice',
  'approving execution in this slice',
  'launching browser',
  'running browser automation',
  'capturing screenshots',
  'creating screenshot folders',
  'creating browser/run evidence',
  'generating export/PDF/download',
  'running approval workflow',
  'changing statuses',
  'DB/RLS/artifact execution',
  'hosted/deployment validation',
  'provider/classifier execution',
  'schema inspection',
  'real assertion execution',
]) {
  assert.match(prohibitedActionsCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const stopConditionCopy = snapshot.stopConditions.flatMap(condition => [
  condition.id,
  condition.label,
  condition.trigger,
  condition.requiredResponse,
]).join('\n');
for (const phrase of [
  'AP approval is assumed',
  'Execution permission is assumed',
  'Browser launch attempted',
  'Browser automation attempted',
  'Screenshot or evidence artifact created',
  'Approval or status change requested',
  'Readiness or certification claim requested',
  'DB/RLS/artifact/hosted/deployment proof command required',
  'Sensitive/local-machine data exposure',
]) {
  assert.match(stopConditionCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const deferredItemsCopy = snapshot.stillDeferredItems.join('\n');
for (const phrase of [
  'actual manual browser walkthrough execution',
  'browser automation implementation',
  'screenshot capture',
  'screenshot evidence policy',
  'export/PDF/download design',
  'approval workflow design',
  'DB/RLS/artifact proof',
  'hosted/deployment/security proof tracks',
]) {
  assert.match(deferredItemsCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

assert.ok(snapshot.summary.includes('AP approval has not been granted'));
assert.ok(snapshot.summary.includes('execution is not approved'));
assert.ok(snapshot.summary.includes('no browser was launched'));
assert.ok(snapshot.summary.includes('no browser automation was run'));
assert.ok(snapshot.summary.includes('no screenshot was captured'));
assert.ok(snapshot.summary.includes('no evidence artifact was generated'));
assert.ok(snapshot.summary.includes('no readiness evidence was produced'));
assert.ok(snapshot.summary.includes('export/PDF/download remains blocked'));

const unsupportedPositivePatterns = [
  /production ready/i,
  /hosted ready/i,
  /deployment ready/i,
  /RLS ready/i,
  /RLS active/i,
  /RLS verified/i,
  /tenant isolation verified/i,
  /security ready/i,
  /buyer ready/i,
  /product ready/i,
  /release-candidate ready/i,
  /compliance certified/i,
  /approved for buyer use/i,
  /AP approved/i,
  /execution approved/i,
  /browser walkthrough verified/i,
  /browser test passed/i,
  /screenshot evidence captured/i,
  /screenshot proof/i,
  /export available/i,
  /download available/i,
  /PDF available/i,
  /walkthrough complete/i,
  new RegExp('Avala Govern' + ' Lite', 'i'),
  new RegExp('Avala Delivery' + ' Lite', 'i'),
];

for (const pattern of unsupportedPositivePatterns) {
  assert.doesNotMatch(snapshot.summary, pattern);
  assert.doesNotMatch(snapshot.proofBoundary, pattern);
}

const safeCopy = [
  snapshot.summary,
  snapshot.proofBoundary,
  ...snapshot.goDecisionRequirements,
  ...snapshot.noGoReasons,
  ...snapshot.allowedNextActions,
  ...snapshot.prohibitedActions,
  ...snapshot.stillDeferredItems,
  ...snapshot.readinessChecks.flatMap(check => [
    check.label,
    check.source,
    check.requirement,
    check.blockerIfMissing,
    check.proofBoundary,
  ]),
  ...snapshot.stopConditions.flatMap(condition => [
    condition.label,
    condition.trigger,
    condition.requiredResponse,
  ]),
].join('\n');
assert.doesNotMatch(safeCopy, new RegExp('Avala Govern' + ' Lite', 'i'));
assert.doesNotMatch(safeCopy, new RegExp('Avala Delivery' + ' Lite', 'i'));

function cloneSources(): {
  approvalRecord: unknown;
  manualRunbook: unknown;
  boundary: unknown;
  plan: unknown;
  admin: unknown;
  pack: unknown;
  gate: unknown;
} {
  return {
    approvalRecord: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_EXECUTION_APPROVAL_SNAPSHOT)),
    manualRunbook: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT)),
    boundary: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT)),
    plan: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT)),
    admin: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)),
    pack: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)),
    gate: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)),
  };
}

const before = cloneSources();
const rebuilt: BuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot =
  buildBuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot();
assert.equal(rebuilt.sourcePlanStatus, 'planned');
assert.deepEqual(before.approvalRecord, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_EXECUTION_APPROVAL_SNAPSHOT)));
assert.deepEqual(before.manualRunbook, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT)));
assert.deepEqual(before.boundary, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT)));
assert.deepEqual(before.plan, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT)));
assert.deepEqual(before.admin, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)));
assert.deepEqual(before.pack, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)));
assert.deepEqual(before.gate, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)));

console.log('Buyer Acceptance Manual Browser Pre-Execution Readiness tests passed.');
