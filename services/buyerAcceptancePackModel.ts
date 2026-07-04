import {
  REQUIRED_EVIDENCE_CLAIM_IDS,
  buildCurrentTrustCenterSnapshot,
  type ModuleCapabilityState,
  type ProofBoundary,
  type ProofStatus,
  type ReadinessDomain,
  type TrustCenterEvidence,
  type TrustCenterSnapshot,
} from './trustCenterModel';

export const BUYER_ACCEPTANCE_PACK_GENERATED_AT = '2026-07-04T00:00:00.000Z';

export const BUYER_ACCEPTANCE_PACK_STATUSES = [
  'draft_foundation',
  'evidence_required',
  'blocked',
  'approved_for_review',
] as const;

export type BuyerAcceptancePackStatus = typeof BUYER_ACCEPTANCE_PACK_STATUSES[number];

export const BUYER_ACCEPTANCE_PACK_SECTION_KEYS = [
  'executive_summary',
  'claim_map',
  'module_capabilities',
  'evidence_index',
  'limitation_disclosures',
  'open_proof_gaps',
  'non_claims',
  'buyer_review_checklist',
  'ap_approval_checklist',
] as const;

export type BuyerAcceptancePackSectionKey = typeof BUYER_ACCEPTANCE_PACK_SECTION_KEYS[number];

export type BuyerAcceptanceChecklistStatus =
  | 'draft_foundation'
  | 'review_required'
  | 'evidence_required'
  | 'blocked';

export interface BuyerAcceptanceClaim {
  id: string;
  label: string;
  buyerSafeClaim: string;
  proofStatus: ProofStatus;
  proofBoundary: ProofBoundary;
  readinessDomain: ReadinessDomain;
  evidenceReference: string;
  limitationDisclosure: string;
  doesNotProve: readonly string[];
  buyerSafe: boolean;
}

export interface BuyerAcceptanceEvidenceItem {
  id: string;
  milestone: string;
  evidenceDoc: string;
  acceptedStatus: ProofStatus;
  proofBoundary: ProofBoundary;
  summary: string;
  doesNotProve: readonly string[];
}

export interface BuyerAcceptanceModuleSummary {
  moduleKey: string;
  moduleName: string;
  buyerSafeDescription: string;
  proofStatus: ProofStatus;
  proofBoundary: ProofBoundary;
  limitationDisclosure: string;
  blockedClaims: readonly string[];
}

export interface BuyerAcceptanceOpenGap {
  id: string;
  label: string;
  readinessDomain: ReadinessDomain;
  proofStatus: ProofStatus;
  proofBoundary: ProofBoundary;
  blockedWording: string;
  requiredFutureEvidence: string;
  owner: string;
}

export interface BuyerAcceptanceNonClaim {
  id: string;
  prohibitedClaim: string;
  safeAlternative: string;
  reason: string;
}

export interface BuyerReviewChecklistItem {
  id: string;
  label: string;
  status: BuyerAcceptanceChecklistStatus;
  rationale: string;
  requiredBeforeBuyerSignoff: boolean;
}

export interface ApApprovalChecklistItem {
  id: string;
  label: string;
  status: BuyerAcceptanceChecklistStatus;
  rationale: string;
  requiredBeforeStatusChange: boolean;
}

export interface BuyerAcceptancePackSnapshot {
  generatedAt: string;
  packStatus: BuyerAcceptancePackStatus;
  executiveSummary: string;
  claims: readonly BuyerAcceptanceClaim[];
  moduleSummaries: readonly BuyerAcceptanceModuleSummary[];
  evidenceIndex: readonly BuyerAcceptanceEvidenceItem[];
  limitationDisclosures: readonly string[];
  openProofGaps: readonly BuyerAcceptanceOpenGap[];
  nonClaims: readonly BuyerAcceptanceNonClaim[];
  buyerReviewChecklist: readonly BuyerReviewChecklistItem[];
  apApprovalChecklist: readonly ApApprovalChecklistItem[];
}

