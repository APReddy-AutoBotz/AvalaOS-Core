import {
  ADMIN_WORKBENCH_SECTIONS,
  type AdminSectionKey,
} from './adminWorkbenchModel';
import {
  CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
  type BuyerAcceptancePackSnapshot,
  type BuyerAcceptancePackStatus,
} from './buyerAcceptancePackModel';
import {
  CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT,
  type BuyerAcceptanceReviewGateSnapshot,
  type BuyerAcceptanceReviewGateStatus,
} from './buyerAcceptanceReviewGate';

export const BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_GENERATED_AT = '2026-07-04T00:00:00.000Z';

export type BuyerAcceptanceWalkthroughStepKey =
  | 'open_admin_workbench'
  | 'inspect_trust_center'
  | 'inspect_buyer_acceptance_pack'
  | 'inspect_review_rehearsal_gate'
  | 'confirm_export_blocked'
  | 'confirm_readiness_blocked'
  | 'confirm_human_review_required'
  | 'confirm_deferred_proof_tracks';

export type BuyerAcceptanceWalkthroughStatus =
  | 'rehearsal_required'
  | 'evidence_required'
  | 'blocked';

export interface BuyerAcceptanceWalkthroughStep {
  key: BuyerAcceptanceWalkthroughStepKey;
  title: string;
  adminSectionKey: AdminSectionKey;
  status: BuyerAcceptanceWalkthroughStatus;
  instruction: string;
  expectedObservation: string;
  evidenceReference: string;
  mustConfirm: readonly string[];
  mustNotClaim: readonly string[];
  blockedActions: readonly string[];
}

export interface BuyerAcceptanceWalkthroughFinding {
  id: string;
  label: string;
  status: BuyerAcceptanceWalkthroughStatus;
  rationale: string;
  requiredBeforeExport: boolean;
  requiredBeforeBuyerSignoff: boolean;
}

export interface BuyerAcceptanceAdminWalkthroughSnapshot {
  generatedAt: string;
  walkthroughStatus: BuyerAcceptanceWalkthroughStatus;
  sourcePackStatus: BuyerAcceptancePackStatus;
  sourceReviewGateStatus: BuyerAcceptanceReviewGateStatus;
  adminSectionOrder: readonly AdminSectionKey[];
  steps: readonly BuyerAcceptanceWalkthroughStep[];
  findings: readonly BuyerAcceptanceWalkthroughFinding[];
  exportBlockers: readonly string[];
  readinessBlockers: readonly string[];
  deferredTracks: readonly string[];
  summary: string;
}

const WALKTHROUGH_MUST_NOT_CLAIM = [
  'production ready',
  'hosted ready',
  'deployment ready',
  'RLS ready',
  'RLS active',
  'RLS verified',
  'tenant isolation verified',
  'security ready',
  'buyer ready',
  'product ready',
  'release-candidate ready',
  'compliance certified',
  'approved for buyer use',
  'export available',
  'download available',
  'PDF available',
] as const;

const WALKTHROUGH_BLOCKED_ACTIONS = [
  'Do not export the Buyer Acceptance Pack.',
  'Do not generate a PDF.',
  'Do not offer a download.',
  'Do not mark buyer signoff complete.',
  'Do not mark AP approval complete.',
  'Do not change Trust Center proof statuses.',
  'Do not change Buyer Acceptance Pack or Review Gate statuses.',
] as const;

