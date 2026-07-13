import { Assessment, TenantContextProjection } from '../types';
import { getRuntimeDataAccess, supabase } from './supabaseClient';

export type EnterpriseBoundaryCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHORITY_STALE'
  | 'RESOURCE_NOT_AVAILABLE'
  | 'PERMISSION_DENIED'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'COMMAND_UNAVAILABLE'
  | 'OFFLINE';

export class EnterpriseBoundaryError extends Error {
  constructor(public readonly code: EnterpriseBoundaryCode) {
    super(code);
    this.name = 'EnterpriseBoundaryError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const errorCode = (value: unknown): EnterpriseBoundaryCode => {
  const code = isObject(value) && isObject(value.error) ? value.error.code : isObject(value) ? value.code : undefined;
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'AUTHORITY_STALE' ||
      code === 'RESOURCE_NOT_AVAILABLE' || code === 'PERMISSION_DENIED' ||
      code === 'VERSION_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT') return code;
  return typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'COMMAND_UNAVAILABLE';
};

const invoke = async <T>(functionName: string, body: Record<string, unknown>): Promise<T> => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) {
      let payload: unknown;
      try { payload = await (error as any).context?.clone?.().json(); } catch { payload = undefined; }
      throw new EnterpriseBoundaryError(errorCode(payload));
    }
    if (!isObject(data)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    return data as T;
  } catch (error) {
    if (error instanceof EnterpriseBoundaryError) throw error;
    throw new EnterpriseBoundaryError(typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'COMMAND_UNAVAILABLE');
  }
};

const tenantContext = (value: unknown): TenantContextProjection => {
  if (!isObject(value) ||
      typeof value.userId !== 'string' || !uuid.test(value.userId) ||
      typeof value.organizationId !== 'string' || !uuid.test(value.organizationId) ||
      typeof value.organizationName !== 'string' || !value.organizationName.trim() ||
      typeof value.workspaceId !== 'string' || !uuid.test(value.workspaceId) ||
      typeof value.workspaceName !== 'string' || !value.workspaceName.trim() ||
      !Number.isSafeInteger(value.authorizationVersion) ||
      !Array.isArray(value.capabilities) ||
      value.capabilities.some(item => typeof item !== 'string')) {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
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

export const loadEnterpriseSessionContexts = async (): Promise<TenantContextProjection[]> => {
  if (getRuntimeDataAccess() === 'local') return [];
  const result = await invoke<{ contexts?: unknown }>('tenant-session', {});
  if (!Array.isArray(result.contexts)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return result.contexts.map(tenantContext);
};

type CommandResource = {
  assessmentId: string;
  version: number;
  status: Assessment['status'];
  scoreVersion?: string;
  handoffId?: string;
};

const command = async (
  context: TenantContextProjection,
  commandType: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  expectedVersion?: number,
  requestId: string = crypto.randomUUID(),
): Promise<CommandResource> => {
  const result = await invoke<{ ok?: unknown; resource?: unknown }>('assess-command', {
    requestId,
    idempotencyKey,
    commandType,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    authorizationVersion: context.authorizationVersion,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
    payload,
  });
  if (result.ok !== true || !isObject(result.resource) ||
      typeof result.resource.assessmentId !== 'string' ||
      !Number.isSafeInteger(result.resource.version) ||
      typeof result.resource.status !== 'string') {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  return result.resource as CommandResource;
};

export const persistEnterpriseAssessment = async (
  context: TenantContextProjection,
  assessment: Assessment,
): Promise<CommandResource> => {
  let version = assessment.version;
  if (version === undefined) {
    const created = await command(
      context,
      'assessment.create',
      { processId: assessment.processId },
      `assessment.create:${assessment.id}`,
      undefined,
      assessment.id,
    );
    version = created.version;
  }
  return command(
    context,
    'assessment.response.upsert',
    {
      assessmentId: assessment.id,
      responses: assessment.responses,
      metadata: assessment.metadata,
      evidenceItems: assessment.evidenceItems,
      assumptions: assessment.assumptions,
    },
    `assessment.response.upsert:${assessment.id}:${version}`,
    version,
  );
};

export const finalizeEnterpriseAssessment = (
  context: TenantContextProjection,
  assessment: Assessment,
) => {
  if (assessment.version === undefined) throw new EnterpriseBoundaryError('VERSION_CONFLICT');
  return command(
    context,
    'assessment.finalize',
    { assessmentId: assessment.id },
    `assessment.finalize:${assessment.id}:${assessment.version}`,
    assessment.version,
  );
};

export const resolveEnterpriseGovern = (
  context: TenantContextProjection,
  assessment: Assessment,
  resolution: 'submit' | 'approve' | 'request_changes' | 'reject',
  reason?: string,
) => {
  if (assessment.version === undefined) throw new EnterpriseBoundaryError('VERSION_CONFLICT');
  return command(
    context,
    'govern.resolve',
    { assessmentId: assessment.id, resolution, reason: reason?.trim() || null },
    `govern.resolve:${assessment.id}:${assessment.version}:${resolution}`,
    assessment.version,
  );
};

export const createEnterpriseStudioHandoff = (
  context: TenantContextProjection,
  assessment: Assessment,
  reason?: string,
) => {
  if (assessment.version === undefined) throw new EnterpriseBoundaryError('VERSION_CONFLICT');
  return command(
    context,
    'studio_handoff.create',
    { assessmentId: assessment.id, reason: reason?.trim() || null },
    `studio_handoff.create:${assessment.id}:${assessment.version}`,
    assessment.version,
  );
};
