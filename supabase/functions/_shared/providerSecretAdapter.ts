import {
  AllowedEnterpriseProviderResolverDecision,
  AllowedProviderResolverDecision,
  ProviderResolverDecision,
  ProviderResolverSupportedProvider,
} from './providerResolver.ts';
import { postgrest } from './supabase.ts';

export type ProviderSecretLookupEligibility =
  | {
      status: 'eligible';
      futureLookupEligible: true;
      provider: ProviderResolverSupportedProvider;
      providerConfigId: string;
      keyRefId: string;
      correlationId: string;
    }
  | {
      status: 'blocked';
      futureLookupEligible: false;
      failureClass: ProviderSecretLookupFailureClass;
      correlationId: string;
    };

export type ProviderSecretLookupFailureClass =
  | 'provider_call_blocked'
  | 'key_reference_ineligible'
  | 'secret_reference_unsafe'
  | 'secret_backend_unavailable';

export type ProviderSecretLookupResult =
  | {
      status: 'resolved';
      provider: ProviderResolverSupportedProvider;
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

export class ProviderSecretBackendError extends Error {
  constructor(public readonly code: 'SECRET_BACKEND_UNAVAILABLE' | 'SECRET_REFERENCE_UNSAFE') {
    super(code);
    this.name = 'ProviderSecretBackendError';
  }
}

export type ProviderSecretBackend = {
  kind: 'environment' | 'vault';
  writable: boolean;
  resolve(input: { provider: ProviderResolverSupportedProvider; secretRef: string; organizationId: string }): Promise<string | undefined>;
  write?(input: { provider: ProviderResolverSupportedProvider; secretRef: string; organizationId: string; value: string }): Promise<void>;
  remove?(input: { provider: ProviderResolverSupportedProvider; secretRef: string; organizationId: string }): Promise<void>;
};

const containsProhibitedSecretReferenceKey = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (normalized === 'secretref' || normalized === 'secret' || normalized === 'secretvalue') return true;
    if (containsProhibitedSecretReferenceKey(child)) return true;
  }
  return false;
};

const isAllowedDecision = (
  decision: ProviderResolverDecision,
): decision is AllowedProviderResolverDecision | AllowedEnterpriseProviderResolverDecision => decision.status === 'allowed';

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

const providerSecretRefPatterns: Record<ProviderResolverSupportedProvider, RegExp> = {
  groq: /^AVALA_PROVIDER_SECRET_GROQ_[A-Z0-9_]+$/,
  gemini: /^AVALA_PROVIDER_SECRET_GEMINI_[A-Z0-9_]+$/,
  openai: /^AVALA_PROVIDER_SECRET_OPENAI_[A-Z0-9_]+$/,
  azure_openai: /^AVALA_PROVIDER_SECRET_AZURE_OPENAI_[A-Z0-9_]+$/,
  anthropic: /^AVALA_PROVIDER_SECRET_ANTHROPIC_[A-Z0-9_]+$/,
  openai_compatible: /^AVALA_PROVIDER_SECRET_OPENAI_COMPATIBLE_[A-Z0-9_]+$/,
};

const tenantSecretSegment = (organizationId: string) => organizationId.replaceAll('-', '').toUpperCase();

export const isAllowedProviderSecretRef = (
  provider: ProviderResolverSupportedProvider,
  secretRef: string,
  organizationId?: string,
) => Boolean(
  typeof secretRef === 'string'
  && !reservedEnvRefs.has(secretRef)
  && providerSecretRefPatterns[provider]?.test(secretRef)
  && (!organizationId || secretRef.includes(`_${tenantSecretSegment(organizationId)}_`)),
);

export const createProviderSecretReference = (
  provider: ProviderResolverSupportedProvider,
  organizationId: string,
  nonce: string,
) => {
  const normalizedNonce = nonce.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!normalizedNonce) throw new ProviderSecretBackendError('SECRET_REFERENCE_UNSAFE');
  return `AVALA_PROVIDER_SECRET_${provider.toUpperCase()}_${tenantSecretSegment(organizationId)}_${normalizedNonce}`;
};

