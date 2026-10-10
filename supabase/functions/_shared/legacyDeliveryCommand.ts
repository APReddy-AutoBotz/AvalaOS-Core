import {
  decodeLegacyDeliveryCommand,
  decodeLegacyDeliveryCommandSuccess,
  type LegacyDeliveryAction,
  type LegacyDeliveryCommandEnvelope,
  type LegacyDeliveryErrorCode,
} from '../../../services/legacyDelivery/contracts.ts';
import type { TenantContext } from './tenantAuthority.ts';
import { legacyDeliveryError, legacyDeliveryResponse, readBoundedLegacyDeliveryJson } from './legacyDeliveryHttp.ts';

export type LegacyDeliveryCommandDependencies = {
  authenticate(): Promise<{ id: string }>;
  authority(actorId: string, organizationId: string, workspaceId: string, expectedAuthorizationVersion: number): Promise<TenantContext>;
  apply(actorId: string, command: LegacyDeliveryCommandEnvelope): Promise<unknown>;
};

const administratorCapabilities = ['org.admin', 'security.manage', 'roles.manage'] as const;
const capabilities: Record<LegacyDeliveryAction, readonly string[]> = {
  import: ['workitems.import', 'project.manage', ...administratorCapabilities],
  'task.create': ['task.create', 'backlog.manage', 'workitems.import', 'project.manage', ...administratorCapabilities],
  'task.update': ['task.update', 'task.update.own', 'project.manage', ...administratorCapabilities],
  'task.delete': ['task.delete', 'project.manage', ...administratorCapabilities],
};
const authorized = (context: TenantContext, action: LegacyDeliveryAction) => capabilities[action].some(capability => context.capabilities.includes(capability));

const sqlErrorMap: Record<string, { code: LegacyDeliveryErrorCode; status: number }> = {
  FEATURE_DISABLED: { code: 'FEATURE_DISABLED', status: 503 },
  NOT_FOUND: { code: 'RESOURCE_UNAVAILABLE', status: 404 },
  AUTHORIZATION_STALE: { code: 'AUTHORIZATION_STALE', status: 409 },
  IDEMPOTENCY_CONFLICT: { code: 'IDEMPOTENCY_CONFLICT', status: 409 },
  VERSION_CONFLICT: { code: 'VERSION_CONFLICT', status: 409 },
  INVALID_COMMAND: { code: 'INVALID_COMMAND', status: 400 },
  DUPLICATE_IMPORT: { code: 'VERSION_CONFLICT', status: 409 },
  SOURCE_CHANGED: { code: 'VERSION_CONFLICT', status: 409 },
  TRANSITION_DENIED: { code: 'VERSION_CONFLICT', status: 409 },
  DEPENDENCY_INCOMPLETE: { code: 'VERSION_CONFLICT', status: 409 },
  COMMAND_UNAVAILABLE: { code: 'PERSISTENCE_UNAVAILABLE', status: 503 },
};

const persistenceError = (value: unknown): Response | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== false || typeof row.errorCode !== 'string') return null;
  const mapped = sqlErrorMap[row.errorCode];
  return mapped ? legacyDeliveryError(mapped.code, mapped.status) : legacyDeliveryError('PERSISTENCE_UNAVAILABLE', 503);
};

const freshAuthority = async (
  dependencies: LegacyDeliveryCommandDependencies,
  actorId: string,
  command: LegacyDeliveryCommandEnvelope,
): Promise<TenantContext | null> => {
  try {
    const context = await dependencies.authority(actorId, command.organizationId, command.workspaceId, command.expectedAuthorizationVersion);
    return context.userId === actorId && context.organizationId === command.organizationId && context.workspaceId === command.workspaceId
      && context.authorizationVersion === command.expectedAuthorizationVersion && authorized(context, command.action)
      ? context
      : null;
  } catch { return null; }
};

export const handleLegacyDeliveryCommand = async (request: Request, dependencies: LegacyDeliveryCommandDependencies): Promise<Response> => {
  if (request.method !== 'POST') return legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  let command: LegacyDeliveryCommandEnvelope;
  try { command = decodeLegacyDeliveryCommand(await readBoundedLegacyDeliveryJson(request)); }
  catch { return legacyDeliveryError('INVALID_COMMAND', 400); }

  let actorId: string;
  try { actorId = (await dependencies.authenticate()).id; }
  catch { return legacyDeliveryError('AUTHENTICATION_REQUIRED', 401); }

  let initial: TenantContext;
  try {
    initial = await dependencies.authority(actorId, command.organizationId, command.workspaceId, command.expectedAuthorizationVersion);
  } catch (error) {
    return error instanceof Error && error.message === 'AUTHORIZATION_STALE'
      ? legacyDeliveryError('AUTHORIZATION_STALE', 409)
      : legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  }
  if (initial.userId !== actorId || initial.organizationId !== command.organizationId || initial.workspaceId !== command.workspaceId
    || initial.authorizationVersion !== command.expectedAuthorizationVersion || !authorized(initial, command.action)) {
    return legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  }

  let raw: unknown;
  try { raw = await dependencies.apply(actorId, command); }
  catch { return legacyDeliveryError('PERSISTENCE_UNAVAILABLE', 503); }
  const failed = persistenceError(raw);
  if (failed) return failed;

  let result;
  try { result = decodeLegacyDeliveryCommandSuccess(raw, command); }
  catch { return legacyDeliveryError('PERSISTENCE_UNAVAILABLE', 503); }
  if (command.action === 'task.create') {
    const resource = result.resource as { ownerId?: unknown };
    if (resource.ownerId !== actorId) return legacyDeliveryError('PERSISTENCE_UNAVAILABLE', 503);
  } else if (command.action === 'import') {
    const resource = result.resource as { items?: Array<{ ownerId?: unknown }> };
    if (!resource.items?.every(item => item.ownerId === actorId)) return legacyDeliveryError('PERSISTENCE_UNAVAILABLE', 503);
  }

  // A successful or replayed result remains confidential until current
  // authority is checked again after the service-role transaction.
  if (!await freshAuthority(dependencies, actorId, command)) return legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  return legacyDeliveryResponse(result);
};
