import { asStudioArtifactError, parseStudioArtifactEnvelope, requiredStudioCapability, StudioArtifactError, studioArtifactErrorBody, type JsonObject, type StudioArtifactAtomicCommand, type StudioArtifactAuthority, type StudioAtomicCommandResult } from './studioArtifactCommand.ts';

export interface StudioArtifactCommandDependencies { authenticate(request:Request):Promise<{id:string}>; loadFreshAuthority(input:{request:Request;actorId:string;organizationId:string;workspaceId:string}):Promise<StudioArtifactAuthority|null>; executeAtomicCommand(command:StudioArtifactAtomicCommand):Promise<StudioAtomicCommandResult>; executeClaimedGeneration?(claim:JsonObject):Promise<{state:'completed';resource:unknown}|{state:'failed';failureCode:string}> }
const publicResult=(result:StudioAtomicCommandResult)=>({outcome:result.outcome,receiptId:result.receiptId,resourceId:result.resourceId,resource:result.resource});
export const handleStudioArtifactCommand=async(request:Request,deps:StudioArtifactCommandDependencies):Promise<Response>=>{try{
 if(request.method!=='POST')throw new StudioArtifactError('METHOD_NOT_ALLOWED');
 let actor:{id:string};try{actor=await deps.authenticate(request)}catch{throw new StudioArtifactError('AUTHENTICATION_REQUIRED')}
 let envelope;try{envelope=parseStudioArtifactEnvelope(await request.json())}catch(e){throw e instanceof StudioArtifactError?e:new StudioArtifactError('INVALID_COMMAND')}
 // Fresh private authority precedes every receipt, artifact, attempt, or version inspection.
 const authority=await deps.loadFreshAuthority({request,actorId:actor.id,organizationId:envelope.organizationId,workspaceId:envelope.workspaceId});
 if(!authority||authority.actorId!==actor.id)throw new StudioArtifactError('RESOURCE_NOT_AVAILABLE');
 if(authority.authorizationVersion!==envelope.authorizationVersion)throw new StudioArtifactError('AUTHORITY_STALE');
 if(!authority.capabilities.includes(requiredStudioCapability(envelope.commandType)))throw new StudioArtifactError('PERMISSION_DENIED');
 const result=await deps.executeAtomicCommand({...envelope,actorId:actor.id});
 // Exact replay never repeats the external effect.
 if(envelope.commandType!=='studio.artifact.generation.request'||result.outcome==='replayed'||!result.generationClaim||!deps.executeClaimedGeneration)return Response.json({ok:true,...publicResult(result)},{status:result.outcome==='committed'?201:200});
 const generation=await deps.executeClaimedGeneration(result.generationClaim);
 if(generation.state==='failed')return Response.json({ok:true,outcome:'generation_failed',receiptId:result.receiptId,resourceId:result.resourceId,resource:result.resource,generation},{status:200});
 return Response.json({ok:true,outcome:'generation_completed',receiptId:result.receiptId,resourceId:result.resourceId,resource:generation.resource},{status:201});
 }catch(error){const safe=asStudioArtifactError(error);return Response.json(studioArtifactErrorBody(safe),{status:safe.status});}};
