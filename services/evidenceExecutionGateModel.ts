import { DEPRECATED_BUYER_FACING_LITE_NAMES } from './evidenceControlModel';

export const EVIDENCE_EXECUTION_GATE_GENERATED_AT = '2026-07-06T00:00:00.000Z';

export const EVIDENCE_EXECUTION_TRACK_IDS = [
  'manual_browser_walkthrough',
  'rls_tenant_isolation_artifact_select',
  'hosted_deployment_operations',
  'secure_export_pdf_download_artifact_storage',
  'provider_classifier_boundary',
  'approval_workflow_status_transition',
] as const;

export type EvidenceExecutionTrackId = typeof EVIDENCE_EXECUTION_TRACK_IDS[number];

export const EVIDENCE_EXECUTION_PROOF_STATUSES = [
  'candidate_only',
  'approval_required',
  'blocked',
  'deferred',
] as const;

export type EvidenceExecutionProofStatus = typeof EVIDENCE_EXECUTION_PROOF_STATUSES[number];

export const AP_DECISION_STATES = [
  'pending',
  'not_approved',
  'approved',
  'rejected',
] as const;

export type ApDecisionState = typeof AP_DECISION_STATES[number];

export const EVIDENCE_EXECUTION_RISK_LEVELS = [
  'medium_high',
  'high',
  'critical',
] as const;

export type EvidenceExecutionRiskLevel = typeof EVIDENCE_EXECUTION_RISK_LEVELS[number];

export const EVIDENCE_EXECUTION_BUYER_VALUE_LEVELS = [
  'medium',
  'high',
  'very_high',
] as const;

export type EvidenceExecutionBuyerValueLevel = typeof EVIDENCE_EXECUTION_BUYER_VALUE_LEVELS[number];

export const EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS = [
  'raw_log',
  'stdout',
  'stderr',
  'stack_trace',
  'local_path',
  'host',
  'port',
  'ip_address',
  'database_url',
  'row_payload',
  'auth_header',
  'claim_value',
  'provider_key',
  'service_role_token',
  'private_token',
  'project_ref',
  'target_value',
  'environment_value',
  'deployment_url',
  'container_id',
  'image_id',
  'machine_specific_value',
  'browser_output',
  'screenshot_path',
  'screenshot_file',
  'export_artifact_path',
  'pdf_artifact_path',
  'download_artifact_path',
  'storage_object_reference',
  'storage_object_path',
  'signed_url',
  'public_url',
  'schema_dump',
  'sql_result_set',
  'policy_definition_dump',
  'migration_output',
  'artifact_select_payload',
  'provider_response',
  'classifier_output',
] as const;

export type EvidenceExecutionProhibitedOutputField =
  typeof EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS[number];

export const EVIDENCE_EXECUTION_PROHIBITED_ACTIONS = [
  'grant_ap_approval',
  'approve_execution',
  'run_manual_browser_execution',
  'launch_browser',
  'run_browser_automation',
  'capture_screenshot',
  'create_screenshot_folder',
  'generate_export',
  'generate_pdf',
  'generate_download',
  'create_storage_object',
  'generate_signed_url',
  'execute_approval_workflow',
  'change_approval_signoff_source_or_status',
  'run_hosted_validation',
  'run_deployment_validation',
  'run_startup_checks',
  'run_readiness_checks',
  'run_supabase_stack',
  'run_docker',
  'run_db_rls_artifact_checks',
  'run_artifact_select_checks',
  'run_tenant_isolation_checks',
  'inspect_schema',
  'run_sql_or_migrations',
  'execute_provider_classifier_behavior',
  'execute_rollback_incident_backup_restore_behavior',
  'run_real_assertions',
  'produce_readiness_evidence',
  'start_post_m5_7_execution_milestone',
] as const;

export type EvidenceExecutionProhibitedAction =
  typeof EVIDENCE_EXECUTION_PROHIBITED_ACTIONS[number];

export const EVIDENCE_EXECUTION_BLOCKED_READINESS_CLAIMS = [
  'AP approval granted',
  'browser walkthrough executed',
  'screenshot evidence produced',
  'export/PDF/download readiness',
  'hosted readiness',
  'deployment readiness',
  'production readiness',
  'security readiness',
  'operational readiness',
  'pilot readiness',
  'RLS readiness',
  'tenant-isolation proof',
  'artifact SELECT isolation',
  'schema readiness',
  'local readiness',
  'local startup success',
  'buyer readiness',
  'product readiness',
  'release-candidate readiness',
  'compliance certification',
  'readiness evidence',
] as const;

