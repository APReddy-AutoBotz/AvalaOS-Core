import { isAllowedProviderEndpoint } from './enterpriseIntelligenceAi.ts';
import { handleOptions, jsonResponse } from './http.ts';
import {
  assertProviderLifecycleOperationAuthority,
  createProviderLifecycleDeps,
  executeProviderLifecycleCommand,
  ProviderLifecycleError,
  recoverProviderLifecycleManagedSecret,
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
  type EnterpriseReceiptScope,
} from './enterpriseReceipt.ts';
import { getAuthUser, postgrest, rpc, supabaseRpcErrorHasSignal } from './supabase.ts';
import { resolveTenantAuthority, TenantAuthorityError } from './tenantAuthority.ts';
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

export type ProviderLifecycleAuthorityRecheckEnvelope = {
  operation: ProviderLifecycleOperation;
  organizationId: string;
  workspaceId: string;
  providerConfigId?: string;
  routeId?: string;
};

export type ProviderLifecycleRecoveryEnvelope = {
  operation: 'provider.secret.bind' | 'provider.secret.rotate';
  organizationId: string;
  workspaceId: string;
  providerConfigId: string;
  requestId: string;
  idempotencyKey: string;
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

export const parseProviderLifecycleAuthorityRecheckEnvelope = (
  value: unknown,
): ProviderLifecycleAuthorityRecheckEnvelope => {
  if (!isRecord(value) || !operations.has(value.operation as ProviderLifecycleOperation)) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  const operation = value.operation as ProviderLifecycleOperation;
  const allowedKeys = operation === 'provider.register'
    ? new Set(['operation', 'organizationId', 'workspaceId'])
    : operation === 'provider.route.toggle'
      ? new Set(['operation', 'organizationId', 'workspaceId', 'providerConfigId', 'routeId'])
      : new Set(['operation', 'organizationId', 'workspaceId', 'providerConfigId']);
  if (Object.keys(value).some(key => !allowedKeys.has(key))
    || typeof value.organizationId !== 'string' || !uuid.test(value.organizationId)
    || typeof value.workspaceId !== 'string' || !uuid.test(value.workspaceId)
    || (operation !== 'provider.register'
      && (typeof value.providerConfigId !== 'string' || !uuid.test(value.providerConfigId)))
    || (operation === 'provider.route.toggle'
      && (typeof value.routeId !== 'string' || !uuid.test(value.routeId)))) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  return {
    operation,
    organizationId: value.organizationId,
    workspaceId: value.workspaceId,
    ...(operation === 'provider.register' ? {} : { providerConfigId: value.providerConfigId as string }),
    ...(operation === 'provider.route.toggle' ? { routeId: value.routeId as string } : {}),
  };
};

export const parseProviderLifecycleRecoveryEnvelope = (value: unknown): ProviderLifecycleRecoveryEnvelope => {
  const allowedKeys = new Set([
    'operation', 'organizationId', 'workspaceId', 'providerConfigId', 'requestId', 'idempotencyKey',
  ]);
  if (!isRecord(value)
    || (value.operation !== 'provider.secret.bind' && value.operation !== 'provider.secret.rotate')
    || Object.keys(value).some(key => !allowedKeys.has(key))
    || typeof value.organizationId !== 'string' || !uuid.test(value.organizationId)
    || typeof value.workspaceId !== 'string' || !uuid.test(value.workspaceId)
    || typeof value.providerConfigId !== 'string' || !uuid.test(value.providerConfigId)
    || typeof value.requestId !== 'string' || !uuid.test(value.requestId)
    || typeof value.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,200}$/.test(value.idempotencyKey)) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  return {
    operation: value.operation,
    organizationId: value.organizationId,
    workspaceId: value.workspaceId,
    providerConfigId: value.providerConfigId,
    requestId: value.requestId,
    idempotencyKey: value.idempotencyKey,
  };
};

