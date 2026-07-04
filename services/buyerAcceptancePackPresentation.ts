import {
  REQUIRED_BUYER_ACCEPTANCE_OPEN_GAP_IDS,
  type ApApprovalChecklistItem,
  type BuyerAcceptanceChecklistStatus,
  type BuyerAcceptanceClaim,
  type BuyerAcceptanceNonClaim,
  type BuyerAcceptancePackSnapshot,
  type BuyerAcceptancePackStatus,
  type BuyerReviewChecklistItem,
} from './buyerAcceptancePackModel';
import {
  READINESS_DOMAINS,
  type ReadinessDomain,
} from './trustCenterModel';
import {
  getReadinessDomainLabel,
} from './trustCenterPresentation';

export interface BuyerAcceptanceClaimDomainGroup {
  domain: ReadinessDomain;
  label: string;
  claims: readonly BuyerAcceptanceClaim[];
}

const packStatusLabels: Record<BuyerAcceptancePackStatus, string> = {
  draft_foundation: 'Draft Foundation',
  evidence_required: 'Evidence Required - Draft Foundation',
  blocked: 'Blocked',
  approved_for_review: 'Approved For Review',
};

const checklistStatusLabels: Record<BuyerAcceptanceChecklistStatus, string> = {
  draft_foundation: 'Draft Foundation',
  review_required: 'Review Required',
  evidence_required: 'Evidence Required',
  blocked: 'Blocked',
};

const unsupportedClaimPatterns: readonly RegExp[] = [
  /production ready/i,
  /hosted ready/i,
  /deployment ready/i,
  /RLS ready/i,
  /RLS active/i,
  /RLS verified/i,
  /tenant isolation verified/i,
  /security ready/i,
  /buyer ready/i,
  /product ready/i,
  /release-candidate ready/i,
  /compliance certified/i,
  new RegExp('Avala Govern' + ' Lite', 'i'),
  new RegExp('Avala Delivery' + ' Lite', 'i'),
];

export function getBuyerAcceptancePackStatusLabel(status: BuyerAcceptancePackStatus): string {
  return packStatusLabels[status];
}

export function getBuyerAcceptanceChecklistStatusLabel(status: BuyerAcceptanceChecklistStatus): string {
  return checklistStatusLabels[status];
}

export function summarizeBuyerPackStatus(pack: BuyerAcceptancePackSnapshot): string {
  return `${getBuyerAcceptancePackStatusLabel(pack.packStatus)}. Pack is a deterministic draft foundation; not an approval, not an export, not a readiness artifact, not a compliance artifact, and no PDF/download generated.`;
}

export function groupBuyerAcceptanceClaimsByDomain(pack: BuyerAcceptancePackSnapshot): readonly BuyerAcceptanceClaimDomainGroup[] {
  return READINESS_DOMAINS.map(domain => ({
    domain,
    label: getReadinessDomainLabel(domain),
    claims: pack.claims.filter(claim => claim.readinessDomain === domain),
  }));
}

export function getRequiredOpenProofGaps(pack: BuyerAcceptancePackSnapshot) {
  const requiredIds = new Set<string>(REQUIRED_BUYER_ACCEPTANCE_OPEN_GAP_IDS);
  return pack.openProofGaps.filter(gap => requiredIds.has(gap.id));
}

export function getBlockedOrEvidenceRequiredClaims(pack: BuyerAcceptancePackSnapshot): readonly BuyerAcceptanceClaim[] {
  return pack.claims.filter(claim =>
    claim.proofStatus === 'blocked' || claim.proofStatus === 'evidence_required',
  );
}

export function getBuyerPackNonClaimMap(pack: BuyerAcceptancePackSnapshot): ReadonlyMap<string, BuyerAcceptanceNonClaim> {
  return new Map(pack.nonClaims.map(nonClaim => [nonClaim.id, nonClaim]));
}

export function assertBuyerPackNotApproved(pack: BuyerAcceptancePackSnapshot): void {
  if (pack.packStatus === 'approved_for_review') {
    throw new Error('Buyer Acceptance Pack must not be approved for review without AP-approved evidence.');
  }
}

export function assertBuyerPackHasRequiredOpenGaps(pack: BuyerAcceptancePackSnapshot): void {
  const gapIds = new Set(pack.openProofGaps.map(gap => gap.id));
  const missingIds = REQUIRED_BUYER_ACCEPTANCE_OPEN_GAP_IDS.filter(id => !gapIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Buyer Acceptance Pack is missing required open proof gaps: ${missingIds.join(', ')}`);
  }
}

export function assertBuyerPackProofSafeCopy(pack: BuyerAcceptancePackSnapshot): void {
  const presentationCopy = [
    getBuyerAcceptancePackStatusLabel(pack.packStatus),
    summarizeBuyerPackStatus(pack),
    pack.executiveSummary,
    ...pack.claims.flatMap(claim => [
      claim.label,
      claim.buyerSafeClaim,
      claim.limitationDisclosure,
    ]),
    ...pack.moduleSummaries.flatMap(moduleSummary => [
      moduleSummary.moduleName,
      moduleSummary.buyerSafeDescription,
      moduleSummary.limitationDisclosure,
    ]),
    ...pack.buyerReviewChecklist.flatMap((item: BuyerReviewChecklistItem) => [
      item.label,
      item.rationale,
      getBuyerAcceptanceChecklistStatusLabel(item.status),
    ]),
    ...pack.apApprovalChecklist.flatMap((item: ApApprovalChecklistItem) => [
      item.label,
      item.rationale,
      getBuyerAcceptanceChecklistStatusLabel(item.status),
    ]),
  ].join('\n');

  for (const pattern of unsupportedClaimPatterns) {
    if (pattern.test(presentationCopy)) {
      throw new Error(`Buyer Acceptance Pack presentation copy contains unsupported claim wording: ${pattern}`);
    }
  }
}
