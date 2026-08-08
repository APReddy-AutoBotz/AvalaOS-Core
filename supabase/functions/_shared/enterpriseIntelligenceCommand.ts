import {
  ASSEMBLE_ELIGIBLE_DISPOSITIONS,
  ENTERPRISE_AI_CAPABILITIES,
  ENTERPRISE_AI_PROVIDERS,
  EVIDENCE_CANDIDATE_FIELDS,
  MODERNIZATION_DISPOSITIONS,
  buildAssembleBlueprintDraft,
  buildDeliveryWorkPackageDraft,
  buildEvidenceCandidate,
  buildMonitorBaseline,
  evaluateModernizationDecision,
  isSupportedEvidenceMimeType,
  sanitizeEvidenceExcerpt,
  stableFingerprint,
  type AssembleBlueprintDraft,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type EvidenceCandidateField,
  type ModernizationFactors,
  type ModernizationDisposition,
  type SupportedEvidenceMimeType,
} from '../../../services/enterpriseIntelligence.ts';
import {
  EnterpriseAiGatewayError,
  isAllowedProviderEndpoint,
  parseJsonObjectResponse,
  runGovernedProviderRequest,
} from './enterpriseIntelligenceAi.ts';
import {
  assertProviderLifecycleOperationAuthority,
  createProviderLifecycleDeps,
  executeProviderLifecycleCommand,
  ProviderLifecycleError,
  type ProviderLifecycleAuthority,
  type ProviderLifecycleOperation,
} from './providerLifecycle.ts';
import { resolveEnterpriseProviderRoute } from './providerResolver.ts';
import { buildEnterpriseProviderRouteDbDeps } from './providerResolverDb.ts';
import { classifyEvidenceExtractionFailure, extractEvidenceText, decodeBase64, sha256Hex } from './enterpriseIntelligenceIngestion.ts';
import {
  claimEnterpriseReceipt,
  completeEnterpriseReceipt,
  EnterpriseReceiptError,
  failEnterpriseReceipt,
  hashReceiptValue,
  persistEnterpriseExecutionPlan,
  reloadEnterpriseReceipt,
  renewEnterpriseExternalWriteLease,
  type EnterpriseReceiptRow,
} from './enterpriseReceipt.ts';
import { handleOptions, jsonResponse } from './http.ts';
import {
  getAuthUser,
  isSupabaseRpcError,
  isSupabaseRpcTransportError,
  postgrest,
  rpc,
  resolveOrgId,
  supabaseRpcErrorHasSignal,
} from './supabase.ts';
import {
  downloadStoredFile,
  assertSourceUploadsBucket,
  inspectBinaryArtifact,
  prepareTextArtifact,
  resolveSourceUploadsBucket,
  StorageArtifactError,
  uploadBinaryArtifact,
} from './storage.ts';

type JsonObject = Record<string, unknown>;

export type EnterpriseCommandType =
  | 'provider.register'
  | 'provider.validate'
  | 'provider.activate'
  | 'provider.route.toggle'
  | 'provider.revoke'
  | 'evidence.source.create'
  | 'evidence.extract'
  | 'evidence.candidate.review'
  | 'evidence.assess.promote'
  | 'modernization.evaluate'
  | 'approval.review.record'
  | 'approval.record'
  | 'studio.delivery.handoff'
  | 'monitor.baseline.create'
  | 'assemble.blueprint.create';

export type EnterpriseCommandEnvelope = {
  commandType: EnterpriseCommandType;
  requestId: string;
  idempotencyKey: string;
  organizationId: string;
  workspaceId: string;
  payload: JsonObject;
};

export class EnterpriseCommandError extends Error {
  constructor(
    public readonly code:
      | 'METHOD_NOT_ALLOWED'
      | 'INVALID_COMMAND'
      | 'AUTHENTICATION_REQUIRED'
      | 'TENANT_ACCESS_DENIED'
      | 'PERMISSION_DENIED'
      | 'AUTHORIZATION_STALE'
      | 'IDEMPOTENCY_CONFLICT'
      | 'COMMAND_IN_PROGRESS'
      | 'RESOURCE_NOT_FOUND'
      | 'RESOURCE_STALE'
      | 'INVALID_PAYLOAD'
      | 'COMMAND_BLOCKED'
      | 'COMMAND_UNAVAILABLE'
      | 'RECEIPT_FINALIZATION_FAILED',
    public readonly status = codeToStatus(code),
  ) {
    super(code);
    this.name = 'EnterpriseCommandError';
  }
}

export class RecoverableEnterpriseCommandError extends EnterpriseCommandError {
  readonly disposition = 'preserve_claimed_receipt';

  constructor(code: 'AUTHORIZATION_STALE' | 'COMMAND_UNAVAILABLE' | 'COMMAND_IN_PROGRESS') {
    super(code);
    this.name = 'RecoverableEnterpriseCommandError';
  }
}

export const isRecoverableEnterpriseCommandError = (error: unknown): error is RecoverableEnterpriseCommandError => (
  error instanceof RecoverableEnterpriseCommandError
  && error.disposition === 'preserve_claimed_receipt'
);

export const shouldPreserveClaimedEnterpriseReceipt = (
  error: unknown,
  executionPlan?: JsonObject | null,
) => isRecoverableEnterpriseCommandError(error)
  || (error instanceof EnterpriseCommandError && error.code === 'AUTHORIZATION_STALE')
  || (error instanceof EnterpriseCommandError
    && error.code === 'COMMAND_UNAVAILABLE'
    && (executionPlan?.externalStorageWritten === true
      || (executionPlan?.storageWriteOwnership === 'receipt_managed_write'
        && (executionPlan?.writeState === 'planned' || executionPlan?.writeState === 'written'))));

export const mapEnterpriseCommandRpcError = (error: unknown): EnterpriseCommandError => {
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT', 'ENTERPRISE_AI_EXECUTION_PLAN_CONFLICT',
    'ENTERPRISE_AI_JOB_IDEMPOTENCY_CONFLICT',
  )) return new EnterpriseCommandError('IDEMPOTENCY_CONFLICT');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE', 'PR1B_AUTHORIZATION_STALE',
  )) return new RecoverableEnterpriseCommandError('AUTHORIZATION_STALE');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_PROVIDER_ORGANIZATION_AUTHORITY_REQUIRED',
    'ENTERPRISE_PROVIDER_WORKSPACE_AUTHORITY_REQUIRED', 'ENTERPRISE_PROVIDER_PERMISSION_DENIED',
  )) return new EnterpriseCommandError('PERMISSION_DENIED');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_AI_STALE_EXECUTION_FENCE', 'ENTERPRISE_AI_COMMAND_NOT_EXECUTABLE',
    'ENTERPRISE_AI_RECEIPT_NOT_CLAIMED', 'ENTERPRISE_AI_COMMAND_IN_PROGRESS',
    'ENTERPRISE_AI_JOB_IN_PROGRESS',
  )) return new EnterpriseCommandError('COMMAND_IN_PROGRESS');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_INTELLIGENCE_PROVIDER_DISABLED', 'ENTERPRISE_PROVIDER_NOT_AVAILABLE',
    'ENTERPRISE_PROVIDER_VALIDATION_STALE', 'ENTERPRISE_PROVIDER_ROUTE_BLOCKED',
    'ENTERPRISE_MODERNIZATION_SOURCE_NOT_APPROVED',
    'ENTERPRISE_MODERNIZATION_INCOMPLETE_FACTORS',
    'ENTERPRISE_MODERNIZATION_RECOMMENDATION_INVALID',
  )) return new EnterpriseCommandError('COMMAND_BLOCKED');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_EVIDENCE_ASSESS_VERSION_CONFLICT', 'ENTERPRISE_EVIDENCE_CANDIDATE_STALE',
    'ENTERPRISE_EVIDENCE_EDIT_HISTORY_REQUIRED', 'ENTERPRISE_EVIDENCE_ALREADY_PROMOTED',
    'ENTERPRISE_EVIDENCE_BATCH_DUPLICATE', 'ENTERPRISE_EVIDENCE_BATCH_INVALID',
    'ENTERPRISE_EVIDENCE_CANDIDATE_NOT_ACCEPTED',
    'ENTERPRISE_AI_JOB_RESOURCE_STALE',
    'ENTERPRISE_MODERNIZATION_SOURCE_NOT_CURRENT',
    'ENTERPRISE_MODERNIZATION_RESULT_IDENTITY_MISMATCH',
  )) return new EnterpriseCommandError('RESOURCE_STALE');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_APPROVAL_AUTHORIZATION_STALE', 'ENTERPRISE_APPROVAL_REVIEWER_AUTHORIZATION_STALE',
    'PR1B_AUTHORIZATION_STALE',
  )) return new EnterpriseCommandError('PERMISSION_DENIED');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_APPROVAL_SEPARATION_OR_STATE_INVALID',
    'ENTERPRISE_APPROVAL_REVIEW_REQUIRED', 'ENTERPRISE_APPROVAL_REVIEW_IDENTITY_MISMATCH',
    'ENTERPRISE_APPROVAL_SEPARATION_OR_STALE_RESOURCE', 'ENTERPRISE_APPROVAL_STATE_INVALID',
  )) return new EnterpriseCommandError('RESOURCE_STALE');
  return new EnterpriseCommandError('COMMAND_UNAVAILABLE');
};

const codeToStatus = (code: EnterpriseCommandError['code']) => {
  if (code === 'METHOD_NOT_ALLOWED') return 405;
  if (code === 'AUTHENTICATION_REQUIRED') return 401;
  if (code === 'TENANT_ACCESS_DENIED' || code === 'PERMISSION_DENIED') return 403;
  if (code === 'AUTHORIZATION_STALE') return 409;
  if (code === 'RESOURCE_NOT_FOUND') return 404;
  if (code === 'RESOURCE_STALE') return 409;
  if (code === 'COMMAND_IN_PROGRESS') return 409;
  if (code === 'COMMAND_UNAVAILABLE' || code === 'RECEIPT_FINALIZATION_FAILED') return 503;
  return 400;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const commandTypes = new Set<EnterpriseCommandType>([
  'provider.register',
  'provider.validate',
  'provider.activate',
  'provider.route.toggle',
  'provider.revoke',
  'evidence.source.create',
  'evidence.extract',
  'evidence.candidate.review',
  'evidence.assess.promote',
  'modernization.evaluate',
  'approval.review.record',
  'approval.record',
  'studio.delivery.handoff',
  'monitor.baseline.create',
  'assemble.blueprint.create',
]);

const isRecord = (value: unknown): value is JsonObject => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);

const requireString = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return value.trim();
};

const requireUuid = (value: unknown) => {
  const normalized = requireString(value, 128);
  if (!uuidPattern.test(normalized)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return normalized;
};

const requireUuidArray = (value: unknown, maxItems = 100) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const ids = value.map(requireUuid);
  if (new Set(ids).size !== ids.length) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return ids;
};

const unsafeFieldPattern = /^(api[_-]?key|provider[_-]?key|secret(value|reference)?|pre[_-]?provisioned[_-]?reference|authorization|auth[_-]?header|bearer[_-]?token|raw[_-]?(key|prompt|completion)|prompt[_-]?body|completion[_-]?body|storage[_-]?path|object[_-]?key)$/i;

const assertNoUnsafeFields = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(assertNoUnsafeFields);
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, child]) => {
    if (unsafeFieldPattern.test(key.replace(/[^A-Za-z0-9_-]/g, ''))) {
      throw new EnterpriseCommandError('INVALID_PAYLOAD');
    }
    assertNoUnsafeFields(child);
  });
};

export const parseEnterpriseCommandEnvelope = (value: unknown): EnterpriseCommandEnvelope => {
  if (!isRecord(value)) throw new EnterpriseCommandError('INVALID_COMMAND');
  assertNoUnsafeFields(value);
  const commandType = value.commandType;
  if (typeof commandType !== 'string' || !commandTypes.has(commandType as EnterpriseCommandType)) {
    throw new EnterpriseCommandError('INVALID_COMMAND');
  }
  const requestId = requireUuid(value.requestId);
  const idempotencyKey = requireString(value.idempotencyKey, 200);
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) throw new EnterpriseCommandError('INVALID_COMMAND');
  const payload = value.payload;
  if (!isRecord(payload)) throw new EnterpriseCommandError('INVALID_COMMAND');
  return {
    commandType: commandType as EnterpriseCommandType,
    requestId,
    idempotencyKey,
    organizationId: requireUuid(value.organizationId),
    workspaceId: requireUuid(value.workspaceId),
    payload,
  };
};

export type Authority = {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  isAdmin: boolean;
  permissions: Set<string>;
  organizationPermissions: Set<string>;
  workspacePermissions: Set<string>;
  roleNames: Set<string>;
  organizationRoleNames: Set<string>;
  workspaceRoleNames: Set<string>;
  organizationRoleIds: Set<string>;
  workspaceRoleIds: Set<string>;
  authorizationVersion: number;
};

