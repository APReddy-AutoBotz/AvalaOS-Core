import type { TenantContextProjection } from '../types';
import { buildAssessV2CommandEnvelope } from './assessV2ClientContract';

export const ASSESS_V2_REVIEW_CAPABILITIES = {
  review: 'assess.v2.review',
  attest: 'assess.v2.evidence.attest',
  approve: 'assess.v2.approve',
  governResolve: 'assess.v2.govern.resolve',
  studioHandoff: 'assess.v2.studio.handoff',
} as const;

export type EvidenceAttestationOutcome = 'accepted' | 'rejected' | 'needs-more-information';
export type ReviewResolution = 'approved' | 'changes_requested' | 'rejected';

export const buildAssessV2ReviewEnvelope = (
  context: TenantContextProjection,
  commandType: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  expectedVersion: number,
) => buildAssessV2CommandEnvelope(context, commandType, payload, idempotencyKey, expectedVersion);
