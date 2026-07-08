import { Organization, Scope, ScopeType, User } from '../types';
import {
  buildExportArtifactControlSnapshot,
  EXPORT_ARTIFACT_TYPES,
  EXPORT_PROHIBITED_OUTPUTS,
  ExportArtifactType,
  ExportProhibitedOutput,
} from './exportArtifactControlModel';
import { ProductActionDecision } from './productActionPolicy';

export type ArtifactExportAction =
  | 'document.export'
  | 'document.download'
  | 'decision_pack.export'
  | 'decision_pack.download'
  | 'delivery_pack.export'
  | 'delivery_pack.download'
  | 'buyer_acceptance_pack.export'
  | 'readiness_trust_evidence.export'
  | 'report.export'
  | 'storage.object.create'
  | 'storage.signed_url.create'
  | 'external_share.create';

export type ArtifactPolicyArtifactType =
  | ExportArtifactType
  | 'generated_document_export'
  | 'generated_document_download'
  | 'generated_document_pdf_print'
  | 'report_export'
  | 'storage_object'
  | 'signed_url'
  | 'external_share';

export type ArtifactExportDecisionStatus = 'blocked' | 'decision_pending';
export type ArtifactExportRisk = 'low' | 'medium' | 'high' | 'critical';
export type ArtifactExportReason =
  | 'unknown_artifact_action'
  | 'unknown_artifact_type'
  | 'product_action_blocked'
  | 'missing_actor_context'
  | 'missing_organization_context'
  | 'missing_scope_context'
  | 'missing_document_context'
  | 'missing_assessment_context'
  | 'missing_assessment_scores'
  | 'missing_project_context'
  | 'missing_delivery_pack_context'
  | 'missing_lineage_or_evidence_refs'
  | 'future_ap_approval_required'
  | 'prohibited_output_requested'
  | 'storage_access_not_approved'
  | 'signed_url_not_approved'
  | 'external_sharing_not_approved';

export interface ArtifactExportDecision {
  action: string;
  artifactType: string;
  allowed: false;
  status: ArtifactExportDecisionStatus;
  reason: ArtifactExportReason;
  risk: ArtifactExportRisk;
  requiredPermission?: string;
  requiredContext: string[];
  prohibitedOutputs: ExportProhibitedOutput[];
  sourceSurfaceId?: string;
  message: string;
}

export interface ArtifactExportPolicyInput {
  action: ArtifactExportAction | string;
  artifactType?: ArtifactPolicyArtifactType | string;
  actor?: User | null;
  organization?: Organization | null;
  scope?: Scope | null;
  productActionDecision?: ProductActionDecision;
  documentGenerationId?: string | null;
  hasDocumentContext?: boolean;
  assessmentId?: string | null;
  hasAssessmentScores?: boolean;
  projectId?: string | null;
  deliveryPackId?: string | null;
  hasDeliveryPackContext?: boolean;
  evidenceRefs?: readonly string[];
  lineageRefs?: readonly string[];
  requestedOutputs?: readonly (ExportProhibitedOutput | string)[];
  sourceSurfaceId?: string;
}

export interface ArtifactExportAttemptAuditEnvelope {
  schemaVersion: 'artifact-export-attempt.v1';
  action: string;
  artifactType: string;
  sourceSurfaceId?: string;
  actor: {
    userId?: string;
    orgRole?: string;
    permissionSnapshot: string[];
  };
  organizationId?: string;
  scope: {
    type?: ScopeType;
    id?: string;
  };
  context: {
    projectId?: string;
    documentGenerationId?: string;
    assessmentId?: string;
    deliveryPackId?: string;
    evidenceRefs: string[];
    lineageRefs: string[];
  };
  decision: Pick<ArtifactExportDecision, 'allowed' | 'status' | 'reason' | 'risk' | 'message'>;
  prohibitedOutputs: ExportProhibitedOutput[];
}

interface ArtifactActionMetadata {
  artifactType: ArtifactPolicyArtifactType;
  risk: ArtifactExportRisk;
  requiredPermission?: string;
  requiredContext: string[];
  prohibitedOutputs: ExportProhibitedOutput[];
}

