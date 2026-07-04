import {
  ADMIN_WORKBENCH_SECTIONS,
  type AdminSectionKey,
} from './adminWorkbenchModel';
import {
  CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT,
  type BuyerAcceptanceWalkthroughStatus,
} from './buyerAcceptanceAdminWalkthrough';
import {
  CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
  type BuyerAcceptancePackStatus,
} from './buyerAcceptancePackModel';
import {
  CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT,
  type BuyerAcceptanceReviewGateStatus,
} from './buyerAcceptanceReviewGate';

export const BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_GENERATED_AT = '2026-07-04T00:00:00.000Z';

export type BuyerAcceptanceBrowserWalkthroughPlanStatus =
  | 'planned'
  | 'rehearsal_required'
  | 'blocked';

export type BuyerAcceptanceBrowserWalkthroughStepKey =
  | 'launch_admin_workbench_view'
  | 'inspect_trust_center_section'
  | 'inspect_buyer_acceptance_pack_section'
  | 'inspect_review_rehearsal_gate_section'
  | 'inspect_admin_walkthrough_section'
  | 'confirm_no_export_actions'
  | 'confirm_no_browser_or_screenshot_evidence'
  | 'confirm_no_readiness_claims'
  | 'confirm_deferred_tracks_visible'
  | 'close_without_status_change';

export type BuyerAcceptanceBrowserWalkthroughStopSeverity = 'medium' | 'high' | 'blocker';

export interface BuyerAcceptanceBrowserWalkthroughStep {
  key: BuyerAcceptanceBrowserWalkthroughStepKey;
  title: string;
  adminSectionKey: AdminSectionKey;
  planStatus: BuyerAcceptanceBrowserWalkthroughPlanStatus;
  plannedObservation: string;
  allowedInspection: string;
  prohibitedAction: readonly string[];
  expectedSafeText: readonly string[];
  mustNotClaim: readonly string[];
  evidenceBoundary: string;
}

export interface BuyerAcceptanceBrowserWalkthroughStopCondition {
  id: string;
  label: string;
  reason: string;
  severity: BuyerAcceptanceBrowserWalkthroughStopSeverity;
  requiredResponse: string;
}

export interface BuyerAcceptanceBrowserWalkthroughPlanSnapshot {
  generatedAt: string;
  planStatus: BuyerAcceptanceBrowserWalkthroughPlanStatus;
  sourceAdminWalkthroughStatus: BuyerAcceptanceWalkthroughStatus;
  sourcePackStatus: BuyerAcceptancePackStatus;
  sourceReviewGateStatus: BuyerAcceptanceReviewGateStatus;
  adminSectionOrder: readonly AdminSectionKey[];
  plannedSteps: readonly BuyerAcceptanceBrowserWalkthroughStep[];
  allowedActions: readonly string[];
  prohibitedActions: readonly string[];
  expectedSafeText: readonly string[];
  stopConditions: readonly BuyerAcceptanceBrowserWalkthroughStopCondition[];
  deferredExecutionTracks: readonly string[];
  proofBoundary: string;
  summary: string;
}

const EXPECTED_SAFE_TEXT = [
  'read-only internal rehearsal',
  'browser walkthrough remains plan-only',
  'no browser run was performed',
  'no screenshot was captured',
  'no readiness evidence was produced',
  'export/PDF/download remains blocked',
  'not an approval',
  'not an export',
  'not readiness evidence',
  'not compliance evidence',
  'deferred proof tracks remain visible',
] as const;

const MUST_NOT_CLAIM = [
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
  'screenshot evidence captured',
  'browser walkthrough verified',
  'browser test passed',
  'walkthrough complete',
] as const;

const ALLOWED_ACTIONS = [
  'Open the local app view only when future AP approval exists.',
  'Navigate read-only Admin sections for observation only.',
  'Observe labels, statuses, blockers, and deferred states.',
  'Record textual observations in a future evidence document.',
] as const;

const PROHIBITED_ACTIONS = [
  'Do not execute browser automation in this slice.',
  'Do not capture screenshots.',
  'Do not compare screenshots.',
  'Do not generate exports.',
  'Do not generate PDFs.',
  'Do not generate downloads.',
  'Do not approve, sign off, complete, or change any status.',
  'Do not execute DB, RLS, or artifact checks.',
  'Do not perform hosted or deployment validation.',
  'Do not execute providers or classifiers.',
  'Do not inspect schema.',
  'Do not execute real assertions.',
] as const;

const DEFERRED_EXECUTION_TRACKS = [
  'AP-approved browser walkthrough execution',
  'AP-approved screenshot capture',
  'AP-approved screenshot evidence policy',
  'export/PDF/download design',
  'approval workflow design',
  'DB-backed persistence',
  'editable buyer controls',
  'DB/RLS/artifact proof',
  'hosted/deployment/security proof tracks',
] as const;

