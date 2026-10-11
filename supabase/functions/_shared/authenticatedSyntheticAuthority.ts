import { getBearerToken, rpc } from './supabase.ts';
import type { StudioArtifactAtomicCommand } from './studioArtifactCommand.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;

export type AuthenticatedSyntheticRequestBinding = Readonly<{
  sessionId: string;
  payloadHash: string;
}>;

export type AuthenticatedSyntheticStudioTransport = AuthenticatedSyntheticRequestBinding & Readonly<{
  permitId: string;
  kind: 'studio_deterministic_success' | 'studio_failure_after_claim';
}>;

const canonicalJson = (value: unknown, depth = 0): string => {
  if (depth > 20) throw new Error('AUTHENTICATED_SYNTHETIC_PAYLOAD_INVALID');
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item, depth + 1)).join(',')}]`;
  if (!value || typeof value !== 'object') throw new Error('AUTHENTICATED_SYNTHETIC_PAYLOAD_INVALID');
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  if (entries.length > 300) throw new Error('AUTHENTICATED_SYNTHETIC_PAYLOAD_INVALID');
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item, depth + 1)}`).join(',')}}`;
};

export const authenticatedSyntheticPayloadHash = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) throw new Error('AUTHENTICATED_SYNTHETIC_SESSION_INVALID');
  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let parsed: unknown;
  try { parsed = JSON.parse(atob(padded)); } catch { throw new Error('AUTHENTICATED_SYNTHETIC_SESSION_INVALID'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AUTHENTICATED_SYNTHETIC_SESSION_INVALID');
  return parsed as Record<string, unknown>;
};

/**
 * The JWT is used only to carry the already authenticated session selector.
 * Every resolver/consume RPC independently proves `(session.id,user_id)` in
 * `auth.sessions`; decoding this claim never grants authority by itself.
 */
export const authenticatedSyntheticRequestBinding = async (
  request: Request,
  actorId: string,
  body: unknown,
): Promise<AuthenticatedSyntheticRequestBinding> => {
  const payload = decodeJwtPayload(getBearerToken(request));
  if (payload.sub !== actorId || typeof payload.session_id !== 'string' || !UUID.test(payload.session_id)) {
    throw new Error('AUTHENTICATED_SYNTHETIC_SESSION_INVALID');
  }
  return { sessionId: payload.session_id, payloadHash: await authenticatedSyntheticPayloadHash(body) };
};

const optionalRequestBinding = async (request: Request, actorId: string, body: unknown): Promise<{
  sessionId: string | null; payloadHash: string;
}> => {
  const payloadHash = await authenticatedSyntheticPayloadHash(body);
  try {
    const payload = decodeJwtPayload(getBearerToken(request));
    return {
      sessionId: payload.sub === actorId && typeof payload.session_id === 'string' && UUID.test(payload.session_id)
        ? payload.session_id : null,
      payloadHash,
    };
  } catch {
    // Ordinary commands predate session_id-bearing JWTs in local fixtures. SQL
    // returns inactive only when no exact permit exists; an existing exact
    // permit with a missing/foreign session is rejected there against auth.sessions.
    return { sessionId: null, payloadHash };
  }
};

type Invoke = <T>(name: string, args: Record<string, unknown>) => Promise<T>;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AUTHENTICATED_SYNTHETIC_RESPONSE_INVALID');
  return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) throw new Error('AUTHENTICATED_SYNTHETIC_RESPONSE_INVALID');
};

export const resolveAuthenticatedSyntheticStudioTransport = async (
  request: Request,
  body: unknown,
  command: StudioArtifactAtomicCommand,
  invoke: Invoke = rpc,
): Promise<AuthenticatedSyntheticStudioTransport | null> => {
  if (command.commandType !== 'studio.generation.request') return null;
  const binding = await optionalRequestBinding(request, command.actorId, body);
  const value = object(await invoke<unknown>('authenticated_synthetic_resolve_studio_permit', {
    p_actor_id: command.actorId,
    p_org_id: command.organizationId,
    p_workspace_id: command.workspaceId,
    p_session_id: binding.sessionId,
    p_request_id: command.requestId,
    p_payload_hash: binding.payloadHash,
    p_expected_version: command.expectedAggregateVersion,
  }));
  if (value.active === false) { exact(value, ['active']); return null; }
  exact(value, ['active', 'permitId', 'kind']);
  if (value.active !== true || binding.sessionId === null || typeof value.permitId !== 'string' || !UUID.test(value.permitId)
    || value.kind !== 'studio_deterministic_success' && value.kind !== 'studio_failure_after_claim') {
    throw new Error('AUTHENTICATED_SYNTHETIC_RESPONSE_INVALID');
  }
  return { ...binding, permitId: value.permitId, kind: value.kind };
};

export type AuthenticatedSyntheticConsumedStudioPermit = Readonly<{
  kind: 'studio_deterministic_success';
}> | Readonly<{
  kind: 'studio_failure_after_claim';
}>;

export const consumeAuthenticatedSyntheticStudioPermit = async (input: {
  permitId: string; actorId: string; organizationId: string; workspaceId: string;
  sessionId: string; requestId: string; payloadHash: string; expectedVersion: number;
  attemptId: string; executionToken: string; executionFence: number;
}, invoke: Invoke = rpc): Promise<AuthenticatedSyntheticConsumedStudioPermit> => {
  const value = object(await invoke<unknown>('authenticated_synthetic_consume_studio_permit', {
    p_permit_id: input.permitId, p_actor_id: input.actorId, p_org_id: input.organizationId,
    p_workspace_id: input.workspaceId, p_session_id: input.sessionId, p_request_id: input.requestId,
    p_payload_hash: input.payloadHash, p_expected_version: input.expectedVersion,
    p_attempt_id: input.attemptId, p_execution_token: input.executionToken,
    p_execution_fence: input.executionFence,
  }));
  exact(value, ['consumed', 'kind']);
  if (value.consumed !== true
    || value.kind !== 'studio_deterministic_success' && value.kind !== 'studio_failure_after_claim') {
    throw new Error('AUTHENTICATED_SYNTHETIC_RESPONSE_INVALID');
  }
  return { kind: value.kind };
};

export const consumeAuthenticatedSyntheticProcessFault = async (input: {
  request: Request; body: unknown; actorId: string; organizationId: string; workspaceId: string;
  commandType: 'process.create' | 'process.update'; requestId: string; expectedVersion: number;
}, invoke: Invoke = rpc): Promise<boolean> => {
  const binding = await optionalRequestBinding(input.request, input.actorId, input.body);
  const value = object(await invoke<unknown>('authenticated_synthetic_consume_process_fault', {
    p_actor_id: input.actorId, p_org_id: input.organizationId, p_workspace_id: input.workspaceId,
    p_session_id: binding.sessionId, p_command_type: input.commandType, p_request_id: input.requestId,
    p_payload_hash: binding.payloadHash, p_expected_version: input.expectedVersion,
  }));
  exact(value, ['consumed']);
  if (typeof value.consumed !== 'boolean') throw new Error('AUTHENTICATED_SYNTHETIC_RESPONSE_INVALID');
  return value.consumed;
};

export const isAuthenticatedSyntheticHash = (value: unknown): value is string => typeof value === 'string' && HASH.test(value);
