export interface AuthenticatedReviewerSelectionDiagnostic {
  schemaVersion: 'authenticated-reviewer-selection-diagnostic-v1';
  mode: 'reviewer_selection_diagnostic';
  source: { releaseSha: string; runId: string; attempt: string; sourceDigest: string };
  scope: { project: 'desktop-chromium'; persona: 'reviewer'; testId: 'E2E-004' };
  candidates: { count: 1; reviewerIncluded: true; ownerExcluded: true; approverExcluded: true; outsiderExcluded: true };
  actions: {
    assignment: { command: 'assessment_v2.review.assign'; status: 200; classification: 'COMMITTED' };
    replay: { command: 'assessment_v2.review.assign'; status: 200; classification: 'REPLAYED' };
    stale: { command: 'assessment_v2.review.resolve'; status: 409; classification: 'VERSION_CONFLICT' };
    bindings: {
      sameReviewerSession: true;
      assignmentReplayRequestEqual: true;
      assignmentReplayCommandEqual: true;
      assignmentReplayCommandIdEqual: true;
      assignmentReplayReceiptEqual: true;
      staleRequestDistinct: true;
      staleCommandDistinct: true;
    };
  };
  effects: { assignmentWrites: 1; receiptWrites: 1; auditWrites: 1; otherWrites: 0 };
  evidenceComposition: {
    kind: 'trusted-server-action-frame-carry-forward';
    carriedRecords: 4;
    rawFinalFrameAnchored: false;
  };
  providers: { enabled: false; providerCalls: 0; paidCalls: 0 };
  cleanup: { status: 'verified' };
  diagnosticCompleted: true;
  acceptancePromoted: false;
}
export const AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_SCHEMA: 'authenticated-reviewer-selection-diagnostic-v1';
export function validateAuthenticatedReviewerSelectionDiagnostic(document: unknown): AuthenticatedReviewerSelectionDiagnostic;
export function buildAuthenticatedReviewerSelectionDiagnostic(input: unknown): AuthenticatedReviewerSelectionDiagnostic;