const PLAN_PROOF_BOUNDARY =
  'This deterministic plan defines a future browser walkthrough rehearsal path only. It performs no browser run, captures no screenshot, produces no export/PDF/download, changes no status, and produces no readiness evidence.';

function step(
  key: BuyerAcceptanceBrowserWalkthroughStepKey,
  title: string,
  adminSectionKey: AdminSectionKey,
  planStatus: BuyerAcceptanceBrowserWalkthroughPlanStatus,
  plannedObservation: string,
  allowedInspection: string,
  evidenceBoundary: string,
  expectedSafeText: readonly string[] = EXPECTED_SAFE_TEXT,
): BuyerAcceptanceBrowserWalkthroughStep {
  return {
    key,
    title,
    adminSectionKey,
    planStatus,
    plannedObservation,
    allowedInspection,
    prohibitedAction: PROHIBITED_ACTIONS,
    expectedSafeText,
    mustNotClaim: MUST_NOT_CLAIM,
    evidenceBoundary,
  };
}

function buildPlannedSteps(): readonly BuyerAcceptanceBrowserWalkthroughStep[] {
  return [
    step(
      'launch_admin_workbench_view',
      'Launch Admin Workbench View',
      'overview',
      'planned',
      'The future walkthrough starts at the Admin Workbench shell and observes section labels and proof-safe overview text.',
      'Inspect the Admin Workbench view only after future AP approval authorizes a browser run.',
      'Planning only; no browser session is opened by this slice.',
    ),
    step(
      'inspect_trust_center_section',
      'Inspect Trust Center Section',
      'trust_center',
      'planned',
      'Trust Center proof states remain evidence-gated and do not upgrade blocked platform claims.',
      'Navigate to the read-only Trust Center section and observe claim controls, evidence references, and limitation disclosures.',
      'Observation only; no proof-status change is allowed.',
    ),
    step(
      'inspect_buyer_acceptance_pack_section',
      'Inspect Buyer Acceptance Pack Section',
      'buyer_acceptance_pack',
      'planned',
      'The Buyer Acceptance Pack remains evidence-required with open proof gaps, non-claims, and review checklist blockers visible.',
      'Navigate to the read-only Buyer Acceptance Pack section and observe evidence-required status and blocked export language.',
      'Observation only; no export, approval, or pack status change is allowed.',
    ),
    step(
      'inspect_review_rehearsal_gate_section',
      'Inspect Review Rehearsal Gate Section',
      'buyer_acceptance_review_gate',
      'planned',
      'The Review Rehearsal Gate remains not review-ready and preserves buyer/AP questions, expected safe answers, findings, and blockers.',
      'Navigate to the read-only Review Rehearsal Gate section and observe reviewer questions and blocked export scope.',
      'Observation only; no buyer review approval, AP approval, or gate status change is allowed.',
    ),
    step(
      'inspect_admin_walkthrough_section',
      'Inspect Admin Walkthrough Section',
      'buyer_acceptance_admin_walkthrough',
      'planned',
      'The Admin Walkthrough remains read-only internal rehearsal with grouped steps, expected observations, findings, blockers, and deferred tracks.',
      'Navigate to the read-only Admin Walkthrough section and observe the deterministic walkthrough snapshot rendering.',
      'Observation only; no browser evidence, screenshot evidence, approval, or completion state is produced.',
    ),
    step(
      'confirm_no_export_actions',
      'Confirm No Export Actions',
      'buyer_acceptance_pack',
      'blocked',
      'Export, download, and PDF behavior is absent as an available action and appears only as blocked or deferred scope.',
      'Inspect visible controls and copy for export/PDF/download language only as blocked or deferred.',
      'Stop if any export, PDF, or download action appears available.',
      [
        'export/PDF/download remains blocked',
        'not an export',
        'no readiness evidence was produced',
      ],
    ),
    step(
      'confirm_no_browser_or_screenshot_evidence',
      'Confirm No Browser Or Screenshot Evidence',
      'buyer_acceptance_admin_walkthrough',
      'blocked',
      'Browser automation and screenshot capture remain not implemented in this plan slice.',
      'Inspect copy for browser and screenshot boundaries without running a browser or capturing screenshots.',
      'Stop if browser automation or screenshot evidence is produced by this slice.',
      [
        'browser walkthrough remains plan-only',
        'no browser run was performed',
        'no screenshot was captured',
      ],
    ),
    step(
      'confirm_no_readiness_claims',
      'Confirm No Readiness Claims',
      'trust_center',
      'blocked',
      'Production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, and compliance claims remain blocked or evidence-required.',
      'Inspect read-only copy for blocked or evidence-required readiness boundaries.',
      'Stop if any unsupported readiness or certification claim appears.',
      [
        'not readiness evidence',
        'not compliance evidence',
        'no readiness evidence was produced',
      ],
    ),
    step(
      'confirm_deferred_tracks_visible',
      'Confirm Deferred Tracks Visible',
      'buyer_acceptance_admin_walkthrough',
      'planned',
      'Deferred execution tracks remain visible as future AP-approved work, not implemented capability.',
      'Inspect deferred tracks for browser execution, screenshot policy, export design, approval workflow, persistence, editable controls, and proof tracks.',
      'Observation only; no deferred track is started or marked complete.',
      [
        'deferred proof tracks remain visible',
        'browser walkthrough remains plan-only',
        'export/PDF/download remains blocked',
      ],
    ),
    step(
      'close_without_status_change',
      'Close Without Status Change',
      'overview',
      'planned',
      'The future walkthrough closes without changing Trust Center, Buyer Acceptance Pack, Review Gate, Admin Walkthrough, or Admin Workbench status behavior.',
      'Record textual observations in future evidence only after AP-approved execution scope exists.',
      'Planning only; no status, approval, signoff, export, or evidence status changes occur in this slice.',
    ),
  ];
}

