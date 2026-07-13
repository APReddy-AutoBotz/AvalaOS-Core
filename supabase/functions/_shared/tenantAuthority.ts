export type TenantAuthorityRequest = {
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion?: number;
};

export type TenantAuthorityDatabase = {
  loadFreshProjection(input: { organizationId: string; workspaceId: string }): Promise<unknown>;
};

export type TenantContext = {
  userId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  capabilities: string[];
};

export class TenantAuthorityError extends Error {
  constructor(public readonly code: 'TENANT_ACCESS_DENIED' | 'AUTHORIZATION_STALE') {
    super(code);
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const capability = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;

const validateProjection = (value: unknown): TenantContext => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TenantAuthorityError('TENANT_ACCESS_DENIED');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !['userId', 'organizationId', 'workspaceId', 'authorizationVersion', 'capabilities'].includes(key)) ||
      typeof row.userId !== 'string' || !uuid.test(row.userId) ||
      typeof row.organizationId !== 'string' || !uuid.test(row.organizationId) ||
      typeof row.workspaceId !== 'string' || !uuid.test(row.workspaceId) ||
      !Number.isSafeInteger(row.authorizationVersion) || (row.authorizationVersion as number) < 1 ||
      !Array.isArray(row.capabilities)) {
    throw new TenantAuthorityError('TENANT_ACCESS_DENIED');
  }
  const capabilities = row.capabilities.map((entry) => {
    if (typeof entry !== 'string' || entry !== entry.trim().toLowerCase() || !capability.test(entry)) {
      throw new TenantAuthorityError('TENANT_ACCESS_DENIED');
    }
    return entry;
  });
  if (new Set(capabilities).size !== capabilities.length) throw new TenantAuthorityError('TENANT_ACCESS_DENIED');
  return { ...row, capabilities: [...capabilities].sort() } as TenantContext;
};

export const resolveTenantAuthority = async (
  validatedUserId: string,
  request: TenantAuthorityRequest,
  database: TenantAuthorityDatabase,
): Promise<TenantContext> => {
  const context = validateProjection(await database.loadFreshProjection(request));
  if (context.userId !== validatedUserId || context.organizationId !== request.organizationId || context.workspaceId !== request.workspaceId) {
    throw new TenantAuthorityError('TENANT_ACCESS_DENIED');
  }
  if (request.expectedAuthorizationVersion !== undefined && request.expectedAuthorizationVersion !== context.authorizationVersion) {
    throw new TenantAuthorityError('AUTHORIZATION_STALE');
  }
  return context;
};
