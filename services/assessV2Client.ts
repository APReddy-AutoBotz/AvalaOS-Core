import type { TenantContextProjection } from '../types';
import type { AssessmentCaseV2, ImmutableDecisionVersionV2 } from './assessV2/types';
import { supabase } from './supabaseClient';
import { EnterpriseBoundaryError } from './enterpriseAssess';
import { isEnterpriseObject, readEnterpriseErrorCode } from './enterpriseAssessContract';
import { buildAssessV2CommandEnvelope } from './assessV2ClientContract';

export type AssessV2CommandType =
  | 'assessment_v2.create'
  | 'assessment_v2.clone_from_v1'
  | 'assessment_v2.draft.upsert'
  | 'assessment_v2.finalize';

export interface AssessV2CommandResource {
  caseId: string;
  version: number;
  status: 'draft' | 'reviewer-ready' | 'superseded';
  decisionId?: string;
}

export interface AssessV2DraftInput {
  caseId: string;
  name: string;
  description: string;
  primitives: unknown[];
  edges: unknown[];
  decisionPoints: unknown[];
  exceptionPaths: unknown[];
  applicationAssets: unknown[];
  interactions: unknown[];
  evidenceLinks: unknown[];
  candidateEvaluations: unknown[];
  gateResults: unknown[];
  controlRequirements: unknown[];
  modernizationDispositions: unknown[];
}

export interface AssessV2ReadProjection {
  case: AssessmentCaseV2;
  name: string;
  description: string;
  decision: ImmutableDecisionVersionV2 | null;
}

export interface AssessV2Transport {
  invoke(body: Record<string, unknown>): Promise<unknown>;
  readCase(caseId: string): Promise<unknown>;
}

const parseResource = (value: unknown): AssessV2CommandResource => {
  if (!isEnterpriseObject(value) || typeof value.id !== 'string' ||
      !Number.isSafeInteger(value.version) || typeof value.status !== 'string') {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  if (!['draft', 'reviewer_ready', 'superseded'].includes(value.status as string)) {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  return {
    caseId: value.id as string,
    version: value.version as number,
    status: value.status === 'reviewer_ready' ? 'reviewer-ready' : value.status as 'draft' | 'superseded',
    decisionId: typeof value.decisionId === 'string' ? value.decisionId : undefined,
  };
};

const defaultTransport: AssessV2Transport = {
  async invoke(body) {
    const { data, error } = await supabase.functions.invoke('assess-v2-command', { body });
    if (error) {
      let payload: unknown;
      try { payload = await (error as any).context?.clone?.().json(); } catch { payload = undefined; }
      throw new EnterpriseBoundaryError(readEnterpriseErrorCode(payload, typeof navigator !== 'undefined' && !navigator.onLine));
    }
    return data;
  },
  async readCase(caseId) {
    const { data: decision, error: decisionError } = await supabase
      .from('assess_v2_decision_versions')
      .select('case_id,source_version_id,rule_set_version,decision_version,validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,supersedes_decision_id,created_by,created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (decisionError) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    if (!decision) return null;
    const { data: version, error: versionError } = await supabase
      .from('assess_v2_case_versions')
      .select('name,description')
      .eq('id', decision.source_version_id)
      .maybeSingle();
    if (versionError || !version) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    return {
      case_id: decision.case_id,
      name: version.name,
      description: version.description,
      case_snapshot: decision.input_snapshot,
      decision_snapshot: {
        caseId: decision.case_id,
        sourceCaseVersion: (decision.input_snapshot as AssessmentCaseV2).version,
        ruleSetVersion: decision.rule_set_version,
        decisionVersion: decision.decision_version,
        inputSnapshot: decision.input_snapshot,
        evidenceSnapshot: decision.evidence_snapshot,
        outputSnapshot: decision.output_snapshot,
        inputHash: decision.input_hash,
        evidenceHash: decision.evidence_hash,
        outputHash: decision.output_hash,
        supersedesDecisionId: decision.supersedes_decision_id ?? undefined,
        createdBy: decision.created_by,
        createdAt: decision.created_at,
        validationStatus: decision.validation_status,
      },
    };
  },
};

const command = async (
  transport: AssessV2Transport,
  context: TenantContextProjection,
  commandType: AssessV2CommandType,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  expectedVersion?: number,
) => {
  const body = buildAssessV2CommandEnvelope(context, commandType, payload, idempotencyKey, expectedVersion);
  const result = await transport.invoke(body);
  if (!isEnterpriseObject(result) || result.ok !== true) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return parseResource(result.resource);
};

export const createAssessV2Case = (
  context: TenantContextProjection,
  input: { caseId: string; processId: string; name: string; description: string },
  transport: AssessV2Transport = defaultTransport,
) => command(transport, context, 'assessment_v2.create', input, `assessment_v2.create:${input.caseId}`);

export const cloneAssessV1ToV2 = (
  context: TenantContextProjection,
  input: { caseId: string; sourceAssessmentId: string; name: string; description: string },
  transport: AssessV2Transport = defaultTransport,
) => command(transport, context, 'assessment_v2.clone_from_v1', input, `assessment_v2.clone_from_v1:${input.caseId}`);

export const saveAssessV2Draft = (
  context: TenantContextProjection,
  draft: AssessV2DraftInput,
  expectedVersion: number,
  transport: AssessV2Transport = defaultTransport,
) => command(transport, context, 'assessment_v2.draft.upsert', { ...draft }, `assessment_v2.draft.upsert:${draft.caseId}:${expectedVersion}`, expectedVersion);

export const finalizeAssessV2Case = (
  context: TenantContextProjection,
  caseId: string,
  expectedVersion: number,
  transport: AssessV2Transport = defaultTransport,
) => command(
  transport,
  context,
  'assessment_v2.finalize',
  { caseId },
  `assessment_v2.finalize:${caseId}:${expectedVersion}`,
  expectedVersion,
);

export const readAssessV2Case = async (
  caseId: string,
  transport: AssessV2Transport = defaultTransport,
): Promise<AssessV2ReadProjection | null> => {
  const value = await transport.readCase(caseId);
  if (value === null) return null;
  if (!isEnterpriseObject(value) || value.case_id !== caseId || typeof value.name !== 'string' ||
      typeof value.description !== 'string' || !isEnterpriseObject(value.case_snapshot)) {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  return {
    case: value.case_snapshot as unknown as AssessmentCaseV2,
    name: value.name,
    description: value.description,
    decision: isEnterpriseObject(value.decision_snapshot)
      ? value.decision_snapshot as unknown as ImmutableDecisionVersionV2
      : null,
  };
};
