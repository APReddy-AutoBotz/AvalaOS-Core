import assert from 'node:assert/strict';

import {
  EXPORT_ALLOWED_METADATA_FIELDS,
  EXPORT_ARTIFACT_TYPES,
  EXPORT_BLOCKED_READINESS_CLAIMS,
  EXPORT_PROHIBITED_METADATA_FIELDS,
  EXPORT_PROHIBITED_OUTPUTS,
  STORAGE_ACCESS_POLICY_IDS,
  assertExportArtifactCopyIsClaimSafe,
  assertExportArtifactSnapshotIsModelOnly,
  buildExportArtifactControlSnapshot,
  getExportArtifactBoundaryContract,
  getStorageAccessPolicyContract,
} from './exportArtifactControlModel';

console.log('Running M5.5c export artifact control model tests...');

const snapshot = buildExportArtifactControlSnapshot();
const secondSnapshot = buildExportArtifactControlSnapshot();

assert.deepEqual(snapshot, secondSnapshot, 'Export artifact control snapshot should be deterministic.');
assert.equal(snapshot.milestone, 'M5.5c Secure Export and Artifact Storage Design/Implementation Gate');
assert.equal(snapshot.modelOnly, true);
assert.equal(snapshot.generatedArtifactsAllowed, false, 'Generated artifacts must not be allowed.');
assert.equal(snapshot.liveStorageExecutionAllowed, false, 'Live storage execution must not be allowed.');
assert.equal(snapshot.liveSignedUrlGenerationAllowed, false, 'Live signed URL generation must not be allowed.');
assert.deepEqual(snapshot.artifactTypes, EXPORT_ARTIFACT_TYPES);
assert.deepEqual(snapshot.allowedMetadataFields, EXPORT_ALLOWED_METADATA_FIELDS);
assert.deepEqual(snapshot.prohibitedMetadataFields, EXPORT_PROHIBITED_METADATA_FIELDS);
assert.deepEqual(snapshot.prohibitedOutputs, EXPORT_PROHIBITED_OUTPUTS);
assert.equal(snapshot.exportBoundaryContracts.length, EXPORT_ARTIFACT_TYPES.length);
assert.equal(snapshot.storageAccessPolicies.length, STORAGE_ACCESS_POLICY_IDS.length);

assertExportArtifactSnapshotIsModelOnly(snapshot);

assert.ok(snapshot.artifactStatuses.includes('generated'), 'Status vocabulary may describe future generated state.');
assert.equal(
  snapshot.exportBoundaryContracts.some(contract => contract.artifactStatus === 'generated'),
  false,
  'No current contract may use generated state.',
);
assert.ok(snapshot.exportBoundaryContracts.some(contract => contract.artifactStatus === 'blocked'));
assert.ok(snapshot.exportBoundaryContracts.some(contract => contract.artifactStatus === 'evidence_required'));
assert.ok(snapshot.exportBoundaryContracts.every(contract => contract.modelOnly));
assert.ok(snapshot.exportBoundaryContracts.every(contract => contract.artifactGenerated === false));
assert.ok(snapshot.exportBoundaryContracts.every(contract => contract.apApprovalRequiredBeforeExecution));
assert.ok(snapshot.storageAccessPolicies.every(policy => policy.modelOnly));
assert.ok(snapshot.storageAccessPolicies.every(policy => policy.liveStorageAccessAllowed === false));
assert.ok(snapshot.storageAccessPolicies.every(policy => policy.liveSignedUrlGenerationAllowed === false));
assert.ok(snapshot.storageAccessPolicies.every(policy => policy.privateStorageRequired));

for (const claim of EXPORT_BLOCKED_READINESS_CLAIMS) {
  assert.ok(snapshot.blockedReadinessClaims.includes(claim), `Snapshot should include blocked claim: ${claim}`);
}

for (const field of ['signed_url', 'storage_object_path', 'export_payload', 'pdf_payload', 'download_payload', 'binary_content'] as const) {
  assert.ok(snapshot.prohibitedMetadataFields.includes(field), `Snapshot should prohibit metadata field ${field}.`);
}

for (const output of ['export_file', 'pdf_file', 'download_file', 'storage_object', 'live_signed_url', 'readiness_evidence'] as const) {
  assert.ok(snapshot.prohibitedOutputs.includes(output), `Snapshot should prohibit output ${output}.`);
}

for (const contract of snapshot.exportBoundaryContracts) {
  for (const field of EXPORT_ALLOWED_METADATA_FIELDS) {
    assert.ok(contract.allowedMetadataFields.includes(field), `${contract.id} should allow metadata field ${field}.`);
  }
  for (const field of EXPORT_PROHIBITED_METADATA_FIELDS) {
    assert.ok(contract.prohibitedMetadataFields.includes(field), `${contract.id} should prohibit metadata field ${field}.`);
  }
  for (const output of EXPORT_PROHIBITED_OUTPUTS) {
    assert.ok(contract.prohibitedOutputs.includes(output), `${contract.id} should prohibit output ${output}.`);
  }
  assert.ok(contract.limitationDisclosure.includes('Model/design contract only'));
  assert.ok(contract.limitationDisclosure.includes('no export, PDF, download, storage object, signed URL'));
}

