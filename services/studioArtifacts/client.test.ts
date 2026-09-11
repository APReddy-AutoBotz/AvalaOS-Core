import { strict as assert } from 'node:assert';
import type { TenantContextProjection } from '../../types';
import { controlledHumanStudioTarget, decodeStudioArtifactProjection, decodeStudioArtifactSummaryPage, decodeStudioArtifactWorkspaceProjection, decodeStudioCommandResponse, decodeStudioEligibleReviewers, decodeStudioHandoffs, decodeStudioSafeError, decodeStudioSourcePackageIdentity, executeStudioArtifactCommand, executeStudioWorkspaceCommand, readStudioArtifact, readStudioArtifactSummaries, readStudioArtifactV2, readStudioArtifactWorkspace, readStudioEligibleReviewers, readStudioHandoffs, readStudioSourcePackageIdentity, readStudioWorkspace, StudioArtifactBoundaryError, studioArtifactDefaultTransport, type StudioArtifactTransport } from './client';
import { decodeStudioPrivateArtifactProjection } from './privateArtifactClient';

const U=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','99999999-9999-4999-8999-999999999999'] as const;
const context={userId:U[8],organizationId:U[0],organizationName:'Avala',workspaceId:U[1],workspaceName:'Studio',authorizationVersion:4,capabilities:[]} satisfies TenantContextProjection;
assert.deepEqual(controlledHumanStudioTarget(context,'studio.handoff.request',0,{upstreamHandoffId:U[7]},{handoffSourceVersion:7}),{family:'assess_studio_handoff',id:U[7],version:7});
assert.notDeepEqual(controlledHumanStudioTarget(context,'studio.handoff.request',0,{upstreamHandoffId:U[7]},{handoffSourceVersion:7}),controlledHumanStudioTarget(context,'studio.handoff.request',0,{upstreamHandoffId:U[8]},{handoffSourceVersion:7}));
const version={id:U[7],version:1,parentVersionId:null,lifecycle:'draft',templateVersion:'brd-v1',contentSchemaVersion:'studio-v1',projectionVersion:'json-v1',content:{title:'Governed'},contentHash:'a'.repeat(64),authorId:U[8],createdAt:'2026-07-27T00:00:00.000Z'};
const projection={id:U[6],artifactType:'brd',aggregateVersion:1,lifecycle:'draft',ancestry:{organizationId:U[0],workspaceId:U[1],caseId:U[2],sourceCaseVersionId:U[3],sourceCaseVersion:2,decisionId:U[4],decisionVersion:'decision-v3',reviewResolutionId:U[5],governResolutionId:U[6],studioHandoffId:U[7],sourcePackageHash:'b'.repeat(64),sourceSchemaVersion:'assess-v2',ruleSetVersion:'rules-v1',reviewSchemaVersion:'review-v1',reviewSequence:1},currentVersion:version,currentApprovedVersion:null,versions:[version],review:null,approval:null,readOnly:false};

