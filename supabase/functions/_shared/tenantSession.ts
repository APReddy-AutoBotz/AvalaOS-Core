import { corsHeaders } from './http.ts';
import { AssessCommandError } from './assessCommand.ts';
import type { TenantContext } from './tenantAuthority.ts';

export type TenantSessionContext = TenantContext & {
  organizationName: string;
  workspaceName: string;
};

export interface TenantSessionDependencies {
  authenticate(request: Request): Promise<{ id: string }>;
  loadAvailableContexts(actorId: string): Promise<unknown>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const capability = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;

const validateContext = (value: unknown, actorId: string): TenantSessionContext => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AssessCommandError('COMMAND_UNAVAILABLE');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => ![
    'userId', 'organizationId', 'organizationName', 'workspaceId', 'workspaceName',
    'authorizationVersion', 'capabilities',
  ].includes(key)) ||
      row.userId !== actorId || typeof row.userId !== 'string' || !uuid.test(row.userId) ||
      typeof row.organizationId !== 'string' || !uuid.test(row.organizationId) ||
      typeof row.organizationName !== 'string' || !row.organizationName.trim() ||
      typeof row.workspaceId !== 'string' || !uuid.test(row.workspaceId) ||
      typeof row.workspaceName !== 'string' || !row.workspaceName.trim() ||
      !Number.isSafeInteger(row.authorizationVersion) || (row.authorizationVersion as number) < 1 ||
      !Array.isArray(row.capabilities)) throw new AssessCommandError('COMMAND_UNAVAILABLE');
  const capabilities = row.capabilities.map(item => {
    if (typeof item !== 'string' || item !== item.trim().toLowerCase() || !capability.test(item)) {
      throw new AssessCommandError('COMMAND_UNAVAILABLE');
    }
    return item;
  });
  if (new Set(capabilities).size !== capabilities.length) throw new AssessCommandError('COMMAND_UNAVAILABLE');
  return {
    userId: row.userId,
    organizationId: row.organizationId as string,
    organizationName: row.organizationName.trim(),
    workspaceId: row.workspaceId as string,
    workspaceName: row.workspaceName.trim(),
    authorizationVersion: row.authorizationVersion as number,
    capabilities: [...capabilities].sort(),
  };
};

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const handleTenantSessionRequest = async (
  request: Request,
  dependencies: TenantSessionDependencies,
): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { code: 'METHOD_NOT_ALLOWED' });
  let actor: { id: string };
  try {
    actor = await dependencies.authenticate(request);
  } catch {
    return response(401, { code: 'AUTHENTICATION_REQUIRED' });
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
      return response(400, { code: 'INVALID_REQUEST' });
    }
  } catch {
    return response(400, { code: 'INVALID_REQUEST' });
  }
  try {
    const loaded = await dependencies.loadAvailableContexts(actor.id);
    if (!Array.isArray(loaded)) throw new AssessCommandError('COMMAND_UNAVAILABLE');
    return response(200, { contexts: loaded.map(item => validateContext(item, actor.id)) });
  } catch {
    return response(503, { code: 'TENANT_SESSION_UNAVAILABLE' });
  }
};
