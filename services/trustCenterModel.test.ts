import assert from 'node:assert/strict';

import {
  CURRENT_TRUST_CENTER_SNAPSHOT,
  INTENTIONALLY_DEFERRED_INTERNAL_LITE_IDENTIFIERS,
  PROOF_BOUNDARIES,
  PROOF_STATUSES,
  READINESS_DOMAINS,
  REQUIRED_EVIDENCE_CLAIM_IDS,
  buildCurrentTrustCenterSnapshot,
} from './trustCenterModel';

console.log('Running Trust Center proof-status foundation tests...');

assert.deepEqual(PROOF_STATUSES, [
  'demo',
  'planned',
  'configured',
  'evidence_required',
  'verified',
  'blocked',
]);

assert.deepEqual(PROOF_BOUNDARIES, [
  'docs_only',
  'synthetic_only',
  'local_unproven',
  'hosted_unproven',
  'verified_with_evidence',
  'blocked_until_ap_approval',
]);

const snapshot = buildCurrentTrustCenterSnapshot();

assert.deepEqual(snapshot.statusVocabulary, PROOF_STATUSES);
assert.deepEqual(snapshot.proofBoundaries, PROOF_BOUNDARIES);

const representedDomains = new Set(snapshot.claimControls.map((control) => control.domain));
for (const domain of READINESS_DOMAINS) {
  assert.ok(representedDomains.has(domain), `Readiness domain should be represented: ${domain}`);
}

const blockedOrEvidenceRequiredClaims = snapshot.claimControls.filter((control) =>
  REQUIRED_EVIDENCE_CLAIM_IDS.includes(control.id as typeof REQUIRED_EVIDENCE_CLAIM_IDS[number]),
);

assert.equal(blockedOrEvidenceRequiredClaims.length, REQUIRED_EVIDENCE_CLAIM_IDS.length);

for (const control of blockedOrEvidenceRequiredClaims) {
  assert.notEqual(control.proofStatus, 'verified', `${control.id} must not be verified.`);
}

const nonVerifiedClaimIds = [
  'rls-readiness',
  'tenant-isolation-proof',
  'hosted-readiness',
  'production-readiness',
  'deployment-readiness',
  'security-readiness',
  'buyer-readiness',
  'product-readiness',
  'release-candidate-readiness',
];

for (const claimId of nonVerifiedClaimIds) {
  const control = snapshot.claimControls.find((candidate) => candidate.id === claimId);
  assert.ok(control, `Missing claim control: ${claimId}`);
  assert.notEqual(control.proofStatus, 'verified', `${claimId} must not be verified.`);
}

const blockedPlatformReadinessDomains: ReadonlySet<string> = new Set([
  'security',
  'tenant_isolation',
  'export',
  'deployment',
  'operations',
  'buyer_readiness',
  'product_readiness',
  'release_candidate',
]);

for (const control of snapshot.claimControls) {
  if (blockedPlatformReadinessDomains.has(control.domain)) {
    assert.notEqual(control.proofStatus, 'verified', `${control.id} must not be verified in ${control.domain}.`);
  }
}

const assessScoringControl = snapshot.claimControls.find((control) => control.id === 'assess-deterministic-scoring');
assert.ok(assessScoringControl);
assert.equal(assessScoringControl.proofStatus, 'verified');
assert.equal(assessScoringControl.proofBoundary, 'verified_with_evidence');
assert.equal(assessScoringControl.domain, 'evidence');
assert.match(assessScoringControl.blockedWording, /not describe deterministic scoring evidence as production readiness/i);

const governState = snapshot.moduleCapabilityStates.find((state) => state.moduleKey === 'govern');
assert.ok(governState);
assert.equal(governState.moduleName, 'Avala Govern');
assert.match(governState.limitationDisclosure, /does not execute bots/i);
assert.match(governState.limitationDisclosure, /agents/i);
assert.match(governState.limitationDisclosure, /RPA jobs/i);
assert.match(governState.limitationDisclosure, /external-system actions/i);

const deliveryState = snapshot.moduleCapabilityStates.find((state) => state.moduleKey === 'delivery');
assert.ok(deliveryState);
assert.equal(deliveryState.moduleName, 'Avala Delivery');
assert.match(deliveryState.limitationDisclosure, /not a Jira replacement/i);

const studioState = snapshot.moduleCapabilityStates.find((state) => state.moduleKey === 'studio');
assert.ok(studioState);
assert.match(studioState.buyerSafeDescription, /editable review drafts/i);
assert.match(studioState.limitationDisclosure, /editable review drafts requiring human sign-off/i);

const unsupportedCertificationWording = /\b(SOC 2|ISO 27001|HIPAA|GDPR compliant|compliance certified|certification achieved)\b/i;
for (const control of snapshot.claimControls) {
  assert.doesNotMatch(control.claimText, unsupportedCertificationWording, `${control.id} has unsupported certification claim text.`);
}

assert.deepEqual(buildCurrentTrustCenterSnapshot(), buildCurrentTrustCenterSnapshot());
assert.deepEqual(CURRENT_TRUST_CENTER_SNAPSHOT, buildCurrentTrustCenterSnapshot());

const buyerFacingModuleText = snapshot.moduleCapabilityStates
  .flatMap((state) => [state.moduleName, state.buyerSafeDescription, state.limitationDisclosure])
  .join('\n');

assert.match(buyerFacingModuleText, /Avala Govern/);
assert.match(buyerFacingModuleText, /Avala Delivery/);
assert.doesNotMatch(buyerFacingModuleText, /Avala Govern Lite/);
assert.doesNotMatch(buyerFacingModuleText, /Avala Delivery Lite/);

assert.deepEqual(INTENTIONALLY_DEFERRED_INTERNAL_LITE_IDENTIFIERS, [
  'AvalaGovernLiteCard',
  'AvalaGovernLiteCardPanel',
  'avalaGovernLiteService',
  'buildAvalaGovernLiteCard',
  'governLite',
  'avalaGovernLite',
]);

console.log('Trust Center proof-status foundation tests passed.');