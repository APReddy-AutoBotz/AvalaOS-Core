import {
  ADMIN_WORKBENCH_SECTIONS,
  type AdminSectionKey,
} from './adminWorkbenchModel';
import {
  CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT,
  type BuyerAcceptanceWalkthroughStatus,
} from './buyerAcceptanceAdminWalkthrough';
import {
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT,
  type BuyerAcceptanceBrowserExecutionApprovalStatus,
  type BuyerAcceptanceBrowserExecutionBoundaryStatus,
} from './buyerAcceptanceBrowserWalkthroughExecutionBoundary';
import {
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_EXECUTION_APPROVAL_SNAPSHOT,
  type BuyerAcceptanceManualExecutionApprovalDecisionStatus,
  type BuyerAcceptanceManualExecutionApprovalRecordStatus,
} from './buyerAcceptanceBrowserWalkthroughManualExecutionApproval';
import {
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT,
  type BuyerAcceptanceManualRunbookExecutionStatus,
  type BuyerAcceptanceManualRunbookStatus,
} from './buyerAcceptanceBrowserWalkthroughManualRunbook';
import {
  CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT,
  type BuyerAcceptanceBrowserWalkthroughPlanStatus,
} from './buyerAcceptanceBrowserWalkthroughPlan';
import {
  CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
  type BuyerAcceptancePackStatus,
} from './buyerAcceptancePackModel';
import {
  CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT,
  type BuyerAcceptanceReviewGateStatus,
} from './buyerAcceptanceReviewGate';

export const BUYER_ACCEPTANCE_MANUAL_BROWSER_PRE_EXECUTION_READINESS_GENERATED_AT =
  '2026-07-05T00:00:00.000Z';

export type BuyerAcceptanceManualBrowserPreExecutionReadinessStatus =
  | 'ready_for_ap_decision'
  | 'decision_required'
  | 'blocked';

export type BuyerAcceptanceManualBrowserExecutionPermissionStatus =
  | 'not_approved'
  | 'ap_decision_required'
  | 'blocked';

export type BuyerAcceptanceManualBrowserPreExecutionStopSeverity = 'high' | 'blocker';

export interface BuyerAcceptanceManualBrowserPreExecutionReadinessCheck {
  id: string;
  label: string;
  status: BuyerAcceptanceManualBrowserPreExecutionReadinessStatus;
  source: string;
  requirement: string;
  evidenceAvailable: boolean;
  blockerIfMissing: string;
  proofBoundary: string;
}

export interface BuyerAcceptanceManualBrowserPreExecutionStopCondition {
  id: string;
  label: string;
  trigger: string;
  requiredResponse: string;
  severity: BuyerAcceptanceManualBrowserPreExecutionStopSeverity;
}

export interface BuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot {
  generatedAt: string;
  readinessStatus: BuyerAcceptanceManualBrowserPreExecutionReadinessStatus;
  executionPermissionStatus: BuyerAcceptanceManualBrowserExecutionPermissionStatus;
  sourceApprovalRecordStatus: BuyerAcceptanceManualExecutionApprovalRecordStatus;
  sourceApprovalDecisionStatus: BuyerAcceptanceManualExecutionApprovalDecisionStatus;
  sourceManualRunbookStatus: BuyerAcceptanceManualRunbookStatus;
  sourceManualRunbookExecutionStatus: BuyerAcceptanceManualRunbookExecutionStatus;
  sourceBoundaryStatus: BuyerAcceptanceBrowserExecutionBoundaryStatus;
  sourceBoundaryApprovalStatus: BuyerAcceptanceBrowserExecutionApprovalStatus;
  sourcePlanStatus: BuyerAcceptanceBrowserWalkthroughPlanStatus;
  sourceAdminWalkthroughStatus: BuyerAcceptanceWalkthroughStatus;
  sourcePackStatus: BuyerAcceptancePackStatus;
  sourceReviewGateStatus: BuyerAcceptanceReviewGateStatus;
  adminSectionOrder: readonly AdminSectionKey[];
  readinessChecks: readonly BuyerAcceptanceManualBrowserPreExecutionReadinessCheck[];
  goDecisionRequirements: readonly string[];
  noGoReasons: readonly string[];
  stopConditions: readonly BuyerAcceptanceManualBrowserPreExecutionStopCondition[];
  allowedNextActions: readonly string[];
  prohibitedActions: readonly string[];
  stillDeferredItems: readonly string[];
  proofBoundary: string;
  summary: string;
}