type AuthorityProfileRow = { id: string; status: string; deleted_at?: string | null };
type AuthorityOrganizationRow = { id: string; status: string; deleted_at?: string | null };
type AuthorityWorkspaceRow = { id: string; org_id: string; status: string; deleted_at?: string | null };
type AuthorityMembershipRow = { status: string; role_id?: string | null; deleted_at?: string | null };
type AuthorityRoleRow = { id: string; name?: string | null; scope: string; org_id?: string | null; workspace_id?: string | null; status: string; deleted_at?: string | null };
type AuthorityCapabilityRow = { role_id: string; capability_key: string };

const resolveAuthority = async (actorId: string, organizationId: string, workspaceId: string): Promise<Authority> => {
  const [profile, organization, workspace, orgMembership, workspaceMembership, authorization] = await Promise.all([
    findOne<AuthorityProfileRow>('profiles', `select=id,status,deleted_at&id=eq.${encodeURIComponent(actorId)}`),
    findOne<AuthorityOrganizationRow>('organizations', `select=id,status,deleted_at&id=eq.${encodeURIComponent(organizationId)}`),
    findOne<AuthorityWorkspaceRow>('workspaces', `select=id,org_id,status,deleted_at&id=eq.${encodeURIComponent(workspaceId)}&org_id=eq.${encodeURIComponent(organizationId)}`),
    findOne<AuthorityMembershipRow>('organization_members', `select=status,role_id,deleted_at&org_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(actorId)}&status=eq.active&deleted_at=is.null`),
    findOne<AuthorityMembershipRow>('workspace_memberships', `select=status,role_id,deleted_at&org_id=eq.${encodeURIComponent(organizationId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(actorId)}&status=eq.active&deleted_at=is.null`),
    findOne<{ version: number }>('authorization_versions', `select=version&org_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(actorId)}`),
  ]);
  if (
    !profile || profile.status !== 'active' || profile.deleted_at
    || !organization || organization.status !== 'active' || organization.deleted_at
    || !workspace || workspace.org_id !== organizationId || workspace.status !== 'active' || workspace.deleted_at
    || !orgMembership || orgMembership.status !== 'active'
    || !workspaceMembership || workspaceMembership.status !== 'active'
    || !authorization || !Number.isInteger(authorization.version) || authorization.version <= 0
  ) throw new EnterpriseCommandError('TENANT_ACCESS_DENIED');

  const roleIds = [orgMembership.role_id, workspaceMembership.role_id].filter((id): id is string => Boolean(id));
  if (!roleIds.length) throw new EnterpriseCommandError('PERMISSION_DENIED');
  const roles = await postgrest<AuthorityRoleRow[]>(
    `roles?select=id,name,scope,org_id,workspace_id,status,deleted_at&id=in.(${roleIds.map(encodeURIComponent).join(',')})`,
    { method: 'GET' },
  );
  const validRoleIds = roles.filter(role => (
    role.status === 'active'
    && !role.deleted_at
    && role.org_id === organizationId
    && ((role.id === orgMembership.role_id && role.scope === 'organization' && !role.workspace_id)
      || (role.id === workspaceMembership.role_id && role.scope === 'workspace' && role.workspace_id === workspaceId))
  )).map(role => role.id);
  if (!validRoleIds.length) throw new EnterpriseCommandError('TENANT_ACCESS_DENIED');
  const capabilities = await postgrest<AuthorityCapabilityRow[]>(
    `role_capabilities?select=role_id,capability_key&role_id=in.(${validRoleIds.map(encodeURIComponent).join(',')})`,
    { method: 'GET' },
  );
  const organizationRoleIds = new Set(roles.filter(role => role.id === orgMembership.role_id && validRoleIds.includes(role.id)).map(role => role.id));
  const workspaceRoleIds = new Set(roles.filter(role => role.id === workspaceMembership.role_id && validRoleIds.includes(role.id)).map(role => role.id));
  const organizationPermissions = new Set(capabilities.filter(row => organizationRoleIds.has(row.role_id)).map(row => row.capability_key));
  const workspacePermissions = new Set(capabilities.filter(row => workspaceRoleIds.has(row.role_id)).map(row => row.capability_key));
  const permissions = new Set([...organizationPermissions, ...workspacePermissions]);
  const organizationRoleNames = new Set(roles.filter(role => organizationRoleIds.has(role.id)).map(role => String(role.name || '').toLowerCase()).filter(Boolean));
  const workspaceRoleNames = new Set(roles.filter(role => workspaceRoleIds.has(role.id)).map(role => String(role.name || '').toLowerCase()).filter(Boolean));
  return {
    actorId,
    organizationId,
    workspaceId,
    isAdmin: organizationPermissions.has('org.admin'),
    permissions,
    organizationPermissions,
    workspacePermissions,
    roleNames: new Set([...organizationRoleNames, ...workspaceRoleNames]),
    organizationRoleNames,
    workspaceRoleNames,
    organizationRoleIds,
    workspaceRoleIds,
    authorizationVersion: authorization.version,
  };
};

const requirePermission = (authority: Authority, ...required: string[]) => {
  if (authority.isAdmin || required.some(permission => authority.permissions.has(permission))) return;
  throw new EnterpriseCommandError('PERMISSION_DENIED');
};

const assertFreshAuthority = async (authority: Authority, required: string[]) => {
  const current = await findOne<{ version: number }>(
    'authorization_versions',
    `select=version&org_id=eq.${encodeURIComponent(authority.organizationId)}&user_id=eq.${encodeURIComponent(authority.actorId)}`,
  );
  if (!current || current.version !== authority.authorizationVersion) throw new EnterpriseCommandError('AUTHORIZATION_STALE');
  const capability = authority.isAdmin ? 'org.admin' : required.find(item => authority.permissions.has(item));
  if (!capability) throw new EnterpriseCommandError('PERMISSION_DENIED');
  try {
    await rpc('pr1b_assert_command_authority', {
      p_actor: authority.actorId,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_capability: capability,
      p_version: authority.authorizationVersion,
    });
  } catch {
    throw new EnterpriseCommandError('PERMISSION_DENIED');
  }
};

