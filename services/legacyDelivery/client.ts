import { getRuntimeDataAccess, isSupabaseConfigured, supabase } from '../supabaseClient';
import {
  LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION,
  LEGACY_DELIVERY_ERROR_CODES,
  LEGACY_DELIVERY_QUERY_SCHEMA_VERSION,
  LegacyDeliveryContractError,
  decodeLegacyDeliveryCommand,
  decodeLegacyDeliveryCommandSuccess,
  decodeLegacyDeliveryQuery,
  decodeLegacyDeliveryQueryResult,
  legacyDeliveryCommandPendingKey,
  type LegacyDeliveryAction,
  type LegacyDeliveryCommandEnvelope,
  type LegacyDeliveryCommandSuccess,
  type LegacyDeliveryErrorCode,
  type LegacyDeliveryPayloadByAction,
  type LegacyDeliveryQueryRequest,
  type LegacyDeliveryQueryResult,
} from './contracts';

export type LegacyDeliveryScope = {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
};
export type LegacyDeliveryQueryInput = {
  projectId: string;
  limit?: number;
  cursor?: string | null;
  sourceGenerationId?: string | null;
  includeRetained?: boolean;
};
export type LegacyDeliveryCommandIdentity = { requestId?: string; idempotencyKey?: string };

export interface LegacyDeliveryTransport {
  query(request: LegacyDeliveryQueryRequest): Promise<unknown>;
  command(request: LegacyDeliveryCommandEnvelope): Promise<unknown>;
}

const messages: Record<LegacyDeliveryErrorCode, string> = {
  INVALID_COMMAND: 'Request is invalid.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  RESOURCE_UNAVAILABLE: 'The requested resource is unavailable.',
  AUTHORIZATION_STALE: 'Authorization changed. Refresh the workspace before retrying.',
  IDEMPOTENCY_CONFLICT: 'The command identity was already used for a different request.',
  VERSION_CONFLICT: 'The resource changed before the command could be committed.',
  FEATURE_DISABLED: 'Legacy Delivery mutations are disabled.',
  READ_ONLY: 'Legacy Delivery is read-only.',
  COMMAND_IN_PROGRESS: 'The command is still being reconciled.',
  PERSISTENCE_UNAVAILABLE: 'Legacy Delivery is unavailable.',
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizedActorId = (scope: LegacyDeliveryScope) => {
  if (!uuidPattern.test(scope.actorId)) throw new LegacyDeliveryBoundaryError('INVALID_COMMAND');
  return scope.actorId.toLowerCase();
};

export class LegacyDeliveryBoundaryError extends Error {
  constructor(
    public readonly code: LegacyDeliveryErrorCode,
    public readonly pendingKey?: string,
  ) {
    super(messages[code]);
    this.name = 'LegacyDeliveryBoundaryError';
  }
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeJson = async (value: unknown): Promise<unknown> => {
  if (!object(value)) return undefined;
  try {
    const source = typeof value.clone === 'function' ? (value.clone as () => unknown)() : value;
    return object(source) && typeof source.json === 'function' ? await (source.json as () => Promise<unknown>)() : undefined;
  } catch { return undefined; }
};
const decodeErrorPayload = (value: unknown): LegacyDeliveryErrorCode | null => {
  if (!object(value) || value.ok !== false || !object(value.error) || typeof value.error.code !== 'string') return null;
  return LEGACY_DELIVERY_ERROR_CODES.includes(value.error.code as LegacyDeliveryErrorCode)
    ? value.error.code as LegacyDeliveryErrorCode
    : null;
};
const decodeInvocationError = async (error: unknown, response?: unknown) => {
  if (error instanceof LegacyDeliveryBoundaryError) return error;
  if (object(error) && error.name === 'FunctionsHttpError') {
    const payload = await safeJson(response ?? error.context);
    const code = decodeErrorPayload(payload);
    return new LegacyDeliveryBoundaryError(code ?? 'PERSISTENCE_UNAVAILABLE');
  }
  return new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
};

const requireServerBoundary = () => {
  if (getRuntimeDataAccess() !== 'server' || !isSupabaseConfigured()) throw new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
};

export const legacyDeliveryDefaultTransport: LegacyDeliveryTransport = {
  async query(request) {
    requireServerBoundary();
    try {
      const result = await supabase.functions.invoke('legacy-delivery-query', { body: request });
      if (result.error) throw await decodeInvocationError(result.error, result.response);
      return result.data;
    } catch (error) { throw await decodeInvocationError(error); }
  },
  async command(request) {
    requireServerBoundary();
    try {
      const result = await supabase.functions.invoke('legacy-delivery-command', { body: request });
      if (result.error) throw await decodeInvocationError(result.error, result.response);
      return result.data;
    } catch (error) { throw await decodeInvocationError(error); }
  },
};

export const buildLegacyDeliveryQuery = (scope: LegacyDeliveryScope, input: LegacyDeliveryQueryInput): LegacyDeliveryQueryRequest =>
  (normalizedActorId(scope), decodeLegacyDeliveryQuery({
    schemaVersion: LEGACY_DELIVERY_QUERY_SCHEMA_VERSION,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    expectedAuthorizationVersion: scope.authorizationVersion,
    projectId: input.projectId,
    limit: input.limit ?? 100,
    cursor: input.cursor ?? null,
    sourceGenerationId: input.sourceGenerationId ?? null,
    includeRetained: input.includeRetained ?? true,
  }));

export const queryLegacyDelivery = async (
  scope: LegacyDeliveryScope,
  input: LegacyDeliveryQueryInput,
  transport: LegacyDeliveryTransport = legacyDeliveryDefaultTransport,
): Promise<LegacyDeliveryQueryResult> => {
  const request = buildLegacyDeliveryQuery(scope, input);
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return decodeLegacyDeliveryQueryResult(await transport.query(request), request); }
    catch (error) {
      last = error;
      const boundary = error instanceof LegacyDeliveryBoundaryError ? error : new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
      if (boundary.code !== 'PERSISTENCE_UNAVAILABLE' || attempt === 1) throw boundary;
    }
  }
  throw last instanceof LegacyDeliveryBoundaryError ? last : new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE');
};

