import type { TenantContextProjection } from '../types';
import { supabase } from './supabaseClient';
import { EnterpriseBoundaryError } from './enterpriseAssess';
import { isEnterpriseObject, readEnterpriseErrorCode } from './enterpriseAssessContract';
import { buildAssessV2ReviewEnvelope, type EvidenceAttestationOutcome, type ReviewResolution } from './assessV2ReviewClientContract';

export type ReviewLifecycle = 'reviewer_ready' | 'in_review' | 'approved' | 'changes_requested' | 'rejected';

export interface ReviewEvidenceProjection {
  id: string;
  claimIds: string[];
  sourceType: string;
  submitterLabel: string;
  capturedAt: string;
  expiresAt?: string;
  status: 'submitted' | EvidenceAttestationOutcome;
  rationale?: string;
}

export interface GovernActionProjection { id: string; label: string; category: 'allowed' | 'approval-bound' | 'evidence-bound' | 'prohibited' }
export interface GovernControlProjection { controlId: string; label?: string; status?: 'resolved' | 'conditionally-resolved' | 'unresolved'; condition?: string; owner?: string; dueDate?: string; conditionSatisfied?: boolean }

export interface AssessV2ReviewProjection {
  assignmentId: string;
  caseId: string;
  caseName: string;
  caseVersion: number;
  decisionId: string;
  decisionVersion: string;
  reviewSchemaVersion: string;
  reviewSequence: number;
  status: ReviewLifecycle;
  authorLabel: string;
  reviewerLabel: string;
  evidence: ReviewEvidenceProjection[];
  requiredClaimIds: string[];
  confidence: 'Verified' | 'Partially Evidenced' | 'Assumption-Led' | 'Insufficient Evidence';
  conditions: string[];
  actions: GovernActionProjection[];
  controls: GovernControlProjection[];
  governStatus: 'pending' | 'resolved';
  handoffStatus: 'not_ready' | 'ready' | 'committed';
  handedOffAt?: string;
}

export interface AssessV2ReviewQueueItem { assignmentId: string; caseId: string; caseName: string; status: ReviewLifecycle; dueAt?: string }
export interface EligibleAssessV2Reviewer { actorId: string; label: string; authorizationVersion: number }

export interface AssessV2ReviewTransport {
  invoke(body: Record<string, unknown>): Promise<unknown>;
  readQueue(context: TenantContextProjection): Promise<unknown>;
  readWorkspace(context: TenantContextProjection, caseId: string): Promise<unknown>;
  readEligibleReviewers(context: TenantContextProjection, caseId: string, decisionId: string): Promise<unknown>;
}

const networkCode = (payload: unknown) => readEnterpriseErrorCode(payload, typeof navigator !== 'undefined' && !navigator.onLine);
const defaultTransport: AssessV2ReviewTransport = {
  async invoke(body) {
    const { data, error } = await supabase.functions.invoke('assess-v2-command', { body });
    if (error) {
      let payload: unknown;
      try { payload = await (error as any).context?.clone?.().json(); } catch { payload = undefined; }
      throw new EnterpriseBoundaryError(networkCode(payload));
    }
    return data;
  },
  async readQueue(context) {
    const { data, error } = await supabase.rpc('assess_v2_review_queue', { p_org_id: context.organizationId, p_workspace_id: context.workspaceId });
    if (error) throw new EnterpriseBoundaryError(networkCode(error));
    return data;
  },
  async readWorkspace(context, caseId) {
    const { data, error } = await supabase.rpc('assess_v2_review_workspace', { p_org_id: context.organizationId, p_workspace_id: context.workspaceId, p_case_id: caseId });
    if (error) throw new EnterpriseBoundaryError(networkCode(error));
    return data;
  },
  async readEligibleReviewers(context, caseId, decisionId) {
    const { data, error } = await supabase.rpc('assess_v2_eligible_reviewers', { p_org_id: context.organizationId, p_workspace_id: context.workspaceId, p_case_id: caseId, p_decision_id: decisionId });
    if (error) throw new EnterpriseBoundaryError(networkCode(error));
    return data;
  },
};

