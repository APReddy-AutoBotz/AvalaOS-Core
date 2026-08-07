import { supabase, getRuntimeDataAccess, isSupabaseConfigured } from './supabaseClient';
import {
  buildEnterpriseSelectorPayloads,
  decodeEnterpriseIntelligenceProjection,
  ENTERPRISE_AI_CAPABILITIES,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type EnterpriseApprovalResourceType,
  type EnterpriseIntelligenceProjection,
} from './enterpriseIntelligence';

const commandEnabled = () => getRuntimeDataAccess() === 'server' && isSupabaseConfigured();

const createCryptographicUuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) {
    throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const createId = () => createCryptographicUuid();

export const createEnterpriseActionIdempotencyKey = (operation: string) => (
  `ei:${operation}:${createCryptographicUuid()}`
);

const isRetryableTransportError = (error: unknown) => {
  const name = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
  return name === 'FunctionsFetchError' || name === 'FunctionsRelayError';
};

const waitForProviderAuthorityRetry = (milliseconds: number) => new Promise<void>(resolve => {
  globalThis.setTimeout(resolve, milliseconds);
});

const lifecycleAuthorizationVersion = Symbol('enterprise-provider-lifecycle-authorization-version');

type LifecycleResult = Record<string, unknown> & {
  [lifecycleAuthorizationVersion]?: number;
};

export const getProviderLifecycleAuthorizationVersion = (value: unknown) => (
  typeof value === 'object' && value
    ? (value as LifecycleResult)[lifecycleAuthorizationVersion]
    : undefined
);

const responseErrorCode = async (data: unknown, error: unknown) => {
  const direct = data as { code?: unknown; error?: { code?: unknown } } | null;
  const directCode = direct?.error?.code || direct?.code;
  if (typeof directCode === 'string') return directCode;
  const context = typeof error === 'object' && error && 'context' in error
    ? (error as { context?: unknown }).context
    : undefined;
  if (!context || typeof context !== 'object' || !('clone' in context)) return undefined;
  try {
    const clone = (context as { clone: () => { json: () => Promise<unknown> } }).clone();
    const body = await clone.json() as { code?: unknown; error?: { code?: unknown } } | null;
    const code = body?.error?.code || body?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
};

const errorMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: 'Your session expired. Sign in again before continuing.',
  AUTHORIZATION_STALE: 'Your authorization changed. Reload the workspace before continuing.',
  TENANT_ACCESS_DENIED: 'Access to this workspace was denied or revoked.',
  PERMISSION_DENIED: 'You do not have the server capability required for this action.',
  RESOURCE_NOT_FOUND: 'The selected resource is no longer available in this workspace.',
  RESOURCE_STALE: 'The selected resource changed on the server. Reload before continuing.',
  IDEMPOTENCY_CONFLICT: 'This request conflicts with a previously claimed operation. Reload before retrying.',
  COMMAND_IN_PROGRESS: 'The same operation is still in progress. Reload before retrying.',
  COMMAND_BLOCKED: 'The server blocked this lifecycle transition. No success was recorded.',
  COMMAND_UNAVAILABLE: 'The governed server operation is unavailable. No fallback was used.',
  ENTERPRISE_PROJECTION_UNAVAILABLE: 'The Enterprise Intelligence projection is unavailable. Existing records were not replaced with local data.',
};

export class EnterpriseIntelligenceClientError extends Error {
  constructor(public readonly code: string) {
    super(errorMessages[code] || 'The Enterprise Intelligence operation could not be completed.');
    this.name = 'EnterpriseIntelligenceClientError';
  }
}

const invokeCommand = async <T>(input: {
  commandType: string;
  organizationId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
}): Promise<T> => {
  if (!commandEnabled()) throw new Error('Enterprise Intelligence requires server runtime authority.');
  const body = {
    commandType: input.commandType,
    requestId: createId(),
    idempotencyKey: createEnterpriseActionIdempotencyKey(input.commandType),
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    payload: input.payload,
  };
  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });
  if (isRetryableTransportError(invocation.error)) {
    invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });
  }
  const { data, error } = invocation;
  const response = data as { ok?: boolean; error?: { code?: string; message?: string }; [key: string]: unknown } | null;
  if (error) throw new EnterpriseIntelligenceClientError(response?.error?.code || 'COMMAND_UNAVAILABLE');
  if (!response?.ok) throw new EnterpriseIntelligenceClientError(response?.error?.code || 'COMMAND_BLOCKED');
  return response as T;
};

