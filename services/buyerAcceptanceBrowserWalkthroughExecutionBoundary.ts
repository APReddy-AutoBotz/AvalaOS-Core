import {
  ADMIN_WORKBENCH_SECTIONS,
  type AdminSectionKey,
} from './adminWorkbenchModel';
import {
  CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT,
  type BuyerAcceptanceWalkthroughStatus,
} from './buyerAcceptanceAdminWalkthrough';
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

export const BUYER_ACCEPTANCE_BROWSER_EXECUTION_BOUNDARY_GENERATED_AT = '2026-07-04T00:00:00.000Z';

export type BuyerAcceptanceBrowserExecutionBoundaryStatus =
  | 'boundary_defined'
  | 'approval_required'
  | 'blocked';

export type BuyerAcceptanceBrowserExecutionApprovalStatus =
  | 'ap_approval_required'
  | 'not_approved'
  | 'blocked';

export type BuyerAcceptanceBrowserExecutionMode =
  | 'future_manual_browser_rehearsal'
  | 'future_scripted_browser_rehearsal';

export type BuyerAcceptanceBrowserExecutionBoundaryRuleCategory =
  | 'approval'
  | 'browser_execution'
  | 'screenshot'
  | 'artifact_generation'
  | 'status_control'
  | 'data_execution'
  | 'environment_validation'
  | 'provider_execution'
  | 'schema'
  | 'sensitive_data'
  | 'evidence_handling';

export interface BuyerAcceptanceBrowserExecutionBoundaryRule {
  id: string;
  label: string;
  category: BuyerAcceptanceBrowserExecutionBoundaryRuleCategory;
  status: BuyerAcceptanceBrowserExecutionBoundaryStatus;
  requirement: string;
  rationale: string;
  mustConfirm: readonly string[];
  mustNotDo: readonly string[];
}

export interface BuyerAcceptanceBrowserExecutionEvidenceBoundary {
  id: string;
  label: string;
  allowedEvidence: readonly string[];
  prohibitedEvidence: readonly string[];
  redactionRequired: boolean;
  storageAllowed: boolean;
  rationale: string;
}

export interface BuyerAcceptanceBrowserExecutionStopCondition {
  id: string;
  label: string;
  severity: 'high' | 'blocker';
  trigger: string;
  requiredResponse: string;
}

export interface BuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot {
  generatedAt: string;
  boundaryStatus: BuyerAcceptanceBrowserExecutionBoundaryStatus;
  approvalStatus: BuyerAcceptanceBrowserExecutionApprovalStatus;
  executionModes: readonly BuyerAcceptanceBrowserExecutionMode[];
  sourcePlanStatus: BuyerAcceptanceBrowserWalkthroughPlanStatus;
  sourceAdminWalkthroughStatus: BuyerAcceptanceWalkthroughStatus;
  sourcePackStatus: BuyerAcceptancePackStatus;
  sourceReviewGateStatus: BuyerAcceptanceReviewGateStatus;
  adminSectionOrder: readonly AdminSectionKey[];
  boundaryRules: readonly BuyerAcceptanceBrowserExecutionBoundaryRule[];
  allowedActions: readonly string[];
  prohibitedActions: readonly string[];
  evidenceBoundaries: readonly BuyerAcceptanceBrowserExecutionEvidenceBoundary[];
  redactionRules: readonly string[];
  stopConditions: readonly BuyerAcceptanceBrowserExecutionStopCondition[];
  requiredPreExecutionChecks: readonly string[];
  deferredExecutionItems: readonly string[];
  proofBoundary: string;
  summary: string;
}

const COMMON_MUST_NOT_DO = [
  'Do not launch a browser.',
  'Do not run browser automation.',
  'Do not capture screenshots.',
  'Do not compare screenshots.',
  'Do not create screenshot folders.',
  'Do not generate exports, PDFs, or downloads.',
  'Do not approve, sign off, complete, or change any status.',
  'Do not execute DB, RLS, or artifact checks.',
  'Do not perform hosted or deployment validation.',
  'Do not execute providers or classifiers.',
  'Do not inspect schema.',
  'Do not execute real assertions.',
] as const;

const ALLOWED_ACTIONS = [
  'Define future execution prerequisites.',
  'Define future observation path.',
  'Define future stop conditions.',
  'Define future redaction rules.',
  'Define future evidence handling rules.',
  'Define future AP approval requirements.',
] as const;

