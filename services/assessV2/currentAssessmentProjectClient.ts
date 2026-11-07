import type { TenantContextProjection } from '../../types';
import { supabase } from '../supabaseClient';
import { EnterpriseBoundaryError } from '../enterpriseAssess';
import { readEnterpriseErrorCode, type EnterpriseBoundaryCode } from '../enterpriseAssessContract';

export type CurrentAssessmentProject = Readonly<{
  schemaVersion: 'current-assessment-delivery-project.v1';
  projectId: string;
  projectName: string;
  caseId: string;
  decisionId: string;
  outcome: 'created' | 'replayed' | 'advanced';
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rpcErrorCode = (error: unknown): EnterpriseBoundaryCode => {
  const detail = error && typeof error === 'object'
    ? [Reflect.get(error, 'message'), Reflect.get(error, 'details'), Reflect.get(error, 'hint')].join(' ').toUpperCase()
    : '';
  if (detail.includes('AUTHENTICATION_REQUIRED')) return 'AUTHENTICATION_REQUIRED';
  if (detail.includes('AUTHORIZATION_STALE') || detail.includes('AUTHORITY_STALE')) return 'AUTHORITY_STALE';
  if (detail.includes('NOT_FOUND') || detail.includes('NOT_AVAILABLE')) return 'RESOURCE_NOT_AVAILABLE';
  if (detail.includes('PERMISSION DENIED')) return 'PERMISSION_DENIED';
  return readEnterpriseErrorCode(error, typeof navigator !== 'undefined' && !navigator.onLine);
};

export const ensureCurrentAssessmentProject = async (
  context: TenantContextProjection,
  caseId: string,
  decisionId: string,
): Promise<CurrentAssessmentProject> => {
  const { data, error } = await supabase.rpc('assess_v2_current_delivery_project_ensure', {
    p_actor_id: context.userId,
    p_org_id: context.organizationId,
    p_workspace_id: context.workspaceId,
    p_authorization_version: context.authorizationVersion,
    p_case_id: caseId,
    p_decision_id: decisionId,
    p_request_id: crypto.randomUUID(),
  });
  if (error) throw new EnterpriseBoundaryError(rpcErrorCode(error));
  const value = data as Record<string, unknown> | null;
  if (!value || value.schemaVersion !== 'current-assessment-delivery-project.v1'
    || !uuid.test(String(value.projectId)) || value.caseId !== caseId || value.decisionId !== decisionId
    || !['created', 'replayed', 'advanced'].includes(String(value.outcome))
    || typeof value.projectName !== 'string' || !value.projectName.trim()) {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  return value as CurrentAssessmentProject;
};
