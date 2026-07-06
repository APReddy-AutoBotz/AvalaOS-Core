import {
  RLS_PREPARATION_PROOF_STATUSES,
  buildRlsTenantIsolationPreparationSnapshot,
  type AuthoritySurfacePreparationContract,
  type RlsAssertionMatrixContract,
  type RlsPreparationProofStatus,
  type RlsTenantIsolationPreparationSnapshot,
} from './rlsTenantIsolationPreparationModel';

export interface RlsPreparationProofStatusSummary {
  status: RlsPreparationProofStatus;
  label: string;
  count: number;
}

export interface AuthoritySurfacePreparationRow {
  id: string;
  label: string;
  proofStatus: RlsPreparationProofStatus;
  proofStatusLabel: string;
  schemaInspectionPerformed: boolean;
  rlsExecutionPerformed: boolean;
  tenantIsolationVerified: boolean;
  artifactSelectVerified: boolean;
  conceptualAuthorityAreaCount: number;
  plannedImplementationScopeCount: number;
  requiredFutureProofCount: number;
  prohibitedOutputFieldCount: number;
  readOnlySummary: string;
}

export interface RlsAssertionMatrixRow {
  id: string;
  label: string;
  proofStatus: RlsPreparationProofStatus;
  proofStatusLabel: string;
  assertionExecuted: boolean;
  assertionPassed: boolean;
  assertionVerified: boolean;
  plannedAssertionScopeCount: number;
  requiredFutureProofCount: number;
  prohibitedOutputFieldCount: number;
  readOnlySummary: string;
}

export interface AdminRlsTenantIsolationPreparationSummary {
  headline: string;
  summary: string;
  authoritySurfaceCount: number;
  assertionCategoryCount: number;
  blockedClaimCount: number;
  apApprovalGranted: boolean;
  dbExecutionApproved: boolean;
  dbExecutionPerformed: boolean;
  schemaInspectionPerformed: boolean;
  tenantIsolationVerified: boolean;
  readinessEvidenceProduced: boolean;
  proofStatusSummary: readonly RlsPreparationProofStatusSummary[];
  readOnlyNotice: string;
}

const proofStatusLabels: Record<RlsPreparationProofStatus, string> = {
  unproven: 'Unproven',
  evidence_required: 'Evidence Required',
  planned: 'Planned',
  blocked: 'Blocked',
};

export function getRlsPreparationProofStatusLabel(status: RlsPreparationProofStatus): string {
  return proofStatusLabels[status];
}

export function summarizeRlsPreparationProofStatuses(
  snapshot: RlsTenantIsolationPreparationSnapshot,
): readonly RlsPreparationProofStatusSummary[] {
  const counts = RLS_PREPARATION_PROOF_STATUSES.reduce((accumulator, status) => {
    accumulator[status] = 0;
    return accumulator;
  }, {} as Record<RlsPreparationProofStatus, number>);

  for (const surface of snapshot.authoritySurfaces) {
    counts[surface.currentProofStatus] += 1;
  }
  for (const assertion of snapshot.assertionMatrix) {
    counts[assertion.proofStatus] += 1;
  }

  return RLS_PREPARATION_PROOF_STATUSES.map(status => ({
    status,
    label: getRlsPreparationProofStatusLabel(status),
    count: counts[status],
  }));
}

function buildAuthoritySurfacePreparationRow(
  surface: AuthoritySurfacePreparationContract,
): AuthoritySurfacePreparationRow {
  return {
    id: surface.id,
    label: surface.label,
    proofStatus: surface.currentProofStatus,
    proofStatusLabel: getRlsPreparationProofStatusLabel(surface.currentProofStatus),
    schemaInspectionPerformed: surface.schemaInspectionPerformed,
    rlsExecutionPerformed: surface.rlsExecutionPerformed,
    tenantIsolationVerified: surface.tenantIsolationVerified,
    artifactSelectVerified: surface.artifactSelectVerified,
    conceptualAuthorityAreaCount: surface.conceptualAuthorityAreas.length,
    plannedImplementationScopeCount: surface.plannedImplementationScope.length,
    requiredFutureProofCount: surface.requiredFutureProof.length,
    prohibitedOutputFieldCount: surface.prohibitedOutputFields.length,
    readOnlySummary: `Read-only RLS preparation summary for ${surface.label}; no DB execution, RLS execution, artifact SELECT check, schema inspection, migration, approval, status change, or readiness evidence action is exposed.`,
  };
}

export function getAuthoritySurfacePreparationRows(
  snapshot: RlsTenantIsolationPreparationSnapshot = buildRlsTenantIsolationPreparationSnapshot(),
): readonly AuthoritySurfacePreparationRow[] {
  return snapshot.authoritySurfaces.map(buildAuthoritySurfacePreparationRow);
}

function buildRlsAssertionMatrixRow(assertion: RlsAssertionMatrixContract): RlsAssertionMatrixRow {
  return {
    id: assertion.id,
    label: assertion.label,
    proofStatus: assertion.proofStatus,
    proofStatusLabel: getRlsPreparationProofStatusLabel(assertion.proofStatus),
    assertionExecuted: assertion.assertionExecuted,
    assertionPassed: assertion.assertionPassed,
    assertionVerified: assertion.assertionVerified,
    plannedAssertionScopeCount: assertion.plannedAssertionScope.length,
    requiredFutureProofCount: assertion.requiredFutureProof.length,
    prohibitedOutputFieldCount: assertion.prohibitedOutputFields.length,
    readOnlySummary: `Read-only future assertion summary for ${assertion.label}; no assertion run, pass/fail result, DB output, RLS output, artifact output, schema output, or readiness evidence action is exposed.`,
  };
}

export function getRlsAssertionMatrixRows(
  snapshot: RlsTenantIsolationPreparationSnapshot = buildRlsTenantIsolationPreparationSnapshot(),
): readonly RlsAssertionMatrixRow[] {
  return snapshot.assertionMatrix.map(buildRlsAssertionMatrixRow);
}

export function getRlsTenantIsolationPreparationSummary(
  snapshot: RlsTenantIsolationPreparationSnapshot = buildRlsTenantIsolationPreparationSnapshot(),
): AdminRlsTenantIsolationPreparationSummary {
  return {
    headline: 'RLS and tenant-isolation preparation contracts',
    summary: 'RLS, tenant-isolation, artifact SELECT, authority-surface, and assertion planning are modeled for review only; AP approval remains ungranted and no DB/RLS/artifact execution is represented.',
    authoritySurfaceCount: snapshot.authoritySurfaces.length,
    assertionCategoryCount: snapshot.assertionMatrix.length,
    blockedClaimCount: snapshot.blockedReadinessClaims.length,
    apApprovalGranted: snapshot.apApprovalGranted,
    dbExecutionApproved: snapshot.dbExecutionApproved,
    dbExecutionPerformed: snapshot.dbExecutionPerformed,
    schemaInspectionPerformed: snapshot.schemaInspectionPerformed,
    tenantIsolationVerified: snapshot.tenantIsolationVerified,
    readinessEvidenceProduced: snapshot.readinessEvidenceProduced,
    proofStatusSummary: summarizeRlsPreparationProofStatuses(snapshot),
    readOnlyNotice: 'Read-only summary only; no AP approval, DB execution, RLS execution, artifact SELECT check, schema inspection, migration, Supabase stack, Docker, hosted validation, deployment validation, assertion run, status change, or readiness evidence action is exposed.',
  };
}
