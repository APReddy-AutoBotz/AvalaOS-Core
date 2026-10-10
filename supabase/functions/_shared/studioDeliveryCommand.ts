import {
  decodeStudioDeliveryCommand,
  decodeStudioDeliveryCommandSuccess,
  type StudioDeliveryAction,
  type StudioDeliveryCommandEnvelope,
  type StudioDeliveryErrorCode,
} from '../../../services/productAcceptanceBridge/contracts.ts';
import type { TenantContext } from './tenantAuthority.ts';
import { readBoundedStudioDeliveryJson, studioDeliveryError, studioDeliveryResponse } from './studioDeliveryHttp.ts';

export type StudioDeliveryCommandDependencies = {
  authenticate(): Promise<{ id: string }>;
  authority(actorId: string, organizationId: string, workspaceId: string, expectedAuthorizationVersion: number): Promise<TenantContext>;
  apply(actorId: string, command: StudioDeliveryCommandEnvelope): Promise<unknown>;
};

const administrator = ['org.admin', 'security.manage', 'roles.manage'] as const;
const capabilities: Record<StudioDeliveryAction, readonly string[]> = {
  'studio.approved-artifact.publish': ['studio.artifacts.publish', 'project.manage', ...administrator],
  'delivery.outcome.record': ['delivery.outcomes.record', 'project.manage', ...administrator],
  'delivery.pack.snapshot': ['delivery.pack.snapshot', 'project.manage', ...administrator],
};
const authorized = (context: TenantContext, action: StudioDeliveryAction) => capabilities[action].some(value => context.capabilities.includes(value));
const sqlErrors: Record<string, { code: StudioDeliveryErrorCode; status: number }> = {
  FEATURE_DISABLED: { code: 'FEATURE_DISABLED', status: 503 }, NOT_FOUND: { code: 'RESOURCE_UNAVAILABLE', status: 404 },
  AUTHORIZATION_STALE: { code: 'AUTHORIZATION_STALE', status: 409 }, IDEMPOTENCY_CONFLICT: { code: 'IDEMPOTENCY_CONFLICT', status: 409 },
  VERSION_CONFLICT: { code: 'VERSION_CONFLICT', status: 409 }, INVALID_COMMAND: { code: 'INVALID_COMMAND', status: 400 },
  COMMAND_IN_PROGRESS: { code: 'COMMAND_IN_PROGRESS', status: 409 }, COMMAND_UNAVAILABLE: { code: 'PERSISTENCE_UNAVAILABLE', status: 503 },
};
const persistenceError = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== false || typeof row.errorCode !== 'string') return null;
  const mapped = sqlErrors[row.errorCode];
  return mapped ? studioDeliveryError(mapped.code, mapped.status) : studioDeliveryError('PERSISTENCE_UNAVAILABLE', 503);
};
const exactAuthority = (context: TenantContext, actorId: string, command: StudioDeliveryCommandEnvelope) => context.userId === actorId
  && context.organizationId === command.organizationId && context.workspaceId === command.workspaceId
  && context.authorizationVersion === command.expectedAuthorizationVersion && authorized(context, command.action);

export const handleStudioDeliveryCommand = async (request: Request, dependencies: StudioDeliveryCommandDependencies): Promise<Response> => {
  if (request.method !== 'POST') return studioDeliveryError('RESOURCE_UNAVAILABLE', 404);
  let command: StudioDeliveryCommandEnvelope;
  try { command = decodeStudioDeliveryCommand(await readBoundedStudioDeliveryJson(request)); }
  catch { return studioDeliveryError('INVALID_COMMAND', 400); }
  let actorId: string;
  try { actorId = (await dependencies.authenticate()).id; }
  catch { return studioDeliveryError('AUTHENTICATION_REQUIRED', 401); }
  let initial: TenantContext;
  try { initial = await dependencies.authority(actorId, command.organizationId, command.workspaceId, command.expectedAuthorizationVersion); }
  catch (error) { return error instanceof Error && error.message === 'AUTHORIZATION_STALE'
    ? studioDeliveryError('AUTHORIZATION_STALE', 409) : studioDeliveryError('RESOURCE_UNAVAILABLE', 404); }
  if (!exactAuthority(initial, actorId, command)) return studioDeliveryError('RESOURCE_UNAVAILABLE', 404);
  let raw: unknown;
  try { raw = await dependencies.apply(actorId, command); }
  catch { return studioDeliveryError('PERSISTENCE_UNAVAILABLE', 503); }
  const failure = persistenceError(raw);
  if (failure) return failure;
  let result;
  try { result = decodeStudioDeliveryCommandSuccess(raw, command); }
  catch { return studioDeliveryError('PERSISTENCE_UNAVAILABLE', 503); }
  let current: TenantContext;
  try { current = await dependencies.authority(actorId, command.organizationId, command.workspaceId, command.expectedAuthorizationVersion); }
  catch { return studioDeliveryError('RESOURCE_UNAVAILABLE', 404); }
  if (!exactAuthority(current, actorId, command)) return studioDeliveryError('RESOURCE_UNAVAILABLE', 404);
  return studioDeliveryResponse(result);
};