export const authenticateProviderLifecycle = async (
  request: Request,
  envelope: Pick<ProviderLifecycleEnvelope, 'organizationId' | 'workspaceId'> & { expectedAuthorizationVersion?: number },
  enforceAttemptAuthorizationVersion = true,
): Promise<ProviderLifecycleAuthority> => {
  const user = await getAuthUser(request);
  const context = await resolveTenantAuthority(user.id, {
    organizationId: envelope.organizationId,
    workspaceId: envelope.workspaceId,
    expectedAuthorizationVersion: enforceAttemptAuthorizationVersion
      ? envelope.expectedAuthorizationVersion
      : undefined,
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

const reauthorizeProviderLifecycle = async (
  request: Request,
  envelope: ProviderLifecycleEnvelope,
  authenticate: (request: Request, envelope: ProviderLifecycleEnvelope) => Promise<ProviderLifecycleAuthority>,
) => {
  try {
    const current = authenticate === authenticateProviderLifecycle
      ? await authenticateProviderLifecycle(request, envelope, false)
      : await authenticate(request, envelope);
    assertProviderLifecycleOperationAuthority(envelope.operation, current);
    return current;
  } catch {
    throw new ProviderLifecycleError('PERMISSION_DENIED');
  }
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
  if (error.code === 'PERSISTENCE_UNAVAILABLE' || error.code ×]÷¶‰žËkºwµçI•½Ù•ÉåQ•Éµ¥¹…°€ô€¡É••¥ÁÐè¹Ñ•ÉÁÉ¥Í•I••¥ÁÑI½Ü¤€ôøì(€½¹ÍÐÉ•ÍÁ½¹Í•ÉÉ½È€ô¥ÍI•½É¡É••¥ÁÐ¹É•ÍÁ½¹Í”ü¹•ÉÉ½È¤€üÉ••¥ÁÐ¹É•ÍÁ½¹Í”ü¹•ÉÉ½È¹½‘”€èÕ¹‘•™¥¹•ì(€¥˜€¡É••¥ÁÐ¹ÍÑ…ÑÕÌ€„ôô€‰±½­•œñðÉ•ÍÁ½¹Í•ÉÉ½È€„ôô€AI5%MM%=9}9%œ(€€€ñðÉ••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ü¹±•…¹ÕÁ½µÁ±•Ñ•€„ôôÑÉÕ”¤ì(€€€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AIM%MQ9}U9Y%1	1œ¤ì(€ô)ôì()•áÁ½ÉÐ½¹ÍÐ¡…¹‘±•AÉ½Ù¥‘•É1¥™•å±•I•½Ù•ÉåI•ÅÕ•ÍÐ€ô…Íå¹Œ€ (€É•ÅÕ•ÍÐèI•ÅÕ•ÍÐ°(€½Ù•ÉÉ¥‘•Ìèì(€€€…ÕÑ¡•¹Ñ¥…Ñ•Ñ½Èüè€¡É•ÅÕ•ÍÐèI•ÅÕ•ÍÐ¤€ôøAÉ½µ¥Í”ñì¥èÍÑÉ¥¹œôøì(€€€±…¥µI•½Ù•ÉåI••¥ÁÐüèÑåÁ•½˜±…¥µAÉ½Ù¥‘•É1¥™•å±•I•½Ù•ÉåI••¥ÁÐì(€€€Á•ÉÍ¥ÍÑA±…¸üèÑåÁ•½˜Á•ÉÍ¥ÍÑ¹Ñ•ÉÁÉ¥Í•á•ÕÑ¥½¹A±…¸ì(€€€™…¥±I••¥ÁÐüèÑåÁ•½˜™…¥±¹Ñ•ÉÁÉ¥Í•I••¥ÁÐì(€€€‘•ÁÌüèAÉ½Ù¥‘•É1¥™•å±••ÁÌì(€ô€ôíô°(¤€ôøì(€½¹ÍÐ½ÁÑ¥½¹Ì€ô¡…¹‘±•=ÁÑ¥½¹Ì¡É•ÅÕ•ÍÐ¤ì(€¥˜€¡½ÁÑ¥½¹Ì¤É•ÑÕÉ¸½ÁÑ¥½¹Ìì(€¥˜€¡É•ÅÕ•ÍÐ¹µ•Ñ¡½€„ôô€A=MPœ¤ì(€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤¤°€ÐÀÔ¤ì(€ô(€±•Ð•¹Ù•±½Á”èAÉ½Ù¥‘•É1¥™•å±•I•½Ù•Éå¹Ù•±½Á”ì(€ÑÉäì(€€€•¹Ù•±½Á”€ôÁ…ÉÍ•AÉ½Ù¥‘•É1¥™•å±•I•½Ù•Éå¹Ù•±½Á”¡…Ý…¥ÐÉ•ÅÕ•ÍÐ¹©Í½¸ ¤¤ì(€ô…Ñ ì(€€€½¹ÍÐ¥¹Ù…±¥€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤ì(€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡¥¹Ù…±¥¤°ÍÑ…ÑÕÍ½È¡¥¹Ù…±¥¤¤ì(€ô(€ÑÉäì(€€€½¹ÍÐ…Ñ½È€ô…Ý…¥Ð€¡½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ•Ñ½Èñð•ÑÕÑ¡UÍ•È¤¡É•ÅÕ•ÍÐ¤ì(€€€½¹ÍÐÍ½Á”è¹Ñ•ÉÁÉ¥Í•I••¥ÁÑM½Á”€ôì(€€€€€…Ñ½É%è…Ñ½È¹¥°(€€€€€½É…¹¥é…Ñ¥½¹%è•¹Ù•±½Á”¹½É…¹¥é…Ñ¥½¹%°(€€€€€Ý½É­ÍÁ…•%è•¹Ù•±½Á”¹Ý½É­ÍÁ…•%°(€€€ôì(€€€½¹ÍÐìÉ••¥ÁÐ°½Ý¹Íá•ÕÑ¥½¸ô€ô…Ý…¥Ð€ (€€€€€½Ù•ÉÉ¥‘•Ì¹±…¥µI•½Ù•ÉåI••¥ÁÐñð±…¥µAÉ½Ù¥‘•É1¥™•å±•I•½Ù•ÉåI••¥ÁÐ(€€€€¤¡Í½Á”°•¹Ù•±½Á”¤ì(€€€¥˜€¡É••¥ÁÐ¹ÍÑ…ÑÕÌ€ôôô€‰±½­•œ¤ì(€€€€€…ÍÍ•ÉÑAÉ½Ù¥‘•ÉI•½Ù•ÉåQ•Éµ¥¹…°¡É••¥ÁÐ¤ì(€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ì½¬èÑÉÕ”°Ñ•Éµ¥¹…°èÑÉÕ”ô°€ÈÀÀ¤ì(€€€ô(€€€¥˜€ …½Ý¹Íá•ÕÑ¥½¸¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È =559}%9}AI=IMLœ¤ì((€€€½¹ÍÐ‘•ÁÌ€ô½Ù•ÉÉ¥‘•Ì¹‘•ÁÌñðÉ•…Ñ•AÉ½Ù¥‘•É1¥™•å±••ÁÌ (€€€€€‰Õ¥±‘¹Ñ•ÉÁÉ¥Í•AÉ½Ù¥‘•ÉI½ÕÑ•‰•ÁÌ¡¥Í±±½Ý•‘AÉ½Ù¥‘•É¹‘Á½¥¹Ð¤°(€€€€¤ì(€€€½¹ÍÐÁ•ÉÍ¥ÍÑA±…¸€ô½Ù•ÉÉ¥‘•Ì¹Á•ÉÍ¥ÍÑA±…¸ñðÁ•ÉÍ¥ÍÑ¹Ñ•ÉÁÉ¥Í•á•ÕÑ¥½¹A±…¸ì(€€€½¹ÍÐ•á•ÕÑ¥½¸€ôì(€€€€€É••¥ÁÑ%èÉ••¥ÁÐ¹¥°(€€€€€•á•ÕÑ¥½¹Q½­•¸èÉ••¥ÁÐ¹•á•ÕÑ¥½¹}Ñ½­•¸°(€€€€€•á•ÕÑ¥½¹•¹”èÉ••¥ÁÐ¹•á•ÕÑ¥½¹}™•¹”°(€€€€€Á±…¸èÉ••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ñðíô°(€€€€€…Íå¹ŒÁ•ÉÍ¥ÍÑA±…¸¡Á±…¸è)Í½¹=‰©•Ð¤ì(€€€€€€€½¹ÍÐÁ±…¹¹•€ô…Ý…¥ÐÁ•ÉÍ¥ÍÑA±…¸¡É••¥ÁÐ°Í½Á”°Á±…¸¤ì(€€€€€€€É••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸€ôÁ±…¹¹•¹•á•ÕÑ¥½¹}Á±…¸ñðíôì(€€€€€€€É•ÑÕÉ¸É••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ì(€€€€€ô°(€€€ôì(€€€…Ý…¥ÐÉ•½Ù•ÉAÉ½Ù¥‘•É1¥™•å±•5…¹…•‘M•É•Ð¡‘•ÁÌ°Í½Á”°•á•ÕÑ¥½¸¤ì(€€€½¹ÍÐ‘•¹¥•€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI5%MM%=9}9%œ¤ì(€€€½¹ÍÐÑ•Éµ¥¹…°€ô…Ý…¥Ð€¡½Ù•ÉÉ¥‘•Ì¹™…¥±I••¥ÁÐñð™…¥±¹Ñ•ÉÁÉ¥Í•I••¥ÁÐ¤ (€€€€€É••¥ÁÐ°(€€€€€Í½Á”°(€€€€€ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡‘•¹¥•¤°(€€€€€ÑÉÕ”°(€€€€€…Íå¹Œ€ ¤€ôøÍ½Á”°(€€€€¤ì(€€€…ÍÍ•ÉÑAÉ½Ù¥‘•ÉI•½Ù•ÉåQ•Éµ¥¹…°¡Ñ•Éµ¥¹…°¤ì(€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ì½¬èÑÉÕ”°Ñ•Éµ¥¹…°èÑÉÕ”ô°€ÈÀÀ¤ì(€ô…Ñ €¡•ÉÉ½È¤ì(€€€½¹ÍÐÍ…™•ÉÉ½È€ô•ÉÉ½È¥¹ÍÑ…¹•½˜AÉ½Ù¥‘•É1¥™•å±•ÉÉ½È(€€€€€€ü•ÉÉ½È(€€€€€€è•ÉÉ½È¥¹ÍÑ…¹•½˜¹Ñ•ÉÁÉ¥Í•I••¥ÁÑÉÉ½È€˜˜•ÉÉ½È¹½‘”€ôôô€=559}%9}AI=IMLœ(€€€€€€€€ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È =559}%9}AI=IMLœ¤(€€€€€€€€è¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AIM%MQ9}U9Y%1	1œ¤ì(€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡Í…™•ÉÉ½È¤°ÍÑ…ÑÕÍ½È¡Í…™•ÉÉ½È¤¤ì(€ô)ôì()•áÁ½ÉÐ½¹ÍÐÁÉ½Ù¥‘•É1¥™•å±•MÑ…ÑÕÍ½ÉQ•Éµ¥¹…±I••¥ÁÐ€ô€¡É••¥ÁÐè¹Ñ•ÉÁÉ¥Í•I••¥ÁÑI½Ü¤€ôøì(€½¹ÍÐÉ•ÍÁ½¹Í•ÉÉ½È€ô¥ÍI•½É¡É••¥ÁÐ¹É•ÍÁ½¹Í”ü¹•ÉÉ½È¤€üÉ••¥ÁÐ¹É•ÍÁ½¹Í”¹•ÉÉ½È¹½‘”€èÕ¹‘•™¥¹•ì4(€¥˜€¡ÑåÁ•½˜É•ÍÁ½¹Í•ÉÉ½È€„ôô€ÍÑÉ¥¹œœ¤É•ÑÕÉ¸€ÐÀäì4(€½¹ÍÐ­¹½Ý¸€ô¹•ÜM•Ð¡l4(€€€€%9Y1%}IEUMPœ°€Q99Q}MM}9%œ°€AI5%MM%=9}9%œ°€IM=UI}9=Q}=U9œ°4(€€€€IM=UI}=91%Pœ°€MIQ}	-9}IEU%Iœ°€MIQ}U9Y%1	1œ°€Y1%Q%=9}%1œ°4(€€€€AI=Y%I}	1=-œ°€AIM%MQ9}U9Y%1	1œ°€UQ!=I%iQ%=9}MQ1œ°€%5A=Q9e}=91%Pœ°4(€€€€=559}%9}AI=IMLœ°€I%AQ}%91%iQ%=9}%1œ°4(€t¤ì4(€É•ÑÕÉ¸­¹½Ý¸¹¡…Ì¡É•ÍÁ½¹Í•ÉÉ½È¤4(€€€€üÍÑ…ÑÕÍ½È¡¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È¡É•ÍÁ½¹Í•ÉÉ½È…ÌAÉ½Ù¥‘•É1¥™•å±•ÉÉ½Él½‘”t¤¤4(€€€€è€ÐÀäì4)ôì4(4)•áÁ½ÉÐ½¹ÍÐÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä€ô€¡•ÉÉ½ÈèAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È¤€ôø€¡ì(€½¬è™…±Í”°4(€•ÉÉ½Èèì4(€€€½‘”è•ÉÉ½È¹½‘”°4(€€€µ•ÍÍ…”è€Q¡”ÁÉ½Ù¥‘•È±¥™•å±”É•ÅÕ•ÍÐ½Õ±¹½Ð‰”½µÁ±•Ñ•¸œ°4(€ô°4)ô¤ì()½¹ÍÐÁÉ½Ù¥‘•É1¥™•å±•I•Í½ÕÉ•%€ô€¡É•ÍÕ±Ðè)Í½¹=‰©•Ð¤€ôøì(€¥˜€¡ÑåÁ•½˜É•ÍÕ±Ð¹É•Í½ÕÉ•%€„ôô€ÍÑÉ¥¹œœñð€…ÕÕ¥¹Ñ•ÍÐ¡É•ÍÕ±Ð¹É•Í½ÕÉ•%¤(€€€ñðÉ•ÍÕ±Ð¹ÁÉ½Ù¥‘•É½¹™¥%€„ôôÉ•ÍÕ±Ð¹É•Í½ÕÉ•%¤ì(€€€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È I%AQ}%91%iQ%=9}%1œ¤ì(€ô(€É•ÑÕÉ¸É•ÍÕ±Ð¹É•Í½ÕÉ•%ì)ôì()½¹ÍÐ…ÍÍ•ÉÑ½µµ¥ÑÑ•‘AÉ½Ù¥‘•ÉI••¥ÁÑ%‘•¹Ñ¥Ñä€ô€¡É••¥ÁÐè¹Ñ•ÉÁÉ¥Í•I••¥ÁÑI½Ü¤€ôøì(€¥˜€¡É••¥ÁÐ¹ÍÑ…ÑÕÌ€„ôô€½µµ¥ÑÑ•œñð€…¥ÍI•½É¡É••¥ÁÐ¹É•ÍÁ½¹Í”¤¤ì(€€€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È I%AQ}%91%iQ%=9}%1œ¤ì(€ô(€½¹ÍÐÉ•Í½ÕÉ•%€ôÁÉ½Ù¥‘•É1¥™•å±•I•Í½ÕÉ•%¡É••¥ÁÐ¹É•ÍÁ½¹Í”¤ì(€¥˜€¡É••¥ÁÐ¹É•Í½ÕÉ•}¥€„ôôÉ•Í½ÕÉ•%¤ì(€€€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È I%AQ}%91%iQ%=9}%1œ¤ì(€ô(€É•ÑÕÉ¸É•Í½ÕÉ•%ì)ôì(4)•áÁ½ÉÐ½¹ÍÐ¡…¹‘±•AÉ½Ù¥‘•É1¥™•å±•I•ÅÕ•ÍÐ€ô…Íå¹Œ€ 4(€É•ÅÕ•ÍÐèI•ÅÕ•ÍÐ°4(€½Ù•ÉÉ¥‘•Ìèì4(€€€…ÕÑ¡•¹Ñ¥…Ñ”üè€¡É•ÅÕ•ÍÐèI•ÅÕ•ÍÐ°•¹Ù•±½Á”èAÉ½Ù¥‘•É1¥™•å±•¹Ù•±½Á”¤€ôøAÉ½µ¥Í”ñAÉ½Ù¥‘•É1¥™•å±•ÕÑ¡½É¥Ñäøì4(€€€‘•ÁÌüèAÉ½Ù¥‘•É1¥™•å±••ÁÌì(€€€±…¥µI••¥ÁÐüèÑåÁ•½˜±…¥µ¹Ñ•ÉÁÉ¥Í•I••¥ÁÐì(€€€É•±½…‘I••¥ÁÐüèÑåÁ•½˜É•±½…‘¹Ñ•ÉÁÉ¥Í•I••¥ÁÐì(€€€½µÁ±•Ñ•I••¥ÁÐüèÑåÁ•½˜½µÁ±•Ñ•¹Ñ•ÉÁÉ¥Í•I••¥ÁÐì(€€€™…¥±I••¥ÁÐüèÑåÁ•½˜™…¥±¹Ñ•ÉÁÉ¥Í•I••¥ÁÐì(€€€•á•ÕÑ•½µµ…¹üèÑåÁ•½˜•á•ÕÑ•AÉ½Ù¥‘•É1¥™•å±•½µµ…¹ì(€ô€ôíô°(¤€ôøì(€½¹ÍÐ½ÁÑ¥½¹Ì€ô¡…¹‘±•=ÁÑ¥½¹Ì¡É•ÅÕ•ÍÐ¤ì4(€¥˜€¡½ÁÑ¥½¹Ì¤É•ÑÕÉ¸½ÁÑ¥½¹Ìì4(€¥˜€¡É•ÅÕ•ÍÐ¹µ•Ñ¡½€„ôô€A=MPœ¤ì4(€€€½¹ÍÐ•ÉÉ½È€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤ì4(€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡•ÉÉ½È¤°€ÐÀÔ¤ì4(€ô4(€±•Ð±…¥µ•‘I••¥ÁÐè¹Ñ•ÉÁÉ¥Í•I••¥ÁÑI½Üð¹Õ±°€ô¹Õ±°ì4(€±•Ð±…¥µ•‘ÕÑ¡½É¥ÑäèAÉ½Ù¥‘•É1¥™•å±•ÕÑ¡½É¥Ñäð¹Õ±°€ô¹Õ±°ì4(€±•Ð±…¥µ•‘=Á•É…Ñ¥½¸èAÉ½Ù¥‘•É1¥™•å±•=Á•É…Ñ¥½¸ð¹Õ±°€ô¹Õ±°ì4(€±•Ð±…¥µ•‘¹Ù•±½Á”èAÉ½Ù¥‘•É1¥™•å±•¹Ù•±½Á”ð¹Õ±°€ô¹Õ±°ì4(€ÑÉäì4(€€€½¹ÍÐ•¹Ù•±½Á”€ôÁ…ÉÍ•AÉ½Ù¥‘•É1¥™•å±•¹Ù•±½Á”¡…Ý…¥ÐÉ•ÅÕ•ÍÐ¹©Í½¸ ¤¤ì4(€€€½¹ÍÐ…ÕÑ¡•¹Ñ¥…Ñ”€ô½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”ì(€€€½¹ÍÐ…ÕÑ¡½É¥Ñä€ô…Ý…¥Ð…ÕÑ¡•¹Ñ¥…Ñ”¡É•ÅÕ•ÍÐ°•¹Ù•±½Á”¤ì(€€€…ÍÍ•ÉÑAÉ½Ù¥‘•É1¥™•å±•=Á•É…Ñ¥½¹ÕÑ¡½É¥Ñä¡•¹Ù•±½Á”¹½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä¤ì(€€€½¹ÍÐÉ•ÅÕ•ÍÑ!…Í €ô…Ý…¥ÐÁÉ½Ù¥‘•É1¥™•å±•I•ÅÕ•ÍÑ!…Í ¡•¹Ù•±½Á”¤ì4(€€€½¹ÍÐìÉ••¥ÁÐ°½Ý¹Íá•ÕÑ¥½¸ô€ô…Ý…¥Ð€¡½Ù•ÉÉ¥‘•Ì¹±…¥µI••¥ÁÐñð±…¥µ¹Ñ•ÉÁÉ¥Í•I••¥ÁÐ¤¡…ÕÑ¡½É¥Ñä°ì(€€€€€½µµ…¹‘QåÁ”è•¹Ù•±½Á”¹½Á•É…Ñ¥½¸°4(€€€€€¥‘•µÁ½Ñ•¹å-•äè•¹Ù•±½Á”¹¥‘•µÁ½Ñ•¹å-•ä°4(€€€€€É•ÅÕ•ÍÑ%è•¹Ù•±½Á”¹É•ÅÕ•ÍÑ%°4(€€€€€É•ÅÕ•ÍÑ!…Í °4(€€€ô¤ì(€€€¥˜€¡É••¥ÁÐ¹ÍÑ…ÑÕÌ€ôôô€½µµ¥ÑÑ•œ¤ì(€€€€€…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”¡É•ÅÕ•ÍÐ°•¹Ù•±½Á”°…ÕÑ¡•¹Ñ¥…Ñ”¤ì(€€€€€…ÍÍ•ÉÑ½µµ¥ÑÑ•‘AÉ½Ù¥‘•ÉI••¥ÁÑ%‘•¹Ñ¥Ñä¡É••¥ÁÐ¤ì(€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ì½¬èÑÉÕ”°É•Á±…å•èÑÉÕ”°€¸¸¸¡É••¥ÁÐ¹É•ÍÁ½¹Í”ñðíô¤ô°€ÈÀÀ¤ì(€€€ô4(€€€¥˜€¡É••¥ÁÐ¹ÍÑ…ÑÕÌ€ôôô€™…¥±•œñðÉ••¥ÁÐ¹ÍÑ…ÑÕÌ€ôôô€‰±½­•œ¤ì4(€€€€€…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”¡É•ÅÕ•ÍÐ°•¹Ù•±½Á”°…ÕÑ¡•¹Ñ¥…Ñ”¤ì4(€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í” 4(€€€€€€€ì€¸¸¸¡É••¥ÁÐ¹É•ÍÁ½¹Í”ñðÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI=Y%I}	1=-œ¤¤¤°É•Á±…å•èÑÉÕ”ô°4(€€€€€€€ÁÉ½Ù¥‘•É1¥™•å±•MÑ…ÑÕÍ½ÉQ•Éµ¥¹…±I••¥ÁÐ¡É••¥ÁÐ¤°4(€€€€€€¤ì4(€€€ô4(€€€¥˜€ …½Ý¹Íá•ÕÑ¥½¸¤ì4(€€€€€…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”¡É•ÅÕ•ÍÐ°•¹Ù•±½Á”°…ÕÑ¡•¹Ñ¥…Ñ”¤ì4(€€€€€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È =559}%9}AI=IMLœ¤ì4(€€€ô4(€€€±…¥µ•‘I••¥ÁÐ€ôÉ••¥ÁÐì4(€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…ÕÑ¡½É¥Ñäì4(€€€±…¥µ•‘=Á•É…Ñ¥½¸€ô•¹Ù•±½Á”¹½Á•É…Ñ¥½¸ì4(€€€±…¥µ•‘¹Ù•±½Á”€ô•¹Ù•±½Á”ì4(€€€½¹ÍÐ‘•ÁÌ€ô½Ù•ÉÉ¥‘•Ì¹‘•ÁÌñðÉ•…Ñ•AÉ½Ù¥‘•É1¥™•å±••ÁÌ 4(€€€€€‰Õ¥±‘¹Ñ•ÉÁÉ¥Í•AÉ½Ù¥‘•ÉI½ÕÑ•‰•ÁÌ¡¥Í±±½Ý•‘AÉ½Ù¥‘•É¹‘Á½¥¹Ð¤°4(€€€€¤ì4(€€€½¹ÍÐ•á•ÕÑ¥½¸€ôì4(€€€€€É••¥ÁÑ%èÉ••¥ÁÐ¹¥°4(€€€€€•á•ÕÑ¥½¹Q½­•¸èÉ••¥ÁÐ¹•á•ÕÑ¥½¹}Ñ½­•¸°4(€€€€€•á•ÕÑ¥½¹•¹”èÉ••¥ÁÐ¹•á•ÕÑ¥½¹}™•¹”°4(€€€€€Á±…¸èÉ••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ñðíô°4(€€€€€…Íå¹ŒÁ•ÉÍ¥ÍÑA±…¸¡Á±…¸è)Í½¹=‰©•Ð¤ì4(€€€€€€€½¹ÍÐÁ±…¹¹•€ô…Ý…¥ÐÁ•ÉÍ¥ÍÑ¹Ñ•ÉÁÉ¥Í•á•ÕÑ¥½¹A±…¸¡É••¥ÁÐ°…ÕÑ¡½É¥Ñä°Á±…¸¤ì4(€€€€€€€É••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸€ôÁ±…¹¹•¹•á•ÕÑ¥½¹}Á±…¸ñðíôì4(€€€€€€€É•ÑÕÉ¸É••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ì4(€€€€€ô°4(€€€ôì4(€€€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥Ð€¡½Ù•ÉÉ¥‘•Ì¹•á•ÕÑ•½µµ…¹ñð•á•ÕÑ•AÉ½Ù¥‘•É1¥™•å±•½µµ…¹¤ (€€€€€•¹Ù•±½Á”¹½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°•¹Ù•±½Á”¹Á…å±½…°‘•ÁÌ°•á•ÕÑ¥½¸°(€€€€¤ì(€€€½¹ÍÐÉ•Í½ÕÉ•%€ôÁÉ½Ù¥‘•É1¥™•å±•I•Í½ÕÉ•%¡É•ÍÕ±Ð¤ì(€€€½¹ÍÐ™¥¹…±ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”¡É•ÅÕ•ÍÐ°•¹Ù•±½Á”°…ÕÑ¡•¹Ñ¥…Ñ”¤ì(€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô™¥¹…±ÕÑ¡½É¥Ñäì(€€€½¹ÍÐ½µÁ±•Ñ•€ô…Ý…¥Ð€¡½Ù•ÉÉ¥‘•Ì¹½µÁ±•Ñ•I••¥ÁÐñð½µÁ±•Ñ•¹Ñ•ÉÁÉ¥Í•I••¥ÁÐ¤ (€€€€€É••¥ÁÐ°(€€€€€™¥¹…±ÕÑ¡½É¥Ñä°(€€€€€É•ÍÕ±Ð°(€€€€€É•Í½ÕÉ•%°(€€€€€…Íå¹Œ€ ¤€ôøì(€€€€€€€½¹ÍÐÉ•½¹¥±¥…Ñ¥½¹ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”¡É•ÅÕ•ÍÐ°•¹Ù•±½Á”°…ÕÑ¡•¹Ñ¥…Ñ”¤ì(€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ôÉ•½¹¥±¥…Ñ¥½¹ÕÑ¡½É¥Ñäì(€€€€€€€É•ÑÕÉ¸É•½¹¥±¥…Ñ¥½¹ÕÑ¡½É¥Ñäì(€€€€€ô°(€€€€¤ì(€€€…ÍÍ•ÉÑ½µµ¥ÑÑ•‘AÉ½Ù¥‘•ÉI••¥ÁÑ%‘•¹Ñ¥Ñä¡½µÁ±•Ñ•¤ì(€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”¡É•ÅÕ•ÍÐ°•¹Ù•±½Á”°…ÕÑ¡•¹Ñ¥…Ñ”¤ì(€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ì½¬èÑÉÕ”°É•Á±…å•è™…±Í”°€¸¸¸¡½µÁ±•Ñ•¹É•ÍÁ½¹Í”ñðÉ•ÍÕ±Ð¤ô°€ÈÀÀ¤ì(€ô…Ñ €¡•ÉÉ½È¤ì4(€€€½¹ÍÐÍ…™•ÉÉ½È€ô•ÉÉ½È¥¹ÍÑ…¹•½˜AÉ½Ù¥‘•É1¥™•å±•ÉÉ½È€ü•ÉÉ½È4(€€€€€€è•ÉÉ½È¥¹ÍÑ…¹•½˜¹Ñ•ÉÁÉ¥Í•I••¥ÁÑÉÉ½È€ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È 4(€€€€€€€•ÉÉ½È¹½‘”€ôôô€=559}U9Y%1	1œ€ü€AIM%MQ9}U9Y%1	1œ€è•ÉÉ½È¹½‘”°4(€€€€€€¤4(€€€€€€€€è¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AIM%MQ9}U9Y%1	1œ¤ì4(€€€¥˜€¡±…¥µ•‘I••¥ÁÐ€˜˜±…¥µ•‘ÕÑ¡½É¥Ñä€˜˜±…¥µ•‘=Á•É…Ñ¥½¸€˜˜±…¥µ•‘¹Ù•±½Á”¤ì(€€€€€ÑÉäì(€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€¤ì(€€€€€€€½¹ÍÐÉ•½Ù•É•€ô…Ý…¥Ð€¡½Ù•ÉÉ¥‘•Ì¹É•±½…‘I••¥ÁÐñðÉ•±½…‘¹Ñ•ÉÁÉ¥Í•I••¥ÁÐ¤¡±…¥µ•‘I••¥ÁÐ°±…¥µ•‘ÕÑ¡½É¥Ñä¤ì(€€€€€€€¥˜€¡É•½Ù•É•¹ÍÑ…ÑÕÌ€ôôô€½µµ¥ÑÑ•œ¤ì(€€€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€€€¤ì(€€€€€€€€€…ÍÍ•ÉÑ½µµ¥ÑÑ•‘AÉ½Ù¥‘•ÉI••¥ÁÑ%‘•¹Ñ¥Ñä¡É•½Ù•É•¤ì(€€€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ì½¬èÑÉÕ”°É•Á±…å•èÑÉÕ”°€¸¸¸¡É•½Ù•É•¹É•ÍÁ½¹Í”ñðíô¤ô°€ÈÀÀ¤ì(€€€€€€€ô4(€€€€€€€¥˜€¡É•½Ù•É•¹ÍÑ…ÑÕÌ€ôôô€™…¥±•œñðÉ•½Ù•É•¹ÍÑ…ÑÕÌ€ôôô€‰±½­•œ¤ì(€€€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€€€¤ì(€€€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í” (€€€€€€€€€€€ì€¸¸¸¡É•½Ù•É•¹É•ÍÁ½¹Í”ñðÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡Í…™•ÉÉ½È¤¤°É•Á±…å•èÑÉÕ”ô°4(€€€€€€€€€€€ÁÉ½Ù¥‘•É1¥™•å±•MÑ…ÑÕÍ½ÉQ•Éµ¥¹…±I••¥ÁÐ¡É•½Ù•É•¤°4(€€€€€€€€€€¤ì4(€€€€€€€ô4(€€€€€ô…Ñ €¡É•½Ù•ÉåÉÉ½È¤ì4(€€€€€€€¥˜€¡É•½Ù•ÉåÉÉ½È¥¹ÍÑ…¹•½˜AÉ½Ù¥‘•É1¥™•å±•ÉÉ½È€˜˜É•½Ù•ÉåÉÉ½È¹½‘”€ôôô€AI5%MM%=9}9%œ¤ì4(€€€€€€€€€½¹ÍÐ‘•¹¥•€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI5%MM%=9}9%œ¤ì4(€€€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡‘•¹¥•¤°ÍÑ…ÑÕÍ½È¡‘•¹¥•¤¤ì4(€€€€€€€ô(€€€€€€€¥˜€¡Í…™•ÉÉ½È¹½‘”€ôôô€I%AQ}%91%iQ%=9}%1œ¤ì(€€€€€€€€€ÑÉäì(€€€€€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€€€€€¤ì(€€€€€€€€€ô…Ñ ì(€€€€€€€€€€€½¹ÍÐ‘•¹¥•€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI5%MM%=9}9%œ¤ì(€€€€€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡‘•¹¥•¤°ÍÑ…ÑÕÍ½È¡‘•¹¥•¤¤ì(€€€€€€€€€ô(€€€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡Í…™•ÉÉ½È¤°ÍÑ…ÑÕÍ½È¡Í…™•ÉÉ½È¤¤ì(€€€€€€€ô(€€€€€ô4(€€€ô4(€€€¥˜€¡±…¥µ•‘I••¥ÁÐ€˜˜±…¥µ•‘ÕÑ¡½É¥Ñä€˜˜±…¥µ•‘¹Ù•±½Á”(€€€€€€˜˜Í…™•ÉÉ½È¹½‘”€„ôô€I%AQ}%91%iQ%=9}%1œ(€€€€€€˜˜Í…™•ÉÉ½È¹½‘”€„ôô€UQ!=I%iQ%=9}MQ1œ¤ì(€€€€€½¹ÍÐ•áÑ•É¹…±™™•ÑA±…¹¹•€ô±…¥µ•‘I••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ü¹•áÑ•É¹…±M•É•Ñ]É¥ÑÑ•¸€ôôôÑÉÕ”4(€€€€€€€ñð€¡±…¥µ•‘I••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ü¹Í•É•Ñ=Ý¹•ÉÍ¡¥À€ôôô€µ…¹…•‘}ÝÉ¥Ñ”œ4(€€€€€€€€€€˜˜±…¥µ•‘I••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ü¹Í•É•ÑA±…¹I••¥ÁÑ%€ôôô±…¥µ•‘I••¥ÁÐ¹¥4(€€€€€€€€€€˜˜€¡±…¥µ•‘I••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ü¹ÝÉ¥Ñ•MÑ…Ñ”€ôôô€Á±…¹¹•œ4(€€€€€€€€€€€ñð±…¥µ•‘I••¥ÁÐ¹•á•ÕÑ¥½¹}Á±…¸ü¹ÝÉ¥Ñ•MÑ…Ñ”€ôôô€ÝÉ¥ÑÑ•¸œ¤¤ì4(€€€€€¥˜€ „¡Í…™•ÉÉ½È¹½‘”€ôôô€AIM%MQ9}U9Y%1	1œ€˜˜•áÑ•É¹…±™™•ÑA±…¹¹•¤¤ì(€€€€€€€ÑÉäì(€€€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€€€¤ì(€€€€€€€€€…Ý…¥Ð€¡½Ù•ÉÉ¥‘•Ì¹™…¥±I••¥ÁÐñð™…¥±¹Ñ•ÉÁÉ¥Í•I••¥ÁÐ¤ (€€€€€€€€€€€±…¥µ•‘I••¥ÁÐ°(€€€€€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä°(€€€€€€€€€€€ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡Í…™•ÉÉ½È¤°(€€€€€€€€€€€Í…™•ÉÉ½È¹½‘”€ôôô€AI5%MM%=9}9%œñðÍ…™•ÉÉ½È¹½‘”€ôôô€Q99Q}MM}9%œñðÍ…™•ÉÉ½È¹½‘”€ôôô€AI=Y%I}	1=-œ°(€€€€€€€€€€€…Íå¹Œ€ ¤€ôøì(€€€€€€€€€€€€€½¹ÍÐÉ•½¹¥±¥…Ñ¥½¹ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€€€€€€€¤ì(€€€€€€€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ôÉ•½¹¥±¥…Ñ¥½¹ÕÑ¡½É¥Ñäì(€€€€€€€€€€€€€É•ÑÕÉ¸É•½¹¥±¥…Ñ¥½¹ÕÑ¡½É¥Ñäì(€€€€€€€€€€€ô°(€€€€€€€€€€¤ì(€€€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€€€¤ì(€€€€€€€ô…Ñ €¡™¥¹…±¥é…Ñ¥½¹ÉÉ½È¤ì(€€€€€€€€€¥˜€¡™¥¹…±¥é…Ñ¥½¹ÉÉ½È¥¹ÍÑ…¹•½˜AÉ½Ù¥‘•É1¥™•å±•ÉÉ½È(€€€€€€€€€€€€˜˜™¥¹…±¥é…Ñ¥½¹ÉÉ½È¹½‘”€ôôô€AI5%MM%=9}9%œ¤ì(€€€€€€€€€€€½¹ÍÐ‘•¹¥•€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI5%MM%=9}9%œ¤ì(€€€€€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡‘•¹¥•¤°ÍÑ…ÑÕÍ½È¡‘•¹¥•¤¤ì(€€€€€€€€€ô(€€€€€€€€€½¹ÍÐ™¥¹…±¥é…Ñ¥½¸€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È I%AQ}%91%iQ%=9}%1œ¤ì(€€€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡™¥¹…±¥é…Ñ¥½¸¤°ÍÑ…ÑÕÍ½È¡™¥¹…±¥é…Ñ¥½¸¤¤ì(€€€€€€€ô(€€€€€ô•±Í”ì(€€€€€€€ÑÉäì(€€€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€€€¤ì(€€€€€€€ô…Ñ ì(€€€€€€€€€½¹ÍÐ‘•¹¥•€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI5%MM%=9}9%œ¤ì(€€€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡‘•¹¥•¤°ÍÑ…ÑÕÍ½È¡‘•¹¥•¤¤ì(€€€€€€€ô(€€€€€ô(€€€ô(€€€¥˜€¡±…¥µ•‘I••¥ÁÐ€˜˜±…¥µ•‘ÕÑ¡½É¥Ñä€˜˜±…¥µ•‘¹Ù•±½Á”¤ì(€€€€€ÑÉäì(€€€€€€€±…¥µ•‘ÕÑ¡½É¥Ñä€ô…Ý…¥ÐÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±” (€€€€€€€€€É•ÅÕ•ÍÐ°±…¥µ•‘¹Ù•±½Á”°½Ù•ÉÉ¥‘•Ì¹…ÕÑ¡•¹Ñ¥…Ñ”ñð…ÕÑ¡•¹Ñ¥…Ñ•AÉ½Ù¥‘•É1¥™•å±”°(€€€€€€€€¤ì(€€€€€ô…Ñ ì(€€€€€€€½¹ÍÐ‘•¹¥•€ô¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI5%MM%=9}9%œ¤ì(€€€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡‘•¹¥•¤°ÍÑ…ÑÕÍ½È¡‘•¹¥•¤¤ì(€€€€€ô(€€€ô(€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ÁÉ½Ù¥‘•É1¥™•å±•ÉÉ½É	½‘ä¡Í…™•ÉÉ½È¤°ÍÑ…ÑÕÍ½È¡Í…™•ÉÉ½È¤¤ì(€ô4)ôì4