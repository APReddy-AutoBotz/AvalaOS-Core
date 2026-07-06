import assert from 'node:assert/strict';

import {
  AUTHORITY_SURFACE_IDS,
  RLS_ASSERTION_CATEGORY_IDS,
  RLS_PREPARATION_PROOF_STATUSES,
  RLS_PROHIBITED_OUTPUT_FIELDS,
  RLS_STOP_CONDITIONS,
  assertRlsTenantIsolationCopyIsClaimSafe,
  assertRlsTenantIsolationPreparationSnapshotIsExecutionNeutral,
  buildRlsTenantIsolationPreparationSnapshot,
  getAuthoritySurfacePreparationContract,
  getRlsAssertionMatrixContract,
} from './rlsTenantIsolationPreparationModel';

console.log('Running M5.6a RLS tenant-isolation preparation model tests...');

const snapshot = buildRlsTenantIsolationPreparationSnapshot();
const secondSnapshot = buildRlsTenantIsolationPreparationSnapshot();

assert.deepEqual(snapshot, secondSnapshot, 'RLS preparation snapshot should be deterministic.');
assert.equal(snapshot.milestone, 'M5.6a RLS/Tenant-Isolation Implementation Preparation Gate');
assert.equal(snapshot.modelOnly, true, 'M5.6a snapshot must remain model-only.');
assert.equal(snapshot.apApprovalGranted, false, 'AP approval must remain ungranted.');
assert.equal(snapshot.dbExecutionApproved, false, 'DB execution must remain unapproved.');
assert.equal(snapshot.dbExecutionPerformed, false, 'DB execution must remain unperformed.');
assert.equal(snapshot.schemaInspectionPerformed, false, 'Schema inspection must remain unperformed.');
assert.equal(snapshot.migrationExecutionPerformed, false, 'Migration execution must remain unperformed.');
assert.equal(snapshot.rlsExecutionPerformed, false, 'RLS execution must remain unperformed.');
assert.equal(snapshot.artifactSelectExecutionPerformed, false, 'Artifact SELECT execution must remain unperformed.');
assert.equal(snapshot.tenantIsolationVerified, false, 'Tenant isolation must remain unverified.');
assert.equal(snapshot.readinessEvidenceProduced, false, 'Readiness evidence must remain unproduced.');
assert.deepEqual(snapshot.proofStatuses, RLS_PREPARATION_PROOF_STATUSES);
assert.deepEqual(snapshot.authoritySurfaces.map(surface => surface.id), AUTHORITY_SURFACE_IDS);
assert.deepEqual(snapshot.assertionMatrix.map(assertion => assertion.id), RLS_ASSERTION_CATEGORY_IDS);

assertRlsTenantIsolationPreparationSnapshotIsExecutionNeutral(snapshot);

for (const surface of snapshot.authoritySurfaces) {
  assert.ok(
    surface.currentProofStatus === 'unproven' || surface.currentProofStatus === 'evidence_required',
    `${surface.id} should remain unproven or evidence-required.`,
  );
  assert.equal(surface.schemaInspectionPerformed, false, `${surface.id} cannot represent schema inspection.`);
  assert.equal(surface.rlsExecutionPerformed, false, `${surface.id} cannot represent RLS execution.`);
  assert.equal(surface.tenantIsolationVerified, false, `${surface.id} cannot represent tenant-isolation verification.`);
  assert.equal(surface.artifactSelectVerified, false, `${surface.id} cannot represent artifact SELECT verification.`);
  assert.equal(surface.apApprovalRequiredBeforeExecution, true, `${surface.id} should require AP approval before execution.`);
  for (const field of RLS_PROHIBITED_OUTPUT_FIELDS) {
    assert.ok(surface.prohibitedOutputFields.includes(field), `${surface.id} should prohibit ${field}.`);
  }
  for (const condition of RLS_STOP_CONDITIONS) {
    assert.ok(surface.stopConditions.includes(condition), `${surface.id} should carry stop condition: ${condition}`);
  }
}

for (const assertionContract of snapshot.assertionMatrix) {
  assert.ok(
    assertionContract.proofStatus === 'unproven' || assertionContract.proofStatus === 'evidence_required',
    `${assertionContract.id} should remain unproven or evidence-required.`,
  );
  assert.equal(assertionContract.assertionExecuted, false, `${assertionContract.id} cannot represent assertion execution.`);
  assert.equal(assertionContract.assertionPassed, false, `${assertionContract.id} cannot represent assertion pass.`);
  assert.equal(assertionContract.assertionVerified, false, `${assertionContract.id} cannot represent assertion verification.`);
  assert.equal(assertionContract.apApprovalRequiredBeforeExecution, true, `${assertionContract.id} should require AP approval before execution.`);
  for (const field of RLS_PROHIBITED_OUTPUT_FIELDS) {
    assert.ok(assertionContract.prohibitedOutputFields.includes(field), `${assertionContract.id} should prohibit ${field}.`);
  }
  for (const condition of RLS_STOP_CONDITIONS) {
    assert.ok(assertionContract.stopConditions.includes(condition), `${assertionContract.id} should carry stop condition: ${condition}`);
  }
}

