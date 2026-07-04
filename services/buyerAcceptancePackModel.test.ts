import assert from 'node:assert/strict';

import {
  CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
  REQUIRED_BUYER_ACCEPTANCE_OPEN_GAP_IDS,
  buildBuyerAcceptancePackSnapshot,
} from './buyerAcceptancePackModel';
import { buildCurrentTrustCenterSnapshot } from './trustCenterModel';

console.log('Running Buyer Acceptance Pack foundation tests...');

const pack = buildBuyerAcceptancePackSnapshot();

assert.deepEqual(buildBuyerAcceptancePackSnapshot(), buildBuyerAcceptancePackSnapshot());
assert.deepEqual(CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT, buildBuyerAcceptancePackSnapshot());

assert.notEqual(pack.packStatus, 'approved_for_review');
assert.notEqual(pack.packStatus, 'draft_foundation');
assert.equal(pack.packStatus, 'evidence_required');
assert.doesNotMatch(pack.executiveSummary, /production ready|hosted ready|deployment ready|RLS ready|tenant isolation verified|security ready|buyer ready|product ready|release-candidate ready|compliance certified/i);
assert.match(pack.executiveSummary, /draft foundation/i);
assert.match(pack.executiveSummary, /not an approval/i);

const openGapIds = new Set(pack.openProofGaps.map(gap => gap.id));
for (const gapId of REQUIRED_BUYER_ACCEPTANCE_OPEN_GAP_IDS) {
  assert.ok(openGapIds.has(gapId), `Missing open proof gap: ${gapId}`);
}

for (const gap of pack.openProofGaps) {
  assert.notEqual(gap.proofStatus, 'verified', `${gap.id} must not be verified.`);
}

const requiredNonClaimPhrases = [
  'production ready',
  'hosted ready',
  'deployment ready',
  'RLS ready / active / verified',
  'tenant isolation verified',
  'security ready',
  'buyer ready',
  'product ready',
  'release-candidate ready',
  'compliance certified',
  'Jira replacement',
  'bot/agent/RPA/runtime execution',
];

for (const phrase of requiredNonClaimPhrases) {
  const nonClaim = pack.nonClaims.find(candidate => candidate.prohibitedClaim === phrase);
  assert.ok(nonClaim, `Missing non-claim: ${phrase}`);
  assert.ok(nonClaim.safeAlternative.length > 0, `${phrase} should include a safe alternative.`);
  assert.ok(nonClaim.reason.length > 0, `${phrase} should include a reason.`);
}

const unsupportedClaimWording = /production ready|hosted ready|deployment ready|RLS ready|tenant isolation verified|security ready|buyer ready|product ready|release-candidate ready|compliance certified/i;
for (const claim of pack.claims) {
  assert.equal(claim.buyerSafe, true, `${claim.id} should be marked buyer-safe.`);
  assert.doesNotMatch(claim.label, unsupportedClaimWording, `${claim.id} label implies unsupported readiness.`);
  assert.doesNotMatch(claim.buyerSafeClaim, unsupportedClaimWording, `${claim.id} claim implies unsupported readiness.`);
  assert.doesNotMatch(claim.limitationDisclosure, unsupportedClaimWording, `${claim.id} disclosure implies unsupported readiness.`);
}

const allPackText = JSON.stringify(pack);
assert.match(allPackText, /Avala Govern/);
assert.match(allPackText, /Avala Delivery/);
assert.doesNotMatch(allPackText, /Avala Govern Lite/);
assert.doesNotMatch(allPackText, /Avala Delivery Lite/);

const governSummary = pack.moduleSummaries.find(summary => summary.moduleKey === 'govern');
assert.ok(governSummary);
assert.equal(governSummary.moduleName, 'Avala Govern');
assert.match(governSummary.limitationDisclosure, /does not execute bots/i);
assert.match(governSummary.limitationDisclosure, /agents/i);
assert.match(governSummary.limitationDisclosure, /RPA jobs/i);
assert.match(governSummary.limitationDisclosure, /external-system actions/i);
assert.match(governSummary.limitationDisclosure, /MCP controls/i);
assert.match(governSummary.limitationDisclosure, /A2A controls/i);
assert.match(governSummary.limitationDisclosure, /live runtime enforcement/i);

const deliverySummary = pack.moduleSummaries.find(summary => summary.moduleKey === 'delivery');
assert.ok(deliverySummary);
assert.equal(deliverySummary.moduleName, 'Avala Delivery');
assert.match(deliverySummary.limitationDisclosure, /not a Jira replacement/i);
assert.match(deliverySummary.limitationDisclosure, /does not prove hosted Delivery runtime readiness/i);

const studioSummary = pack.moduleSummaries.find(summary => summary.moduleKey === 'studio');
assert.ok(studioSummary);
assert.match(studioSummary.buyerSafeDescription, /editable review drafts/i);
assert.match(studioSummary.limitationDisclosure, /editable review drafts requiring human sign-off/i);

const reviewBlockedClaimsItem = pack.buyerReviewChecklist.find(item => item.id === 'review-blocked-evidence-required-claims');
assert.ok(reviewBlockedClaimsItem);
assert.equal(reviewBlockedClaimsItem.requiredBeforeBuyerSignoff, true);
assert.equal(reviewBlockedClaimsItem.status, 'evidence_required');

const apEvidenceItem = pack.apApprovalChecklist.find(item => item.id === 'ap-approved-evidence-for-status-change');
assert.ok(apEvidenceItem);
assert.equal(apEvidenceItem.requiredBeforeStatusChange, true);
assert.equal(apEvidenceItem.status, 'evidence_required');

const trustCenterSnapshot = buildCurrentTrustCenterSnapshot();
const trustCenterBefore = JSON.parse(JSON.stringify(trustCenterSnapshot));
buildBuyerAcceptancePackSnapshot(trustCenterSnapshot);
assert.deepEqual(trustCenterSnapshot, trustCenterBefore);

const claimIds = new Set(pack.claims.map(claim => claim.id));
for (const control of trustCenterSnapshot.claimControls) {
  assert.ok(claimIds.has(control.id), `Missing Trust Center claim control in pack: ${control.id}`);
}

for (const moduleState of trustCenterSnapshot.moduleCapabilityStates) {
  assert.ok(claimIds.has(`module-${moduleState.moduleKey}`), `Missing module capability claim in pack: ${moduleState.moduleKey}`);
}

assert.equal(pack.evidenceIndex.length, trustCenterSnapshot.evidence.length);
assert.equal(pack.evidenceIndex[0].id, trustCenterSnapshot.evidence[0].id);

const executiveStatusText = `${pack.packStatus}\n${pack.executiveSummary}`;
assert.doesNotMatch(executiveStatusText, /DB ready|RLS ready|deployment ready|production ready|compliance certified/i);

console.log('Buyer Acceptance Pack foundation tests passed.');
