import {
  CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
  type BuyerAcceptanceNonClaim,
  type BuyerAcceptancePackSnapshot,
  type BuyerAcceptancePackStatus,
} from './buyerAcceptancePackModel';

export const BUYER_ACCEPTANCE_REVIEW_GATE_GENERATED_AT = '2026-07-04T00:00:00.000Z';

export type BuyerAcceptanceReviewerRole =
  | 'buyer_executive'
  | 'security_reviewer'
  | 'delivery_owner'
  | 'ap_approver'
  | 'product_owner';

export type BuyerAcceptanceReviewGateStatus =
  | 'rehearsal_required'
  | 'evidence_required'
  | 'blocked'
  | 'review_ready';

export type BuyerAcceptanceReviewFindingSeverity = 'medium' | 'high' | 'blocker';

export type BuyerAcceptanceReviewFindingStatus =
  | 'rehearsal_required'
  | 'evidence_required'
  | 'blocked';

export type BuyerAcceptanceReviewGateChecklistStatus =
  | 'rehearsal_required'
  | 'evidence_required'
  | 'blocked';

export interface BuyerAcceptanceReviewQuestion {
  id: string;
  role: BuyerAcceptanceReviewerRole;
  question: string;
  expectedEvidenceReference: string;
  expectedSafeAnswer: string;
  mustNotClaim: readonly string[];
  relatedOpenGapIds: readonly string[];
  requiredBeforeExport: boolean;
}

export interface BuyerAcceptanceReviewFinding {
  id: string;
  label: string;
  severity: BuyerAcceptanceReviewFindingSeverity;
  status: BuyerAcceptanceReviewFindingStatus;
  rationale: string;
  relatedClaimIds: readonly string[];
  relatedOpenGapIds: readonly string[];
  requiredAction: string;
}

export interface BuyerAcceptanceReviewGateChecklistItem {
  id: string;
  label: string;
  status: BuyerAcceptanceReviewGateChecklistStatus;
  rationale: string;
  requiredBeforeExport: boolean;
  requiredBeforeBuyerReview: boolean;
}

export interface BuyerAcceptanceReviewGateSnapshot {
  generatedAt: string;
  gateStatus: BuyerAcceptanceReviewGateStatus;
  sourcePackStatus: BuyerAcceptancePackStatus;
  reviewerQuestions: readonly BuyerAcceptanceReviewQuestion[];
  findings: readonly BuyerAcceptanceReviewFinding[];
  checklist: readonly BuyerAcceptanceReviewGateChecklistItem[];
  prohibitedClaims: readonly BuyerAcceptanceNonClaim[];
  exportBlockers: readonly string[];
  readinessBlockers: readonly string[];
  summary: string;
}

const REVIEW_GATE_READINESS_BLOCKERS = [
  'production readiness',
  'hosted readiness',
  'deployment readiness',
  'RLS readiness',
  'tenant-isolation proof',
  'security readiness',
  'buyer readiness',
  'product readiness',
  'release-candidate readiness',
  'compliance certification',
] as const;

function copyNonClaims(pack: BuyerAcceptancePackSnapshot): readonly BuyerAcceptanceNonClaim[] {
  return pack.nonClaims.map(nonClaim => ({ ...nonClaim }));
}

function relatedGapIds(pack: BuyerAcceptancePackSnapshot, ids: readonly string[]): readonly string[] {
  const existingIds = new Set(pack.openProofGaps.map(gap => gap.id));
  return ids.filter(id => existingIds.has(id));
}

function prohibitedClaimText(pack: BuyerAcceptancePackSnapshot, ids: readonly string[]): readonly string[] {
  const nonClaimById = new Map(pack.nonClaims.map(nonClaim => [nonClaim.id, nonClaim.prohibitedClaim]));
  return ids.map(id => nonClaimById.get(id)).filter((value): value is string => Boolean(value));
}

