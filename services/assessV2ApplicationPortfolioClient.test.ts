import assert from 'node:assert/strict';
import { buildApplicationCommand, stableApplicationIdempotencyKey, sendApplicationCommand, defaultApplicationPortfolioTransport } from './assessV2ApplicationPortfolioClient';
const context={userId:'u',organizationId:'o',organizationName:'Org',workspaceId:'w',workspaceName:'Ws',authorizationVersion:4,capabilities:['assess.applications.write']};
const key=stableApplicationIdempotencyKey('application.create','app',0,'manual');
assert.equal(key,'application.create:app:0:manual');
const command=buildApplicationCommand(context as any,'application.create',0,{applicationId:'app',name:'ERP'},key);
assert.equal(command.authorizationVersion,4);assert.equal(command.idempotencyKey,key);
(async()=>{
let invoked:any;const result=await sendApplicationCommand(context as any,'application.create',0,{applicationId:'app'}, {invoke:async body=>{invoked=body;return{outcome:'committed',resource:{id:'app',version:1,status:'draft'}}},loadProjection:async()=>({inventory:[],metadataVersions:[],processLinks:[],dependencies:[],assessments:[],dimensions:[],recommendations:[],reviews:[],waves:[],economicsReferences:[],rowOutcomes:[]})});
assert.equal(invoked.commandType,'application.create');assert.equal(result.resource.id,'app');
const defaultResult=await defaultApplicationPortfolioTransport.invoke({...(command as any),requestId:'r'});assert.equal(defaultResult.resource.id,'server');
console.log('PR 1G application portfolio client transport tests passed.');
})().catch(error=>{console.error(error);process.exit(1)});