const CHECK_PROOF_BOUNDARY =
  'This check verifies decision inputs only. It does not grant approval, approve execution, launch a browser, run automation, capture screenshots, create evidence artifacts, generate export/PDF/download files, change status, or produce readiness evidence.';

const GO_DECISION_REQUIREMENTS = [
  'AP must explicitly approve exact manual execution scope.',
  'AP must confirm manual browser mode.',
  'AP must confirm local app view only.',
  'AP must confirm sections to inspect.',
  'AP must confirm output policy.',
  'AP must confirm sanitized textual evidence only.',
  'AP must confirm no screenshots.',
  'AP must confirm no export/PDF/download.',
  'AP must confirm no approval/status changes.',
  'AP must confirm no readiness claims.',
  'AP must confirm stop conditions.',
  'AP must confirm redaction checklist.',
] as const;

const NO_GO_REASONS = [
  'AP does not explicitly approve.',
  'Browser mode not selected.',
  'Output policy not accepted.',
  'Redaction checklist not accepted.',
  'Stop conditions not accepted.',
  'Screenshots requested without future screenshot policy.',
  'Export/PDF/download requested.',
  'Approval/status change requested.',
  'Readiness claim requested.',
  'DB/RLS/artifact/hosted/deployment/proof command requested.',
  'Sensitive/local-machine data would be exposed.',
] as const;

const ALLOWED_NEXT_ACTIONS = [
  'AP reviews the pre-execution readiness summary.',
  'AP gives explicit go/no-go decision in a future instruction.',
  'If AP says no-go, keep execution deferred.',
  'If AP says go, create a separate future manual execution PR/prompt.',
] as const;

const PROHIBITED_ACTIONS = [
  'Granting approval in this slice is prohibited.',
  'Approving execution in this slice is prohibited.',
  'Launching browser is prohibited.',
  'Running browser automation is prohibited.',
  'Capturing screenshots is prohibited.',
  'Creating screenshot folders is prohibited.',
  'Creating browser/run evidence is prohibited.',
  'Generating export/PDF/download is prohibited.',
  'Running approval workflow is prohibited.',
  'Changing statuses is prohibited.',
  'DB/RLS/artifact execution is prohibited.',
  'Hosted/deployment validation is prohibited.',
  'Provider/classifier execution is prohibited.',
  'Schema inspection is prohibited.',
  'Real assertion execution is prohibited.',
] as const;

const STILL_DEFERRED_ITEMS = [
  'actual manual browser walkthrough execution',
  'browser automation implementation',
  'screenshot capture',
  'screenshot evidence policy',
  'export/PDF/download design',
  'approval workflow design',
  'DB-backed persistence',
  'editable buyer controls',
  'DB/RLS/artifact proof',
  'hosted/deployment/security proof tracks',
] as const;

const PROOF_BOUNDARY =
  'This deterministic pre-execution readiness check verifies whether governance artifacts are present for an AP go/no-go decision only. It does not grant approval, approve execution, launch a browser, run browser automation, capture screenshots, create evidence artifacts, generate export/PDF/download files, execute approval workflow, change statuses, or produce readiness evidence.';

function readinessCheck(
  id: string,
  label: string,
  source: string,
  requirement: string,
  blockerIfMissing: string,
  evidenceAvailable = true,
): BuyerAcceptanceManualBrowserPreExecutionReadinessCheck {
  return {
    id,
    label,
    status: evidenceAvailable ? 'ready_for_ap_decision' : 'blocked',
    source,
    requirement,
    evidenceAvailable,
    blockerIfMissing,
    proofBoundary: CHECK_PROOF_BOUNDARY,
  };
}

