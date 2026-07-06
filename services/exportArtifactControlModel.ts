import { DEPRECATED_BUYER_FACING_LITE_NAMES } from './evidenceControlModel';

export const EXPORT_ARTIFACT_CONTROL_GENERATED_AT = '2026-07-06T00:00:00.000Z';

export const EXPORT_ARTIFACT_STATUSES = [
  'model_only',
  'planned',
  'blocked',
  'evidence_required',
  'generated',
] as const;

export type ExportArtifactStatus = typeof EXPORT_ARTIFACT_STATUSES[number];

export const EXPORT_ARTIFACT_TYPES = [
  'decision_pack_export',
  'buyer_acceptance_pack_pdf',
  'audit_evidence_bundle',
  'trust_center_export',
  'delivery_pack_export',
  'approval_record_pdf',
  'browser_walkthrough_evidence_package',
] as const;

export type ExportArtifactType = typeof EXPORT_ARTIFACT_TYPES[number];

export const EXPORT_ALLOWED_METADATA_FIELDS = [
  'artifact_id',
  'artifact_type',
  'artifact_status',
  'milestone',
  'source_surface_id',
  'source_evidence_reference',
  'lineage_reference',
  'owner_role',
  'retention_policy_id',
  'classification',
  'redaction_profile_id',
  'created_at',
  'created_by_role',
  'approval_gate_reference',
  'limitation_disclosure',
  'checksum_reference',
] as const;

export type ExportAllowedMetadataField = typeof EXPORT_ALLOWED_METADATA_FIELDS[number];

export const EXPORT_PROHIBITED_METADATA_FIELDS = [
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
  'container_id',
  'image_id',
  'screenshot_path',
  'browser_output',
  'file_path',
  'storage_object_path',
  'signed_url',
  'public_url',
  'export_payload',
  'pdf_payload',
  'download_payload',
  'binary_content',
  'full_document_body',
] as const;

export type ExportProhibitedMetadataField = typeof EXPORT_PROHIBITED_METADATA_FIELDS[number];

export const EXPORT_REDACTION_RULES = [
  'Summarize verification tasks by task name only.',
  'Exclude raw logs, command strings, local paths, host values, ports, IP values, database URLs, row payloads, auth headers, claim values, provider keys, private tokens, project refs, target values, container IDs, image IDs, browser output, screenshots, storage object references, signed URLs, exports, PDFs, and downloads.',
  'Record source evidence references without embedding raw evidence payloads.',
  'Keep limitation disclosures separate from any future readiness claim.',
  'Require a later AP-approved gate before any artifact generation, live storage access, signed-reference creation, or download surface is represented.',
] as const;

export const EXPORT_BLOCKED_READINESS_CLAIMS = [
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
  'browser verification',
  'screenshot proof',
  'export/PDF/download readiness',
  'artifact storage readiness',
  'live storage proof',
  'live signed URL proof',
] as const;

export const EXPORT_PROHIBITED_OUTPUTS = [
  'export_file',
  'pdf_file',
  'download_file',
  'storage_object',
  'live_signed_url',
  'public_url',
  'browser_output',
  'screenshot_evidence',
  'approval_workflow_output',
  'readiness_evidence',
  'raw_execution_log',
] as const;

export type ExportProhibitedOutput = typeof EXPORT_PROHIBITED_OUTPUTS[number];

export const EXPORT_STOP_CONDITIONS = [
  'Missing AP-approved execution gate.',
  'Unclear artifact scope, run count, output limits, or prohibited artifact boundary.',
  'Any prohibited metadata field appears in proposed artifact metadata.',
  'Any raw, secret, local, host, storage object, signed URL, browser, screenshot, export, PDF, download, or payload output is requested.',
  'Any live storage read, live storage write, signed-reference creation, browser execution, workflow execution, DB/RLS/artifact execution, hosted/deployment validation, provider/classifier execution, schema inspection, or real assertion execution is attempted.',
  'Any wording implies current readiness, certification, verification, walkthrough completion, or approval-workflow completion.',
  'Scope expands beyond model-only export and artifact storage contracts.',
] as const;

export const STORAGE_ACCESS_POLICY_IDS = [
  'private_artifact_storage',
  'retention_and_ownership',
  'signed_reference_controls',
  'audit_metadata_contract',
] as const;