const requirePayloadObject = (value: unknown) => {
  if (!isRecord(value)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return value;
};

const requireProvider = (value: unknown): EnterpriseAiProvider => {
  const provider = requireString(value, 64) as EnterpriseAiProvider;
  if (!ENTERPRISE_AI_PROVIDERS.includes(provider)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return provider;
};

const requireCapability = (value: unknown): EnterpriseAiCapability => {
  const capability = requireString(value, 120) as EnterpriseAiCapability;
  if (!ENTERPRISE_AI_CAPABILITIES.includes(capability)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return capability;
};

const requireMime = (value: unknown): SupportedEvidenceMimeType => {
  const mime = requireString(value, 160);
  if (!isSupportedEvidenceMimeType(mime)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return mime;
};

const requireFactorBand = (value: unknown) => {
  if (value !== 'unknown' && value !== 'low' && value !== 'medium' && value !== 'high') {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return value;
};

const parseModernizationFactors = (value: unknown): ModernizationFactors => {
  const object = requirePayloadObject(value);
  const fields: Array<keyof ModernizationFactors> = [
    'criticality', 'fit', 'ux', 'techHealth', 'maintainability', 'architecture',
    'securityCompliance', 'dataPortability', 'apiIntegration', 'cloudFit', 'agentFit',
    'vendorLockIn', 'costTco', 'operatingRisk', 'skills', 'changeEffort', 'timeToValue',
    'dependencyRisk',
  ];
  return Object.fromEntries(fields.map(field => [field, requireFactorBand(object[field])])) as unknown as ModernizationFactors;
};

const sha256Json = (value: unknown) => sha256Hex(JSON.stringify(value));

const findOne = async <T>(table: string, query: string) => {
  const rows = await postgrest<T[]>(`${table}?${query}&limit=1`, { method: 'GET' });
  return rows[0] || null;
};

const resolveRoute = async (
  authority: Authority,
  capability: EnterpriseAiCapability,
  requestedConfigId?: string,
  exact?: { routeId?: string; model?: string },
  allowDisabled = false,
) => {
  const decision = await resolveEnterpriseProviderRoute({
    mode: 'pilot',
    capability,
    organizationId: authority.organizationId,
    workspaceId: authority.workspaceId,
    actorId: authority.actorId,
    roleNames: [...authority.roleNames],
    roleIds: [...authority.organizationRoleIds, ...authority.workspaceRoleIds],
    requestedProviderConfigId: requestedConfigId,
    requestedRouteId: exact?.routeId,
    requestedModel: exact?.model,
    includeDisabled: allowDisabled,
    scannerReference: 'supabase/functions/_shared/enterpriseIntelligenceCommand.ts',
  }, buildEnterpriseProviderRouteDbDeps(isAllowedProviderEndpoint));
  if (decision.status === 'blocked') {
    if (decision.failureClass === 'role_not_allowed' || decision.failureClass === 'wrong_tenant') {
      throw new EnterpriseCommandError('PERMISSION_DENIED');
    }
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  if (!ENTERPRISE_AI_PROVIDERS.includes(decision.provider as EnterpriseAiProvider) || !decision.model) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  return {
    decision,
    config: {
      id: decision.providerConfigId,
      provider: decision.provider as EnterpriseAiProvider,
      route_id: decision.routeId,
      endpoint_url: decision.endpoint,
      deployment_name: decision.deployment,
    },
    model: decision.model,
  };
};

const lifecycleAuthority = (authority: Authority): ProviderLifecycleAuthority => ({
  actorId: authority.actorId,
  organizationId: authority.organizationId,
  workspaceId: authority.workspaceId,
  authorizationVersion: authority.authorizationVersion,
  organizationCapabilities: new Set(authority.organizationPermissions),
  workspaceCapabilities: new Set(authority.workspacePermissions),
  organizationRoleNames: new Set(authority.organizationRoleNames),
  workspaceRoleNames: new Set(authority.workspaceRoleNames),
  organizationRoleIds: new Set(authority.organizationRoleIds),
  workspaceRoleIds: new Set(authority.workspaceRoleIds),
  eligibleRouteRoleIds: new Set([...authority.organizationRoleIds, ...authority.workspaceRoleIds]),
});

const receiptMutationArgs = (receipt: EnterpriseReceiptRow, result: JsonObject) => ({
  p_receipt: receipt.id,
  p_execution_token: receipt.execution_token,
  p_execution_fence: receipt.execution_fence,
  p_result: result,
});

export const resolveEnterpriseCommandResourceId = (
  commandType: EnterpriseCommandType,
  resultObject: JsonObject,
) => {
  const explicitResourceId = resultObject.resourceId;
  if (typeof explicitResourceId !== 'string' || !uuidPattern.test(explicitResourceId)) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  const lineageResourceId = commandType.startsWith('provider.')
    ? resultObject.providerConfigId
    : commandType === 'evidence.source.create'
      ? resultObject.sourceId
      : commandType === 'evidence.extract'
        ? resultObject.jobId
        : commandType === 'evidence.candidate.review'
          ? resultObject.candidateId
          : commandType === 'evidence.assess.promote'
            ? resultObject.assessDraftId
            : commandType === 'modernization.evaluate'
              ? resultObject.decisionId
              : commandType === 'studio.delivery.handoff'
                ? resultObject.workPackageId
                : commandType === 'monitor.baseline.create' || commandType === 'assemble.blueprint.create'
                  ? resultObject.id
                  : explicitResourceId;
  if (lineageResourceId !== explicitResourceId) throw new EnterpriseCommandError('RESOURCE_STALE');
  return explicitResourceId;
};

export const enterpriseCommandStatusForTerminalReceipt = (receipt: EnterpriseReceiptRow) => {
  const responseError = isRecord(receipt.response?.error) ? receipt.response.error.code : undefined;
  if (typeof responseError !== 'string') return 409;
  const known = new Set<EnterpriseCommandError['code']>([
    'METHOD_NOT_ALLOWED', 'INVALID_COMMAND', 'AUTHENTICATION_REQUIRED', 'TENANT_ACCESS_DENIED',
    'PERMISSION_DENIED', 'AUTHORIZATION_STALE', 'IDEMPOTENCY_CONFLICT', 'COMMAND_IN_PROGRESS',
    'RESOURCE_NOT_FOUND', 'RESOURCE_STALE', 'INVALID_PAYLOAD', 'COMMAND_BLOCKED',
    'COMMAND_UNAVAILABLE', 'RECEIPT_FINALIZATION_FAILED',
  ]);
  return known.has(responseError as EnterpriseCommandError['code'])
    ? codeToStatus(responseError as EnterpriseCommandError['code'])
    : 409;
};

type EnterpriseDomainCommandType = Exclude<EnterpriseCommandType, ProviderLifecycleOperation>;

const enterpriseProviderOperations: Partial<Record<EnterpriseCommandType, ProviderLifecycleOperation>> = {
  'provider.register': 'provider.register',
  'provider.validate': 'provider.validate',
  'provider.activate': 'provider.activate',
  'provider.route.toggle': 'provider.route.toggle',
  'provider.revoke': 'provider.revoke',
};

const enterpriseCommandCapabilities: Record<EnterpriseDomainCommandType, readonly string[]> = {
  'evidence.source.create': ['evidence.write'],
  'evidence.extract': ['evidence.write'],
  'evidence.candidate.review': ['evidence.review'],
  'evidence.assess.promote': ['assessment.edit'],
  'modernization.evaluate': ['portfolio.manage'],
  'approval.review.record': ['approvals.review'],
  'approval.record': ['approvals.review'],
  'studio.delivery.handoff': ['docs.approve'],
  'monitor.baseline.create': ['monitor.manage'],
  'assemble.blueprint.create': ['assemble.manage'],
};

export const requiredCapabilitiesForEnterpriseCommand = (commandType: EnterpriseCommandType) => (
  [...(enterpriseCommandCapabilities[commandType as EnterpriseDomainCommandType]
    || (() => { throw new EnterpriseCommandError('INVALID_COMMAND'); })())]
);

export const assertEnterpriseCommandOperationAuthority = (
  authority: Authority,
  commandType: EnterpriseCommandType,
) => {
  const providerOperation = enterpriseProviderOperations[commandType];
  if (providerOperation) {
    try {
      assertProviderLifecycleOperationAuthority(providerOperation, lifecycleAuthority(authority));
      return;
    } catch {
      throw new EnterpriseCommandError('PERMISSION_DENIED');
    }
  }
  requirePermission(authority, ...requiredCapabilitiesForEnterpriseCommand(commandType));
};

export const assertCurrentEnterpriseCommandAuthority = async (
  authority: Authority,
  commandType: EnterpriseCommandType,
) => {
  try {
    const current = await resolveAuthority(
      authority.actorId, authority.organizationId, authority.workspaceId,
    );
    const providerOperation = enterpriseProviderOperations[commandType];
    if (providerOperation) {
      assertProviderLifecycleOperationAuthority(providerOperation, lifecycleAuthority(current));
    } else {
      await assertFreshAuthority(current, requiredCapabilitiesForEnterpriseCommand(commandType));
    }
    return current;
  } catch {
    throw new EnterpriseCommandError('PERMISSION_DENIED');
  }
};

const ensureExecutionPlan = async (
  receipt: EnterpriseReceiptRow,
  authority: Authority,
  additions: JsonObject,
) => {
  const plan = { ...(receipt.execution_plan || {}), ...additions };
  const persisted = await persistEnterpriseExecutionPlan(receipt, authority, plan);
  receipt.execution_plan = persisted.execution_plan || plan;
  return receipt.execution_plan;
};

const plannedUuid = (receipt: EnterpriseReceiptRow, key: string) => {
  const existing = receipt.execution_plan?.[key];
  return typeof existing === 'string' && uuidPattern.test(existing) ? existing : crypto.randomUUID();
};

const commandProviderLifecycle = async (
  operation: ProviderLifecycleOperation,
  authority: Authority,
  payload: JsonObject,
  receipt: EnterpriseReceiptRow,
) => {
  requirePermission(authority, 'byok.manage', 'security.manage');
  try {
    const execution = {
      receiptId: receipt.id,
      executionToken: receipt.execution_token,
      executionFence: receipt.execution_fence,
      plan: receipt.execution_plan || {},
      async persistPlan(plan: JsonObject) {
        const planned = await persistEnterpriseExecutionPlan(receipt, authority, plan);
        receipt.execution_plan = planned.execution_plan || {};
        return receipt.execution_plan;
      },
      async renewCleanupLease() {
        // Raw-key bind and rotate are not accepted on this generic command surface.
        throw new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE');
      },
    };
    return await executeProviderLifecycleCommand(
      operation,
      lifecycleAuthority(authority),
      payload,
      createProviderLifecycleDeps(buildEnterpriseProviderRouteDbDeps(isAllowedProviderEndpoint)),
      execution,
    );
  } catch (error) {
    throw mapProviderLifecycleCommandError(error);
  }
};

export function mapProviderLifecycleCommandError(error: unknown): EnterpriseCommandError {
  if (error instanceof ProviderLifecycleError) {
    if (error.code === 'AUTHORIZATION_STALE') return new RecoverableEnterpriseCommandError('AUTHORIZATION_STALE');
    if (error.code === 'PERMISSION_DENIED' || error.code === 'TENANT_ACCESS_DENIED') return new EnterpriseCommandError('PERMISSION_DENIED');
    if (error.code === 'RESOURCE_NOT_FOUND') return new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    if (error.code === 'PERSISTENCE_UNAVAILABLE' || error.code === 'SECRET_BACKEND_REQUIRED' || error.code === 'SECRET_UNAVAILABLE') {
      return new EnterpriseCommandError('COMMAND_UNAVAILABLE');
    }
    if (error.code === 'INVALID_REQUEST') return new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return new EnterpriseCommandError('COMMAND_BLOCKED');
}

export type EvidenceSourceUploadPlan = {
  storageWriteOwnership: 'receipt_managed_write';
  storageWriteReceiptId: string;
  sourceId: string;
  sourceVersionId: string;
  storageBucket: string;
  storagePath: string;
  contentHash: string;
  contentBytes: number;
  mimeType: SupportedEvidenceMimeType;
  writeState: 'planned' | 'written';
};

type EvidenceSourceUploadPlanIdentity = Omit<EvidenceSourceUploadPlan, 'writeState'>;

const sourceUploadPlanIdentityKeys = [
  'storageWriteOwnership', 'storageWriteReceiptId', 'sourceId', 'sourceVersionId',
  'storageBucket', 'storagePath', 'contentHash', 'contentBytes', 'mimeType',
] as const;

const readEvidenceSourceUploadPlan = (
  plan: JsonObject,
  expected: EvidenceSourceUploadPlanIdentity,
): EvidenceSourceUploadPlan | null => {
  const hasManagedIntent = plan.storageWriteOwnership !== undefined
    || plan.storageWriteReceiptId !== undefined
    || plan.contentHash !== undefined
    || plan.contentBytes !== undefined
    || plan.mimeType !== undefined
    || plan.writeState !== undefined;
  if (!hasManagedIntent) return null;
  if (!sourceUploadPlanIdentityKeys.every(key => plan[key] === expected[key])
    || (plan.writeState !== 'planned' && plan.writeState !== 'written')) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  return { ...expected, writeState: plan.writeState };
};

export const ensureEvidenceSourceUploadPlan = async (
  receipt: EnterpriseReceiptRow,
  expected: EvidenceSourceUploadPlanIdentity,
  persistPlan: (plan: JsonObject) => Promise<JsonObject>,
): Promise<EvidenceSourceUploadPlan> => {
  const current = receipt.execution_plan || {};
  const existing = readEvidenceSourceUploadPlan(current, expected);
  if (existing) return existing;
  for (const key of ['sourceId', 'sourceVersionId', 'storageBucket', 'storagePath'] as const) {
    if (current[key] !== undefined && current[key] !== expected[key]) {
      throw new EnterpriseCommandError('RESOURCE_STALE');
    }
  }
  const planned: EvidenceSourceUploadPlan = { ...expected, writeState: 'planned' };
  const persisted = await persistPlan({ ...current, ...planned });
  const decoded = readEvidenceSourceUploadPlan(persisted, expected);
  if (!decoded) throw new EnterpriseCommandError('RESOURCE_STALE');
  receipt.execution_plan = persisted;
  return decoded;
};

export type EvidenceSourceUploadInspection = 'absent' | 'exact' | 'mismatch' | 'uncertain';
export type EvidenceSourceUploadAttempt = 'written' | 'conflict' | 'uncertain';

export const reconcileEvidenceSourceUpload = async (
  plan: EvidenceSourceUploadPlan,
  deps: {
    renewLease: () => Promise<void>;
    inspect: () => Promise<EvidenceSourceUploadInspection>;
    upload: () => Promise<EvidenceSourceUploadAttempt>;
    persistWritten: (plan: EvidenceSourceUploadPlan) => Promise<void>;
  },
) => {
  if (plan.writeState === 'written') return 'written' as const;

  const inspectOwnedObject = async () => {
    await deps.renewLease();
    const inspection = await deps.inspect();
    if (inspection === 'uncertain') throw new RecoverableEnterpriseCommandError('COMMAND_UNAVAILABLE');
    if (inspection === 'mismatch') throw new EnterpriseCommandError('RESOURCE_STALE');
    return inspection;
  };

  let inspection = await inspectOwnedObject();
  if (inspection === 'absent') {
    await deps.renewLease();
    const uploaded = await deps.upload();
    if (uploaded === 'uncertain') throw new RecoverableEnterpriseCommandError('COMMAND_UNAVAILABLE');
    if (uploaded === 'conflict') {
      inspection = await inspectOwnedObject();
      if (inspection !== 'exact') throw new EnterpriseCommandError('RESOURCE_STALE');
    }
  }
  await deps.persistWritten({ ...plan, writeState: 'written' });
  return 'written' as const;
};

const normalizeEvidenceGroundingText = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\s+/gu, ' ')
  .trim();

export const buildGroundedEvidenceCandidate = async (input: {
  source: {
    sourceId: string;
    sourceVersionId: string;
    contentHash: string;
    extractedTextHash: string;
    text: string;
  };
  candidate: Omit<Parameters<typeof buildEvidenceCandidate>[0], 'field'> & { field: EvidenceCandidateField };
}) => {
  if (input.candidate.sourceId !== input.source.sourceId
    || input.candidate.sourceVersionId !== input.source.sourceVersionId) return null;
  const persistedExcerpt = typeof input.candidate.safeExcerpt === 'string'
    ? sanitizeEvidenceExcerpt(input.candidate.safeExcerpt)
    : '';
  const normalizedExcerpt = normalizeEvidenceGroundingText(persistedExcerpt);
  if (!normalizedExcerpt
    || !normalizeEvidenceGroundingText(input.source.text).includes(normalizedExcerpt)) return null;
  const candidate = buildEvidenceCandidate({ ...input.candidate, safeExcerpt: persistedExcerpt });
  if (candidate.safeExcerpt !== persistedExcerpt) throw new EnterpriseCommandError('RESOURCE_STALE');
  candidate.excerptHash = await sha256Hex(JSON.stringify({
    sourceVersionId: input.source.sourceVersionId,
    sourceContentHash: input.source.contentHash,
    extractedTextHash: input.source.extractedTextHash,
    sourceLocator: candidate.sourceLocator,
    safeExcerpt: candidate.safeExcerpt,
    value: candidate.value,
  }));
  return candidate;
};

const commandEvidenceSourceCreate = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'evidence.write');
  const mimeType = requireMime(payload.mimeType);
  const contentBase64 = requireString(payload.contentBase64, 16_000_000);
  const bytes = decodeBase64(contentBase64);
  if (bytes.length === 0 || bytes.length > 12_000_000) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const filename = requireString(payload.filename || 'evidence.txt', 240).split(/[\\/]/).pop() || 'evidence.txt';
  const displayName = requireString(payload.displayName || filename, 240);
  const sourceKind = payload.sourceKind === 'pasted_text' ? 'pasted_text' : 'upload';
  const sourceId = plannedUuid(receipt, 'sourceId');
  const versionId = plannedUuid(receipt, 'sourceVersionId');
  const bucket = assertSourceUploadsBucket(resolveSourceUploadsBucket());
  const artifact = prepareTextArtifact({ orgId: authority.organizationId, workspaceId: authority.workspaceId, bucket, artifactType: 'enterprise-evidence', extension: 'bin', artifactId: sourceId });
  const contentHash = await sha256Hex(bytes);
  const uploadIdentity: EvidenceSourceUploadPlanIdentity = {
    storageWriteOwnership: 'receipt_managed_write',
    storageWriteReceiptId: receipt.id,
    sourceId,
    sourceVersionId: versionId,
    storageBucket: bucket,
    storagePath: artifact.path,
    contentHash,
    contentBytes: bytes.length,
    mimeType,
  };
  const persistUploadPlan = async (plan: JsonObject) => {
    try {
      return await ensureExecutionPlan(receipt, authority, plan);
    } catch (error) {
      if (error instanceof EnterpriseReceiptError
        && (error.code === 'COMMAND_UNAVAILABLE' || error.code === 'COMMAND_IN_PROGRESS')) {
        throw new RecoverableEnterpriseCommandError(error.code);
      }
      throw error;
    }
  };
  const uploadPlan = await ensureEvidenceSourceUploadPlan(receipt, uploadIdentity, persistUploadPlan);
  try {
    await reconcileEvidenceSourceUpload(uploadPlan, {
      renewLease: async () => {
        try {
          await renewEnterpriseExternalWriteLease(receipt, authority);
        } catch (error) {
          if (error instanceof EnterpriseReceiptError
            && (error.code === 'COMMAND_UNAVAILABLE' || error.code === 'COMMAND_IN_PROGRESS')) {
            throw new RecoverableEnterpriseCommandError(error.code);
          }
          throw error;
        }
      },
      inspect: async () => {
        try {
          const inspected = await inspectBinaryArtifact({
            orgId: authority.organizationId,
            workspaceId: authority.workspaceId,
            bucket,
            storagePath: artifact.path,
            maximumBytes: bytes.length,
          });
          if (inspected.state === 'absent') return 'absent';
          if (!inspected.content || inspected.content.length !== bytes.length) return 'mismatch';
          return await sha256Hex(inspected.content) === contentHash ? 'exact' : 'mismatch';
        } catch (error) {
          if (error instanceof StorageArtifactError && error.code === 'UNCERTAIN') return 'uncertain';
          throw error;
        }
      },
      upload: async () => {
        try {
          await uploadBinaryArtifact({
            artifact,
            orgId: authority.organizationId,
            workspaceId: authority.workspaceId,
            contentType: mimeType,
            content: bytes,
          });
          return 'written';
        } catch (error) {
          if (error instanceof StorageArtifactError) {
            return error.code === 'CONFLICT' ? 'conflict' : 'uncertain';
          }
          throw error;
        }
      },
      persistWritten: async writtenPlan => {
        await persistUploadPlan({ ...(receipt.execution_plan || {}), ...writtenPlan });
      },
    });
    const existingSource = await findOne<{ id: string }>(
      'enterprise_evidence_sources',
      `select=id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceId)}&deleted_at=is.null`,
    );
    const existingVersion = existingSource ? await findOne<{
      id: string; source_id: string; content_hash: string; storage_bucket: string; storage_path: string; extraction_status: string;
    }>(
      'enterprise_evidence_source_versions',
      `select=id,source_id,content_hash,storage_bucket,storage_path,extraction_status&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(versionId)}&source_id=eq.${encodeURIComponent(sourceId)}`,
    ) : null;
    if (existingSource && (
      !existingVersion
      || existingVersion.content_hash !== contentHash
      || existingVersion.storage_bucket !== bucket
      || existingVersion.storage_path !== artifact.path
      || existingVersion.extraction_status !== 'pending'
    )) throw new EnterpriseCommandError('RESOURCE_STALE');
    const pendingResult = {
      resourceId: sourceId,
      sourceId,
      sourceVersionId: versionId,
      version: 1,
      displayName,
      mimeType,
      status: 'uploaded',
      contentHash,
      extractedCharacterCount: 0,
      ingestion: 'server_managed',
    };
    if (!existingSource) {
      await rpc('enterprise_create_evidence_source_record', {
        p_source: {
          id: sourceId, org_id: authority.organizationId, workspace_id: authority.workspaceId,
          display_name: displayName, source_kind: sourceKind, mime_type: mimeType,
          current_version: 1, status: 'uploaded', created_by: authority.actorId,
        },
        p_version: {
          id: versionId, source_id: sourceId, org_id: authority.organizationId,
          workspace_id: authority.workspaceId, version: 1, original_filename: filename,
          content_hash: contentHash, content_bytes: bytes.length, storage_bucket: bucket,
          storage_path: artifact.path, extracted_text_hash: null,
          extracted_character_count: null, created_by: authority.actorId,
        },
        ...receiptMutationArgs(receipt, pendingResult),
      });
    }
    let text: string;
    try {
      text = await extractEvidenceText(bytes, mimeType);
    } catch (parseError) {
      const failureCode = classifyEvidenceExtractionFailure(parseError, mimeType);
      if (!failureCode) throw parseError;
      const failedResult = {
        resourceId: sourceId, sourceId, sourceVersionId: versionId, version: 1, displayName, mimeType,
        status: 'failed', failureCode, extractedCharacterCount: 0, ingestion: 'server_managed',
      };
      await rpc('enterprise_record_source_extraction_failure', {
        p_source_version: versionId,
        p_org: authority.organizationId,
        p_workspace: authority.workspaceId,
        p_failure_code: failureCode,
        ...receiptMutationArgs(receipt, failedResult),
      });
      return failedResult;
    }
    const extractedTextHash = await sha256Hex(text);
    const result = {
      resourceId: sourceId, sourceId, sourceVersionId: versionId, version: 1, displayName, mimeType,
      status: 'review', contentHash, extractedCharacterCount: text.length, ingestion: 'server_managed',
    };
    await rpc('enterprise_record_source_extraction_success', {
      p_source_version: versionId,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_extracted_text_hash: extractedTextHash,
      p_extracted_character_count: text.length,
      ...receiptMutationArgs(receipt, result),
    });
    return result;
  } catch (error) {
    if (error instanceof EnterpriseCommandError || error instanceof EnterpriseReceiptError) throw error;
    throw new EnterpriseCommandError('COMMAND_UNAVAILABLE');
  }
};

type EvidenceVersionRow = {
  id: string;
  source_id: string;
  version: number;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type?: SupportedEvidenceMimeType;
  content_hash: string;
  extracted_text_hash?: string | null;
};

type EvidenceExtractionClaim = {
  state: 'owned' | 'running' | 'staged' | 'committed' | 'failed' | 'blocked';
  ownsExecution: boolean;
  jobId: string;
  attemptCount: number;
  recoveryCount: number;
  safeResult?: JsonObject;
};

export type EvidenceExtractionRoutePlan = {
  jobId: string;
  organizationId: string;
  workspaceId: string;
  sourceId: string;
  sourceVersionId: string;
  capability: 'assess.evidence.extract';
  routeId: string;
  providerConfigId: string;
  provider: EnterpriseAiProvider;
  model: string;
  endpointIdentity: string | null;
  deploymentIdentity: string | null;
  promptKey: 'assess.evidence.extract';
  promptVersion: string;
  requestHash: string;
};

const extractionRoutePlanKeys = [
  'routeId', 'providerConfigId', 'provider', 'model', 'endpointIdentity', 'deploymentIdentity',
] as const;

const nullablePlanString = (value: unknown, maximum: number) => (
  value === null ? null : typeof value === 'string' && value.length <= maximum ? value : undefined
);

export const readEvidenceExtractionRoutePlan = (
  plan: JsonObject,
  expected: Pick<EvidenceExtractionRoutePlan,
    'organizationId' | 'workspaceId' | 'sourceId' | 'sourceVersionId' | 'requestHash'>,
): EvidenceExtractionRoutePlan | null => {
  if (!extractionRoutePlanKeys.some(key => plan[key] !== undefined)) return null;
  const provider = plan.provider;
  const parsed: EvidenceExtractionRoutePlan = {
    jobId: typeof plan.jobId === 'string' && uuidPattern.test(plan.jobId) ? plan.jobId : '',
    organizationId: typeof plan.organizationId === 'string' && uuidPattern.test(plan.organizationId) ? plan.organizationId : '',
    workspaceId: typeof plan.workspaceId === 'string' && uuidPattern.test(plan.workspaceId) ? plan.workspaceId : '',
    sourceId: typeof plan.sourceId === 'string' && uuidPattern.test(plan.sourceId) ? plan.sourceId : '',
    sourceVersionId: typeof plan.sourceVersionId === 'string' && uuidPattern.test(plan.sourceVersionId) ? plan.sourceVersionId : '',
    capability: plan.capability === 'assess.evidence.extract' ? plan.capability : 'assess.evidence.extract',
    routeId: typeof plan.routeId === 'string' && uuidPattern.test(plan.routeId) ? plan.routeId : '',
    providerConfigId: typeof plan.providerConfigId === 'string' && uuidPattern.test(plan.providerConfigId) ? plan.providerConfigId : '',
    provider: ENTERPRISE_AI_PROVIDERS.includes(provider as EnterpriseAiProvider) ? provider as EnterpriseAiProvider : 'openai',
    model: typeof plan.model === 'string' && plan.model.length > 0 && plan.model.length <= 200 ? plan.model : '',
    endpointIdentity: nullablePlanString(plan.endpointIdentity, 2_000) as string | null,
    deploymentIdentity: nullablePlanString(plan.deploymentIdentity, 240) as string | null,
    promptKey: plan.promptKey === 'assess.evidence.extract' ? plan.promptKey : 'assess.evidence.extract',
    promptVersion: typeof plan.promptVersion === 'string' && plan.promptVersion.length > 0 && plan.promptVersion.length <= 120 ? plan.promptVersion : '',
    requestHash: typeof plan.requestHash === 'string' && /^[0-9a-f]{64}$/.test(plan.requestHash) ? plan.requestHash : '',
  };
  const structurallyValid = parsed.jobId && parsed.organizationId && parsed.workspaceId
    && parsed.sourceId && parsed.sourceVersionId && parsed.routeId && parsed.providerConfigId
    && parsed.model && parsed.promptVersion && parsed.requestHash
    && plan.capability === 'assess.evidence.extract'
    && plan.promptKey === 'assess.evidence.extract'
    && ENTERPRISE_AI_PROVIDERS.includes(provider as EnterpriseAiProvider)
    && nullablePlanString(plan.endpointIdentity, 2_000) !== undefined
    && nullablePlanString(plan.deploymentIdentity, 240) !== undefined;
  if (!structurallyValid
    || parsed.organizationId !== expected.organizationId
    || parsed.workspaceId !== expected.workspaceId
    || parsed.sourceId !== expected.sourceId
    || parsed.sourceVersionId !== expected.sourceVersionId
    || parsed.requestHash !== expected.requestHash) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  return parsed;
};

export const extractionRouteMatchesPlan = (
  planned: EvidenceExtractionRoutePlan,
  resolved: {
    routeId: string; providerConfigId: string; provider: EnterpriseAiProvider; model: string;
    endpointIdentity?: string | null; deploymentIdentity?: string | null;
  },
) => planned.routeId === resolved.routeId
  && planned.providerConfigId === resolved.providerConfigId
  && planned.provider === resolved.provider
  && planned.model === resolved.model
  && planned.endpointIdentity === (resolved.endpointIdentity || null)
  && planned.deploymentIdentity === (resolved.deploymentIdentity || null);

export const mapExtractionPersistenceError = (error: unknown) => {
  if (isSupabaseRpcTransportError(error)) return new RecoverableEnterpriseCommandError('COMMAND_UNAVAILABLE');
  if (isSupabaseRpcError(error)) {
    const mapped = mapEnterpriseCommandRpcError(error);
    return mapped.code === 'COMMAND_IN_PROGRESS'
      ? new RecoverableEnterpriseCommandError('COMMAND_IN_PROGRESS')
      : mapped;
  }
  return new EnterpriseCommandError('COMMAND_UNAVAILABLE');
};

const failEvidenceExtractionAttempt = async (
  authority: Authority,
  receipt: EnterpriseReceiptRow,
  jobId: string,
  requestStarted: number,
  terminalError: EnterpriseCommandError,
  failureClass: string,
) => {
  try {
    await rpc('enterprise_fail_evidence_extraction_job', {
      p_job_id: jobId,
      p_receipt: receipt.id,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_execution_token: receipt.execution_token,
      p_execution_fence: receipt.execution_fence,
      p_failure_class: failureClass,
      p_latency_ms: Math.max(0, Date.now() - requestStarted),
      p_response: enterpriseCommandErrorBody(terminalError),
      p_blocked: terminalError.code === 'COMMAND_BLOCKED' || terminalError.code === 'PERMISSION_DENIED',
    });
  } catch (failureError) {
    throw isSupabaseRpcError(failureError)
      ? mapEnterpriseCommandRpcError(failureError)
      : new EnterpriseCommandError('COMMAND_UNAVAILABLE');
  }
};

const commitStagedEvidenceExtraction = async (
  authority: Authority,
  receipt: EnterpriseReceiptRow,
  jobId: string,
) => {
  try {
    await rpc('enterprise_commit_staged_evidence_extraction', {
      p_job_id: jobId,
      p_receipt: receipt.id,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_execution_token: receipt.execution_token,
      p_execution_fence: receipt.execution_fence,
    });
  } catch (error) {
    // A generic transport exception cannot prove whether PostgreSQL committed.
    // Keep the job running and receipt claimed for effect/stage reconciliation.
    throw mapExtractionPersistenceError(error);
  }
};

const commandEvidenceExtract = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'evidence.write');
  const sourceId = requireUuid(payload.sourceId);
  const source = await findOne<{ id: string; mime_type: SupportedEvidenceMimeType; status: string; current_version: number }>(
    'enterprise_evidence_sources',
    `select=id,mime_type,status,current_version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceId)}&deleted_at=is.null`,
  );
  if (!source || !source.mime_type || !Number.isSafeInteger(source.current_version)) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  const version = await findOne<EvidenceVersionRow>(
    'enterprise_evidence_source_versions',
    `select=id,source_id,version,original_filename,storage_bucket,storage_path,content_hash,extracted_text_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&source_id=eq.${encodeURIComponent(sourceId)}&version=eq.${source.current_version}`,
  );
  if (!version) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  const sourceVersionId = version.id;
  const jobId = plannedUuid(receipt, 'jobId');
  const promptKey = 'assess.evidence.extract';
  const promptVersion = 'enterprise-evidence-extract-1';
  const expectedPlanIdentity = {
    organizationId: authority.organizationId,
    workspaceId: authority.workspaceId,
    sourceId,
    sourceVersionId,
    requestHash: receipt.request_hash,
  };
  let routePlan = readEvidenceExtractionRoutePlan(receipt.execution_plan || {}, expectedPlanIdentity);
  let route: Awaited<ReturnType<typeof resolveRoute>> | null = null;
  if (routePlan) {
    if (typeof payload.providerConfigId === 'string' && payload.providerConfigId !== routePlan.providerConfigId) {
      throw new EnterpriseCommandError('IDEMPOTENCY_CONFLICT');
    }
  } else {
    route = await resolveRoute(
      authority,
      'assess.evidence.extract',
      typeof payload.providerConfigId === 'string' ? payload.providerConfigId : undefined,
    );
    routePlan = {
      jobId,
      ...expectedPlanIdentity,
      capability: 'assess.evidence.extract',
      routeId: route.config.route_id,
      providerConfigId: route.config.id,
      provider: route.config.provider,
      model: route.model,
      endpointIdentity: route.config.endpoint_url || null,
      deploymentIdentity: route.config.deployment_name || null,
      promptKey,
      promptVersion,
    };
    await ensureExecutionPlan(receipt, authority, routePlan);
    routePlan = readEvidenceExtractionRoutePlan(receipt.execution_plan || {}, expectedPlanIdentity);
    if (!routePlan) throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  const claimStarted = Date.now();
  let claim: EvidenceExtractionClaim;
  try {
    claim = await rpc<EvidenceExtractionClaim>('enterprise_claim_or_resume_evidence_extraction_job_v2', {
      p_job_id: jobId,
      p_receipt: receipt.id,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_actor: authority.actorId,
      p_source_id: sourceId,
      p_source_version_id: sourceVersionId,
      p_route_id: routePlan.routeId,
      p_provider_config_id: routePlan.providerConfigId,
      p_provider: routePlan.provider,
      p_capability: 'assess.evidence.extract',
      p_model: routePlan.model,
      p_endpoint_identity: routePlan.endpointIdentity,
      p_deployment_identity: routePlan.deploymentIdentity,
      p_prompt_key: promptKey,
      p_prompt_version: promptVersion,
      p_request_hash: receipt.request_hash,
      p_execution_token: receipt.execution_token,
      p_execution_fence: receipt.execution_fence,
    });
  } catch (error) {
    if (isSupabaseRpcTransportError(error)) throw new RecoverableEnterpriseCommandError('COMMAND_UNAVAILABLE');
    const mapped = isSupabaseRpcError(error)
      ? mapEnterpriseCommandRpcError(error)
      : new EnterpriseCommandError('COMMAND_UNAVAILABLE');
    if (mapped.code === 'COMMAND_IN_PROGRESS') throw new RecoverableEnterpriseCommandError('COMMAND_IN_PROGRESS');
    throw mapped;
  }
  if (claim.state === 'committed' && isRecord(claim.safeResult)) return claim.safeResult;
  if (claim.state === 'failed' || claim.state === 'blocked') throw new EnterpriseCommandError('COMMAND_BLOCKED');
  if (!claim.ownsExecution || claim.jobId !== jobId) throw new RecoverableEnterpriseCommandError('COMMAND_IN_PROGRESS');
  if (claim.state === 'staged') {
    if (!isRecord(claim.safeResult)) throw new EnterpriseCommandError('RESOURCE_STALE');
    await commitStagedEvidenceExtraction(authority, receipt, jobId);
    return claim.safeResult;
  }
  try {
    route ||= await resolveRoute(
      authority,
      'assess.evidence.extract',
      routePlan.providerConfigId,
      { routeId: routePlan.routeId, model: routePlan.model },
    );
    if (!extractionRouteMatchesPlan(routePlan, {
      routeId: route.config.route_id,
      providerConfigId: route.config.id,
      provider: route.config.provider,
      model: route.model,
      endpointIdentity: route.config.endpoint_url,
      deploymentIdentity: route.config.deployment_name,
    })) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  } catch (error) {
    const terminalError = error instanceof EnterpriseCommandError ? error : new EnterpriseCommandError('COMMAND_BLOCKED');
    await failEvidenceExtractionAttempt(authority, receipt, jobId, claimStarted, terminalError, 'EXTRACTION_ROUTE_BLOCKED');
    throw terminalError;
  }
  let text: string;
  try {
    assertSourceUploadsBucket(version.storage_bucket);
    const bytes = new Uint8Array(await (await downloadStoredFile({ orgId: authority.organizationId, workspaceId: authority.workspaceId, bucket: version.storage_bucket, storagePath: version.storage_path })).arrayBuffer());
    if (await sha256Hex(bytes) !== version.content_hash) throw new EnterpriseCommandError('RESOURCE_STALE');
    text = await extractEvidenceText(bytes, source.mime_type);
    if (version.extracted_text_hash && await sha256Hex(text) !== version.extracted_text_hash) throw new EnterpriseCommandError('RESOURCE_STALE');
    if (!text) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  } catch (error) {
    const terminalError = error instanceof EnterpriseCommandError ? error : new EnterpriseCommandError('COMMAND_BLOCKED');
    await failEvidenceExtractionAttempt(authority, receipt, jobId, claimStarted, terminalError, 'SOURCE_DECODE_FAILED');
    throw terminalError;
  }
  const requestStarted = Date.now();
  let providerResult: Awaited<ReturnType<typeof runGovernedProviderRequest>>;
  try {
    providerResult = await runGovernedProviderRequest({
      provider: routePlan.provider,
      endpoint: route.config.endpoint_url || undefined,
      deployment: route.config.deployment_name || undefined,
      model: routePlan.model,
      capability: 'assess.evidence.extract',
      taskInstruction: `Extract candidate evidence as JSON with a candidates array. Each item must have fieldKey from ${EVIDENCE_CANDIDATE_FIELDS.join(', ')}, value, sourceLocator, confidence between 0 and 1, and safeExcerpt. Do not infer missing facts; use unresolved_questions or assumptions when needed.`,
      untrustedSource: text,
      authorization: {
        organizationId: authority.organizationId,
        workspaceId: authority.workspaceId,
        actorId: authority.actorId,
        providerConfigId: routePlan.providerConfigId,
        capability: 'assess.evidence.extract',
        routeEnabled: true,
        resolverDecision: route.decision,
      },
    });
  } catch (error) {
    const terminalError = new EnterpriseCommandError('COMMAND_BLOCKED');
    const failureClass = error instanceof EnterpriseAiGatewayError ? error.code : 'PROVIDER_REQUEST_FAILED';
    await failEvidenceExtractionAttempt(authority, receipt, jobId, requestStarted, terminalError, failureClass);
    throw terminalError;
  }
  let candidates: ReturnType<typeof buildEvidenceCandidate>[];
  try {
    const decoded = parseJsonObjectResponse<{ candidates?: unknown[] }>(providerResult.output, (value): value is { candidates?: unknown[] } => (
      isRecord(value) && (value.candidates === undefined || Array.isArray(value.candidates))
    ));
    const rawCandidates = Array.isArray(decoded.candidates) ? decoded.candidates.slice(0, 200) : [];
    candidates = [];
    for (const raw of rawCandidates) {
      if (!isRecord(raw)) continue;
      const field = raw.fieldKey;
      if (typeof field !== 'string' || !EVIDENCE_CANDIDATE_FIELDS.includes(field as any)) continue;
      if (typeof raw.value !== 'string' || !raw.value.trim() || typeof raw.sourceLocator !== 'string') continue;
      const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0;
      if (confidence < 0 || confidence > 1) continue;
      const candidate = await buildGroundedEvidenceCandidate({
        source: {
          sourceId,
          sourceVersionId,
          contentHash: version.content_hash,
          extractedTextHash: version.extracted_text_hash || await sha256Hex(text),
          text,
        },
        candidate: {
          id: crypto.randomUUID(),
          sourceId,
          sourceVersionId,
          field: field as EvidenceCandidateField,
          value: raw.value.slice(0, 12_000),
          safeExcerpt: typeof raw.safeExcerpt === 'string' ? raw.safeExcerpt : undefined,
          sourceLocator: raw.sourceLocator.slice(0, 400),
          confidence,
          aiJobId: jobId,
          promptVersion,
          status: 'suggested',
          reviewedBy: undefined,
          reviewedAt: undefined,
        },
      });
      if (!candidate) continue;
      candidates.push(candidate);
    }
  } catch {
    const terminalError = new EnterpriseCommandError('COMMAND_BLOCKED');
    await failEvidenceExtractionAttempt(authority, receipt, jobId, requestStarted, terminalError, 'PROVIDER_RESPONSE_INVALID');
    throw terminalError;
  }
  const safeResult = { resourceId: jobId, jobId, sourceId, sourceVersionId, candidateCount: candidates.length, candidates };
  const outputHash = await sha256Hex(providerResult.output);
  const tokenInput = Math.max(1, Math.ceil(text.length / 4));
  const tokenOutput = Math.max(1, Math.ceil(providerResult.output.length / 4));
  const latencyMs = Math.max(0, Date.now() - requestStarted);
  const stagedCandidates = candidates.map(candidate => ({
    id: candidate.id,
    sourceVersionId: candidate.sourceVersionId,
    field: candidate.field,
    value: candidate.value,
    safeExcerpt: candidate.safeExcerpt || null,
    excerptHash: candidate.excerptHash,
    sourceLocator: candidate.sourceLocator,
    confidence: candidate.confidence,
    promptVersion: candidate.promptVersion,
    status: candidate.status,
    createdBy: authority.actorId,
  }));
  const stagedPayloadHash = await sha256Json({
    jobId, receiptId: receipt.id, requestHash: receipt.request_hash,
    routeId: routePlan.routeId, providerConfigId: routePlan.providerConfigId,
    provider: routePlan.provider, model: routePlan.model, sourceId, sourceVersionId,
    outputHash, tokenInput, tokenOutput, latencyMs, candidates: stagedCandidates, safeResult,
    executionFence: receipt.execution_fence,
  });
  try {
    await rpc('enterprise_stage_evidence_extraction_result', {
      p_job_id: jobId,
      p_receipt: receipt.id,
      p_source_id: sourceId,
      p_source_version_id: sourceVersionId,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_route_id: routePlan.routeId,
      p_provider_config_id: routePlan.providerConfigId,
      p_provider: routePlan.provider,
      p_model: routePlan.model,
      p_request_hash: receipt.request_hash,
      p_output_hash: outputHash,
      p_latency_ms: latencyMs,
      p_token_input: tokenInput,
      p_token_output: tokenOutput,
      p_candidates: stagedCandidates,
      p_result: safeResult,
      p_staged_payload_hash: stagedPayloadHash,
      p_execution_token: receipt.execution_token,
      p_execution_fence: receipt.execution_fence,
    });
  } catch (error) {
    // Staging may have committed even when its response was lost. Never turn
    // this uncertainty into a terminal provider failure.
    throw mapExtractionPersistenceError(error);
  }
  await commitStagedEvidenceExtraction(authority, receipt, jobId);
  return safeResult;
};

const commandEvidenceCandidateReview = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'evidence.review');
  const candidateId = requireUuid(payload.candidateId);
  const status = payload.status;
  if (status !== 'accepted' && status !== 'rejected' && status !== 'edited') throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const current = await findOne<{ id: string; value: string; source_version_id: string; safe_excerpt?: string | null; source_locator: string; excerpt_hash: string }>(
    'enterprise_evidence_candidates',
    `select=id,value,source_version_id,safe_excerpt,source_locator,excerpt_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(candidateId)}`,
  );
  if (!current) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  const sourceVersion = await findOne<{ content_hash: string; extracted_text_hash?: string | null }>(
    'enterprise_evidence_source_versions',
    `select=content_hash,extracted_text_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(current.source_version_id)}`,
  );
  if (!sourceVersion) throw new EnterpriseCommandError('RESOURCE_STALE');
  const nextValue = status === 'edited' ? requireString(payload.value, 12_000) : current.value;
  const reason = status === 'edited' ? requireString(payload.reason, 2_000) : 'review decision recorded';
  const nextExcerptHash = await sha256Hex(JSON.stringify({
    sourceVersionId: current.source_version_id,
    sourceContentHash: sourceVersion.content_hash,
    extractedTextHash: sourceVersion.extracted_text_hash || null,
    sourceLocator: current.source_locator,
    safeExcerpt: current.safe_excerpt || null,
    value: nextValue,
  }));
  const result = { resourceId: candidateId, candidateId, status, reviewedBy: authority.actorId };
  await rpc('enterprise_review_evidence_candidate', {
    p_candidate_id: candidateId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_value: nextValue,
    p_excerpt_hash: nextExcerptHash,
    p_status: status,
    p_actor: authority.actorId,
    p_previous_value: current.value,
    p_reason: reason,
    ...receiptMutationArgs(receipt, result),
  });
  return result;
};

const commandEvidenceAssessPromote = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'assessment.edit');
  const sourceId = requireUuid(payload.sourceId);
  const assessDraftId = requireUuid(payload.assessDraftId);
  const candidateIds = requireUuidArray(payload.candidateIds);
  const [cases, candidates] = await Promise.all([
    postgrest<Array<{ id: string; version: number }>>(
      `assess_v2_cases?select=id,version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(assessDraftId)}&status=eq.draft&deleted_at=is.null&limit=1`,
      { method: 'GET' },
    ),
    postgrest<Array<{ id: string; version: number; provenance_hash: string }>>(
      `enterprise_evidence_candidates?select=id,version,provenance_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&source_id=eq.${encodeURIComponent(sourceId)}&id=in.(${candidateIds.map(encodeURIComponent).join(',')})&suggestion_status=in.(accepted,edited)&order=created_at.asc`,
      { method: 'GET' },
    ),
  ]);
  if (cases.length !== 1 || cases[0].id !== assessDraftId || !Number.isSafeInteger(cases[0].version) || cases[0].version < 1) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  if (candidates.length !== candidateIds.length
    || candidates.some(candidate => !candidateIds.includes(candidate.id) || !/^[0-9a-f]{64}$/.test(candidate.provenance_hash))) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const promotionCandidates = candidateIds.map(candidateId => {
    const candidate = candidateById.get(candidateId);
    if (!candidate || !Number.isSafeInteger(candidate.version) || candidate.version < 1) {
      throw new EnterpriseCommandError('COMMAND_BLOCKED');
    }
    return {
      candidateId: candidate.id,
      expectedVersion: candidate.version,
      provenanceHash: candidate.provenance_hash,
    };
  });
  const plannedStartVersion = Number(receipt.execution_plan?.promotionStartVersion);
  const expectedCandidateIds = [...candidateIds].sort();
  if (Array.isArray(receipt.execution_plan?.promotionCandidateIds)
    && JSON.stringify(receipt.execution_plan?.promotionCandidateIds) !== JSON.stringify(expectedCandidateIds)) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  if (Array.isArray(receipt.execution_plan?.promotionCandidates)
    && JSON.stringify(receipt.execution_plan.promotionCandidates) !== JSON.stringify(promotionCandidates)) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  const promotionStartVersion = Number.isSafeInteger(plannedStartVersion) && plannedStartVersion > 0
    ? plannedStartVersion
    : cases[0].version;
  await ensureExecutionPlan(receipt, authority, {
    promotionSourceId: sourceId,
    promotionStartVersion,
    promotionCandidateIds: expectedCandidateIds,
    promotionCandidates,
  });
  const response = await rpc<{
    resourceId?: string;
    sourceId?: string;
    assessDraftId?: string;
    startVersion?: number;
    finalVersion?: number;
    candidateIds?: string[];
    promotedCandidateCount?: number;
    promotionIds?: string[];
    assessDraftVersionLabel?: string;
    status?: string;
  }>('enterprise_promote_evidence_batch_to_assess_v2', {
    p_source: sourceId,
    p_candidates: promotionCandidates,
    p_case: cases[0].id,
    p_expected_version: promotionStartVersion,
    p_actor: authority.actorId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_authorization_version: authority.authorizationVersion,
    p_receipt: receipt.id,
    p_execution_token: receipt.execution_token,
    p_execution_fence: receipt.execution_fence,
  });
  const expectedFinalVersion = promotionStartVersion + promotionCandidates.length;
  if (response?.resourceId !== assessDraftId
    || response?.sourceId !== sourceId || response?.assessDraftId !== assessDraftId
    || response?.startVersion !== promotionStartVersion || response?.finalVersion !== expectedFinalVersion
    || response?.promotedCandidateCount !== promotionCandidates.length || response?.status !== 'promoted'
    || JSON.stringify(response?.candidateIds) !== JSON.stringify(candidateIds)
    || !Array.isArray(response?.promotionIds) || response.promotionIds.length !== promotionCandidates.length
    || response.promotionIds.some(id => typeof id !== 'string' || !uuidPattern.test(id))) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  return response;
};