for (const field of [
  'raw_rows',
  'row_payload',
  'database_url',
  'host',
  'port',
  'ip_address',
  'auth_header',
  'claim_value',
  'provider_key',
  'service_role_token',
  'private_token',
  'project_ref',
  'target_value',
  'raw_log',
  'stdout',
  'stderr',
  'stack_trace',
  'schema_dump',
  'local_path',
  'container_id',
  'image_id',
  'machine_specific_value',
  'artifact_select_payload',
] as const) {
  assert.ok(snapshot.prohibitedOutputFields.includes(field), `Snapshot should prohibit output field ${field}.`);
}

for (const unsafeCopy of [
  'RLS ready',
  'RLS verified',
  'tenant isolation verified',
  'tenant-isolation proven',
  'artifact SELECT verified',
  'artifact SELECT ready',
  'schema ready',
  'schema available',
  'local ready',
  'local startup success achieved',
  'hosted ready',
  'production ready',
  'deployment ready',
  'security ready',
  'compliance certified',
  'assertions executed',
  'Avala Govern Lite',
  'Avala Delivery Lite',
]) {
  assert.throws(
    () => assertRlsTenantIsolationCopyIsClaimSafe(unsafeCopy),
    /Unsupported RLS|Deprecated buyer-facing name/,
    `${unsafeCopy} should be rejected.`,
  );
}

assert.doesNotThrow(() =>
  assertRlsTenantIsolationCopyIsClaimSafe('RLS execution remains blocked until a later AP-approved gate.'),
);
assert.doesNotThrow(() =>
  assertRlsTenantIsolationCopyIsClaimSafe('Tenant-isolation preparation remains evidence-required and model-only.'),
);

const mutableSnapshot = buildRlsTenantIsolationPreparationSnapshot();
(mutableSnapshot.authoritySurfaces as typeof mutableSnapshot.authoritySurfaces & unknown[]).push({
  ...mutableSnapshot.authoritySurfaces[0],
  id: 'identity_membership_authority',
  label: 'Mutated Authority Surface',
});
(mutableSnapshot.authoritySurfaces[0].prohibitedOutputFields as typeof mutableSnapshot.authoritySurfaces[0]['prohibitedOutputFields'] & string[]).push('mutated_field');
(mutableSnapshot.assertionMatrix[0].plannedAssertionScope as typeof mutableSnapshot.assertionMatrix[0]['plannedAssertionScope'] & string[]).push('mutated assertion');

const cleanSnapshot = buildRlsTenantIsolationPreparationSnapshot();
assert.equal(cleanSnapshot.authoritySurfaces.length, AUTHORITY_SURFACE_IDS.length, 'Authority surface definitions must not be mutated by callers.');
assert.equal(cleanSnapshot.authoritySurfaces[0].label, 'Identity And Membership Authority');
assert.equal(cleanSnapshot.authoritySurfaces[0].prohibitedOutputFields.includes('mutated_field' as never), false);
assert.equal(cleanSnapshot.assertionMatrix[0].plannedAssertionScope.includes('mutated assertion'), false);

const identitySurface = getAuthoritySurfacePreparationContract('identity_membership_authority', snapshot);
assert.equal(identitySurface.apApprovalRequiredBeforeExecution, true);
assert.equal(identitySurface.schemaInspectionPerformed, false);
assert.match(identitySurface.objective, /without reading auth claims, rows, or live schema/i);

(identitySurface.stopConditions as typeof identitySurface.stopConditions & string[]).push('mutated stop condition');
const cleanIdentitySurface = getAuthoritySurfacePreparationContract('identity_membership_authority', snapshot);
assert.equal(cleanIdentitySurface.stopConditions.includes('mutated stop condition'), false);

const artifactAssertion = getRlsAssertionMatrixContract('artifact_select_isolation_boundary', snapshot);
assert.equal(artifactAssertion.assertionExecuted, false);
assert.equal(artifactAssertion.assertionPassed, false);
assert.equal(artifactAssertion.assertionVerified, false);
assert.ok(artifactAssertion.plannedAssertionScope.some(scope => /raw artifact payload exclusion/i.test(scope)));

(artifactAssertion.prohibitedOutputFields as typeof artifactAssertion.prohibitedOutputFields & string[]).push('mutated_artifact_field');
const cleanArtifactAssertion = getRlsAssertionMatrixContract('artifact_select_isolation_boundary', snapshot);
assert.equal(cleanArtifactAssertion.prohibitedOutputFields.includes('mutated_artifact_field' as never), false);

assert.throws(
  () => assertRlsTenantIsolationPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    apApprovalGranted: true,
  }),
  /AP approval must remain ungranted/,
);
assert.throws(
  () => assertRlsTenantIsolationPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    dbExecutionPerformed: true,
  }),
  /DB execution must remain unapproved and unperformed/,
);
assert.throws(
  () => assertRlsTenantIsolationPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    schemaInspectionPerformed: true,
  }),
  /Schema inspection must remain unperformed/,
);
assert.throws(
  () => assertRlsTenantIsolationPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    assertionMatrix: [
      {
        ...snapshot.assertionMatrix[0],
        assertionExecuted: true,
      },
    ],
  }),
  /Assertion cannot be executed, passed, or verified/,
);
assert.throws(
  () => assertRlsTenantIsolationPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    assertionMatrix: [
      {
        ...snapshot.assertionMatrix[0],
        proofStatus: 'planned',
      },
    ],
  }),
  /Assertion cannot imply completed proof/,
);

console.log('M5.6a RLS tenant-isolation preparation model tests passed.');
