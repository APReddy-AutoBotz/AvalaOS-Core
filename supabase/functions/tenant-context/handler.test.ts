import assert from 'node:assert/strict';
import { TenantAuthorityDatabase } from '../_shared/tenantAuthority.ts';
import { handleTenantContext } from './handler.ts';

const USER = '10000000-0000-4000-8000-000000000001';
const ORG = '20000000-0000-4000-8000-000000000002';
const WORKSPACE = '30000000-0000-4000-8000-000000000003';
const OTHER = '40000000-0000-4000-8000-000000000004';

const projection = () => ({ userId: USER, organizationId: ORG, workspaceId: WORKSPACE, authorizationVersion: 2, capabilities: ['assess.read', 'assess.response.write'] });

const invoke = async (body: unknown, database: TenantAuthorityDatabase, authenticate = async () => ({ id: USER })) => {
  const authorization = ['Bearer', 'claims-are-not-authority'].join(' ');
  const response = await handleTenantContext(new Request('http://local/tenant-context', {
    method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify(body),
  }), { authenticate, database });
  return { response, body: await response.json() };
};

const main = async () => {
const allowed = await invoke({ organizationId: ORG, workspaceId: WORKSPACE, expectedAuthorizationVersion: 2 }, { loadFreshProjection: async () => projection() });
assert.equal(allowed.response.status, 200);
assert.equal(allowed.response.headers.get('cache-control'), 'no-store');
assert.deepEqual(allowed.body.tenantContext.capabilities, ['assess.read', 'assess.response.write']);

// Extra client claims, roles, permissions, and a supplied TenantContext are rejected, never trusted.
const claims = await invoke({ organizationId: ORG, workspaceId: WORKSPACE, role: 'owner', permissions: ['*'], tenantContext: {} }, { loadFreshProjection: async () => projection() });
assert.deepEqual({ status: claims.response.status, body: claims.body }, { status: 400, body: { code: 'INVALID_REQUEST' } });

const unauthenticated = await invoke({ organizationId: ORG, workspaceId: WORKSPACE }, { loadFreshProjection: async () => projection() }, async () => { throw new Error('bad token'); });
assert.deepEqual({ status: unauthenticated.response.status, body: unauthenticated.body }, { status: 401, body: { code: 'AUTHENTICATION_REQUIRED' } });

const stale = await invoke({ organizationId: ORG, workspaceId: WORKSPACE, expectedAuthorizationVersion: 1 }, { loadFreshProjection: async () => projection() });
assert.deepEqual({ status: stale.response.status, body: stale.body }, { status: 409, body: { code: 'AUTHORIZATION_STALE' } });

// A cross-tenant miss and a revoked membership have exactly the same non-disclosing response.
const missing = await invoke({ organizationId: OTHER, workspaceId: WORKSPACE }, { loadFreshProjection: async () => null });
const revoked = await invoke({ organizationId: ORG, workspaceId: WORKSPACE }, { loadFreshProjection: async () => null });
assert.deepEqual({ status: missing.response.status, body: missing.body }, { status: 403, body: { code: 'TENANT_ACCESS_DENIED' } });
assert.deepEqual({ status: revoked.response.status, body: revoked.body }, { status: 403, body: { code: 'TENANT_ACCESS_DENIED' } });

console.log('tenant context handler integration tests passed');
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