const ACTION_METADATA: Record<ArtifactExportAction, ArtifactActionMetadata> = {
  'document.export': {
    artifactType: 'generated_document_export',
    risk: 'critical',
    requiredPermission: 'docs.export',
    requiredContext: ['actor', 'organization', 'scope', 'document'],
    prohibitedOutputs: ['export_file', 'storage_object', 'live_signed_url'],
  },
  'document.download': {
    artifactType: 'generated_document_download',
    risk: 'critical',
    requiredPermission: 'artifact.download',
    requiredContext: ['actor', 'organization', 'scope', 'document'],
    prohibitedOutputs: ['download_file', 'pdf_file'],
  },
  'decision_pack.export': {
    artifactType: 'decision_pack_export',
    risk: 'critical',
    requiredContext: ['actor', 'organization', 'scope', 'assessment', 'scores'],
    prohibitedOutputs: ['export_file', 'storage_object', 'live_signed_url'],
  },
  'decision_pack.download': {
    artifactType: 'decision_pack_export',
    risk: 'critical',
    requiredContext: ['actor', 'organization', 'scope', 'assessment', 'scores'],
    prohibitedOutputs: ['download_file'],
  },
  'delivery_pack.export': {
    artifactType: 'delivery_pack_export',
    risk: 'critical',
    requiredPermission: 'delivery.pack.review',
    requiredContext: ['actor', 'organization', 'scope', 'project', 'delivery_pack', 'lineage_or_evidence'],
    prohibitedOutputs: ['export_file', 'download_file'],
  },
  'delivery_pack.download': {
    artifactType: 'delivery_pack_export',
    risk: 'critical',
    requiredPermission: 'delivery.pack.review',
    requiredContext: ['actor', 'organization', 'scope', 'project', 'delivery_pack', 'lineage_or_evidence'],
    prohibitedOutputs: ['download_file'],
  },
  'buyer_acceptance_pack.export': {
    artifactType: 'buyer_acceptance_pack_pdf',
    risk: 'critical',
    requiredContext: ['actor', 'organization', 'scope', 'lineage_or_evidence'],
    prohibitedOutputs: ['pdf_file', 'download_file', 'readiness_evidence'],
  },
  'readiness_trust_evidence.export': {
    artifactType: 'trust_center_export',
    risk: 'critical',
    requiredContext: ['actor', 'organization', 'scope', 'lineage_or_evidence'],
    prohibitedOutputs: ['export_file', 'readiness_evidence'],
  },
  'report.export': {
    artifactType: 'report_export',
    risk: 'high',
    requiredContext: ['actor', 'organization', 'scope'],
    prohibitedOutputs: ['export_file', 'download_file'],
  },
  'storage.object.create': {
    artifactType: 'storage_object',
    risk: 'critical',
    requiredContext: ['actor', 'organization', 'scope'],
    prohibitedOutputs: ['storage_object'],
  },
  'storage.signed_url.create': {
    artifactType: 'signed_url',
    risk: 'critical',
    requiredContext: ['actor', 'organization', 'scope'],
    prohibitedOutputs: ['live_signed_url', 'public_url'],
  },
  'external_share.create': {
    artifactType: 'external_share',
    risk: 'critical',
    requiredContext: ['actor', 'organization', 'scope'],
    prohibitedOutputs: ['public_url'],
  },
};

const KNOWN_ARTIFACT_TYPES = [
  ...EXPORT_ARTIFACT_TYPES,
  'generated_document_export',
  'generated_document_download',
  'generated_document_pdf_print',
  'report_export',
  'storage_object',
  'signed_url',
  'external_share',
] as const;

const isKnownAction = (action: string): action is ArtifactExportAction =>
  Object.prototype.hasOwnProperty.call(ACTION_METADATA, action);

const isKnownArtifactType = (artifactType: string): artifactType is ArtifactPolicyArtifactType =>
  (KNOWN_ARTIFACT_TYPES as readonly string[]).includes(artifactType);