export type StorageAccessPolicyId = typeof STORAGE_ACCESS_POLICY_IDS[number];

export interface ExportArtifactBoundaryContract {
  id: ExportArtifactType;
  label: string;
  objective: string;
  artifactStatus: ExportArtifactStatus;
  modelOnly: boolean;
  artifactGenerated: boolean;
  apApprovalRequiredBeforeExecution: boolean;
  allowedMetadataFields: readonly ExportAllowedMetadataField[];
  prohibitedMetadataFields: readonly ExportProhibitedMetadataField[];
  redactionRules: readonly string[];
  sourceEvidenceReferences: readonly string[];
  lineageRules: readonly string[];
  limitationDisclosure: string;
  requiredFutureProof: readonly string[];
  prohibitedOutputs: readonly ExportProhibitedOutput[];
  stopConditions: readonly string[];
  blockedReadinessClaims: readonly string[];
}

export interface StorageAccessPolicyContract {
  id: StorageAccessPolicyId;
  label: string;
  objective: string;
  modelOnly: boolean;
  liveStorageAccessAllowed: boolean;
  liveSignedUrlGenerationAllowed: boolean;
  privateStorageRequired: boolean;
  retentionPolicy: string;
  ownerRole: string;
  accessRoles: readonly string[];
  signedReferenceRequirements: readonly string[];
  auditMetadataFields: readonly ExportAllowedMetadataField[];
  prohibitedMetadataFields: readonly ExportProhibitedMetadataField[];
  stopConditions: readonly string[];
  requiredFutureProof: readonly string[];
}

export interface ExportArtifactControlSnapshot {
  generatedAt: string;
  milestone: string;
  modelOnly: boolean;
  generatedArtifactsAllowed: boolean;
  liveStorageExecutionAllowed: boolean;
  liveSignedUrlGenerationAllowed: boolean;
  artifactStatuses: readonly ExportArtifactStatus[];
  artifactTypes: readonly ExportArtifactType[];
  allowedMetadataFields: readonly ExportAllowedMetadataField[];
  prohibitedMetadataFields: readonly ExportProhibitedMetadataField[];
  redactionRules: readonly string[];
  exportBoundaryContracts: readonly ExportArtifactBoundaryContract[];
  storageAccessPolicies: readonly StorageAccessPolicyContract[];
  prohibitedOutputs: readonly ExportProhibitedOutput[];
  stopConditions: readonly string[];
  blockedReadinessClaims: readonly string[];
  deprecatedBuyerFacingLiteNames: readonly string[];
}

const baselineReference =
  'M5.5b accepted baseline after PR #178: fb53ee23efb40573ac5f9061786c970e9d49b371, merge 92f48bda061718fa96e86e4ba2c8fbb5c56a21bd, post-merge 0842dd722d8bd27d5bbc91f253895577b75916a7.';

const requiredFutureProof = [
  'Separate AP-approved gate with exact scope, run count, output boundaries, prohibited artifacts, stop conditions, and proof boundaries.',
  'Accepted redaction evidence for allowed metadata and prohibited-field exclusion.',
  'Accepted storage-access evidence before any private object storage, download surface, or signed reference can be represented as performed.',
  'Accepted lineage evidence tying each future artifact to source evidence references and limitation disclosures.',
] as const;

const lineageRules = [
  'Record the source milestone, source surface identifier, and evidence reference before any future artifact can be produced.',
  'Keep generated artifact state separate from model/design state.',
  'Link limitation disclosures to each future artifact category.',
  'Preserve redaction and prohibited-field decisions as audit metadata only.',
] as const;

