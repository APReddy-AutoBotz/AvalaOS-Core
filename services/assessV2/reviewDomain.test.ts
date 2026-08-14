import assert from 'node:assert/strict';
import { AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION, AP_INVOICE_EXCEPTION_V2_FIXTURE } from './index.ts';
import { ASSESS_V2_REVIEW_VERSION, EvidenceAttestation, GovernAction, GovernResolution, ReviewAssignment, ReviewBinding, ReviewResolution, buildStudioHandoffPackage, deriveReviewedConfidence, resolveReview, startRevision, validateAttestation, validateGovernResolution, validateReviewAssignment } from './reviewDomain.ts';

const binding: ReviewBinding = { organizationId: 'org-1', workspaceId: 'ws-1', caseId: 'case-1', caseVersion: 4, decisionId: 'decision-4', decisionVersion: 'decision-v4' };
const assignment: ReviewAssignment = { ...binding, id: 'assignment-1', reviewSchemaVersion: ASSESS_V2_REVIEW_VERSION, reviewSequence: 1, authorActorId: 'author', reviewerActorId: 'reviewer', reviewerAuthorizationVersion: 7, assignedBy: 'lead', assignedAt: '2026-07-20T10:00:00.000Z', requestId: 'request-a', receiptId: 'receipt-a', auditId: 'audit-a' };
const evidence = [
  { id: 'ev-1', claimIds: ['claim-1'], sourceType: 'system-record' as const, status: 'submitted' as const, validated: false as const, submittedBy: 'submitter', validUntil: '2027-01-01T00:00:00.000Z' },
  { id: 'ev-2', claimIds: ['claim-2'], sourceType: 'test' as const, status: 'submitted' as const, validated: false as const, submittedBy: 'submitter-2' },
];
const attestation = (evidenceId: string, claimId: string, outcome: EvidenceAttestation['outcome'] = 'accepted'): EvidenceAttestation => ({ ...binding, id: `att-${evidenceId}-${outcome}`, assignmentId: assignment.id, evidenceId, claimIds: [claimId], evidenceSubmitterActorId: evidence.find(item => item.id === evidenceId)!.submittedBy, reviewerActorId: 'reviewer', reviewerAuthorizationVersion: 7, outcome, rationale: 'Source and claim checked independently.', reviewedAt: '2026-07-20T11:00:00.000Z', requestId: `request-${evidenceId}`, receiptId: `receipt-${evidenceId}`, auditId: `audit-${evidenceId}` });
const claims = [{ claimId: 'claim-1', evidenceIds: ['ev-1'] }, { claimId: 'claim-2', evidenceIds: ['ev-2'] }];
const resolution = (status: ReviewResolution['status']): ReviewResolution => ({ ...binding, id: `resolution-${status}`, assignmentId: assignment.id, reviewSchemaVersion: ASSESS_V2_REVIEW_VERSION, reviewSequence: 1, status, reviewerActorId: 'reviewer', reviewerAuthorizationVersion: 7, rationale: 'Review checkpoints completed.', conditions: [], confidence: 'Insufficient Evidence', resolvedAt: '2026-07-20T12:00:00.000Z', requestId: 'request-resolution', receiptId: 'receipt-resolution', auditId: 'audit-resolution' });

