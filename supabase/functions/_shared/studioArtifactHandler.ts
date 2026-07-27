import { asStudioArtifactError, parseStudioArtifactEnvelope, requiredStudioCapability, StudioArtifactError, studioArtifactErrorBody, type JsonObject, type StudioArtifactAtomicCommand, type StudioArtifactAuthority } from './studioArtifactCommand.ts';

export interface StudioArtifactCommandDependencies { authenticate(request:Request):Promise<{id:string}>; loadFreshAuthority(input:{request:Request;actorId:string;organizationId:string;workspaceId:string}):Promise<StudioArtifactAuthority|null>; executeAtomicCommand(command:StudioArtifactAtomicCommand):Promise<{outcome:'committed'|'replayed';resource:JsonObject;receiptId:string}>; executeClaimedGeneration?(claim:JsonObject):Promise<unknown> }
export const handleStudioArtifactCommand=async(request:Request,deps:StudioArtifactCommandDependencies):Promise<Response>=>{try{
 if(request.method!=='POST')throw new StudioArtifactError('METHOD_NOT_ALLOWED');
 let actor:{id:string};try{actor=await deps.authenticate(request)}catch{throw new StudioArtifactError('AUTHENTICATION_REQUIRED')}
 let envelope;try{envelope=parseStudioArtifactEnvelope(await request.json())}catch(e){throw e instanceof StudioArtifactError?e:new StudioArtifactError('INVALID_COMMAND')}
 // Authority is resolved before the database sees a receipt or resource identifier.
 const authority=await deps.loadFreshAuthority({request,actorId:actor.id,organizationId:envelope.organizationId,workspaceId:envelope.workspaceId});
 if(!authority||authority.actorId!==actor.id)throw new StudioArtifactError('RESOURCE_NOT_AVAILABLE');
 if(authority.authorizationVersion!==envelope.authorizationVersion)throw new StudioArtifactError('AUTHORITY_STALE');
 if(!authority.capabilities.includes(requiredStudioCapability(envelope.commandType)))throw new StudioArtifactError('PERMISSION_DENIED');
 const result=await deps.executeAtomicCommand({...envelope,actorId:actor.id});
 if(envelope.commandType==='studio.artifact.generation.request'&&result.resource.generationClaim&&deps.executeClaimedGeneration){const generation=await deps.executeClaimedGeneration(result.resource.generationClaim as JsonObject);return Response.json({ok:true,...result,generation},{status:result.outcome==='committed'?201:200});}
 return Response.json({ok:true,...result},{status:result.outcome==='committed'?201:200});
 }catch(error){const safe=asStudioArtifactError(error);return Response.json(studioArtifactErrorBody(safe),{status:safe.status});}};