const createBoundaryContract = (
  id: ExportArtifactType,
  label: string,
  objective: string,
  artifactStatus: ExportArtifactStatus,
): ExportArtifactBoundaryContract => ({
  id,
  label,
  objective,
  artifactStatus,
  modelOnly: true,
  artifactGenerated: false,
  apApprovalRequiredBeforeExecution: true,
  allowedMetadataFields: [...EXPORT_ALLOWED_METADATA_FIELDS],
  prohibitedMetadataFields: [...EXPORT_PROHIBITED_METADATA_FIELDS],
  redactionRules: [...EXPORT_REDACTION_RULES],
  sourceEvidenceReferences: [baselineReference, 'M5.5c model-only export/artifact control gate evidence record.'],
  lineageRules: [...lineageRules],
  limitationDisclosure:
    'Model/design contract only; no export, PDF, download, storage object, signed URL, browser output, screenshot, workflow output, or evidence artifact is created.',
  requiredFutureProof: [...requiredFutureProof],
  prohibitedOutputs: [...EXPORT_PROHIBITED_OUTPUTS],
  stopConditions: [...EXPORT_STOP_CONDITIONS],
  blockedReadinessClaims: [...EXPORT_BLOCKED_READINESS_CLAIMS],
});

const exportBoundaryContracts: readonly ExportArtifactBoundaryContract[] = [
  createBoundaryContract(
    'decision_pack_export',
    'Decision Pack Export Contract',
    'Define future decision-pack artifact metadata, lineage, redaction, and limitation boundaries without producing an export.',
    'blocked',
  ),
  createBoundaryContract(
    'buyer_acceptance_pack_pdf',
    'Buyer Acceptance Pack PDF Contract',
    'Define future buyer acceptance PDF metadata, source evidence, and limitation boundaries without producing a PDF.',
    'blocked',
  ),
  createBoundaryContract(
    'audit_evidence_bundle',
    'Audit Evidence Bundle Contract',
    'Define future audit evidence bundle metadata and redaction boundaries without creating evidence artifacts.',
    'evidence_required',
  ),
  createBoundaryContract(
    'trust_center_export',
    'Trust Center Export Contract',
    'Define future Trust Center export metadata and proof-boundary disclosures without producing an export.',
    'evidence_required',
  ),
  createBoundaryContract(
    'delivery_pack_export',
    'Delivery Pack Export Contract',
    'Define future Avala Delivery pack artifact metadata and lineage boundaries without producing a download.',
    'blocked',
  ),
  createBoundaryContract(
    'approval_record_pdf',
    'Approval Record PDF Contract',
    'Define future approval-record artifact metadata while preserving that no approval workflow has executed.',
    'blocked',
  ),
  createBoundaryContract(
    'browser_walkthrough_evidence_package',
    'Browser Walkthrough Evidence Package Contract',
    'Define future browser-run evidence package metadata while preserving that browser execution is unapproved and unperformed.',
    'blocked',
  ),
] as const;