export const buildLegacyDeliveryCommand = <A extends LegacyDeliveryAction>(
  scope: LegacyDeliveryScope,
  action: A,
  payload: LegacyDeliveryPayloadByAction[A],
  identity: LegacyDeliveryCommandIdentity = {},
): LegacyDeliveryCommandEnvelope<A> => {
  const requestId = identity.requestId ?? crypto.randomUUID();
  const idempotencyKey = identity.idempotencyKey ?? `legacy-delivery.${action}.${requestId}`;
  return decodeLegacyDeliveryCommand({
    schemaVersion: LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION,
    action,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    expectedAuthorizationVersion: scope.authorizationVersion,
    requestId,
    idempotencyKey,
    payload,
  }) as LegacyDeliveryCommandEnvelope<A>;
};

// Pending commands live only in the current browser process. They are never
// written to local/session storage and therefore cannot become authority.
const pendingCommands = new Map<string, LegacyDeliveryCommandEnvelope>();
const pendingKeyFor = (scope: LegacyDeliveryScope, command: LegacyDeliveryCommandEnvelope) =>
  `${normalizedActorId(scope)}:${legacyDeliveryCommandPendingKey(command)}`;
const assertScopeMatchesCommand = (scope: LegacyDeliveryScope, command: LegacyDeliveryCommandEnvelope) => {
  normalizedActorId(scope);
  if (scope.organizationId.toLowerCase() !== command.organizationId
    || scope.workspaceId.toLowerCase() !== command.workspaceId
    || scope.authorizationVersion !== command.expectedAuthorizationVersion) {
    throw new LegacyDeliveryBoundaryError('INVALID_COMMAND');
  }
};
const assertPendingScope = (scope: LegacyDeliveryScope, command: LegacyDeliveryCommandEnvelope) => {
  normalizedActorId(scope);
  if (scope.organizationId.toLowerCase() !== command.organizationId || scope.workspaceId.toLowerCase() !== command.workspaceId) {
    throw new LegacyDeliveryBoundaryError('INVALID_COMMAND');
  }
};
export const getPendingLegacyDeliveryCommand = (scope: LegacyDeliveryScope, pendingKey: string) => {
  if (!pendingKey.startsWith(`${normalizedActorId(scope)}:`)) return null;
  const command = pendingCommands.get(pendingKey);
  if (!command) return null;
  try { assertPendingScope(scope, command); }
  catch { return null; }
  return structuredClone(command);
};
export const getLegacyDeliveryPendingKey = (scope: LegacyDeliveryScope, command: LegacyDeliveryCommandEnvelope) => {
  assertScopeMatchesCommand(scope, command);
  return pendingKeyFor(scope, command);
};

