import { DEPRECATED_BUYER_FACING_LITE_NAMES } from './evidenceControlModel';

export const RLS_TENANT_ISOLATION_PREPARATION_GENERATED_AT = '2026-07-06T00:00:00.000Z';

export const RLS_PREPARATION_PROOF_STATUSES = [
  'unproven',
  'evidence_required',
  'planned',
  'blocked',
] as const;

export type RlsPreparationProofStatus = typeof RLS_PREPARATION_PROOF_STATUSES[number];

export const AUTHORITY_SURFACE_IDS = [
  'identity_membership_authority',
  'organization_workspace_authority',
  'project_authority',
  'document_artifact_ownership_authority',
  'delivery_work_item_authority',
  'artifact_select_authority',
  'rls_helper_claim_authority',
  'fail_closed_policy_authority',
] as const;

export type AuthoritySurfaceId = typeof AUTHORITY_SURFACE_IDS[number];

export const RLS_ASSERTION_CATEGORY_IDS = [
  'identity_member_access_boundary',
  'organization_workspace_boundary',
  'project_authority_boundary',
  'document_artifact_ownership_boundary',
  'delivery_work_item_boundary',
  'artifact_select_isolation_boundary',
  'negative_cross_tenant_access_boundary',
  'missing_claim_missing_policy_fail_closed_boundary',
] as const;

export type RlsAssertionCategoryId = typeof RLS_ASSERTION_CATEGORY_IDS[number];

export const RLS_PROHIBITED_OUTPUT_FIELDS = [
  'raw_rows',
  'row_payload',
  'database_url',
  'host',
  'port',
  'ip_address',
  'auth_header',
  'claim_value',
  'provider_key',
  'service_role_token',
  'private_token',
  'project_ref',
  'target_value',
  'raw_log',
  'stdout',
  'stderr',
  'stack_trace',
  'schema_dump',
  'local_path',
  'container_id',
  'image_id',
  'machine_specific_value',
  'sql_result_set',
  'policy_definition_dump',
  'migration_output',
  'artifact_select_payload',
] as const;

export type RlsProhibitedOutputField = typeof RLS_PROHIBITED_OUTPUT_FIELDS[number];

export const RLS_REDACTION_RULES = [
  'Summarize verification tasks by task name only.',
  'Exclude raw rows, row payloads, database URLs, host values, port values, IP values, auth headers, claim values, provider keys, service-role tokens, private tokens, project refs, target values, raw logs, stdout, stderr, stack traces, schema dumps, local paths, container IDs, image IDs, SQL result sets, policy definitions, migration output, artifact SELECT payloads, and machine-specific values.',
  'Record future assertion categories and expected evidence shape without embedding live schema, row, claim, tenant, or artifact payloads.',
  'Keep preparation status separate from any future readiness, verification, or tenant-isolation claim.',
  'Require a later AP-approved DB/RLS/artifact execution gate before any real assertion can be represented as run.',
] as const;

export const RLS_BLOCKED_READINESS_CLAIMS = [
  'RLS readiness',
  'tenant-isolation proof',
  'artifact SELECT isolation',
  'schema readiness',
  'local readiness',
  'local startup success',
  'hosted readiness',
  'production readiness',
  'deployment readiness',
  'security readiness',
  'buyer readiness',
  'product readiness',
  'release-candidate readiness',
  'compliance certification',
  'readiness evidence',
] as const;

export const RLS_STOP_CONDITIONS = [
  'Missing AP-approved DB/RLS/artifact execution gate.',
  'Unclear assertion scope, run count, tenant boundary, output boundary, or prohibited output rule.',
  'Any request to inspect live schema, run SQL, run migrations, run Supabase stack, run Docker, run DB checks, run RLS checks, run artifact SELECT checks, run tenant-isolation checks, run local startup checks, run hosted validation, or run deployment validation.',
  'Any raw row, row payload, database URL, host, port, IP, auth header, claim value, provider key, service-role token, private token, project ref, target value, raw log, stdout, stderr, stack trace, schema dump, local path, container ID, image ID, SQL result set, policy dump, migration output, artifact payload, or machine-specific value would be emitted.',
  'Any assertion is marked executed, passed, verified, or complete before accepted evidence exists.',
  'Any wording implies current readiness, proof, verification, certification, schema availability, local startup success, or tenant isolation.',
  'Scope expands beyond deterministic preparation contracts, assertion planning, redaction rules, stop conditions, and read-only summaries.',
] as const;

