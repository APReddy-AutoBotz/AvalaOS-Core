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
import { fingerprintProviderSecret } from './providerSecretAdapter.ts';
import {
  claimEnterpriseReceipt,
  completeEnterpriseReceipt,
  EnterpriseReceiptError,
  failEnterpriseReceipt,
  hashReceiptValue,
  persistEnterpriseExecutionPlan,
  reloadEnterpriseReceipt,
  type EnterpriseReceiptRow,
} from './enterpriseReceipt.ts';
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
  requestId: string;
  idempotencyKey: string;
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
    || typeof value.requestId !== 'string' || !uuid.test(value.requestId)
    || typeof value.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,200}$/.test(value.idempotencyKey)
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
    requestId: value.requestId,
    idempotencyKey: value.idempotencyKey,
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
  const roles = await postgrest<Array<{ id: string; name?: string | null; scope: string; org_id?: string | null; workspace_id?: string | null }>>(
    `roles?select=id,name,scope,org_id,workspace_id&id=in.(${roleIds.map(encodeURIComponent).join(',')})&org_id=eq.${encodeURIComponent(context.organizationId)}&status=eq.active&deleted_at=is.null`,
    { method: 'GET' },
  );
  if (!roles.length) throw new ProviderLifecycleError('TENANT_ACCESS_DENIED');
  const organizationRole = roles.find(role => role.id === orgMemberships[0]?.role_id
    && role.scope === 'organization' && role.org_id === context.organizationId && !role.workspace_id);
  const workspaceRole = roles.find(role => role.id === workspaceMemberships[0]?.role_id
    && role.scope === 'workspace' && role.org_id === context.organizationId && role.workspace_id === context.workspaceId);
  if (!organizationRole && !workspaceRole) throw new ProviderLifecycleError('TENANT_ACCESS_DENIED');
  const capabilities = await postgrest<Array<{ role_id: string; capability_key: string }>>(
    `role_capabilities?select=role_id,capability_key&role_id=in.(${roles.map(role => encodeURIComponent(role.id)).join(',')})`,
    { method: 'GET' },
  );
  const eligibleRoles = await postgrest<Array<{ id: string; scope: string; org_id?: string | null; workspace_id?: string | null }>>(
    `roles?select=id,scope,org_id,workspace_id&org_id=eq.${encodeURIComponent(context.organizationId)}&status=eq.active&deleted_at=is.null&or=(and(scope.eq.workspace,workspace_id.eq.${encodeURIComponent(context.workspaceId)}),and(scope.eq.organization,workspace_id.is.null))`,
    { method: 'GET' },
  );
  const organizationEligibleIds = eligibleRoles.filter(role => role.scope === 'organization' && !role.workspace_id).map(role => role.id);
  const organizationAdminCapabilities = organizationEligibleIds.length
    ? await postgrest<Array<{ role_id: string }>>(
      `role_capabilities?select=role_id&capability_key=eq.org.admin&role_id=in.(${organizationEligibleIds.map(encodeURIComponent).join(',')})`,
      { method: 'GET' },
    )
    : [];
  const organizationAdminRoleIds = new Set(organizationAdminCapabilities.map(row => row.role_id));
  const eligibleRouteRoleIds = new Set(eligibleRoles.filter(role => (
    (role.scope === 'workspace' && role.workspace_id === context.workspaceId)
    || (role.scope === 'organization' && !role.workspace_id && organizationAdminRoleIds.has(role.id))
  )).map(role => role.id));
  return {
    actorId: context.userId,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    authorizationVersion: context.authorizationVersion,
    organizationCapabilities: new Set(capabilities.filter(row => row.role_id === organizationRole?.id).map(row => row.capability_key)),
    workspaceCapabilities: new Set(capabilities.filter(row => row.role_id === workspaceRole?.id).map(row => row.capability_key)),
    organizationRoleNames: new Set(organizationRole ? [String(organizationRole.name || '').trim().toLowerCase()].filter(Boolean) : []),
    workspaceRoleNames: new Set(workspaceRole ? [String(workspaceRole.name || '').trim().toLowerCase()].filter(Boolean) : []),
    organizationRoleIds: new Set(organizationRole ? [organizationRole.id] : []),
    workspaceRoleIds: new Set(workspaceRole ? [workspaceRole.id] : []),
    eligibleRouteRoleIds,
  };
};

