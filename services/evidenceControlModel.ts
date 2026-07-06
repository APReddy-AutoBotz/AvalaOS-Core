export const EVIDENCE_CONTROL_GENERATED_AT = '2026-07-05T00:00:00.000Z';

export const APPROVAL_CONTRACT_STATES = [
  'planned',
  'required',
  'blocked',
  'deferred',
  'approved',
  'rejected',
  'executed',
  'evidence_required',
] as const;

export type ApprovalContractState = typeof APPROVAL_CONTRACT_STATES[number];

export const CONTROL_SURFACE_IDS = [
  'trust_center',
  'admin_workbench',
  'buyer_acceptance_pack',
  'buyer_acceptance_review_gate',
  'buyer_acceptance_admin_walkthrough',
  'buyer_acceptance_browser_walkthrough',
  'buyer_acceptance_manual_runbook',
  'buyer_acceptance_manual_execution_approval',
  'buyer_acceptance_pre_execution_readiness',
] as const;

export type ControlSurfaceId = typeof CONTROL_SURFACE_IDS[number];

export const AUDIT_EVENT_CATEGORIES = [
  'evidence_surface_viewed',
  'proof_boundary_reviewed',
  'approval_state_reviewed',
  'approval_gate_defined',
  'manual_execution_gate_reviewed',
  'export_boundary_reviewed',
  'readiness_claim_blocked',
  'status_change_blocked',
] as const;

export type AuditEventCategory = typeof AUDIT_EVENT_CATEGORIES[number];

export const AUDIT_REQUIRED_FIELDS = [
  'event_id',
  'occurred_at',
  'actor_role',
  'surface_id',
  'category',
  'milestone',
  'approval_state',
  'proof_boundary',
  'evidence_reference',
  'redaction_summary',
] as const;

export type AuditRequiredField = typeof AUDIT_REQUIRED_FIELDS[number];

export const AUDIT_PROHIBITED_FIELDS = [
  'raw_rows',
  'raw_log',
  'stdout',
  'stderr',
  'stack_trace',
  'schema_dump',
  'local_path',
  'host',
  'port',
  'ip_address',
  'database_url',
  'row_payload',
  'sql_result_set',
  'policy_definition_dump',
  'migration_output',
  'artifact_select_payload',
  'auth_header',
  'claim_value',
  'provider_key',
  'service_role_token',
  'private_token',
  'project_ref',
  'target_value',
  'container_id',
  'image_id',
  'screenshot_path',
  'browser_output',
  'export_artifact_path',
  'pdf_artifact_path',
  'download_artifact_path',
  'storage_object_path',
  'signed_url',
  'public_url',
  'export_payload',
  'pdf_payload',
  'download_payload',
  'binary_content',
  'machine_specific_value',
] as const;

export type AuditProhibitedField = typeof AUDIT_PROHIBITED_FIELDS[number];

export const AUDIT_REDACTION_RULES = [
  'Summarize verification tasks by task name only.',
  'Exclude raw logs, command strings, local paths, host values, ports, IP values, database URLs, row payloads, auth headers, claim values, provider keys, private tokens, project refs, target values, container IDs, image IDs, browser output, screenshots, exports, PDFs, and downloads.',
  'Record proof boundaries separately from readiness claims.',
  'Keep status transitions as planned contract states unless a later AP-approved workflow execution creates accepted evidence.',
] as const;

export const BLOCKED_READINESS_CLAIMS = [
  'production readiness',
  'hosted readiness',
  'deployment readiness',
  'RLS readiness',
  'tenant-isolation proof',
  'artifact SELECT isolation',
  'schema readiness',
  'local readiness',
  'local startup success',
  'security readiness',
  'buyer readiness',
  'product readiness',
  'release-candidate readiness',
  'compliance certification',
  'browser verification',
  'screenshot proof',
  'export/PDF/download readiness',
  'artifact storage readiness',
  'live storage proof',
  'live signed URL proof',
  'walkthrough completion',
  'approval-workflow readiness',
] as const;