const baselineReference =
  'M5.5c accepted baseline after PR #179: e4d31bd67bc0ab1205e91d69c03a1fb6889438f7, merge ac6fbb0246b9f36fdf110415dd57db5cdc52e23c, post-merge 3db48926e8fc38813e3535be2253ec75a32bf139.';

const requiredExecutionGate =
  'Separate AP-approved DB/RLS/artifact execution gate with exact assertion scope, run count, output boundaries, prohibited outputs, stop conditions, and proof boundaries.';

export interface AuthoritySurfacePreparationContract {
  id: AuthoritySurfaceId;
  label: string;
  objective: string;
  conceptualAuthorityAreas: readonly string[];
  currentProofStatus: RlsPreparationProofStatus;
  schemaInspectionPerformed: boolean;
  rlsExecutionPerformed: boolean;
  tenantIsolationVerified: boolean;
  artifactSelectVerified: boolean;
  plannedImplementationScope: readonly string[];
  requiredFutureProof: readonly string[];
  blockedReadinessClaims: readonly string[];
  prohibitedOutputFields: readonly RlsProhibitedOutputField[];
  stopConditions: readonly string[];
  apApprovalRequiredBeforeExecution: boolean;
}

export interface RlsAssertionMatrixContract {
  id: RlsAssertionCategoryId;
  label: string;
  objective: string;
  proofStatus: RlsPreparationProofStatus;
  assertionExecuted: boolean;
  assertionPassed: boolean;
  assertionVerified: boolean;
  plannedAssertionScope: readonly string[];
  requiredFutureProof: readonly string[];
  prohibitedOutputFields: readonly RlsProhibitedOutputField[];
  stopConditions: readonly string[];
  apApprovalRequiredBeforeExecution: boolean;
}

export interface RlsTenantIsolationPreparationSnapshot {
  generatedAt: string;
  milestone: string;
  modelOnly: boolean;
  apApprovalGranted: boolean;
  dbExecutionApproved: boolean;
  dbExecutionPerformed: boolean;
  schemaInspectionPerformed: boolean;
  migrationExecutionPerformed: boolean;
  rlsExecutionPerformed: boolean;
  artifactSelectExecutionPerformed: boolean;
  tenantIsolationVerified: boolean;
  readinessEvidenceProduced: boolean;
  proofStatuses: readonly RlsPreparationProofStatus[];
  authoritySurfaces: readonly AuthoritySurfacePreparationContract[];
  assertionMatrix: readonly RlsAssertionMatrixContract[];
  prohibitedOutputFields: readonly RlsProhibitedOutputField[];
  redactionRules: readonly string[];
  stopConditions: readonly string[];
  blockedReadinessClaims: readonly string[];
  deprecatedBuyerFacingLiteNames: readonly string[];
}