export const REQUIRED_BUYER_ACCEPTANCE_OPEN_GAP_IDS = REQUIRED_EVIDENCE_CLAIM_IDS;

const READINESS_GAP_EVIDENCE: Record<typeof REQUIRED_EVIDENCE_CLAIM_IDS[number], string> = {
  'rls-readiness': 'AP-approved RLS behavior evidence with defined assertions and accepted output boundaries.',
  'tenant-isolation-proof': 'AP-approved tenant-isolation evidence proving authorized and unauthorized tenant access behavior.',
  'hosted-readiness': 'AP-approved hosted validation evidence for the approved environment and exact acceptance scope.',
  'production-readiness': 'AP-approved production readiness gate evidence covering the accepted release scope.',
  'deployment-readiness': 'AP-approved deployment evidence, rollback evidence, and release operation records.',
  'operational-readiness': 'AP-approved runbook, monitoring, incident, and support evidence.',
  'security-readiness': 'AP-approved security evidence beyond current static guardrails and planning records.',
  'buyer-readiness': 'AP-approved buyer acceptance evidence and signed review boundaries.',
  'product-readiness': 'AP-approved product acceptance evidence for the premium enterprise baseline.',
  'release-candidate-readiness': 'AP-approved release-candidate evidence pack and closure record.',
  'compliance-certification': 'Independent and AP-approved regulated compliance evidence before any certification claim.',
  'local-startup-success': 'AP-approved local startup verification evidence with approved command scope.',
  'artifact-select-isolation': 'AP-approved artifact SELECT isolation evidence with approved tenant and access cases.',
  'schema-readiness': 'AP-approved schema evidence for the accepted database baseline.',
  'rls-helper-readiness': 'AP-approved RLS helper behavior evidence with defined helper scenarios.',
};

export const BUYER_ACCEPTANCE_NON_CLAIMS: readonly BuyerAcceptanceNonClaim[] = [
  {
    id: 'production-ready',
    prohibitedClaim: 'production ready',
    safeAlternative: 'Production readiness remains evidence-required until AP-approved proof exists.',
    reason: 'The current baseline has no production readiness evidence.',
  },
  {
    id: 'hosted-ready',
    prohibitedClaim: 'hosted ready',
    safeAlternative: 'Hosted readiness remains unproven until an approved hosted validation track passes.',
    reason: 'No hosted validation was performed for this foundation slice.',
  },
  {
    id: 'deployment-ready',
    prohibitedClaim: 'deployment ready',
    safeAlternative: 'Deployment readiness remains evidence-required until approved deployment proof exists.',
    reason: 'No deployment or deployment proof was performed.',
  },
  {
    id: 'rls-ready-active-verified',
    prohibitedClaim: 'RLS ready / active / verified',
    safeAlternative: 'RLS behavior remains evidence-required until AP-approved RLS proof exists.',
    reason: 'No DB or RLS execution was performed.',
  },
  {
    id: 'tenant-isolation-verified',
    prohibitedClaim: 'tenant isolation verified',
    safeAlternative: 'Tenant-isolation proof remains evidence-required until approved isolation evidence exists.',
    reason: 'Tenant isolation has not been newly verified.',
  },
  {
    id: 'security-ready',
    prohibitedClaim: 'security ready',
    safeAlternative: 'Security readiness remains evidence-required until approved security proof exists.',
    reason: 'Static guardrails do not prove security readiness.',
  },
  {
    id: 'buyer-ready',
    prohibitedClaim: 'buyer ready',
    safeAlternative: 'Buyer acceptance remains evidence-required until AP-approved buyer review evidence exists.',
    reason: 'This foundation creates a model, not buyer signoff evidence.',
  },
  {
    id: 'product-ready',
    prohibitedClaim: 'product ready',
    safeAlternative: 'Product readiness remains evidence-required until AP acceptance gates are met.',
    reason: 'The premium enterprise baseline has not been accepted as product-ready.',
  },
  {
    id: 'release-candidate-ready',
    prohibitedClaim: 'release-candidate ready',
    safeAlternative: 'Release-candidate readiness remains evidence-required until a future evidence pack is approved.',
    reason: 'No release-candidate packaging or proof was performed.',
  },
  {
    id: 'compliance-certified',
    prohibitedClaim: 'compliance certified',
    safeAlternative: 'Compliance certification must not be claimed without independent approved evidence.',
    reason: 'No compliance certification evidence exists.',
  },
  {
    id: 'jira-replacement',
    prohibitedClaim: 'Jira replacement',
    safeAlternative: 'Avala Delivery is a governed delivery workbench for approved work and handoff lineage.',
    reason: 'Avala Delivery is not positioned as a full issue-tracking replacement.',
  },
  {
    id: 'runtime-execution',
    prohibitedClaim: 'bot/agent/RPA/runtime execution',
    safeAlternative: 'Avala Govern is a governance and control-plane layer in the current baseline.',
    reason: 'No bot, agent, RPA, external action, MCP, A2A, or live runtime enforcement exists in this slice.',
  },
];

