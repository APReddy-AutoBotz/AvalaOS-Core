import {
  ASSEMBLE_ELIGIBLE_DISPOSITIONS,
  ENTERPRISE_AI_CAPABILITIES,
  ENTERPRISE_AI_PROVIDERS,
  EVIDENCE_CANDIDATE_FIELDS,
  buildAssembleBlueprintDraft,
  buildDeliveryWorkPackageDraft,
  buildEvidenceCandidate,
  buildMonitorBaseline,
  evaluateModernizationDecision,
  isSupportedEvidenceMimeType,
  stableFingerprint,
  type AssembleBlueprintDraft,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type ModernizationFactors,
  type ModernizationDisposition,
  type SupportedEvidenceMimeType,
} from '../../../services/enterpriseIntelligence.ts';
import {
  EnterpriseAiGatewayError,
  isAllowedProviderEndpoint,
  isSafeProviderEndpoint,
  isSafeEnterpriseSecretReference,
  parseJsonObjectResponse,
  runGovernedProviderRequest,
} from './enterpriseIntelligenceAi.ts';
import { extractEvidenceText, decodeBase64, sha256Hex } from './enterpriseIntelligenceIngestion.ts';
import { handleOptions, jsonResponse } from './http.ts';
import {
  getAuthUser,
  insertRow,
  postgrest,
  rpc,
  resolveOrgId,
  updateRows,
} from './supabase.ts';
import {
  downloadStoredFile,
  assertSourceUploadsBucket,
  prepareTextArtifact,
  removeTextArtifact,
  resolveSourceUploadsBucket,
  uploadBinaryArtifact,
} from './storage.ts';

type JsonObject = Record<string, unknown>;

export type EnterpriseCommandType =
  | 'provider.register'
  | 'provider.route.toggle'
  | 'evidence.source.create'
  | 'evidence.extract'
  | 'evidence.candidate.review'
  | 'modernization.evaluate'
  | 'approval.review.record'
  | 'approval.record'
  | 'studio.delivery.handoff'
  | 'monitor.baseline.create'
  | 'assemble.blueprint.create';

export type EnterpriseCommandEnvelope = {
  commandType: EnterpriseCommandType;
  requestId: string;
  idempotencyKey: string;
  organizationId: string;
  workspaceId: string;
  payload: JsonObject;
};

export class EnterpriseCommandError extends Error {
  constructor(
    public readonly code:
      | 'METHOD_NOT_ALLOWED'
      | 'INVALID_COMMAND'
      | 'AUTHENTICATION_REQUIRED'
      | 'TENANT_ACCESS_DENIED'
      | 'PERMISSION_DENIED'
      | 'AUTHORIZATION_STALE'
      | 'IDEMPOTENCY_CONFLICT'
      | 'COMMAND_IN_PROGRESS'
      | 'RESOURCE_NOT_FOUND'
      | 'RESOURCE_STALE'
      | 'INVALID_PAYLOAD'
      | 'COMMAND_BLOCKED'
      | 'COMMAND_UNAVAILABLE',
    public readonly status = codeToStatus(code),
  ) {
    super(code);
    this.name = 'EnterpriseCommandError';
  }
}

const codeToStatus = (code: EnterpriseCommandError['code']) => {
  if (code === 'METHOD_NOT_ALLOWED') return 405;
  if (code === 'AUTHENTICATION_REQUIRED') return 401;
  if (code === 'TENANT_ACCESS_DENIED' || code === 'PERMISSION_DENIED') return 403;
  if (code === 'AUTHORIZATION_STALE') return 409;
  if (code === 'RESOURCE_NOT_FOUND') return 404;
  if (code === 'RESOURCE_STALE') return 409;
  if (code === 'COMMAND_IN_PROGRESS') return 409;
  if (code === 'COMMAND_UNAVAILABLE') return 503;
  return 400;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const commandTypes = new Set<EnterpriseCommandType>([
  'provider.register',
  'provider.route.toggle',
  'evidence.source.create',
  'evidence.extract',
  'evidence.candidate.review',
  'modernization.evaluate',
  'approval.review.record',
  'approval.record',
  'studio.delivery.handoff',
  'monitor.baseline.create',
  'assemble.blueprint.create',
]);

const isRecord = (value: unknown): value is JsonObject => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);

const requireString = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return value.trim();
};

const requireUuid = (value: unknown) => {
  const normalized = requireString(value, 128);
  if (!uuidPattern.test(normalized)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return normalized;
};

const unsafeFieldPattern = /^(api[_-]?key|secret(value)?|authorization|auth[_-]?header|bearer[_-]?token|raw[_-]?(key|prompt|completion)|prompt[_-]?body|completion[_-]?body|storage[_-]?path|object[_-]?key)$/i;

const assertNoUnsafeFields = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(assertNoUnsafeFields);
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, child]) => {
    if (unsafeFieldPattern.test(key.replace(/[^A-Za-z0-9_-]/g, ''))) {
      throw new EnterpriseCommandError('INVALID_PAYLOAD');
    }
    assertNoUnsafeFields(child);
  });
};

export const parseEnterpriseCommandEnvelope = (value: unknown): EnterpriseCommandEnvelope => {
  if (!isRecord(value)) throw new EnterpriseCommandError('INVALID_COMMAND');
  assertNoUnsafeFields(value);
  const commandType = value.commandType;
  if (typeof commandType !== 'string' || !commandTypes.has(commandType as EnterpriseCommandType)) {
    throw new EnterpriseCommandError('INVALID_COMMAND');
  }
  const requestId = requireUuid(value.requestId);
  const idempotencyKey = requireString(value.idempotencyKey, 200);
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) throw new EnterpriseCommandError('INVALID_COMMAND');
  const payload = value.payload;
  if (!isRecord(payload)) throw new EnterpriseCommandError('INVALID_COMMAND');
  return {
    commandType: commandType as EnterpriseCommandType,
    requestId,
    idempotencyKey,
    organizationId: requireUuid(value.organizationId),
    workspaceId: requireUuid(value.workspaceId),
    payload,
  };
};

type Authority = {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  isAdmin: boolean;
  permissions: Set<string>;
  roleNames: Set<string>;
  authorizationVersion: number;
};

type AuthorityProfileRow = { id: string; status: string; deleted_at?: string | null };
type AuthorityOrganizationRow = { id: string; status: string; deleted_at?: string | null };
type AuthorityWorkspaceRow = { id: string; org_id: string; status: string; deleted_at?: string | null };
type AuthorityMembershipRow = { status: string; role_id?: string | null; deleted_at?: string | null };
type AuthorityRoleRow = { id: string; name?: string | null; scope: string; org_id?: string | null; workspace_id?: string | null; status: string; deleted_at?: string | null };
type AuthorityCapabilityRow = { role_id: string; capability_key: string };

