import type { EnterpriseAiProvider, EnterpriseAiCapability } from '../../../services/enterpriseIntelligence.ts';
import { ENTERPRISE_AI_CAPABILITIES, ENTERPRISE_AI_PROVIDERS } from '../../../services/enterpriseIntelligence.ts';
import {
  isAllowedProviderEndpoint,
  validateProviderConnection,
} from './enterpriseIntelligenceAi.ts';
import {
  ENTERPRISE_PROVIDER_VALIDATION_MAX_AGE_MS,
  resolveEnterpriseProviderRoute,
  type EnterpriseProviderRouteResolverDeps,
} from './providerResolver.ts';
import {
  createProviderSecretBackend,
  createProviderSecretReference,
  fingerprintProviderSecret,
  isAllowedProviderSecretRef,
  resolveProviderSecretForDecision,
  type ProviderSecretBackend,
} from './providerSecretAdapter.ts';
import { postgrest, rpc, supabaseRpcErrorHasSignal } from './supabase.ts';

type JsonObject = Record<string, unknown>;

export type ProviderLifecycleOperation =
  | 'provider.register'
  | 'provider.secret.bind'
  | 'provider.validate'
  | 'provider.activate'
  | 'provider.route.toggle'
  | 'provider.secret.rotate'
  | 'provider.revoke';

export type ProviderLifecycleAuthority = {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  organizationCapabilities: Set<string>;
  workspaceCapabilities: Set<string>;
  organizationRoleNames: Set<string>;
  workspaceRoleNames: Set<string>;
  organizationRoleIds: Set<string>;
  workspaceRoleIds: Set<string>;
  eligibleRouteRoleIds: Set<string>;
};

export type ProviderLifecycleExecutionContext = {
  receiptId: string;
  executionToken: string;
  executionFence: number;
  plan: JsonObject;
  persistPlan(plan: JsonObject): Promise<JsonObject>;
};

export type ProviderLifecycleKeyRef = {
  id: string;
  provider: EnterpriseAiProvider;
  resolverType: 'server_reference';
  secretRef: string;
  safeFingerprint?: string | null;
  status: string;
};

export type ProviderLifecycleConfig = {
  id: string;
  organizationId: string;
  provider: EnterpriseAiProvider;
  status: string;
  endpoint?: string;
  deployment?: string;
  defaultModel: string;
  modelAllowlist: string[];
  lastValidatedAt?: string | null;
  keyRef?: ProviderLifecycleKeyRef | null;
};

export type ProviderLifecycleDatabase = {
  loadConfig(input: { organizationId: string; providerConfigId: string }): Promise<ProviderLifecycleConfig | null>;
  transition(input: {
    operation: ProviderLifecycleOperation;
    authority: ProviderLifecycleAuthority;
    payload: JsonObject;
    execution?: Pick<ProviderLifecycleExecutionContext, 'receiptId' | 'executionToken' | 'executionFence'> & { result: JsonObject };
  }): Promise<JsonObject>;
};

export type ProviderLifecycleDeps = {
  database: ProviderLifecycleDatabase;
  secretBackend: ProviderSecretBackend;
  routeResolverDeps: EnterpriseProviderRouteResolverDeps;
  validateConnection: typeof validateProviderConnection;
  now: () => Date;
  randomId: () => string;
};

export class ProviderLifecycleError extends Error {
  constructor(public readonly code:
    | 'INVALID_REQUEST'
    | 'TENANT_ACCESS_DENIED'
    | 'PERMISSION_DENIED'
    | 'RESOURCE_NOT_FOUND'
    | 'RESOURCE_CONFLICT'
    | 'SECRET_BACKEND_REQUIRED'
    | 'SECRET_UNAVAILABLE'
    | 'VALIDATION_FAILED'
    | 'PROVIDER_BLOCKED'
    | 'PERSISTENCE_UNAVAILABLE'
    | 'AUTHORIZATION_STALE'
    | 'IDEMPOTENCY_CONFLICT'
    | 'COMMAND_IN_PROGRESS'
    | 'RECEIPT_FINALIZATION_FAILED') {
    super(code);
    this.name = 'ProviderLifecycleError';
  }
}

const isRecord = (value: unknown): value is JsonObject => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const requireString = (value: unknown, max = 512) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ProviderLifecycleError('INVALID_REQUEST');
  return value.trim();
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requireUuid = (value: unknown) => {
  const result = requireString(value, 128);
  if (!uuid.test(result)) throw new ProviderLifecycleError('INVALID_REQUEST');
  return result;
};
const requireProvider = (value: unknown) => {
  const provider = requireString(value, 64) as EnterpriseAiProvider;
  if (!ENTERPRISE_AI_PROVIDERS.includes(provider)) throw new ProviderLifecycleError('INVALID_REQUEST');
  return provider;
};
const requireCapabilities = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > ENTERPRISE_AI_CAPABILITIES.length) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  const capabilities = value.map(item => requireString(item, 120) as EnterpriseAiCapability);
  if (capabilities.some(item => !ENTERPRISE_AI_CAPABILITIES.includes(item))) throw new ProviderLifecycleError('INVALID_REQUEST');
  return [...new Set(capabilities)];
};
const requireRoles = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) throw new ProviderLifecycleError('INVALID_REQUEST');
  const roles = value.map(item => requireString(item, 120).toLowerCase());
  if (roles.some(role => !/^[a-z0-9][a-z0-9 _.-]{0,119}$/.test(role))) throw new ProviderLifecycleError('INVALID_REQUEST');
  return [...new Set(roles)];
};
const requireBudget = (value: unknown) => {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'dailyRequests' && key !== 'monthlyTokens')) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  const budget: { dailyRequests?: number; monthlyTokens?: number } = {};
  for (const key of ['dailyRequests', 'monthlyTokens'] as const) {
    const limit = value[key];
    if (limit === undefined) continue;
    if (!Number.isSafeInteger(limit) || Number(limit) < 1) throw new ProviderLifecycleError('INVALID_REQUEST');
    budget[key] = Number(limit);
  }
  return budget;
};

const requireManager = (authority: ProviderLifecycleAuthority, secretMutation = false) => {
  if (authority.organizationCapabilities.has('org.admin')) return;
  const byok = authority.organizationCapabilities.has('byok.manage');
  const security = authority.organizationCapabilities.has('security.manage');
  if (secretMutation ? byok && security : byok || security) return;
  throw new ProviderLifecycleError('PERMISSION_DENIED');
};

const requireWorkspaceManager = (authority: ProviderLifecycleAuthority) => {
  if (authority.organizationCapabilities.has('org.admin')) return;
  if (authority.workspaceCapabilities.has('byok.manage') || authority.workspaceCapabilities.has('security.manage')) return;
  throw new ProviderLifecycleError('PERMISSION_DENIED');
};

const assertConfigScope = (config: ProviderLifecycleConfig | null, authority: ProviderLifecycleAuthority) => {
  if (!config) throw new ProviderLifecycleError('RESOURCE_NOT_FOUND');
  if (config.organizationId !== authority.organizationId) throw new ProviderLifecycleError('TENANT_ACCESS_DENIED');
  return config;
};

const isFreshValidation = (value: string | null | undefined, now: Date) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    && timestamp <= now.getTime()
    && now.getTime() - timestamp <= ENTERPRISE_PROVIDER_VALIDATION_MAX_AGE_MS;
};

