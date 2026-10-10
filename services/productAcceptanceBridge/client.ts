import { getRuntimeDataAccess, isSupabaseConfigured, supabase } from '../supabaseClient';
import {
  STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION,
  STUDIO_DELIVERY_ERROR_CODES,
  STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION,
  STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION,
  STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION,
  StudioDeliveryContractError,
  decodeStudioDeliveryCommand,
  decodeStudioDeliveryCommandSuccess,
  decodeStudioDeliveryOutcomeQuery,
  decodeStudioDeliveryOutcomeQueryResult,
  decodeStudioDeliveryPackQuery,
  decodeStudioDeliveryPackQueryResult,
  decodeStudioDeliveryAssigneeQuery,
  decodeStudioDeliveryAssigneeQueryResult,
  type StudioDeliveryAction,
  type StudioDeliveryCommandEnvelope,
  type StudioDeliveryCommandSuccess,
  type StudioDeliveryErrorCode,
  type StudioDeliveryOutcomeQueryRequest,
  type StudioDeliveryOutcomeQueryResult,
  type StudioDeliveryPackQueryRequest,
  type StudioDeliveryPackQueryResult,
  type StudioDeliveryAssigneeQueryRequest,
  type StudioDeliveryAssigneeQueryResult,
  type StudioDeliveryPayloadByAction,
} from './contracts';

export type StudioDeliveryScope = {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
};
export type StudioDeliveryCommandIdentity = { requestId?: string; idempotencyKey?: string };
export type StudioDeliveryOutcomeQueryInput = { projectId: string; limit?: number; cursor?: string | null };

export interface StudioDeliveryTransport {
  command(request: StudioDeliveryCommandEnvelope): Promise<unknown>;
  query(request: StudioDeliveryOutcomeQueryRequest): Promise<unknown>;
  packQuery?(request: StudioDeliveryPackQueryRequest): Promise<unknown>;
  assigneeQuery?(request: StudioDeliveryAssigneeQueryRequest): Promise<unknown>;
}

