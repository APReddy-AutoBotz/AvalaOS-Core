import type { TenantContextProjection } from '../types';
import { supabase } from './supabaseClient';
import {
  SYNTHETIC_ADMIN_CAPABILITY,
  SYNTHETIC_ADMIN_ERROR_CODES,
  SYNTHETIC_ADMIN_OPERATIONS,
  SYNTHETIC_ADMIN_ROLE_PRESETS,
  SYNTHETIC_ADMIN_STUDIO_VARIANTS,
  type SyntheticAdminEnvelope,
  type SyntheticAdminAssignableRolePreset,
  type SyntheticAdminErrorCode,
  type SyntheticAdminOperation,
  type SyntheticAdminResult,
  type SyntheticAdminRolePreset,
  type SyntheticAdminRosterItem,
  type SyntheticAdminStudioVariant,
  parseSyntheticAdminEnvelope,
  SyntheticAdminError,
} from './syntheticAdminContract';

const states = ['reserved','execution_claimed','reconciliation_required','active','revoked','ban_required','ban_uncertain'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOGIN = /^synthetic-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})@avalaos\.invalid$/i;
const own = (input: unknown): input is Record<string, unknown> =>
  Boolean(input && typeof input === 'object' && !Array.isArray(input));
const exact = (row: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(row).every(name => names.includes(name));
const uuid = (input: unknown): input is string => typeof input === 'string' && UUID.test(input);
const positiveVersion = (input: unknown): input is number => Number.isSafeInteger(input) && Number(input) >= 1;
const basePreset = (input: unknown): input is SyntheticAdminRolePreset =>
  typeof input === 'string' && (SYNTHETIC_ADMIN_ROLE_PRESETS as readonly string[]).includes(input);
const studioVariant = (input: unknown): input is SyntheticAdminStudioVariant =>
  typeof input === 'string' && (SYNTHETIC_ADMIN_STUDIO_VARIANTS as readonly string[]).includes(input);
const assignablePreset = (input: unknown): input is SyntheticAdminAssignableRolePreset =>
  basePreset(input) || studioVariant(input);
const expectedBaseByVariant: Record<SyntheticAdminStudioVariant,SyntheticAdminRolePreset> = {
  'studio-author':'author', 'studio-reviewer':'reviewer', 'studio-approver':'approver',
};
const exactRoleList = (input: unknown, expected: readonly string[]) =>
  Array.isArray(input) && input.length === expected.length && input.every((value,index) => value === expected[index]);

const exactEffectiveRole = (input: Record<string, unknown>) => {
  const variant = input.studioVariant;
  if (!assignablePreset(input.rolePreset) || !basePreset(input.baseRolePreset)
    || typeof input.studioVariantActive !== 'boolean') return false;
  if (variant === null) {
    return input.studioVariantActive === false && input.rolePreset === input.baseRolePreset;
  }
  if (!studioVariant(variant)) return false;
  return expectedBaseByVariant[variant] === input.baseRolePreset
    && input.studioVariantActive === (input.rolePreset === variant)
    && (input.rolePreset === input.baseRolePreset || input.rolePreset === variant);
};

export class SyntheticAdminOutcomeUnknown extends Error {
  constructor() { super('OUTCOME_UNKNOWN'); this.name = 'SyntheticAdminOutcomeUnknown'; }
}

export const canManageSyntheticUsers = (context: TenantContextProjection | null, sessionState = 'ready') =>
  sessionState === 'ready' && !!context
  && context.capabilities.includes('org.admin')
  && context.capabilities.includes(SYNTHETIC_ADMIN_CAPABILITY);

const rosterItem = (input: unknown): SyntheticAdminRosterItem => {
  if (!own(input) || !exact(input, ['reservationId','label','loginId','rolePreset','baseRolePreset','studioVariant',
    'studioVariantActive','assignableRolePresets','state','version'])
    || !uuid(input.reservationId) || typeof input.loginId !== 'string'
    || !LOGIN.test(input.loginId) || LOGIN.exec(input.loginId)?.[1] !== input.reservationId
    || typeof input.label !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/.test(input.label)
    || !exactEffectiveRole(input)
    || !exactRoleList(input.assignableRolePresets, input.studioVariant === null
      ? SYNTHETIC_ADMIN_ROLE_PRESETS : [String(input.baseRolePreset),String(input.studioVariant)])
    || !(states as readonly string[]).includes(String(input.state)) || !positiveVersion(input.version)) {
    throw new SyntheticAdminError('TEMPORARY_FAILURE');
  }
  return input as SyntheticAdminRosterItem;
};

export const decodeSyntheticAdminResult = (input: unknown, operation: SyntheticAdminOperation): SyntheticAdminResult => {
  if (!own(input) || !exact(input, ['status','reservationId','loginId','version','roster','nextCursor',
    'rolePreset','baseRolePreset','studioVariant','studioVariantActive'])
    || typeof input.status !== 'string') throw new SyntheticAdminError('TEMPORARY_FAILURE');
  if (operation === 'list') {
    if (input.status !== 'listed' || !Array.isArray(input.roster)
      || input.roster.length > 20 || (input.nextCursor !== null && input.nextCursor !== undefined && !uuid(input.nextCursor))
      || 'reservationId' in input || 'version' in input || 'loginId' in input) throw new SyntheticAdminError('TEMPORARY_FAILURE');
    const roster = input.roster.map(rosterItem);
    if (new Set(roster.map(item => item.reservationId)).size !== roster.length) throw new SyntheticAdminError('TEMPORARY_FAILURE');
    return { status:'listed', roster, nextCursor: input.nextCursor as string | null | undefined };
  }
  if (operation === 'grant_operator_assess_read' || operation === 'remove_operator_assess_read') {
    const expected = operation === 'grant_operator_assess_read' ? 'operator_access_granted' : 'operator_access_removed';
    if (input.status !== expected || !positiveVersion(input.version)
      || 'reservationId' in input || 'loginId' in input || 'roster' in input || 'nextCursor' in input)
      throw new SyntheticAdminError('TEMPORARY_FAILURE');
    return { status: expected, version: input.version };
  }
  const hasRoleProjection = ['rolePreset','baseRolePreset','studioVariant','studioVariantActive']
    .some(key => key in input);
  if (hasRoleProjection && (operation !== 'assign_role'
    || !exact(input, ['status','reservationId','version','rolePreset','baseRolePreset','studioVariant','studioVariantActive'])
    || !exactEffectiveRole(input))) throw new SyntheticAdminError('TEMPORARY_FAILURE');
  if (!(states as readonly string[]).includes(input.status)
    || !uuid(input.reservationId) || !positiveVersion(input.version)
    || (input.loginId !== undefined && (typeof input.loginId !== 'string' || !LOGIN.test(input.loginId) || LOGIN.exec(input.loginId)?.[1] !== input.reservationId))
    || 'roster' in input || 'nextCursor' in input) throw new SyntheticAdminError('TEMPORARY_FAILURE');
  return { status:input.status as SyntheticAdminResult['status'], reservationId:input.reservationId,
    loginId:input.loginId as string | undefined, version:input.version,
    ...(hasRoleProjection ? {
      rolePreset:input.rolePreset as SyntheticAdminAssignableRolePreset,
      baseRolePreset:input.baseRolePreset as SyntheticAdminRolePreset,
      studioVariant:input.studioVariant as SyntheticAdminStudioVariant | null,
      studioVariantActive:input.studioVariantActive as boolean,
    } : {}),
  };
};

const knownError = (input: unknown): SyntheticAdminErrorCode | null => {
  if (!own(input) || !exact(input, ['errorCode']) || typeof input.errorCode !== 'string') return null;
  return (SYNTHETIC_ADMIN_ERROR_CODES as readonly string[]).includes(input.errorCode)
    ? input.errorCode as SyntheticAdminErrorCode : null;
};

export type SyntheticAdminTransport = (body: SyntheticAdminEnvelope) => Promise<unknown>;

export const defaultSyntheticAdminTransport: SyntheticAdminTransport = async body => {
  const { data, error } = await supabase.functions.invoke('synthetic-admin', { body });
  if (error) {
    let payload: unknown;
    try { payload = await (error as {context?: {clone?: () => {json?: () => Promise<unknown>}}}).context?.clone?.().json?.(); }
    catch { payload = undefined; }
    const code = knownError(payload);
    if (code) throw new SyntheticAdminError(code);
    throw new SyntheticAdminOutcomeUnknown();
  }
  return data;
};

export const syntheticAdminRequest = async (
  context: TenantContextProjection,
  operation: SyntheticAdminOperation,
  payload: Record<string, unknown>,
  transport: SyntheticAdminTransport = defaultSyntheticAdminTransport,
  binding?: { requestId: string; idempotencyKey: string },
): Promise<SyntheticAdminResult> => {
  if (!canManageSyntheticUsers(context) || !(SYNTHETIC_ADMIN_OPERATIONS as readonly string[]).includes(operation))
    throw new SyntheticAdminError('PERMISSION_DENIED');
  const write = operation !== 'list';
  const envelope = parseSyntheticAdminEnvelope({
    operation,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    expectedAuthorizationVersion: context.authorizationVersion,
    ...(write ? binding ?? {requestId:crypto.randomUUID(),idempotencyKey:`synthetic-admin:${operation}:${crypto.randomUUID()}`} : {}),
    payload,
  });
  const result = await transport(envelope);
  return decodeSyntheticAdminResult(result, operation);
};

export const syntheticAdminErrorCopy = (error: unknown) => {
  if (error instanceof SyntheticAdminOutcomeUnknown) return 'The server result is unknown. Reconcile this operation before taking another action.';
  if (!(error instanceof SyntheticAdminError)) return 'The result is unknown. Reconcile before taking another action.';
  const messages: Record<SyntheticAdminErrorCode,string> = {
    INVALID_REQUEST:'Check the account label, role, and password requirements.',
    NOT_FOUND:'This account operation is no longer available in the selected workspace.',
    PERMISSION_DENIED:'Your current workspace role cannot manage synthetic users.',
    AUTHORIZATION_STALE:'Your permissions changed. Refresh the workspace before continuing.',
    VERSION_CONFLICT:'The account changed. Reload its server state before continuing.',
    FEATURE_DISABLED:'Synthetic account management is disabled for this environment.',
    RECONCILIATION_REQUIRED:'The prior account action needs reconciliation before another change.',
    QUOTA_EXCEEDED:'The synthetic account limit has been reached.',
    TEMPORARY_FAILURE:'The operation could not be confirmed. Reconcile its server state before another change.',
    IDEMPOTENCY_CONFLICT:'The saved operation key conflicts with another request. Reconcile the original operation.',
  };
  return messages[error.errorCode];
};
