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
const rpcDomainSignalPattern = /^(?:ENTERPRISE|PR1[A-Z0-9]*)_[A-Z0-9_]+$/;
const postgresCodePattern = /^[A-Z0-9]{5}$/;

const boundedRpcField = (value: unknown, allowPostgresCode = false) => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > RPC_FIELD_MAX_LENGTH) return undefined;
  if (rpcDomainSignalPattern.test(normalized)) return normalized;
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
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    // Consume the failure body once. Only allowlisted, bounded domain signals
    // survive parsing; the raw body is never retained or logged.
    throw parseRpcFailure(response.status, await response.text());
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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
