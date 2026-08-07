import { handleOptions } from '../_shared/http.ts';
import { getAuthUser, supabaseEnv } from '../_shared/supabase.ts';
import { createTenantAuthorityDatabase } from '../_shared/tenantAuthorityDb.ts';
import { resolveTenantAuthority } from '../_shared/tenantAuthority.ts';
declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(request:Request)=>Response|Promise<Response>)=>void};
const response=(body:unknown,status:number)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store','vary':'authorization'}});
Deno.serve(async request=>{
  const options=handleOptions(request);if(options)return options;
  if(request.method!=='GET'||Deno.env.get('TRUST_ASSURANCE_ENABLED')!=='true')return response({code:'ACCESS_DENIED',message:'The requested resource is unavailable.'},404);
  const url=new URL(request.url),organizationId=url.searchParams.get('organizationId')??'',workspaceId=url.searchParams.get('workspaceId')??'',view=url.searchParams.get('view'),version=Number(url.searchParams.get('authorizationVersion'));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;if(!uuid.test(organizationId)||!uuid.test(workspaceId)||!Number.isSafeInteger(version)||version<1||(view!=='internal'&&view!=='buyer'))return response({code:'VALIDATION_FAILED',message:'Request is invalid.'},400);
  let actorId='';try{actorId=(await getAuthUser(request)).id;const authority=await resolveTenantAuthority(actorId,{organizationId,workspaceId,expectedAuthorizationVersion:version},createTenantAuthorityDatabase(request));if(!authority.capabilities.includes('trust.read'))return response({code:'ACCESS_DENIED',message:'The requested resource is unavailable.'},404)}catch(error){return response({code:error instanceof Error&&error.message==='AUTHORIZATION_STALE'?'AUTHORIZATION_STALE':'ACCESS_DENIED',message:'The requested resource is unavailable.'},error instanceof Error&&error.message==='AUTHORIZATION_STALE'?409:404)}
  const{url:base,serviceRoleKey}=supabaseEnv();const rpc=view==='internal'?'trust_assurance_internal_projection':'trust_assurance_buyer_projection';let result:Response;try{result=await fetch(`${base}/rest/v1/rpc/${rpc}`,{method:'POST',redirect:'error',headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,'content-type':'application/json'},body:JSON.stringify({p_actor_id:actorId,p_org_id:organizationId,p_workspace_id:workspaceId,p_authorization_version:version})})}catch{return response({code:'PERSISTENCE_UNAVAILABLE',message:'Trust Assurance is unavailable.'},503)}
  if(!result.ok)return response({code:'PERSISTENCE_UNAVAILABLE',message:'Trust Assurance is unavailable.'},503);const body=await result.json();if(body===null)return response({code:'NO_PUBLICATION',message:'No published assurance snapshot is available.'},404);return response(body,200);
});
