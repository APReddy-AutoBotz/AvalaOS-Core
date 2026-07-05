import assert from 'node:assert/strict';
import { ADMIN_WORKBENCH_SECTIONS } from './adminWorkbenchModel';
import { CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT } from './buyerAcceptanceAdminWalkthrough';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughExecutionBoundary';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughManualRunbook';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughPlan';
import { CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT } from './buyerAcceptancePackModel';
import { CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT } from './buyerAcceptanceReviewGate';
import {
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_EXECUTION_APPROVAL_SNAPSHOT,
  buildBuyerAcceptanceBrowserWalkthroughManualExecutionApprovalSnapshot,
  type BuyerAcceptanceManualExecutionApprovalSnapshot,
} from './buyerAcceptanceBrowserWalkthroughManualExecutionApproval';

console.log('Running Buyer Acceptance Browser Walkthrough manual execution approval tests...');

const snapshot = buildBuyerAcceptanceBrowserWalkthroughManualExecutionApprovalSnapshot();

assert.deepEqual(
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_EXECUTION_APPROVAL_SNAPSHOT,
  buildBuyerAcceptanceBrowserWalkthroughManualExecutionApprovalSnapshot(),
);
assert.deepEqual(snapshot, buildBuyerAcceptanceBrowserWalkthroughManualExecutionApprovalSnapshot());
assert.equal(snapshot.generatedAt, '2026-07-05T00:00:00.000Z');

const forbiddenRecordStatusValues = [
  'executed',
  'verified',
  'passed',
  'ready',
  'approved',
  'complete',
  'success',
];
const forbiddenDecisionStatusValues = ['approved'];
assert.equal(forbiddenRecordStatusValues.includes(snapshot.approvalRecordStatus), false);
assert.equal(forbiddenDecisionStatusValues.includes(snapshot.approvalDecisionStatus), false);

assert.equal(['template_defined', 'approval_required'].includes(snapshot.sourceManualRunbookStatus), true);
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

assert.equal(snapshot.approvalReferencePlaceholder, '[AP_APPROVAL_REFERENCE_PENDING]');
assert.equal(snapshot.approverPlaceholder, '[APPROVER_PENDING]');
assert.equal(snapshot.approvalDecisionPlaceholder, '[APPROVAL_DECISION_PENDING]');
assert.equal(snapshot.requestedExecutionModePlaceholder, '[BROWSER_MODE_PENDING]');
assert.equal(snapshot.requestedRunWindowPlaceholder, '[RUN_WINDOW_PENDING]');
for (const placeholder of [
  snapshot.approvalReferencePlaceholder,
  snapshot.approverPlaceholder,
  snapshot.approvalDecisionPlaceholder,
  snapshot.requestedExecutionModePlaceholder,
  snapshot.requestedRunWindowPlaceholder,
]) {
  assert.doesNotMatch(placeholder, /secret|token|key|url|host|port|ip|path|db|project|container|image/i);
}

