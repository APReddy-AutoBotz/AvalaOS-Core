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
import { extractEvidenceText, decodeBase64, sha256Hex } from './enterpriseIntelligenceIngestion.ts';
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
  removeTextArtifact,
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
      | 'COMMAND_UNAVAILABLE',
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
  if (code === 'COMMAND_UNAVAILABLE') return 503;
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
  roleNames: Set<string>;
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
  const permissions = new Set(capabilities.map(row => row.capability_key));
  return {
    actorId,
    organizationId,
    workspaceId,
    isAdmin: permissions.has('org.admin'),
    permissions,
    roleNames: new Set(roles.filter(role => validRoleIds.includes(role.id)).map(role => String(role.name || '').toLowerCase()).filter(Boolean)),
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

type ReceiptRow = {
  id: string;
  request_hash: string;
  request_id: string;
  status: string;
  resource_id?: string | null;
  response?: JsonObject;
};

const findReceipt = async (authority: Authority, envelope: EnterpriseCommandEnvelope) => findOne<ReceiptRow>(
  'enterprise_ai_command_receipts',
  `select=id,request_hash,request_id,status,resource_id,response&org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}&actor_id=eq.${encodeURIComponent(authority.actorId)}&command_type=eq.${encodeURIComponent(envelope.commandType)}&idempotency_key=eq.${encodeURIComponent(envelope.idempotencyKey)}`,
);

const claimReceipt = async (
  authority: Authority,
  envelope: EnterpriseCommandEnvelope,
  requestHash: string,
): Promise<ReceiptRow> => {
  const value = await rpc<ReceiptRow | ReceiptRow[]>('enterprise_ai_claim_command', {
    p_actor: authority.actorId,
    p_org: authority.organizationId,
    p_workspace: authority.workspaceId,
    p_command_type: envelope.commandType,
    p_key: envelope.idempotencyKey,
    p_request: envelope.requestId,
    p_hash: requestHash,
  });
  const row×m8ÖÚ$z{-®éÜj×7E÷G—R’À¢Ò“°¢6öç7B†æFöfd–BÒ7'—Fòç&æFöÕUT”B‚“°¢6öç7B†æFöfe&V6÷&BÒ°¢–C¢†æFöfd–BÀ¢÷&uö–C¢WF†÷&—G’æ÷&væ—¦F–öä–BÀ¢v÷&·76Uö–C¢WF†÷&—G’çv÷&·76T–BÀ¢7GVF–õöFö7VÖVçEö–C¢7GVF–ôFö7VÖVçD–BÀ¢7GVF–õ÷fW'6–öåö–C¢fW'6–öâæ–BÀ¢7GVF–õ÷fW'6–öã¢fW'6–öâçfW'6–öâÀ¢7GVF–õö6öçFVçEö†6ƒ¢fW'6–öâæ6öçFVçEö†6‚À¢'F–f7E÷G—S¢vw&VvFRæ'F–f7E÷G—RÀ¢6÷W&6U÷7FGW3¢v&÷fVBrÀ¢6÷W&6U÷6æ6†÷C¢²'F–f7EG—S¢vw&VvFRæ'F–f7E÷G—RÂfW'6–öã¢fW'6–öâçfW'6–öâÂ6öçFVçD†6ƒ¢fW'6–öâæ6öçFVçEö†6‚Â6V7F–öä6÷VçC¢G&gBæ—FV×2æÆVæwF‚ÒÀ¢7FGW3¢G&gBç7FGW2ÓÓÒvG&gBròvG&gBr¢v&Æö6¶VBrÀ¢7&VFVEö'“¢WF†÷&—G’æ7F÷$–BÀ¢Ó°¢6öç7B6¶vU&V6÷&BÒ°¢–C¢v÷&µ6¶vT–BÀ¢÷&uö–C¢WF†÷&—G’æ÷&væ—¦F–öä–BÀ¢v÷&·76Uö–C¢WF†÷&—G’çv÷&·76T–BÀ¢†æFöfeö–C¢†æFöfd–BÀ¢7W'&VçE÷fW'6–öã¢À¢7FGW3¢G&gBç7FGW2À¢7&VFVEö'“¢WF†÷&—G’æ7F÷$–BÀ¢Ó°¢6öç7B6¶vUfW'6–öä–BÒ7'—Fòç&æFöÕUT”B‚“°¢6öç7B—FVÔ–G2ÒæWrÖÇ7G&–ærÂ7G&–æsâ‚“°¢G&gBæ—FV×2æf÷$V6‚†—FVÒÓâ—FVÔ–G2ç6WB†—FVÒæ–BÂ7'—Fòç&æFöÕUT”B‚’’“°¢6öç7BW'6—7FVD—FV×2Òv—B&öÖ—6RæÆÂ†G&gBæ—FV×2æÖ†7–æ2—FVÒÓâ‡°¢ââæ—FVÒÀ¢–C¢—FVÔ–G2ævWB†—FVÒæ–B’ÇÂ—FVÒæ–BÀ¢&VçD–C¢—FVÒç&VçD–Bò—FVÔ–G2ævWB†—FVÒç&VçD–B’ÇÂVæFVf–æVB¢VæFVf–æVBÀ¢–FV×÷FVæ7”¶W“¢v—B6†#Sd§6öâ‡²6¶vUfW'6–öä–BÂ—FVÔ–C¢—FVÒæ–BÂ6÷W&6S¢—FVÒç6÷W&6U6V7F–öäÆö6F÷"Ò’À¢7&VFVD'“¢WF†÷&—G’æ7F÷$–BÀ¢Ò’’“°¢6öç7B6¶vT6öçFVçBÒ°¢ââæG&gBÀ¢—FV×3¢W'6—7FVD—FV×2À¢–FV×÷FVæ7”¶W“¢v—B6†#Sd§6öâ‡²7GVF–ôFö7VÖVçD–BÂ7GVF–õfW'6–öã¢fW'6–öâçfW'6–öâÂ7GVF–ô6öçFVçD†6ƒ¢fW'6–öâæ6öçFVçEö†6‚Â6V7F–öç3¢W‡G&7E7GVF–õ6V7F–öç2‡fW'6–öâæ6öçFVçBÂvw&VvFRæ'F–f7E÷G—R’Ò’À¢Ó°¢6öç7BfW'6–öå&V6÷&BÒ°¢–C¢6¶vUfW'6–öä–BÀ¢v÷&µ÷6¶vUö–C¢v÷&µ6¶vT–BÀ¢÷&uö–C¢WF†÷&—G’æ÷&væ—¦F–öä–BÀ¢v÷&·76Uö–C¢WF†÷&—G’çv÷&·76T–BÀ¢fW'6–öã¢À¢7GVF–õöFö7VÖVçEö–C¢7GVF–ôFö7VÖVçD–BÀ¢'F–f7E÷G—S¢vw&VvFRæ'F–f7E÷G—RÀ¢7GVF–õ÷fW'6–öåö–C¢fW'6–öâæ–BÀ¢7GVF–õ÷fW'6–öã¢fW'6–öâçfW'6–öâÀ¢7GVF–õö6öçFVçEö†6ƒ¢fW'6–öâæ6öçFVçEö†6‚À¢6öçFVçC¢6¶vT6öçFVçBÀ¢6öçFVçEö†6ƒ¢v—B6†#Sd§6öâ‡6¶vT6öçFVçB’À¢7FGW3¢G&gBç7FGW2À¢7&VFVEö'“¢WF†÷&—G’æ7F÷$–BÀ¢Ó°¢v—B'2‚vVçFW'&—6Uö6öÖÖ—EöFVÆ—fW'•ö†æFöfbrÂ°¢ö†æFöfc¢†æFöfe&V6÷&BÀ¢÷6¶vS¢6¶vU&V6÷&BÀ¢÷fW'6–öã¢fW'6–öå&V6÷&BÀ¢ö—FV×3¢W'6—7FVD—FV×2À¢Ò“°¢&WGW&â²†æFöfd–BÂv÷&µ6¶vT–BÂ6¶vUfW'6–öä–BÂ—FVÔ–G3¢'&’æg&öÒ†—FVÔ–G2çfÇVW2‚’’Â6÷W&6S¢&÷fVDFö7VÖVçBÂ7FGW3¢G&gBç7FGW2Â—FVÔ6÷VçC¢G&gBæ—FV×2æÆVæwF‚Â&WV—&W4‡VÖå&Wf–Ws¢G'VRÓ°§Ó° §G—R6¶vUfW'6–öå&÷rÒ°¢–C¢7G&–æs°¢v÷&µ÷6¶vUö–C¢7G&–æs°¢7GVF–õöFö7VÖVçEö–C¢7G&–æs°¢'F–f7E÷G—S¢v'&BrÂvg&BrÂwFBs°¢7GVF–õ÷fW'6–öã¢çVÖ&W#°¢7GVF–õö6öçFVçEö†6ƒ¢7G&–æs°¢6öçFVçC¢§6öäö&¦V7C°¢7FGW3¢7G&–æs°§Ó° ¦6öç7B6öÖÖæDÖöæ—F÷$&6VÆ–æT7&VFRÒ7–æ2†WF†÷&—G“¢WF†÷&—G’Â–ÆöC¢§6öäö&¦V7B’Óâ°¢&WV—&UW&Ö—76–öâ†WF†÷&—G’ÂvÖöæ—F÷"æÖævRr“°¢6öç7Bv÷&µ6¶vT–BÒ&WV—&UWV–B‡–ÆöBçv÷&µ6¶vT–B“°¢6öç7B6¶vTvw&VvFRÒv—Bf–æDöæSÇ²–C¢7G&–æs²7W'&VçE÷fW'6–öã¢çVÖ&W#²7FGW3¢7G&–ærÓâ€¢vVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vW2rÀ¢6VÆV7CÖ–BÆ7W'&VçE÷fW'6–öâÇ7FGW2f÷&uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’æ÷&væ—¦F–öä–B—Ògv÷&·76Uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’çv÷&·76T–B—Òf–CÖWâG¶Væ6öFUU$”6ö×öæVçB‡v÷&µ6¶vT–B—ÖÀ¢“°¢–b‚6¶vTvw&VvFR’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚u$U4õU$4UôäõEôdõTäBr“°¢–b‡6¶vTvw&VvFRç7FGW2ÓÒv&÷fVBr’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô$Äô4´TBr“°¢6öç7BfW'6–öâÒv—Bf–æDöæSÅ6¶vUfW'6–öå&÷sâ€¢vVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vU÷fW'6–öç2rÀ¢6VÆV7CÖ–BÇv÷&µ÷6¶vUö–BÇ7GVF–õöFö7VÖVçEö–BÆ'F–f7E÷G—RÇ7GVF–õ÷fW'6–öâÇ7GVF–õö6öçFVçEö†6‚Æ6öçFVçBÇ7FGW2f÷&uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’æ÷&væ—¦F–öä–B—Ògv÷&·76Uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’çv÷&·76T–B—Ògv÷&µ÷6¶vUö–CÖWâG¶Væ6öFUU$”6ö×öæVçB‡v÷&µ6¶vT–B—ÒgfW'6–öãÖWâG·6¶vTvw&VvFRæ7W'&VçE÷fW'6–öçÖÀ¢“°¢–b‚fW'6–öâ’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚u$U4õU$4UôäõEôdõTäBr“°¢–b‡fW'6–öâç7FGW2ÓÒv&÷fVBr’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô$Äô4´TBr“°¢6öç7B6¶vUfW'6–öä–BÒfW'6–öâæ–C°¢6öç7B—FVÕ&÷w2Òv—B÷7Fw&W7CÄ'&“Ç°¢–C¢7G&–æs°¢—FVÕ÷G—S¢7G&–æs°¢F—FÆS¢7G&–æs°¢FW67&—F–öã¢7G&–æs°¢66WFæ6Uö7&—FW&–¢Væ¶æ÷vã°¢æöåögVæ7F–öæÅ÷&WV—&VÖVçG3¢Væ¶æ÷vã°¢6÷W&6U÷6V7F–öåöÆö6F÷#¢7G&–æs°¢Óãâ€¢VçFW'&—6UöFVÆ—fW'•÷v÷&µö—FV×3÷6VÆV7CÖ–BÆ—FVÕ÷G—RÇF—FÆRÆFW67&—F–öâÆ66WFæ6Uö7&—FW&–ÆæöåögVæ7F–öæÅ÷&WV—&VÖVçG2Ç6÷W&6U÷6V7F–öåöÆö6F÷"f÷&uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’æ÷&væ—¦F–öä–B—Ògv÷&·76Uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’çv÷&·76T–B—Òg6¶vU÷fW'6–öåö–CÖWâG¶Væ6öFUU$”6ö×öæVçB‡6¶vUfW'6–öä–B—ÖÀ¢²ÖWF†öC¢ttUBrÒÀ¢“°¢6öç7Bv÷&µ6¶vTG&gBÒ°¢–FV×÷FVæ7”¶W“¢7F&ÆTf–ævW'&–çB‡6¶vUfW'6–öä–B’À¢6÷W&6S¢²Fö7VÖVçD–C¢fW'6–öâç7GVF–õöFö7VÖVçEö–BÂfW'6–öã¢fW'6–öâç7GVF–õ÷fW'6–öâÂ6öçFVçD†6ƒ¢fW'6–öâç7GVF–õö6öçFVçEö†6‚Â'F–f7EG—S¢fW'6–öâæ'F–f7E÷G—RÂÆ–fV7–6ÆS¢v&÷fVBr26öç7BÒÀ¢7FGW3¢vG&gBr26öç7BÀ¢—FV×3¢—FVÕ&÷w2æÖ†—FVÒÓâ‡°¢–C¢—FVÒæ–BÀ¢—FVÕG—S¢—FVÒæ—FVÕ÷G—R2ç’À¢F—FÆS¢—FVÒçF—FÆRÀ¢FW67&—F–öã¢—FVÒæFW67&—F–öâÀ¢66WFæ6T7&—FW&–¢'&’æ—4'&’†—FVÒæ66WFæ6Uö7&—FW&–’ò—FVÒæ66WFæ6Uö7&—FW&–æf–ÇFW"‚‡fÇVR“¢fÇVR—27G&–ærÓâG—VöbfÇVRÓÓÒw7G&–ærr’¢µÒÀ¢æöägVæ7F–öæÅ&WV—&VÖVçG3¢'&’æ—4'&’†—FVÒææöåögVæ7F–öæÅ÷&WV—&VÖVçG2’ò—FVÒææöåögVæ7F–öæÅ÷&WV—&VÖVçG2æf–ÇFW"‚‡fÇVR“¢fÇVR—27G&–ærÓâG—VöbfÇVRÓÓÒw7G&–ærr’¢µÒÀ¢6÷W&6U6V7F–öäÆö6F÷#¢—FVÒç6÷W&6U÷6V7F–öåöÆö6F÷"À¢6÷W&6TFö7VÖVçD–C¢fW'6–öâç7GVF–õöFö7VÖVçEö–BÀ¢6÷W&6TFö7VÖVçEfW'6–öã¢fW'6–öâç7GVF–õ÷fW'6–öâÀ¢6÷W&6TFö7VÖVçD†6ƒ¢fW'6–öâç7GVF–õö6öçFVçEö†6‚À¢Ò’’À¢&Æö6¶W'3¢µÒÀ¢&WV—&W4‡VÖå&Wf–Ws¢G'VR26öç7BÀ¢6åV&Æ—6ƒ¢fÇ6R26öç7BÀ¢Ó°¢6öç7B&6VÆ–æRÒ'V–ÆDÖöæ—F÷$&6VÆ–æR‡²–C¢7'—Fòç&æFöÕUT”B‚’Âv÷&µ6¶vT–C¢fW'6–öâçv÷&µ÷6¶vUö–BÂv÷&µ6¶vS¢v÷&µ6¶vTG&gBÂ&÷fVD—FVÔ–G3¢—FVÕ&÷w2æÖ†—FVÒÓâ—FVÒæ–B’Ò“°¢v—B–ç6W'E&÷r‚vVçFW'&—6UöÖöæ—F÷%ö&6VÆ–æW2rÂ°¢–C¢&6VÆ–æRæ–BÀ¢÷&uö–C¢WF†÷&—G’æ÷&væ—¦F–öä–BÀ¢v÷&·76Uö–C¢WF†÷&—G’çv÷&·76T–BÀ¢v÷&µ÷6¶vUö–C¢fW'6–öâçv÷&µ÷6¶vUö–BÀ¢v÷&µ÷6¶vU÷fW'6–öåö–C¢6¶vUfW'6–öä–BÀ¢7GVF–õöFö7VÖVçEö–C¢&6VÆ–æRç6÷W&6TFö7VÖVçD–BÀ¢7GVF–õ÷fW'6–öã¢&6VÆ–æRç6÷W&6TFö7VÖVçEfW'6–öâÀ¢7GVF–õö6öçFVçEö†6ƒ¢&6VÆ–æRç6÷W&6TFö7VÖVçD†6‚À¢&÷fVEö—FVÕö–G3¢&6VÆ–æRæ&÷fVD—FVÔ–G2À¢Ö–ÆW7FöæW3¢&6VÆ–æRæÖ–ÆW7FöæW2À¢FWVæFVæ6–W3¢&6VÆ–æRæFWVæFVæ6–W2À¢&Æö6¶W'3¢&6VÆ–æRæ&Æö6¶W'2À¢&—6·3¢&6VÆ–æRç&—6·2À¢&VF–æW73¢&6VÆ–æRç&VF–æW72À¢7FGW3¢&6VÆ–æRç7FGW2À¢Æ—fU÷FVÆVÖWG'•ö6öææV7FVC¢fÇ6RÀ¢7&VFVEö'“¢WF†÷&—G’æ7F÷$–BÀ¢Ò“°¢&WGW&â&6VÆ–æS°§Ó° ¦6öç7B6öÖÖæD76VÖ&ÆT&ÇVW&–çD7&VFRÒ7–æ2†WF†÷&—G“¢WF†÷&—G’Â–ÆöC¢§6öäö&¦V7B“¢&öÖ—6SÄ76VÖ&ÆT&ÇVW&–çDG&gCâÓâ°¢&WV—&UW&Ö—76–öâ†WF†÷&—G’Âv76VÖ&ÆRæÖævRr“°¢6öç7BFV6—6–öä–BÒ&WV—&UWV–B‡–ÆöBæÖöFW&æ—¦F–öäFV6—6–öä–B“°¢6öç7BFV6—6–öâÒv—Bf–æDöæSÇ²–C¢7G&–æs²&–Ö'•öF—7÷6—F–öã¢ÖöFW&æ—¦F–öäF—7÷6—F–öã²7FGW3¢7G&–ærÓâ€¢vVçFW'&—6UöÖöFW&æ—¦F–öåöFV6—6–öç2rÀ¢6VÆV7CÖ–BÇ&–Ö'•öF—7÷6—F–öâÇ7FGW2f÷&uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’æ÷&væ—¦F–öä–B—Ògv÷&·76Uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’çv÷&·76T–B—Òf–CÖWâG¶Væ6öFUU$”6ö×öæVçB†FV6—6–öä–B—ÖÀ¢“°¢–b‚FV6—6–öâÇÂFV6—6–öâç7FGW2ÓÒv&÷fVBrÇÂ54TÔ$ÄUôTÄ”t”$ÄUôD•5õ4•D”ôå2æ–æ6ÇVFW2†FV6—6–öâç&–Ö'•öF—7÷6—F–öâ’’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô$Äô4´TBr“°¢6öç7B&ÇVW&–çBÒ'V–ÆD76VÖ&ÆT&ÇVW&–çDG&gB‡°¢&ÇVW&–çD–C¢7'—Fòç&æFöÕUT”B‚’À¢ÖöFW&æ—¦F–öäFV6—6–öä–C¢FV6—6–öâæ–BÀ¢F—7÷6—F–öã¢FV6—6–öâç&–Ö'•öF—7÷6—F–öâÀ¢æÖS¢&WV—&U7G&–ær‡–ÆöBææÖRÂ#C’À¢Ò“°¢v—B–ç6W'E&÷r‚vVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çG2rÂ°¢–C¢&ÇVW&–çBæ–BÀ¢÷&uö–C¢WF†÷&—G’æ÷&væ—¦F–öä–BÀ¢v÷&·76Uö–C¢WF†÷&—G’çv÷&·76T–BÀ¢ÖöFW&æ—¦F–öåöFV6—6–öåö–C¢FV6—6–öâæ–BÀ¢F—7÷6—F–öã¢&ÇVW&–çBæF—7÷6—F–öâÀ¢66†VÖ÷fW'6–öã¢&ÇVW&–çBç66†VÖfW'6–öâÀ¢fW'6–öã¢À¢7G'V7GW&VEö6öçFVçC¢&ÇVW&–çBÀ¢&VF&ÆUöFö7VÖVçC¢&ÇVW&–çBç&VF&ÆTFö7VÖVçBÀ¢7FGW3¢vG&gBrÀ¢6öFUövVæW&F–öåöVæ&ÆVC¢fÇ6RÀ¢FWÆ÷–ÖVçEöVæ&ÆVC¢fÇ6RÀ¢–æg&7G'V7GW&Uö6†ævW5öVæ&ÆVC¢fÇ6RÀ¢7&VFVçF–Åö66W75öVæ&ÆVC¢fÇ6RÀ¢6÷W&6U÷7—7FVÕö6ÆÇ5öVæ&ÆVC¢fÇ6RÀ¢'VçF–ÖUövVçG5öVæ&ÆVC¢fÇ6RÀ¢7&VFVEö'“¢WF†÷&—G’æ7F÷$–BÀ¢Ò“°¢&WGW&â&ÇVW&–çC°§Ó° ¦6öç7BW†V7WFTVçFW'&—6T6öÖÖæBÒ7–æ2†WF†÷&—G“¢WF†÷&—G’ÂVçfVÆ÷S¢VçFW'&—6T6öÖÖæDVçfVÆ÷R’Óâ°¢6öç7B6öÖÖæD6&–Æ—F–W3¢&V6÷&CÄVçFW'&—6T6öÖÖæEG—RÂ7G&–æuµÓâÒ°¢w&÷f–FW"ç&Vv—7FW"s¢²v'–ö²æÖævRrÂw6V7W&—G’æÖævRuÒÀ¢w&÷f–FW"çfÆ–FFRs¢²v'–ö²æÖævRrÂw6V7W&—G’æÖævRuÒÀ¢w&÷f–FW"æ7F—fFRs¢²v'–ö²æÖævRrÂw6V7W&—G’æÖævRuÒÀ¢w&÷f–FW"ç&÷WFRçFövvÆRs¢²v'–ö²æÖævRrÂw6V7W&—G’æÖævRuÒÀ¢w&÷f–FW"ç&Wfö¶Rs¢²v'–ö²æÖævRrÂw6V7W&—G’æÖævRuÒÀ¢vWf–FVæ6Rç6÷W&6Ræ7&VFRs¢²vWf–FVæ6Rçw&—FRuÒÀ¢vWf–FVæ6RæW‡G&7Bs¢²vWf–FVæ6Rçw&—FRuÒÀ¢vWf–FVæ6Ræ6æF–FFRç&Wf–Wrs¢²vWf–FVæ6Rç&Wf–WruÒÀ¢vWf–FVæ6Ræ76W72ç&öÖ÷FRs¢²v76W76ÖVçBæVF—BuÒÀ¢vÖöFW&æ—¦F–öâæWfÇVFRs¢²w÷'FföÆ–òæÖævRuÒÀ¢v&÷fÂç&Wf–Wrç&V6÷&Bs¢²v&÷fÇ2ç&Wf–WruÒÀ¢v&÷fÂç&V6÷&Bs¢²v&÷fÇ2ç&Wf–WruÒÀ¢w7GVF–òæFVÆ—fW'’æ†æFöfbs¢²vFö72æ&÷fRuÒÀ¢vÖöæ—F÷"æ&6VÆ–æRæ7&VFRs¢²vÖöæ—F÷"æÖævRuÒÀ¢v76VÖ&ÆRæ&ÇVW&–çBæ7&VFRs¢²v76VÖ&ÆRæÖævRuÒÀ¢Ó°¢v—B76W'Dg&W6„WF†÷&—G’†WF†÷&—G’Â6öÖÖæD6&–Æ—F–W5¶VçfVÆ÷Ræ6öÖÖæEG—UÒ“°¢7v—F6‚†VçfVÆ÷Ræ6öÖÖæEG—R’°¢66Rw&÷f–FW"ç&Vv—7FW"s¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"ç&Vv—7FW"rÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66Rw&÷f–FW"çfÆ–FFRs¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"çfÆ–FFRrÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66Rw&÷f–FW"æ7F—fFRs¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"æ7F—fFRrÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66Rw&÷f–FW"ç&÷WFRçFövvÆRs¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"ç&÷WFRçFövvÆRrÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66Rw&÷f–FW"ç&Wfö¶Rs¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"ç&Wfö¶RrÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66RvWf–FVæ6Rç6÷W&6Ræ7&VFRs¢&WGW&â6öÖÖæDWf–FVæ6U6÷W&6T7&VFR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66RvWf–FVæ6RæW‡G&7Bs¢&WGW&â6öÖÖæDWf–FVæ6TW‡G&7B†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66RvWf–FVæ6Ræ6æF–FFRç&Wf–Wrs¢&WGW&â6öÖÖæDWf–FVæ6T6æF–FFU&Wf–Wr†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66RvWf–FVæ6Ræ76W72ç&öÖ÷FRs¢&WGW&â6öÖÖæDWf–FVæ6T76W75&öÖ÷FR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66RvÖöFW&æ—¦F–öâæWfÇVFRs¢&WGW&â6öÖÖæDÖöFW&æ—¦F–öäWfÇVFR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66Rv&÷fÂç&Wf–Wrç&V6÷&Bs¢&WGW&â6öÖÖæD&÷fÅ&Wf–Wu&V6÷&B†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66Rv&÷fÂç&V6÷&Bs¢&WGW&â6öÖÖæD&÷fÅ&V6÷&B†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66Rw7GVF–òæFVÆ—fW'’æ†æFöfbs¢&WGW&â6öÖÖæE7GVF–ôFVÆ—fW'”†æFöfb†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66RvÖöæ—F÷"æ&6VÆ–æRæ7&VFRs¢&WGW&â6öÖÖæDÖöæ—F÷$&6VÆ–æT7&VFR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢66Rv76VÖ&ÆRæ&ÇVW&–çBæ7&VFRs¢&WGW&â6öÖÖæD76VÖ&ÆT&ÇVW&–çD7&VFR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöB“°¢Ğ§Ó° ¦W‡÷'B6öç7BVçFW'&—6T6öÖÖæDW'&÷$&öG’Ò†W'&÷#¢VçFW'&—6T6öÖÖæDW'&÷"’Óâ‡°¢ö³¢fÇ6RÀ¢W'&÷#¢²6öFS¢W'&÷"æ6öFRÂÖW76vS¢uF†RVçFW'&—6R–çFVÆÆ–vVæ6R6öÖÖæB6÷VÆBæ÷B&R6ö×ÆWFVBârÒÀ§Ò“° ¦W‡÷'B6öç7B†æFÆTVçFW'&—6T–çFVÆÆ–vVæ6U&WVW7BÒ7–æ2‡&WVW7C¢&WVW7B’Óâ°¢–b‡&WVW7BæÖWF†öBÓÒuõ5Br’&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†æWrVçFW'&—6T6öÖÖæDW'&÷"‚tÔUD„ôEôäõEôÄÄõtTBr’’ÂCR“°¢ÆWB6Æ–ÖVE&V6V—C¢&V6V—E&÷rÂçVÆÂÒçVÆÃ°¢ÆWB6Æ–ÖVDWF†÷&—G“¢WF†÷&—G’ÂçVÆÂÒçVÆÃ°¢G'’°¢6öç7BW6W"Òv—BvWDWF…W6W"‡&WVW7B“°¢6öç7B&öG’Òv—B&WVW7Bæ§6öâ‚“°¢6öç7BVçfVÆ÷RÒ'6TVçFW'&—6T6öÖÖæDVçfVÆ÷R†&öG’“°¢6öç7B÷&væ—¦F–öä–BÒv—B&W6öÇfT÷&t–B‡W6W"æ–BÂVçfVÆ÷Ræ÷&væ—¦F–öä–B“°¢–b†÷&væ—¦F–öä–BÓÒVçfVÆ÷Ræ÷&væ—¦F–öä–B’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚uDTäåEô44U55ôDTä”TBr“°¢6öç7BWF†÷&—G’Òv—B&W6öÇfTWF†÷&—G’‡W6W"æ–BÂ÷&væ—¦F–öä–BÂVçfVÆ÷Rçv÷&·76T–B“°¢6öç7B&WVW7D†6‚Òv—B6†#Sd§6öâ‡²ââæVçfVÆ÷RÂ&WVW7D–C¢çVÆÂÒ“°¢6öç7BW†—7F–ærÒv—Bf–æE&V6V—B†WF†÷&—G’ÂVçfVÆ÷R“°¢–b†W†—7F–ærbbW†—7F–ærç&WVW7Eö†6‚ÓÒ&WVW7D†6‚’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t”DTÕõDTä5•ô4ôädÄ”5BrÂC’“°¢–b†W†—7F–æsòç7FGW2ÓÓÒv6öÖÖ—GFVBr’°¢&WGW&â§6öå&W7öç6R‡²ö³¢G'VRÂ&WÆ–VC¢G'VRÂâââ†W†—7F–ærç&W7öç6RÇÂ·Ò’Â&W6÷W&6T–C¢W†—7F–ærç&W6÷W&6Uö–BÇÂVæFVf–æVBÒ“°¢Ğ¢–b†W†—7F–æsòç7FGW2ÓÓÒvf–ÆVBrÇÂW†—7F–æsòç7FGW2ÓÓÒv&Æö6¶VBr’°¢&WGW&â§6öå&W7öç6R‡²âââ†W†—7F–ærç&W7öç6RÇÂVçFW'&—6T6öÖÖæDW'&÷$&öG’†æWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô$Äô4´TBr’’’Â&WÆ–VC¢G'VRÒÂC’“°¢Ğ¢–b†W†—7F–æsòç7FGW2ÓÓÒv6Æ–ÖVBr’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô”åõ$ôu$U52r“°¢6öç7B&V6V—BÒv—B6Æ–Õ&V6V—B†WF†÷&—G’ÂVçfVÆ÷RÂ&WVW7D†6‚“°¢–b‡&V6V—Bç7FGW2ÓÓÒv6öÖÖ—GFVBr’°¢&WGW&â§6öå&W7öç6R‡²ö³¢G'VRÂ&WÆ–VC¢G'VRÂâââ‡&V6V—Bç&W7öç6RÇÂ·Ò’Â&W6÷W&6T–C¢&V6V—Bç&W6÷W&6Uö–BÇÂVæFVf–æVBÒ“°¢Ğ¢–b‡&V6V—Bç7FGW2ÓÒv6Æ–ÖVBr’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô”åõ$ôu$U52r“°¢–b‡&V6V—Bç&WVW7Eö–BÓÒVçfVÆ÷Rç&WVW7D–B’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô”åõ$ôu$U52r“°¢6Æ–ÖVE&V6V—BÒ&V6V—C°¢6Æ–ÖVDWF†÷&—G’ÒWF†÷&—G“°¢6öç7B&W7VÇBÒv—BW†V7WFTVçFW'&—6T6öÖÖæB†WF†÷&—G’ÂVçfVÆ÷R“°¢6öç7B&W7VÇDö&¦V7C¢§6öäö&¦V7BÒ—5&V6÷&B‡&W7VÇB’ò&W7VÇB¢²&W7VÇBÓ°¢6öç7B&W6÷W&6T–BÒG—Vöb&W7VÇDö&¦V7Bæ–BÓÓÒw7G&–ærp¢ò&W7VÇDö&¦V7Bæ–@¢¢G—Vöb&W7VÇDö&¦V7Bç6÷W&6T–BÓÓÒw7G&–ærp¢ò&W7VÇDö&¦V7Bç6÷W&6T–@¢¢G—Vöb&W7VÇDö&¦V7Bç&÷f–FW$6öæf–t–BÓÓÒw7G&–ærp¢ò&W7VÇDö&¦V7Bç&÷f–FW$6öæf–t–@¢¢G—Vöb&W7VÇDö&¦V7Bçv÷&µ6¶vT–BÓÓÒw7G&–ærp¢ò&W7VÇDö&¦V7Bçv÷&µ6¶vT–@¢¢G—Vöb&W7VÇDö&¦V7BæFV6—6–öä–BÓÓÒw7G&–ærp¢ò&W7VÇDö&¦V7BæFV6—6–öä–@¢¢VæFVf–æVC°¢v—B6ö×ÆWFU&V6V—B‡&V6V—BÂWF†÷&—G’Â&W7VÇDö&¦V7BÂ&W6÷W&6T–B“°¢&WGW&â§6öå&W7öç6R‡²ö³¢G'VRÂ&WÆ–VC¢fÇ6RÂââç&W7VÇDö&¦V7BÒ“°¢Ò6F6‚†W'&÷"’°¢6öç7B6öÖÖæDW'&÷"ÒW'&÷"–ç7Fæ6VöbVçFW'&—6T6öÖÖæDW'&÷"òW'&÷"¢æWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEõTäd”Ä$ÄRr“°¢–b†6Æ–ÖVE&V6V—Bbb6Æ–ÖVDWF†÷&—G’’°¢v—Bf–Å&V6V—B†6Æ–ÖVE&V6V—BÂ6Æ–ÖVDWF†÷&—G’ÂVçFW'&—6T6öÖÖæDW'&÷$&öG’†6öÖÖæDW'&÷"’Â6öÖÖæDW'&÷"æ6öFRÓÓÒuU$Ô•54”ôåôDTä”TBrÇÂ6öÖÖæDW'&÷"æ6öFRÓÓÒuDTäåEô44U55ôDTä”TBrÇÂ6öÖÖæDW'&÷"æ6öFRÓÓÒt4ôÔÔäEô$Äô4´TBr“°¢Ğ¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†6öÖÖæDW'&÷"’Â6öÖÖæDW'&÷"ç7FGW2“°¢Ğ§Ó° ¦W‡÷'B6öç7B†æFÆTVçFW'&—6T–çFVÆÆ–vVæ6T÷F–öç2Ò‡&WVW7C¢&WVW7B’Óâ†æFÆT÷F–öç2‡&WVW7B“°