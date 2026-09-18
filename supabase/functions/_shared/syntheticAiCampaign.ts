import type { EnterpriseAiCapability } from '../../../services/enterpriseIntelligence.ts';
import type { UnifiedEnterpriseAiProvider } from './enterpriseIntelligenceAi.ts';
import { rpc } from './supabase.ts';

type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;

export type SyntheticAiEffectOperation =
  | EnterpriseAiCapability
  | 'provider.validate';

export type SyntheticAiEffectInput = Readonly<{
  actorId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  receiptId: string;
  effectId: string;
  executionToken: string;
  executionFence: number;
  routeId?: string;
  providerConfigId: string;
  keyRefId: string;
  provider: UnifiedEnterpriseAiProvider;
  endpoint: string;
  model: string;
  operation: SyntheticAiEffectOperation;
  requestHash: string;
  maximumOutputTokens: number;
}>;

export type SyntheticAiEffectPermit = Readonly<{
  mode: 'ordinary' | 'campaign';
  reservationId?: string;
  ownsProviderEffect: boolean;
  replayed: boolean;
  binding: SyntheticAiEffectInput;
  targetFingerprint?: string;
  projectRef?: string;
}>;

export class SyntheticAiCampaignError extends Error {
  constructor(public readonly code:
    | 'AUTHORITY_UNAVAILABLE'
    | 'EFFECT_REPLAYED'
    | 'EFFECT_NOT_AUTHORIZED'
    | 'PERMIT_CONSUME_FAILED') {
    super(code);
    this.name = 'SyntheticAiCampaignError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGET = /^sha256:[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const PROJECT = /^[a-z0-9]{20}$/;
const providers = new Set<UnifiedEnterpriseAiProvider>([
  'openai','azure_openai','anthropic','gemini','groq','openai_compatible',
]);

const readServerEnv = (name: string) => (globalThis as typeof globalThis & {
  Deno?: { env?: { get?: (key: string) => string | undefined } };
}).Deno?.env?.get?.(name);

export const readSyntheticAiCampaignRuntimeBinding = (
  readEnv: (name: string) => string | undefined = readServerEnv,
): { targetFingerprint?: string; projectRef?: string } => {
  const targetFingerprint = readEnv('AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT')?.trim();
  if (!targetFingerprint) return {};
  const rawUrl = readEnv('SUPABASE_URL')?.trim();
  let parsed: URL;
  try { parsed = new URL(rawUrl || ''); } catch { throw new SyntheticAiCampaignError('AUTHORITY_UNAVAILABLE'); }
  const projectRef = parsed.hostname.endsWith('.supabase.co') ? parsed.hostname.slice(0, -'.supabase.co'.length) : '';
  if (!TARGET.test(targetFingerprint) || !PROJECT.test(projectRef)
    || parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash
    || parsed.username || parsed.password || parsed.port) {
    throw new SyntheticAiCampaignError('AUTHORITY_UNAVAILABLE');
  }
  return { targetFingerprint, projectRef };
};

const validateInput = (input: SyntheticAiEffectInput) => {
  if (![input.actorId, input.organizationId, input.workspaceId, input.receiptId, input.effectId,
    input.executionToken, input.providerConfigId, input.keyRefId].every(value => UUID.test(value))
    || !Number.isSafeInteger(input.authorizationVersion) || input.authorizationVersion < 1
    || !Number.isSafeInteger(input.executionFence) || input.executionFence < 1
    || typeof input.operation !== 'string' || !input.operation.trim() || input.operation.length > 120
    || !providers.has(input.provider)
    || typeof input.endpoint !== 'string' || !input.endpoint.startsWith('https://') || input.endpoint.length > 500
    || typeof input.model !== 'string' || !input.model.trim() || input.model.length > 200
    || !HASH.test(input.requestHash)
    || !Number.isSafeInteger(input.maximumOutputTokens) || input.maximumOutputTokens < 1 || input.maximumOutputTokens > 64_000
    || (input.operation === 'provider.validate') !== (input.routeId === undefined)
    || input.routeId !== undefined && !UUID.test(input.routeId)) {
    throw new SyntheticAiCampaignError('EFFECT_NOT_AUTHORIZED');
  }
};

const args = (input: SyntheticAiEffectInput, binding: { targetFingerprint?: string; projectRef?: string }) => ({
  p_actor: input.actorId,
  p_org: input.organizationId,
  p_workspace: input.workspaceId,
  p_authorization_version: input.authorizationVersion,
  p_target_fingerprint: binding.targetFingerprint ?? null,
  p_project_ref: binding.projectRef ?? null,
  p_receipt: input.receiptId,
  p_effect: input.effectId,
  p_execution_token: input.executionToken,
  p_execution_fence: input.executionFence,
  p_route: input.routeId ?? null,
  p_provider_config: input.providerConfigId,
  p_key_ref: input.keyRefId,
  p_provider: input.provider,
  p_endpoint: input.endpoint,
  p_model: input.model,
  p_operation: input.operation,
  p_effect_request_hash: input.requestHash,
  p_maximum_output_tokens: input.maximumOutputTokens,
});

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

export const reserveSyntheticAiProviderEffect = async (
  input: SyntheticAiEffectInput,
  deps: { invoke?: Rpc; readEnv?: (name: string) => string | undefined } = {},
): Promise<SyntheticAiEffectPermit> => {
  validateInput(input);
  const binding = readSyntheticAiCampaignRuntimeBinding(deps.readEnv);
  let value: Record<string, unknown>;
  try {
    value = await (deps.invoke ?? rpc)<Record<string, unknown>>(
      'synthetic_ai_campaign_reserve_effect', args(input, binding),
    );
  } catch { throw new SyntheticAiCampaignError('AUTHORITY_UNAVAILABLE'); }
  const mode = value?.mode;
  const ownsProviderEffect = value?.ownsProviderEffect;
  const replayed = value?.replayed;
  const reservationId = value?.reservationId;
  const validShape = mode === 'ordinary'
    ? exactKeys(value, ['mode','ownsProviderEffect','replayed'])
    : ownsProviderEffect === true
      ? exactKeys(value, ['mode','reservationId','ownsProviderEffect','replayed','consumed','debitUsdNanos','remainingUsdNanos'])
      : exactKeys(value, ['mode','reservationId','ownsProviderEffect','replayed','consumed']);
  if ((mode !== 'ordinary' && mode !== 'campaign') || typeof ownsProviderEffect !== 'boolean'
    || typeof replayed !== 'boolean'
    || ownsProviderEffect === replayed
    || (mode === 'campaign' && (typeof reservationId !== 'string' || !UUID.test(reservationId)))
    || (mode === 'ordinary' && reservationId !== undefined) || !validShape) {
    throw new SyntheticAiCampaignError('AUTHORITY_UNAVAILABLE');
  }
  if ((mode === 'campaign' && (!binding.targetFingerprint || !binding.projectRef))
    || (mode === 'ordinary' && (binding.targetFingerprint || binding.projectRef))) {
    throw new SyntheticAiCampaignError('AUTHORITY_UNAVAILABLE');
  }
  if (mode === 'campaign' && ownsProviderEffect === true
    && (value.consumed !== false || typeof value.debitUsdNanos !== 'number'
      || !Number.isSafeInteger(value.debitUsdNanos) || typeof value.remainingUsdNanos !== 'number'
      || !Number.isSafeInteger(value.remainingUsdNanos))) {
    throw new SyntheticAiCampaignError('AUTHORITY_UNAVAILABLE');
  }
  if (mode === 'campaign' && ownsProviderEffect === false && typeof value.consumed !== 'boolean') {
    throw new SyntheticAiCampaignError('AUTHORITY_UNAVAILABLE');
  }
  if (mode === 'campaign' && (input.provider !== 'openai' || input.endpoint !== 'https://api.openai.com'
    || input.model !== 'gpt-4.1-mini-2025-04-14'
    || input.maximumOutputTokens > 32_768
    || !['assess.evidence.extract','studio.document.generate','provider.validate'].includes(input.operation))) {
    throw new SyntheticAiCampaignError('EFFECT_NOT_AUTHORIZED');
  }
  const immutableInput = Object.freeze({ ...input });
  return Object.freeze({
    mode, ownsProviderEffect, replayed,
    ...(mode === 'campaign' ? { reservationId: reservationId as string } : {}),
    binding: immutableInput, ...binding,
  });
};

export const consumeSyntheticAiProviderEffect = async (
  permit: SyntheticAiEffectPermit,
  invoke: Rpc = rpc,
): Promise<void> => {
  validateInput(permit.binding);
  if (!permit.ownsProviderEffect || permit.replayed) throw new SyntheticAiCampaignError('EFFECT_REPLAYED');
  let value: Record<string, unknown>;
  try {
    value = await invoke<Record<string, unknown>>('synthetic_ai_campaign_consume_effect', {
      p_reservation: permit.reservationId ?? null,
      ...args(permit.binding, { targetFingerprint: permit.targetFingerprint, projectRef: permit.projectRef }),
    });
  } catch { throw new SyntheticAiCampaignError('PERMIT_CONSUME_FAILED'); }
  const consumeShape = permit.mode === 'ordinary'
    ? exactKeys(value, ['mode','consumed'])
    : exactKeys(value, ['mode','reservationId','consumed']);
  if (value?.mode !== permit.mode || value?.consumed !== true || !consumeShape
    || permit.mode === 'campaign' && value?.reservationId !== permit.reservationId) {
    throw new SyntheticAiCampaignError('PERMIT_CONSUME_FAILED');
  }
};

export const assertSyntheticAiLifecycleOperationAllowed = async (
  input: { organizationId: string; workspaceId: string; providerConfigId: string; operation: string },
  invoke: Rpc = rpc,
) => {
  try {
    const value = await invoke<Record<string, unknown>>('synthetic_ai_campaign_assert_lifecycle_operation', {
      p_org: input.organizationId, p_workspace: input.workspaceId,
      p_provider_config: input.providerConfigId, p_operation: input.operation,
    });
    if (!exactKeys(value, ['allowed','mode']) || value.allowed !== true
      || (value.mode !== 'ordinary' && value.mode !== 'campaign')) throw new Error();
  } catch { throw new SyntheticAiCampaignError('EFFECT_NOT_AUTHORIZED'); }
};

export const assertSyntheticAiLifecycleRegistrationAllowed = async (
  input: { organizationId: string; workspaceId: string },
  invoke: Rpc = rpc,
) => {
  try {
    const value = await invoke<Record<string, unknown>>('synthetic_ai_campaign_assert_lifecycle_registration', {
      p_org: input.organizationId, p_workspace: input.workspaceId,
    });
    if (!exactKeys(value, ['allowed','mode']) || value.allowed !== true || value.mode !== 'ordinary') throw new Error();
  } catch { throw new SyntheticAiCampaignError('EFFECT_NOT_AUTHORIZED'); }
};

export const assertSyntheticAiLegacyResolverAllowed = async (
  input: { organizationId: string; workspaceId?: string | null; providerConfigId: string; keyRefId: string },
  invoke: Rpc = rpc,
) => {
  try {
    const value = await invoke<Record<string, unknown>>('synthetic_ai_campaign_assert_legacy_resolver', {
      p_org: input.organizationId, p_workspace: input.workspaceId ?? null,
      p_provider_config: input.providerConfigId, p_key_ref: input.keyRefId,
    });
    if (!exactKeys(value, ['allowed','mode']) || value.allowed !== true || value.mode !== 'ordinary') throw new Error();
  } catch { throw new SyntheticAiCampaignError('EFFECT_NOT_AUTHORIZED'); }
};

export const syntheticAiCapabilityToOperation = (
  capability: EnterpriseAiCapability,
): SyntheticAiEffectOperation => capability;
