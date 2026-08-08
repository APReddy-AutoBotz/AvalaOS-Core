import { handleOptions } from '../_shared/http.ts';
import { trustAssuranceCommandResponse as json } from '../_shared/trustAssuranceHttp.ts';
import { executeTrustCommand } from '../_shared/trustAssuranceCommand.ts';
import { getAuthUser, supabaseEnv } from '../_shared/supabase.ts';
import { createTenantAuthorityDatabase } from '../_shared/tenantAuthorityDb.ts';
import { resolveTenantAuthority } from '../_shared/tenantAuthority.ts';
declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(request:Request)=>Response|Promise<Response>)=>void};
Deno.serve(async request=>{
  const options=handleOptions(request);if(options)return options;if(request.method!=='POST')return json({ok:false,code:'ACCESS_DENIED',message:'The requested resource is unavailable.'},404);
  let actorId='';try{actorId=(await getAuthUser(request)).id}catch{return json({ok:false,code:'ACCESS_DENIED',message:'The requested resource is unavailable.'},404)}
  const result=await executeTrustCommand(await request.json().catch(()=>null),{featureEnabled:Deno.env.get('TRUST_ASSURANCE_ENABLED')==='true',readOnly:Deno.env.get('TRUST_ASSURANCE_READ_ONLY')==='true',
    resolveAuthority:input=>resolveTenantAuthority(actorId,{organizationId:input.organizationId,workspaceId:input.workspaceId??'00000000-0000-0000-0000-000000000000',expectedAuthorizationVersion:input.expectedAuthorizationVersion},createTenantAuthorityDatabase(request)),
    execute:async input=>{const{url,serviceRoleKey}=supabaseEnv();const response=await fetch(`${url}/rest/v1/rpc/trust_assurance_command`,{method:'POST',redirect:'error',headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,'content-type':'application/json'},body:JSON.stringify({p_actor_id:input.actorId,p_org_id:input.organizationId,p_workspace_id:input.workspaceId,p_operation:input.operation,p_idempotency_key:input.idempotencyKey,p_request_id:input.requestId,p_request_hash:input.requestHash,p_authorization_version:input.expectedAuthorizationVersion,p_mutations_enabled:input.mutationsEnabled,p_expected_version:input.expectedVersion??null,p_payload:input.payload})});if(!response.ok){const body=await response.text();throw new Error(body)}return response.json();}});
  if(!('code' in result))return json(result,200);
  const status=result.code==='VALIDATION_FAILED'?400:result.code==='AUTHORIZATION_STALE'||result.code==='VERSION_CONFLICT'||result.code==='IDEMPOTENCY_CONFLICT'?409:result.code==='FEATURE_DISABLED'||result.code==='PERSISTENCE_UNAVAILABLE'?503:403;
  return json(result,status);
});
