import { parseStudioArtifactEnvelope, StudioArtifactError } from './studioArtifactCommand.ts';
import { handleStudioArtifactCommand } from './studioArtifactHandler.ts';

const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004'];
const base={requestId:ids[0],idempotencyKey:'request-key-001',commandType:'studio.artifact.generation.request',organizationId:ids[1],workspaceId:ids[2],authorizationVersion:3,expectedAggregateVersion:0,expectedArtifactVersion:null,payload:{studioHandoffId:ids[3],artifactType:'brd'}};
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
const rejects=(value:unknown)=>{try{parseStudioArtifactEnvelope(value);return false}catch(e){return e instanceof StudioArtifactError}};
assert(parseStudioArtifactEnvelope(base).payload.artifactType==='brd','generation parses');
const commandPayloads=[
 ['studio.artifact.draft.revise',{artifactId:ids[0],parentVersionId:ids[1],content:{title:'Revised',sections:['one']}},1],
 ['studio.artifact.review.submit',{artifactId:ids[0],artifactVersionId:ids[1]},1],
 ['studio.artifact.review.assign',{artifactId:ids[0],artifactVersionId:ids[1],reviewerId:ids[2]},1],
 ['studio.artifact.review.resolve',{artifactId:ids[0],artifactVersionId:ids[1],outcome:'changes_requested',rationale:'Revise',conditions:['Retain evidence']},1],
 ['studio.artifact.approval.resolve',{artifactId:ids[0],artifactVersionId:ids[1],outcome:'approve',rationale:'Approved',conditions:[]},1],
] as const;
for(const [commandType,payload,expectedArtifactVersion] of commandPayloads)assert(parseStudioArtifactEnvelope({...base,commandType,payload,expectedArtifactVersion}).commandType===commandType,`${commandType} parses`);
for(const invalid of [
 {...base,extra:true},{...base,payload:{...base.payload,prompt:'browser authority'}},{...base,payload:{...base.payload,artifactType:'pdf'}},{...base,expectedAggregateVersion:-1},{...base,expectedArtifactVersion:1},
 {...base,commandType:'studio.artifact.review.submit',expectedArtifactVersion:null,payload:{artifactId:ids[0],artifactVersionId:ids[1]}},
 {...base,commandType:'studio.artifact.review.resolve',expectedArtifactVersion:1,payload:{artifactId:ids[0],artifactVersionId:ids[1],outcome:'approved',rationale:'x',conditions:[]}},
 {...base,commandType:'studio.artifact.review.resolve',expectedArtifactVersion:1,payload:{artifactId:ids[0],artifactVersionId:ids[1],outcome:'approve',rationale:'x',conditions:null}},
 {...base,commandType:'studio.artifact.review.resolve',expectedArtifactVersion:1,payload:{artifactId:ids[0],artifactVersionId:ids[1],outcome:'approve',rationale:'x',conditions:['']}},
 {...base,commandType:'studio.artifact.draft.revise',expectedArtifactVersion:1,payload:{artifactId:ids[0],content:{}}},
 {...base,commandType:'studio.artifact.review.submit',expectedArtifactVersion:1,payload:{artifactId:ids[0],artifactVersionId:ids[1],unexpected:true}},
 {...base,idempotencyKey:'short'},{...base,commandType:'studio.artifact.unknown'},{...base,requestId:'not-uuid'},
])assert(rejects(invalid),'adversarial input rejected');
const request=()=>new Request('https://local/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(base)});
const calls:string[]=[];
const committed={outcome:'committed' as const,resource:{artifactId:ids[0]},resourceId:ids[0],receiptId:ids[1]};
const deps={authenticate:async()=>({id:ids[3]}),loadFreshAuthority:async()=>({actorId:ids[3],authorizationVersion:3,capabilities:['studio.artifacts.generate']}),executeAtomicCommand:async()=>{calls.push('execute');return committed}};
void(async()=>{
 const ok=await handleStudioArtifactCommand(request(),deps);const okBody=await ok.json();assert(ok.status===201&&okBody.resourceId===ids[0]&&calls.length===1,'authorized response parity');
 const stale=await handleStudioArtifactCommand(request(),{...deps,loadFreshAuthority:async()=>({actorId:ids[3],authorizationVersion:4,capabilities:['studio.artifacts.generate']})});assert(stale.status===409&&calls.length===1,'stale denied before receipt');
 const hidden=await handleStudioArtifactCommand(request(),{...deps,loadFreshAuthority:async()=>null});assert(hidden.status===404&&calls.length===1,'cross-scope authority hidden');
 const denied=await handleStudioArtifactCommand(request(),{...deps,loadFreshAuthority:async()=>({actorId:ids[3],authorizationVersion:3,capabilities:['studio.artifacts.read']})});assert(denied.status===403&&calls.length===1,'capability required');
 let effects=0;const replay=await handleStudioArtifactCommand(request(),{...deps,executeAtomicCommand:async()=>({...committed,outcome:'replayed' as const,generationClaim:{attemptId:ids[0]}}),executeClaimedGeneration:async()=>{effects++;return{state:'completed' as const,resource:{}}}});assert(replay.status===200&&effects===0,'replay skips provider');
 const failed=await handleStudioArtifactCommand(request(),{...deps,executeAtomicCommand:async()=>({...committed,generationClaim:{attemptId:ids[0]}}),executeClaimedGeneration:async()=>({state:'failed' as const,failureCode:'PROVIDER_REQUEST_FAILED' as const})});const failedBody=await failed.json();assert(failed.status===200&&failedBody.outcome==='generation_failed'&&failedBody.receiptId===ids[1],'durable failure is truthful');
 const completed=await handleStudioArtifactCommand(request(),{...deps,executeAtomicCommand:async()=>({...committed,generationClaim:{attemptId:ids[0]}}),executeClaimedGeneration:async()=>({state:'completed' as const,resource:{artifactId:ids[0]}})});const completedBody=await completed.json();assert(completed.status===201&&completedBody.outcome==='generation_completed','completion is truthful');
 const unavailable=await handleStudioArtifactCommand(request(),{...deps,executeAtomicCommand:async()=>{throw new Error('database detail')}});const unavailableBody=await unavailable.json();assert(unavailable.status===503&&unavailableBody.error.message==='The command could not be completed.','detail sanitized');
 console.log('studio artifact command tests passed (31 scenarios)');
})().catch(error=>{console.error(error);throw error});