const isProhibitedOutput = (output: string): output is ExportProhibitedOutput =>
  (EXPORT_PROHIBITED_OUTPUTS as readonly string[]).includes(output);

const uniqueProhibitedOutputs = (outputs: readonly string[]): ExportProhibitedOutput[] => {
  const prohibited = outputs.filter(isProhibitedOutput);
  return Array.from(new Set(prohibited));
};

const buildDecision = (
  input: ArtifactExportPolicyInput,
  metadata: ArtifactActionMetadata | undefined,
  reason: ArtifactExportReason,
  status: ArtifactExportDecisionStatus,
  message: string,
): ArtifactExportDecision => ({
  action: input.action,
  artifactType: String(input.artifactType || metadata?.artifactType || 'unknown'),
  allowed: false,
  status,
  reason,
  risk: metadata?.risk || 'critical',
  requiredPermission: metadata?.requiredPermission || input.productActionDecision?.requiredPermissions[0],
  requiredContext: metadata?.requiredContext || [],
  prohibitedOutputs: uniqueProhibitedOutputs([
    ...(metadata?.prohibitedOutputs || []),
    ...(input.requestedOutputs || []),
  ]),
  sourceSurfaceId: input.sourceSurfaceId,
  message,
});

export function resolveArtifactExportPolicy(input: ArtifactExportPolicyInput): ArtifactExportDecision {
  const metadata = isKnownAction(input.action) ? ACTION_METADATA[input.action] : undefined;
  if (!metadata) {
    return buildDecision(input, metadata, 'unknown_artifact_action', 'blocked', 'Unknown artifact action. Export and download actions fail closed.');
  }

  const artifactType = String(input.artifactType || metadata.artifactType);
  if (!isKnownArtifactType(artifactType)) {
    return buildDecision(input, metadata, 'unknown_artifact_type', 'blocked', 'Unknown artifact type. Artifact actions fail closed.');
  }

  if (!input.actor) {
    return buildDecision(input, metadata, 'missing_actor_context', 'blocked', 'Sign in before requesting artifact actions.');
  }
  if (!input.organization) {
    return buildDecision(input, metadata, 'missing_organization_context', 'blocked', 'Select an organization before requesting artifact actions.');
  }
  if (!input.scope) {
    return buildDecision(input, metadata, 'missing_scope_context', 'blocked', 'Select a product scope before requesting artifact actions.');
  }
  if (metadata.requiredContext.includes('document') && (!input.hasDocumentContext || !input.documentGenerationId)) {
    return buildDecision(input, metadata, 'missing_document_context', 'blocked', 'Open a generated document with source context before requesting artifact actions.');
  }
  if (metadata.requiredContext.includes('assessment') && !input.assessmentId) {
    return buildDecision(input, metadata, 'missing_assessment_context', 'blocked', 'Open an assessment before requesting Decision Pack artifact actions.');
  }
  if (metadata.requiredContext.includes('scores') && !input.hasAssessmentScores) {
    return buildDecision(input, metadata, 'missing_assessment_scores', 'blocked', 'Complete scoring before requesting Decision Pack artifact actions.');
  }
  if (metadata.requiredContext.includes('project') && !input.projectId) {
    return buildDecision(input, metadata, 'missing_project_context', 'blocked', 'Select a project before requesting Delivery Pack artifact actions.');
  }
  if (metadata.requiredContext.includes('delivery_pack') && !input.deliveryPackId) {
    return buildDecision(input, metadata, 'missing_delivery_pack_context', 'blocked', 'Assemble a Delivery Pack before requesting Delivery Pack artifact actions.');
  }
  if (
    metadata.requiredContext.includes('lineage_or_evidence')
    && !input.evidenceRefs?.length
    && !input.lineageRefs?.length
  ) {
    return buildDecision(input, metadata, 'missing_lineage_or_evidence_refs', 'blocked', 'Add lineage or evidence references before requesting artifact actions.');
  }
  if (input.productActionDecision && !input.productActionDecision.allowed) {
    return buildDecision(input, metadata, 'product_action_blocked', 'blocked', input.productActionDecision.message);
  }

  const requestedProhibitedOutputs = uniqueProhibitedOutputs(input.requestedOutputs || []);
  if (requestedProhibitedOutputs.includes('storage_object')) {
    return buildDecision(input, metadata, 'storage_access_not_approved', 'decision_pending', 'Storage object creation is blocked until a later AP-approved artifact storage boundary.');
  }
  if (requestedProhibitedOutputs.includes('live_signed_url') || requestedProhibitedOutputs.includes('public_url')) {
    return buildDecision(input, metadata, 'signed_url_not_approved', 'decision_pending', 'Signed URL and public URL generation are blocked until a later AP-approved artifact storage boundary.');
  }
  if (requestedProhibitedOutputs.length > 0) {
    return buildDecision(input, metadata, 'prohibited_output_requested', 'blocked', 'Requested artifact output is prohibited by the current model-only export boundary.');
  }

  if (input.action === 'storage.object.create') {
    return buildDecision(input, metadata, 'storage_access_not_approved', 'decision_pending', 'Storage object creation is blocked until a later AP-approved artifact storage boundary.');
  }
  if (input.action === 'storage.signed_url.create') {
    return buildDecision(input, metadata, 'signed_url_not_approved', 'decision_pending', 'Signed URL generation is blocked until a later AP-approved artifact storage boundary.');
  }
  if (input.action === 'external_share.create') {
    return buildDecision(input, metadata, 'external_sharing_not_approved', 'decision_pending', 'External sharing is blocked until a later AP-approved artifact boundary.');
  }

  const snapshot = buildExportArtifactControlSnapshot();
  if (
    !snapshot.modelOnly
    || snapshot.generatedArtifactsAllowed
    || snapshot.liveStorageExecutionAllowed
    || snapshot.liveSignedUrlGenerationAllowed
  ) {
    return buildDecision(input, metadata, 'future_ap_approval_required', 'decision_pending', 'Artifact actions require a later AP-approved execution gate before use.');
  }

  return buildDecision(input, metadata, 'future_ap_approval_required', 'decision_pending', 'Export, download, storage, signed URL, and external artifact actions remain blocked until a later AP-approved execution gate.');
}

