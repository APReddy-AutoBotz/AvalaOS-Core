import assert from 'node:assert/strict';

import {
  HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS,
  HOSTED_DEPLOYMENT_PREPARATION_PROOF_STATUSES,
  HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS,
  HOSTED_DEPLOYMENT_STOP_CONDITIONS,
  HOSTED_ENVIRONMENT_CLASS_IDS,
  M5_6B_HOSTED_DEPLOYMENT_OPERATIONS_ACCEPTED_BASELINE,
  OPERATIONAL_GATE_CATEGORY_IDS,
  assertHostedDeploymentOperationsCopyIsClaimSafe,
  assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral,
  buildHostedDeploymentOperationsPreparationSnapshot,
  getHostedEnvironmentClassContract,
  getOperationalGateMatrixContract,
} from './hostedDeploymentOperationsPreparationModel';

console.log('Running M5.6b hosted/deployment/operations preparation model tests...');

const snapshot = buildHostedDeploymentOperationsPreparationSnapshot();
const secondSnapshot = buildHostedDeploymentOperationsPreparationSnapshot();

assert.deepEqual(snapshot, secondSnapshot, 'Hosted/deployment/operations snapshot should be deterministic.');
assert.equal(snapshot.milestone, 'M5.6b Hosted/Deployment/Operations Preparation Gate');
assert.match(M5_6B_HOSTED_DEPLOYMENT_OPERATIONS_ACCEPTED_BASELINE, /PR #180/);
assert.match(M5_6B_HOSTED_DEPLOYMENT_OPERATIONS_ACCEPTED_BASELINE, /f25dff9542afcd32bf3afad6b0c745215df9808d/);
assert.equal(snapshot.modelOnly, true, 'M5.6b snapshot must remain model-only.');
assert.equal(snapshot.apApprovalGranted, false, 'AP approval must remain ungranted.');
assert.equal(snapshot.hostedExecutionApproved, false, 'Hosted/deployment execution must remain unapproved.');
assert.equal(snapshot.hostedValidationPerformed, false, 'Hosted validation must remain unperformed.');
assert.equal(snapshot.deploymentValidationPerformed, false, 'Deployment validation must remain unperformed.');
assert.equal(snapshot.startupCheckPerformed, false, 'Startup checks must remain unperformed.');
assert.equal(snapshot.readinessCheckPerformed, false, 'Readiness checks must remain unperformed.');
assert.equal(snapshot.supabaseStackExecutionPerformed, false, 'Supabase stack execution must remain unperformed.');
assert.equal(snapshot.dockerExecutionPerformed, false, 'Docker execution must remain unperformed.');
assert.equal(snapshot.dbRlsArtifactExecutionPerformed, false, 'DB/RLS/artifact execution must remain unperformed.');
assert.equal(snapshot.schemaInspectionPerformed, false, 'Schema inspection must remain unperformed.');
assert.equal(snapshot.providerClassifierExecutionPerformed, false, 'Provider/classifier execution must remain unperformed.');
assert.equal(snapshot.realAssertionExecutionPerformed, false, 'Real assertion execution must remain unperformed.');
assert.equal(snapshot.rollbackExecutionPerformed, false, 'Rollback execution must remain unperformed.');
assert.equal(snapshot.incidentExecutionPerformed, false, 'Incident execution must remain unperformed.');
assert.equal(snapshot.backupRestoreExecutionPerformed, false, 'Backup/restore execution must remain unperformed.');
assert.equal(snapshot.pilotEvidenceProduced, false, 'Pilot evidence must remain unproduced.');
assert.equal(snapshot.readinessEvidenceProduced, false, 'Readiness evidence must remain unproduced.');
assert.deepEqual(snapshot.proofStatuses, HOSTED_DEPLOYMENT_PREPARATION_PROOF_STATUSES);
assert.deepEqual(snapshot.environmentClasses.map(environmentClass => environmentClass.id), HOSTED_ENVIRONMENT_CLASS_IDS);
assert.deepEqual(snapshot.operationalGateMatrix.map(gate => gate.id), OPERATIONAL_GATE_CATEGORY_IDS);

assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral(snapshot);

for (const environmentClass of snapshot.environmentClasses) {
  assert.ok(
    environmentClass.currentProofStatus === 'unproven' ||
      environmentClass.currentProofStatus === 'evidence_required',
    `${environmentClass.id} should remain unproven or evidence-required.`,
  );
  assert.equal(environmentClass.environmentProbed, false, `${environmentClass.id} cannot represent environment probing.`);
  assert.equal(environmentClass.hostedValidationPerformed, false, `${environmentClass.id} cannot represent hosted validation.`);
  assert.equal(environmentClass.deploymentValidationPerformed, false, `${environmentClass.id} cannot represent deployment validation.`);
  assert.equal(environmentClass.startupCheckPerformed, false, `${environmentClass.id} cannot represent startup checks.`);
  assert.equal(environmentClass.readinessCheckPerformed, false, `${environmentClass.id} cannot represent readiness checks.`);
  assert.equal(environmentClass.pilotEvidenceProduced, false, `${environmentClass.id} cannot represent pilot evidence.`);
  assert.equal(environmentClass.apApprovalRequiredBeforeExecution, true, `${environmentClass.id} should require AP approval before execution.`);
  for (const field of HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS) {
    assert.ok(environmentClass.prohibitedOutputFields.includes(field), `${environmentClass.id} should prohibit ${field}.`);
  }
  for (const condition of HOSTED_DEPLOYMENT_STOP_CONDITIONS) {
    assert.ok(environmentClass.stopConditions.includes(condition), `${environmentClass.id} should carry stop condition: ${condition}`);
  }
}

for (const gate of snapshot.operationalGateMatrix) {
  assert.ok(
    gate.currentProofStatus === 'unproven' || gate.currentProofStatus === 'evidence_required',
    `${gate.id} should remain unproven or evidence-required.`,
  );
  assert.equal(gate.gateExecutionPerformed, false, `${gate.id} cannot represent gate execution.`);
  assert.equal(gate.gatePassed, false, `${gate.id} cannot represent gate pass.`);
  assert.equal(gate.gateVerified, false, `${gate.id} cannot represent gate verification.`);
  assert.equal(gate.apApprovalRequiredBeforeExecution, true, `${gate.id} should require AP approval before execution.`);
  for (const field of HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS) {
    assert.ok(gate.prohibitedOutputFields.includes(field), `${gate.id} should prohibit ${field}.`);
  }
  for (const condition of HOSTED_DEPLOYMENT_STOP_CONDITIONS) {
    assert.ok(gate.stopConditions.includes(condition), `${gate.id} should carry stop condition: ${condition}`);
  }
}

for (const field of [
  'raw_log',
  'stdout',
  'stderr',
  'stack_trace',
  'local_path',
  'host',
  'port',
  'ip_address',
  'database_url',
  'auth_header',
  'claim_value',
  'provider_key',
  'service_role_token',
  'private_token',
  'project_ref',
  'target_value',
  'environment_value',
  'deployment_url',
  'storage_object_reference',
  'signed_url',
  'container_id',
  'image_id',
  'machine_specific_value',
  'raw_run_output',
] as const) {
  assert.ok(snapshot.prohibitedOutputFields.includes(field), `Snapshot should prohibit output field ${field}.`);
}

for (const claim of HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS) {
  assert.ok(snapshot.blockedReadinessClaims.includes(claim), `Snapshot should include blocked claim: ${claim}`);
}

for (const unsafeCopy of [
  'hosted ready',
  'hosted validated',
  'deployment ready',
  'deployment verified',
  'production ready',
  'security ready',
  'operational ready',
  'operational readiness complete',
  'pilot ready',
  'pilot readiness accepted',
  'environment-verified',
  'startup passed',
  'startup check passed',
  'readiness check passed',
  'rollback-ready',
  'incident ready',
  'backup ready',
  'restore ready',
  'RLS ready',
  'tenant isolation verified',
  'artifact SELECT verified',
  'schema available',
  'local ready',
  'compliance certified',
  'readiness evidence produced',
  'Avala Govern Lite',
  'Avala Delivery Lite',
]) {
  assert.throws(
    () => assertHostedDeploymentOperationsCopyIsClaimSafe(unsafeCopy),
    /Unsupported hosted|Deprecated buyer-facing name/,
    `${unsafeCopy} should be rejected.`,
  );
}

assert.doesNotThrow(() =>
  assertHostedDeploymentOperationsCopyIsClaimSafe('Hosted/deployment preparation remains evidence-required and model-only.'),
);
assert.doesNotThrow(() =>
  assertHostedDeploymentOperationsCopyIsClaimSafe('Rollback and incident execution remain blocked until a later AP-approved gate.'),
);

const mutableSnapshot = buildHostedDeploymentOperationsPreparationSnapshot();
(mutableSnapshot.environmentClasses as typeof mutableSnapshot.environmentClasses & unknown[]).push({
  ...mutableSnapshot.environmentClasses[0],
  id: 'local_development_reference',
  label: 'Mutated Environment Class',
});
(mutableSnapshot.environmentClasses[0].prohibitedOutputFields as typeof mutableSnapshot.environmentClasses[0]['prohibitedOutputFields'] & string[]).push('mutated_field');
(mutableSnapshot.operationalGateMatrix[0].plannedScope as typeof mutableSnapshot.operationalGateMatrix[0]['plannedScope'] & string[]).push('mutated scope');

const cleanSnapshot = buildHostedDeploymentOperationsPreparationSnapshot();
assert.equal(cleanSnapshot.environmentClasses.length, HOSTED_ENVIRONMENT_CLASS_IDS.length, 'Environment class definitions must not be mutated by callers.');
assert.equal(cleanSnapshot.environmentClasses[0].label, 'Local Development Reference Class');
assert.equal(cleanSnapshot.environmentClasses[0].prohibitedOutputFields.includes('mutated_field' as never), false);
assert.equal(cleanSnapshot.operationalGateMatrix[0].plannedScope.includes('mutated scope'), false);

const stagingClass = getHostedEnvironmentClassContract('staging_reference', snapshot);
assert.equal(stagingClass.apApprovalRequiredBeforeExecution, true);
assert.equal(stagingClass.environmentProbed, false);
assert.match(stagingClass.objective, /without validating staging behavior/i);

(stagingClass.stopConditions as typeof stagingClass.stopConditions & string[]).push('mutated stop condition');
const cleanStagingClass = getHostedEnvironmentClassContract('staging_reference', snapshot);
assert.equal(cleanStagingClass.stopConditions.includes('mutated stop condition'), false);

const rollbackGate = getOperationalGateMatrixContract('rollback_incident_response_boundary', snapshot);
assert.equal(rollbackGate.gateExecutionPerformed, false);
assert.equal(rollbackGate.gatePassed, false);
assert.equal(rollbackGate.gateVerified, false);
assert.ok(rollbackGate.plannedScope.some(scope => /rollback owner/i.test(scope)));

(rollbackGate.prohibitedOutputFields as typeof rollbackGate.prohibitedOutputFields & string[]).push('mutated_operational_field');
const cleanRollbackGate = getOperationalGateMatrixContract('rollback_incident_response_boundary', snapshot);
assert.equal(cleanRollbackGate.prohibitedOutputFields.includes('mutated_operational_field' as never), false);

assert.throws(
  () => assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    apApprovalGranted: true,
  }),
  /AP approval and hosted execution approval must remain ungranted/,
);
assert.throws(
  () => assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    hostedValidationPerformed: true,
  }),
  /Hosted and deployment validation must remain unperformed/,
);
assert.throws(
  () => assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    startupCheckPerformed: true,
  }),
  /Startup and readiness checks must remain unperformed/,
);
assert.throws(
  () => assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    backupRestoreExecutionPerformed: true,
  }),
  /Backup\/restore execution must remain unperformed/,
);
assert.throws(
  () => assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    operationalGateMatrix: [
      {
        ...snapshot.operationalGateMatrix[0],
        gatePassed: true,
      },
    ],
  }),
  /Operational gate cannot be executed, passed, or verified/,
);
assert.throws(
  () => assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral({
    ...snapshot,
    environmentClasses: [
      {
        ...snapshot.environmentClasses[0],
        currentProofStatus: 'planned',
      },
    ],
  }),
  /Environment class cannot imply completed proof/,
);

console.log('M5.6b hosted/deployment/operations preparation model tests passed.');