export const assertProviderLifecycleOperationAuthority = (
  operation: ProviderLifecycleOperation,
  authority: ProviderLifecycleAuthority,
) => {
  if (operation === 'provider.route.toggle') requireWorkspaceManager(authority);
  else requireManager(
    authority,
    operation === 'provider.secret.bind'
      || operation === 'provider.secret.rotate'
      || operation === 'provider.revoke',
  );
  if (authority.organizationRoleNames.size === 0 && authority.workspaceRoleNames.size === 0) {
    throw new ProviderLifecycleError('PERMISSION_DENIED');
  }
};

export const mapProviderLifecycleRpcError = (error: unknown): ProviderLifecycleError => {
  if (supabaseRpcErrorHasSignal(error, 'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE', 'PR1B_AUTHORIZATION_STALE')) {
    return new ProviderLifecycleError('AUTHORIZATION_STALE');
  }
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_PROVIDER_ORGANIZATION_AUTHORITY_REQUIRED',
    'ENTERPRISE_PROVIDER_WORKSPACE_AUTHORITY_REQUIRED',
    'ENTERPRISE_PROVIDER_PERMISSION_DENIED',
  )) return new ProviderLifecycleError('PERMISSION_DENIED');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT',
    'ENTERPRISE_AI_EXECUTION_PLAN_CONFLICT',
  )) return new ProviderLifecycleError('IDEMPOTENCY_CONFLICT');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_AI_STALE_EXECUTION_FENCE',
    'ENTERPRISE_AI_COMMAND_NOT_EXECUTABLE',
    'ENTERPRISE_AI_RECEIPT_NOT_CLAIMED',
  )) return new ProviderLifecycleError('COMMAND_IN_PROGRESS');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_INTELLIGENCE_PROVIDER_DISABLED',
    'ENTERPRISE_PROVIDER_NOT_AVAILABLE',
    'ENTERPRISE_PROVIDER_VALIDATION_STALE',
  )) return new ProviderLifecycleError('PROVIDER_BLOCKED');
  return new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
};

const safeTransition = async (
  deps: ProviderLifecycleDeps,
  operation: ProviderLifecycleOperation,
  authority: ProviderLifecycleAuthority,
  payload: JsonObject,
  result: JsonObject,
  execution?: ProviderLifecycleExecutionContext,
) => {
  try {
    const transition = await deps.database.transition({
      operation,
      authority,
      payload,
      execution: execution ? {
        receiptId: execution.receiptId,
        executionToken: execution.executionToken,
        executionFence: execution.executionFence,
        result,
      } : undefined,
    });
    if (!isRecord(transition)) throw new Error('invalid transition response');
    return transition;
  } catch (error) {
    if (error instanceof ProviderLifecycleError) throw error;
    throw mapProviderLifecycleRpcError(error);
  }
};

const loadConfig = async (deps: ProviderLifecycleDeps, authority: ProviderLifecycleAuthority, value: unknown) => assertConfigScope(
  await deps.database.loadConfig({ organizationId: authority.organizationId, providerConfigId: requireUuid(value) }),
  authority,
);

const resolveBoundSecret = async (
  config: ProviderLifecycleConfig,
  authority: ProviderLifecycleAuthority,
  deps: ProviderLifecycleDeps,
) => {
  if (!config.keyRef || config.keyRef.status === 'retired' || config.keyRef.status === 'expired') {
    throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
  }
  if (!isAllowedProviderSecretRef(config.provider, config.keyRef.secretRef, authority.organizationId)) {
    throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
  }
  try {
    const value = await deps.secretBackend.resolve({
      provider: config.provider,
      secretRef: config.keyRef.secretRef,
      organizationId: authority.organizationId,
    });
    if (!value) throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
    return value;
  } catch (error) {
    if (error instanceof ProviderLifecycleError) throw error;
    throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
  }
};

const persistExecutionPlan = async (
  execution: ProviderLifecycleExecutionContext | undefined,
  additions: JsonObject,
) => {
  if (!execution) return additions;
  const next = { ...execution.plan, ...additions };
  execution.plan = await execution.persistPlan(next);
  return execution.plan;
};

