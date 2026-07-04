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

export const BUYER_ACCEPTANCE_BROWSER_MANUAL_RUNBOOK_GENERATED_AT = '2026-07-04T00:00:00.000Z';

export type BuyerAcceptanceManualRunbookStatus =
  | 'template_defined'
  | 'approval_required'
  | 'blocked';

export type BuyerAcceptanceManualRunbookExecutionStatus =
  | 'not_executed'
  | 'ap_approval_required'
  | 'blocked';

export type BuyerAcceptanceManualRunbookStopSeverity = 'high' | 'blocker';

export type BuyerAcceptanceManualRunbookStepKey =
  | 'confirm_ap_approval_before_future_execution'
  | 'confirm_browser_mode_and_output_policy'
  | 'open_admin_workbench_future_execution'
  | 'inspect_trust_center'
  | 'inspect_buyer_acceptance_pack'
  | 'inspect_review_rehearsal_gate'
  | 'inspect_admin_walkthrough'
  | 'confirm_export_pdf_download_blocked'
  | 'confirm_approval_status_change_unavailable'
  | 'confirm_no_browser_screenshot_evidence_from_template_slice'
  | 'confirm_readiness_certification_blocked'
  | 'record_sanitized_textual_observations_only'
  | 'close_without_status_change';

export interface BuyerAcceptanceManualRunbookEvidenceField {
  id: string;
  label: string;
  required: boolean;
  allowedValueGuidance: string;
  prohibitedValueGuidance: string;
  redactionRequired: boolean;
}

export interface BuyerAcceptanceManualRunbookStep {
  key: BuyerAcceptanceManualRunbookStepKey;
  title: string;
  adminSectionKey: AdminSectionKey;
  executionStatus: BuyerAcceptanceManualRunbookExecutionStatus;
  instruction: string;
  expectedObservation: string;
  evidenceFields: readonly BuyerAcceptanceManualRunbookEvidenceField[];
  redactionChecklist: readonly string[];
  stopIfSeen: readonly string[];
  mustNotClaim: readonly string[];
}

export interface BuyerAcceptanceManualRunbookStopCondition {
  id: string;
  label: string;
  trigger: string;
  requiredResponse: string;
  severity: BuyerAcceptanceManualRunbookStopSeverity;
}

export interface BuyerAcceptanceManualRunbookTemplateSnapshot {
  generatedAt: string;
  runbookStatus: BuyerAcceptanceManualRunbookStatus;
  executionStatus: BuyerAcceptanceManualRunbookExecutionStatus;
  sourceBoundaryStatus: BuyerAcceptanceBrowserExecutionBoundaryStatus;
  sourceBoundaryApprovalStatus: BuyerAcceptanceBrowserExecutionApprovalStatus;
  sourcePlanStatus: BuyerAcceptanceBrowserWalkthroughPlanStatus;
  sourceAdminWalkthroughStatus: BuyerAcceptanceWalkthroughStatus;
  sourcePackStatus: BuyerAcceptancePackStatus;
  sourceReviewGateStatus: BuyerAcceptanceReviewGateStatus;
  adminSectionOrder: readonly AdminSectionKey[];
  manualSteps: readonly BuyerAcceptanceManualRunbookStep[];
  evidenceTemplateFields: readonly BuyerAcceptanceManualRunbookEvidenceField[];
  redactionChecklist: readonly string[];
  allowedEvidence: readonly string[];
  prohibitedEvidence: readonly string[];
  stopConditions: readonly BuyerAcceptanceManualRunbookStopCondition[];
  requiredBeforeExecution: readonly string[];
  deferredItems: readonly string[];
  proofBoundary: string;
  summary: string;
}

const PROHIBITED_VALUE_GUIDANCE =
  'Do not include raw logs, raw stdout/stderr, screenshots, screenshot paths, screenshot folders, browser logs, export/PDF/download files, local paths, host/port/IP values, DB URLs, row payloads, auth headers, provider keys, service-role values, private tokens, project refs, target values, container/image IDs, stack traces, or machine-specific values.';

