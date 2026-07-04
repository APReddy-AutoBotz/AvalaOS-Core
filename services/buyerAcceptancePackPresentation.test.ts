import assert from 'node:assert/strict';

import {
  REQUIRED_BUYER_ACCEPTANCE_OPEN_GAP_IDS,
  buildBuyerAcceptancePackSnapshot,
} from './buyerAcceptancePackModel';
import {
  assertBuyerPackHasRequiredOpenGaps,
  assertBuyerPackNotApproved,
  assertBuyerPackProofSafeCopy,
  getBlockedOrEvidenceRequiredClaims,
  getBuyerAcceptanceChecklistStatusLabel,
  getBuyerAcceptancePackStatusLabel,
  getBuyerPackNonClaimMap,
  getRequiredOpenProofGaps,
  groupBuyerAcceptanceClaimsByDomain,
  summarizeBuyerPackStatus,
} from './buyerAcceptancePackPresentation';

console.log('Running Buyer Acceptance Pack presentation tests...');

const pack = buildBuyerAcceptancePackSnapshot();

assert.equal(getBuyerAcceptancePackStatusLabel('evidence_required'), 'Evidence Required - Draft Foundation');
assert.equal(getBuyerAcceptanceChecklistStatusLabel('review_required'), 'Review Required');
assert.deepEqual(groupBuyerAcceptanceClaimsByDomain(pack), groupBuyerAcceptanceClaimsByDomain(buildBuyerAcceptancePackSnapshot()));
assert.equal(summarizeBuyerPackStatus(pack), summarizeBuyerPackStatus(buildBuyerAcceptancePackSnapshot()));

assertBuyerPackNotApproved(pack);
assert.notEqual(pack.packStatus, 'approved_for_review');

assertBuyerPackHasRequiredOpenGaps(pack);
const requiredGaps = getRequiredOpenProofGaps(pack);
assert.equal(requiredGaps.length, REQUIRED_BUYER_ACCEPTANCE_OPEN_GAP_IDS.length);
for (const gap of requiredGaps) {
  assert.notEqual(gap.proofStatus, 'verified', `${gap.id} must not be verified.`);
}

const groupedClaims = groupBuyerAcceptanceClaimsByDomain(pack);
const groupedClaimCount = groupedClaims.reduce((total, group) => total + group.claims.length, 0);
assert.equal(groupedClaimCount, pack.claims.length);
assert.ok(groupedClaims.some(group => group.domain === 'evidence' && group.claims.length > 0));
assert.ok(groupedClaims.some(group => group.domain === 'tenant_isolation' && group.claims.length > 0));

const blockedOrEvidenceRequiredClaims = getBlockedOrEvidenceRequiredClaims(pack);
assert.ok(blockedOrEvidenceRequiredClaims.length > 0);
assert.ok(blockedOrEvidenceRequiredClaims.every(claim =>
  claim.proofStatus === 'blocked' || claim.proofStatus === 'evidence_required',
));

const nonClaimMap = getBuyerPackNonClaimMap(pack);
for (const nonClaimId of [
  'production-ready',
  'hosted-ready',
  'deployment-ready',
  'rls-ready-active-verified',
  'tenant-isolation-verified',
  'security-ready',
  'buyer-ready',
  'product-ready',
  'release-candidate-ready',
  'compliance-certified',
  'jira-replacement',
  'runtime-execution',
]) {
  const nonClaim = nonClaimMap.get(nonClaimId);
  assert.ok(nonClaim, `Missing non-claim ${nonClaimId}`);
  assert.ok(nonClaim.safeAlternative.length > 0, `${nonClaimId} should have a safe alternative.`);
}

const buyerReviewItem = pack.buyerReviewChecklist.find(item => item.id === 'review-blocked-evidence-required-claims');
assert.ok(buyerReviewItem);
assert.equal(buyerReviewItem.requiredBeforeBuyerSignoff, true);
assert.equal(buyerReviewItem.status, 'evidence_required');

const apApprovalItem = pack.apApprovalChecklist.find(item => item.id === 'ap-approved-evidence-for-status-change');
assert.ok(apApprovalItem);
assert.equal(apApprovalItem.requiredBeforeStatusChange, true);
assert.equal(apApprovalItem.status, 'evidence_required');

assert.doesNotThrow(() => assertBuyerPackProofSafeCopy(pack));

const presentationCopy = [
  getBuyerAcceptancePackStatusLabel(pack.packStatus),
  summarizeBuyerPackStatus(pack),
  ...groupedClaims.map(group => group.label),
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
  /Avala Govern Lite/i,
  /Avala Delivery Lite/i,
]) {
  assert.doesNotMatch(presentationCopy, pattern);
}

const packBefore = JSON.parse(JSON.stringify(pack));
groupBuyerAcceptanceClaimsByDomain(pack);
getRequiredOpenProofGaps(pack);
getBlockedOrEvidenceRequiredClaims(pack);
getBuyerPackNonClaimMap(pack);
assertBuyerPackNotApproved(pack);
assertBuyerPackHasRequiredOpenGaps(pack);
assertBuyerPackProofSafeCopy(pack);
assert.deepEqual(pack, packBefore);

console.log('Buyer Acceptance Pack presentation tests passed.');
