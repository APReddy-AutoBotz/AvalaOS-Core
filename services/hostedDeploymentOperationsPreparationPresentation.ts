import {
  HOSTED_DEPLOYMENT_PREPARATION_PROOF_STATUSES,
  buildHostedDeploymentOperationsPreparationSnapshot,
  type HostedDeploymentOperationsPreparationSnapshot,
  type HostedDeploymentPreparationProofStatus,
  type HostedEnvironmentClassContract,
  type OperationalGateMatrixContract,
} from './hostedDeploymentOperationsPreparationModel';

export interface HostedDeploymentPreparationProofStatusSummary {
  status: HostedDeploymentPreparationProofStatus;
  label: string;
  count: number;
}

export interface HostedEnvironmentClassRow {
  id: string;
  label: string;
  proofStatus: HostedDeploymentPreparationProofStatus;
  proofStatusLabel: string;
  environmentProbed: boolean;
  hostedValidationPerformed: boolean;
  deploymentValidationPerformed: boolean;
  startupCheckPerformed: boolean;
  readinessCheckPerformed: boolean;
  pilotEvidenceProduced: boolean;
  plannedOwnershipBoundaryCount: number;
  requiredFutureProofCount: number;
  prohibitedOutputFieldCount: number;
  readOnlySummary: string;
}

export interface OperationalGateMatrixRow {
  id: string;
  label: string;
  proofStatus: HostedDeploymentPreparationProofStatus;
  proofStatusLabel: string;
  gateExecutionPerformed: boolean;
  gatePassed: boolean;
  gateVerified: boolean;
  plannedScopeCount: number;
  requiredFutureProofCount: number;
  prohibitedOutputFieldCount: number;
  readOnlySummary: string;
}

export interface AdminHostedDeploymentOperationsPreparationSummary {
  headline: string;
  summary: string;
  environmentClassCount: number;
  operationalGateCount: number;
  blockedClaimCount: number;
  apApprovalGranted: boolean;
  hostedExecutionApproved: boolean;
  hostedValidationPerformed: boolean;
  deploymentValidationPerformed: boolean;
  startupCheckPerformed: boolean;
  readinessCheckPerformed: boolean;
  rollbackExecutionPerformed: boolean;
  incidentExecutionPerformed: boolean;
  backupRestoreExecutionPerformed: boolean;
  pilotEvidenceProduced: boolean;
  readinessEvidenceProduced: boolean;
  proofStatusSummary: readonly HostedDeploymentPreparationProofStatusSummary[];
  readOnlyNotice: string;
}

const proofStatusLabels: Record<HostedDeploymentPreparationProofStatus, string> = {
  unproven: 'Unproven',
  evidence_required: 'Evidence Required',
  planned: 'Planned',
  blocked: 'Blocked',
};

export function getHostedDeploymentPreparationProofStatusLabel(
  status: HostedDeploymentPreparationProofStatus,
): string {
  return proofStatusLabels[status];
}

export function summarizeHostedDeploymentPreparationProofStatuses(
  snapshot: HostedDeploymentOperationsPreparationSnapshot,
): readonly HostedDeploymentPreparationProofStatusSummary[] {
  const counts = HOSTED_DEPLOYMENT_PREPARATION_PROOF_STATUSES.reduce((accumulator, status) => {
    accumulator[status] = 0;
    return accumulator;
  }, {} as Record<HostedDeploymentPreparationProofStatus, number>);

  for (const environmentClass of snapshot.environmentClasses) {
    counts[environmentClass.currentProofStatus] += 1;
  }
  for (const gate of snapshot.operationalGateMatrix) {
    counts[gate.currentProofStatus] += 1;
  }

  return HOSTED_DEPLOYMENT_PREPARATION_PROOF_STATUSES.map(status => ({
    status,
    label: getHostedDeploymentPreparationProofStatusLabel(status),
    count: counts[status],
  }));
}