const storageAccessPolicies: readonly StorageAccessPolicyContract[] = [
  {
    id: 'private_artifact_storage',
    label: 'Private Artifact Storage Policy',
    objective: 'Model future private storage expectations without reading, writing, listing, or referencing live storage objects.',
    modelOnly: true,
    liveStorageAccessAllowed: false,
    liveSignedUrlGenerationAllowed: false,
    privateStorageRequired: true,
    retentionPolicy: 'Future AP-approved policy must define retention duration, deletion review, and audit ownership before storage use.',
    ownerRole: 'AP-approved artifact owner role required before execution.',
    accessRoles: ['AP approver', 'evidence reviewer', 'security reviewer'],
    signedReferenceRequirements: [
      'Future signed references require AP-approved scope and expiration rules.',
      'No live signed URL, public URL, storage object reference, or object path is created by this model.',
    ],
    auditMetadataFields: [...EXPORT_ALLOWED_METADATA_FIELDS],
    prohibitedMetadataFields: [...EXPORT_PROHIBITED_METADATA_FIELDS],
    stopConditions: [...EXPORT_STOP_CONDITIONS],
    requiredFutureProof: [...requiredFutureProof],
  },
  {
    id: 'retention_and_ownership',
    label: 'Retention And Ownership Policy',
    objective: 'Model future artifact ownership, retention review, and deletion boundaries before any artifact exists.',
    modelOnly: true,
    liveStorageAccessAllowed: false,
    liveSignedUrlGenerationAllowed: false,
    privateStorageRequired: true,
    retentionPolicy: 'Future retention must be tied to artifact type, milestone, AP scope, and evidence classification.',
    ownerRole: 'AP-approved retention owner role required before execution.',
    accessRoles: ['AP approver', 'retention owner', 'evidence reviewer'],
    signedReferenceRequirements: [
      'Future signed references must inherit retention and revocation rules.',
      'No live signed URL, public URL, storage object reference, or object path is created by this model.',
    ],
    auditMetadataFields: [...EXPORT_ALLOWED_METADATA_FIELDS],
    prohibitedMetadataFields: [...EXPORT_PROHIBITED_METADATA_FIELDS],
    stopConditions: [...EXPORT_STOP_CONDITIONS],
    requiredFutureProof: [...requiredFutureProof],
  },
  {
    id: 'signed_reference_controls',
    label: 'Signed Reference Controls Policy',
    objective: 'Model future signed-reference requirements without generating live signed URLs or public links.',
    modelOnly: true,
    liveStorageAccessAllowed: false,
    liveSignedUrlGenerationAllowed: false,
    privateStorageRequired: true,
    retentionPolicy: 'Future signed references must expire and must be bound to an accepted AP-approved artifact scope.',
    ownerRole: 'AP-approved access-control owner role required before execution.',
    accessRoles: ['AP approver', 'security reviewer', 'evidence reviewer'],
    signedReferenceRequirements: [
      'Future references must be time-bound, role-bound, and audit-linked.',
      'No live signed URL, public URL, storage object reference, or object path is created by this model.',
    ],
    auditMetadataFields: [...EXPORT_ALLOWED_METADATA_FIELDS],
    prohibitedMetadataFields: [...EXPORT_PROHIBITED_METADATA_FIELDS],
    stopConditions: [...EXPORT_STOP_CONDITIONS],
    requiredFutureProof: [...requiredFutureProof],
  },
  {
    id: 'audit_metadata_contract',
    label: 'Audit Metadata Contract Policy',
    objective: 'Model future audit metadata required around artifacts without writing audit events or storing payloads.',
    modelOnly: true,
    liveStorageAccessAllowed: false,
    liveSignedUrlGenerationAllowed: false,
    privateStorageRequired: true,
    retentionPolicy: 'Future audit metadata retention must be approved before artifact creation or storage use.',
    ownerRole: 'AP-approved audit owner role required before execution.',
    accessRoles: ['AP approver', 'audit reviewer', 'security reviewer'],
    signedReferenceRequirements: [
      'Future signed references must include audit metadata references without raw payloads.',
      'No live signed URL, public URL, storage object reference, or object path is created by this model.',
    ],
    auditMetadataFields: [...EXPORT_ALLOWED_METADATA_FIELDS],
    prohibitedMetadataFields: [...EXPORT_PROHIBITED_METADATA_FIELDS],
    stopConditions: [...EXPORT_STOP_CONDITIONS],
    requiredFutureProof: [...requiredFutureProof],
  },
] as const;

const cloneBoundaryContract = (contract: ExportArtifactBoundaryContract): ExportArtifactBoundaryContract => ({
  ...contract,
  allowedMetadataFields: [...contract.allowedMetadataFields],
  prohibitedMetadataFields: [...contract.prohibitedMetadataFields],
  redactionRules: [...contract.redactionRules],
  sourceEvidenceReferences: [...contract.sourceEvidenceReferences],
  lineageRules: [...contract.lineageRules],
  requiredFutureProof: [...contract.requiredFutureProof],
  prohibitedOutputs: [...contract.prohibitedOutputs],
  stopConditions: [...contract.stopConditions],
  blockedReadinessClaims: [...contract.blockedReadinessClaims],
});

const cloneStorageAccessPolicy = (policy: StorageAccessPolicyContract): StorageAccessPolicyContract => ({
  ...policy,
  accessRoles: [...policy.accessRoles],
  signedReferenceRequirements: [...policy.signedReferenceRequirements],
  auditMetadataFields: [...policy.auditMetadataFields],
  prohibitedMetadataFields: [...policy.prohibitedMetadataFields],
  stopConditions: [...policy.stopConditions],
  requiredFutureProof: [...policy.requiredFutureProof],
});

