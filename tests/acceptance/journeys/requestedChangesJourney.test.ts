import assert from 'node:assert/strict';
import {
  ASSESS_V2_REVIEW_VERSION,
  type EvidenceAttestation,
  type GovernAction,
  type GovernResolution,
  type ReviewAssignment,
  type ReviewBinding,
  type ReviewResolution,
  buildStudioHandoffPackage,
  resolveReview,
  startRevision,
  validateAttestation,
  validateGovernResolution,
} from '../../../services/assessV2/reviewDomain';
import { AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION } from '../../../services/assessV2/index';

const initialBinding: ReviewBinding = {
  organizationId: 'org-qa', workspaceId: 'ws-qa', caseId: 'case-qa', caseVersion: 4,
  decisionId: 'decision-v4', decisionVersion: 'decision-version-v4',
};
const assignmentFor = (binding: ReviewBinding, sequence: number): ReviewAssignment => ({
  ...binding, id: `assignment-${sequence}`, reviewSchemaVersion: ASSESS_V2_REVIEW_VERSION,
  reviewSequence: sequence, authorActorId: 'author-qa', reviewerActorId: 'reviewer-qa',
  reviewerAuthorizationVersion: sequence, assignedBy: 'lead-qa', assignedAt: `2026-08-13T10:0${sequence}:00.000Z`,
  requestId: `request-assignment-${sequence}`, receiptId: `receipt-assignment-${sequence}`, auditId: `audit-assignment-${sequence}`,
});
const resolutionFor = (binding: ReviewBinding, assignment: ReviewAssignment, status: ReviewResolution['status']): ReviewResolution => ({
  ...binding, id: `resolution-${assignment.reviewSequence}-${status}`, assignmentId: assignment.id,
  reviewSchemaVersion: ASSESS_V2_REVIEW_VERSION, reviewSequence: assignment.reviewSequence, status,
  reviewerActorId: assignment.reviewerActorId, reviewerAuthorizationVersion: assignment.reviewerAuthorizationVersion,
  rationale: status === 'changes_requested' ? 'Clarify exception controls.' : 'Reworked evidence is acceptable.',
  conditions: [], confidence: 'Insufficient Evidence', resolvedAt: `2026-08-13T11:0${assignment.reviewSequence}:00.000Z`,
  requestId: `request-resolution-${assignment.reviewSequence}`, receiptId: `receipt-resolution-${assignment.reviewSequence}`,
  auditId: `audit-resolution-${assignment.reviewSequence}`,
});
const evidence = [
  { id: 'ev-qa-1', claimIds: ['claim-qa-1'], sourceType: 'system-record' as const, status: 'submitted' as const, validated: false as const, submittedBy: 'submitter-qa-1' },
  { id: 'ev-qa-2', claimIds: ['claim-qa-2'], sourceType: 'test' as const, status: 'submitted' as const, validated: false as const, submittedBy: 'submitter-qa-2' },
];
const claims = evidence.map((item, index) => ({ claimId: `claim-qa-${index + 1}`, evidenceIds: [item.id] }));

const firstAssignment = assignmentFor(initialBinding, 1);
const changes = resolveReview(firstAssignment, 'changes_requested', claims, evidence, [], resolutionFor(initialBinding, firstAssignment, 'changes_requested'));
const revision = startRevision(initialBinding, changes, 'author-qa', '2026-08-13T12:00:00.000Z');
assert.equal(revision.sourceCaseVersion, 4);
assert.equal(revision.version, 5);
assert.equal(revision.supersedesDecisionId, 'decision-v4');

const revisedBinding: ReviewBinding = { ...initialBinding, caseVersion: revision.version, decisionId: 'decision-v5', decisionVersion: 'decision-version-v5' };
const secondAssignment = assignmentFor(revisedBinding, 2);
const attestations: EvidenceAttestation[] = evidence.map((item, index) => ({
  ...revisedBinding, id: `attestation-${index + 1}`, assignmentId: secondAssignment.id, evidenceId: item.id,
  claimIds: item.claimIds, evidenceSubmitterActorId: item.submittedBy, reviewerActorId: secondAssignment.reviewerActorId,
  reviewerAuthorizationVersion: secondAssignment.reviewerAuthorizationVersion, outcome: 'accepted',
  rationale: 'Reworked source and claim verified independently.', reviewedAt: `2026-08-13T13:0${index}:00.000Z`,
  requestId: `request-attestation-${index + 1}`, receiptId: `receipt-attestation-${index + 1}`, auditId: `audit-attestation-${index + 1}`,
}));
attestations.forEach((attestation, index) => validateAttestation(secondAssignment, evidence[index], attestation));
const approved = resolveReview(secondAssignment, 'approved', claims, evidence, attestations, resolutionFor(revisedBinding, secondAssignment, 'approved'));
assert.equal(approved.confidence, 'Verified');

const actions: GovernAction[] = [
  { actionId: 'read', category: 'allowed', highImpact: false, financial: false, externalCommunication: false, irreversible: false },
  { actionId: 'restricted-action', category: 'prohibited', highImpact: true, financial: false, externalCommunication: false, irreversible: true },
];
const govern: GovernResolution = {
  ...revisedBinding, id: 'govern-reworked-v5', reviewResolutionId: approved.id, reviewSchemaVersion: approved.reviewSchemaVersion,
  reviewSequence: approved.reviewSequence, resolverActorId: 'governor-qa', rationale: 'Approved rework preserves deterministic action boundaries.',
  actions, requiredControls: [{ controlId: 'Human Approval', status: 'resolved' }], rollbackRequirements: ['rollback'],
  monitoringRequirements: ['audit'], reviewFrequency: 'quarterly', accountableOwner: 'process-owner-qa', resolvedAt: '2026-08-13T14:00:00.000Z',
};
validateGovernResolution(secondAssignment, approved, actions, govern);

const revisedDecision = { ...AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION, caseId: revisedBinding.caseId, caseVersion: revisedBinding.caseVersion };
const revisedEvidence = evidence.map(({ submittedBy: _submittedBy, ...item }) => item);
const handoff = buildStudioHandoffPackage(
  revisedBinding, revisedDecision, revisedEvidence, attestations, approved, govern,
  { input: 'qa-input-hash', output: 'qa-output-hash' }, ['decision-v5'], '2026-08-13T15:00:00.000Z',
);
assert.equal(handoff.review.status, 'approved');
assert.equal(handoff.binding.caseVersion, 5);
assert.equal(handoff.binding.decisionId, 'decision-v5');
assert.equal(handoff.decision.caseId, revisedBinding.caseId);
assert.equal(handoff.decision.caseVersion, revisedBinding.caseVersion);
assert.deepEqual(handoff.evidence.map(item => item.id), revisedEvidence.map(item => item.id));
assert.deepEqual(handoff.attestations.map(item => item.evidenceId), revisedEvidence.map(item => item.id));
assert.equal(handoff.govern.actions.find(item => item.actionId === 'restricted-action')?.category, 'prohibited');
assert.equal(handoff.decision.validationStatus, 'reviewer-ready');
console.log('Requested-changes revision and handoff ancestry regression passed.');
