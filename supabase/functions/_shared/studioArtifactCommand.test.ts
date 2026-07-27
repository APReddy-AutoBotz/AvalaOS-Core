import { parseStudioArtifactEnvelope, StudioArtifactError } from './studioArtifactCommand.ts';
import { handleStudioArtifactCommand } from './studioArtifactHandler.ts';

const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004'];
const base={requestId:ids[0],idempotencyKey:'request-key-001',commandType:'studio.artifact.generation.request',organizationId:ids[1],workspaceId:ids[2],authorizationVersion:3,expectedAggregateVersion:0,expectedArtifactVersion:null,payload:{studioHandoffId:ids[3],artifactType:'brd'}};
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
assert(parseStudioArtifactEnvelope(base).payload.artifactType==='brd','generation parses');
const commandPayloads=[
 ['studio.artifact.draft.revise',{artifactId:ids[0],parentVersionId:ids[1],content:{title:'Revised',sections:['one']}},1],
 ['studio.artifact.review.submit',{artifactId:ids[0],artifactVersionId:ids[1]},1],
 ['studio.artifact.review.assign',{artifactId:ids[0],artifactVersionId:ids[1],reviewerId:ids[2]},1],
 ['studio.artifact.review.resolve',{artifactId:ids[0],artifactVersionId:ids[1],outcome:'changes_requested',rationale:'Revise',conditions:null},1],
 ['studio.artifact.approval.resolve',{artifactId:ids[0],artifactVersionId:ids[1],outcome:'approve',rationale:'Approved',conditions:'Retain evidence'},1],
] as const;
for(const [commandType,payload,expectedArtifactVersion] of commandPayloads) assert(parseStudioArtifactEnvelope({...base,commandType,payload,expectedArtifactVersion}).commandType===commandType,`${commandType} parses`);
for(const invalid of [{...base,extra:true},{...base,payload:{...base.payload,prompt:'browser authority'}},{...base,payload:{...base.payload,artifactType:'pdf'}},{...base,expectedAggregateVersion:-1}]){let rejected=false;try{parseStudioArtifactEnvelope(invalid)}catch(e){rejected=e instanceof StudioArtifactError&&e.code==='INVALID_COMMAND'}assert(rejected,'invalid input rejected');}
for(const invalid of [
 {...base,idempotencyKey:'short'},
 {...base,commandType:'studio.artifact.unknown'},
 {...base,requestId:'not-uuid'},
 {...base,commandType:'studio.artifact.review.resolve',expectedArtifactVersion:1,payload:{artifactId:ids[0],artifactVersionId:ids[1],outcome:'invalid',rationale:'x',conditions:null}},
 {...base,commandType:'studio.artifact.approval.resolve',expectedArtifactVersion:1,payload:{artifactId:ids[0],artifactVersionId:ids[1],outcome:'approve',rationale:'',conditions:null}},
 {...base,commandType:'studio.artifact.draft.revise',expectedArtifactVersion:1,payload:{artifactId:ids[0],parentVersionId:ids[1],content:[]}},
]){let rejected=false;try{parseStudioArtifactEnvelope(invalid)}catch{rejected=true}assert(rejected,'adversarial command rejected')}
const request=()=>new Request('https://local/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(base)});
const calls:string[]=[];
const deps={authenticate:async()=>({id:ids[3]}),loadFreshAuthority:async()=>({actorId:ids[3],authorizationVersion:3,capabilities:['studio.artifacts.generate']}),executeAtomicCommand:async()=>{calls.push('execute');return{outcome:'committed' as const,resource:{artifactId:ids[0]},receiptId:ids[1]}}};
void(async()=>{const ok=await handleStudioArtifactCommand(request(),deps);assert(ok.status===201&&calls.length===1,'authorized command committed');
const method=await handleStudioArtifactCommand(new Request('https://local/studio'),deps);assert(method.status===405,'method denied');
const unauthenticated=await handleStudioArtifactCommand(request(),{...deps,authenticate:async()=>{throw new Error('no')}});assert(unauthenticated.status===401,'authentication required');
const malformed=await handleStudioArtifactCommand(new Request('https://local/studio',{method:'POST',body:'{'}),deps);assert(malformed.status===400,'malformed command denied');
const stale=await handleStudioArtifactCommand(request(),{...deps,loadFreshAuthority:async()=>({actorId:ids[3],authorizationVersion:4,capabilities:['studio.artifacts.generate']})});assert(stale.status===409&&calls.length===1,'stale authority denied before execution');
const hidden=await handleStudioArtifactCommand(request(),{...deps,loadFreshAuthority:async()=>null});assert(hidden.status===404&&calls.length===1,'missing cross-scope authority is non-disclosing');
const wrongActor=await handleStudioArtifactCommand(request(),{...deps,loadFreshAuthority:async()=>({actorId:ids[2],authorizationVersion:3,capabilities:['studio.artifacts.generate']})});assert(wrongActor.status===404,'actor mismatch non-disclosing');
const denied=await handleStudioArtifactCommand(request(),{...deps,loadFreshAuthority:async()=>({actorId:ids[3],authorizationVersion:3,capabilities:['studio.artifacts.read']})});assert(denied.status===403&&calls.length===1,'narrow mutation capability required');
const generated=await handleStudioArtifactCommand(request(),{...deps,executeAtomicCommand:async()=>({outcome:'replayed' as const,resource:{generationClaim:{attemptId:ids[0]}},receiptId:ids[1]}),executeClaimedGeneration:async()=>({state:'completed'})});assert(generated.status===200,'generation executes only after claim');
const unavailable=await handleStudioArtifactCommand(request(),{...deps,executeAtomicCommand:async()=>{throw new Error('database detail')}});assert(unavailable.status===503,'internal detail sanitized');
console.log('studio artifact command tests passed (17 scenarios)');
})().catch(error=>{console.error(error);throw error;});
