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
    await deps.secretBackend.write({ provider, secretRef, organizationId: authority.organizationId, value: raw });
    await persistExecutionPlan(execution, { writeState: 'written', externalSecretWritten: true });
    return { provider, secretRef, keyRefId, fingerprint, wrote: true, managed: true, value: raw };
  }
  if (deps.secretBackend.writable) throw new ProviderLifecycleError('INVALID_REQUEST');
  if (!preProvisioned || !isAllowedProviderSecretRef(provider, preProvisioned, authority.organizationId)) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  const referenceHash = await fingerprintProviderSecret(preProvisioned);
  if (execution?.plan.preProvisionedReferenceHash && execution.plan.preProvisionedReferenceHash !== referenceHash) {
    throw new ProviderLifecycleError('RESOURCE_CONFLICT');
  }
  const keyRefId = typeof execution?.plan.keyRefId === 'string' ? execution.plan.keyRefId : deps.randomId();
  await persistExecutionPlan(execution, { provider, keyRefId, preProvisionedReferenceHash: referenceHash });
  const value = await deps.secretBackend.resolve({ provider, secretRef: preProvisioned, organizationId: authority.organizationId });
  if (!value) throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
  return {
    provider, secretRef: preProvisioned, keyRefId,
    fingerprint: await fingerprintProviderSecret(value), wrote: false, managed: false, value,
  };
};

const requireEligibleRouteRoles = (value: unknown, authority: ProviderLifecycleAuthority) => {
  const roles = requireRoles(value);
  if (roles.some(role => !uuid.test(role) || !authority.eligibleRouteRoleIds.has(role))) {
    throw new ProviderLifecycleError('INVALID_REQUEST');
  }
  return roles;
};

const seededRouteRoles = (authority: ProviderLifecycleAuthority) => {
  const workspaceRole = [...authority.workspaceRoleIds].find(role => authority.eligibleRouteRoleIds.has(role));
  if (workspaceRole) return [workspaceRole];
  if (authority.organizationCapabilities.has('org.admin')) {
    const organizationRole = [...authority.organizationRoleIds].find(role => authority.eligibleRouteRoleIds.has(role));
    if (organizationRole) return [organizationRole];
  }
  throw new ProviderLifecycleError('PERMISSION_DENIED');
};

const cleanupPlannedSecret = async (
  deps: ProviderLifecycleDeps,
  authority: ProviderLifecycleAuthority,
  execution: ProviderLifecycleExecutionContext | undefined,
  terminalCode: 'VALIDATION_FAILED' | 'PERMISSION_DENIED',
  prepared?: {
    provider: EnterpriseAiProvider;
    secretRef: string;
    fingerprint: string;
    wrote: boolean;
    managed: boolean;
  },
) => {
  const plannedProvider = execution?.plan.provider;
  const plannedReference = execution?.plan.secretReference;
  const plannedFingerprint = execution?.plan.safeFingerprint;
  const receiptOwnsPlan = Boolean(
    execution
      && execution.plan.secretOwnership === 'managed_write'
      && execution.plan.secretPlanReceiptId === execution.receiptId
      && (execution.plan.writeState === 'planned' || execution.plan.writeState === 'written'),
  );
  const preparedMatchesPlan = !prepared || !execution || (
    prepared.managed === true
      && prepared.provider === plannedProvider
      && prepared.secretRef === plannedReference
      && prepared.fingerprint === plannedFingerprint
  );
  const managed = execution
    ? receiptOwnsPlan && preparedMatchesPlan
    : prepared?.managed === true && prepared.wrote === true;
  if (!managed) return;
  const providerValue = execution ? plannedProvider : prepared?.provider;
  const secretRefValue = execution ? plannedReference : prepared?.secretRef;
  const safeFingerprint = execution ? plannedFingerprint : prepared?.fingerprint;
  if (!ENTERPRISE_AI_PROVIDERS.includes(providerValue as EnterpriseAiProvider)
    || typeof secretRefValue !== 'string'
    || typeof safeFingerprint !== 'string'
    || !isAllowedProviderSecretRef(providerValue as EnterpriseAiProvider, secretRefValue, authority.organizationId)
    || !deps.secretBackend.writable
    || !deps.secretBackend.remove
    || (execution?.plan.protectedSecretReferenceHash !== undefined
      && execution.plan.protectedSecretReferenceHash === await fingerprintProviderSecret(secretRefValue))) {
    throw new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
  }
  if (execution?.plan.cleanupCompleted === true) return;
  if (execution) {
    await persistExecutionPlan(execution, {
      cleanupRequired: true,
      cleanupTerminalCode: terminalCode,
    });
  }
  let existing: string | undefined;
  try {
    existing = await deps.secretBackend.resolve({
      provider: providerValue as EnterpriseAiProvider,
      secretRef: secretRefValue,
      organizationId: authority.organizationId,
    });
    if (existing && await fingerprintProviderSecret(existing) !== safeFingerprint) {
      throw new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
    }
    if (!existing) {
      if (execution) await persistExecutionPlan(execution, { cleanupCompleted: true });
      return;
    }
    await deps.secretBackend.remove({
      provider: providerValue as EnterpriseAiProvider,
      secretRef: secretRefValue,
      organizationId: authority.organizationId,
    });
  } catch (error) {
    if (error instanceof ProviderLifecycleError) throw error;
    throw new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
  }
  if (execution) {
    await persistExecutionPlan(execution, { cleanupCompleted: true });
  }
};

