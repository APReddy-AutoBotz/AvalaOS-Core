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
import type { TranscriptAssessApplicationIntent } from './transcriptFlow/contracts';
import { validateTranscriptSourceSetSelection } from './transcriptFlow/sourceSets';
import {
  buildDeliveryMonitorSelectorPayload,
  type DeliveryMonitorCommandInput,
} from './deliveryMonitor/commands';
import type {
  DeliveryBaselineEligibilityPageRequest,
  DeliveryItemPageRequest,
  DeliveryWorkspaceProjection,
  MonitorApprovedBaselinesProjection,
} from './deliveryMonitor/contracts';

type DeliveryCommandFields<Action extends DeliveryMonitorCommandInput['action']> =
  Extract<DeliveryMonitorCommandInput, { action: Action }> extends infer Command
    ? Command extends DeliveryMonitorCommandInput ? Omit<Command, 'action'> : never
    : never;

type DeliveryCommandInput<Action extends DeliveryMonitorCommandInput['action']> =
  DeliveryCommandFields<Action> & { organizationId: string; workspaceId: string };

type TranscriptSourceSetLineageSelector = {
  sourceSetId: string;
  sourceSetVersionSelector: string;
  expectedVersion: number;
};

const encodeTranscriptSourceSetLineage = (items: TranscriptSourceSetLineageSelector[]) => {
  if (items.length < 1 || items.length > 20
    || new Set(items.map(item => item.sourceSetId)).size !== items.length
    || new Set(items.map(item => item.sourceSetVersionSelector)).size !== items.length) {
    throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
  }
  return items.map((item, index) => {
    if (!Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 1) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
    }
    return {
      sourceSetId: requireUuidSelector(item.sourceSetId),
      sourceSetVersionSelector: requireUuidSelector(item.sourceSetVersionSelector),
      expectedVersion: item.expectedVersion,
      ordinal: index + 1,
    };
  });
};

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
  COMMAND_OUTCOME_UNKNOWN: 'The server may have committed this command, but the response was lost. Reload committed state before retrying.',
  COMMAND_BLOCKED: 'The server blocked this lifecycle transition. No success was recorded.',
  COMMAND_UNAVAILABLE: 'The governed server operation is unavailable. No fallback was used.',
  BUDGET_EXHAUSTED: 'The configured provider budget is exhausted. No provider call was made.',
  SOURCE_INCOMPLETE: 'Every selected source must complete extraction before this bundle can run.',
  TRANSCRIPT_SOURCE_SET_MEMBER_LIMIT: 'A source set must contain between 1 and 20 exact source versions.',
  TRANSCRIPT_SOURCE_SET_DUPLICATE_VERSION: 'The same exact source version cannot appear twice in one source set.',
  TRANSCRIPT_ASSESS_MATERIAL_CONFLICT_UNRESOLVED: 'Resolve every material conflict before applying or finalizing this Assess draft.',
  TRANSCRIPT_ASSESS_TARGET_STALE: 'The Assess draft or preview changed. Reload and preview the exact changes again.',
  ENTERPRISE_PROJECTION_UNAVAILABLE: 'The Enterprise Intelligence projection is unavailable. Existing records were not replaced with local data.',
  HANDOFF_NOT_ELIGIBLE: 'The selected Studio version is not eligible for a Delivery handoff.',
  HANDOFF_STALE: 'The handoff changed or its source is no longer current. Reload before continuing.',
  MODULE_ROUTE_NOT_ALLOWED: 'The organization route policy does not permit this handoff.',
};

export class EnterpriseIntelligenceClientError extends Error {
  constructor(public readonly code: string) {
    super(errorMessages[code] || 'The Enterprise Intelligence operation could not be completed.');
    this.name = 'EnterpriseIntelligenceClientError';
  }
}

const requireUuidSelector = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new EnterpriseIntelligenceClientError('RESOURCE_NOT_FOUND');
  }
  return value;
};

const sameUuidSelector = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

const invokeCommand = async <T>(input: {
  commandType: string;
  organizationId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
  outcomeUnknownCodes?: readonly string[];
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
    if (isRetryableTransportError(invocation.error)) {
      throw new EnterpriseIntelligenceClientError('COMMAND_OUTCOME_UNKNOWN');
    }
  }
  const { data, error } = invocation;
  const response = data as { ok?: boolean; error?: { code?: string; message?: string }; [key: string]: unknown } | null;
  const errorCode = input.outcomeUnknownCodes?.length
    ? await responseErrorCode(data, error)
    : response?.error?.code;
  if (input.outcomeUnknownCodes?.includes(errorCode || '')) {
    throw new EnterpriseIntelligenceClientError('COMMAND_OUTCOME_UNKNOWN');
  }
  if (error) throw new EnterpriseIntelligenceClientError(errorCode || response?.error?.code || 'COMMAND_UNAVAILABLE');
  if (!response?.ok) throw new EnterpriseIntelligenceClientError(errorCode || response?.error?.code || 'COMMAND_BLOCKED');
  return response as T;
};