const assertApprovedApplicationAssessment = async (authority: Authority, payload: JsonObject) => {
  const applicationId = requireUuid(payload.applicationId);
  const row = await findOne<{
    id: string;
    application_id: string;
    metadata_version_id: string;
    version: number;
    lifecycle: string;
    reviewer_id?: string | null;
    receipt_id?: string | null;
    audit_event_id?: string | null;
  }>(
    'assess_application_assessment_versions',
    `select=id,application_id,metadata_version_id,version,lifecycle,reviewer_id,receipt_id,audit_event_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&application_id=eq.${encodeURIComponent(applicationId)}&order=version.desc`,
  );
  if (!row || row.lifecycle !== 'approved' || !row.reviewer_id || !row.receipt_id || !row.audit_event_id) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  const review = await findOne<{ reviewer_id: string; resolution: string; receipt_id: string; audit_event_id: string }>(
    'assess_application_review_resolutions',
    `select=reviewer_id,resolution,receipt_id,audit_event_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&application_id=eq.${encodeURIComponent(applicationId)}&metadata_version_id=eq.${encodeURIComponent(row.metadata_version_id)}&reviewer_id=eq.${encodeURIComponent(row.reviewer_id)}&receipt_id=eq.${encodeURIComponent(row.receipt_id)}&audit_event_id=eq.${encodeURIComponent(row.audit_event_id)}&resolution=eq.approved`,
  );
  if (!review || review.reviewer_id !== row.reviewer_id || review.reviewer_id === authority.actorId) {
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  const reviewer = await resolveAuthority(review.reviewer_id, authority.organizationId, authority.workspaceId);
  if (!reviewer.permissions.has('assess.applications.review') && !reviewer.isAdmin) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  return row;
};

type CanonicalDimensionRow = {
  dimension: string;
  readiness_band: string;
  evidence_confidence?: string;
  hard_gates?: string[];
  missing_evidence?: string[];
};

const canonicalBand = (row: CanonicalDimensionRow | undefined): ModernizationFactors[keyof ModernizationFactors] => {
  if (!row || row.evidence_confidence === 'Insufficient Evidence' || (row.missing_evidence?.length || 0) > 0) return 'unknown';
  if (row.readiness_band === 'Ready') return 'high';
  if (row.readiness_band === 'Conditionally Ready') return 'medium';
  if (row.readiness_band === 'Blocked') return 'low';
  return 'unknown';
};

const deriveModernizationFactors = async (authority: Authority, assessment: { id: string; application_id: string; metadata_version_id: string }) => {
  const [dimensions, recommendation, metadata, upstream, downstream] = await Promise.all([
    postgrest<CanonicalDimensionRow[]>(`assess_application_dimension_results?select=dimension,readiness_band,evidence_confidence,hard_gates,missing_evidence&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&assessment_version_id=eq.${encodeURIComponent(assessment.id)}`, { method: 'GET' }),
    findOne<{ disposition: string }>('assess_application_modernization_recommendations', `select=disposition&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&assessment_version_id=eq.${encodeURIComponent(assessment.id)}&application_id=eq.${encodeURIComponent(assessment.application_id)}&metadata_version_id=eq.${encodeURIComponent(assessment.metadata_version_id)}`),
    findOne<{ metadata: JsonObject }>('assess_application_metadata_versions', `select=metadata&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(assessment.metadata_version_id)}&application_id=eq.${encodeURIComponent(assessment.application_id)}`),
    postgrest<Array<{ id: string }>>(`assess_application_dependencies?select=id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&downstream_application_id=eq.${encodeURIComponent(assessment.application_id)}&metadata_version_id=eq.${encodeURIComponent(assessment.metadata_version_id)}`, { method: 'GET' }),
    postgrest<Array<{ id: string }>>(`assess_application_dependencies?select=id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&upstream_application_id=eq.${encodeURIComponent(assessment.application_id)}&metadata_version_id=eq.${encodeURIComponent(assessment.metadata_version_id)}`, { method: 'GET' }),
  ]);
  const byDimension = new Map(dimensions.map(row => [row.dimension, row]));
  const sourceMetadata = metadata?.metadata || {};
  const criticality = sourceMetadata.businessCriticality === 'mission_critical' || sourceMetadata.businessCriticality === 'high'
    ? 'high'
    : sourceMetadata.businessCriticality === 'medium'
      ? 'medium'
      : sourceMetadata.businessCriticality === 'low'
        ? 'low'
        : 'unknown';
  const disposition = recommendation?.disposition || '';
  const fit = disposition.includes('Enable native') ? 'high' : disposition.includes('Insufficient') || disposition.includes('Blocked') ? 'unknown' : 'medium';
  const factors: ModernizationFactors = {
    criticality,
    fit,
    ux: canonicalBand(byDimension.get('ui_automation_readiness')),
    techHealth: canonicalBand(byDimension.get('architecture_changeability')),
    maintainability: canonicalBand(byDimension.get('architecture_changeability')),
    architecture: canonicalBand(byDimension.get('architecture_changeability')),
    securityCompliance: canonicalBand(byDimension.get('security_and_control')),
    dataPortability: canonicalBand(byDimension.get('semantic_and_data_clarity')),
    apiIntegration: canonicalBand(byDimension.get('integration_accessibility')),
    cloudFit: 'unknown',
    agentFit: canonicalBand(byDimension.get('ai_assisted_engineering_readiness')),
    vendorLockIn: 'unknown',
    costTco: 'unknown',
    operatingRisk: canonicalBand(byDimension.get('state_and_execution')),
    skills: 'unknown',
    changeEffort: 'unknown',
    timeToValue: 'unknown',
    dependencyRisk: upstream.length + downstream.length > 0 ? 'medium' : 'low',
  };
  return { factors, sourceDecisionModelVersion: 'assess-v2-application-portfolio-2026-07' };
};

const commandModernizationEvaluate = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'portfolio.manage');
  const assessment = await assertApprovedApplicationAssessment(authority, payload);
  const { factors, sourceDecisionModelVersion } = await deriveModernizationFactors(authority, assessment);
  const decision = evaluateModernizationDecision({
    assessmentId: assessment.id,
    assessmentVersion: String(assessment.version),
    factors,
  });
  const modernizationAssessmentId = plannedUuid(receipt, 'modernizationAssessmentId');
  const decisionId = plannedUuid(receipt, 'modernizationDecisionId');
  await ensureExecutionPlan(receipt, authority, { modernizationAssessmentId, modernizationDecisionId: decisionId });
  const proposedResult = { resourceId: decisionId, modernizationAssessmentId, decisionId, decision };
  const result = await rpc<JsonObject>('enterprise_commit_modernization_assessment', {
    p_assessment: {
      id: modernizationAssessmentId,
      org_id: authority.organizationId,
      workspace_id: authority.workspaceId,
      application_ref: assessment.application_id,
      application_version: assessment.version,
      source_assessment_id: assessment.id,
      source_assessment_version: assessment.version,
      source_metadata_version_id: assessment.metadata_version_id,
      factor_bands: decision.factorBands,
      model_version: decision.modelVersion,
      source_decision_model_version: sourceDecisionModelVersion,
      status: 'review',
      created_by: authority.actorId,
    },
    p_decision: {
      id: decisionId,
      org_id: authority.organizationId,
      workspace_id: authority.workspaceId,
      primary_disposition: decision.primaryDisposition,
      alternative_disposition: decision.alternativeDisposition || null,
      eligible_dispositions: decision.eligibleDispositions,
      blockers: decision.blockers,
      conflicts: decision.conflicts,
      status: 'review',
      created_by: authority.actorId,
    },
    ...receiptMutationArgs(receipt, proposedResult),
  });
  const canonicalDecision = isRecord(result?.decision) ? result.decision : null;
  if (result?.resourceId !== decisionId
    || result?.decisionId !== decisionId
    || result?.modernizationAssessmentId !== modernizationAssessmentId
    || !canonicalDecision
    || canonicalDecision.assessmentId !== assessment.id
    || canonicalDecision.assessmentVersion !== String(assessment.version)
    || canonicalDecision.modelVersion !== 'modernization-disposition-1'
    || typeof canonicalDecision.primaryDisposition !== 'string'
    || !MODERNIZATION_DISPOSITIONS.includes(canonicalDecision.primaryDisposition as ModernizationDisposition)
    || !Array.isArray(canonicalDecision.eligibleDispositions)
    || !canonicalDecision.eligibleDispositions.includes(canonicalDecision.primaryDisposition)) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  return result;
};

