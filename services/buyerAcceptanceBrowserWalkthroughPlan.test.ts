import assert from 'node:assert/strict';
import { ADMIN_WORKBENCH_SECTIONS } from './adminWorkbenchModel';
import { CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT } from './buyerAcceptanceAdminWalkthrough';
import { CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT } from './buyerAcceptancePackModel';
import { CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT } from './buyerAcceptanceReviewGate';
import {
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT,
  buildBuyerAcceptanceBrowserWalkthroughPlanSnapshot,
  type BuyerAcceptanceBrowserWalkthroughPlanSnapshot,
  type BuyerAcceptanceBrowserWalkthroughStepKey,
} from './buyerAcceptanceBrowserWalkthroughPlan';

console.log('Running Buyer Acceptance Browser Walkthrough rehearsal plan tests...');

const snapshot = buildBuyerAcceptanceBrowserWalkthroughPlanSnapshot();

assert.deepEqual(
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT,
  buildBuyerAcceptanceBrowserWalkthroughPlanSnapshot(),
);
assert.deepEqual(snapshot, buildBuyerAcceptanceBrowserWalkthroughPlanSnapshot());
assert.equal(snapshot.generatedAt, '2026-07-04T00:00:00.000Z');

const forbiddenPlanStatuses = ['executed', 'verified', 'passed', 'ready', 'approved', 'complete', 'success'];
assert.equal(forbiddenPlanStatuses.includes(snapshot.planStatus), false);
assert.match(snapshot.planStatus, /^(planned|rehearsal_required)$/);

const sourceAdminStatus = snapshot.sourceAdminWalkthroughStatus as string;
assert.equal(['ready', 'success'].includes(sourceAdminStatus), false);
assert.equal(snapshot.sourcePackStatus, 'evidence_required');
assert.notEqual(snapshot.sourceReviewGateStatus, 'review_ready');

assert.deepEqual(
  snapshot.adminSectionOrder,
  ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
);

const requiredSteps: readonly BuyerAcceptanceBrowserWalkthroughStepKey[] = [
  'launch_admin_workbench_view',
  'inspect_trust_center_section',
  'inspect_buyer_acceptance_pack_section',
  'inspect_review_rehearsal_gate_section',
  'inspect_admin_walkthrough_section',
  'confirm_no_export_actions',
  'confirm_no_browser_or_screenshot_evidence',
  'confirm_no_readiness_claims',
  'confirm_deferred_tracks_visible',
  'close_without_status_change',
];

for (const stepKey of requiredSteps) {
  assert.ok(
    snapshot.plannedSteps.some(step => step.key === stepKey),
    `Missing browser walkthrough plan step: ${stepKey}`,
  );
}

for (const step of snapshot.plannedSteps) {
  assert.ok(step.plannedObservation.trim().length > 0, `${step.key} should include plannedObservation.`);
  assert.ok(step.allowedInspection.trim().length > 0, `${step.key} should include allowedInspection.`);
  assert.ok(step.prohibitedAction.length > 0, `${step.key} should include prohibitedAction list.`);
  assert.ok(step.expectedSafeText.length > 0, `${step.key} should include expectedSafeText list.`);
  assert.ok(step.mustNotClaim.length > 0, `${step.key} should include mustNotClaim list.`);
  assert.ok(step.evidenceBoundary.trim().length > 0, `${step.key} should include evidenceBoundary.`);
}

assert.ok(snapshot.allowedActions.length > 0);
for (const action of snapshot.allowedActions) {
  assert.match(action, /open|navigate|observe|record textual/i);
  assert.doesNotMatch(action, /execute|capture|compare|generate|approve|sign off|complete|change status/i);
}

const prohibitedActions = snapshot.prohibitedActions.join('\n');
for (const phrase of [
  'browser automation',
  'capture screenshots',
  'compare screenshots',
  'generate exports',
  'generate PDFs',
  'generate downloads',
  'approve, sign off, complete, or change any status',
  'DB, RLS, or artifact checks',
  'hosted or deployment validation',
  'providers or classifiers',
  'inspect schema',
  'real assertions',
]) {
  assert.match(prohibitedActions, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const stopConditionCopy = snapshot.stopConditions.map(condition => [
  condition.id,
  condition.label,
  condition.reason,
  condition.requiredResponse,
].join(' ')).join('\n');

for (const phrase of [
  'Export/download/PDF action appears available',
  'Approve, signoff, complete, or status-change action appears',
  'Readiness or certification claim appears',
  'Browser or screenshot evidence is produced',
  'Generated artifact appears in scope',
  'DB/RLS/artifact/hosted/deployment command is required',
]) {
  assert.match(stopConditionCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const deferredTracks = snapshot.deferredExecutionTracks.join('\n');
for (const phrase of [
  'browser walkthrough execution',
  'screenshot capture',
  'screenshot evidence policy',
  'export/PDF/download design',
  'approval workflow design',
  'DB-backed persistence',
  'editable buyer controls',
  'DB/RLS/artifact proof',
  'hosted/deployment/security proof tracks',
]) {
  assert.match(deferredTracks, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

assert.ok(snapshot.summary.includes('No browser run was performed'));
assert.ok(snapshot.summary.includes('no screenshot was captured'));
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
  /export available/i,
  /download available/i,
  /PDF available/i,
  /screenshot evidence captured/i,
  /browser walkthrough verified/i,
  /browser test passed/i,
  /walkthrough complete/i,
  new RegExp('Avala Govern' + ' Lite', 'i'),
  new RegExp('Avala Delivery' + ' Lite', 'i'),
];

for (const pattern of unsupportedPositivePatterns) {
  assert.doesNotMatch(snapshot.summary, pattern);
  assert.doesNotMatch(snapshot.proofBoundary, pattern);
}

const planSafeCopy = [
  snapshot.summary,
  snapshot.proofBoundary,
  ...snapshot.allowedActions,
  ...snapshot.expectedSafeText,
  ...snapshot.deferredExecutionTracks,
  ...snapshot.plannedSteps.flatMap(step => [
    step.title,
    step.plannedObservation,
    step.allowedInspection,
    step.evidenceBoundary,
    ...step.expectedSafeText,
  ]),
].join('\n');

assert.doesNotMatch(planSafeCopy, new RegExp('Avala Govern' + ' Lite', 'i'));
assert.doesNotMatch(planSafeCopy, new RegExp('Avala Delivery' + ' Lite', 'i'));

function cloneSources(): {
  admin: unknown;
  pack: unknown;
  gate: unknown;
} {
  return {
    admin: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)),
    pack: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)),
    gate: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)),
  };
}

const before = cloneSources();
const rebuilt: BuyerAcceptanceBrowserWalkthroughPlanSnapshot = buildBuyerAcceptanceBrowserWalkthroughPlanSnapshot();
assert.equal(rebuilt.sourcePackStatus, 'evidence_required');
assert.deepEqual(before.admin, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)));
assert.deepEqual(before.pack, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)));
assert.deepEqual(before.gate, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)));

console.log('Buyer Acceptance Browser Walkthrough rehearsal plan tests passed.');
