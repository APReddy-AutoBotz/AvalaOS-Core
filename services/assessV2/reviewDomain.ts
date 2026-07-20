import type { DecisionPackV2, EvidenceConfidence, EvidenceSubmission } from './types.ts';

export const ASSESS_V2_REVIEW_VERSION = 'assess-v2-review-2026-07' as const;

export type ReviewStatus = 'reviewer_ready' | 'in_review' | 'approved' | 'changes_requested' | 'rejected';
export type AttestationOutcome = 'accepted' | 'rejected' | 'needs-more-information';

export interface ReviewBinding {
  organizationId: string;
  workspaceId: string;
  caseId: string;
  caseVersion: number;
  decisionId: string;
  decisionVersion: string;
}

export interface ReviewAssignment extends ReviewBinding {
  id: string;
  reviewVersion: typeof ASSESS_V2_REVIEW_VERSION;
  authorActorId: string;
  reviewerActorId: string;
  reviewerAuthorizationVersion: number;
  assignedBy: string;
  assignedAt: string;
  requestId: string;
  receiptId: string;
  auditId: string;
}

export interface EvidenceAttestation extends ReviewBinding {
  id: string;
  assignmentId: string;
  evidenceId: string;
  claimIds: readonly string[];
  evidenceSubmitterActorId: string;
  reviewerActorId: string;
  reviewerAuthorizationVersion: number;
  outcome: AttestationOutcome;
  rationale: string;
  reviewedAt: string;
  requestId: string;
  receiptId: string;
  auditId: string;
}

export interface ReviewResolution extends ReviewBinding {
  id: string;
  assignmentId: string;
  reviewVersion: typeof ASSESS_V2_REVIEW_VERSION;
  status: Exclude<ReviewStatus, 'reviewer_ready' | 'in_review'>;
  reviewerActorId: string;
  reviewerAuthorizationVersion: number;
  rationale: string;
  conditions: readonly string[];
  confidence: EvidenceConfidence;
  resolvedAt: string;
  requestId: string;
  receiptId: string;
  auditId: string;
}

export class ReviewDomainError extends Error {
  constructor(public readonly code: 'INVALID_BINDING' | 'SEPARATION_OF_DUTY' | 'STALE_VERSION' | 'INCOMPLETE_REVIEW' | 'PROHIBITED_ACTION' | 'INVALID_STATE', message: string) {
    super(message);
    this.name = 'ReviewDomainError';
  }
}

const assertBinding = (expected: ReviewBinding, actual: ReviewBinding): void => {
  for (const key of ['organizationId', 'workspaceId', 'caseId', 'caseVersion', 'decisionId', 'decisionVersion'] as const) {
    if (expected[key] !== actual[key]) throw new ReviewDomainError('INVALID_BINDING', 'The review resource was not found.');
  }
};

const exactSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && new Set(left).size === left.length && left.every(value => right.includes(value));

export const validateReviewAssignment = (assignment: ReviewAssignment): void => {
  if (assignment.reviewerActorId === assignment.authorActorId) throw new ReviewDomainError('SEPARATION_OF_DUTY', 'The case author cannot review or approve their own decision.');
  if (!Number.isSafeInteger(assignment.reviewerAuthorizationVersion) || assignment.reviewerAuthorizationVersion < 1) throw new ReviewDomainError('STALE_VERSION', 'A current reviewer authorization version is required.');
};

