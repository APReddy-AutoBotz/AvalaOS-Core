import { SyntheticAdminError, type SyntheticAdminErrorCode } from '../../../services/syntheticAdminContract.ts';
import { supabaseEnv } from './supabase.ts';

const DB_SIGNALS: Record<string, SyntheticAdminErrorCode> = {
  SYNTHETIC_ADMIN_FEATURE_DISABLED: 'FEATURE_DISABLED',
  SYNTHETIC_ADMIN_TARGET_NOT_EMPTY: 'FEATURE_DISABLED',
  SYNTHETIC_ADMIN_INVALID_REQUEST: 'INVALID_REQUEST',
  SYNTHETIC_ADMIN_NOT_FOUND: 'NOT_FOUND',
  SYNTHETIC_ADMIN_QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  SYNTHETIC_ADMIN_IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  SYNTHETIC_ADMIN_VERSION_CONFLICT: 'VERSION_CONFLICT',
  SYNTHETIC_ADMIN_RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
  PR1B_AUTHORIZATION_STALE: 'AUTHORIZATION_STALE',
  PR1B_NOT_FOUND: 'PERMISSION_DENIED',
};

const MAX_RESPONSE_BYTES = 32768;
const DEFAULT_TIMEOUT_MS = 8000;
type SyntheticAdminRpcTransport = { url: string; serviceRoleKey: string; fetcher: typeof fetch; timeoutMs?: number };

const boundedRpcJson = async (response: Response): Promise<unknown> => {
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES))
    throw new SyntheticAdminError('TEMPORARY_FAILURE');
  if (!response.body) throw new SyntheticAdminError('TEMPORARY_FAILURE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new SyntheticAdminError('TEMPORARY_FAILURE');
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* Deadline also aborts the request. */ }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new SyntheticAdminError('TEMPORARY_FAILURE'); }
};

/** A durable SQL claim may have committed despite a transport timeout; callers reconcile. */
export const createSyntheticAdminRpcAdapter = (transport: SyntheticAdminRpcTransport) => async <T>(
  name: string, args: Record<string, unknown>,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutMs = Number.isSafeInteger(transport.timeoutMs) && (transport.timeoutMs || 0) > 0
    && (transport.timeoutMs || 0) <= DEFAULT_TIMEOUT_MS ? transport.timeoutMs as number : DEFAULT_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new SyntheticAdminError('TEMPORARY_FAILURE'));
    }, timeoutMs);
  });
  const effect = async () => {
    let response: Response;
    try {
      response = await transport.fetcher(`${transport.url}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { apikey: transport.serviceRoleKey, Authorization: `Bearer ${transport.serviceRoleKey}`,
          'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch { throw new SyntheticAdminError('TEMPORARY_FAILURE'); }
    const parsed = await boundedRpcJson(response);
    if (!response.ok) {
      const message = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).message : null;
      throw new SyntheticAdminError(typeof message === 'string' && Object.hasOwn(DB_SIGNALS, message)
        ? DB_SIGNALS[message] : 'TEMPORARY_FAILURE');
    }
    return parsed as T;
  };
  try { return await Promise.race([effect(), deadline]); }
  finally { if (timeoutId) clearTimeout(timeoutId); }
};

/** Discards raw database/transport errors; only fixed domain signals escape. */
export const syntheticAdminRpc = <T>(name: string, args: Record<string, unknown>): Promise<T> =>
  createSyntheticAdminRpcAdapter({ ...supabaseEnv(), fetcher: fetch })<T>(name, args);

export type SyntheticAdminSqlScope = {
  actorId: string; organizationId: string; workspaceId: string;
  expectedAuthorizationVersion: number; targetFingerprint: string;
};

export const sqlScope = (scope: SyntheticAdminSqlScope) => ({
  p_actor: scope.actorId, p_org: scope.organizationId, p_workspace: scope.workspaceId,
  p_version: scope.expectedAuthorizationVersion, p_fingerprint: scope.targetFingerprint,
});
