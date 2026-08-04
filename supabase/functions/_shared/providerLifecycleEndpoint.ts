import { isAllowedProviderEndpoint } from './enterpriseIntelligenceAi.ts';
import { handleOptions, jsonResponse } from './http.ts';
import {
  createProviderLifecycleDeps,
  executeProviderLifecycleCommand,
  ProviderLifecycleError,
  type ProviderLifecycleAuthority,
  type ProviderLifecycleDeps,
  type ProviderLifecycleOperation,
} from './providerLifecycle.ts';
import { buildEnterpriseProviderRouteDbDeps } from './providerResolverDb.ts';
import { getAuthUser, postgrest } from './supabase.ts';
import { resolveTenantAuthority } from './tenantAuthority.ts';
import { createTenantAuthorityDatabase } from './tenantAuthorityDb.ts';

type JsonObject = Record<string, unknown>;
const operations = new Set<ProviderLifecycleOperation>([
  'provider.register',
  'provider.secret.bind',
  'provider.validate',
  'provider.activate',
  'provider.route.toggle',
  'provider.secret.rotate',
  'provider.revoke',
]);
const secretOperations = new Set<ProviderLifecycleOperation>(['provider.secret.bind', 'provider.secret.rotate']);
const operationPayloadKeys: Record<ProviderLifecycleOperation, ReadonlySet<string>> = {
  'provider.register': new Set(['provider', 'displayName', 'endpoint', 'deployment', 'defaultModel', 'modelAllowlist', 'capabilities', 'budget']),
  'provider.secret.bind': new Set(['providerConfigId', 'providerKey', 'preProvisionedReference']),
  'provider.validate': new Set(['providerConfigId']),
  'provider.activate': new Set(['providerConfigId']),
  'provider.route.toggle': new Set(['providerConfigId', 'routeId', 'capability', 'enabled', 'allowedRoles']),
  'provider.secret.rotate': new Set(['providerConfigId', 'providerKey', 'preProvisionedReference']),
  'provider.revoke': new Set(['providerConfigId']),
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProviderLifecycleEnvelope = {
  operation: ProviderLifecycleOperation;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  payload: JsonObject;
};

const isRecord = (value: unknown): value is JsonObject => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const prohibitedKey = /^(api[_-]?key|secret(value)?|authorization|auth[_-]?header|bearer[_-]?token|raw[_-]?key)$/i;

const assertNoUnexpectedSecretFields = (value: unknown, allowProviderKey: boolean, root = true): void => {
  if (Array.isArray(value)) return value.forEach(item => assertNoUnexpectedSecretFields(item, false, false));
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (prohibitedKey.test(key) || (key === 'providerKey' && (!allowProviderKey || !root))) {
      throw new ProviderLifecycleError('INVALID_REQUEST');
    }
    assertNoUnexpectedSecretFields(child, false, false);
  }
};

export const parseProviderLifecycleEnvelope = (value: unknown): ProviderLifecycleEnvelope => {
  if (!isRecord(value) || !operations.has(value.operation as ProviderLifecycleOperation)) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  const operation = value.operation as ProviderLifecycleOperation;
  if (typeof value.organizationId !== 'string' || !uuid.test(value.organizationId)
    || typeof value.workspaceId !== 'string' || !uuid.test(value.workspaceId)
    || !Number.isSafeInteger(value.expectedAuthorizationVersion) || Number(value.expectedAuthorizationVersion) < 1
    || !isRecord(value.payload)) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  assertNoUnexpectedSecretFields(value.payload, secretOperations.has(operation));
  if (Object.keys(value.payload).some(key => !operationPayloadKeys[operation].has(key))) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  if (!secretOperations.has(operation) && 'preProvisionedReference' in value.payload) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  return {
    operation,
    organizationId: value.organizationId,
    workspaceId: value.workspaceId,
    expectedAuthorizationVersion: Number(value.expectedAuthorizationVersion),
    payload: value.payload,
  };
};

