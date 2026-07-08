import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Organization, Scope, ScopeType, User } from '../types';
import { ProductActionDecision } from './productActionPolicy';
import {
  buildArtifactExportAttemptAuditEnvelope,
  resolveArtifactExportPolicy,
} from './artifactExportPolicy';

const organization: Organization = {
  id: 'org-1',
  name: 'Avala Test Org',
  profile: {
    industry: 'Technology',
    size: '201-1000',
    geography: 'US',
    strategicGoals: 'Govern delivery controls',
  },
  subscriptionTier: 'Enterprise',
  members: [],
  enabledModules: ['assess', 'docs', 'delivery', 'monitor'],
};

const scope: Scope = { type: ScopeType.PROJECT, id: 'project-1', name: 'Project One' };

const actor = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  name: 'Export Analyst',
  email: 'analyst@example.com',
  orgRole: 'Contributor',
  permissions: ['docs.export', 'artifact.download', 'task.read'],
  ...overrides,
});

const productDecision = (overrides: Partial<ProductActionDecision> = {}): ProductActionDecision => ({
  action: 'docs.export',
  allowed: true,
  status: 'allowed',
  reason: 'allowed',
  risk: 'critical',
  module: 'docs',
  category: 'artifact',
  requiredPermissions: ['docs.export'],
  allowedScopes: [ScopeType.PROJECT],
  message: 'Allowed by source policy.',
  ...overrides,
});

