import {
  parseSyntheticAdminEnvelope, SyntheticAdminError, SYNTHETIC_ADMIN_ROLE_PRESETS,
  type SyntheticAdminEnvelope, type SyntheticAdminResult,
} from '../../../services/syntheticAdminContract.ts';
import { handleOptions, jsonResponse } from './http.ts';
import { getAuthUser } from './supabase.ts';
import { syntheticAdminRpc, sqlScope } from './syntheticAdminDb.ts';
import { banSyntheticAuthUser, confirmsSyntheticAuthBan, createSyntheticAuthUser, matchesSyntheticAuthUser, readSyntheticAuthUserById } from './syntheticAdminAuth.ts';
import { readBoundedCreationJson } from './creationAccessRequestBody.ts';

declare const Deno: { env: { get(key: string): string | undefined } };
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOGIN_ID = /^synthetic-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@avalaos\.invalid$/;
const STATES = new Set(['reserved','execution_claimed','reconciliation_required','active','revoked','ban_required','ban_uncertain','listed']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every(key => keys.includes(key));

type InternalClaim = SyntheticAdminResult & {
  externalCreateAllowed?: boolean; externalBanAllowed?: boolean;
  authUserId?: string; syntheticEmail?: string; banClaimId?: string;
};

type EndpointDeps = {
  getUser: typeof getAuthUser;
  rpc: typeof syntheticAdminRpc;
  createAuth: typeof createSyntheticAuthUser;
  readAuth: typeof readSyntheticAuthUserById;
  banAuth: typeof banSyntheticAuthUser;
  targetConfig(): { enabled: boolean; fingerprint: string };
};

const defaultDeps: EndpointDeps = {
  getUser: getAuthUser, rpc: syntheticAdminRpc, createAuth: createSyntheticAuthUser,
  readAuth: readSyntheticAuthUserById, banAuth: banSyntheticAuthUser,
  targetConfig: () => ({
    enabled: Deno.env.get('SYNTHETIC_ADMIN_ENABLED') === 'true',
    fingerprint: Deno.env.get('SYNTHETIC_ADMIN_TARGET_FINGERPRINT') || '',
  }),
};

const safeResult = (value: InternalClaim): SyntheticAdminResult => {
  if (!isRecord(value) || typeof value.status !== 'string' || !STATES.has(value.status)
    || (value.reservationId !== undefined && (typeof value.reservationId !== 'string' || !UUID.test(value.reservationId)))
    || (value.version !== undefined && (!Number.isSafeInteger(value.version) || Number(value.version) < 1))
    || (value.loginId !== undefined && (typeof value.loginId !== 'string' || !LOGIN_ID.test(value.loginId)))
    || (value.nextCursor !== undefined && value.nextCursor !== null
      && (typeof value.nextCursor !== 'string' || !UUID.test(value.nextCursor))))
    throw new SyntheticAdminError('TEMPORARY_FAILURE');
  let roster: SyntheticAdminResult['roster'];
  if (value.roster !== undefined) {
    if (value.status !== 'listed' || !Array.isArray(value.roster) || value.roster.length > 20)
      throw new SyntheticAdminError('TEMPORARY_FAILURE');
    roster = value.roster.map(item => {
      if (!isRecord(item) || !exactKeys(item, ['reservationId','label','loginId','rolePreset','state','version'])
        || typeof item.reservationId !== 'string' || !UUID.test(item.reservationId)
        || typeof item.label !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/.test(item.label)
        || typeof item.loginId !== 'string' || !LOGIN_ID.test(item.loginId)
        || typeof item.rolePreset !== 'string' || !(SYNTHETIC_ADMIN_ROLE_PRESETS as readonly string[]).includes(item.rolePreset)
        || typeof item.state !== 'string' || !STATES.has(item.state)
        || !Number.isSafeInteger(item.version) || Number(item.version) < 1)
        throw new SyntheticAdminError('TEMPORARY_FAILURE');
      return item as SyntheticAdminResult['roster'][number];
    });
  }
  if (value.status === 'listed' && !roster) throw new SyntheticAdminError('TEMPORARY_FAILURE');
  return {
    status: value.status as SyntheticAdminResult['status'],
    ...(value.reservationId ? { reservationId: value.reservationId } : {}),
    ...(value.version !== undefined ? { version: value.version } : {}),
    ...(value.loginId ? { loginId: value.loginId } : {}),
    ...(roster ? { roster } : {}),
    ...(value.nextCursor !== undefined ? { nextCursor: value.nextCursor } : {}),
  };
};

const readBody = async (request: Request) => {
  if (request.method !== 'POST') throw new SyntheticAdminError('INVALID_REQUEST');
  let body: unknown;
  try { body = await readBoundedCreationJson(request, { maxBytes: 8192, minCodeUnits: 2, maxCodeUnits: 4096 }); }
  catch { throw new SyntheticAdminError('INVALID_REQUEST'); }
  try { return parseSyntheticAdminEnvelope(body); }
  catch (error) {
    if (error instanceof SyntheticAdminError) throw error;
    throw new SyntheticAdminError('INVALID_REQUEST');
  }
};

const sqlArgs = (actorId: string, envelope: SyntheticAdminEnvelope, fingerprint: string) => sqlScope({
  actorId, organizationId: envelope.organizationId, workspaceId: envelope.workspaceId,
  expectedAuthorizationVersion: envelope.expectedAuthorizationVersion, targetFingerprint: fingerprint,
});

const reconcile = async (deps: EndpointDeps, args: ReturnType<typeof sqlScope>, reservationId: string) =>
  deps.rpc<InternalClaim>('synthetic_admin_reconcile', { ...args, p_reservation_id: reservationId });

const completeBanAttempt = async (deps: EndpointDeps, args: ReturnType<typeof sqlScope>, claim: InternalClaim,
  reservationId: string, requestId: string, fingerprint: string): Promise<InternalClaim> => {
  if (claim.externalBanAllowed !== true) return claim;
  if (!claim.authUserId || !claim.syntheticEmail || !claim.banClaimId || !claim.reservationId
    || !UUID.test(claim.authUserId) || !UUID.test(claim.banClaimId)
    || !LOGIN_ID.test(claim.syntheticEmail) || claim.reservationId !== reservationId
    || claim.syntheticEmail !== `synthetic-${reservationId}@avalaos.invalid`)
    throw new SyntheticAdminError('RECONCILIATION_REQUIRED');
  const binding = { authUserId: claim.authUserId, syntheticEmail: claim.syntheticEmail,
    reservationId, targetFingerprint: fingerprint };
  let confirmed = false;
  try {
    const before = await deps.readAuth(binding.authUserId);
    if (matchesSyntheticAuthUser(before, binding)) {
      confirmed = confirmsSyntheticAuthBan(before, binding.authUserId);
      if (!confirmed) {
        try { confirmed = confirmsSyntheticAuthBan(await deps.banAuth(binding.authUserId), binding.authUserId); }
        catch { /* The exact-ID Auth ban may have taken effect despite the lost response. */ }
        if (!confirmed) {
          try {
            const after = await deps.readAuth(binding.authUserId);
            confirmed = matchesSyntheticAuthUser(after, binding)
              && confirmsSyntheticAuthBan(after, binding.authUserId);
          } catch { /* Keep the committed application revocation pending. */ }
        }
      }
    }
  } catch { /* Exact-ID lookup is uncertain; no unverified identity is banned. */ }
  return deps.rpc<InternalClaim>('synthetic_admin_complete_ban', { ...args,
    p_request_id: requestId, p_reservation_id: reservationId,
    p_auth_user_id: binding.authUserId, p_claim_id: claim.banClaimId, p_confirmed: confirmed,
  });
};

const executeOperation = async (deps: EndpointDeps, actorId: string, envelope: SyntheticAdminEnvelope, fingerprint: string) => {
  const args = sqlArgs(actorId, envelope, fingerprint);
  const payload = envelope.payload;
  switch (envelope.operation) {
    case 'reserve':
      return deps.rpc<InternalClaim>('synthetic_admin_reserve', { ...args,
        p_request_id: envelope.requestId, p_key: envelope.idempotencyKey,
        p_label: payload.label, p_preset: payload.rolePreset,
      });
    case 'list':
      return deps.rpc<InternalClaim>('synthetic_admin_list', { ...args,
        p_cursor: payload.cursor || null, p_limit: payload.limit || 20,
      });
    case 'reconcile': {
      const reservationId = payload.reservationId as string;
      const observed = await reconcile(deps, args, reservationId);
      if (observed.status !== 'ban_required' && observed.status !== 'ban_uncertain') return observed;
      const claim = await deps.rpc<InternalClaim>('synthetic_admin_claim_ban_retry', { ...args,
        p_request_id: envelope.requestId, p_key: envelope.idempotencyKey, p_reservation_id: reservationId,
      });
      return completeBanAttempt(deps, args, claim, reservationId, envelope.requestId as string, fingerprint);
    }
    case 'assign_role':
      return deps.rpc<InternalClaim>('synthetic_admin_assign_role', { ...args,
        p_request_id: envelope.requestId, p_key: envelope.idempotencyKey,
        p_reservation_id: payload.reservationId, p_expected_version: payload.expectedVersion,
        p_preset: payload.rolePreset,
      });
    case 'execute': {
      const claim = await deps.rpc<InternalClaim>('synthetic_admin_claim_execution', { ...args,
        p_request_id: envelope.requestId, p_key: envelope.idempotencyKey,
        p_reservation_id: payload.reservationId,
      });
      if (claim.externalCreateAllowed !== true || !claim.authUserId || !claim.syntheticEmail || !claim.reservationId)
        return claim;
      if (!UUID.test(claim.authUserId) || !LOGIN_ID.test(claim.syntheticEmail)
        || claim.reservationId !== payload.reservationId
        || claim.syntheticEmail !== `synthetic-${claim.reservationId}@avalaos.invalid`)
        throw new SyntheticAdminError('RECONCILIATION_REQUIRED');
      const binding = { authUserId: claim.authUserId, syntheticEmail: claim.syntheticEmail,
        reservationId: claim.reservationId, targetFingerprint: fingerprint };
      let user: Awaited<ReturnType<typeof createSyntheticAuthUser>>;
      try { user = await deps.createAuth({ ...binding, password: payload.password as string }); }
      catch {
        // The external request might have taken effect. Read only this exact
        // pre-reserved Auth id; never retry creation or generate a new key.
        try { user = await deps.readAuth(binding.authUserId); }
        catch { return { status: 'reconciliation_required', reservationId: binding.reservationId, version: claim.version } as InternalClaim; }
      }
      if (!matchesSyntheticAuthUser(user, binding)) {
        try {
          const observed = await reconcile(deps, args, binding.reservationId);
          return observed.status === 'active' ? observed : {
            status: 'reconciliation_required', reservationId: binding.reservationId, version: observed.version || claim.version,
          } as InternalClaim;
        } catch {
          return { status: 'reconciliation_required', reservationId: binding.reservationId, version: claim.version } as InternalClaim;
        }
      }
      return reconcile(deps, args, binding.reservationId);
    }
    case 'revoke': {
      const claim = await deps.rpc<InternalClaim>('synthetic_admin_revoke', { ...args,
        p_request_id: envelope.requestId, p_key: envelope.idempotencyKey,
        p_reservation_id: payload.reservationId, p_expected_version: payload.expectedVersion,
      });
      return completeBanAttempt(deps, args, claim, payload.reservationId as string,
        envelope.requestId as string, fingerprint);
    }
  }
};

export const handleSyntheticAdminRequest = async (request: Request, injected?: Partial<EndpointDeps>): Promise<Response> => {
  const options = handleOptions(request);
  if (options) return options;
  const deps = { ...defaultDeps, ...injected } as EndpointDeps;
  try {
    const config = deps.targetConfig();
    if (!config.enabled || !SHA256.test(config.fingerprint)) throw new SyntheticAdminError('FEATURE_DISABLED');
    const envelope = await readBody(request);
    let user: Awaited<ReturnType<typeof getAuthUser>>;
    try { user = await deps.getUser(request); }
    catch { throw new SyntheticAdminError('PERMISSION_DENIED'); }
    const result = await executeOperation(deps, user.id, envelope, config.fingerprint);
    return jsonResponse(safeResult(result));
  } catch (error) {
    const code = error instanceof SyntheticAdminError ? error.errorCode : 'TEMPORARY_FAILURE';
    const status = code === 'FEATURE_DISABLED' || code === 'PERMISSION_DENIED' ? 403
      : code === 'INVALID_REQUEST' ? 400
      : code === 'NOT_FOUND' ? 404
      : code === 'VERSION_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT' || code === 'AUTHORIZATION_STALE' ? 409
      : code === 'QUOTA_EXCEEDED' ? 422 : 503;
    return jsonResponse({ errorCode: code }, status);
  }
};
