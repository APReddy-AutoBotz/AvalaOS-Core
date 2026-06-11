import {
  ProviderResolverAuditEventShell,
  ProviderResolverAuditMetadataError,
  ProviderResolverAuditMetadataValue,
  buildProviderResolverAuditEventShell,
} from './providerResolverAudit.ts';

export type ProviderResolverProvider = 'gemini' | 'groq';
export type ProviderResolverMode = 'pilot' | 'production';
export type ProviderResolverOperation =
  | 'generate_document'
  | 'refine_section'
  | 'test_provider_connection';

export type ProviderResolverFailureClass =
  | 'mode_not_allowed'
  | 'unauthenticated'
  | 'org_missing'
  | 'membership_denied'
  | 'role_not_allowed'
  | 'operation_not_allowed'
  | 'provider_not_supported'
  | 'provider_policy_missing'
  | 'provider_policy_ambiguous'
  | 'provider_config_missing'
  | 'provider_config_ineligible'
  | 'key_reference_missing'
  | 'key_reference_ineligible'
  | 'secret_reference_unsafe'
  | 'audit_context_unsafe'
  | 'scanner_classification_missing'
  | 'provider_call_blocked';

export type ProviderResolverSafeUiCategory =
  | 'configuration_required'
  | 'authentication_required'
  | 'authorization_required'
  | 'unsupported_request'
  | 'provider_controls_required'
  | 'audit_controls_required'
  | 'implementation_control_required';

export type ProviderResolverRetryCategory =
  | 'retry_after_sign_in'
  | 'retry_after_request_correction'
  | 'retry_after_configuration_change'
  | 'retry_after_access_change'
  | 'do_not_retry';

export type ProviderResolverInput = {
  mode?: string | null;
  operation?: string | null;
  requestedProvider?: string | null;
  requestedProviderConfigId?: string | null;
  orgId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  evidenceRef?: string | null;
  auditMetadata?: Record<string, ProviderResolverAuditMetadataValue>;
  scannerClassification?: {
    status: 'classified' | 'missing';
    reference?: string;
  };
};

export type MembershipRoleContext = {
  status: 'active' | 'inactive' | 'invited' | 'suspended' | string;
  roleNames?: string[];
  roleIds?: string[];
};

export type ProviderPolicyRow = {
  id: string;
  org_id: string;
  provider_config_id: string;
  operation: string;
  mode: string;
  allowed_roles: string[];
  is_default: boolean;
  status: string;
  deleted_at?: string | null;
};

export type ProviderConfigRow = {
  id: string;
  org_id: string;
  provider: string;
  key_ref_id?: string | null;
  allowed_modes: string[];
  allowed_operations: string[];
  status: string;
  deleted_at?: string | null;
};

export type ProviderKeyRefRow = {
  id: string;
  org_id: string;
  provider: string;
  resolver_type: 'server_reference' | 'external_secret_reference' | 'manual_placeholder' | string;
  referenceSafety: 'reference_only' | 'missing' | 'unsafe';
  status: string;
  expires_at?: string | null;
  deleted_at?: string | null;
};

export type PolicyLookupInput = {
  orgId: string;
  operation: ProviderResolverOperation;
  mode: ProviderResolverMode;
  requestedProviderConfigId?: string;
};

export type ConfigLookupInput = {
  orgId: string;
  providerConfigId: string;
};

export type KeyRefLookupInput = {
  orgId: string;
  provider: ProviderResolverProvider;
  keyRefId: string;
};

export type ProviderResolverDeps = {
  now: () => Date;
  queryMembershipAndRoles: (input: { orgId: string; actorId: string }) => Promise<MembershipRoleContext | null>;
  queryProviderPolicy: (input: PolicyLookupInput) => Promise<ProviderPolicyRow[]>;
  queryProviderConfig: (input: ConfigLookupInput) => Promise<ProviderConfigRow | null>;
  queryProviderKeyRef: (input: KeyRefLookupInput) => Promise<ProviderKeyRefRow | null>;
  createCorrelationId: () => string;
};

export type AllowedProviderResolverDecision = {
  status: 'allowed';
  futureSecretLookupEligible: true;
  provider: ProviderResolverProvider;
  providerConfigId: string;
  keyRefId: string;
  keyRefResolverType: 'server_reference';
  operation: ProviderResolverOperation;
  mode: ProviderResolverMode;
  orgId: string;
  workspaceId?: string;
  actorId: string;
  correlationId: string;
  evidenceRef?: string;
  policyResult: 'allowed';
  auditEvent: ProviderResolverAuditEventShell;
};

