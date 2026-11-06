import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLegacyDeliveryPostgresFixture } from './legacyDeliveryPostgresFixture.mjs';
import { createCommittedStudioFixture } from './studioArtifactPostgresFixture.mjs';

const ASSESSMENT='96000000-0000-4000-8000-000000000001',PROJECT='96000000-0000-4000-8000-000000000002',CLONE='96000000-0000-4000-8000-000000000003';
const sentinel='Source facts from the accepted Assess handoff (for human review; not model-generated reasoning):';
const requirements=[
 '1. Capture supplier query details including email, received time, requester, and invoice references, and acknowledge within two working days.',
 '2. Verify requester authority by checking supplier contact records before disclosing invoice status.',
 '3. Extract invoice references accurately without inferring missing numbers; handle multiple or ambiguous requests via human intervention.',
 '4. Use approved read-only GET API to retrieve invoice status, matching invoiceId and supplierId exactly.',
 '5. Draft responses based on verified status; only humans may approve and send replies.',
 '6. Record original source and human-approved responses for audit; retention duration is an open question.',
 '7. Resolve ambiguities, disputes, and exceptions through human investigation; route bank-detail requests to independent finance procedures.',
 '8. Exclude the prohibited bank-details POST. Keep the unknown invoice PATCH unavailable pending separate evidence and approval.',
 '9. Maintain audit and monitoring controls including data classification before AI access.',
 '10. Support a hybrid operating model combining automation and human approval components.',
 '11. Address unresolved evidence and technical questions before implementation.',
];
const content={title:'Supplier invoice query handling — Business Requirements',sections:[
 {id:'summary',title:'Summary',body:'The process must acknowledge every query, but this summary is contextual.'},
 {id:'requirements',title:'Requirements',body:[...requirements,'12. Background context.','',sentinel,'1. Capture this source-fact list item only as evidence.','  - Rules: The process must retain evidence.'].join('\n')},
 {id:'appendix',title:'Appendix',body:'The appendix must remain contextual.'},
]};
const items=()=>{const links=requirements.map(requirementText=>({sectionId:'requirements',sectionTitle:'Requirements',requirementText}));return [
 {proposalRole:'coordination',type:'Epic',title:'Deliver supplier query outcome',description:'Coordinate the exact approved requirements.',acceptanceCriteria:links.map(x=>`Delivered: ${x.requirementText}`),requirementLinks:links},
 ...links.map((link,index)=>({proposalRole:'implementation',type:index===0?'Task':'Story',title:`Implement supplier requirement ${index+1}`,description:`Deliver ${link.requirementText}`,acceptanceCriteria:[`Satisfied: ${link.requirementText}`],requirementLinks:[link]})),
 {proposalRole:'verification',type:'Task',title:'Verify supplier query outcome',description:'Verify the exact approved requirements.',acceptanceCriteria:links.map(x=>`Verified: ${x.requirementText}`),requirementLinks:links},
]};
const revise=async(db,x)=>{const value=(await db.query('SELECT public.studio_artifact_command_claim($1::jsonb) value',[JSON.stringify({commandType:'studio.artifact.draft.revise',requestId:randomUUID(),idempotencyKey:randomUUID(),organizationId:x.org,workspaceId:x.workspace,actorId:x.requester,authorizationVersion:x.authorizationVersions[x.requester],expectedAggregateVersion:Number(x.aggregate.aggregate_version),expectedArtifactVersion:Number(x.version.version),payload:{artifactId:x.artifactId,parentVersionId:x.version.id,content}})])).rows[0].value;assert.equal(value.outcome,'committed',JSON.stringify(value));const aggregate=(await db.query('SELECT * FROM public.studio_artifact_aggregates WHERE id=$1',[x.artifactId])).rows[0],version=(await db.query('SELECT * FROM public.studio_artifact_versions WHERE id=$1',[aggregate.current_version_id])).rows[0];return{...x,aggregate,version};};
const approve=async(db,x)=>{let aggregate=Number(x.aggregate.aggregate_version);for(const[commandType,actor,payload]of[
 ['studio.artifact.review.submit',x.requester,{}],['studio.artifact.review.assign',x.requester,{reviewerId:x.reviewer}],
 ['studio.artifact.review.resolve',x.reviewer,{outcome:'approve',rationale:'Independent fixture review',conditions:[]}],
 ['studio.artifact.approval.resolve',x.approver,{outcome:'approve',rationale:'Independent fixture approval',conditions:[]}],
]){const authorizationVersion=Number((await db.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[x.org,actor])).rows[0].version);const value=(await db.query('SELECT public.studio_artifact_command_claim($1::jsonb) value',[JSON.stringify({commandType,requestId:randomUUID(),idempotencyKey:randomUUID(),organizationId:x.org,workspaceId:x.workspace,actorId:actor,authorizationVersion,expectedAggregateVersion:aggregate,expectedArtifactVersion:Number(x.version.version),payload:{artifactId:x.artifactId,artifactVersionId:x.version.id,...payload}})])).rows[0].value;assert.equal(value.outcome,'committed',`${commandType}:${JSON.stringify(value)}`);aggregate+=1;}return aggregate;};

