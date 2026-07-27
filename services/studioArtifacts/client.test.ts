import { strict as assert } from 'node:assert';
import type { TenantContextProjection } from '../../types';
import { decodeStudioArtifactProjection, decodeStudioCommandResponse, decodeStudioEligibleReviewers, decodeStudioHandoffs, decodeStudioSafeError, executeStudioArtifactCommand, readStudioArtifact, readStudioEligibleReviewers, readStudioHandoffs, StudioArtifactBoundaryError, studioArtifactDefaultTransport, type StudioArtifactTransport } from './client';

const U=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','99999999-9999-4999-8999-999999999999'] as const;
const context={userId:U[8],organizationId:U[0],organizationName:'Avala',workspaceId:U[1],workspaceName:'Studio',authorizationVersion:4,capabilities:[]} satisfies TenantContextProjection;
const version={id:U[7],version:1,parentVersionId:null,lifecycle:'draft',templateVersion:'brd-v1',contentSchemaVersion:'studio-v1',projectionVersion:'json-v1',content:{title:'Governed'},contentHash:'a'.repeat(64),authorId:U[8],createdAt:'2026-07-27T00:00:00.000Z'};
const projection={id:U[6],artifactType:'brd',aggregateVersion:1,lifecycle:'draft',ancestry:{organizationId:U[0],workspaceId:U[1],caseId:U[2],sourceCaseVersionId:U[3],sourceCaseVersion:2,decisionId:U[4],decisionVersion:'decision-v3',reviewResolutionId:U[5],governResolutionId:U[6],studioHandoffId:U[7],sourcePackageHash:'b'.repeat(64),sourceSchemaVersion:'assess-v2',ruleSetVersion:'rules-v1',reviewSchemaVersion:'review-v1',reviewSequence:1},currentVersion:version,currentApprovedVersion:null,versions:[version],review:null,approval:null,readOnly:false};

assert.equal(decodeStudioArtifactProjection(projection,context).ancestry.decisionVersion,'decision-v3');
assert.throws(()=>decodeStudioArtifactProjection({...projection,clientTemplate:'forbidden'},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,ancestry:{...projection.ancestry,workspaceId:U[2]}},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,currentApprovedVersion:{...version,lifecycle:'draft'}},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,versions:[{...version,version:2},{...version,id:U[6],version:1}]},context),StudioArtifactBoundaryError);
assert.deepEqual(decodeStudioHandoffs([{id:U[7],caseId:U[2],label:'Accepted case',sourcePackageHash:'c'.repeat(64)}]).map(x=>x.label),['Accepted case']);
assert.throws(()=>decodeStudioHandoffs([{id:U[7],caseId:U[2],label:'Legacy',sourcePackageHash:'c'.repeat(64),documentGenerationId:U[3]}]),StudioArtifactBoundaryError);
assert.deepEqual(decodeStudioEligibleReviewers([{actorId:U[8],displayName:'Independent Reviewer'}]),[{actorId:U[8],displayName:'Independent Reviewer'}]);
assert.equal(decodeStudioSafeError({code:'VERSION_CONFLICT',details:'secret table public.foo'}).code,'VERSION_CONFLICT');
assert.equal(decodeStudioSafeError({code:'42P01',details:'secret table public.foo'}).code,'COMMAND_UNAVAILABLE');
const response={ok:true as const,outcome:'committed' as const,receiptId:U[5],resourceId:U[6],resource:{state:'requested'}};
assert.deepEqual(decodeStudioCommandResponse(response),response);
assert.throws(()=>decodeStudioCommandResponse({...response,resource_id:U[6]}),StudioArtifactBoundaryError);

void(async()=>{let envelope:any;
  const transport:StudioArtifactTransport={readHandoffs:async()=>[],readProjection:async()=>projection,readEligibleReviewers:async()=>[],invoke:async(value)=>{envelope=value;return response;}};
  const committed=await executeStudioArtifactCommand(context,'studio.artifact.generation.request',null,{studioHandoffId:U[7],artifactType:'brd'},'generation-key',transport);
  assert.equal(committed.resourceId,U[6]);assert.equal(envelope.expectedAggregateVersion,0);assert.equal(envelope.expectedArtifactVersion,null);
  await executeStudioArtifactCommand(context,'studio.artifact.draft.revise',projection as any,{artifactId:U[6],parentVersionId:U[7],content:{title:'revision'}},'revision-key',transport);
  assert.equal(envelope.expectedArtifactVersion,1);assert.deepEqual(Object.keys(envelope.payload).sort(),['artifactId','content','parentVersionId']);
  assert.equal((await readStudioHandoffs(context,transport)).length,0);assert.equal((await readStudioArtifact(context,U[7],'brd',transport)).id,U[6]);assert.equal((await readStudioEligibleReviewers(context,U[6],U[7],transport)).length,0);
  const g=globalThis as any;g.__studioRpc=async(name:string)=>name==='studio_artifact_handoffs'?{data:[{id:U[7],caseId:U[2],label:'Accepted case',sourcePackageHash:'c'.repeat(64)}],error:null}:name==='studio_artifact_projection'?{data:projection,error:null}:{data:[{actorId:U[8],displayName:'Independent Reviewer'}],error:null};g.__studioInvoke=async()=>({data:response,error:null});
  assert.equal((await studioArtifactDefaultTransport.readHandoffs(context) as any[]).length,1);assert.equal((await studioArtifactDefaultTransport.readProjection(context,U[7],'brd') as any).id,U[6]);assert.equal((await studioArtifactDefaultTransport.readEligibleReviewers(context,U[6],U[7]) as any[]).length,1);assert.equal((await studioArtifactDefaultTransport.invoke(envelope) as any).outcome,'committed');delete g.__studioRpc;delete g.__studioInvoke;
  console.log('studio artifact client: 17 projection, DTO, safe-error, response and command assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
