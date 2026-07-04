import assert from 'node:assert/strict';

import {
  ADMIN_WORKBENCH_SECTIONS,
  type AdminSectionKey,
} from './adminWorkbenchModel';
import {
  CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
  buildBuyerAcceptancePackSnapshot,
} from './buyerAcceptancePackModel';
import {
  CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT,
  buildBuyerAcceptanceReviewGateSnapshot,
} from './buyerAcceptanceReviewGate';
import {
  BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_DEFERRED_TRACKS,
  BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_READINESS_BLOCKERS,
  buildBuyerAcceptanceAdminWalkthroughSnapshot,
  type BuyerAcceptanceWalkthroughStepKey,
} from './buyerAcceptanceAdminWalkthrough';

console.log('Running Buyer Acceptance Admin Walkthrough rehearsal tests...');

const pack = buildBuyerAcceptancePackSnapshot();
const gate = buildBuyerAcceptanceReviewGateSnapshot(pack);
const walkthrough = buildBuyerAcceptanceAdminWalkthroughSnapshot(pack, gate);

assert.deepEqual(walkthrough, buildBuyerAcceptanceAdminWalkthroughSnapshot(pack, gate));
assert.deepEqual(
  buildBuyerAcceptanceAdminWalkthroughSnapshot(),
  buildBuyerAcceptanceAdminWalkthroughSnapshot(),
);

assert.notEqual(walkthrough.walkthroughStatus, 'ready');
assert.notEqual(walkthrough.walkthroughStatus, 'success');
assert.ok(
  walkthrough.walkthroughStatus === 'evidence_required' || walkthrough.walkthroughStatus === 'rehearsal_required',
  `Unexpected walkthrough status: ${walkthrough.walkthroughStatus}`,
);

assert.equal(walkthrough.sourcePackStatus, 'evidence_required');
assert.equal(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT.packStatus, 'evidence_required');
assert.notEqual(walkthrough.sourceReviewGateStatus, 'review_ready');
assert.notEqual(CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT.gateStatus, 'review_ready');

const adminSectionOrder = walkthrough.adminSectionOrder;
const requiredSections: readonly AdminSectionKey[] = [
  'trust_center',
  'buyer_acceptance_pack',
  'buyer_acceptance_review_gate',
];
for (const sectionKey of requiredSections) {
  assert.ok(adminSectionOrder.includes(sectionKey), `Missing Admin Workbench section: ${sectionKey}`);
}

assert.deepEqual(adminSectionOrder, ADMIN_WORKBENCH_SECTIONS.map(section => section.key));
assert.ok(adminSectionOrder.indexOf('buyer_acceptance_pack') > adminSectionOrder.indexOf('trust_center'));
assert.ok(adminSectionOrder.indexOf('buyer_acceptance_review_gate') > adminSectionOrder.indexOf('buyer_acceptance_pack'));
assert.ok(adminSectionOrder.indexOf('evidence_policy') > adminSectionOrder.indexOf('buyer_acceptance_review_gate'));

const requiredStepKeys: readonly BuyerAcceptanceWalkthroughStepKey[] = [
  'open_admin_workbench',
  'inspect_trust_center',
  'inspect_buyer_acceptance_pack',
  'inspect_review_rehearsal_gate',
  'confirm_export_blocked',
  'confirm_readiness_blocked',
  'confirm_human_review_required',
  'confirm_deferred_proof_tracks',
];

for (const stepKey of requiredStepKeys) {
  assert.ok(walkthrough.steps.some(step => step.key === stepKey), `Missing walkthrough step: ${stepKey}`);
}

for (const step of walkthrough.steps) {
  assert.ok(step.expectedObservation.length > 0, `${step.key} should include expected observation.`);
  assert.ok(step.evidenceReference.length > 0, `${step.key} should include evidence reference.`);
  assert.ok(step.mustConfirm.length > 0, `${step.key} should include must-confirm items.`);
  assert.ok(step.mustNotClaim.length > 0, `${step.key} should include must-not-claim items.`);
  assert.ok(step.blockedActions.length > 0, `${step.key} should include blocked actions.`);
}

const serializedWalkthrough = JSON.stringify(walkthrough);
assert.match(serializedWalkthrough, /No export\/PDF\/download scope approved/);
assert.match(serializedWalkthrough, /export\/PDF\/download generation/);
assert.match(serializedWalkthrough, /blocked/i);
assert.doesNotMatch(serializedWalkthrough, /available action/i);
assert.doesNotMatch(serializedWalkthrough, /Avala Govern Lite/);
assert.doesNotMatch(serializedWalkthrough, /Avala Delivery Lite/);

assert.ok(
  walkthrough.exportBlockers.includes('No export/PDF/download scope approved.'),
  'Missing export/PDF/download scope blocker.',
);

for (const blocker of BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_READINESS_BLOCKERS) {
  assert.ok(walkthrough.readinessBlockers.includes(blocker), `Missing readiness blocker: ${blocker}`);
}

for (const deferredTrack of [
  'export/PDF/download generation',
  'approval workflow',
  'DB/RLS/artifact proof',
  'hosted/deployment/security proof tracks',
]) {
  assert.ok(walkthrough.deferredTracks.includes(deferredTrack), `Missing deferred track: ${deferredTrack}`);
}

for (const deferredTrack of BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_DEFERRED_TRACKS) {
  assert.ok(walkthrough.deferredTracks.includes(deferredTrack), `Missing exported deferred track: ${deferredTrack}`);
}

for (const findingId of [
  'export-not-available',
  'readiness-not-proven',
  'buyer-signoff-not-complete',
  'ap-approval-still-required',
]) {
  assert.ok(walkthrough.findings.some(finding => finding.id === findingId), `Missing finding: ${findingId}`);
}

const exportFinding = walkthrough.findings.find(finding => finding.id === 'export-not-available');
assert.ok(exportFinding);
assert.equal(exportFinding.requiredBeforeExport, true);
assert.equal(exportFinding.status, 'blocked');

const buyerSignoffFinding = walkthrough.findings.find(finding => finding.id === 'buyer-signoff-not-complete');
assert.ok(buyerSignoffFinding);
assert.equal(buyerSignoffFinding.requiredBeforeBuyerSignoff, true);

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
  /approved for buyer use/i,
  /export available/i,
  /download available/i,
  /PDF available/i,
]) {
  assert.doesNotMatch(walkthrough.summary, pattern);
}

const packBefore = JSON.parse(JSON.stringify(pack));
const gateBefore = JSON.parse(JSON.stringify(gate));
buildBuyerAcceptanceAdminWalkthroughSnapshot(pack, gate);
assert.deepEqual(pack, packBefore);
assert.deepEqual(gate, gateBefore);

console.log('Buyer Acceptance Admin Walkthrough rehearsal tests passed.');