const writeOrResolveSecret = async (
  provider: EnterpriseAiProvider,
  authority: ProviderLifecycleAuthority,
  payload: JsonObject,
  deps: ProviderLifecycleDeps,
  execution?: ProviderLifecycleExecutionContext,
  protectedSecretReference?: string,
) => {
  const raw = typeof payload.providerKey === 'string' ? payload.providerKey : undefined;
  const preProvisioned = typeof payload.preProvisionedReference === 'string'
    ? payload.preProvisionedReference.trim()
    : undefined;
  if (Boolean(raw) === Boolean(preProvisioned)) throw new ProviderLifecycleError('INVALID_REQUEST');
  if (raw) {
    if (!deps.secretBackend.writable || !deps.secretBackend.write || !deps.secretBackend.remove) {
      throw new ProviderLifecycleError('SECRET_BACKEND_REQUIRED');
    }
    if (raw.length < 8 || raw.length > 16_384) throw new ProviderLifecycleError('INVALID_REQUEST');
    const fingerprint = await fingerprintProviderSecret(raw);
    if (execution?.plan.safeFingerprint && execution.plan.safeFingerprint !== fingerprint) {
      throw new ProviderLifecycleError('RESOURCE_CONFLICT');
    }
    const secretRef = typeof execution?.plan.secretReference === 'string'
      ? execution.plan.secretReference
      : createProviderSecretReference(provider, authority.organizationId, deps.randomId());
    const keyRefId = typeof execution?.plan.keyRefId === 'string' ? execution.plan.keyRefId : deps.randomId();
    if (!isAllowedProviderSecretRef(provider, secretRef, authority.organizationId)
      || protectedSecretReference === secretRef
      || (execution?.plan.secretOwnership !== undefined && execution.plan.secretOwnership !== 'managed_write')
      || (execution?.plan.secretPlanReceiptId !== undefined && execution.plan.secretPlanReceiptId !== execution.receiptId)
      || (execution?.plan.writeState !== undefined
        && execution.plan.writeState !== 'planned'
        && execution.plan.writeState !== 'written')) {
      throw new ProviderLifecycleError('RESOURCE_CONFLICT');
    }
    const protectedSecretReferenceHash = protectedSecretReference
      ? await fingerprintProviderSecret(protectedSecretReference)
      : undefined;
    if (execution?.plan.protectedSecretReferenceHash !== undefined
      && execution.plan.protectedSecretReferenceHash !== protectedSecretReferenceHash) {
      throw new ProviderLifecycleError('RESOURCE_CONFLICT');
    }
    await persistExecutionPlan(execution, {
      secretOwnership: 'managed_write',
      provider,
      secretReference: secretRef,
      secretPlanReceiptId: execution?.receiptId,
      keyRefId,
      safeFingerprint: fingerprint,
      writeState: execution?.plan.writeState === 'written' ? 'written' : 'planned',
      ...(protectedSecretReferenceHash ? { protectedSecretReferenceHash } : {}),
    });
    const existing = await deps.secretBackend.resolve({ provider, secretRef, organizationId: authority.organizationId });
    if (existing) {
      if (await fingerprintProviderSecret(existing) !== fingerprint) throw new ProviderLifecycleError('RESOURCE_CONFLICT');
      await persistExecutionPlan(execution, { writeState: 'written', externalSecretWritten: true });
      return { provider, secretRef, keyRefId, fingerprint, wrote: false, managed: true, value: existing };
    }
    await deps.secretBackendÛŽ½¶‰žËkºwµçA…Ñ¥‰±”œ¤€˜˜€…•¹‘Á½¥¹Ð¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤ì4(€€€¥˜€¡•¹‘Á½¥¹Ð€˜˜€…¥Í±±½Ý•‘AÉ½Ù¥‘•É¹‘Á½¥¹Ð¡ÁÉ½Ù¥‘•È°•¹‘Á½¥¹Ð¤¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤ì4(€€€½¹ÍÐ‘•Á±½åµ•¹Ð€ôÁ…å±½…¹‘•Á±½åµ•¹Ð€ôôôÕ¹‘•™¥¹•ñðÁ…å±½…¹‘•Á±½åµ•¹Ð€ôôô€œœ€üÕ¹‘•™¥¹•€èÉ•ÅÕ¥É•MÑÉ¥¹œ¡Á…å±½…¹‘•Á±½åµ•¹Ð°€ÈÐÀ¤ì4(€€€¥˜€¡ÁÉ½Ù¥‘•È€ôôô€…éÕÉ•}½Á•¹…¤œ€˜˜€…‘•Á±½åµ•¹Ð¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤ì4(€€€½¹ÍÐ…Á…‰¥±¥Ñ¥•Ì€ôÉ•ÅÕ¥É•…Á…‰¥±¥Ñ¥•Ì¡Á…å±½…¹…Á…‰¥±¥Ñ¥•Ì¤ì4(€€€½¹ÍÐµ½‘•±±±½Ý±¥ÍÐ€ôÉÉ…ä¹¥ÍÉÉ…ä¡Á…å±½…¹µ½‘•±±±½Ý±¥ÍÐ¤4(€€€€€€ül¸¸¹¹•ÜM•Ð¡Á…å±½…¹µ½‘•±±±½Ý±¥ÍÐ¹µ…À¡¥Ñ•´€ôøÉ•ÅÕ¥É•MÑÉ¥¹œ¡¥Ñ•´°€ÈÀÀ¤¤¥t4(€€€€€€èm‘•™…Õ±Ñ5½‘•±tì4(€€€¥˜€¡µ½‘•±±±½Ý±¥ÍÐ¹±•¹Ñ €ø€ØÐñð€…µ½‘•±±±½Ý±¥ÍÐ¹¥¹±Õ‘•Ì¡‘•™…Õ±Ñ5½‘•°¤¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤ì4(€€€½¹ÍÐÁ±…¹¹•‘½¹™¥%€ôÑåÁ•½˜•á•ÕÑ¥½¸ü¹Á±…¸¹ÁÉ½Ù¥‘•É½¹™¥%€ôôô€ÍÑÉ¥¹œœ€ü•á•ÕÑ¥½¸¹Á±…¸¹ÁÉ½Ù¥‘•É½¹™¥%€è‘•ÁÌ¹É…¹‘½µ% ¤ì4(€€€½¹ÍÐÁ±…¹¹•‘I½ÕÑ•%‘Ì€ôÉÉ…ä¹¥ÍÉÉ…ä¡•á•ÕÑ¥½¸ü¹Á±…¸¹É½ÕÑ•%‘Ì¤4(€€€€€€ü•á•ÕÑ¥½¸¹Á±…¸¹É½ÕÑ•%‘Ì¹™¥±Ñ•È ¡Ù…±Õ”¤èÙ…±Õ”¥ÌÍÑÉ¥¹œ€ôøÑåÁ•½˜Ù…±Õ”€ôôô€ÍÑÉ¥¹œœ¤4(€€€€€€èmtì4(€€€¥˜€¡Á±…¹¹•‘I½ÕÑ•%‘Ì¹±•¹Ñ €˜˜Á±…¹¹•‘I½ÕÑ•%‘Ì¹±•¹Ñ €„ôô…Á…‰¥±¥Ñ¥•Ì¹±•¹Ñ ¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È IM=UI}=91%Pœ¤ì4(€€€½¹ÍÐÁÉ½Ù¥‘•É½¹™¥%€ôÁ±…¹¹•‘½¹™¥%ì4(€€€½¹ÍÐÉ½ÕÑ•%‘Ì€ôÁ±…¹¹•‘I½ÕÑ•%‘Ì¹±•¹Ñ €üÁ±…¹¹•‘I½ÕÑ•%‘Ì€è…Á…‰¥±¥Ñ¥•Ì¹µ…À  ¤€ôø‘•ÁÌ¹É…¹‘½µ% ¤¤ì4(€€€…Ý…¥ÐÁ•ÉÍ¥ÍÑá•ÕÑ¥½¹A±…¸¡•á•ÕÑ¥½¸°ìÁÉ½Ù¥‘•É½¹™¥%°É½ÕÑ•%‘Ìô¤ì4(€€€½¹ÍÐ…±±½Ý•‘I½±•Ì€ôÍ••‘•‘I½ÕÑ•I½±•Ì¡…ÕÑ¡½É¥Ñä¤ì4(€€€½¹ÍÐÉ½ÕÑ•Ì€ô…Á…‰¥±¥Ñ¥•Ì¹µ…À ¡…Á…‰¥±¥Ñä°¥¹‘•à¤€ôø€¡ì4(€€€€€¥èÉ½ÕÑ•%‘Ím¥¹‘•át°…Á…‰¥±¥Ñä°µ½‘•°è‘•™…Õ±Ñ5½‘•°°…±±½Ý•‘I½±•Ì°4(€€€ô¤¤ì4(€€€½¹ÍÐÉ•ÍÕ±Ð€ôìÉ•Í½ÕÉ•%èÁÉ½Ù¥‘•É½¹™¥%°ÁÉ½Ù¥‘•É½¹™¥%°ÁÉ½Ù¥‘•È°ÍÑ…ÑÕÌè€Á•¹‘¥¹}É•Ù¥•Üœ°É½ÕÑ•Ìôì(€€€…Ý…¥ÐÍ…™•QÉ…¹Í¥Ñ¥½¸¡‘•ÁÌ°½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°ì4(€€€€€ÁÉ½Ù¥‘•É½¹™¥%°4(€€€€€ÁÉ½Ù¥‘•È°4(€€€€€‘¥ÍÁ±…å9…µ”°4(€€€€€•¹‘Á½¥¹Ðè•¹‘Á½¥¹Ðñð¹Õ±°°4(€€€€€‘•Á±½åµ•¹Ðè‘•Á±½åµ•¹Ðñð¹Õ±°°4(€€€€€‘•™…Õ±Ñ5½‘•°°4(€€€€€µ½‘•±±±½Ý±¥ÍÐ°4(€€€€€…Á…‰¥±¥Ñ¥•Ì°4(€€€€€É½ÕÑ•Ì°4(€€€€€‰Õ‘•ÐèÉ•ÅÕ¥É•	Õ‘•Ð¡Á…å±½…¹‰Õ‘•Ð¤°4(€€€ô°É•ÍÕ±Ð°•á•ÕÑ¥½¸¤ì4(€€€É•ÑÕÉ¸É•ÍÕ±Ðì4(€ô4(4(€½¹ÍÐ½¹™¥œ€ô…Ý…¥Ð±½…‘½¹™¥œ¡‘•ÁÌ°…ÕÑ¡½É¥Ñä°Á…å±½…¹ÁÉ½Ù¥‘•É½¹™¥%¤ì4(€¥˜€¡½¹™¥œ¹ÍÑ…ÑÕÌ€ôôô€É•Ñ¥É•œñð½¹™¥œ¹ÍÑ…ÑÕÌ€ôôô€É•Ù½­•œ¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI=Y%I}	1=-œ¤ì4(4(€¥˜€¡½Á•É…Ñ¥½¸€ôôô€ÁÉ½Ù¥‘•È¹Í•É•Ð¹‰¥¹œ¤ì(€€€¥˜€¡½¹™¥œ¹­•åI•˜¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È IM=UI}=91%Pœ¤ì(€€€…Ý…¥ÐÁ•ÉÍ¥ÍÑá•ÕÑ¥½¹A±…¸¡•á•ÕÑ¥½¸°ìÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥ô¤ì(€€€½¹ÍÐÁÉ•Á…É•€ô…Ý…¥ÐÝÉ¥Ñ•=ÉI•Í½±Ù•M•É•Ð¡½¹™¥œ¹ÁÉ½Ù¥‘•È°…ÕÑ¡½É¥Ñä°Á…å±½…°‘•ÁÌ°•á•ÕÑ¥½¸¤ì(€€€½¹ÍÐ­•åI•™%€ôÁÉ•Á…É•¹­•åI•™%ì4(€€€½¹ÍÐÉ•ÍÕ±Ð€ôìÉ•Í½ÕÉ•%è½¹™¥œ¹¥°ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°­•åI•™%°ÍÑ…ÑÕÌè€Á•¹‘¥¹}É•Ù¥•Üœ°Í…™•¥¹•ÉÁÉ¥¹ÐèÁÉ•Á…É•¹™¥¹•ÉÁÉ¥¹Ðôì(€€€ÑÉäì4(€€€€€…Ý…¥ÐÍ…™•QÉ…¹Í¥Ñ¥½¸¡‘•ÁÌ°½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°ì4(€€€€€€€ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°4(€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€­•åI•™%°4(€€€€€€€Í•É•ÑI•™•É•¹”èÁÉ•Á…É•¹Í•É•ÑI•˜°4(€€€€€€€Í…™•¥¹•ÉÁÉ¥¹ÐèÁÉ•Á…É•¹™¥¹•ÉÁÉ¥¹Ð°4(€€€€€€€‰…­•¹è‘•ÁÌ¹Í•É•Ñ	…­•¹¹­¥¹°4(€€€€€ô°É•ÍÕ±Ð°•á•ÕÑ¥½¸¤ì4(€€€€€É•ÑÕÉ¸É•ÍÕ±Ðì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡•ÉÉ½È¥¹ÍÑ…¹•½˜AÉ½Ù¥‘•É1¥™•å±•ÉÉ½È€˜˜•ÉÉ½È¹½‘”€ôôô€AI5%MM%=9}9%œ¤ì4(€€€€€€€…Ý…¥Ð±•…¹ÕÁA±…¹¹•‘M•É•Ð¡‘•ÁÌ°…ÕÑ¡½É¥Ñä°•á•ÕÑ¥½¸°€AI5%MM%=9}9%œ°ì4(€€€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€€€Í•É•ÑI•˜èÁÉ•Á…É•¹Í•É•ÑI•˜°4(€€€€€€€€€™¥¹•ÉÁÉ¥¹ÐèÁÉ•Á…É•¹™¥¹•ÉÁÉ¥¹Ð°4(€€€€€€€€€ÝÉ½Ñ”èÁÉ•Á…É•¹ÝÉ½Ñ”°4(€€€€€€€€€µ…¹…•èÁÉ•Á…É•¹µ…¹…•°4(€€€€€€€ô¤ì4(€€€€€ô4(€€€€€Ñ¡É½Ü•ÉÉ½Èì4(€€€ô4(€ô4(4(€¥˜€¡½Á•É…Ñ¥½¸€ôôô€ÁÉ½Ù¥‘•È¹Ù…±¥‘…Ñ”œ¤ì4(€€€±•Ð±…ÍÑY…±¥‘…Ñ•‘Ð€ôÑåÁ•½˜•á•ÕÑ¥½¸ü¹Á±…¸¹±…ÍÑY…±¥‘…Ñ•‘Ð€ôôô€ÍÑÉ¥¹œœ€˜˜•á•ÕÑ¥½¸¹Á±…¸¹Ù…±¥‘…Ñ¥½¹MÕ••‘•€ôôôÑÉÕ”4(€€€€€€ü•á•ÕÑ¥½¸¹Á±…¸¹±…ÍÑY…±¥‘…Ñ•‘Ð4(€€€€€€èÕ¹‘•™¥¹•ì4(€€€¥˜€ …±…ÍÑY…±¥‘…Ñ•‘Ð¤ì4(€€€€€½¹ÍÐÁÉ½Ù¥‘•É-•ä€ô…Ý…¥ÐÉ•Í½±Ù•	½Õ¹‘M•É•Ð¡½¹™¥œ°…ÕÑ¡½É¥Ñä°‘•ÁÌ¤ì4(€€€€€ÑÉäì4(€€€€€€€…Ý…¥Ð‘•ÁÌ¹Ù…±¥‘…Ñ•½¹¹•Ñ¥½¸¡ì4(€€€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€€€•¹‘Á½¥¹Ðè½¹™¥œ¹•¹‘Á½¥¹Ð°4(€€€€€€€€€‘•Á±½åµ•¹Ðè½¹™¥œ¹‘•Á±½åµ•¹Ð°4(€€€€€€€€€µ½‘•°è½¹™¥œ¹‘•™…Õ±Ñ5½‘•°°4(€€€€€€€€€…Á¥-•äèÁÉ½Ù¥‘•É-•ä°4(€€€€€€€ô¤ì4(€€€€€ô…Ñ ì4(€€€€€€€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È Y1%Q%=9}%1œ¤ì4(€€€€€ô4(€€€€€±…ÍÑY…±¥‘…Ñ•‘Ð€ô‘•ÁÌ¹¹½Ü ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì4(€€€€€…Ý…¥ÐÁ•ÉÍ¥ÍÑá•ÕÑ¥½¹A±…¸¡•á•ÕÑ¥½¸°ìÙ…±¥‘…Ñ¥½¹MÕ••‘•èÑÉÕ”°±…ÍÑY…±¥‘…Ñ•‘Ðô¤ì4(€€€ô4(€€€½¹ÍÐÉ•ÍÕ±Ð€ôìÉ•Í½ÕÉ•%è½¹™¥œ¹¥°ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°ÍÑ…ÑÕÌè€Ù…±¥‘…Ñ•œ°±…ÍÑY…±¥‘…Ñ•‘Ðôì(€€€…Ý…¥ÐÍ…™•QÉ…¹Í¥Ñ¥½¸¡‘•ÁÌ°½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°ìÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°±…ÍÑY…±¥‘…Ñ•‘Ðô°É•ÍÕ±Ð°•á•ÕÑ¥½¸¤ì4(€€€É•ÑÕÉ¸É•ÍÕ±Ðì4(€ô4(4(€¥˜€¡½Á•É…Ñ¥½¸€ôôô€ÁÉ½Ù¥‘•È¹…Ñ¥Ù…Ñ”œ¤ì4(€€€¥˜€ …½¹™¥œ¹­•åI•˜ñð€…¥ÍÉ•Í¡Y…±¥‘…Ñ¥½¸¡½¹™¥œ¹±…ÍÑY…±¥‘…Ñ•‘Ð°‘•ÁÌ¹¹½Ü ¤¤¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI=Y%I}	1=-œ¤ì4(€€€…Ý…¥ÐÉ•Í½±Ù•	½Õ¹‘M•É•Ð¡½¹™¥œ°…ÕÑ¡½É¥Ñä°‘•ÁÌ¤ì4(€€€½¹ÍÐÉ•ÍÕ±Ð€ôìÉ•Í½ÕÉ•%è½¹™¥œ¹¥°ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°ÍÑ…ÑÕÌè€…Ñ¥Ù”œôì(€€€…Ý…¥ÐÍ…™•QÉ…¹Í¥Ñ¥½¸¡‘•ÁÌ°½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°ìÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°­•åI•™%è½¹™¥œ¹­•åI•˜¹¥ô°É•ÍÕ±Ð°•á•ÕÑ¥½¸¤ì4(€€€É•ÑÕÉ¸É•ÍÕ±Ðì4(€ô4(4(€¥˜€¡½Á•É…Ñ¥½¸€ôôô€ÁÉ½Ù¥‘•È¹É½ÕÑ”¹Ñ½±”œ¤ì4(€€€½¹ÍÐÉ½ÕÑ•%€ôÉ•ÅÕ¥É•UÕ¥¡Á…å±½…¹É½ÕÑ•%¤ì4(€€€¥˜€¡ÑåÁ•½˜Á…å±½…¹•¹…‰±•€„ôô€‰½½±•…¸œ¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤ì4(€€€¥˜€¡Á…å±½…¹•¹…‰±•¤ì4(€€€€€½¹ÍÐ…Á…‰¥±¥Ñä€ôÉ•ÅÕ¥É•…Á…‰¥±¥Ñ¥•Ì¡mÁ…å±½…¹…Á…‰¥±¥Ñåt¥lÁtì4(€€€€€½¹ÍÐ…±±½Ý•‘I½±•Ì€ôÁ…å±½…¹…±±½Ý•‘I½±•Ì€ôôôÕ¹‘•™¥¹•4(€€€€€€€€üÕ¹‘•™¥¹•4(€€€€€€€€èÉ•ÅÕ¥É•±¥¥‰±•I½ÕÑ•I½±•Ì¡Á…å±½…¹…±±½Ý•‘I½±•Ì°…ÕÑ¡½É¥Ñä¤ì4(€€€€€½¹ÍÐ‘•¥Í¥½¸€ô…Ý…¥ÐÉ•Í½±Ù•¹Ñ•ÉÁÉ¥Í•AÉ½Ù¥‘•ÉI½ÕÑ”¡ì4(€€€€€€€µ½‘”è€Á¥±½Ðœ°4(€€€€€€€…Á…‰¥±¥Ñä°4(€€€€€€€½É…¹¥é…Ñ¥½¹%è…ÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°4(€€€€€€€Ý½É­ÍÁ…•%è…ÕÑ¡½É¥Ñä¹Ý½É­ÍÁ…•%°4(€€€€€€€…Ñ½É%è…ÕÑ¡½É¥Ñä¹…Ñ½É%°4(€€€€€€€É½±•9…µ•Ìèl4(€€€€€€€€€€¸¸¹…ÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹I½±•9…µ•Ì°€¸¸¹…ÕÑ¡½É¥Ñä¹Ý½É­ÍÁ…•I½±•9…µ•Ì°4(€€€€€€€€€€¸¸¹…ÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹I½±•%‘Ì°€¸¸¹…ÕÑ¡½É¥Ñä¹Ý½É­ÍÁ…•I½±•%‘Ì°4(€€€€€€€t°4(€€€€€€€É•ÅÕ•ÍÑ•‘AÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°4(€€€€€€€¥¹±Õ‘•¥Í…‰±•èÑÉÕ”°4(€€€€€€€ÁÉ½Á½Í•‘±±½Ý•‘I½±•Ìè…±±½Ý•‘I½±•Ì°4(€€€€€€€€¼¼Q¡¥Ì½µµ…¹…±É•…‘äÁÉ½Ù•‰å½¬¹µ…¹…”…¹Ù…±¥‘…Ñ••… Í•±•Ñ•4(€€€€€€€€¼¼É½±”……¥¹ÍÐ•á…ÐÍ•ÉÙ•Èµ‘•É¥Ù•½É…¹¥é…Ñ¥½¸½Ý½É­ÍÁ…”…ÕÑ¡½É¥Ñä¸4(€€€€€€€Á½±¥å5…¹…•µ•¹ÑÕÑ¡½É¥é•èÑÉÕ”°4(€€€€€€€Í…¹¹•ÉI•™•É•¹”è€ÍÕÁ…‰…Í”½™Õ¹Ñ¥½¹Ì½}Í¡…É•½ÁÉ½Ù¥‘•É1¥™•å±”¹ÑÌœ°4(€€€€€ô°‘•ÁÌ¹É½ÕÑ•I•Í½±Ù•É•ÁÌ¤ì4(€€€€€¥˜€¡‘•¥Í¥½¸¹ÍÑ…ÑÕÌ€„ôô€…±±½Ý•œ¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AI=Y%I}	1=-œ¤ì4(€€€€€½¹ÍÐÍ•É•Ð€ô…Ý…¥ÐÉ•Í½±Ù•AÉ½Ù¥‘•ÉM•É•Ñ½É•¥Í¥½¸¡‘•¥Í¥½¸°ì4(€€€€€€€‰…­•¹è‘•ÁÌ¹Í•É•Ñ	…­•¹°4(€€€€€€€±½½­ÕÁ-•åI•˜è…Íå¹Œ…±±½Ý•€ôø½¹™¥œ¹­•åI•˜€˜˜½¹™¥œ¹­•åI•˜¹¥€ôôô…±±½Ý•¹­•åI•™%4(€€€€€€€€€€üì4(€€€€€€€€€€€€€¥è½¹™¥œ¹­•åI•˜¹¥°4(€€€€€€€€€€€€€½É}¥è½¹™¥œ¹½É…¹¥é…Ñ¥½¹%°4(€€€€€€€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹­•åI•˜¹ÁÉ½Ù¥‘•È°4(€€€€€€€€€€€€€É•Í½±Ù•É}ÑåÁ”è½¹™¥œ¹­•åI•˜¹É•Í½±Ù•ÉQåÁ”°4(€€€€€€€€€€€€€Í•É•Ñ}É•˜è½¹™¥œ¹­•åI•˜¹Í•É•ÑI•˜°4(€€€€€€€€€€€€€ÍÑ…ÑÕÌè½¹™¥œ¹­•åI•˜¹ÍÑ…ÑÕÌ°4(€€€€€€€€€€€ô4(€€€€€€€€€€è¹Õ±°°4(€€€€€ô¤ì4(€€€€€¥˜€¡Í•É•Ð¹ÍÑ…ÑÕÌ€„ôô€É•Í½±Ù•œ¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È MIQ}U9Y%1	1œ¤ì4(€€€€€½¹ÍÐÉ•ÍÕ±Ð€ôìÉ•Í½ÕÉ•%è½¹™¥œ¹¥°ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°É½ÕÑ•%°•¹…‰±•èÑÉÕ”°…Á…‰¥±¥Ñä°…±±½Ý•‘I½±•A½±¥äè…±±½Ý•‘I½±•Ì€ü€ÕÁ‘…Ñ•œ€è€ÁÉ•Í•ÉÙ•œôì(€€€€€…Ý…¥ÐÍ…™•QÉ…¹Í¥Ñ¥½¸¡‘•ÁÌ°½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°ì4(€€€€€€€ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°4(€€€€€€€É½ÕÑ•%°4(€€€€€€€…Á…‰¥±¥Ñä°4(€€€€€€€•¹…‰±•èÑÉÕ”°4(€€€€€€€€¸¸¸¡…±±½Ý•‘I½±•Ì€üì…±±½Ý•‘I½±•Ìô€èíô¤°4(€€€€€ô°É•ÍÕ±Ð°•á•ÕÑ¥½¸¤ì4(€€€€€É•ÑÕÉ¸É•ÍÕ±Ðì4(€€€ô4(€€€½¹ÍÐÉ•ÍÕ±Ð€ôìÉ•Í½ÕÉ•%è½¹™¥œ¹¥°ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°É½ÕÑ•%°•¹…‰±•è™…±Í”ôì(€€€…Ý…¥ÐÍ…™•QÉ…¹Í¥Ñ¥½¸¡‘•ÁÌ°½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°ìÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°É½ÕÑ•%°•¹…‰±•è™…±Í”ô°É•ÍÕ±Ð°•á•ÕÑ¥½¸¤ì4(€€€É•ÑÕÉ¸É•ÍÕ±Ðì4(€ô4(4(€¥˜€¡½Á•É…Ñ¥½¸€ôôô€ÁÉ½Ù¥‘•È¹Í•É•Ð¹É½Ñ…Ñ”œ¤ì(€€€¥˜€ …½¹™¥œ¹­•åI•˜¤Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È MIQ}U9Y%1	1œ¤ì(€€€…Ý…¥ÐÁ•ÉÍ¥ÍÑá•ÕÑ¥½¹A±…¸¡•á•ÕÑ¥½¸°ìÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥ô¤ì(€€€½¹ÍÐÁÉ•Á…É•€ô…Ý…¥ÐÝÉ¥Ñ•=ÉI•Í½±Ù•M•É•Ð (€€€€€½¹™¥œ¹ÁÉ½Ù¥‘•È°…ÕÑ¡½É¥Ñä°Á…å±½…°‘•ÁÌ°•á•ÕÑ¥½¸°½¹™¥œ¹­•åI•˜¹Í•É•ÑI•˜°4(€€€€¤ì4(€€€½¹ÍÐ­•åI•™%€ôÁÉ•Á…É•¹­•åI•™%ì4(€€€±•Ð±…ÍÑY…±¥‘…Ñ•‘Ð€ôÑåÁ•½˜•á•ÕÑ¥½¸ü¹Á±…¸¹±…ÍÑY…±¥‘…Ñ•‘Ð€ôôô€ÍÑÉ¥¹œœ€˜˜•á•ÕÑ¥½¸¹Á±…¸¹Ù…±¥‘…Ñ¥½¹MÕ••‘•€ôôôÑÉÕ”4(€€€€€€ü•á•ÕÑ¥½¸¹Á±…¸¹±…ÍÑY…±¥‘…Ñ•‘Ð4(€€€€€€èÕ¹‘•™¥¹•ì4(€€€¥˜€ …±…ÍÑY…±¥‘…Ñ•‘Ð¤ì4(€€€€€ÑÉäì4(€€€€€€€…Ý…¥Ð‘•ÁÌ¹Ù…±¥‘…Ñ•½¹¹•Ñ¥½¸¡ì4(€€€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€€€•¹‘Á½¥¹Ðè½¹™¥œ¹•¹‘Á½¥¹Ð°4(€€€€€€€€€‘•Á±½åµ•¹Ðè½¹™¥œ¹‘•Á±½åµ•¹Ð°4(€€€€€€€€€µ½‘•°è½¹™¥œ¹‘•™…Õ±Ñ5½‘•°°4(€€€€€€€€€…Á¥-•äèÁÉ•Á…É•¹Ù…±Õ”°4(€€€€€€€ô¤ì4(€€€€€ô…Ñ ì4(€€€€€€€…Ý…¥Ð±•…¹ÕÁA±…¹¹•‘M•É•Ð¡‘•ÁÌ°…ÕÑ¡½É¥Ñä°•á•ÕÑ¥½¸°€Y1%Q%=9}%1œ°ì4(€€€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€€€Í•É•ÑI•˜èÁÉ•Á…É•¹Í•É•ÑI•˜°4(€€€€€€€€€™¥¹•ÉÁÉ¥¹ÐèÁÉ•Á…É•¹™¥¹•ÉÁÉ¥¹Ð°4(€€€€€€€€€ÝÉ½Ñ”èÁÉ•Á…É•¹ÝÉ½Ñ”°4(€€€€€€€€€µ…¹…•èÁÉ•Á…É•¹µ…¹…•°4(€€€€€€€ô¤ì4(€€€€€€€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È Y1%Q%=9}%1œ¤ì4(€€€€€ô4(€€€€€±…ÍÑY…±¥‘…Ñ•‘Ð€ô‘•ÁÌ¹¹½Ü ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì4(€€€€€…Ý…¥ÐÁ•ÉÍ¥ÍÑá•ÕÑ¥½¹A±…¸¡•á•ÕÑ¥½¸°ìÙ…±¥‘…Ñ¥½¹MÕ••‘•èÑÉÕ”°±…ÍÑY…±¥‘…Ñ•‘Ðô¤ì4(€€€ô4(€€€½¹ÍÐÉ•ÍÕ±Ð€ôìÉ•Í½ÕÉ•%è½¹™¥œ¹¥°ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°­•åI•™%°ÍÑ…ÑÕÌè€…Ñ¥Ù”œ°Í…™•¥¹•ÉÁÉ¥¹ÐèÁÉ•Á…É•¹™¥¹•ÉÁÉ¥¹Ð°±…ÍÑY…±¥‘…Ñ•‘Ðôì(€€€ÑÉäì4(€€€€€…Ý…¥ÐÍ…™•QÉ…¹Í¥Ñ¥½¸¡‘•ÁÌ°½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°ì4(€€€€€€€ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°4(€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€ÁÉ•Ù¥½ÕÍ-•åI•™%è½¹™¥œ¹­•åI•˜¹¥°4(€€€€€€€­•åI•™%°4(€€€€€€€Í•É•ÑI•™•É•¹”èÁÉ•Á…É•¹Í•É•ÑI•˜°4(€€€€€€€Í…™•¥¹•ÉÁÉ¥¹ÐèÁÉ•Á…É•¹™¥¹•ÉÁÉ¥¹Ð°4(€€€€€€€‰…­•¹è‘•ÁÌ¹Í•É•Ñ	…­•¹¹­¥¹°4(€€€€€€€±…ÍÑY…±¥‘…Ñ•‘Ð°4(€€€€€ô°É•ÍÕ±Ð°•á•ÕÑ¥½¸¤ì4(€€€€€¥˜€¡‘•ÁÌ¹Í•É•Ñ	…­•¹¹ÝÉ¥Ñ…‰±”€˜˜‘•ÁÌ¹Í•É•Ñ	…­•¹¹É•µ½Ù”¤ì4(€€€€€€€…Ý…¥Ð‘•ÁÌ¹Í•É•Ñ	…­•¹¹É•µ½Ù”¡ì4(€€€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€€€Í•É•ÑI•˜è½¹™¥œ¹­•åI•˜¹Í•É•ÑI•˜°4(€€€€€€€€€½É…¹¥é…Ñ¥½¹%è…ÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°4(€€€€€€€ô¤¹…Ñ   ¤€ôøÕ¹‘•™¥¹•¤ì4(€€€€€ô4(€€€€€É•ÑÕÉ¸É•ÍÕ±Ðì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡•ÉÉ½È¥¹ÍÑ…¹•½˜AÉ½Ù¥‘•É1¥™•å±•ÉÉ½È€˜˜•ÉÉ½È¹½‘”€ôôô€AI5%MM%=9}9%œ¤ì4(€€€€€€€…Ý…¥Ð±•…¹ÕÁA±…¹¹•‘M•É•Ð¡‘•ÁÌ°…ÕÑ¡½É¥Ñä°•á•ÕÑ¥½¸°€AI5%MM%=9}9%œ°ì4(€€€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€€€Í•É•ÑI•˜èÁÉ•Á…É•¹Í•É•ÑI•˜°4(€€€€€€€€€™¥¹•ÉÁÉ¥¹ÐèÁÉ•Á…É•¹™¥¹•ÉÁÉ¥¹Ð°4(€€€€€€€€€ÝÉ½Ñ”èÁÉ•Á…É•¹ÝÉ½Ñ”°4(€€€€€€€€€µ…¹…•èÁÉ•Á…É•¹µ…¹…•°4(€€€€€€€ô¤ì4(€€€€€ô4(€€€€€¥˜€¡•ÉÉ½È¥¹ÍÑ…¹•½˜AÉ½Ù¥‘•É1¥™•å±•ÉÉ½È¤Ñ¡É½Ü•ÉÉ½Èì4(€€€€€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È AIM%MQ9}U9Y%1	1œ¤ì4(€€€ô4(€ô4(4(€¥˜€¡½Á•É…Ñ¥½¸€ôôô€ÁÉ½Ù¥‘•È¹É•Ù½­”œ¤ì4(€€€½¹ÍÐÉ•ÍÕ±Ð€ôìÉ•Í½ÕÉ•%è½¹™¥œ¹¥°ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°ÍÑ…ÑÕÌè€É•Ñ¥É•œ°É½ÕÑ•Í¹…‰±•è™…±Í”ôì(€€€…Ý…¥ÐÍ…™•QÉ…¹Í¥Ñ¥½¸¡‘•ÁÌ°½Á•É…Ñ¥½¸°…ÕÑ¡½É¥Ñä°ì4(€€€€€ÁÉ½Ù¥‘•É½¹™¥%è½¹™¥œ¹¥°4(€€€€€­•åI•™%è½¹™¥œ¹­•åI•˜ü¹¥ñð¹Õ±°°4(€€€€€‘¥Í…‰±•±±I½ÕÑ•ÌèÑÉÕ”°4(€€€ô°É•ÍÕ±Ð°•á•ÕÑ¥½¸¤ì4(€€€¥˜€¡½¹™¥œ¹­•åI•˜€˜˜‘•ÁÌ¹Í•É•Ñ	…­•¹¹ÝÉ¥Ñ…‰±”€˜˜‘•ÁÌ¹Í•É•Ñ	…­•¹¹É•µ½Ù”¤ì4(€€€€€…Ý…¥Ð‘•ÁÌ¹Í•É•Ñ	…­•¹¹É•µ½Ù”¡ì4(€€€€€€€ÁÉ½Ù¥‘•Èè½¹™¥œ¹ÁÉ½Ù¥‘•È°4(€€€€€€€Í•É•ÑI•˜è½¹™¥œ¹­•åI•˜¹Í•É•ÑI•˜°4(€€€€€€€½É…¹¥é…Ñ¥½¹%è…ÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°4(€€€€€ô¤¹…Ñ   ¤€ôøÕ¹‘•™¥¹•¤ì4(€€€ô4(€€€É•ÑÕÉ¸É•ÍÕ±Ðì4(€ô4(4(€Ñ¡É½Ü¹•ÜAÉ½Ù¥‘•É1¥™•å±•ÉÉ½È %9Y1%}IEUMPœ¤ì4)ôì4(4)ÑåÁ”AÉ½Ù¥‘•É½¹™¥‰I½Ü€ôì4(€¥èÍÑÉ¥¹œì4(€½É}¥èÍÑÉ¥¹œì4(€ÁÉ½Ù¥‘•Èè¹Ñ•ÉÁÉ¥Í•¥AÉ½Ù¥‘•Èì4(€ÍÑ…ÑÕÌèÍÑÉ¥¹œì4(€•¹‘Á½¥¹Ñ}ÕÉ°üèÍÑÉ¥¹œð¹Õ±°ì4(€‘•Á±½åµ•¹Ñ}¹…µ”üèÍÑÉ¥¹œð¹Õ±°ì4(€‘•™…Õ±Ñ}µ½‘•°üèÍÑÉ¥¹œð¹Õ±°ì4(€µ½‘•±}…±±½Ý±¥ÍÐüèÍÑÉ¥¹mtð¹Õ±°ì4(€±…ÍÑ}Ù…±¥‘…Ñ•‘}…ÐüèÍÑÉ¥¹œð¹Õ±°ì4(€­•å}É•™}¥üèÍÑÉ¥¹œð¹Õ±°ì4)ôì4(4)•áÁ½ÉÐ½¹ÍÐÉ•…Ñ•AÉ½Ù¥‘•É1¥™•å±•…Ñ…‰…Í”€ô€ ¤èAÉ½Ù¥‘•É1¥™•å±•…Ñ…‰…Í”€ôø€¡ì4(€…Íå¹Œ±½…‘½¹™¥œ¡¥¹ÁÕÐ¤ì4(€€€½¹ÍÐ½¹™¥Ì€ô…Ý…¥ÐÁ½ÍÑÉ•ÍÐñAÉ½Ù¥‘•É½¹™¥‰I½Ýmtø 4(€€€€€…¥}ÁÉ½Ù¥‘•É}½¹™¥ÌýÍ•±•Ðõ¥±½É}¥±ÁÉ½Ù¥‘•È±ÍÑ…ÑÕÌ±•¹‘Á½¥¹Ñ}ÕÉ°±‘•Á±½åµ•¹Ñ}¹…µ”±‘•™…Õ±Ñ}µ½‘•°±µ½‘•±}…±±½Ý±¥ÍÐ±±…ÍÑ}Ù…±¥‘…Ñ•‘}…Ð±­•å}É•™}¥™¥õ•Ä¸‘í•¹½‘•UI%½µÁ½¹•¹Ð¡¥¹ÁÕÐ¹ÁÉ½Ù¥‘•É½¹™¥%¥ô™½É}¥õ•Ä¸‘í•¹½‘•UI%½µÁ½¹•¹Ð¡¥¹ÁÕÐ¹½É…¹¥é…Ñ¥½¹%¥ô™±¥µ¥ÐôÅ€°4(€€€€€ìµ•Ñ¡½è€Pœô°4(€€€€¤ì4(€€€½¹ÍÐÉ½Ü€ô½¹™¥ÍlÁtì4(€€€¥˜€ …É½Üñð€…9QIAI%M}%}AI=Y%IL¹¥¹±Õ‘•Ì¡É½Ü¹ÁÉ½Ù¥‘•È¤ñð€…É½Ü¹‘•™…Õ±Ñ}µ½‘•°¤É•ÑÕÉ¸¹Õ±°ì4(€€€½¹ÍÐ­•åI½ÝÌ€ôÉ½Ü¹­•å}É•™}¥4(€€€€€€ü…Ý…¥ÐÁ½ÍÑÉ•ÍÐñÉÉ…äñì¥èÍÑÉ¥¹œìÁÉ½Ù¥‘•Èè¹Ñ•ÉÁÉ¥Í•¥AÉ½Ù¥‘•ÈìÉ•Í½±Ù•É}ÑåÁ”èÍÑÉ¥¹œìÍ•É•Ñ}É•˜èÍÑÉ¥¹œìÍ…™•}™¥¹•ÉÁÉ¥¹ÐüèÍÑÉ¥¹œð¹Õ±°ìÍÑ…ÑÕÌèÍÑÉ¥¹œôøø 4(€€€€€€€…¥}ÁÉ½Ù¥‘•É}­•å}É•™ÌýÍ•±•Ðõ¥±ÁÉ½Ù¥‘•È±É•Í½±Ù•É}ÑåÁ”±Í•É•Ñ}É•˜±Í…™•}™¥¹•ÉÁÉ¥¹Ð±ÍÑ…ÑÕÌ™¥õ•Ä¸‘í•¹½‘•UI%½µÁ½¹•¹Ð¡É½Ü¹­•å}É•™}¥¥ô™½É}¥õ•Ä¸‘í•¹½‘•UI%½µÁ½¹•¹Ð¡¥¹ÁÕÐ¹½É…¹¥é…Ñ¥½¹%¥ô™ÁÉ½Ù¥‘•Èõ•Ä¸‘í•¹½‘•UI%½µÁ½¹•¹Ð¡É½Ü¹ÁÉ½Ù¥‘•È¥ô™‘•±•Ñ•‘}…Ðõ¥Ì¹¹Õ±°™±¥µ¥ÐôÅ€°4(€€€€€€€ìµ•Ñ¡½è€Pœô°4(€€€€€€¤4(€€€€€€èmtì4(€€€½¹ÍÐ­•ä€ô­•åI½ÝÍlÁtì4(€€€É•ÑÕÉ¸ì4(€€€€€¥èÉ½Ü¹¥°4(€€€€€½É…¹¥é…Ñ¥½¹%èÉ½Ü¹½É}¥°4(€€€€€ÁÉ½Ù¥‘•ÈèÉ½Ü¹ÁÉ½Ù¥‘•È°4(€€€€€ÍÑ…ÑÕÌèÉ½Ü¹ÍÑ…ÑÕÌ°4(€€€€€•¹‘Á½¥¹ÐèÉ½Ü¹•¹‘Á½¥¹Ñ}ÕÉ°ñðÕ¹‘•™¥¹•°4(€€€€€‘•Á±½åµ•¹ÐèÉ½Ü¹‘•Á±½åµ•¹Ñ}¹…µ”ñðÕ¹‘•™¥¹•°4(€€€€€‘•™…Õ±Ñ5½‘•°èÉ½Ü¹‘•™…Õ±Ñ}µ½‘•°°4(€€€€€µ½‘•±±±½Ý±¥ÍÐèÉ½Ü¹µ½‘•±}…±±½Ý±¥ÍÐñðmt°4(€€€€€±…ÍÑY…±¥‘…Ñ•‘ÐèÉ½Ü¹±…ÍÑ}Ù…±¥‘…Ñ•‘}…Ð°4(€€€€€­•åI•˜è­•ä€˜˜­•ä¹É•Í½±Ù•É}ÑåÁ”€ôôô€Í•ÉÙ•É}É•™•É•¹”œ4(€€€€€€€€üì4(€€€€€€€€€€€¥è­•ä¹¥°4(€€€€€€€€€€€ÁÉ½Ù¥‘•Èè­•ä¹ÁÉ½Ù¥‘•È°4(€€€€€€€€€€€É•Í½±Ù•ÉQåÁ”è€Í•ÉÙ•É}É•™•É•¹”œ°4(€€€€€€€€€€€Í•É•ÑI•˜è­•ä¹Í•É•Ñ}É•˜°4(€€€€€€€€€€€Í…™•¥¹•ÉÁÉ¥¹Ðè­•ä¹Í…™•}™¥¹•ÉÁÉ¥¹Ð°4(€€€€€€€€€€€ÍÑ…ÑÕÌè­•ä¹ÍÑ…ÑÕÌ°4(€€€€€€€€€ô4(€€€€€€€€è¹Õ±°°4(€€€ôì4(€ô°4(€…Íå¹ŒÑÉ…¹Í¥Ñ¥½¸¡¥¹ÁÕÐ¤ì4(€€€½¹ÍÐÙ…±Õ”€ô…Ý…¥ÐÉÁŒñÕ¹­¹½Ý¸ø •¹Ñ•ÉÁÉ¥Í•}ÁÉ½Ù¥‘•É}±¥™•å±•}ÑÉ…¹Í¥Ñ¥½¸œ°ì4(€€€€€Á}½Á•É…Ñ¥½¸è¥¹ÁÕÐ¹½Á•É…Ñ¥½¸°4(€€€€€Á}…Ñ½Èè¥¹ÁÕÐ¹…ÕÑ¡½É¥Ñä¹…Ñ½É%°4(€€€€€Á}½Éœè¥¹ÁÕÐ¹…ÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°4(€€€€€Á}Ý½É­ÍÁ…”è¥¹ÁÕÐ¹…ÕÑ¡½É¥Ñä¹Ý½É­ÍÁ…•%°4(€€€€€Á}…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¸è¥¹ÁÕÐ¹…ÕÑ¡½É¥Ñä¹…ÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¸°4(€€€€€Á}Á…å±½…è¥¹ÁÕÐ¹Á…å±½…°4(€€€€€Á}É••¥ÁÐè¥¹ÁÕÐ¹•á•ÕÑ¥½¸ü¹É••¥ÁÑ%ñð¹Õ±°°4(€€€€€Á}•á•ÕÑ¥½¹}Ñ½­•¸è¥¹ÁÕÐ¹•á•ÕÑ¥½¸ü¹•á•ÕÑ¥½¹Q½­•¸ñð¹Õ±°°4(€€€€€Á}•á•ÕÑ¥½¹}™•¹”è¥¹ÁÕÐ¹•á•ÕÑ¥½¸ü¹•á•ÕÑ¥½¹•¹”ñð¹Õ±°°4(€€€€€Á}É•ÍÕ±Ðè¥¹ÁÕÐ¹•á•ÕÑ¥½¸ü¹É•ÍÕ±Ðñð¹Õ±°°4(€€€ô¤ì4(€€€¥˜€ …¥ÍI•½É¡Ù…±Õ”¤¤Ñ¡É½Ü¹•ÜÉÉ½È AÉ½Ù¥‘•È±¥™•å±”ÑÉ…¹Í¥Ñ¥½¸™…¥±•¸œ¤ì4(€€€É•ÑÕÉ¸Ù…±Õ”ì4(€ô°4)ô¤ì4(4)•áÁ½ÉÐ½¹ÍÐÉ•…Ñ•AÉ½Ù¥‘•É1¥™•å±••ÁÌ€ô€ 4(€É½ÕÑ•I•Í½±Ù•É•ÁÌè¹Ñ•ÉÁÉ¥Í•AÉ½Ù¥‘•ÉI½ÕÑ•I•Í½±Ù•É•ÁÌ°4(¤èAÉ½Ù¥‘•É1¥™•å±••ÁÌ€ôø€¡ì4(€‘…Ñ…‰…Í”èÉ•…Ñ•AÉ½Ù¥‘•É1¥™•å±•…Ñ…‰…Í” ¤°4(€Í•É•Ñ	…­•¹èÉ•…Ñ•AÉ½Ù¥‘•ÉM•É•Ñ	…­•¹ ¤°4(€É½ÕÑ•I•Í½±Ù•É•ÁÌ°4(€Ù…±¥‘…Ñ•½¹¹•Ñ¥½¸èÙ…±¥‘…Ñ•AÉ½Ù¥‘•É½¹¹•Ñ¥½¸°4(€¹½Üè€ ¤€ôø¹•Ü…Ñ” ¤°4(€É…¹‘½µ%è€ ¤€ôøÉåÁÑ¼¹É…¹‘½µUU% ¤°4)ô¤ì4(