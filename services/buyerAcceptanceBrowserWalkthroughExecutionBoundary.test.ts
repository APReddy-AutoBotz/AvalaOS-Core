import assert from 'node:assert/strict';
import { ADMIN_WORKBENCH_SECTIONS } from './adminWorkbenchModel';
import { CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT } from './buyerAcceptanceAdminWalkthrough';
import { CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT } from './buyerAcceptanceBrowserWalkthroughPlan';
import { CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT } from './buyerAcceptancePackModel';
import { CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT } from './buyerAcceptanceReviewGate';
import {
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT,
  buildBuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot,
  type BuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot,
} from './buyerAcceptanceBrowserWalkthroughExecutionBoundary';

console.log('Running Buyer Acceptance Browser Walkthrough execution boundary tests...');

const snapshot = buildBuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot();

assert.deepEqual(
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT,
  buildBuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot(),
);
assert.deepEqual(snapshot, buildBuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot());
assert.equal(snapshot.generatedAt, '2026-07-04T00:00:00.000Z');

const forbiddenStatusValues = ['executed', 'verified', 'passed', 'ready', 'approved', 'complete', 'success'];
assert.equal(forbiddenStatusValues.includes(snapshot.boundaryStatus), false);
assert.equal(['approved'].includes(snapshot.approvalStatus as string), false);
assert.equal(snapshot.sourcePlanStatus, 'planned');
assert.equal(['ready', 'success'].includes(snapshot.sourceAdminWalkthroughStatus as string), false);
assert.equal(snapshot.sourcePackStatus, 'evidence_required');
assert.notEqual(snapshot.sourceReviewGateStatus, 'review_ready');

assert.deepEqual(
  snapshot.adminSectionOrder,
  ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
);

assert.deepEqual(snapshot.executionModes, [
  'future_manual_browser_rehearsal',
  'future_scripted_browser_rehearsal',
]);

const ruleCategories = new Set(snapshot.boundaryRules.map(rule => rule.category));
for (const category of [
  'approval',
  'browser_execution',
  'screenshot',
  'artifact_generation',
  'status_control',
  'data_execution',
  'environment_validation',
  'provider_execution',
  'schema',
  'sensitive_data',
  'evidence_handling',
]) {
  assert.equal(ruleCategories.has(category as never), true, `Missing rule category: ${category}`);
}

for (const rule of snapshot.boundaryRules) {
  assert.ok(rule.requirement.trim().length > 0, `${rule.id} should include requirement.`);
  assert.ok(rule.rationale.trim().length > 0, `${rule.id} should include rationale.`);
  assert.ok(rule.mustConfirm.length > 0, `${rule.id} should include mustConfirm.`);
  assert.ok(rule.mustNotDo.length > 0, `${rule.id} should include mustNotDo.`);
}

for (const action of snapshot.allowedActions) {
  assert.match(action, /define future/i);
  assert.doesNotMatch(action, /launch|run|execute|capture|compare|generate|approve|sign off|change status/i);
}

const prohibitedActions = snapshot.prohibitedActions.join('\n');
for (const phrase of [
  'Browser automation execution',
  'Browser launch',
  'Screenshot capture',
  'Screenshot comparison',
  'Screenshot folder creation',
  'Export generation',
  'PDF generation',
  'Download generation',
  'Approval, signoff, complete, or status-change actions',
  'DB, RLS, or artifact execution',
  'Hosted or deployment validation',
  'Provider or classifier execution',
  'Schema inspection',
  'Real assertion execution',
]) {
  assert.match(prohibitedActions, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const evidenceBoundaryCopy = snapshot.evidenceBoundaries.flatMap(boundary => [
  boundary.label,
  ...boundary.allowedEvidence,
  ...boundary.prohibitedEvidence,
  boundary.rationale,
]).join('\n');
for (const phrase of [
  'raw logs',
  'raw stdout',
  'raw stderr',
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
  assert.match(evidenceBoundaryCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
assert.ok(snapshot.evidenceBoundaries.every(boundary => boundary.storageAllowed === false));
assert.ok(snapshot.evidenceBoundaries.every(boundary => boundary.redactionRequired === true));

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
  'Export/download/PDF action appears available',
  'Approval/signoff/status-change action appears',
  'Readiness or certification claim appears',
  'Generated artifact appears in scope',
  'Secrets, env, or local-machine values appear',
  'DB/RLS/artifact/hosted/deployment command required',
]) {
  assert.match(stopConditionCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const preExecutionChecks = snapshot.requiredPreExecutionChecks.join('\n');
for (const phrase of [
  'AP explicitly approves browser execution scope',
  'Browser mode is selected',
  'Output capture policy is defined',
  'Screenshot policy is defined',
  'Redaction rules are accepted',
  'Stop conditions are accepted',
  'No export/PDF/download is in scope',
  'No approval/status change is in scope',
]) {
  assert.match(preExecutionChecks, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

const deferredItems = snapshot.deferredExecutionItems.join('\n');
for (const phrase of [
  'actual browser walkthrough execution',
  'browser automation implementation',
  'manual browser rehearsal execution',
  'screenshot capture',
  'screenshot evidence policy',
  'export/PDF/download design',
  'approval workflow design',
  'DB-backed persistence',
  'editable buyer controls',
  'DB/RLS/artifact proof',
  'hosted/deployment/security proof tracks',
]) {
  assert.match(deferredItems, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

assert.ok(snapshot.summary.includes('No browser was launched'));
assert.ok(snapshot.summary.includes('no browser automation was run'));
assert.ok(snapshot.summary.includes('no screenshot was captured'));
assert.ok(snapshot.summary.includes('no readiness evidence was produced'));
assert.ok(snapshot.summary.includes('AP approval is required before execution'));
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
  ...snapshot.allowedActions,
  ...snapshot.redactionRules,
  ...snapshot.requiredPreExecutionChecks,
  ...snapshot.deferredExecutionItems,
  ...snapshot.boundaryRules.flatMap(rule => [
    rule.label,
    rule.requirement,
    rule.rationale,
    ...rule.mustConfirm,
  ]),
].join('\n');
assert.doesNotMatch(safeCopy, new RegExp('Avala Govern' + ' Lite', 'i'));
assert.doesNotMatch(safeCopy, new RegExp('Avala Delivery' + ' Lite', 'i'));

function cloneSources(): {
  plan: unknown;
  admin: unknown;
  pack: unknown;
  gate: unknown;
} {
  return {
    plan: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT)),
    admin: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)),
    pack: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)),
    gate: JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)),
  };
}

const before = cloneSources();
const rebuilt: BuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot =
  buildBuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot();
assert.equal(rebuilt.sourcePlanStatus, 'planned');
assert.deepEqual(before.plan, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT)));
assert.deepEqual(before.admin, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT)));
assert.deepEqual(before.pack, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT)));
assert.deepEqual(before.gate, JSON.parse(JSON.stringify(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT)));

console.log('Buyer Acceptance Browser Walkthrough execution boundary tests passed.');