function allProhibitedClaimText(pack: BuyerAcceptancePackSnapshot): readonly string[] {
  return pack.nonClaims.map(nonClaim => nonClaim.prohibitedClaim);
}

function buildReviewerQuestions(pack: BuyerAcceptancePackSnapshot): readonly BuyerAcceptanceReviewQuestion[] {
  const allMustNotClaim = allProhibitedClaimText(pack);
  const allOpenGapIds = pack.openProofGaps.map(gap => gap.id);

  return [
    {
      id: 'safe-claim-today',
      role: 'buyer_executive',
      question: 'What can AvalaOS safely claim today?',
      expectedEvidenceReference: 'Buyer Acceptance Pack claim map and Trust Center evidence references.',
      expectedSafeAnswer: 'AvalaOS can describe deterministic demo behavior, governed review surfaces, current evidence references, and explicit limitations. Capability maturity remains evidence-gated.',
      mustNotClaim: allMustNotClaim,
      relatedOpenGapIds: allOpenGapIds,
      requiredBeforeExport: true,
    },
    {
      id: 'trust-center-evidence-proves',
      role: 'buyer_executive',
      question: 'What does the Trust Center evidence prove?',
      expectedEvidenceReference: 'Trust Center evidence index and proof-status model.',
      expectedSafeAnswer: 'Trust Center evidence supports only the listed claim controls, accepted evidence references, and deterministic regression-tested behavior. It does not upgrade blocked or evidence-required platform claims.',
      mustNotClaim: allMustNotClaim,
      relatedOpenGapIds: allOpenGapIds,
      requiredBeforeExport: true,
    },
    {
      id: 'evidence-does-not-prove',
      role: 'buyer_executive',
      question: 'What does the evidence not prove?',
      expectedEvidenceReference: 'Buyer Acceptance Pack does-not-prove lists and limitation disclosures.',
      expectedSafeAnswer: 'The evidence does not prove production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, or certification outcomes. Those topics remain evidence-required.',
      mustNotClaim: allMustNotClaim,
      relatedOpenGapIds: allOpenGapIds,
      requiredBeforeExport: true,
    },
    {
      id: 'govern-runtime-boundary',
      role: 'security_reviewer',
      question: 'Is Avala Govern a runtime execution layer?',
      expectedEvidenceReference: 'Source-of-truth Avala Govern boundary and Buyer Acceptance Pack runtime-execution non-claim.',
      expectedSafeAnswer: 'Avala Govern is a governance and control-plane surface in the current baseline. It does not execute bots, agents, RPA jobs, external-system actions, MCP controls, A2A controls, or live runtime enforcement.',
      mustNotClaim: prohibitedClaimText(pack, ['runtime-execution']),
      relatedOpenGapIds: [],
      requiredBeforeExport: true,
    },
    {
      id: 'delivery-jira-boundary',
      role: 'delivery_owner',
      question: 'Is Avala Delivery a Jira replacement?',
      expectedEvidenceReference: 'Source-of-truth Avala Delivery boundary and Buyer Acceptance Pack Jira replacement non-claim.',
      expectedSafeAnswer: 'Avala Delivery is a governed delivery workbench for approved work, owners, blockers, handoff lineage, delivery packs, evidence checklists, and downstream handoff. It is not positioned as a full issue-tracking replacement.',
      mustNotClaim: prohibitedClaimText(pack, ['jira-replacement']),
      relatedOpenGapIds: [],
      requiredBeforeExport: true,
    },
    {
      id: 'generated-documents-boundary',
      role: 'delivery_owner',
      question: 'Are generated documents final approved outputs?',
      expectedEvidenceReference: 'Buyer review checklist human sign-off boundary.',
      expectedSafeAnswer: 'Generated documents remain editable review drafts and require human sign-off before downstream use or buyer acceptance.',
      mustNotClaim: ['final approved output', 'autonomous approval'],
      relatedOpenGapIds: [],
      requiredBeforeExport: true,
    },
    {
      id: 'rls-proof-boundary',
      role: 'security_reviewer',
      question: 'Is RLS verified?',
      expectedEvidenceReference: 'evidence required: AP-approved RLS behavior evidence is not present.',
      expectedSafeAnswer: 'RLS behavior remains evidence-required. No approved DB or RLS proof was performed for this baseline.',
      mustNotClaim: prohibitedClaimText(pack, ['rls-ready-active-verified']),
      relatedOpenGapIds: relatedGapIds(pack, ['rls-readiness']),
      requiredBeforeExport: true,
    },
    {
      id: 'tenant-isolation-proof-boundary',
      role: 'security_reviewer',
      question: 'Is tenant isolation verified?',
      expectedEvidenceReference: 'evidence required: AP-approved tenant-isolation proof is not present.',
      expectedSafeAnswer: 'Tenant-isolation proof remains evidence-required. No approved isolation evidence exists for this baseline.',
      mustNotClaim: prohibitedClaimText(pack, ['tenant-isolation-verified']),
      relatedOpenGapIds: relatedGapIds(pack, ['tenant-isolation-proof']),
      requiredBeforeExport: true,
    },
    {
      id: 'security-proof-boundary',
      role: 'security_reviewer',
      question: 'Is security readiness proven?',
      expectedEvidenceReference: 'evidence required: AP-approved security evidence is not present.',
      expectedSafeAnswer: 'Security posture remains evidence-required beyond current static guardrails and planning records.',
      mustNotClaim: prohibitedClaimText(pack, ['security-ready']),
      relatedOpenGapIds: relatedGapIds(pack, ['security-readiness']),
      requiredBeforeExport: true,
    },
    {
      id: 'production-proof-boundary',
      role: 'ap_approver',
      question: 'Is production readiness proven?',
      expectedEvidenceReference: 'evidence required: AP-approved production, hosted, and deployment evidence is not present.',
      expectedSafeAnswer: 'Production, hosted, and deployment maturity remains evidence-required until AP-approved proof exists.',
      mustNotClaim: prohibitedClaimText(pack, ['production-ready', 'hosted-ready', 'deployment-ready']),
      relatedOpenGapIds: relatedGapIds(pack, ['production-readiness', 'hosted-readiness', 'deployment-readiness']),
      requiredBeforeExport: true,
    },
    {
      id: 'compliance-certification-boundary',
      role: 'ap_approver',
      question: 'Is compliance certification claimed?',
      expectedEvidenceReference: 'evidence required: independent and AP-approved regulated compliance evidence is not present.',
      expectedSafeAnswer: 'Compliance certification is not claimed. Any certification statement requires independent approved evidence before use.',
      mustNotClaim: prohibitedClaimText(pack, ['compliance-certified']),
      relatedOpenGapIds: relatedGapIds(pack, ['compliance-certification']),
      requiredBeforeExport: true,
    },
    {
      id: 'pack-approved-export-boundary',
      role: 'product_owner',
      question: 'Is the Buyer Acceptance Pack approved/export-ready?',
      expectedEvidenceReference: 'Buyer Acceptance Pack status, buyer review checklist, AP approval checklist, and open proof gaps.',
      expectedSafeAnswer: 'The Buyer Acceptance Pack remains evidence-required and is not approved for review or export. Export, PDF, download, buyer signoff, and status changes remain blocked until future AP-approved scope and evidence exist.',
      mustNotClaim: ['approved for review', 'export approved', 'downloadable buyer artifact'],
      relatedOpenGapIds: allOpenGapIds,
      requiredBeforeExport: true,
    },
  ];
}