assert.equal(decodeStudioArtifactProjection(projection,context).ancestry.decisionVersion,'decision-v3');
const mixedAncestry={...projection.ancestry,contractVersion:'studio-artifact-2',sourceMode:'assess_plus_transcript_bundle',assessmentLabel:'mixed',planningLabel:'governed_assessed',sourcePackageId:U[5],sourcePackageVersion:2,studioInputBundleId:U[4],studioInputBundleVersionId:U[3],studioInputBundleVersion:3};
const prBProjection={...projection,contractVersion:'studio-artifact-2',ancestry:mixedAncestry,sourcePackage:{contractVersion:'studio-artifact-2',id:U[5],version:2,sourceMode:'assess_plus_transcript_bundle',assessmentLabel:'mixed',planningLabel:'governed_assessed',assessHandoff:{id:U[7],version:2,status:'accepted',sourceLabel:'Approved Assess v2'},studioInputBundle:{id:U[4],version:3,sourceCount:1,sourceLabels:['Studio correction v1']},manualBriefPresent:false,coverage:{selectedSources:2,coveredSources:2,complete:true,blockers:[]},stale:false},template:{ownership:'system',templateId:U[3],templateVersionId:U[4],version:'studio-brd-1',name:'System BRD',description:'Governed BRD',artifactClass:'brd',lifecycle:'approved',templateHash:'c'.repeat(64),rendererVersion:'studio-markdown-1',contentSchemaVersion:'studio-artifact-1',sections:[{id:'scope',title:'Scope',required:true,fieldKind:'narrative'}],replacement:null,actions:['studio.generation.request']},sections:[{id:'scope',title:'Scope',body:'Governed scope',sourceAnchors:[{sourceVersionId:U[4],locator:'00:01:00',anchorHash:'f'.repeat(64)}],labels:[]}],assessmentLabel:'mixed',planningLabel:'governed_assessed'};
assert.equal(decodeStudioArtifactProjection(prBProjection,context).sourcePackage?.studioInputBundle?.version,3);
const directAncestry={...mixedAncestry,sourceMode:'direct_transcript_bundle',assessmentLabel:'not_assessed',planningLabel:'planning_only',caseId:null,sourceCaseVersionId:null,sourceCaseVersion:null,decisionId:null,decisionVersion:null,reviewResolutionId:null,governResolutionId:null,studioHandoffId:null,reviewSchemaVersion:null,reviewSequence:null};
const directProjection={...prBProjection,ancestry:directAncestry,sourcePackage:{...prBProjection.sourcePackage,sourceMode:'direct_transcript_bundle',assessmentLabel:'not_assessed',planningLabel:'planning_only',assessHandoff:null},assessmentLabel:'not_assessed',planningLabel:'planning_only'};
assert.equal(decodeStudioArtifactProjection(directProjection,context).ancestry.caseId,null);
const staleCompletionVersion={...version,id:U[6],version:2,parentVersionId:version.id,contentHash:'e'.repeat(64),createdAt:'2026-07-27T00:01:00.000Z'};
const staleCompletionProjection={...directProjection,aggregateVersion:2,currentVersion:version,versions:[version,staleCompletionVersion]};
assert.equal(decodeStudioArtifactProjection(staleCompletionProjection,context).currentVersion.id,version.id);
const artifactWorkspace={contractVersion:'studio-workspace-2',organizationId:U[0],workspaceId:U[1],artifact:{id:U[6],artifactType:'brd',aggregateVersion:1,lifecycle:'draft',currentVersionId:U[7],currentApprovedVersionId:null,sections:prBProjection.sections},sourcePackage:{id:U[5],version:2,hash:'b'.repeat(64),mode:'assess_plus_transcript_bundle',lineageClassification:'mixed',planningOnly:false,inputBundle:{id:U[4],versionId:U[3],version:3}},selectedSources:{items:[{sourceId:U[2],sourceVersionId:U[4],sourceVersion:1,label:'Studio correction v1',sourceKind:'transcript',semanticRoles:['primary']}],total:2,offset:0,limit:1,hasMore:true},coverage:{selectedSourceVersionIds:[U[4],U[5]],coveredSourceVersionIds:[U[4]],uncoveredSourceVersionIds:[U[5]],complete:false,citations:[{sectionId:'scope',sourceVersionId:U[4],locator:'00:01:00',anchorHash:'f'.repeat(64)}],conflicts:[{conflictKey:'scope-conflict',sourceVersionIds:[U[4],U[5]],status:'unresolved'}]},providerAvailability:{available:true,reason:'available'},actions:['studio.generation.request','studio.artifact.draft.revise']};
assert.equal(decodeStudioArtifactWorkspaceProjection(artifactWorkspace,context).selectedSources.hasMore,true);
const manualWorkspace={...artifactWorkspace,artifact:{...artifactWorkspace.artifact,aggregateVersion:0,currentVersionId:null,sections:[]},sourcePackage:{...artifactWorkspace.sourcePackage,mode:'manual_brief',lineageClassification:'not_assessed',planningOnly:true,inputBundle:null},selectedSources:{items:[],total:0,offset:0,limit:20,hasMore:false},coverage:{selectedSourceVersionIds:[],coveredSourceVersionIds:[],uncoveredSourceVersionIds:[],complete:true,citations:[],conflicts:[]},providerAvailability:{available:false,reason:'read_only'},actions:[]};
assert.equal(decodeStudioArtifactWorkspaceProjection(manualWorkspace,context).sourcePackage.mode,'manual_brief');
const summaryPage={contractVersion:'studio-artifact-summary-2',organizationId:U[0],workspaceId:U[1],items:[{id:U[6],artifactType:'brd',aggregateVersion:1,lifecycle:'draft',currentVersionId:U[7],currentApprovedVersionId:null,sourceMode:'direct_transcript_bundle',lineageClassification:'not_assessed',planningOnly:true,displayLabel:'BRD · Direct planning package',updatedAt:'2026-08-28T00:00:00.000Z',actions:['studio.artifact.draft.revise']}],total:1,offset:0,limit:20,hasMore:false};
assert.equal(decodeStudioArtifactSummaryPage(summaryPage,context).items[0].planningOnly,true);
assert.throws(()=>decodeStudioArtifactSummaryPage({...summaryPage,workspaceId:U[2]},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactSummaryPage({...summaryPage,items:[{...summaryPage.items[0],sourceLabel:'forbidden'}]},context),StudioArtifactBoundaryError);
const summaryTransport={readArtifactSummaries:async(_context:TenantContextProjection,offset:number,limit:number)=>({...summaryPage,offset,limit})} as StudioArtifactTransport;
assert.equal((await readStudioArtifactSummaries(context,0,20,summaryTransport)).items[0].id,U[6]);
for(const malformed of [
  {...artifactWorkspace,workspaceId:U[2]},
  {...artifactWorkspace,clientAuthority:true},
  {...artifactWorkspace,artifact:{...artifactWorkspace.artifact,id:'bad'}},
  {...artifactWorkspace,artifact:{...artifactWorkspace.artifact,aggregateVersion:0}},
  {...artifactWorkspace,artifact:{...artifactWorkspace.artifact,currentApprovedVersionId:U[8],currentVersionId:null}},
  {...artifactWorkspace,artifact:{...artifactWorkspace.artifact,sections:[{...prBProjection.sections[0],sourceAnchors:[],labels:[]}]}},
  {...artifactWorkspace,sourcePackage:{...artifactWorkspace.sourcePackage,planningOnly:true}},
  {...artifactWorkspace,sourcePackage:{...artifactWorkspace.sourcePackage,mode:'direct_transcript_bundle',lineageClassification:'not_assessed',planningOnly:true,inputBundle:null}},
  {...artifactWorkspace,sourcePackage:{...artifactWorkspace.sourcePackage,inputBundle:{...artifactWorkspace.sourcePackage.inputBundle,version:0}}},
  {...artifactWorkspace,selectedSources:{...artifactWorkspace.selectedSources,items:[...artifactWorkspace.selectedSources.items,...artifactWorkspace.selectedSources.items]}},
  {...artifactWorkspace,selectedSources:{...artifactWorkspace.selectedSources,hasMore:false}},
  {...artifactWorkspace,selectedSources:{...artifactWorkspace.selectedSources,items:[{...artifactWorkspace.selectedSources.items[0],semanticRoles:[]}]}},
  {...artifactWorkspace,selectedSources:{...artifactWorkspace.selectedSources,items:[{...artifactWorkspace.selectedSources.items[0],semanticRoles:['primary','primary']}]}},
  {...artifactWorkspace,coverage:{...artifactWorkspace.coverage,coveredSourceVersionIds:[U[2]]}},
  {...artifactWorkspace,coverage:{...artifactWorkspace.coverage,uncoveredSourceVersionIds:[U[4],U[5]]}},
  {...artifactWorkspace,coverage:{...artifactWorkspace.coverage,complete:true}},
  {...artifactWorkspace,coverage:{...artifactWorkspace.coverage,citations:[{...artifactWorkspace.coverage.citations[0],sourceVersionId:U[2]}]}},
  {...artifactWorkspace,coverage:{...artifactWorkspace.coverage,conflicts:[{...artifactWorkspace.coverage.conflicts[0],sourceVersionIds:[U[4]]}]}},
  {...artifactWorkspace,providerAvailability:{available:false,reason:'available'}},
  {...artifactWorkspace,providerAvailability:{available:true,reason:'secret_available'}},
  {...artifactWorkspace,actions:['studio.provider.override']},
  {...artifactWorkspace,actions:['studio.generation.request','studio.generation.request']},
] as const)assert.throws(()=>decodeStudioArtifactWorkspaceProjection(malformed,context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,aggregateVersion:2,versions:[version,staleCompletionVersion]},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...prBProjection,sections:[{...prBProjection.sections[0],sourceAnchors:[],labels:[]}]},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,clientTemplate:'forbidden'},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,ancestry:{...projection.ancestry,workspaceId:U[2]}},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,currentApprovedVersion:{...version,lifecycle:'draft'}},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,versions:[{...version,version:2},{...version,id:U[6],version:1}]},context),StudioArtifactBoundaryError);
const approvedVersion={...version,lifecycle:'approved',contentHash:'f'.repeat(64)};
assert.equal(decodeStudioArtifactProjection({...projection,lifecycle:'approved',currentVersion:approvedVersion,currentApprovedVersion:approvedVersion,versions:[approvedVersion],review:{assignmentId:U[2],reviewerId:U[3],outcome:'approved',rationale:'Independent review complete',conditions:[]},approval:{approverId:U[4],outcome:'approved',rationale:'Final approval complete',conditions:['Retain lineage'],supersededVersionId:null}},context).approval?.outcome,'approved');
for(const malformed of [
  {...projection,artifactType:'memo'},
  {...projection,currentVersion:{...version,parentVersionId:'not-a-uuid'}},
  {...projection,currentVersion:{...version,createdAt:'not-a-date'}},
  {...projection,review:{assignmentId:U[2],reviewerId:U[3],outcome:'unknown',rationale:null,conditions:[]}},
  {...projection,approval:{approverId:U[4],outcome:'approved',rationale:'',conditions:[],supersededVersionId:null}},
] as const)assert.throws(()=>decodeStudioArtifactProjection(malformed,context),StudioArtifactBoundaryError);
const tenantTemplate={...prBProjection.template,ownership:'tenant',version:2,replacement:{templateId:U[2],templateVersionId:U[3],version:1},actions:['studio.template.revise']};
assert.equal(decodeStudioArtifactProjection({...prBProjection,template:tenantTemplate},context).template?.version,2);
for(const malformed of [
  {...prBProjection,sourcePackage:{...prBProjection.sourcePackage,planningLabel:'planning_only'}},
  {...prBProjection,sourcePackage:{...prBProjection.sourcePackage,coverage:{selectedSources:2,coveredSources:2,complete:true,blockers:[42]}}},
  {...prBProjection,sourcePackage:{...prBProjection.sourcePackage,studioInputBundle:{...prBProjection.sourcePackage.studioInputBundle,sourceCount:0}}},
  {...prBProjection,template:{...prBProjection.template,actions:['studio.provider.override']}},
  {...prBProjection,template:{...prBProjection.template,sections:[{...prBProjection.template.sections[0],fieldKind:'authority'}]}},
  {...prBProjection,template:{...tenantTemplate,replacement:{...tenantTemplate.replacement,version:'tenant-v1'}}},
  {...prBProjection,sections:[{...prBProjection.sections[0],labels:['provider_authority']}]},
  {...prBProjection,sections:[{...prBProjection.sections[0],sourceAnchors:[{...prBProjection.sections[0].sourceAnchors[0],sourceVersion:0}]}]},
] as const)assert.throws(()=>decodeStudioArtifactProjection(malformed,context),StudioArtifactBoundaryError);
assert.deepEqual(decodeStudioHandoffs([{id:U[7],caseId:U[2],label:'Accepted case',sourcePackageHash:'c'.repeat(64)}]).map(x=>x.label),['Accepted case']);
assert.throws(()=>decodeStudioHandoffs([{id:U[7],caseId:U[2],label:'Legacy',sourcePackageHash:'c'.repeat(64),documentGenerationId:U[3]}]),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioHandoffs({}),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioHandoffs([{id:'bad',caseId:U[2],label:'Accepted case',sourcePackageHash:'c'.repeat(64)}]),StudioArtifactBoundaryError);
assert.deepEqual(decodeStudioEligibleReviewers([{actorId:U[8],displayName:'Independent Reviewer'}]),[{actorId:U[8],displayName:'Independent Reviewer'}]);
assert.throws(()=>decodeStudioEligibleReviewers(null),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioEligibleReviewers([{actorId:U[8],displayName:''}]),StudioArtifactBoundaryError);
assert.equal(decodeStudioSafeError({code:'VERSION_CONFLICT',details:'secret table public.foo'}).code,'VERSION_CONFLICT');
for(const [raw,safe] of [['RESOURCE_STALE','SOURCE_PACKAGE_STALE'],['TEMPLATE_NOT_APPROVED','TEMPLATE_STALE'],['PROVIDER_ROUTE_UNAVAILABLE','PROVIDER_UNAVAILABLE'],['HANDOFF_NOT_ELIGIBLE','HANDOFF_NOT_ELIGIBLE'],['SOURCE_COVERAGE_INCOMPLETE','SOURCE_COVERAGE_INCOMPLETE'],['BUDGET_EXHAUSTED','BUDGET_EXHAUSTED'],['RECEIPT_FINALIZATION_FAILED','RECEIPT_FINALIZATION_FAILED']] as const)assert.equal(decodeStudioSafeError({code:raw}).code,safe);
assert.equal(decodeStudioSafeError({code:'42P01',details:'secret table public.foo'}).code,'COMMAND_UNAVAILABLE');
assert.equal(decodeStudioSafeError({error:{errorCode:'SOURCE_COVERAGE_INCOMPLETE'}}).code,'SOURCE_COVERAGE_INCOMPLETE');
assert.equal(decodeStudioSafeError({errorCode:'BUDGET_EXHAUSTED'}).code,'BUDGET_EXHAUSTED');
const response={ok:true as const,outcome:'committed' as const,receiptId:U[5],resourceId:U[6],resource:{state:'requested'}};
assert.deepEqual(decodeStudioCommandResponse(response),response);
assert.throws(()=>decodeStudioCommandResponse({...response,resource_id:U[6]}),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioCommandResponse({...response,ok:false}),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioCommandResponse({...response,outcome:'authorized'}),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioCommandResponse({...response,resource:null}),StudioArtifactBoundaryError);
const retainedPrivateProjection={artifactId:U[6],artifactVersionId:U[7],artifactVersion:1,artifactType:'brd',approved:true,readOnly:false,renditions:[{id:U[5],version:1,format:'pdf',state:'available',mimeType:'application/pdf',filename:'retained-governed-brief.pdf',byteLength:1024,sha256:'d'.repeat(64),rendererVersion:'pdf-v1',retentionMode:'until',retentionUntil:'2027-08-28T00:00:00.000Z',legalHoldActive:false,activeHolds:[],deletion:null,failureCode:null,updatedAt:'2026-08-28T00:00:00.000Z'}]};
assert.equal(decodeStudioPrivateArtifactProjection(retainedPrivateProjection,{artifactId:U[6],artifactVersionId:U[7]}).renditions[0].state,'available');
console.log(`PR_B_ASSERTION ${JSON.stringify({testId:'COMPAT-003',assertionId:'retained-studio-and-private-projection-strict-decoders',fixture:'LEGACY-STUDIO-PRIVATE-01',result:'passed',runtimeContext:{persona:{id:U[8],state:'active',capabilities:['studio.artifacts.read']},organizationId:U[0],workspaceId:U[1],lineage:{profile:'node-client',sourcePackageId:U[5],sourcePackageVersionId:null,sourcePackageVersion:2,sourcePackageHash:'b'.repeat(64),templateId:U[3],templateVersionId:U[4],templateVersion:'studio-brd-1',templateHash:'c'.repeat(64),handoffId:U[7],handoffVersionId:null,handoffVersion:2,artifactId:U[6],artifactVersionId:U[7],artifactVersion:1,studioContractVersion:'studio-artifact-1',extendedStudioContractVersion:'studio-artifact-2',privateProjectionVersion:1,renditionId:U[5],renditionVersion:1}}})}`);