const uncertain = new Set<LegacyDeliveryErrorCode>([
  'PERSISTENCE_UNAVAILABLE', 'COMMAND_IN_PROGRESS', 'RESOURCE_UNAVAILABLE', 'AUTHORIZATION_STALE',
]);
const immediatelyRetryable = new Set<LegacyDeliveryErrorCode>(['PERSISTENCE_UNAVAILABLE', 'COMMAND_IN_PROGRESS']);

export const executeLegacyDeliveryEnvelope = async <A extends LegacyDeliveryAction>(
  scope: LegacyDeliveryScope,
  proposed: LegacyDeliveryCommandEnvelope<A>,
  transport: LegacyDeliveryTransport = legacyDeliveryDefaultTransport,
): Promise<LegacyDeliveryCommandSuccess<A>> => {
  const validated = decodeLegacyDeliveryCommand(proposed) as LegacyDeliveryCommandEnvelope<A>;
  assertScopeMatchesCommand(scope, validated);
  const pendingKey = pendingKeyFor(scope, validated);
  const retained = pendingCommands.get(pendingKey) as LegacyDeliveryCommandEnvelope<A> | undefined;
  if (retained && JSON.stringify(retained) !== JSON.stringify(validated)) {
    throw new LegacyDeliveryBoundaryError('COMMAND_IN_PROGRESS', pendingKey);
  }
  const command = retained ?? structuredClone(validated);
  if (!retained) pendingCommands.set(pendingKey, structuredClone(command));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = decodeLegacyDeliveryCommandSuccess(await transport.command(command), command) as LegacyDeliveryCommandSuccess<A>;
      pendingCommands.delete(pendingKey);
      return result;
    } catch (error) {
      const boundary = error instanceof LegacyDeliveryBoundaryError
        ? error
        : error instanceof LegacyDeliveryContractError
          ? new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE', pendingKey)
          : new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE', pendingKey);
      if (!uncertain.has(boundary.code)) pendingCommands.delete(pendingKey);
      if (immediatelyRetryable.has(boundary.code) && attempt === 0) continue;
      throw new LegacyDeliveryBoundaryError(boundary.code, uncertain.has(boundary.code) ? pendingKey : undefined);
    }
  }
  throw new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE', pendingKey);
};

export const executeLegacyDeliveryCommand = async <A extends LegacyDeliveryAction>(
  scope: LegacyDeliveryScope,
  action: A,
  payload: LegacyDeliveryPayloadByAction[A],
  identity: LegacyDeliveryCommandIdentity = {},
  transport: LegacyDeliveryTransport = legacyDeliveryDefaultTransport,
) => executeLegacyDeliveryEnvelope(scope, buildLegacyDeliveryCommand(scope, action, payload, identity), transport);

export const retryPendingLegacyDeliveryCommand = async (
  scope: LegacyDeliveryScope,
  pendingKey: string,
  transport: LegacyDeliveryTransport = legacyDeliveryDefaultTransport,
) => {
  if (!pendingKey.startsWith(`${normalizedActorId(scope)}:`)) throw new LegacyDeliveryBoundaryError('INVALID_COMMAND');
  const command = pendingCommands.get(pendingKey);
  if (!command) throw new LegacyDeliveryBoundaryError('INVALID_COMMAND');
  assertPendingScope(scope, command);
  // Explicit reconciliation may refresh only the authorization fence. The
  // actor-scoped idempotency identity and user intent remain unchanged.
  const validated = decodeLegacyDeliveryCommand({
    ...command,
    expectedAuthorizationVersion: scope.authorizationVersion,
  });
  pendingCommands.set(pendingKey, structuredClone(validated));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = decodeLegacyDeliveryCommandSuccess(await transport.command(validated), validated);
      pendingCommands.delete(pendingKey);
      return result;
    } catch (error) {
      const boundary = error instanceof LegacyDeliveryBoundaryError
        ? error
        : new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE', pendingKey);
      if (!uncertain.has(boundary.code)) pendingCommands.delete(pendingKey);
      if (immediatelyRetryable.has(boundary.code) && attempt === 0) continue;
      throw new LegacyDeliveryBoundaryError(boundary.code, uncertain.has(boundary.code) ? pendingKey : undefined);
    }
  }
  throw new LegacyDeliveryBoundaryError('PERSISTENCE_UNAVAILABLE', pendingKey);
};
