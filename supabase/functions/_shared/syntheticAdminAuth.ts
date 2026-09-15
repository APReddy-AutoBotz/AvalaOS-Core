import { SyntheticAdminError } from '../../../services/syntheticAdminContract.ts';
import { supabaseEnv } from './supabase.ts';

type InternalSyntheticAuthUser = {
  id: string; email: string; app_metadata?: Record<string, unknown>; banned_until?: string;
};
type AuthTransport = { url: string; serviceRoleKey: string; fetcher: typeof fetch; timeoutMs?: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RESPONSE_BYTES = 32768;
const DEFAULT_TIMEOUT_MS = 8000;

const boundedAuthJson = async (response: Response): Promise<InternalSyntheticAuthUser> => {
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
    throw new SyntheticAdminError('RECONCILIATION_REQUIRED');
  if (!response.body) throw new SyntheticAdminError('RECONCILIATION_REQUIRED');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new SyntheticAdminError('RECONCILIATION_REQUIRED');
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* Deadline also closes the request. */ }
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) as Record<string, unknown>;
    const value = (decoded.user && typeof decoded.user === 'object' && !Array.isArray(decoded.user)
      ? decoded.user : decoded) as Record<string, unknown>;
    if (typeof value.id !== 'string' || !UUID.test(value.id)) throw new Error('identity');
    return value as InternalSyntheticAuthUser;
  } catch { throw new SyntheticAdminError('RECONCILIATION_REQUIRED'); }
};

export const createSyntheticAdminAuthAdapter = (transport: AuthTransport) => {
  const request = async (method: 'POST' | 'GET' | 'PUT', path: string, body?: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeoutMs = Number.isSafeInteger(transport.timeoutMs) && (transport.timeoutMs || 0) > 0
      && (transport.timeoutMs || 0) <= DEFAULT_TIMEOUT_MS ? transport.timeoutMs as number : DEFAULT_TIMEOUT_MS;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new SyntheticAdminError('RECONCILIATION_REQUIRED'));
      }, timeoutMs);
    });
    const effect = async () => {
      let response: Response;
      try {
        response = await transport.fetcher(`${transport.url}/auth/v1/admin/users${path}`, {
          method, redirect: 'error', signal: controller.signal,
          headers: { apikey: transport.serviceRoleKey, Authorization: `Bearer ${transport.serviceRoleKey}`,
            'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch { throw new SyntheticAdminError('RECONCILIATION_REQUIRED'); }
      if (response.status === 404 && method === 'GET') return null;
      if (!response.ok) throw new SyntheticAdminError('RECONCILIATION_REQUIRED');
      return boundedAuthJson(response);
    };
    try { return await Promise.race([effect(), deadline]); }
    finally { if (timeoutId) clearTimeout(timeoutId); }
  };
  return {
    /** Called exactly once after a committed SQL execution fence. */
    createUser: (input: { authUserId: string; syntheticEmail: string; reservationId: string;
      targetFingerprint: string; password: string }) => request('POST', '', {
      id: input.authUserId, email: input.syntheticEmail, password: input.password, email_confirm: true,
      app_metadata: { synthetic_admin_reservation_id: input.reservationId,
        synthetic_admin_target: input.targetFingerprint },
    }),
    /** Exact reserved UUID only; no Auth list, email lookup, or second create. */
    getUserById: (authUserId: string) => {
      if (!UUID.test(authUserId)) throw new SyntheticAdminError('INVALID_REQUEST');
      return request('GET', `/${authUserId}`);
    },
    banUser: (authUserId: string) => {
      if (!UUID.test(authUserId)) throw new SyntheticAdminError('INVALID_REQUEST');
      return request('PUT', `/${authUserId}`, { ban_duration: '876000h' });
    },
  };
};

const current = () => createSyntheticAdminAuthAdapter({ ...supabaseEnv(), fetcher: fetch });
export const createSyntheticAuthUser = (input: Parameters<ReturnType<typeof createSyntheticAdminAuthAdapter>['createUser']>[0]) =>
  current().createUser(input);
export const readSyntheticAuthUserById = (id: string) => current().getUserById(id);
export const banSyntheticAuthUser = (id: string) => current().banUser(id);

export const matchesSyntheticAuthUser = (user: InternalSyntheticAuthUser | null, input: {
  authUserId: string; syntheticEmail: string; reservationId: string; targetFingerprint: string;
}) => Boolean(user && user.id === input.authUserId && user.email === input.syntheticEmail
  && user.app_metadata?.synthetic_admin_reservation_id === input.reservationId
  && user.app_metadata?.synthetic_admin_target === input.targetFingerprint);

export const confirmsSyntheticAuthBan = (user: InternalSyntheticAuthUser | null, authUserId: string) =>
  Boolean(user && user.id === authUserId && typeof user.banned_until === 'string'
    && Number.isFinite(Date.parse(user.banned_until)) && Date.parse(user.banned_until) > Date.now() + 30000);