export const PROHIBITED_EXECUTION_ACTIONS = [
  'grant_ap_approval',
  'approve_browser_execution',
  'launch_browser',
  'run_browser_automation',
  'capture_screenshot',
  'create_screenshot_folder',
  'generate_export',
  'generate_pdf',
  'generate_download',
  'create_real_evidence_artifact',
  'perform_live_storage_read',
  'perform_live_storage_write',
  'generate_live_signed_url',
  'create_browser_run_evidence',
  'execute_approval_workflow',
  'change_approval_or_signoff_status',
  'run_db_rls_artifact_execution',
  'run_schema_inspection',
  'run_sql_or_migration_execution',
  'run_supabase_stack_or_docker_execution',
  'run_artifact_select_checks',
  'run_tenant_isolation_checks',
  'run_local_startup_or_readiness_checks',
  'run_hosted_or_deployment_validation',
  'run_schema_provider_classifier_or_real_assertion_execution',
  'produce_readiness_evidence',
] as const;

export type ProhibitedExecutionAction = typeof PROHIBITED_EXECUTION_ACTIONS[number];

export const DEPRECATED_BUYER_FACING_LITE_NAMES = [
  'Avala Govern Lite',
  'Avala Delivery Lite',
] as const;

export interface AuditEventContract {
  category: AuditEventCategory;
  label: string;
  description: string;
  requiredFields: readonly AuditRequiredField[];
  redactionRules: readonly string[];
  prohibitedFields: readonly AuditProhibitedField[];
  blockedUntil: string;
}

export interface ControlSurfaceContract {
  id: ControlSurfaceId;
  label: string;
  objective: string;
  approvalState: ApprovalContractState;
  proofBoundarySummary: string;
  verifiedControlFacts: readonly string[];
  blockedReadinessClaims: readonly string[];
  requiredEvidenceBeforeReadiness: readonly string[];
  allowedReadOnlyOutputs: readonly string[];
  prohibitedActions: readonly ProhibitedExecutionAction[];
  auditEventCategories: readonly AuditEventCategory[];
}

export interface EvidenceControlSnapshot {
  generatedAt: string;
  milestone: string;
  executionApprovalGranted: boolean;
  approvalStates: readonly ApprovalContractState[];
  auditEventCategories: readonly AuditEventCategory[];
  auditContracts: readonly AuditEventContract[];
  surfaces: readonly ControlSurfaceContract[];
  blockedReadinessClaims: readonly string[];
  prohibitedExecutionActions: readonly ProhibitedExecutionAction[];
  deprecatedBuyerFacingLiteNames: readonly string[];
}

const executionApprovalGranted = false;

const auditContracts: readonly AuditEventContract[] = AUDIT_EVENT_CATEGORIES.map(category => ({
  category,
  label: category
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' '),
  description: `Future audit contract category for ${category.split('_').join(' ')} records. This contract is model-only and writes no audit events.`,
  requiredFields: [...AUDIT_REQUIRED_FIELDS],
  redactionRules: [...AUDIT_REDACTION_RULES],
  prohibitedFields: [...AUDIT_PROHIBITED_FIELDS],
  blockedUntil: 'A later AP-approved execution gate defines exact scope, output boundaries, and accepted evidence.',
}));