function buildFindings(pack: BuyerAcceptancePackSnapshot): readonly BuyerAcceptanceReviewFinding[] {
  const claimIds = pack.claims.map(claim => claim.id);

  return [
    {
      id: 'export-pdf-download-not-approved',
      label: 'Export/PDF/download scope is not approved.',
      severity: 'blocker',
      status: 'blocked',
      rationale: 'The current baseline has a read-only Admin UI and deterministic models only.',
      relatedClaimIds: [],
      relatedOpenGapIds: [],
      requiredAction: 'Define and approve future export, PDF, and download scope before implementation.',
    },
    {
      id: 'pack-not-approved-for-review',
      label: 'Pack is not approved for review.',
      severity: 'blocker',
      status: 'evidence_required',
      rationale: `The source pack status is ${pack.packStatus}, not approved_for_review.`,
      relatedClaimIds: claimIds,
      relatedOpenGapIds: pack.openProofGaps.map(gap => gap.id),
      requiredAction: 'Complete AP-approved proof scope and review gates before any status change.',
    },
    {
      id: 'rls-readiness-evidence-missing',
      label: 'RLS readiness evidence is missing.',
      severity: 'blocker',
      status: 'evidence_required',
      rationale: 'No approved DB/RLS proof exists in the current baseline.',
      relatedClaimIds: ['rls-readiness'],
      relatedOpenGapIds: relatedGapIds(pack, ['rls-readiness']),
      requiredAction: 'Run only a future AP-approved RLS proof track with defined assertions and output boundaries.',
    },
    {
      id: 'tenant-isolation-proof-missing',
      label: 'Tenant-isolation proof is missing.',
      severity: 'blocker',
      status: 'evidence_required',
      rationale: 'No approved tenant-isolation evidence exists in the current baseline.',
      relatedClaimIds: ['tenant-isolation-proof'],
      relatedOpenGapIds: relatedGapIds(pack, ['tenant-isolation-proof']),
      requiredAction: 'Run only a future AP-approved tenant-isolation proof track.',
    },
    {
      id: 'security-readiness-evidence-missing',
      label: 'Security readiness evidence is missing.',
      severity: 'blocker',
      status: 'evidence_required',
      rationale: 'Static guardrails and planning records do not prove broader security posture.',
      relatedClaimIds: ['security-readiness'],
      relatedOpenGapIds: relatedGapIds(pack, ['security-readiness']),
      requiredAction: 'Define future AP-approved security evidence scope before any claim change.',
    },
    {
      id: 'production-hosted-deployment-readiness-missing',
      label: 'Production, hosted, and deployment readiness evidence is missing.',
      severity: 'blocker',
      status: 'evidence_required',
      rationale: 'No hosted validation, deployment validation, or production gate proof exists in the current baseline.',
      relatedClaimIds: ['production-readiness', 'hosted-readiness', 'deployment-readiness'],
      relatedOpenGapIds: relatedGapIds(pack, ['production-readiness', 'hosted-readiness', 'deployment-readiness']),
      requiredAction: 'Keep these claims blocked until future AP-approved proof tracks complete.',
    },
    {
      id: 'compliance-certification-not-available',
      label: 'Compliance certification is not available.',
      severity: 'blocker',
      status: 'blocked',
      rationale: 'No independent approved regulated compliance evidence exists.',
      relatedClaimIds: ['compliance-certification'],
      relatedOpenGapIds: relatedGapIds(pack, ['compliance-certification']),
      requiredAction: 'Do not use certification language without independent approved evidence.',
    },
    {
      id: 'buyer-signoff-not-complete',
      label: 'Buyer signoff is not complete.',
      severity: 'blocker',
      status: 'evidence_required',
      rationale: 'Required buyer review checklist items remain review-required or evidence-required.',
      relatedClaimIds: claimIds,
      relatedOpenGapIds: pack.openProofGaps.map(gap => gap.id),
      requiredAction: 'Complete buyer review and AP approval prerequisites before signoff.',
    },
  ];
}

