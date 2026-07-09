import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Organization, Scope, ScopeType, User } from '../types';
import {
  ArtifactExportPolicyError,
  assertArtifactExportExecutionAllowed,
  buildArtifactExportAttemptAuditEnvelope,
  buildArtifactExportExecutionGuardAuditEnvelope,
  resolveArtifactExportPolicy,
} from './artifactExportPolicy';
import { downloadAssessmentDecisionPack } from './assessmentExportService';
import { downloadDeliveryPackExport, getDeliveryPackExport } from './deliveryPackExportService';
import { downloadGeneratedArtifacts } from './documentExportService';

const organization: Organization = {
  id: 'org-1',
  name: 'Avala Test Org',
  profile: {
    industry: 'Technology',
    size: '201-1000',
    geography: 'US',
    strategicGoals: 'Guard artifact helpers',
  },
  subscriptionTier: 'Enterprise',
  members: [],
  enabledModules: ['assess', 'docs', 'delivery', 'monitor'],
};

const scope: Scope = { type: ScopeType.PROJECT, id: 'project-1', name: 'Project One' };

const actor: User = {
  id: 'user-1',
  name: 'Artifact Guard Tester',
  email: 'artifact@example.com',
  orgRole: 'Admin',
  permissions: ['docs.export', 'artifact.download', 'delivery.pack.review'],
};

const documentDecision = () => resolveArtifactExportPolicy({
  action: 'document.export',
  artifactType: 'generated_document_export',
  actor,
  organization,
  scope,
  documentGenerationId: 'docgen-1',
  hasDocumentContext: true,
  sourceSurfaceId: 'workspace.generated-document-export',
});

const decisionPackDecision = () => resolveArtifactExportPolicy({
  action: 'decision_pack.export',
  artifactType: 'decision_pack_export',
  actor,
  organization,
  scope,
  assessmentId: 'assessment-1',
  hasAssessmentScores: true,
  sourceSurfaceId: 'guided-assessment.decision-pack-export',
});

const deliveryPackDecision = () => resolveArtifactExportPolicy({
  action: 'delivery_pack.export',
  artifactType: 'delivery_pack_export',
  actor,
  organization,
  scope,
  projectId: 'project-1',
  deliveryPackId: 'project-1-delivery-pack',
  hasDeliveryPackContext: true,
  evidenceRefs: ['ev-1'],
  lineageRefs: ['docgen-1'],
  sourceSurfaceId: 'delivery-pack.markdown-export',
});

const signedUrlDecision = () => resolveArtifactExportPolicy({
  action: 'storage.signed_url.create',
  artifactType: 'signed_url',
  actor,
  organization,
  scope,
  requestedOutputs: ['live_signed_url', 'public_url'],
  sourceSurfaceId: 'workspace.generated-document-signed-url',
});

const assertPolicyError = async (run: () => unknown | Promise<unknown>, reason: string) => {
  try {
    await run();
    assert.fail(`Expected ArtifactExportPolicyError with reason ${reason}`);
  } catch (error) {
    assert.ok(error instanceof ArtifactExportPolicyError);
    assert.equal(error.decision.reason, reason);
    return error.decision;
  }
};