const baselineReference =
  'M5.6b accepted baseline after PR #181: accepted/head 42df9cfdb0cad3ecfd753f3b83a7dc995750ba80, merge 37c32feeca0dbef13f460eb4fcfbc95e821032a7, post-merge 2e5eeadbe43c80a6775d9f80efe929eb7eb4acdb.';

const futureApprovalGateRequirement =
  'Separate AP go/no-go decision with selected track, exact scope, run count, allowed outputs, prohibited outputs, stop conditions, abort rules, reviewer, evidence storage boundary, post-run summary requirements, and proof-boundary wording.';

export interface CandidateEvidenceTrackComparison {
  id: EvidenceExecutionTrackId;
  label: string;
  objective: string;
  currentStatus: EvidenceExecutionProofStatus;
  riskLevel: EvidenceExecutionRiskLevel;
  buyerValue: EvidenceExecutionBuyerValueLevel;
  riskRank: number;
  buyerValueRank: number;
  prerequisiteProofNeeds: readonly string[];
  prohibitedOutputs: readonly EvidenceExecutionProhibitedOutputField[];
  prohibitedActions: readonly EvidenceExecutionProhibitedAction[];
  apApprovalRequiredBeforeExecution: boolean;
  recommendedFirstCandidate: boolean;
  recommendationRationale: string;
}

export interface ApApprovalDecisionContract {
  selectedTrackId: EvidenceExecutionTrackId;
  selectedTrackIsCandidateOnly: boolean;
  apDecision: ApDecisionState;
  approvalGranted: boolean;
  executionApproved: boolean;
  executionPerformed: boolean;
  scope: string;
  runCount: {
    minimum: number;
    maximum: number;
    exact: number;
  };
  allowedOutputs: readonly string[];
  prohibitedOutputs: readonly EvidenceExecutionProhibitedOutputField[];
  stopConditions: readonly string[];
  abortRules: readonly string[];
  reviewer: string;
  evidenceStorageBoundary: string;
  postRunSummaryRequirements: readonly string[];
}

export interface FutureEvidenceExecutionContract {
  trackId: EvidenceExecutionTrackId;
  label: string;
  candidateOnly: boolean;
  executionApproved: boolean;
  executionPerformed: boolean;
  runScopeTemplate: readonly string[];
  allowedObservations: readonly string[];
  prohibitedOutputs: readonly EvidenceExecutionProhibitedOutputField[];
  stopConditions: readonly string[];
  abortRules: readonly string[];
  postRunEvidenceSummaryTemplate: readonly string[];
  proofBoundaryWording: readonly string[];
}

export interface EvidenceExecutionGateSnapshot {
  generatedAt: string;
  milestone: string;
  modelOnly: boolean;
  baselineReference: string;
  apApprovalGranted: boolean;
  executionApproved: boolean;
  executionPerformed: boolean;
  browserExecutionPerformed: boolean;
  screenshotEvidenceProduced: boolean;
  exportPdfDownloadArtifactProduced: boolean;
  storageObjectCreated: boolean;
  signedUrlGenerated: boolean;
  approvalWorkflowExecuted: boolean;
  statusChangedByWorkflow: boolean;
  dbRlsArtifactExecutionPerformed: boolean;
  schemaInspectionPerformed: boolean;
  hostedDeploymentExecutionPerformed: boolean;
  providerClassifierExecutionPerformed: boolean;
  rollbackIncidentBackupRestoreExecutionPerformed: boolean;
  realAssertionExecutionPerformed: boolean;
  readinessEvidenceProduced: boolean;
  postM57ExecutionMilestoneStarted: boolean;
  candidateTracks: readonly CandidateEvidenceTrackComparison[];
  recommendedFirstCandidateTrackId: EvidenceExecutionTrackId;
  apApprovalDecisionContract: ApApprovalDecisionContract;
  futureExecutionContract: FutureEvidenceExecutionContract;
  prohibitedOutputFields: readonly EvidenceExecutionProhibitedOutputField[];
  prohibitedActions: readonly EvidenceExecutionProhibitedAction[];
  blockedReadinessClaims: readonly string[];
  deprecatedBuyerFacingLiteNames: readonly string[];
}

