import {
  APPROVAL_CONTRACT_STATES,
  buildEvidenceControlSnapshot,
  type ApprovalContractState,
  type AuditEventCategory,
  type AuditEventContract,
  type ControlSurfaceContract,
  type EvidenceControlSnapshot,
} from './evidenceControlModel';

export interface ApprovalStateSummary {
  state: ApprovalContractState;
  label: string;
  count: number;
}

export interface EvidenceControlSurfaceRow {
  id: string;
  label: string;
  approvalState: ApprovalContractState;
  approvalStateLabel: string;
  proofBoundarySummary: string;
  verifiedControlFactCount: number;
  blockedReadinessClaimCount: number;
  requiredEvidenceCount: number;
  readOnlySummary: string;
  prohibitedActionSummary: string;
  auditCategories: readonly AuditEventCategory[];
}

export interface AuditContractRow {
  category: AuditEventCategory;
  label: string;
  requiredFieldCount: number;
  redactionRuleCount: number;
  prohibitedFieldCount: number;
  blockedUntil: string;
}

export interface AdminEvidenceControlSummary {
  headline: string;
  summary: string;
  surfaceCount: number;
  blockedClaimCount: number;
  executionApprovalGranted: boolean;
  approvalStateSummary: readonly ApprovalStateSummary[];
  readOnlyNotice: string;
}

const approvalStateLabels: Record<ApprovalContractState, string> = {
  planned: 'Planned',
  required: 'Required',
  blocked: 'Blocked',
  deferred: 'Deferred',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
  evidence_required: 'Evidence Required',
};

export function getApprovalStateLabel(state: ApprovalContractState): string {
  return approvalStateLabels[state];
}

export function summarizeApprovalStates(snapshot: EvidenceControlSnapshot): readonly ApprovalStateSummary[] {
  const counts = APPROVAL_CONTRACT_STATES.reduce((accumulator, state) => {
    accumulator[state] = 0;
    return accumulator;
  }, {} as Record<ApprovalContractState, number>);

  for (const surface of snapshot.surfaces) {
    counts[surface.approvalState] += 1;
  }

  return APPROVAL_CONTRACT_STATES.map(state => ({
    state,
    label: getApprovalStateLabel(state),
    count: counts[state],
  }));
}

function buildSurfaceRow(surface: ControlSurfaceContract): EvidenceControlSurfaceRow {
  return {
    id: surface.id,
    label: surface.label,
    approvalState: surface.approvalState,
    approvalStateLabel: getApprovalStateLabel(surface.approvalState),
    proofBoundarySummary: surface.proofBoundarySummary,
    verifiedControlFactCount: surface.verifiedControlFacts.length,
    blockedReadinessClaimCount: surface.blockedReadinessClaims.length,
    requiredEvidenceCount: surface.requiredEvidenceBeforeReadiness.length,
    readOnlySummary: `Read-only summary for ${surface.label}; no approval, execution, screenshot, export, PDF, download, signoff, completion, or status-change action is exposed.`,
    prohibitedActionSummary: `${surface.prohibitedActions.length} execution actions remain prohibited.`,
    auditCategories: [...surface.auditEventCategories],
  };
}

export function getEvidenceControlSurfaceRows(
  snapshot: EvidenceControlSnapshot = buildEvidenceControlSnapshot(),
): readonly EvidenceControlSurfaceRow[] {
  return snapshot.surfaces.map(buildSurfaceRow);
}

function buildAuditContractRow(contract: AuditEventContract): AuditContractRow {
  return {
    category: contract.category,
    label: contract.label,
    requiredFieldCount: contract.requiredFields.length,
    redactionRuleCount: contract.redactionRules.length,
    prohibitedFieldCount: contract.prohibitedFields.length,
    blockedUntil: contract.blockedUntil,
  };
}

export function getAuditContractRows(
  snapshot: EvidenceControlSnapshot = buildEvidenceControlSnapshot(),
): readonly AuditContractRow[] {
  return snapshot.auditContracts.map(buildAuditContractRow);
}

export function getBlockedReadinessClaimSummary(
  snapshot: EvidenceControlSnapshot = buildEvidenceControlSnapshot(),
): readonly string[] {
  const claims = new Set<string>(snapshot.blockedReadinessClaims);

  for (const surface of snapshot.surfaces) {
    for (const claim of surface.blockedReadinessClaims) {
      claims.add(claim);
    }
  }

  return [...claims].sort((left, right) => left.localeCompare(right));
}

export function getAdminEvidenceControlSummary(
  snapshot: EvidenceControlSnapshot = buildEvidenceControlSnapshot(),
): AdminEvidenceControlSummary {
  return {
    headline: 'Execution-neutral control contracts',
    summary: 'Evidence surfaces, approval states, and audit categories are modeled for review only; AP approval remains ungranted and no workflow execution is represented.',
    surfaceCount: snapshot.surfaces.length,
    blockedClaimCount: getBlockedReadinessClaimSummary(snapshot).length,
    executionApprovalGranted: snapshot.executionApprovalGranted,
    approvalStateSummary: summarizeApprovalStates(snapshot),
    readOnlyNotice: 'Read-only summary only; no approval, execution, screenshot, export, PDF, download, signoff, completion, status change, or readiness evidence action is exposed.',
  };
}