const REDACTION_CHECKLIST = [
  'Exclude raw logs.',
  'Exclude raw stdout/stderr.',
  'Exclude screenshots.',
  'Exclude screenshot paths.',
  'Exclude screenshot folders.',
  'Exclude browser logs.',
  'Exclude export/PDF/download files.',
  'Exclude local paths.',
  'Exclude host/port/IP values.',
  'Exclude DB URLs.',
  'Exclude row payloads.',
  'Exclude auth headers.',
  'Exclude provider keys.',
  'Exclude service-role values.',
  'Exclude private tokens.',
  'Exclude project refs.',
  'Exclude target values.',
  'Exclude container/image IDs.',
  'Exclude stack traces.',
  'Exclude machine-specific values.',
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
  'AP approved',
  'execution approved',
  'browser walkthrough verified',
  'browser test passed',
  'screenshot evidence captured',
  'screenshot proof',
  'export available',
  'download available',
  'PDF available',
  'walkthrough complete',
] as const;

const ALLOWED_EVIDENCE = [
  'Sanitized textual observation template only.',
  'Future AP-approved manual run summary only.',
] as const;

const PROHIBITED_EVIDENCE = [
  'screenshots',
  'screenshot comparisons',
  'screenshot folders',
  'browser logs',
  'raw logs',
  'raw stdout/stderr',
  'exports',
  'PDFs',
  'downloads',
  'approval artifacts',
  'any sensitive/local-machine data',
] as const;

const REQUIRED_BEFORE_EXECUTION = [
  'Explicit AP approval.',
  'Selected browser mode.',
  'Accepted output policy.',
  'Accepted redaction rules.',
  'Accepted stop conditions.',
  'Screenshot policy if screenshots are requested in a future slice.',
  'No export/PDF/download in scope.',
  'No approval/status change in scope.',
] as const;

