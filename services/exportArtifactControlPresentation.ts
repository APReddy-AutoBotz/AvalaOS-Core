import {
  EXPORT_ARTIFACT_STATUSES,
  buildExportArtifactControlSnapshot,
  type ExportArtifactBoundaryContract,
  type ExportArtifactControlSnapshot,
  type ExportArtifactStatus,
  type StorageAccessPolicyContract,
} from './exportArtifactControlModel';

export interface ExportArtifactStatusSummary {
  status: ExportArtifactStatus;
  label: string;
  count: number;
}

export interface ExportArtifactBoundaryRow {
  id: string;
  label: string;
  artifactStatus: ExportArtifactStatus;
  artifactStatusLabel: string;
  modelOnly: boolean;
  artifactGenerated: boolean;
  apApprovalRequiredBeforeExecution: boolean;
  allowedMetadataFieldCount: number;
  prohibitedMetadataFieldCount: number;
  requiredFutureProofCount: number;
  sourceEvidenceReferenceCount: number;
  readOnlySummary: string;
  prohibitedOutputSummary: string;
}

export interface StorageAccessPolicyRow {
  id: string;
  label: string;
  modelOnly: boolean;
  liveStorageAccessAllowed: boolean;
  liveSignedUrlGenerationAllowed: boolean;
  privateStorageRequired: boolean;
  accessRoleCount: number;
  auditMetadataFieldCount: number;
  prohibitedMetadataFieldCount: number;
  readOnlySummary: string;
}

export interface AdminExportArtifactControlSummary {
  headline: string;
  summary: string;
  artifactContractCount: number;
  storagePolicyCount: number;
  blockedClaimCount: number;
  generatedArtifactsAllowed: boolean;
  liveStorageExecutionAllowed: boolean;
  liveSignedUrlGenerationAllowed: boolean;
  artifactStatusSummary: readonly ExportArtifactStatusSummary[];
  readOnlyNotice: string;
}

const artifactStatusLabels: Record<ExportArtifactStatus, string> = {
  model_only: 'Model Only',
  planned: 'Planned',
  blocked: 'Blocked',
  evidence_required: 'Evidence Required',
  generated: 'Generated',
};

export function getExportArtifactStatusLabel(status: ExportArtifactStatus): string {
  return artifactStatusLabels[status];
}

export function summarizeExportArtifactStatuses(
  snapshot: ExportArtifactControlSnapshot,
): readonly ExportArtifactStatusSummary[] {
  const counts = EXPORT_ARTIFACT_STATUSES.reduce((accumulator, status) => {
    accumulator[status] = 0;
    return accumulator;
  }, {} as Record<ExportArtifactStatus, number>);

  for (const contract of snapshot.exportBoundaryContracts) {
    counts[contract.artifactStatus] += 1;
  }

  return EXPORT_ARTIFACT_STATUSES.map(status => ({
    status,
    label: getExportArtifactStatusLabel(status),
    count: counts[status],
  }));
}

function buildExportArtifactBoundaryRow(contract: ExportArtifactBoundaryContract): ExportArtifactBoundaryRow {
  return {
    id: contract.id,
    label: contract.label,
    artifactStatus: contract.artifactStatus,
    artifactStatusLabel: getExportArtifactStatusLabel(contract.artifactStatus),
    modelOnly: contract.modelOnly,
    artifactGenerated: contract.artifactGenerated,
    apApprovalRequiredBeforeExecution: contract.apApprovalRequiredBeforeExecution,
    allowedMetadataFieldCount: contract.allowedMetadataFields.length,
    prohibitedMetadataFieldCount: contract.prohibitedMetadataFields.length,
    requiredFutureProofCount: contract.requiredFutureProof.length,
    sourceEvidenceReferenceCount: contract.sourceEvidenceReferences.length,
    readOnlySummary: `Read-only export/artifact summary for ${contract.label}; no export, PDF, download, storage write, signed URL, approval, browser, screenshot, status-change, or readiness evidence action is exposed.`,
    prohibitedOutputSummary: `${contract.prohibitedOutputs.length} artifact, storage, browser, workflow, and readiness outputs remain prohibited.`,
  };
}

export function getExportArtifactBoundaryRows(
  snapshot: ExportArtifactControlSnapshot = buildExportArtifactControlSnapshot(),
): readonly ExportArtifactBoundaryRow[] {
  return snapshot.exportBoundaryContracts.map(buildExportArtifactBoundaryRow);
}

function buildStorageAccessPolicyRow(policy: StorageAccessPolicyContract): StorageAccessPolicyRow {
  return {
    id: policy.id,
    label: policy.label,
    modelOnly: policy.modelOnly,
    liveStorageAccessAllowed: policy.liveStorageAccessAllowed,
    liveSignedUrlGenerationAllowed: policy.liveSignedUrlGenerationAllowed,
    privateStorageRequired: policy.privateStorageRequired,
    accessRoleCount: policy.accessRoles.length,
    auditMetadataFieldCount: policy.auditMetadataFields.length,
    prohibitedMetadataFieldCount: policy.prohibitedMetadataFields.length,
    readOnlySummary: `Read-only storage policy summary for ${policy.label}; no live storage access, storage object, signed URL, public link, file output, or readiness evidence action is exposed.`,
  };
}

export function getStorageAccessPolicyRows(
  snapshot: ExportArtifactControlSnapshot = buildExportArtifactControlSnapshot(),
): readonly StorageAccessPolicyRow[] {
  return snapshot.storageAccessPolicies.map(buildStorageAccessPolicyRow);
}

export function getExportArtifactReadOnlySummary(
  snapshot: ExportArtifactControlSnapshot = buildExportArtifactControlSnapshot(),
): AdminExportArtifactControlSummary {
  return {
    headline: 'Export and artifact storage control contracts',
    summary: 'Secure export, PDF, download, storage, signed-reference, and artifact lineage are modeled for review only; AP approval remains ungranted and no artifact generation is represented.',
    artifactContractCount: snapshot.exportBoundaryContracts.length,
    storagePolicyCount: snapshot.storageAccessPolicies.length,
    blockedClaimCount: snapshot.blockedReadinessClaims.length,
    generatedArtifactsAllowed: snapshot.generatedArtifactsAllowed,
    liveStorageExecutionAllowed: snapshot.liveStorageExecutionAllowed,
    liveSignedUrlGenerationAllowed: snapshot.liveSignedUrlGenerationAllowed,
    artifactStatusSummary: summarizeExportArtifactStatuses(snapshot),
    readOnlyNotice: 'Read-only summary only; no export, PDF, download, storage write, signed URL, approval, browser, screenshot, status change, or readiness evidence action is exposed.',
  };
}