const invokeDeliveryMonitor = <T>(input: {
  organizationId: string;
  workspaceId: string;
  command: DeliveryMonitorCommandInput;
}) => invokeCommand<T>({
  commandType: input.command.action,
  organizationId: input.organizationId,
  workspaceId: input.workspaceId,
  payload: buildDeliveryMonitorSelectorPayload(input.command),
  outcomeUnknownCodes: ['COMMAND_OUTCOME_UNKNOWN', 'RECEIPT_FINALIZATION_FAILED'],
});

const invokeDeliveryMonitorAction = <Action extends DeliveryMonitorCommandInput['action']>(
  action: Action,
  input: DeliveryCommandInput<Action>,
) => {
  const { organizationId, workspaceId, ...commandInput } = input as unknown as {
    organizationId: string;
    workspaceId: string;
    [key: string]: unknown;
  };
  return invokeDeliveryMonitor({
    organizationId,
    workspaceId,
    command: { ...commandInput, action } as unknown as DeliveryMonitorCommandInput,
  });
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
              const recoveryErrorCode = await responseErrorCode(
                recoveryInvocation.data,
                recoveryInvocation.error,
              );
              if (recoveryErrorCode === 'PERMISSION_DENIED') {
                throw new EnterpriseIntelligenceClientError('PERMISSION_DENIED');
              }
              if (recoveryErrorCode !== 'COMMAND_IN_PROGRESS'
                && recoveryErrorCode !== 'PERSISTENCE_UNAVAILABLE'
                && !isRetryableTransportError(recoveryInvocation.error)) {
                throw new EnterpriseIntelligenceClientError(recoveryErrorCode || 'COMMAND_UNAVAILABLE');
              }
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

export type EnterpriseIntelligenceProjectionRequest = {
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion?: number;
  deliveryItemPage?: DeliveryItemPageRequest;
  deliveryBaselineEligibilityPage?: DeliveryBaselineEligibilityPageRequest;
};

const loadProjection = async (input: EnterpriseIntelligenceProjectionRequest): Promise<EnterpriseIntelligenceProjection> => {
  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  const requestedOrganizationId = requireUuidSelector(input.organizationId);
  const requestedWorkspaceId = requireUuidSelector(input.workspaceId);
  const { data, error } = await supabase.functions.invoke('enterprise-intelligence-query', {
    body: { ...input, organizationId: requestedOrganizationId, workspaceId: requestedWorkspaceId },
  });
  const response = data as { projection?: unknown; code?: string } | null;
  if (error) {
    throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  }
  if (!response?.projection) throw new EnterpriseIntelligenceClientError(response?.code || 'ENTERPRISE_PROJECTION_UNAVAILABLE');
  const projection = decodeEnterpriseIntelligenceProjection(response.projection);
  if (!sameUuidSelector(projection.organizationId, requestedOrganizationId)
    || !sameUuidSelector(projection.workspaceId, requestedWorkspaceId)) {
    throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  }
  return projection;
};

export const enterpriseIntelligenceClient = {
  loadProjection,

  async loadDeliveryWorkspace(input: Parameters<typeof loadProjection>[0]): Promise<DeliveryWorkspaceProjection> {
    const projection = await loadProjection(input);
    if (!projection.deliveryWorkspace) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    return projection.deliveryWorkspace;
  },

  async loadDeliveryItemPage(input: EnterpriseIntelligenceProjectionRequest & { deliveryItemPage: DeliveryItemPageRequest }): Promise<DeliveryWorkspaceProjection> {
    const projection = await loadProjection(input);
    const workspace = projection.deliveryWorkspace;
    if (!workspace
      || !sameUuidSelector(workspace.organizationId, input.organizationId)
      || !sameUuidSelector(workspace.workspaceId, input.workspaceId)
      || workspace.packages.length !== 1
      || !sameUuidSelector(workspace.packages[0].id, input.deliveryItemPage.packageId)
      || !workspace.packages[0].itemPage.cursorApplied) {
      throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    }
    return workspace;
  },

  async loadDeliveryBaselineEligibilityPage(input: EnterpriseIntelligenceProjectionRequest & { deliveryBaselineEligibilityPage: DeliveryBaselineEligibilityPageRequest }): Promise<DeliveryWorkspaceProjection> {
    const projection = await loadProjection(input);
    const workspace = projection.deliveryWorkspace;
    if (!workspace
      || !sameUuidSelector(workspace.organizationId, input.organizationId)
      || !sameUuidSelector(workspace.workspaceId, input.workspaceId)
      || !workspace.page.baselineEligibilityCursorApplied) {
      throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    }
    return workspace;
  },

  async loadMonitorApprovedBaselines(input: Parameters<typeof loadProjection>[0]): Promise<MonitorApprovedBaselinesProjection> {
    const projection = await loadProjection(input);
    if (!projection.monitorApprovedBaselines) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    return projection.monitorApprovedBaselines;
  },

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

  commitTranscriptSourceSet(input: {
    organizationId: string;
    workspaceId: string;
    sourceSetId?: string;
    expectedVersion?: number;
    label: string;
    description?: string;
    members: Array<{ sourceId: string; versionSelector: string; role: 'primary' | 'supporting' | 'contradictory' | 'reference'; note?: string }>;
  }) {
    const label = input.label.trim();
    const description = input.description?.trim();
    if (!label || Array.from(label).length > 240 || (description && Array.from(description).length > 1_000)) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_SOURCE_SET_INPUT_INVALID');
    }
    return invokeCommand({
      commandType: 'transcript.source-set.create-version',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        ...(input.sourceSetId ? { sourceSetId: requireUuidSelector(input.sourceSetId) } : {}),
        displayLabel: label,
        ...(description ? { description } : {}),
        ownerModule: 'assess',
        purpose: description || label,
        lock: true,
        expectedVersion: input.expectedVersion ?? 0,
        items: validateTranscriptSourceSetSelection(input.members).map(member => ({
          sourceVersionId: member.versionSelector,
          ordinal: member.ordinal,
          role: member.role,
          ...(member.note ? { note: member.note } : {}),
        })),
      },
    });
  },

  commitStudioTranscriptSourceSet(input: {
    organizationId: string;
    workspaceId: string;
    sourceSetId?: string;
    expectedVersion?: number;
    label: string;
    description?: string;
    members: Array<{ sourceId: string; versionSelector: string; role: 'primary' | 'supporting' | 'contradictory' | 'reference'; note?: string }>;
  }) {
    const label = input.label.trim();
    const description = input.description?.trim();
    if (!label || Array.from(label).length > 240 || (description && Array.from(description).length > 1_000)) throw new EnterpriseIntelligenceClientError('TRANSCRIPT_SOURCE_SET_INPUT_INVALID');
    return invokeCommand({
      commandType: 'transcript.source-set.create-version', organizationId: input.organizationId, workspaceId: input.workspaceId,
      payload: { ...(input.sourceSetId ? { sourceSetId: requireUuidSelector(input.sourceSetId) } : {}), displayLabel: label, ...(description ? { description } : {}), ownerModule: 'studio', purpose: description || label, lock: true, expectedVersion: input.expectedVersion ?? 0, items: validateTranscriptSourceSetSelection(input.members).map(member => ({ sourceVersionId: member.versionSelector, ordinal: member.ordinal, role: member.role, ...(member.note ? { note: member.note } : {}) })) },
    });
  },

  lockTranscriptInputBundle(input: { organizationId: string; workspaceId: string; inputBundleId?: string; expectedVersion?: number; sourceSetVersionSelectors: string[]; label: string }) {
    const sourceSetVersionSelectors = input.sourceSetVersionSelectors.map(requireUuidSelector);
    if (!input.label.trim() || sourceSetVersionSelectors.length < 1 || sourceSetVersionSelectors.length > 20 || new Set(sourceSetVersionSelectors).size !== sourceSetVersionSelectors.length) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
    }
    return invokeCommand({
      commandType: 'transcript.input-bundle.lock',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        ...(input.inputBundleId ? { inputBundleId: requireUuidSelector(input.inputBundleId) } : {}),
        ownerModule: 'assess',
        expectedVersion: input.expectedVersion ?? 0,
        sourceSets: sourceSetVersionSelectors.map((sourceSetVersionId, index) => ({ sourceSetVersionId, ordinal: index + 1, purpose: input.label.trim() })),
      },
    });
  },

  lockStudioTranscriptInputBundle(input: { organizationId: string; workspaceId: string; inputBundleId?: string; expectedVersion?: number; sourceSetVersionSelectors: string[]; label: string }) {
    const sourceSetVersionSelectors = input.sourceSetVersionSelectors.map(requireUuidSelector);
    if (!input.label.trim() || sourceSetVersionSelectors.length < 1 || sourceSetVersionSelectors.length > 20 || new Set(sourceSetVersionSelectors).size !== sourceSetVersionSelectors.length) throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
    return invokeCommand({ commandType: 'transcript.input-bundle.lock', organizationId: input.organizationId, workspaceId: input.workspaceId, payload: { ...(input.inputBundleId ? { inputBundleId: requireUuidSelector(input.inputBundleId) } : {}), ownerModule: 'studio', expectedVersion: input.expectedVersion ?? 0, sourceSets: sourceSetVersionSelectors.map((sourceSetVersionId,index) => ({ sourceSetVersionId, ordinal:index+1, purpose:input.label.trim() })) } });
  },

  setTranscriptJourneyState(input: { organizationId: string; workspaceId: string; journeyId?: string; desiredExitModule: 'assess' | 'studio' | 'delivery' | 'monitor'; status: 'active' | 'stopped' }) {
    return invokeCommand({
      commandType: 'transcript.journey.set-state',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        ...(input.journeyId ? { journeyId: requireUuidSelector(input.journeyId) } : {}),
        entryModule: 'assess',
        desiredExitModule: input.desiredExitModule,
        status: input.status,
      },
    });
  },

  extractTranscriptAssessBundle(input: {
    organizationId: string;
    workspaceId: string;
    inputBundleId: string;
    inputBundleVersionSelector: string;
    expectedInputBundleVersion: number;
    selections: Array<TranscriptSourceSetLineageSelector & { sourceVersionSelector: string }>;
  }) {
    const inputBundleId = requireUuidSelector(input.inputBundleId);
    const inputBundleVersionSelector = requireUuidSelector(input.inputBundleVersionSelector);
    if (!Number.isSafeInteger(input.expectedInputBundleVersion) || input.expectedInputBundleVersion < 1
      || input.selections.length < 1 || input.selections.length > 20
      || new Set(input.selections.map(item => item.sourceVersionSelector)).size !== input.selections.length) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
    }
    return Promise.all(input.selections.map(selection => invokeCommand({
      commandType: 'transcript.assess.extract',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        inputBundleId, inputBundleVersionSelector, expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetId: requireUuidSelector(selection.sourceSetId),
        sourceSetVersionSelector: requireUuidSelector(selection.sourceSetVersionSelector),
        expectedSourceSetVersion: selection.expectedVersion,
        sourceVersionSelector: requireUuidSelector(selection.sourceVersionSelector),
      },
    })));
  },

  reviewTranscriptAssessCandidate(input: {
    organizationId: string; workspaceId: string; candidateId: string; candidateVersion: number;
    inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number;
    sourceSetId: string; sourceSetVersionSelector: string; expectedSourceSetVersion: number; sourceVersionSelector: string;
    status: 'accepted' | 'rejected' | 'edited'; value?: string; reason?: string;
    relationship?: 'neutral' | 'supporting' | 'contradictory'; applicationIntent?: TranscriptAssessApplicationIntent; applyTarget?: string;
  }) {
    if (!Number.isSafeInteger(input.candidateVersion) || input.candidateVersion < 1
      || !Number.isSafeInteger(input.expectedInputBundleVersion) || input.expectedInputBundleVersion < 1
      || !Number.isSafeInteger(input.expectedSourceSetVersion) || input.expectedSourceSetVersion < 1) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_CANDIDATE_STALE');
    }
    return invokeCommand({
      commandType: 'transcript.assess.candidate.review',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        candidateId: requireUuidSelector(input.candidateId), candidateVersion: input.candidateVersion, status: input.status,
        inputBundleId: requireUuidSelector(input.inputBundleId),
        inputBundleVersionSelector: requireUuidSelector(input.inputBundleVersionSelector),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetId: requireUuidSelector(input.sourceSetId),
        sourceSetVersionSelector: requireUuidSelector(input.sourceSetVersionSelector),
        expectedSourceSetVersion: input.expectedSourceSetVersion,
        sourceVersionSelector: requireUuidSelector(input.sourceVersionSelector),
        ...(input.value !== undefined ? { value: input.value } : {}), ...(input.reason ? { reason: input.reason } : {}),
        ...(input.relationship ? { relationship: input.relationship } : {}), ...(input.applicationIntent ? { applicationIntent: input.applicationIntent } : {}),
        ...(input.applyTarget ? { applyTarget: input.applyTarget } : {}),
      },
    });
  },

  previewTranscriptAssessApply(input: {
    organizationId: string; workspaceId: string; assessDraftId: string; expectedDraftVersion: number;
    inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number;
    sourceSetVersions: TranscriptSourceSetLineageSelector[];
    selections: Array<{ candidateId: string; candidateVersion: number; intent: TranscriptAssessApplicationIntent; target: string }>;
  }) {
    if (input.selections.length < 1 || input.selections.length > 100) throw new EnterpriseIntelligenceClientError('TRANSCRIPT_ASSESS_BATCH_LIMIT');
    return invokeCommand({
      commandType: 'transcript.assess.apply.preview',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        assessDraftId: requireUuidSelector(input.assessDraftId),
        expectedDraftVersion: input.expectedDraftVersion,
        inputBundleId: requireUuidSelector(input.inputBundleId),
        inputBundleVersionSelector: requireUuidSelector(input.inputBundleVersionSelector),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetVersions: encodeTranscriptSourceSetLineage(input.sourceSetVersions),
        selections: input.selections.map(selection => ({ ...selection, candidateId: requireUuidSelector(selection.candidateId) })),
      },
    });
  },

  resolveTranscriptAssessConflict(input: { organizationId: string; workspaceId: string; conflictId: string; resolutionVersion: number; resolution: 'choose_candidate' | 'retain_manual' | 'authored_resolution'; candidateId?: string; authoredValue?: string; rationale: string }) {
    if (!Number.isSafeInteger(input.resolutionVersion) || input.resolutionVersion < 0 || input.rationale.trim().length < 4) throw new EnterpriseIntelligenceClientError('TRANSCRIPT_CONFLICT_RESOLUTION_INVALID');
    return invokeCommand({
      commandType: 'transcript.assess.conflict.resolve',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        conflictId: requireUuidSelector(input.conflictId), resolutionVersion: input.resolutionVersion, resolution: input.resolution,
        ...(input.candidateId ? { candidateId: requireUuidSelector(input.candidateId) } : {}),
        ...(input.authoredValue ? { authoredValue: input.authoredValue } : {}), rationale: input.rationale.trim(),
      },
    });
  },

  applyTranscriptAssessPreview(input: {
    organizationId: string; workspaceId: string; previewBatchId: string; assessDraftId: string; expectedDraftVersion: number;
    inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number;
    sourceSetVersions: TranscriptSourceSetLineageSelector[];
  }) {
    return invokeCommand({
      commandType: 'transcript.assess.apply.commit',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        previewBatchId: requireUuidSelector(input.previewBatchId), assessDraftId: requireUuidSelector(input.assessDraftId),
        expectedDraftVersion: input.expectedDraftVersion, inputBundleId: requireUuidSelector(input.inputBundleId),
        inputBundleVersionSelector: requireUuidSelector(input.inputBundleVersionSelector),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetVersions: encodeTranscriptSourceSetLineage(input.sourceSetVersions),
      },
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
    void input;
    throw new EnterpriseIntelligenceClientError('COMMAND_BLOCKED');
  },

  requestDeliveryHandoff(input: DeliveryCommandInput<'delivery.handoff.request'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.request', input);
  },

  resolveDeliveryHandoffReview(input: DeliveryCommandInput<'delivery.handoff.review.resolve'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.review.resolve', input);
  },

  resolveDeliveryHandoffApproval(input: DeliveryCommandInput<'delivery.handoff.approval.resolve'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.approval.resolve', input);
  },

  withdrawDeliveryHandoff(input: DeliveryCommandInput<'delivery.handoff.withdraw'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.withdraw', input);
  },

  consumeDeliveryHandoff(input: DeliveryCommandInput<'delivery.handoff.consume'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.consume', input);
  },

  createManualDeliveryPackage(input: DeliveryCommandInput<'delivery.package.create.manual'>) {
    return invokeDeliveryMonitorAction('delivery.package.create.manual', input);
  },

  reviewDeliveryItem(input: DeliveryCommandInput<'delivery.item.review'>) {
    return invokeDeliveryMonitorAction('delivery.item.review', input);
  },

  commitDeliveryPackageRevision(input: DeliveryCommandInput<'delivery.package.revision.commit'>) {
    return invokeDeliveryMonitorAction('delivery.package.revision.commit', input);
  },

  resolveDeliveryPackageReview(input: DeliveryCommandInput<'delivery.package.review.resolve'>) {
    return invokeDeliveryMonitorAction('delivery.package.review.resolve', input);
  },

  resolveDeliveryPackageApproval(input: DeliveryCommandInput<'delivery.package.approval.resolve'>) {
    return invokeDeliveryMonitorAction('delivery.package.approval.resolve', input);
  },

  createMonitorBaseline(input: DeliveryCommandInput<'monitor.baseline.create'>) {
    return invokeDeliveryMonitorAction('monitor.baseline.create', input);
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
