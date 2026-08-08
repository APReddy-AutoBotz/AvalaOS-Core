import { handleOptions } from '../_shared/http.ts';
import { trustAssuranceQueryResponse as response } from '../_shared/trustAssuranceHttp.ts';
import { getAuthUser, supabaseEnv } from '../_shared/supabase.ts';
import { createTenantAuthorityDatabase } from '../_shared/tenantAuthorityDb.ts';
import { resolveTenantAuthority } from '../_shared/tenantAuthority.ts';
import {
  applyTrustAssuranceRuntimeConfiguration,
  decodeTrustAssuranceQueryRequest,
  trustAssuranceMutationsReadOnly,
} from '../_shared/trustAssuranceQuery.ts';

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

Deno.serve(async request => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') {
    return response({ code: 'ACCESS_DENIED', message: 'The requested resource is unavailable.' }, 404);
  }

  let actorId: string;
  try {
    actorId = (await getAuthUser(request)).id;
  } catch {
    return response({ code: 'ACCESS_DENIED', message: 'The requested resource is unavailable.' }, 404);
  }

  let input;
  try {
    input = decodeTrustAssuranceQueryRequest(await request.json().catch(() => null));
  } catch {
    return response({ code: 'VALIDATION_FAILED', message: 'Request is invalid.' }, 400);
  }

  try {
    const authority = await resolveTenantAuthority(actorId, {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      expectedAuthorizationVersion: input.authorizationVersion,
    }, createTenantAuthorityDatabase(request));
    if (!authority.capabilities.includes('trust.read')) {
      return response({ code: 'ACCESS_DENIED', message: 'The requested resource is unavailable.' }, 404);
    }
  } catch (error) {
    const stale = error instanceof Error && error.message === 'AUTHORIZATION_STALE';
    return response({
      code: stale ? 'AUTHORIZATION_STALE' : 'ACCESS_DENIED',
      message: 'The requested resource is unavailable.',
    }, stale ? 409 : 404);
  }

  const { url, serviceRoleKey } = supabaseEnv();
  const rpc = input.view === 'internal' ? 'trust_assurance_internal_projection' : 'trust_assurance_buyer_projection';
  let result: Response;
  try {
    result = await fetch(`${url}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_actor_id: actorId,
        p_org_id: input.organizationId,
        p_workspace_id: input.workspaceId,
        p_authorization_version: input.authorizationVersion,
      }),
    });
  } catch {
    return response({ code: 'PERSISTENCE_UNAVAILABLE', message: 'Trust Assurance is unavailable.' }, 503);
  }
  if (!result.ok) return response({ code: 'PERSISTENCE_UNAVAILABLE', message: 'Trust Assurance is unavailable.' }, 503);

  const body = await result.json().catch(() => undefined);
  if (body === undefined) return response({ code: 'PERSISTENCE_UNAVAILABLE', message: 'Trust Assurance is unavailable.' }, 503);
  if (body === null) return response({ code: 'NO_PUBLICATION', message: 'No published assurance snapshot is available.' }, 404);
  return response(applyTrustAssuranceRuntimeConfiguration(
    input.view,
    body,
    trustAssuranceMutationsReadOnly(
      Deno.env.get('TRUST_ASSURANCE_ENABLED') === 'true',
      Deno.env.get('TRUST_ASSURANCE_READ_ONLY') === 'true',
    ),
  ), 200);
});
