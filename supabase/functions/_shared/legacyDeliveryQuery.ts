import { decodeLegacyDeliveryQuery, decodeLegacyDeliveryQueryResult, type LegacyDeliveryQueryRequest } from '../../../services/legacyDelivery/contracts.ts';
import type { TenantContext } from './tenantAuthority.ts';
import { legacyDeliveryError, legacyDeliveryResponse, readBoundedLegacyDeliveryJson } from './legacyDeliveryHttp.ts';

export type LegacyDeliveryQueryDependencies = {
  authenticate(): Promise<{ id: string }>;
  authority(actorId: string, organizationId: string, workspaceId: string, expectedAuthorizationVersion: number): Promise<TenantContext>;
  query(actorId: string, query: LegacyDeliveryQueryRequest): Promise<unknown>;
};

const canRead = (context: TenantContext) => [
  'task.read', 'backlog.read', 'project.manage', 'org.admin', 'security.manage', 'roles.manage',
].some(capability => context.capabilities.includes(capability));

const persistenceError = (value: unknown): Response | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== false || typeof row.errorCode !== 'string') return null;
  if (row.errorCode === 'AUTHORIZATION_STALE') return legacyDeliveryError('AUTHORIZATION_STALE', 409);
  if (row.errorCode === 'INVALID_COMMAND') return legacyDeliveryError('INVALID_COMMAND', 400);
  if (row.errorCode === 'FEATURE_DISABLED') return legacyDeliveryError('FEATURE_DISABLED', 503);
  if (row.errorCode === 'NOT_FOUND') return legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  return legacyDeliveryError('PERSISTENCE_UNAVAILABLE', 503);
};

const authorized = (context: TenantContext, actorId: string, query: LegacyDeliveryQueryRequest) => context.userId === actorId
  && context.organizationId === query.organizationId && context.workspaceId === query.workspaceId
  && context.authorizationVersion === query.expectedAuthorizationVersion && canRead(context);

export const handleLegacyDeliveryQuery = async (request: Request, dependencies: LegacyDeliveryQueryDependencies): Promise<Response> => {
  if (request.method !== 'POST') return legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  let query: LegacyDeliveryQueryRequest;
  try { query = decodeLegacyDeliveryQuery(await readBoundedLegacyDeliveryJson(request)); }
  catch { return legacyDeliveryError('INVALID_COMMAND', 400); }

  let actorId: string;
  try { actorId = (await dependencies.authenticate()).id; }
  catch { return legacyDeliveryError('AUTHENTICATION_REQUIRED', 401); }

  let initial: TenantContext;
  try { initial = await dependencies.authority(actorId, query.organizationId, query.workspaceId, query.expectedAuthorizationVersion); }
  catch (error) {
    return error instanceof Error && error.message === 'AUTHORIZATION_STALE'
      ? legacyDeliveryError('AUTHORIZATION_STALE', 409)
      : legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  }
  if (!authorized(initial, actorId, query)) return legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);

  let raw: unknown;
  try { raw = await dependencies.query(actorId, query); }
  catch { return legacyDeliveryError('PERSISTENCE_UNAVAILABLE', 503); }
  const failed = persistenceError(raw);
  if (failed) return failed;

  let result;
  try { result = decodeLegacyDeliveryQueryResult(raw, query); }
  catch { return legacyDeliveryError('PERSISTENCE_UNAVAILABLE', 503); }

  let current: TenantContext;
  try { current = await dependencies.authority(actorId, query.organizationId, query.workspaceId, query.expectedAuthorizationVersion); }
  catch { return legacyDeliveryError('RESOURCE_UNAVAILABLE', 404); }
  if (!authorized(current, actorId, query)) return legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  return legacyDeliveryResponse(result);
};