const PROHIBITED_ACTIONS = [
  'Browser automation execution is prohibited.',
  'Browser launch is prohibited.',
  'Screenshot capture is prohibited.',
  'Screenshot comparison is prohibited.',
  'Screenshot folder creation is prohibited.',
  'Export generation is prohibited.',
  'PDF generation is prohibited.',
  'Download generation is prohibited.',
  'Approval, signoff, complete, or status-change actions are prohibited.',
  'DB, RLS, or artifact execution is prohibited.',
  'Hosted or deployment validation is prohibited.',
  'Provider or classifier execution is prohibited.',
  'Schema inspection is prohibited.',
  'Real assertion execution is prohibited.',
] as const;

const REDACTION_RULES = [
  'Do not include secrets.',
  'Do not include env values.',
  'Do not include local paths.',
  'Do not include host values.',
  'Do not include port values.',
  'Do not include IP values.',
  'Do not include DB URLs.',
  'Do not include row payloads.',
  'Do not include auth headers.',
  'Do not include provider keys.',
  'Do not include service-role values.',
  'Do not include private tokens.',
  'Do not include project refs.',
  'Do not include target values.',
  'Do not include container IDs.',
  'Do not include image IDs.',
  'Do not include stack traces.',
  'Do not include machine-specific values.',
] as const;

const REQUIRED_PRE_EXECUTION_CHECKS = [
  'AP explicitly approves browser execution scope.',
  'Browser mode is selected in a future slice.',
  'Output capture policy is defined.',
  'Screenshot policy is defined if screenshots are requested.',
  'Redaction rules are accepted.',
  'Stop conditions are accepted.',
  'No export/PDF/download is in scope.',
  'No approval/status change is in scope.',
] as const;

