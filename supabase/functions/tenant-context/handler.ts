import {
  TenantAuthorityDatabase,
  TenantAuthorityError,
  TenantAuthorityRequest,
  resolveTenantAuthority,
} from '../_shared/tenantAuthority.ts';
import { corsHeaders } from '../_shared/http.ts';

type Dependencies = {
  authenticate: (request: Request) => Promise<{ id: string }>;
  database: TenantAuthorityDatabase;
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseRequest = (value: unknown): TenantAuthorityRequest | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => !['organizationId', 'workspaceId', 'expectedAuthorizationVersion'].includes(key))) return null;
  if (typeof body.organizationId !== 'string' || !uuid.test(body.organizationId) ||
      typeof body.workspaceId !== 'string' || !uuid.test(body.workspaceId)) return null;
  if (body.expectedAuthorizationVersion !== undefined &&
      (!Number.isSafeInteger(body.expectedAuthorizationVersion) || (body.expectedAuthorizationVersion as number) < 1)) return null;
  return body as TenantAuthorityRequest;
};

export const handleTenantContext = async (request: Request, dependencies: Dependencies): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });
  let identity: { id: string };
  try {
    identity = await dependencies.authenticate(request);
  } catch {
    return json(401, { code: 'AUTHENTICATION_REQUIRED' });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: 'INVALID_REQUEST' });
  }
  const parsed = parseRequest(body);
  if (!parsed) return json(400, { code: 'INVALID_REQUEST' });
  try {
    return json(200, { tenantContext: await resolveTenantAuthority(identity.id, parsed, dependencies.database) });
  } catch (error) {
    if (error instanceof TenantAuthorityError) {
      return json(error.code === 'AUTHORIZATION_STALE' ? 409 : 403, { code: error.code });
    }
    return json(500, { code: 'TENANT_CONTEXT_UNAVAILABLE' });
  }
};