const EXECUTIVE_SUMMARY =
  'This deterministic Buyer Acceptance Pack foundation composes current Trust Center claims, evidence references, module limitations, open proof gaps, non-claims, and review checklists into a buyer-safe draft foundation. It is not an approval, export, readiness artifact, or compliance artifact.';

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

function buildControlClaims(snapshot: TrustCenterSnapshot): readonly BuyerAcceptanceClaim[] {
  return snapshot.claimControls.map(control => ({
    id: control.id,
    label: control.label,
    buyerSafeClaim: control.claimText,
    proofStatus: control.proofStatus,
    proofBoundary: control.proofBoundary,
    readinessDomain: control.domain,
    evidenceReference: control.evidenceReference,
    limitationDisclosure: control.blockedWording,
    doesNotProve: [control.blockedWording],
    buyerSafe: true,
  }));
}

function moduleDomain(moduleState: ModuleCapabilityState): ReadinessDomain {
  if (moduleState.moduleKey === 'admin-ai-controls') return 'ai_controls';
  if (moduleState.moduleKey === 'delivery' || moduleState.moduleKey === 'monitor') return 'operations';
  return 'evidence';
}

function buildModuleClaims(snapshot: TrustCenterSnapshot): readonly BuyerAcceptanceClaim[] {
  return snapshot.moduleCapabilityStates.map(moduleState => ({
    id: `module-${moduleState.moduleKey}`,
    label: moduleState.moduleName,
    buyerSafeClaim: moduleState.buyerSafeDescription,
    proofStatus: moduleState.proofStatus,
    proofBoundary: moduleState.proofBoundary,
    readinessDomain: moduleDomain(moduleState),
    evidenceReference: moduleState.evidenceReference,
    limitationDisclosure: moduleState.limitationDisclosure,
    doesNotProve: [...moduleState.blockedClaims],
    buyerSafe: true,
  }));
}

function buildEvidenceIndex(snapshot: TrustCenterSnapshot): readonly BuyerAcceptanceEvidenceItem[] {
  return snapshot.evidence.map((entry: TrustCenterEvidence) => ({
    id: entry.id,
    milestone: entry.milestone,
    evidenceDoc: entry.evidenceDoc,
    acceptedStatus: entry.acceptedStatus,
    proofBoundary: entry.proofBoundary,
    summary: entry.summary,
    doesNotProve: [...entry.doesNotProve],
  }));
}

function buildModuleSummaries(snapshot: TrustCenterSnapshot): readonly BuyerAcceptanceModuleSummary[] {
  return snapshot.moduleCapabilityStates.map(moduleState => ({
    moduleKey: moduleState.moduleKey,
    moduleName: moduleState.moduleName,
    buyerSafeDescription: moduleState.buyerSafeDescription,
    proofStatus: moduleState.proofStatus,
    proofBoundary: moduleState.proofBoundary,
    limitationDisclosure: moduleState.limitationDisclosure,
    blockedClaims: [...moduleState.blockedClaims],
  }));
}

