declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

type AuthUser = {
  id: string;
  email?: string;
};

const RPC_FIELD_MAX_LENGTH = 256;
const postgresCodePattern = /^[A-Z0-9]{5}$/;
const governedRpcDomainSignals = new Set([
  'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT',
  'ENTERPRISE_AI_EXECUTION_PLAN_CONFLICT',
  'ENTERPRISE_AI_JOB_IDEMPOTENCY_CONFLICT',
  'ENTERPRISE_AI_COMMAND_IN_PROGRESS',
  'ENTERPRISE_AI_JOB_IN_PROGRESS',
  'ENTERPRISE_AI_STALE_EXECUTION_FENCE',
  'ENTERPRISE_AI_COMMAND_NOT_EXECUTABLE',
  'ENTERPRISE_AI_RECEIPT_NOT_CLAIMED',
  'ENTERPRISE_AI_JOB_RESOURCE_STALE',
  'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE',
  'ENTERPRISE_PROVIDER_ORGANIZATION_AUTHORITY_REQUIRED',
  'ENTERPRISE_PROVIDER_WORKSPACE_AUTHORITY_REQUIRED',
  'ENTERPRISE_PROVIDER_PERMISSION_DENIED',
  'ENTERPRISE_INTELLIGENCE_PROVIDER_DISABLED',
  'ENTERPRISE_PROVIDER_NOT_AVAILABLE',
  'ENTERPRISE_PROVIDER_VALIDATION_STALE',
  'ENTERPRISE_PROVIDER_ROUTE_BLOCKED',
  'ENTERPRISE_EVIDENCE_ASSESS_VERSION_CONFLICT',
  'ENTERPRISE_EVIDENCE_CANDIDATE_STALE',
  'ENTERPRISE_EVIDENCE_EDIT_HISTORY_REQUIRED',
  'ENTERPRISE_EVIDENCE_ALREADY_PROMOTED',
  'ENTERPRISE_EVIDENCE_BATCH_DUPLICATE',
  'ENTERPRISE_EVIDENCE_BATCH_INVALID',
  'ENTERPRISE_EVIDENCE_CANDIDATE_NOT_ACCEPTED',
  'ENTERPRISE_TRANSCRIPT_SOURCE_SET_LIMIT_EXCEEDED',
  'ENTERPRISE_TRANSCRIPT_SOURCE_VERSION_NOT_READY',
  'ENTERPRISE_TRANSCRIPT_MATERIAL_CONFLICT_UNRESOLVED',
  'ENTERPRISE_TRANSCRIPT_SOURCE_SET_STALE',
  'ENTERPRISE_TRANSCRIPT_BUNDLE_STALE',
  'ENTERPRISE_TRANSCRIPT_JOURNEY_STALE',
  'ENTERPRISE_TRANSCRIPT_CANDIDATE_REVIEW_STALE',
  'ENTERPRISE_TRANSCRIPT_CANDIDATE_STALE',
  'ENTERPRISE_TRANSCRIPT_ASSESS_STALE',
  'ENTERPRISE_TRANSCRIPT_CONFLICT_STALE',
  'ENTERPRISE_TRANSCRIPT_APPLY_BATCH_STALE',
  'ENTERPRISE_TRANSCRIPT_EXTRACTION_BINDING_STALE',
  'ENTERPRISE_TRANSCRIPT_FEATURE_DISABLED',
  'ENTERPRISE_TRANSCRIPT_INVALID_SOURCE_SET',
  'ENTERPRISE_TRANSCRIPT_INVALID_BUNDLE',
  'ENTERPRISE_TRANSCRIPT_INVALID_JOURNEY',
  'ENTERPRISE_TRANSCRIPT_CANDIDATE_REVIEW_INVALID',
  'ENTERPRISE_TRANSCRIPT_APPLY_INVALID',
  'ENTERPRISE_TRANSCRIPT_CONFLICT_INVALID',
  'ENTERPRISE_TRANSCRIPT_APPLY_BATCH_INVALID',
  'ENTERPRISE_TRANSCRIPT_APPLY_BATCH_DUPLICATE_TARGET',
  'ENTERPRISE_MODERNIZATION_SOURCE_NOT_CURRENT',
  'ENTERPRISE_MODERNIZATION_SOURCE_NOT_APPROVED',
  'ENTERPRISE_MODERNIZATION_INCOMPLETE_FACTORS',
  'ENTERPRISE_MODERNIZATION_RECOMMENDATION_INVALID',
  'ENTERPRISE_MODERNIZATION_RESULT_IDENTITY_MISMATCH',
  'ENTERPRISE_APPROVAL_AUTHORIZATION_STALE',
  'ENTERPRISE_APPROVAL_REVIEWER_AUTHORIZATION_STALE',
  'ENTERPRISE_APPROVAL_SEPARATION_OR_STATE_INVALID',
  'ENTERPRISE_APPROVAL_REVIEW_REQUIRED',
  'ENTERPRISE_APPROVAL_REVIEW_IDENTITY_MISMATCH',
  'ENTERPRISE_APPROVAL_SEPARATION_OR_STALE_RESOURCE',
  'ENTERPRISE_APPROVAL_STATE_INVALID',
  'ENTERPRISE_DELIVERY_IDEMPOTENCY_CONFLICT',
  'ENTERPRISE_DELIVERY_COMMAND_IN_PROGRESS',
  'ENTERPRISE_DELIVERY_PERMISSION_DENIED',
  'ENTERPRISE_DELIVERY_RESOURCE_UNAVAILABLE',
  'ENTERPRISE_DELIVERY_RESOURCE_STALE',
  'ENTERPRISE_DELIVERY_HANDOFF_STALE',
  'ENTERPRISE_DELIVERY_FEATURE_DISABLED',
  'ENTERPRISE_DELIVERY_READ_ONLY',
  'ENTERPRISE_DELIVERY_COMMAND_BLOCKED',
  'PR1B_AUTHORIZATION_STALE',
]);