function buildExportBlockers(pack: BuyerAcceptancePackSnapshot): readonly string[] {
  return [
    'No export/PDF/download scope approved.',
    `Pack status is ${pack.packStatus}.`,
    'Open proof gaps remain.',
    'Buyer review checklist is not completed.',
    'AP approval checklist is not completed.',
  ];
}

function buildChecklist(pack: BuyerAcceptancePackSnapshot): readonly BuyerAcceptanceReviewGateChecklistItem[] {
  const buyerReviewBlocked = pack.buyerReviewChecklist.some(item =>
    item.requiredBeforeBuyerSignoff && (item.status === 'evidence_required' || item.status === 'review_required' || item.status === 'blocked'),
  );
  const apApprovalBlocked = pack.apApprovalChecklist.some(item =>
    item.requiredBeforeStatusChange && (item.status === 'evidence_required' || item.status === 'review_required' || item.status === 'blocked'),
  );

  return [
    {
      id: 'complete-review-rehearsal',
      label: 'Complete all reviewer role questions.',
      status: 'rehearsal_required',
      rationale: 'The pack must survive a deterministic review rehearsal before any future export surface.',
      requiredBeforeExport: true,
      requiredBeforeBuyerReview: true,
    },
    {
      id: 'resolve-open-proof-gaps',
      label: 'Resolve required open proof gaps through AP-approved evidence.',
      status: pack.openProofGaps.length > 0 ? 'evidence_required' : 'rehearsal_required',
      rationale: 'Open proof gaps block export and readiness language.',
      requiredBeforeExport: true,
      requiredBeforeBuyerReview: true,
    },
    {
      id: 'complete-buyer-review-checklist',
      label: 'Complete buyer review checklist prerequisites.',
      status: buyerReviewBlocked ? 'evidence_required' : 'rehearsal_required',
      rationale: 'Buyer signoff remains blocked while required review items are incomplete.',
      requiredBeforeExport: true,
      requiredBeforeBuyerReview: true,
    },
    {
      id: 'complete-ap-approval-checklist',
      label: 'Complete AP approval checklist prerequisites.',
      status: apApprovalBlocked ? 'evidence_required' : 'rehearsal_required',
      rationale: 'AP-approved evidence remains required before any pack status change.',
      requiredBeforeExport: true,
      requiredBeforeBuyerReview: false,
    },
    {
      id: 'approve-export-scope',
      label: 'Approve future export, PDF, and download scope separately.',
      status: 'blocked',
      rationale: 'This slice is model/test/docs only and does not authorize an artifact surface.',
      requiredBeforeExport: true,
      requiredBeforeBuyerReview: false,
    },
  ];
}

