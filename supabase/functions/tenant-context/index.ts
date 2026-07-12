import { getAuthUser } from '../_shared/supabase.ts';
import { createTenantAuthorityDatabase } from '../_shared/tenantAuthorityDb.ts';
import { handleTenantContext } from './handler.ts';

Deno.serve((request) => handleTenantContext(request, {
  authenticate: getAuthUser,
  database: createTenantAuthorityDatabase(request),
}));