describe('artifactExportPolicy', () => {
  it('fails closed for unknown artifact actions and artifact types', () => {
    assert.equal(resolveArtifactExportPolicy({
      action: 'unknown.export',
      actor: actor(),
      organization,
      scope,
    }).reason, 'unknown_artifact_action');

    assert.equal(resolveArtifactExportPolicy({
      action: 'document.export',
      artifactType: 'unknown_artifact',
      actor: actor(),
      organization,
      scope,
      documentGenerationId: 'docgen-1',
      hasDocumentContext: true,
    }).reason, 'unknown_artifact_type');
  });

  it('requires actor, organization, scope, and source context before artifact decisions', () => {
    assert.equal(resolveArtifactExportPolicy({
      action: 'document.export',
      organization,
      scope,
      documentGenerationId: 'docgen-1',
      hasDocumentContext: true,
    }).reason, 'missing_actor_context');

    assert.equal(resolveArtifactExportPolicy({
      action: 'document.export',
      actor: actor(),
      scope,
      documentGenerationId: 'docgen-1',
      hasDocumentContext: true,
    }).reason, 'missing_organization_context');

    assert.equal(resolveArtifactExportPolicy({
      action: 'document.export',
      actor: actor(),
      organization,
      documentGenerationId: 'docgen-1',
      hasDocumentContext: true,
    }).reason, 'missing_scope_context');

    assert.equal(resolveArtifactExportPolicy({
      action: 'document.export',
      actor: actor(),
      organization,
      scope,
    }).reason, 'missing_document_context');
  });

  it('treats product action policy as a prerequisite but not sufficient for artifact execution', () => {
    const blockedProductAction = productDecision({
      allowed: false,
      status: 'blocked',
      reason: 'missing_permission',
      message: 'Missing docs export permission.',
    });

    assert.equal(resolveArtifactExportPolicy({
      action: 'document.export',
      actor: actor(),
      organization,
      scope,
      productActionDecision: blockedProductAction,
      documentGenerationId: 'docgen-1',
      hasDocumentContext: true,
    }).reason, 'product_action_blocked');

    const decision = resolveArtifactExportPolicy({
      action: 'document.export',
      actor: actor(),
      organization,
      scope,
      productActionDecision: productDecision(),
      documentGenerationId: 'docgen-1',
      hasDocumentContext: true,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.status, 'decision_pending');
    assert.equal(decision.reason, 'future_ap_approval_required');
    assert.equal(decision.requiredPermission, 'docs.export');
  });

  it('blocks Decision Pack export before export, download, storage, or signed URL output can run', () => {
    const decision = resolveArtifactExportPolicy({
      action: 'decision_pack.export',
      actor: actor(),
      organization,
      scope,
      assessmentId: 'assessment-1',
      hasAssessmentScores: true,
      requestedOutputs: ['export_file', 'download_file', 'storage_object', 'live_signed_url'],
      sourceSurfaceId: 'guided-assessment.decision-pack-export',
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.status, 'decision_pending');
    assert.equal(decision.reason, 'storage_access_not_approved');
    assert.deepEqual(decision.prohibitedOutputs, ['export_file', 'storage_object', 'live_signed_url', 'download_file']);
  });

  it('blocks Delivery Pack exports without lineage or evidence and preserves the AP boundary when lineage exists', () => {
    assert.equal(resolveArtifactExportPolicy({
      action: 'delivery_pack.export',
      actor: actor(),
      organization,
      scope,
      projectId: 'project-1',
      deliveryPackId: 'project-1-delivery-pack',
      hasDeliveryPackContext: true,
    }).reason, 'missing_lineage_or_evidence_refs');

    const decision = resolveArtifactExportPolicy({
      action: 'delivery_pack.export',
      actor: actor(),
      organization,
      scope,
      productActionDecision: productDecision({ action: 'delivery.pack.review', requiredPermissions: ['task.read'] }),
      projectId: 'project-1',
      deliveryPackId: 'project-1-delivery-pack',
      hasDeliveryPackContext: true,
      evidenceRefs: ['ev-1'],
      lineageRefs: ['docgen-1'],
    });

    assert.equal(decision.reason, 'future_ap_approval_required');
    assert.equal(decision.allowed, false);
  });

  it('keeps storage objects, signed URLs, and prohibited output requests blocked', () => {
    assert.equal(resolveArtifactExportPolicy({
      action: 'storage.object.create',
      actor: actor(),
      organization,
      scope,
    }).reason, 'storage_access_not_approved');

    assert.equal(resolveArtifactExportPolicy({
      action: 'storage.signed_url.create',
      actor: actor(),
      organization,
      scope,
    }).reason, 'signed_url_not_approved');

    assert.equal(resolveArtifactExportPolicy({
      action: 'document.download',
      actor: actor(),
      organization,
      scope,
      productActionDecision: productDecision({ action: 'artifact.download', requiredPermissions: ['artifact.download'] }),
      documentGenerationId: 'docgen-1',
      hasDocumentContext: true,
      requestedOutputs: ['pdf_file'],
    }).reason, 'prohibited_output_requested');
  });

  it('builds sanitized audit envelopes without raw artifact payload, storage path, or signed URL fields', () => {
    const input = {
      action: 'document.download',
      actor: actor({ permissions: ['artifact.download', 'docs.export'] }),
      organization,
      scope,
      productActionDecision: productDecision({ action: 'artifact.download', requiredPermissions: ['artifact.download'] }),
      documentGenerationId: 'docgen-1',
      hasDocumentContext: true,
      evidenceRefs: ['ev-1'],
      lineageRefs: ['assessment-1'],
      requestedOutputs: ['download_file'],
      sourceSurfaceId: 'workspace.generated-document-download',
    } as const;
    const envelope = buildArtifactExportAttemptAuditEnvelope(input);
    const serialized = JSON.stringify(envelope);

    assert.equal(envelope.schemaVersion, 'artifact-export-attempt.v1');
    assert.deepEqual(envelope.actor.permissionSnapshot, ['artifact.download', 'docs.export']);
    assert.equal(envelope.context.documentGenerationId, 'docgen-1');
    assert.equal(serialized.includes('signed_url'), false);
    assert.equal(serialized.includes('storage_object_path'), false);
    assert.equal(serialized.includes('full_document_body'), false);
  });
});