export type BlockedProviderResolverDecision = {
  status: 'blocked';
  futureSecretLookupEligible: false;
  failureClass: ProviderResolverFailureClass;
  safeUiMessageCategory: ProviderResolverSafeUiCategory;
  retryCategory: ProviderResolverRetryCategory;
  provider?: ProviderResolverProvider;
  providerConfigId?: string;
  keyRefId?: string;
  operation?: ProviderResolverOperation;
  mode?: ProviderResolverMode;
  orgId?: string;
  workspaceId?: string;
  actorId?: string;
  correlationId: string;
  evidenceRef?: string;
  policyResult: 'blocked';
  auditEvent: ProviderResolverAuditEventShell;
};

export type ProviderResolverDecision = AllowedProviderResolverDecision | BlockedProviderResolverDecision;

const providers: ProviderResolverProvider[] = ['gemini', 'groq'];
const modes: ProviderResolverMode[] = ['pilot', 'production'];
const operations: ProviderResolverOperation[] = [
  'generate_document',
  'refine_section',
  'test_provider_connection',
];

const normalizeString = (value?: string | null) => value?.trim() || undefined;

const normalizeProvider = (value?: string | null): ProviderResolverProvider | undefined => {
  const normalized = normalizeString(value)?.toLowerCase();
  return providers.includes(normalized as ProviderResolverProvider)
    ? normalized as ProviderResolverProvider
    : undefined;
};

const normalizeMode = (value?: string | null): ProviderResolverMode | undefined => {
  const normalized = normalizeString(value)?.toLowerCase();
  return modes.includes(normalized as ProviderResolverMode)
    ? normalized as ProviderResolverMode
    : undefined;
};

const normalizeOperation = (value?: string | null): ProviderResolverOperation | undefined => {
  const normalized = normalizeString(value)?.toLowerCase();
  return operations.includes(normalized as ProviderResolverOperation)
    ? normalized as ProviderResolverOperation
    : undefined;
};

const hasSafeCorrelationIdShape = (value: string) => /^[a-zA-Z0-9._:-]{8,128}$/.test(value);

const resolveCorrelationId = (input: ProviderResolverInput, deps: ProviderResolverDeps) => {
  const candidate = normalizeString(input.correlationId);
  return candidate && hasSafeCorrelationIdShape(candidate) ? candidate : deps.createCorrelationId();
};

const failureUiCategory: Record<ProviderResolverFailureClass, ProviderResolverSafeUiCategory> = {
  mode_not_allowed: 'configuration_required',
  unauthenticated: 'authentication_required',
  org_missing: 'configuration_required',
  membership_denied: 'authorization_required',
  role_not_allowed: 'authorization_required',
  operation_not_allowed: 'unsupported_request',
  provider_not_supported: 'unsupported_request',
  provider_policy_missing: 'provider_controls_required',
  provider_policy_ambiguous: 'provider_controls_required',
  provider_config_missing: 'provider_controls_required',
  provider_config_ineligible: 'provider_controls_required',
  key_reference_missing: 'provider_controls_required',
  key_reference_ineligible: 'provider_controls_required',
  secret_reference_unsafe: 'provider_controls_required',
  audit_context_unsafe: 'audit_controls_required',
  scanner_classification_missing: 'implementation_control_required',
  provider_call_blocked: 'provider_controls_required',
};

const failureRetryCategory: Record<ProviderResolverFailureClass, ProviderResolverRetryCategory> = {
  mode_not_allowed: 'retry_after_configuration_change',
  unauthenticated: 'retry_after_sign_in',
  org_missing: 'retry_after_request_correction',
  membership_denied: 'retry_after_access_change',
  role_not_allowed: 'retry_after_access_change',
  operation_not_allowed: 'retry_after_configuration_change',
  provider_not_supported: 'retry_after_configuration_change',
  provider_policy_missing: 'retry_after_configuration_change',
  provider_policy_ambiguous: 'retry_after_configuration_change',
  provider_config_missing: 'retry_after_configuration_change',
  provider_config_ineligible: 'retry_after_configuration_change',
  key_reference_missing: 'retry_after_configuration_change',
  key_reference_ineligible: 'retry_after_configuration_change',
  secret_reference_unsafe: 'retry_after_configuration_change',
  audit_context_unsafe: 'retry_after_configuration_change',
  scanner_classification_missing: 'do_not_retry',
  provider_call_blocked: 'retry_after_configuration_change',
};