export const fingerprintProviderSecret = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)}`;
};

const readServerEnv = (name: string) => {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.(name);
};

export class EnvironmentProviderSecretBackend implements ProviderSecretBackend {
  readonly kind = 'environment' as const;
  readonly writable = false;
  constructor(private readonly readEnv: (name: string) => string | undefined = readServerEnv) {}

  async resolve(input: { provider: ProviderResolverSupportedProvider; secretRef: string; organizationId: string }) {
    if (!isAllowedProviderSecretRef(input.provider, input.secretRef, input.organizationId)) {
      throw new ProviderSecretBackendError('SECRET_REFERENCE_UNSAFE');
    }
    return this.readEnv(input.secretRef);
  }
}

const safeVaultAddress = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
};

export class VaultProviderSecretBackend implements ProviderSecretBackend {
  readonly kind = 'vault' as const;
  readonly writable = true;

  constructor(
    private readonly address: string,
    private readonly token: string,
    private readonly basePath = 'secret/data/avala/provider-secrets',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!safeVaultAddress(address) || !/^[A-Za-z0-9/_-]+$/.test(basePath) || !token) {
      throw new ProviderSecretBackendError('SECRET_BACKEND_UNAVAILABLE');
    }
  }

  private endpoint(input: { provider: ProviderResolverSupportedProvider; secretRef: string; organizationId: string }) {
    if (!isAllowedProviderSecretRef(input.provider, input.secretRef, input.organizationId)) {
      throw new ProviderSecretBackendError('SECRET_REFERENCE_UNSAFE');
    }
    const path = [this.basePath, tenantSecretSegment(input.organizationId), input.secretRef]
      .flatMap(part => part.split('/'))
      .map(encodeURIComponent)
      .join('/');
    return new URL(`/v1/${path}`, this.address);
  }

  private headers() {
    return { 'X-Vault-Token': this.token, 'Content-Type': 'application/json' };
  }

  async resolve(input: { provider: ProviderResolverSupportedProvider; secretRef: string; organizationId: string }) {
    const response = await this.fetchImpl(this.endpoint(input), {
      method: 'GET',
      redirect: 'error',
      headers: this.headers(),
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new ProviderSecretBackendError('SECRET_BACKEND_UNAVAILABLE');
    const body = await response.json() as { data?: { data?: { value?: unknown }; value?: unknown } };
    const value = body?.data?.data?.value ?? body?.data?.value;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  async write(input: { provider: ProviderResolverSupportedProvider; secretRef: string; organizationId: string; value: string }) {
    if (!input.value) throw new ProviderSecretBackendError('SECRET_BACKEND_UNAVAILABLE');
    const response = await this.fetchImpl(this.endpoint(input), {
      method: 'POST',
      redirect: 'error',
      headers: this.headers(),
      body: JSON.stringify({ data: { value: input.value } }),
    });
    if (!response.ok) throw new ProviderSecretBackendError('SECRET_BACKEND_UNAVAILABLE');
  }

  async remove(input: { provider: ProviderResolverSupportedProvider; secretRef: string; organizationId: string }) {
    const response = await this.fetchImpl(this.endpoint(input), {
      method: 'DELETE',
      redirect: 'error',
      headers: this.headers(),
    });
    if (!response.ok && response.status !== 404) throw new ProviderSecretBackendError('SECRET_BACKEND_UNAVAILABLE');
  }
}

export const createProviderSecretBackend = (): ProviderSecretBackend => {
  const address = readServerEnv('AVALA_VAULT_ADDR');
  const token = readServerEnv('AVALA_VAULT_TOKEN');
  if (address || token) {
    if (!address || !token) throw new ProviderSecretBackendError('SECRET_BACKEND_UNAVAILABLE');
    return new VaultProviderSecretBackend(
      address,
      token,
      readServerEnv('AVALA_VAULT_PROVIDER_SECRET_PATH') || 'secret/data/avala/provider-secrets',
    );
  }
  return new EnvironmentProviderSecretBackend();
};

const isExpired = (expiresAt: string | null | undefined, now: Date) =>
  Boolean(expiresAt && new Date(expiresAt).getTime() <= now.getTime());

const defaultLookupKeyRef = async (
  decision: AllowedProviderResolverDecision | AllowedEnterpriseProviderResolverDecision,
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
    lookupKeyRef?: (decision: AllowedProviderResolverDecision | AllowedEnterpriseProviderResolverDecision) => Promise<ProviderSecretKeyRefRow | null>;
    backend?: ProviderSecretBackend;
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
  const allowedDecision = decision as AllowedProviderResolverDecision | AllowedEnterpriseProviderResolverDecision;
  let keyRef: ProviderSecretKeyRefRow | null;
  try {
    keyRef = await (deps.lookupKeyRef || defaultLookupKeyRef)(allowedDecision);
  } catch {
    return { status: 'blocked', failureClass: 'key_reference_ineligible', correlationId: allowedDecision.correlationId };
  }
  const now = (deps.now || (() => new Date()))();
  if (
    !keyRef
    || keyRef.id !== allowedDecision.keyRefId
    || keyRef.org_id !== allowedDecision.orgId
    || keyRef.provider !== allowedDecision.provider
    || keyRef.status !== 'active'
    || keyRef.deleted_at
    || isExpired(keyRef.expires_at, now)
    || keyRef.resolver_type !== 'server_reference'
  ) {
    return { status: 'blocked', failureClass: 'key_reference_ineligible', correlationId: allowedDecision.correlationId };
  }
  if (!isAllowedProviderSecretRef(allowedDecision.provider, keyRef.secret_ref, allowedDecision.orgId)) {
    return { status: 'blocked', failureClass: 'secret_reference_unsafe', correlationId: allowedDecision.correlationId };
  }
  try {
    const backend = deps.backend || (deps.readEnv
      ? new EnvironmentProviderSecretBackend(deps.readEnv)
      : createProviderSecretBackend());
    const apiKey = await backend.resolve({
      provider: allowedDecision.provider,
      secretRef: keyRef.secret_ref,
      organizationId: allowedDecision.orgId,
    });
    if (!apiKey) {
      return { status: 'blocked', failureClass: 'key_reference_ineligible', correlationId: allowedDecision.correlationId };
    }
    return {
      status: 'resolved',
      provider: allowedDecision.provider,
      correlationId: allowedDecision.correlationId,
      apiKey,
    };
  } catch (error) {
    return {
      status: 'blocked',
      failureClass: error instanceof ProviderSecretBackendError && error.code === 'SECRET_REFERENCE_UNSAFE'
        ? 'secret_reference_unsafe'
        : 'secret_backend_unavailable',
      correlationId: allowedDecision.correlationId,
    };
  }
};
