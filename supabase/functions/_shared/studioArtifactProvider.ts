import { ENTERPRISE_AI_PROVIDERS, type EnterpriseAiProvider } from '../../../services/enterpriseIntelligence.ts';
import {
  EnterpriseAiGatewayError,
  estimateMaximumProviderInputTokens,
  parseJsonObjectResponse,
  runGovernedProviderRequest,
  type EnterpriseProviderRequest,
  type EnterpriseProviderResult,
} from './enterpriseIntelligenceAi.ts';
import type { AllowedEnterpriseProviderResolverDecision } from './providerResolver.ts';
import type { JsonObject } from './studioArtifactCommand.ts';

export const STUDIO_PROVIDER_CAPABILITY = 'studio.document.generate' as const;
export const STUDIO_PROVIDER_IDENTITIES: readonly EnterpriseAiProvider[] = ENTERPRISE_AI_PROVIDERS;

export type StudioProviderPlan = Readonly<{
  provider: EnterpriseAiProvider;
  routeId: string;
  providerConfigId: string;
  model: string;
  endpoint?: string;
  deployment?: string;
  resolverDecision: AllowedEnterpriseProviderResolverDecision;
}>;

export type StudioProviderGatewayInput = Readonly<{
  organizationId: string;
  workspaceId: string;
  actorId: string;
  plan: StudioProviderPlan;
  sourcePackage: JsonObject;
  templatePayload: JsonObject;
  manualBrief: string | null;
  maximumOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}>;

export type StudioProviderGatewayResult = Readonly<{
  provider: EnterpriseAiProvider;
  model: string;
  content: JsonObject;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  providerOperationId?: string;
}>;

export class StudioProviderGatewayError extends Error {
  constructor(public readonly code:
    | 'PROVIDER_ROUTE_UNAVAILABLE' | 'PROVIDER_REQUEST_FAILED' | 'PROVIDER_RATE_LIMITED'
    | 'PROVIDER_TIMEOUT' | 'PROVIDER_CANCELLED' | 'PROVIDER_OUTPUT_INVALID'
    | 'PROVIDER_MODEL_MISMATCH' | 'PROVIDER_USAGE_INVALID' | 'SOURCE_COVERAGE_INCOMPLETE',
  public readonly effectMayHaveOccurred: boolean) {
    super(code); this.name = 'StudioProviderGatewayError';
  }
}

const gatewayFailure = (error: unknown, cancelled: boolean) => {
  if (cancelled) return new StudioProviderGatewayError('PROVIDER_CANCELLED', true);
  const code = error instanceof EnterpriseAiGatewayError ? error.code : 'PROVIDER_REQUEST_FAILED';
  if (code === 'PROVIDER_RATE_LIMITED') return new StudioProviderGatewayError('PROVIDER_RATE_LIMITED', true);
  if (code === 'PROVIDER_TIMEOUT') return new StudioProviderGatewayError('PROVIDER_TIMEOUT', true);
  if (code === 'PROVIDER_MODEL_MISMATCH') return new StudioProviderGatewayError('PROVIDER_MODEL_MISMATCH', true);
  if (code === 'PROVIDER_USAGE_INVALID') return new StudioProviderGatewayError('PROVIDER_USAGE_INVALID', true);
  if (code === 'PROVIDER_RESPONSE_INVALID') return new StudioProviderGatewayError('PROVIDER_OUTPUT_INVALID', true);
  if (['CAPABILITY_UNAVAILABLE', 'PROVIDER_UNSUPPORTED', 'SECRET_REFERENCE_UNSAFE', 'SECRET_UNAVAILABLE', 'ENDPOINT_UNSAFE'].includes(code)) {
    return new StudioProviderGatewayError('PROVIDER_ROUTE_UNAVAILABLE', false);
  }
  if (code === 'PROMPT_TOO_LARGE') return new StudioProviderGatewayError('SOURCE_COVERAGE_INCOMPLETE', false);
  return new StudioProviderGatewayError('PROVIDER_REQUEST_FAILED', true);
};

const cancellableFetch = (signal: AbortSignal | undefined, fetchImpl: typeof fetch): typeof fetch => async (input, init?: RequestInit) => {
  const options = init ?? {};
  if (!signal) return fetchImpl(input, options);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const combined = typeof AbortSignal.any === 'function'
    ? AbortSignal.any([signal, ...(options.signal ? [options.signal] : [])])
    : signal;
  return fetchImpl(input, { ...options, signal: combined });
};