describe('artifact export helper guards', () => {
  it('requires an explicit policy decision before local document export helpers can create output', async () => {
    await assertPolicyError(
      () => downloadGeneratedArtifacts({} as any, undefined, 'json'),
      'missing_artifact_policy_decision',
    );

    await assertPolicyError(
      () => downloadGeneratedArtifacts({} as any, undefined, 'markdown', documentDecision()),
      'artifact_policy_decision_pending',
    );
  });

  it('requires an explicit policy decision before Decision Pack and Delivery Pack local helpers can create output', async () => {
    await assertPolicyError(
      () => downloadAssessmentDecisionPack({} as any, 'Process', 'json'),
      'missing_artifact_policy_decision',
    );

    await assertPolicyError(
      () => downloadAssessmentDecisionPack({} as any, 'Process', 'markdown', undefined, decisionPackDecision()),
      'artifact_policy_decision_pending',
    );

    await assertPolicyError(
      () => getDeliveryPackExport({} as any, 'json'),
      'missing_artifact_policy_decision',
    );

    await assertPolicyError(
      () => downloadDeliveryPackExport({} as any, 'markdown', deliveryPackDecision()),
      'artifact_policy_decision_pending',
    );
  });

  it('blocks Edge export and signed URL helper contracts before network or storage calls without approved policy', async () => {
    await assertPolicyError(
      () => assertArtifactExportExecutionAllowed({
        helperId: 'aiEdgeClient.exportDocument',
        operation: 'export',
        expectedAction: 'document.export',
        expectedArtifactType: 'generated_document_export',
      }),
      'missing_artifact_policy_decision',
    );

    await assertPolicyError(
      () => assertArtifactExportExecutionAllowed({
        helperId: 'aiEdgeClient.exportDocument',
        operation: 'export',
        decision: documentDecision(),
        expectedAction: 'document.export',
        expectedArtifactType: 'generated_document_export',
      }),
      'artifact_policy_decision_pending',
    );

    await assertPolicyError(
      () => assertArtifactExportExecutionAllowed({
        helperId: 'aiEdgeClient.exportDecisionPack',
        operation: 'export',
        decision: decisionPackDecision(),
        expectedAction: 'decision_pack.export',
        expectedArtifactType: 'decision_pack_export',
      }),
      'artifact_policy_decision_pending',
    );

    await assertPolicyError(
      () => assertArtifactExportExecutionAllowed({
        helperId: 'aiEdgeClient.createSignedDownloadUrl',
        operation: 'signed_url',
        expectedAction: 'storage.signed_url.create',
        expectedArtifactType: 'signed_url',
      }),
      'missing_artifact_policy_decision',
    );

    await assertPolicyError(
      () => assertArtifactExportExecutionAllowed({
        helperId: 'aiEdgeClient.createSignedDownloadUrl',
        operation: 'signed_url',
        decision: signedUrlDecision(),
        expectedAction: 'storage.signed_url.create',
        expectedArtifactType: 'signed_url',
      }),
      'artifact_policy_decision_pending',
    );
  });

  it('keeps helper guard audit envelopes side-effect-free and free of storage references', () => {
    const envelope = buildArtifactExportExecutionGuardAuditEnvelope({
      helperId: 'aiEdgeClient.createSignedDownloadUrl',
      operation: 'signed_url',
      decision: signedUrlDecision(),
      sourceSurfaceId: 'workspace.generated-document-signed-url',
    });
    const serialized = JSON.stringify(envelope);

    assert.equal(envelope.schemaVersion, 'artifact-export-helper-guard.v1');
    assert.equal(envelope.decision.reason, 'signed_url_not_approved');
    assert.equal(serialized.includes('bucket'), false);
    assert.equal(serialized.includes('org-1/doc.md'), false);
    assert.equal(serialized.includes('signedUrl'), false);
    assert.equal(serialized.includes('storagePath'), false);
  });

  it('redacts unsafe free-form references from blocked attempt audit envelopes', () => {
    const envelope = buildArtifactExportAttemptAuditEnvelope({
      action: 'document.export',
      artifactType: 'generated_document_export',
      actor,
      organization,
      scope: { ...scope, id: '../org-2/private/path' },
      documentGenerationId: '../storage/object/path.md',
      hasDocumentContext: true,
      evidenceRefs: ['https://example.com/signed?token=secret', 'ev-safe-1'],
      lineageRefs: ['full document body with prompt and provider output', 'lineage-safe-1'],
      sourceSurfaceId: 'workspace.generated-document-export',
    });
    const serialized = JSON.stringify(envelope);

    assert.deepEqual(envelope.context.evidenceRefs, ['redacted-evidence-ref-1', 'ev-safe-1']);
    assert.deepEqual(envelope.context.lineageRefs, ['redacted-lineage-ref-1', 'lineage-safe-1']);
    assert.equal(envelope.context.documentGenerationId, 'redacted-document');
    assert.equal(envelope.scope.id, 'redacted-scope');
    assert.equal(serialized.includes('https://example.com'), false);
    assert.equal(serialized.includes('secret'), false);
    assert.equal(serialized.includes('provider output'), false);
    assert.equal(serialized.includes('../storage'), false);
  });
});