export class ArtifactExportPolicyError extends Error {
  readonly decision: ArtifactExportDecision;

  constructor(decision: ArtifactExportDecision) {
    super(decision.message);
    this.name = 'ArtifactExportPolicyError';
    this.decision = decision;
  }
}

export function assertArtifactExportAllowed(input: ArtifactExportPolicyInput): never {
  const decision = resolveArtifactExportPolicy(input);
  throw new ArtifactExportPolicyError(decision);
}

export function buildArtifactExportAttemptAuditEnvelope(
  input: ArtifactExportPolicyInput,
  decision: ArtifactExportDecision = resolveArtifactExportPolicy(input),
): ArtifactExportAttemptAuditEnvelope {
  return {
    schemaVersion: 'artifact-export-attempt.v1',
    action: input.action,
    artifactType: decision.artifactType,
    sourceSurfaceId: input.sourceSurfaceId,
    actor: {
      userId: input.actor?.id,
      orgRole: input.actor?.orgRole,
      permissionSnapshot: [...(input.actor?.permissions || [])].sort(),
    },
    organizationId: input.organization?.id,
    scope: {
      type: input.scope?.type,
      id: input.scope && 'id' in input.scope ? input.scope.id : undefined,
    },
    context: {
      projectId: input.projectId || undefined,
      documentGenerationId: input.documentGenerationId || undefined,
      assessmentId: input.assessmentId || undefined,
      deliveryPackId: input.deliveryPackId || undefined,
      evidenceRefs: [...(input.evidenceRefs || [])],
      lineageRefs: [...(input.lineageRefs || [])],
    },
    decision: {
      allowed: decision.allowed,
      status: decision.status,
      reason: decision.reason,
      risk: decision.risk,
      message: decision.message,
    },
    prohibitedOutputs: [...decision.prohibitedOutputs],
  };
}