const resolveAuthority = async (actorId: string, organizationId: string, workspaceId: string): Promise<Authority> => {
  const [profile, organization, workspace, orgMembership, workspaceMembership, authorization] = await Promise.all([
    findOne<AuthorityProfileRow>('profiles', `select=id,status,deleted_at&id=eq.${encodeURIComponent(actorId)}`),
    findOne<AuthorityOrganizationRow>('organizations', `select=id,status,deleted_at&id=eq.${encodeURIComponent(organizationId)}`),
    findOne<AuthorityWorkspaceRow>('workspaces', `select=id,org_id,status,deleted_at&id=eq.${encodeURIComponent(workspaceId)}&org_id=eq.${encodeURIComponent(organizationId)}`),
    findOne<AuthorityMembershipRow>('organization_members', `select=status,role_id,deleted_at&org_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(actorId)}&status=eq.active&deleted_at=is.null`),
    findOne<AuthorityMembershipRow>('workspace_memberships', `select=status,role_id,deleted_at&org_id=eq.${encodeURIComponent(organizationId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(actorId)}&status=eq.active&deleted_at=is.null`),
    findOne<{ version: number }>('authorization_versions', `select=version&org_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(actorId)}`),
  ]);
  if (
    !profile || profile.status !== 'active' || profile.deleted_at
    || !organization || organization.status !== 'active' || organization.deleted_at
    || !workspace || workspace.org_id !== organizationId || workspace.status !== 'active' || workspace.deleted_at
    || !orgMembership || orgMembership.status !== 'active'
    || !workspaceMembership || workspaceMembership.status !== 'active'
    || !authorization || !Number.isInteger(authorization.version) || authorization.version <= 0
  ) throw new EnterpriseCommandError('TENANT_ACCESS_DENIED');

  const roleIds = [orgMembership.role_id, workspaceMembership.role_id].filter((id): id is string => Boolean(id));
  if (!roleIds.length) throw new EnterpriseCommandError('PERMISSION_DENIED');
  const roles = await postgrest<AuthorityRoleRow[]>(
    `roles?select=id,name,scope,org_id,workspace_id,status,deleted_at&id=in.(${roleIds.map(encodeURIComponent).join(',')})`,
    { method: 'GET' },
  );
  const validRoleIds = roles.filter(role => (
    role.status === 'active'
    && !role.deleted_at
    && role.org_id === organizationId
    && ((role.id === orgMembership.role_id && role.scope === 'organization' && !role.workspace_id)
      || (role.id === workspaceMembership.role_id && role.scope === 'workspace' && role.workspace_id === workspaceId))
  )).map(role => role.id);
  if (!validRoleIds.length) throw new EnterpriseCommandError('TENANT_ACCESS_DENIED');
  const capabilities = await postgrest<AuthorityCapabilityRow[]>(
    `role_capabilities?select=role_id,capability_key&role_id=in.(${validRoleIds.map(encodeURIComponent).join(',')})`,
    { method: 'GET' },
  );
  const permissions = new Set(capabilities.map(row => row.capability_key));
  return {
    actorId,
    organizationId,
    workspaceId,
    isAdmin: permissions.has('org.admin'),
    permissions,
    roleNames: new Set(roles.filter(role => validRoleIds.includes(role.id)).map(role => String(role.name || '').toLowerCase()).filter(Boolean)),
    authorizationVersion: authorization.version,
  };
};

const requirePermission = (authority: Authority, ...required: string[]) => {
  if (authority.isAdmin || required.some(permission => authority.permissions.has(permission))) return;
  throw new EnterpriseCommandError('PERMISSION_DENIED');
};

const assertFreshAuthority = async (authority: Authority, required: string[]) => {
  const current = await findOne<{ version: number }>(
    'authorization_versions',
    `select=version&org_id=eq.${encodeURIComponent(authority.organizationId)}&user_id=eq.${encodeURIComponent(authority.actorId)}`,
  );
  if (!current || current.version !== authority.authorizationVersion) throw new EnterpriseCommandError('AUTHORIZATION_STALE');
  const capability = authority.isAdmin ? 'org.admin' : required.find(item => authority.permissions.has(item));
  if (!capability) throw new EnterpriseCommandError('PERMISSION_DENIED');
  try {
    await rpc('pr1b_assert_command_authority', {
      p_actor: authority.actorId,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_capability: capability,
      p_version: authority.authorizationVersion,
    });
  } catch {
    throw new EnterpriseCommandError('PERMISSION_DENIED');
  }
};

