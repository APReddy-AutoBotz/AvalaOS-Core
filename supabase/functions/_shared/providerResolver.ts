import {
  ProviderResolverAuditEventShell,
  ProviderResolverAuditMetadataError,
  ProviderResolverAuditMetadataValue,
  buildProviderResolverAuditEventShell,
} from './providerResolverAudit.ts';

export type EnterpriseProviderResolverProvider =
  | 'openai'
  | 'azure_openai'
  | 'anthropic'
  | 'gemini'
  | 'openai_compatible';
export type ProviderResolverProvider = 'gemini' | 'groq';
export type ProviderResolverSupportedProvider = ProviderResolverProvider | EnterpriseProviderResolverProvider;
export type ProviderResolverMode = 'pilot' | 'production';
export type ProviderResolverOperation =
  | 'generate_document'
  | 'refine_section'
  | 'test_provider_connection'
  | 'assess.evidence.extract'
  | 'assess.evidence.summarize'
  | 'delivery.work_items.draft'
  | 'modernization.rationale.draft'
  | 'assemble.blueprint.draft'
  | 'studio.document.generate';

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
  | 'provider_disabled'
  | 'provider_revoked'
  | 'provider_unvalidated'
  | 'provider_validation_stale'
  | 'provider_unavailable'
  | 'key_reference_missing'
  | 'key_reference_ineligible'
  | 'secret_reference_unsafe'
  | 'route_missing'
  | 'route_disabled'
  | 'model_not_allowed'
  | 'budget_exhausted'
  | 'wrong_tenant'
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
  endpoint_url?: string | null;
  deployment_name?: string | null;
  default_model?: string | null;
  model_allowlist?: string[] | null;
  budget_policy?: Record<string, unknown> | null;
  last_validated_at?: string | null;
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
  provider: ProviderResolverSupportedProvider;
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
  capability?: ProviderResolverOperation;
  model?: string;
  endpoint?: string;
  deployment?: string;
  auditEvent: ProviderResolverAuditEventShell;
};

export type AllowedEnterpriseProviderResolverDecision = Omit<
  AllowedProviderResolverDecision,
  'provider' | 'operation' | 'capability'
> & {
  provider: EnterpriseProviderResolverProvider;
  routeId: string;
  operation: ProviderResolverOperation;
  capability: ProviderResolverOperation;
};