const buildBlockedDecision = (input: {
  failureClass: ProviderResolverFailureClass;
  correlationId: string;
  provider?: ProviderResolverProvider;
  providerConfigId?: string;
  keyRefId?: string;
  operation?: ProviderResolverOperation;
  mode?: ProviderResolverMode;
  orgId?: string;
  workspaceId?: string;
  actorId?: string;
  evidenceRef?: string;
  metadata?: Record<string, ProviderResolverAuditMetadataValue>;
}): BlockedProviderResolverDecision => {
  const auditEvent = buildProviderResolverAuditEventShell({
    orgId: input.orgId,
    workspaceId: input.workspaceId,
    provider: input.provider,
    providerConfigId: input.providerConfigId,
    keyRefId: input.keyRefId,
    operation: input.operation,
    mode: input.mode,
    policyResult: 'blocked',
    status: 'blocked',
    failureClass: input.failureClass,
    actorId: input.actorId,
    correlationId: input.correlationId,
    evidenceRef: input.evidenceRef,
    metadata: input.metadata || {},
  });

  return {
    status: 'blocked',
    futureSecretLookupEligible: false,
    failureClass: input.failureClass,
    safeUiMessageCategory: failureUiCategory[input.failureClass],
    retryCategory: failureRetryCategory[input.failureClass],
    provider: input.provider,
    providerConfigId: input.providerConfigId,
    keyRefId: input.keyRefId,
    operation: input.operation,
    mode: input.mode,
    orgId: input.orgId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    correlationId: input.correlationId,
    evidenceRef: input.evidenceRef,
    policyResult: 'blocked',
    auditEvent,
  };
};

const roleMatchesPolicy = (membership: MembershipRoleContext, policy: ProviderPolicyRow) => {
  const allowedRoles = policy.allowed_roles || [];
  if (allowedRoles.length === 0) return false;

  const roleNames = new Set((membership.roleNames || []).map(role => role.trim()).filter(Boolean));
  const roleIds = new Set((membership.roleIds || []).map(role => role.trim()).filter(Boolean));
  return allowedRoles.some(role => roleNames.has(role) || roleIds.has(role));
};

const isPolicyActiveForRequest = (
  policy: ProviderPolicyRow,
  orgId: string,
  operation: ProviderResolverOperation,
  mode: ProviderResolverMode,
  requestedProviderConfigId?: string,
) =>
  policy.org_id === orgId
  && policy.operation === operation
  && policy.mode === mode
  && policy.status === 'active'
  && !policy.deleted_at
  && (!requestedProviderConfigId || policy.provider_config_id === requestedProviderConfigId)
  && (requestedProviderConfigId ? true : policy.is_default === true);

const isConfigEligible = (
  config: ProviderConfigRow,
  orgId: string,
  provider: ProviderResolverProvider,
  operation: ProviderResolverOperation,
  mode: ProviderResolverMode,
) =>
  config.org_id === orgId
  && config.provider === provider
  && config.status === 'active'
  && !config.deleted_at
  && config.allowed_modes.includes(mode)
  && config.allowed_operations.includes(operation);

const isExpired = (expiresAt: string | null | undefined, now: Date) =>
  Boolean(expiresAt && new Date(expiresAt).getTime() <= now.getTime());

const classifyKeyRefFailure = (
  keyRef: ProviderKeyRefRow,
  orgId: string,
  provider: ProviderResolverProvider,
  now: Date,
): ProviderResolverFailureClass | null => {
  if (
    keyRef.org_id !== orgId
    || keyRef.provider !== provider
    || keyRef.status !== 'active'
    || keyRef.deleted_at
    || isExpired(keyRef.expires_at, now)
    || keyRef.resolver_type === 'manual_placeholder'
    || keyRef.resolver_type === 'external_secret_reference'
  ) {
    return 'key_reference_ineligible';
  }

  if (keyRef.resolver_type !== 'server_reference' || keyRef.referenceSafety !== 'reference_only') {
    return 'secret_reference_unsafe';
  }

  return null;
};

