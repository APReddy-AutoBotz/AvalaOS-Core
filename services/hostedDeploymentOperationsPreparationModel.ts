import { DEPRECATED_BUYER_FACING_LITE_NAMES } from './evidenceControlModel';

export const HOSTED_DEPLOYMENT_OPERATIONS_PREPARATION_GENERATED_AT = '2026-07-06T00:00:00.000Z';

export const HOSTED_DEPLOYMENT_PREPARATION_PROOF_STATUSES = [
  'unproven',
  'evidence_required',
  'planned',
  'blocked',
] as const;

export type HostedDeploymentPreparationProofStatus =
  typeof HOSTED_DEPLOYMENT_PREPARATION_PROOF_STATUSES[number];

export const HOSTED_ENVIRONMENT_CLASS_IDS = [
  'local_development_reference',
  'branch_preview_reference',
  'staging_reference',
  'pilot_reference',
  'production_reference',
] as const;

export type HostedEnvironmentClassId = typeof HOSTED_ENVIRONMENT_CLASS_IDS[number];

export const OPERATIONAL_GATE_CATEGORY_IDS = [
  'environment_ownership_boundary',
  'deployment_change_control_boundary',
  'configuration_secrets_ownership_boundary',
  'observability_logging_expectation_boundary',
  'backup_restore_expectation_boundary',
  'rollback_incident_response_boundary',
  'support_escalation_boundary',
  'pilot_evidence_prerequisite_boundary',
] as const;

export type OperationalGateCategoryId = typeof OPERATIONAL_GATE_CATEGORY_IDS[number];

export const HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS = [
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
  'storage_object_reference',
  'signed_url',
  'container_id',
  'image_id',
  'machine_specific_value',
  'raw_run_output',
  'schema_dump',
  'sql_result_set',
  'policy_definition_dump',
  'migration_output',
  'artifact_select_payload',
] as const;

export type HostedDeploymentProhibitedOutputField =
  typeof HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS[number];

export const HOSTED_DEPLOYMENT_REDACTION_RULES = [
  'Summarize verification tasks by task name only.',
  'Exclude raw logs, stdout, stderr, stack traces, local paths, host values, port values, IP values, DB URLs, row payloads, auth headers, claim values, provider keys, service-role tokens, private tokens, project refs, target values, environment values, deployment URLs, storage object references, signed URLs, container IDs, image IDs, raw run output, schema dumps, SQL result sets, policy dumps, migration output, artifact SELECT payloads, and machine-specific values.',
  'Record future hosted, deployment, operations, rollback, incident, backup, restore, support, and pilot prerequisites without probing or validating any environment.',
  'Keep preparation status separate from any future hosted, deployment, production, operational, pilot, security, RLS, tenant-isolation, schema, local startup, or readiness claim.',
  'Require a later AP-approved evidence execution gate before any hosted validation, deployment validation, startup check, readiness check, rollback execution, incident execution, backup/restore execution, provider/classifier execution, DB/RLS/artifact execution, or real assertion can be represented as run.',
] as const;