export const providerLifecycleRequestHash = async (envelope: ProviderLifecycleEnvelope) => {
  const payload = { ...envelope.payload };
  if (typeof payload.providerKey === 'string') {
    payload.providerKeyFingerprint = await fingerprintProviderSecret(payload.providerKey);
    delete payload.providerKey;
  }
  if (typeof payload.preProvisionedReference === 'string') {
    payload.preProvisionedReferenceHash = await hashReceiptValue(payload.preProvisionedReference);
    delete payload.preProvisionedReference;
  }
  return hashReceiptValue({
    operation: envelope.operation,
    organizationId: envelope.organizationId,
    workspaceId: envelope.workspaceId,
    payload,
  });
};

const statusFor = (error: ProviderLifecycleError) => {
  if (error.code === 'TENANT_ACCESS_DENIED' || error.code === 'PERMISSION_DENIED') return 403;
  if (error.code === 'RESOURCE_NOT_FOUND') return 404;
  if (error.code === 'RESOURCE_CONFLICT' || error.code === 'PROVIDER_BLOCKED') return 409;
  if (error.code === 'IDEMPOTENCY_CONFLICT' || error.code === 'COMMAND_IN_PROGRESS') return 409;
  if (error.code === 'AUTHORIZATION_STALE') return 409;
  if (error.code === 'RECEIPT_FINALIZATION_FAILED') return 503;
  if (error.code === 'PERSISTENCE_UNAVAILABLE' || error.code === 'SECRET_BACKEND_REQUIRED' || error.code === 'SECRET_UNAVAILABLE') return 503;
  if (error.code === 'VALIDATION_FAILED') return 422;
  return 400;
};