export function buildExportArtifactControlSnapshot(): ExportArtifactControlSnapshot {
  return {
    generatedAt: EXPORT_ARTIFACT_CONTROL_GENERATED_AT,
    milestone: 'M5.5c Secure Export and Artifact Storage Design/Implementation Gate',
    modelOnly: true,
    generatedArtifactsAllowed: false,
    liveStorageExecutionAllowed: false,
    liveSignedUrlGenerationAllowed: false,
    artifactStatuses: [...EXPORT_ARTIFACT_STATUSES],
    artifactTypes: [...EXPORT_ARTIFACT_TYPES],
    allowedMetadataFields: [...EXPORT_ALLOWED_METADATA_FIELDS],
    prohibitedMetadataFields: [...EXPORT_PROHIBITED_METADATA_FIELDS],
    redactionRules: [...EXPORT_REDACTION_RULES],
    exportBoundaryContracts: exportBoundaryContracts.map(cloneBoundaryContract),
    storageAccessPolicies: storageAccessPolicies.map(cloneStorageAccessPolicy),
    prohibitedOutputs: [...EXPORT_PROHIBITED_OUTPUTS],
    stopConditions: [...EXPORT_STOP_CONDITIONS],
    blockedReadinessClaims: [...EXPORT_BLOCKED_READINESS_CLAIMS],
    deprecatedBuyerFacingLiteNames: [...DEPRECATED_BUYER_FACING_LITE_NAMES],
  };
}

export const CURRENT_EXPORT_ARTIFACT_CONTROL_SNAPSHOT = buildExportArtifactControlSnapshot();

export function getExportArtifactBoundaryContract(
  artifactType: ExportArtifactType,
  snapshot: ExportArtifactControlSnapshot = buildExportArtifactControlSnapshot(),
): ExportArtifactBoundaryContract {
  const contract = snapshot.exportBoundaryContracts.find(candidate => candidate.id === artifactType);
  if (!contract) {
    throw new Error(`Missing export artifact boundary contract: ${artifactType}`);
  }

  return cloneBoundaryContract(contract);
}

export function getStorageAccessPolicyContract(
  policyId: StorageAccessPolicyId,
  snapshot: ExportArtifactControlSnapshot = buildExportArtifactControlSnapshot(),
): StorageAccessPolicyContract {
  const policy = snapshot.storageAccessPolicies.find(candidate => candidate.id === policyId);
  if (!policy) {
    throw new Error(`Missing storage access policy contract: ${policyId}`);
  }

  return cloneStorageAccessPolicy(policy);
}

export function assertExportArtifactCopyIsClaimSafe(copy: string): void {
  for (const deprecatedName of DEPRECATED_BUYER_FACING_LITE_NAMES) {
    if (copy.includes(deprecatedName)) {
      throw new Error(`Deprecated buyer-facing name is not allowed: ${deprecatedName}`);
    }
  }

  const unsupportedPositiveClaimPatterns = [
    /\bproduction\s+ready\b/i,
    /\bhosted\s+ready\b/i,
    /\bdeployment\s+ready\b/i,
    /\bRLS\s+ready\b/i,
    /\bsecurity\s+ready\b/i,
    /\bbuyer\s+ready\b/i,
    /\bproduct\s+ready\b/i,
    /\brelease[- ]candidate\s+ready\b/i,
    /\bcompliance\s+certified\b/i,
    /\bbrowser\s+(verification|walkthrough)\s+(complete|verified|passed)\b/i,
    /\bscreenshot\s+(proof|evidence)\s+(captured|available|ready)\b/i,
    /\b(export|PDF|download|storage)\s+ready\b/i,
    /\bartifact\s+storage\s+ready\b/i,
    /\b(export|PDF|download|storage)\s+readiness\s+(proved|complete|verified|accepted|achieved)\b/i,
    /\bexport\/PDF\/download\s+readiness\s+(proved|complete|verified|accepted|achieved)\b/i,
    /\bartifact\s+storage\s+readiness\s+(proved|complete|verified|accepted|achieved)\b/i,
    /\b(live\s+)?storage\s+(verified|available|active)\b/i,
    /\bsigned\s+URL\s+(available|created|ready)\b/i,
    /\bapproval\s+(ready|complete)\b/i,
    /\bapproval\s+workflow\s+ready\b/i,
    /\bworkflow\s+ready\b/i,
  ];

  for (const pattern of unsupportedPositiveClaimPatterns) {
    if (pattern.test(copy)) {
      throw new Error(`Unsupported export, artifact storage, readiness, or proof claim is not allowed: ${pattern}`);
    }
  }
}