const commonPrerequisiteProofNeeds = [
  futureApprovalGateRequirement,
  'Accepted proof-boundary wording that does not imply readiness before evidence exists.',
  'Accepted redaction boundary that excludes raw, local, secret, browser, artifact, DB, hosted, provider, and machine-specific output.',
] as const;

const candidateTracks: readonly CandidateEvidenceTrackComparison[] = [
  {
    id: 'manual_browser_walkthrough',
    label: 'Manual Browser Walkthrough Evidence Gate',
    objective: 'Prepare AP to choose a future manual browser walkthrough evidence run as the first candidate without launching a browser or creating browser evidence now.',
    currentStatus: 'candidate_only',
    riskLevel: 'medium_high',
    buyerValue: 'very_high',
    riskRank: 1,
    buyerValueRank: 6,
    prerequisiteProofNeeds: [
      ...commonPrerequisiteProofNeeds,
      'Future scope must limit observations to redacted step outcomes and proof-boundary notes.',
      'Future run must exclude screenshots, browser output, exports, downloads, storage objects, workflow status changes, DB/RLS checks, hosted validation, provider/classifier calls, and readiness claims unless separately approved.',
    ],
    prohibitedOutputs: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
    prohibitedActions: [...EVIDENCE_EXECUTION_PROHIBITED_ACTIONS],
    apApprovalRequiredBeforeExecution: true,
    recommendedFirstCandidate: true,
    recommendationRationale:
      'Lowest relative enterprise execution risk among candidate tracks because it can be scoped to a single manual observation run without DB/RLS, hosted/deployment, provider/classifier, export, storage, or workflow execution while still offering high buyer-visible review value.',
  },
  {
    id: 'rls_tenant_isolation_artifact_select',
    label: 'RLS / Tenant-Isolation / Artifact SELECT Evidence Gate',
    objective: 'Prepare a future DB/RLS/artifact proof track without inspecting schema or executing assertions now.',
    currentStatus: 'approval_required',
    riskLevel: 'critical',
    buyerValue: 'very_high',
    riskRank: 6,
    buyerValueRank: 6,
    prerequisiteProofNeeds: [
      ...commonPrerequisiteProofNeeds,
      'Future DB/RLS/artifact evidence requires exact assertion categories, tenant boundary, run count, and prohibited output rules.',
      'Future execution must avoid raw rows, row payloads, claim values, SQL result sets, policy dumps, schema dumps, artifact payloads, and machine-specific output.',
    ],
    prohibitedOutputs: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
    prohibitedActions: [...EVIDENCE_EXECUTION_PROHIBITED_ACTIONS],
    apApprovalRequiredBeforeExecution: true,
    recommendedFirstCandidate: false,
    recommendationRationale:
      'High enterprise proof value, but higher first-run risk because it requires DB/RLS/artifact execution and careful tenant/output controls.',
  },
  {
    id: 'hosted_deployment_operations',
    label: 'Hosted / Deployment / Operations Evidence Gate',
    objective: 'Prepare a future hosted/deployment/operations evidence track without hosted validation, deployment validation, startup checks, or readiness checks now.',
    currentStatus: 'approval_required',
    riskLevel: 'critical',
    buyerValue: 'high',
    riskRank: 5,
    buyerValueRank: 5,
    prerequisiteProofNeeds: [
      ...commonPrerequisiteProofNeeds,
      'Future hosted/deployment evidence requires environment ownership, deployment target, rollback, incident, backup/restore, and support boundaries before any validation.',
      'Future output must exclude deployment URLs, environment values, raw logs, host values, ports, IP values, and machine-specific output.',
    ],
    prohibitedOutputs: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
    prohibitedActions: [...EVIDENCE_EXECUTION_PROHIBITED_ACTIONS],
    apApprovalRequiredBeforeExecution: true,
    recommendedFirstCandidate: false,
    recommendationRationale:
      'High operational value, but not the first candidate because hosted/deployment validation carries environment and readiness-claim risk.',
  },
  {
    id: 'secure_export_pdf_download_artifact_storage',
    label: 'Secure Export / PDF / Download / Artifact Storage Evidence Gate',
    objective: 'Prepare a future artifact/export/storage evidence track without generating files, storage objects, signed URLs, or download output now.',
    currentStatus: 'approval_required',
    riskLevel: 'high',
    buyerValue: 'high',
    riskRank: 3,
    buyerValueRank: 5,
    prerequisiteProofNeeds: [
      ...commonPrerequisiteProofNeeds,
      'Future artifact evidence requires exact artifact type, lineage, retention, storage boundary, and metadata redaction scope.',
      'Future output must exclude file paths, object paths, signed URLs, public URLs, binary content, full document bodies, and raw payloads.',
    ],
    prohibitedOutputs: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
    prohibitedActions: [...EVIDENCE_EXECUTION_PROHIBITED_ACTIONS],
    apApprovalRequiredBeforeExecution: true,
    recommendedFirstCandidate: false,
    recommendationRationale:
      'Important buyer artifact value, but should follow scope hardening because file/storage output creates artifact handling risk.',
  },
  {
    id: 'provider_classifier_boundary',
    label: 'Provider / Classifier Boundary Evidence Gate',
    objective: 'Prepare a future provider/classifier boundary evidence track without invoking providers or classifiers now.',
    currentStatus: 'approval_required',
    riskLevel: 'high',
    buyerValue: 'medium',
    riskRank: 4,
    buyerValueRank: 3,
    prerequisiteProofNeeds: [
      ...commonPrerequisiteProofNeeds,
      'Future provider/classifier evidence requires server-side execution boundaries, key-reference controls, and no browser-side secret exposure.',
      'Future output must exclude provider responses, classifier payloads, provider keys, service-role tokens, private tokens, and environment values.',
    ],
    prohibitedOutputs: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
    prohibitedActions: [...EVIDENCE_EXECUTION_PROHIBITED_ACTIONS],
    apApprovalRequiredBeforeExecution: true,
    recommendedFirstCandidate: false,
    recommendationRationale:
      'Useful control evidence, but lower first buyer value and higher secret/provider exposure risk than a tightly scoped manual walkthrough candidate.',
  },
  {
    id: 'approval_workflow_status_transition',
    label: 'Approval Workflow / Status Transition Evidence Gate',
    objective: 'Prepare a future approval workflow evidence track without executing workflows or changing approval/signoff/source/status values now.',
    currentStatus: 'approval_required',
    riskLevel: 'high',
    buyerValue: 'high',
    riskRank: 2,
    buyerValueRank: 4,
    prerequisiteProofNeeds: [
      ...commonPrerequisiteProofNeeds,
      'Future workflow evidence requires exact transition map, authorized reviewer role, rollback/abort behavior, audit event scope, and status boundary.',
      'Future output must exclude raw audit payloads, row payloads, claim values, auth headers, and status changes outside the approved run.',
    ],
    prohibitedOutputs: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
    prohibitedActions: [...EVIDENCE_EXECUTION_PROHIBITED_ACTIONS],
    apApprovalRequiredBeforeExecution: true,
    recommendedFirstCandidate: false,
    recommendationRationale:
      'Strong enterprise control value, but should stay separate from the first evidence gate because workflow execution changes state.',
  },
] as const;

