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
  isUnicodeScalarString,
  isSupportedEvidenceMimeType,
  sanitizeEvidenceCandidateValue,
  sanitizeEvidenceExcerpt,
  stableFingerprint,
  type AssembleBlueprintDraft,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type EnterpriseEvidenceCandidate,
  type EvidenceCandidateField,
  type ModernizationFactors,
  type ModernizationDisposition,
  type SupportedEvidenceMimeType,
} from '../../../services/enterpriseIntelligence.ts';
import {
  EnterpriseAiGatewayError,
  classifyEnterpriseProviderFailureForBudget,
  estimateMaximumProviderInputTokens,
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
import { EVIDENCE_SOURCE_BUCKET } from './storageBoundary.ts';
import { ProviderBudgetError, runBudgetedProviderEffect } from './providerBudget.ts';

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
  | 'transcript.source-set.create-version'
  | 'transcript.input-bundle.lock'
  | 'transcript.assess.extract'
  | 'transcript.assess.candidate.review'
  | 'transcript.assess.apply.preview'
  | 'transcript.assess.apply.commit'
  | 'transcript.assess.conflict.resolve'
  | 'transcript.journey.set-state'
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
      | 'SOURCE_SET_LIMIT_EXCEEDED'
      | 'SOURCE_VERSION_NOT_READY'
      | 'CONFLICT_UNRESOLVED'
      | 'BUDGET_EXHAUSTED'
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
  if (supabaseRpcErrorHasSignal(error, 'ENTERPRISE_TRANSCRIPT_SOURCE_SET_LIMIT_EXCEEDED')) {
    return new EnterpriseCommandError('SOURCE_SET_LIMIT_EXCEEDED');
  }
  if (supabaseRpcErrorHasSignal(error, 'ENTERPRISE_TRANSCRIPT_SOURCE_VERSION_NOT_READY')) {
    return new EnterpriseCommandError('SOURCE_VERSION_NOT_READY');
  }
  if (supabaseRpcErrorHasSignal(error, 'ENTERPRISE_TRANSCRIPT_MATERIAL_CONFLICT_UNRESOLVED')) {
    return new EnterpriseCommandError('CONFLICT_UNRESOLVED');
  }
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_TRANSCRIPT_SOURCE_SET_STALE', 'ENTERPRISE_TRANSCRIPT_BUNDLE_STALE',
    'ENTERPRISE_TRANSCRIPT_SOURCE_SET_STALE', 'ENTERPRISE_TRANSCRIPT_JOURNEY_STALE',
    'ENTERPRISE_TRANSCRIPT_CANDIDATE_REVIEW_STALE', 'ENTERPRISE_TRANSCRIPT_CANDIDATE_STALE',
    'ENTERPRISE_TRANSCRIPT_ASSESS_STALE', 'ENTERPRISE_TRANSCRIPT_CONFLICT_STALE',
    'ENTERPRISE_TRANSCRIPT_APPLY_BATCH_STALE', 'ENTERPRISE_TRANSCRIPT_EXTRACTION_BINDING_STALE',
  )) return new EnterpriseCommandError('RESOURCE_STALE');
  if (supabaseRpcErrorHasSignal(error, 'ENTERPRISE_TRANSCRIPT_FEATURE_DISABLED')) {
    return new EnterpriseCommandError('COMMAND_BLOCKED');
  }
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_TRANSCRIPT_INVALID_SOURCE_SET', 'ENTERPRISE_TRANSCRIPT_INVALID_BUNDLE',
    'ENTERPRISE_TRANSCRIPT_INVALID_JOURNEY', 'ENTERPRISE_TRANSCRIPT_CANDIDATE_REVIEW_INVALID',
    'ENTERPRISE_TRANSCRIPT_APPLY_INVALID', 'ENTERPRISE_TRANSCRIPT_CONFLICT_INVALID',
    'ENTERPRISE_TRANSCRIPT_APPLY_BATCH_INVALID', 'ENTERPRISE_TRANSCRIPT_APPLY_BATCH_DUPLICATE_TARGET',
  )) return new EnterpriseCommandError('INVALID_PAYLOAD');
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
  if (code === 'CONFLICT_UNRESOLVED') return 409;
  if (code === 'BUDGET_EXHAUSTED') return 409;
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
  'transcript.source-set.create-version',
  'transcript.input-bundle.lock',
  'transcript.assess.extract',
  'transcript.assess.candidate.review',
  'transcript.assess.apply.preview',
  'transcript.assess.apply.commit',
  'transcript.assess.conflict.resolve',
  'transcript.journey.set-state',
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

const requirePositiveInteger = (value: unknown, allowZero = false) => {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1)) {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return Number(value);
};

const requireSha256 = (value: unknown) => {
  const hash = requireString(value, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return hash;
};

const requireExactPayload = (payload: JsonObject, required: readonly string[], optional: readonly string[] = []) => {
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !(key in payload)) || Object.keys(payload).some(key => !allowed.has(key))) {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return payload;
};

const unsafeFieldPattern = /^(api[_-]?key|provider[_-]?key|secret(value|reference)?|pre[_-]?provisioned[_-]?reference|authorization|auth[_-]?header|bearer[_-]?token|raw[_-]?(key|prompt|completion)|prompt[_-]?body|completion[_-]?body|storage[_-]?path|object[_-]?key|(bundle|manifest|provenance|content|extracted[_-]?text)[_-]?hash|route[_-]?policy[_-]?version)$/i;

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
            : commandType === 'transcript.source-set.create-version'
              ? resultObject.sourceSetId
              : commandType === 'transcript.input-bundle.lock'
                ? resultObject.inputBundleId
                : commandType === 'transcript.assess.extract'
                  ? resultObject.jobId
                  : commandType === 'transcript.assess.candidate.review'
                    ? resultObject.candidateId
                    : commandType === 'transcript.assess.apply.preview'
                      ? resultObject.previewBatchId ?? resultObject.previewId
                      : commandType === 'transcript.assess.apply.commit'
                        ? resultObject.assessDraftId
                        : commandType === 'transcript.assess.conflict.resolve'
                          ? resultObject.conflictId
                          : commandType === 'transcript.journey.set-state'
                            ? resultObject.journeyId
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
    'COMMAND_UNAVAILABLE', 'SOURCE_SET_LIMIT_EXCEEDED', 'SOURCE_VERSION_NOT_READY',
    'CONFLICT_UNRESOLVED', 'BUDGET_EXHAUSTED', 'RECEIPT_FINALIZATION_FAILED',
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
  'transcript.source-set.create-version': ['transcript.sources.manage'],
  'transcript.input-bundle.lock': ['transcript.sources.manage'],
  'transcript.assess.extract': ['evidence.write'],
  'transcript.assess.candidate.review': ['evidence.review'],
  'transcript.assess.apply.preview': ['transcript.assess.apply'],
  'transcript.assess.apply.commit': ['transcript.assess.apply'],
  'transcript.assess.conflict.resolve': ['transcript.assess.apply'],
  'transcript.journey.set-state': ['transcript.journeys.manage'],
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
  storageBucket: typeof EVIDENCE_SOURCE_BUCKET;
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
  if (expected.storageBucket !== EVIDENCE_SOURCE_BUCKET) throw new EnterpriseCommandError('RESOURCE_STALE');
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
  if (expected.storageBucket !== EVIDENCE_SOURCE_BUCKET) throw new EnterpriseCommandError('RESOURCE_STALE');
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
  if (plan.storageBucket !== EVIDENCE_SOURCE_BUCKET) throw new EnterpriseCommandError('RESOURCE_STALE');
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

export const EVIDENCE_SOURCE_LOCATOR_PREFIX = 'normalized-text:v1:chars' as const;

