import { supabase, getRuntimeDataAccess, isSupabaseConfigured } from './supabaseClient';
import {
  buildEnterpriseSelectorPayloads,
  decodeEnterpriseIntelligenceProjection,
  ENTERPRISE_AI_CAPABILITIES,
  stableFingerprint,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type EnterpriseApprovalResourceType,
  type EnterpriseIntelligenceProjection,
} from './enterpriseIntelligence';

const commandEnabled = () => getRuntimeDataAccess() === 'server' && isSupabaseConfigured();

const createId = () => globalThis.crypto?.randomUUID?.() || `ei-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

const createIdempotencyKey = async (input: { commandType: string; organizationId: string; workspaceId: string; payload: Record<string, unknown> }) => {
  const material = JSON.stringify({ commandType: input.commandType, organizationId: input.organizationId, workspaceId: input.workspaceId, payload: input.payload });
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
    return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
  }
  return stableFingerprint(material);
};

const invokeCommand = async <T>(input: {
  commandType: string;
  organizationId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<T> => {
  if (!commandEnabled()) throw new Error('Enterprise Intelligence requires server runtime authority.');
  const { data, error } = await supabase.functions.invoke('enterprise-intelligence-command', {
    body: {
      commandType: input.commandType,
      requestId: createId(),
      idempotencyKey: input.idempotencyKey || await createIdempotencyKey(input),
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input.payload,
    },
  });
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
  const { data, error } = await supabase.functions.invoke('enterprise-provider-lifecycle', { body: input });
  const response = data as { ok?: boolean; error?: { code?: string }; [key: string]: unknown } | null;
  if (error || !response?.ok) throw new EnterpriseIntelligenceClientError(response?.error?.code || 'COMMAND_UNAVAILABLE');
  return response as T;
};

const loadProjection = async (input: {
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion?: number;
}): Promise<EnterpriseIntelligenceProjection> => {
  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  const { data, error } = await supabase.functions.invoke('enterprise-intelligence-query', { body: input });
  const response = data as { projection?: unknown; code?: string } | null;
  if (error) throw new EnterpriseIntelligenceClientError(response?.code || 'ENTERPRISE_PROJECTION_UNAVAILABLE');
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

  toggleProviderRoute(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string; routeId: string; capability: EnterpriseAiCapability; enabled: boolean }) {
    return invokeProviderLifecycle({ operation: 'provider.route.toggle', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId, routeId: input.routeId, capability: input.capability, enabled: input.enabled } });
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