let fixture,stage='startup';
try{
 stage='fixture';fixture=await createLegacyDeliveryPostgresFixture({seed:false});
 stage='studio';const x=await revise(fixture.db,await createCommittedStudioFixture(fixture.db,'brd'));
 await fixture.db.query(`INSERT INTO public.assessments(id,process_id,org_id,workspace_id,status,score_version,created_by,updated_by) VALUES($1,$2,$3,$4,'Approved','assess-core-2026-05',$5,$5)`,[ASSESSMENT,x.process,x.org,x.workspace,x.requester]);
 await fixture.db.query(`UPDATE public.assess_v2_cases SET source_v1_assessment_id=$1,source_v1_score_version='assess-core-2026-05' WHERE id=$2`,[ASSESSMENT,x.caseId]);
 for(const[id,name]of[[PROJECT,'Numbered requirements'],[CLONE,'Numbered requirements negative']])await fixture.db.query(`INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by,source_process_id,source_assessment_id) VALUES($1,$2,$3,$4,$5,$5,$5,$6,$7)`,[id,x.org,x.workspace,name,x.requester,x.process,ASSESSMENT]);
 for(const capability of['assess.read','studio.artifacts.publish','workitems.import','task.read','backlog.read','project.manage'])await fixture.db.query('INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2) ON CONFLICT DO NOTHING',[x.role,capability]);
 const aggregateVersion=await approve(fixture.db,x),authorizationVersion=Number((await fixture.db.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[x.org,x.requester])).rows[0].version);
 await fixture.db.query(`INSERT INTO public.studio_delivery_workspace_controls(org_id,workspace_id,publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled) VALUES($1,$2,true,true,true)`,[x.org,x.workspace]);
 await fixture.db.query('INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled) VALUES($1,$2,true)',[x.org,x.workspace]);
 const call=async(payload,key=randomUUID(),requestId=randomUUID())=>(await fixture.asRole('service_role',()=>fixture.db.query('SELECT public.studio_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',[x.requester,x.org,x.workspace,authorizationVersion,requestId,key,'studio.approved-artifact.publish',JSON.stringify(payload)]))).rows[0].value;
 const base={artifactId:x.artifactId,expectedArtifactVersionId:x.version.id,expectedAggregateVersion:aggregateVersion,projectId:CLONE,workItems:items()};
 const snapshot=async()=>(await fixture.db.query(`SELECT (SELECT count(*)::int FROM public.studio_delivery_publications) publications,(SELECT count(*)::int FROM public.studio_delivery_work_item_requirement_bindings) bindings,(SELECT count(*)::int FROM public.document_generations WHERE studio_delivery_publication_id IS NOT NULL) generations`)).rows[0];
 stage='negative-links';for(const link of[
  {sectionId:'requirements',sectionTitle:'Requirements',requirementText:'13. Capture invented work.'},
  {sectionId:'foreign',sectionTitle:'Requirements',requirementText:requirements[0]},
  {sectionId:'summary',sectionTitle:'Summary',requirementText:content.sections[0].body},
  {sectionId:'appendix',sectionTitle:'Appendix',requirementText:content.sections[2].body},
  {sectionId:'requirements',sectionTitle:'Requirements',requirementText:'12. Background context.'},
  {sectionId:'requirements',sectionTitle:'Requirements',requirementText:'1. Capture this source-fact list item only as evidence.'},
 ]){const before=await snapshot(),denied=await call({...base,workItems:[{...base.workItems[1],requirementLinks:[link]}]});assert.equal(denied.errorCode,'INVALID_COMMAND',`${JSON.stringify(link)}:${JSON.stringify(denied)}`);assert.deepEqual(await snapshot(),before);}
 const stale=await call({...base,expectedAggregateVersion:aggregateVersion+1,workItems:[base.workItems[1]]});assert.equal(stale.errorCode,'VERSION_CONFLICT',JSON.stringify(stale));
 stage='duplicate-number';await fixture.db.query('BEGIN');try{const duplicate=structuredClone(content);duplicate.sections[1].body=`${requirements[0]}\n1. The reviewer must verify the same request.\n${requirements.slice(1).join('\n')}`;await fixture.db.query('ALTER TABLE public.studio_artifact_versions DISABLE TRIGGER USER');await fixture.db.query(`UPDATE public.studio_artifact_versions SET content=$2::jsonb,content_hash=encode(public.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1`,[x.version.id,JSON.stringify(duplicate)]);await fixture.db.query('ALTER TABLE public.studio_artifact_versions ENABLE TRIGGER USER');await fixture.db.query('SET LOCAL ROLE service_role');const denied=(await fixture.db.query('SELECT public.studio_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',[x.requester,x.org,x.workspace,authorizationVersion,randomUUID(),randomUUID(),'studio.approved-artifact.publish',JSON.stringify(base)])).rows[0].value;assert.equal(denied.errorCode,'INVALID_COMMAND',JSON.stringify(denied));await fixture.db.query('ROLLBACK');}catch(error){await fixture.db.query('ROLLBACK');throw error;}
 stage='publish';const request=randomUUID(),key=randomUUID(),published=await call({...base,projectId:PROJECT},key,request);assert.equal(published.ok,true,JSON.stringify(published));assert.equal(published.resource.workItemCount,13);const replay=await call({...base,projectId:PROJECT},key,request);assert.equal(replay.resource.publicationId,published.resource.publicationId);
 const bindings=(await fixture.db.query('SELECT source_item_index,proposal_role,requirement_links FROM public.studio_delivery_work_item_requirement_bindings WHERE publication_id=$1 ORDER BY source_item_index',[published.resource.publicationId])).rows;assert.equal(bindings.length,13);assert.deepEqual(bindings.slice(1,12).map(row=>row.requirement_links[0].requirementText),requirements);
 stage='import';const source=(await fixture.asRole('service_role',()=>fixture.db.query('SELECT public.legacy_delivery_requirement_query($1,$2,$3,$4,$5,$6,$7,$8,$9) value',[x.requester,x.org,x.workspace,authorizationVersion,PROJECT,100,null,published.resource.documentGenerationId,true]))).rows[0].value;assert.equal(source.ok,true,JSON.stringify(source));const importPayload={projectId:PROJECT,sourceGenerationId:published.resource.documentGenerationId,expectedSourceDigest:source.source.digest,sourceItemIndices:[1,12]},importRequest=randomUUID(),importKey=randomUUID();const importCall=async(r=importRequest,k=importKey)=>(await fixture.asRole('service_role',()=>fixture.db.query('SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',[x.requester,x.org,x.workspace,authorizationVersion,r,k,'import',JSON.stringify(importPayload)]))).rows[0].value;const imported=await importCall();assert.equal(imported.ok,true,JSON.stringify(imported));assert.equal((await importCall()).resource.importId,imported.resource.importId);assert.equal((await importCall(randomUUID(),randomUUID())).errorCode,'DUPLICATE_IMPORT');
 const board=(await fixture.db.query(`SELECT type,source_lineage->>'proposalRole' proposal_role,source_lineage->>'proposalOriginId' proposal_origin FROM public.delivery_work_items WHERE project_id=$1 ORDER BY source_item_index`,[PROJECT])).rows;assert.deepEqual(board.map(row=>row.type),['Task','Task']);assert.deepEqual(board.map(row=>row.proposal_role),['implementation','verification']);assert.ok(board.every(row=>typeof row.proposal_origin==='string'&&row.proposal_origin.length>0));assert.notEqual(board[0].proposal_origin,board[1].proposal_origin);
 assert.equal((await fixture.db.query('SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip,'20261106190001');
 console.log('DELIVERY NUMBERED REQUIREMENTS POSTGRES PASS 11 exact Stories, guarded denials, replay/import duplicate protection and distinct edited identity');
}catch(error){throw new Error(`DELIVERY_NUMBERED_REQUIREMENTS_POSTGRES_FAILED:${stage}:${error instanceof Error?error.message:String(error)}`,{cause:error});}finally{if(fixture)await fixture.close();}