export type BlockedProviderResolverDecision = {
  status: 'blocked';
  futureSecretLookupEligible: false;
  failureClass: ProviderResolverFailureClass;
  safeUiMessageCategory: ProviderResolverSafeUiCategory;
  retryCategory: ProviderResolverRetryCategory;
  provider?: ProviderResolverSupportedProvider;
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

export type ProviderResolverDecision = AllowedProviderResolverDecision | AllowedEnterpriseProviderResolverDecision | BlockedProviderResolverDecision;
export type LegacyProviderResolverDecision = AllowedProviderResolverDecision | BlockedProviderResolverDecision;
export type EnterpriseProviderResolverDecision = AllowedEnterpriseProviderResolverDecision | BlockedProviderResolverDecision;

const providers: ProviderResolverProvider[] = ['gemini', 'groq'];
const modes: ProviderResolverMode[] = ['pilot', 'production'];
const operations: ProviderResolverOperation[] = [
  'generate_document',
  'refine_section',
  'test_provider_connection',
  'assess.evidence.extract',
  'assess.evidence.summarize',
  'delivery.work_items.draft',
  'modernization.rationale.draft',
  'assemble.blueprint.draft',
  'studio.document.generate',
];

const normalizeString = (value?: string | null) => value?.trim() || undefined;

const normalizeProvider = (value?: string | null): ProviderResolverProvider | undefined => {
  const normalized = normalizeString(value)?.toLowerCase();
  return providers.includes(normalized as ProviderResolverProvider)
    ? normalized as ProviderResolverProvider
    : undefined;
};

const normalizeEnterpriseProvider = (value?: string | null): EnterpriseProviderResolverProvider | undefined => {
  const normalized = normalizeString(value)?.toLowerCase();
  return enterpriseProviders.has(normalized as EnterpriseProviderResolverProvider)
    ? normalized as EnterpriseProviderResolverProvider
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
  provider_disabled: 'provider_controls_required',
  provider_revoked: 'provider_controls_required',
  provider_unvalidated: 'provider_controls_required',
  provider_validation_stale: 'provider_controls_required',
  provider_unavailable: 'provider_controls_required',
  key_reference_missing: 'provider_controls_required',
  key_reference_ineligible: 'provider_controls_required',
  secret_reference_unsafe: 'provider_controls_required',
  route_missing: 'provider_controls_required',
  route_disabled: 'provider_controls_required',
  model_not_allowed: 'provider_controls_required',
  budget_exhausted: 'provider_controls_required',
  wrong_tenant: 'authorization_required',
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
  provider_disabled: 'retry_after_configuration_change',
  provider_revoked: 'do_not_retry',
  provider_unvalidated: 'retry_after_configuration_change',
  provider_validation_stale: 'retry_after_configuration_change',
  provider_unavailable: 'retry_after_configuration_change',
  key_reference_missing: 'retry_after_configuration_change',
  key_reference_ineligible: 'retry_after_configuration_change',
  secret_reference_unsafe: 'retry_after_configuration_change',
  route_missing: 'retry_after_configuration_change',
  route_disabled: 'retry_after_configuration_change',
  model_not_allowed: 'retry_after_configuration_change',
  budget_exhausted: 'retry_after_configuration_change',
  wrong_tenant: 'retry_after_access_change',
  audit_context_unsafe: 'retry_after_configuration_change',
  scanner_classification_missing: 'do_not_retry',
  provider_call_blocked: 'retry_after_configuration_change',
};

const buildBlockedDecision = (input: {
  failureClass: ProviderResolverFailureClass;
  correlationId: string;
  provider?: ProviderResolverSupportedProvider;
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
  provider: ProviderResolverSupportedProvider,
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
  provider: ProviderResolverSupportedProvider,
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
): Promise<LegacyProviderResolverDecision> => {
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

export const ENTERPRISE_PROVIDER_VALIDATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type EnterpriseProviderRouteRow = {
  id: string;
  org_id: string;
  workspace_id: string;
  provider_config_id: string;
  capability: ProviderResolverOperation;
  model: string;
  enabled: boolean;
  allowed_roles: string[];
  deleted_at?: string | null;
};

export type EnterpriseProviderUsage = {
  dailyRequests: number;
  monthlyTokens: number;
};

export type EnterpriseProviderRouteResolverDeps = {
  now: () => Date;
  createCorrelationId: () => string;
  queryRoutes: (input: {
    orgId: string;
    workspaceId: string;
    capability: ProviderResolverOperation;
    requestedProviderConfigId?: string;
    requestedRouteId?: string;
    includeDisabled: boolean;
  }) => Promise<EnterpriseProviderRouteRow[]>;
  queryProviderConfig: (input: ConfigLookupInput) => Promise<ProviderConfigRow | null>;
  queryProviderKeyRef: (input: KeyRefLookupInput) => Promise<ProviderKeyRefRow | null>;
  queryUsage: (input: {
    orgId: string;
    workspaceId: string;
    providerConfigId: string;
    now: Date;
  }) => Promise<EnterpriseProviderUsage>;
  isEndpointAllowed: (provider: EnterpriseProviderResolverProvider, endpoint: string) => boolean;
};

export type EnterpriseProviderRouteResolverInput = {
  mode: ProviderResolverMode;
  capability: ProviderResolverOperation;
  organizationId: string;
  workspaceId: string;
  actorId: string;
  roleNames: string[];
  roleIds?: string[];
  requestedProviderConfigId?: string;
  requestedRouteId?: string;
  requestedModel?: string;
  includeDisabled?: boolean;
  proposedAllowedRoles?: string[];
  /**
   * Lifecycle-only policy administration. The caller must first prove
   * `byok.manage` and validate every proposed role against server-owned scope.
   * Runtime callers must never set this flag.
   */
  policyManagementAuthorized?: true;
  correlationId?: string;
  evidenceRef?: string;
  scannerReference: string;
};

const enterpriseProviders = new Set<EnterpriseProviderResolverProvider>([
  'openai',
  'azure_openai',
  'anthropic',
  'gemini',
  'openai_compatible',
]);

const classifyEnterpriseConfig = (
  config: ProviderConfigRow,
  input: EnterpriseProviderRouteResolverInput,
  now: Date,
): ProviderResolverFailureClass | null => {
  if (config.org_id !== input.organizationId) return 'wrong_tenant';
  if (config.deleted_at || config.status === 'retired' || config.status === 'revoked') return 'provider_revoked';
  if (config.status === 'disabled') return 'provider_disabled';
  if (config.status !== 'active') return 'provider_config_ineligible';
  if (!enterpriseProviders.has(config.provider as EnterpriseProviderResolverProvider)) return 'provider_not_supported';
  if (!config.last_validated_at) return 'provider_unvalidated';
  const validatedAt = new Date(config.last_validated_at).getTime();
  if (!Number.isFinite(validatedAt) || validatedAt > now.getTime() || now.getTime() - validatedAt > ENTERPRISE_PROVIDER_VALIDATION_MAX_AGE_MS) {
    return 'provider_validation_stale';
  }
  return null;
};

const configuredBudget = (config: ProviderConfigRow) => {
  const policy = config.budget_policy || {};
  const readLimit = (key: 'dailyRequests' | 'monthlyTokens') => {
    const value = policy[key];
    return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
  };
  return { dailyRequests: readLimit('dailyRequests'), monthlyTokens: readLimit('monthlyTokens') };
};

/**
 * Canonical Enterprise Intelligence route authority. It intentionally returns
 * no secret reference or key material; the secret adapter re-loads the exact
 * tenant/provider-bound key reference only after this decision is allowed.
 */
export const resolveEnterpriseProviderRoute = async (
  input: EnterpriseProviderRouteResolverInput,
  deps: EnterpriseProviderRouteResolverDeps,
): Promise<EnterpriseProviderResolverDecision> => {
  const correlationId = normalizeString(input.correlationId) || deps.createCorrelationId();
  const orgId = normalizeString(input.organizationId);
  const workspaceId = normalizeString(input.workspaceId);
  const actorId = normalizeString(input.actorId);
  const capability = normalizeOperation(input.capability);
  const requestedProviderConfigId = normalizeString(input.requestedProviderConfigId);
  const requestedRouteId = normalizeString(input.requestedRouteId);
  const requestedModel = normalizeString(input.requestedModel);
  const block = (
    failureClass: ProviderResolverFailureClass,
    extra: { provider?: ProviderResolverSupportedProvider; providerConfigId?: string; keyRefId?: string } = {},
  ) => buildBlockedDecision({
    failureClass,
    correlationId,
    provider: extra.provider,
    providerConfigId: extra.providerConfigId,
    keyRefId: extra.keyRefId,
    operation: capability,
    mode: input.mode,
    orgId,
    workspaceId,
    actorId,
    evidenceRef: normalizeString(input.evidenceRef),
  });

  if (!orgId || !workspaceId || !actorId) return block('wrong_tenant');
  if (!capability || !capability.includes('.')) return block('operation_not_allowed');
  if (!input.scannerReference?.trim()) return block('scanner_classification_missing');

  try {
    const routes = await deps.queryRoutes({
      orgId,
      workspaceId,
      capability,
      requestedProviderConfigId,
      requestedRouteId,
      includeDisabled: input.includeDisabled === true,
    });
    if (routes.length === 0) return block('route_missing');
    if (routes.length > 1) return block('provider_policy_ambiguous');
    const route = routes[0];
    if (route.org_id !== orgId || route.workspace_id !== workspaceId) return block('wrong_tenant');
    if (route.deleted_at || (!route.enabled && input.includeDisabled !== true)) {
      return block('route_disabled', { providerConfigId: route.provider_config_id });
    }

    const normalizedRoles = new Set([...input.roleNames, ...(input.roleIds || [])].map(role => role.trim().toLowerCase()).filter(Boolean));
    const allowedRoles = (
      input.includeDisabled && input.proposedAllowedRoles
        ? input.proposedAllowedRoles
        : route.allowed_roles || []
    ).map(role => role.trim().toLowerCase()).filter(Boolean);
    if (
      input.policyManagementAuthorized !== true
      && (allowedRoles.length === 0 || !allowedRoles.some(role => normalizedRoles.has(role)))
    ) {
      return block('role_not_allowed', { providerConfigId: route.provider_config_id });
    }

    const config = await deps.queryProviderConfig({ orgId, providerConfigId: route.provider_config_id });
    if (!config) return block('provider_config_missing', { providerConfigId: route.provider_config_id });
    const provider = normalizeEnterpriseProvider(config.provider);
    const configFailure = classifyEnterpriseConfig(config, input, deps.now());
    if (!provider || configFailure) {
      return block(configFailure || 'provider_not_supported', {
        provider,
        providerConfigId: config.id,
      });
    }

    const endpoint = config.endpoint_url?.trim();
    if ((provider === 'azure_openai' || provider === 'openai_compatible') && !endpoint) {
      return block('provider_config_ineligible', { provider, providerConfigId: config.id });
    }
    if (endpoint && !deps.isEndpointAllowed(provider as EnterpriseProviderResolverProvider, endpoint)) {
      return block('provider_config_ineligible', { provider, providerConfigId: config.id });
    }
    const model = requestedModel || route.model?.trim() || config.default_model?.trim();
    if (!model || !(config.model_allowlist || []).includes(model)) {
      return block('model_not_allowed', { provider, providerConfigId: config.id });
    }
    if (!config.key_ref_id) return block('key_reference_missing', { provider, providerConfigId: config.id });
    const keyRef = await deps.queryProviderKeyRef({ orgId, provider, keyRefId: config.key_ref_id });
    if (!keyRef) return block('key_reference_missing', { provider, providerConfigId: config.id, keyRefId: config.key_ref_id });
    const keyFailure = classifyKeyRefFailure(keyRef, orgId, provider, deps.now());
    if (keyFailure) return block(keyFailure, { provider, providerConfigId: config.id, keyRefId: keyRef.id });

    const budget = configuredBudget(config);
    if (budget.dailyRequests !== undefined || budget.monthlyTokens !== undefined) {
      const usage = await deps.queryUsage({ orgId, workspaceId, providerConfigId: config.id, now: deps.now() });
      if (
        (budget.dailyRequests !== undefined && usage.dailyRequests >= budget.dailyRequests)
        || (budget.monthlyTokens !== undefined && usage.monthlyTokens >= budget.monthlyTokens)
      ) return block('budget_exhausted', { provider, providerConfigId: config.id, keyRefId: keyRef.id });
    }

    const auditEvent = buildProviderResolverAuditEventShell({
      orgId,
      workspaceId,
      provider,
      providerConfigId: config.id,
      keyRefId: keyRef.id,
      operation: capability,
      mode: input.mode,
      policyResult: 'allowed',
      status: 'allowed',
      actorId,
      correlationId,
      evidenceRef: normalizeString(input.evidenceRef),
      metadata: {
        membership: 'active',
        route: 'eligible',
        providerConfig: 'active_and_validated',
        keyReference: 'eligible_for_lookup',
        scannerClassification: input.scannerReference,
      },
    });
    return {
      status: 'allowed',
      futureSecretLookupEligible: true,
      provider,
      routeId: route.id,
      providerConfigId: config.id,
      keyRefId: keyRef.id,
      keyRefResolverType: 'server_reference',
      operation: capability,
      capability,
      mode: input.mode,
      orgId,
      workspaceId,
      actorId,
      correlationId,
      evidenceRef: normalizeString(input.evidenceRef),
      policyResult: 'allowed',
      model,
      endpoint,
      deployment: config.deployment_name?.trim() || undefined,
      auditEvent,
    };
  } catch {
    return block('provider_unavailable', { providerConfigId: requestedProviderConfigId });
  }
};