for (const policy of snapshot.storageAccessPolicies) {
  for (const field of EXPORT_PROHIBITED_METADATA_FIELDS) {
    assert.ok(policy.prohibitedMetadataFields.includes(field), `${policy.id} should prohibit metadata field ${field}.`);
  }
  assert.ok(policy.signedReferenceRequirements.some(requirement => /No live signed URL/i.test(requirement)));
}

assert.throws(
  () => assertExportArtifactCopyIsClaimSafe('The storage ready artifact surface is visible.'),
  /Unsupported export, artifact storage, readiness, or proof claim/,
);
assert.throws(
  () => assertExportArtifactCopyIsClaimSafe('The artifact storage ready state is visible.'),
  /Unsupported export, artifact storage, readiness, or proof claim/,
);
assert.throws(
  () => assertExportArtifactCopyIsClaimSafe('Export/PDF/download readiness complete.'),
  /Unsupported export, artifact storage, readiness, or proof claim/,
);
assert.throws(
  () => assertExportArtifactCopyIsClaimSafe('The signed URL available control is visible.'),
  /Unsupported export, artifact storage, readiness, or proof claim/,
);
assert.throws(
  () => assertExportArtifactCopyIsClaimSafe('Avala Govern Lite export surface'),
  /Deprecated buyer-facing name/,
);
assert.doesNotThrow(() =>
  assertExportArtifactCopyIsClaimSafe('Export, PDF, download, and storage actions remain blocked until a later AP-approved gate.'),
);

const decisionPackContract = getExportArtifactBoundaryContract('decision_pack_export', snapshot);
assert.equal(decisionPackContract.artifactStatus, 'blocked');
assert.equal(decisionPackContract.artifactGenerated, false);
assert.ok(decisionPackContract.sourceEvidenceReferences.some(reference => /PR #178/.test(reference)));

const storagePolicy = getStorageAccessPolicyContract('signed_reference_controls', snapshot);
assert.equal(storagePolicy.liveSignedUrlGenerationAllowed, false);
assert.ok(storagePolicy.accessRoles.includes('security reviewer'));

const mutableSnapshot = buildExportArtifactControlSnapshot();
(mutableSnapshot.exportBoundaryContracts as typeof mutableSnapshot.exportBoundaryContracts & unknown[]).push({
  ...mutableSnapshot.exportBoundaryContracts[0],
  label: 'Mutated Contract',
});
(mutableSnapshot.exportBoundaryContracts[0].prohibitedMetadataFields as typeof mutableSnapshot.exportBoundaryContracts[0]['prohibitedMetadataFields'] & string[]).push('mutated_field');
(mutableSnapshot.storageAccessPolicies[0].accessRoles as typeof mutableSnapshot.storageAccessPolicies[0]['accessRoles'] & string[]).push('mutated role');

const cleanSnapshot = buildExportArtifactControlSnapshot();
assert.equal(cleanSnapshot.exportBoundaryContracts.length, EXPORT_ARTIFACT_TYPES.length);
assert.equal(cleanSnapshot.exportBoundaryContracts[0].label, 'Decision Pack Export Contract');
assert.equal((cleanSnapshot.exportBoundaryContracts[0].prohibitedMetadataFields as readonly string[]).includes('mutated_field'), false);
assert.equal(cleanSnapshot.storageAccessPolicies[0].accessRoles.includes('mutated role'), false);

assert.throws(
  () => assertExportArtifactSnapshotIsModelOnly({
    ...snapshot,
    generatedArtifactsAllowed: true,
  }),
  /Generated artifacts must remain disallowed/,
);
assert.throws(
  () => assertExportArtifactSnapshotIsModelOnly({
    ...snapshot,
    liveStorageExecutionAllowed: true,
  }),
  /Live storage execution must remain disallowed/,
);
assert.throws(
  () => assertExportArtifactSnapshotIsModelOnly({
    ...snapshot,
    liveSignedUrlGenerationAllowed: true,
  }),
  /Live signed URL generation must remain disallowed/,
);
assert.throws(
  () => assertExportArtifactSnapshotIsModelOnly({
    ...snapshot,
    exportBoundaryContracts: [
      {
        ...snapshot.exportBoundaryContracts[0],
        artifactStatus: 'generated',
      },
    ],
  }),
  /cannot use generated status/,
);
assert.throws(
  () => assertExportArtifactSnapshotIsModelOnly({
    ...snapshot,
    storageAccessPolicies: [
      {
        ...snapshot.storageAccessPolicies[0],
        liveStorageAccessAllowed: true,
      },
    ],
  }),
  /cannot allow live storage access/,
);

console.log('M5.5c export artifact control model tests passed.');