export const providerLifecycleStatusForTerminalReceipt = (receipt: EnterpriseReceiptRow) => {
  const responseError = isRecord(receipt.response?.error) ? receipt.response.error.code : undefined;
  if (typeof responseError !== 'string') return 409;
  const known = new Set([
    'INVALID_REQUEST', 'TENANT_ACCESS_DENIED', 'PERMISSION_DENIED', 'RESOURCE_NOT_FOUND',
    'RESOURCE_CONFLICT', 'SECRET_BACKEND_REQUIRED', 'SECRET_UNAVAILABLE', 'VALIDATION_FAILED',
    'PROVIDER_BLOCKED', 'PERSISTENCE_UNAVAILABLE', 'AUTHORIZATION_STALE', 'IDEMPOTENCY_CONFLICT',
    'COMMAND_IN_PROGRESS', 'RECEIPT_FINALIZATION_FAILED',
  ]);
  return known.has(responseError)
    ? statusFor(new ProviderLifecycleError(responseError as ProviderLifecycleError['code']))
    : 409;
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
  let claimedReceipt: EnterpriseReceiptRow | null = null;
  let claimedAuthority: ProviderLifecycleAuthority | null = null;
  try {
    const envelope = parseProviderLifecycleEnvelope(await request.json());
    const authority = await (overrides.authenticate || authenticateProviderLifecycle)(request, envelope);
    const requestHash = await providerLifecycleRequestHash(envelope);
    const { receipt, ownsExecution } = await claimEnterpriseReceipt(authority, {
      commandType: envelope.operation,
      idempotencyKey: envelope.idempotencyKey,
      requestId: envelope.requestId,
      requestHash,
    });
    if (receipt.status === 'committed') return jsonResponse({ ok: true, replayed: true, ...(receipt.response || {}) }, 200);
    if (receipt.status === 'failed' || receipt.status === 'blocked') {
      return jsonResponse(
        { ...(receipt.response || providerLifecycleErrorBody(new ProviderLifecycleError('PROVIDER_BLOCKED'))), replayed: true },
        providerLifecycleStatusForTerminalReceipt(receipt),
      );
    }
    if (!ownsExecution) throw new ProviderLifecycleError('COMMAND_IN_PROGRESS');
    claimedReceipt = receipt;
    claimedAuthority = authority;
    const deps = overrides.deps || createProviderLifecycleDeps(
      buildEnterpriseProviderRouteDbDeps(isAllowedProviderEndpoint),
    );
    const execution = {
      receiptId: receipt.id,
      executionToken: receipt.execution_token,
      executionFence: receipt.execution_fence,
      plan: receipt.execution_plan || {},
      async persistPlan(plan: JsonObject) {
        const planned = await persistEnterpriseExecutionPlan(receipt, authority, plan);
        receipt.execution_plan = planned.execution_plan || {};
        return receipt.execution_plan;
      },
    };
    const result = await executeProviderLifecycleCommand(envelope.operation, authority, envelope.payload, deps, execution);
    const resourceId = typeof result.providerConfigId === 'string' ? result.providerConfigId : undefined;
    const completed = await completeEnterpriseReceipt(receipt, authority, result, resourceId);
    return jsonResponse({ ok: true, replayed: false, ...(completed.response || result) }, 200);
  } catch (error) {
    const safeError = error instanceof ProviderLifecycleError ? error
      : error instanceof EnterpriseReceiptError ? new ProviderLifecycleError(
        error.code === 'COMMAND_UNAVAILABLE' ? 'PERSISTENCE_UNAVAILABLE' : error.code,
      )
        : new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
    if (claimedReceipt && claimedAuthority) {
      try {
        const recovered = await reloadEnterpriseReceipt(claimedReceipt, claimedAuthority);
        if (recovered.status === 'committed') {
          return jsonResponse({ ok: true, replayed: true, ...(recovered.response || {}) }, 200);
        }
        if (recovered.status === 'failed' || recovered.status === 'blocked') {
          return jsonResponse(
            { ...(recovered.response || providerLifecycleErrorBody(safeError)), replayed: true },
            providerLifecycleStatusForTerminalReceipt(recovered),
          );
        }
      } catch {
        if (safeError.code === 'RECEIPT_FINALIZATION_FAILED') {
          return jsonResponse(providerLifecycleErrorBody(safeError), statusFor(safeError));
        }
      }
    }
    if (claimedReceipt && claimedAuthority
      && safeError.code !== 'RECEIPT_FINALIZATION_FAILED'
      && safeError.code !== 'AUTHORIZATION_STALE') {
      const externalEffectPlanned = claimedReceipt.execution_plan?.externalSecretWritten === true
        || (claimedReceipt.execution_plan?.secretOwnership === 'managed_write'
          && claimedReceipt.execution_plan?.secretPlanReceiptId === claimedReceipt.id
          && (claimedReceipt.execution_plan?.writeState === 'planned'
            || claimedReceipt.execution_plan?.writeState === 'written'));
      if (!(safeError.code === 'PERSISTENCE_UNAVAILABLE' && externalEffectPlanned)) {
        try {
          await failEnterpriseReceipt(
            claimedReceipt,
            claimedAuthority,
            providerLifecycleErrorBody(safeError),
            safeError.code === 'PERMISSION_DENIED' || safeError.code === 'TENANT_ACCESS_DENIED' || safeError.code === 'PROVIDER_BLOCKED',
          );
        } catch {
          const finalization = new ProviderLifecycleError('RECEIPT_FINALIZATION_FAILED');
          return jsonResponse(providerLifecycleErrorBody(finalization), statusFor(finalization));
        }
      }
    }
    return jsonResponse(providerLifecycleErrorBody(safeError), statusFor(safeError));
  }
};