const requirePayloadObject = (value: unknown) => {
  if (!isRecord(value)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return value;
};

const requireProvider = (value: unknown): EnterpriseAiProvider => {
  const provider = requireString(value, 64) as EnterpriseAiProvider;
  if (!ENTERPRISE_AI_PROVIDERS.includes(provider)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return provider;
};

const requireCapability = (value: unknown): EnterpriseAiCapability => {
  const capability = requireString(value, 120) as EnterpriseAiCapability;
  if (!ENTERPRISE_AI_CAPABILITIES.includes(capability)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return capability;
};

const requireMime = (value: unknown): SupportedEvidenceMimeType => {
  const mime = requireString(value, 160);
  if (!isSupportedEvidenceMimeType(mime)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return mime;
};

const requireFactorBand = (value: unknown) => {
  if (value !== 'unknown' && value !== 'low' && value !== 'medium' && value !== 'high') {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return value;
};

const parseModernizationFactors = (value: unknown): ModernizationFactors => {
  const object = requirePayloadObject(value);
  const fields: Array<keyof ModernizationFactors> = [
    'criticality', 'fit', 'ux', 'techHealth', 'maintainability', 'architecture',
    'securityCompliance', 'dataPortability', 'apiIntegration', 'cloudFit', 'agentFit',
    'vendorLockIn', 'costTco', 'operatingRisk', 'skills', 'changeEffort', 'timeToValue',
    'dependencyRisk',
  ];
  return Object.fromEntries(fields.map(field => [field, requireFactorBand(object[field])])) as unknown as ModernizationFactors;
};

const sha256Json = (value: unknown) => sha256Hex(JSON.stringify(value));

const findOne = async <T>(table: string, query: string) => {
  const rows = await postgrest<T[]>(`${table}?${query}&limit=1`, { method: 'GET' });
  return rows[0] || null;
};

type ReceiptRow = {
  id: string;
  request_hash: string;
  request_id: string;
  status: string;
  resource_id?: string | null;
  response?: JsonObject;
};

const findReceipt = async (authority: Authority, envelope: EnterpriseCommandEnvelope) => findOne<ReceiptRow>(
  'enterprise_ai_command_receipts',
  `select=id,request_hash,request_id,status,resource_id,response&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&actor_id=eq.${encodeURIComponent(authority.actorId)}&command_type=eq.${encodeURIComponent(envelope.commandType)}&idempotency_key=eq.${encodeURIComponent(envelope.idempotencyKey)}`,
);

const claimReceipt = async (
  authority: Authority,
  envelope: EnterpriseCommandEnvelope,
  requestHash: string,
): Promise<ReceiptRow> => {
  const value = await rpc<ReceiptRow | ReceiptRow[]>('enterprise_ai_claim_command', {
    p_actor: authority.actorId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_command_type: envelope.commandType,
    p_key: envelope.idempotencyKey,
    p_request: envelope.requestId,
    p_hash: requestHash,
  });
  const row = Array.isArray(value) ? value[0] : value;
  if (!row?.id) throw new EnterpriseCommandError('COMMAND_UNAVAILABLE');
  if (row.request_hash !== requestHash) throw new EnterpriseCommandError('IDEMPOTENCY_CONFLICT', 409);
  return row;
};

const completeReceipt = async (receipt: ReceiptRow, authority: Authority, result: JsonObject, resourceId?: string) => {
  await rpc('enterprise_ai_complete_command', {
    p_id: receipt.id,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_response: result,
    p_resource_id: resourceId || null,
  });
};

const failReceipt = async (receipt: ReceiptRow, authority: Authority, result: JsonObject, blocked: boolean) => {
  await rpc('enterprise_ai_fail_command', {
    p_id: receipt.id,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_response: result,
    p_blocked: blocked,
  }).catch(() => undefined);
};

type ProviderConfigRow = {
  id: string;
  org_id: string;
  provider: EnterpriseAiProvider;
  key_ref_id: string | null;
  endpoint_url?: string | null;
  deployment_name?: string | null;
  default_model?: string | null;
  model_allowlist?: string[] | null;
  budget_policy?: JsonObject | null;
  last_validated_at?: string | null;
  status: string;
  deleted_at?: string | null;
};

type ProviderKeyRefRow = {
  id: string;
  org_id: string;
  provider: EnterpriseAiProvider;
  resolver_type: string;
  secret_ref: string;
  status: string;
  expires_at?: string | null;
  deleted_at?: string | null;
};

type RouteRow = {
  id: string;
  org_id: string;
  workspace_id: string;
  provider_config_id: string;
  capability: EnterpriseAiCapability;
  model: string;
  enabled: boolean;
  allowed_roles?: string[] | null;
  deleted_at?: string | null;
};

const resolveRoute = async (authority: Authority, capability: EnterpriseAiCapability, requestedConfigId?: string, allowDisabled = false) => {
  const configFilter = requestedConfigId ? `&provider_config_id=eq.${encodeURIComponent(requestedConfigId)}` : '';
  const enabledFilter = allowDisabled ? '' : '&enabled=is.true';
  const route = await findOne<RouteRow>(
    'enterprise_ai_capability_routes',
    `select=id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,deleted_at&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&capability=eq.${encodeURIComponent(capability)}${enabledFilter}&deleted_at=is.null${configFilter}`,
  );
  if (!route) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const config = await findOne<ProviderConfigRow>(
    'ai_provider_configs',
    `select=id,org_id,provider,key_ref_id,endpoint_url,deployment_name,default_model,model_allowlist,budget_policy,last_validated_at,status,deleted_at&id=eq.${encodeURIComponent(route.provider_config_id)}&org_id=eq.${encodeURIComponent(authority.organizationId)}&limit=1`,
  );
  if (!config || config.status !== 'active' || config.deleted_at || !ENTERPRISE_AI_PROVIDERS.includes(config.provider)) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  if (!config.last_validated_at || (config.endpoint_url && !isAllowedProviderEndpoint(config.provider, config.endpoint_url))) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  if (route.allowed_roles?.length && !route.allowed_roles.some(role => authority.roleNames.has(role.toLowerCase()))) {
    throw new EnterpriseCommandError('PERMISSION_DENIED');
  }
  const model = route.model || config.default_model;
  if (!model || (config.model_allowlist?.length && !config.model_allowlist.includes(model))) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  if (!config.key_ref_id) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const keyRef = await findOne<ProviderKeyRefRow>(
    'ai_provider_key_refs',
    `select=id,org_id,provider,resolver_type,secret_ref,status,expires_at,deleted_at&id=eq.${encodeURIComponent(config.key_ref_id)}&org_id=eq.${encodeURIComponent(authority.organizationId)}&provider=eq.${encodeURIComponent(config.provider)}&limit=1`,
  );
  if (
    !keyRef
    || keyRef.status !== 'active'
    || keyRef.deleted_at
    || keyRef.resolver_type !== 'server_reference'
    || !isSafeEnterpriseSecretReference(config.provider, keyRef.secret_ref, authority.organizationId)
    || (keyRef.expires_at && new Date(keyRef.expires_at).getTime() <= Date.now())
  ) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  return { route, config, keyRef, model };
};

const assertRouteBudget = async (authority: Authority, route: Awaited<ReturnType<typeof resolveRoute>>) => {
  const budget = route.config.budget_policy || {};
  const dailyRequests = typeof budget.dailyRequests === 'number' && Number.isInteger(budget.dailyRequests) ? budget.dailyRequests : undefined;
  const monthlyTokens = typeof budget.monthlyTokens === 'number' && Number.isInteger(budget.monthlyTokens) ? budget.monthlyTokens : undefined;
  if (dailyRequests === undefined && monthlyTokens === undefined) return;
  const now = Date.now();
  const dayStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
  const [dailyUsageRows, monthlyUsageRows] = await Promise.all([
    postgrest<Array<{ input_tokens: number; output_tokens: number }>>(
      `enterprise_ai_usage_ledger?select=input_tokens,output_tokens&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&provider_config_id=eq.${encodeURIComponent(route.config.id)}&recorded_at=gte.${encodeURIComponent(dayStart)}`,
      { method: 'GET' },
    ),
    postgrest<Array<{ input_tokens: number; output_tokens: number }>>(
      `enterprise_ai_usage_ledger?select=input_tokens,output_tokens&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&provider_config_id=eq.${encodeURIComponent(route.config.id)}&recorded_at=gte.${encodeURIComponent(monthStart)}`,
      { method: 'GET' },
    ),
  ]);
  const dailyUsage = dailyUsageRows.length;
  const monthTokens = monthlyUsageRows.reduce((sum, item) => sum + Number(item.input_tokens || 0) + Number(item.output_tokens || 0), 0);
  if ((dailyRequests !== undefined && dailyUsage >= dailyRequests) || (monthlyTokens !== undefined && monthTokens >= monthlyTokens)) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
};

const commandProviderRegister = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'byok.manage', 'security.manage');
  const provider = requireProvider(payload.provider);
  const secretReference = requireString(payload.secretReference, 512);
  if (!isSafeEnterpriseSecretReference(provider, secretReference, authority.organizationId)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const displayName = requireString(payload.displayName, 240);
  const defaultModel = requireString(payload.defaultModel, 200);
  const endpoint = payload.endpoint === undefined || payload.endpoint === '' ? null : requireString(payload.endpoint, 500);
  if (endpoint && !isSafeProviderEndpoint(endpoint)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  if ((provider === 'azure_openai' || provider === 'openai_compatible') && !endpoint) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const deployment = payload.deployment === undefined || payload.deployment === '' ? null : requireString(payload.deployment, 240);
  const modelAllowlist = Array.isArray(payload.modelAllowlist)
    ? payload.modelAllowlist.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean).slice(0, 64)
    : [defaultModel];
  if (!modelAllowlist.includes(defaultModel)) modelAllowlist.unshift(defaultModel);
  const capabilities = Array.isArray(payload.capabilities)
    ? payload.capabilities.map(requireCapability)
    : [];
  if (capabilities.length === 0) throw new EnterpriseCommandError('INVALID_PAYLOAD');

  const keyRefId = crypto.randomUUID();
  await insertRow('ai_provider_key_refs', {
    id: keyRefId,
    org_id: authority.organizationId,
    provider,
    resolver_type: 'server_reference',
    secret_ref: secretReference,
    safe_label: `${provider} server reference`,
    safe_fingerprint: await sha256Hex(secretReference),
    status: 'pending_review',
    created_by: authority.actorId,
    updated_by: authority.actorId,
  });
  const configId = crypto.randomUUID();
  await insertRow('ai_provider_configs', {
    id: configId,
    org_id: authority.organizationId,
    provider,
    display_name: displayName,
    key_ref_id: keyRefId,
    endpoint_url: endpoint,
    deployment_name: deployment,
    default_model: defaultModel,
    model_allowlist: modelAllowlist,
    budget_policy: isRecord(payload.budget) ? payload.budget : {},
    allowed_modes: ['pilot', 'production'],
    allowed_operations: ['generate_document', 'refine_section'],
    status: 'pending_review',
    created_by: authority.actorId,
    updated_by: authority.actorId,
  });
  const routes: Array<{ id: string; capability: EnterpriseAiCapability }> = [];
  for (const capability of [...new Set(capabilities)]) {
    const routeId = crypto.randomUUID();
    await insertRow('enterprise_ai_capability_routes', {
      id: routeId,
      org_id: authority.organizationId,
      workspace_id: authority.workspaceId,
      provider_config_id: configId,
      capability,
      model: defaultModel,
      enabled: false,
      allowed_roles: [],
      created_by: authority.actorId,
      updated_by: authority.actorId,
    });
    routes.push({ id: routeId, capability });
  }
  return {
    providerConfigId: configId,
    provider,
    displayName,
    status: 'pending_review',
    maskedSecretLabel: 'server-managed opaque reference',
    modelAllowlist,
    routes,
  };
};

const commandProviderRouteToggle = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'byok.manage', 'security.manage');
  const routeId = requireUuid(payload.routeId);
  const enabled = payload.enabled;
  if (typeof enabled !== 'boolean') throw new EnterpriseCommandError('INVALID_PAYLOAD');
  if (enabled) {
    const route = await findOne<RouteRow>(
      'enterprise_ai_capability_routes',
      `select=id,org_id,workspace_id,provider_config_id,capability,model,enabled,deleted_at&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(routeId)}&deleted_at=is.null`,
    );
    if (!route) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    await resolveRoute(authority, route.capability, route.provider_config_id, true);
  }
  const rows = await updateRows<RouteRow>(
    'enterprise_ai_capability_routes',
    { id: `eq.${routeId}`, org_id: `eq.${authority.organizationId}`, workspace_id: `eq.${authority.workspaceId}`, deleted_at: 'is.null' },
    { enabled, updated_by: authority.actorId, updated_at: new Date().toISOString() },
  );
  if (!rows.length) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  return { routeId, enabled };
};

const commandEvidenceSourceCreate = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'evidence.write');
  const mimeType = requireMime(payload.mimeType);
  const contentBase64 = requireString(payload.contentBase64, 16_000_000);
  const bytes = decodeBase64(contentBase64);
  if (bytes.length === 0 || bytes.length > 12_000_000) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const filename = requireString(payload.filename || 'evidence.txt', 240).split(/[\\/]/).pop() || 'evidence.txt';
  const displayName = requireString(payload.displayName || filename, 240);
  const sourceKind = payload.sourceKind === 'pasted_text' ? 'pasted_text' : 'upload';
  const sourceId = crypto.randomUUID();
  const bucket = assertSourceUploadsBucket(resolveSourceUploadsBucket());
  const artifact = prepareTextArtifact({ orgId: authority.organizationId, workspaceId: authority.workspaceId, bucket, artifactType: 'enterprise-evidence', extension: 'bin', artifactId: sourceId });
  let uploaded = false;
  try {
    await uploadBinaryArtifact({ artifact, orgId: authority.organizationId, workspaceId: authority.workspaceId, contentType: mimeType, content: bytes });
    uploaded = true;
    const text = await extractEvidenceText(bytes, mimeType);
    const contentHash = await sha256Hex(bytes);
    const extractedTextHash = await sha256Hex(text);
    const versionId = crypto.randomUUID();
    await rpc('enterprise_create_evidence_source', {
      p_source: {
        id: sourceId,
        org_id: authority.organizationId,
        workspace_id: authority.workspaceId,
        display_name: displayName,
        source_kind: sourceKind,
        mime_type: mimeType,
        current_version: 1,
        status: 'review',
        created_by: authority.actorId,
      },
      p_version: {
        id: versionId,
        source_id: sourceId,
        org_id: authority.organizationId,
        workspace_id: authority.workspaceId,
        version: 1,
        original_filename: filename,
        content_hash: contentHash,
        content_bytes: bytes.length,
        storage_bucket: bucket,
        storage_path: artifact.path,
        extracted_text_hash: extractedTextHash,
        extracted_character_count: text.length,
        created_by: authority.actorId,
      },
    });
    return {
      sourceId,
      sourceVersionId: versionId,
      version: 1,
      displayName,
      mimeType,
      status: 'review',
      contentHash,
      extractedCharacterCount: text.length,
      ingestion: 'server_managed',
    };
  } catch (error) {
    if (uploaded) await removeTextArtifact(artifact, authority.organizationId, authority.workspaceId).catch(() => undefined);
    if (error instanceof EnterpriseCommandError) throw error;
    throw new EnterpriseCommandError('COMMAND_UNAVAILABLE');
  }
};

