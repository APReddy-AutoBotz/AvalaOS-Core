import {
  ASSEMBLE_ELIGIBLE_DISPOSITIONS,
  ENTERPRISE_AI_CAPABILITIES,
  ENTERPRISE_AI_PROVIDERS,
  EVIDENCE_CANDIDATE_FIELDS,
  buildAssembleBlueprintDraft,
  buildDeliveryWorkPackageDraft,
  buildEvidenceCandidate,
  buildMonitorBaseline,
  evaluateModernizationDecision,
  isSupportedEvidenceMimeType,
  stableFingerprint,
  type AssembleBlueprintDraft,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
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
  type EnterpriseReceiptRow,
} from './enterpriseReceipt.ts';
import { handleOptions, jsonResponse } from './http.ts';
import {
  getAuthUser,
  insertRow,
  postgrest,
  rpc,
  resolveOrgId,
  updateRows,
} from './supabase.ts';
import {
  downloadStoredFile,
  assertSourceUploadsBucket,
  prepareTextArtifact,
  resolveSourceUploadsBucket,
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

type Authority = {
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

const resolveRoute = async (authority: Authority, capability: EnterpriseAiCapability, requestedConfigId?: string, allowDisabled = false) => {
  const decision = await resolveEnterpriseProviderRoute({
    mode: 'pilot',
    capability,
    organizationId: authority.organizationId,
    workspaceId: authority.workspaceId,
    actorId: authority.actorId,
    roleNames: [...authority.roleNames],
    roleIds: [...authority.organizationRoleIds, ...authority.workspaceRoleIds],
    requestedProviderConfigId: requestedConfigId,
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
    };
    return await executeProviderLifecycleCommand(
      operation,
      lifecycleAuthority(authority),
      payload,
      createProviderLifecycleDeps(buildEnterpriseProviderRouteDbDeps(isAllowedProviderEndpoint)),
      execution,
    );
  } catch (error) {
    if (error instanceof ProviderLifecycleError) {
      if (error.code === 'PERMISSION_DENIED' || error.code === 'TENANT_ACCESS_DENIED') throw new EnterpriseCommandError('PERMISSION_DENIED');
      if (error.code === 'RESOURCE_NOT_FOUND') throw new EnterpriseCommandError('RESOURCE_NOT_FOUND');
      if (error.code === 'PERSISTENCE_UNAVAILABLE' || error.code === 'SECRET_BACKEND_REQUIRED' || error.code === 'SECRET_UNAVAILABLE') {
        throw new EnterpriseCommandError('COMMAND_UNAVAILABLE');
      }
      if (error.code === 'INVALID_REQUEST') throw new EnterpriseCommandError('INVALID_PAYLOAD');
    }
    throw new EnterpriseCommandError('COMMAND_BLOCKED');
 …8589 tokens truncated…ype StudioVersionRow = { id: string; version: number; content: JsonObject; content_hash: string; lifecycle: string };

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
  const result = { handoffId, workPackageId, packageVersionId, itemIds: Array.from(itemIds.values()), source: approvedDocument, status: draft.status, itemCount: draft.items.length, requiresHumanReview: true };
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
    ...receiptMutationArgs(receipt, baseline as unknown as JsonObject),
  });
  return baseline;
};

const commandAssembleBlueprintCreate = async (authority: Authority, payload: JsonObject, receipt: EnterpriseReceiptRow): Promise<AssembleBlueprintDraft> => {
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
  await rpc('enterprise_commit_assemble_blueprint', {
    p_blueprint: { ...blueprint, structuredContent: blueprint },
    p_actor: authority.actorId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    ...receiptMutationArgs(receipt, blueprint as unknown as JsonObject),
  });
  return blueprint;
};

const executeEnterpriseCommand = async (authority: Authority, envelope: EnterpriseCommandEnvelope, receipt: EnterpriseReceiptRow) => {
  const commandCapabilities: Record<EnterpriseCommandType, string[]> = {
    'provider.register': ['byok.manage', 'security.manage'],
    'provider.validate': ['byok.manage', 'security.manage'],
    'provider.activate': ['byok.manage', 'security.manage'],
    'provider.route.toggle': ['byok.manage', 'security.manage'],
    'provider.revoke': ['byok.manage', 'security.manage'],
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
  await assertFreshAuthority(authority, commandCapabilities[envelope.commandType]);
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

export const handleEnterpriseIntelligenceRequest = async (request: Request) => {
  if (request.method !== 'POST') return jsonResponse(enterpriseCommandErrorBody(new EnterpriseCommandError('METHOD_NOT_ALLOWED')), 405);
  let claimedReceipt: EnterpriseReceiptRow | null = null;
  let claimedAuthority: Authority | null = null;
  try {
    const user = await getAuthUser(request);
    const body = await request.json();
    const envelope = parseEnterpriseCommandEnvelope(body);
    const organizationId = await resolveOrgId(user.id, envelope.organizationId);
    if (organizationId !== envelope.organizationId) throw new EnterpriseCommandError('TENANT_ACCESS_DENIED');
    const authority = await resolveAuthority(user.id, organizationId, envelope.workspaceId);
    const { requestId: _transportRequestId, ...canonicalEnvelope } = envelope;
    const requestHash = await hashReceiptValue(canonicalEnvelope);
    const resourceType = envelope.commandType === 'approval.review.record' || envelope.commandType === 'approval.record'
      ? requireString(envelope.payload.resourceType, 80)
      : null;
    const { receipt, ownsExecution } = await claimEnterpriseReceipt(authority, {
      commandType: envelope.commandType,
      idempotencyKey: envelope.idempotencyKey,
      requestId: envelope.requestId,
      requestHash,
      resourceType,
    });
    if (receipt.status === 'committed') {
      return jsonResponse({ ok: true, replayed: true, ...(receipt.response || {}), resourceId: receipt.resource_id || undefined });
    }
    if (receipt.status === 'failed' || receipt.status === 'blocked') {
      return jsonResponse({ ...(receipt.response || enterpriseCommandErrorBody(new EnterpriseCommandError('COMMAND_BLOCKED'))), replayed: true }, 409);
    }
    if (receipt.status !== 'claimed' || !ownsExecution) throw new EnterpriseCommandError('COMMAND_IN_PROGRESS');
    claimedReceipt = receipt;
    claimedAuthority = authority;
    const result = await executeEnterpriseCommand(authority, envelope, receipt);
    const resultObject: JsonObject = isRecord(result) ? result : { result };
    const resourceId = typeof resultObject.id === 'string'
      ? resultObject.id
      : typeof resultObject.sourceId === 'string'
        ? resultObject.sourceId
        : typeof resultObject.providerConfigId === 'string'
          ? resultObject.providerConfigId
          : typeof resultObject.workPackageId === 'string'
            ? resultObject.workPackageId
            : typeof resultObject.decisionId === 'string'
              ? resultObject.decisionId
              : undefined;
    const completed = await completeEnterpriseReceipt(receipt, authority, resultObject, resourceId);
    return jsonResponse({ ok: true, replayed: false, ...(completed.response || resultObject) });
  } catch (error) {
    const commandError = error instanceof EnterpriseCommandError
      ? error
      : error instanceof EnterpriseReceiptError
        ? new EnterpriseCommandError(error.code)
        : new EnterpriseCommandError('COMMAND_UNAVAILABLE');
    if (claimedReceipt && claimedAuthority) {
      try {
        const recovered = await reloadEnterpriseReceipt(claimedReceipt, claimedAuthority);
        if (recovered.status === 'committed') {
          return jsonResponse({ ok: true, replayed: true, ...(recovered.response || {}), resourceId: recovered.resource_id || undefined });
        }
        if (recovered.status === 'failed' || recovered.status === 'blocked') {
          return jsonResponse({ ...(recovered.response || enterpriseCommandErrorBody(commandError)), replayed: true }, 409);
        }
      } catch {
        if (commandError.code === 'RECEIPT_FINALIZATION_FAILED') {
          return jsonResponse(enterpriseCommandErrorBody(commandError), commandError.status);
        }
      }
    }
    if (claimedReceipt && claimedAuthority && commandError.code !== 'RECEIPT_FINALIZATION_FAILED') {
      const recoverableStorageEffect = commandError.code === 'COMMAND_UNAVAILABLE'
        && claimedReceipt.execution_plan?.externalStorageWritten === true;
      if (recoverableStorageEffect) {
        return jsonResponse(enterpriseCommandErrorBody(commandError), commandError.status);
      }
      try {
        await failEnterpriseReceipt(
          claimedReceipt,
          claimedAuthority,
          enterpriseCommandErrorBody(commandError),
          commandError.code === 'PERMISSION_DENIED' || commandError.code === 'TENANT_ACCESS_DENIED' || commandError.code === 'COMMAND_BLOCKED',
        );
      } catch (finalizationError) {
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