const approvalResourceTypes = new Set([
  'evidence_candidate', 'modernization_decision', 'delivery_work_package',
  'monitor_baseline', 'assemble_blueprint',
]);

const requireApprovalResourceType = (value: unknown) => {
  const resourceType = requireString(value, 80);
  if (!approvalResourceTypes.has(resourceType)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return resourceType;
};

type CanonicalReviewAuthority = {
  resourceType: string;
  resourceId: string;
  resourceCreatedBy: string;
  resourceVersion: number;
  resourceHash: string;
  resourceStatus: string;
  reviewEventId: string;
  reviewerId: string;
  reviewerAuthorizationVersion: number;
};

const readCanonicalReviewAuthority = (value: unknown): CanonicalReviewAuthority => {
  if (!isRecord(value)
    || typeof value.resourceType !== 'string'
    || typeof value.resourceId !== 'string' || !uuidPattern.test(value.resourceId)
    || typeof value.resourceCreatedBy !== 'string' || !uuidPattern.test(value.resourceCreatedBy)
    || !Number.isSafeInteger(value.resourceVersion) || Number(value.resourceVersion) < 1
    || typeof value.resourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.resourceHash)
    || typeof value.resourceStatus !== 'string'
    || typeof value.reviewEventId !== 'string' || !uuidPattern.test(value.reviewEventId)
    || typeof value.reviewerId !== 'string' || !uuidPattern.test(value.reviewerId)
    || !Number.isSafeInteger(value.reviewerAuthorizationVersion) || Number(value.reviewerAuthorizationVersion) < 1) {
    throw new EnterpriseCommandError('COMMAND_UNAVAILABLE');
  }
  return value as unknown as CanonicalReviewAuthority;
};