const buildUntrustedStudioInput = (
  input: Pick<StudioProviderGatewayInput, 'sourcePackage' | 'templatePayload' | 'manualBrief'>,
) => JSON.stringify({
  contractVersion: 'studio-artifact-2',
  sourcePackage: input.sourcePackage,
  template: input.templatePayload,
  manualBrief: input.manualBrief,
});

const taskInstruction = [
  'Generate one governed Studio document as strict JSON for human review.',
  'Return contractVersion, title, summary, sections, and coverage only.',
  'Each section requires a stable id, title, body, sourceAnchors, and labels.',
  'A section without source anchors must carry human_authored, template_required, or assumption.',
  'Every selected source must be represented in coverage; never truncate, invent a source, approve a document, or change Assess scoring.',
].join(' ');

export const estimateStudioProviderInputTokens = (
  input: Pick<StudioProviderGatewayInput, 'sourcePackage' | 'templatePayload' | 'manualBrief'>,
) => estimateMaximumProviderInputTokens({
  capability: STUDIO_PROVIDER_CAPABILITY,
  taskInstruction,
  untrustedSource: buildUntrustedStudioInput(input),
});

/**
 * Studio intentionally owns no provider URL, header, secret or response
 * adapter. All six identities execute through the shared Enterprise gateway.
 */
export const callStudioArtifactProvider = async (
  input: StudioProviderGatewayInput,
  deps: {
    runGateway?: typeof runGovernedProviderRequest;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<StudioProviderGatewayResult> => {
  if (!ENTERPRISE_AI_PROVIDERS.includes(input.plan.provider)
    || input.plan.resolverDecision.status !== 'allowed'
    || input.plan.resolverDecision.operation !== STUDIO_PROVIDER_CAPABILITY
    || input.plan.resolverDecision.routeId !== input.plan.routeId
    || input.plan.resolverDecision.providerConfigId !== input.plan.providerConfigId
    || input.plan.resolverDecision.model !== input.plan.model) {
    throw new StudioProviderGatewayError('PROVIDER_ROUTE_UNAVAILABLE', false);
  }
  const request: EnterpriseProviderRequest = {
    provider: input.plan.provider,
    endpoint: input.plan.endpoint,
    deployment: input.plan.deployment,
    model: input.plan.model,
    capability: STUDIO_PROVIDER_CAPABILITY,
    untrustedSource: buildUntrustedStudioInput(input),
    taskInstruction,
    maxOutputTokens: input.maximumOutputTokens,
    timeoutMs: input.timeoutMs,
    authorization: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      providerConfigId: input.plan.providerConfigId,
      capability: STUDIO_PROVIDER_CAPABILITY,
      routeEnabled: true,
      resolverDecision: input.plan.resolverDecision,
    },
  };
  let result: EnterpriseProviderResult;
  try {
    result = await (deps.runGateway ?? runGovernedProviderRequest)(request, {
      fetchImpl: cancellableFetch(input.signal, deps.fetchImpl ?? fetch),
    });
  } catch (error) { throw gatewayFailure(error, input.signal?.aborted === true); }
  if (result.provider !== input.plan.provider || result.model !== input.plan.model) {
    throw new StudioProviderGatewayError('PROVIDER_MODEL_MISMATCH', true);
  }
  if (!Number.isSafeInteger(result.usage.inputTokens) || result.usage.inputTokens < 0
    || !Number.isSafeInteger(result.usage.outputTokens) || result.usage.outputTokens < 0
    || !Number.isSafeInteger(result.usage.totalTokens) || result.usage.totalTokens < 1
    || result.usage.inputTokens + result.usage.outputTokens !== result.usage.totalTokens) {
    throw new StudioProviderGatewayError('PROVIDER_USAGE_INVALID', true);
  }
  let content: JsonObject;
  try { content = parseJsonObjectResponse<JsonObject>(result.output); }
  catch (error) { throw gatewayFailure(error, false); }
  return {
    provider: result.provider as EnterpriseAiProvider,
    model: result.model,
    content,
    usage: result.usage,
  };
};