export const validateAttestation = (assignment: ReviewAssignment, evidence: EvidenceSubmission & { submittedBy: string }, attestation: EvidenceAttestation): void => {
  validateReviewAssignment(assignment);
  assertBinding(assignment, attestation);
  if (assignment.id !== attestation.assignmentId || evidence.id !== attestation.evidenceId || !exactSet(evidence.claimIds, attestation.claimIds)) {
    throw new ReviewDomainError('INVALID_BINDING', 'The review resource was not found.');
  }
  if (attestation.reviewerActorId !== assignment.reviewerActorId || attestation.reviewerAuthorizationVersion !== assignment.reviewerAuthorizationVersion) {
    throw new ReviewDomainError('STALE_VERSION', 'Reviewer authority changed.');
  }
  if (attestation.reviewerActorId === assignment.authorActorId || attestation.reviewerActorId === evidence.submittedBy || attestation.evidenceSubmitterActorId !== evidence.submittedBy) {
    throw new ReviewDomainError('SEPARATION_OF_DUTY', 'Independent evidence review is required.');
  }
  if (!attestation.rationale.trim()) throw new ReviewDomainError('INCOMPLETE_REVIEW', 'Reviewer rationale is required.');
};

export interface MaterialClaim { claimId: string; evidenceIds: readonly string[] }

export const deriveReviewedConfidence = (binding: ReviewBinding, claims: readonly MaterialClaim[], evidence: readonly (EvidenceSubmission & { contradictory?: boolean })[], attestations: readonly EvidenceAttestation[], asOf: string): EvidenceConfidence => {
  if (!claims.length) return 'Insufficient Evidence';
  const accepted = (evidenceId: string, claimId: string): boolean => {
    const item = evidence.find(candidate => candidate.id === evidenceId);
    if (!item || item.status !== 'submitted' || item.contradictory || (item.validUntil && item.validUntil < asOf)) return false;
    const current = attestations.filter(attestation => {
      try { assertBinding(binding, attestation); } catch { return false; }
      return attestation.evidenceId === evidenceId && attestation.claimIds.includes(claimId);
    });
    return current.length > 0 && current[current.length - 1].outcome === 'accepted';
  };
  if (claims.every(claim => claim.evidenceIds.some(id => accepted(id, claim.claimId)))) return 'Verified';
  if (claims.some(claim => claim.evidenceIds.some(id => accepted(id, claim.claimId)))) return 'Partially Evidenced';
  return evidence.some(item => item.status === 'submitted') ? 'Partially Evidenced' : 'Assumption-Led';
};

export const resolveReview = (assignment: ReviewAssignment, status: ReviewResolution['status'], claims: readonly MaterialClaim[], evidence: readonly (EvidenceSubmission & { contradictory?: boolean })[], attestations: readonly EvidenceAttestation[], resolution: ReviewResolution): ReviewResolution => {
  validateReviewAssignment(assignment);
  assertBinding(assignment, resolution);
  if (resolution.assignmentId !== assignment.id || resolution.reviewerActorId !== assignment.reviewerActorId) throw new ReviewDomainError('SEPARATION_OF_DUTY', 'Independent decision review is required.');
  if (resolution.reviewerAuthorizationVersion !== assignment.reviewerAuthorizationVersion) throw new ReviewDomainError('STALE_VERSION', 'Reviewer authority changed.');
  if (resolution.status !== status || !resolution.rationale.trim()) throw new ReviewDomainError('INCOMPLETE_REVIEW', 'A valid resolution and rationale are required.');
  const confidence = deriveReviewedConfidence(assignment, claims, evidence, attestations, resolution.resolvedAt);
  if (status === 'approved' && (confidence !== 'Verified' || attestations.some(item => { try { assertBinding(assignment, item); } catch { return false; } return item.outcome !== 'accepted'; }))) {
    throw new ReviewDomainError('INCOMPLETE_REVIEW', 'All current material claims require accepted independent attestation.');
  }
  return Object.freeze({ ...resolution, confidence });
};

export interface DraftRevision { caseId: string; sourceCaseVersion: number; version: number; status: 'draft'; supersedesDecisionId: string; createdBy: string; createdAt: string }
export const startRevision = (binding: ReviewBinding, resolution: ReviewResolution, actorId: string, at: string): DraftRevision => {
  assertBinding(binding, resolution);
  if (resolution.status !== 'changes_requested') throw new ReviewDomainError('INVALID_STATE', 'A revision requires requested changes.');
  return Object.freeze({ caseId: binding.caseId, sourceCaseVersion: binding.caseVersion, version: binding.caseVersion + 1, status: 'draft', supersedesDecisionId: binding.decisionId, createdBy: actorId, createdAt: at });
};