const authoritySurfaceDefinitions: readonly AuthoritySurfacePreparationContract[] = [
  {
    id: 'identity_membership_authority',
    label: 'Identity And Membership Authority',
    objective: 'Prepare future identity and membership boundary assertions without reading auth claims, rows, or live schema.',
    conceptualAuthorityAreas: ['authenticated identity context', 'organization membership', 'workspace membership'],
    currentProofStatus: 'evidence_required',
    schemaInspectionPerformed: false,
    rlsExecutionPerformed: false,
    tenantIsolationVerified: false,
    artifactSelectVerified: false,
    plannedImplementationScope: [
      'Future policies must bind user identity to organization and workspace membership before data access.',
      'Future assertions must include allowed-member and denied-non-member paths.',
    ],
    requiredFutureProof: [
      requiredExecutionGate,
      'Accepted evidence for member access and non-member denial without exposing auth headers or claim values.',
    ],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...RLS_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'organization_workspace_authority',
    label: 'Organization And Workspace Authority',
    objective: 'Prepare future organization/workspace isolation assertions without inspecting live tables or policies.',
    conceptualAuthorityAreas: ['organizations', 'workspaces', 'workspace membership links'],
    currentProofStatus: 'evidence_required',
    schemaInspectionPerformed: false,
    rlsExecutionPerformed: false,
    tenantIsolationVerified: false,
    artifactSelectVerified: false,
    plannedImplementationScope: [
      'Future policies must keep organization and workspace authority aligned for reads and writes.',
      'Future assertions must prove same-tenant access and cross-tenant denial only inside an AP-approved gate.',
    ],
    requiredFutureProof: [
      requiredExecutionGate,
      'Accepted organization/workspace boundary evidence without raw rows, tenant identifiers, or schema dumps.',
    ],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...RLS_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'project_authority',
    label: 'Project Authority',
    objective: 'Prepare future project authority assertions for scoped delivery and portfolio records without running DB checks.',
    conceptualAuthorityAreas: ['projects', 'project memberships', 'project-scoped work records'],
    currentProofStatus: 'unproven',
    schemaInspectionPerformed: false,
    rlsExecutionPerformed: false,
    tenantIsolationVerified: false,
    artifactSelectVerified: false,
    plannedImplementationScope: [
      'Future policies must bind project access to the owning organization/workspace authority.',
      'Future assertions must cover positive owner/member access and negative cross-tenant access.',
    ],
    requiredFutureProof: [
      requiredExecutionGate,
      'Accepted project-boundary evidence without row payloads, project refs, target values, or raw logs.',
    ],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...RLS_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'document_artifact_ownership_authority',
    label: 'Document And Artifact Ownership Authority',
    objective: 'Prepare future Studio/document/artifact ownership assertions without generating artifacts or running artifact SELECT checks.',
    conceptualAuthorityAreas: ['document generations', 'document ownership references', 'artifact ownership references'],
    currentProofStatus: 'unproven',
    schemaInspectionPerformed: false,
    rlsExecutionPerformed: false,
    tenantIsolationVerified: false,
    artifactSelectVerified: false,
    plannedImplementationScope: [
      'Future policies must ensure generated documents and artifacts resolve through organization/workspace/project ownership.',
      'Future assertions must cover owner access, non-owner denial, and redacted artifact evidence boundaries.',
    ],
    requiredFutureProof: [
      requiredExecutionGate,
      'Accepted document/artifact ownership evidence without artifact payloads, SELECT payloads, or storage references.',
    ],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...RLS_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'delivery_work_item_authority',
    label: 'Delivery Work Item Authority',
    objective: 'Prepare future Delivery work item authority assertions while preserving M5.2g-a as fail-closed groundwork only.',
    conceptualAuthorityAreas: ['delivery work items', 'delivery owners', 'handoff lineage references'],
    currentProofStatus: 'evidence_required',
    schemaInspectionPerformed: false,
    rlsExecutionPerformed: false,
    tenantIsolationVerified: false,
    artifactSelectVerified: false,
    plannedImplementationScope: [
      'Future policies must keep Delivery work items scoped to authoritative organization/workspace/project context.',
      'Future assertions must verify fail-closed behavior and authorized owner/member access only after AP approval.',
    ],
    requiredFutureProof: [
      requiredExecutionGate,
      'Accepted Delivery work item evidence without raw rows, work item payloads, project refs, or target values.',
    ],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...RLS_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'artifact_select_authority',
    label: 'Artifact SELECT Authority',
    objective: 'Prepare future artifact SELECT isolation assertions without executing artifact SELECT checks.',
    conceptualAuthorityAreas: ['artifact metadata', 'artifact evidence references', 'artifact ownership references'],
    currentProofStatus: 'evidence_required',
    schemaInspectionPerformed: false,
    rlsExecutionPerformed: false,
    tenantIsolationVerified: false,
    artifactSelectVerified: false,
    plannedImplementationScope: [
      'Future assertions must distinguish artifact metadata access from raw artifact payload exposure.',
      'Future artifact SELECT evidence must stay redacted and AP-approved before execution.',
    ],
    requiredFutureProof: [
      requiredExecutionGate,
      'Accepted artifact SELECT isolation evidence without raw rows, artifact payloads, schema dumps, or storage references.',
    ],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...RLS_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'rls_helper_claim_authority',
    label: 'RLS Helper And Claim Authority',
    objective: 'Prepare future helper-function and claim-resolution assertions without inspecting claims or helper behavior live.',
    conceptualAuthorityAreas: ['RLS helper functions', 'claim mapping', 'membership resolution'],
    currentProofStatus: 'unproven',
    schemaInspectionPerformed: false,
    rlsExecutionPerformed: false,
    tenantIsolationVerified: false,
    artifactSelectVerified: false,
    plannedImplementationScope: [
      'Future helper behavior must be validated with redacted inputs and outputs inside an approved execution gate.',
      'Future assertions must prove missing-claim and malformed-claim behavior remains fail-closed.',
    ],
    requiredFutureProof: [
      requiredExecutionGate,
      'Accepted helper behavior evidence without claim values, auth headers, service-role tokens, or schema dumps.',
    ],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...RLS_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
  {
    id: 'fail_closed_policy_authority',
    label: 'Fail-Closed Policy Authority',
    objective: 'Prepare future missing-policy and missing-claim assertions without changing policies or running real assertions.',
    conceptualAuthorityAreas: ['policy absence behavior', 'missing-claim behavior', 'denied fallback behavior'],
    currentProofStatus: 'evidence_required',
    schemaInspectionPerformed: false,
    rlsExecutionPerformed: false,
    tenantIsolationVerified: false,
    artifactSelectVerified: false,
    plannedImplementationScope: [
      'Future assertions must prove missing-policy and missing-claim paths deny access.',
      'Future evidence must separate fail-closed planning from actual tenant-isolation proof.',
    ],
    requiredFutureProof: [
      requiredExecutionGate,
      'Accepted fail-closed evidence without SQL result sets, policy dumps, claim values, or raw logs.',
    ],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    stopConditions: [...RLS_STOP_CONDITIONS],
    apApprovalRequiredBeforeExecution: true,
  },
] as const;

const assertionRequirementsById: Record<RlsAssertionCategoryId, readonly string[]> = {
  identity_member_access_boundary: [
    'Future allowed-member access assertion.',
    'Future denied non-member access assertion.',
  ],
  organization_workspace_boundary: [
    'Future same-organization/workspace access assertion.',
    'Future different-organization/workspace denial assertion.',
  ],
  project_authority_boundary: [
    'Future project owner/member access assertion.',
    'Future cross-project and cross-tenant denial assertion.',
  ],
  document_artifact_ownership_boundary: [
    'Future document/artifact owner access assertion.',
    'Future non-owner and cross-tenant artifact denial assertion.',
  ],
  delivery_work_item_boundary: [
    'Future Delivery work item owner/member access assertion.',
    'Future denied access outside assigned authority assertion.',
  ],
  artifact_select_isolation_boundary: [
    'Future artifact metadata SELECT allow/deny assertion.',
    'Future raw artifact payload exclusion assertion.',
  ],
  negative_cross_tenant_access_boundary: [
    'Future negative cross-tenant read assertion.',
    'Future negative cross-tenant write/update/delete assertion where scoped.',
  ],
  missing_claim_missing_policy_fail_closed_boundary: [
    'Future missing-claim denial assertion.',
    'Future missing-policy or no-policy fail-closed assertion.',
  ],
};

const assertionLabels: Record<RlsAssertionCategoryId, string> = {
  identity_member_access_boundary: 'Identity/Member Access Boundary',
  organization_workspace_boundary: 'Organization/Workspace Boundary',
  project_authority_boundary: 'Project Authority Boundary',
  document_artifact_ownership_boundary: 'Document/Artifact Ownership Boundary',
  delivery_work_item_boundary: 'Delivery Work Item Boundary',
  artifact_select_isolation_boundary: 'Artifact SELECT Isolation Boundary',
  negative_cross_tenant_access_boundary: 'Negative Cross-Tenant Access Boundary',
  missing_claim_missing_policy_fail_closed_boundary: 'Missing-Claim / Missing-Policy Fail-Closed Boundary',
};

const assertionMatrix: readonly RlsAssertionMatrixContract[] = RLS_ASSERTION_CATEGORY_IDS.map(id => ({
  id,
  label: assertionLabels[id],
  objective: `Prepare ${assertionLabels[id].toLowerCase()} assertions for a future AP-approved DB/RLS/artifact evidence gate without executing them now.`,
  proofStatus: 'evidence_required',
  assertionExecuted: false,
  assertionPassed: false,
  assertionVerified: false,
  plannedAssertionScope: [...assertionRequirementsById[id]],
  requiredFutureProof: [
    requiredExecutionGate,
    'Accepted evidence that records pass/fail outcomes only inside the future approved gate and excludes prohibited output fields.',
  ],
  prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
  stopConditions: [...RLS_STOP_CONDITIONS],
  apApprovalRequiredBeforeExecution: true,
}));

const cloneAuthoritySurface = (
  surface: AuthoritySurfacePreparationContract,
): AuthoritySurfacePreparationContract => ({
  ...surface,
  conceptualAuthorityAreas: [...surface.conceptualAuthorityAreas],
  plannedImplementationScope: [...surface.plannedImplementationScope],
  requiredFutureProof: [...surface.requiredFutureProof],
  blockedReadinessClaims: [...surface.blockedReadinessClaims],
  prohibitedOutputFields: [...surface.prohibitedOutputFields],
  stopConditions: [...surface.stopConditions],
});

const cloneAssertionContract = (assertion: RlsAssertionMatrixContract): RlsAssertionMatrixContract => ({
  ...assertion,
  plannedAssertionScope: [...assertion.plannedAssertionScope],
  requiredFutureProof: [...assertion.requiredFutureProof],
  prohibitedOutputFields: [...assertion.prohibitedOutputFields],
  stopConditions: [...assertion.stopConditions],
});

export function buildRlsTenantIsolationPreparationSnapshot(): RlsTenantIsolationPreparationSnapshot {
  return {
    generatedAt: RLS_TENANT_ISOLATION_PREPARATION_GENERATED_AT,
    milestone: 'M5.6a RLS/Tenant-Isolation Implementation Preparation Gate',
    modelOnly: true,
    apApprovalGranted: false,
    dbExecutionApproved: false,
    dbExecutionPerformed: false,
    schemaInspectionPerformed: false,
    migrationExecutionPerformed: false,
    rlsExecutionPerformed: false,
    artifactSelectExecutionPerformed: false,
    tenantIsolationVerified: false,
    readinessEvidenceProduced: false,
    proofStatuses: [...RLS_PREPARATION_PROOF_STATUSES],
    authoritySurfaces: authoritySurfaceDefinitions.map(cloneAuthoritySurface),
    assertionMatrix: assertionMatrix.map(cloneAssertionContract),
    prohibitedOutputFields: [...RLS_PROHIBITED_OUTPUT_FIELDS],
    redactionRules: [...RLS_REDACTION_RULES],
    stopConditions: [...RLS_STOP_CONDITIONS],
    blockedReadinessClaims: [...RLS_BLOCKED_READINESS_CLAIMS],
    deprecatedBuyerFacingLiteNames: [...DEPRECATED_BUYER_FACING_LITE_NAMES],
  };
}

export const CURRENT_RLS_TENANT_ISOLATION_PREPARATION_SNAPSHOT =
  buildRlsTenantIsolationPreparationSnapshot();

export function getAuthoritySurfacePreparationContract(
  surfaceId: AuthoritySurfaceId,
  snapshot: RlsTenantIsolationPreparationSnapshot = buildRlsTenantIsolationPreparationSnapshot(),
): AuthoritySurfacePreparationContract {
  const surface = snapshot.authoritySurfaces.find(candidate => candidate.id === surfaceId);
  if (!surface) {
    throw new Error(`Missing authority surface preparation contract: ${surfaceId}`);
  }

  return cloneAuthoritySurface(surface);
}

export function getRlsAssertionMatrixContract(
  assertionId: RlsAssertionCategoryId,
  snapshot: RlsTenantIsolationPreparationSnapshot = buildRlsTenantIsolationPreparationSnapshot(),
): RlsAssertionMatrixContract {
  const assertion = snapshot.assertionMatrix.find(candidate => candidate.id === assertionId);
  if (!assertion) {
    throw new Error(`Missing RLS assertion matrix contract: ${assertionId}`);
  }

  return cloneAssertionContract(assertion);
}

export function assertRlsTenantIsolationCopyIsClaimSafe(copy: string): void {
  for (const deprecatedName of DEPRECATED_BUYER_FACING_LITE_NAMES) {
    if (copy.includes(deprecatedName)) {
      throw new Error(`Deprecated buyer-facing name is not allowed: ${deprecatedName}`);
    }
  }

  const unsupportedPositiveClaimPatterns = [
    /\bRLS\s+(ready|verified|passed|active)\b/i,
    /\btenant[- ]isolation\s+(ready|verified|proven|passed)\b/i,
    /\bartifact\s+SELECT\s+(ready|verified|proven|passed)\b/i,
    /\bschema\s+(ready|verified|proven|available)\b/i,
    /\blocal\s+(ready|verified|proven)\b/i,
    /\blocal\s+startup\s+success\s+(achieved|verified|proven)\b/i,
    /\bhosted\s+ready\b/i,
    /\bproduction\s+ready\b/i,
    /\bdeployment\s+ready\b/i,
    /\bsecurity\s+ready\b/i,
    /\bbuyer\s+ready\b/i,
    /\bproduct\s+ready\b/i,
    /\brelease[- ]candidate\s+ready\b/i,
    /\bcompliance\s+certified\b/i,
    /\breadiness\s+evidence\s+(produced|created|available|accepted)\b/i,
    /\bDB\/RLS\/artifact\s+(executed|verified|passed)\b/i,
    /\bassertions?\s+(executed|verified|passed|complete)\b/i,
  ];

  for (const pattern of unsupportedPositiveClaimPatterns) {
    if (pattern.test(copy)) {
      throw new Error(`Unsupported RLS, tenant-isolation, readiness, or proof claim is not allowed: ${pattern}`);
    }
  }
}

export function assertRlsTenantIsolationPreparationSnapshotIsExecutionNeutral(
  snapshot: RlsTenantIsolationPreparationSnapshot = buildRlsTenantIsolationPreparationSnapshot(),
): void {
  if (!snapshot.modelOnly) {
    throw new Error('RLS preparation snapshot must remain model-only.');
  }
  if (snapshot.apApprovalGranted) {
    throw new Error('AP approval must remain ungranted.');
  }
  if (snapshot.dbExecutionApproved || snapshot.dbExecutionPerformed) {
    throw new Error('DB execution must remain unapproved and unperformed.');
  }
  if (snapshot.schemaInspectionPerformed) {
    throw new Error('Schema inspection must remain unperformed.');
  }
  if (snapshot.migrationExecutionPerformed) {
    throw new Error('Migration execution must remain unperformed.');
  }
  if (snapshot.rlsExecutionPerformed || snapshot.artifactSelectExecutionPerformed) {
    throw new Error('RLS and artifact SELECT execution must remain unperformed.');
  }
  if (snapshot.tenantIsolationVerified) {
    throw new Error('Tenant isolation must remain unverified.');
  }
  if (snapshot.readinessEvidenceProduced) {
    throw new Error('Readiness evidence must remain unproduced.');
  }

  for (const field of RLS_PROHIBITED_OUTPUT_FIELDS) {
    if (!snapshot.prohibitedOutputFields.includes(field)) {
      throw new Error(`RLS preparation snapshot must prohibit output field: ${field}`);
    }
  }

  for (const surface of snapshot.authoritySurfaces) {
    if (surface.currentProofStatus !== 'unproven' && surface.currentProofStatus !== 'evidence_required') {
      throw new Error(`Authority surface cannot imply completed proof: ${surface.id}`);
    }
    if (surface.schemaInspectionPerformed || surface.rlsExecutionPerformed) {
      throw new Error(`Authority surface cannot represent schema or RLS execution: ${surface.id}`);
    }
    if (surface.tenantIsolationVerified || surface.artifactSelectVerified) {
      throw new Error(`Authority surface cannot represent verified isolation: ${surface.id}`);
    }
    if (!surface.apApprovalRequiredBeforeExecution) {
      throw new Error(`Authority surface must require AP approval before execution: ${surface.id}`);
    }
    for (const field of RLS_PROHIBITED_OUTPUT_FIELDS) {
      if (!surface.prohibitedOutputFields.includes(field)) {
        throw new Error(`Authority surface ${surface.id} must prohibit output field ${field}.`);
      }
    }
    assertRlsTenantIsolationCopyIsClaimSafe([
      surface.label,
      surface.objective,
      ...surface.conceptualAuthorityAreas,
      ...surface.plannedImplementationScope,
      ...surface.requiredFutureProof,
      ...surface.stopConditions,
    ].join('\n'));
  }

  for (const assertion of snapshot.assertionMatrix) {
    if (assertion.proofStatus !== 'unproven' && assertion.proofStatus !== 'evidence_required') {
      throw new Error(`Assertion cannot imply completed proof: ${assertion.id}`);
    }
    if (assertion.assertionExecuted || assertion.assertionPassed || assertion.assertionVerified) {
      throw new Error(`Assertion cannot be executed, passed, or verified: ${assertion.id}`);
    }
    if (!assertion.apApprovalRequiredBeforeExecution) {
      throw new Error(`Assertion must require AP approval before execution: ${assertion.id}`);
    }
    for (const field of RLS_PROHIBITED_OUTPUT_FIELDS) {
      if (!assertion.prohibitedOutputFields.includes(field)) {
        throw new Error(`Assertion ${assertion.id} must prohibit output field ${field}.`);
      }
    }
    assertRlsTenantIsolationCopyIsClaimSafe([
      assertion.label,
      assertion.objective,
      ...assertion.plannedAssertionScope,
      ...assertion.requiredFutureProof,
      ...assertion.stopConditions,
    ].join('\n'));
  }
}
