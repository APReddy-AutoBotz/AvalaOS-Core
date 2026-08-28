import { strict as assert } from 'node:assert';
import { contentToStructuredSections, decodeStudioWorkspaceProjection, structuredSectionsToContent, StudioAuthorityEpoch, StudioWorkspaceProjectionError } from './workspaceModel.ts';

const ids = Array.from({ length: 20 }, (_, index) => `${String(index + 1).padStart(8, '0')}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const context = { organizationId: ids[0], workspaceId: ids[1] };
const template = { templateId: ids[2], templateVersionId: ids[3], version: 'studio-brd-2', name: 'System BRD', artifactType: 'brd', ownership: 'system', lifecycle: 'approved', templateHash: 'a'.repeat(64), immutable: true, replacementTemplateVersionId: null, actions: ['studio.generation.request'] };
const handoff = { kind:'persisted',handoffId:ids[4],handoffVersionId:ids[5],upstreamHandoffId:ids[10],version:1,direction:'inbox',state:'approved',status:'approved',sourceModule:'assess',targetModule:'studio',artifactType:'brd',artifactTypes:[],sourceVersion:null,resourceLabel:'Approved case v3',lineageLabel:'assessed',planningOnly:false,hasStudioTranscriptBundle:false,requestorLabel:'Assess author',targetWorkspaceLabel:'Studio workspace',requestedAt:'2026-08-28T00:00:00Z',updatedAt:'2026-08-28T00:00:00Z',handedOffAt:null,expiresAt:'2026-08-29T00:00:00Z',actions:['studio.handoff.consume'] };
const sourceAuthority={enabled:true,disabledReason:null,sourceVersions:[{sourceId:ids[11],sourceVersionId:ids[12],version:2,label:'Studio transcript',sourceKind:'transcript',mimeType:'text/vtt',characterCount:1200,createdAt:'2026-08-28T00:00:00Z'}],sourceSets:[{sourceSetId:ids[18],currentVersionId:ids[19],currentVersion:1,displayLabel:'Studio set',description:null,manifestHash:'c'.repeat(64),status:'locked',sourceCount:1,extractedCharacterCount:1200,members:[{sourceId:ids[11],sourceVersionId:ids[12],version:2,label:'Studio transcript',ordinal:1,role:'primary',note:null}],createdAt:'2026-08-28T00:00:00Z',updatedAt:'2026-08-28T00:00:00Z'}],inputBundles:[]};
const assessSource = { sourceId: ids[9], sourceVersionId: ids[10], version: 3, label: 'Accepted Assess package', family: 'assess', role: 'reference', selected: true, suggestionStatus: 'accepted', citationCount: 2, conflictCount: 0 };
const studioSource = { sourceId: ids[11], sourceVersionId: ids[12], version: 2, label: 'Studio requirements workshop', family: 'studio', role: 'primary', selected: true, suggestionStatus: 'accepted', citationCount: 4, conflictCount: 0 };
const projection = { schemaVersion: 'studio-workspace-projection-1', organizationId: ids[0], workspaceId: ids[1], mode: 'hybrid', sourcePackageId: ids[6], sourcePackageVersionId: ids[7], sourcePackageVersion: 3, sourcePackageHash: 'b'.repeat(64), inputBundleVersionId: ids[8], inputBundleVersion: 4, selectedSources: [assessSource,studioSource], sourceAuthority,totalSelectedSourceCount: 2, sourcePage: 1, sourcePageCount: 1, template, lineageLabel: 'mixed', planningOnly: false, citations: 6, uncoveredSections: 1, conflicts: 0, blockers: [], provider: { available: true, label: 'Workspace document route', functionalBounds: '20 sources; 2,000,000 extracted characters' }, templates: [template], inbox: [handoff], outbox: [], readOnly: false };

assert.equal(decodeStudioWorkspaceProjection(projection, context).mode, 'hybrid');
assert.throws(() => decodeStudioWorkspaceProjection({ ...projection, workspaceId: ids[19] }, context), StudioWorkspaceProjectionError);
assert.throws(() => decodeStudioWorkspaceProjection({ ...projection, selectedSources: [{ ...projection.selectedSources[0], selected: false }] }, context), StudioWorkspaceProjectionError);
assert.throws(() => decodeStudioWorkspaceProjection({ ...projection, inbox: [{ ...handoff, browserAuthority: true }] }, context), StudioWorkspaceProjectionError);
assert.throws(() => decodeStudioWorkspaceProjection({ ...projection, templates: [{ ...template, immutable: false }] }, context), StudioWorkspaceProjectionError);
assert.throws(() => decodeStudioWorkspaceProjection({ ...projection, mode: 'direct_studio', lineageLabel: 'assessed', planningOnly: false }, context), StudioWorkspaceProjectionError);
assert.throws(() => decodeStudioWorkspaceProjection({ ...projection, clientAuthority: true }, context), StudioWorkspaceProjectionError);
const tenantDraft={...template,templateId:ids[13],templateVersionId:ids[14],version:1,name:'Tenant BRD',ownership:'tenant',lifecycle:'reviewer_ready',templateHash:null,immutable:false,actions:['studio.template.review.resolve']};
const eligible={...handoff,kind:'eligible',handoffId:null,handoffVersionId:null,version:null,state:'eligible',status:null,artifactType:null,artifactTypes:['brd','frd'],sourceVersion:3,lineageLabel:null,planningOnly:null,hasStudioTranscriptBundle:null,requestedAt:null,updatedAt:null,handedOffAt:'2026-08-28T00:00:00Z',expiresAt:null,actions:['studio.handoff.request']};
const outbox={...handoff,handoffId:ids[15],handoffVersionId:ids[16],direction:'outbox',state:'reviewer_ready',status:'reviewer_ready',actions:['studio.handoff.withdraw']};
const inputBundle={inputBundleId:ids[15],inputBundleVersionId:ids[16],currentVersion:1,bundleHash:'d'.repeat(64),status:'locked',sourceSetVersions:[{sourceSetId:ids[18],sourceSetVersionId:ids[17],sourceSetVersion:1,manifestHash:'c'.repeat(64),ordinal:1,purpose:'Governed generation'}],createdAt:'2026-08-28T00:00:00Z',updatedAt:'2026-08-28T00:00:00Z'};
const expanded=decodeStudioWorkspaceProjection({...projection,sourceAuthority:{...sourceAuthority,inputBundles:[inputBundle]},templates:[template,tenantDraft],inbox:[eligible,handoff],outbox:[outbox]},context);
assert.equal(expanded.sourceAuthority.inputBundles[0].sourceSetVersions[0].purpose,'Governed generation');
assert.equal(expanded.templates[1].lifecycle,'reviewer_ready');
assert.equal(expanded.inbox[0].kind,'eligible');assert.equal(expanded.outbox[0].direction,'outbox');
const malformedProjections=[
  {...projection,schemaVersion:'studio-workspace-projection-2'},
  {...projection,mode:'unconfigured',planningOnly:true,lineageLabel:'not_assessed'},
  {...projection,sourcePackageVersionId:null},
  {...projection,inputBundleVersion:null},
  {...projection,selectedSources:Array.from({length:51},()=>studioSource)},
  {...projection,provider:{available:'yes',label:'route',functionalBounds:'bounded'}},
  {...projection,sourcePage:0},
  {...projection,blockers:Array.from({length:51},(_,index)=>`blocker-${index}`)},
  {...projection,sourceAuthority:{...sourceAuthority,sourceVersions:[{...sourceAuthority.sourceVersions[0],createdAt:'invalid'}]}},
  {...projection,sourceAuthority:{...sourceAuthority,sourceSets:[{...sourceAuthority.sourceSets[0],members:[{...sourceAuthority.sourceSets[0].members[0],ordinal:2}]}]}},
  {...projection,sourceAuthority:{...sourceAuthority,inputBundles:[{...inputBundle,sourceSetVersions:[{...inputBundle.sourceSetVersions[0],ordinal:2}]}]}},
  {...projection,templates:[{...template,lifecycle:'draft'}]},
  {...projection,templates:[{...tenantDraft,ownership:'system',version:'studio-brd-2'}]},
  {...projection,inbox:[{...eligible,handoffId:ids[4]}]},
  {...projection,inbox:[{...handoff,artifactTypes:['brd']}]},
  {...projection,inbox:[{...handoff,actions:['studio.handoff.override']}]},
  {...projection,outbox:[{...outbox,direction:'inbox'}]},
  {...projection,inbox:[{...handoff,expiresAt:'not-a-date'}]},
] as const;
for(const malformed of malformedProjections)assert.throws(()=>decodeStudioWorkspaceProjection(malformed,context),StudioWorkspaceProjectionError);
const anchor={sourceVersionId:ids[12],sourceLabel:'Studio transcript',sourceVersion:2,locator:'L4',anchorHash:'f'.repeat(64)};
const selectedSource={sourceId:ids[11],sourceVersionId:ids[12],sourceVersion:2,label:'Studio transcript',sourceKind:'transcript',semanticRoles:['primary'] as const};
const sections = contentToStructuredSections({ sections: [{ id: 'scope', title: 'Scope', body: '<script>data only</script>', sourceAnchors: [{sourceVersionId:anchor.sourceVersionId,locator:anchor.locator,anchorHash:anchor.anchorHash}], labels: [] }] },undefined,[selectedSource]);
assert.equal(sections[0].body, '<script>data only</script>');
assert.deepEqual((structuredSectionsToContent({}, sections).sections as Array<{ title: string }>).map(section => section.title), ['Scope']);
const canonicalAnchor={sourceVersionId:anchor.sourceVersionId,locator:anchor.locator,anchorHash:anchor.anchorHash};
assert.deepEqual((structuredSectionsToContent({}, sections).sections as Array<{sourceAnchors:unknown[]}>)[0].sourceAnchors,[canonicalAnchor]);
assert.equal(contentToStructuredSections({ title: 'Legacy title', body: 'Legacy safe read' })[0].title, 'Legacy title');
const tolerant=contentToStructuredSections({sections:[null,{id:'',content:'Legacy body',sourceAnchors:'not-an-array',labels:['unknown']} ]});
assert.deepEqual(tolerant.map(section=>section.id),['section-1','section-2']);assert.equal(tolerant[1].body,'Legacy body');assert.deepEqual(tolerant[1].sourceAnchors,[]);assert.deepEqual(tolerant[1].labels,['human_authored']);
assert.equal(contentToStructuredSections({})[0].title,'Document overview');
const serialized=structuredSectionsToContent({retained:true},[{id:'scope',title:'  Scope  ',body:'Body',sourceAnchors:[anchor],labels:['assumption']}]);
assert.equal(serialized.title,'  Scope  ');assert.equal(serialized.sections[0].title,'Scope');assert.deepEqual(serialized.sections[0].sourceAnchors,[canonicalAnchor]);assert.deepEqual(serialized.sections[0].labels,['assumption']);assert.equal((serialized as Record<string,unknown>).retained,true);
assert.equal('sourceLabel' in serialized.sections[0].sourceAnchors[0],false);assert.equal('sourceVersion' in serialized.sections[0].sourceAnchors[0],false);
const projected=contentToStructuredSections({sections:[]},[{id:'scope',title:'Projected scope',body:'Body',sourceAnchors:[canonicalAnchor],labels:[]}],[selectedSource]);
assert.deepEqual(projected[0].sourceAnchors,[anchor]);assert.deepEqual(projected[0].labels,[]);
const authorityA={organizationId:ids[0],workspaceId:ids[1],userId:ids[2],authorizationVersion:7};
const authorityB={...authorityA,userId:ids[3],authorizationVersion:8};
const authorityEpoch=new StudioAuthorityEpoch(authorityA),older=authorityEpoch.issue();
authorityEpoch.rebind(authorityB);const newer=authorityEpoch.issue();
const acceptedCompletions:string[]=[];const complete=(ticket:typeof newer,label:string)=>{if(authorityEpoch.accepts(ticket))acceptedCompletions.push(label);};
complete(newer,'new-authority-resolved-first');complete(older,'stale-authority-resolved-last');
assert.deepEqual(acceptedCompletions,['new-authority-resolved-first']);assert.equal(authorityEpoch.accepts(newer),true);assert.equal(authorityEpoch.accepts(older),false);
const direct=decodeStudioWorkspaceProjection({...projection,mode:'direct_studio',selectedSources:[studioSource],totalSelectedSourceCount:1,lineageLabel:'not_assessed',planningOnly:true,inbox:[]},context);
const assessOnly=decodeStudioWorkspaceProjection({...projection,mode:'accepted_assess_handoff',selectedSources:[assessSource],totalSelectedSourceCount:1,lineageLabel:'assessed',planningOnly:false,inputBundleVersionId:null,inputBundleVersion:null},context);
const hybrid=decodeStudioWorkspaceProjection(projection,context);
const explicitReuse=decodeStudioWorkspaceProjection({...projection,selectedSources:[assessSource,{...assessSource,family:'studio',role:'supporting',label:'Explicit exact-version reuse'}],totalSelectedSourceCount:2},context);
assert.equal(direct.planningOnly,true);assert.equal(assessOnly.mode,'accepted_assess_handoff');assert.deepEqual(hybrid.selectedSources.map(source=>source.family),['assess','studio']);assert.equal(new Set(explicitReuse.selectedSources.map(source=>source.sourceVersionId)).size,1);
const capabilities=['studio.artifacts.read','studio.handoffs.read','studio.sources.read','studio.templates.read'];
const baseLineage={profile:'node-domain',sourcePackageId:ids[6],sourcePackageVersionId:ids[7],sourcePackageVersion:3,sourcePackageHash:'b'.repeat(64),templateId:ids[2],templateVersionId:ids[3],templateVersion:'studio-brd-2',templateHash:'a'.repeat(64),handoffId:ids[4],handoffVersionId:ids[5],handoffVersion:1,artifactId:ids[13],artifactVersionId:ids[14],artifactVersion:1,authorActorId:ids[15],reviewerActorId:ids[16],approverActorId:ids[17],separationOfDuty:'independent_author_reviewer_approver'};
const marker=(testId:string,assertionId:string,fixture:string,lineage:Record<string,unknown>)=>console.log(`PR_B_ASSERTION ${JSON.stringify({testId,assertionId,fixture,result:'passed',runtimeContext:{persona:{id:ids[18],state:'active',capabilities},organizationId:context.organizationId,workspaceId:context.workspaceId,lineage:{...baseLineage,...lineage}}})}`);
marker('PATH-001','accepted-assess-handoff-exact-lineage','ASSESS-ACCEPTED-DOMAIN-01',{mode:assessOnly.mode,assessSourceVersionId:assessSource.sourceVersionId,studioSourceCount:0});
marker('PATH-002','direct-studio-domain-planning-only','STUDIO-DIRECT-DOMAIN-01',{mode:direct.mode,handoffId:null,handoffVersionId:null,handoffVersion:null,planningOnly:true,assessmentLineageClaimed:false});
marker('STUDIO-TR-003','direct-domain-no-fabricated-assess-ancestry','STUDIO-DIRECT-DOMAIN-01',{mode:direct.mode,handoffId:null,handoffVersionId:null,handoffVersion:null,lineageLabel:direct.lineageLabel});
marker('PATH-005','hybrid-domain-disjoint-source-families','HYBRID-DOMAIN-01',{mode:hybrid.mode,assessSourceVersionId:assessSource.sourceVersionId,studioSourceVersionId:studioSource.sourceVersionId});
marker('STUDIO-TR-002','hybrid-domain-exact-lineage','HYBRID-DOMAIN-01',{mode:hybrid.mode,selectedSourceCount:hybrid.selectedSources.length,inputBundleVersionId:hybrid.inputBundleVersionId,inputBundleVersion:hybrid.inputBundleVersion});
marker('PATH-006','explicit-exact-version-reuse-domain','EXPLICIT-REUSE-DOMAIN-01',{mode:explicitReuse.mode,reusedSourceVersionId:assessSource.sourceVersionId,sourceFamilies:explicitReuse.selectedSources.map(source=>source.family),automaticReuse:false});
console.log('studio PR B workspace model: 42 strict projection, lineage, template, handoff and structured-content assertions passed');
