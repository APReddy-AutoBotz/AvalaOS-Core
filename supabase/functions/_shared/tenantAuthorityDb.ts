import { getBearerToken, supabaseEnv } from './supabase.ts';
import { TenantAuthorityDatabase } from './tenantAuthority.ts';

// Kept in one place so the Edge projection stays coupled to the canonical migration contract.
export const TENANT_AUTHORITY_RPC = 'get_tenant_context';

export const createTenantAuthorityDatabase = (request: Request): TenantAuthorityDatabase => ({
  async loadFreshProjection(input): Promise<unknown> {
    const { url, anonKey } = supabaseEnv();
    const callerToken = getBearerToken(request);
    const response = await fetch(`${url}/rest/v1/rpc/${TENANT_AUTHORITY_RPC}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${callerToken}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        p_org_id: input.organizationId,
        p_workspace_id: input.workspaceId,
      }),
    });
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) return null;
      throw new Error('Tenant authority lookup failed.');
    }
    const result = await response.json();
    return result;
  },
});
