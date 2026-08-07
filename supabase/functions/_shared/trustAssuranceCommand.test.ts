import assert from 'node:assert/strict';import { canonicalTrustRequestHash,decodeTrustCommandRequest,executeTrustCommand } from './trustAssuranceCommand';
const request={requestId:'11111111-1111-4111-8111-111111111111',idempotencyKey:'key',operation:'snapshot.publish' as const,organizationId:'22222222-2222-4222-8222-222222222222',workspaceId:'33333333-3333-4333-8333-333333333333',expectedAuthorizationVersion:2,expectedVersion:1,payload:{snapshotId:'44444444-4444-4444-8444-444444444444'}};
const authority={userId:'55555555-5555-4555-8555-555555555555',organizationId:request.organizationId,workspaceId:request.workspaceId,authorizationVersion:2,capabilities:['trust.publish']};
const main=async()=>{
 let executions=0;const result=await executeTrustCommand(request,{featureEnabled:true,readOnly:false,resolveAuthority:async()=>authority,execute:async input=>{executions++;return{ok:true,replayed:false,resourceId:String(input.payload.snapshotId),version:2,body:{}}}});assert.equal(result.ok,true);assert.equal(executions,1);
 assert.equal(await canonicalTrustRequestHash(request),await canonicalTrustRequestHash({...request,requestId:'66666666-6666-4666-8666-666666666666'}));
 assert.equal((await executeTrustCommand(request,{featureEnabled:true,readOnly:false,resolveAuthority:async()=>({...authority,capabilities:['trust.read']}),execute:async()=>{throw new Error('must not run')}})).ok,false);
 assert.deepEqual(await executeTrustCommand(request,{featureEnabled:false,readOnly:false,resolveAuthority:async()=>authority,execute:async()=>{throw new Error('must not run')}}),{ok:false,code:'FEATURE_DISABLED',message:'Trust Assurance mutations are disabled.'});
 for(const payload of [{...request.payload,canonicalHash:'a'.repeat(64)},{snapshotId:'bad-id'},{snapshotId:request.payload.snapshotId,unexpected:true}])assert.throws(()=>decodeTrustCommandRequest({...request,payload}),/VALIDATION_FAILED/);
 const claim={...request,operation:'claim.create' as const,expectedVersion:undefined,payload:{readinessDomain:'security',claimText:'Source controls exist.',proposedProofStatus:'configured',proofBoundary:'docs_only',buyerSafeWording:'Source controls exist.',limitationDisclosure:'Source only.',doesNotProve:['Hosted behavior']}};assert.equal(decodeTrustCommandRequest(claim).payload.claimText,'Source controls exist.');
 assert.throws(()=>decodeTrustCommandRequest({...claim,payload:{...claim.payload,canonicalHash:'a'.repeat(64)}}),/VALIDATION_FAILED/);
 console.log('Trust Assurance command tests passed');
};main().catch(error=>{console.error(error);process.exitCode=1});