const invokeProviderLifecycle = async <T>(input: {
  operation: string;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  payload: Record<string, unknown>;
}): Promise<T> => {
  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  const requestId = createId();
  const idempotencyKey = createEnterpriseActionIdempotencyKey(input.operation);
  let activePayload: Record<string, unknown> | undefined = input.payload;
  let expectedAuthorizationVersion = input.expectedAuthorizationVersion;
  try {
    for (let staleRecoveryAttempt = 0; staleRecoveryAttempt <= 1; staleRecoveryAttempt += 1) {
      const body = {
        operation: input.operation,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        expectedAuthorizationVersion,
        payload: activePayload,
        requestId,
        idempotencyKey,
      };
      let invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });
      if (isRetryableTransportError(invocation.error)) {
        invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });
      }
      const response = invocation.data as { ok?: boolean; error?: { code?: string }; [key: string]: unknown } | null;
      const errorCode = await responseErrorCode(invocation.data, invocation.error);
      if (!invocation.error && response?.ok) {
        const result = { ...response } as LifecycleResult;
        Object.defineProperty(result, lifecycleAuthorizationVersion, {
          configurable: false,
          enumerable: false,
          value: expectedAuthorizationVersion,
          writable: false,
        });
        return result as T;
      }
      if (errorCode !== 'AUTHORIZATION_STALE' || staleRecoveryAttempt === 1) {
        throw new EnterpriseIntelligenceClientError(errorCode || 'COMMAND_UNAVAILABLE');
      }

      const providerConfigId = typeof activePayload?.providerConfigId === 'string'
        ? activePayload.providerConfigId
        : undefined;
      const routeId = typeof activePayload?.routeId === 'string' ? activePayload.routeId : undefined;
      const authorityBody = {
        operation: input.operation,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        ...(providerConfigId ? { providerConfigId } : {}),
        ...(routeId ? { routeId } : {}),
      };
      let refreshedAuthorizationVersion: number | undefined;
      for (let recheckAttempt = 0; recheckAttempt < 3; recheckAttempt += 1) {
        const authorityInvocation = await supabase.functions.invoke(
          'enterprise-provider-lifecycle-authority',
          { body: authorityBody },
        );
        if (isRetryableTransportError(authorityInvocation.error)) {
          if (recheckAttempt < 2) {
            await waitForProviderAuthorityRetry(25 * (recheckAttempt + 1));
            continue;
          }
          throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
        }
        const authorityData = authorityInvocation.data as {
          authorized?: unknown;
          authorizationVersion?: unknown;
        } | null;
        if (authorityInvocation.error
          || typeof authorityData?.authorized !== 'boolean'
          || (authorityData.authorized
            && (!Number.isSafeInteger(authorityData.authorizationVersion)
              || Number(authorityData.authorizationVersion) < 1))) {
          throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
        }
        if (!authorityData.authorized) {
          if ((input.operation === 'provider.secret.bind' || input.operation === 'provider.secret.rotate')
            && providerConfigId) {
            const recoveryBody = {
              operation: input.operation,
              organizationId: input.organizationId,
              workspaceId: input.workspaceId,
              providerConfigId,
              requestId,
              idempotencyKey,
            };
            let recoveryAttempt = 0;
            for (;;) {
              const recoveryInvocation = await supabase.functions.invoke(
                'enterprise-provider-lifecycle-recovery',
                { body: recoveryBody },
              );
              const recoveryData = recoveryInvocation.data as { ok?: unknown; terminal?: unknown } | null;
              if (!recoveryInvocation.error && recoveryData?.ok === true && recoveryData.terminal === true) break;
              recoveryAttempt += 1;
              await waitForProviderAuthorityRetry(Math.min(1_000, 50 * (2 ** Math.min(recoveryAttempt, 5))));
            }
          }
          throw new EnterpriseIntelligenceClientError('PERMISSION_DENIED');
        }
        refreshedAuthorizationVersion = Number(authorityData.authorizationVersion);
        break;
      }
      if (!refreshedAuthorizationVersion) {
        throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
      }
      expectedAuthorizationVersion = refreshedAuthorizationVersion;
    }
    throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  } finally {
    if (activePayload && typeof activePayload.providerKey === 'string') {
      activePayload.providerKey = undefined;
    }
    activePayload = undefined;
  }
};

const loadProjection = async (input: {
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion?: number;
}): Promise<EnterpriseIntelligenceProjection> => {
  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  const { data, error } = await supabase.functions.invoke('enterprise-intelligence-query', { body: input });
  const response = data as { projection?: unknown; code?: string } | null;
  if (error) {
    throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  }
  if (!response?.projection) throw new EnterpriseIntelligenceClientError(response?.code || 'ENTERPRISE_PROJECTION_UNAVAILABLE');
  return decodeEnterpriseIntelligenceProjection(response.projection);
};