function buildReadinessChecks(): readonly BuyerAcceptanceManualBrowserPreExecutionReadinessCheck[] {
  return [
    readinessCheck(
      'browser-walkthrough-rehearsal-plan',
      'Browser Walkthrough Rehearsal Plan',
      'CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT',
      'Future manual execution must have a planned browser walkthrough path before AP can decide.',
      'AP cannot decide without the Browser Walkthrough Rehearsal Plan.',
    ),
    readinessCheck(
      'execution-boundary-contract',
      'Execution Boundary Contract',
      'CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT',
      'Future manual execution must have execution boundaries, prohibited actions, redaction rules, and stop conditions defined.',
      'AP cannot decide without the Execution Boundary Contract.',
    ),
    readinessCheck(
      'manual-runbook-sanitized-evidence-template',
      'Manual Runbook and Sanitized Evidence Template',
      'CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT',
      'Future manual execution must have manual steps and sanitized textual evidence fields defined before AP can decide.',
      'AP cannot decide without the Manual Runbook and Sanitized Evidence Template.',
    ),
    readinessCheck(
      'manual-execution-approval-record',
      'Manual Execution Approval Record',
      'CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_EXECUTION_APPROVAL_SNAPSHOT',
      'Future manual execution must have approval placeholders, scope, requirements, evidence rules, and deferred items defined before AP can decide.',
      'AP cannot decide without the Manual Execution Approval Record.',
    ),
    readinessCheck(
      'deterministic-placeholders',
      'Deterministic placeholders',
      'Manual Execution Approval Record placeholders',
      'Approval reference, approver, approval decision, browser mode, and run window placeholders must be deterministic and non-sensitive.',
      'AP cannot decide if approval placeholders are missing or sensitive.',
    ),
    readinessCheck(
      'sanitized-evidence-rules',
      'Sanitized evidence rules',
      'Manual Execution Approval Record evidence rules',
      'Allowed future evidence must be limited to sanitized textual observations and sanitized manual run summary after future explicit AP approval.',
      'AP cannot decide if future evidence rules allow screenshots, raw logs, exports, or sensitive data.',
    ),
    readinessCheck(
      'redaction-checklist',
      'Redaction checklist',
      'Manual Execution Approval Record redaction checklist',
      'The redaction checklist must exclude screenshots, logs, export artifacts, sensitive values, and machine-specific values.',
      'AP cannot decide if redaction exclusions are missing.',
    ),
    readinessCheck(
      'stop-conditions',
      'Stop conditions',
      'Manual Execution Approval Record stop conditions',
      'Stop conditions must cover missing AP approval, incorrect approval marking, browser execution or automation attempts, screenshot/output creation, export/status actions, readiness claims, generated artifacts, sensitive values, and prohibited command requirements.',
      'AP cannot decide if stop conditions are incomplete.',
    ),
    readinessCheck(
      'required-before-approval-checklist',
      'Required-before-approval checklist',
      'Manual Execution Approval Record required-before-approval checklist',
      'Required checks must cover exact scope, manual mode, output policy, evidence template, redaction checklist, stop conditions, no screenshots, no export/PDF/download, no status change, and no readiness claim.',
      'AP cannot decide if required-before-approval checks are incomplete.',
    ),
    readinessCheck(
      'deferred-items',
      'Deferred items',
      'Manual Execution Approval Record deferred items',
      'Actual execution, automation, screenshot policy, export design, approval workflow, persistence, editable controls, and proof tracks must remain deferred.',
      'AP cannot decide if deferred items are missing or presented as implemented.',
    ),
    readinessCheck(
      'proof-boundary-wording',
      'Proof-boundary wording',
      'Manual Execution Approval Record proof boundary and summary',
      'Proof-boundary wording must state that approval is not granted, execution is not approved, no browser was launched, no screenshots or evidence artifacts exist, and readiness evidence is not produced.',
      'AP cannot decide if proof-boundary wording is missing.',
    ),
    readinessCheck(
      'buyer-copy-guardrails',
      'Buyer-copy guardrails',
      'scripts/checkBuyerDemoCopy.mjs',
      'Buyer-copy guardrails must scan the current browser walkthrough artifacts and block old buyer-facing names and unsupported positive readiness or proof wording.',
      'AP cannot decide if buyer-copy guardrails do not cover this readiness check.',
    ),
  ];
}