const readCanonicalReviewResult = (value: unknown, expected: { resourceType: string; resourceId: string; reviewEventId: string }) => {
  if (!isRecord(value)
    || value.resourceType !== expected.resourceType
    || value.resourceId !== expected.resourceId
    || value.reviewEventId !== expected.reviewEventId
    || typeof value.reviewerId !== 'string' || !uuidPattern.test(value.reviewerId)
    || !Number.isSafeInteger(value.reviewerAuthorizationVersion)
    || !Number.isSafeInteger(value.resourceVersion)
    || typeof value.resourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.resourceHash)
    || value.outcome !== 'approved') throw new EnterpriseCommandError('COMMAND_UNAVAILABLE');
  return value;
};

const readCanonicalApprovalResult = (value: unknown, expected: { resourceType: string; resourceId: string; reviewEventId: string; approvedBy: string }) => {
  if (!isRecord(value)
    || value.resourceType !== expected.resourceType
    || value.resourceId !== expected.resourceId
    || value.reviewEventId !== expected.reviewEventId
    || value.approvedBy !== expected.approvedBy
    || typeof value.reviewedBy !== 'string' || !uuidPattern.test(value.reviewedBy)
    || typeof value.approvalId !== 'string' || !uuidPattern.test(value.approvalId)
    || !Number.isSafeInteger(value.resourceVersion)
    || typeof value.resourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.resourceHash)
    || (value.status !== 'approved' && value.status !== 'rejected')) {
    throw new EnterpriseCommandError('COMMAND_UNAVAILABLE');
  }
  return value;
};