const stopConditions = [
  'AP approval decision is missing, pending, unclear, or not approved.',
  'Selected track, exact scope, run count, allowed outputs, prohibited outputs, stop conditions, abort rules, reviewer, storage boundary, or proof-boundary wording is unclear.',
  'Any request attempts browser execution, browser automation, screenshot capture, export/PDF/download generation, storage object creation, signed URL generation, approval workflow execution, status change, DB/RLS/artifact execution, schema inspection, hosted/deployment validation, startup checks, readiness checks, provider/classifier execution, rollback/incident/backup/restore execution, or real assertions outside the separately approved future gate.',
  'Any raw, local, secret, host, port, IP, DB, row, claim, provider, project, target, environment, deployment, browser, screenshot, export, PDF, download, storage, signed URL, schema, SQL, policy, migration, artifact SELECT, provider response, classifier output, container, image, or machine-specific output risk appears.',
  'Any wording implies AP approval has been granted, execution has been performed, readiness evidence exists, or a readiness/proof/certification domain has been achieved.',
  'Scope expands beyond deterministic gate selection, approval contract preparation, future execution contract preparation, read-only summaries, tests, guardrails, and tracking updates.',
] as const;

const abortRules = [
  'Abort before any future run if AP decision is not explicitly approved in a separate gate.',
  'Abort before any future run if the selected track differs from the approved track.',
  'Abort before any future run if run count exceeds the approved exact count.',
  'Abort before or during any future run if prohibited output could be emitted or stored.',
  'Abort before or during any future run if the operator is asked to create screenshots, exports, downloads, storage objects, signed URLs, workflow status changes, DB/RLS/artifact results, hosted/deployment results, provider/classifier outputs, or readiness evidence outside the approved scope.',
  'Abort before or during any future run if proof-boundary wording becomes unclear or implies readiness.',
] as const;