function buildHostedEnvironmentClassRow(
  environmentClass: HostedEnvironmentClassContract,
): HostedEnvironmentClassRow {
  return {
    id: environmentClass.id,
    label: environmentClass.label,
    proofStatus: environmentClass.currentProofStatus,
    proofStatusLabel: getHostedDeploymentPreparationProofStatusLabel(environmentClass.currentProofStatus),
    environmentProbed: environmentClass.environmentProbed,
    hostedValidationPerformed: environmentClass.hostedValidationPerformed,
    deploymentValidationPerformed: environmentClass.deploymentValidationPerformed,
    startupCheckPerformed: environmentClass.startupCheckPerformed,
    readinessCheckPerformed: environmentClass.readinessCheckPerformed,
    pilotEvidenceProduced: environmentClass.pilotEvidenceProduced,
    plannedOwnershipBoundaryCount: environmentClass.plannedOwnershipBoundaries.length,
    requiredFutureProofCount: environmentClass.requiredFutureProof.length,
    prohibitedOutputFieldCount: environmentClass.prohibitedOutputFields.length,
    readOnlySummary: `Read-only environment-classification summary for ${environmentClass.label}; no environment probe, hosted validation, deployment validation, startup check, readiness check, approval, status change, pilot evidence, or readiness evidence action is exposed.`,
  };
}

export function getHostedEnvironmentClassRows(
  snapshot: HostedDeploymentOperationsPreparationSnapshot =
    buildHostedDeploymentOperationsPreparationSnapshot(),
): readonly HostedEnvironmentClassRow[] {
  return snapshot.environmentClasses.map(buildHostedEnvironmentClassRow);
}

function buildOperationalGateMatrixRow(gate: OperationalGateMatrixContract): OperationalGateMatrixRow {
  return {
    id: gate.id,
    label: gate.label,
    proofStatus: gate.currentProofStatus,
    proofStatusLabel: getHostedDeploymentPreparationProofStatusLabel(gate.currentProofStatus),
    gateExecutionPerformed: gate.gateExecutionPerformed,
    gatePassed: gate.gatePassed,
    gateVerified: gate.gateVerified,
    plannedScopeCount: gate.plannedScope.length,
    requiredFutureProofCount: gate.requiredFutureProof.length,
    prohibitedOutputFieldCount: gate.prohibitedOutputFields.length,
    readOnlySummary: `Read-only operational gate summary for ${gate.label}; no hosted run, deployment run, startup check, readiness check, rollback execution, incident execution, backup/restore execution, approval, status change, pilot evidence, or readiness evidence action is exposed.`,
  };
}

export function getOperationalGateMatrixRows(
  snapshot: HostedDeploymentOperationsPreparationSnapshot =
    buildHostedDeploymentOperationsPreparationSnapshot(),
): readonly OperationalGateMatrixRow[] {
  return snapshot.operationalGateMatrix.map(buildOperationalGateMatrixRow);
}

export function getHostedDeploymentOperationsPreparationSummary(
  snapshot: HostedDeploymentOperationsPreparationSnapshot =
    buildHostedDeploymentOperationsPreparationSnapshot(),
): AdminHostedDeploymentOperationsPreparationSummary {
  return {
    headline: 'Hosted, deployment, and operations preparation contracts',
    summary: 'Hosted/deployment/operations, environment classification, rollback, incident, observability, backup/restore, support, and pilot-evidence prerequisites are modeled for review only; AP approval remains ungranted and no hosted/deployment/startup/readiness execution is represented.',
    environmentClassCount: snapshot.environmentClasses.length,
    operationalGateCount: snapshot.operationalGateMatrix.length,
    blockedClaimCount: snapshot.blockedReadinessClaims.length,
    apApprovalGranted: snapshot.apApprovalGranted,
    hostedExecutionApproved: snapshot.hostedExecutionApproved,
    hostedValidationPerformed: snapshot.hostedValidationPerformed,
    deploymentValidationPerformed: snapshot.deploymentValidationPerformed,
    startupCheckPerformed: snapshot.startupCheckPerformed,
    readinessCheckPerformed: snapshot.readinessCheckPerformed,
    rollbackExecutionPerformed: snapshot.rollbackExecutionPerformed,
    incidentExecutionPerformed: snapshot.incidentExecutionPerformed,
    backupRestoreExecutionPerformed: snapshot.backupRestoreExecutionPerformed,
    pilotEvidenceProduced: snapshot.pilotEvidenceProduced,
    readinessEvidenceProduced: snapshot.readinessEvidenceProduced,
    proofStatusSummary: summarizeHostedDeploymentPreparationProofStatuses(snapshot),
    readOnlyNotice: 'Read-only summary only; no AP approval, hosted validation, deployment validation, startup check, readiness check, Supabase stack, Docker, DB/RLS/artifact execution, schema inspection, provider/classifier execution, rollback execution, incident execution, backup/restore execution, browser execution, workflow execution, export/PDF/download generation, storage access, screenshot capture, status change, pilot evidence, or readiness evidence action is exposed.',
  };
}
