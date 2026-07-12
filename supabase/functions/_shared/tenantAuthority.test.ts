import assert from 'node:assert/strict';
import { TenantAuthorityDatabase, resolveTenantAuthority } from './tenantAuthority.ts';

const USER = '10000000-0000-4000-8000-000000000001';
const ORG = '20000000-0000-4000-8000-000000000002';
const WORKSPACE = '30000000-0000-4000-8000-000000000003';
const OTHER = '40000000-0000-4000-8000-000000000004';
const projection = () => ({ userId: USER, organizationId: ORG, workspaceId: WORKSPACE, authorizationVersion: 7, capabilities: ['assess.response.write', 'assess.read'] });
const database = (value: unknown): TenantAuthorityDatabase => ({ loadFreshProjection: async () => structuredClone(value) });
const request = { organizationId: ORG, workspaceId: WORKSPACE, expectedAuthorizationVersion: 7 };

const main = async () => {
const context = await resolveTenantAuthority(USER, request, database(projection()));
assert.deepEqual(context.capabilities, ['assess.read', 'assess.response.write']);

for (const value of [null, {}, { ...projection(), userId: OTHER }, { ...projection(), organizationId: OTHER },
  { ...projection(), authorizationVersion: 0 }, { ...projection(), capabilities: ['assess.read', 'ASSESS.CREATE'] },
  { ...projection(), capabilities: ['assess.read', 'assess.read'] }, { ...projection(), role: 'owner' }]) {
  await assert.rejects(resolveTenantAuthority(USER, request, database(value)), { code: 'TENANT_ACCESS_DENIED' });
}
await assert.rejects(resolveTenantAuthority(USER, { ...request, expectedAuthorizationVersion: 6 }, database(projection())), { code: 'AUTHORIZATION_STALE' });

let observed: unknown;
await resolveTenantAuthority(USER, request, { loadFreshProjection: async (input) => { observed = input; return projection(); } });
assert.deepEqual(observed, request);
console.log('tenant authority unit tests passed');
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
