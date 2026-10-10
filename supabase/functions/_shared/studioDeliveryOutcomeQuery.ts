import {
  decodeStudioDeliveryOutcomeQuery,
  decodeStudioDeliveryOutcomeQueryResult,
  decodeStudioDeliveryPackQuery,
  decodeStudioDeliveryPackQueryResult,
  decodeStudioDeliveryAssigneeQuery,
  decodeStudioDeliveryAssigneeQueryResult,
  type StudioDeliveryAssigneeQueryRequest,
  type StudioDeliveryOutcomeQueryRequest,
  type StudioDeliveryPackQueryRequest,
} from '../../../services/productAcceptanceBridge/contracts.ts';
import type { TenantContext } from './tenantAuthority.ts';
import { readBoundedStudioDeliveryJson, studioDeliveryError, studioDeliveryResponse } from './studioDeliveryHttp.ts';

export type StudioDeliveryOutcomeQueryDependencies = {
  authenticate(): Promise<{ id: string }>;
  authority(actorId: string, organizationId: string, workspaceId: string, expectedAuthorizationVersion: number): Promise<TenantContext>;
  query(actorId: string, request: StudioDeliveryOutcomeQueryRequest): Promise<unknown>;
  packQuery(actorId: string, request: StudioDeliveryPackQueryRequest): Promise<unknown>;
  assigneeQuery(actorId: string, request: StudioDeliveryAssigneeQueryRequest): Promise<unknown>;
};
const canRead = (context: TenantContext) => ['delivery.outcomes.read', 'task.read', 'backlog.read', 'project.manage', 'org.admin', 'security.manage', 'roles.manage']
  .some(value => context.capabilities.includes(value));
const authorized = (context: TenantContext, actorId: string, query: StudioDeliveryOutcomeQueryRequest) => context.userId === actorId
  && context.organizationId === query.organizationId && context.workspaceId === query.workspaceId
  && context.authorizationVersion === query.expectedAuthorizationVersion && canRead(context);
const canReadPack = (context: TenantContext) => ['delivery.pack.snapshot', 'project.manage', 'org.admin', 'security.manage', 'roles.manage']
  .some(value => context.capabilities.includes(value));
const canReadAssignees = (context: TenantContext) => ['task.assign', 'project.manage', 'org.admin', 'security.manage', 'roles.manage']
  .some(value => context.capabilities.includes(value));
type ReadRequest = StudioDeliveryOutcomeQueryRequest | StudioDeliveryPackQueryRequest | StudioDeliveryAssigneeQueryRequest;
const exactScope = (context: TenantContext, actorId: string, query: ReadRequest) => context.userId === actorId
  && context.organizationId === query.organizationId && context.workspaceId === query.workspaceId
  && context.authorizationVersion === query.expectedAuthorizationVersion;

export const handleStudioDeliveryOutcomeQuery = async (request: Request, dependencies: StudioDeliveryOutcomeQueryDependencies): Promise<Response> => {
  if (request.method !== 'POST') return studioDeliveryError('RESOURCE_UNAVAILABLE', 404);
  let query: ReadRequest; let kind: 'outcome' | 'pack' | 'assignee' = 'outcome';
  try {
    const body = await readBoundedStudioDeliveryJson(request);
    try { query = decodeStudioDeliveryAssigneeQuery(body); kind = 'assignee'; }
    catch {
      try { query = decodeStudioDeliveryPackQuery(body); kind = 'pack'; }
      catch { query = decodeStudioDeliveryOutcomeQuery(body); }
    }
  }
  catch { return studioDeliveryError('INVALID_COMMAND', 400); }
  let actorId: string;
  try { actorId = (await dependencies.authenticate()).id; }
  catch { return studioDeliveryError('AUTHENTICATION_REQUIRED', 401); }
  let initial: TenantContext;
  try { initial = await dependencies.authority(actorId, query.organizationId, query.workspaceId, query.expectedAuthorizationVersion); }
  catch (error) { return error instanceof Error && error.message === 'AUTHORIZATION_STALE'
    ? studioDeliveryError('AUTHORIZATION_STALE', 409) : studioDeliveryError('RESOURCE_UNAVAILABLE', 404); }
  const permitted = kind === 'pack' ? canReadPack(initial) : kind === 'assignee' ? canReadAssignees(initial)
    : authorized(initial, actorId, query as StudioDeliveryOutcomeQueryRequest);
  if (!exactScope(initial, actorId, query) || !permitted) return studioDeliveryError('RESOURCE_UNAVAILABLE', 404);
  let raw: unknown;
  try { raw = kind === 'pack' ? await dependencies.packQuery(actorId, query as StudioDeliveryPackQueryRequest)
    : kind === 'assignee' ? await dependencies.assigneeQuery(actorId, query as StudioDeliveryAssigneeQueryRequest)
      : await dependencies.query(actorId, query as StudioDeliveryOutcomeQueryRequest); }
  catch { return studioDeliveryError('PERSISTENCE_UNAVAILABLE', 503); }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).ok === false) {
    const errorCode = (raw as Record<string, unknown>).errorCode;
    if (errorCode === 'AUTHORIZATION_STALE') return studioDeliveryError('AUTHORIZATION_STALE', 409);
    if (errorCode === 'NOT_FOUND') return studioDeliveryError('RESOURCE_UNAVAILABLE', 404);
    if (errorCode === 'INVALID_COMMAND') return studioDeliveryError('INVALID_COMMAND', 400);
    return studioDeliveryError('PERSISTENCE_UNAVAILABLE', 503);
  }
  let result;
  try { result = kind === 'pack' ? decodeStudioDeliveryPackQueryResult(raw, query as StudioDeliveryPackQueryRequest)
    : kind === 'assignee' ? decodeStudioDeliveryAssigneeQueryResult(raw, query as StudioDeliveryAssigneeQueryRequest)
      : decodeStudioDeliveryOutcomeQueryResult(raw, query as StudioDeliveryOutcomeQueryRequest); }
  catch { return studioDeliveryError('PERSISTENCE_UNAVAILABLE', 503); }
  let current: TenantContext;
  try { current = await dependencies.authority(actorId, query.organizationId, query.workspaceId, query.expectedAuthorizationVersion); }
  catch { return studioDeliveryError('RESOURCE_UNAVAILABLE', 404); }
  const stillPermitted = kind === 'pack' ? canReadPack(current) : kind === 'assignee' ? canReadAssignees(current)
    : authorized(current, actorId, query as StudioDeliveryOutcomeQueryRequest);
  if (!exactScope(current, actorId, query) || !stillPermitted) return studioDeliveryError('RESOURCE_UNAVAILABLE', 404);
  return studioDeliveryResponse(result);
};