export type GovernActionCategory = 'allowed' | 'approval-bound' | 'evidence-bound' | 'prohibited';
export interface GovernAction { actionId: string; category: GovernActionCategory; highImpact: boolean; financial: boolean; externalCommunication: boolean; irreversible: boolean }
export interface GovernResolution extends ReviewBinding {
  id: string; reviewResolutionId: string; reviewVersion: string; resolverActorId: string; rationale: string;
  actions: readonly GovernAction[]; requiredControls: readonly string[]; rollbackRequirements: readonly string[];
  monitoringRequirements: readonly string[]; reviewFrequency: string; accountableOwner: string; resolvedAt: string;
}

export const validateGovernResolution = (assignment: ReviewAssignment, review: ReviewResolution, deterministicActions: readonly GovernAction[], govern: GovernResolution): void => {
  assertBinding(assignment, govern);
  if (review.status !== 'approved' || govern.reviewResolutionId !== review.id || govern.reviewVersion !== review.reviewVersion) throw new ReviewDomainError('STALE_VERSION', 'Govern requires the current approved review.');
  if (govern.resolverActorId === assignment.authorActorId) throw new ReviewDomainError('SEPARATION_OF_DUTY', 'The case author cannot resolve Govern.');
  if (deterministicActions.some(action => (action.category === 'prohibited' && govern.actions.find(item => item.actionId === action.actionId)?.category !== 'prohibited') || (action.category === 'approval-bound' && govern.actions.find(item => item.actionId === action.actionId)?.category === 'allowed'))) {
    throw new ReviewDomainError('PROHIBITED_ACTION', 'Govern cannot weaken deterministic action constraints.');
  }
  if (govern.actions.some(action => (action.highImpact || action.financial || action.externalCommunication || action.irreversible) && govern.resolverActorId === review.reviewerActorId)) {
    throw new ReviewDomainError('SEPARATION_OF_DUTY', 'High-impact Govern resolution requires an additional independent actor.');
  }
  if (!govern.rationale.trim() || !govern.accountableOwner.trim() || !govern.reviewFrequency.trim()) throw new ReviewDomainError('INCOMPLETE_REVIEW', 'Govern provenance and ownership are required.');
};

export interface StudioHandoffPackage {
  binding: ReviewBinding; decision: DecisionPackV2; evidence: readonly EvidenceSubmission[]; attestations: readonly EvidenceAttestation[];
  review: ReviewResolution; govern: GovernResolution; schemaVersion: string; ruleSetVersion: string; reviewVersion: string;
  canonicalHashes: Readonly<Record<string, string>>; sourceReferences: readonly string[]; createdAt: string;
}

export const buildStudioHandoffPackage = (binding: ReviewBinding, decision: DecisionPackV2, evidence: readonly EvidenceSubmission[], attestations: readonly EvidenceAttestation[], review: ReviewResolution, govern: GovernResolution, canonicalHashes: Readonly<Record<string, string>>, sourceReferences: readonly string[], createdAt: string): StudioHandoffPackage => {
  assertBinding(binding, review); assertBinding(binding, govern);
  if (review.status !== 'approved' || review.confidence !== 'Verified' || govern.reviewResolutionId !== review.id) throw new ReviewDomainError('INVALID_STATE', 'Studio handoff requires current approval, attestations, and Govern resolution.');
  return Object.freeze({ binding: Object.freeze({ ...binding }), decision, evidence: Object.freeze([...evidence]), attestations: Object.freeze([...attestations]), review, govern, schemaVersion: decision.schemaVersion, ruleSetVersion: decision.ruleSetVersion, reviewVersion: review.reviewVersion, canonicalHashes: Object.freeze({ ...canonicalHashes }), sourceReferences: Object.freeze([...sourceReferences]), createdAt });
};