/**
 * Canonical evidence locators are zero-based, half-open Unicode code-point
 * ranges in NFKC/lowercase/whitespace-collapsed source text. The first
 * normalized occurrence wins, so replay never depends on provider position.
 */
export const deriveCanonicalEvidenceSourceLocator = (sourceText: string, persistedExcerpt: string) => {
  const normalizedSource = normalizeEvidenceGroundingText(sourceText);
  const normalizedExcerpt = normalizeEvidenceGroundingText(persistedExcerpt);
  if (!normalizedExcerpt) return null;
  const utf16Start = normalizedSource.indexOf(normalizedExcerpt);
  if (utf16Start < 0) return null;
  const start = Array.from(normalizedSource.slice(0, utf16Start)).length;
  const end = start + Array.from(normalizedExcerpt).length;
  return `${EVIDENCE_SOURCE_LOCATOR_PREFIX}:${start}-${end}` as const;
};

const frameEvidenceAnchorValue = (value: string) => `${new TextEncoder().encode(value).length}:${value}`;

export const hashEvidenceExcerptAnchor = (input: {
  sourceVersionId: string;
  sourceContentHash: string;
  extractedTextHash: string;
  sourceLocator: string;
  safeExcerpt: string;
  value: string;
}) => sha256Hex(`evidence-excerpt-anchor-v1|${[
  input.sourceVersionId,
  input.sourceContentHash,
  input.extractedTextHash,
  input.sourceLocator,
  input.safeExcerpt,
  input.value,
].map(frameEvidenceAnchorValue).join('|')}`);

export type GroundedEvidenceCandidateInput = Omit<
  Parameters<typeof buildEvidenceCandidate>[0],
  'field' | 'sourceLocator'
> & { field: EvidenceCandidateField; sourceLocator?: never };