const apApprovalDecisionContract: ApApprovalDecisionContract = {
  selectedTrackId: 'manual_browser_walkthrough',
  selectedTrackIsCandidateOnly: true,
  apDecision: 'pending',
  approvalGranted: false,
  executionApproved: false,
  executionPerformed: false,
  scope:
    'Candidate-only future manual browser walkthrough evidence scope; AP has not approved execution, run count, outputs, reviewer, storage boundary, or post-run summary.',
  runCount: {
    minimum: 1,
    maximum: 1,
    exact: 1,
  },
  allowedOutputs: [
    'Future redacted step outcome summary after separate AP approval only.',
    'Future limitation and proof-boundary summary after separate AP approval only.',
    'Future stop-condition summary after separate AP approval only.',
  ],
  prohibitedOutputs: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
  stopConditions: [...stopConditions],
  abortRules: [...abortRules],
  reviewer: 'AP-designated reviewer required before future execution.',
  evidenceStorageBoundary:
    'Future evidence may be summarized in documentation only after AP approves storage boundary; no screenshots, files, browser output, exports, PDFs, downloads, storage objects, signed URLs, raw logs, or readiness artifacts are allowed by this gate.',
  postRunSummaryRequirements: [
    'Record selected track and AP decision reference.',
    'Record exact run count and whether the run stayed inside scope.',
    'Record redacted step outcome summary without raw browser output or screenshots.',
    'Record stop conditions encountered and abort decision if any.',
    'Record proof-boundary wording that keeps readiness domains unproven unless separate accepted evidence exists.',
  ],
};

const futureExecutionContract: FutureEvidenceExecutionContract = {
  trackId: 'manual_browser_walkthrough',
  label: 'Manual Browser Walkthrough Evidence Gate Future Contract',
  candidateOnly: true,
  executionApproved: false,
  executionPerformed: false,
  runScopeTemplate: [
    'Future scope must identify the exact surfaces to observe before any browser launch is approved.',
    'Future scope must use exactly one approved run unless AP grants a different count in a separate decision.',
    'Future scope must remain observation-only and must not execute workflows, change statuses, generate artifacts, access storage, run DB/RLS/artifact checks, run hosted/deployment checks, or invoke providers/classifiers.',
  ],
  allowedObservations: [
    'Redacted step label.',
    'Redacted expected-observation outcome.',
    'Blocked, passed-with-limitation, or stopped status for the future run only after AP approval.',
    'Proof-boundary note without screenshots, raw browser output, exports, or readiness claims.',
  ],
  prohibitedOutputs: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
  stopConditions: [...stopConditions],
  abortRules: [...abortRules],
  postRunEvidenceSummaryTemplate: [
    'Milestone and approved gate reference.',
    'Selected track and AP decision state.',
    'Run count used and scope boundary summary.',
    'Allowed observation summary only.',
    'Prohibited output confirmation.',
    'Stop condition and abort summary.',
    'Proof-boundary confirmation and readiness claim exclusions.',
  ],
  proofBoundaryWording: [
    'Manual browser walkthrough remains a candidate only until AP separately grants explicit go/no-go approval.',
    'M5.7 does not approve browser execution, screenshots, exports, workflow execution, DB/RLS/artifact execution, hosted/deployment validation, provider/classifier execution, real assertions, or readiness evidence.',
    'Future manual observation evidence, if later approved and performed, cannot by itself prove production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, or compliance readiness.',
  ],
};

