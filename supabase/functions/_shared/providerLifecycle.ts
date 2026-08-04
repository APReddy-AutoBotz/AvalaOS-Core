import type { EnterpriseAiProvider, EnterpriseAiCapability } from '../../../services/enterpriseIntelligence.ts';
import { ENTERPRISE_AI_CAPABILITIES, ENTERPRISE_AI_PROVIDERS } from '../../../services/enterpriseIntelligence.ts';
import {
  EnterpriseAiGatewayError,
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
import { postgrest, rpc } from './supabase.ts';

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
  capabilities: Set<string>;
  roleNames: Set<string>;
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
    | 'PERSISTENCE_UNAVAILABLE') {
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
  if (authority.capabilities.has('org.admin')) return;
  const byok = authority.capabilities.has('byok.manage');
  const security = authority.capabilities.has('security.manage');
  if (secretMutation ? byok && security : byok || security) return;
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

const safeTransition = async (
  deps: ProviderLifecycleDeps,
  operation: ProviderLifecycleOperation,
  authority: ProviderLifecycleAuthority,
  payload: JsonObject,
) => {
  try {
    const result = await deps.database.transition({ operation, authority, payload });
    if (!isRecord(result)) throw new Error('invalid transition response');
    return result;
  } catch (error) {
    if (error instanceof ProviderLifecycleError) throw error;
    throw new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
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

const writeOrResolveSecret = async (
  provider: EnterpriseAiProvider,
  authority: ProviderLifecycleAuthority,
  payload: JsonObject,
  deps: ProviderLifecycleDeps,
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
    const secretRef = createProviderSecretReference(provider, authority.organizationId, deps.randomId());
    await deps.secretBackend.write({ provider, secretRef, organizationId: authority.organizationId, value: raw });
    return { secretRef, fingerprint: await fingerprintProviderSecret(raw), wrote: true, value: raw };
  }
  if (deps.secretBackend.writable) throw new ProviderLifecycleError('INVALID_REQUEST');
  if (!preProvisioned || !isAllowedProviderSecretRef(provider, preProvisioned, authority.organizationId)) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  const value = await deps.secretBackend.resolve({ provider, secretRef: preProvisioned, organizationId: authority.organizationId });
  if (!value) throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
  return { secretRef: preProvisioned, fingerprint: await fingerprintProviderSecret(value), wrote: false, value };
};

const cleanupNewSecret = async (
  deps: ProviderLifecycleDeps,
  authority: ProviderLifecycleAuthority,
  provider: EnterpriseAiProvider,
  secretRef: string,
  wrote: boolean,
) => {
  if (wrote && deps.secretBackend.remove) {
    await deps.secretBackend.remove({ provider, secretRef, organizationId: authority.organizationId }).catch(() => undefined);
  }
};

export const executeProviderLifecycleCommand = async (
  operation: ProviderLifecycleOperation,
  authority: ProviderLifecycleAuthority,
  payloadValue: unknown,
  deps: ProviderLifecycleDeps,
): Promise<JsonObject> => {
  const payload = isRecord(payloadValue) ? payloadValue : (() => { throw new ProviderLifecycleError('INVALID_REQUEST'); })();
  requireManager(authority, operation === 'provider.secret.bind' || operation === 'provider.secret.rotate' || operation === 'provider.revoke');
  if (authority.roleNames.size === 0) throw new ProviderLifecycleError('PERMISSION_DENIED');

  if (operation === 'provider.register') {
    const provider = requireProvider(payload.provider);
    const displayName = requireString(payload.displayName, 240);
    const defaultModel = requireString(payload.defaultModel, 200);
    const endpoint = payload.endpoint === undefined || payload.endpoint === '' ? undefined : requireString(payload.endpoint, 500);
    if ((provider === 'azure_openai' || provider === 'openai_compatible') && !endpoint) throw new ProviderLifecycleError('INVALID_REQUEST');
    if (endpoint && !isAllowedProviderEndpoint(provider, endpoint)) throw new ProviderLifecycleError('INVALID_REQUEST');
    const deployment = payload.deployment === undefined || payload.deployment === '' ? undefined : requireString(payload.deployment, 240);
    if (provider === 'azure_openai' && !deployment) throw new ProviderLifecycleError('INVALID_REQUEST');
    const capabilities = requireCapabilities(payload.capabilities);
    const modelAllowlist = Array.isArray(payload.modelAllowlist)
      ? [...new Set(payload.modelAllowlist.map(item => requireString(item, 200)))]
      : [defaultModel];
    if (modelAllowlist.length > 64 || !modelAllowlist.includes(defaultModel)) throw new ProviderLifecycleError('INVALID_REQUEST');
    const providerConfigId = deps.randomId();
    const routes = capabilities.map(capability => ({ id: deps.randomId(), capability, model: defaultModel }));
    await safeTransition(deps, operation, authority, {
      providerConfigId,
      provider,
      displayName,
      endpoint: endpoint || null,
      deployment: deployment || null,
      defaultModel,
      modelAllowlist,
      capabilities,
      routes,
      budget: requireBudget(payload.budget),
    });
    return { providerConfigId, provider, status: 'pending_review', routes };
  }

  const config = await loadConfig(deps, authority, payload.providerConfigId);
  if (config.status === 'retired' || config.status === 'revoked') throw new ProviderLifecycleError('PROVIDER_BLOCKED');

  if (operation === 'provider.secret.bind') {
    if (config.keyRef) throw new ProviderLifecycleError('RESOURCE_CONFLICT');
    const prepared = await writeOrResolveSecret(config.provider, authority, payload, deps);
    const keyRefId = deps.randomId();
    try {
      await safeTransition(deps, operation, authority, {
        providerConfigId: config.id,
        provider: config.provider,
        keyRefId,
        secretReference: prepared.secretRef,
        safeFingerprint: prepared.fingerprint,
        backend: deps.secretBackend.kind,
      });
      return { providerConfigId: config.id, keyRefId, status: 'pending_review', safeFingerprint: prepared.fingerprint };
    } catch (error) {
      await cleanupNewSecret(deps, authority, config.provider, prepared.secretRef, prepared.wrote);
      throw error;
    }
  }

  if (operation === 'provider.validate') {
    const providerKey = await resolveBoundSecret(config, authority, deps);
    try {
      await deps.validateConnection({
        provider: config.provider,
        endpoint: config.endpoint,
        deployment: config.deployment,
        model: config.defaultModel,
        apiKey: providerKey,
      });
    } catch {
      throw new ProviderLifecycleError('VALIDATION_FAILED');
    }
    const lastValidatedAt = deps.now().toISOString();
    await safeTransition(deps, operation, authority, { providerConfigId: config.id, lastValidatedAt });
    return { providerConfigId: config.id, status: 'validated', lastValidatedAt };
  }

  if (operation === 'provider.activate') {
    if (!config.keyRef || !isFreshValidation(config.lastValidatedAt, deps.now())) throw new ProviderLifecycleError('PROVIDER_BLOCKED');
    await resolveBoundSecret(config, authority, deps);
    await safeTransition(deps, operation, authority, { providerConfigId: config.id, keyRefId: config.keyRef.id });
    return { providerConfigId: config.id, status: 'active' };
  }

  if (operation === 'provider.route.toggle') {
    const routeId = requireUuid(payload.routeId);
    if (typeof payload.enabled !== 'boolean') throw new ProviderLifecycleError('INVALID_REQUEST');
    if (payload.enabled) {
      const capability = requireCapabilities([payload.capability])[0];
      const allowedRoles = payload.allowedRoles === undefined ? undefined : requireRoles(payload.allowedRoles);
      const decision = await resolveEnterpriseProviderRoute({
        mode: 'pilot',
        capability,
        organizationId: authority.organizationId,
        workspaceId: authority.workspaceId,
        actorId: authority.actorId,
        roleNames: [...authority.roleNames],
        requestedProviderConfigId: config.id,
        includeDisabled: true,
        proposedAllowedRoles: allowedRoles,
        scannerReference: 'supabase/functions/_shared/providerLifecycle.ts',
      }, deps.routeResolverDeps);
      if (decision.status !== 'allowed') throw new ProviderLifecycleError('PROVIDER_BLOCKED');
      const secret = await resolveProviderSecretForDecision(decision, {
        backend: deps.secretBackend,
        lookupKeyRef: async allowed => config.keyRef && config.keyRef.id === allowed.keyRefId
          ? {
              id: config.keyRef.id,
              org_id: config.organizationId,
              provider: config.keyRef.provider,
              resolver_type: config.keyRef.resolverType,
              secret_ref: config.keyRef.secretRef,
              status: config.keyRef.status,
            }
          : null,
      });
      if (secret.status !== 'resolved') throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
      await safeTransition(deps, operation, authority, {
        providerConfigId: config.id,
        routeId,
        capability,
        enabled: true,
        ...(allowedRoles ? { allowedRoles } : {}),
      });
      return { providerConfigId: config.id, routeId, enabled: true, capability, allowedRolePolicy: allowedRoles ? 'updated' : 'preserved' };
    }
    await safeTransition(deps, operation, authority, { providerConfigId: config.id, routeId, enabled: false });
    return { providerConfigId: config.id, routeId, enabled: false };
  }

  if (operation === 'provider.secret.rotate') {
    if (!config.keyRef) throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
    const prepared = await writeOrResolveSecret(config.provider, authority, payload, deps);
    const keyRefId = deps.randomId();
    try {
      await deps.validateConnection({
        provider: config.provider,
        endpoint: config.endpoint,
        deployment: config.deployment,
        model: config.defaultModel,
        apiKey: prepared.value,
      });
      const lastValidatedAt = deps.now().toISOString();
      await safeTransition(deps, operation, authority, {
        providerConfigId: config.id,
        provider: config.provider,
        previousKeyRefId: config.keyRef.id,
        keyRefId,
        secretReference: prepared.secretRef,
        safeFingerprint: prepared.fingerprint,
        backend: deps.secretBackend.kind,
        lastValidatedAt,
      });
      let cleanupPending = false;
      if (deps.secretBackend.writable && deps.secretBackend.remove) {
        await deps.secretBackend.remove({
          provider: config.provider,
          secretRef: config.keyRef.secretRef,
          organizationId: authority.organizationId,
        }).catch(() => { cleanupPending = true; });
      }
      return { providerConfigId: config.id, keyRefId, status: 'active', safeFingerprint: prepared.fingerprint, lastValidatedAt, cleanupPending };
    } catch (error) {
      await cleanupNewSecret(deps, authority, config.provider, prepared.secretRef, prepared.wrote);
      if (error instanceof ProviderLifecycleError) throw error;
      if (error instanceof EnterpriseAiGatewayError) throw new ProviderLifecycleError('VALIDATION_FAILED');
      throw new ProviderLifecycleError('VALIDATION_FAILED');
    }
  }

  if (operation === 'provider.revoke') {
    await safeTransition(deps, operation, authority, {
      providerConfigId: config.id,
      keyRefId: config.keyRef?.id || null,
      disableAllRoutes: true,
    });
    let cleanupPending = false;
    if (config.keyRef && deps.secretBackend.writable && deps.secretBackend.remove) {
      await deps.secretBackend.remove({
        provider: config.provider,
        secretRef: config.keyRef.secretRef,
        organizationId: authority.organizationId,
      }).catch(() => { cleanupPending = true; });
    }
    return { providerConfigId: config.id, status: 'retired', routesEnabled: false, cleanupPending };
  }

  throw new ProviderLifecycleError('INVALID_REQUEST');
};

type ProviderConfigDbRow = {
  id: string;
  org_id: string;
  provider: EnterpriseAiProvider;
  status: string;
  endpoint_url?: string | null;
  deployment_name?: string | null;
  default_model?: string | null;
  model_allowlist?: string[] | null;
  last_validated_at?: string | null;
  key_ref_id?: string | null;
};

export const createProviderLifecycleDatabase = (): ProviderLifecycleDatabase => ({
  async loadConfig(input) {
    const configs = await postgrest<ProviderConfigDbRow[]>(
      `ai_provider_configs?select=id,org_id,provider,status,endpoint_url,deployment_name,default_model,model_allowlist,last_validated_at,key_ref_id&id=eq.${encodeURIComponent(input.providerConfigId)}&org_id=eq.${encodeURIComponent(input.organizationId)}&limit=1`,
      { method: 'GET' },
    );
    const row = configs[0];
    if (!row || !ENTERPRISE_AI_PROVIDERS.includes(row.provider) || !row.default_model) return null;
    const keyRows = row.key_ref_id
      ? await postgrest<Array<{ id: string; provider: EnterpriseAiProvider; resolver_type: string; secret_ref: string; safe_fingerprint?: string | null; status: string }>>(
        `ai_provider_key_refs?select=id,provider,resolver_type,secret_ref,safe_fingerprint,status&id=eq.${encodeURIComponent(row.key_ref_id)}&org_id=eq.${encodeURIComponent(input.organizationId)}&provider=eq.${encodeURIComponent(row.provider)}&deleted_at=is.null&limit=1`,
        { method: 'GET' },
      )
      : [];
    const key = keyRows[0];
    return {
      id: row.id,
      organizationId: row.org_id,
      provider: row.provider,
      status: row.status,
      endpoint: row.endpoint_url || undefined,
      deployment: row.deployment_name || undefined,
      defaultModel: row.default_model,
      modelAllowlist: row.model_allowlist || [],
      lastValidatedAt: row.last_validated_at,
      keyRef: key && key.resolver_type === 'server_reference'
        ? {
            id: key.id,
            provider: key.provider,
            resolverType: 'server_reference',
            secretRef: key.secret_ref,
            safeFingerprint: key.safe_fingerprint,
            status: key.status,
          }
        : null,
    };
  },
  async transition(input) {
    const value = await rpc<unknown>('enterprise_provider_lifecycle_transition', {
      p_operation: input.operation,
      p_actor: input.authority.actorId,
      p_org: input.authority.organizationId,
      p_workspace: input.authority.workspaceId,
      p_authorization_version: input.authority.authorizationVersion,
      p_payload: input.payload,
    });
    if (!isRecord(value)) throw new Error('Provider lifecycle transition failed.');
    return value;
  },
});

export const createProviderLifecycleDeps = (
  routeResolverDeps: EnterpriseProviderRouteResolverDeps,
): ProviderLifecycleDeps => ({
  database: createProviderLifecycleDatabase(),
  secretBackend: createProviderSecretBackend(),
  routeResolverDeps,
  validateConnection: validateProviderConnection,
  now: () => new Date(),
  randomId: () => crypto.randomUUID(),
});
