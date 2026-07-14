import { AssessCommandError } from './assessCommand.ts';
import { getAuthUser, supabaseEnv } from './supabase.ts';
import type { TenantSessionDependencies } from './tenantSession.ts';

export const tenantSessionDependencies: TenantSessionDependencies = {
  authenticate: getAuthUser,
  async loadAvailableContexts(actorId) {
    const { url, serviceRoleKey } = supabaseEnv();
    const response = await fetch(`${url}/rest/v1/rpc/pr1c_list_tenant_contexts`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_actor_id: actorId }),
    });
    if (!response.ok) throw new AssessCommandError('COMMAND_UNAVAILABLE');
    return response.json();
  },
};
