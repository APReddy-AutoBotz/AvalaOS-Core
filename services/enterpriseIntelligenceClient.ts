import { supabase, getRuntimeDataAccess, isSupabaseConfigured } from './supabaseClient';
import {
  ENTERPRISE_AI_CAPABILITIES,
  stableFingerprint,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type ModernizationFactors,
} from './enterpriseIntelligence';

const commandEnabled = () => getRuntimeDataAccess() === 'server' && isSupabaseConfigured();

const createId = () => globalThis.crypto?.randomUUID?.() || `ei-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
  if (error) throw new Error(error.message || 'Enterprise Intelligence command failed.');
  const response = data as { ok?: boolean; error?: { message?: string }; [key: string]: unknown };
  if (!response?.ok) throw new Error('The Enterprise Intelligence command was blocked or unavailable.');
  return response as T;
};

export const enterpriseIntelligenceClient = {
  registerProvider(input: {
    organizationId: string;
    workspaceId: string;
    provider: EnterpriseAiProvider;
    displayName: string;
    endpoint?: string;
    deployment?: string;
    defaultModel: string;
    modelAllowlist: string[];
    secretReference: string;
    capabilities?: EnterpriseAiCapability[];
    budget?: { dailyRequests?: number; monthlyTokens?: number };
  }) {
    return invokeCommand({
      commandType: 'provider.register',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        ...input,
        capabilities: input.capabilities || [...ENTERPRISE_AI_CAPABILITIES],
      },
    });
  },

  toggleProviderRoute(input: { organizationId: string; workspaceId: string; routeId: string; enabled: boolean }) {
    return invokeCommand({
      commandType: 'provider.route.toggle',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: { routeId: input.routeId, enabled: input.enabled },
    });
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

  extractEvidence(input: { organizationId: string; workspaceId: string; sourceId: string; sourceVersionId: string; providerConfigId?: string }) {
    return invokeCommand({
      commandType: 'evidence.extract',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
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

  evaluateModernization(input: { organizationId: string; workspaceId: string; applicationId: string; assessmentVersionId: string; factors?: ModernizationFactors }) {
    return invokeCommand({
      commandType: 'modernization.evaluate',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: { organizationId: input.organizationId, workspaceId: input.workspaceId, applicationId: input.applicationId, assessmentVersionId: input.assessmentVersionId },
    });
  },

  recordReview(input: { organizationId: string; workspaceId: string; resourceType: string; resourceId: string; rationale: string }) {
    return invokeCommand({
      commandType: 'approval.review.record',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  recordApproval(input: { organizationId: string; workspaceId: string; resourceType: string; resourceId: string; outcome: 'approved' | 'rejected'; rationale: string }) {
    return invokeCommand({
      commandType: 'approval.record',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  handoffStudioDocument(input: { organizationId: string; workspaceId: string; studioDocumentId: string; studioVersion: number; studioContentHash: string }) {
    return invokeCommand({
      commandType: 'studio.delivery.handoff',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  createMonitorBaseline(input: { organizationId: string; workspaceId: string; packageVersionId: string; approvedItemIds: string[] }) {
    return invokeCommand({
      commandType: 'monitor.baseline.create',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
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
