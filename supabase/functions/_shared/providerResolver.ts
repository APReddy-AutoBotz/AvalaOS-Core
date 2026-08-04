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

const isExpired = (expiresAt: string | null | undefined, now: Date) =>ë«h‘éì¶»§q«^wİšY\‹ˆ›İÎˆ]KBŠNˆ›İšY\”™\ÛÛ™\‘˜Z[\™PÛ\ÜÈ[OˆÃBˆYˆ
BˆÙ^T™Y‹›Ü™×ÚYOOHÜ™ÒYBˆÙ^T™Y‹œ›İšY\ˆOOH›İšY\ƒBˆÙ^T™Y‹œİ]\ÈOOH	ØXİ]™IÃBˆÙ^T™Y‹™[]YØ]Bˆ\Ñ^\™Y
Ù^T™Y‹™^\™\×Ø]›İÊCBˆÙ^T™Y‹œ™\ÛÛ™\—İ\HOOH	ÛX[X[ÜXÙZÛ\‰ÃBˆÙ^T™Y‹œ™\ÛÛ™\—İ\HOOH	Ù^\›˜[ÜÙXÜ™]Ü™Y™\™[˜ÙIÃBˆ
HÃBˆ™]\›ˆ	ÚÙ^WÜ™Y™\™[˜ÙWÚ[™[YÚX›IÎÃBˆCBƒBˆYˆ
Ù^T™Y‹œ™\ÛÛ™\—İ\HOOH	ÜÙ\™\—Ü™Y™\™[˜ÙIÈÙ^T™Y‹œ™Y™\™[˜ÙTØY™]HOOH	Ü™Y™\™[˜ÙWÛÛ›IÊHÃBˆ™]\›ˆ	ÜÙXÜ™]Ü™Y™\™[˜ÙWİ[œØY™IÎÃBˆCBƒBˆ™]\›ˆ[ÃBŸNÃBƒB™^ÜÛÛœİ™\ÛÛ™T›İšY\‘›Ü“Ü\˜][ÛˆH\Ş[˜È
ˆ[œ]ˆ›İšY\”™\ÛÛ™\’[œ]ˆ\Îˆ›İšY\”™\ÛÛ™\‘\ËŠNˆ›ÛZ\ÙOYØXŞT›İšY\”™\ÛÛ™\‘XÚ\Ú[ÛˆOˆÂˆÛÛœİÛÜœ™[][Û’YH™\ÛÛ™PÛÜœ™[][Û’Y
[œ]\ÊNÃBˆÛÛœİ]šY[˜ÙT™YˆH›Ü›X[^™Tİš[™Ê[œ]™]šY[˜ÙT™YŠNÃBˆÛÛœİÛÜšÜÜXÙRYH›Ü›X[^™Tİš[™Ê[œ]ÛÜšÜÜXÙRY
NÃBˆÛÛœİ™\]Y\İY›İšY\ÛÛ™šYÒYH›Ü›X[^™Tİš[™Ê[œ]œ™\]Y\İY›İšY\ÛÛ™šYÒY
NÃBˆÛÛœİÜ™ÒYH›Ü›X[^™Tİš[™Ê[œ]›Ü™ÒY
NÃBˆÛÛœİXİÜ’YH›Ü›X[^™Tİš[™Ê[œ]˜XİÜ’Y
NÃBˆÛÛœİ[ÙHH›Ü›X[^™S[ÙJ[œ]›[ÙJNÃBˆÛÛœİÜ\˜][ÛˆH›Ü›X[^™SÜ\˜][ÛŠ[œ]›Ü\˜][ÛŠNÃBˆÛÛœİ›İšY\ˆH›Ü›X[^™T›İšY\Š[œ]œ™\]Y\İY›İšY\ŠNÃBƒBˆÛÛœİ›ØÚÈH
˜Z[\™PÛ\ÜÎˆ›İšY\”™\ÛÛ™\‘˜Z[\™PÛ\ÜË^˜NˆÃBˆ›İšY\ÛÛ™šYÒYÎˆİš[™ÎÃBˆÙ^T™Y’YÎˆİš[™ÎÃBˆY]Y]OÎˆ™XÛÜ™İš[™Ë›İšY\”™\ÛÛ™\]Y]Y]Y]U˜[YOÃBˆHHßJHOˆZ[›ØÚÙYXÚ\Ú[ÛŠÃBˆ˜Z[\™PÛ\ÜËBˆÛÜœ™[][Û’YBˆ›İšY\‹Bˆ›İšY\ÛÛ™šYÒYˆ^˜Kœ›İšY\ÛÛ™šYÒYBˆÙ^T™Y’Yˆ^˜KšÙ^T™Y’YBˆÜ\˜][Û‹Bˆ[ÙKBˆÜ™ÒYBˆÛÜšÜÜXÙRYBˆXİÜ’YBˆ]šY[˜ÙT™Y‹BˆY]Y]Nˆ^˜K›Y]Y]KBˆJNÃBƒBˆYˆ
[[ÙJH™]\›ˆ›ØÚÊ	Û[ÙWÛ›İØ[İÙY	ÊNÃBˆYˆ
XXİÜ’Y
H™]\›ˆ›ØÚÊ	İ[˜]][XØ]Y	ÊNÃBˆYˆ
[Ü™ÒY
H™]\›ˆ›ØÚÊ	ÛÜ™×ÛZ\ÜÚ[™ÉÊNÃBƒBˆÛÛœİY[X™\œÚ\H]ØZ]\Ëœ]Y\SY[X™\œÚ\[™›Û\ÊÈÜ™ÒYXİÜ’YJNÃBˆYˆ
[Y[X™\œÚ\Y[X™\œÚ\œİ]\ÈOOH	ØXİ]™IÊH™]\›ˆ›ØÚÊ	ÛY[X™\œÚ\Ù[šYY	ÊNÃBˆYˆ

Y[X™\œÚ\œ›ÛS˜[Y\È×JK›[™İOOH	‰ˆ
Y[X™\œÚ\œ›ÛRYÈ×JK›[™İOOH
HÃBˆ™]\›ˆ›ØÚÊ	Ü›ÛWÛ›İØ[İÙY	ÊNÃBˆCBƒBˆYˆ
[Ü\˜][ÛŠH™]\›ˆ›ØÚÊ	ÛÜ\˜][Û—Û›İØ[İÙY	ÊNÃBˆYˆ
\›İšY\ŠH™]\›ˆ›ØÚÊ	Ü›İšY\—Û›İÜİ\ÜY	ÊNÃBƒBˆÛÛœİÛXÚY\ÈH]ØZ]\Ëœ]Y\T›İšY\”ÛXŞJÃBˆÜ™ÒYBˆÜ\˜][Û‹Bˆ[ÙKBˆ™\]Y\İY›İšY\ÛÛ™šYÒYBˆJNÃBˆÛÛœİXİ]™TÛXÚY\ÈHÛXÚY\Ë™š[\ŠÛXŞHOƒBˆ\ÔÛXŞPXİ]™Q›Ü”™\]Y\İ
ÛXŞKÜ™ÒYÜ\˜][Û‹[ÙK™\]Y\İY›İšY\ÛÛ™šYÒY
CBˆ
NÃBˆYˆ
Xİ]™TÛXÚY\Ë›[™İOOH
H™]\›ˆ›ØÚÊ	Ü›İšY\—ÜÛXŞWÛZ\ÜÚ[™ÉÊNÃBˆYˆ
Xİ]™TÛXÚY\Ë›[™İˆJH™]\›ˆ›ØÚÊ	Ü›İšY\—ÜÛXŞWØ[XšYİ[İ\ÉÊNÃBƒBˆÛÛœİÛXŞHHXİ]™TÛXÚY\ÖÌNÃBˆYˆ
\›ÛSX]Ú\ÔÛXŞJY[X™\œÚ\ÛXŞJJH™]\›ˆ›ØÚÊ	Ü›ÛWÛ›İØ[İÙY	ËÃBˆ›İšY\ÛÛ™šYÒYˆÛXŞKœ›İšY\—ØÛÛ™šY×ÚYBˆJNÃBƒBˆÛÛœİ›İšY\ÛÛ™šYÒYHÛXŞKœ›İšY\—ØÛÛ™šY×ÚYÃBˆÛÛœİÛÛ™šYÈH]ØZ]\Ëœ]Y\T›İšY\ÛÛ™šYÊÈÜ™ÒY›İšY\ÛÛ™šYÒYJNÃBˆYˆ
XÛÛ™šYÊH™]\›ˆ›ØÚÊ	Ü›İšY\—ØÛÛ™šY×ÛZ\ÜÚ[™ÉËÈ›İšY\ÛÛ™šYÒYJNÃBˆYˆ
Z\ĞÛÛ™šYÑ[YÚX›JÛÛ™šYËÜ™ÒY›İšY\‹Ü\˜][Û‹[ÙJJHÃBˆ™]\›ˆ›ØÚÊ	Ü›İšY\—ØÛÛ™šY×Ú[™[YÚX›IËÈ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYJNÃBˆCBƒBˆYˆ
XÛÛ™šYËšÙ^WÜ™Y—ÚY
H™]\›ˆ›ØÚÊ	ÚÙ^WÜ™Y™\™[˜ÙWÛZ\ÜÚ[™ÉËÈ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYJNÃBƒBˆÛÛœİÙ^T™YˆH]ØZ]\Ëœ]Y\T›İšY\’Ù^T™YŠÃBˆÜ™ÒYBˆ›İšY\‹BˆÙ^T™Y’YˆÛÛ™šYËšÙ^WÜ™Y—ÚYBˆJNÃBˆYˆ
ZÙ^T™YŠHÃBˆ™]\›ˆ›ØÚÊ	ÚÙ^WÜ™Y™\™[˜ÙWÛZ\ÜÚ[™ÉËÃBˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYBˆÙ^T™Y’YˆÛÛ™šYËšÙ^WÜ™Y—ÚYBˆJNÃBˆCBƒBˆÛÛœİÙ^T™Y‘˜Z[\™HHÛ\ÜÚYRÙ^T™Y‘˜Z[\™JÙ^T™Y‹Ü™ÒY›İšY\‹\Ë››İÊ
JNÃBˆYˆ
Ù^T™Y‘˜Z[\™JHÃBˆ™]\›ˆ›ØÚÊÙ^T™Y‘˜Z[\™KÃBˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYBˆÙ^T™Y’YˆÙ^T™Y‹šYBˆJNÃBˆCBƒBˆYˆ
[œ]œØØ[›™\Û\ÜÚYšXØ][ÛËœİ]\ÈOOH	ØÛ\ÜÚYšYY	ÊHÃBˆ™]\›ˆ›ØÚÊ	ÜØØ[›™\—ØÛ\ÜÚYšXØ][Û—ÛZ\ÜÚ[™ÉËÃBˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYBˆÙ^T™Y’YˆÙ^T™Y‹šYBˆJNÃBˆCBƒBˆHÃBˆÛÛœİ]Y]]™[HZ[›İšY\”™\ÛÛ™\]Y]]™[Ú[
ÃBˆÜ™ÒYBˆÛÜšÜÜXÙRYBˆ›İšY\‹Bˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYBˆÙ^T™Y’YˆÙ^T™Y‹šYBˆÜ\˜][Û‹Bˆ[ÙKBˆÛXŞT™\İ[ˆ	Ø[İÙY	ËBˆİ]\Îˆ	Ø[İÙY	ËBˆXİÜ’YBˆÛÜœ™[][Û’YBˆ]šY[˜ÙT™Y‹BˆY]Y]NˆÃBˆY[X™\œÚ\ˆ	ØXİ]™IËBˆÛXŞNˆ	ÛX]ÚY	ËBˆ›İšY\ÛÛ™šYÎˆ	Ù[YÚX›IËBˆÙ^T™Y™\™[˜ÙNˆ	Ù[YÚX›WÙ›Ü—Ù]\™WÛÛÚİ\	ËBˆØØ[›™\Û\ÜÚYšXØ][Ûˆ[œ]œØØ[›™\Û\ÜÚYšXØ][Û‹œ™Y™\™[˜ÙH	ØÛ\ÜÚYšYY	ËBˆ‹‹Š[œ]˜]Y]Y]Y]HßJKBˆKBˆJNÃBƒBˆ™]\›ˆÃBˆİ]\Îˆ	Ø[İÙY	ËBˆ]\™TÙXÜ™]ÛÚİ\[YÚX›NˆYKBˆ›İšY\‹Bˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYBˆÙ^T™Y’YˆÙ^T™Y‹šYBˆÙ^T™Y”™\ÛÛ™\•\Nˆ	ÜÙ\™\—Ü™Y™\™[˜ÙIËBˆÜ\˜][Û‹Bˆ[ÙKBˆÜ™ÒYBˆÛÜšÜÜXÙRYBˆXİÜ’YBˆÛÜœ™[][Û’YBˆ]šY[˜ÙT™Y‹BˆÛXŞT™\İ[ˆ	Ø[İÙY	ËBˆ]Y]]™[BˆNÃBˆHØ]Ú
\œ›ÜŠHÃBˆYˆ
\œ›Üˆ[œİ[˜Ù[Ùˆ›İšY\”™\ÛÛ™\]Y]Y]Y]Q\œ›ÜŠHÃBˆ™]\›ˆZ[›ØÚÙYXÚ\Ú[ÛŠÃBˆ˜Z[\™PÛ\ÜÎˆ	Ø]Y]ØÛÛ^İ[œØY™IËBˆÛÜœ™[][Û’YBˆ›İšY\‹Bˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYBˆÙ^T™Y’YˆÙ^T™Y‹šYBˆÜ\˜][Û‹Bˆ[ÙKBˆÜ™ÒYBˆÛÜšÜÜXÙRYBˆXİÜ’YBˆ]šY[˜ÙT™Y‹BˆJNÃBˆCBˆ›İÈ\œ›ÜÃBˆBŸNÂ‚™^ÜÛÛœİS•T”’TÑWÔ“Õ’QT—ÕSQUSÓ—ÓPVĞQÑWÓTÈH
ˆŒ
ˆŒ
ˆLÂ‚™^Ü\H[\œš\ÙT›İšY\”›İ]T›İÈHÂˆYˆİš[™ÎÂˆÜ™×ÚYˆİš[™ÎÂˆÛÜšÜÜXÙWÚYˆİš[™ÎÂˆ›İšY\—ØÛÛ™šY×ÚYˆİš[™ÎÂˆØ\Xš[]Nˆ›İšY\”™\ÛÛ™\“Ü\˜][ÛÂˆ[Ù[ˆİš[™ÎÂˆ[˜X›Yˆ›ÛÛX[Âˆ[İÙYÜ›Û\Îˆİš[™Ö×NÂˆ[]YØ]Îˆİš[™È[ÂŸNÂ‚™^Ü\H[\œš\ÙT›İšY\•\ØYÙHHÂˆZ[T™\]Y\İÎˆ[X™\Âˆ[ÛUÚÙ[œÎˆ[X™\ÂŸNÂ‚™^Ü\H[\œš\ÙT›İšY\”›İ]T™\ÛÛ™\‘\ÈHÂˆ›İÎˆ

HOˆ]NÂˆÜ™X]PÛÜœ™[][Û’Yˆ

HOˆİš[™ÎÂˆ]Y\T›İ]\Îˆ
[œ]ˆÂˆÜ™ÒYˆİš[™ÎÂˆÛÜšÜÜXÙRYˆİš[™ÎÂˆØ\Xš[]Nˆ›İšY\”™\ÛÛ™\“Ü\˜][ÛÂˆ™\]Y\İY›İšY\ÛÛ™šYÒYÎˆİš[™ÎÂˆ[˜ÛYQ\ØX›Yˆ›ÛÛX[ÂˆJHOˆ›ÛZ\ÙO[\œš\ÙT›İšY\”›İ]T›İÖ×OÂˆ]Y\T›İšY\ÛÛ™šYÎˆ
[œ]ˆÛÛ™šYÓÛÚİ\[œ]
HOˆ›ÛZ\ÙO›İšY\ÛÛ™šYÔ›İÈ[Âˆ]Y\T›İšY\’Ù^T™Yˆ
[œ]ˆÙ^T™Y“ÛÚİ\[œ]
HOˆ›ÛZ\ÙO›İšY\’Ù^T™Y”›İÈ[Âˆ]Y\U\ØYÙNˆ
[œ]ˆÂˆÜ™ÒYˆİš[™ÎÂˆÛÜšÜÜXÙRYˆİš[™ÎÂˆ›İšY\ÛÛ™šYÒYˆİš[™ÎÂˆ›İÎˆ]NÂˆJHOˆ›ÛZ\ÙO[\œš\ÙT›İšY\•\ØYÙOÂˆ\Ñ[™Ú[[İÙYˆ
›İšY\ˆ[\œš\ÙT›İšY\”™\ÛÛ™\”›İšY\‹[™Ú[ˆİš[™ÊHOˆ›ÛÛX[ÂŸNÂ‚™^Ü\H[\œš\ÙT›İšY\”›İ]T™\ÛÛ™\’[œ]HÂˆ[ÙNˆ›İšY\”™\ÛÛ™\“[ÙNÂˆØ\Xš[]Nˆ›İšY\”™\ÛÛ™\“Ü\˜][ÛÂˆÜ™Ø[š^˜][Û’Yˆİš[™ÎÂˆÛÜšÜÜXÙRYˆİš[™ÎÂˆXİÜ’Yˆİš[™ÎÂˆ›ÛS˜[Y\Îˆİš[™Ö×NÂˆ™\]Y\İY›İšY\ÛÛ™šYÒYÎˆİš[™ÎÂˆ[˜ÛYQ\ØX›YÎˆ›ÛÛX[Âˆ›ÜÜÙY[İÙY›Û\ÏÎˆİš[™Ö×NÂˆÛÜœ™[][Û’YÎˆİš[™ÎÂˆ]šY[˜ÙT™YÎˆİš[™ÎÂˆØØ[›™\”™Y™\™[˜ÙNˆİš[™ÎÂŸNÂ‚˜ÛÛœİ[\œš\ÙT›İšY\œÈH™]ÈÙ][\œš\ÙT›İšY\”™\ÛÛ™\”›İšY\ŠÂˆ	ÛÜ[˜ZIËˆ	Ø^\™WÛÜ[˜ZIËˆ	Ø[›ÜXÉËˆ	ÙÙ[Z[šIËˆ	ÛÜ[˜ZWØÛÛ\]X›IË—JNÂ‚˜ÛÛœİÛ\ÜÚYQ[\œš\ÙPÛÛ™šYÈH
ˆÛÛ™šYÎˆ›İšY\ÛÛ™šYÔ›İËˆ[œ]ˆ[\œš\ÙT›İšY\”›İ]T™\ÛÛ™\’[œ]ˆ›İÎˆ]KŠNˆ›İšY\”™\ÛÛ™\‘˜Z[\™PÛ\ÜÈ[OˆÂˆYˆ
ÛÛ™šYË›Ü™×ÚYOOH[œ]›Ü™Ø[š^˜][Û’Y
H™]\›ˆ	İÜ›Û™×İ[˜[	ÎÂˆYˆ
ÛÛ™šYË™[]YØ]ÛÛ™šYËœİ]\ÈOOH	Ü™]\™Y	ÈÛÛ™šYËœİ]\ÈOOH	Ü™]›ÚÙY	ÊH™]\›ˆ	Ü›İšY\—Ü™]›ÚÙY	ÎÂˆYˆ
ÛÛ™šYËœİ]\ÈOOH	Ù\ØX›Y	ÊH™]\›ˆ	Ü›İšY\—Ù\ØX›Y	ÎÂˆYˆ
ÛÛ™šYËœİ]\ÈOOH	ØXİ]™IÊH™]\›ˆ	Ü›İšY\—ØÛÛ™šY×Ú[™[YÚX›IÎÂˆYˆ
Y[\œš\ÙT›İšY\œËš\ÊÛÛ™šYËœ›İšY\ˆ\È[\œš\ÙT›İšY\”™\ÛÛ™\”›İšY\ŠJH™]\›ˆ	Ü›İšY\—Û›İÜİ\ÜY	ÎÂˆYˆ
XÛÛ™šYË›\İİ˜[Y]YØ]
H™]\›ˆ	Ü›İšY\—İ[˜[Y]Y	ÎÂˆÛÛœİ˜[Y]Y]H™]È]JÛÛ™šYË›\İİ˜[Y]YØ]
K™Ù][YJ
NÂˆYˆ
S[X™\‹š\Ñš[š]J˜[Y]Y]
H˜[Y]Y]ˆ›İË™Ù][YJ
H›İË™Ù][YJ
HH˜[Y]Y]ˆS•T”’TÑWÔ“Õ’QT—ÕSQUSÓ—ÓPVĞQÑWÓTÊHÂˆ™]\›ˆ	Ü›İšY\—İ˜[Y][Û—Üİ[IÎÂˆBˆ™]\›ˆ[ÂŸNÂ‚˜ÛÛœİÛÛ™šYİ\™YYÙ]H
ÛÛ™šYÎˆ›İšY\ÛÛ™šYÔ›İÊHOˆÂˆÛÛœİÛXŞHHÛÛ™šYË˜YÙ]ÜÛXŞHßNÂˆÛÛœİ™XY[Z]H
Ù^Nˆ	ÙZ[T™\]Y\İÉÈ	Û[ÛUÚÙ[œÉÊHOˆÂˆÛÛœİ˜[YHHÛXŞVÚÙ^WNÂˆ™]\›ˆ[X™\‹š\ÔØY™R[YÙ\Š˜[YJH	‰ˆ[X™\Š˜[YJHˆÈ[X™\Š˜[YJHˆ[™Yš[™YÂˆNÂˆ™]\›ˆÈZ[T™\]Y\İÎˆ™XY[Z]
	ÙZ[T™\]Y\İÉÊK[ÛUÚÙ[œÎˆ™XY[Z]
	Û[ÛUÚÙ[œÉÊHNÂŸNÂ‚‹ÊŠ‚ˆ
ˆØ[›ÛšXØ[[\œš\ÙH[[YÙ[˜ÙH›İ]H]]Üš]Kˆ][[[Û˜[H™]\›œÂˆ
ˆ›ÈÙXÜ™]™Y™\™[˜ÙHÜˆÙ^HX]\šX[ÈHÙXÜ™]Y\\ˆ™K[ØYÈH^Xİˆ
ˆ[˜[Ü›İšY\‹X›İ[™Ù^H™Y™\™[˜ÙHÛ›HY\ˆ\ÈXÚ\Ú[Ûˆ\È[İÙY‚ˆ
‹Â™^ÜÛÛœİ™\ÛÛ™Q[\œš\ÙT›İšY\”›İ]HH\Ş[˜È
ˆ[œ]ˆ[\œš\ÙT›İšY\”›İ]T™\ÛÛ™\’[œ]ˆ\Îˆ[\œš\ÙT›İšY\”›İ]T™\ÛÛ™\‘\ËŠNˆ›ÛZ\ÙO[\œš\ÙT›İšY\”™\ÛÛ™\‘XÚ\Ú[ÛˆOˆÂˆÛÛœİÛÜœ™[][Û’YH›Ü›X[^™Tİš[™Ê[œ]˜ÛÜœ™[][Û’Y
H\Ë˜Ü™X]PÛÜœ™[][Û’Y

NÂˆÛÛœİÜ™ÒYH›Ü›X[^™Tİš[™Ê[œ]›Ü™Ø[š^˜][Û’Y
NÂˆÛÛœİÛÜšÜÜXÙRYH›Ü›X[^™Tİš[™Ê[œ]ÛÜšÜÜXÙRY
NÂˆÛÛœİXİÜ’YH›Ü›X[^™Tİš[™Ê[œ]˜XİÜ’Y
NÂˆÛÛœİØ\Xš[]HH›Ü›X[^™SÜ\˜][ÛŠ[œ]˜Ø\Xš[]JNÂˆÛÛœİ™\]Y\İY›İšY\ÛÛ™šYÒYH›Ü›X[^™Tİš[™Ê[œ]œ™\]Y\İY›İšY\ÛÛ™šYÒY
NÂˆÛÛœİ›ØÚÈH
ˆ˜Z[\™PÛ\ÜÎˆ›İšY\”™\ÛÛ™\‘˜Z[\™PÛ\ÜËˆ^˜NˆÈ›İšY\Îˆ›İšY\”™\ÛÛ™\”İ\ÜY›İšY\È›İšY\ÛÛ™šYÒYÎˆİš[™ÎÈÙ^T™Y’YÎˆİš[™ÈHHßKˆ
HOˆZ[›ØÚÙYXÚ\Ú[ÛŠÂˆ˜Z[\™PÛ\ÜËˆÛÜœ™[][Û’Yˆ›İšY\ˆ^˜Kœ›İšY\‹ˆ›İšY\ÛÛ™šYÒYˆ^˜Kœ›İšY\ÛÛ™šYÒYˆÙ^T™Y’Yˆ^˜KšÙ^T™Y’YˆÜ\˜][ÛˆØ\Xš[]Kˆ[ÙNˆ[œ]›[ÙKˆÜ™ÒYˆÛÜšÜÜXÙRYˆXİÜ’Yˆ]šY[˜ÙT™Yˆ›Ü›X[^™Tİš[™Ê[œ]™]šY[˜ÙT™YŠKˆJNÂ‚ˆYˆ
[Ü™ÒY]ÛÜšÜÜXÙRYXXİÜ’Y
H™]\›ˆ›ØÚÊ	İÜ›Û™×İ[˜[	ÊNÂˆYˆ
XØ\Xš[]HXØ\Xš[]Kš[˜ÛY\Ê	Ë‰ÊJH™]\›ˆ›ØÚÊ	ÛÜ\˜][Û—Û›İØ[İÙY	ÊNÂˆYˆ
Z[œ]œØØ[›™\”™Y™\™[˜ÙOËš[J
JH™]\›ˆ›ØÚÊ	ÜØØ[›™\—ØÛ\ÜÚYšXØ][Û—ÛZ\ÜÚ[™ÉÊNÂ‚ˆHÂˆÛÛœİ›İ]\ÈH]ØZ]\Ëœ]Y\T›İ]\ÊÂˆÜ™ÒYˆÛÜšÜÜXÙRYˆØ\Xš[]Kˆ™\]Y\İY›İšY\ÛÛ™šYÒYˆ[˜ÛYQ\ØX›Yˆ[œ]š[˜ÛYQ\ØX›YOOHYKˆJNÂˆYˆ
›İ]\Ë›[™İOOH
H™]\›ˆ›ØÚÊ	Ü›İ]WÛZ\ÜÚ[™ÉÊNÂˆYˆ
›İ]\Ë›[™İˆJH™]\›ˆ›ØÚÊ	Ü›İšY\—ÜÛXŞWØ[XšYİ[İ\ÉÊNÂˆÛÛœİ›İ]HH›İ]\ÖÌNÂˆYˆ
›İ]K›Ü™×ÚYOOHÜ™ÒY›İ]KÛÜšÜÜXÙWÚYOOHÛÜšÜÜXÙRY
H™]\›ˆ›ØÚÊ	İÜ›Û™×İ[˜[	ÊNÂˆYˆ
›İ]K™[]YØ]
\›İ]K™[˜X›Y	‰ˆ[œ]š[˜ÛYQ\ØX›YOOHYJJHÂˆ™]\›ˆ›ØÚÊ	Ü›İ]WÙ\ØX›Y	ËÈ›İšY\ÛÛ™šYÒYˆ›İ]Kœ›İšY\—ØÛÛ™šY×ÚYJNÂˆB‚ˆÛÛœİ›Ü›X[^™Y›Û\ÈH™]ÈÙ]
[œ]œ›ÛS˜[Y\Ë›X\
›ÛHOˆ›ÛKš[J
KÓİÙ\Ø\ÙJ
JK™š[\Š›ÛÛX[ŠJNÂˆÛÛœİ[İÙY›Û\ÈH
ˆ[œ]š[˜ÛYQ\ØX›Y	‰ˆ[œ]œ›ÜÜÙY[İÙY›Û\ÂˆÈ[œ]œ›ÜÜÙY[İÙY›Û\Âˆˆ›İ]K˜[İÙYÜ›Û\È×Bˆ
K›X\
›ÛHOˆ›ÛKš[J
KÓİÙ\Ø\ÙJ
JK™š[\Š›ÛÛX[ŠNÂˆYˆ
[İÙY›Û\Ë›[™İOOHX[İÙY›Û\ËœÛÛYJ›ÛHOˆ›Ü›X[^™Y›Û\Ëš\Ê›ÛJJJHÂˆ™]\›ˆ›ØÚÊ	Ü›ÛWÛ›İØ[İÙY	ËÈ›İšY\ÛÛ™šYÒYˆ›İ]Kœ›İšY\—ØÛÛ™šY×ÚYJNÂˆB‚ˆÛÛœİÛÛ™šYÈH]ØZ]\Ëœ]Y\T›İšY\ÛÛ™šYÊÈÜ™ÒY›İšY\ÛÛ™šYÒYˆ›İ]Kœ›İšY\—ØÛÛ™šY×ÚYJNÂˆYˆ
XÛÛ™šYÊH™]\›ˆ›ØÚÊ	Ü›İšY\—ØÛÛ™šY×ÛZ\ÜÚ[™ÉËÈ›İšY\ÛÛ™šYÒYˆ›İ]Kœ›İšY\—ØÛÛ™šY×ÚYJNÂˆÛÛœİ›İšY\ˆH›Ü›X[^™Q[\œš\ÙT›İšY\ŠÛÛ™šYËœ›İšY\ŠNÂˆÛÛœİÛÛ™šYÑ˜Z[\™HHÛ\ÜÚYQ[\œš\ÙPÛÛ™šYÊÛÛ™šYË[œ]\Ë››İÊ
JNÂˆYˆ
\›İšY\ˆÛÛ™šYÑ˜Z[\™JHÂˆ™]\›ˆ›ØÚÊÛÛ™šYÑ˜Z[\™H	Ü›İšY\—Û›İÜİ\ÜY	ËÂˆ›İšY\‹ˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYˆJNÂˆB‚ˆÛÛœİ[™Ú[HÛÛ™šYË™[™Ú[İ\›Ëš[J
NÂˆYˆ

›İšY\ˆOOH	Ø^\™WÛÜ[˜ZIÈ›İšY\ˆOOH	ÛÜ[˜ZWØÛÛ\]X›IÊH	‰ˆY[™Ú[
HÂˆ™]\›ˆ›ØÚÊ	Ü›İšY\—ØÛÛ™šY×Ú[™[YÚX›IËÈ›İšY\‹›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYJNÂˆBˆYˆ
[™Ú[	‰ˆY\Ëš\Ñ[™Ú[[İÙY
›İšY\ˆ\È[\œš\ÙT›İšY\”™\ÛÛ™\”›İšY\‹[™Ú[
JHÂˆ™]\›ˆ›ØÚÊ	Ü›İšY\—ØÛÛ™šY×Ú[™[YÚX›IËÈ›İšY\‹›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYJNÂˆBˆÛÛœİ[Ù[H›İ]K›[Ù[Ëš[J
HÛÛ™šYË™Y˜][Û[Ù[Ëš[J
NÂˆYˆ
[[Ù[JÛÛ™šYË›[Ù[Ø[İÛ\İ×JKš[˜ÛY\Ê[Ù[
JHÂˆ™]\›ˆ›ØÚÊ	Û[Ù[Û›İØ[İÙY	ËÈ›İšY\‹›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYJNÂˆBˆYˆ
XÛÛ™šYËšÙ^WÜ™Y—ÚY
H™]\›ˆ›ØÚÊ	ÚÙ^WÜ™Y™\™[˜ÙWÛZ\ÜÚ[™ÉËÈ›İšY\‹›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYJNÂˆÛÛœİÙ^T™YˆH]ØZ]\Ëœ]Y\T›İšY\’Ù^T™YŠÈÜ™ÒY›İšY\‹Ù^T™Y’YˆÛÛ™šYËšÙ^WÜ™Y—ÚYJNÂˆYˆ
ZÙ^T™YŠH™]\›ˆ›ØÚÊ	ÚÙ^WÜ™Y™\™[˜ÙWÛZ\ÜÚ[™ÉËÈ›İšY\‹›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYÙ^T™Y’YˆÛÛ™šYËšÙ^WÜ™Y—ÚYJNÂˆÛÛœİÙ^Q˜Z[\™HHÛ\ÜÚYRÙ^T™Y‘˜Z[\™JÙ^T™Y‹Ü™ÒY›İšY\‹\Ë››İÊ
JNÂˆYˆ
Ù^Q˜Z[\™JH™]\›ˆ›ØÚÊÙ^Q˜Z[\™KÈ›İšY\‹›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYÙ^T™Y’YˆÙ^T™Y‹šYJNÂ‚ˆÛÛœİYÙ]HÛÛ™šYİ\™YYÙ]
ÛÛ™šYÊNÂˆYˆ
YÙ]™Z[T™\]Y\İÈOOH[™Yš[™YYÙ]›[ÛUÚÙ[œÈOOH[™Yš[™Y
HÂˆÛÛœİ\ØYÙHH]ØZ]\Ëœ]Y\U\ØYÙJÈÜ™ÒYÛÜšÜÜXÙRY›İšY\ÛÛ™šYÒYˆÛÛ™šYËšY›İÎˆ\Ë››İÊ
HJNÂˆYˆ
ˆ
YÙ]™Z[T™\]Y\İÈOOH[™Yš[™Y	‰ˆ\ØYÙK™Z[T™\]Y\İÈHYÙ]™Z[T™\]Y\İÊBˆ
YÙ]›[ÛUÚÙ[œÈOOH[™Yš[™Y	‰ˆ\ØYÙK›[ÛUÚÙ[œÈHYÙ]›[ÛUÚÙ[œÊBˆ
H™]\›ˆ›ØÚÊ	ØYÙ]Ù^]\İY	ËÈ›İšY\‹›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYÙ^T™Y’YˆÙ^T™Y‹šYJNÂˆB‚ˆÛÛœİ]Y]]™[HZ[›İšY\”™\ÛÛ™\]Y]]™[Ú[
ÂˆÜ™ÒYˆÛÜšÜÜXÙRYˆ›İšY\‹ˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYˆÙ^T™Y’YˆÙ^T™Y‹šYˆÜ\˜][ÛˆØ\Xš[]Kˆ[ÙNˆ[œ]›[ÙKˆÛXŞT™\İ[ˆ	Ø[İÙY	Ëˆİ]\Îˆ	Ø[İÙY	ËˆXİÜ’YˆÛÜœ™[][Û’Yˆ]šY[˜ÙT™Yˆ›Ü›X[^™Tİš[™Ê[œ]™]šY[˜ÙT™YŠKˆY]Y]NˆÂˆY[X™\œÚ\ˆ	ØXİ]™IËˆ›İ]Nˆ	Ù[YÚX›IËˆ›İšY\ÛÛ™šYÎˆ	ØXİ]™WØ[™İ˜[Y]Y	ËˆÙ^T™Y™\™[˜ÙNˆ	Ù[YÚX›WÙ›Ü—ÛÛÚİ\	ËˆØØ[›™\Û\ÜÚYšXØ][Ûˆ[œ]œØØ[›™\”™Y™\™[˜ÙKˆKˆJNÂˆ™]\›ˆÂˆİ]\Îˆ	Ø[İÙY	Ëˆ]\™TÙXÜ™]ÛÚİ\[YÚX›NˆYKˆ›İšY\‹ˆ›İšY\ÛÛ™šYÒYˆÛÛ™šYËšYˆÙ^T™Y’YˆÙ^T™Y‹šYˆÙ^T™Y”™\ÛÛ™\•\Nˆ	ÜÙ\™\—Ü™Y™\™[˜ÙIËˆÜ\˜][ÛˆØ\Xš[]KˆØ\Xš[]Kˆ[ÙNˆ[œ]›[ÙKˆÜ™ÒYˆÛÜšÜÜXÙRYˆXİÜ’YˆÛÜœ™[][Û’Yˆ]šY[˜ÙT™Yˆ›Ü›X[^™Tİš[™Ê[œ]™]šY[˜ÙT™YŠKˆÛXŞT™\İ[ˆ	Ø[İÙY	Ëˆ[Ù[ˆ[™Ú[ˆ\Ş[Y[ˆÛÛ™šYË™\Ş[Y[Û˜[YOËš[J
H[™Yš[™Yˆ]Y]]™[ˆNÂˆHØ]ÚÂˆ™]\›ˆ›ØÚÊ	Ü›İšY\—İ[˜]˜Z[X›IËÈ›İšY\ÛÛ™šYÒYˆ™\]Y\İY›İšY\ÛÛ™šYÒYJNÂˆBŸNÂ