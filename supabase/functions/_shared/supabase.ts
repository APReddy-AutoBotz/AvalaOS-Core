declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

type AuthUser = {
  id: string;
  email?: string;
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