type EvidenceVersionRow = {
  id: string;
  source_id: string;
  version: number;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type?: SupportedEvidenceMimeType;
  content_hash: string;
  extracted_text_hash?: string | null;
};

const commandEvidenceExtract = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'evidence.write');
  const sourceId = requireUuid(payload.sourceId);
  const sourceVersionId = requireUuid(payload.sourceVersionId);
  const source = await findOne<{ id: string; mime_type: SupportedEvidenceMimeType; status: string }>(
    'enterprise_evidence_sources',
    `select=id,mime_type,status&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceId)}&deleted_at=is.null`,
  );
  const version = await findOne<EvidenceVersionRow>(
    'enterprise_evidence_source_versions',
    `select=id,source_id,version,original_filename,storage_bucket,storage_path,content_hash,extracted_text_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceVersionId)}&source_id=eq.${encodeURIComponent(sourceId)}`,
  );
  if (!source || !version || !source.mime_type) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  assertSourceUploadsBucket(version.storage_bucket);
  const bytes = new Uint8Array(await (await downloadStoredFile({ orgId: authority.organizationId, workspaceId: authority.workspaceId, bucket: version.storage_bucket, storagePath: version.storage_path })).arrayBuffer());
  if (await sha256Hex(bytes) !== version.content_hash) throw new EnterpriseCommandError('RESOURCE_STALE');
  const text = await extractEvidenceText(bytes, source.mime_type);
  if (version.extracted_text_hash && await sha256Hex(text) !== version.extracted_text_hash) throw new EnterpriseCommandError('RESOURCE_STALE');
  if (!text) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const route = await resolveRoute(authority, 'assess.evidence.extract', typeof payload.providerConfigId === 'string' ? payload.providerConfigId : undefined);
  await assertRouteBudget(authority, route);
  const jobId = crypto.randomUUID();
  const requestStarted = Date.now();
  await insertRow('enterprise_ai_job_ledger', {
    id: jobId,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    capability: 'assess.evidence.extract',
    provider_config_id: route.config.id,
    provider: route.config.provider,
    model: route.model,
    prompt_key: 'assess.evidence.extract',
    prompt_version: 'enterprise-evidence-extract-1',
    source_refs: [sourceId, sourceVersionId],
    actor_id: authority.actorId,
    request_id: requireUuid(payload.requestId || crypto.randomUUID()),
    idempotency_key: await sha256Json({ sourceVersionId, providerConfigId: route.config.id, capability: 'assess.evidence.extract' }),
    status: 'running',
    approval_state: 'review_required',
  });
  try {
    const result = await runGovernedProviderRequest({
      provider: route.config.provider,
      endpoint: route.config.endpoint_url || undefined,
      deployment: route.config.deployment_name || undefined,
      model: route.model,
      secretRef: route.keyRef.secret_ref,
      capability: 'assess.evidence.extract',
      taskInstruction: `Extract candidate evidence as JSON with a candidates array. Each item must have fieldKey from ${EVIDENCE_CANDIDATE_FIELDS.join(', ')}, value, sourceLocator, confidence between 0 and 1, and safeExcerpt. Do not infer missing facts; use unresolved_questions or assumptions when needed.`,
      untrustedSource: text,
      authorization: {
        organizationId: authority.organizationId,
        workspaceId: authority.workspaceId,
        actorId: authority.actorId,
        providerConfigId: route.config.id,
        capability: 'assess.evidence.extract',
        routeEnabled: true,
      },
    });
    const decoded = parseJsonObjectResponse<{ candidates?: unknown[] }>(result.output, (value): value is { candidates?: unknown[] } => (
      isRecord(value) && (value.candidates === undefined || Array.isArray(value.candidates))
    ));
    const rawCandidates = Array.isArray(decoded.candidates) ? decoded.candidates.slice(0, 200) : [];
    const candidates = [];
    for (const raw of rawCandidates) {
      if (!isRecord(raw)) continue;
      const field = raw.fieldKey;
      if (typeof field !== 'string' || !EVIDENCE_CANDIDATE_FIELDS.includes(field as any)) continue;
      if (typeof raw.value !== 'string' || !raw.value.trim() || typeof raw.sourceLocator !== 'string') continue;
      const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0;
      if (confidence < 0 || confidence > 1) continue;
      const safeExcerpt = typeof raw.safeExcerpt === 'string' ? raw.safeExcerpt : undefined;
      const normalizedSource = text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
      const normalizedExcerpt = safeExcerpt?.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
      const normalizedValue = raw.value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
      if (!normalizedExcerpt || (!normalizedSource.includes(normalizedExcerpt) && !normalizedSource.includes(normalizedValue))) continue;
      const candidate = buildEvidenceCandidate({
        id: crypto.randomUUID(),
        sourceId,
        sourceVersionId,
        field: field as any,
        value: raw.value.slice(0, 12_000),
        safeExcerpt,
        sourceLocator: raw.sourceLocator.slice(0, 400),
        confidence,
        aiJobId: jobId,
        promptVersion: 'enterprise-evidence-extract-1',
        status: 'suggested',
        reviewedBy: undefined,
        reviewedAt: undefined,
      });
      candidate.excerptHash = await sha256Hex(JSON.stringify({
        sourceVersionId,
        sourceContentHash: version.content_hash,
        extractedTextHash: version.extracted_text_hash || await sha256Hex(text),
        sourceLocator: candidate.sourceLocator,
        safeExcerpt: candidate.safeExcerpt,
        value: candidate.value,
      }));
      candidates.push(candidate);
    }
    await rpc('enterprise_commit_evidence_extraction', {
      p_job_id: jobId,
      p_source_id: sourceId,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_output_hash: await sha256Hex(result.output),
      p_latency_ms: Math.max(0, Date.now() - requestStarted),
      p_provider_config_id: route.config.id,
      p_provider: route.config.provider,
      p_model: route.model,
      p_token_input: Math.max(1, Math.ceil(text.length / 4)),
      p_token_output: Math.max(1, Math.ceil(result.output.length / 4)),
      p_candidates: candidates.map(candidate => ({
        id: candidate.id,
        sourceVersionId: candidate.sourceVersionId,
        field: candidate.field,
        value: candidate.value,
        safeExcerpt: candidate.safeExcerpt || null,
        excerptHash: candidate.excerptHash,
        sourceLocator: candidate.sourceLocator,
        confidence: candidate.confidence,
        promptVersion: candidate.promptVersion,
        status: candidate.status,
        createdBy: authority.actorId,
      })),
    });
    return { jobId, sourceId, sourceVersionId, candidateCount: candidates.length, candidates };
  } catch (error) {
    await updateRows('enterprise_ai_job_ledger', { id: `eq.${jobId}`, org_id: `eq.${authority.organizationId}`, workspace_id: `eq.${authority.workspaceId}`, status: 'eq.running' }, {
      status: 'failed',
      failure_class: error instanceof EnterpriseAiGatewayError ? error.code : 'PROVIDER_RESPONSE_INVALID',
      latency_ms: Math.max(0, Date.now() - requestStarted),
      completed_at: new Date().toISOString(),
    }).catch(() => undefined);
    if (error instanceof EnterpriseCommandError) throw error;
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
};

