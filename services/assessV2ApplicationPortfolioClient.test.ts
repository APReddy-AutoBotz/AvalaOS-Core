import assert from 'node:assert/strict';
import { buildApplicationCommand, stableApplicationIdempotencyKey, sendApplicationCommand, defaultApplicationPortfolioTransport } from './assessV2ApplicationPortfolioClient';
(async()=>{
const context={userId:'u',organizationId:'o',organizationName:'Org',workspaceId:'w',workspaceName:'Ws',authorizationVersion:4,capabilities:['assess.applications.write']};
(globalThis as any).__pr1gSupabaseClient={functions:{invoke:async(_:string,input:any)=>input.body.commandType==='application.create'?{data:{ok:true,outcome:'committed',resource:{id:'server',version:1,status:'draft'}}}:{data:{ok:false,error:{code:'VERSION_CONFLICT'}}}},rpc:async()=>({data:{inventory:[{id:'server',name:'ERP'}],metadataVersions:[],processLinks:[],dependencies:[],assessments:[],dimensions:[],recommendations:[],reviews:[],waves:[],economicsReferences:[],rowOutcomes:[]}})};
const key=stableApplicationIdempotencyKey('application.create','app',0,'manual');assert.equal(key,'application.create:app:0:manual');
const command=buildApplicationCommand(context as any,'application.create',0,{applicationId:'app',name:'ERP'},key);assert.equal(command.authorizationVersion,4);assert.equal(command.idempotencyKey,key);
let invoked:any;const result=await sendApplicationCommand(context as any,'application.create',0,{applicationId:'app'}, {invoke:async body=>{invoked=body;return{outcome:'committed',resource:{id:'app',version:1,status:'draft'}}},loadProjection:async()=>({inventory:[],metadataVersions:[],processLinks:[],dependencies:[],assessments:[],dimensions:[],recommendations:[],reviews:[],waves:[],economicsReferences:[],rowOutcomes:[]})});
assert.equal(invoked.commandType,'application.create');assert.equal(result.resource.id,'app');
const defaultResult=await defaultApplicationPortfolioTransport.invoke({...(command as any),requestId:'11111111-1111-4111-8111-111111111111'});assert.equal(defaultResult.resource.id,'server');
const projection=await defaultApplicationPortfolioTransport.loadProjection(context as any);assert.equal(projection.inventory[0].id,'server');
await assert.rejects(()=>defaultApplicationPortfolioTransport.invoke({...command,commandType:'application.metadata.upsert' as any,requestId:'11111111-1111-4111-8111-111111111112'}),/VERSION_CONFLICT/);
(globalThis as any).__pr1gSupabaseClient={functions:{invoke:async()=>({error:{context:{clone:()=>({json:async()=>({ok:false,error:{code:'READ_ONLY'}})})}}})},rpc:async()=>({error:{code:'PROJECTION_UNAVAILABLE'}})};
await assert.rejects(()=>defaultApplicationPortfolioTransport.invoke(command as any),/READ_ONLY|COMMAND_UNAVAILABLE/);await assert.rejects(()=>defaultApplicationPortfolioTransport.loadProjection(context as any),/PROJECTION_UNAVAILABLE/);
console.log('PR 1G application portfolio client transport tests passed.');
})().catch(error=>{console.error(error);process.exit(1)});