const boundedRpcField = (value: unknown, allowPostgresCode = false) => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > RPC_FIELD_MAX_LENGTH) return undefined;
  if (governedRpcDomainSignals.has(normalized)) return normalized;
  if (allowPostgresCode && postgresCodePattern.test(normalized)) return normalized;
  return undefined;
};

/**
 * A server-internal, bounded representation of a PostgREST RPC failure.
 * It deliberately never retains the request arguments, response body, SQL,
 * auth material, paths, prompts, provider keys, or arbitrary database text.
 */
export class SupabaseRpcError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly databaseMessage?: string;
  readonly details?: string;
  readonly hint?: string;

  constructor(input: {
    status: number;
    code?: string;
    databaseMessage?: string;
    details?: string;
    hint?: string;
  }) {
    super('Supabase RPC failed.');
    this.name = 'SupabaseRpcError';
    this.status = Number.isSafeInteger(input.status) && input.status >= 400 && input.status <= 599
      ? input.status
      : 500;
    this.code = boundedRpcField(input.code, true);
    this.databaseMessage = boundedRpcField(input.databaseMessage);
    this.details = boundedRpcField(input.details);
    this.hint = boundedRpcField(input.hint);
  }
}

export const isSupabaseRpcError = (error: unknown): error is SupabaseRpcError => (
  error instanceof SupabaseRpcError
);

export type SupabaseRpcTransportClassification =
  | 'aborted'
  | 'timed_out'
  | 'fetch_failed'
  | 'relay_failed'
  | 'connection_failed'
  | 'transient_http_502'
  | 'transient_http_503'
  | 'transient_http_504'
  | 'response_read_failed'
  | 'response_decode_failed'
  | 'unknown_transport_failure';

/** A bounded server-only transport disposition. Raw failures are discarded. */
export class SupabaseRpcTransportError extends Error {
  readonly operation = 'rpc';
  readonly classification: SupabaseRpcTransportClassification;
  readonly responseReceived: boolean;

  constructor(classification: SupabaseRpcTransportClassification, responseReceived: boolean) {
    super('Supabase RPC transport failed.');
    this.name = 'SupabaseRpcTransportError';
    this.classification = classification;
    this.responseReceived = responseReceived;
  }
}

export const isSupabaseRpcTransportError = (error: unknown): error is SupabaseRpcTransportError => (
  error instanceof SupabaseRpcTransportError
);

const classifyRpcTransportFailure = (error: unknown): SupabaseRpcTransportClassification => {
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError') return 'aborted';
  if (name === 'TimeoutError') return 'timed_out';
  if (name === 'FetchError' || name === 'FunctionsFetchError') return 'fetch_failed';
  if (name === 'FunctionsRelayError') return 'relay_failed';
  if (name === 'TypeError') return 'connection_failed';
  return 'unknown_transport_failure';
};

