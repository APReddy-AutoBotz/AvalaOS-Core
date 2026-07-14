import { Assessment, TenantContextProjection } from '../types';
import { getRuntimeDataAccess, supabase } from './supabaseClient';
import {
  EnterpriseCommandResource,
  type EnterpriseBoundaryCode,
  isEnterpriseObject,
  parseEnterpriseCommandResource,
  parseTenantContextProjection,
  readEnterpriseErrorCode,
} from './enterpriseAssessContract';

export type { EnterpriseBoundaryCode } from './enterpriseAssessContract';

export class EnterpriseBoundaryError extends Error {
  constructor(public readonly code: EnterpriseBoundaryCode) {
    super(code);
    this.name = 'EnterpriseBoundaryError';
  }
}


const invoke = async <T>(functionName: string, body: Record<string, unknown>): Promise<T> => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) {
      let payload: unknown;
      try { payload = await (error as any).context?.clone?.().json(); } catch { payload = undefined; }
      throw new EnterpriseBoundaryError(readEnterpriseErrorCode(payload, typeof navigator !== 'undefined' && !navigator.onLine));
    }
    if (!isEnterpriseObject(data)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    return data as T;
  } catch (error) {
    if (error instanceof EnterpriseBoundaryError) throw error;
    throw new EnterpriseBoundaryError(typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'COMMAND_UNAVAILABLE');
  }
};


export const loadEnterpriseSessionContexts = async (): Promise<TenantContextProjection[]> => {
  if (getRuntimeDataAccess() === 'local') return [];
  const result = await invoke<{ contexts?: unknown }>('tenant-session', {});
  if (!Array.isArray(result.contexts)) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return result.contexts.map(value => {
    const context = parseTenantContextProjection(value);
    if (!context) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    return context;
  });
};


const command = async (
  context: TenantContextProjection,
  commandType: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  expectedVersion?: number,
  requestId: string = crypto.randomUUID(),
): Promise<EnterpriseCommandResource> => {
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
  if (result.ok !== true) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  const resource = parseEnterpriseCommandResource(result.resource, commandType);
  if (!resource) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return resource;
};

export const persistEnterpriseAssessment = async (
  context: TenantContextProjection,
  assessment: Assessment,
): Promise<EnterpriseCommandResource> => {
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
