import {
  PROOF_STATUSES,
  READINESS_DOMAINS,
  type ClaimControl,
  type ProofBoundary,
  type ProofStatus,
  type ReadinessDomain,
  type TrustCenterSnapshot,
} from './trustCenterModel';

export const PLATFORM_READINESS_DOMAINS_REQUIRING_EVIDENCE: readonly ReadinessDomain[] = [
  'security',
  'tenant_isolation',
  'export',
  'deployment',
  'operations',
  'buyer_readiness',
  'product_readiness',
  'release_candidate',
];

export interface ProofStatusSummary {
  status: ProofStatus;
  label: string;
  count: number;
}

export interface ClaimControlDomainGroup {
  domain: ReadinessDomain;
  label: string;
  controls: readonly ClaimControl[];
}

const proofStatusLabels: Record<ProofStatus, string> = {
  demo: 'Demo',
  planned: 'Planned',
  configured: 'Configured',
  evidence_required: 'Evidence Required',
  verified: 'Verified',
  blocked: 'Blocked',
};

const proofBoundaryLabels: Record<ProofBoundary, string> = {
  docs_only: 'Docs Only',
  synthetic_only: 'Synthetic Only',
  local_unproven: 'Local Unproven',
  hosted_unproven: 'Hosted Unproven',
  verified_with_evidence: 'Verified With Evidence',
  blocked_until_ap_approval: 'Blocked Until AP Approval',
};

const readinessDomainLabels: Record<ReadinessDomain, string> = {
  security: 'Security',
  tenant_isolation: 'Tenant Isolation',
  ai_controls: 'AI Controls',
  evidence: 'Evidence',
  export: 'Export',
  deployment: 'Deployment',
  operations: 'Operations',
  buyer_readiness: 'Buyer Readiness',
  product_readiness: 'Product Readiness',
  release_candidate: 'Release Candidate',
};

export function getProofStatusLabel(status: ProofStatus): string {
  return proofStatusLabels[status];
}

export function getProofBoundaryLabel(boundary: ProofBoundary): string {
  return proofBoundaryLabels[boundary];
}

export function getReadinessDomainLabel(domain: ReadinessDomain): string {
  return readinessDomainLabels[domain];
}

export function groupClaimControlsByDomain(snapshot: TrustCenterSnapshot): readonly ClaimControlDomainGroup[] {
  return READINESS_DOMAINS.map(domain => ({
    domain,
    label: getReadinessDomainLabel(domain),
    controls: snapshot.claimControls.filter(control => control.domain === domain),
  }));
}

export function summarizeProofStatuses(snapshot: TrustCenterSnapshot): readonly ProofStatusSummary[] {
  const counts = PROOF_STATUSES.reduce((accumulator, status) => {
    accumulator[status] = 0;
    return accumulator;
  }, {} as Record<ProofStatus, number>);

  for (const control of snapshot.claimControls) {
    counts[control.proofStatus] += 1;
  }

  for (const evidence of snapshot.evidence) {
    counts[evidence.acceptedStatus] += 1;
  }

  for (const moduleState of snapshot.moduleCapabilityStates) {
    counts[moduleState.proofStatus] += 1;
  }

  for (const artifact of snapshot.buyerAcceptanceArtifacts) {
    counts[artifact.proofStatus] += 1;
  }

  return PROOF_STATUSES.map(status => ({
    status,
    label: getProofStatusLabel(status),
    count: counts[status],
  }));
}

export function getEvidenceRequiredOrBlockedClaims(snapshot: TrustCenterSnapshot): readonly ClaimControl[] {
  return snapshot.claimControls.filter(control =>
    control.proofStatus === 'evidence_required' || control.proofStatus === 'blocked',
  );
}

export function getVerifiedClaims(snapshot: TrustCenterSnapshot): readonly ClaimControl[] {
  return snapshot.claimControls.filter(control => control.proofStatus === 'verified');
}

export function assertNoVerifiedPlatformReadinessClaims(snapshot: TrustCenterSnapshot): void {
  const blockedDomains = new Set<ReadinessDomain>(PLATFORM_READINESS_DOMAINS_REQUIRING_EVIDENCE);
  const invalidVerifiedClaims = snapshot.claimControls.filter(control =>
    control.proofStatus === 'verified' && blockedDomains.has(control.domain),
  );

  if (invalidVerifiedClaims.length > 0) {
    const invalidIds = invalidVerifiedClaims.map(control => `${control.id}:${control.domain}`).join(', ');
    throw new Error(`Verified platform readiness claims are not allowed: ${invalidIds}`);
  }
}