const authenticateProviderLifecycle = async (
  request: Request,
  envelope: ProviderLifecycleEnvelope,
): Promise<ProviderLifecycleAuthority> => {
  const user = await getAuthUser(request);
  const context = await resolveTenantAuthority(user.id, {
    organizationId: envelope.organizationId,
    workspaceId: envelope.workspaceId,
    expectedAuthorizationVersion: envelope.expectedAuthorizationVersion,
  }, createTenantAuthorityDatabase(request));
  const [orgMemberships, workspaceMemberships] = await Promise.all([
    postgrest<Array<{ role_id?: string | null }>>(
      `organization_members?select=role_id&org_id=eq.${encodeURIComponent(context.organizationId)}&user_id=eq.${encodeURIComponent(context.userId)}&status=eq.active&deleted_at=is.null`,
      { method: 'GET' },
    ),
    postgrest<Array<{ role_id?: string | null }>>(
      `workspace_memberships?select=role_id&org_id=eq.${encodeURIComponent(context.organizationId)}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&user_id=eq.${encodeURIComponent(context.userId)}&status=eq.active&deleted_at=is.null`,
      { method: 'GET' },
    ),
  ]);
  const roleIds = [...new Set([...orgMemberships, ...workspaceMemberships].map(row => row.role_id).filter((id): id is string => Boolean(id)))];
  if (!roleIds.length) throw new ProviderLifecycleError('TENANT_ACCESS_DENIED');
  const roles = await postgrest<Array<{ id: string; name?: string | null }>>(
    `roles?select=id,name&id=in.(${roleIds.map(encodeURIComponent).join(',')})&org_id=eq.${encodeURIComponent(context.organizationId)}&status=eq.active&deleted_at=is.null`,
    { method: 'GET' },
  );
  if (!roles.length) throw new ProviderLifecycleError('TENANT_ACCESS_DENIED');
  return {
    actorId: context.userId,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    authorizationVersion: context.authorizationVersion,
    capabilities: new Set(context.capabilities),
    roleNames: new Set(roles.map(role => String(role.name || '').trim().toLowerCase()).filter(Boolean)),
  };
};

const statusFor = (error: ProviderLifecycleError) => {
  if (error.code === 'TENANT_ACCESS_DENIED' || error.code === 'PERMISSION_DENIED') return 403;
  if (error.code === 'RESOURCE_NOT_FOUND') return 404;
  if (error.code === 'RESOURCE_CONFLICT' || error.code === 'PROVIDER_BLOCKED') return 409;
  if (error.code === 'PERSISTENCE_UNAVAILABLE' || error.code === 'SECRET_BACKEND_REQUIRED' || error.code === 'SECRET_UNAVAILABLE') return 503;
  if (error.code === 'VALIDATION_FAILED') return 422;
  return 400;
};

export const providerLifecycleErrorBody = (error: ProviderLifecycleError) => ({
  ok: false,
  error: {
    code: error.code,
    message: 'The provider lifecycle request could not be completed.',
  },
});

export const handleProviderLifecycleRequest = async (
  request: Request,
  overrides: {
    authenticate?: (request: Request, envelope: ProviderLifecycleEnvelope) => Promise<ProviderLifecycleAuthority>;
    deps?: ProviderLifecycleDeps;
  } = {},
) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') {
    const error = new ProviderLifecycleError('INVALID_REQUEST');
    return jsonResponse(providerLifecycleErrorBody(error), 405);
  }
  try {
    const envelope = parseProviderLifecycleEnvelope(await request.json());
    const authority = await (overrides.authenticate || authenticateProviderLifecycle)(request, envelope);
    const deps = overrides.deps || createProviderLifecycleDeps(
      buildEnterpriseProviderRouteDbDeps(isAllowedProviderEndpoint),
    );
    const result = await executeProviderLifecycleCommand(envelope.operation, authority, envelope.payload, deps);
    return jsonResponse({ ok: true, ...result }, 200);
  } catch (error) {
    const safeError = error instanceof ProviderLifecycleError
      ? error
      : new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
    return jsonResponse(providerLifecycleErrorBody(safeError), statusFor(safeError));
  }
};
