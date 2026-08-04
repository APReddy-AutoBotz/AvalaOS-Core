import { getAuthUser } from '../_shared/supabase.ts';
import { createTenantAuthorityDatabase } from '../_shared/tenantAuthorityDb.ts';
import {
  createEnterpriseIntelligenceQueryDatabase,
  handleEnterpriseIntelligenceQuery,
} from '../_shared/enterpriseIntelligenceQuery.ts';

declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

Deno.serve(request => handleEnterpriseIntelligenceQuery(request, {
  authenticate: getAuthUser,
  authorityDatabase: createTenantAuthorityDatabase(request),
  queryDatabase: createEnterpriseIntelligenceQueryDatabase(),
}));
