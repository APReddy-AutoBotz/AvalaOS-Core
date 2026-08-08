import { getRuntimeDataAccess, isSupabaseConfigured, supabase } from '../supabaseClient';
import { decodeBuyerSafeProjection, decodeInternalProjection } from './decoder';
import type {
  BuyerSafeProjection,
  InternalAssuranceProjection,
  TrustCommandRequest,
  TrustCommandResponse,
  TrustQueryRequest,
  TrustQueryView,
} from './contracts';

export type TrustScope = Omit<TrustQueryRequest, 'view'>;

const commandErrorCodes = [
  'ACCESS_DENIED', 'PERMISSION_DENIED', 'AUTHORIZATION_STALE', 'VALIDATION_FAILED',
  'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'REVIEW_REQUIRED', 'PUBLICATION_BLOCKED',
  'FEATURE_DISABLED', 'PERSISTENCE_UNAVAILABLE',
] as const;
type CommandErrorCode = typeof commandErrorCodes[number];

const queryErrorCodes = ['ACCESS_DENIED', 'AUTHORIZATION_STALE', 'VALIDATION_FAILED', 'NO_PUBLICATION', 'PERSISTENCE_UNAVAILABLE'] as const;
type QueryErrorCode = typeof queryErrorCodes[number];

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (row: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(row);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};
const isPositiveSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

const boundedMessage: Record<CommandErrorCode, string> = {
  ACCESS_DENIED: 'The requested resource is unavailable.',
  PERMISSION_DENIED: 'The requested resource is unavailable.',
  AUTHORIZATION_STALE: 'Authorization changed. Refresh your tenant session.',
  VALIDATION_FAILED: 'Request is invalid.',
  VERSION_CONFLICT: 'The resource changed before the command could be committed.',
  IDEMPOTENCY_CONFLICT: 'The command identity was already used for a different request.',
  REVIEW_REQUIRED: 'Independent review is required.',
  PUBLICATION_BLOCKED: 'Publication requirements are not satisfied.',
  FEATURE_DISABLED: 'Trust Assurance mutations are disabled.',
  PERSISTENCE_UNAVAILABLE: 'Trust Assurance is unavailable.',
};

const unavailableCommand = (): TrustCommandResponse => ({
  ok: false,
  code: 'PERSISTENCE_UNAVAILABLE',
  message: boundedMessage.PERSISTENCE_UNAVAILABLE,
});

const assertConfiguredServerTransport = () => {
  if (getRuntimeDataAccess() !== 'server' || !isSupabaseConfigured()) throw new Error('PERSISTENCE_UNAVAILABLE');
};

const safeResponseJson = async (response: unknown): Promise<unknown> => {
  if (!response || typeof response !== 'object') return undefined;
  const candidate = response as { clone?: () => { json?: () => Promise<unknown> }; json?: () => Promise<unknown> };
  try {
    const clone = typeof candidate.clone === 'function' ? candidate.clone() : candidate;
    return typeof clone.json === 'function' ? await clone.json() : undefined;
  } catch {
    return undefined;
  }
};

const invocationErrorPayload = async (error: unknown, response: unknown): Promise<unknown> => {
  if (!isRecord(error) || error.name !== 'FunctionsHttpError') return undefined;
  return safeResponseJson(response ?? error.context);
};

const decodeCommandResponse = (value: unknown): TrustCommandResponse | null => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return null;
  if (value.ok) {
    if (!hasExactKeys(value, ['ok', 'replayed', 'resourceId', 'version', 'body'])
      || typeof value.replayed !== 'boolean'
      || typeof value.resourceId !== 'string' || !uuid.test(value.resourceId)
      || !isPositiveSafeInteger(value.version) || !isRecord(value.body)) return null;
    return value as unknown as TrustCommandResponse;
  }
  if (!hasExactKeys(value, ['ok', 'code', 'message']) || typeof value.code !== 'string'
    || !commandErrorCodes.includes(value.code as CommandErrorCode) || typeof value.message !== 'string') return null;
  const code = value.code as CommandErrorCode;
  return { ok: false, code, message: boundedMessage[code] };
};

const decodeQueryError = (value: unknown): QueryErrorCode | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['code', 'message'])
    || typeof value.code !== 'string' || typeof value.message !== 'string'
    || !queryErrorCodes.includes(value.code as QueryErrorCode)) return null;
  return value.code as QueryErrorCode;
};

export const queryTrustAssurance = async (
  scope: TrustScope,
  view: TrustQueryView,
): Promise<InternalAssuranceProjection | BuyerSafeProjection | null> => {
  assertConfiguredServerTransport();
  const request: TrustQueryRequest = { ...scope, view };
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke('trust-assurance-query', { body: request });
  } catch {
    throw new Error('PERSISTENCE_UNAVAILABLE');
  }
  if (result.error) {
    const payload = await invocationErrorPayload(result.error, result.response);
    const code = decodeQueryError(payload);
    if (view === 'buyer' && code === 'NO_PUBLICATION') return null;
    throw new Error(code ?? 'PERSISTENCE_UNAVAILABLE');
  }
  try {
    return view === 'internal' ? decodeInternalProjection(result.data) : decodeBuyerSafeProjection(result.data);
  } catch {
    throw new Error('PERSISTENCE_UNAVAILABLE');
  }
};

export const commandTrustAssurance = async (request: TrustCommandRequest): Promise<TrustCommandResponse> => {
  try {
    assertConfiguredServerTransport();
    const result = await supabase.functions.invoke('trust-assurance-command', { body: request });
    const payload = result.error ? await invocationErrorPayload(result.error, result.response) : result.data;
    return decodeCommandResponse(payload) ?? unavailableCommand();
  } catch {
    return unavailableCommand();
  }
};
