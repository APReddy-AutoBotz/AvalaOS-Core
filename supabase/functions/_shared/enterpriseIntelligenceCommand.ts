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
  )).map(role => role.idÛ¾}ŞÚ$z{-®éÜj×VÒçF—FÆRÀĞ¢FW67&—F–öã¢—FVÒæFW67&—F–öâÀĞ¢66WFæ6T7&—FW&–¢'&’æ—4'&’†—FVÒæ66WFæ6Uö7&—FW&–’ò—FVÒæ66WFæ6Uö7&—FW&–æf–ÇFW"‚‡fÇVR“¢fÇVR—27G&–ærÓâG—VöbfÇVRÓÓÒw7G&–ærr’¢µÒÀĞ¢æöägVæ7F–öæÅ&WV—&VÖVçG3¢'&’æ—4'&’†—FVÒææöåögVæ7F–öæÅ÷&WV—&VÖVçG2’ò—FVÒææöåögVæ7F–öæÅ÷&WV—&VÖVçG2æf–ÇFW"‚‡fÇVR“¢fÇVR—27G&–ærÓâG—VöbfÇVRÓÓÒw7G&–ærr’¢µÒÀĞ¢6÷W&6U6V7F–öäÆö6F÷#¢—FVÒç6÷W&6U÷6V7F–öåöÆö6F÷"ÀĞ¢6÷W&6TFö7VÖVçD–C¢fW'6–öâç7GVF–õöFö7VÖVçEö–BÀĞ¢6÷W&6TFö7VÖVçEfW'6–öã¢fW'6–öâç7GVF–õ÷fW'6–öâÀĞ¢6÷W&6TFö7VÖVçD†6ƒ¢fW'6–öâç7GVF–õö6öçFVçEö†6‚ÀĞ¢Ò’’ÀĞ¢&Æö6¶W'3¢µÒÀĞ¢&WV—&W4‡VÖå&Wf–Ws¢G'VR26öç7BÀĞ¢6åV&Æ—6ƒ¢fÇ6R26öç7BÀĞ¢Ó°Ğ¢6öç7B&6VÆ–æT–BÒÆææVEWV–B‡&V6V—BÂvÖöæ—F÷$&6VÆ–æT–Br“°¢v—BVç7W&TW†V7WF–öåÆâ‡&V6V—BÂWF†÷&—G’Â²Ööæ—F÷$&6VÆ–æT–C¢&6VÆ–æT–BÂv÷&µ6¶vT–BÂ6¶vUfW'6–öä–BÒ“°Ğ¢6öç7B&6VÆ–æRÒ'V–ÆDÖöæ—F÷$&6VÆ–æR‡²–C¢&6VÆ–æT–BÂv÷&µ6¶vT–C¢fW'6–öâçv÷&µ÷6¶vUö–BÂv÷&µ6¶vS¢v÷&µ6¶vTG&gBÂ&÷fVD—FVÔ–G3¢—FVÕ&÷w2æÖ†—FVÒÓâ—FVÒæ–B’Ò“°¢6öç7B&W7VÇBÒ²ââæ&6VÆ–æRÂ&W6÷W&6T–C¢&6VÆ–æRæ–BÓ°¢v—B'2‚vVçFW'&—6Uö6öÖÖ—EöÖöæ—F÷%ö&6VÆ–æRrÂ°¢ö&6VÆ–æS¢°Ğ¢–C¢&6VÆ–æRæ–BÀĞ¢v÷&µ6¶vUfW'6–öä–C¢6¶vUfW'6–öä–BÀĞ¢&÷fVD—FVÔ–G3¢&6VÆ–æRæ&÷fVD—FVÔ–G2ÀĞ¢Ö–ÆW7FöæW3¢&6VÆ–æRæÖ–ÆW7FöæW2ÀĞ¢FWVæFVæ6–W3¢&6VÆ–æRæFWVæFVæ6–W2ÀĞ¢&Æö6¶W'3¢&6VÆ–æRæ&Æö6¶W'2ÀĞ¢&—6·3¢&6VÆ–æRç&—6·2ÀĞ¢ÒÀĞ¢ö7F÷#¢WF†÷&—G’æ7F÷$–BÀĞ¢ö÷&s¢WF†÷&—G’æ÷&væ—¦F–öä–BÀĞ¢÷v÷&·76S¢WF†÷&—G’çv÷&·76T–BÀĞ¢ââç&V6V—D×WFF–öä&w2‡&V6V—BÂ&W7VÇB2Væ¶æ÷vâ2§6öäö&¦V7B’À¢Ò“°¢&WGW&â&W7VÇC°§Ó° ¦6öç7B6öÖÖæD76VÖ&ÆT&ÇVW&–çD7&VFRÒ7–æ2†WF†÷&—G“¢WF†÷&—G’Â–ÆöC¢§6öäö&¦V7BÂ&V6V—C¢VçFW'&—6U&V6V—E&÷r“¢&öÖ—6SÄ76VÖ&ÆT&ÇVW&–çDG&gBb²&W6÷W&6T–C¢7G&–ærÓâÓâ°¢&WV—&UW&Ö—76–öâ†WF†÷&—G’Âv76VÖ&ÆRæÖævRr“°Ğ¢6öç7BFV6—6–öä–BÒ&WV—&UWV–B‡–ÆöBæÖöFW&æ—¦F–öäFV6—6–öä–B“°Ğ¢6öç7BFV6—6–öâÒv—Bf–æDöæSÇ²–C¢7G&–æs²&–Ö'•öF—7÷6—F–öã¢ÖöFW&æ—¦F–öäF—7÷6—F–öã²7FGW3¢7G&–ærÓâ€Ğ¢vVçFW'&—6UöÖöFW&æ—¦F–öåöFV6—6–öç2rÀĞ¢6VÆV7CÖ–BÇ&–Ö'•öF—7÷6—F–öâÇ7FGW2f÷&uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’æ÷&væ—¦F–öä–B—Ògv÷&·76Uö–CÖWâG¶Væ6öFUU$”6ö×öæVçB†WF†÷&—G’çv÷&·76T–B—Òf–CÖWâG¶Væ6öFUU$”6ö×öæVçB†FV6—6–öä–B—ÖÀĞ¢“°Ğ¢–b‚FV6—6–öâÇÂFV6—6–öâç7FGW2ÓÒv&÷fVBrÇÂ54TÔ$ÄUôTÄ”t”$ÄUôD•5õ4•D”ôå2æ–æ6ÇVFW2†FV6—6–öâç&–Ö'•öF—7÷6—F–öâ’’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô$Äô4´TBr“°Ğ¢6öç7B&ÇVW&–çD–BÒÆææVEWV–B‡&V6V—BÂv76VÖ&ÆT&ÇVW&–çD–Br“°Ğ¢v—BVç7W&TW†V7WF–öåÆâ‡&V6V—BÂWF†÷&—G’Â²76VÖ&ÆT&ÇVW&–çD–C¢&ÇVW&–çD–BÂÖöFW&æ—¦F–öäFV6—6–öä–C¢FV6—6–öâæ–BÒ“°Ğ¢6öç7B&ÇVW&–çBÒ'V–ÆD76VÖ&ÆT&ÇVW&–çDG&gB‡°¢&ÇVW&–çD–BÀĞ¢ÖöFW&æ—¦F–öäFV6—6–öä–C¢FV6—6–öâæ–BÀĞ¢F—7÷6—F–öã¢FV6—6–öâç&–Ö'•öF—7÷6—F–öâÀĞ¢æÖS¢&WV—&U7G&–ær‡–ÆöBææÖRÂ#C’ÀĞ¢Ò“°¢6öç7B&W7VÇBÒ²ââæ&ÇVW&–çBÂ&W6÷W&6T–C¢&ÇVW&–çBæ–BÓ°¢v—B'2‚vVçFW'&—6Uö6öÖÖ—Eö76VÖ&ÆUö&ÇVW&–çBrÂ°¢ö&ÇVW&–çC¢²ââæ&ÇVW&–çBÂ7G'V7GW&VD6öçFVçC¢&ÇVW&–çBÒÀĞ¢ö7F÷#¢WF†÷&—G’æ7F÷$–BÀĞ¢ö÷&s¢WF†÷&—G’æ÷&væ—¦F–öä–BÀĞ¢÷v÷&·76S¢WF†÷&—G’çv÷&·76T–BÀĞ¢ââç&V6V—D×WFF–öä&w2‡&V6V—BÂ&W7VÇB2Væ¶æ÷vâ2§6öäö&¦V7B’À¢Ò“°¢&WGW&â&W7VÇC°§Ó° Ğ¦6öç7BW†V7WFTVçFW'&—6T6öÖÖæBÒ7–æ2†WF†÷&—G“¢WF†÷&—G’ÂVçfVÆ÷S¢VçFW'&—6T6öÖÖæDVçfVÆ÷RÂ&V6V—C¢VçFW'&—6U&V6V—E&÷r’Óâ°¢6öç7B&÷f–FW$÷W&F–öâÒVçFW'&—6U&÷f–FW$÷W&F–öç5¶VçfVÆ÷Ræ6öÖÖæEG—UÓ°¢–b‡&÷f–FW$÷W&F–öâ’°¢76W'DVçFW'&—6T6öÖÖæD÷W&F–öäWF†÷&—G’†WF†÷&—G’ÂVçfVÆ÷Ræ6öÖÖæEG—R“°¢ÒVÇ6R°¢v—B76W'Dg&W6„WF†÷&—G’†WF†÷&—G’Â&WV—&VD6&–Æ—F–W4f÷$VçFW'&—6T6öÖÖæB†VçfVÆ÷Ræ6öÖÖæEG—R’“°¢Ğ¢7v—F6‚†VçfVÆ÷Ræ6öÖÖæEG—R’°Ğ¢66Rw&÷f–FW"ç&Vv—7FW"s¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"ç&Vv—7FW"rÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66Rw&÷f–FW"çfÆ–FFRs¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"çfÆ–FFRrÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66Rw&÷f–FW"æ7F—fFRs¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"æ7F—fFRrÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66Rw&÷f–FW"ç&÷WFRçFövvÆRs¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"ç&÷WFRçFövvÆRrÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66Rw&÷f–FW"ç&Wfö¶Rs¢&WGW&â6öÖÖæE&÷f–FW$Æ–fV7–6ÆR‚w&÷f–FW"ç&Wfö¶RrÂWF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66RvWf–FVæ6Rç6÷W&6Ræ7&VFRs¢&WGW&â6öÖÖæDWf–FVæ6U6÷W&6T7&VFR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66RvWf–FVæ6RæW‡G&7Bs¢&WGW&â6öÖÖæDWf–FVæ6TW‡G&7B†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66RvWf–FVæ6Ræ6æF–FFRç&Wf–Wrs¢&WGW&â6öÖÖæDWf–FVæ6T6æF–FFU&Wf–Wr†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66RvWf–FVæ6Ræ76W72ç&öÖ÷FRs¢&WGW&â6öÖÖæDWf–FVæ6T76W75&öÖ÷FR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66RvÖöFW&æ—¦F–öâæWfÇVFRs¢&WGW&â6öÖÖæDÖöFW&æ—¦F–öäWfÇVFR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66Rv&÷fÂç&Wf–Wrç&V6÷&Bs¢&WGW&â6öÖÖæD&÷fÅ&Wf–Wu&V6÷&B†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66Rv&÷fÂç&V6÷&Bs¢&WGW&â6öÖÖæD&÷fÅ&V6÷&B†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66Rw7GVF–òæFVÆ—fW'’æ†æFöfbs¢&WGW&â6öÖÖæE7GVF–ôFVÆ—fW'”†æFöfb†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66RvÖöæ—F÷"æ&6VÆ–æRæ7&VFRs¢&WGW&â6öÖÖæDÖöæ—F÷$&6VÆ–æT7&VFR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢66Rv76VÖ&ÆRæ&ÇVW&–çBæ7&VFRs¢&WGW&â6öÖÖæD76VÖ&ÆT&ÇVW&–çD7&VFR†WF†÷&—G’ÂVçfVÆ÷Rç–ÆöBÂ&V6V—B“°Ğ¢ĞĞ§Ó°Ğ Ğ¦W‡÷'B6öç7BVçFW'&—6T6öÖÖæDW'&÷$&öG’Ò†W'&÷#¢VçFW'&—6T6öÖÖæDW'&÷"’Óâ‡°Ğ¢ö³¢fÇ6RÀĞ¢W'&÷#¢²6öFS¢W'&÷"æ6öFRÂÖW76vS¢uF†RVçFW'&—6R–çFVÆÆ–vVæ6R6öÖÖæB6÷VÆBæ÷B&R6ö×ÆWFVBârÒÀĞ§Ò“°Ğ Ğ¦W‡÷'BG—RVçFW'&—6T–çFVÆÆ–vVæ6T†æFÆW$÷fW'&–FW2Ò°¢WF†VçF–6FSó¢G—VöbvWDWF…W6W#°Ğ¢&W6öÇfT÷&væ—¦F–öãó¢G—Vöb&W6öÇfT÷&t–C°Ğ¢&W6öÇfT6öÖÖæDWF†÷&—G“ó¢G—Vöb&W6öÇfTWF†÷&—G“°Ğ¢76W'D7W'&VçDWF†÷&—G“ó¢G—Vöb76W'D7W'&VçDVçFW'&—6T6öÖÖæDWF†÷&—G“°Ğ¢6Æ–Õ&V6V—Có¢G—Vöb6Æ–ÔVçFW'&—6U&V6V—C°¢&VÆöE&V6V—Có¢G—Vöb&VÆöDVçFW'&—6U&V6V—C°¢6ö×ÆWFU&V6V—Có¢G—Vöb6ö×ÆWFTVçFW'&—6U&V6V—C°¢f–Å&V6V—Có¢G—Vöbf–ÄVçFW'&—6U&V6V—C°¢W†V7WFT6öÖÖæCó¢G—VöbW†V7WFTVçFW'&—6T6öÖÖæC°§Ó° ¦6öç7B76W'D6öÖÖ—GFVDVçFW'&—6U&V6V—D–FVçF—G’Ò€¢&V6V—C¢VçFW'&—6U&V6V—E&÷rÀ¢6öÖÖæEG—S¢VçFW'&—6T6öÖÖæEG—RÀ¢’Óâ°¢–b‡&V6V—Bç7FGW2ÓÒv6öÖÖ—GFVBrÇÂ—5&V6÷&B‡&V6V—Bç&W7öç6R’’°¢F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚u$T4T•Eôd”äÄ•¤D”ôåôd”ÄTBr“°¢Ğ¢6öç7B&W6÷W&6T–BÒ&W6öÇfTVçFW'&—6T6öÖÖæE&W6÷W&6T–B†6öÖÖæEG—RÂ&V6V—Bç&W7öç6R“°¢–b‡&V6V—Bç&W6÷W&6Uö–BÓÒ&W6÷W&6T–B’°¢F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚u$T4T•Eôd”äÄ•¤D”ôåôd”ÄTBr“°¢Ğ¢&WGW&â&W6÷W&6T–C°§Ó° Ğ¦W‡÷'B6öç7B†æFÆTVçFW'&—6T–çFVÆÆ–vVæ6U&WVW7BÒ7–æ2€Ğ¢&WVW7C¢&WVW7BÀĞ¢÷fW'&–FW3¢VçFW'&—6T–çFVÆÆ–vVæ6T†æFÆW$÷fW'&–FW2Ò·ÒÀĞ¢’Óâ°¢–b‡&WVW7BæÖWF†öBÓÒuõ5Br’&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†æWrVçFW'&—6T6öÖÖæDW'&÷"‚tÔUD„ôEôäõEôÄÄõtTBr’’ÂCR“°¢6öç7B76W'D7W'&VçDWF†÷&—G’Ò÷fW'&–FW2æ76W'D7W'&VçDWF†÷&—G’ÇÂ76W'D7W'&VçDVçFW'&—6T6öÖÖæDWF†÷&—G“°¢6öç7BW†V7WFT6öÖÖæBÒ÷fW'&–FW2æW†V7WFT6öÖÖæBÇÂW†V7WFTVçFW'&—6T6öÖÖæC°¢6öç7B6ö×ÆWFU&V6V—BÒ÷fW'&–FW2æ6ö×ÆWFU&V6V—BÇÂ6ö×ÆWFTVçFW'&—6U&V6V—C°¢6öç7Bf–Å&V6V—BÒ÷fW'&–FW2æf–Å&V6V—BÇÂf–ÄVçFW'&—6U&V6V—C°¢ÆWB6Æ–ÖVE&V6V—C¢VçFW'&—6U&V6V—E&÷rÂçVÆÂÒçVÆÃ°¢ÆWB6Æ–ÖVDWF†÷&—G“¢WF†÷&—G’ÂçVÆÂÒçVÆÃ°Ğ¢ÆWB6Æ–ÖVD6öÖÖæEG—S¢VçFW'&—6T6öÖÖæEG—RÂçVÆÂÒçVÆÃ°Ğ¢G'’°Ğ¢6öç7BW6W"Òv—B†÷fW'&–FW2æWF†VçF–6FRÇÂvWDWF…W6W"’‡&WVW7B“°Ğ¢6öç7B&öG’Òv—B&WVW7Bæ§6öâ‚“°Ğ¢6öç7BVçfVÆ÷RÒ'6TVçFW'&—6T6öÖÖæDVçfVÆ÷R†&öG’“°Ğ¢6öç7B÷&væ—¦F–öä–BÒv—B†÷fW'&–FW2ç&W6öÇfT÷&væ—¦F–öâÇÂ&W6öÇfT÷&t–B’‡W6W"æ–BÂVçfVÆ÷Ræ÷&væ—¦F–öä–B“°Ğ¢–b†÷&væ—¦F–öä–BÓÒVçfVÆ÷Ræ÷&væ—¦F–öä–B’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚uDTäåEô44U55ôDTä”TBr“°Ğ¢6öç7B&W6öÇfVDWF†÷&—G’Òv—B†÷fW'&–FW2ç&W6öÇfT6öÖÖæDWF†÷&—G’ÇÂ&W6öÇfTWF†÷&—G’’€Ğ¢W6W"æ–BÂ÷&væ—¦F–öä–BÂVçfVÆ÷Rçv÷&·76T–BÀĞ¢“°Ğ¢6öç7BWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’‡&W6öÇfVDWF†÷&—G’ÂVçfVÆ÷Ræ6öÖÖæEG—R“°¢6öç7B²&WVW7D–C¢÷G&ç7÷'E&WVW7D–BÂââæ6æöæ–6ÄVçfVÆ÷RÒÒVçfVÆ÷S°Ğ¢6öç7B&WVW7D†6‚Òv—B†6…&V6V—EfÇVR†6æöæ–6ÄVçfVÆ÷R“°Ğ¢6öç7B&W6÷W&6UG—RÒVçfVÆ÷Ræ6öÖÖæEG—RÓÓÒv&÷fÂç&Wf–Wrç&V6÷&BrÇÂVçfVÆ÷Ræ6öÖÖæEG—RÓÓÒv&÷fÂç&V6÷&BpĞ¢ò&WV—&U7G&–ær†VçfVÆ÷Rç–ÆöBç&W6÷W&6UG—RÂƒĞ¢¢çVÆÃ°Ğ¢6öç7B²&V6V—BÂ÷vç4W†V7WF–öâÒÒv—B†÷fW'&–FW2æ6Æ–Õ&V6V—BÇÂ6Æ–ÔVçFW'&—6U&V6V—B’†WF†÷&—G’Â°Ğ¢6öÖÖæEG—S¢VçfVÆ÷Ræ6öÖÖæEG—RÀĞ¢–FV×÷FVæ7”¶W“¢VçfVÆ÷Ræ–FV×÷FVæ7”¶W’ÀĞ¢&WVW7D–C¢VçfVÆ÷Rç&WVW7D–BÀĞ¢&WVW7D†6‚ÀĞ¢&W6÷W&6UG—RÀĞ¢Ò“°Ğ¢6öç7BF—66Æ÷7W&TWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†WF†÷&—G’ÂVçfVÆ÷Ræ6öÖÖæEG—R“°¢–b‡&V6V—Bç7FGW2ÓÓÒv6öÖÖ—GFVBr’°¢76W'D6öÖÖ—GFVDVçFW'&—6U&V6V—D–FVçF—G’‡&V6V—BÂVçfVÆ÷Ræ6öÖÖæEG—R“°¢&WGW&â§6öå&W7öç6R‡²ö³¢G'VRÂ&WÆ–VC¢G'VRÂâââ‡&V6V—Bç&W7öç6RÇÂ·Ò’Ò“°¢ĞĞ¢–b‡&V6V—Bç7FGW2ÓÓÒvf–ÆVBrÇÂ&V6V—Bç7FGW2ÓÓÒv&Æö6¶VBr’°¢&WGW&â§6öå&W7öç6R€¢²âââ‡&V6V—Bç&W7öç6RÇÂVçFW'&—6T6öÖÖæDW'&÷$&öG’†æWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô$Äô4´TBr’’’Â&WÆ–VC¢G'VRÒÀ¢VçFW'&—6T6öÖÖæE7FGW4f÷%FW&Ö–æÅ&V6V—B‡&V6V—B’À¢“°¢ĞĞ¢–b‡&V6V—Bç7FGW2ÓÒv6Æ–ÖVBrÇÂ÷vç4W†V7WF–öâ’F‡&÷ræWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEô”åõ$ôu$U52r“°Ğ¢6Æ–ÖVE&V6V—BÒ&V6V—C°Ğ¢6Æ–ÖVDWF†÷&—G’ÒF—66Æ÷7W&TWF†÷&—G“°Ğ¢6Æ–ÖVD6öÖÖæEG—RÒVçfVÆ÷Ræ6öÖÖæEG—S°Ğ¢6öç7B&W7VÇBÒv—BW†V7WFT6öÖÖæB†F—66Æ÷7W&TWF†÷&—G’ÂVçfVÆ÷RÂ&V6V—B“°¢6öç7B&W7VÇDö&¦V7C¢§6öäö&¦V7BÒ—5&V6÷&B‡&W7VÇB’ò&W7VÇB¢²&W7VÇBÓ°Ğ¢6öç7B&W6÷W&6T–BÒ&W6öÇfTVçFW'&—6T6öÖÖæE&W6÷W&6T–B†VçfVÆ÷Ræ6öÖÖæEG—RÂ&W7VÇDö&¦V7B“°Ğ¢6öç7Bf–æÄWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†F—66Æ÷7W&TWF†÷&—G’ÂVçfVÆ÷Ræ6öÖÖæEG—R“°Ğ¢6Æ–ÖVDWF†÷&—G’Òf–æÄWF†÷&—G“°Ğ¢6öç7B6ö×ÆWFVBÒv—B6ö×ÆWFU&V6V—B€¢&V6V—BÀ¢f–æÄWF†÷&—G’À¢&W7VÇDö&¦V7BÀ¢&W6÷W&6T–BÀ¢7–æ2‚’Óâ°¢6öç7B&V6öæ6–Æ–F–öäWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†f–æÄWF†÷&—G’ÂVçfVÆ÷Ræ6öÖÖæEG—R“°¢6Æ–ÖVDWF†÷&—G’Ò&V6öæ6–Æ–F–öäWF†÷&—G“°¢&WGW&â&V6öæ6–Æ–F–öäWF†÷&—G“°¢ÒÀ¢“°¢76W'D6öÖÖ—GFVDVçFW'&—6U&V6V—D–FVçF—G’†6ö×ÆWFVBÂVçfVÆ÷Ræ6öÖÖæEG—R“°¢6Æ–ÖVDWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†f–æÄWF†÷&—G’ÂVçfVÆ÷Ræ6öÖÖæEG—R“°¢&WGW&â§6öå&W7öç6R‡²ö³¢G'VRÂ&WÆ–VC¢fÇ6RÂâââ†6ö×ÆWFVBç&W7öç6RÇÂ&W7VÇDö&¦V7B’Ò“°¢Ò6F6‚†W'&÷"’°Ğ¢6öç7B6öÖÖæDW'&÷"ÒW'&÷"–ç7Fæ6VöbVçFW'&—6T6öÖÖæDW'&÷ Ğ¢òW'&÷ Ğ¢¢W'&÷"–ç7Fæ6VöbVçFW'&—6U&V6V—DW'&÷ Ğ¢òæWrVçFW'&—6T6öÖÖæDW'&÷"†W'&÷"æ6öFRĞ¢¢—57W&6U'4W'&÷"†W'&÷"Ğ¢òÖVçFW'&—6T6öÖÖæE'4W'&÷"†W'&÷"Ğ¢¢æWrVçFW'&—6T6öÖÖæDW'&÷"‚t4ôÔÔäEõTäd”Ä$ÄRr“°Ğ¢–b†6Æ–ÖVE&V6V—Bbb6Æ–ÖVDWF†÷&—G’bb6Æ–ÖVD6öÖÖæEG—R’°¢G'’°¢6Æ–ÖVDWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†6Æ–ÖVDWF†÷&—G’Â6Æ–ÖVD6öÖÖæEG—R“°¢6öç7B&V6÷fW&VBÒv—B†÷fW'&–FW2ç&VÆöE&V6V—BÇÂ&VÆöDVçFW'&—6U&V6V—B’†6Æ–ÖVE&V6V—BÂ6Æ–ÖVDWF†÷&—G’“°¢–b‡&V6÷fW&VBç7FGW2ÓÓÒv6öÖÖ—GFVBr’°¢6Æ–ÖVDWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†6Æ–ÖVDWF†÷&—G’Â6Æ–ÖVD6öÖÖæEG—R“°¢76W'D6öÖÖ—GFVDVçFW'&—6U&V6V—D–FVçF—G’‡&V6÷fW&VBÂ6Æ–ÖVD6öÖÖæEG—R“°¢&WGW&â§6öå&W7öç6R‡²ö³¢G'VRÂ&WÆ–VC¢G'VRÂâââ‡&V6÷fW&VBç&W7öç6RÇÂ·Ò’Ò“°¢Ğ¢–b‡&V6÷fW&VBç7FGW2ÓÓÒvf–ÆVBrÇÂ&V6÷fW&VBç7FGW2ÓÓÒv&Æö6¶VBr’°¢6Æ–ÖVDWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†6Æ–ÖVDWF†÷&—G’Â6Æ–ÖVD6öÖÖæEG—R“°¢&WGW&â§6öå&W7öç6R€¢²âââ‡&V6÷fW&VBç&W7öç6RÇÂVçFW'&—6T6öÖÖæDW'&÷$&öG’†6öÖÖæDW'&÷"’’Â&WÆ–VC¢G'VRÒÀ¢VçFW'&—6T6öÖÖæE7FGW4f÷%FW&Ö–æÅ&V6V—B‡&V6÷fW&VB’À¢“°¢ĞĞ¢Ò6F6‚‡&V6÷fW'”W'&÷"’°Ğ¢–b‡&V6÷fW'”W'&÷"–ç7Fæ6VöbVçFW'&—6T6öÖÖæDW'&÷"bb&V6÷fW'”W'&÷"æ6öFRÓÓÒuU$Ô•54”ôåôDTä”TBr’°Ğ¢6öç7BFVæ–VBÒæWrVçFW'&—6T6öÖÖæDW'&÷"‚uU$Ô•54”ôåôDTä”TBr“°Ğ¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†FVæ–VB’ÂFVæ–VBç7FGW2“°Ğ¢Ğ¢–b†6öÖÖæDW'&÷"æ6öFRÓÓÒu$T4T•Eôd”äÄ•¤D”ôåôd”ÄTBr’°¢G'’°¢6Æ–ÖVDWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†6Æ–ÖVDWF†÷&—G’Â6Æ–ÖVD6öÖÖæEG—R“°¢Ò6F6‚°¢6öç7BFVæ–VBÒæWrVçFW'&—6T6öÖÖæDW'&÷"‚uU$Ô•54”ôåôDTä”TBr“°¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†FVæ–VB’ÂFVæ–VBç7FGW2“°¢Ğ¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†6öÖÖæDW'&÷"’Â6öÖÖæDW'&÷"ç7FGW2“°¢Ğ¢ĞĞ¢ĞĞ¢–b†6Æ–ÖVE&V6V—Bbb6Æ–ÖVDWF†÷&—G’bb6Æ–ÖVD6öÖÖæEG—Rbb6öÖÖæDW'&÷"æ6öFRÓÒu$T4T•Eôd”äÄ•¤D”ôåôd”ÄTBr’°Ğ¢G'’°¢6Æ–ÖVDWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†6Æ–ÖVDWF†÷&—G’Â6Æ–ÖVD6öÖÖæEG—R“°¢Ò6F6‚°¢6öç7BFVæ–VBÒæWrVçFW'&—6T6öÖÖæDW'&÷"‚uU$Ô•54”ôåôDTä”TBr“°¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†FVæ–VB’ÂFVæ–VBç7FGW2“°¢Ğ¢–b‡6†÷VÆE&W6W'fT6Æ–ÖVDVçFW'&—6U&V6V—B†W'&÷"Â6Æ–ÖVE&V6V—BæW†V7WF–öå÷Æâ’’°¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†6öÖÖæDW'&÷"’Â6öÖÖæDW'&÷"ç7FGW2“°¢Ğ¢G'’°¢v—Bf–Å&V6V—B€¢6Æ–ÖVE&V6V—BÀ¢6Æ–ÖVDWF†÷&—G’À¢VçFW'&—6T6öÖÖæDW'&÷$&öG’†6öÖÖæDW'&÷"’À¢6öÖÖæDW'&÷"æ6öFRÓÓÒuU$Ô•54”ôåôDTä”TBrÇÂ6öÖÖæDW'&÷"æ6öFRÓÓÒuDTäåEô44U55ôDTä”TBrÇÂ6öÖÖæDW'&÷"æ6öFRÓÓÒt4ôÔÔäEô$Äô4´TBrÀ¢7–æ2‚’Óâ°¢6öç7B&V6öæ6–Æ–F–öäWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†6Æ–ÖVDWF†÷&—G’Â6Æ–ÖVD6öÖÖæEG—R“°¢6Æ–ÖVDWF†÷&—G’Ò&V6öæ6–Æ–F–öäWF†÷&—G“°¢&WGW&â&V6öæ6–Æ–F–öäWF†÷&—G“°¢ÒÀ¢“°¢6Æ–ÖVDWF†÷&—G’Òv—B76W'D7W'&VçDWF†÷&—G’†6Æ–ÖVDWF†÷&—G’Â6Æ–ÖVD6öÖÖæEG—R“°¢Ò6F6‚†f–æÆ—¦F–öäW'&÷"’°¢–b†f–æÆ—¦F–öäW'&÷"–ç7Fæ6VöbVçFW'&—6T6öÖÖæDW'&÷ ¢bbf–æÆ—¦F–öäW'&÷"æ6öFRÓÓÒuU$Ô•54”ôåôDTä”TBr’°¢6öç7BFVæ–VBÒæWrVçFW'&—6T6öÖÖæDW'&÷"‚uU$Ô•54”ôåôDTä”TBr“°¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†FVæ–VB’ÂFVæ–VBç7FGW2“°¢Ğ¢6öç7BW‡Æ–6—Df–ÇW&RÒæWrVçFW'&—6T6öÖÖæDW'&÷"€¢f–æÆ—¦F–öäW'&÷"–ç7Fæ6VöbVçFW'&—6U&V6V—DW'&÷"òf–æÆ—¦F–öäW'&÷"æ6öFR¢u$T4T•Eôd”äÄ•¤D”ôåôd”ÄTBrÀĞ¢“°Ğ¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†W‡Æ–6—Df–ÇW&R’ÂW‡Æ–6—Df–ÇW&Rç7FGW2“°Ğ¢ĞĞ¢ĞĞ¢&WGW&â§6öå&W7öç6R†VçFW'&—6T6öÖÖæDW'&÷$&öG’†6öÖÖæDW'&÷"’Â6öÖÖæDW'&÷"ç7FGW2“°Ğ¢ĞĞ§Ó°Ğ Ğ¦W‡÷'B6öç7B†æFÆTVçFW'&—6T–çFVÆÆ–vVæ6T÷F–öç2Ò‡&WVW7C¢&WVW7B’Óâ†æFÆT÷F–öç2‡&WVW7B“°Ğ