const commandEvidenceCandidateReview = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'evidence.review');
  const candidateId = requireUuid(payload.candidateId);
  const status = payload.status;
  if (status !== 'accepted' && status !== 'rejected' && status !== 'edited') throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const current = await findOne<{ id: string; value: string; source_version_id: string; safe_excerpt?: string | null; source_locator: string; excerpt_hash: string }>(
    'enterprise_evidence_candidates',
    `select=id,value,source_version_id,safe_excerpt,source_locator,excerpt_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(candidateId)}`,
  );
  if (!current) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  const sourceVersion = await findOne<{ content_hash: string; extracted_text_hash?: string | null }>(
    'enterprise_evidence_source_versions',
    `select=content_hash,extracted_text_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(current.source_version_id)}`,
  );
  if (!sourceVersion) throw new EnterpriseCommandError('RESOURCE_STALE');
  const nextValue = status === 'edited' ? requireString(payload.value, 12_000) : current.value;
  const reason = status === 'edited' ? requireString(payload.reason, 2_000) : 'review decision recorded';
  const nextExcerptHash = await sha256Hex(JSON.stringify({
    sourceVersionId: current.source_version_id,
    sourceContentHash: sourceVersion.content_hash,
    extractedTextHash: sourceVersion.extracted_text_hash || null,
    sourceLocator: current.source_locator,
    safeExcerpt: current.safe_excerpt || null,
    value: nextValue,
  }));
  await rpc('enterprise_review_evidence_candidate', {
    p_candidate_id: candidateId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_value: nextValue,
    p_excerpt_hash: nextExcerptHash,
    p_status: status,
    p_actor: authority.actorId,
    p_previous_value: current.value,
    p_reason: reason,
  });
  return { candidateId, status, reviewedBy: authority.actorId };
};

const assertApprovedApplicationAssessment = async (authority: Authority, payload: JsonObject) => {
  const applicationId = requireUuid(payload.applicationId);
  const assessmentVersionId = requireUuid(payload.assessmentVersionId);
  const row = await findOne<{ id: string; application_id: string; metadata_version_id: string; version: number; lifecycle: string }>(
    'assess_application_assessment_versions',
    `select=id,application_id,metadata_version_id,version,lifecycle&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(assessmentVersionId)}&application_id=eq.${encodeURIComponent(applicationId)}&lifecycle=eq.approved`,
  );
  if (!row) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const review = await findOne<{ reviewer_id: string; resolution: string }>(
    'assess_application_review_resolutions',
    `select=reviewer_id,resolution&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&application_id=eq.${encodeURIComponent(applicationId)}&metadata_version_id=eq.${encodeURIComponent(row.metadata_version_id)}&assessment_version_id=eq.${encodeURIComponent(assessmentVersionId)}&resolution=eq.approved`,
  );
  if (!review || review.reviewer_id === authority.actorId) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const reviewer = await resolveAuthority(review.reviewer_id, authority.organizationId, authority.workspaceId);
  if (!reviewer.permissions.has('assess.applications.review') && !reviewer.isAdmin) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  return row;
};

type CanonicalDimensionRow = {
  dimension: string;
  readiness_band: string;
  evidence_confidence?: string;
  hard_gates?: string[];
  missing_evidence?: string[];
};

const canonicalBand = (row: CanonicalDimensionRow | undefined): ModernizationFactors[keyof ModernizationFactors] => {
  if (!row || row.evidence_confidence === 'Insufficient Evidence' || (row.missing_evidence?.length || 0) > 0) return 'unknown';
  if (row.readiness_band === 'Ready') return 'high';
  if (row.readiness_band === 'Conditionally Ready') return 'medium';
  if (row.readiness_band === 'Blocked') return 'low';
  return 'unknown';
};