export const executeProviderLifecycleCommand = async (
  operation: ProviderLifecycleOperation,
  authority: ProviderLifecycleAuthority,
  payloadValue: unknown,
  deps: ProviderLifecycleDeps,
  execution?: ProviderLifecycleExecutionContext,
): Promise<JsonObject> => {
  const payload = isRecord(payloadValue) ? payloadValue : (() => { throw new ProviderLifecycleError('INVALID_REQUEST'); })();
  if (execution?.plan.cleanupRequired === true) {
    const terminalCode = execution.plan.cleanupTerminalCode === 'PERMISSION_DENIED'
      ? 'PERMISSION_DENIED'
      : 'VALIDATION_FAILED';
    await cleanupPlannedSecret(deps, authority, execution, terminalCode);
    throw new ProviderLifecycleError(terminalCode);
  }
  try {
    assertProviderLifecycleOperationAuthority(operation, authority);
  } catch (error) {
    if (error instanceof ProviderLifecycleError && error.code === 'PERMISSION_DENIED'
      && (operation === 'provider.secret.bind' || operation === 'provider.secret.rotate')) {
      await cleanupPlannedSecret(deps, authority, execution, 'PERMISSION_DENIED');
    }
    throw error;
  }

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
    const plannedConfigId = typeof execution?.plan.providerConfigId === 'string' ? execution.plan.providerConfigId : deps.randomId();
    const plannedRouteIds = Array.isArray(execution?.plan.routeIds)
      ? execution.plan.routeIds.filter((value): value is string => typeof value === 'string')
      : [];
    if (plannedRouteIds.length && plannedRouteIds.length !== capabilities.length) throw new ProviderLifecycleError('RESOURCE_CONFLICT');
    const providerConfigId = plannedConfigId;
    const routeIds = plannedRouteIds.length ? plannedRouteIds : capabilities.map(() => deps.randomId());
    await persistExecutionPlan(execution, { providerConfigId, routeIds });
    const allowedRoles = seededRouteRoles(authority);
    const routes = capabilities.map((capability, index) => ({
      id: routeIds[index], capability, model: defaultModel, allowedRoles,
    }));
    const result = { providerConfigId, provider, status: 'pending_review', routes };
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
    }, result, execution);
    return result;
  }

  const config = await loadConfig(deps, authority, payload.providerConfigId);
  if (config.status === 'retired' || config.status === 'revoked') throw new ProviderLifecycleError('PROVIDER_BLOCKED');

  if (operation === 'provider.secret.bind') {
    if (config.keyRef) throw new ProviderLifecycleError('RESOURCE_CONFLICT');
    const prepared = await writeOrResolveSecret(config.provider, authority, payload, deps, execution);
    const keyRefId = prepared.keyRefId;
    const result = { providerConfigId: config.id, keyRefId, status: 'pending_review', safeFingerprint: prepared.fingerprint };
    try {
      await safeTransition(deps, operation, authority, {
        providerConfigId: config.id,
        provider: config.provider,
        keyRefId,
        secretReference: prepared.secretRef,
        safeFingerprint: prepared.fingerprint,
        backend: deps.secretBackend.kind,
      }, result, execution);
      return result;
    } catch (error) {
      if (error instanceof ProviderLifecycleError && error.code === 'PERMISSION_DENIED') {
        await cleanupPlannedSecret(deps, authority, execution, 'PERMISSION_DENIED', {
          provider: config.provider,
          secretRef: prepared.secretRef,
          fingerprint: prepared.fingerprint,
          wrote: prepared.wrote,
          managed: prepared.managed,
        });
      }
      throw error;
    }
  }

  if (operation === 'provider.validate') {
    let lastValidatedAt = typeof execution?.plan.lastValidatedAt === 'string' && execution.plan.validationSucceeded === true
      ? execution.plan.lastValidatedAt
      : undefined;
    if (!lastValidatedAt) {
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
      lastValidatedAt = deps.now().toISOString();
      await persistExecutionPlan(execution, { validationSucceeded: true, lastValidatedAt });
    }
    const result = { providerConfigId: config.id, status: 'validated', lastValidatedAt };
    await safeTransition(deps, operation, authority, { providerConfigId: config.id, lastValidatedAt }, result, execution);
    return result;
  }

  if (operation === 'provider.activate') {
    if (!config.keyRef || !isFreshValidation(config.lastValidatedAt, deps.now())) throw new ProviderLifecycleError('PROVIDER_BLOCKED');
    await resolveBoundSecret(config, authority, deps);
    const result = { providerConfigId: config.id, status: 'active' };
    await safeTransition(deps, operation, authority, { providerConfigId: config.id, keyRefId: config.keyRef.id }, result, execution);
    return result;
  }

  if (operation === 'provider.route.toggle') {
    const routeId = requireUuid(payload.routeId);
    if (typeof payload.enabled !== 'boolean') throw new ProviderLifecycleError('INVALID_REQUEST');
    if (payload.enabled) {
      const capability = requireCapabilities([payload.capability])[0];
      const allowedRoles = payload.allowedRoles === undefined
        ? undefined
        : requireEligibleRouteRoles(payload.allowedRoles, authority);
      const decision = await resolveEnterpriseProviderRoute({
        mode: 'pilot',
        capability,
        organizationId: authority.organizationId,
        workspaceId: authority.workspaceId,
        actorId: authority.actorId,
        roleNames: [
          ...authority.organizationRoleNames, ...authority.workspaceRoleNames,
          ...authority.organizationRoleIds, ...authority.workspaceRoleIds,
        ],
        requestedProviderConfigId: config.id,
        includeDisabled: true,
        proposedAllowedRoles: allowedRoles,
        // This command already proved byok.manage and validated each selected
        // role against exact server-derived organization/workspace authority.
        policyManagementAuthorized: true,
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
      const result = { providerConfigId: config.id, routeId, enabled: true, capability, allowedRolePolicy: allowedRoles ? 'updated' : 'preserved' };
      await safeTransition(deps, operation, authority, {
        providerConfigId: config.id,
        routeId,
        capability,
        enabled: true,
        ...(allowedRoles ? { allowedRoles } : {}),
      }, result, execution);
      return result;
    }
    const result = { providerConfigId: config.id, routeId, enabled: false };
    await safeTransition(deps, operation, authority, { providerConfigId: config.id, routeId, enabled: false }, result, execution);
    return result;
  }

  if (operation === 'provider.secret.rotate') {
    if (!config.keyRef) throw new ProviderLifecycleError('SECRET_UNAVAILABLE');
    const prepared = await writeOrResolveSecret(
      config.provider, authority, payload, deps, execution, config.keyRef.secretRef,
    );
    const keyRefId = prepared.keyRefId;
    let lastValidatedAt = typeof execution?.plan.lastValidatedAt === 'string' && execution.plan.validationSucceeded === true
      ? execution.plan.lastValidatedAt
      : undefined;
    if (!lastValidatedAt) {
      try {
        await deps.validateConnection({
          provider: config.provider,
          endpoint: config.endpoint,
          deployment: config.deployment,
          model: config.defaultModel,
          apiKey: prepared.value,
        });
      } catch {
        await cleanupPlannedSecret(deps, authority, execution, 'VALIDATION_FAILED', {
          provider: config.provider,
          secretRef: prepared.secretRef,
          fingerprint: prepared.fingerprint,
          wrote: prepared.wrote,
          managed: prepared.managed,
        });
        throw new ProviderLifecycleError('VALIDATION_FAILED');
      }
      lastValidatedAt = deps.now().toISOString();
      await persistExecutionPlan(execution, { validationSucceeded: true, lastValidatedAt });
    }
    const result = { providerConfigId: config.id, keyRefId, status: 'active', safeFingerprint: prepared.fingerprint, lastValidatedAt };
    try {
      await safeTransition(deps, operation, authority, {
        providerConfigId: config.id,
        provider: config.provider,
        previousKeyRefId: config.keyRef.id,
        keyRefId,
        secretReference: prepared.secretRef,
        safeFingerprint: prepared.fingerprint,
        backend: deps.secretBackend.kind,
        lastValidatedAt,
      }, result, execution);
      if (deps.secretBackend.writable && deps.secretBackend.remove) {
        await deps.secretBackend.remove({
          provider: config.provider,
          secretRef: config.keyRef.secretRef,
          organizationId: authority.organizationId,
        }).catch(() => undefined);
      }
      return result;
    } catch (error) {
      if (error instanceof ProviderLifecycleError && error.code === 'PERMISSION_DENIED') {
        await cleanupPlannedSecret(deps, authority, execution, 'PERMISSION_DENIED', {
          provider: config.provider,
          secretRef: prepared.secretRef,
          fingerprint: prepared.fingerprint,
          wrote: prepared.wrote,
          managed: prepared.managed,
        });
      }
      if (error instanceof ProviderLifecycleError) throw error;
      throw new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
    }
  }

  if (operation === 'provider.revoke') {
    const result = { providerConfigId: config.id, status: 'retired', routesEnabled: false };
    await safeTransition(deps, operation, authority, {
      providerConfigId: config.id,
      keyRefId: config.keyRef?.id || null,
      disableAllRoutes: true,
    }, result, execution);
    if (config.keyRef && deps.secretBackend.writable && deps.secretBackend.remove) {
      await deps.secretBackend.remove({
        provider: config.provider,
        secretRef: config.keyRef.secretRef,
        organizationId: authority.organizationId,
      }).catch(() => undefined);
    }
    return result;
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
      p_receipt: input.execution?.receiptId || null,
      p_execution_token: input.execution?.executionToken || null,
      p_execution_fence: input.execution?.executionFence || null,
      p_result: input.execution?.result || null,
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
