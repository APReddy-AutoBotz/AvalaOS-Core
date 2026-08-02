import type { TenantContextProjection } from '../types';
import {
  type StudioArtifactProjectionDto,
  type StudioCommandEnvelope,
} from '../services/studioArtifacts/contracts';
import type { StudioArtifactTransport } from '../services/studioArtifacts/client';

const ids = {
  caseId: 'a0000000-0000-4000-8000-000000000001',
  sourceCaseVersionId: 'a0000000-0000-4000-8000-000000000002',
  decisionId: 'a0000000-0000-4000-8000-000000000003',
  reviewResolutionId: 'a0000000-0000-4000-8000-000000000004',
  governResolutionId: 'a0000000-0000-4000-8000-000000000005',
  studioHandoffId: 'a0000000-0000-4000-8000-000000000006',
  artifactId: 'a0000000-0000-4000-8000-000000000007',
  versionOneId: 'a0000000-0000-4000-8000-000000000008',
  versionTwoId: 'a0000000-0000-4000-8000-000000000009',
  authorId: 'a0000000-0000-4000-8000-000000000010',
  reviewerId: 'a0000000-0000-4000-8000-000000000011',
  assignmentId: 'a0000000-0000-4000-8000-000000000012',
} as const;

const sourcePackageHash = 'a'.repeat(64);
const versionOneHash = 'b'.repeat(64);
const versionTwoHash = 'c'.repeat(64);

export const createMarketingStudioCaptureContext = (context: TenantContextProjection): TenantContextProjection => ({
  ...context,
  userId: 'a0000000-0000-4000-8000-000000000020',
  organizationId: 'a0000000-0000-4000-8000-000000000021',
  workspaceId: 'a0000000-0000-4000-8000-000000000022',
  capabilities: [],
});

const marketingArtifact = (context: TenantContextProjection): StudioArtifactProjectionDto => {
  const versionOne = {
    id: ids.versionOneId,
    version: 1,
    parentVersionId: null,
    lifecycle: 'approved' as const,
    templateVersion: 'brd-v1',
    contentSchemaVersion: 'studio-v1',
    projectionVersion: 'json-v1',
    content: {
      title: 'AP Invoice Exception Handling control brief',
      summary: 'Approved source context for governed exception routing, evidence capture, and human review.',
    },
    contentHash: versionOneHash,
    authorId: ids.authorId,
    createdAt: '2026-07-28T09:00:00.000Z',
  };
  const versionTwo = {
    id: ids.versionTwoId,
    version: 2,
    parentVersionId: ids.versionOneId,
    lifecycle: 'in_review' as const,
    templateVersion: 'brd-v1',
    contentSchemaVersion: 'studio-v1',
    projectionVersion: 'json-v1',
    content: {
      title: 'AP Invoice Exception Handling control brief',
      summary: 'Review-ready source context for exception routing, evidence capture, and human approval before delivery.',
      sections: [
        'Decision context and operating assumptions',
        'Evidence and approval conditions',
        'Governed handoff boundaries',
      ],
    },
    contentHash: versionTwoHash,
    authorId: ids.authorId,
    createdAt: '2026-07-30T14:30:00.000Z',
  };

  return {
    id: ids.artifactId,
    artifactType: 'brd',
    aggregateVersion: 2,
    lifecycle: 'in_review',
    ancestry: {
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      caseId: ids.caseId,
      sourceCaseVersionId: ids.sourceCaseVersionId,
      sourceCaseVersion: 3,
      decisionId: ids.decisionId,
      decisionVersion: 'decision-v3',
      reviewResolutionId: ids.reviewResolutionId,
      governResolutionId: ids.governResolutionId,
      studioHandoffId: ids.studioHandoffId,
      sourcePackageHash,
      sourceSchemaVersion: 'assess-v2',
      ruleSetVersion: 'rules-v1',
      reviewSchemaVersion: 'review-v1',
      reviewSequence: 2,
    },
    currentVersion: versionTwo,
    currentApprovedVersion: versionOne,
    versions: [versionOne, versionTwo],
    review: {
      assignmentId: ids.assignmentId,
      reviewerId: ids.reviewerId,
      outcome: null,
      rationale: null,
      conditions: [],
    },
    approval: null,
    readOnly: true,
  };
};

/**
 * Deterministic, read-only data for the local marketing screenshot only.
 * This transport is never selected by the normal Studio route and every
 * command remains blocked by the read-only projection/capability boundary.
 */
export const createMarketingStudioCaptureTransport = (context: TenantContextProjection): StudioArtifactTransport => {
  const artifact = marketingArtifact(context);
  return {
    async readHandoffs() {
      return [{
        id: ids.studioHandoffId,
        caseId: ids.caseId,
        label: 'AP Invoice Exception Handling · governed source',
        sourcePackageHash,
      }];
    },
    async readProjection() {
      return artifact;
    },
    async readEligibleReviewers() {
      return [{ actorId: ids.reviewerId, displayName: 'Priya Nair · Independent reviewer' }];
    },
    async invoke(_envelope: StudioCommandEnvelope<Record<string, unknown>>) {
      throw new Error('Marketing capture transport is read-only. No command was submitted.');
    },
  };
};
