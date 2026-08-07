import { decodeBuyerSafeProjection, decodeInternalProjection } from './decoder';
import type { BuyerSafeProjection, InternalAssuranceProjection, TrustCommandRequest, TrustCommandResponse } from './contracts';

export type TrustScope={organizationId:string;workspaceId:string;authorizationVersion:number};
const safeJson=async(response:Response):Promise<unknown>=>{try{return await response.json()}catch{throw new Error('PERSISTENCE_UNAVAILABLE')}};
export const queryTrustAssurance=async(scope:TrustScope,view:'internal'|'buyer',fetcher:typeof fetch=fetch):Promise<InternalAssuranceProjection|BuyerSafeProjection|null>=>{
 const query=new URLSearchParams({organizationId:scope.organizationId,workspaceId:scope.workspaceId,authorizationVersion:String(scope.authorizationVersion),view});
 const response=await fetcher(`/functions/v1/trust-assurance-query?${query}`,{headers:{accept:'application/json'},cache:'no-store'});if(response.status===404&&view==='buyer')return null;if(!response.ok)throw new Error(response.status===409?'AUTHORIZATION_STALE':response.status===403?'ACCESS_DENIED':'PERSISTENCE_UNAVAILABLE');const value=await safeJson(response);return view==='internal'?decodeInternalProjection(value):decodeBuyerSafeProjection(value);
};
export const commandTrustAssurance=async(request:TrustCommandRequest,fetcher:typeof fetch=fetch):Promise<TrustCommandResponse>=>{const response=await fetcher('/functions/v1/trust-assurance-command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});const value=await safeJson(response);if(!value||typeof value!=='object'||Array.isArray(value)||typeof(value as {ok?:unknown}).ok!=='boolean')throw new Error('PERSISTENCE_UNAVAILABLE');return value as TrustCommandResponse;};