const messages: Record<StudioDeliveryErrorCode, string> = {
  INVALID_COMMAND: 'Request is invalid.', AUTHENTICATION_REQUIRED: 'Authentication is required.',
  RESOURCE_UNAVAILABLE: 'The requested resource is unavailable.', AUTHORIZATION_STALE: 'Authorization changed. Refresh before retrying.',
  IDEMPOTENCY_CONFLICT: 'The command identity was already used for a different request.', VERSION_CONFLICT: 'The source changed before the command could be committed.',
  FEATURE_DISABLED: 'Studio publication or Delivery outcome writes are disabled.', READ_ONLY: 'The boundary is read-only.',
  COMMAND_IN_PROGRESS: 'The command outcome is still being reconciled.', PERSISTENCE_UNAVAILABLE: 'The Studio-to-Delivery boundary is unavailable.',
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export class StudioDeliveryBoundaryError extends Error {
  constructor(public readonly code: StudioDeliveryErrorCode, public readonly pendingKey?: string) {
    super(messages[code]); this.name = 'StudioDeliveryBoundaryError';
  }
}

const requireActor = (scope: StudioDeliveryScope) => {
  if (!uuidPattern.test(scope.actorId)) throw new StudioDeliveryBoundaryError('INVALID_COMMAND');
  return scope.actorId.toLowerCase();
};
const requireBoundary = () => {
  if (getRuntimeDataAccess() !== 'server' || !isSupabaseConfigured()) throw new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
};
const safeJson = async (value: unknown): Promise<unknown> => {
  if (!object(value)) return undefined;
  try {
    const source = typeof value.clone === 'function' ? (value.clone as () => unknown)() : value;
    return object(source) && typeof source.json === 'function' ? await (source.json as () => Promise<unknown>)() : undefined;
  } catch { return undefined; }
};
const decodeInvocationError = async (error: unknown, response?: unknown) => {
  if (error instanceof StudioDeliveryBoundaryError) return error;
  if (object(error) && error.name === 'FunctionsHttpError') {
    const payload = await safeJson(response ?? error.context);
    const code = object(payload) && payload.ok === false && object(payload.error) && typeof payload.error.code === 'string'
      && STUDIO_DELIVERY_ERROR_CODES.includes(payload.error.code as StudioDeliveryErrorCode)
      ? payload.error.code as StudioDeliveryErrorCode : 'PERSISTENCE_UNAVAILABLE';
    return new StudioDeliveryBoundaryError(code);
  }
  return new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
};

export const studioDeliveryDefaultTransport: StudioDeliveryTransport = {
  async command(request) {
    requireBoundary();
    try {
      const result = await supabase.functions.invoke('studio-delivery-authority-command', { body: request });
      if (result.error) throw await decodeInvocationError(result.error, result.response);
      return result.data;
    } catch (error) { throw await decodeInvocationError(error); }
  },
  async query(request) {
    requireBoundary();
    try {
      const result = await supabase.functions.invoke('studio-delivery-outcome-query', { body: request });
      if (result.error) throw await decodeInvocationError(result.error, result.response);
      return result.data;
    } catch (error) { throw await decodeInvocationError(error); }
  },
  async packQuery(request) {
    requireBoundary();
    try {
      const result = await supabase.functions.invoke('studio-delivery-outcome-query', { body: request });
      if (result.error) throw await decodeInvocationError(result.error, result.response);
      return result.data;
    } catch (error) { throw await decodeInvocationError(error); }
  },
  async assigneeQuery(request) {
    requireBoundary();
    try {
      const result = await supabase.functions.invoke('studio-delivery-outcome-query', { body: request });
      if (result.error) throw await decodeInvocationError(result.error, result.response);
      return result.data;
    } catch (error) { throw await decodeInvocationError(error); }
  },
};

export const buildStudioDeliveryCommand = <A extends StudioDeliveryAction>(
  scope: StudioDeliveryScope,
  action: A,
  payload: StudioDeliveryPayloadByAction[A],
  identity: StudioDeliveryCommandIdentity = {},
): StudioDeliveryCommandEnvelope<A> => {
  requireActor(scope);
  const requestId = identity.requestId ?? crypto.randomUUID();
  return decodeStudioDeliveryCommand({
    schemaVersion: STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION, action,
    organizationId: scope.organizationId, workspaceId: scope.workspaceId,
    expectedAuthorizationVersion: scope.authorizationVersion, requestId,
    idempotencyKey: identity.idempotencyKey ?? `studio-delivery.${action}.${requestId}`, payload,
  }) as StudioDeliveryCommandEnvelope<A>;
};

export const buildStudioDeliveryOutcomeQuery = (
  scope: StudioDeliveryScope,
  input: StudioDeliveryOutcomeQueryInput,
): StudioDeliveryOutcomeQueryRequest => {
  requireActor(scope);
  return decodeStudioDeliveryOutcomeQuery({
    schemaVersion: STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION,
    organizationId: scope.organizationId, workspaceId: scope.workspaceId,
    expectedAuthorizationVersion: scope.authorizationVersion, projectId: input.projectId,
    limit: input.limit ?? 100, cursor: input.cursor ?? null,
  });
};

const pending = new Map<string, StudioDeliveryCommandEnvelope>();
const pendingKey = (scope: StudioDeliveryScope, command: StudioDeliveryCommandEnvelope) => `${requireActor(scope)}:${command.action}:${command.idempotencyKey}`;
const uncertain = new Set<StudioDeliveryErrorCode>(['PERSISTENCE_UNAVAILABLE', 'COMMAND_IN_PROGRESS', 'RESOURCE_UNAVAILABLE', 'AUTHORIZATION_STALE']);

export const executeStudioDeliveryCommand = async <A extends StudioDeliveryAction>(
  scope: StudioDeliveryScope,
  action: A,
  payload: StudioDeliveryPayloadByAction[A],
  identity: StudioDeliveryCommandIdentity = {},
  transport: StudioDeliveryTransport = studioDeliveryDefaultTransport,
): Promise<StudioDeliveryCommandSuccess<A>> => {
  const proposed = buildStudioDeliveryCommand(scope, action, payload, identity);
  const key = pendingKey(scope, proposed);
  const retained = pending.get(key);
  if (retained && JSON.stringify(retained) !== JSON.stringify(proposed)) throw new StudioDeliveryBoundaryError('COMMAND_IN_PROGRESS', key);
  const command = (retained ?? proposed) as StudioDeliveryCommandEnvelope<A>;
  if (!retained) pending.set(key, structuredClone(command));
  try {
    const result = decodeStudioDeliveryCommandSuccess(await transport.command(command), command);
    pending.delete(key);
    return result;
  } catch (error) {
    const boundary = error instanceof StudioDeliveryBoundaryError ? error
      : error instanceof StudioDeliveryContractError ? new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE', key)
        : new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE', key);
    if (!uncertain.has(boundary.code)) pending.delete(key);
    throw new StudioDeliveryBoundaryError(boundary.code, uncertain.has(boundary.code) ? key : undefined);
  }
};

export const retryStudioDeliveryCommand = async (
  scope: StudioDeliveryScope,
  key: string,
  transport: StudioDeliveryTransport = studioDeliveryDefaultTransport,
) => {
  if (!key.startsWith(`${requireActor(scope)}:`)) throw new StudioDeliveryBoundaryError('INVALID_COMMAND');
  const retained = pending.get(key);
  const organizationId = scope.organizationId.toLowerCase();
  const workspaceId = scope.workspaceId.toLowerCase();
  if (!retained || retained.organizationId !== organizationId || retained.workspaceId !== workspaceId) {
    throw new StudioDeliveryBoundaryError('INVALID_COMMAND');
  }
  const refreshed = decodeStudioDeliveryCommand({ ...retained, expectedAuthorizationVersion: scope.authorizationVersion });
  pending.set(key, structuredClone(refreshed));
  try {
    const result = decodeStudioDeliveryCommandSuccess(await transport.command(refreshed), refreshed);
    pending.delete(key);
    return result;
  } catch (error) {
    const boundary = error instanceof StudioDeliveryBoundaryError ? error : new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE', key);
    if (!uncertain.has(boundary.code)) pending.delete(key);
    throw new StudioDeliveryBoundaryError(boundary.code, uncertain.has(boundary.code) ? key : undefined);
  }
};

export const queryStudioDeliveryOutcomes = async (
  scope: StudioDeliveryScope,
  input: StudioDeliveryOutcomeQueryInput,
  transport: StudioDeliveryTransport = studioDeliveryDefaultTransport,
): Promise<StudioDeliveryOutcomeQueryResult> => {
  const request = buildStudioDeliveryOutcomeQuery(scope, input);
  try { return decodeStudioDeliveryOutcomeQueryResult(await transport.query(request), request); }
  catch (error) {
    if (error instanceof StudioDeliveryBoundaryError) throw error;
    throw new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
  }
};

export const queryLatestDeliveryPackSnapshot = async (
  scope: StudioDeliveryScope,
  projectId: string,
  transport: StudioDeliveryTransport = studioDeliveryDefaultTransport,
): Promise<StudioDeliveryPackQueryResult> => {
  requireActor(scope);
  const request = decodeStudioDeliveryPackQuery({
    schemaVersion: STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION,
    organizationId: scope.organizationId, workspaceId: scope.workspaceId,
    expectedAuthorizationVersion: scope.authorizationVersion, projectId,
  });
  try {
    const raw = transport.packQuery ? await transport.packQuery(request) : await transport.query(request as never);
    return decodeStudioDeliveryPackQueryResult(raw, request);
  } catch (error) {
    if (error instanceof StudioDeliveryBoundaryError) throw error;
    throw new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
  }
};

export const queryStudioDeliveryAssignees = async (
  scope: StudioDeliveryScope,
  projectId: string,
  transport: StudioDeliveryTransport = studioDeliveryDefaultTransport,
): Promise<StudioDeliveryAssigneeQueryResult> => {
  requireActor(scope);
  const request = decodeStudioDeliveryAssigneeQuery({
    schemaVersion: STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION,
    organizationId: scope.organizationId, workspaceId: scope.workspaceId,
    expectedAuthorizationVersion: scope.authorizationVersion, projectId,
  });
  try {
    const raw = transport.assigneeQuery ? await transport.assigneeQuery(request) : await transport.query(request as never);
    return decodeStudioDeliveryAssigneeQueryResult(raw, request);
  } catch (error) {
    if (error instanceof StudioDeliveryBoundaryError) throw error;
    throw new StudioDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
  }
};