const DEFERRED_EXECUTION_ITEMS = [
  'actual browser walkthrough execution',
  'browser automation implementation',
  'manual browser rehearsal execution',
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
  'This deterministic contract defines future browser execution boundaries only. It does not approve execution, does not launch a browser, does not run browser automation, does not capture screenshots, does not generate export/PDF/download artifacts, does not change status, and does not produce readiness evidence.';

function rule(
  id: string,
  label: string,
  category: BuyerAcceptanceBrowserExecutionBoundaryRuleCategory,
  status: BuyerAcceptanceBrowserExecutionBoundaryStatus,
  requirement: string,
  rationale: string,
  mustConfirm: readonly string[],
  mustNotDo: readonly string[] = COMMON_MUST_NOT_DO,
): BuyerAcceptanceBrowserExecutionBoundaryRule {
  return {
    id,
    label,
    category,
    status,
    requirement,
    rationale,
    mustConfirm,
    mustNotDo,
  };
}

function buildBoundaryRules(): readonly BuyerAcceptanceBrowserExecutionBoundaryRule[] {
  return [
    rule(
      'ap-approval-required',
      'AP approval required before browser execution',
      'approval',
      'approval_required',
      'Future browser execution requires explicit AP approval for scope, mode, capture policy, stop conditions, and evidence boundaries.',
      'A browser walkthrough can create a new evidence surface and must not start without explicit approval.',
      ['AP approval is required before execution.', 'Execution remains not approved in this slice.'],
    ),
    rule(
      'no-browser-execution-this-slice',
      'No browser execution in this slice',
      'browser_execution',
      'blocked',
      'This slice must not launch a browser, run browser automation, or execute a browser walkthrough.',
      'The current work is a boundary contract only.',
      ['No browser was launched.', 'No browser automation was run.'],
    ),
    rule(
      'no-screenshot-capture-this-slice',
      'No screenshot capture in this slice',
      'screenshot',
      'blocked',
      'This slice must not capture screenshots or create screenshot evidence.',
      'Screenshot evidence needs a separate policy before capture.',
      ['No screenshot was captured.', 'Screenshot evidence policy is deferred.'],
    ),
    rule(
      'no-screenshot-comparison-this-slice',
      'No screenshot comparison in this slice',
      'screenshot',
      'blocked',
      'This slice must not compare screenshots or create visual regression evidence.',
      'No screenshots are authorized, so comparison is also out of scope.',
      ['No screenshot comparison was performed.'],
    ),
    rule(
      'no-export-pdf-download-generation',
      'No export/PDF/download generation',
      'artifact_generation',
      'blocked',
      'This slice must not generate exports, PDFs, downloads, or buyer artifacts.',
      'Exportable artifacts require future AP-approved design and claim control.',
      ['Export/PDF/download remains blocked.'],
    ),
    rule(
      'no-approval-signoff-status-change',
      'No approval, signoff, or status change',
      'status_control',
      'blocked',
      'This slice must not approve, sign off, complete, or change Trust Center, Pack, Gate, Walkthrough, Plan, or Admin status behavior.',
      'Approval workflow and status transitions remain deferred.',
      ['No approval workflow was executed.', 'No status was changed.'],
    ),
    rule(
      'no-db-rls-artifact-execution',
      'No DB/RLS/artifact execution',
      'data_execution',
      'blocked',
      'This slice must not run DB commands, RLS checks, artifact execution, migrations, or real assertions.',
      'DB, RLS, and artifact proof tracks require separate AP-approved scope.',
      ['DB/RLS/artifact proof remains deferred.'],
    ),
    rule(
      'no-hosted-deployment-validation',
      'No hosted/deployment validation',
      'environment_validation',
      'blocked',
      'This slice must not perform hosted validation, deployment validation, bootstrap, or environment readiness checks.',
      'Hosted and deployment proof tracks remain separate future work.',
      ['Hosted/deployment validation remains deferred.'],
    ),
    rule(
      'no-provider-classifier-execution',
      'No provider/classifier execution',
      'provider_execution',
      'blocked',
      'This slice must not execute providers, classifiers, AI calls, or runtime adapters.',
      'The contract does not alter provider behavior.',
      ['Provider/classifier execution remains out of scope.'],
    ),
    rule(
      'no-schema-inspection',
      'No schema inspection',
      'schema',
      'blocked',
      'This slice must not inspect database schema.',
      'Schema proof remains a separate AP-approved proof track.',
      ['Schema inspection remains out of scope.'],
    ),
    rule(
      'no-sensitive-data-exposure',
      'No secrets, env, or local-machine data exposure',
      'sensitive_data',
      'blocked',
      'Future evidence must exclude secrets, env values, local paths, host/port/IP values, DB URLs, row payloads, auth headers, provider keys, service-role values, private tokens, project refs, target values, container/image IDs, stack traces, and machine-specific values.',
      'Browser walkthrough evidence must be safe to review without exposing sensitive or machine-specific data.',
      ['Redaction rules are required before execution.'],
    ),
    rule(
      'textual-observation-only-until-policy',
      'Textual observation only until future screenshot policy exists',
      'evidence_handling',
      'approval_required',
      'Only textual observation may be planned before future AP-approved capture policy exists; screenshots remain prohibited in this slice.',
      'Evidence handling must be defined before any browser run produces output.',
      ['Textual observations are the only planned future evidence type in this contract.'],
    ),
  ];
}

function evidenceBoundary(
  id: string,
  label: string,
  allowedEvidence: readonly string[],
  prohibitedEvidence: readonly string[],
  redactionRequired: boolean,
  storageAllowed: boolean,
  rationale: string,
): BuyerAcceptanceBrowserExecutionEvidenceBoundary {
  return {
    id,
    label,
    allowedEvidence,
    prohibitedEvidence,
    redactionRequired,
    storageAllowed,
    rationale,
  };
}

function buildEvidenceBoundaries(): readonly BuyerAcceptanceBrowserExecutionEvidenceBoundary[] {
  const sensitiveProhibited = [
    'raw logs',
    'raw stdout',
    'raw stderr',
    'local paths',
    'host/port/IP values',
    'DB URLs',
    'row payloads',
    'auth headers',
    'provider keys',
    'service-role values',
    'private tokens',
    'project refs',
    'target values',
    'container/image IDs',
    'stack traces',
    'machine-specific values',
  ] as const;

  return [
    evidenceBoundary(
      'future-textual-observation',
      'Future textual observation evidence',
      ['Planned future textual observations after AP approval.'],
      sensitiveProhibited,
      true,
      false,
      'Textual observations may be planned now, but no browser execution or evidence storage is authorized in this slice.',
    ),
    evidenceBoundary(
      'screenshots-not-allowed',
      'Screenshots are not allowed in this slice',
      ['Screenshot evidence policy may be defined in a future AP-approved slice.'],
      ['screenshots', 'screenshot comparison', 'screenshot folders', ...sensitiveProhibited],
      true,
      false,
      'Screenshots can expose sensitive or machine-specific data and require a separate policy before capture.',
    ),
    evidenceBoundary(
      'no-generated-artifacts',
      'Generated artifacts are not allowed',
      ['No generated evidence artifact is allowed in this slice.'],
      ['exports', 'PDFs', 'downloads', 'approval artifacts', 'browser logs', ...sensitiveProhibited],
      true,
      false,
      'Generated buyer artifacts and raw browser output remain out of scope.',
    ),
  ];
}

function buildStopConditions(): readonly BuyerAcceptanceBrowserExecutionStopCondition[] {
  return [
    {
      id: 'ap-approval-missing',
      label: 'AP approval missing',
      severity: 'blocker',
      trigger: 'Future browser execution is requested without explicit AP-approved scope.',
      requiredResponse: 'Stop and obtain AP approval before execution.',
    },
    {
      id: 'browser-execution-attempted',
      label: 'Browser execution attempted in this slice',
      severity: 'blocker',
      trigger: 'A browser launch, browser run, or browser automation command is attempted.',
      requiredResponse: 'Stop and remove browser execution from this slice.',
    },
    {
      id: 'screenshot-captured',
      label: 'Screenshot captured',
      severity: 'blocker',
      trigger: 'A screenshot, screenshot comparison, or screenshot folder is created.',
      requiredResponse: 'Stop, remove screenshot output from scope, and require future screenshot policy.',
    },
    {
      id: 'export-download-pdf-action-available',
      label: 'Export/download/PDF action appears available',
      severity: 'blocker',
      trigger: 'Export, download, or PDF generation appears available or is invoked.',
      requiredResponse: 'Stop and keep export/PDF/download blocked.',
    },
    {
      id: 'approval-signoff-status-action-available',
      label: 'Approval/signoff/status-change action appears',
      severity: 'blocker',
      trigger: 'Approve, signoff, complete, or status-change behavior appears or is invoked.',
      requiredResponse: 'Stop and preserve current statuses.',
    },
    {
      id: 'readiness-certification-claim-visible',
      label: 'Readiness or certification claim appears',
      severity: 'blocker',
      trigger: 'Unsupported readiness, certification, browser-proof, screenshot-proof, or completion wording appears.',
      requiredResponse: 'Stop and correct copy through future claim-control review.',
    },
    {
      id: 'generated-artifact-in-scope',
      label: 'Generated artifact appears in scope',
      severity: 'high',
      trigger: 'Any generated export, PDF, download, screenshot, raw log, or browser output appears in scope.',
      requiredResponse: 'Stop and exclude generated artifacts from this contract slice.',
    },
    {
      id: 'sensitive-local-data-exposed',
      label: 'Secrets, env, or local-machine values appear',
      severity: 'blocker',
      trigger: 'Secrets, env values, local paths, host/port/IP values, DB URLs, auth headers, provider keys, tokens, project refs, container/image IDs, stack traces, or machine-specific values appear.',
      requiredResponse: 'Stop, redact, and require accepted redaction rules before future execution.',
    },
    {
      id: 'prohibited-command-required',
      label: 'DB/RLS/artifact/hosted/deployment command required',
      severity: 'blocker',
      trigger: 'A DB, RLS, artifact, hosted, deployment, provider, classifier, schema, or real assertion command is required.',
      requiredResponse: 'Stop and require a future AP-approved proof track.',
    },
  ];
}

export function buildBuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot(): BuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot {
  const plan = CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT;
  const adminWalkthrough = CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT;
  const pack = CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT;
  const reviewGate = CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT;

  return {
    generatedAt: BUYER_ACCEPTANCE_BROWSER_EXECUTION_BOUNDARY_GENERATED_AT,
    boundaryStatus: 'approval_required',
    approvalStatus: 'ap_approval_required',
    executionModes: ['future_manual_browser_rehearsal', 'future_scripted_browser_rehearsal'],
    sourcePlanStatus: plan.planStatus,
    sourceAdminWalkthroughStatus: adminWalkthrough.walkthroughStatus,
    sourcePackStatus: pack.packStatus,
    sourceReviewGateStatus: reviewGate.gateStatus,
    adminSectionOrder: ADMIN_WORKBENCH_SECTIONS.map(section => section.key),
    boundaryRules: buildBoundaryRules(),
    allowedActions: ALLOWED_ACTIONS,
    prohibitedActions: PROHIBITED_ACTIONS,
    evidenceBoundaries: buildEvidenceBoundaries(),
    redactionRules: REDACTION_RULES,
    stopConditions: buildStopConditions(),
    requiredPreExecutionChecks: REQUIRED_PRE_EXECUTION_CHECKS,
    deferredExecutionItems: DEFERRED_EXECUTION_ITEMS,
    proofBoundary: PROOF_BOUNDARY,
    summary: 'This defines the future browser execution boundary contract only; execution boundary remains contract-only. No browser was launched, no browser automation was run, no screenshot was captured, no readiness evidence was produced, AP approval is required before execution, and export/PDF/download remains blocked.',
  };
}

export const CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT =
  buildBuyerAcceptanceBrowserWalkthroughExecutionBoundarySnapshot();