const controlSurfaces: readonly ControlSurfaceContract[] = [
  {
    id: 'trust_center',
    label: 'Trust Center',
    objective: 'Present evidence-gated proof statuses, limitation disclosures, and blocked readiness claims without changing runtime state.',
    approvalState: 'evidence_required',
    proofBoundarySummary: 'Trust Center controls separate current demo/control facts from unproven readiness domains.',
    verifiedControlFacts: [
      'Deterministic proof-status vocabulary exists.',
      'Blocked and evidence-required claims are represented as static model data.',
      'Claim controls reference existing evidence or canonical planning records.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'Accepted proof for each readiness domain named in the Trust Center claim controls.',
      'AP-approved evidence scope before any blocked or evidence-required status change.',
    ],
    allowedReadOnlyOutputs: ['static model snapshot', 'read-only UI summary', 'planning doc reference'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['evidence_surface_viewed', 'proof_boundary_reviewed', 'readiness_claim_blocked'],
  },
  {
    id: 'admin_workbench',
    label: 'Admin Workbench',
    objective: 'Expose evidence, approval, and audit contract posture as read-only admin control summaries.',
    approvalState: 'planned',
    proofBoundarySummary: 'Admin Workbench summaries are model-backed navigation and review aids only.',
    verifiedControlFacts: [
      'Admin sections are deterministic TypeScript definitions.',
      'Existing admin copy discloses proof boundaries.',
      'M5.5b adds a read-only control summary, not workflow execution.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'AP-approved execution records before any approval, signoff, completion, or status change is represented as performed.',
    ],
    allowedReadOnlyOutputs: ['read-only UI summary', 'admin navigation disclosure', 'static contract summary'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['approval_state_reviewed', 'proof_boundary_reviewed', 'status_change_blocked'],
  },
  {
    id: 'buyer_acceptance_pack',
    label: 'Buyer Acceptance Pack',
    objective: 'Keep buyer acceptance content as a draft foundation with blocked proof gaps and limitation disclosures.',
    approvalState: 'evidence_required',
    proofBoundarySummary: 'The pack is a deterministic review foundation, not buyer signoff, export output, or readiness evidence.',
    verifiedControlFacts: [
      'Pack content is composed from Trust Center data and limitation disclosures.',
      'Open proof gaps remain explicit.',
      'No PDF, export, download, or buyer signoff output is generated by this contract.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'AP-approved buyer review evidence and explicit acceptance boundaries.',
      'Separate artifact/export gate before any export, PDF, or download output exists.',
    ],
    allowedReadOnlyOutputs: ['draft foundation snapshot', 'read-only UI summary', 'review checklist'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['evidence_surface_viewed', 'approval_state_reviewed', 'readiness_claim_blocked'],
  },
  {
    id: 'buyer_acceptance_review_gate',
    label: 'Buyer Acceptance Review Gate',
    objective: 'Preserve review-gate questions, blockers, and safe answers without converting rehearsal into acceptance.',
    approvalState: 'required',
    proofBoundarySummary: 'Review gate content requires AP review before any real buyer approval boundary can move.',
    verifiedControlFacts: [
      'Review-gate model is deterministic and read-only.',
      'Export and readiness claims remain blocked.',
      'Questions and blockers remain review prompts only.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'AP decision record for the exact buyer review scope.',
      'Accepted evidence for blockers that would otherwise change readiness posture.',
    ],
    allowedReadOnlyOutputs: ['review prompts', 'blocker list', 'safe answer copy'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['approval_gate_defined', 'approval_state_reviewed', 'readiness_claim_blocked'],
  },
  {
    id: 'buyer_acceptance_admin_walkthrough',
    label: 'Buyer Acceptance Admin Walkthrough',
    objective: 'Represent the admin walkthrough as internal rehearsal only, with no browser proof or walkthrough completion claim.',
    approvalState: 'deferred',
    proofBoundarySummary: 'Admin walkthrough control facts are rehearsal metadata and do not prove executed browser behavior.',
    verifiedControlFacts: [
      'Walkthrough steps and expected observations are deterministic.',
      'The surface states no browser automation or screenshot evidence exists.',
      'Deferred proof tracks remain visible.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'Separate AP-approved manual execution gate before any browser run.',
      'Accepted run evidence before walkthrough status could change.',
    ],
    allowedReadOnlyOutputs: ['internal rehearsal steps', 'expected observations', 'deferred proof track summary'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['manual_execution_gate_reviewed', 'proof_boundary_reviewed', 'readiness_claim_blocked'],
  },
  {
    id: 'buyer_acceptance_browser_walkthrough',
    label: 'Browser Walkthrough',
    objective: 'Keep browser walkthrough scope behind a separate AP approval gate before any run can occur.',
    approvalState: 'blocked',
    proofBoundarySummary: 'Browser walkthrough remains unexecuted; no browser was launched and no browser evidence exists.',
    verifiedControlFacts: [
      'Plan and execution-boundary models exist.',
      'The current state blocks browser launch, automation, screenshots, run evidence, and readiness claims.',
      'Execution requires a later exact AP go/no-go gate.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'AP-approved run count, scope, output boundaries, stop conditions, and proof boundaries.',
      'Accepted browser-run evidence created only inside the approved future gate.',
    ],
    allowedReadOnlyOutputs: ['execution boundary summary', 'blocked action list', 'AP gate requirement summary'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['manual_execution_gate_reviewed', 'status_change_blocked', 'readiness_claim_blocked'],
  },
  {
    id: 'buyer_acceptance_manual_runbook',
    label: 'Manual Runbook',
    objective: 'Keep the manual browser runbook as a template until AP approves a future execution gate.',
    approvalState: 'planned',
    proofBoundarySummary: 'The runbook is template-only and does not create execution evidence or readiness evidence.',
    verifiedControlFacts: [
      'Manual runbook fields and stop conditions are represented.',
      'Runbook copy blocks browser execution without AP approval.',
      'Artifact and screenshot outputs remain prohibited in the current baseline.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'Separate AP approval with exact run scope before the runbook can be used for execution.',
    ],
    allowedReadOnlyOutputs: ['template fields', 'stop condition list', 'scope boundary summary'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['manual_execution_gate_reviewed', 'proof_boundary_reviewed'],
  },
  {
    id: 'buyer_acceptance_manual_execution_approval',
    label: 'Manual Execution Approval',
    objective: 'Model manual execution approval as an ungranted approval record requiring future AP action.',
    approvalState: 'required',
    proofBoundarySummary: 'Approval is required but not granted; no approval workflow has run.',
    verifiedControlFacts: [
      'Approval record fields are deterministic.',
      'The current state explicitly records AP approval as ungranted.',
      'No approval/signoff/source status was changed by this model.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'Explicit AP approval record with exact scope and output boundaries before execution.',
      'Separate accepted evidence before any status may move to executed.',
    ],
    allowedReadOnlyOutputs: ['ungranted approval record summary', 'required approver checklist', 'scope checklist'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['approval_state_reviewed', 'approval_gate_defined', 'status_change_blocked'],
  },
  {
    id: 'buyer_acceptance_pre_execution_readiness',
    label: 'Pre-Execution Readiness',
    objective: 'Preserve pre-execution readiness as a decision-only check for AP review, not execution approval.',
    approvalState: 'blocked',
    proofBoundarySummary: 'Pre-execution readiness does not approve execution and does not create readiness evidence.',
    verifiedControlFacts: [
      'The decision-only pre-execution boundary is represented.',
      'AP approval remains ungranted.',
      'No browser, export, workflow, DB/RLS, hosted, provider, classifier, schema, or real assertion execution occurred.',
    ],
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    requiredEvidenceBeforeReadiness: [
      'New AP-approved go/no-go gate before any execution.',
      'Accepted evidence from the approved future run before any readiness claim changes.',
    ],
    allowedReadOnlyOutputs: ['decision-only checklist', 'blocked action disclosure', 'future gate prerequisite summary'],
    prohibitedActions: [...PROHIBITED_EXECUTION_ACTIONS],
    auditEventCategories: ['approval_state_reviewed', 'status_change_blocked', 'readiness_claim_blocked'],
  },
] as const;

const cloneAuditContract = (contract: AuditEventContract): AuditEventContract => ({
  ...contract,
  requiredFields: [...contract.requiredFields],
  redactionRules: [...contract.redactionRules],
  prohibitedFields: [...contract.prohibitedFields],
});

const cloneControlSurface = (surface: ControlSurfaceContract): ControlSurfaceContract => ({
  ...surface,
  verifiedControlFacts: [...surface.verifiedControlFacts],
  blockedReadinessClaims: [...surface.blockedReadinessClaims],
  requiredEvidenceBeforeReadiness: [...surface.requiredEvidenceBeforeReadiness],
  allowedReadOnlyOutputs: [...surface.allowedReadOnlyOutputs],
  prohibitedActions: [...surface.prohibitedActions],
  auditEventCategories: [...surface.auditEventCategories],
});

export function buildEvidenceControlSnapshot(): EvidenceControlSnapshot {
  return {
    generatedAt: EVIDENCE_CONTROL_GENERATED_AT,
    milestone: 'M5.5b Evidence Surface, Approval Model, and Audit Contract Hardening',
    executionApprovalGranted,
    approvalStates: [...APPROVAL_CONTRACT_STATES],
    auditEventCategories: [...AUDIT_EVENT_CATEGORIES],
    auditContracts: auditContracts.map(cloneAuditContract),
    surfaces: controlSurfaces.map(cloneControlSurface),
    blockedReadinessClaims: [...BLOCKED_READINESS_CLAIMS],
    prohibitedExecutionActions: [...PROHIBITED_EXECUTION_ACTIONS],
    deprecatedBuyerFacingLiteNames: [...DEPRECATED_BUYER_FACING_LITE_NAMES],
  };
}

export const CURRENT_EVIDENCE_CONTROL_SNAPSHOT = buildEvidenceControlSnapshot();

export function getControlSurfaceContract(
  surfaceId: ControlSurfaceId,
  snapshot: EvidenceControlSnapshot = buildEvidenceControlSnapshot(),
): ControlSurfaceContract {
  const surface = snapshot.surfaces.find(candidate => candidate.id === surfaceId);
  if (!surface) {
    throw new Error(`Missing evidence control surface contract: ${surfaceId}`);
  }

  return cloneControlSurface(surface);
}

export function assertNoDeprecatedBuyerFacingLiteNames(copy: string): void {
  for (const deprecatedName of DEPRECATED_BUYER_FACING_LITE_NAMES) {
    if (copy.includes(deprecatedName)) {
      throw new Error(`Deprecated buyer-facing name is not allowed: ${deprecatedName}`);
    }
  }
}

export function assertProofBoundaryCopyIsClaimSafe(copy: string): void {
  assertNoDeprecatedBuyerFacingLiteNames(copy);

  const unsupportedPositiveClaimPatterns = [
    /\bproduction\s+ready\b/i,
    /\bhosted\s+ready\b/i,
    /\bdeployment\s+ready\b/i,
    /\bRLS\s+ready\b/i,
    /\bRLS\s+(verified|passed|active)\b/i,
    /\btenant[- ]isolation\s+(ready|verified|proven|passed)\b/i,
    /\btenant[- ]isolation\s+proof\s+(exists|available|accepted|achieved|complete)\b/i,
    /\bartifact\s+SELECT\s+(ready|verified|proven|passed)\b/i,
    /\bschema\s+(ready|verified|proven|available)\b/i,
    /\blocal\s+(ready|verified|proven)\b/i,
    /\blocal\s+startup\s+success\s+(achieved|verified|proven)\b/i,
    /\bsecurity\s+ready\b/i,
    /\bbuyer\s+ready\b/i,
    /\bproduct\s+ready\b/i,
    /\brelease[- ]candidate\s+ready\b/i,
    /\bcompliance\s+certified\b/i,
    /\bbrowser\s+(verification|walkthrough)\s+(complete|verified|passed)\b/i,
    /\bscreenshot\s+(proof|evidence)\s+(captured|available|ready)\b/i,
    /\bexport\s+ready\b/i,
    /\bPDF\s+ready\b/i,
    /\bdownload\s+ready\b/i,
    /\bapproval\s+(ready|complete)\b/i,
    /\bapproval\s+workflow\s+ready\b/i,
    /\bworkflow\s+ready\b/i,
  ];

  for (const pattern of unsupportedPositiveClaimPatterns) {
    if (pattern.test(copy)) {
      throw new Error(`Unsupported readiness or proof claim is not allowed: ${pattern}`);
    }
  }
}

export function assertEvidenceControlSnapshotIsExecutionNeutral(
  snapshot: EvidenceControlSnapshot = buildEvidenceControlSnapshot(),
): void {
  if (snapshot.executionApprovalGranted) {
    throw new Error('Execution approval must remain ungranted.');
  }

  const executedOrApprovedSurfaces = snapshot.surfaces.filter(surface =>
    surface.approvalState === 'approved' || surface.approvalState === 'executed',
  );
  if (executedOrApprovedSurfaces.length > 0) {
    throw new Error(`Execution-neutral surfaces cannot be approved or executed: ${executedOrApprovedSurfaces.map(surface => surface.id).join(', ')}`);
  }

  for (const surface of snapshot.surfaces) {
    if (surface.blockedReadinessClaims.length === 0) {
      throw new Error(`Surface must retain blocked readiness claims: ${surface.id}`);
    }
    if (surface.prohibitedActions.length !== PROHIBITED_EXECUTION_ACTIONS.length) {
      throw new Error(`Surface must retain full prohibited action list: ${surface.id}`);
    }
    assertProofBoundaryCopyIsClaimSafe([
      surface.label,
      surface.objective,
      surface.proofBoundarySummary,
      ...surface.verifiedControlFacts,
      ...surface.requiredEvidenceBeforeReadiness,
      ...surface.allowedReadOnlyOutputs,
    ].join('\n'));
  }

  for (const contract of snapshot.auditContracts) {
    for (const requiredField of AUDIT_REQUIRED_FIELDS) {
      if (!contract.requiredFields.includes(requiredField)) {
        throw new Error(`Audit contract ${contract.category} is missing required field ${requiredField}.`);
      }
    }
    for (const prohibitedField of AUDIT_PROHIBITED_FIELDS) {
      if (!contract.prohibitedFields.includes(prohibitedField)) {
        throw new Error(`Audit contract ${contract.category} is missing prohibited field ${prohibitedField}.`);
      }
    }
  }
}
