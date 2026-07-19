import { Assessment, TenantContextProjection } from '../types';
export type EnterpriseBoundaryCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHORITY_STALE'
  | 'RESOURCE_NOT_AVAILABLE'
  | 'PERMISSION_DENIED'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'FEATURE_DISABLED'
  | 'READ_ONLY'
  | 'COMMAND_UNAVAILABLE'
  | 'OFFLINE';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isEnterpriseObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const readEnterpriseErrorCode = (
  value: unknown,
  offline = false,
): EnterpriseBoundaryCode => {
  const code = isEnterpriseObject(value) && isEnterpriseObject(value.error)
    ? value.error.code
    : isEnterpriseObject(value)
      ? value.code
      : undefined;
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'AUTHORITY_STALE' ||
      code === 'RESOURCE_NOT_AVAILABLE' || code === 'PERMISSION_DENIED' ||
      code === 'VERSION_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT' ||
      code === 'FEATURE_DISABLED' || code === 'READ_ONLY') return code;
  return offline ? 'OFFLINE' : 'COMMAND_UNAVAILABLE';
};

export const parseTenantContextProjection = (value: unknown): TenantContextProjection | null => {
  if (!isEnterpriseObject(value) ||
      typeof value.userId !== 'string' || !uuid.test(value.userId) ||
      typeof value.organizationId !== 'string' || !uuid.test(value.organizationId) ||
      typeof value.organizationName !== 'string' || !value.organizationName.trim() ||
      typeof value.workspaceId !== 'string' || !uuid.test(value.workspaceId) ||
      typeof value.workspaceName !== 'string' || !value.workspaceName.trim() ||
      !Number.isSafeInteger(value.authorizationVersion) ||
      !Array.isArray(value.capabilities) ||
      value.capabilities.some(item => typeof item !== 'string')) return null;
  return {
    userId: value.userId,
    organizationId: value.organizationId,
    organizationName: value.organizationName.trim(),
    workspaceId: value.workspaceId,
    workspaceName: value.workspaceName.trim(),
    authorizationVersion: value.authorizationVersion as number,
    capabilities: [...new Set(value.capabilities as string[])].sort(),
  };
};

const COMMAND_STATUSES: Record<string, ReadonlySet<Assessment['status']>> = {
  'assessment.create': new Set(['Draft']),
  'assessment.response.upsert': new Set(['Draft']),
  'assessment.finalize': new Set(['Ready for Review']),
  'govern.resolve': new Set(['In Review', 'Approved', 'Changes Requested', 'Rejected']),
  'studio_handoff.create': new Set(['Handed Off to Docs']),
};

export type EnterpriseCommandResource = {
  assessmentId: string;
  version: number;
  status: Assessment['status'];
  scoreVersion?: string;
  handoffId?: string;
};

export const parseEnterpriseCommandResource = (
  value: unknown,
  commandType: string,
): EnterpriseCommandResource | null => {
  if (!isEnterpriseObject(value) ||
      typeof value.assessmentId !== 'string' || !uuid.test(value.assessmentId) ||
      !Number.isSafeInteger(value.version) || (value.version as number) < 1 ||
      typeof value.status !== 'string' ||
      !COMMAND_STATUSES[commandType]?.has(value.status as Assessment['status'])
  ) return null;
  if (commandType === 'studio_handoff.create' &&
      (typeof value.handoffId !== 'string' || !uuid.test(value.handoffId))) return null;
  if (value.scoreVersion !== undefined && typeof value.scoreVersion !== 'string') return null;
  return value as EnterpriseCommandResource;
};