const commandApprovalReviewRecord = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'approvals.review');
  const resourceType = requireApprovalResourceType(payload.resourceType);
  const resourceId = requireUuid(payload.resourceId);
  const rationale = requireString(payload.rationale, 4_000);
  const reviewEventId = plannedUuid(receipt, 'reviewEventId');
  await ensureExecutionPlan(receipt, authority, { reviewEventId });
  const result = await rpc<JsonObject>('enterprise_record_high_impact_review_v2', {
    p_event_id: reviewEventId,
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_actor: authority.actorId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_authorization_version: authority.authorizationVersion,
    p_rationale: rationale,
    p_receipt: receipt.id,
    p_execution_token: receipt.execution_token,
    p_execution_fence: receipt.execution_fence,
  });
  return readCanonicalReviewResult(result, { resourceType, resourceId, reviewEventId });
};

const commandApprovalRecord = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'approvals.review');
  const resourceType = requireApprovalResourceType(payload.resourceType);
  const resourceId = requireUuid(payload.resourceId);
  const approvedBy = authority.actorId;
  const rationale = requireString(payload.rationale, 4_000);
  const outcome = payload.outcome;
  if (outcome !== 'approved' && outcome !== 'rejected') throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const reviewAuthority = readCanonicalReviewAuthority(await rpc<JsonObject>(
    'enterprise_resolve_high_impact_review_authority', {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_actor: approvedBy,
      p_org: authority.organizationId,
      p_workspace: authority.workspaceId,
      p_authorization_version: authority.authorizationVersion,
    },
  ));
  if (reviewAuthority.resourceType !== resourceType || reviewAuthority.resourceId !== resourceId) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  const result = await rpc<JsonObject>('enterprise_commit_high_impact_approval_v2', {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_actor: approvedBy,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_authorization_version: authority.authorizationVersion,
    p_review_event_id: reviewAuthority.reviewEventId,
    p_outcome: outcome,
    p_rationale: rationale,
    p_receipt: receipt.id,
    p_execution_token: receipt.execution_token,
    p_execution_fence: receipt.execution_fence,
  });
  return readCanonicalApprovalResult(result, {
    resourceType, resourceId, reviewEventId: reviewAuthority.reviewEventId, approvedBy,
  });
};

type StudioAggregateRow = {
  id: string;
  artifact_type: 'brd' | 'frd' | 'pdd';
  current_approved_version_id: string | null;
  lifecycle: string;
};
type StudioVersionRow = { id: string; version: number; content: JsonObject; content_hash: string; lifecycle: string };

const extractStudioSections = (content: JsonObject, artifactType: string) => {
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const mapped = sections.flatMap((section, index) => {
    if (!isRecord(section)) return [];
    const title = typeof section.title === 'string' ? section.title : `${artifactType} section ${index + 1}`;
    const summary = typeof section.content === 'string' ? section.content.slice(0, 4_000) : JSON.stringify(section).slice(0, 4_000);
    return [{ locator: `${artifactType}.sections.${index + 1}`, title, summary }];
  });
  return mapped.length ? mapped : [{ locator: `${artifactType}.root`, title: `${artifactType.toUpperCase()} handoff`, summary: 'Review the approved Studio document content and define governed delivery work.' }];
};

const commandStudioDeliveryHandoff = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'docs.approve');
  const studioDocumentId = requireUuid(payload.studioDocumentId);
  const aggregate = await findOne<StudioAggregateRow>(
    'studio_artifact_aggregates',
    `select=id,artifact_type,current_approved_version_id,lifecycle&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(studioDocumentId)}`,
  );
  if (!aggregate || !aggregate.current_approved_version_id || aggregate.lifecycle !== 'approved') throw new EnterpriseCommandError('RESOURCE_STALE');
  const version = await findOne<StudioVersionRow>(
    'studio_artifact_versions',
    `select=id,version,content,content_hash,lifecycle&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(aggregate.current_approved_version_id)}&artifact_id=eq.${encodeURIComponent(studioDocumentId)}`,
  );
  if (!version || version.id !== aggregate.current_approved_version_id || version.lifecycle !== 'approved') {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  const approvedDocument = {
    documentId: studioDocumentId,
    version: version.version,
    contentHash: version.content_hash,
    artifactType: aggregate.artifact_type,
    lifecycle: 'approved' as const,
  };
  const workPackageId = plannedUuid(receipt, 'workPackageId');
  const draft = buildDeliveryWorkPackageDraft({
    packageId: workPackageId,
    approvedDocument,
    currentApprovedDocument: approvedDocument,
    sourceSections: extractStudioSections(version.content, aggregate.artifact_type),
  });
  const handoffId = plannedUuid(receipt, 'handoffId');
  const handoffRecord = {
    id: handoffId,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    studio_document_id: studioDocumentId,
    studio_version_id: version.id,
    studio_version: version.version,
    studio_content_hash: version.content_hash,
    artifact_type: aggregate.artifact_type,
    source_status: 'approved',
    source_snapshot: { artifactType: aggregate.artifact_type, version: version.version, contentHash: version.content_hash, sectionCount: draft.items.length },
    status: draft.status === 'draft' ? 'draft' : 'blocked',
    created_by: authority.actorId,
  };
  const packageRecord = {
    id: workPackageId,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    handoff_id: handoffId,
    current_version: 1,
    status: draft.status,
    created_by: authority.actorId,
  };
  const packageVersionId = plannedUuid(receipt, 'packageVersionId');
  const plannedItemIds = Array.isArray(receipt.execution_plan?.deliveryItemIds)
    ? receipt.execution_plan.deliveryItemIds.filter((value): value is string => typeof value === 'string' && uuidPattern.test(value))
    : [];
  if (plannedItemIds.length && plannedItemIds.length !== draft.items.length) throw new EnterpriseCommandError('RESOURCE_STALE');
  const stableItemIds = plannedItemIds.length ? plannedItemIds : draft.items.map(() => crypto.randomUUID());
  await ensureExecutionPlan(receipt, authority, {
    handoffId,
    workPackageId,
    packageVersionId,
    deliveryItemIds: stableItemIds,
  });
  const itemIds = new Map<string, string>();
  draft.items.forEach((item, index) => itemIds.set(item.id, stableItemIds[index]));
  const persistedItems = await Promise.all(draft.items.map(async item => ({
    ...item,
    id: itemIds.get(item.id) || item.id,
    parentId: item.parentId ? itemIds.get(item.parentId) || undefined : undefined,
    idempotencyKey: await sha256Json({ packageVersionId, itemId: item.id, source: item.sourceSectionLocator }),
    createdBy: authority.actorId,
  })));
  const packageContent = {
    ...draft,
    items: persistedItems,
    idempotencyKey: await sha256Json({ studioDocumentId, studioVersion: version.version, studioContentHash: version.content_hash, sections: extractStudioSections(version.content, aggregate.artifact_type) }),
  };
  const versionRecord = {
    id: packageVersionId,
    work_package_id: workPackageId,
    org_id: authority.organizationId,
    workspace_id: authority.workspaceId,
    version: 1,
    studio_document_id: studioDocumentId,
    artifact_type: aggregate.artifact_type,
    studio_version_id: version.id,
    studio_version: version.version,
    studio_content_hash: version.content_hash,
    content: packageContent,
    content_hash: await sha256Json(packageContent),
    status: draft.status,
    created_by: authority.actorId,
  };
  const result = { resourceId: workPackageId, handoffId, workPackageId, packageVersionId, itemIds: Array.from(itemIds.values()), source: approvedDocument, status: draft.status, itemCount: draft.items.length, requiresHumanReview: true };
  await rpc('enterprise_commit_delivery_handoff', {
    p_handoff: handoffRecord,
    p_package: packageRecord,
    p_version: versionRecord,
    p_items: persistedItems,
    ...receiptMutationArgs(receipt, result),
  });
  return result;
};

type PackageVersionRow = {
  id: string;
  work_package_id: string;
  studio_document_id: string;
  artifact_type: 'brd' | 'frd' | 'pdd';
  studio_version: number;
  studio_content_hash: string;
  content: JsonObject;
  status: string;
};

const commandMonitorBaselineCreate = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requirePermission(authority, 'monitor.manage');
  const workPackageId = requireUuid(payload.workPackageId);
  const packageAggregate = await findOne<{ id: string; current_version: number; status: string }>(
    'enterprise_delivery_work_packages',
    `select=id,current_version,status&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(workPackageId)}`,
  );
  if (!packageAggregate) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  if (packageAggregate.status !== 'approved') throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const version = await findOne<PackageVersionRow>(
    'enterprise_delivery_work_package_versions',
    `select=id,work_package_id,studio_document_id,artifact_type,studio_version,studio_content_hash,content,status&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&work_package_id=eq.${encodeURIComponent(workPackageId)}&version=eq.${packageAggregate.current_version}`,
  );
  if (!version) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  if (version.status !== 'approved') throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const packageVersionId = version.id;
  const itemRows = await postgrest<Array<{
    id: string;
    item_type: string;
    title: string;
    description: string;
    acceptance_criteria: unknown;
    non_functional_requirements: unknown;
    source_section_locator: string;
  }>>(
    `enterprise_delivery_work_items?select=id,item_type,title,description,acceptance_criteria,non_functional_requirements,source_section_locator&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&package_version_id=eq.${encodeURIComponent(packageVersionId)}`,
    { method: 'GET' },
  );
  const workPackageDraft = {
    idempotencyKey: stableFingerprint(packageVersionId),
    source: { documentId: version.studio_document_id, version: version.studio_version, contentHash: version.studio_content_hash, artifactType: version.artifact_type, lifecycle: 'approved' as const },
    status: 'draft' as const,
    items: itemRows.map(item => ({
      id: item.id,
      itemType: item.item_type as any,
      title: item.title,
      description: item.description,
      acceptanceCriteria: Array.isArray(item.acceptance_criteria) ? item.acceptance_criteria.filter((value): value is string => typeof value === 'string') : [],
      nonFunctionalRequirements: Array.isArray(item.non_functional_requirements) ? item.non_functional_requirements.filter((value): value is string => typeof value === 'string') : [],
      sourceSectionLocator: item.source_section_locator,
      sourceDocumentId: version.studio_document_id,
      sourceDocumentVersion: version.studio_version,
      sourceDocumentHash: version.studio_content_hash,
    })),
    blockers: [],
    requiresHumanReview: true as const,
    canPublish: false as const,
  };
  const baselineId = plannedUuid(receipt, 'monitorBaselineId');
  await ensureExecutionPlan(receipt, authority, { monitorBaselineId: baselineId, workPackageId, packageVersionId });
  const baseline = buildMonitorBaseline({ id: baselineId, workPackageId: version.work_package_id, workPackage: workPackageDraft, approvedItemIds: itemRows.map(item => item.id) });
  const result = { ...baseline, resourceId: baseline.id };
  await rpc('enterprise_commit_monitor_baseline', {
    p_baseline: {
      id: baseline.id,
      workPackageVersionId: packageVersionId,
      approvedItemIds: baseline.approvedItemIds,
      milestones: baseline.milestones,
      dependencies: baseline.dependencies,
      blockers: baseline.blockers,
      risks: baseline.risks,
    },
    p_actor: authority.actorId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    ...receiptMutationArgs(receipt, result as unknown as JsonObject),
  });
  return result;
};