const cloneCandidateTrack = (
  candidate: CandidateEvidenceTrackComparison,
): CandidateEvidenceTrackComparison => ({
  ...candidate,
  prerequisiteProofNeeds: [...candidate.prerequisiteProofNeeds],
  prohibitedOutputs: [...candidate.prohibitedOutputs],
  prohibitedActions: [...candidate.prohibitedActions],
});

const cloneApApprovalDecisionContract = (
  contract: ApApprovalDecisionContract,
): ApApprovalDecisionContract => ({
  ...contract,
  runCount: { ...contract.runCount },
  allowedOutputs: [...contract.allowedOutputs],
  prohibitedOutputs: [...contract.prohibitedOutputs],
  stopConditions: [...contract.stopConditions],
  abortRules: [...contract.abortRules],
  postRunSummaryRequirements: [...contract.postRunSummaryRequirements],
});

const cloneFutureExecutionContract = (
  contract: FutureEvidenceExecutionContract,
): FutureEvidenceExecutionContract => ({
  ...contract,
  runScopeTemplate: [...contract.runScopeTemplate],
  allowedObservations: [...contract.allowedObservations],
  prohibitedOutputs: [...contract.prohibitedOutputs],
  stopConditions: [...contract.stopConditions],
  abortRules: [...contract.abortRules],
  postRunEvidenceSummaryTemplate: [...contract.postRunEvidenceSummaryTemplate],
  proofBoundaryWording: [...contract.proofBoundaryWording],
});

export function buildEvidenceExecutionGateSnapshot(): EvidenceExecutionGateSnapshot {
  return {
    generatedAt: EVIDENCE_EXECUTION_GATE_GENERATED_AT,
    milestone: 'M5.7 First AP-Approved Evidence Execution Gate',
    modelOnly: true,
    baselineReference,
    apApprovalGranted: false,
    executionApproved: false,
    executionPerformed: false,
    browserExecutionPerformed: false,
    screenshotEvidenceProduced: false,
    exportPdfDownloadArtifactProduced: false,
    storageObjectCreated: false,
    signedUrlGenerated: false,
    approvalWorkflowExecuted: false,
    statusChangedByWorkflow: false,
    dbRlsArtifactExecutionPerformed: false,
    schemaInspectionPerformed: false,
    hostedDeploymentExecutionPerformed: false,
    providerClassifierExecutionPerformed: false,
    rollbackIncidentBackupRestoreExecutionPerformed: false,
    realAssertionExecutionPerformed: false,
    readinessEvidenceProduced: false,
    postM57ExecutionMilestoneStarted: false,
    candidateTracks: candidateTracks.map(cloneCandidateTrack),
    recommendedFirstCandidateTrackId: 'manual_browser_walkthrough',
    apApprovalDecisionContract: cloneApApprovalDecisionContract(apApprovalDecisionContract),
    futureExecutionContract: cloneFutureExecutionContract(futureExecutionContract),
    prohibitedOutputFields: [...EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS],
    prohibitedActions: [...EVIDENCE_EXECUTION_PROHIBITED_ACTIONS],
    blockedReadinessClaims: [...EVIDENCE_EXECUTION_BLOCKED_READINESS_CLAIMS],
    deprecatedBuyerFacingLiteNames: [...DEPRECATED_BUYER_FACING_LITE_NAMES],
  };
}

export const CURRENT_EVIDENCE_EXECUTION_GATE_SNAPSHOT = buildEvidenceExecutionGateSnapshot();

export function getCandidateEvidenceTrack(
  trackId: EvidenceExecutionTrackId,
  snapshot: EvidenceExecutionGateSnapshot = buildEvidenceExecutionGateSnapshot(),
): CandidateEvidenceTrackComparison {
  const candidate = snapshot.candidateTracks.find(track => track.id === trackId);
  if (!candidate) {
    throw new Error(`Missing candidate evidence track: ${trackId}`);
  }

  return cloneCandidateTrack(candidate);
}

export function getRecommendedCandidateEvidenceTrack(
  snapshot: EvidenceExecutionGateSnapshot = buildEvidenceExecutionGateSnapshot(),
): CandidateEvidenceTrackComparison {
  return getCandidateEvidenceTrack(snapshot.recommendedFirstCandidateTrackId, snapshot);
}

