import { getAuthUser, postgrest } from './supabase.ts';
import { StudioArtifactError, type JsonObject, type StudioArtifactAtomicCommand, type StudioArtifactAuthority } from './studioArtifactCommand.ts';
import type { StudioArtifactCommandDependencies } from './studioArtifactHandler.ts';
import { executeClaimedStudioGeneration } from './studioArtifactGeneration.ts';
import { callStudioArtifactProvider } from './studioArtifactProvider.ts';

type RpcError={code?:string};
const mapped=(error:unknown)=>{const code=(error as RpcError)?.code;const allowed=['RESOURCE_NOT_AVAILABLE','AUTHORITY_STALE','PERMISSION_DENIED','VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','FEATURE_DISABLED','READ_ONLY'] as const;return new StudioArtifactError(allowed.includes(code as typeof allowed[number])?code as typeof allowed[number]:'COMMAND_UNAVAILABLE');};
const rpc=async<T>(name:string,args:JsonObject):Promise<T>=>{try{return await postgrest<T>(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});}catch(error){throw mapped(error)}};
export const studioArtifactDependencies:StudioArtifactCommandDependencies={
 authenticate:async request=>getAuthUser(request),
 loadFreshAuthority:async({actorId,organizationId,workspaceId})=>{const rows=await rpc<StudioArtifactAuthority[]>('studio_artifact_authority',{p_actor_id:actorId,p_organization_id:organizationId,p_workspace_id:workspaceId});return rows[0]??null;},
 executeAtomicCommand:async(command:StudioArtifactAtomicCommand)=>rpc('studio_artifact_command_claim',{p_command:command}),
 executeClaimedGeneration:async claim=>executeClaimedStudioGeneration(claim as unknown as GenerationClaim,{runProvider:callStudioArtifactProvider,complete:completeStudioGeneration,fail:failStudioGeneration}),
};
export type GenerationClaim=Readonly<{attemptId:string;artifactId:string;organizationId:string;workspaceId:string;actorId:string;requestId:string;sourcePackage:JsonObject;sourcePackageHash:string;artifactType:'brd'|'frd'|'pdd';templateVersion:string;templatePayload:string;templateHash:string;contentSchemaVersion:string;projectionVersion:string}>;
export const completeStudioGeneration=(input:{attemptId:string;content:JsonObject;contentHash:string})=>rpc<{artifactId:string;artifactVersionId:string;version:number}>('studio_artifact_generation_complete',{p_attempt_id:input.attemptId,p_content:input.content,p_content_hash:input.contentHash});
export const failStudioGeneration=(attemptId:string,failureCode:string)=>rpc<void>('studio_artifact_generation_fail',{p_attempt_id:attemptId,p_failure_code:failureCode});
