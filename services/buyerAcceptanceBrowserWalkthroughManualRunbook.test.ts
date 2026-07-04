import assert from 'node:assert/strict';
import { ADMIN_WORKBENCH_SECTIONS } from './adminWorkbenchModel';
import { CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT } from './buyerAcceptanceAdminWalkthrough';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughExecutionBoundary';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughPlan';
import { CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT } from './buyerAcceptancePackModel';
import { CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT } from './buyerAcceptanceReviewGate';
import {
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT,
  buildBuyerAcceptanceBrowserWalkthroughManualRunbookSnapshot,
  type BuyerAcceptanceManualRunbookTemplateSnapshot,
} from './buyerAcceptanceBrowserWalkthroughManualRunbook';

console.log('Running Buyer Acceptance Browser Walkthrough manual runbook tests...');

const snapshot = buildBuyerAcceptanceBrowserWalkthroughManualRunbookSnapshot();

assert.deepEqual(
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT,
  buildBuyerAcceptanceBrowserWalkthroughManualRunbookSnapshot(),
);
assert.deepEqual(snapshot, buildBuyerAcceptanceBrowserWalkthroughManualRunbookSnapshot());
assert.equal(snapshot.generatedAt, '2026-07-04T00:00:00.000Z');

const forbiddenRunbookStatusValues = [
  'executed',
  'verified',
  'passed',
  'ready',
  'approved',
  'complete',
  'success',
];
const forbiddenExecutionStatusValues = [
  'executed',
  'verified',
  'passed',
  'approved',
  'complete',
  'success',
];

assert.equal(forbiddenRunbookStatusValues.includes(snapshot.runbookStatus), false);
assert.equal(forbiddenExecutionStatusValues.includes(snapshot.executionStatus), false);
assert.equal(['approved'].includes(snapshot.sourceBoundaryApprovalStatus as string), false);
assert.equal(snapshot.sourcePlanStatus, 'planned');
assert.equal(['ready', 'success'].includes(snapshot.sourceAdminWalkthroughStatus as string), false);
assert.equal(snapshot.sourcePackStatus, 'evidence_required');
assert.notEqual(snapshot.sourceReviewGateStatus, 'review_ready');

assert.deepEqual(
  snapshot.adminSectionOrder,
  ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
);

const requiredManualStepKeys = [
  'confirm_ap_approval_before_future_execution',
  'confirm_browser_mode_and_output_policy',
  'open_admin_workbench_future_execution',
  'inspect_trust_center',
  'inspect_buyer_acceptance_pack',
  'inspect_review_rehearsal_gate',
  'inspect_admin_walkthrough',
  'confirm_export_pdf_download_blocked',
  'confirm_approval_status_change_unavailable',
  'confirm_no_browser_screenshot_evidence_from_template_slice',
  'confirm_readiness_certification_blocked',
  'record_sanitized_textual_observations_only',
  'close_without_status_change',
] as const;
const manualStepKeys = new Set(snapshot.manualSteps.map(step => step.key));
for (const stepKey of requiredManualStepKeys) {
  assert.equal(manualStepKeys.has(stepKey), true, `Missing manual runbook step: ${stepKey}`);
}

for (const step of snapshot.manualSteps) {
  assert.ok(step.instruction.trim().length > 0, `${step.key} should include instruction.`);
  assert.ok(step.expectedObservation.trim().length > 0, `${step.key} should include expected observation.`);
  assert.ok(step.evidenceFields.length > 0, `${step.key} should include evidence fields.`);
  assert.ok(step.redactionChecklist.length > 0, `${step.key} should include redaction checklist.`);
  assert.ok(step.stopIfSeen.length > 0, `${step.key} should include stop-if-seen list.`);
  assert.ok(step.mustNotClaim.length > 0, `${step.key} should include must-not-claim list.`);
}

const evidenceTemplateCopy = snapshot.evidenceTemplateFields.flatMap(field => [
  field.id,
  field.label,
  field.allowedValueGuidance,
  field.prohibitedValueGuidance,
]).join('\n');

for (const field of snapshot.evidenceTemplateFields) {
  assert.equal(field.redactionRequired, true, `${field.id} should require redaction.`);
  assert.match(field.allowedValueGuidance, /sanitized textual|placeholder/i, `${field.id} should allow only sanitized textual observations or placeholders.`);
  assert.doesNotMatch(field.allowedValueGuidance, /screenshot|browser log|raw log|export|PDF|download|DB URL|auth header|provider key|private token/i);
}