export const HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS = [
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

export const HOSTED_DEPLOYMENT_STOP_CONDITIONS = [
  'Missing AP-approved hosted/deployment/operations execution gate.',
  'Unclear scope, run count, environment boundary, output boundary, prohibited output rule, rollback boundary, incident boundary, backup/restore boundary, or pilot-evidence boundary.',
  'Any request to run hosted validation, deployment validation, startup checks, readiness checks, Supabase stack, Docker, DB checks, RLS checks, artifact SELECT checks, tenant-isolation checks, schema inspection, SQL, migrations, provider execution, classifier execution, rollback execution, incident execution, backup/restore execution, browser execution, workflow execution, storage access, export generation, screenshot capture, or real assertions.',
  'Any raw log, stdout, stderr, stack trace, local path, host, port, IP, DB URL, row payload, auth header, claim value, provider key, service-role token, private token, project ref, target value, environment value, deployment URL, storage object reference, signed URL, container ID, image ID, raw run output, schema dump, SQL result set, policy dump, migration output, artifact SELECT payload, or machine-specific value would be emitted.',
  'Any environment, gate, runbook, rollback, incident, backup, restore, support, pilot, or evidence item is marked executed, passed, verified, complete, accepted, or ready before accepted evidence exists.',
  'Any wording implies current readiness, proof, verification, certification, schema availability, environment verification, startup success, operational proof, pilot proof, or hosted/deployment proof.',
  'Scope expands beyond deterministic preparation contracts, gate matrix planning, redaction rules, stop conditions, read-only summaries, tests, guardrails, and tracking updates.',
] as const;

const latestAcceptedBaseline =
  'M5.6a accepted baseline after PR #180: accepted/head ca11012135a37815f0a31e237dd99a665a56fe01, merge 127290f2f77f6623478cdc736a13f15417810725, post-merge f25dff9542afcd32bf3afad6b0c745215df9808d.';

const requiredFutureApGate =
  'Separate AP-approved hosted/deployment/operations evidence execution gate with exact scope, run count, output boundaries, prohibited outputs, stop conditions, and proof boundaries.';

export interface HostedEnvironmentClassContract {
  id: HostedEnvironmentClassId;
  label: string;
  objective: string;
  conceptualEnvironmentClass: string;
  currentProofStatus: HostedDeploymentPreparationProofStatus;
  environmentProbed: boolean;
  hostedValidationPerformed: boolean;
  deploymentValidationPerformed: boolean;
  startupCheckPerformed: boolean;
  readinessCheckPerformed: boolean;
  pilotEvidenceProduced: boolean;
  plannedOwnershipBoundaries: readonly string[];
  requiredFutureProof: readonly string[];
  blockedReadinessClaims: readonly string[];
  prohibitedOutputFields: readonly HostedDeploymentProhibitedOutputField[];
  stopConditions: readonly string[];
  apApprovalRequiredBeforeExecution: boolean;
}

export interface OperationalGateMatrixContract {
  id: OperationalGateCategoryId;
  label: string;
  objective: string;
  currentProofStatus: HostedDeploymentPreparationProofStatus;
  gateExecutionPerformed: boolean;
  gatePassed: boolean;
  gateVerified: boolean;
  plannedScope: readonly string[];
  requiredFutureProof: readonly string[];
  prohibitedOutputFields: readonly HostedDeploymentProhibitedOutputField[];
  stopConditions: readonly string[];
  apApprovalRequiredBeforeExecution: boolean;
}

export interface HostedDeploymentOperationsPreparationSnapshot {
  generatedAt: string;
  milestone: string;
  modelOnly: boolean;
  apApprovalGranted: boolean;
  hostedExecutionApproved: boolean;
  hostedValidationPerformed: boolean;
  deploymentValidationPerformed: boolean;
  startupCheckPerformed: boolean;
  readinessCheckPerformed: boolean;
  supabaseStackExecutionPerformed: boolean;
  dockerExecutionPerformed: boolean;
  dbRlsArtifactExecutionPerformed: boolean;
  schemaInspectionPerformed: boolean;
  providerClassifierExecutionPerformed: boolean;
  realAssertionExecutionPerformed: boolean;
  rollbackExecutionPerformed: boolean;
  incidentExecutionPerformed: boolean;
  backupRestoreExecutionPerformed: boolean;
  pilotEvidenceProduced: boolean;
  readinessEvidenceProduced: boolean;
  proofStatuses: readonly HostedDeploymentPreparationProofStatus[];
  environmentClasses: readonly HostedEnvironmentClassContract[];
  operationalGateMatrix: readonly OperationalGateMatrixContract[];
  prohibitedOutputFields: readonly HostedDeploymentProhibitedOutputField[];
  redactionRules: readonly string[];
  stopConditions: readonly string[];
  blockedReadinessClaims: readonly string[];
  deprecatedBuyerFacingLiteNames: readonly string[];
}

const environmentClassDefinitions: readonly HostedEnvironmentClassContract[] = [
  {
    id: 'local_development_reference',
    label: 'Local Development Reference Class',
    objective: 'Describe the conceptual local development reference boundary without running startup checks, readiness checks, Supabase stack, Docker, schema inspection, or local environment probes.',
    conceptualEnvironmentClass: 'developer reference only',
    currentProofStatus: 'evidence_required',
    environmentProbed: false,
    hostedValidationPerformed: false,
    deploymentValidationPerformed: false,
    startupCheckPerformed: false,
    readinessCheckPerformed: false,
    pilotEvidenceProduced: false,
    plannedOwnershipBoundaries: [
      'Future local evidence must separate developer setup notes from hosted, deployment, or pilot evidence.',
      'Future local checks require AP-approved scope before any startup or readiness task can be represented as run.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted local-boundary evidence without local paths, host values, port values, IP values, raw logs, or machine-specific values.',
    ],
    blockedReadinessClaims: [...HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'branch_preview_reference',
    label: 'Branch Preview Reference Class',
    objective: 'Describe future preview-environment expectations without creating or validating a hosted preview target.',
    conceptualEnvironmentClass: 'future branch preview review target',
    currentProofStatus: 'unproven',
    environmentProbed: false,
    hostedValidationPerformed: false,
    deploymentValidationPerformed: false,
    startupCheckPerformed: false,
    readinessCheckPerformed: false,
    pilotEvidenceProduced: false,
    plannedOwnershipBoundaries: [
      'Future preview evidence must identify owner roles and change-control expectations without exposing deployment URLs.',
      'Future preview checks require AP-approved output limits before any hosted validation can be represented as run.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted preview-environment evidence without deployment URLs, host values, raw run output, or environment values.',
    ],
    blockedReadinessClaims: [...HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'staging_reference',
    label: 'Staging Reference Class',
    objective: 'Describe future staging ownership, configuration, rollback, support, and observability expectations without validating staging behavior.',
    conceptualEnvironmentClass: 'future staging review target',
    currentProofStatus: 'evidence_required',
    environmentProbed: false,
    hostedValidationPerformed: false,
    deploymentValidationPerformed: false,
    startupCheckPerformed: false,
    readinessCheckPerformed: false,
    pilotEvidenceProduced: false,
    plannedOwnershipBoundaries: [
      'Future staging evidence must define deployment approver, rollback owner, incident owner, and support escalation owner before execution.',
      'Future staging validation requires AP-approved evidence scope and redaction boundaries before any run.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted staging evidence without deployment URLs, environment values, DB URLs, project refs, provider keys, or raw logs.',
    ],
    blockedReadinessClaims: [...HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'pilot_reference',
    label: 'Pilot Reference Class',
    objective: 'Describe future pilot-evidence prerequisites without representing pilot evidence, hosted proof, deployment proof, or operational proof.',
    conceptualEnvironmentClass: 'future pilot evidence target',
    currentProofStatus: 'evidence_required',
    environmentProbed: false,
    hostedValidationPerformed: false,
    deploymentValidationPerformed: false,
    startupCheckPerformed: false,
    readinessCheckPerformed: false,
    pilotEvidenceProduced: false,
    plannedOwnershipBoundaries: [
      'Future pilot evidence requires AP-approved go/no-go scope, ownership, rollback, incident, support, and output boundaries.',
      'Future pilot checks must wait until prerequisite hosted, deployment, RLS, tenant-isolation, export/artifact, and provider boundaries have accepted evidence where required.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted pilot evidence only after prerequisite proof tracks exist and without deployment URLs, environment values, raw logs, screenshots, exports, or storage references.',
    ],
    blockedReadinessClaims: [...HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'production_reference',
    label: 'Production Reference Class',
    objective: 'Describe future production-class ownership and change-control expectations without proving production, hosted, deployment, security, operational, or pilot readiness.',
    conceptualEnvironmentClass: 'future production-class target',
    currentProofStatus: 'unproven',
    environmentProbed: false,
    hostedValidationPerformed: false,
    deploymentValidationPerformed: false,
    startupCheckPerformed: false,
    readinessCheckPerformed: false,
    pilotEvidenceProduced: false,
    plannedOwnershipBoundaries: [
      'Future production-class evidence requires AP-approved ownership, change-control, rollback, incident, observability, backup/restore, support, and security review boundaries before execution.',
      'Future production-class claims require accepted evidence from prerequisite tracks and cannot be inferred from preparation models.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted production-class evidence without deployment URLs, environment values, DB URLs, provider keys, raw logs, storage references, or machine-specific values.',
    ],
    blockedReadinessClaims: [...HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
] as const;

const operationalGateDefinitions: readonly OperationalGateMatrixContract[] = [
  {
    id: 'environment_ownership_boundary',
    label: 'Environment Ownership Boundary',
    objective: 'Prepare future owner-role and environment-class ownership evidence without probing any environment.',
    currentProofStatus: 'evidence_required',
    gateExecutionPerformed: false,
    gatePassed: false,
    gateVerified: false,
    plannedScope: [
      'Future evidence must identify owner roles for each approved environment class.',
      'Future evidence must separate owner responsibility from technical validation outcomes.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted owner-role evidence without deployment URLs, environment values, local paths, host values, or raw logs.',
    ],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'deployment_change_control_boundary',
    label: 'Deployment Approval And Change-Control Boundary',
    objective: 'Prepare future deployment approval, review, rollback-decision, and change-control evidence without running deployment validation.',
    currentProofStatus: 'evidence_required',
    gateExecutionPerformed: false,
    gatePassed: false,
    gateVerified: false,
    plannedScope: [
      'Future evidence must record approver roles, change scope, rollback owner, and stop rules before any deployment validation.',
      'Future change-control records must remain separate from approval workflow execution unless a later AP gate authorizes it.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted change-control evidence without raw deployment output, deployment URLs, environment values, or approval workflow output.',
    ],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'configuration_secrets_ownership_boundary',
    label: 'Configuration And Secrets Ownership Boundary',
    objective: 'Prepare future configuration and secret ownership evidence without inspecting values.',
    currentProofStatus: 'evidence_required',
    gateExecutionPerformed: false,
    gatePassed: false,
    gateVerified: false,
    plannedScope: [
      'Future evidence must identify owner roles for configuration classes without exposing environment values or secret material.',
      'Future checks must summarize secret hygiene by task name and outcome only.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted configuration and secret ownership evidence without environment values, provider keys, auth headers, service-role tokens, private tokens, project refs, or target values.',
    ],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'observability_logging_expectation_boundary',
    label: 'Observability And Logging Expectation Boundary',
    objective: 'Prepare future observability and logging expectations without adding runtime logging or exposing raw logs.',
    currentProofStatus: 'evidence_required',
    gateExecutionPerformed: false,
    gatePassed: false,
    gateVerified: false,
    plannedScope: [
      'Future evidence must define expected event categories, owner roles, and redaction rules before runtime logging changes.',
      'Future observability evidence must summarize outcomes without raw logs, stdout, stderr, stack traces, hosts, ports, IP values, or machine-specific values.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted observability expectation evidence without runtime log payloads or machine-specific output.',
    ],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'backup_restore_expectation_boundary',
    label: 'Backup And Restore Expectation Boundary',
    objective: 'Prepare future backup/restore expectation evidence without executing backup or restore behavior.',
    currentProofStatus: 'evidence_required',
    gateExecutionPerformed: false,
    gatePassed: false,
    gateVerified: false,
    plannedScope: [
      'Future evidence must define backup owner, restore owner, retention expectation, recovery expectation, and data-exposure limits before execution.',
      'Future backup/restore evidence must not include DB URLs, row payloads, storage object references, signed URLs, raw logs, or schema dumps.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted backup/restore evidence without backup payloads, restore payloads, storage object references, signed URLs, DB URLs, or raw run output.',
    ],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'rollback_incident_response_boundary',
    label: 'Rollback And Incident Response Boundary',
    objective: 'Prepare future rollback and incident-response runbook evidence without executing rollback or incident behavior.',
    currentProofStatus: 'evidence_required',
    gateExecutionPerformed: false,
    gatePassed: false,
    gateVerified: false,
    plannedScope: [
      'Future evidence must define rollback owner, incident owner, severity triage, communications owner, stop rules, and redaction boundaries before execution.',
      'Future rollback and incident records must remain templates until a later AP-approved execution gate creates accepted evidence.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted rollback and incident evidence without raw run output, deployment URLs, environment values, local paths, or machine-specific values.',
    ],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'support_escalation_boundary',
    label: 'Support And Escalation Boundary',
    objective: 'Prepare future support runbook and escalation ownership evidence without creating incident tickets or support workflow output.',
    currentProofStatus: 'evidence_required',
    gateExecutionPerformed: false,
    gatePassed: false,
    gateVerified: false,
    plannedScope: [
      'Future evidence must define support owner roles, escalation timing, AP decision points, and customer-facing limitation disclosures.',
      'Future support records must exclude local paths, host values, environment values, raw logs, deployment URLs, and machine-specific values.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted support/escalation evidence without support workflow output, raw logs, host values, or environment values.',
    ],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'pilot_evidence_prerequisite_boundary',
    label: 'Pilot Evidence Prerequisite Boundary',
    objective: 'Prepare future pilot-evidence prerequisites without producing pilot evidence or starting a pilot execution milestone.',
    currentProofStatus: 'evidence_required',
    gateExecutionPerformed: false,
    gatePassed: false,
    gateVerified: false,
    plannedScope: [
      'Future pilot evidence requires accepted prerequisite proof boundaries for hosted, deployment, operations, RLS, tenant isolation, export/artifact, approval, browser, provider, and security tracks where applicable.',
      'Future pilot evidence must be created only inside a later AP-approved execution gate with exact output limits.',
    ],
    requiredFutureProof: [
      requiredFutureApGate,
      'Accepted pilot prerequisite evidence after dependency evidence exists, without screenshots, exports, storage references, deployment URLs, raw logs, or readiness claims.',
    ],
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
] as const;

const cloneEnvironmentClass = (
  environmentClass: HostedEnvironmentClassContract,
): HostedEnvironmentClassContract => ({
  ...environmentClass,
  plannedOwnershipBoundaries: [...environmentClass.plannedOwnershipBoundaries],
  requiredFutureProof: [...environmentClass.requiredFutureProof],
  blockedReadinessClaims: [...environmentClass.blockedReadinessClaims],
  prohibitedOutputFields: [...environmentClass.prohibitedOutputFields],
  stopConditions: [...environmentClass.stopConditions],
});

const cloneOperationalGate = (gate: OperationalGateMatrixContract): OperationalGateMatrixContract => ({
  ...gate,
  plannedScope: [...gate.plannedScope],
  requiredFutureProof: [...gate.requiredFutureProof],
  prohibitedOutputFields: [...gate.prohibitedOutputFields],
  stopConditions: [...gate.stopConditions],
});

export function buildHostedDeploymentOperationsPreparationSnapshot():
  HostedDeploymentOperationsPreparationSnapshot {
  return {
    generatedAt: HOSTED_DEPLOYMENT_OPERATIONS_PREPARATION_GENERATED_AT,
    milestone: 'M5.6b Hosted/Deployment/Operations Preparation Gate',
    modelOnly: true,
    apApprovalGranted: false,
    hostedExecutionApproved: false,
    hostedValidationPerformed: false,
    deploymentValidationPerformed: false,
    startupCheckPerformed: false,
    readinessCheckPerformed: false,
    supabaseStackExecutionPerformed: false,
    dockerExecutionPerformed: false,
    dbRlsArtifactExecutionPerformed: false,
    schemaInspectionPerformed: false,
    providerClassifierExecutionPerformed: false,
    realAssertionExecutionPerformed: false,
    rollbackExecutionPerformed: false,
    incidentExecutionPerformed: false,
    backupRestoreExecutionPerformed: false,
    pilotEvidenceProduced: false,
    readinessEvidenceProduced: false,
    proofStatuses: [...HOSTED_DEPLOYMENT_PREPARATION_PROOF_STATUSES],
    environmentClasses: environmentClassDefinitions.map(cloneEnvironmentClass),
    operationalGateMatrix: operationalGateDefinitions.map(cloneOperationalGate),
    prohibitedOutputFields: [...HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS],
    redactionRules: [...HOSTED_DEPLOYMENT_REDACTION_RULES],
    stopConditions: [...HOSTED_DEPLOYMENT_STOP_CONDITIONS],
    blockedReadinessClaims: [...HOSTED_DEPLOYMENT_BLOCKED_READINESS_CLAIMS],
    deprecatedBuyerFacingLiteNames: [...DEPRECATED_BUYER_FACING_LITE_NAMES],
  };
}

export const CURRENT_HOSTED_DEPLOYMENT_OPERATIONS_PREPARATION_SNAPSHOT =
  buildHostedDeploymentOperationsPreparationSnapshot();

export function getHostedEnvironmentClassContract(
  environmentClassId: HostedEnvironmentClassId,
  snapshot: HostedDeploymentOperationsPreparationSnapshot =
    buildHostedDeploymentOperationsPreparationSnapshot(),
): HostedEnvironmentClassContract {
  const environmentClass = snapshot.environmentClasses.find(candidate => candidate.id === environmentClassId);
  if (!environmentClass) {
    throw new Error(`Missing hosted environment class contract: ${environmentClassId}`);
  }

  return cloneEnvironmentClass(environmentClass);
}

export function getOperationalGateMatrixContract(
  gateId: OperationalGateCategoryId,
  snapshot: HostedDeploymentOperationsPreparationSnapshot =
    buildHostedDeploymentOperationsPreparationSnapshot(),
): OperationalGateMatrixContract {
  const gate = snapshot.operationalGateMatrix.find(candidate => candidate.id === gateId);
  if (!gate) {
    throw new Error(`Missing operational gate matrix contract: ${gateId}`);
  }

  return cloneOperationalGate(gate);
}

export function assertHostedDeploymentOperationsCopyIsClaimSafe(copy: string): void {
  for (const deprecatedName of DEPRECATED_BUYER_FACING_LITE_NAMES) {
    if (copy.includes(deprecatedName)) {
      throw new Error(`Deprecated buyer-facing name is not allowed: ${deprecatedName}`);
    }
  }

  const unsupportedPositiveClaimPatterns = [
    /\bhosted\s+ready\b/i,
    /\bhosted\s+(validated|verified|passed)\b/i,
    /\bhosted\s+readiness\s+(proved|complete|verified|accepted|achieved|available)\b/i,
    /\bdeployment\s+ready\b/i,
    /\bdeployment\s+(validated|verified|passed)\b/i,
    /\bdeployment\s+readiness\s+(proved|complete|verified|accepted|achieved|available)\b/i,
    /\bproduction\s+ready\b/i,
    /\bproduction\s+readiness\s+(proved|complete|verified|accepted|achieved|available)\b/i,
    /\bsecurity\s+ready\b/i,
    /\boperational\s+ready\b/i,
    /\boperational\s+readiness\s+(proved|complete|verified|accepted|achieved|available)\b/i,
    /\bpilot\s+ready\b/i,
    /\bpilot\s+readiness\s+(proved|complete|verified|accepted|achieved|available)\b/i,
    /\benvironment[- ]verified\b/i,
    /\benvironment\s+(validated|verified|passed)\b/i,
    /\bstartup\s+(passed|verified|complete|successful)\b/i,
    /\bstartup[- ]check[- ]passed\b/i,
    /\breadiness[- ]check[- ]passed\b/i,
    /\breadiness\s+check\s+passed\b/i,
    /\brollback[- ]ready\b/i,
    /\brollback\s+(ready|verified|passed)\b/i,
    /\bincident[- ]ready\b/i,
    /\bincident\s+(ready|verified|passed)\b/i,
    /\bbackup[- ]ready\b/i,
    /\bbackup\s+(ready|verified|passed)\b/i,
    /\brestore[- ]ready\b/i,
    /\brestore\s+(ready|verified|passed)\b/i,
    /\bRLS\s+(ready|verified|passed|active)\b/i,
    /\btenant[- ]isolation\s+(ready|verified|proven|passed)\b/i,
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
      throw new Error(`Unsupported hosted, deployment, operations, readiness, or proof claim is not allowed: ${pattern}`);
    }
  }
}

export function assertHostedDeploymentOperationsPreparationSnapshotIsExecutionNeutral(
  snapshot: HostedDeploymentOperationsPreparationSnapshot =
    buildHostedDeploymentOperationsPreparationSnapshot(),
): void {
  if (!snapshot.modelOnly) {
    throw new Error('Hosted/deployment/operations preparation snapshot must remain model-only.');
  }
  if (snapshot.apApprovalGranted || snapshot.hostedExecutionApproved) {
    throw new Error('AP approval and hosted execution approval must remain ungranted.');
  }
  if (snapshot.hostedValidationPerformed || snapshot.deploymentValidationPerformed) {
    throw new Error('Hosted and deployment validation must remain unperformed.');
  }
  if (snapshot.startupCheckPerformed || snapshot.readinessCheckPerformed) {
    throw new Error('Startup and readiness checks must remain unperformed.');
  }
  if (snapshot.supabaseStackExecutionPerformed || snapshot.dockerExecutionPerformed) {
    throw new Error('Supabase stack and Docker execution must remain unperformed.');
  }
  if (snapshot.dbRlsArtifactExecutionPerformed || snapshot.schemaInspectionPerformed) {
    throw new Error('DB/RLS/artifact execution and schema inspection must remain unperformed.');
  }
  if (snapshot.providerClassifierExecutionPerformed || snapshot.realAssertionExecutionPerformed) {
    throw new Error('Provider/classifier execution and real assertions must remain unperformed.');
  }
  if (snapshot.rollbackExecutionPerformed || snapshot.incidentExecutionPerformed) {
    throw new Error('Rollback and incident execution must remain unperformed.');
  }
  if (snapshot.backupRestoreExecutionPerformed) {
    throw new Error('Backup/restore execution must remain unperformed.');
  }
  if (snapshot.pilotEvidenceProduced || snapshot.readinessEvidenceProduced) {
    throw new Error('Pilot evidence and readiness evidence must remain unproduced.');
  }

  for (const field of HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS) {
    if (!snapshot.prohibitedOutputFields.includes(field)) {
      throw new Error(`Hosted/deployment preparation snapshot must prohibit output field: ${field}`);
    }
  }

  for (const environmentClass of snapshot.environmentClasses) {
    if (
      environmentClass.currentProofStatus !== 'unproven' &&
      environmentClass.currentProofStatus !== 'evidence_required'
    ) {
      throw new Error(`Environment class cannot imply completed proof: ${environmentClass.id}`);
    }
    if (environmentClass.environmentProbed) {
      throw new Error(`Environment class cannot represent probing: ${environmentClass.id}`);
    }
    if (
      environmentClass.hostedValidationPerformed ||
      environmentClass.deploymentValidationPerformed ||
      environmentClass.startupCheckPerformed ||
      environmentClass.readinessCheckPerformed
    ) {
      throw new Error(`Environment class cannot represent validation or checks: ${environmentClass.id}`);
    }
    if (environmentClass.pilotEvidenceProduced) {
      throw new Error(`Environment class cannot represent pilot evidence: ${environmentClass.id}`);
    }
    if (!environmentClass.apApprovalRequiredBeforeExecution) {
      throw new Error(`Environment class must require AP approval before execution: ${environmentClass.id}`);
    }
    for (const field of HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS) {
      if (!environmentClass.prohibitedOutputFields.includes(field)) {
        throw new Error(`Environment class ${environmentClass.id} must prohibit output field ${field}.`);
      }
    }
    assertHostedDeploymentOperationsCopyIsClaimSafe([
      environmentClass.label,
      environmentClass.objective,
      environmentClass.conceptualEnvironmentClass,
      ...environmentClass.plannedOwnershipBoundaries,
      ...environmentClass.requiredFutureProof,
      ...environmentClass.stopConditions,
    ].join('\n'));
  }

  for (const gate of snapshot.operationalGateMatrix) {
    if (gate.currentProofStatus !== 'unproven' && gate.currentProofStatus !== 'evidence_required') {
      throw new Error(`Operational gate cannot imply completed proof: ${gate.id}`);
    }
    if (gate.gateExecutionPerformed || gate.gatePassed || gate.gateVerified) {
      throw new Error(`Operational gate cannot be executed, passed, or verified: ${gate.id}`);
    }
    if (!gate.apApprovalRequiredBeforeExecution) {
      throw new Error(`Operational gate must require AP approval before execution: ${gate.id}`);
    }
    for (const field of HOSTED_DEPLOYMENT_PROHIBITED_OUTPUT_FIELDS) {
      if (!gate.prohibitedOutputFields.includes(field)) {
        throw new Error(`Operational gate ${gate.id} must prohibit output field ${field}.`);
      }
    }
    assertHostedDeploymentOperationsCopyIsClaimSafe([
      gate.label,
      gate.objective,
      ...gate.plannedScope,
      ...gate.requiredFutureProof,
      ...gate.stopConditions,
    ].join('\n'));
  }
}

export const M5_6B_HOSTED_DEPLOYMENT_OPERATIONS_ACCEPTED_BASELINE = latestAcceptedBaseline;
