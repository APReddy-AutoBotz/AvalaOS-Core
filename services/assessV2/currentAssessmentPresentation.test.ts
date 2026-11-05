import assert from 'node:assert/strict';
import { buildCurrentAssessmentPresentation, createCurrentAssessmentScopeKey, type CurrentAssessmentReviewPresentation } from './currentAssessmentPresentation';
import { ASSESS_V2_DECISION_VERSION, ASSESS_V2_RULE_SET_VERSION, ASSESS_V2_SCHEMA_VERSION, type DecisionPackV2 } from './types';

const scopeKey = createCurrentAssessmentScopeKey({ userId: 'user-1', organizationId: 'org-1', workspaceId: 'workspace-1', authorizationVersion: 7 }, 'process-1');
assert.equal(scopeKey, 'user-1:org-1:workspace-1:7:process-1');

const decision: DecisionPackV2 = {
  schemaVersion: ASSESS_V2_SCHEMA_VERSION,
  ruleSetVersion: ASSESS_V2_RULE_SET_VERSION,
  decisionVersion: ASSESS_V2_DECISION_VERSION,
  caseId: 'case-1', caseVersion: 2, validationStatus: 'reviewer-ready',
  executiveDecision: 'Use rules and a supported API, with a human reviewing exceptions.',
  assessmentBoundary: 'Source-backed current process facts only.', confidence: 'Partially Evidenced', processReadiness: 'Provisional',
  candidateEvaluations: [], gateResults: [],
  composedOperatingModel: [
    { primitiveId: 'capture', components: ['Native API Integration', 'Deterministic Rules'] },
    { primitiveId: 'exception', components: ['Human Approval', 'Audit'] },
  ],
  interactionDecisions: [], modernization: [], controlRequirements: [], controls: [], evidenceGaps: [], assumptions: [],
  alternativesConsidered: [], openRemediationActions: [], whatWouldChangeDecision: [], trace: [], nonClaims: [],
};

const draft = buildCurrentAssessmentPresentation({ scopeKey, processId: 'process-1', state: 'working-draft', caseId: 'case-1' });
assert.equal(draft.operatingModel, 'Assessment in progress');
assert.equal(draft.readiness, 'Not finalized');
assert.match(draft.summary, /not a finalized, reviewed, or approved recommendation/);

const finalized = buildCurrentAssessmentPresentation({ scopeKey, processId: 'process-1', state: 'reviewer-ready', caseId: 'case-1', decisionId: 'decision-1', decision });
assert.equal(finalized.operatingModel, 'Native API Integration + Deterministic Rules + Human Approval + 1 more');
assert.equal(finalized.readiness, 'Provisional');
assert.equal(finalized.confidence, 'Partially Evidenced');
assert.equal(finalized.statusLabel, 'Finalized · review status unavailable');
assert.equal(finalized.studioAction, 'Load committed review status before Studio handoff');

const reviewScopeKey = `${scopeKey}:case-1`;
const review = (value: Partial<CurrentAssessmentReviewPresentation>): CurrentAssessmentReviewPresentation => ({
  scopeKey: reviewScopeKey, caseId: 'case-1', decisionId: 'decision-1', status: 'reviewer_ready',
  governStatus: 'pending', handoffStatus: 'not_ready', ...value,
});
const withReview = (value: Partial<CurrentAssessmentReviewPresentation>) => buildCurrentAssessmentPresentation({ scopeKey, processId: 'process-1', state: 'reviewer-ready', caseId: 'case-1', decisionId: 'decision-1', decision, reviewScopeKey, review: review(value) });
assert.equal(withReview({ status: 'reviewer_ready' }).statusLabel, 'Finalized · independent review not started');
assert.equal(withReview({ status: 'in_review' }).statusLabel, 'Finalized · independent review in progress');
assert.equal(withReview({ status: 'in_review' }).studioAction, 'Complete independent review before Studio handoff');
assert.equal(withReview({ status: 'changes_requested' }).statusLabel, 'Changes requested · revision required');
assert.equal(withReview({ status: 'rejected' }).statusLabel, 'Rejected · revision required');
assert.equal(withReview({ status: 'approved' }).studioAction, 'Resolve Govern controls before Studio handoff');
assert.equal(withReview({ status: 'approved', governStatus: 'resolved', handoffStatus: 'ready' }).studioAction, 'Create durable Studio handoff');
assert.equal(withReview({ status: 'planning_approved', handoffStatus: 'ready' }).statusLabel, 'Approved for documentation and planning · questions remain');
assert.equal(withReview({ status: 'planning_approved', handoffStatus: 'ready' }).studioAction, 'Create Studio handoff for documentation and planning');
assert.equal(withReview({ status: 'planning_approved', handoffStatus: 'committed' }).statusLabel, 'Approved for documentation and planning · Studio handoff committed');
assert.equal(withReview({ status: 'planning_approved', handoffStatus: 'committed' }).studioAction, 'View committed Studio handoff status');
const handedOff = withReview({ status: 'approved', governStatus: 'resolved', handoffStatus: 'committed' });
assert.equal(handedOff.statusLabel, 'Studio handoff committed');
assert.equal(handedOff.studioAction, 'View committed Studio handoff status');

const staleReview = review({ caseId: 'older-case' });
assert.equal(buildCurrentAssessmentPresentation({ scopeKey, processId: 'process-1', state: 'reviewer-ready', caseId: 'case-1', decisionId: 'decision-1', decision, reviewScopeKey, review: staleReview }).studioAction, 'Load committed review status before Studio handoff');
assert.equal(buildCurrentAssessmentPresentation({ scopeKey, processId: 'process-1', state: 'reviewer-ready', caseId: 'case-1', decisionId: 'decision-1', decision, reviewScopeKey: 'other-scope', review: review({ status: 'approved' }) }).statusLabel, 'Finalized · review status unavailable');

console.log('Current assessment presentation regression suite passed.');
