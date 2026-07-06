import assert from 'node:assert/strict';

import {
  EVIDENCE_EXECUTION_BLOCKED_READINESS_CLAIMS,
  EVIDENCE_EXECUTION_PROHIBITED_ACTIONS,
  EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS,
  EVIDENCE_EXECUTION_TRACK_IDS,
  M5_7_EVIDENCE_EXECUTION_GATE_ACCEPTED_BASELINE,
  assertEvidenceExecutionGateCopyIsClaimSafe,
  assertEvidenceExecutionGateSnapshotIsExecutionNeutral,
  buildEvidenceExecutionGateSnapshot,
  getCandidateEvidenceTrack,
  getRecommendedCandidateEvidenceTrack,
} from './evidenceExecutionGateModel';

console.log('Running M5.7 evidence execution gate model tests...');

const snapshot = buildEvidenceExecutionGateSnapshot();
const secondSnapshot = buildEvidenceExecutionGateSnapshot();

assert.deepEqual(snapshot, secondSnapshot, 'M5.7 evidence execution gate snapshot should be deterministic.');
assert.equal(snapshot.milestone, 'M5.7 First AP-Approved Evidence Execution Gate');
assert.match(M5_7_EVIDENCE_EXECUTION_GATE_ACCEPTED_BASELINE, /PR #181/);
assert.match(M5_7_EVIDENCE_EXECUTION_GATE_ACCEPTED_BASELINE, /2e5eeadbe43c80a6775d9f80efe929eb7eb4acdb/);
assert.equal(snapshot.modelOnly, true);
assert.equal(snapshot.apApprovalGranted, false);
assert.equal(snapshot.executionApproved, false);
assert.equal(snapshot.executionPerformed, false);
assert.equal(snapshot.browserExecutionPerformed, false);
assert.equal(snapshot.screenshotEvidenceProduced, false);
assert.equal(snapshot.exportPdfDownloadArtifactProduced, false);
assert.equal(snapshot.storageObjectCreated, false);
assert.equal(snapshot.signedUrlGenerated, false);
assert.equal(snapshot.approvalWorkflowExecuted, false);
assert.equal(snapshot.statusChangedByWorkflow, false);
assert.equal(snapshot.dbRlsArtifactExecutionPerformed, false);
assert.equal(snapshot.schemaInspectionPerformed, false);
assert.equal(snapshot.hostedDeploymentExecutionPerformed, false);
assert.equal(snapshot.providerClassifierExecutionPerformed, false);
assert.equal(snapshot.rollbackIncidentBackupRestoreExecutionPerformed, false);
assert.equal(snapshot.realAssertionExecutionPerformed, false);
assert.equal(snapshot.readinessEvidenceProduced, false);
assert.equal(snapshot.postM57ExecutionMilestoneStarted, false);
assert.deepEqual(snapshot.candidateTracks.map(track => track.id), EVIDENCE_EXECUTION_TRACK_IDS);

const recommendedTracks = snapshot.candidateTracks.filter(track => track.recommendedFirstCandidate);
assert.equal(recommendedTracks.length, 1, 'Exactly one first candidate should be recommended.');
assert.equal(recommendedTracks[0].id, 'manual_browser_walkthrough');
assert.equal(snapshot.recommendedFirstCandidateTrackId, 'manual_browser_walkthrough');
assert.equal(snapshot.apApprovalDecisionContract.selectedTrackId, 'manual_browser_walkthrough');
assert.equal(snapshot.apApprovalDecisionContract.selectedTrackIsCandidateOnly, true);
assert.equal(snapshot.apApprovalDecisionContract.apDecision, 'pending');
assert.equal(snapshot.apApprovalDecisionContract.approvalGranted, false);
assert.equal(snapshot.apApprovalDecisionContract.executionApproved, false);
assert.equal(snapshot.apApprovalDecisionContract.executionPerformed, false);
assert.deepEqual(snapshot.apApprovalDecisionContract.runCount, {
  minimum: 1,
  maximum: 1,
  exact: 1,
});
assert.equal(snapshot.futureExecutionContract.trackId, 'manual_browser_walkthrough');
assert.equal(snapshot.futureExecutionContract.candidateOnly, true);
assert.equal(snapshot.futureExecutionContract.executionApproved, false);
assert.equal(snapshot.futureExecutionContract.executionPerformed, false);

assertEvidenceExecutionGateSnapshotIsExecutionNeutral(snapshot);

for (const track of snapshot.candidateTracks) {
  assert.equal(track.apApprovalRequiredBeforeExecution, true, `${track.id} should require AP approval.`);
  assert.ok(track.prerequisiteProofNeeds.length > 0, `${track.id} should define prerequisite proof needs.`);
  assert.ok(track.prohibitedOutputs.length > 0, `${track.id} should define prohibited outputs.`);
  assert.ok(track.prohibitedActions.length > 0, `${track.id} should define prohibited actions.`);
  for (const field of EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS) {
    assert.ok(track.prohibitedOutputs.includes(field), `${track.id} should prohibit ${field}.`);
  }
  for (const action of EVIDENCE_EXECUTION_PROHIBITED_ACTIONS) {
    assert.ok(track.prohibitedActions.includes(action), `${track.id} should prohibit ${action}.`);
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
  'row_payload',
  'auth_header',
  'claim_value',
  'provider_key',
  'service_role_token',
  'private_token',
  'project_ref',
  'target_value',
  'environment_value',
  'deployment_url',
  'browser_output',
  'screenshot_path',
  'screenshot_file',
  'export_artifact_path',
  'pdf_artifact_path',
  'download_artifact_path',
  'storage_object_reference',
  'storage_object_path',
  'signed_url',
  'schema_dump',
  'sql_result_set',
  'policy_definition_dump',
  'migration_output',
  'artifact_select_payload',
  'provider_response',
  'classifier_output',
] as const) {
  assert.ok(snapshot.prohibitedOutputFields.includes(field), `Snapshot should prohibit output field ${field}.`);
  assert.ok(snapshot.apApprovalDecisionContract.prohibitedOutputs.includes(field), `AP contract should prohibit ${field}.`);
  assert.ok(snapshot.futureExecutionContract.prohibitedOutputs.includes(field), `Future contract should prohibit ${field}.`);
}

for (const claim of EVIDENCE_EXECUTION_BLOCKED_READINESS_CLAIMS) {
  assert.ok(snapshot.blockedReadinessClaims.includes(claim), `Snapshot should include blocked claim: ${claim}`);
}

for (const phrase of [
  'AP approval granted',
  'AP-approved execution complete',
  'browser walkthrough executed',
  'browser verified',
  'screenshot evidence produced',
  'export/PDF/download readiness available',
  'hosted ready',
  'hosted validated',
  'deployment ready',
  'deployment verified',
  'production ready',
  'security ready',
  'operational ready',
  'pilot ready',
  'RLS ready',
  'RLS verified',
  'tenant isolation verified',
  'tenant-isolation proof available',
  'artifact SELECT verified',
  'schema available',
  'local ready',
  'local startup success achieved',
  'buyer ready',
  'product ready',
  'release-candidate ready',
  'compliance certified',
  'readiness evidence produced',
  'Avala Govern Lite',
  'Avala Delivery Lite',
]) {
  assert.throws(
    () => assertEvidenceExecutionGateCopyIsClaimSafe(phrase),
    /Unsupported M5\.7|Deprecated buyer-facing name/,
    `${phrase} should be rejected.`,
  );
}

assert.doesNotThrow(() =>
  assertEvidenceExecutionGateCopyIsClaimSafe(
    'Manual Browser Walkthrough remains a candidate only until AP separately grants explicit go/no-go approval.',
  ),
);
assert.doesNotThrow(() =>
  assertEvidenceExecutionGateCopyIsClaimSafe(
    'M5.7 recommends a first candidate for AP review only and does not approve execution.',
  ),
);

const manualTrack = getRecommendedCandidateEvidenceTrack(snapshot);
assert.equal(manualTrack.id, 'manual_browser_walkthrough');
assert.equal(manualTrack.recommendedFirstCandidate, true);
assert.equal(manualTrack.riskRank, 1);
assert.equal(manualTrack.buyerValue, 'very_high');
assert.match(manualTrack.recommendationRationale, /without DB\/RLS, hosted\/deployment, provider\/classifier, export, storage, or workflow execution/i);

(manualTrack.prohibitedOutputs as typeof manualTrack.prohibitedOutputs & string[]).push('mutated_output');
const cleanManualTrack = getRecommendedCandidateEvidenceTrack(snapshot);
assert.equal(cleanManualTrack.prohibitedOutputs.includes('mutated_output' as never), false);

const hostedTrack = getCandidateEvidenceTrack('hosted_deployment_operations', snapshot);
assert.equal(hostedTrack.recommendedFirstCandidate, false);
assert.equal(hostedTrack.apApprovalRequiredBeforeExecution, true);

const mutableSnapshot = buildEvidenceExecutionGateSnapshot();
(mutableSnapshot.candidateTracks as typeof mutableSnapshot.candidateTracks & unknown[]).push({
  ...mutableSnapshot.candidateTracks[0],
  id: 'manual_browser_walkthrough',
  label: 'Mutated Candidate',
});
(mutableSnapshot.apApprovalDecisionContract.prohibitedOutputs as typeof mutableSnapshot.apApprovalDecisionContract.prohibitedOutputs & string[]).push('mutated_field');
(mutableSnapshot.futureExecutionContract.stopConditions as typeof mutableSnapshot.futureExecutionContract.stopConditions & string[]).push('mutated stop condition');

const cleanSnapshot = buildEvidenceExecutionGateSnapshot();
assert.equal(cleanSnapshot.candidateTracks.length, EVIDENCE_EXECUTION_TRACK_IDS.length);
assert.equal(cleanSnapshot.candidateTracks[0].label, 'Manual Browser Walkthrough Evidence Gate');
assert.equal(cleanSnapshot.apApprovalDecisionContract.prohibitedOutputs.includes('mutated_field' as never), false);
assert.equal(cleanSnapshot.futureExecutionContract.stopConditions.includes('mutated stop condition'), false);

assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    apApprovalGranted: true,
  }),
  /AP approval, execution approval, and execution performed flags must remain false/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    browserExecutionPerformed: true,
  }),
  /Browser execution and screenshot evidence must remain unperformed/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    screenshotEvidenceProduced: true,
  }),
  /Browser execution and screenshot evidence must remain unperformed/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    exportPdfDownloadArtifactProduced: true,
  }),
  /Export\/PDF\/download, storage object, and signed URL outputs must remain uncreated/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    approvalWorkflowExecuted: true,
  }),
  /Approval workflows and workflow-driven status changes must remain unperformed/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    dbRlsArtifactExecutionPerformed: true,
  }),
  /DB\/RLS\/artifact execution and schema inspection must remain unperformed/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    hostedDeploymentExecutionPerformed: true,
  }),
  /Hosted\/deployment and provider\/classifier execution must remain unperformed/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    readinessEvidenceProduced: true,
  }),
  /Readiness evidence and post-M5\.7 execution milestone start must remain false/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    candidateTracks: snapshot.candidateTracks.map(track => ({
      ...track,
      recommendedFirstCandidate: false,
    })),
  }),
  /Exactly one first candidate track must be recommended/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    apApprovalDecisionContract: {
      ...snapshot.apApprovalDecisionContract,
      apDecision: 'approved',
      approvalGranted: true,
    },
  }),
  /AP decision contract must remain pending/,
);
assert.throws(
  () => assertEvidenceExecutionGateSnapshotIsExecutionNeutral({
    ...snapshot,
    futureExecutionContract: {
      ...snapshot.futureExecutionContract,
      executionPerformed: true,
    },
  }),
  /Future execution contract must remain candidate-only/,
);

console.log('M5.7 evidence execution gate model tests passed.');