export const enterpriseIntelligenceClient = {
  loadProjection,

  registerProvider(input: {
    organizationId: string;
    workspaceId: string;
    expectedAuthorizationVersion: number;
    provider: EnterpriseAiProvider;
    displayName: string;
    endpoint?: string;
    deployment?: string;
    defaultModel: string;
    modelAllowlist: string[];
    capabilities?: EnterpriseAiCapability[];
    budget?: { dailyRequests?: number; monthlyTokens?: number };
  }) {
    return invokeProviderLifecycle({
      operation: 'provider.register',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      expectedAuthorizationVersion: input.expectedAuthorizationVersion,
      payload: {
        provider: input.provider,
        displayName: input.displayName,
        endpoint: input.endpoint,
        deployment: input.deployment,
        defaultModel: input.defaultModel,
        modelAllowlist: input.modelAllowlist,
        budget: input.budget,
        capabilities: input.capabilities || [...ENTERPRISE_AI_CAPABILITIES],
      },
    });
  },

  bindProviderSecret(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string; providerKey?: string; preProvisionedReference?: string }) {
    return invokeProviderLifecycle({ operation: 'provider.secret.bind', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId, providerKey: input.providerKey, preProvisionedReference: input.preProvisionedReference } });
  },

  validateProvider(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string }) {
    return invokeProviderLifecycle({ operation: 'provider.validate', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId } });
  },

  activateProvider(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string }) {
    return invokeProviderLifecycle({ operation: 'provider.activate', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId } });
  },

  rotateProviderSecret(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string; providerKey?: string; preProvisionedReference?: string }) {
    return invokeProviderLifecycle({ operation: 'provider.secret.rotate', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId, providerKey: input.providerKey, preProvisionedReference: input.preProvisionedReference } });
  },

  revokeProvider(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string }) {
    return invokeProviderLifecycle({ operation: 'provider.revoke', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId } });
  },

  toggleProviderRoute(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string; routeId: string; capability: EnterpriseAiCapability; enabled: boolean; allowedRoles?: string[] }) {
    return invokeProviderLifecycle({ operation: 'provider.route.toggle', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId, routeId: input.routeId, capability: input.capability, enabled: input.enabled, ...(input.allowedRoles ? { allowedRoles: input.allowedRoles } : {}) } });
  },

  createEvidenceSource(input: {
    organizationId: string;
    workspaceId: string;
    displayName: string;
    filename: string;
    mimeType: string;
    contentBase64: string;
    sourceKind?: 'upload' | 'pasted_text';
  }) {
    return invokeCommand({
      commandType: 'evidence.source.create',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  extractEvidence(input: { organizationId: string; workspaceId: string; sourceId: string; sourceVersionId?: string; providerConfigId?: string }) {
    return invokeCommand({
      commandType: 'evidence.extract',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: buildEnterpriseSelectorPayloads.evidenceExtraction(input.sourceId),
    });
  },

  promoteEvidenceToAssess(input: { organizationId: string; workspaceId: string; sourceId: string; assessDraftId: string; candidateIds: string[] }) {
    return invokeCommand({
      commandType: 'evidence.assess.promote',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: buildEnterpriseSelectorPayloads.assessPromotion(input.sourceId, input.assessDraftId, input.candidateIds),
    });
  },

  reviewEvidenceCandidate(input: { organizationId: string; workspaceId: string; candidateId: string; status: 'accepted' | 'rejected' | 'edited'; value?: string; reason?: string }) {
    return invokeCommand({
      commandType: 'evidence.candidate.review',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  evaluateModernization(input: { organizationId: string; workspaceId: string; applicationId: string; assessmentVersionId?: string }) {
    return invokeCommand({
      commandType: 'modernization.evaluate',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: buildEnterpriseSelectorPayloads.modernization(input.applicationId),
    });
  },

  recordReview(input: { organizationId: string; workspaceId: string; resourceType: EnterpriseApprovalResourceType; resourceId: string; rationale: string }) {
    return invokeCommand({
      commandType: 'approval.review.record',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  recordApproval(input: { organizationId: string; workspaceId: string; resourceType: EnterpriseApprovalResourceType; resourceId: string; outcome: 'approved' | 'rejected'; rationale: string }) {
    return invokeCommand({
      commandType: 'approval.record',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  handoffStudioDocument(input: { organizationId: string; workspaceId: string; studioDocumentId: string; studioVersion?: number; studioContentHash?: string }) {
    return invokeCommand({
      commandType: 'studio.delivery.handoff',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: buildEnterpriseSelectorPayloads.studioHandoff(input.studioDocumentId),
    });
  },

  createMonitorBaseline(input: { organizationId: string; workspaceId: string; workPackageId?: string; packageVersionId?: string; approvedItemIds?: string[] }) {
    if (!input.workPackageId) throw new EnterpriseIntelligenceClientError('RESOURCE_STALE');
    return invokeCommand({
      commandType: 'monitor.baseline.create',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: buildEnterpriseSelectorPayloads.monitorBaseline(input.workPackageId),
    });
  },

  createAssembleBlueprint(input: { organizationId: string; workspaceId: string; modernizationDecisionId: string; name: string }) {
    return invokeCommand({
      commandType: 'assemble.blueprint.create',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};