const asString = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const parseQueueItem = (value: unknown): AssessV2ReviewQueueItem => {
  if (!isEnterpriseObject(value) || typeof value.assignmentId !== 'string' || typeof value.caseId !== 'string' || typeof value.caseName !== 'string' || typeof value.status !== 'string') throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return value as unknown as AssessV2ReviewQueueItem;
};
const parseProjection = (value: unknown): AssessV2ReviewProjection => {
  if (!isEnterpriseObject(value) || typeof value.caseId !== 'string' || typeof value.decisionId !== 'string' || !Number.isSafeInteger(value.caseVersion) || typeof value.reviewSchemaVersion !== 'string' || !Number.isSafeInteger(value.reviewSequence) || !Array.isArray(value.evidence) || !Array.isArray(value.actions) || !Array.isArray(value.controls)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return value as unknown as AssessV2ReviewProjection;
};
const parseEligibleReviewer = (value: unknown): EligibleAssessV2Reviewer => {
  if (!isEnterpriseObject(value) || typeof value.actorId !== 'string' || typeof value.label !== 'string' || !Number.isSafeInteger(value.authorizationVersion)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return value as unknown as EligibleAssessV2Reviewer;
};

const committedProjection = (value: unknown): AssessV2ReviewProjection => {
  if (!isEnterpriseObject(value) || value.ok !== true || (value.outcome !== 'committed' && value.outcome !== 'replayed') || !isEnterpriseObject(value.resource)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return parseProjection(value.resource);
};

export const readAssessV2ReviewQueue = async (context: TenantContextProjection, transport: AssessV2ReviewTransport = defaultTransport) => {
  const value = await transport.readQueue(context);
  if (!Array.isArray(value)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return value.map(parseQueueItem);
};
export const readAssessV2ReviewWorkspace = async (context: TenantContextProjection, caseId: string, transport: AssessV2ReviewTransport = defaultTransport) => parseProjection(await transport.readWorkspace(context, caseId));
export const readEligibleAssessV2Reviewers = async (context: TenantContextProjection, caseId: string, decisionId: string, transport: AssessV2ReviewTransport = defaultTransport) => {
  const value = await transport.readEligibleReviewers(context, caseId, decisionId);
  if (!Array.isArray(value)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return value.map(parseEligibleReviewer);
};

const execute = async (context: TenantContextProjection, commandType: string, projection: AssessV2ReviewProjection, payload: Record<string, unknown>, operation: string, transport: AssessV2ReviewTransport) => {
  const idempotencyKey = `${operation}:${projection.caseId}:${projection.decisionId}:${projection.reviewSequence}`;
  const envelope = buildAssessV2ReviewEnvelope(context, commandType, { caseId: projection.caseId, decisionId: projection.decisionId, reviewSequence: projection.reviewSequence, ...payload }, idempotencyKey, projection.caseVersion);
  return committedProjection(await transport.invoke(envelope));
};

export const attestAssessV2Evidence = (context: TenantContextProjection, projection: AssessV2ReviewProjection, evidenceId: string, claimIds: string[], outcome: EvidenceAttestationOutcome, rationale: string, transport: AssessV2ReviewTransport = defaultTransport) => execute(context, 'assessment_v2.evidence.attest', projection, { evidenceId, claimIds, outcome, rationale }, `attest:${evidenceId}:${outcome}`, transport);
export const assignAssessV2Review = (context: TenantContextProjection, projection: AssessV2ReviewProjection, reviewer: EligibleAssessV2Reviewer, transport: AssessV2ReviewTransport = defaultTransport) => execute(context, 'assessment_v2.review.assign', projection, { reviewerId: reviewer.actorId }, `assign:${reviewer.actorId}`, transport);
export const resolveAssessV2Review = (context: TenantContextProjection, projection: AssessV2ReviewProjection, resolution: ReviewResolution, rationale: string, conditions: string[], transport: AssessV2ReviewTransport = defaultTransport) => execute(context, 'assessment_v2.review.resolve', projection, { resolution, rationale, conditions }, `review:${resolution}`, transport);
export const startAssessV2Revision = (context: TenantContextProjection, projection: AssessV2ReviewProjection, rationale: string, transport: AssessV2ReviewTransport = defaultTransport) => execute(context, 'assessment_v2.revision.start', projection, { rationale }, 'revision', transport);
export const resolveAssessV2Govern = (context: TenantContextProjection, projection: AssessV2ReviewProjection, rationale: string, controlDispositions: GovernControlProjection[], transport: AssessV2ReviewTransport = defaultTransport) => execute(context, 'assessment_v2.govern.resolve', projection, { rationale, controlDispositions: controlDispositions.map(control => ({ controlId: control.controlId, status: control.status, condition: control.condition ?? '', owner: control.owner ?? '', dueDate: control.dueDate ?? '', conditionSatisfied: control.conditionSatisfied ?? false })) }, 'govern', transport);
export const handoffAssessV2Studio = (context: TenantContextProjection, projection: AssessV2ReviewProjection, transport: AssessV2ReviewTransport = defaultTransport) => execute(context, 'assessment_v2.studio.handoff', projection, {}, 'handoff', transport);

export const describeReviewError = (error: unknown, online: boolean): string => {
  if (!online) return 'Offline. Review changes were not submitted.';
  if (error instanceof EnterpriseBoundaryError) {
    const code = asString(error.code);
    if (code === 'READ_ONLY') return 'Read-only mode. Existing committed review records remain available, but new changes are blocked.';
    if (code === 'VERSION_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT') return 'Conflict detected. Reload the current review before continuing.';
    if (code === 'AUTHORITY_STALE' || code === 'PERMISSION_DENIED' || code === 'AUTHENTICATION_REQUIRED') return 'Reviewer access is stale or was revoked. Reload your workspace permissions.';
    if (code === 'RESOURCE_NOT_AVAILABLE') return 'This review is stale or no longer available.';
  }
  return 'Persistence failed. No review, approval, Govern, or Studio success was recorded.';
};
