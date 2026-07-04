import assert from 'node:assert/strict';

import {
  CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT,
  type BuyerAcceptanceReviewGateSnapshot,
  type BuyerAcceptanceReviewerRole,
} from './buyerAcceptanceReviewGate';
import {
  assertReviewGateHasExportBlockers,
  assertReviewGateHasReadinessBlockers,
  assertReviewGateNotReviewReady,
  assertReviewGateProofSafeCopy,
  getBlockingReviewFindings,
  getRequiredBeforeExportChecklist,
  getReviewChecklistStatusLabel,
  getReviewFindingSeverityLabel,
  getReviewFindingStatusLabel,
  getReviewGateExportBlockers,
  getReviewGateReadinessBlockers,
  getReviewGateStatusLabel,
  getReviewerRoleLabel,
  groupReviewGateQuestionsByRole,
  summarizeReviewGateStatus,
} from './buyerAcceptanceReviewGatePresentation';

console.log('Running Buyer Acceptance Pack review gate presentation tests...');

const gate = CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT;

const cloneGate = (source: BuyerAcceptanceReviewGateSnapshot): BuyerAcceptanceReviewGateSnapshot =>
  JSON.parse(JSON.stringify(source)) as BuyerAcceptanceReviewGateSnapshot;

assert.deepEqual(groupReviewGateQuestionsByRole(gate), groupReviewGateQuestionsByRole(gate));
assert.deepEqual(getReviewGateExportBlockers(gate), getReviewGateExportBlockers(gate));
assert.deepEqual(getReviewGateReadinessBlockers(gate), getReviewGateReadinessBlockers(gate));
assert.equal(summarizeReviewGateStatus(gate), summarizeReviewGateStatus(gate));

assertReviewGateNotReviewReady(gate);
assert.notEqual(gate.gateStatus, 'review_ready');
assert.equal(gate.sourcePackStatus, 'evidence_required');

const statusSummary = summarizeReviewGateStatus(gate);
assert.match(statusSummary, /read-only rehearsal gate/i);
assert.match(statusSummary, /not an approval/i);
assert.match(statusSummary, /not an export/i);
assert.match(statusSummary, /not readiness evidence/i);
assert.match(statusSummary, /not compliance evidence/i);
assert.match(statusSummary, /no PDF\/download generated/i);
assert.match(statusSummary, /Export\/PDF\/download remains blocked/i);

const roleGroups = groupReviewGateQuestionsByRole(gate);
const roles = new Set<BuyerAcceptanceReviewerRole>(roleGroups.map(group => group.role));
for (const role of [
  'buyer_executive',
  'security_reviewer',
  'delivery_owner',
  'ap_approver',
  'product_owner',
] as const) {
  assert.ok(roles.has(role), `Missing reviewer role group: ${role}`);
  assert.ok(roleGroups.find(group => group.role === role)?.questions.length, `Reviewer role group should include questions: ${role}`);
}

assertReviewGateHasExportBlockers(gate);
assert.ok(getReviewGateExportBlockers(gate).length > 0);
assert.ok(getReviewGateExportBlockers(gate).includes('No export/PDF/download scope approved.'));

assertReviewGateHasReadinessBlockers(gate);
assert.ok(getReviewGateReadinessBlockers(gate).length > 0);

assert.ok(getBlockingReviewFindings(gate).length > 0);
assert.ok(getRequiredBeforeExportChecklist(gate).length > 0);

assertReviewGateProofSafeCopy(gate);

const positiveClaimGate = cloneGate(gate);
positiveClaimGate.summary = 'production ready';
assert.throws(() => assertReviewGateProofSafeCopy(positiveClaimGate), /unsupported claim wording/i);

const oldGovernNameGate = cloneGate(gate);
oldGovernNameGate.summary = 'Avala Govern Lite';
assert.throws(() => assertReviewGateProofSafeCopy(oldGovernNameGate), /unsupported claim wording/i);

const oldDeliveryNameGate = cloneGate(gate);
oldDeliveryNameGate.summary = 'Avala Delivery Lite';
assert.throws(() => assertReviewGateProofSafeCopy(oldDeliveryNameGate), /unsupported claim wording/i);

const summaryAndLabels = [
  summarizeReviewGateStatus(gate),
  getReviewGateStatusLabel(gate.gateStatus),
  ...roleGroups.map(group => group.label),
  ...gate.findings.flatMap(finding => [
    finding.label,
    getReviewFindingSeverityLabel(finding.severity),
    getReviewFindingStatusLabel(finding.status),
  ]),
  ...gate.checklist.flatMap(item => [
    item.label,
    getReviewChecklistStatusLabel(item.status),
  ]),
  ...([
    'buyer_executive',
    'security_reviewer',
    'delivery_owner',
    'ap_approver',
    'product_owner',
  ] as const).map(role => getReviewerRoleLabel(role)),
].join('\n');

for (const pattern of [
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
]) {
  assert.doesNotMatch(summaryAndLabels, pattern);
}

const gateBefore = cloneGate(gate);
groupReviewGateQuestionsByRole(gate);
getReviewGateExportBlockers(gate);
getReviewGateReadinessBlockers(gate);
getBlockingReviewFindings(gate);
getRequiredBeforeExportChecklist(gate);
summarizeReviewGateStatus(gate);
assertReviewGateProofSafeCopy(gate);
assert.deepEqual(gate, gateBefore);

console.log('Buyer Acceptance Pack review gate presentation tests passed.');
