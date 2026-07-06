import {
  EVIDENCE_EXECUTION_PROOF_STATUSES,
  buildEvidenceExecutionGateSnapshot,
  type CandidateEvidenceTrackComparison,
  type EvidenceExecutionGateSnapshot,
  type EvidenceExecutionProofStatus,
} from './evidenceExecutionGateModel';

export interface EvidenceExecutionProofStatusSummary {
  status: EvidenceExecutionProofStatus;
  label: string;
  count: number;
}

export interface EvidenceExecutionCandidateTrackRow {
  id: string;
  label: string;
  proofStatus: EvidenceExecutionProofStatus;
  proofStatusLabel: string;
  riskLevel: string;
  buyerValue: string;
  recommendedFirstCandidate: boolean;
  apApprovalRequiredBeforeExecution: boolean;
  prerequisiteProofNeedCount: number;
  prohibitedOutputFieldCount: number;
  prohibitedActionCount: number;
  readOnlySummary: string;
}

export interface EvidenceExecutionGateReadOnlySummary {
  headline: string;
  summary: string;
  candidateTrackCount: number;
  recommendedFirstCandidateTrackId: string;
  recommendedFirstCandidateLabel: string;
  apDecisionState: string;
  apApprovalGranted: boolean;
  executionApproved: boolean;
  executionPerformed: boolean;
  browserExecutionPerformed: boolean;
  screenshotEvidenceProduced: boolean;
  exportPdfDownloadArtifactProduced: boolean;
  storageObjectCreated: boolean;
  signedUrlGenerated: boolean;
  approvalWorkflowExecuted: boolean;
  statusChangedByWorkflow: boolean;
  dbRlsArtifactExecutionPerformed: boolean;
  schemaInspectionPerformed: boolean;
  hostedDeploymentExecutionPerformed: boolean;
  providerClassifierExecutionPerformed: boolean;
  realAssertionExecutionPerformed: boolean;
  readinessEvidenceProduced: boolean;
  postM57ExecutionMilestoneStarted: boolean;
  proofStatusSummary: readonly EvidenceExecutionProofStatusSummary[];
  blockedClaimCount: number;
  readOnlyNotice: string;
}

const proofStatusLabels: Record<EvidenceExecutionProofStatus, string> = {
  candidate_only: 'Candidate Only',
  approval_required: 'Approval Required',
  blocked: 'Blocked',
  deferred: 'Deferred',
};

export function getEvidenceExecutionProofStatusLabel(status: EvidenceExecutionProofStatus): string {
  return proofStatusLabels[status];
}

export function summarizeEvidenceExecutionProofStatuses(
  snapshot: EvidenceExecutionGateSnapshot,
): readonly EvidenceExecutionProofStatusSummary[] {
  const counts = EVIDENCE_EXECUTION_PROOF_STATUSES.reduce((accumulator, status) => {
    accumulator[status] = 0;
    return accumulator;
  }, {} as Record<EvidenceExecutionProofStatus, number>);

  for (const track of snapshot.candidateTracks) {
    counts[track.currentStatus] += 1;
  }

  return EVIDENCE_EXECUTION_PROOF_STATUSES.map(status => ({
    status,
    label: getEvidenceExecutionProofStatusLabel(status),
    count: counts[status],
  }));
}

function buildCandidateTrackRow(
  track: CandidateEvidenceTrackComparison,
): EvidenceExecutionCandidateTrackRow {
  return {
    id: track.id,
    label: track.label,
    proofStatus: track.currentStatus,
    proofStatusLabel: getEvidenceExecutionProofStatusLabel(track.currentStatus),
    riskLevel: track.riskLevel,
    buyerValue: track.buyerValue,
    recommendedFirstCandidate: track.recommendedFirstCandidate,
    apApprovalRequiredBeforeExecution: track.apApprovalRequiredBeforeExecution,
    prerequisiteProofNeedCount: track.prerequisiteProofNeeds.length,
    prohibitedOutputFieldCount: track.prohibitedOutputs.length,
    prohibitedActionCount: track.prohibitedActions.length,
    readOnlySummary: `Read-only M5.7 candidate summary for ${track.label}; no AP approval, execution approval, browser launch, browser automation, screenshot capture, export/PDF/download generation, storage object creation, signed URL generation, approval workflow, status change, DB/RLS/artifact execution, schema inspection, hosted/deployment validation, provider/classifier execution, real assertion, readiness evidence, or post-M5.7 execution milestone action is exposed.`,
  };
}