export const resolveProviderForOperation = async (
  input: ProviderResolverInput,
  deps: ProviderResolverDeps,
): Promise<ProviderResolverDecision> => {
  const correlationId = resolveCorrelationId(input, deps);
  const evidenceRef = normalizeString(input.evidenceRef);
  const workspaceId = normalizeString(input.workspaceId);
  const requestedProviderConfigId = normalizeString(input.requestedProviderConfigId);
  const orgId = normalizeString(input.orgId);
  const actorId = normalizeString(input.actorId);
  const mode = normalizeMode(input.mode);
  const operation = normalizeOperation(input.operation);
  const provider = normalizeProvider(input.requestedProvider);

  const block = (failureClass: ProviderResolverFailureClass, extra: {
    providerConfigId?: string;
    keyRefId?: string;
    metadata?: Record<string, ProviderResolverAuditMetadataValue>;
  } = {}) => buildBlockedDecision({
    failureClass,
    correlationId,
    provider,
    providerConfigId: extra.providerConfigId,
    keyRefId: extra.keyRefId,
    operation,
    mode,
    orgId,
    workspaceId,
    actorId,
    evidenceRef,
    metadata: extra.metadata,
  });

  if (!mode) return block('mode_not_allowed');
  if (!actorId) return block('unauthenticated');
  if (!orgId) return block('org_missing');

  const membership = await deps.queryMembershipAndRoles({ orgId, actorId });
  if (!membership || membership.status !== 'active') return block('membership_denied');
  if ((membership.roleNames || []).length === 0 && (membership.roleIds || []).length === 0) {
    return block('role_not_allowed');
  }

  if (!operation) return block('operation_not_allowed');
  if (!provider) return block('provider_not_supported');

  const policies = await deps.queryProviderPolicy({
    orgId,
    operation,
    mode,
    requestedProviderConfigId,
  });
  const activePolicies = policies.filter(policy =>
    isPolicyActiveForRequest(policy, orgId, operation, mode, requestedProviderConfigId)
  );
  if (activePolicies.length === 0) return block('provider_policy_missing');
  if (activePolicies.length > 1) return block('provider_policy_ambiguous');

  const policy = activePolicies[0];
  if (!roleMatchesPolicy(membership, policy)) return block('role_not_allowed', {
    providerConfigId: policy.provider_config_id,
  });

  const providerConfigId = policy.provider_config_id;
  const config = await deps.queryProviderConfig({ orgId, providerConfigId });
  if (!config) return block('provider_config_missing', { providerConfigId });
  if (!isConfigEligible(config, orgId, provider, operation, mode)) {
    return block('provider_config_ineligible', { providerConfigId: config.id });
  }

  if (!config.key_ref_id) return block('key_reference_missing', { providerConfigId: config.id });

  const keyRef = await deps.queryProviderKeyRef({
    orgId,
    provider,
    keyRefId: config.key_ref_id,
  });
  if (!keyRef) {
    return block('key_reference_missing', {
      providerConfigId: config.id,
      keyRefId: config.key_ref_id,
    });
  }

  const keyRefFailure = classifyKeyRefFailure(keyRef, orgId, provider, deps.now());
  if (keyRefFailure) {
    return block(keyRefFailure, {
      providerConfigId: config.id,
      keyRefId: keyRef.id,
    });
  }

  if (input.scannerClassification?.status !== 'classified') {
    return block('scanner_classification_missing', {
      providerConfigId: config.id,
      keyRefId: keyRef.id,
    });
  }

  try {
    const auditEvent = buildProviderResolverAuditEventShell({
      orgId,
      workspaceId,
      provider,
      providerConfigId: config.id,
      keyRefId: keyRef.id,
      operation,
      mode,
      policyResult: 'allowed',
      status: 'allowed',
      actorId,
      correlationId,
      evidenceRef,
      metadata: {
        membership: 'active',
        policy: 'matched',
        providerConfig: 'eligible',
        keyReference: 'eligible_for_future_lookup',
        scannerClassification: input.scannerClassification.reference || 'classified',
        ...(input.auditMetadata || {}),
      },
    });

    return {
      status: 'allowed',
      futureSecretLookupEligible: true,
      provider,
      providerConfigId: config.id,
      keyRefId: keyRef.id,
      keyRefResolverType: 'server_reference',
      operation,
      mode,
      orgId,
      workspaceId,
      actorId,
      correlationId,
      evidenceRef,
      policyResult: 'allowed',
      auditEvent,
    };
  } catch (error) {
    if (error instanceof ProviderResolverAuditMetadataError) {
      return buildBlockedDecision({
        failureClass: 'audit_context_unsafe',
        correlationId,
        provider,
        providerConfigId: config.id,
        keyRefId: keyRef.id,
        operation,
        mode,
        orgId,
        workspaceId,
        actorId,
        evidenceRef,
      });
    }
    throw error;
  }
};