export const supabaseRpcErrorHasSignal = (error: unknown, ...signals: string[]) => {
  if (!isSupabaseRpcError(error)) return false;
  const available = new Set([error.code, error.databaseMessage, error.details, error.hint].filter(Boolean));
  return signals.some(signal => available.has(signal));
};

const parseRpcFailure = (status: number, body: string) => {
  let value: unknown;
  try {
    value = body ? JSON.parse(body) : null;
  } catch {
    value = null;
  }
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return new SupabaseRpcError({
    status,
    code: boundedRpcField(record.code, true),
    databaseMessage: boundedRpcField(record.message),
    details: boundedRpcField(record.details),
    hint: boundedRpcField(record.hint),
  });
};

const rpcErrorHasGovernedDomainSignal = (error: SupabaseRpcError) => (
  [error.code, error.databaseMessage, error.details, error.hint]
    .some(value => typeof value === 'string' && governedRpcDomainSignals.has(value))
);

const transientRpcHttpClassification = (status: number): SupabaseRpcTransportClassification | null => {
  if (status === 502) return 'transient_http_502';
  if (status === 503) return 'transient_http_503';
  if (status === 504) return 'transient_http_504';
  return null;
};

const getRequiredEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
};

export const supabaseEnv = () => ({
  url: getRequiredEnv('SUPABASE_URL'),
  anonKey: getRequiredEnv('SUPABASE_ANON_KEY'),
  serviceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
});

export const getBearerToken = (request: Request) => {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error('Authentication required.');
  return match[1];
};

export const getAuthUser = async (request: Request): Promise<AuthUser> => {
  const { url, anonKey } = supabaseEnv();
  const token = getBearerToken(request);
  const response = await fetch(`${url}/auth/v1/user`, {
    redirect: 'error',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new Error('Authentication failed.');
  const user = await response.json();
  if (!user?.id) throw new Error('Authenticated user was not resolved.');
  return user;
};

export const postgrest = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const { url, serviceRoleKey } = supabaseEnv();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    redirect: 'error',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error('Supabase request failed.');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

/**
 * Invoke a server-only Postgres function through the service-role transport.
 * The function itself remains responsible for rechecking actor, tenant,
 * workspace, capability, and authorization-version authority.
 */
export const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { url, serviceRoleKey } = supabaseEnv();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch (error) {
    throw new SupabaseRpcTransportError(classifyRpcTransportFailure(error), false);
  }
  if (!response.ok) {
    // Consume the failure body once. Only allowlisted, bounded domain signals
    // survive parsing; the raw body is never retained or logged.
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new SupabaseRpcTransportError('response_read_failed', true);
    }
    const rpcError = parseRpcFailure(response.status, body);
    const transientClassification = transientRpcHttpClassification(response.status);
    if (transientClassification && !rpcErrorHasGovernedDomainSignal(rpcError)) {
      throw new SupabaseRpcTransportError(transientClassification, true);
    }
    throw rpcError;
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new SupabaseRpcTransportError('response_decode_failed', true);
  }
};

type Membership = {
  org_id: string;
  status: string;
};

export const resolveOrgId = async (userId: string, requestedOrgId?: string): Promise<string> => {
  const memberships = await postgrest<Membership[]>(
    `organization_members?select=org_id,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&deleted_at=is.null`,
    { method: 'GET' },
  );

  if (!memberships.length) throw new Error('User is not an active member of any organization.');

  if (requestedOrgId) {
    const allowed = memberships.some((membership) => membership.org_id === requestedOrgId);
    if (!allowed) throw new Error('User does not have access to the requested organization.');
    return requestedOrgId;
  }

  if (memberships.length === 1) return memberships[0].org_id;
  throw new Error('organizationId is required when the user belongs to multiple organizations.');
};

export const insertRow = async <T>(table: string, row: Record<string, unknown>): Promise<T | null> => {
  const result = await postgrest<T[]>(table, {
    method: 'POST',
    body: JSON.stringify(row),
  });
  return result?.[0] || null;
};

export const updateRows = async <T>(
  table: string,
  filters: Record<string, string>,
  patch: Record<string, unknown>,
): Promise<T[]> => {
  const query = new URLSearchParams(filters).toString();
  return postgrest<T[]>(`${table}?${query}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
};

export const deleteRows = async <T>(table: string, filters: Record<string, string>): Promise<T[]> => {
  const query = new URLSearchParams(filters).toString();
  return postgrest<T[]>(`${table}?${query}`, { method: 'DELETE' });
};
