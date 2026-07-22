import assert from 'node:assert/strict';
import { applicationPayloadHash, executeApplicationCommand, parseApplicationEnvelope, readApplicationProjection, type ApplicationPortfolioDependencies } from './assessV2ApplicationPortfolioCommand.ts';
(async()=>{
const ids={req:'11111111-1111-4111-8111-111111111111',org:'22222222-2222-4222-8222-222222222222',ws:'33333333-3333-4333-8333-333333333333',actor:'44444444-4444-4444-8444-444444444444',app:'55555555-5555-4555-8555-555555555555'};
const body=(override:any={})=>({requestId:ids.req,idempotencyKey:'application-idem-1',commandType:'application.create',organizationId:ids.org,workspaceId:ids.ws,authorizationVersion:7,expectedVersion:0,payload:{applicationId:ids.app,name:'ERP',description:'desc'},...override});
const seen=new Map<string,{hash:string;resource:Record<string,unknown>}>();let commits=0;const deps=(caps:string[]=['assess.applications.write','assess.applications.read']):ApplicationPortfolioDependencies=>({authenticate:async()=>({id:ids.actor}),loadFreshAuthority:async()=>({actorId:ids.actor,organizationId:ids.org,workspaceId:ids.ws,authorizationVersion:7,capabilities:caps}),executeAtomicApplicationCommand:async c=>{const k=`${c.organizationId}:${c.workspaceId}:${c.actorId}:${c.idempotencyKey}`;const prev=seen.get(k);if(prev){if(prev.hash!==c.payloadHash)throw Object.assign(new Error('IDEMPOTENCY_CONFLICT'),{code:'IDEMPOTENCY_CONFLICT'});return{outcome:'replayed',resource:prev.resource}}commits++;const resource={id:c.payload.applicationId??c.payload.importReceiptId??'resource',version:c.expectedVersion+1,status:'committed',payloadHash:c.payloadHash};seen.set(k,{hash:c.payloadHash,resource});return{outcome:'committed',resource}},loadApplicationProjection:async()=>({inventory:[{id:ids.app,name:'ERP'}],waves:[]})});

const uuid=(n:string)=>`${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const meta={name:'ERP',description:'d',businessOwner:'b',technicalOwner:'t',vendor:'v',businessCapabilities:[],supportedProcesses:[],businessCriticality:'Unknown',lifecycleState:'Unknown',product:'p',version:'1',eolStatus:'Unknown',hostingModel:'Unknown',platform:[],languages:[],frameworks:[],sourceCode:'Unknown',documentationQuality:'Unknown',automatedTestMaturity:'Unknown',deploymentRepeatability:'Unknown',observability:'Unknown',dataClassifications:[],regulatedData:'Unknown',operatingRegions:[],interfaces:[],upstreamDependencies:[],downstreamDependencies:[],realTime:'Unknown',eventDriven:'Unknown',synchronous:'Unknown',batch:'Unknown',bridgeEvidence:null,aiControls:null,synthetic:false};
for(const [commandType,payload] of [
 ['application.import',{importReceiptId:uuid('6'),payloadHash:'hash-hash',rows:[meta]}],
 ['application.metadata.upsert',{applicationId:ids.app,metadataVersionId:uuid('7'),metadataVersion:1,metadata:meta}],
 ['application.assessment.save',{assessmentVersionId:uuid('8'),applicationId:ids.app,metadataVersion:1,assessmentVersion:1,dimensions:[],recommendations:[],processLinks:[{processId:uuid('9'),primitiveId:'primitive',applicationId:ids.app,metadataVersion:1,assessmentVersionId:uuid('8'),interactionType:'read',governState:'approved',allowedAction:'allowed',economicsRef:null,economicsCurrency:null,approvedEconomics:true}],dependencies:[{}]}],
 ['application.assessment.finalize',{assessmentVersionId:uuid('8'),applicationId:ids.app,metadataVersion:1,rationale:'ready'}],
 ['application.assessment.review.resolve',{assessmentVersionId:uuid('8'),applicationId:ids.app,metadataVersion:1,resolution:'approved',rationale:'ok',conditions:['condition']}],
 ['application.assessment.revision.start',{assessmentVersionId:uuid('8'),applicationId:ids.app,metadataVersion:1,rationale:'revise'}],
 ['application.portfolio.snapshot.create',{portfolioSnapshotId:uuid('a'),applications:[],assessments:[],processLinks:[],economicsReferences:[]}],
] as any[]) assert.equal(parseApplicationEnvelope(body({commandType,payload})).commandType,commandType);
assert.throws(()=>parseApplicationEnvelope(body({commandType:'unknown.command'})),/COMMAND_NOT_SUPPORTED/);
assert.throws(()=>parseApplicationEnvelope(body({idempotencyKey:'bad key'})),/INVALID_COMMAND/);

const parsed=parseApplicationEnvelope(body()); assert.equal(parsed.commandType,'application.create'); assert.equal(applicationPayloadHash(parsed.payload),applicationPayloadHash(parsed.payload));
const req=new Request('http://localhost',{method:'POST'}); const first=await executeApplicationCommand(req,parsed,deps()); assert.equal(first.outcome,'committed'); const replay=await executeApplicationCommand(req,parsed,deps()); assert.equal(replay.outcome,'replayed'); assert.equal(commits,1);
assert.throws(()=>parseApplicationEnvelope(body({payload:{applicationId:ids.app,name:'ERP',description:'desc',extra:true}})),/INVALID_COMMAND/);
await assert.rejects(()=>executeApplicationCommand(req,parsed,deps(['assess.applications.read'])),/PERMISSION_DENIED/);
await assert.rejects(()=>executeApplicationCommand(req,{...parsed,authorizationVersion:8},deps()),/AUTHORITY_STALE/);
const projection=await readApplicationProjection(req,{organizationId:ids.org,workspaceId:ids.ws},deps()); assert.equal((projection.inventory as any[])[0].name,'ERP');
console.log('PR 1G application portfolio command tests passed.');
})().catch(error=>{console.error(error);process.exit(1)});