function buildGateStatus(pack: BuyerAcceptancePackSnapshot): BuyerAcceptanceReviewGateStatus {
  if (pack.openProofGaps.length > 0) return 'evidence_required';
  return 'rehearsal_required';
}

export function buildBuyerAcceptanceReviewGateSnapshot(
  pack: BuyerAcceptancePackSnapshot = CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
): BuyerAcceptanceReviewGateSnapshot {
  const exportBlockers = buildExportBlockers(pack);
  const readinessBlockers = [...REVIEW_GATE_READINESS_BLOCKERS];

  return {
    generatedAt: BUYER_ACCEPTANCE_REVIEW_GATE_GENERATED_AT,
    gateStatus: buildGateStatus(pack),
    sourcePackStatus: pack.packStatus,
    reviewerQuestions: buildReviewerQuestions(pack),
    findings: buildFindings(pack),
    checklist: buildChecklist(pack),
    prohibitedClaims: copyNonClaims(pack),
    exportBlockers,
    readinessBlockers,
    summary: 'Review rehearsal gate remains evidence-required. It rehearses buyer questions and blocks export/PDF/download, buyer signoff, and maturity language until AP-approved evidence and explicit approval scope exist.',
  };
}

export const CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT = buildBuyerAcceptanceReviewGateSnapshot();