function buildStopConditions(): readonly BuyerAcceptanceManualBrowserPreExecutionStopCondition[] {
  return [
    {
      id: 'ap-approval-assumed',
      label: 'AP approval is assumed instead of explicitly granted',
      trigger: 'A reviewer treats this readiness check as approval to execute.',
      requiredResponse: 'Stop and require explicit AP go/no-go instruction in a future step.',
      severity: 'blocker',
    },
    {
      id: 'execution-permission-assumed',
      label: 'Execution permission is assumed',
      trigger: 'Manual browser execution is treated as approved by this readiness check.',
      requiredResponse: 'Stop and keep execution permission not approved.',
      severity: 'blocker',
    },
    {
      id: 'browser-launch-attempted',
      label: 'Browser launch attempted',
      trigger: 'A browser launch or browser execution is attempted by this slice.',
      requiredResponse: 'Stop and remove browser execution from this slice.',
      severity: 'blocker',
    },
    {
      id: 'browser-automation-attempted',
      label: 'Browser automation attempted',
      trigger: 'Browser automation, browser scripts, Playwright, Cypress, or equivalent automation is attempted.',
      requiredResponse: 'Stop and keep browser automation out of scope.',
      severity: 'blocker',
    },
    {
      id: 'screenshot-or-artifact-created',
      label: 'Screenshot or evidence artifact created',
      trigger: 'A screenshot, screenshot folder, browser evidence file, run evidence file, export, PDF, or download is created.',
      requiredResponse: 'Stop, remove generated artifacts from scope, and require a future approved execution or screenshot policy.',
      severity: 'blocker',
    },
    {
      id: 'approval-status-change-requested',
      label: 'Approval or status change requested',
      trigger: 'Approve, signoff, complete, or status-change behavior is requested or invoked.',
      requiredResponse: 'Stop and preserve current statuses.',
      severity: 'blocker',
    },
    {
      id: 'readiness-claim-requested',
      label: 'Readiness or certification claim requested',
      trigger: 'Unsupported readiness, certification, browser-proof, screenshot-proof, or completion wording is requested.',
      requiredResponse: 'Stop and keep maturity claims blocked or evidence-required.',
      severity: 'blocker',
    },
    {
      id: 'prohibited-proof-command-required',
      label: 'DB/RLS/artifact/hosted/deployment proof command required',
      trigger: 'A DB, RLS, artifact, hosted, deployment, provider, classifier, schema, or real assertion command is required.',
      requiredResponse: 'Stop and require a future AP-approved proof track.',
      severity: 'blocker',
    },
    {
      id: 'sensitive-local-machine-data-exposure',
      label: 'Sensitive/local-machine data exposure',
      trigger: 'Secrets, env values, local paths, host/port/IP values, DB URLs, row payloads, auth headers, provider keys, service-role values, private tokens, project refs, target values, container/image IDs, stack traces, or machine-specific values would be exposed.',
      requiredResponse: 'Stop, redact, and require accepted redaction rules before future execution.',
      severity: 'blocker',
    },
  ];
}

function buildReadinessStatus(
  checks: readonly BuyerAcceptanceManualBrowserPreExecutionReadinessCheck[],
): BuyerAcceptanceManualBrowserPreExecutionReadinessStatus {
  return checks.every(check => check.evidenceAvailable)
    ? 'ready_for_ap_decision'
    : 'blocked';
}

export function buildBuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot(): BuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot {
  const approvalRecord = CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_EXECUTION_APPROVAL_SNAPSHOT;
  const manualRunbook = CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT;
  const boundary = CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT;
  const plan = CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT;
  const adminWalkthrough = CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT;
  const pack = CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT;
  const reviewGate = CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT;
  const readinessChecks = buildReadinessChecks();

  return {
    generatedAt: BUYER_ACCEPTANCE_MANUAL_BROWSER_PRE_EXECUTION_READINESS_GENERATED_AT,
    readinessStatus: buildReadinessStatus(readinessChecks),
    executionPermissionStatus: 'ap_decision_required',
    sourceApprovalRecordStatus: approvalRecord.approvalRecordStatus,
    sourceApprovalDecisionStatus: approvalRecord.approvalDecisionStatus,
    sourceManualRunbookStatus: manualRunbook.runbookStatus,
    sourceManualRunbookExecutionStatus: manualRunbook.executionStatus,
    sourceBoundaryStatus: boundary.boundaryStatus,
    sourceBoundaryApprovalStatus: boundary.approvalStatus,
    sourcePlanStatus: plan.planStatus,
    sourceAdminWalkthroughStatus: adminWalkthrough.walkthroughStatus,
    sourcePackStatus: pack.packStatus,
    sourceReviewGateStatus: reviewGate.gateStatus,
    adminSectionOrder: ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
    readinessChecks,
    goDecisionRequirements: GO_DECISION_REQUIREMENTS,
    noGoReasons: NO_GO_REASONS,
    stopConditions: buildStopConditions(),
    allowedNextActions: ALLOWED_NEXT_ACTIONS,
    prohibitedActions: PROHIBITED_ACTIONS,
    stillDeferredItems: STILL_DEFERRED_ITEMS,
    proofBoundary: PROOF_BOUNDARY,
    summary: 'Governance artifacts are ready for AP decision only; pre-execution readiness is decision-only. AP approval has not been granted, execution is not approved, no browser was launched, no browser automation was run, no screenshot was captured, no evidence artifact was generated, no readiness evidence was produced, and export/PDF/download remains blocked.',
  };
}

export const CURRENT_BUYER_ACCEPTANCE_MANUAL_BROWSER_PRE_EXECUTION_READINESS_SNAPSHOT =
  buildBuyerAcceptanceManualBrowserPreExecutionReadinessSnapshot();
