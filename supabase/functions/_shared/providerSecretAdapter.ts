import {
  AllowedProviderResolverDecision,
  ProviderResolverDecision,
  ProviderResolverProvider,
} from './providerResolver';
import { postgrest } from './supabase';

export type ProviderSecretLookupEligibility =
  | {
      status: 'eligible';
      futureLookupEligible: true;
      provider: ProviderResolverProvider;
      providerConfigId: string;
      keyRefId: string;
      correlationId: string;
    }
  | {
      status: 'blocked';
      futureLookupEligible: false;
      failureClass:
        | 'provider_call_blocked'
        | 'key_reference_ineligible'
        | 'secret_reference_unsafe';
      correlationId: string;
    };

export type ProviderSecretLookupFailureClass =
  | 'provider_call_blocked'
  | 'key_reference_ineligible'
  | 'secret_reference_unsafe';

export type ProviderSecretLookupResult =
  | {
      status: 'resolved';
      provider: ProviderResolverProvider;
      correlationId: string;
      apiKey: string;
    }
  | {
      status: 'blocked';
      failureClass: ProviderSecretLookupFailureClass;
      correlationId: string;
    };

export type ProviderSecretKeyRefRow = {
  id: string;
  org_id: string;
  provider: string;
  resolver_type: string;
  secret_ref: string;
  status: string;
  expires_at?: string | null;
  deleted_at?: string | null;
};

const containsProhibitedSecretReferenceKey = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (normalized === 'secretref' || normalized === 'secret' || normalized === 'secretvalue') {
      return true;
    }
    if (containsProhibitedSecretReferenceKey(child)) return true;
  }

  return false;
};

const isAllowedDecision = (
  decision: ProviderResolverDecision,
): decision is AllowedProviderResolverDecision => decision.status === 'allowed';

export const evaluateProviderSecretLookupEligibility = (
  decision: ProviderResolverDecision,
): ProviderSecretLookupEligibility => {
  if (!isAllowedDecision(decision)) {
    return {
      status: 'blocked',
      futureLookupEligible: false,
      failureClass: 'provider_call_blocked',
      correlationId: decision.correlationId,
    };
  }

  if (containsProhibitedSecretReferenceKey(decision)) {
    return {
      status: 'blocked',
      futureLookupEligible: false,
      failureClass: 'secret_reference_unsafe',
      correlationId: decision.correlationId,
    };
  }

  if (decision.keyRefResolverType !== 'server_reference') {
    return {
      status: 'blocked',
      futureLookupEligible: false,
      failureClass: 'key_reference_ineligible',
      correlationId: decision.correlationId,
    };
  }

  return {
    status: 'eligible',
    futureLookupEligible: true,
    provider: decision.provider,
    providerConfigId: decision.providerConfigId,
    keyRefId: decision.keyRefId,
    correlationId: decision.correlationId,
  };
};

const reservedEnvRefs = new Set([
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'JWT_SECRET',
]);

const providerSecretRefPatterns: Record<ProviderResolverProvider, RegExp> = {
  groq: /^AVALA_PROVIDER_SECRET_GROQ_[A-Z0-9_]+$/,
  gemini: /^AVALA_PROVIDER_SECRET_GEMINI_[A-Z0-9_]+$/,
};

const isExpired = (expiresAt: string | null | undefined, now: Date) =>
  Boolean(expiresAt && new Date(expiresAt).getTime() <= now.getTime());

const isAllowedProviderSecretRef = (
  provider: ProviderResolverProvider,
  secretRef: string,
) => {
  if (reservedEnvRefs.has(secretRef)) return false;
  return providerSecretRefPatterns[provider].test(secretRef);
};

const readServerEnv = (name: string) => {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.(name);
};

const defaultLookupKeyRef = async (
  decision: AllowedProviderResolverDecision,
): Promise<ProviderSecretKeyRefRow | null> => {
  const rows = await postgrest<ProviderSecretKeyRefRow[]>(
    `ai_provider_key_refs?select=id,org_id,provider,resolver_type,secret_ref,status,expires_at,deleted_at&id=eq.${encodeURIComponent(decision.keyRefId)}&org_id=eq.${encodeURIComponent(decision.orgId)}&provider=eq.${encodeURIComponent(decision.provider)}&limit=1`,
    { method: 'GET' },
  );
  return rows[0] || null;
};

export const resolveProviderSecretForDecision = async (
  decision: ProviderResolverDecision,
  deps: {
    lookupKeyRef?: (decision: AllowedProviderResolverDecision) => Promise<ProviderSecretKeyRefRow | null>;
    readEnv?: (name: string) => string | undefined;
    now?: () => Date;
  } = {},
): Promise<ProviderSecretLookupResult> => {
  const eligibility = evaluateProviderSecretLookupEligibility(decision);
  if (eligibility.status === 'blocked') {
    return {
      status: 'blocked',
      failureClass: eligibility.failureClass,
      correlationId: eligibility.correlationId,
    };
  }

  const allowedDecision = decision as AllowedProviderResolverDecision;
  const keyRef = await (deps.lookupKeyRef || defaultLookupKeyRef)(allowedDecision);
  const now = (deps.now || (() => new Date()))();

  if (
    !keyRef
    || keyRef.id !== allowedDecision.keyRefId
    || keyRef.org_id !== allowedDecision.orgId
    || keyRef.provider !== allowedDecision.provider
    || keyRef.status !== 'active'
    || keyRef.deleted_at
    || isExpired(keyRef.expires_at, now)
    || keyRef.resolver_type === 'manual_placeholder'
    || keyRef.resolver_type === 'external_secret_reference'
  ) {
    return {
      status: 'blocked',
      failureClass: 'key_reference_ineligible',
      correlationId: allowedDecision.correlationId,
    };
  }

  if (
    keyRef.resolver_type !== 'server_reference'
    || !isAllowedProviderSecretRef(allowedDecision.provider, keyRef.secret_ref)
  ) {
    return {
      status: 'blocked',
      failureClass: 'secret_reference_unsafe',
      correlationId: allowedDecision.correlationId,
    };
  }

  const apiKey = (deps.readEnv || readServerEnv)(keyRef.secret_ref);
  if (!apiKey) {
    return {
      status: 'blocked',
      failureClass: 'key_reference_ineligible',
      correlationId: allowedDecision.correlationId,
    };
  }

  return {
    status: 'resolved',
    provider: allowedDecision.provider,
    correlationId: allowedDecision.correlationId,
    apiKey,
  };
};
