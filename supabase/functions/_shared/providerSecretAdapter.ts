import {
  AllowedProviderResolverDecision,
  ProviderResolverDecision,
  ProviderResolverProvider,
} from './providerResolver';

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