export function assertExportArtifactSnapshotIsModelOnly(
  snapshot: ExportArtifactControlSnapshot = buildExportArtifactControlSnapshot(),
): void {
  if (!snapshot.modelOnly) {
    throw new Error('Export/artifact control snapshot must remain model-only.');
  }
  if (snapshot.generatedArtifactsAllowed) {
    throw new Error('Generated artifacts must remain disallowed.');
  }
  if (snapshot.liveStorageExecutionAllowed) {
    throw new Error('Live storage execution must remain disallowed.');
  }
  if (snapshot.liveSignedUrlGenerationAllowed) {
    throw new Error('Live signed URL generation must remain disallowed.');
  }

  for (const field of ['signed_url', 'storage_object_path', 'export_payload', 'pdf_payload', 'download_payload', 'binary_content'] as const) {
    if (!snapshot.prohibitedMetadataFields.includes(field)) {
      throw new Error(`Export/artifact control snapshot must prohibit metadata field: ${field}`);
    }
  }

  for (const output of ['export_file', 'pdf_file', 'download_file', 'storage_object', 'live_signed_url', 'readiness_evidence'] as const) {
    if (!snapshot.prohibitedOutputs.includes(output)) {
      throw new Error(`Export/artifact control snapshot must prohibit output: ${output}`);
    }
  }

  for (const contract of snapshot.exportBoundaryContracts) {
    if (!contract.modelOnly) {
      throw new Error(`Export boundary contract must remain model-only: ${contract.id}`);
    }
    if (contract.artifactGenerated) {
      throw new Error(`Export boundary contract cannot represent a generated artifact: ${contract.id}`);
    }
    if (contract.artifactStatus === 'generated') {
      throw new Error(`Export boundary contract cannot use generated status: ${contract.id}`);
    }
    if (!contract.apApprovalRequiredBeforeExecution) {
      throw new Error(`Export boundary contract must require AP approval before execution: ${contract.id}`);
    }
    for (const field of EXPORT_ALLOWED_METADATA_FIELDS) {
      if (!contract.allowedMetadataFields.includes(field)) {
        throw new Error(`Export boundary contract ${contract.id} is missing allowed metadata field ${field}.`);
      }
    }
    for (const field of EXPORT_PROHIBITED_METADATA_FIELDS) {
      if (!contract.prohibitedMetadataFields.includes(field)) {
        throw new Error(`Export boundary contract ${contract.id} is missing prohibited metadata field ${field}.`);
      }
    }
    for (const output of EXPORT_PROHIBITED_OUTPUTS) {
      if (!contract.prohibitedOutputs.includes(output)) {
        throw new Error(`Export boundary contract ${contract.id} is missing prohibited output ${output}.`);
      }
    }
    assertExportArtifactCopyIsClaimSafe([
      contract.label,
      contract.objective,
      contract.limitationDisclosure,
      ...contract.sourceEvidenceReferences,
      ...contract.lineageRules,
      ...contract.requiredFutureProof,
      ...contract.stopConditions,
      ...contract.blockedReadinessClaims,
    ].join('\n'));
  }

  for (const policy of snapshot.storageAccessPolicies) {
    if (!policy.modelOnly) {
      throw new Error(`Storage access policy must remain model-only: ${policy.id}`);
    }
    if (policy.liveStorageAccessAllowed) {
      throw new Error(`Storage access policy cannot allow live storage access: ${policy.id}`);
    }
    if (policy.liveSignedUrlGenerationAllowed) {
      throw new Error(`Storage access policy cannot allow live signed URL generation: ${policy.id}`);
    }
    for (const field of EXPORT_PROHIBITED_METADATA_FIELDS) {
      if (!policy.prohibitedMetadataFields.includes(field)) {
        throw new Error(`Storage access policy ${policy.id} is missing prohibited metadata field ${field}.`);
      }
    }
    assertExportArtifactCopyIsClaimSafe([
      policy.label,
      policy.objective,
      policy.retentionPolicy,
      policy.ownerRole,
      ...policy.accessRoles,
      ...policy.signedReferenceRequirements,
      ...policy.stopConditions,
      ...policy.requiredFutureProof,
    ].join('\n'));
  }
}
