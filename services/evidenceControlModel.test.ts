import assert from 'node:assert/strict';

import {
  APPROVAL_CONTRACT_STATES,
  AUDIT_EVENT_CATEGORIES,
  AUDIT_PROHIBITED_FIELDS,
  AUDIT_REQUIRED_FIELDS,
  BLOCKED_READINESS_CLAIMS,
  CONTROL_SURFACE_IDS,
  PROHIBITED_EXECUTION_ACTIONS,
  assertEvidenceControlSnapshotIsExecutionNeutral,
  assertNoDeprecatedBuyerFacingLiteNames,
  assertProofBoundaryCopyIsClaimSafe,
  buildEvidenceControlSnapshot,
  getControlSurfaceContract,
} from './evidenceControlModel';

console.log('Running M5.5b evidence control model tests...');

const snapshot = buildEvidenceControlSnapshot();
const secondSnapshot = buildEvidenceControlSnapshot();

assert.deepEqual(snapshot, secondSnapshot, 'Evidence control snapshot should be deterministic.');
assert.equal(snapshot.milestone, 'M5.5b Evidence Surface, Approval Model, and Audit Contract Hardening');
assert.equal(snapshot.executionApprovalGranted, false, 'Current execution approval must remain ungranted.');
assert.deepEqual(snapshot.approvalStates, APPROVAL_CONTRACT_STATES);
assert.deepEqual(snapshot.auditEventCategories, AUDIT_EVENT_CATEGORIES);
assert.deepEqual(snapshot.surfaces.map(surface => surface.id), CONTROL_SURFACE_IDS);

for (const state of ['planned', 'required', 'blocked', 'deferred', 'approved', 'rejected', 'executed', 'evidence_required'] as const) {
  assert.ok(snapshot.approvalStates.includes(state), `Approval-state vocabulary should include ${state}.`);
}

assert.ok(snapshot.surfaces.some(surface => surface.approvalState === 'planned'));
assert.ok(snapshot.surfaces.some(surface => surface.approvalState === 'required'));
assert.ok(snapshot.surfaces.some(surface => surface.approvalState === 'blocked'));
assert.ok(snapshot.surfaces.some(surface => surface.approvalState === 'deferred'));
assert.ok(snapshot.surfaces.some(surface => surface.approvalState === 'evidence_required'));
assert.equal(snapshot.surfaces.some(surface => surface.approvalState === 'approved'), false);
assert.equal(snapshot.surfaces.some(surface => surface.approvalState === 'executed'), false);

assertEvidenceControlSnapshotIsExecutionNeutral(snapshot);

const allCopy = snapshot.surfaces
  .flatMap(surface => [
    surface.label,
    surface.objective,
    surface.proofBoundarySummary,
    ...surface.verifiedControlFacts,
    ...surface.blockedReadinessClaims,
    ...surface.requiredEvidenceBeforeReadiness,
    ...surface.allowedReadOnlyOutputs,
  ])
  .join('\n');

assert.doesNotMatch(allCopy, /Avala Govern Lite|Avala Delivery Lite/);
assert.doesNotMatch(allCopy, /\bproduction ready\b|\bhosted ready\b|\bdeployment ready\b|\boperational ready\b|\bpilot ready\b|\bsecurity ready\b|\bbuyer ready\b|\bproduct ready\b/i);
assert.doesNotMatch(allCopy, /\bbrowser walkthrough complete\b|\bscreenshot proof captured\b|\bexport ready\b|\bPDF ready\b|\bdownload ready\b|\bapproval workflow ready\b/i);
assert.doesNotMatch(allCopy, /\btenant[- ]isolation (ready|verified|proven|passed)\b|\bartifact SELECT (ready|verified|proven|passed)\b|\bschema (ready|verified|proven|available)\b|\blocal (ready|verified|proven)\b/i);

assert.throws(
  () => assertNoDeprecatedBuyerFacingLiteNames('Avala Govern Lite'),
  /Deprecated buyer-facing name/,
);
assert.throws(
  () => assertNoDeprecatedBuyerFacingLiteNames('Avala Delivery Lite'),
  /Deprecated buyer-facing name/,
);
assert.doesNotThrow(() => assertNoDeprecatedBuyerFacingLiteNames('Avala Govern and Avala Delivery'));

assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The browser walkthrough complete signal is visible.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The export ready package is available.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The approval workflow ready state can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The tenant isolation verified state can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The artifact SELECT verified result can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The schema available marker can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The local startup success achieved signal can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The operational ready state can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The pilot readiness accepted signal can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The environment-verified marker can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The readiness check passed marker can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The rollback-ready state can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.throws(
  () => assertProofBoundaryCopyIsClaimSafe('The backup ready state can be shown.'),
  /Unsupported readiness or proof claim/,
);
assert.doesNotThrow(() =>
  assertProofBoundaryCopyIsClaimSafe('Browser execution remains blocked until a later AP-approved gate.'),
);

for (const claim of BLOCKED_READINESS_CLAIMS) {
  assert.ok(snapshot.blockedReadinessClaims.includes(claim), `Snapshot should include blocked claim: ${claim}`);
}

for (const action of PROHIBITED_EXECUTION_ACTIONS) {
  for (const surface of snapshot.surfaces) {
    assert.ok(surface.prohibitedActions.includes(action), `${surface.id} should prohibit ${action}.`);
  }
}

for (const contract of snapshot.auditContracts) {
  for (const field of AUDIT_REQUIRED_FIELDS) {
    assert.ok(contract.requiredFields.includes(field), `${contract.category} should require ${field}.`);
  }
  for (const field of AUDIT_PROHIBITED_FIELDS) {
    assert.ok(contract.prohibitedFields.includes(field), `${contract.category} should prohibit ${field}.`);
  }
  assert.ok(contract.redactionRules.length >= 3, `${contract.category} should define redaction rules.`);
}

const mutableSnapshot = buildEvidenceControlSnapshot();
(mutableSnapshot.surfaces as typeof mutableSnapshot.surfaces & unknown[]).push({
  ...mutableSnapshot.surfaces[0],
  id: 'trust_center',
  label: 'Mutated Trust Center',
});
(mutableSnapshot.surfaces[0].blockedReadinessClaims as typeof mutableSnapshot.surfaces[0]['blockedReadinessClaims'] & string[]).push('mutated claim');

const cleanSnapshot = buildEvidenceControlSnapshot();
assert.equal(cleanSnapshot.surfaces.length, CONTROL_SURFACE_IDS.length, 'Source surface contracts must not be mutated by caller changes.');
assert.equal(cleanSnapshot.surfaces[0].label, 'Trust Center');
assert.equal(cleanSnapshot.surfaces[0].blockedReadinessClaims.includes('mutated claim'), false);

const browserContract = getControlSurfaceContract('buyer_acceptance_browser_walkthrough', snapshot);
assert.equal(browserContract.approvalState, 'blocked');
assert.match(browserContract.proofBoundarySummary, /unexecuted/i);
assert.match(browserContract.proofBoundarySummary, /no browser was launched/i);
assert.ok(browserContract.requiredEvidenceBeforeReadiness.some(item => /AP-approved run count/i.test(item)));

const mutableBrowserContract = getControlSurfaceContract('buyer_acceptance_browser_walkthrough');
(mutableBrowserContract.blockedReadinessClaims as typeof mutableBrowserContract.blockedReadinessClaims & string[]).push('mutated browser claim');
const cleanBrowserContract = getControlSurfaceContract('buyer_acceptance_browser_walkthrough');
assert.equal(cleanBrowserContract.blockedReadinessClaims.includes('mutated browser claim'), false);

assert.throws(
  () => assertEvidenceControlSnapshotIsExecutionNeutral({
    ...snapshot,
    executionApprovalGranted: true,
  }),
  /Execution approval must remain ungranted/,
);

assert.throws(
  () => assertEvidenceControlSnapshotIsExecutionNeutral({
    ...snapshot,
    surfaces: [
      {
        ...snapshot.surfaces[0],
        approvalState: 'executed',
      },
    ],
  }),
  /cannot be approved or executed/,
);

console.log('M5.5b evidence control model tests passed.');