export function getEvidenceExecutionCandidateTrackRows(
  snapshot: EvidenceExecutionGateSnapshot = buildEvidenceExecutionGateSnapshot(),
): readonly EvidenceExecutionCandidateTrackRow[] {
  return snapshot.candidateTracks.map(buildCandidateTrackRow);
}

export function getEvidenceExecutionGateReadOnlySummary(
  snapshot: EvidenceExecutionGateSnapshot = buildEvidenceExecutionGateSnapshot(),
): EvidenceExecutionGateReadOnlySummary {
  const recommendedTrack = snapshot.candidateTracks.find(
    track => track.id === snapshot.recommendedFirstCandidateTrackId,
  );
  if (!recommendedTrack) {
    throw new Error(`Missing recommended M5.7 candidate: ${snapshot.recommendedFirstCandidateTrackId}`);
  }

  return {
    headline: 'M5.7 first evidence execution gate selection',
    summary:
      'M5.7 compares future evidence execution tracks and recommends Manual Browser Walkthrough as the first candidate for AP review only; AP approval remains ungranted and no execution is represented.',
    candidateTrackCount: snapshot.candidateTracks.length,
    recommendedFirstCandidateTrackId: snapshot.recommendedFirstCandidateTrackId,
    recommendedFirstCandidateLabel: recommendedTrack.label,
    apDecisionState: snapshot.apApprovalDecisionContract.apDecision,
    apApprovalGranted: snapshot.apApprovalGranted,
    executionApproved: snapshot.executionApproved,
    executionPerformed: snapshot.executionPerformed,
    browserExecutionPerformed: snapshot.browserExecutionPerformed,
    screenshotEvidenceProduced: snapshot.screenshotEvidenceProduced,
    exportPdfDownloadArtifactProduced: snapshot.exportPdfDownloadArtifactProduced,
    storageObjectCreated: snapshot.storageObjectCreated,
    signedUrlGenerated: snapshot.signedUrlGenerated,
    approvalWorkflowExecuted: snapshot.approvalWorkflowExecuted,
    statusChangedByWorkflow: snapshot.statusChangedByWorkflow,
    dbRlsArtifactExecutionPerformed: snapshot.dbRlsArtifactExecutionPerformed,
    schemaInspectionPerformed: snapshot.schemaInspectionPerformed,
    hostedDeploymentExecutionPerformed: snapshot.hostedDeploymentExecutionPerformed,
    providerClassifierExecutionPerformed: snapshot.providerClassifierExecutionPerformed,
    realAssertionExecutionPerformed: snapshot.realAssertionExecutionPerformed,
    readinessEvidenceProduced: snapshot.readinessEvidenceProduced,
    postM57ExecutionMilestoneStarted: snapshot.postM57ExecutionMilestoneStarted,
    proofStatusSummary: summarizeEvidenceExecutionProofStatuses(snapshot),
    blockedClaimCount: snapshot.blockedReadinessClaims.length,
    readOnlyNotice:
      'Read-only M5.7 summary only; no AP approval, execution approval, browser launch, browser automation, screenshot capture, export/PDF/download generation, storage object creation, signed URL generation, approval workflow, status change, DB/RLS/artifact execution, schema inspection, hosted/deployment validation, startup check, readiness check, provider/classifier execution, rollback/incident/backup/restore execution, real assertion, readiness evidence, or post-M5.7 execution milestone action is exposed.',
  };
}