void(async()=>{let envelope:any;
  const transport:StudioArtifactTransport={readHandoffs:async()=>[],readProjection:async()=>projection,readEligibleReviewers:async()=>[],invoke:async(value)=>{envelope=value;return response;}};
  const committed=await executeStudioArtifactCommand(context,'studio.artifact.generation.request',null,{studioHandoffId:U[7],artifactType:'brd'},'generation-key',transport);
  assert.equal(committed.resourceId,U[6]);assert.equal(envelope.expectedAggregateVersion,0);assert.equal(envelope.expectedArtifactVersion,null);
  await executeStudioArtifactCommand(context,'studio.artifact.draft.revise',projection as any,{artifactId:U[6],parentVersionId:U[7],content:{title:'revision'}},'revision-key',transport);
  assert.equal(envelope.expectedArtifactVersion,1);assert.deepEqual(Object.keys(envelope.payload).sort(),['artifactId','content','parentVersionId']);
  assert.equal((await readStudioHandoffs(context,transport)).length,0);assert.equal((await readStudioArtifact(context,U[7],'brd',transport)).id,U[6]);assert.equal((await readStudioEligibleReviewers(context,U[6],U[7],transport)).length,0);
  const workspaceProjection={schemaVersion:'studio-workspace-projection-1',organizationId:U[0],workspaceId:U[1],mode:'direct_studio',sourcePackageId:U[2],sourcePackageVersionId:U[3],sourcePackageVersion:1,sourcePackageHash:'d'.repeat(64),inputBundleVersionId:U[4],inputBundleVersion:1,selectedSources:[{sourceId:U[5],sourceVersionId:U[6],version:1,label:'Studio transcript',family:'studio',role:'primary',selected:true,suggestionStatus:'accepted',citationCount:2,conflictCount:0}],sourceAuthority:{enabled:true,disabledReason:null,sourceVersions:[],sourceSets:[],inputBundles:[]},totalSelectedSourceCount:1,sourcePage:1,sourcePageCount:1,template:null,lineageLabel:'not_assessed',planningOnly:true,citations:2,uncoveredSections:0,conflicts:0,blockers:[],provider:{available:true,label:'Workspace route',functionalBounds:'20 sources'},templates:[],inbox:[],outbox:[],readOnly:false};
  const sourcePackageIdentity={artifactId:U[6],aggregateVersion:1,currentVersionId:U[7],currentApprovedVersionId:null,sourcePackageId:U[5],sourcePackageVersion:2,sourcePackageHash:'b'.repeat(64),sourceMode:'direct_transcript_bundle',version:2,lineageClassification:'not_assessed',planningOnly:true,hasAssessAncestry:false,hasStudioTranscriptBundle:true,hasManualBrief:false,routePolicyVersion:1,createdAt:'2026-08-28T00:00:00.000Z'};
  assert.throws(()=>decodeStudioSourcePackageIdentity({...sourcePackageIdentity,hasAssessAncestry:true}),StudioArtifactBoundaryError);
  assert.throws(()=>decodeStudioSourcePackageIdentity({...sourcePackageIdentity,sourceMode:'manual_brief'}),StudioArtifactBoundaryError);
  assert.throws(()=>decodeStudioSourcePackageIdentity({...sourcePackageIdentity,aggregateVersion:0}),StudioArtifactBoundaryError);
  assert.equal(decodeStudioSourcePackageIdentity({...sourcePackageIdentity,aggregateVersion:0,currentVersionId:null}).aggregateVersion,0);
  assert.equal(decodeStudioSourcePackageIdentity({...sourcePackageIdentity,currentApprovedVersionId:U[8]}).currentApprovedVersionId,U[8]);
  for(const malformed of [{...sourcePackageIdentity,version:3},{...sourcePackageIdentity,routePolicyVersion:0},{...sourcePackageIdentity,createdAt:'yesterday'},{...sourcePackageIdentity,currentVersionId:null},{...sourcePackageIdentity,sourcePackageHash:'short'}])assert.throws(()=>decodeStudioSourcePackageIdentity(malformed),StudioArtifactBoundaryError);
  const workspaceTransport:StudioArtifactTransport={...transport,readWorkspace:async()=>({projection:workspaceProjection}),readArtifactV2:async()=>directProjection,readSourcePackage:async()=>sourcePackageIdentity,readArtifactWorkspace:async(_context,_artifactId,offset,limit)=>({...artifactWorkspace,selectedSources:{...artifactWorkspace.selectedSources,offset,limit,hasMore:offset+artifactWorkspace.selectedSources.items.length<artifactWorkspace.selectedSources.total}}),invokeWorkspace:async(value)=>{envelope=value;return response;}};
  assert.equal((await readStudioWorkspace(context,1,workspaceTransport))?.planningOnly,true);
  assert.equal((await readStudioArtifactV2(context,U[6],workspaceTransport)).contractVersion,'studio-artifact-2');
  assert.equal((await readStudioSourcePackageIdentity(context,U[6],workspaceTransport)).sourcePackageId,U[5]);
  assert.equal((await readStudioArtifactWorkspace(context,U[6],0,1,workspaceTransport)).selectedSources.limit,1);
  const controlledCalls:any[]=[];const controlledCompletions:any[]=[];const digest=`sha256:${'a'.repeat(64)}`;
  (globalThis as any).__controlledHumanBegin=async(input:any)=>{controlledCalls.push(input);return{requestId:U[0],safeAnchor:{contractVersion:'pr-c-controlled-human-step-anchor-1',stepId:`step-${controlledCalls.length}`,action:input.action,targetFamily:input.targetFamily,targetDigest:digest,expectedVersion:input.expectedVersion,transitionKind:input.action==='handoff.consume'?'create_zero':input.action==='handoff.request'||input.action==='studio.source-package.create'?'create_one':'increment_one',selectorDigest:digest,intentDigest:digest,requestDigest:digest,challengeToken:digest,anchoredAt:'2026-09-04T00:00:00.000Z'}}};
  (globalThis as any).__controlledHumanComplete=async(anchor:any)=>{controlledCompletions.push(anchor);return null};
  for(const [commandType,expectedVersion,payload,controlledHuman] of [
    ['studio.handoff.request',0,{upstreamHandoffId:U[2],artifactType:'brd'},{handoffSourceVersion:7}],
    ['studio.handoff.review.resolve',1,{handoffId:U[3],outcome:'approve',rationale:'review'},undefined],
    ['studio.handoff.approval.resolve',2,{handoffId:U[3],outcome:'approve',rationale:'approval'},undefined],
    ['studio.handoff.consume',3,{handoffId:U[3]},undefined],
  ] as const)await executeStudioWorkspaceCommand(context,commandType,expectedVersion,payload,`controlled-${commandType}`,workspaceTransport,controlledHuman);
  assert.deepEqual(controlledCalls.map(call=>call.action),['handoff.request','handoff.review.resolve','handoff.approval.resolve','handoff.consume']);
  assert.equal(controlledCalls[0].targetId,U[2]);assert.equal(controlledCalls[0].expectedVersion,7);assert.equal(controlledCalls[1].targetId,U[3]);assert.equal(controlledCompletions.length,4);assert.equal(controlledCompletions[3].safeAnchor.transitionKind,'create_zero');
  assert.equal(envelope.commandType,'studio.handoff.consume');
  assert.equal(controlledCalls[0].selectorBindings.upstreamHandoffId,U[2]);
  assert.equal(Object.hasOwn(envelope.payload,'handoffSourceVersion'),false);
  const requestEnvelopes:any[]=[];const requestTransport:StudioArtifactTransport={...workspaceTransport,invokeWorkspace:async(value)=>{requestEnvelopes.push(value);return response;}};
  await executeStudioWorkspaceCommand(context,'studio.handoff.request',0,{upstreamHandoffId:U[2],artifactType:'brd'},'controlled-source-v7',requestTransport,{handoffSourceVersion:7});
  assert.equal(requestEnvelopes[0].expectedAggregateVersion,0);assert.equal(requestEnvelopes[0].expectedArtifactVersion,null);assert.deepEqual(requestEnvelopes[0].payload,{upstreamHandoffId:U[2],artifactType:'brd'});
  assert.equal(controlledCalls.at(-1).expectedVersion,7);
  await assert.rejects(()=>executeStudioWorkspaceCommand(context,'studio.handoff.request',0,{upstreamHandoffId:U[2],artifactType:'brd'},'bad-source-v0',workspaceTransport,{handoffSourceVersion:0}),StudioArtifactBoundaryError);
  await assert.rejects(()=>executeStudioWorkspaceCommand(context,'studio.handoff.review.resolve',1,{handoffId:U[3],outcome:'approve',rationale:'review'},'wrong-control-axis',workspaceTransport,{handoffSourceVersion:7}),StudioArtifactBoundaryError);
  const offlineLineageCalls:any[]=[];(globalThis as any).__controlledHumanOfflineLineage=async(...args:any[])=>{offlineLineageCalls.push(args)};
  await executeStudioWorkspaceCommand(context,'studio.source-package.create',0,{sourceMode:'direct_transcript_bundle',artifactType:'brd',studioInputBundle:{id:U[4],versionId:U[5],version:1},manualBrief:null},'workspace-command-key',workspaceTransport);
  assert.deepEqual(offlineLineageCalls,[[U[4],1]]);delete (globalThis as any).__controlledHumanOfflineLineage;
  assert.equal(controlledCalls.at(-1).action,'studio.source-package.create');assert.equal(controlledCalls.at(-1).targetFamily,'input_bundle');assert.equal(controlledCompletions.length,6);
  assert.equal(envelope.commandType,'studio.source-package.create');assert.equal(envelope.expectedAggregateVersion,0);assert.equal(envelope.expectedArtifactVersion,null);
  await executeStudioArtifactCommand(context,'studio.artifact.review.resolve',projection as any,{artifactVersionId:U[7],outcome:'approve',rationale:'controlled review',conditions:[]},'controlled-artifact-review',transport);
  assert.equal(controlledCalls.at(-1).action,'studio.artifact.review.resolve');assert.equal(controlledCompletions.length,7);
  await executeStudioWorkspaceCommand(context,'studio.source-package.create',0,{sourceMode:'manual_brief',artifactType:'brd',manualBrief:'Controlled brief'},'controlled-manual-brief',workspaceTransport);
  assert.equal(controlledCalls.at(-1).action,'studio.source-package.create');assert.equal(controlledCompletions.length,8);
  delete (globalThis as any).__controlledHumanBegin;delete (globalThis as any).__controlledHumanComplete;
  await executeStudioWorkspaceCommand(context,'studio.template.revise',2,{templateVersionId:U[4]},'workspace-revise-key',workspaceTransport);assert.equal(envelope.expectedArtifactVersion,2);
  for(const badVersion of [-1,1.5])await assert.rejects(()=>executeStudioWorkspaceCommand(context,'studio.source-package.create',badVersion,{},'bad-version',workspaceTransport),StudioArtifactBoundaryError);
  await assert.rejects(()=>executeStudioWorkspaceCommand(context,'studio.source-package.create',0,{},'missing-invoke',{...transport,invokeWorkspace:undefined}),StudioArtifactBoundaryError);
  await assert.rejects(()=>executeStudioWorkspaceCommand(context,'studio.command.unknown' as any,0,{},'unknown-command',workspaceTransport),StudioArtifactBoundaryError);
  await assert.rejects(()=>readStudioWorkspace(context,0,workspaceTransport),error=>error instanceof StudioArtifactBoundaryError&&error.code==='INVALID_COMMAND');
  await assert.rejects(()=>readStudioWorkspace(context,1,{...workspaceTransport,readWorkspace:async()=>({projection:workspaceProjection,extra:true})}),error=>error instanceof StudioArtifactBoundaryError&&error.code==='RESOURCE_NOT_AVAILABLE');
  await assert.rejects(()=>readStudioArtifactV2(context,'bad-id',workspaceTransport),StudioArtifactBoundaryError);
  await assert.rejects(()=>readStudioArtifactV2(context,U[6],{...transport,readArtifactV2:undefined}),StudioArtifactBoundaryError);
  await assert.rejects(()=>readStudioSourcePackageIdentity(context,U[6],{...transport,readSourcePackage:undefined}),StudioArtifactBoundaryError);
  await assert.rejects(()=>readStudioArtifactWorkspace(context,'bad-id',0,20,workspaceTransport),StudioArtifactBoundaryError);
  await assert.rejects(()=>readStudioArtifactWorkspace(context,U[6],-1,20,workspaceTransport),StudioArtifactBoundaryError);
  await assert.rejects(()=>readStudioArtifactWorkspace(context,U[6],0,51,workspaceTransport),StudioArtifactBoundaryError);
  await assert.rejects(()=>readStudioArtifactWorkspace(context,U[6],0,20,{...transport,readArtifactWorkspace:undefined}),StudioArtifactBoundaryError);
  await assert.rejects(()=>executeStudioArtifactCommand(context,'studio.artifact.draft.revise',projection as any,{},'domain-error',{...transport,invoke:async()=>{throw{error:{code:'BUDGET_EXHAUSTED'}};}}),error=>error instanceof StudioArtifactBoundaryError&&error.code==='BUDGET_EXHAUSTED');
  assert.equal(await readStudioWorkspace(context,1,transport),null);
  const g=globalThis as any;g.__studioRpc=async(name:string)=>name==='studio_artifact_handoffs'?{data:[{id:U[7],caseId:U[2],label:'Accepted case',sourcePackageHash:'c'.repeat(64)}],error:null}:name==='studio_artifact_projection'?{data:projection,error:null}:name==='studio_artifact_projection_v2'?{data:directProjection,error:null}:name==='studio_artifact_workspace_projection_v2'?{data:artifactWorkspace,error:null}:name==='studio_artifact_source_package_projection'?{data:sourcePackageIdentity,error:null}:{data:[{actorId:U[8],displayName:'Independent Reviewer'}],error:null};g.__studioInvoke=async()=>({data:response,error:null});
  assert.equal((await studioArtifactDefaultTransport.readArtifactV2!(context,U[6]) as any).contractVersion,'studio-artifact-2');
  assert.equal((await studioArtifactDefaultTransport.readSourcePackage!(context,U[6]) as any).sourcePackageId,U[5]);
  assert.equal((await studioArtifactDefaultTransport.readArtifactWorkspace!(context,U[6],0,1) as any).contractVersion,'studio-workspace-2');
  assert.equal((await studioArtifactDefaultTransport.readHandoffs(context) as any[]).length,1);assert.equal((await studioArtifactDefaultTransport.readProjection(context,U[7],'brd') as any).id,U[6]);assert.equal((await studioArtifactDefaultTransport.readEligibleReviewers(context,U[6],U[7]) as any[]).length,1);assert.equal((await studioArtifactDefaultTransport.invoke(envelope) as any).outcome,'committed');const retryEnvelopes:any[]=[];g.__studioInvoke=async(_name:string,options:any)=>{retryEnvelopes.push(options.body);return retryEnvelopes.length===1?{data:null,error:{name:'FunctionsFetchError'}}:{data:response,error:null};};assert.equal((await studioArtifactDefaultTransport.invokeWorkspace!(envelope) as any).outcome,'committed');assert.equal(retryEnvelopes.length,2);assert.deepEqual(retryEnvelopes[0],retryEnvelopes[1]);const maxTwoEnvelopes:any[]=[];g.__studioInvoke=async(_name:string,options:any)=>{maxTwoEnvelopes.push(options.body);if(maxTwoEnvelopes.length===1)throw{name:'AbortError'};return{data:null,error:{name:'FunctionsRelayError'}};};await assert.rejects(()=>studioArtifactDefaultTransport.invokeWorkspace!(envelope),StudioArtifactBoundaryError);assert.equal(maxTwoEnvelopes.length,2);assert.deepEqual(maxTwoEnvelopes[0],maxTwoEnvelopes[1]);for(const outcome of ['generation_stale','generation_uncertain','command_in_progress'] as const){let attempts=0;const receipt={...response,outcome};const contextResponse={clone:()=>({json:async()=>receipt}),json:async()=>receipt};g.__studioInvoke=async()=>{attempts+=1;return{data:null,error:{name:'FunctionsHttpError',context:contextResponse}};};assert.equal((await studioArtifactDefaultTransport.invokeWorkspace!(envelope) as any).outcome,outcome);assert.equal(attempts,1);}let malformedAttempts=0;g.__studioInvoke=async()=>{malformedAttempts+=1;return{data:null,error:{name:'FunctionsHttpError',context:{clone:()=>({json:async()=>({...response,outcome:'committed'})}),json:async()=>({...response,outcome:'committed'})}}};};await assert.rejects(()=>studioArtifactDefaultTransport.invokeWorkspace!(envelope),StudioArtifactBoundaryError);assert.equal(malformedAttempts,1);delete g.__studioRpc;delete g.__studioInvoke;
  g.__studioRpc=async()=>({data:null,error:{code:'RESOURCE_STALE'}});
  await assert.rejects(()=>studioArtifactDefaultTransport.readHandoffs(context),error=>error instanceof StudioArtifactBoundaryError&&error.code==='SOURCE_PACKAGE_STALE');
  await assert.rejects(()=>studioArtifactDefaultTransport.readProjection(context,U[7],'brd'),StudioArtifactBoundaryError);
  await assert.rejects(()=>studioArtifactDefaultTransport.readEligibleReviewers(context,U[6],U[7]),StudioArtifactBoundaryError);
  await assert.rejects(()=>studioArtifactDefaultTransport.readWorkspace!(context,2),StudioArtifactBoundaryError);
  await assert.rejects(()=>studioArtifactDefaultTransport.readArtifactV2!(context,U[6]),StudioArtifactBoundaryError);
  await assert.rejects(()=>studioArtifactDefaultTransport.readSourcePackage!(context,U[6]),StudioArtifactBoundaryError);
  let legacyReceiptAttempts=0;const staleReceipt={...response,outcome:'generation_stale' as const};g.__studioInvoke=async()=>{legacyReceiptAttempts+=1;return{data:null,error:{name:'FunctionsHttpError',context:{clone:()=>({json:async()=>staleReceipt}),json:async()=>staleReceipt}}};};assert.equal((await studioArtifactDefaultTransport.invoke(envelope) as any).outcome,'generation_stale');assert.equal(legacyReceiptAttempts,1);
  let semanticAttempts=0;g.__studioInvoke=async()=>{semanticAttempts+=1;return{data:null,error:{name:'FunctionsHttpError',context:{json:async()=>({errorCode:'TEMPLATE_NOT_APPROVED'})}}};};await assert.rejects(()=>studioArtifactDefaultTransport.invokeWorkspace!(envelope),error=>error instanceof StudioArtifactBoundaryError&&error.code==='TEMPLATE_STALE');assert.equal(semanticAttempts,1);
  let thrownSemanticAttempts=0;g.__studioInvoke=async()=>{thrownSemanticAttempts+=1;throw{name:'FunctionsHttpError',context:{json:async()=>({code:'SOURCE_COVERAGE_INCOMPLETE'})}};};await assert.rejects(()=>studioArtifactDefaultTransport.invokeWorkspace!(envelope),error=>error instanceof StudioArtifactBoundaryError&&error.code==='SOURCE_COVERAGE_INCOMPLETE');assert.equal(thrownSemanticAttempts,1);
  delete g.__studioRpc;delete g.__studioInvoke;
  console.log('studio artifact client: 62 legacy-compatible projection, DTO, safe-error, workspace and command assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