const DEFERRED_ITEMS = [
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
  'This deterministic runbook defines a future manual browser walkthrough runbook and sanitized evidence template only. It does not approve execution, launch a browser, run browser automation, capture screenshots, create evidence artifacts, generate export/PDF/download files, execute approval workflow, change status, or produce readiness evidence.';

function evidenceField(
  id: string,
  label: string,
  required: boolean,
  allowedValueGuidance: string,
): BuyerAcceptanceManualRunbookEvidenceField {
  return {
    id,
    label,
    required,
    allowedValueGuidance,
    prohibitedValueGuidance: PROHIBITED_VALUE_GUIDANCE,
    redactionRequired: true,
  };
}

const EVIDENCE_TEMPLATE_FIELDS = [
  evidenceField(
    'run_date_placeholder',
    'Run date placeholder',
    true,
    'Use a sanitized textual placeholder such as [RUN_DATE] until a future AP-approved manual run records a date.',
  ),
  evidenceField(
    'reviewer_placeholder',
    'Reviewer placeholder',
    true,
    'Use a sanitized textual placeholder such as [REVIEWER] without personal account details.',
  ),
  evidenceField(
    'execution_approval_reference_placeholder',
    'Execution approval reference placeholder',
    true,
    'Use a sanitized textual placeholder such as [AP_APPROVAL_REFERENCE] only after future AP approval exists.',
  ),
  evidenceField(
    'section_inspected',
    'Section inspected',
    true,
    'Use sanitized textual section names from the Admin Workbench only.',
  ),
  evidenceField(
    'expected_observation',
    'Expected observation',
    true,
    'Use sanitized textual expected observation copy from this runbook.',
  ),
  evidenceField(
    'actual_sanitized_observation_placeholder',
    'Actual sanitized observation placeholder',
    true,
    'Use a sanitized textual placeholder such as [SANITIZED_OBSERVATION] until a future AP-approved manual run occurs.',
  ),
  evidenceField(
    'blockers_observed_placeholder',
    'Blockers observed placeholder',
    true,
    'Use a sanitized textual placeholder such as [BLOCKERS_OBSERVED] and record only proof-safe blocker categories.',
  ),
  evidenceField(
    'stop_condition_triggered_placeholder',
    'Stop condition triggered placeholder',
    true,
    'Use a sanitized textual placeholder such as [STOP_CONDITION_TRIGGERED] and no raw browser output.',
  ),
  evidenceField(
    'redaction_checklist_confirmation',
    'Redaction checklist confirmation',
    true,
    'Use sanitized textual confirmation that redaction checklist items were reviewed.',
  ),
  evidenceField(
    'proof_boundary_confirmation',
    'Proof-boundary confirmation',
    true,
    'Use sanitized textual confirmation that proof boundaries were preserved and no prohibited proof was claimed.',
  ),
  evidenceField(
    'deferred_items_confirmation',
    'Deferred items confirmation',
    true,
    'Use sanitized textual confirmation that deferred execution and proof tracks remain deferred.',
  ),
] as const;

function step(
  key: BuyerAcceptanceManualRunbookStepKey,
  title: string,
  adminSectionKey: AdminSectionKey,
  executionStatus: BuyerAcceptanceManualRunbookExecutionStatus,
  instruction: string,
  expectedObservation: string,
  stopIfSeen: readonly string[],
): BuyerAcceptanceManualRunbookStep {
  return {
    key,
    title,
    adminSectionKey,
    executionStatus,
    instruction,
    expectedObservation,
    evidenceFields: EVIDENCE_TEMPLATE_FIELDS,
    redactionChecklist: REDACTION_CHECKLIST,
    stopIfSeen,
    mustNotClaim: MUST_NOT_CLAIM,
  };
}

function buildManualSteps(): readonly BuyerAcceptanceManualRunbookStep[] {
  return [
    step(
      'confirm_ap_approval_before_future_execution',
      'Confirm AP Approval Before Future Execution',
      'overview',
      'ap_approval_required',
      'Before any future manual browser walkthrough, confirm explicit AP approval for scope, browser mode, output policy, redaction rules, stop conditions, and evidence boundaries.',
      'Execution does not start unless AP approval exists; this template slice remains not executed.',
      ['AP approval missing'],
    ),
    step(
      'confirm_browser_mode_and_output_policy',
      'Confirm Browser Mode And Output Policy',
      'overview',
      'ap_approval_required',
      'Confirm future browser mode and accepted output policy before execution; do not open or automate a browser in this template slice.',
      'Browser mode and output policy are prerequisites only, not execution evidence.',
      ['browser execution attempted by this slice', 'sensitive/local-machine values appear'],
    ),
    step(
      'open_admin_workbench_future_execution',
      'Open Admin Workbench Only In Future AP-Approved Execution',
      'overview',
      'not_executed',
      'In a future AP-approved manual run only, open the Admin Workbench and inspect section labels and proof-safe overview copy.',
      'Admin Workbench is the future starting point, but no browser is launched by this template slice.',
      ['browser execution attempted by this slice', 'approval/signoff/status-change action appears'],
    ),
    step(
      'inspect_trust_center',
      'Inspect Trust Center',
      'trust_center',
      'not_executed',
      'In a future AP-approved manual run, inspect read-only Trust Center claim controls, proof states, evidence references, and limitation disclosures.',
      'Trust Center claims remain evidence-gated and do not upgrade readiness domains.',
      ['readiness/certification claim appears', 'approval/signoff/status-change action appears'],
    ),
    step(
      'inspect_buyer_acceptance_pack',
      'Inspect Buyer Acceptance Pack',
      'buyer_acceptance_pack',
      'not_executed',
      'In a future AP-approved manual run, inspect the read-only Buyer Acceptance Pack, open proof gaps, review checklist blockers, and blocked export scope.',
      'Buyer Acceptance Pack remains evidence_required and is not export, approval, readiness, or compliance evidence.',
      ['export/download/PDF action appears available', 'readiness/certification claim appears'],
    ),
    step(
      'inspect_review_rehearsal_gate',
      'Inspect Review Rehearsal Gate',
      'buyer_acceptance_review_gate',
      'not_executed',
      'In a future AP-approved manual run, inspect buyer/AP questions, expected safe answers, findings, blockers, and required-before-export checklist items.',
      'Review Rehearsal Gate remains not review_ready and does not approve buyer review or AP signoff.',
      ['approval/signoff/status-change action appears', 'readiness/certification claim appears'],
    ),
    step(
      'inspect_admin_walkthrough',
      'Inspect Admin Walkthrough',
      'buyer_acceptance_admin_walkthrough',
      'not_executed',
      'In a future AP-approved manual run, inspect the read-only Admin Walkthrough, expected observations, findings, blockers, and deferred proof tracks.',
      'Admin Walkthrough remains internal rehearsal and does not produce browser or screenshot evidence.',
      ['screenshot captured', 'screenshot path/folder generated'],
    ),
    step(
      'confirm_export_pdf_download_blocked',
      'Confirm Export/PDF/Download Remains Blocked',
      'buyer_acceptance_pack',
      'blocked',
      'Confirm export, PDF, and download generation remain unavailable and appear only as blocked or deferred scope.',
      'No export/PDF/download artifact is generated by this template slice.',
      ['export/download/PDF action appears available', 'generated artifact appears in scope'],
    ),
    step(
      'confirm_approval_status_change_unavailable',
      'Confirm Approval/Signoff/Status-Change Actions Remain Unavailable',
      'buyer_acceptance_review_gate',
      'blocked',
      'Confirm approve, signoff, complete, and status-change behavior remains unavailable and unexecuted.',
      'No approval workflow runs and no source status changes during this template slice.',
      ['approval/signoff/status-change action appears'],
    ),
    step(
      'confirm_no_browser_screenshot_evidence_from_template_slice',
      'Confirm Browser/Screenshot Evidence Is Not Produced By This Template Slice',
      'buyer_acceptance_admin_walkthrough',
      'blocked',
      'Confirm this template slice does not launch a browser, run automation, capture screenshots, compare screenshots, create screenshot folders, or create browser evidence files.',
      'No browser evidence, screenshot evidence, screenshot path, or screenshot folder is produced.',
      ['browser execution attempted by this slice', 'screenshot captured', 'screenshot path/folder generated'],
    ),
    step(
      'confirm_readiness_certification_blocked',
      'Confirm Readiness/Certification Claims Remain Blocked',
      'trust_center',
      'blocked',
      'Confirm readiness and certification claims remain blocked, evidence-required, or deferred by proof-track boundaries.',
      'No production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, or compliance claim is made.',
      ['readiness/certification claim appears'],
    ),
    step(
      'record_sanitized_textual_observations_only',
      'Record Sanitized Textual Observations Only',
      'buyer_acceptance_admin_walkthrough',
      'ap_approval_required',
      'After future AP approval and manual execution only, record sanitized textual observations in the approved template fields.',
      'Allowed future evidence remains sanitized textual observations and manual run summary only.',
      ['sensitive/local-machine values appear', 'generated artifact appears in scope'],
    ),
    step(
      'close_without_status_change',
      'Close Without Status Change',
      'overview',
      'not_executed',
      'Close the future manual walkthrough without changing Trust Center, Buyer Acceptance Pack, Review Gate, Admin Walkthrough, Browser Plan, Execution Boundary, or Admin Workbench behavior.',
      'The walkthrough closes without approval, signoff, completion, export, screenshot, or readiness status change.',
      ['approval/signoff/status-change action appears', 'generated artifact appears in scope'],
    ),
  ];
}

function buildStopConditions(): readonly BuyerAcceptanceManualRunbookStopCondition[] {
  return [
    {
      id: 'ap-approval-missing',
      label: 'AP approval missing',
      trigger: 'Manual browser execution is requested without explicit AP approval.',
      requiredResponse: 'Stop and obtain explicit AP approval before execution.',
      severity: 'blocker',
    },
    {
      id: 'browser-execution-attempted-by-template-slice',
      label: 'Browser execution attempted by this slice',
      trigger: 'A browser launch, browser run, or browser automation command is attempted by this template slice.',
      requiredResponse: 'Stop and remove browser execution from this slice.',
      severity: 'blocker',
    },
    {
      id: 'screenshot-captured',
      label: 'Screenshot captured',
      trigger: 'A screenshot is captured.',
      requiredResponse: 'Stop, remove screenshot output from scope, and require future screenshot policy.',
      severity: 'blocker',
    },
    {
      id: 'screenshot-path-folder-generated',
      label: 'Screenshot path/folder generated',
      trigger: 'A screenshot path or screenshot folder is generated.',
      requiredResponse: 'Stop, remove screenshot path/folder output from scope, and require future screenshot policy.',
      severity: 'blocker',
    },
    {
      id: 'export-download-pdf-action-appears-available',
      label: 'Export/download/PDF action appears available',
      trigger: 'An export, download, or PDF action appears available or is invoked.',
      requiredResponse: 'Stop and keep export/PDF/download blocked.',
      severity: 'blocker',
    },
    {
      id: 'approval-signoff-status-change-action-appears',
      label: 'Approval/signoff/status-change action appears',
      trigger: 'Approve, signoff, complete, or status-change behavior appears or is invoked.',
      requiredResponse: 'Stop and preserve current statuses.',
      severity: 'blocker',
    },
    {
      id: 'readiness-certification-claim-appears',
      label: 'Readiness/certification claim appears',
      trigger: 'Unsupported readiness, certification, browser-proof, screenshot-proof, or completion wording appears.',
      requiredResponse: 'Stop and correct copy through future claim-control review.',
      severity: 'blocker',
    },
    {
      id: 'generated-artifact-appears-in-scope',
      label: 'Generated artifact appears in scope',
      trigger: 'Any generated export, PDF, download, screenshot, raw log, browser output, or browser evidence file appears in scope.',
      requiredResponse: 'Stop and exclude generated artifacts from this template slice.',
      severity: 'high',
    },
    {
      id: 'sensitive-local-machine-values-appear',
      label: 'Sensitive/local-machine values appear',
      trigger: 'Secrets, env values, local paths, host/port/IP values, DB URLs, row payloads, auth headers, provider keys, service-role values, private tokens, project refs, target values, container/image IDs, stack traces, or machine-specific values appear.',
      requiredResponse: 'Stop, redact, and require accepted redaction rules before future execution.',
      severity: 'blocker',
    },
    {
      id: 'prohibited-command-requirement',
      label: 'DB/RLS/artifact/hosted/deployment command required',
      trigger: 'A DB, RLS, artifact, hosted, deployment, provider, classifier, schema, or real assertion command is required.',
      requiredResponse: 'Stop and require a future AP-approved proof track.',
      severity: 'blocker',
    },
  ];
}

export function buildBuyerAcceptanceBrowserWalkthroughManualRunbookSnapshot(): BuyerAcceptanceManualRunbookTemplateSnapshot {
  const boundary = CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT;
  const plan = CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT;
  const adminWalkthrough = CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT;
  const pack = CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT;
  const reviewGate = CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT;

  return {
    generatedAt: BUYER_ACCEPTANCE_BROWSER_MANUAL_RUNBOOK_GENERATED_AT,
    runbookStatus: 'template_defined',
    executionStatus: 'ap_approval_required',
    sourceBoundaryStatus: boundary.boundaryStatus,
    sourceBoundaryApprovalStatus: boundary.approvalStatus,
    sourcePlanStatus: plan.planStatus,
    sourceAdminWalkthroughStatus: adminWalkthrough.walkthroughStatus,
    sourcePackStatus: pack.packStatus,
    sourceReviewGateStatus: reviewGate.gateStatus,
    adminSectionOrder: ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
    manualSteps: buildManualSteps(),
    evidenceTemplateFields: EVIDENCE_TEMPLATE_FIELDS,
    redactionChecklist: REDACTION_CHECKLIST,
    allowedEvidence: ALLOWED_EVIDENCE,
    prohibitedEvidence: PROHIBITED_EVIDENCE,
    stopConditions: buildStopConditions(),
    requiredBeforeExecution: REQUIRED_BEFORE_EXECUTION,
    deferredItems: DEFERRED_ITEMS,
    proofBoundary: PROOF_BOUNDARY,
    summary: 'This defines a future manual browser walkthrough runbook and sanitized evidence template; manual runbook remains template-only. No browser was launched, no browser automation was run, no screenshot was captured, no evidence artifact was generated, no readiness evidence was produced, AP approval is still required before execution, and export/PDF/download remains blocked.',
  };
}

export const CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT =
  buildBuyerAcceptanceBrowserWalkthroughManualRunbookSnapshot();