for (const phrase of [
  'raw logs',
  'raw stdout/stderr',
  'screenshots',
  'screenshot paths',
  'screenshot folders',
  'browser logs',
  'export/PDF/download files',
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
  assert.match(evidenceTemplateCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const allowedEvidenceCopy = snapshot.allowedEvidence.join('\n');
assert.match(allowedEvidenceCopy, /sanitized textual observation template only/i);
assert.match(allowedEvidenceCopy, /future AP-approved manual run summary only/i);
assert.doesNotMatch(allowedEvidenceCopy, /screenshot|browser log|raw log|export|PDF|download|approval artifact|sensitive|local-machine/i);

const prohibitedEvidenceCopy = snapshot.prohibitedEvidence.join('\n');
for (const phrase of [
  'screenshots',
  'screenshot comparisons',
  'screenshot folders',
  'browser logs',
  'raw logs',
  'raw stdout/stderr',
  'exports',
  'PDFs',
  'downloads',
  'approval artifacts',
  'any sensitive/local-machine data',
]) {
  assert.match(prohibitedEvidenceCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const stopConditionCopy = snapshot.stopConditions.flatMap(condition => [
  condition.id,
  condition.label,
  condition.trigger,
  condition.requiredResponse,
]).join('\n');
for (const phrase of [
  'AP approval missing',
  'Browser execution attempted',
  'Screenshot captured',
  'Screenshot path/folder generated',
  'Export/download/PDF action appears available',
  'Approval/signoff/status-change action appears',
  'Readiness/certification claim appears',
  'Generated artifact appears in scope',
  'Sensitive/local-machine values appear',
  'DB/RLS/artifact/hosted/deployment command required',
]) {
  assert.match(stopConditionCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const requiredBeforeExecutionCopy = snapshot.requiredBeforeExecution.join('\n');
for (const phrase of [
  'Explicit AP approval',
  'Selected browser mode',
  'Accepted output policy',
  'Accepted redaction rules',
  'Accepted stop conditions',
  'Screenshot policy if screenshots are requested',
  'No export/PDF/download in scope',
  'No approval/status change in scope',
]) {
  assert.match(requiredBeforeExecutionCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const deferredItemsCopy = snapshot.deferredItems.join('\n');
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

assert.ok(snapshot.summary.includes('No browser was launched'));
assert.ok(snapshot.summary.includes('no browser automation was run'));
assert.ok(snapshot.summary.includes('no screenshot was captured'));
assert.ok(snapshot.summary.includes('no evidence artifact was generated'));
assert.ok(snapshot.summary.includes('no readiness evidence was produced'));
assert.ok(snapshot.summary.includes('AP approval is still required before execution'));
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
  ...snapshot.allowedEvidence,
  ...snapshot.prohibitedEvidence,
  ...snapshot.redactionChecklist,
  ...snapshot.requiredBeforeExecution,
  ...snapshot.deferredItems,
  ...snapshot.manualSteps.flatMap(step => [
    step.title,
    step.instruction,
    step.expectedObservation,
    ...step.stopIfSeen,
  ]),
].join('\n');
assert.doesNotMatch(safeCopy, new RegExp('Avala Govern' + ' Lite', 'i'));
assert.doesNotMatch(safeCopy, new RegExp('Avala Delivery' + ' Lite', 'i'));

function cloneSources(): {
  boundary: unknown;
  plan: unknown;
  admin: unknown;
  pack: unknown;
  gate: unknown;
} {
  return {
    boundary: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT)),
    plan: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT)),
    admin: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)),
    pack: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)),
    gate: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)),
  };
}

const before = cloneSources();
const rebuilt: BuyerAcceptanceManualRunbookTemplateSnapshot =
  buildBuyerAcceptanceBrowserWalkthroughManualRunbookSnapshot();
assert.equal(rebuilt.sourcePlanStatus, 'planned');
assert.deepEqual(before.boundary, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT)));
assert.deepEqual(before.plan, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT)));
assert.deepEqual(before.admin, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)));
assert.deepEqual(before.pack, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)));
assert.deepEqual(before.gate, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)));

console.log('Buyer Acceptance Browser Walkthrough manual runbook tests passed.');
