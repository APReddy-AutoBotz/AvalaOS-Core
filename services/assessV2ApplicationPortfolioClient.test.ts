import assert from 'node:assert/strict';
import { assessApplication, type ApplicationMetadata, type ApplicationRecord } from './assessV2/applicationPortfolio';
import { buildApplicationCommand, stableApplicationIdempotencyKey, sendApplicationCommand, defaultApplicationPortfolioTransport, decodeApplicationProjection } from './assessV2ApplicationPortfolioClient';

(async()=>{
const USER='11111111-1111-4111-8111-111111111111',ORG='22222222-2222-4222-8222-222222222222',WS='33333333-3333-4333-8333-333333333333',APP='44444444-4444-4444-8444-444444444444',APP2='44444444-4444-4444-8444-444444444445',META='55555555-5555-4555-8555-555555555555',META2='55555555-5555-4555-8555-555555555556',ASSESSMENT='66666666-6666-4666-8666-666666666666',RECEIPT='77777777-7777-4777-8777-777777777777',ECON='88888888-8888-4888-8888-888888888888';
const context={userId:USER,organizationId:ORG,organizationName:'Org',workspaceId:WS,workspaceName:'Ws',authorizationVersion:4,capabilities:['assess.applications.write']};
const metadata:ApplicationMetadata={name:'ERP',businessCapabilities:[],supportedProcesses:[],businessCriticality:'Unknown',lifecycleState:'Unknown',sourceCode:'Unknown',documentationQuality:'Unknown',automatedTestMaturity:'Unknown',deploymentRepeatability:'Unknown',observability:'Unknown',dataClassifications:[],regulatedData:'Unknown',operatingRegions:[],interfaces:[],upstreamDependencies:[],downstreamDependencies:[],realTime:'Unknown',eventDriven:'Unknown',synchronous:'Unknown',batch:'Unknown',synthetic:false};
const app:ApplicationRecord={id:APP,orgId:ORG,workspaceId:WS,version:1,metadataVersion:1,metadata,authorId:USER,status:'draft',evidence:[]};
const app2:ApplicationRecord={...app,id:APP2,metadata:{...metadata,name:'CRM'}};
const assessed=assessApplication(app);
const assessment={...assessed,id:ASSESSMENT,metadataVersionId:META,reviewerId:null,authorizationVersion:4,receiptId:null,auditEventId:null};
const waves=[{applicationId:APP,wave:1,approvedAutomatically:false,qualified:false},{applicationId:APP2,wave:2,approvedAutomatically:false,qualified:false}];
const projectionDto={inventory:[app,app2],metadataVersions:[{id:META,orgId:ORG,workspaceId:WS,applicationId:APP,version:1,status:'draft',metadata,authorId:USER},{id:META2,orgId:ORG,workspaceId:WS,applicationId:APP2,version:1,status:'draft',metadata:app2.metadata,authorId:USER}],importReceipts:[{id:RECEIPT,orgId:ORG,workspaceId:WS,actorId:USER,successCount:1,rejectionCount:0}],rowOutcomes:[{id:'77777777-7777-4777-8777-777777777778',orgId:ORG,workspaceId:WS,importReceiptId:RECEIPT,rowNumber:1,outcome:'success',applicationId:APP2,errorCode:null,errorMessage:null}],processLinks:[{id:'77777777-7777-4777-8777-777777777779',orgId:ORG,workspaceId:WS,processId:'99999999-9999-4999-8999-999999999999',primitiveId:'review',applicationId:APP,metadataVersionId:META,assessmentVersionId:ASSESSMENT,interactionType:'read',governState:'approved',economicsRef:ECON,economicsCurrency:'USD'}],dependencies:[{id:'77777777-7777-4777-8777-777777777780',orgId:ORG,workspaceId:WS,upstreamApplicationId:APP,downstreamApplicationId:APP2,dependencyType:'runtime',metadataVersionId:META2}],assessments:[assessment],dimensions:assessment.dimensions.map((item,index)=>({id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(index+1).padStart(12,'0')}`,orgId:ORG,workspaceId:WS,applicationId:APP,metadataVersionId:META,assessmentVersionId:ASSESSMENT,...item})),recommendations:assessment.recommendations.map(item=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',orgId:ORG,workspaceId:WS,metadataVersionId:META,assessmentVersionId:ASSESSMENT,...item})),reviews:[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',orgId:ORG,workspaceId:WS,applicationId:APP,metadataVersionId:META,assessmentVersionId:ASSESSMENT,reviewerId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',authorizationVersion:4,resolution:'approved',rationale:'Independent review',conditions:[],receiptId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',auditEventId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}],portfolioSnapshot:{id:'12121212-1212-4121-8121-121212121212',orgId:ORG,workspaceId:WS,version:1,modelVersion:'assess-v2-application-portfolio-2026-07',approvedAutomatically:false,inventoryCount:2,waves},waves,economicsReferences:[{referenceId:ECON,orgId:ORG,workspaceId:WS,currency:'USD'}]};
const decode=(value:unknown)=>decodeApplicationProjection(value,{organizationId:ORG,workspaceId:WS});
(globalThis as any).__pr1gSupabaseClient={functions:{invoke:async(_:string,input:any)=>input.body.commandType==='application.create'?{data:{ok:true,outcome:'committed',resource:{id:APP,version:1,status:'draft'}}}:{data:{ok:false,error:{code:'VERSION_CONFLICT'}}}},rpc:async()=>({data:projectionDto})};
const key=stableApplicationIdempotencyKey('application.create',APP,0,'manual');assert.equal(key,`application.create:${APP}:0:manual`);
const command=buildApplicationCommand(context as any,'application.create',0,{applicationId:APP,name:'ERP'},key);assert.equal(command.authorizationVersion,4);
let invoked:any;const result=await sendApplicationCommand(context as any,'application.create',0,{applicationId:APP}, {invoke:async body=>{invoked=body;return{outcome:'committed',resource:{id:APP,version:1,status:'draft'}}},loadProjection:async()=>decode({...projectionDto,inventory:[]})});assert.equal(invoked.commandType,'application.create');assert.equal(result.resource.id,APP);
assert.equal((await defaultApplicationPortfolioTransport.invoke(command)).resource.id,APP);
assert.equal((await defaultApplicationPortfolioTransport.loadProjection(context as any)).inventory[0].id,APP);
assert.equal(decode(projectionDto).assessments[0].dimensions.length,7);

const malformed=(mutate:(value:any)=>any)=>assert.throws(()=>decode(mutate(structuredClone(projectionDto))),/MALFORMED_APPLICATION_PROJECTION/);
malformed(value=>{delete value.inventory[0].status;return value});
malformed(value=>{value.inventory[0].extra=true;return value});
malformed(value=>{value.inventory[0].version='1';return value});
malformed(value=>{value.inventory[0].id='not-a-uuid';return value});
malformed(value=>{value.inventory[0].status='ready';return value});
malformed(value=>{value.assessments[0].dimensions[1].dimension=value.assessments[0].dimensions[0].dimension;return value});
malformed(value=>{value.assessments[0].dimensions.pop();return value});
malformed(value=>{value.assessments[0].recommendations[0].disposition='invented';return value});
malformed(value=>{value.assessments[0].dimensions[0].evidenceReferences=[{id:'bad'}];return value});
malformed(value=>{value.importReceipts=[{id:'77777777-7777-4777-8777-777777777777',orgId:ORG,workspaceId:WS,actorId:USER,successCount:2,rejectionCount:0}];return value});
malformed(value=>{value.inventory[0].orgId='22222222-2222-4222-8222-222222222223';return value});
malformed(value=>{value.reviews=[{id:'77777777-7777-4777-8777-777777777777',orgId:ORG,workspaceId:WS,applicationId:APP,metadataVersionId:META,assessmentVersionId:'bad',reviewerId:USER,authorizationVersion:4,resolution:'approved',rationale:'ok',conditions:[],receiptId:META,auditEventId:META}];return value});
malformed(value=>{value.dependencies=[{id:'77777777-7777-4777-8777-777777777777',orgId:ORG,workspaceId:WS,upstreamApplicationId:APP,downstreamApplicationId:APP,dependencyType:'runtime',metadataVersionId:META}];return value});
malformed(value=>{value.portfolioSnapshot={id:META};return value});
malformed(value=>{value.portfolioSnapshot={id:'77777777-7777-4777-8777-777777777777',orgId:ORG,workspaceId:WS,version:1,modelVersion:'assess-v2-application-portfolio-2026-07',approvedAutomatically:false,inventoryCount:1,waves:[{applicationId:APP,wave:1,approvedAutomatically:false,qualified:true},{applicationId:APP,wave:2,approvedAutomatically:false,qualified:true}]};value.waves=value.portfolioSnapshot.waves;return value});
malformed(value=>{value.portfolioSnapshot={id:'77777777-7777-4777-8777-777777777777',orgId:ORG,workspaceId:WS,version:1,modelVersion:'assess-v2-application-portfolio-2026-07',approvedAutomatically:false,inventoryCount:1,waves:[{applicationId:APP,wave:1,approvedAutomatically:false,qualified:true}]};value.waves=[{applicationId:APP,wave:2,approvedAutomatically:false,qualified:true}];return value});
malformed(value=>{value.economicsReferences=[{referenceId:META,orgId:ORG,workspaceId:WS,currency:'usd'}];return value});

await assert.rejects(async()=>{(globalThis as any).__pr1gSupabaseClient.rpc=async()=>({data:{...projectionDto,inventory:[{id:APP}]}});await defaultApplicationPortfolioTransport.loadProjection(context as any)},/MALFORMED_APPLICATION_PROJECTION/);
(globalThis as any).__pr1gSupabaseClient={functions:{invoke:async()=>({error:{context:{clone:()=>({json:async()=>({ok:false,error:{code:'READ_ONLY'}})})}}})},rpc:async()=>({error:{code:'PROJECTION_UNAVAILABLE'}})};
await assert.rejects(()=>defaultApplicationPortfolioTransport.invoke(command),/READ_ONLY|COMMAND_UNAVAILABLE/);await assert.rejects(()=>defaultApplicationPortfolioTransport.loadProjection(context as any),/PROJECTION_UNAVAILABLE/);
console.log('PR 1G strict application portfolio projection transport tests passed.');
})().catch(error=>{console.error(error);process.exit(1)});
