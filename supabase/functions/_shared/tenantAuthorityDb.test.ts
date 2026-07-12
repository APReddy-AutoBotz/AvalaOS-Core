import assert from 'node:assert/strict';
import { createTenantAuthorityDatabase, TENANT_AUTHORITY_RPC } from './tenantAuthorityDb.ts';

const originalFetch = globalThis.fetch;
const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
const environment: Record<string, string> = {
  SUPABASE_URL: 'https://example.invalid',
  SUPABASE_ANON_KEY: 'public-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-used',
};
(globalThis as typeof globalThis & { Deno: unknown }).Deno = { env: { get: (key: string) => environment[key] } };

let captured: { input: string; init?: RequestInit } | undefined;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  captured = { input: String(input), init };
  return new Response(JSON.stringify({
    userId: '10000000-0000-4000-8000-000000000001',
    organizationId: '20000000-0000-4000-8000-000000000002',
    workspaceId: '30000000-0000-4000-8000-000000000003',
    authorizationVersion: 1,
    capabilities: ['assess.read'],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const main = async () => {
try {
  const request = new Request('http://local', { headers: { Authorization: 'Bearer validated-caller-jwt' } });
  await createTenantAuthorityDatabase(request).loadFreshProjection({
    organizationId: '20000000-0000-4000-8000-000000000002',
    workspaceId: '30000000-0000-4000-8000-000000000003',
  });
  assert.equal(captured?.input, `https://example.invalid/rest/v1/rpc/${TENANT_AUTHORITY_RPC}`);
  assert.equal(new Headers(captured?.init?.headers).get('authorization'), 'Bearer validated-caller-jwt');
  assert.notEqual(new Headers(captured?.init?.headers).get('authorization'), 'Bearer must-not-be-used');
  assert.equal(captured?.init?.redirect, 'error');
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), {
    p_org_id: '20000000-0000-4000-8000-000000000002',
    p_workspace_id: '30000000-0000-4000-8000-000000000003',
  });
  assert.equal(String(captured?.init?.body).includes('user_id'), false);
} finally {
  globalThis.fetch = originalFetch;
  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
}

console.log('tenant authority database boundary tests passed');
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