export function assertEvidenceExecutionGateCopyIsClaimSafe(copy: string): void {
  for (const deprecatedName of DEPRECATED_BUYER_FACING_LITE_NAMES) {
    if (copy.includes(deprecatedName)) {
      throw new Error(`Deprecated buyer-facing name is not allowed: ${deprecatedName}`);
    }
  }

  const unsupportedPositiveClaimPatterns = [
    /\bAP\s+approval\s+(granted|recorded|approved|complete|completed)\b/i,
    /\bAP[- ]approved\s+(execution|run|evidence|gate)\s+(complete|completed|performed|available|ready|accepted|granted)\b/i,
    /\bbrowser\s+walkthrough\s+(executed|verified|passed|complete|completed)\b/i,
    /\bbrowser\s+(executed|verified|passed|complete|completed)\b/i,
    /\bscreenshot\s+(proof|evidence)?\s*(produced|captured|available|ready)\b/i,
    /\bexport\/PDF\/download\s+readiness\s+(proved|complete|verified|accepted|achieved|available)\b/i,
    /\b(export|PDF|download)\s+ready\b/i,
    /\bhosted\s+ready\b/i,
    /\bhosted\s+(validated|verified|passed)\b/i,
    /\bdeployment\s+ready\b/i,
    /\bdeployment\s+(validated|verified|passed)\b/i,
    /\bproduction\s+ready\b/i,
    /\bsecurity\s+ready\b/i,
    /\boperational\s+ready\b/i,
    /\bpilot\s+ready\b/i,
    /\bRLS\s+(ready|verified|passed|active)\b/i,
    /\btenant[- ]isolation\s+(ready|verified|proven|passed)\b/i,
    /\btenant[- ]isolation\s+proof\s+(exists|available|accepted|achieved|complete)\b/i,
    /\bartifact\s+SELECT\s+(ready|verified|proven|passed)\b/i,
    /\bschema\s+(ready|verified|proven|available)\b/i,
    /\blocal\s+(ready|verified|proven)\b/i,
    /\blocal\s+startup\s+success\s+(achieved|verified|proven)\b/i,
    /\bbuyer\s+ready\b/i,
    /\bproduct\s+ready\b/i,
    /\brelease[- ]candidate\s+ready\b/i,
    /\bcompliance\s+certified\b/i,
    /\breadiness\s+evidence\s+(produced|created|available|accepted)\b/i,
  ];

  for (const pattern of unsupportedPositiveClaimPatterns) {
    if (pattern.test(copy)) {
      throw new Error(`Unsupported M5.7 execution, readiness, or proof claim is not allowed: ${pattern}`);
    }
  }
}

