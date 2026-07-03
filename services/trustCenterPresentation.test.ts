import assert from 'node:assert/strict';

import { buildCurrentTrustCenterSnapshot } from './trustCenterModel';
import {
  assertNoVerifiedPlatformReadinessClaims,
  getEvidenceRequiredOrBlockedClaims,
  getProofBoundaryLabel,
  getProofStatusLabel,
  getReadinessDomainLabel,
  getVerifiedClaims,
  groupClaimControlsByDomain,
  summarizeProofStatuses,
} from './trustCenterPresentation';

console.log('Running Trust Center presentation tests...');

const snapshot = buildCurrentTrustCenterSnapshot();
const snapshotBeforePresentation = JSON.stringify(snapshot);

assert.deepEqual(
  summarizeProofStatuses(snapshot).map(summary => [summary.status, summary.label, summary.count]),
  [
    ['demo', 'Demo', 2],
    ['planned', 'Planned', 1],
    ['configured', 'Configured', 14],
    ['evidence_required', 'Evidence Required', 14],
    ['verified', 'Verified', 3],
    ['blocked', 'Blocked', 3],
  ],
);

const groups = groupClaimControlsByDomain(snapshot);
assert.deepEqual(groups.map(group => [group.domain, group.label]), [
  ['security', 'Security'],
  ['tenant_isolation', 'Tenant Isolation'],
  ['ai_controls', 'AI Controls'],
  ['evidence', 'Evidence'],
  ['export', 'Export'],
  ['deployment', 'Deployment'],
  ['operations', 'Operations'],
  ['buyer_readiness', 'Buyer Readiness'],
  ['product_readiness', 'Product Readiness'],
  ['release_candidate', 'Release Candidate'],
]);

assert.ok(groups.every(group => group.controls.every(control => control.domain === group.domain)));

assertNoVerifiedPlatformReadinessClaims(snapshot);

const assessScoringControl = getVerifiedClaims(snapshot).find(control => control.id === 'assess-deterministic-scoring');
assert.ok(assessScoringControl);
assert.equal(assessScoringControl.domain, 'evidence');
assert.equal(assessScoringControl.proofStatus, 'verified');
assert.equal(assessScoringControl.proofBoundary, 'verified_with_evidence');

const governState = snapshot.moduleCapabilityStates.find(state => state.moduleKey === 'govern');
assert.ok(governState);
assert.equal(governState.moduleName, 'Avala Govern');
assert.match(governState.limitationDisclosure, /does not execute bots/i);
assert.match(governState.limitationDisclosure, /agents/i);
assert.match(governState.limitationDisclosure, /RPA jobs/i);
assert.match(governState.limitationDisclosure, /external-system actions/i);
assert.match(governState.limitationDisclosure, /MCP controls/i);
assert.match(governState.limitationDisclosure, /A2A controls/i);
assert.match(governState.limitationDisclosure, /live runtime enforcement/i);

const deliveryState = snapshot.moduleCapabilityStates.find(state => state.moduleKey === 'delivery');
assert.ok(deliveryState);
assert.equal(deliveryState.moduleName, 'Avala Delivery');
assert.match(deliveryState.limitationDisclosure, /not a Jira replacement/i);
assert.match(deliveryState.limitationDisclosure, /does not prove hosted Delivery runtime readiness/i);

const buyerAcceptancePack = snapshot.buyerAcceptanceArtifacts.find(artifact => artifact.id === 'buyer-acceptance-pack');
assert.ok(buyerAcceptancePack);
assert.equal(buyerAcceptancePack.proofStatus, 'evidence_required');

const presentationStrings = [
  getProofStatusLabel('verified'),
  getProofBoundaryLabel('verified_with_evidence'),
  getReadinessDomainLabel('product_readiness'),
  ...groups.map(group => group.label),
  ...snapshot.moduleCapabilityStates.flatMap(state => [
    state.moduleName,
    state.buyerSafeDescription,
    state.limitationDisclosure,
  ]),
  ...snapshot.claimControls.flatMap(control => [
    control.label,
    control.claimText,
    control.blockedWording,
  ]),
].join('\n');

assert.doesNotMatch(presentationStrings, /Avala Govern Lite/);
assert.doesNotMatch(presentationStrings, /Avala Delivery Lite/);

assert.equal(getEvidenceRequiredOrBlockedClaims(snapshot).length, 16);
assert.equal(JSON.stringify(snapshot), snapshotBeforePresentation, 'Presentation helpers must not mutate the Trust Center snapshot.');

console.log('Trust Center presentation tests passed.');
