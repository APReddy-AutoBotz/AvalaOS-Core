import type { DecisionPackV2 } from './types';

export type CurrentAssessmentState = 'loading' | 'unavailable' | 'none' | 'working-draft' | 'reviewer-ready';
export type CurrentReviewStatus = 'reviewer_ready' | 'in_review' | 'approved' | 'planning_approved' | 'changes_requested' | 'rejected';

export interface CurrentAssessmentReviewPresentation {
  scopeKey: string;
  caseId: string;
  decisionId: string;
  status: CurrentReviewStatus;
  governStatus: 'pending' | 'resolved';
  handoffStatus: 'not_ready' | 'ready' | 'committed';
}

export interface CurrentAssessmentPresentation {
  scopeKey: string;
  processId: string;
  caseId?: string;
  decisionId?: string;
  state: CurrentAssessmentState;
  statusLabel: string;
  operatingModel: string;
  summary: string;
  readiness: string;
  confidence: string;
  studioAction: string;
}

interface ScopeIdentity {
  userId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
}

export const createCurrentAssessmentScopeKey = (identity: ScopeIdentity | null | undefined, processId: string): string => identity
  ? `${identity.userId}:${identity.organizationId}:${identity.workspaceId}:${identity.authorizationVersion}:${processId}`
  : `no-tenant-context:${processId}`;

const studioActionForReview = (review?: CurrentAssessmentReviewPresentation): string => {
  if (!review) return 'Load committed review status before Studio handoff';
  if (review.handoffStatus === 'committed') return 'View committed Studio handoff status';
  if (review.status === 'changes_requested' || review.status === 'rejected') return 'Revise the current assessment before Studio handoff';
  if (review.status === 'planning_approved') return review.handoffStatus === 'ready'
    ? 'Create Studio handoff for documentation and planning'
    : 'Reload committed review state before Studio handoff';
  if (review.status !== 'approved') return 'Complete independent review before Studio handoff';
  if (review.governStatus !== 'resolved') return 'Resolve Govern controls before Studio handoff';
  return review.handoffStatus === 'ready'
    ? 'Create Studio handoff'
    : 'Reload committed review state before Studio handoff';
};

const summarizeComposition = (decision: DecisionPackV2): string => {
  const components = [...new Set(decision.composedOperatingModel.flatMap(item => item.components))];
  if (!components.length) return 'No eligible operating-model components';
  const shown = components.slice(0, 3);
  return components.length > shown.length ? `${shown.join(' + ')} + ${components.length - shown.length} more` : shown.join(' + ');
};

export const buildCurrentAssessmentPresentation = ({
  scopeKey,
  processId,
  state,
  caseId,
  decisionId,
  decision,
  review,
  reviewScopeKey,
}: {
  scopeKey: string;
  processId: string;
  state: CurrentAssessmentState;
  caseId?: string;
  decisionId?: string;
  decision?: DecisionPackV2;
  review?: CurrentAssessmentReviewPresentation;
  reviewScopeKey?: string;
}): CurrentAssessmentPresentation => {
  if (state === 'loading') return {
    scopeKey, processId, state, statusLabel: 'Loading current assessment', operatingModel: 'Loading current assessment',
    summary: 'Checking the current assessment for this process.', readiness: 'Loading', confidence: 'Loading',
    studioAction: 'Loading current assessment',
  };
  if (state === 'unavailable') return {
    scopeKey, processId, state, statusLabel: 'Current assessment unavailable', operatingModel: 'Current assessment unavailable',
    summary: 'The current assessment could not be read. Creation remains blocked to prevent a duplicate.', readiness: 'Unavailable',
    confidence: 'Unavailable', studioAction: 'Restore current assessment access before Studio handoff',
  };
  if (state === 'none') return {
    scopeKey, processId, state, statusLabel: 'No current assessment', operatingModel: 'Assessment not started',
    summary: 'Start the assessment and correct the source-backed facts before a recommendation is finalized.', readiness: 'Not assessed',
    confidence: 'Not assessed', studioAction: 'Start and finalize the current assessment first',
  };
  if (state === 'working-draft') return {
    scopeKey, processId, caseId, state, statusLabel: 'Working draft', operatingModel: 'Assessment in progress',
    summary: 'A working draft is being corrected. It is not a finalized, reviewed, or approved recommendation.', readiness: 'Not finalized',
    confidence: 'Review pending', studioAction: 'Finalize the working assessment before Studio handoff',
  };
  if (!decision) throw new Error('A reviewer-ready current assessment requires a decision projection.');
  const boundReview = review && review.scopeKey === reviewScopeKey && review.caseId === caseId && review.decisionId === decisionId ? review : undefined;
  const reviewStatusLabel = !boundReview
    ? 'Finalized · review status unavailable'
    : boundReview.status === 'planning_approved'
      ? (boundReview.handoffStatus === 'committed'
        ? 'Approved for documentation and planning · Studio handoff committed'
        : 'Approved for documentation and planning · questions remain')
      : boundReview.handoffStatus === 'committed'
        ? 'Studio handoff committed'
        : boundReview.status === 'approved'
        ? (boundReview.governStatus === 'resolved' ? 'Approved · Govern resolved' : 'Approved · Govern pending')
        : boundReview.status === 'in_review'
          ? 'Finalized · independent review in progress'
          : boundReview.status === 'changes_requested'
            ? 'Changes requested · revision required'
            : boundReview.status === 'rejected'
              ? 'Rejected · revision required'
              : 'Finalized · independent review not started';
  return {
    scopeKey,
    processId,
    caseId,
    decisionId,
    state,
    statusLabel: reviewStatusLabel,
    operatingModel: summarizeComposition(decision),
    summary: decision.executiveDecision,
    readiness: decision.processReadiness,
    confidence: decision.confidence,
    studioAction: studioActionForReview(boundReview),
  };
};