export function assertEvidenceExecutionGateSnapshotIsExecutionNeutral(
  snapshot: EvidenceExecutionGateSnapshot = buildEvidenceExecutionGateSnapshot(),
): void {
  if (!snapshot.modelOnly) {
    throw new Error('M5.7 evidence execution gate snapshot must remain model-only.');
  }
  if (snapshot.apApprovalGranted || snapshot.executionApproved || snapshot.executionPerformed) {
    throw new Error('AP approval, execution approval, and execution performed flags must remain false.');
  }
  if (snapshot.browserExecutionPerformed || snapshot.screenshotEvidenceProduced) {
    throw new Error('Browser execution and screenshot evidence must remain unperformed.');
  }
  if (
    snapshot.exportPdfDownloadArtifactProduced ||
    snapshot.storageObjectCreated ||
    snapshot.signedUrlGenerated
  ) {
    throw new Error('Export/PDF/download, storage object, and signed URL outputs must remain uncreated.');
  }
  if (snapshot.approvalWorkflowExecuted || snapshot.statusChangedByWorkflow) {
    throw new Error('Approval workflows and workflow-driven status changes must remain unperformed.');
  }
  if (snapshot.dbRlsArtifactExecutionPerformed || snapshot.schemaInspectionPerformed) {
    throw new Error('DB/RLS/artifact execution and schema inspection must remain unperformed.');
  }
  if (snapshot.hostedDeploymentExecutionPerformed || snapshot.providerClassifierExecutionPerformed) {
    throw new Error('Hosted/deployment and provider/classifier execution must remain unperformed.');
  }
  if (snapshot.rollbackIncidentBackupRestoreExecutionPerformed || snapshot.realAssertionExecutionPerformed) {
    throw new Error('Rollback/incident/backup/restore execution and real assertions must remain unperformed.');
  }
  if (snapshot.readinessEvidenceProduced || snapshot.postM57ExecutionMilestoneStarted) {
    throw new Error('Readiness evidence and post-M5.7 execution milestone start must remain false.');
  }

  const recommendedTracks = snapshot.candidateTracks.filter(track => track.recommendedFirstCandidate);
  if (recommendedTracks.length !== 1) {
    throw new Error(`Exactly one first candidate track must be recommended; found ${recommendedTracks.length}.`);
  }
  if (recommendedTracks[0].id !== snapshot.recommendedFirstCandidateTrackId) {
    throw new Error('Recommended track id must match the recommended candidate flag.');
  }
  if (snapshot.recommendedFirstCandidateTrackId !== 'manual_browser_walkthrough') {
    throw new Error('Manual Browser Walkthrough must remain the recommended first candidate track.');
  }

  const decision = snapshot.apApprovalDecisionContract;
  if (
    decision.apDecision !== 'pending' ||
    decision.approvalGranted ||
    decision.executionApproved ||
    decision.executionPerformed ||
    !decision.selectedTrackIsCandidateOnly
  ) {
    throw new Error('AP decision contract must remain pending, candidate-only, unapproved, and unperformed.');
  }
  if (decision.runCount.minimum !== 1 || decision.runCount.maximum !== 1 || decision.runCount.exact !== 1) {
    throw new Error('AP decision contract must default to exactly one future run template.');
  }

  const futureContract = snapshot.futureExecutionContract;
  if (!futureContract.candidateOnly || futureContract.executionApproved || futureContract.executionPerformed) {
    throw new Error('Future execution contract must remain candidate-only, unapproved, and unperformed.');
  }
  if (futureContract.trackId !== snapshot.recommendedFirstCandidateTrackId) {
    throw new Error('Future execution contract must align to the recommended first candidate track.');
  }

  for (const field of EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS) {
    if (!snapshot.prohibitedOutputFields.includes(field)) {
      throw new Error(`M5.7 snapshot must prohibit output field: ${field}`);
    }
    if (!decision.prohibitedOutputs.includes(field)) {
      throw new Error(`AP decision contract must prohibit output field: ${field}`);
    }
    if (!futureContract.prohibitedOutputs.includes(field)) {
      throw new Error(`Future execution contract must prohibit output field: ${field}`);
    }
  }

  for (const action of EVIDENCE_EXECUTION_PROHIBITED_ACTIONS) {
    if (!snapshot.prohibitedActions.includes(action)) {
      throw new Error(`M5.7 snapshot must prohibit action: ${action}`);
    }
  }

  for (const track of snapshot.candidateTracks) {
    if (!track.apApprovalRequiredBeforeExecution) {
      throw new Error(`Candidate track must require AP approval before execution: ${track.id}`);
    }
    if (track.prerequisiteProofNeeds.length === 0) {
      throw new Error(`Candidate track must record prerequisite proof needs: ${track.id}`);
    }
    for (const field of EVIDENCE_EXECUTION_PROHIBITED_OUTPUT_FIELDS) {
      if (!track.prohibitedOutputs.includes(field)) {
        throw new Error(`Candidate track ${track.id} must prohibit output field ${field}.`);
      }
    }
    assertEvidenceExecutionGateCopyIsClaimSafe([
      track.label,
      track.objective,
      track.recommendationRationale,
      ...track.prerequisiteProofNeeds,
    ].join('\n'));
  }

  assertEvidenceExecutionGateCopyIsClaimSafe([
    decision.scope,
    ...decision.allowedOutputs,
    ...decision.stopConditions,
    ...decision.abortRules,
    decision.reviewer,
    decision.evidenceStorageBoundary,
    ...decision.postRunSummaryRequirements,
    futureContract.label,
    ...futureContract.runScopeTemplate,
    ...futureContract.allowedObservations,
    ...futureContract.stopConditions,
    ...futureContract.abortRules,
    ...futureContract.postRunEvidenceSummaryTemplate,
    ...futureContract.proofBoundaryWording,
  ].join('\n'));
}

export const M5_7_EVIDENCE_EXECUTION_GATE_ACCEPTED_BASELINE = baselineReference;
