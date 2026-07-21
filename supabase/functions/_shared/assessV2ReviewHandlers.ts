import { ASSESS_V2_REVIEW_CAPABILITY, AssessV2ReviewAtomicCommand, AssessV2ReviewDependencies, AssessV2ReviewEnvelope, AssessV2ReviewError } from './assessV2ReviewCommand.ts';

export const executeAssessV2ReviewCommand=async(request:Request,envelope:AssessV2ReviewEnvelope,deps:AssessV2ReviewDependencies)=>{
  let actor:{id:string}; try{actor=await deps.authenticate(request)}catch{throw new AssessV2ReviewError('AUTHENTICATION_REQUIRED')}
  const authority=await deps.loadFreshAuthority({request,actorId:actor.id,organizationId:envelope.organizationId,workspaceId:envelope.workspaceId});
  if(!authority||authority.actorId!==actor.id||authority.organizationId!==envelope.organizationId||authority.workspaceId!==envelope.workspaceId)throw new AssessV2ReviewError('RESOURCE_NOT_AVAILABLE');
  if(authority.authorizationVersion!==envelope.authorizationVersion)throw new AssessV2ReviewError('AUTHORITY_STALE');
  if(!authority.capabilities.includes(ASSESS_V2_REVIEW_CAPABILITY[envelope.commandType]))throw new AssessV2ReviewError('PERMISSION_DENIED');
  return deps.executeAtomicReviewCommand({...envelope,actorId:actor.id} as AssessV2ReviewAtomicCommand);
};