function buildStopConditions(): readonly BuyerAcceptanceBrowserWalkthroughStopCondition[] {
  return [
    {
      id: 'export-download-pdf-action-available',
      label: 'Export/download/PDF action appears available.',
      reason: 'The current baseline blocks export, PDF, and download generation.',
      severity: 'blocker',
      requiredResponse: 'Stop the walkthrough and record the action as out of scope for this plan slice.',
    },
    {
      id: 'approval-signoff-complete-status-action-available',
      label: 'Approve, signoff, complete, or status-change action appears.',
      reason: 'The plan must not add or execute approval workflow behavior.',
      severity: 'blocker',
      requiredResponse: 'Stop the walkthrough and preserve current statuses.',
    },
    {
      id: 'readiness-certification-claim-visible',
      label: 'Readiness or certification claim appears.',
      reason: 'Readiness and certification claims remain evidence-required or blocked.',
      severity: 'blocker',
      requiredResponse: 'Stop and correct copy through a future approved claim-control slice.',
    },
    {
      id: 'browser-or-screenshot-evidence-produced',
      label: 'Browser or screenshot evidence is produced in this plan slice.',
      reason: 'This slice is model/test/docs only and does not authorize browser execution or screenshot capture.',
      severity: 'blocker',
      requiredResponse: 'Stop, remove produced evidence from scope, and require AP-approved execution scope.',
    },
    {
      id: 'generated-artifact-in-scope',
      label: 'Generated artifact appears in scope.',
      reason: 'This plan does not generate exports, PDFs, downloads, screenshots, or other artifacts.',
      severity: 'high',
      requiredResponse: 'Stop and exclude generated artifacts from this slice.',
    },
    {
      id: 'prohibited-command-required',
      label: 'DB/RLS/artifact/hosted/deployment command is required.',
      reason: 'This slice does not authorize DB, RLS, artifact, hosted, deployment, provider, classifier, schema, or real assertion execution.',
      severity: 'blocker',
      requiredResponse: 'Stop and request a future AP-approved proof track with exact command boundaries.',
    },
  ];
}

export function buildBuyerAcceptanceBrowserWalkthroughPlanSnapshot(): BuyerAcceptanceBrowserWalkthroughPlanSnapshot {
  const adminWalkthrough = CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT;
  const pack = CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT;
  const reviewGate = CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT;

  return {
    generatedAt: BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_GENERATED_AT,
    planStatus: 'planned',
    sourceAdminWalkthroughStatus: adminWalkthrough.walkthroughStatus,
    sourcePackStatus: pack.packStatus,
    sourceReviewGateStatus: reviewGate.gateStatus,
    adminSectionOrder: ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
    plannedSteps: buildPlannedSteps(),
    allowedActions: ALLOWED_ACTIONS,
    prohibitedActions: PROHIBITED_ACTIONS,
    expectedSafeText: EXPECTED_SAFE_TEXT,
    stopConditions: buildStopConditions(),
    deferredExecutionTracks: DEFERRED_EXECUTION_TRACKS,
    proofBoundary: PLAN_PROOF_BOUNDARY,
    summary: 'This is a future browser walkthrough plan for the read-only Admin buyer-review journey. No browser run was performed, no screenshot was captured, no readiness evidence was produced, and export/PDF/download remains blocked until future AP-approved scope exists.',
  };
}

export const CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT =
  buildBuyerAcceptanceBrowserWalkthroughPlanSnapshot();