const commandAssembleBlueprintCreate = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow): Promise<AssembleBlueprintDraft & { resourceId: string }> => {
  requirePermission(authority, 'assemble.manage');
  const decisionId = requireUuid(payload.modernizationDecisionId);
  const decision = await findOne<{ id: string; primary_disposition: ModernizationDisposition; status: string }>(
    'enterprise_modernization_decisions',
    `select=id,primary_disposition,status&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(decisionId)}`,
  );
  if (!decision || decision.status !== 'approved' || !ASSEMBLE_ELIGIBLE_DISPOSITIONS.includes(decision.primary_disposition)) throw new EnterpriseCommandError('COMMAND_BLOCKED');
  const blueprintId = plannedUuid(receipt, 'assembleBlueprintId');
  await ensureExecutionPlan(receipt, authority, { assembleBlueprintId: blueprintId, modernizationDecisionId: decision.id });
  const blueprint = buildAssembleBlueprintDraft({
    blueprintId,
    modernizationDecisionId: decision.id,
    disposition: decision.primary_disposition,
    name: requireString(payload.name, 240),
  });
  const result = { ...blueprint, resourceId: blueprint.id };
  await rpc('enterprise_commit_assemble_blueprint', {
    p_blueprint: { ...blueprint, structuredContent: blueprint },
    p_actor: authority.actorId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    ...receiptMutationArgs(receipt, result as unknown as JsonObject),
  });
  return result;
};

const executeEnterpriseCommand = async (authority: Authority, envelope: EnterpriseCommandEnvelope, receipt: EnterpriseReceiptRow) => {
  const providerOperation = enterpriseProviderOperations[envelope.commandType];
  if (providerOperation) {
    assertEnterpriseCommandOperationAuthority(authority, envelope.commandType);
  } else {
    await assertFreshAuthority(authority, requiredCapabilitiesForEnterpriseCommand(envelope.commandType));
  }
  switch (envelope.commandType) {
    case 'provider.register': return commandProviderLifecycle('provider.register', authority, envelope.payload, receipt);
    case 'provider.validate': return commandProviderLifecycle('provider.validate', authority, envelope.payload, receipt);
    case 'provider.activate': return commandProviderLifecycle('provider.activate', authority, envelope.payload, receipt);
    case 'provider.route.toggle': return commandProviderLifecycle('provider.route.toggle', authority, envelope.payload, receipt);
    case 'provider.revoke': return commandProviderLifecycle('provider.revoke', authority, envelope.payload, receipt);
    case 'evidence.source.create': return commandEvidenceSourceCreate(authority, envelope.payload, receipt);
    case 'evidence.extract': return commandEvidenceExtract(authority, envelope.payload, receipt);
    case 'evidence.candidate.review': return commandEvidenceCandidateReview(authority, envelope.payload, receipt);
    case 'evidence.assess.promote': return commandEvidenceAssessPromote(authority, envelope.payload, receipt);
    case 'modernization.evaluate': return commandModernizationEvaluate(authority, envelope.payload, receipt);
    case 'approval.review.record': return commandApprovalReviewRecord(authority, envelope.payload, receipt);
    case 'approval.record': return commandApprovalRecord(authority, envelope.payload, receipt);
    case 'studio.delivery.handoff': return commandStudioDeliveryHandoff(authority, envelope.payload, receipt);
    case 'monitor.baseline.create': return commandMonitorBaselineCreate(authority, envelope.payload, receipt);
    case 'assemble.blueprint.create': return commandAssembleBlueprintCreate(authority, envelope.payload, receipt);
  }
};

export const enterpriseCommandErrorBody = (error: EnterpriseCommandError) => ({
  ok: false,
  error: { code: error.code, message: 'The Enterprise Intelligence command could not be completed.' },
});

export type EnterpriseIntelligenceHandlerOverrides = {
  authenticate?: typeof getAuthUser;
  resolveOrganization?: typeof resolveOrgId;
  resolveCommandAuthority?: typeof resolveAuthority;
  assertCurrentAuthority?: typeof assertCurrentEnterpriseCommandAuthority;
  claimReceipt?: typeof claimEnterpriseReceipt;
  reloadReceipt?: typeof reloadEnterpriseReceipt;
  completeReceipt?: typeof completeEnterpriseReceipt;
  failReceipt?: typeof failEnterpriseReceipt;
  executeCommand?: typeof executeEnterpriseCommand;
};

const assertCommittedEnterpriseReceiptIdentity = (
  receipt: EnterpriseReceiptRow,
  commandType: EnterpriseCommandType,
) => {
  if (receipt.status !== 'committed' || !isRecord(receipt.response)) {
    throw new EnterpriseCommandError('RECEIPT_FINALIZATION_FAILED');
  }
  const resourceId = resolveEnterpriseCommandResourceId(commandType, receipt.response);
  if (receipt.resource_id !== resourceId) {
    throw new EnterpriseCommandError('RECEIPT_FINALIZATION_FAILED');
  }
  return resourceId;
};

export const handleEnterpriseIntelligenceRequest = async (
  request: Request,
  overrides: EnterpriseIntelligenceHandlerOverrides = {},
) => {
  if (request.method !== 'POST') return jsonResponse(enterpriseCommandErrorBody(new EnterpriseCommandError('METHOD_NOT_ALLOWED')), 405);
  const assertCurrentAuthority = overrides.assertCurrentAuthority || assertCurrentEnterpriseCommandAuthority;
  const executeCommand = overrides.executeCommand || executeEnterpriseCommand;
  const completeReceipt = overrides.completeReceipt || completeEnterpriseReceipt;
  const failReceipt = overrides.failReceipt || failEnterpriseReceipt;
  let claimedReceipt: EnterpriseReceiptRow | null = null;
  let claimedAuthority: Authority | null = null;
  let claimedCommandType: EnterpriseCommandType | null = null;
  try {
    const user = await (overrides.authenticate || getAuthUser)(request);
    const body = await request.json();
    const envelope = parseEnterpriseCommandEnvelope(body);
    const organizationId = await (overrides.resolveOrganization || resolveOrgId)(user.id, envelope.organizationId);
    if (organizationId !== envelope.organizationId) throw new EnterpriseCommandError('TENANT_ACCESS_DENIED');
    const resolvedAuthority = await (overrides.resolveCommandAuthority || resolveAuthority)(
      user.id, organizationId, envelope.workspaceId,
    );
    const authority = await assertCurrentAuthority(resolvedAuthority, envelope.commandType);
    const { requestId: _transportRequestId, ...canonicalEnvelope } = envelope;
    const requestHash = await hashReceiptValue(canonicalEnvelope);
    const resourceType = envelope.commandType === 'approval.review.record' || envelope.commandType === 'approval.record'
      ? requireString(envelope.payload.resourceType, 80)
      : null;
    const { receipt, ownsExecution } = await (overrides.claimReceipt || claimEnterpriseReceipt)(authority, {
      commandType: envelope.commandType,
      idempotencyKey: envelope.idempotencyKey,
      requestId: envelope.requestId,
      requestHash,
      resourceType,
    });
    const disclosureAuthority = await assertCurrentAuthority(authority, envelope.commandType);
    if (receipt.status === 'committed') {
      assertCommittedEnterpriseReceiptIdentity(receipt, envelope.commandType);
      return jsonResponse({ ok: true, replayed: true, ...(receipt.response || {}) });
    }
    if (receipt.status === 'failed' || receipt.status === 'blocked') {
      return jsonResponse(
        { ...(receipt.response || enterpriseCommandErrorBody(new EnterpriseCommandError('COMMAND_BLOCKED'))), replayed: true },
        enterpriseCommandStatusForTerminalReceipt(receipt),
      );
    }
    if (receipt.status !== 'claimed' || !ownsExecution) throw new EnterpriseCommandError('COMMAND_IN_PROGRESS');
    claimedReceipt = receipt;
    claimedAuthority = disclosureAuthority;
    claimedCommandType = envelope.commandType;
    const result = await executeCommand(disclosureAuthority, envelope, receipt);
    const resultObject: JsonObject = isRecord(result) ? result : { result };
    const resourceId = resolveEnterpriseCommandResourceId(envelope.commandType, resultObject);
    const finalAuthority = await assertCurrentAuthority(disclosureAuthority, envelope.commandType);
    claimedAuthority = finalAuthority;
    const completed = await completeReceipt(
      receipt,
      finalAuthority,
      resultObject,
      resourceId,
      async () => {
        const reconciliationAuthority = await assertCurrentAuthority(finalAuthority, envelope.commandType);
        claimedAuthority = reconciliationAuthority;
        return reconciliationAuthority;
      },
    );
    assertCommittedEnterpriseReceiptIdentity(completed, envelope.commandType);
    claimedAuthority = await assertCurrentAuthority(finalAuthority, envelope.commandType);
    return jsonResponse({ ok: true, replayed: false, ...(completed.response || resultObject) });
  } catch (error) {
    const commandError = error instanceof EnterpriseCommandError
      ? error
      : error instanceof EnterpriseReceiptError
        ? new EnterpriseCommandError(error.code)
        : isSupabaseRpcError(error)
          ? mapEnterpriseCommandRpcError(error)
          : new EnterpriseCommandError('COMMAND_UNAVAILABLE');
    if (claimedReceipt && claimedAuthority && claimedCommandType) {
      try {
        claimedAuthority = await assertCurrentAuthority(claimedAuthority, claimedCommandType);
        const recovered = await (overrides.reloadReceipt || reloadEnterpriseReceipt)(claimedReceipt, claimedAuthority);
        if (recovered.status === 'committed') {
          claimedAuthority = await assertCurrentAuthority(claimedAuthority, claimedCommandType);
          assertCommittedEnterpriseReceiptIdentity(recovered, claimedCommandType);
          return jsonResponse({ ok: true, replayed: true, ...(recovered.response || {}) });
        }
        if (recovered.status === 'failed' || recovered.status === 'blocked') {
          claimedAuthority = await assertCurrentAuthority(claimedAuthority, claimedCommandType);
          return jsonResponse(
            { ...(recovered.response || enterpriseCommandErrorBody(commandError)), replayed: true },
            enterpriseCommandStatusForTerminalReceipt(recovered),
          );
        }
      } catch (recoveryError) {
        if (recoveryError instanceof EnterpriseCommandError && recoveryError.code === 'PERMISSION_DENIED') {
          const denied = new EnterpriseCommandError('PERMISSION_DENIED');
          return jsonResponse(enterpriseCommandErrorBody(denied), denied.status);
        }
        if (commandError.code === 'RECEIPT_FINALIZATION_FAILED') {
          try {
            claimedAuthority = await assertCurrentAuthority(claimedAuthority, claimedCommandType);
          } catch {
            const denied = new EnterpriseCommandError('PERMISSION_DENIED');
            return jsonResponse(enterpriseCommandErrorBody(denied), denied.status);
          }
          return jsonResponse(enterpriseCommandErrorBody(commandError), commandError.status);
        }
      }
    }
    if (claimedReceipt && claimedAuthority && claimedCommandType && commandError.code !== 'RECEIPT_FINALIZATION_FAILED') {
      try {
        claimedAuthority = await assertCurrentAuthority(claimedAuthority, claimedCommandType);
      } catch {
        const denied = new EnterpriseCommandError('PERMISSION_DENIED');
        return jsonResponse(enterpriseCommandErrorBody(denied), denied.status);
      }
      if (shouldPreserveClaimedEnterpriseReceipt(error, claimedReceipt.execution_plan)) {
        return jsonResponse(enterpriseCommandErrorBody(commandError), commandError.status);
      }
      try {
        await failReceipt(
          claimedReceipt,
          claimedAuthority,
          enterpriseCommandErrorBody(commandError),
          commandError.code === 'PERMISSION_DENIED' || commandError.code === 'TENANT_ACCESS_DENIED' || commandError.code === 'COMMAND_BLOCKED',
          async () => {
            const reconciliationAuthority = await assertCurrentAuthority(claimedAuthority!, claimedCommandType);
            claimedAuthority = reconciliationAuthority;
            return reconciliationAuthority;
          },
        );
        claimedAuthority = await assertCurrentAuthority(claimedAuthority, claimedCommandType);
      } catch (finalizationError) {
        if (finalizationError instanceof EnterpriseCommandError
          && finalizationError.code === 'PERMISSION_DENIED') {
          const denied = new EnterpriseCommandError('PERMISSION_DENIED');
          return jsonResponse(enterpriseCommandErrorBody(denied), denied.status);
        }
        const explicitFailure = new EnterpriseCommandError(
          finalizationError instanceof EnterpriseReceiptError ? finalizationError.code : 'RECEIPT_FINALIZATION_FAILED',
        );
        return jsonResponse(enterpriseCommandErrorBody(explicitFailure), explicitFailure.status);
      }
    }
    return jsonResponse(enterpriseCommandErrorBody(commandError), commandError.status);
  }
};

export const handleEnterpriseIntelligenceOptions = (request: Request) => handleOptions(request);