const scopeCopy = snapshot.approvalScopeItems.flatMap(item => [
  item.id,
  item.label,
  item.requestedScope,
  item.allowedOnlyIfApproved,
  item.proofBoundary,
  ...item.prohibitedInAllCases,
]).join('\n');
for (const phrase of [
  'manual browser walkthrough execution',
  'local app view opening',
  'Admin Workbench read-only inspection',
  'Trust Center read-only inspection',
  'Buyer Acceptance Pack read-only inspection',
  'Review Rehearsal Gate read-only inspection',
  'Admin Walkthrough read-only inspection',
  'sanitized textual observation only',
  'No screenshot capture',
  'No browser automation',
  'No export/PDF/download',
  'No approval/signoff/status change',
  'No readiness/certification claims',
  'No DB/RLS/artifact/hosted/deployment/provider/classifier/schema/real assertion execution',
]) {
  assert.match(scopeCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
for (const item of snapshot.approvalScopeItems) {
  assert.ok(item.prohibitedInAllCases.length > 0, `${item.id} should include prohibited-in-all-cases boundaries.`);
}

const requirementCopy = snapshot.approvalRequirements.flatMap(requirement => [
  requirement.id,
  requirement.label,
  requirement.requirement,
  requirement.requiredConfirmation,
  ...requirement.mustRemainBlocked,
]).join('\n');
for (const phrase of [
  'execution scope',
  'manual browser mode',
  'local app view',
  'sections to inspect',
  'output capture policy',
  'sanitized textual evidence template',
  'redaction checklist',
  'stop conditions',
  'No screenshots unless future screenshot policy is approved',
  'No export/PDF/download',
  'No approval/signoff/status change',
  'No readiness claims',
]) {
  assert.match(requirementCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const allowedEvidenceCopy = snapshot.evidenceRules.flatMap(rule => rule.allowedEvidence).join('\n');
assert.match(allowedEvidenceCopy, /sanitized textual observations after future explicit AP approval/i);
assert.match(allowedEvidenceCopy, /sanitized manual run summary after future explicit AP approval/i);
assert.doesNotMatch(allowedEvidenceCopy, /screenshot|browser log|raw log|export|PDF|download|approval artifact|local path|DB URL|auth header|provider key|private token|project ref|container\/image ID|stack trace|machine-specific/i);
for (const rule of snapshot.evidenceRules) {
  assert.equal(rule.redactionRequired, true, `${rule.id} should require redaction.`);
  assert.equal(rule.storageAllowed, false, `${rule.id} should not allow storage in this slice.`);
}

const prohibitedEvidenceCopy = snapshot.evidenceRules.flatMap(rule => rule.prohibitedEvidence).join('\n');
for (const phrase of [
  'screenshots',
  'screenshot paths',
  'screenshot folders',
  'screenshot comparisons',
  'browser logs',
  'raw logs',
  'raw stdout/stderr',
  'export/PDF/download files',
  'approval artifacts',
  'local paths',
  'host/port/IP values',
  'DB URLs',
  'row payloads',
  'auth headers',
  'provider keys',
  'service-role values',
  'private tokens',
  'project refs',
  'target values',
  'container/image IDs',
  'stack traces',
  'machine-specific values',
]) {
  assert.match(prohibitedEvidenceCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const redactionCopy = snapshot.redactionChecklist.join('\n');
for (const phrase of [
  'screenshots',
  'screenshot paths',
  'screenshot folders',
  'screenshot comparisons',
  'browser logs',
  'raw logs',
  'raw stdout/stderr',
  'export/PDF/download files',
  'approval artifacts',
  'local paths',
  'host/port/IP values',
  'DB URLs',
  'row payloads',
  'auth headers',
  'provider keys',
  'service-role values',
  'private tokens',
  'project refs',
  'target values',
  'container/image IDs',
  'stack traces',
  'machine-specific values',
]) {
  assert.match(redactionCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const stopConditionCopy = snapshot.stopConditions.flatMap(condition => [
  condition.id,
  condition.label,
  condition.trigger,
  condition.requiredResponse,
]).join('\n');
for (const phrase of [
  'AP approval missing',
  'approval decision marked approved',
  'browser execution attempted',
  'browser automation attempted',
  'screenshot captured',
  'screenshot path/folder generated',
  'export/download/PDF action appears available',
  'approval/signoff/status-change action appears',
  'readiness/certification claim appears',
  'generated artifact appears in scope',
  'sensitive/local-machine values appear',
  'DB/RLS/artifact/hosted/deployment command required',
]) {
  assert.match(stopConditionCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const requiredBeforeApprovalCopy = snapshot.requiredBeforeApproval.join('\n');
for (const phrase of [
  'AP confirms exact execution scope',
  'AP confirms manual browser mode',
  'AP confirms output capture policy',
  'AP confirms sanitized evidence template',
  'AP confirms redaction checklist',
  'AP confirms stop conditions',
  'AP confirms no screenshots are in scope unless future screenshot policy is approved',
  'AP confirms no export/PDF/download is in scope',
  'AP confirms no approval/status change is in scope',
  'AP confirms no readiness claim is made',
]) {
  assert.match(requiredBeforeApprovalCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
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
  snapshot.approvalReferencePlaceholder,
  snapshot.approverPlaceholder,
  snapshot.approvalDecisionPlaceholder,
  snapshot.requestedExecutionModePlaceholder,
  snapshot.requestedRunWindowPlaceholder,
  ...snapshot.redactionChecklist,
  ...snapshot.requiredBeforeApproval,
  ...snapshot.stillDeferredItems,
  ...snapshot.approvalScopeItems.flatMap(item => [
    item.label,
    item.requestedScope,
    item.allowedOnlyIfApproved,
    item.proofBoundary,
    ...item.prohibitedInAllCases,
  ]),
  ...snapshot.approvalRequirements.flatMap(requirement => [
    requirement.label,
    requirement.requirement,
    requirement.requiredConfirmation,
    ...requirement.mustRemainBlocked,
  ]),
  ...snapshot.evidenceRules.flatMap(rule => [
    rule.label,
    ...rule.allowedEvidence,
    ...rule.prohibitedEvidence,
    rule.rationale,
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
  manualRunbook: unknown;
  boundary: unknown;
  plan: unknown;
  admin: unknown;
  pack: unknown;
  gate: unknown;
} {
  return {
    manualRunbook: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT)),
    boundary: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT)),
    plan: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT)),
    admin: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)),
    pack: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)),
    gate: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)),
  };
}

const before = cloneSources();
const rebuilt: BuyerAcceptanceManualExecutionApprovalSnapshot =
  buildBuyerAcceptanceBrowserWalkthroughManualExecutionApprovalSnapshot();
assert.equal(rebuilt.sourcePlanStatus, 'planned');
assert.deepEqual(before.manualRunbook, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT)));
assert.deepEqual(before.boundary, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT)));
assert.deepEqual(before.plan, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT)));
assert.deepEqual(before.admin, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)));
assert.deepEqual(before.pack, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)));
assert.deepEqual(before.gate, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)));

console.log('Buyer Acceptance Browser Walkthrough manual execution approval tests passed.');