export const BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_READINESS_BLOCKERS = [
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

export const BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_DEFERRED_TRACKS = [
  'export/PDF/download generation',
  'approval workflow',
  'DB-backed persistence',
  'editable buyer controls',
  'Trust Center proof-status changes',
  'Buyer Acceptance Pack status changes',
  'Review Gate status changes',
  'DB/RLS/artifact proof',
  'hosted/deployment/security proof tracks',
] as const;

function buildWalkthroughStatus(
  pack: BuyerAcceptancePackSnapshot,
  gate: BuyerAcceptanceReviewGateSnapshot,
): BuyerAcceptanceWalkthroughStatus {
  if (pack.packStatus === 'blocked' || gate.gateStatus === 'blocked') return 'blocked';
  if (pack.packStatus === 'evidence_required' || gate.gateStatus === 'evidence_required') return 'evidence_required';
  return 'rehearsal_required';
}

function buildExportBlockers(
  pack: BuyerAcceptancePackSnapshot,
  gate: BuyerAcceptanceReviewGateSnapshot,
): readonly string[] {
  return [
    'No export/PDF/download scope approved.',
    `Buyer Acceptance Pack remains ${pack.packStatus}.`,
    `Review Gate remains not review_ready; current status is ${gate.gateStatus}.`,
    'Open proof gaps remain.',
    'Buyer review checklist not complete.',
    'AP approval checklist not complete.',
  ];
}

function buildWalkthroughSteps(status: BuyerAcceptanceWalkthroughStatus): readonly BuyerAcceptanceWalkthroughStep[] {
  return [
    {
      key: 'open_admin_workbench',
      title: 'Open Admin Workbench',
      adminSectionKey: 'overview',
      status: 'rehearsal_required',
      instruction: 'Begin the internal walkthrough rehearsal from the Admin Workbench overview.',
      expectedObservation: 'The Admin Workbench presents the sectioned admin structure without export, download, signoff, or approval actions.',
      evidenceReference: 'services/adminWorkbenchModel.ts and Admin Workbench section order.',
      mustConfirm: [
        'Admin Workbench section order is available for internal rehearsal.',
        'The walkthrough is internal rehearsal evidence only.',
      ],
      mustNotClaim: WALKTHROUGH_MUST_NOT_CLAIM,
      blockedActions: WALKTHROUGH_BLOCKED_ACTIONS,
    },
    {
      key: 'inspect_trust_center',
      title: 'Inspect Trust Center',
      adminSectionKey: 'trust_center',
      status,
      instruction: 'Review read-only Trust Center proof states, evidence references, limitation disclosures, and claim controls.',
      expectedObservation: 'Trust Center proof states remain evidence-gated and do not upgrade blocked platform claims.',
      evidenceReference: 'services/trustCenterModel.ts and services/trustCenterPresentation.ts.',
      mustConfirm: [
        'Proof statuses are inspected as read-only evidence references.',
        'Evidence-required platform claims remain blocked.',
      ],
      mustNotClaim: WALKTHROUGH_MUST_NOT_CLAIM,
      blockedActions: WALKTHROUGH_BLOCKED_ACTIONS,
    },
    {
      key: 'inspect_buyer_acceptance_pack',
      title: 'Inspect Buyer Acceptance Pack',
      adminSectionKey: 'buyer_acceptance_pack',
      status,
      instruction: 'Review the Buyer Acceptance Pack model, open proof gaps, non-claims, and review checklists.',
      expectedObservation: 'Buyer Acceptance Pack remains evidence_required and is not approved for export, review signoff, or maturity claims.',
      evidenceReference: 'services/buyerAcceptancePackModel.ts current snapshot.',
      mustConfirm: [
        'Source pack status remains evidence_required.',
        'Open proof gaps and review checklists remain visible as blockers.',
      ],
      mustNotClaim: WALKTHROUGH_MUST_NOT_CLAIM,
      blockedActions: WALKTHROUGH_BLOCKED_ACTIONS,
    },
    {
      key: 'inspect_review_rehearsal_gate',
      title: 'Inspect Review Rehearsal Gate',
      adminSectionKey: 'buyer_acceptance_review_gate',
      status,
      instruction: 'Review buyer and AP rehearsal questions, expected safe answers, findings, blockers, and required-before-export checklist items.',
      expectedObservation: 'Review Gate remains evidence_required or rehearsal_required and is not review_ready.',
      evidenceReference: 'services/buyerAcceptanceReviewGate.ts current snapshot.',
      mustConfirm: [
        'Review Gate status remains not review_ready.',
        'Reviewer questions preserve expected evidence references and blocked claims.',
      ],
      mustNotClaim: WALKTHROUGH_MUST_NOT_CLAIM,
      blockedActions: WALKTHROUGH_BLOCKED_ACTIONS,
    },
    {
      key: 'confirm_export_blocked',
      title: 'Confirm Export Scope Is Blocked',
      adminSectionKey: 'buyer_acceptance_review_gate',
      status: 'blocked',
      instruction: 'Confirm that export, PDF, and download behavior remains outside this slice.',
      expectedObservation: 'Export/PDF/download remains blocked until a future AP-approved export slice defines scope and evidence boundaries.',
      evidenceReference: 'Review Gate export blockers and Buyer Acceptance Pack AP approval checklist.',
      mustConfirm: [
        'No export/PDF/download scope is approved.',
        'No generated buyer artifact is produced by this walkthrough.',
      ],
      mustNotClaim: WALKTHROUGH_MUST_NOT_CLAIM,
      blockedActions: WALKTHROUGH_BLOCKED_ACTIONS,
    },
    {
      key: 'confirm_readiness_blocked',
      title: 'Confirm Readiness Claims Are Blocked',
      adminSectionKey: 'buyer_acceptance_pack',
      status,
      instruction: 'Confirm readiness claims remain blocked by evidence-required proof tracks.',
      expectedObservation: 'Production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, and compliance claims remain unproven.',
      evidenceReference: 'Buyer Acceptance Pack open proof gaps and Review Gate readiness blockers.',
      mustConfirm: [
        'Readiness claims remain blocked by evidence-required proof tracks.',
        'No proof boundary is upgraded during the walkthrough.',
      ],
      mustNotClaim: WALKTHROUGH_MUST_NOT_CLAIM,
      blockedActions: WALKTHROUGH_BLOCKED_ACTIONS,
    },
    {
      key: 'confirm_human_review_required',
      title: 'Confirm Human Review And AP Approval Remain Required',
      adminSectionKey: 'buyer_acceptance_pack',
      status,
      instruction: 'Confirm buyer signoff and AP approval remain required before any future status or export change.',
      expectedObservation: 'Human review, buyer checklist completion, and AP approval checklist completion remain required and incomplete.',
      evidenceReference: 'Buyer Acceptance Pack buyer review checklist and AP approval checklist.',
      mustConfirm: [
        'Buyer signoff is not complete.',
        'AP approval checklist is not complete.',
      ],
      mustNotClaim: WALKTHROUGH_MUST_NOT_CLAIM,
      blockedActions: WALKTHROUGH_BLOCKED_ACTIONS,
    },
    {
      key: 'confirm_deferred_proof_tracks',
      title: 'Confirm Deferred Proof Tracks',
      adminSectionKey: 'evidence_policy',
      status,
      instruction: 'Confirm future proof tracks remain deferred until separately approved and verified.',
      expectedObservation: 'Export, approval workflow, DB persistence, editable buyer controls, status changes, DB/RLS/artifact proof, and hosted/deployment/security proof remain deferred.',
      evidenceReference: 'Premium enterprise roadmap, evidence policy boundaries, and current walkthrough deferred tracks.',
      mustConfirm: [
        'Deferred tracks are named without implementation in this slice.',
        'No future proof track is treated as complete.',
      ],
      mustNotClaim: WALKTHROUGH_MUST_NOT_CLAIM,
      blockedActions: WALKTHROUGH_BLOCKED_ACTIONS,
    },
  ];
}

function buildFindings(): readonly BuyerAcceptanceWalkthroughFinding[] {
  return [
    {
      id: 'export-not-available',
      label: 'Export, PDF, and download are not available.',
      status: 'blocked',
      rationale: 'No export/PDF/download scope is approved for this model/test/docs slice.',
      requiredBeforeExport: true,
      requiredBeforeBuyerSignoff: false,
    },
    {
      id: 'readiness-not-proven',
      label: 'Readiness is not proven.',
      status: 'evidence_required',
      rationale: 'Required readiness domains remain evidence-required and do not have AP-approved proof.',
      requiredBeforeExport: true,
      requiredBeforeBuyerSignoff: true,
    },
    {
      id: 'buyer-signoff-not-complete',
      label: 'Buyer signoff is not complete.',
      status: 'evidence_required',
      rationale: 'Buyer review checklist items remain required before buyer signoff.',
      requiredBeforeExport: true,
      requiredBeforeBuyerSignoff: true,
    },
    {
      id: 'ap-approval-still-required',
      label: 'AP approval is still required.',
      status: 'evidence_required',
      rationale: 'AP approval checklist items remain required before any status or export scope change.',
      requiredBeforeExport: true,
      requiredBeforeBuyerSignoff: false,
    },
  ];
}

export function buildBuyerAcceptanceAdminWalkthroughSnapshot(
  pack: BuyerAcceptancePackSnapshot = CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
  gate: BuyerAcceptanceReviewGateSnapshot = CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT,
): BuyerAcceptanceAdminWalkthroughSnapshot {
  const walkthroughStatus = buildWalkthroughStatus(pack, gate);

  return {
    generatedAt: BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_GENERATED_AT,
    walkthroughStatus,
    sourcePackStatus: pack.packStatus,
    sourceReviewGateStatus: gate.gateStatus,
    adminSectionOrder: ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
    steps: buildWalkthroughSteps(walkthroughStatus),
    findings: buildFindings(),
    exportBlockers: buildExportBlockers(pack, gate),
    readinessBlockers: [...BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_READINESS_BLOCKERS],
    deferredTracks: [...BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_DEFERRED_TRACKS],
    summary: 'Admin walkthrough can be rehearsed internally against the read-only Admin Workbench sequence. It keeps the Buyer Acceptance Pack and Review Gate evidence-gated, blocks export/PDF/download, and records deferred proof tracks for future AP-approved milestones.',
  };
}

export const CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT =
  buildBuyerAcceptanceAdminWalkthroughSnapshot();
