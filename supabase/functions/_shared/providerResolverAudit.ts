export type ProviderResolverAuditStatus = 'allowed' | 'blocked';
export type ProviderResolverAuditPolicyResult = 'allowed' | 'blocked';

export type ProviderResolverAuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | ProviderResolverAuditMetadataValue[]
  | { [key: string]: ProviderResolverAuditMetadataValue };

export type ProviderResolverAuditEventShell = {
  schemaVersion: 1;
  eventType: 'ai_provider_resolver_decision';
  orgId?: string;
  workspaceId?: string;
  provider?: string;
  providerConfigId?: string;
  keyRefId?: string;
  operation?: string;
  mode?: string;
  policyResult: ProviderResolverAuditPolicyResult;
  status: ProviderResolverAuditStatus;
  failureClass?: string;
  actorId?: string;
  serviceContext: 'provider_resolver';
  correlationId: string;
  evidenceRef?: string;
  metadata: Record<string, ProviderResolverAuditMetadataValue>;
};

export class ProviderResolverAuditMetadataError extends Error {
  constructor(message = 'Provider resolver audit metadata contains prohibited fields.') {
    super(message);
    this.name = 'ProviderResolverAuditMetadataError';
  }
}

const prohibitedMetadataKeys = new Set([
  'apikey',
  'authheader',
  'authorization',
  'bearertoken',
  'completion',
  'completionbody',
  'cookie',
  'encryptedkey',
  'prompt',
  'promptbody',
  'providerkey',
  'providerpayload',
  'providerrequest',
  'providerresponse',
  'rawcompletion',
  'rawkey',
  'rawprompt',
  'responsebody',
  'secret',
  'secretref',
  'secretvalue',
  'servicerolekey',
  'sessiontoken',
]);

const prohibitedValuePattern = /^(bearer\s+|basic\s+|sk-|sk_|gsk_|aiza|supabase_service_role_key)/i;

const normalizeMetadataKey = (key: string) => key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const assertMetadataValueIsSafe = (value: ProviderResolverAuditMetadataValue): void => {
  if (typeof value === 'string') {
    if (prohibitedValuePattern.test(value.trim())) {
      throw new ProviderResolverAuditMetadataError();
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) assertMetadataValueIsSafe(item);
    return;
  }

  if (value && typeof value === 'object') {
    assertAuditMetadataIsSafe(value);
  }
};

export const assertAuditMetadataIsSafe = (
  metadata: Record<string, ProviderResolverAuditMetadataValue>,
): void => {
  for (const [key, value] of Object.entries(metadata)) {
    if (prohibitedMetadataKeys.has(normalizeMetadataKey(key))) {
      throw new ProviderResolverAuditMetadataError();
    }
    assertMetadataValueIsSafe(value);
  }
};

export const buildProviderResolverAuditEventShell = (input: {
  orgId?: string;
  workspaceId?: string;
  provider?: string;
  providerConfigId?: string;
  keyRefId?: string;
  operation?: string;
  mode?: string;
  policyResult: ProviderResolverAuditPolicyResult;
  status: ProviderResolverAuditStatus;
  failureClass?: string;
  actorId?: string;
  correlationId: string;
  evidenceRef?: string;
  metadata?: Record<string, ProviderResolverAuditMetadataValue>;
}): ProviderResolverAuditEventShell => {
  const metadata = input.metadata || {};
  assertAuditMetadataIsSafe(metadata);

  return {
    schemaVersion: 1,
    eventType: 'ai_provider_resolver_decision',
    orgId: input.orgId,
    workspaceId: input.workspaceId,
    provider: input.provider,
    providerConfigId: input.providerConfigId,
    keyRefId: input.keyRefId,
    operation: input.operation,
    mode: input.mode,
    policyResult: input.policyResult,
    status: input.status,
    failureClass: input.failureClass,
    actorId: input.actorId,
    serviceContext: 'provider_resolver',
    correlationId: input.correlationId,
    evidenceRef: input.evidenceRef,
    metadata,
  };
};
