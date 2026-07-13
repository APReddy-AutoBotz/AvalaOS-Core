import { tenantSessionDependencies } from '../_shared/tenantSessionDb.ts';
import { handleTenantSessionRequest } from '../_shared/tenantSession.ts';

declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

Deno.serve(request => handleTenantSessionRequest(request, tenantSessionDependencies));