export const buildGroundedEvidenceCandidate = async (input: {
  source: {
    sourceId: string;
    sourceVersionId: string;
    contentHash: string;
    extractedTextHash: string;
    text: string;
  };
  candidate: GroundedEvidenceCandidateInput;
}) => {
  if (input.candidate.sourceId !== input.source.sourceId
    || input.candidate.sourceVersionId !== input.source.sourceVersionId) return null;
  if (typeof input.candidate.value !== 'string'
    || !isUnicodeScalarString(input.candidate.value)
    || Array.from(input.candidate.value).length > 12_000
    || !input.candidate.value.trim()) return null;
  if (typeof input.candidate.safeExcerpt !== 'string'
    || !isUnicodeScalarString(input.candidate.safeExcerpt)) return null;
  const persistedExcerpt = typeof input.candidate.safeExcerpt === 'string'
    ? sanitizeEvidenceExcerpt(input.candidate.safeExcerpt)
    : '';
  const sourceLocator = deriveCanonicalEvidenceSourceLocator(input.source.text, persistedExcerpt);
  if (!sourceLocator) return null;
  const candidate: EnterpriseEvidenceCandidate = {
    ...input.candidate,
    safeExcerpt: persistedExcerpt,
    // Runtime excess properties are ignored as well: this final assignment is
    // the only locator authority even if an older provider still emits one.
    sourceLocator,
    excerptHash: stableFingerprint(`${input.candidate.sourceVersionId}:${sourceLocator}:${persistedExcerpt}`),
    editCount: 0,
  };
  candidate.excerptHash = await hashEvidenceExcerptAnchor({
    sourceVersionId: input.source.sourceVersionId,
    sourceContentHash: input.source.contentHash,
    extractedTextHash: input.source.extractedTextHash,
    sourceLocator: candidate.sourceLocator,
    safeExcerpt: candidate.safeExcerpt,
    value: candidate.value,
  });
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

type TranscriptExtractionBinding = TranscriptExtractionSelection;

const commandEvidenceExtract = async (
  authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow,
  transcriptBinding?: TranscriptExtractionBinding,
) => {
  requirePermission(authority, 'evidence.write');
  const sourceId = requireUuid(payload.sourceId);
  const source = await findOne<{ id: string; mime_type: SupportedEvidenceMimeType; status: string; current_version: number }>(
    'enterprise_evidence_sources',
    `select=id,mime_type,status,current_version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceId)}&deleted_at=is.null`,
  );
  if (!source || !source.mime_type || !Number.isSafeInteger(source.current_version)) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  const version = await findOne<EvidenceVersionRow>(
    'enterprise_evidence_source_versions',
    `select=id,source_id,version,original_filename,storage_bucket,storage_path,content_hash,extracted_text_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&source_id=eq.${encodeURIComponent(sourceId)}&${transcriptBinding ? `id=eq.${encodeURIComponent(transcriptBinding.sourceVersionId)}` : `version=eq.${source.current_version}`}`,
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
    await ensureExecutionPlan(receipt, authority, {
      ...routePlan,
      ...(transcriptBinding ? {
        transcriptInputBundleId: transcriptBinding.inputBundleId,
        transcriptInputBundleVersionId: transcriptBinding.inputBundleVersionId,
        transcriptInputBundleVersion: transcriptBinding.bundleVersion,
        transcriptBundleHash: transcriptBinding.bundleHash,
        transcriptSourceSetId: transcriptBinding.sourceSetId,
        transcriptSourceSetVersionId: transcriptBinding.sourceSetVersionId,
        transcriptSourceSetVersion: transcriptBinding.sourceSetVersion,
      } : {}),
    });
    routePlan = readEvidenceExtractionRoutePlan(receipt.execution_plan || {}, expectedPlanIdentity);
    if (!routePlan) throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  if (transcriptBinding && (
    receipt.execution_plan?.transcriptInputBundleId !== transcriptBinding.inputBundleId
    || receipt.execution_plan?.transcriptInputBundleVersionId !== transcriptBinding.inputBundleVersionId
    || receipt.execution_plan?.transcriptInputBundleVersion !== transcriptBinding.bundleVersion
    || receipt.execution_plan?.transcriptBundleHash !== transcriptBinding.bundleHash
    || receipt.execution_plan?.transcriptSourceSetId !== transcriptBinding.sourceSetId
    || receipt.execution_plan?.transcriptSourceSetVersionId !== transcriptBinding.sourceSetVersionId
    || receipt.execution_plan?.transcriptSourceSetVersion !== transcriptBinding.sourceSetVersion
  )) throw new EnterpriseCommandError('RESOURCE_STALE');
  const claimStarted = Date.now();
  let claim: EvidenceExtractionClaim;
  const extractionClaimArgs = {
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
  };
  try {
    claim = await rpc<EvidenceExtractionClaim>('enterprise_claim_or_resume_evidence_extraction_job_v2', extractionClaimArgs);
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
  if (transcriptBinding) {
    await rpc('enterprise_transcript_bind_assess_extraction_v2', {
      p_job: jobId, p_input_bundle: transcriptBinding.inputBundleId,
      p_input_bundle_version: transcriptBinding.inputBundleVersionId,
      p_expected_input_bundle_version: transcriptBinding.bundleVersion,
      p_source_set: transcriptBinding.sourceSetId, p_source_set_version: transcriptBinding.sourceSetVersionId,
      p_expected_source_set_version: transcriptBinding.sourceSetVersion,
      p_source: sourceId, p_source_version: sourceVersionId,
      p_route: routePlan.routeId, p_provider_config: routePlan.providerConfigId, p_model: routePlan.model,
      p_actor: authority.actorId, p_org: authority.organizationId, p_workspace: authority.workspaceId,
      p_authorization_version: authority.authorizationVersion, p_receipt: receipt.id,
      p_execution_token: receipt.execution_token, p_execution_fence: receipt.execution_fence,
    });
  }
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
  const taskInstruction = `Extract candidate evidence as JSON with a candidates array. Each item must have fieldKey from ${EVIDENCE_CANDIDATE_FIELDS.join(', ')}, value, confidence between 0 and 1, and safeExcerpt. Do not infer missing facts; use unresolved_questions or assumptions when needed. AvalaOS derives source positions server-side.`;
  let stagedSafeResult: JsonObject | null = null;
  try {
    const budgeted = await runBudgetedProviderEffect({
      authority: {
        actorId: authority.actorId, organizationId: authority.organizationId,
        workspaceId: authority.workspaceId, authorizationVersion: authority.authorizationVersion,
      },
      execution: {
        receiptId: receipt.id, jobId, executionToken: receipt.execution_token!, executionFence: receipt.execution_fence!,
        routeId: routePlan.routeId, providerConfigId: routePlan.providerConfigId, provider: routePlan.provider,
        capability: 'assess.evidence.extract', model: routePlan.model,
      },
      estimatedInputTokens: estimateMaximumProviderInputTokens({
        capability: 'assess.evidence.extract', taskInstruction, untrustedSource: text,
      }),
      maximumOutputTokens: 4_096,
    }, () => runGovernedProviderRequest({
      provider: routePlan.provider, endpoint: route.config.endpoint_url || undefined,
      deployment: route.config.deployment_name || undefined, model: routePlan.model,
      capability: 'assess.evidence.extract',
      taskInstruction,
      untrustedSource: text,
      authorization: {
        organizationId: authority.organizationId, workspaceId: authority.workspaceId, actorId: authority.actorId,
        providerConfigId: routePlan.providerConfigId, capability: 'assess.evidence.extract', routeEnabled: true,
        resolverDecision: route.decision,
      },
    }), {
      classifyFailure: classifyEnterpriseProviderFailureForBudget,
      beforeSettle: async providerResult => {
        const decoded = parseJsonObjectResponse<{ candidates?: unknown[] }>(providerResult.output, (value): value is { candidates?: unknown[] } => (
          isRecord(value) && (value.candidates === undefined || Array.isArray(value.candidates))
        ));
        const candidates: ReturnType<typeof buildEvidenceCandidate>[] = [];
        for (const raw of Array.isArray(decoded.candidates) ? decoded.candidates.slice(0, 200) : []) {
          if (!isRecord(raw)) continue;
          const field = raw.fieldKey;
          if (typeof field !== 'string' || !EVIDENCE_CANDIDATE_FIELDS.includes(field as EvidenceCandidateField)
            || typeof raw.value !== 'string' || !raw.value.trim()) continue;
          let persistedValue: string;
          try { persistedValue = sanitizeEvidenceCandidateValue(raw.value); } catch { continue; }
          const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0;
          if (!persistedValue.trim() || confidence < 0 || confidence > 1) continue;
          const candidate = await buildGroundedEvidenceCandidate({
            source: {
              sourceId, sourceVersionId, contentHash: version.content_hash,
              extractedTextHash: version.extracted_text_hash || await sha256Hex(text), text,
            },
            candidate: {
              id: crypto.randomUUID(), sourceId, sourceVersionId, field: field as EvidenceCandidateField,
              value: persistedValue, safeExcerpt: typeof raw.safeExcerpt === 'string' ? raw.safeExcerpt : undefined,
              confidence, aiJobId: jobId, promptVersion, status: 'suggested', reviewedBy: undefined, reviewedAt: undefined,
            },
          });
          if (candidate) candidates.push(candidate);
        }
        const safeResult = { resourceId: jobId, jobId,
          sourceId, sourceVersionId,
          ...(transcriptBinding ? {
            inputBundleId: transcriptBinding.inputBundleId,
            inputBundleVersionId: transcriptBinding.inputBundleVersionId,
            sourceSetId: transcriptBinding.sourceSetId,
            sourceSetVersionId: transcriptBinding.sourceSetVersionId,
          } : {}),
          candidateCount: candidates.length, candidates,
        };
        const outputHash = await sha256Hex(providerResult.output);
        const latencyMs = Math.max(0, Date.now() - requestStarted);
        const stagedCandidates = candidates.map(candidate => ({
          id: candidate.id, sourceVersionId: candidate.sourceVersionId, field: candidate.field, value: candidate.value,
          safeExcerpt: candidate.safeExcerpt || null, excerptHash: candidate.excerptHash, sourceLocator: candidate.sourceLocator,
          confidence: candidate.confidence, promptVersion: candidate.promptVersion, status: candidate.status, createdBy: authority.actorId,
        }));
        const stagedPayloadHash = await sha256Json({
          jobId, receiptId: receipt.id, requestHash: receipt.request_hash,
          routeId: routePlan.routeId, providerConfigId: routePlan.providerConfigId,
          provider: routePlan.provider, model: routePlan.model, sourceId, sourceVersionId,
          outputHash, tokenInput: providerResult.usage.inputTokens, tokenOutput: providerResult.usage.outputTokens,
          latencyMs, candidates: stagedCandidates, safeResult, executionFence: receipt.execution_fence,
        });
        await rpc('enterprise_stage_evidence_extraction_result', {
          p_job_id: jobId, p_receipt: receipt.id, p_source_id: sourceId, p_source_version_id: sourceVersionId,
          p_org: authority.organizationId, p_workspace: authority.workspaceId, p_route_id: routePlan.routeId,
          p_provider_config_id: routePlan.providerConfigId, p_provider: routePlan.provider, p_model: routePlan.model,
          p_request_hash: receipt.request_hash, p_output_hash: outputHash, p_latency_ms: latencyMs,
          p_token_input: providerResult.usage.inputTokens, p_token_output: providerResult.usage.outputTokens,
          p_candidates: stagedCandidates, p_result: safeResult, p_staged_payload_hash: stagedPayloadHash,
          p_execution_token: receipt.execution_token, p_execution_fence: receipt.execution_fence,
        });
        stagedSafeResult = safeResult;
      },
    });
    if (budgeted.kind === 'replay') {
      const recovered = await rpc<EvidenceExtractionClaim>('enterprise_claim_or_resume_evidence_extraction_job_v2', extractionClaimArgs);
      if (recovered.state === 'committed' && isRecord(recovered.safeResult)) return recovered.safeResult;
      if (recovered.state === 'staged' && isRecord(recovered.safeResult)) {
        await commitStagedEvidenceExtraction(authority, receipt, jobId);
        return recovered.safeResult;
      }
      throw new RecoverableEnterpriseCommandError('COMMAND_IN_PROGRESS');
    }
  } catch (error) {
    if (error instanceof RecoverableEnterpriseCommandError) throw error;
    if (error instanceof ProviderBudgetError) {
      if (error.code === 'BUDGET_EXHAUSTED') throw new EnterpriseCommandError('BUDGET_EXHAUSTED');
      if (error.code === 'AUTHORIZATION_STALE') throw new RecoverableEnterpriseCommandError('AUTHORIZATION_STALE');
      if (error.code === 'PERMISSION_DENIED') throw new EnterpriseCommandError('PERMISSION_DENIED');
      throw new RecoverableEnterpriseCommandError('COMMAND_UNAVAILABLE');
    }
    const terminalError = new EnterpriseCommandError('COMMAND_BLOCKED');
    const failureClass = error instanceof EnterpriseAiGatewayError ? error.code : 'PROVIDER_REQUEST_FAILED';
    await failEvidenceExtractionAttempt(authority, receipt, jobId, requestStarted, terminalError, failureClass);
    throw terminalError;
  }
  if (!stagedSafeResult) throw new RecoverableEnterpriseCommandError('COMMAND_UNAVAILABLE');
  await commitStagedEvidenceExtraction(authority, receipt, jobId);
  return stagedSafeResult;
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
  if (!sourceVersion || !sourceVersion.extracted_text_hash) throw new EnterpriseCommandError('RESOURCE_STALE');
  let nextValue = current.value;
  if (status === 'edited') {
    if (typeof payload.value !== 'string' || !payload.value.trim()) {
      throw new EnterpriseCommandError('INVALID_PAYLOAD');
    }
    try {
      nextValue = sanitizeEvidenceCandidateValue(payload.value.trim());
    } catch {
      throw new EnterpriseCommandError('INVALID_PAYLOAD');
    }
  }
  const reason = status === 'edited' ? requireString(payload.reason, 2_000) : 'review decision recorded';
  const nextExcerptHash = await hashEvidenceExcerptAnchor({
    sourceVersionId: current.source_version_id,
    sourceContentHash: sourceVersion.content_hash,
    extractedTextHash: sourceVersion.extracted_text_hash,
    sourceLocator: current.source_locator,
    safeExcerpt: current.safe_excerpt || '',
    value: nextValue,
  });
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
    evidenceLinkIds?: string[];
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
    || response.promotionIds.some(id => typeof id !== 'string' || !uuidPattern.test(id))
    || new Set(response.promotionIds).size !== promotionCandidates.length
    || !Array.isArray(response?.evidenceLinkIds) || response.evidenceLinkIds.length !== promotionCandidates.length
    || response.evidenceLinkIds.some(id => typeof id !== 'string' || !uuidPattern.test(id))
    || new Set(response.evidenceLinkIds).size !== promotionCandidates.length) {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  return response;
};

const transcriptReceiptArgs = (authority: Authority, receipt: EnterpriseReceiptRow) => ({
  p_actor: authority.actorId,
  p_org: authority.organizationId,
  p_workspace: authority.workspaceId,
  p_authorization_version: authority.authorizationVersion,
  p_receipt: receipt.id,
  p_execution_token: receipt.execution_token,
  p_execution_fence: receipt.execution_fence,
});

const commandTranscriptSourceSetCreateVersion = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requireExactPayload(payload, ['ownerModule', 'displayLabel', 'purpose', 'lock', 'expectedVersion', 'items'], ['sourceSetId', 'description']);
  requirePermission(authority, 'transcript.sources.manage');
  const sourceSetId = payload.sourceSetId === undefined ? plannedUuid(receipt, 'transcriptSourceSetId') : requireUuid(payload.sourceSetId);
  await ensureExecutionPlan(receipt, authority, { transcriptSourceSetId: sourceSetId });
  if (payload.ownerModule !== 'assess' && payload.ownerModule !== 'studio') throw new EnterpriseCommandError('INVALID_PAYLOAD');
  if (typeof payload.lock !== 'boolean' || !Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 20) {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  const items = payload.items.map((raw, index) => {
    const item = requirePayloadObject(raw);
    requireExactPayload(item, ['sourceVersionId', 'ordinal', 'role'], ['note']);
    if (!['primary', 'supporting', 'contradictory', 'reference'].includes(String(item.role))
      || requirePositiveInteger(item.ordinal) !== index + 1) throw new EnterpriseCommandError('INVALID_PAYLOAD');
    return {
      sourceVersionId: requireUuid(item.sourceVersionId), ordinal: index + 1, role: item.role,
      ...(item.note === undefined ? {} : { note: requireString(item.note, 1_000) }),
    };
  });
  if (new Set(items.map(item => item.sourceVersionId)).size !== items.length) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const current = await findOne<{ current_version: number }>(
    'enterprise_source_sets',
    `select=current_version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceSetId)}`,
  );
  const plannedCurrentVersion = isRecord(receipt.execution_plan?.transcriptCommandBinding)
    ? receipt.execution_plan?.transcriptCommandBinding.currentVersion
    : undefined;
  if (plannedCurrentVersion !== undefined && plannedCurrentVersion !== (current?.current_version || 0)) throw new EnterpriseCommandError('RESOURCE_STALE');
  const submittedExpectedVersion = requirePositiveInteger(payload.expectedVersion, true);
  if (submittedExpectedVersion !== (current?.current_version || 0)) throw new EnterpriseCommandError('RESOURCE_STALE');
  const label = requireString(payload.displayLabel, 160);
  return await rpc('enterprise_transcript_create_source_set_version', {
    p_source_set: sourceSetId, p_owner_module: payload.ownerModule,
    p_display_label: label,
    p_description: payload.description === undefined ? '' : requireString(payload.description, 2_000),
    p_purpose: requireString(payload.purpose, 1_000), p_items: items, p_lock: payload.lock,
    p_expected_version: submittedExpectedVersion, ...transcriptReceiptArgs(authority, receipt),
  });
};

const commandTranscriptInputBundleLock = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requireExactPayload(payload, ['ownerModule', 'expectedVersion', 'sourceSets'], ['inputBundleId']);
  requirePermission(authority, 'transcript.sources.manage');
  if (payload.ownerModule !== 'assess' || !Array.isArray(payload.sourceSets) || payload.sourceSets.length < 1 || payload.sourceSets.length > 20) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const sourceSets = payload.sourceSets.map((raw, index) => {
    const item = requirePayloadObject(raw); requireExactPayload(item, ['sourceSetVersionId', 'ordinal', 'purpose']);
    if (requirePositiveInteger(item.ordinal) !== index + 1) throw new EnterpriseCommandError('INVALID_PAYLOAD');
    return { sourceSetVersionId: requireUuid(item.sourceSetVersionId), ordinal: index + 1, purpose: requireString(item.purpose, 500) };
  });
  if (new Set(sourceSets.map(item => item.sourceSetVersionId)).size !== sourceSets.length) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const inputBundleId = payload.inputBundleId === undefined ? plannedUuid(receipt, 'transcriptInputBundleId') : requireUuid(payload.inputBundleId);
  await ensureExecutionPlan(receipt, authority, { transcriptInputBundleId: inputBundleId });
  const current = await findOne<{ current_version: number }>(
    'enterprise_module_input_bundles',
    `select=current_version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(inputBundleId)}`,
  );
  const plannedCurrentVersion = isRecord(receipt.execution_plan?.transcriptCommandBinding)
    ? receipt.execution_plan?.transcriptCommandBinding.currentVersion
    : undefined;
  if (plannedCurrentVersion !== undefined && plannedCurrentVersion !== (current?.current_version || 0)) throw new EnterpriseCommandError('RESOURCE_STALE');
  const submittedExpectedVersion = requirePositiveInteger(payload.expectedVersion, true);
  if (submittedExpectedVersion !== (current?.current_version || 0)) throw new EnterpriseCommandError('RESOURCE_STALE');
  return await rpc('enterprise_transcript_lock_input_bundle', {
    p_input_bundle: inputBundleId, p_items: sourceSets, p_manual_brief_hash: null,
    p_expected_version: submittedExpectedVersion, ...transcriptReceiptArgs(authority, receipt),
  });
};

type TranscriptExtractionSelection = {
  inputBundleId: string;
  inputBundleVersionId: string;
  bundleVersion: number;
  bundleHash: string;
  sourceSetId: string;
  sourceSetVersionId: string;
  sourceSetVersion: number;
  sourceId: string;
  sourceVersionId: string;
};

type TranscriptFindOne = <T>(table: string, query: string) => Promise<T | null>;
type TranscriptFindMany = <T>(table: string, query: string) => Promise<T[]>;

const findTranscriptRows: TranscriptFindMany = async <T>(table: string, query: string) => await postgrest<T[]>(
  `${table}?${query}`,
  { method: 'GET' },
);

const resolveTranscriptExtractionSelection = async (
  authority: Authority,
  inputBundleId: string,
  inputBundleVersionId: string,
  expectedInputBundleVersion: number,
  sourceSetId: string,
  sourceSetVersionId: string,
  expectedSourceSetVersion: number,
  sourceVersionId: string,
  findSelection: TranscriptFindOne = findOne,
): Promise<TranscriptExtractionSelection | null> => {
  const version = await findSelection<{ id: string; input_bundle_id: string; version: number; bundle_hash: string }>(
    'enterprise_module_input_bundle_versions',
    `select=id,input_bundle_id,version,bundle_hash&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(inputBundleVersionId)}&input_bundle_id=eq.${encodeURIComponent(inputBundleId)}&version=eq.${expectedInputBundleVersion}&status=eq.locked`,
  );
  const setVersion = version ? await findSelection<{ id: string; source_set_id: string; version: number }>(
    'enterprise_source_set_versions',
    `select=id,source_set_id,version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceSetVersionId)}&source_set_id=eq.${encodeURIComponent(sourceSetId)}&version=eq.${expectedSourceSetVersion}`,
  ) : null;
  const bundleItem = version && setVersion ? await findSelection<{ source_set_version_id: string }>(
    'enterprise_module_input_bundle_items',
    `select=source_set_version_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&input_bundle_version_id=eq.${encodeURIComponent(version.id)}&source_set_id=eq.${encodeURIComponent(sourceSetId)}&source_set_version_id=eq.${encodeURIComponent(setVersion.id)}`,
  ) : null;
  const source = bundleItem ? await findSelection<{ source_id: string }>(
    'enterprise_source_set_version_items',
    `select=source_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&source_version_id=eq.${encodeURIComponent(sourceVersionId)}&source_set_version_id=eq.${encodeURIComponent(sourceSetVersionId)}`,
  ) : null;
  return version && setVersion && bundleItem && source ? {
    inputBundleId: version.input_bundle_id, inputBundleVersionId: version.id, bundleVersion: version.version,
    bundleHash: version.bundle_hash, sourceSetId: setVersion.source_set_id,
    sourceSetVersionId: setVersion.id, sourceSetVersion: setVersion.version,
    sourceId: source.source_id, sourceVersionId,
  } : null;
};

const commandTranscriptAssessExtract = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requireExactPayload(payload, [
    'inputBundleId', 'inputBundleVersionSelector', 'expectedInputBundleVersion',
    'sourceSetId', 'sourceSetVersionSelector', 'expectedSourceSetVersion', 'sourceVersionSelector',
  ]);
  requirePermission(authority, 'evidence.write');
  const inputBundleId = requireUuid(payload.inputBundleId);
  const inputBundleVersionId = requireUuid(payload.inputBundleVersionSelector);
  const expectedInputBundleVersion = requirePositiveInteger(payload.expectedInputBundleVersion);
  const sourceSetId = requireUuid(payload.sourceSetId);
  const sourceSetVersionId = requireUuid(payload.sourceSetVersionSelector);
  const expectedSourceSetVersion = requirePositiveInteger(payload.expectedSourceSetVersion);
  const sourceVersionId = requireUuid(payload.sourceVersionSelector);
  const selection = await resolveTranscriptExtractionSelection(
    authority, inputBundleId, inputBundleVersionId, expectedInputBundleVersion,
    sourceSetId, sourceSetVersionId, expectedSourceSetVersion, sourceVersionId,
  );
  if (!selection) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  const plannedBinding = receipt.execution_plan?.transcriptCommandBinding;
  if (plannedBinding !== undefined && JSON.stringify(plannedBinding) !== JSON.stringify(selection)) throw new EnterpriseCommandError('RESOURCE_STALE');
  return await commandEvidenceExtract(authority, { sourceId: selection.sourceId }, receipt, selection);
};

const commandTranscriptAssessCandidateReview = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requireExactPayload(
    payload,
    [
      'candidateId', 'candidateVersion', 'status',
      'inputBundleId', 'inputBundleVersionSelector', 'expectedInputBundleVersion',
      'sourceSetId', 'sourceSetVersionSelector', 'expectedSourceSetVersion', 'sourceVersionSelector',
    ],
    ['value', 'reason', 'relationship', 'applicationIntent', 'applyTarget'],
  );
  const status = requireString(payload.status, 20);
  const relationship = payload.relationship === undefined ? 'neutral' : requireString(payload.relationship, 20);
  if (!['neutral', 'supporting', 'contradictory'].includes(relationship)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const applicationIntent = payload.applicationIntent === undefined ? null : requireString(payload.applicationIntent, 80);
  const applyTarget = payload.applyTarget === undefined ? null : requireString(payload.applyTarget, 160);
  if ((applicationIntent === null) !== (applyTarget === null)
    || (applicationIntent !== null && !transcriptApplicationIntents.has(applicationIntent))) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  if (!['accepted', 'rejected', 'edited'].includes(status)
    || (status === 'edited' && (payload.value === undefined || payload.reason === undefined))
    || (status !== 'edited' && payload.value !== undefined)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  let value: string | null = null;
  if (payload.value !== undefined) {
    try {
      value = sanitizeEvidenceCandidateValue(requireString(payload.value, 12_000).trim());
    } catch {
      throw new EnterpriseCommandError('INVALID_PAYLOAD');
    }
    if (!value.trim()) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return await rpc('enterprise_transcript_review_assess_candidate_v2', {
    p_candidate: requireUuid(payload.candidateId),
    p_expected_candidate_version: requirePositiveInteger(payload.candidateVersion),
    p_input_bundle: requireUuid(payload.inputBundleId),
    p_input_bundle_version: requireUuid(payload.inputBundleVersionSelector),
    p_expected_input_bundle_version: requirePositiveInteger(payload.expectedInputBundleVersion),
    p_source_set: requireUuid(payload.sourceSetId),
    p_source_set_version: requireUuid(payload.sourceSetVersionSelector),
    p_expected_source_set_version: requirePositiveInteger(payload.expectedSourceSetVersion),
    p_source_version: requireUuid(payload.sourceVersionSelector),
    p_status: status,
    p_value: value,
    p_reason: payload.reason === undefined ? 'review decision recorded' : requireString(payload.reason, 2_000),
    p_relationship: relationship,
    p_application_intent: applicationIntent,
    p_apply_target: applyTarget,
    ...transcriptReceiptArgs(authority, receipt),
  });
};

const transcriptApplicationIntents = new Set([
  'set_case_field', 'create_primitive', 'create_application_asset', 'create_interaction',
  'create_decision_point', 'create_exception_path', 'set_registered_fact', 'link_evidence_only',
]);

const parseTranscriptSourceSetLineage = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const lineage = value.map((raw, index) => {
    const item = requirePayloadObject(raw);
    requireExactPayload(item, ['sourceSetId', 'sourceSetVersionSelector', 'expectedVersion', 'ordinal']);
    if (requirePositiveInteger(item.ordinal) !== index + 1) throw new EnterpriseCommandError('INVALID_PAYLOAD');
    return {
      sourceSetId: requireUuid(item.sourceSetId),
      sourceSetVersionSelector: requireUuid(item.sourceSetVersionSelector),
      expectedVersion: requirePositiveInteger(item.expectedVersion),
      ordinal: index + 1,
    };
  });
  if (new Set(lineage.map(item => item.sourceSetId)).size !== lineage.length
    || new Set(lineage.map(item => item.sourceSetVersionSelector)).size !== lineage.length) {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  return lineage;
};

const assertTranscriptBundleLineagePreclaim = async (
  authority: Authority,
  inputBundleId: string,
  inputBundleVersionId: string,
  expectedInputBundleVersion: number,
  sourceSets: ReturnType<typeof parseTranscriptSourceSetLineage>,
  findLineageOne: TranscriptFindOne = findOne,
  findLineageMany: TranscriptFindMany = findTranscriptRows,
) => {
  const bundle = await findLineageOne<{ input_bundle_id: string; version: number; status: string }>(
    'enterprise_module_input_bundle_versions',
    `select=input_bundle_id,version,status&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(inputBundleVersionId)}`,
  );
  if (!bundle) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
  if (bundle.input_bundle_id !== inputBundleId || bundle.version !== expectedInputBundleVersion || bundle.status !== 'locked') {
    throw new EnterpriseCommandError('RESOURCE_STALE');
  }
  const items = await findLineageMany<{ source_set_id: string; source_set_version_id: string; ordinal: number }>(
    'enterprise_module_input_bundle_items',
    `select=source_set_id,source_set_version_id,ordinal&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&input_bundle_version_id=eq.${encodeURIComponent(inputBundleVersionId)}&order=ordinal.asc`,
  );
  if (items.length !== sourceSets.length) throw new EnterpriseCommandError('RESOURCE_STALE');
  for (const sourceSet of sourceSets) {
    const version = await findLineageOne<{ source_set_id: string; version: number }>(
      'enterprise_source_set_versions',
      `select=source_set_id,version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceSet.sourceSetVersionSelector)}`,
    );
    if (!version) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    const item = items[sourceSet.ordinal - 1];
    if (version.source_set_id !== sourceSet.sourceSetId || version.version !== sourceSet.expectedVersion
      || item?.source_set_id !== sourceSet.sourceSetId
      || item?.source_set_version_id !== sourceSet.sourceSetVersionSelector
      || item?.ordinal !== sourceSet.ordinal) throw new EnterpriseCommandError('RESOURCE_STALE');
  }
};

const commandTranscriptAssessApplyPreview = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requireExactPayload(payload, [
    'assessDraftId', 'expectedDraftVersion', 'inputBundleId', 'inputBundleVersionSelector',
    'expectedInputBundleVersion', 'sourceSetVersions', 'selections',
  ]);
  if (!Array.isArray(payload.selections) || payload.selections.length < 1 || payload.selections.length > 100) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const selections = payload.selections.map(raw => {
    const selection = requirePayloadObject(raw);
    requireExactPayload(selection, ['candidateId', 'candidateVersion', 'intent', 'target']);
    const intent = requireString(selection.intent, 80);
    if (!transcriptApplicationIntents.has(intent)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
    return {
      candidateId: requireUuid(selection.candidateId),
      candidateVersion: requirePositiveInteger(selection.candidateVersion),
      intent,
      target: requireString(selection.target, 160),
    };
  });
  if (new Set(selections.map(selection => selection.candidateId)).size !== selections.length) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  const sourceSetVersions = parseTranscriptSourceSetLineage(payload.sourceSetVersions);
  const previewBatchId = plannedUuid(receipt, 'transcriptApplyPreviewBatchId');
  await ensureExecutionPlan(receipt, authority, { transcriptApplyPreviewBatchId: previewBatchId });
  return await rpc('enterprise_transcript_create_assess_apply_preview_batch_v2', {
    p_batch: previewBatchId, p_case: requireUuid(payload.assessDraftId),
    p_expected_case_version: requirePositiveInteger(payload.expectedDraftVersion),
    p_input_bundle: requireUuid(payload.inputBundleId),
    p_input_bundle_version: requireUuid(payload.inputBundleVersionSelector),
    p_expected_input_bundle_version: requirePositiveInteger(payload.expectedInputBundleVersion),
    p_source_sets: sourceSetVersions,
    p_selections: selections,
    ...transcriptReceiptArgs(authority, receipt),
  });
};

const commandTranscriptAssessApplyCommit = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requireExactPayload(payload, [
    'previewBatchId', 'assessDraftId', 'expectedDraftVersion', 'inputBundleId',
    'inputBundleVersionSelector', 'expectedInputBundleVersion', 'sourceSetVersions',
  ]);
  return await rpc('enterprise_transcript_commit_assess_apply_preview_batch_v2', {
    p_batch: requireUuid(payload.previewBatchId),
    p_case: requireUuid(payload.assessDraftId),
    p_expected_case_version: requirePositiveInteger(payload.expectedDraftVersion),
    p_input_bundle: requireUuid(payload.inputBundleId),
    p_input_bundle_version: requireUuid(payload.inputBundleVersionSelector),
    p_expected_input_bundle_version: requirePositiveInteger(payload.expectedInputBundleVersion),
    p_source_sets: parseTranscriptSourceSetLineage(payload.sourceSetVersions),
    ...transcriptReceiptArgs(authority, receipt),
  });
};

const commandTranscriptAssessConflictResolve = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requireExactPayload(payload, ['conflictId', 'resolutionVersion', 'resolution', 'rationale'], ['candidateId', 'authoredValue']);
  const resolution = requireString(payload.resolution, 40);
  if (!['choose_candidate', 'retain_manual', 'authored_resolution', 'unresolved'].includes(resolution)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return await rpc('enterprise_transcript_resolve_assess_conflict', {
    p_conflict: requireUuid(payload.conflictId), p_expected_version: requirePositiveInteger(payload.resolutionVersion, true), p_resolution: resolution,
    p_chosen_candidate: payload.candidateId === undefined ? null : requireUuid(payload.candidateId),
    p_authored_value: payload.authoredValue === undefined ? null : payload.authoredValue,
    p_rationale: requireString(payload.rationale, 2_000), ...transcriptReceiptArgs(authority, receipt),
  });
};

const commandTranscriptJourneySetState = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow) => {
  requireExactPayload(payload, ['entryModule', 'desiredExitModule', 'status'], ['journeyId', 'expectedVersion', 'reason']);
  requirePermission(authority, 'transcript.journeys.manage');
  if (payload.entryModule !== 'assess' || !['active', 'stopped'].includes(String(payload.status))
    || !['assess', 'studio', 'delivery', 'monitor'].includes(String(payload.desiredExitModule))) {
    throw new EnterpriseCommandError('INVALID_PAYLOAD');
  }
  const journeyId = payload.journeyId === undefined ? plannedUuid(receipt, 'transcriptJourneyId') : requireUuid(payload.journeyId);
  await ensureExecutionPlan(receipt, authority, { transcriptJourneyId: journeyId, transcriptRoutePolicyVersion: 1 });
  const current = await findOne<{ version: number }>(
    'enterprise_governed_journeys',
    `select=version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(journeyId)}`,
  );
  const requestBinding = receipt.execution_plan?.transcriptCommandBinding;
  if (isRecord(requestBinding) && requestBinding.currentVersion !== (current?.version || 0)) throw new EnterpriseCommandError('RESOURCE_STALE');
  const expectedVersion = payload.expectedVersion === undefined ? current?.version || 0 : requirePositiveInteger(payload.expectedVersion, true);
  const action = !current ? 'create' : payload.status === 'stopped' ? 'stop' : 'resume';
  if (action === 'create' && payload.status !== 'active') throw new EnterpriseCommandError('INVALID_PAYLOAD');
  return await rpc('enterprise_transcript_set_journey_state', {
    p_journey: journeyId, p_action: action, p_desired_exit_module: payload.desiredExitModule,
    p_reason: payload.reason === undefined ? '' : requireString(payload.reason, 2_000),
    p_expected_version: expectedVersion,
    p_route_policy_version: isRecord(requestBinding) && Number.isSafeInteger(requestBinding.routePolicyVersion) ? requestBinding.routePolicyVersion : 1,
    ...transcriptReceiptArgs(authority, receipt),
  });
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
    case 'transcript.source-set.create-version': return commandTranscriptSourceSetCreateVersion(authority, envelope.payload, receipt);
    case 'transcript.input-bundle.lock': return commandTranscriptInputBundleLock(authority, envelope.payload, receipt);
    case 'transcript.assess.extract': return commandTranscriptAssessExtract(authority, envelope.payload, receipt);
    case 'transcript.assess.candidate.review': return commandTranscriptAssessCandidateReview(authority, envelope.payload, receipt);
    case 'transcript.assess.apply.preview': return commandTranscriptAssessApplyPreview(authority, envelope.payload, receipt);
    case 'transcript.assess.apply.commit': return commandTranscriptAssessApplyCommit(authority, envelope.payload, receipt);
    case 'transcript.assess.conflict.resolve': return commandTranscriptAssessConflictResolve(authority, envelope.payload, receipt);
    case 'transcript.journey.set-state': return commandTranscriptJourneySetState(authority, envelope.payload, receipt);
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
  transcriptCommandRequestBindingDependencies?: Partial<TranscriptCommandRequestBindingDependencies>;
};

export type TranscriptCommandRequestBindingDependencies = {
  findOne: TranscriptFindOne;
  findMany: TranscriptFindMany;
};

export const deriveTranscriptCommandRequestBinding = async (
  authority: Authority,
  envelope: EnterpriseCommandEnvelope,
  dependencies: Partial<TranscriptCommandRequestBindingDependencies> = {},
): Promise<JsonObject | null> => {
  const findBinding = dependencies.findOne || findOne;
  const findBindingRows = dependencies.findMany || findTranscriptRows;
  if (envelope.commandType === 'transcript.assess.extract') {
    requireExactPayload(envelope.payload, [
      'inputBundleId', 'inputBundleVersionSelector', 'expectedInputBundleVersion',
      'sourceSetId', 'sourceSetVersionSelector', 'expectedSourceSetVersion', 'sourceVersionSelector',
    ]);
    const selection = await resolveTranscriptExtractionSelection(
      authority,
      requireUuid(envelope.payload.inputBundleId),
      requireUuid(envelope.payload.inputBundleVersionSelector),
      requirePositiveInteger(envelope.payload.expectedInputBundleVersion),
      requireUuid(envelope.payload.sourceSetId),
      requireUuid(envelope.payload.sourceSetVersionSelector),
      requirePositiveInteger(envelope.payload.expectedSourceSetVersion),
      requireUuid(envelope.payload.sourceVersionSelector),
      findBinding,
    );
    if (!selection) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    return selection;
  }
  if (envelope.commandType === 'transcript.source-set.create-version') {
    const sourceSetId = envelope.payload.sourceSetId === undefined ? null : requireUuid(envelope.payload.sourceSetId);
    let currentVersion = 0;
    if (sourceSetId) {
      const anywhere = await findBinding<{ org_id: string; workspace_id: string; current_version: number }>(
        'enterprise_source_sets', `select=org_id,workspace_id,current_version&id=eq.${encodeURIComponent(sourceSetId)}`,
      );
      if (!anywhere || anywhere.org_id !== authority.organizationId || anywhere.workspace_id !== authority.workspaceId) {
        throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
      }
      currentVersion = anywhere.current_version;
    }
    const expectedVersion = requirePositiveInteger(envelope.payload.expectedVersion, true);
    if (expectedVersion !== currentVersion) throw new EnterpriseCommandError('RESOURCE_STALE');
    if (!Array.isArray(envelope.payload.items) || envelope.payload.items.length < 1 || envelope.payload.items.length > 20) {
      throw new EnterpriseCommandError('INVALID_PAYLOAD');
    }
    const sourceVersionIds: string[] = [];
    for (const raw of envelope.payload.items) {
      const item = requirePayloadObject(raw);
      const sourceVersionId = requireUuid(item.sourceVersionId);
      const version = await findBinding<{ id: string }>(
        'enterprise_evidence_source_versions',
        `select=id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceVersionId)}`,
      );
      if (!version) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
      sourceVersionIds.push(version.id);
    }
    return { ...(sourceSetId ? { sourceSetId } : {}), currentVersion, sourceVersionIds };
  }
  if (envelope.commandType === 'transcript.input-bundle.lock') {
    const inputBundleId = envelope.payload.inputBundleId === undefined ? null : requireUuid(envelope.payload.inputBundleId);
    let currentVersion = 0;
    if (inputBundleId) {
      const anywhere = await findBinding<{ org_id: string; workspace_id: string; current_version: number }>(
        'enterprise_module_input_bundles', `select=org_id,workspace_id,current_version&id=eq.${encodeURIComponent(inputBundleId)}`,
      );
      if (!anywhere || anywhere.org_id !== authority.organizationId || anywhere.workspace_id !== authority.workspaceId) {
        throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
      }
      currentVersion = anywhere.current_version;
    }
    const expectedVersion = requirePositiveInteger(envelope.payload.expectedVersion, true);
    if (expectedVersion !== currentVersion) throw new EnterpriseCommandError('RESOURCE_STALE');
    if (!Array.isArray(envelope.payload.sourceSets) || envelope.payload.sourceSets.length < 1 || envelope.payload.sourceSets.length > 20) {
      throw new EnterpriseCommandError('INVALID_PAYLOAD');
    }
    const sourceSetVersionIds: string[] = [];
    for (const raw of envelope.payload.sourceSets) {
      const item = requirePayloadObject(raw);
      const sourceSetVersionId = requireUuid(item.sourceSetVersionId);
      const version = await findBinding<{ id: string }>(
        'enterprise_source_set_versions',
        `select=id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(sourceSetVersionId)}`,
      );
      if (!version) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
      sourceSetVersionIds.push(version.id);
    }
    return { ...(inputBundleId ? { inputBundleId } : {}), currentVersion, sourceSetVersionIds };
  }
  if (envelope.commandType === 'transcript.journey.set-state' && envelope.payload.journeyId !== undefined) {
    const journeyId = requireUuid(envelope.payload.journeyId);
    const anywhere = await findBinding<{ org_id: string; workspace_id: string }>(
      'enterprise_governed_journeys', `select=org_id,workspace_id&id=eq.${encodeURIComponent(journeyId)}`,
    );
    if (!anywhere || anywhere.org_id !== authority.organizationId || anywhere.workspace_id !== authority.workspaceId) {
      throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    }
    const current = await findBinding<{ version: number; route_policy_version: number }>(
      'enterprise_governed_journeys',
      `select=version,route_policy_version&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(journeyId)}`,
    );
    return { journeyId, currentVersion: current?.version || 0, routePolicyVersion: current?.route_policy_version || 1 };
  }
  if (envelope.commandType === 'transcript.assess.candidate.review') {
    const candidateId = requireUuid(envelope.payload.candidateId);
    const candidate = await findBinding<{ id: string; version: number; ai_job_id: string; source_version_id: string }>(
      'enterprise_evidence_candidates',
      `select=id,version,ai_job_id,source_version_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(candidateId)}`,
    );
    if (!candidate) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    const binding = await findBinding<{ id: string; input_bundle_id: string; input_bundle_version_id: string; source_set_id: string; source_set_version_id: string; source_version_id: string }>(
      'enterprise_transcript_extraction_bindings',
      `select=id,input_bundle_id,input_bundle_version_id,source_set_id,source_set_version_id,source_version_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&job_id=eq.${encodeURIComponent(candidate.ai_job_id)}`,
    );
    if (!binding) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    const submitted = {
      candidateId, candidateVersion: requirePositiveInteger(envelope.payload.candidateVersion),
      inputBundleId: requireUuid(envelope.payload.inputBundleId),
      inputBundleVersionId: requireUuid(envelope.payload.inputBundleVersionSelector),
      inputBundleVersion: requirePositiveInteger(envelope.payload.expectedInputBundleVersion),
      sourceSetId: requireUuid(envelope.payload.sourceSetId),
      sourceSetVersionId: requireUuid(envelope.payload.sourceSetVersionSelector),
      sourceSetVersion: requirePositiveInteger(envelope.payload.expectedSourceSetVersion),
      sourceVersionId: requireUuid(envelope.payload.sourceVersionSelector),
      extractionBindingId: binding.id, extractionJobId: candidate.ai_job_id,
    };
    const exact = await resolveTranscriptExtractionSelection(
      authority, submitted.inputBundleId, submitted.inputBundleVersionId, submitted.inputBundleVersion,
      submitted.sourceSetId, submitted.sourceSetVersionId, submitted.sourceSetVersion, submitted.sourceVersionId,
      findBinding,
    );
    if (!exact) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    if (candidate.version !== submitted.candidateVersion || candidate.source_version_id !== submitted.sourceVersionId
      || binding.input_bundle_id !== submitted.inputBundleId || binding.input_bundle_version_id !== submitted.inputBundleVersionId
      || binding.source_set_id !== submitted.sourceSetId || binding.source_set_version_id !== submitted.sourceSetVersionId
      || binding.source_version_id !== submitted.sourceVersionId) throw new EnterpriseCommandError('RESOURCE_STALE');
    return submitted;
  }
  if (envelope.commandType === 'transcript.assess.apply.preview') {
    const caseId = requireUuid(envelope.payload.assessDraftId);
    const expectedDraftVersion = requirePositiveInteger(envelope.payload.expectedDraftVersion);
    const current = await findBinding<{ version: number; head_version_id: string }>(
      'assess_v2_cases',
      `select=version,head_version_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(caseId)}&status=eq.draft&deleted_at=is.null`,
    );
    if (!current) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    if (current.version !== expectedDraftVersion) throw new EnterpriseCommandError('RESOURCE_STALE');
    const sourceSets = parseTranscriptSourceSetLineage(envelope.payload.sourceSetVersions);
    const inputBundleId = requireUuid(envelope.payload.inputBundleId);
    const inputBundleVersionId = requireUuid(envelope.payload.inputBundleVersionSelector);
    const inputBundleVersion = requirePositiveInteger(envelope.payload.expectedInputBundleVersion);
    await assertTranscriptBundleLineagePreclaim(
      authority, inputBundleId, inputBundleVersionId, inputBundleVersion, sourceSets,
      findBinding, findBindingRows,
    );
    if (!Array.isArray(envelope.payload.selections)) throw new EnterpriseCommandError('INVALID_PAYLOAD');
    const candidateBindings = [] as JsonObject[];
    for (const raw of envelope.payload.selections) {
      const selection = requirePayloadObject(raw);
      const candidateId = requireUuid(selection.candidateId);
      const candidate = await findBinding<{ id: string; version: number; ai_job_id: string }>(
        'enterprise_evidence_candidates',
        `select=id,version,ai_job_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(candidateId)}`,
      );
      if (!candidate) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
      const binding = await findBinding<{ id: string; input_bundle_id: string; input_bundle_version_id: string; source_set_id: string; source_set_version_id: string; source_version_id: string }>(
        'enterprise_transcript_extraction_bindings',
        `select=id,input_bundle_id,input_bundle_version_id,source_set_id,source_set_version_id,source_version_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&job_id=eq.${encodeURIComponent(candidate.ai_job_id)}`,
      );
      if (!binding) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
      if (candidate.version !== requirePositiveInteger(selection.candidateVersion)
        || binding.input_bundle_id !== inputBundleId || binding.input_bundle_version_id !== inputBundleVersionId
        || !sourceSets.some(item => item.sourceSetId === binding.source_set_id
          && item.sourceSetVersionSelector === binding.source_set_version_id)) throw new EnterpriseCommandError('RESOURCE_STALE');
      candidateBindings.push({ candidateId, candidateVersion: candidate.version, extractionBindingId: binding.id,
        extractionJobId: candidate.ai_job_id, sourceVersionId: binding.source_version_id });
    }
    return { assessDraftId: caseId, currentVersion: current.version, headVersionId: current.head_version_id,
      inputBundleId, inputBundleVersionId, inputBundleVersion, sourceSets, candidateBindings };
  }
  if (envelope.commandType === 'transcript.assess.apply.commit') {
    const previewBatchId = requireUuid(envelope.payload.previewBatchId);
    const batch = await findBinding<{ assess_case_id: string; expected_case_version: number; input_bundle_id: string; input_bundle_version_id: string; input_bundle_version: number; source_set_version_ids: string[] }>(
      'enterprise_assess_apply_preview_batches',
      `select=assess_case_id,expected_case_version,input_bundle_id,input_bundle_version_id,input_bundle_version,source_set_version_ids&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(previewBatchId)}`,
    );
    if (!batch) throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    const sourceSets = parseTranscriptSourceSetLineage(envelope.payload.sourceSetVersions);
    const submitted = {
      previewBatchId, assessDraftId: requireUuid(envelope.payload.assessDraftId),
      expectedDraftVersion: requirePositiveInteger(envelope.payload.expectedDraftVersion),
      inputBundleId: requireUuid(envelope.payload.inputBundleId),
      inputBundleVersionId: requireUuid(envelope.payload.inputBundleVersionSelector),
      inputBundleVersion: requirePositiveInteger(envelope.payload.expectedInputBundleVersion), sourceSets,
    };
    await assertTranscriptBundleLineagePreclaim(
      authority, submitted.inputBundleId, submitted.inputBundleVersionId, submitted.inputBundleVersion, sourceSets,
      findBinding, findBindingRows,
    );
    if (batch.assess_case_id !== submitted.assessDraftId || batch.expected_case_version !== submitted.expectedDraftVersion
      || batch.input_bundle_id !== submitted.inputBundleId || batch.input_bundle_version_id !== submitted.inputBundleVersionId
      || batch.input_bundle_version !== submitted.inputBundleVersion
      || JSON.stringify(batch.source_set_version_ids) !== JSON.stringify(sourceSets.map(item => item.sourceSetVersionSelector))) {
      throw new EnterpriseCommandError('RESOURCE_STALE');
    }
    return submitted;
  }
  if (envelope.commandType === 'transcript.assess.conflict.resolve') {
    requireExactPayload(
      envelope.payload,
      ['conflictId', 'resolutionVersion', 'resolution', 'rationale'],
      ['candidateId', 'authoredValue'],
    );
    const conflictId = requireUuid(envelope.payload.conflictId);
    const resolutionVersion = requirePositiveInteger(envelope.payload.resolutionVersion, true);
    const anywhere = await findBinding<{
      org_id: string;
      workspace_id: string;
      current_resolution_version: number;
      candidate_ids: string[];
    }>(
      'enterprise_assess_evidence_conflicts',
      `select=org_id,workspace_id,current_resolution_version,candidate_ids&id=eq.${encodeURIComponent(conflictId)}`,
    );
    if (!anywhere || anywhere.org_id !== authority.organizationId || anywhere.workspace_id !== authority.workspaceId) {
      throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
    }
    if (anywhere.current_resolution_version !== resolutionVersion) throw new EnterpriseCommandError('RESOURCE_STALE');
    const candidateId = envelope.payload.candidateId === undefined
      ? null
      : requireUuid(envelope.payload.candidateId);
    if (candidateId) {
      const candidate = await findBinding<{ id: string }>(
        'enterprise_evidence_candidates',
        `select=id&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&id=eq.${encodeURIComponent(candidateId)}`,
      );
      if (!candidate || !Array.isArray(anywhere.candidate_ids) || !anywhere.candidate_ids.includes(candidateId)) {
        throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
      }
    }
    return { conflictId, resolutionVersion, ...(candidateId ? { candidateId } : {}) };
  }
  return null;
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
    const transcriptCommandBinding = await deriveTranscriptCommandRequestBinding(
      authority,
      envelope,
      overrides.transcriptCommandRequestBindingDependencies,
    );
    const { requestId: _transportRequestId, ...canonicalEnvelope } = envelope;
    const requestHash = await hashReceiptValue({
      ...canonicalEnvelope,
      ...(transcriptCommandBinding ? { serverBinding: transcriptCommandBinding } : {}),
    });
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
    if (transcriptCommandBinding) {
      await ensureExecutionPlan(receipt, disclosureAuthority, { transcriptCommandBinding });
    }
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
