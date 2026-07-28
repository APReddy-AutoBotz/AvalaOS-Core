import { getAuthUser, supabaseEnv } from './supabase.ts';
import { STUDIO_SAFE_ERROR_CODES, StudioArtifactError, type JsonObject, type StudioArtifactAtomicCommand, type StudioArtifactAuthority, type StudioArtifactDomainErrorCode, type StudioAtomicCommandResult } from './studioArtifactCommand.ts';
import type { StudioArtifactCommandDependencies } from './studioArtifactHandler.ts';
import { executeClaimedStudioGeneration } from './studioArtifactGeneration.ts';
import { callStudioArtifactProvider } from './studioArtifactProvider.ts';

type RpcError={code?:unknown;message?:unknown;details?:unknown;hint?:unknown};
export const decodeStudioRpcError=(error:unknown):StudioArtifactError=>{const candidate=error&&typeof error==='object'?(error as RpcError):{};for(const field of [candidate.code,candidate.message,candidate.details,candidate.hint])if(typeof field==='string'){const token=field.trim();if(STUDIO_SAFE_ERROR_CODES.includes(token as StudioArtifactDomainErrorCode))return new StudioArtifactError(token as StudioArtifactDomainErrorCode);}return new StudioArtifactError('COMMAND_UNAVAILABLE');};
const rpc=async<T>(name:string,args:JsonObject):Promise<T>=>{const {url,serviceRoleKey}=supabaseEnv();let response:Response;try{response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',redirect:'error',headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,'Content-Type':'application/json'},body:JSON.stringify(args)});}catch{throw new StudioArtifactError('COMMAND_UNAVAILABLE')}if(!response.ok){let body:unknown;try{body=await response.json()}catch{body={}}throw decodeStudioRpcError(body)}if(response.status===204)return undefined as T;return response.json() as Promise<T>;};
export type GenerationClaim=Readonly<{attemptId:string;artifactId:string;organizationId:string;workspaceId:string;actorId:string;requestId:string;sourcePackage:JsonObject;sourcePackageHash:string;artifactType:'brd'|'frd'|'pdd';templateVersion:string;templatePayload:string;templateHash:string;contentSchemaVersion:string;projectionVersion:string}>;
export const startStudioGeneration=(attemptId:string)=>rpc<void>('studio_artifact_generation_start',{p_attempt_id:attemptId});
export const completeStudioGeneration=async(input:{attemptId:string;content:JsonObject;providerOperationId?:string})=>{const response=await rpc<{resource:JsonObject}>('studio_artifact_generation_complete',{p_attempt_id:input.attemptId,p_content:input.content,p_provider_operation_id:input.providerOperationId??null});return response.resource;};
export const failStudioGeneration=(attemptId:string,failureCode:string)=>rpc<void>('studio_artifact_generation_fail',{p_attempt_id:attemptId,p_failure_code:failureCode});
export const studioArtifactDependencies:StudioArtifactCommandDependencies={
 authenticate:async request=>getAuthUser(request),
 // This function is service-role-only. It reauthorizes the authenticated human before any receipt/resource RPC.
 loadFreshAuthority:async({actorId,organizationId,workspaceId})=>{const rows=await rpc<StudioArtifactAuthority[]>('studio_artifact_authority',{p_actor_id:actorId,p_organization_id:organizationId,p_workspace_id:workspaceId});return rows[0]??null;},
 executeAtomicCommand:async(command:StudioArtifactAtomicCommand)=>rpc<StudioAtomicCommandResult>('studio_artifact_command_claim',{p_command:command}),
 executeClaimedGeneration:async claim=>executeClaimedStudioGeneration(claim as unknown as GenerationClaim,{runProvider:callStudioArtifactProvider,start:startStudioGeneration,complete:completeStudioGeneration,fail:failStudioGeneration}),
};
