import {
  type BuyerAcceptanceReviewFindingSeverity,
  type BuyerAcceptanceReviewFindingStatus,
  type BuyerAcceptanceReviewGateChecklistStatus,
  type BuyerAcceptanceReviewGateSnapshot,
  type BuyerAcceptanceReviewGateStatus,
  type BuyerAcceptanceReviewQuestion,
  type BuyerAcceptanceReviewerRole,
} from './buyerAcceptanceReviewGate';

export interface BuyerAcceptanceReviewQuestionRoleGroup {
  role: BuyerAcceptanceReviewerRole;
  label: string;
  questions: readonly BuyerAcceptanceReviewQuestion[];
}

const REVIEWER_ROLE_ORDER: readonly BuyerAcceptanceReviewerRole[] = [
  'buyer_executive',
  'security_reviewer',
  'delivery_owner',
  'ap_approver',
  'product_owner',
];

const reviewGateStatusLabels: Record<BuyerAcceptanceReviewGateStatus, string> = {
  evidence_required: 'Evidence Required',
  rehearsal_required: 'Rehearsal Required',
  blocked: 'Blocked',
  review_ready: 'Unexpected Review State',
};

const reviewerRoleLabels: Record<BuyerAcceptanceReviewerRole, string> = {
  buyer_executive: 'Buyer Executive',
  security_reviewer: 'Security Reviewer',
  delivery_owner: 'Delivery Owner',
  ap_approver: 'AP Approver',
  product_owner: 'Product Owner',
};

const findingSeverityLabels: Record<BuyerAcceptanceReviewFindingSeverity, string> = {
  medium: 'Medium',
  high: 'High',
  blocker: 'Blocker',
};

const findingStatusLabels: Record<BuyerAcceptanceReviewFindingStatus, string> = {
  rehearsal_required: 'Rehearsal Required',
  evidence_required: 'Evidence Required',
  blocked: 'Blocked',
};

const checklistStatusLabels: Record<BuyerAcceptanceReviewGateChecklistStatus, string> = {
  rehearsal_required: 'Rehearsal Required',
  evidence_required: 'Evidence Required',
  blocked: 'Blocked',
};

const unsupportedPositiveClaimPatterns: readonly RegExp[] = [
  /production ready/i,
  /hosted ready/i,
  /deployment ready/i,
  /RLS ready/i,
  /RLS active/i,
  /RLS verified/i,
  /tenant isolation verified/i,
  /security ready/i,
  /buyer ready/i,
  /product ready/i,
  /release-candidate ready/i,
  /compliance certified/i,
  new RegExp('Avala Govern' + ' Lite', 'i'),
  new RegExp('Avala Delivery' + ' Lite', 'i'),
];

export function getReviewGateStatusLabel(status: BuyerAcceptanceReviewGateStatus): string {
  return reviewGateStatusLabels[status];
}

export function getReviewerRoleLabel(role: BuyerAcceptanceReviewerRole): string {
  return reviewerRoleLabels[role];
}

export function getReviewFindingSeverityLabel(severity: BuyerAcceptanceReviewFindingSeverity): string {
  return findingSeverityLabels[severity];
}

export function getReviewFindingStatusLabel(status: BuyerAcceptanceReviewFindingStatus): string {
  return findingStatusLabels[status];
}

export function getReviewChecklistStatusLabel(status: BuyerAcceptanceReviewGateChecklistStatus): string {
  return checklistStatusLabels[status];
}

export function groupReviewGateQuestionsByRole(gate: BuyerAcceptanceReviewGateSnapshot): readonly BuyerAcceptanceReviewQuestionRoleGroup[] {
  return REVIEWER_ROLE_ORDER.map(role => ({
    role,
    label: getReviewerRoleLabel(role),
    questions: gate.reviewerQuestions.filter(question => question.role === role),
  }));
}

export function getReviewGateExportBlockers(gate: BuyerAcceptanceReviewGateSnapshot): readonly string[] {
  return [...gate.exportBlockers];
}

export function getReviewGateReadinessBlockers(gate: BuyerAcceptanceReviewGateSnapshot): readonly string[] {
  return [...gate.readinessBlockers];
}

export function getBlockingReviewFindings(gate: BuyerAcceptanceReviewGateSnapshot) {
  return gate.findings.filter(finding => finding.status === 'blocked' || finding.status === 'evidence_required');
}

export function getRequiredBeforeExportChecklist(gate: BuyerAcceptanceReviewGateSnapshot) {
  return gate.checklist.filter(item => item.requiredBeforeExport);
}

export function summarizeReviewGateStatus(gate: BuyerAcceptanceReviewGateSnapshot): string {
  return `${getReviewGateStatusLabel(gate.gateStatus)}. This is a read-only rehearsal gate; it is not an approval, not an export, not readiness evidence, not compliance evidence, and no PDF/download generated. Export/PDF/download remains blocked.`;
}

export function assertReviewGateNotReviewReady(gate: BuyerAcceptanceReviewGateSnapshot): void {
  if (gate.gateStatus === 'review_ready') {
    throw new Error('Review Gate must not be marked review-ready in the current baseline.');
  }
}

export function assertReviewGateHasExportBlockers(gate: BuyerAcceptanceReviewGateSnapshot): void {
  if (gate.exportBlockers.length === 0) {
    throw new Error('Review Gate must keep export/PDF/download blockers in the current baseline.');
  }
}

export function assertReviewGateHasReadinessBlockers(gate: BuyerAcceptanceReviewGateSnapshot): void {
  if (gate.readinessBlockers.length === 0) {
    throw new Error('Review Gate must keep readiness blockers in the current baseline.');
  }
}

export function assertReviewGateProofSafeCopy(gate: BuyerAcceptanceReviewGateSnapshot): void {
  assertReviewGateNotReviewReady(gate);
  assertReviewGateHasExportBlockers(gate);
  assertReviewGateHasReadinessBlockers(gate);

  const presentationCopy = [
    getReviewGateStatusLabel(gate.gateStatus),
    summarizeReviewGateStatus(gate),
    gate.summary,
    ...gate.exportBlockers,
    ...gate.readinessBlockers,
    ...gate.reviewerQuestions.flatMap(question => [
      question.expectedSafeAnswer,
      question.expectedEvidenceReference,
    ]),
    ...gate.findings.flatMap(finding => [
      finding.label,
      getReviewFindingSeverityLabel(finding.severity),
      getReviewFindingStatusLabel(finding.status),
      finding.rationale,
      finding.requiredAction,
    ]),
    ...gate.checklist.flatMap(item => [
      item.label,
      getReviewChecklistStatusLabel(item.status),
      item.rationale,
    ]),
    ...gate.prohibitedClaims.map(nonClaim => nonClaim.safeAlternative),
  ].join('\n');

  for (const pattern of unsupportedPositiveClaimPatterns) {
    if (pattern.test(presentationCopy)) {
      throw new Error(`Review Gate presentation copy contains unsupported claim wording: ${pattern}`);
    }
  }
}