const run = () => {
  const accepted = [attestation('ev-1', 'claim-1'), attestation('ev-2', 'claim-2')];
  accepted.forEach((item, index) => validateAttestation(assignment, evidence[index], item));
  assert.throws(() => validateReviewAssignment({ ...assignment, reviewerActorId: 'author' }), /cannot review or approve/);
  assert.equal(deriveReviewedConfidence(binding, claims, evidence, accepted, '2026-07-20T12:00:00.000Z'), 'Verified');
  assert.equal(deriveReviewedConfidence(binding, claims, evidence, accepted.slice(0, 1), '2026-07-20T12:00:00.000Z'), 'Partially Evidenced');
  assert.equal(deriveReviewedConfidence(binding, [], [], [], '2026-07-20T12:00:00.000Z'), 'Insufficient Evidence', 'zero material claims and zero evidence cannot become Verified');
  assert.equal(deriveReviewedConfidence(binding, [{ claimId: 'missing', evidenceIds: [] }], evidence, accepted, '2026-07-20T12:00:00.000Z'), 'Partially Evidenced', 'missing material-claim evidence blocks Verified');
  assert.equal(deriveReviewedConfidence(binding, [{ claimId: 'claim-1', evidenceIds: ['unrelated'] }], evidence, accepted, '2026-07-20T12:00:00.000Z'), 'Partially Evidenced', 'unrelated accepted evidence cannot satisfy a material claim');
  assert.throws(() => validateAttestation({ ...assignment, reviewerActorId: 'author' }, evidence[0], { ...accepted[0], reviewerActorId: 'author' }), /cannot review or approve/);
  assert.throws(() => validateAttestation({ ...assignment, reviewerActorId: 'submitter' }, evidence[0], { ...accepted[0], reviewerActorId: 'submitter' }), /Independent evidence review/);
  assert.throws(() => validateAttestation(assignment, evidence[0], { ...accepted[0], workspaceId: 'foreign' }), /not found/);
  assert.throws(() => validateAttestation(assignment, evidence[0], { ...accepted[0], claimIds: ['other'] }), /not found/);
  assert.throws(() => validateAttestation(assignment, evidence[0], { ...accepted[0], assignmentId: 'assignment-foreign' }), /not found/);
  assert.throws(() => validateAttestation(assignment, evidence[0], { ...accepted[0], reviewerActorId: 'reviewer-foreign' }), /Current reviewer authority/);
  assert.throws(() => validateAttestation(assignment, evidence[0], { ...accepted[0], reviewerAuthorizationVersion: assignment.reviewerAuthorizationVersion - 1 }), /Current reviewer authority/);
  assert.throws(() => validateAttestation(assignment, evidence[0], { ...accepted[0], reviewedAt: 'not-a-timestamp' }), /timestamp/);
  assert.equal(deriveReviewedConfidence(binding, claims, [{ ...evidence[0], validUntil: '2026-01-01T00:00:00.000Z' }, evidence[1]], accepted, '2026-07-20T12:00:00.000Z'), 'Partially Evidenced');
  assert.equal(deriveReviewedConfidence(binding, claims, [{ ...evidence[0], contradictory: true }, evidence[1]], accepted, '2026-07-20T12:00:00.000Z'), 'Partially Evidenced');
  assert.equal(deriveReviewedConfidence(binding, claims, evidence, [accepted[0], attestation('ev-2', 'claim-2', 'needs-more-information')], '2026-07-20T12:00:00.000Z'), 'Partially Evidenced');

  const earlyNeedsMore = { ...attestation('ev-1', 'claim-1', 'needs-more-information'), id: 'att-ev-1-needs-v1', reviewedAt: '2026-07-20T10:30:00.000Z' };
  const laterAccepted = { ...accepted[0], id: 'att-ev-1-accepted-v2', reviewedAt: '2026-07-20T11:30:00.000Z' };
  const acceptedHistory = [laterAccepted, earlyNeedsMore, accepted[1]];
  assert.equal(
    deriveReviewedConfidence(binding, claims, evidence, acceptedHistory, '2026-07-20T12:00:00.000Z'),
    'Verified',
    'latest reviewedAt wins even when immutable history arrives out of order',
  );
  const historyApproved = resolveReview(assignment, 'approved', claims, evidence, acceptedHistory, { ...resolution('approved'), id: 'resolution-history-approved' });
  assert.equal(historyApproved.confidence, 'Verified');

  const laterRejected = { ...accepted[0], id: 'att-ev-1-rejected-v3', outcome: 'rejected' as const, reviewedAt: '2026-07-20T11:45:00.000Z' };
  assert.equal(
    deriveReviewedConfidence(binding, claims, evidence, [accepted[0], laterRejected, accepted[1]], '2026-07-20T12:00:00.000Z'),
    'Partially Evidenced',
    'a later rejection supersedes earlier acceptance without deleting history',
  );
  assert.throws(
    () => resolveReview(assignment, 'approved', claims, evidence, [accepted[0], laterRejected, accepted[1]], resolution('approved')),
    /accepted independent attestation/,
  );
  const tiedRejected = { ...laterAccepted, id: 'att-ev-1-tied-rejected', outcome: 'rejected' as const };
  assert.equal(
    deriveReviewedConfidence(binding, claims, evidence, [laterAccepted, tiedRejected, accepted[1]], '2026-07-20T12:00:00.000Z'),
    'Partially Evidenced',
    'when reviewedAt ties, the later immutable input row is current',
  );

  assert.throws(() => resolveReview(assignment, 'approved', claims, evidence, [accepted[0], attestation('ev-2', 'claim-2', 'rejected')], resolution('approved')), /accepted independent attestation/);
  assert.throws(() => resolveReview(assignment, 'approved', claims, evidence, [accepted[0], { ...accepted[1], assignmentId: 'assignment-foreign' }], resolution('approved')), /current reviewer assignment/);
  assert.throws(() => resolveReview(assignment, 'approved', claims, evidence, [accepted[0], { ...accepted[1], id: accepted[0].id }], resolution('approved')), /unique current evidence records/);
  assert.throws(() => resolveReview(assignment, 'approved', claims, evidence, accepted, { ...resolution('approved'), reviewerAuthorizationVersion: assignment.reviewerAuthorizationVersion - 1 }), /Current reviewer authority/);
  const approved = resolveReview(assignment, 'approved', claims, evidence, accepted, resolution('approved'));
  assert.equal(approved.confidence, 'Verified');
  assert.throws(() => resolveReview({ ...assignment, reviewerActorId: 'author' }, 'approved', claims, evidence, accepted, { ...resolution('approved'), reviewerActorId: 'author' }), /cannot review or approve/);

  const changes = resolveReview(assignment, 'changes_requested', claims, evidence, [], resolution('changes_requested'));
  const revision = startRevision(binding, changes, 'author', '2026-07-20T13:00:00.000Z');
  assert.deepEqual(revision, { caseId: 'case-1', sourceCaseVersion: 4, version: 5, status: 'draft', supersedesDecisionId: 'decision-4', createdBy: 'author', createdAt: '2026-07-20T13:00:00.000Z' });
  assert.throws(() => startRevision(binding, approved, 'author', '2026-07-20T13:00:00.000Z'), /requested changes/);

  const deterministic: GovernAction[] = [
    { actionId: 'read', category: 'allowed', highImpact: false, financial: false, externalCommunication: false, irreversible: false },
    { actionId: 'pay', category: 'prohibited', highImpact: true, financial: true, externalCommunication: false, irreversible: true },
    { actionId: 'vendor-message', category: 'approval-bound', highImpact: true, financial: false, externalCommunication: true, irreversible: false },
  ];
  const govern: GovernResolution = { ...binding, id: 'govern-1', reviewResolutionId: approved.id, reviewSchemaVersion: approved.reviewSchemaVersion, reviewSequence: approved.reviewSequence, resolverActorId: 'governor', rationale: 'Preserved deterministic action boundaries.', actions: deterministic, requiredControls: [{ controlId: 'Human Approval', status: 'resolved' }], rollbackRequirements: ['compensate'], monitoringRequirements: ['audit'], reviewFrequency: 'quarterly', accountableOwner: 'finance-owner', resolvedAt: '2026-07-20T14:00:00.000Z' };
  validateGovernResolution(assignment, approved, deterministic, govern);
  assert.throws(() => validateGovernResolution(assignment, approved, deterministic, { ...govern, actions: deterministic.map(item => item.actionId === 'pay' ? { ...item, category: 'allowed' } : item) }), /cannot weaken/);
  assert.throws(() => validateGovernResolution(assignment, approved, deterministic, { ...govern, resolverActorId: 'reviewer' }), /additional independent actor/);
  assert.throws(() => validateGovernResolution(assignment, approved, deterministic, { ...govern, resolverActorId: 'author' }), /case author/);
  assert.throws(() => validateGovernResolution(assignment, approved, deterministic, { ...govern, requiredControls: [{ controlId: 'Human Approval', status: 'unresolved' }] }), /explicit satisfied disposition/);

  const currentDecision = structuredClone(AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION);
  const evidenceMap = new Map(AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence.map((item, index) => [item.id, evidence[index].id]));
  const bindDecisionEvidence = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(bindDecisionEvidence); return; }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'evidenceIds' && Array.isArray(child)) (value as Record<string, unknown>)[key] = child.map(id => evidenceMap.get(String(id)) ?? id);
      else bindDecisionEvidence(child);
    }
  };
  currentDecision.caseId = binding.caseId;
  currentDecision.caseVersion = binding.caseVersion;
  bindDecisionEvidence(currentDecision);
  const pkg = buildStudioHandoffPackage(binding, currentDecision, evidence, accepted, approved, govern, { input: 'hash-i', output: 'hash-o' }, ['decision-4'], '2026-07-20T15:00:00.000Z');
  assert.equal(pkg.review.status, 'approved');
  assert.equal(pkg.govern.actions.find(item => item.actionId === 'pay')?.category, 'prohibited');
  assert.equal(pkg.decision.validationStatus, 'reviewer-ready', 'handoff must preserve the immutable PR 1D decision');

  const historyPkg = buildStudioHandoffPackage(binding, currentDecision, evidence, acceptedHistory, historyApproved, { ...govern, reviewResolutionId: historyApproved.id }, { input: 'history-i', output: 'history-o' }, ['decision-4'], '2026-07-20T15:01:00.000Z');
  assert.equal(historyPkg.attestations.length, 3, 'Studio preserves immutable re-attestation history');
  assert.ok(historyPkg.attestations.some(item => item.outcome === 'needs-more-information'));
  assert.throws(
    () => buildStudioHandoffPackage(binding, currentDecision, evidence, [accepted[0], laterRejected, accepted[1]], approved, govern, {}, [], '2026-07-20T15:02:00.000Z'),
    /latest Studio attestation/,
  );

  assert.throws(() => buildStudioHandoffPackage(binding, AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION, evidence, accepted, approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /decision does not belong/);
  assert.throws(() => buildStudioHandoffPackage(binding, { ...AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION, caseId: binding.caseId, caseVersion: binding.caseVersion }, evidence, accepted, approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /references evidence outside/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence, accepted, approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /evidence/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, [evidence[0], evidence[0]], [accepted[0], { ...accepted[1], workspaceId: 'foreign' }], approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /unique current evidence/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, evidence, [accepted[0], accepted[0]], approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /Studio evidence/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, evidence, [accepted[0], { ...accepted[1], claimIds: ['wrong-claim'] }], approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /Studio evidence/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, evidence, [accepted[0], { ...accepted[1], caseVersion: binding.caseVersion - 1 }], approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /not found/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, evidence, [accepted[0], { ...accepted[1], assignmentId: 'assignment-foreign' }], approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /current approved reviewer assignment/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, evidence, [accepted[0], { ...accepted[1], reviewerActorId: 'reviewer-foreign' }], approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /current approved reviewer assignment/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, evidence, [accepted[0], { ...accepted[1], reviewerAuthorizationVersion: approved.reviewerAuthorizationVersion - 1 }], approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /current approved reviewer assignment/);
  assert.throws(() => buildStudioHandoffPackage(binding, currentDecision, evidence, accepted.slice(0, 1), approved, govern, {}, [], '2026-07-20T15:00:00.000Z'), /latest Studio attestation/);
  assert.throws(() => buildStudioHandoffPackage(binding, AP_INVOICE_EXCEPTION_V2_EXPECTED_DECISION, [], [], resolution('rejected'), govern, {}, [], '2026-07-20T15:00:00.000Z'), /requires current approval/);
  console.log('Assess V2 governed review domain tests passed.');
};

run();
