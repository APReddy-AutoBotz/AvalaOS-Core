import type { TenantContextProjection } from '../types';
import { buildAssessV2CommandEnvelope } from './assessV2ClientContract';
import { isEnterpriseObject } from './enterpriseAssessContract';

export const ASSESS_V2_REVIEW_CAPABILITIES = {
  review: 'assess.v2.review',
  attest: 'assess.v2.evidence.attest',
  approve: 'assess.v2.approve',
  governResolve: 'assess.v2.govern.resolve',
  studioHandoff: 'assess.v2.studio.handoff',
} as const;

export type EvidenceAttestationOutcome = 'accepted' | 'rejected' | 'needs-more-information';
export type ReviewResolution = 'approved' | 'planning_approved' | 'changes_requested' | 'rejected';

export const isAssessV2ReviewProjectionContract = (value: unknown): boolean => isEnterpriseObject(value)
  && typeof value.caseId === 'string' && typeof value.decisionId === 'string'
  && Number.isSafeInteger(value.caseVersion) && typeof value.reviewSchemaVersion === 'string'
  && Number.isSafeInteger(value.reviewSequence) && Array.isArray(value.evidence)
  && Array.isArray(value.actions) && Array.isArray(value.controls)
  && ['implementation_readiness','documentation_planning'].includes(String(value.approvalPurpose))
  && Array.isArray(value.acceptedEvidence) && Array.isArray(value.unresolvedQuestions)
  && value.acceptedEvidence.every(item => isEnterpriseObject(item) && typeof item.claimId === 'string'
    && Array.isArray(item.evidenceIds) && item.evidenceIds.every(id => typeof id === 'string'))
  && value.unresolvedQuestions.every(item => isEnterpriseObject(item) && typeof item.claimId === 'string');

export const buildAssessV2ReviewEnvelope = (
  context: TenantContextProjection,
  commandType: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  expectedVersion: number,
) => buildAssessV2CommandEnvelope(context, commandType, payload, idempotencyKey, expectedVersion);