const deriveModernizationFactors = async (authority: Authority, assessment: { id: string; application_id: string; metadata_version_id: string }) => {
  const [dimensions, recommendation, metadata, upstream, downstream] = await Promise.all([
    postgrest<CanonicalDimensionRow[]>(`assess_application_dimension_results?select=dimension,readiness_band,evidence_confidence,hard_gates,missing_evidence&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&assessment_version_id=eq.${encodeURIComponent(assessment.id)}`, { method: 'GET' }),
    findOne<{ disposition: string }>('assess_application_modernization_recommendations', `select=disposition&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&assessment_version_id=eq.${encodeURIComponent(assessment.id)}&application_id=eq.${encodeURIComponent(assessment.application_id)}&metadata_version_id=eq.${encodeURIComponent(assessment.metadata_version_id)}`),
    findOne<{ metadata: JsonObject }>('assess_application_metadata_versions', `select=metadata&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(assessment.metadata_version_id)}&application_id=eq.${encodeURIComponent(assessment.application_id)}`),
    postgrest<Array<{ id: string }>>(`assess_application_dependencies?select=id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&downstream_application_id=eq.${encodeURIComponent(assessment.application_id)}&metadata_version_id=eq.${encodeURIComponent(assessment.metadata_version_id)}`, { method: 'GET' }),
    postgrest<Array<{ id: string }>>(`assess_application_dependencies?select=id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&upstream_application_id=eq.${encodeURIComponent(assessment.application_id)}&metadata_version_id=eq.${encodeURIComponent(assessment.metadata_version_id)}`, { method: 'GET' }),
  ]);
  const byDimension = new Map(dimensions.map(row => [row.dimension, row]));
  const sourceMetadata = metadata?.metadata || {};
  const criticality = sourceMetadata.businessCriticality === 'mission_critical' || sourceMetadata.businessCriticality === 'high'
    ? 'high'
    : sourceMetadata.businessCriticality === 'medium'
      ? 'medium'
      : sourceMetadata.businessCriticality === 'low'
        ? 'low'
        : 'unknown';
  const disposition = recommendation?.disposition || '';
  const fit = disposition.includes('Enable native') ? 'high' : disposition.includes('Insufficient') || disposition.includes('Blocked') ? 'unknown' : 'medium';
  const factors: ModernizationFactors = {
    criticality,
    fit,
    ux: canonicalBand(byDimension.get('ui_automation_readiness')),
    techHealth: canonicalBand(byDimension.get('architecture_changeability')),
    maintainability: canonicalBand(byDimension.get('architecture_changeability')),
    architecture: canonicalBand(byDimension.get('architecture_changeability')),
    securityCompliance: canonicalBand(byDimension.get('security_and_control')),
    dataPortability: canonicalBand(byDimension.get('semantic_and_data_clarity')),
    apiIntegration: canonicalBand(byDimension.get('integration_accessibility')),
    cloudFit: 'unknown',
    agentFit: canonicalBand(byDimension.get('ai_assisted_engineering_readiness')),
    vendorLockIn: 'unknown',
    costTco: 'unknown',
    operatingRisk: canonicalBand(byDimension.get('state_and_execution')),
    skills: 'unknown',
    changeEffort: 'unknown',
    timeToValue: 'unknown',
    dependencyRisk: upstream.length + downstream.length > 0 ? 'medium' : 'low',
  };
  return { factors, sourceDecisionModelVersion: 'assess-v2-application-portfolio-2026-07' };
};

const commandModernizationEvaluate = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'portfolio.manage');
  const assessment = await assertApprovedApplicationAssessment(authority, payload);
  const { factors, sourceDecisionModelVersion } = await deriveModernizationFactors(authority, assessment);
  const decision = evaluateModernizationDecision({
    assessmentId: assessment.id,
    assessmentVersion: String(assessment.version),
    factors,
  });
  const modernizationAssessmentId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  await rpc('enterprise_commit_modernization_assessment', {
    p_assessment: {
      id: modernizationAssessmentId,
      org_id: authority.organizationId,
      workspace_id: authority.workspaceId,
      application_ref: assessment.application_id,
      application_version: assessment.version,
      source_assessment_id: assessment.id,
      source_assessment_version: assessment.version,
      source_metadata_version_id: assessment.metadata_version_id,
      factor_bands: decision.factorBands,
      model_version: decision.modelVersion,
      source_decision_model_version: sourceDecisionModelVersion,
      status: 'review',
      created_by: authority.actorId,
    },
    p_decision: {
      id: decisionId,
      org_id: authority.organizationId,
      workspace_id: authority.workspaceId,
      primary_disposition: decision.primaryDisposition,
      alternative_disposition: decision.alternativeDisposition || null,
      eligible_dispositions: decision.eligibleDispositions,
      blockers: decision.blockers,
      conflicts: decision.conflicts,
      status: 'review',
      created_by: authority.actorId,
    },
  });
  return { modernizationAssessmentId, decisionId, decision };
};

type ResourceAuthority = { created_by: string; status: string; table: string; id: string; snapshotHash: string };

const resolveApprovalResource = async (authority: Authority, resourceType: string, resourceId: string): Promise<ResourceAuthority> => {
  const tableByType: Record<string, string> = {
    modernization_decision: 'enterprise_modernization_decisions',
    delivery_work_package: 'enterprise_delivery_work_packages',
    monitor_baseline: 'enterprise_monitor_baselines',
    assemble_blueprint: 'enterprise_assemble_blueprints',
    evidence_candidate: 'enterprise_evidence_candidates',
  };
  const table = tableByType[resourceType];
  if (!table) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const selectByType: Record<string, string> = {
    evidence_candidate: 'id,created_by,suggestion_status,value,safe_excerpt,excerpt_hash,source_locator,source_version_id',
    modernization_decision: 'id,created_by,status,modernization_assessment_id,primary_disposition,eligible_dispositions,blockers,conflicts',
    delivery_work_package: 'id,created_by,status,current_version,handoff_id',
    monitor_baseline: 'id,created_by,status,readiness,approved_item_ids,work_package_version_id,studio_content_hash',
    assemble_blueprint: 'id,created_by,status,version,disposition,structured_content',
  };
  const row = await findOne<JsonObject>(
    table,
    `select=${selectByType[resourceType]}&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(resourceId)}`,
  );
  if (!row || typeof row.id !== 'string' || typeof row.created_by !== 'string') throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  const status = typeof row.status === 'string' ? row.status : typeof row.suggestion_status === 'string' ? row.suggestion_status : 'review';
  return { id: row.id, created_by: row.created_by, status, table, snapshotHash: await sha256Json({ resourceType, row }) };
};

const commandApprovalReviewRecord = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'approvals.review');
  const resourceType = requireString(payload.resourceType, 80);
  const resourceId = requireUuid(payload.resourceId);
  const resource = await resolveApprovalResource(authority, resourceType, resourceId);
  const rationale = requireString(payload.rationale, 4_000);
  if (resource.created_by === authority.actorId) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  if (['approved', 'rejected', 'stale', 'blocked'].includes(resource.status)) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const reviewEventId = crypto.randomUUID();
  await insertRow('enterprise_high_impact_review_events', {
    id: reviewEventId,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    resource_type: resourceType,
    resource_id: resourceId,
    reviewer_id: authority.actorId,
    reviewer_authorization_version: authority.authorizationVersion,
    resource_hash: resource.snapshotHash,
    rationale,
  });
  return { reviewEventId, resourceType, resourceId, reviewerId: authority.actorId, resourceHash: resource.snapshotHash };
};

const commandApprovalRecord = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'approvals.review');
  const resourceType = requireString(payload.resourceType, 80);
  const resourceId = requireUuid(payload.resourceId);
  const resource = await resolveApprovalResource(authority, resourceType, resourceId);
  const approvedBy = authority.actorId;
  if (resource.created_by === approvedBy) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const reviewEvent = await findOne<{ id: string; reviewer_id: string; reviewer_authorization_version: number; resource_hash: string }>(
    'enterprise_high_impact_review_events',
    `select=id,reviewer_id,reviewer_authorization_version,resource_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&resource_type=eq.${encodeURIComponent(resourceType)}&resource_id=eq.${encodeURIComponent(resourceId)}&resource_hash=eq.${encodeURIComponent(resource.snapshotHash)}&reviewer_id=neq.${encodeURIComponent(approvedBy)}&order=created_at.desc`,
  );
  if (!reviewEvent || reviewEvent.resource_hash !== resource.snapshotHash) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const reviewer = await resolveAuthority(reviewEvent.reviewer_id, authority.organizationId, authority.workspaceId);
  if (
    reviewer.actorId === approvedBy
    || reviewer.actorId === resource.created_by
    || reviewer.authorizationVersion !== reviewEvent.reviewer_authorization_version
    || (!reviewer.permissions.has('approvals.review') && !reviewer.isAdmin)
  ) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const rationale = requireString(payload.rationale, 4_000);
  const outcome = payload.outcome;
  if (outcome !== 'approved' && outcome !== 'rejected') throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const nextStatus = outcome === 'approved' ? 'approved' : 'rejected';
  await rpc('enterprise_commit_high_impact_approval', {
    p_approval: {
      created_by: resource.created_by,
      reviewed_by: reviewEvent.reviewer_id,
      approved_by: approvedBy,
      review_event_id: reviewEvent.id,
      outcome,
      rationale,
    },
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_next_status: nextStatus,
  });
  return { resourceType, resourceId, status: nextStatus, reviewedBy: reviewEvent.reviewer_id, approvedBy };
};