function buildOpenProofGaps(snapshot: TrustCenterSnapshot): readonly BuyerAcceptanceOpenGap[] {
  return REQUIRED_EVIDENCE_CLAIM_IDS.map(id => {
    const control = snapshot.claimControls.find(candidate => candidate.id === id);
    if (!control) {
      throw new Error(`Missing required Buyer Acceptance Pack proof gap: ${id}`);
    }

    return {
      id: control.id,
      label: control.label,
      readinessDomain: control.domain,
      proofStatus: control.proofStatus,
      proofBoundary: control.proofBoundary,
      blockedWording: control.blockedWording,
      requiredFutureEvidence: READINESS_GAP_EVIDENCE[id],
      owner: control.owner,
    };
  });
}

function buildLimitationDisclosures(snapshot: TrustCenterSnapshot): readonly string[] {
  return uniqueStrings([
    ...snapshot.moduleCapabilityStates.map(moduleState => moduleState.limitationDisclosure),
    ...snapshot.claimControls.map(control => control.blockedWording),
    ...BUYER_ACCEPTANCE_NON_CLAIMS.map(nonClaim => nonClaim.safeAlternative),
  ]);
}

function buildBuyerReviewChecklist(): readonly BuyerReviewChecklistItem[] {
  return [
    {
      id: 'review-claim-map',
      label: 'Review the claim map and limitation disclosures.',
      status: 'review_required',
      rationale: 'Buyer review must inspect what is claimed and what remains blocked or evidence-required.',
      requiredBeforeBuyerSignoff: true,
    },
    {
      id: 'review-blocked-evidence-required-claims',
      label: 'Review blocked and evidence-required claims before buyer signoff.',
      status: 'evidence_required',
      rationale: 'Buyer signoff must not proceed as readiness acceptance while proof gaps remain open.',
      requiredBeforeBuyerSignoff: true,
    },
    {
      id: 'review-human-signoff-boundary',
      label: 'Confirm generated documents remain editable review drafts requiring human sign-off.',
      status: 'review_required',
      rationale: 'Avala Studio output must remain a human-reviewed draft artifact.',
      requiredBeforeBuyerSignoff: true,
    },
  ];
}

function buildApApprovalChecklist(): readonly ApApprovalChecklistItem[] {
  return [
    {
      id: 'ap-approved-evidence-for-status-change',
      label: 'Future status changes require AP-approved evidence.',
      status: 'evidence_required',
      rationale: 'No blocked or evidence-required claim can move status without approved proof scope and evidence.',
      requiredBeforeStatusChange: true,
    },
    {
      id: 'ap-approve-export-ui-scope',
      label: 'Approve any future UI, export, PDF, or downloadable pack scope before implementation.',
      status: 'draft_foundation',
      rationale: 'This slice is model/test/docs only and does not produce an artifact.',
      requiredBeforeStatusChange: true,
    },
  ];
}

export function buildBuyerAcceptancePackSnapshot(
  snapshot: TrustCenterSnapshot = buildCurrentTrustCenterSnapshot(),
): BuyerAcceptancePackSnapshot {
  return {
    generatedAt: BUYER_ACCEPTANCE_PACK_GENERATED_AT,
    packStatus: 'evidence_required',
    executiveSummary: EXECUTIVE_SUMMARY,
    claims: [
      ...buildControlClaims(snapshot),
      ...buildModuleClaims(snapshot),
    ],
    moduleSummaries: buildModuleSummaries(snapshot),
    evidenceIndex: buildEvidenceIndex(snapshot),
    limitationDisclosures: buildLimitationDisclosures(snapshot),
    openProofGaps: buildOpenProofGaps(snapshot),
    nonClaims: BUYER_ACCEPTANCE_NON_CLAIMS.map(nonClaim => ({ ...nonClaim })),
    buyerReviewChecklist: buildBuyerReviewChecklist(),
    apApprovalChecklist: buildApApprovalChecklist(),
  };
}

export const CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT = buildBuyerAcceptancePackSnapshot();