type StudioAggregateRow = {
  id: string;
  artifact_type: 'brd' | 'frd' | 'pdd';
  current_approved_version_id: string | null;
  lifecycle: string;
};
type StudioVersionRow = { id: string; version: number; content: JsonObject; content_hash: string; lifecycle: string };

const extractStudioSections = (content: JsonObject, artifactType: string) => {
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const mapped = sections.flatMap((section, index) => {
    if (!isRecord(section)) return [];
    const title = typeof section.title === 'string' ? section.title : `${artifactType} section ${index + 1}`;
    const summary = typeof section.content === 'string' ? section.content.slice(0, 4_000) : JSON.stringify(section).slice(0, 4_000);
    return [{ locator: `${artifactType}.sections.${index + 1}`, title, summary }];
  });
  return mapped.length ? mapped : [{ locator: `${artifactType}.root`, title: `${artifactType.toUpperCase()} handoff`, summary: 'Review the approved Studio document content and define governed delivery work.' }];
};

const commandStudioDeliveryHandoff = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'docs.approve');
  const studioDocumentId = requireUuid(payload.studioDocumentId);
  const requestedVersion = Number(payload.studioVersion);
  const requestedHash = requireString(payload.studioContentHash, 64);
  if (!Number.isInteger(requestedVersion) || requestedVersion <= 0 || !/^[0-9a-f]{64}$/.test(requestedHash)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const aggregate = await findOne<StudioAggregateRow>(
    'studio_artifact_aggregates',
    `select=id,artifact_type,current_approved_version_id,lifecycle&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(studioDocumentId)}`,
  );
  if (!aggregate || !aggregate.current_approved_version_id || aggregate.lifecycle !== 'approved') throw new EnterpriseCommandError('RESOURCE_STALE');
  const version = await findOne<StudioVersionRow>(
    'studio_artifact_versions',
    `select=id,version,content,content_hash,lifecycle&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(aggregate.current_approved_version_id)}&artifact_id=eq.${encodeURIComponent(studioDocumentId)}`,
  );
  if (!version || version.id !== aggregate.current_approved_version_id || version.version !== requestedVersion || version.content_hash !== requestedHash || version.lifecycle !== 'approved') {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  const approvedDocument = {
    documentId: studioDocumentId,
    version: version.version,
    contentHash: version.content_hash,
    artifactType: aggregate.artifact_type,
    lifecycle: 'approved' as const,
  };
  const workPackageId = crypto.randomUUID();
  const draft = buildDeliveryWorkPackageDraft({
    packageId: workPackageId,
    approvedDocument,
    currentApprovedDocument: approvedDocument,
    sourceSections: extractStudioSections(version.content, aggregate.artifact_type),
  });
  const handoffId = crypto.randomUUID();
  const handoffRecord = {
    id: handoffId,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    studio_document_id: studioDocumentId,
    studio_version_id: version.id,
    studio_version: version.version,
    studio_content_hash: version.content_hash,
    artifact_type: aggregate.artifact_type,
    source_status: 'approved',
    source_snapshot: { artifactType: aggregate.artifact_type, version: version.version, contentHash: version.content_hash, sectionCount: draft.items.length },
    status: draft.status === 'draft' ? 'draft' : 'blocked',
    created_by: authority.actorId,
  };
  const packageRecord = {
    id: workPackageId,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    handoff_id: handoffId,
    current_version: 1,
    status: draft.status,
    created_by: authority.actorId,
  };
  const packageVersionId = crypto.randomUUID();
  const itemIds = new Map<string, string>();
  draft.items.forEach(item => itemIds.set(item.id, crypto.randomUUID()));
  const persistedItems = await Promise.all(draft.items.map(async item => ({
    ...item,
    id: itemIds.get(item.id) || item.id,
    parentId: item.parentId ? itemIds.get(item.parentId) || undefined : undefined,
    idempotencyKey: await sha256Json({ packageVersionId, itemId: item.id, source: item.sourceSectionLocator }),
    createdBy: authority.actorId,
  })));
  const packageContent = {
    ...draft,
    items: persistedItems,
    idempotencyKey: await sha256Json({ studioDocumentId, studioVersion: version.version, studioContentHash: version.content_hash, sections: extractStudioSections(version.content, aggregate.artifact_type) }),
  };
  const versionRecord = {
    id: packageVersionId,
    work_package_id: workPackageId,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    version: 1,
    studio_document_id: studioDocumentId,
    artifact_type: aggregate.artifact_type,
    studio_version_id: version.id,
    studio_version: version.version,
    studio_content_hash: version.content_hash,
    content: packageContent,
    content_hash: await sha256Json(packageContent),
    status: draft.status,
    created_by: authority.actorId,
  };
  await rpc('enterprise_commit_delivery_handoff', {
    p_handoff: handoffRecord,
    p_package: packageRecord,
    p_version: versionRecord,
    p_items: persistedItems,
  });
  return { handoffId, workPackageId, packageVersionId, itemIds: Array.from(itemIds.values()), source: approvedDocument, status: draft.status, itemCount: draft.items.length, requiresHumanReview: true };
};

type PackageVersionRow = {
  id: string;
  work_package_id: string;
  studio_document_id: string;
  artifact_type: 'brd' | 'frd' | 'pdd';
  studio_version: number;
  studio_content_hash: string;
  content: JsonObject;
  status: string;
};

const commandMonitorBaselineCreate = async (authority: Authority, payload: JsonObject) => {
  requirePermission(authority, 'monitor.manage');
  const packageVersionId = requireUuid(payload.packageVersionId);
  const version = await findOne<PackageVersionRow>(
    'enterprise_delivery_work_package_versions',
    `select=id,work_package_id,studio_document_id,artifact_type,studio_version,studio_content_hash,content,status&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(packageVersionId)}`,
  );
  if (!version) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  if (version.status !== 'approved') throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const itemRows = await postgrest<Array<{
    id: string;
    item_type: string;
    title: string;
    description: string;
    acceptance_criteria: unknown;
    non_functional_requirements: unknown;
    source_section_locator: string;
  }>>(
    `enterprise_delivery_work_items?select=id,item_type,title,description,acceptance_criteria,non_functional_requirements,source_section_locator&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&package_version_id=eq.${encodeURIComponent(packageVersionId)}`,
    { method: 'GET' },
  );
  const workPackage = {
    idempotencyKey: stableFingerprint(packageVersionId),
    source: { documentId: version.studio_document_id, version: version.studio_version, contentHash: version.studio_content_hash, artifactType: version.artifact_type, lifecycle: 'approved' as const },
    status: 'draft' as const,
    items: itemRows.map(item => ({
      id: item.id,
      itemType: item.item_type as any,
      title: item.title,
      description: item.description,
      acceptanceCriteria: Array.isArray(item.acceptance_criteria) ? item.acceptance_criteria.filter((value): value is string => typeof value === 'string') : [],
      nonFunctionalRequirements: Array.isArray(item.non_functional_requirements) ? item.non_functional_requirements.filter((value): value is string => typeof value === 'string') : [],
      sourceSectionLocator: item.source_section_locator,
      sourceDocumentId: version.studio_document_id,
      sourceDocumentVersion: version.studio_version,
      sourceDocumentHash: version.studio_content_hash,
    })),
    blockers: [],
    requiresHumanReview: true as const,
    canPublish: false as const,
  };
  const baseline = buildMonitorBaseline({ id: crypto.randomUUID(), workPackageId: version.work_package_id, workPackage, approvedItemIds: Array.isArray(payload.approvedItemIds) ? payload.approvedItemIds.filter((value): value is string => typeof value === 'string') : [] });
  await insertRow('enterprise_monitor_baselines', {
    id: baseline.id,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    work_package_id: version.work_package_id,
    work_package_version_id: packageVersionId,
    studio_document_id: baseline.sourceDocumentId,
    studio_version: baseline.sourceDocumentVersion,
    studio_content_hash: baseline.sourceDocumentHash,
    approved_item_ids: baseline.approvedItemIds,
    milestones: baseline.milestones,
    dependencies: baseline.dependencies,
    blockers: baseline.blockers,
    risks: baseline.risks,
    readiness: baseline.readiness,
    status: baseline.status,
    live_telemetry_connected: false,
    created_by: authority.actorId,
  });
  return baseline;
};

const commandAssembleBlueprintCreate = async (authority: Authority, payload: JsonObject): Promise<AssembleBlueprintDraft> => {
  requirePermission(authority, 'assemble.manage');
  const decisionId = requireUuid(payload.modernizationDecisionId);
  const decision = await findOne<{ id: string; primary_disposition: ModernizationDisposition; status: string }>(
    'enterprise_modernization_decisions',
    `select=id,primary_disposition,status&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(decisionId)}`,
  );
  if (!decision || decision.status !== 'approved' || !ASSEMBLE_ELIGIBLE_DISPOSITIONS.includes(decision.primary_disposition)) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const blueprint = buildAssembleBlueprintDraft({
    blueprintId: crypto.randomUUID(),
    modernizationDecisionId: decision.id,
    disposition: decision.primary_disposition,
    name: requireString(payload.name, 240),
  });
  await insertRow('enterprise_assemble_blueprints', {
    id: blueprint.id,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    modernization_decision_id: decision.id,
    disposition: blueprint.disposition,
    schema_version: blueprint.schemaVersion,
    version: 1,
    structured_content: blueprint,
    readable_document: blueprint.readableDocument,
    status: 'draft',
    code_generation_enabled: false,
    deployment_enabled: false,
    infrastructure_changes_enabled: false,
    credential_access_enabled: false,
    source_system_calls_enabled: false,
    runtime_agents_enabled: false,
    created_by: authority.actorId,
  });
  return blueprint;
};

const executeEnterpriseCommand = async (authority: Authority, envelope: EnterpriseCommandEnvelope) => {
  const commandCapabilities: Record<EnterpriseCommandType, string[]> = {
    'provider.register': ['byok.manage', 'security.manage'],
    'provider.route.toggle': ['byok.manage', 'security.manage'],
    'evidence.source.create': ['evidence.write'],
    'evidence.extract': ['evidence.write'],
    'evidence.candidate.review': ['evidence.review'],
    'modernization.evaluate': ['portfolio.manage'],
    'approval.review.record': ['approvals.review'],
    'approval.record': ['approvals.review'],
    'studio.delivery.handoff': ['docs.approve'],
    'monitor.baseline.create': ['monitor.manage'],
    'assemble.blueprint.create': ['assemble.manage'],
  };
  await assertFreshAuthority(authority, commandCapabilities[envelope.commandType]);
  switch (envelope.commandType) {
    case 'provider.register': return commandProviderRegister(authority, envelope.payload);
    case 'provider.route.toggle': return commandProviderRouteToggle(authority, envelope.payload);
    case 'evidence.source.create': return commandEvidenceSourceCreate(authority, envelope.payload);
    case 'evidence.extract': return commandEvidenceExtract(authority, envelope.payload);
    case 'evidence.candidate.review': return commandEvidenceCandidateReview(authority, envelope.payload);
    case 'modernization.evaluate': return commandModernizationEvaluate(authority, envelope.payload);
    case 'approval.review.record': return commandApprovalReviewRecord(authority, envelope.payload);
    case 'approval.record': return commandApprovalRecord(authority, envelope.payload);
    case 'studio.delivery.handoff': return commandStudioDeliveryHandoff(authority, envelope.payload);
    case 'monitor.baseline.create': return commandMonitorBaselineCreate(authority, envelope.payload);
    case 'assemble.blueprint.create': return commandAssembleBlueprintCreate(authority, envelope.payload);
  }
};

export const enterpriseCommandErrorBody = (error: EnterpriseCommandError) => ({
  ok: false,
  error: { code: error.code, message: 'The Enterprise Intelligence command could not be completed.' },
});

export const handleEnterpriseIntelligenceRequest = async (request: Request) => {
  if (request.method !== 'POST') return jsonResponse(enterpriseCommandErrorBody(new EnterpriseCommandError('METHOD_NOT_ALLOWED')), 405);
  let claimedReceipt: ReceiptRow | null = null;
  let claimedAuthority: Authority | null = null;
  try {
    const user = await getAuthUser(request);
    const body = await request.json();
    const envelope = parseEnterpriseCommandEnvelope(body);
    const organizationId = await resolveOrgId(user.id, envelope.organizationId);
    if (organizationId !== envelope.organizationId) throw new EnterpriseCommandError('TENANT_ACCESS_DENIED');
    const authority = await resolveAuthority(user.id, organizationId, envelope.workspaceId);
    const requestHash = await sha256Json({ ...envelope, requestId: null });
    const existing = await findReceipt(authority, envelope);
    if (existing && existing.request_hash !== requestHash) throw new EnterpriseCommandError('IDEMPOTENCY_CONFLICT', 409);
    if (existing?.status === 'committed') {
      return jsonResponse({ ok: true, replayed: true, ...(existing.response || {}), resourceId: existing.resource_id || undefined });
    }
    if (existing?.status === 'failed' || existing?.status === 'blocked') {
      return jsonResponse({ ...(existing.response || enterpriseCommandErrorBody(new EnterpriseCommandError('COMMAND_BLOCKED'))), replayed: true }, 409);
    }
    if (existing?.status === 'claimed') throw new EnterpriseCommandError('COMMAND_IN_PROGRESS');
    const receipt = await claimReceipt(authority, envelope, requestHash);
    if (receipt.status === 'committed') {
      return jsonResponse({ ok: true, replayed: true, ...(receipt.response || {}), resourceId: receipt.resource_id || undefined });
    }
    if (receipt.status !== 'claimed') throw new EnterpriseCommandError('COMMAND_IN_PROGRESS');
    if (receipt.request_id !== envelope.requestId) throw new EnterpriseCommandError('COMMAND_IN_PROGRESS');
    claimedReceipt = receipt;
    claimedAuthority = authority;
    const result = await executeEnterpriseCommand(authority, envelope);
    const resultObject: JsonObject = isRecord(result) ? result : { result };
    const resourceId = typeof resultObject.id === 'string'
      ? resultObject.id
      : typeof resultObject.sourceId === 'string'
        ? resultObject.sourceId
        : typeof resultObject.providerConfigId === 'string'
          ? resultObject.providerConfigId
          : typeof resultObject.workPackageId === 'string'
            ? resultObject.workPackageId
            : typeof resultObject.decisionId === 'string'
              ? resultObject.decisionId
              : undefined;
    await completeReceipt(receipt, authority, resultObject, resourceId);
    return jsonResponse({ ok: true, replayed: false, ...resultObject });
  } catch (error) {
    const commandError = error instanceof EnterpriseCommandError ? error : new EnterpriseCommandError('COMMAND_UNAVAILABLE');
    if (claimedReceipt && claimedAuthority) {
      await failReceipt(claimedReceipt, claimedAuthority, enterpriseCommandErrorBody(commandError), commandError.code === 'PERMISSION_DENIED' || commandError.code === 'TENANT_ACCESS_DENIED' || commandError.code === 'COMMAND_BLOCKED');
    }
    return jsonResponse(enterpriseCommandErrorBody(commandError), commandError.status);
  }
};

export const handleEnterpriseIntelligenceOptions = (request: Request) => handleOptions(request);
