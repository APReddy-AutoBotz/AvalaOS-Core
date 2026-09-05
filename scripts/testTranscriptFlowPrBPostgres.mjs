import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {createCommittedStudioFixture} from './studioArtifactPostgresFixture.mjs';
import {createAvailablePrivateArtifactFixture} from './studioPrivateArtifactPostgresFixture.mjs';
import {createEnterpriseIntelligenceFixture} from './enterpriseIntelligencePostgresFixture.mjs';

const adminUrl=process.env.TRANSCRIPT_FLOW_PR_B_MIGRATION_DATABASE_URL;
if(!adminUrl){
  if(process.env.CI)throw Error('TRANSCRIPT_FLOW_PR_B_MIGRATION_DATABASE_URL is required');
  console.log('TRANSCRIPT_FLOW_PR_B_MIGRATION_DATABASE_URL not set; PR B PostgreSQL scenarios were not run locally.');
  process.exit(0);
}

const {Client}=pg;
const migrationName='20260828120000_governed_multisource_studio_pr_b.sql';
const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
const featureIndex=migrations.indexOf(migrationName);
assert.ok(featureIndex>0,`${migrationName} missing or not ordered`);
const baseline=migrations.slice(0,featureIndex);
const feature=[migrationName];
const all=migrations;
const currentMigrationTip=migrations.at(-1)?.match(/^(\d{14})_/u)?.[1];
assert.ok(currentMigrationTip,'current migration tip missing or malformed');
const suffix=`${process.pid}_${Date.now()}`;
const names=Object.fromEntries(['fresh','upgrade','populated','dirty_hash','dirty_missing','dirty_partial'].map(label=>[label,`studio_pr_b_${label}_${suffix}`]));
const clients=[];const databases=[];const roles=[];
const urlFor=name=>{const url=new URL(adminUrl);url.pathname=`/${name}`;return url.toString()};
const connect=async connectionString=>{const client=new Client({connectionString});await client.connect();clients.push(client);return client};
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const transaction=async(client,label,sql)=>{await client.query('BEGIN');try{await client.query(sql);await client.query('COMMIT');console.log(`APPLIED ${label}`)}catch(error){await client.query('ROLLBACK');throw error}};
const bootstrap=async client=>transaction(client,'auth bootstrap',`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';GRANT USAGE ON SCHEMA auth TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
const apply=async(client,list)=>{for(const name of list)await transaction(client,name,await readFile(join('supabase/migrations',name),'utf8'))};
const createDatabase=async(admin,name)=>{assert.match(name,/^[a-z0-9_]+$/);assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);await admin.query(`CREATE DATABASE ${name}`);databases.push(name);const client=await connect(urlFor(name));await bootstrap(client);return client};
const emit=(testId,assertionId,fixture,runtimeContext)=>console.log(`PR_B_ASSERTION ${JSON.stringify({testId,assertionId,fixture,result:'passed',runtimeContext})}`);
const context=(persona,organizationId,workspaceId,lineage)=>({persona:{id:persona.id,state:'active',capabilities:[...persona.capabilities].sort()},organizationId,workspaceId,lineage});
const migrationContext=(scenario,lineage={})=>context({id:'synthetic-migration-controller',capabilities:[]},`synthetic-org-${scenario}`,`synthetic-workspace-${scenario}`,{scenario,sourcePackage:null,template:null,handoff:null,artifact:null,...lineage});
const assertNoPrBMutation=async(client,{partialSourcePackage=false}={})=>{
  assert.equal(Number((await client.query("SELECT count(*) n FROM public.capabilities WHERE capability_key LIKE 'studio.sources.%' OR capability_key LIKE 'studio.templates.%' OR capability_key LIKE 'studio.handoffs.%'")).rows[0].n),0);
  assert.equal(Number((await client.query("SELECT count(*) n FROM information_schema.columns WHERE table_schema='public' AND table_name='enterprise_transcript_workspace_flags' AND column_name='studio_multisource_enabled'")).rows[0].n),0);
  assert.equal((await client.query("SELECT to_regclass('public.studio_tenant_template_aggregates') relation")).rows[0].relation,null);
  if(!partialSourcePackage)assert.equal((await client.query("SELECT to_regclass('public.studio_artifact_source_packages') relation")).rows[0].relation,null);
};
const snapshotLegacy=async(client,fixture)=>({
  aggregate:(await client.query(`SELECT id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_resolution_id,govern_resolution_id,handoff_id,source_package_hash,artifact_type,aggregate_version,current_version_id,current_approved_version_id,lifecycle,created_by,created_at,updated_at FROM public.studio_artifact_aggregates WHERE id=$1`,[fixture.artifactId])).rows[0],
  versions:(await client.query(`SELECT id,artifact_id,version,parent_version_id,template_id,content_schema_version,renderer_version,content_hash,lifecycle,generation_attempt_id,author_id,created_at FROM public.studio_artifact_versions WHERE artifact_id=$1 ORDER BY version`,[fixture.artifactId])).rows,
  reviews:(await client.query(`SELECT assignment.id assignment_id,resolution.id resolution_id,resolution.outcome,resolution.receipt_id FROM public.studio_artifact_review_assignments assignment LEFT JOIN public.studio_artifact_review_resolutions resolution ON resolution.assignment_id=assignment.id WHERE assignment.artifact_id=$1`,[fixture.artifactId])).rows,
  approvals:(await client.query(`SELECT id,artifact_version_id,outcome,receipt_id,superseded_version_id FROM public.studio_artifact_approval_resolutions WHERE artifact_id=$1`,[fixture.artifactId])).rows,
  renditions:(await client.query(`SELECT id,attempt_id,artifact_id,artifact_version_id,artifact_version,content_hash,lifecycle,retention_policy_id,retention_policy_version FROM public.studio_renditions WHERE artifact_id=$1`,[fixture.artifactId])).rows,
});
const snapshotDeliveryMonitor=async(client,ids)=>({
  handoff:(await client.query(`SELECT id,org_id,workspace_id,studio_document_id,artifact_type,studio_version_id,studio_version,studio_content_hash,source_status,source_snapshot,status,version,created_by,created_at,updated_at FROM public.enterprise_studio_delivery_handoffs WHERE id=$1`,[ids.handoff])).rows[0],
  workPackage:(await client.query(`SELECT id,org_id,workspace_id,handoff_id,current_version,status,created_by,created_at,updated_at FROM public.enterprise_delivery_work_packages WHERE id=$1`,[ids.workPackage])).rows[0],
  workPackageVersion:(await client.query(`SELECT id,work_package_id,org_id,workspace_id,version,studio_document_id,artifact_type,studio_version_id,studio_version,studio_content_hash,content,content_hash,status,created_by,created_at FROM public.enterprise_delivery_work_package_versions WHERE id=$1`,[ids.workPackageVersion])).rows[0],
  workItem:(await client.query(`SELECT id,package_version_id,org_id,workspace_id,item_type,title,description,acceptance_criteria,source_section_locator,source_document_id,source_document_version,source_document_hash,idempotency_key,created_by,created_at FROM public.enterprise_delivery_work_items WHERE id=$1`,[ids.workItem])).rows[0],
  monitor:(await client.query(`SELECT id,org_id,workspace_id,work_package_id,work_package_version_id,studio_document_id,studio_version,studio_content_hash,approved_item_ids,milestones,dependencies,blockers,risks,readiness,status,live_telemetry_connected,version,resource_hash,created_by,created_at FROM public.enterprise_monitor_baselines WHERE id=$1`,[ids.monitor])).rows[0],
});
const dropAggregateForeignKeys=async client=>{
  const constraints=(await client.query("SELECT conname FROM pg_constraint WHERE conrelid='public.studio_artifact_aggregates'::regclass AND contype='f'")).rows;
  for(const {conname} of constraints){assert.match(conname,/^[a-zA-Z0-9_]+$/);await client.query(`ALTER TABLE public.studio_artifact_aggregates DROP CONSTRAINT "${conname}"`)}
};
const actorCapabilities=async(client,fixture)=>{
  const rows=(await client.query(`SELECT DISTINCT capability_key FROM public.role_capabilities WHERE role_id=ANY($1::uuid[]) ORDER BY capability_key`,[[fixture.role,fixture.routeRole].filter(Boolean)])).rows;
  return rows.map(row=>row.capability_key);
};
const claim=async(client,fixture,commandType,label,ordinal)=>{
  const token=fixture.uuid(8000+ordinal);const request=fixture.uuid(8100+ordinal);const hash='f'.repeat(63)+(ordinal%10);
  return(await client.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*`,[fixture.requester,fixture.org,fixture.workspace,commandType,`pr-b-${label}`,request,hash,token])).rows[0];
};
const asAuthenticated=async(client,userId,sql,parameters=[])=>{
  await client.query('BEGIN');
  try{
    await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`,[userId]);
    await client.query('SET LOCAL ROLE authenticated');
    const result=await client.query(sql,parameters);
    await client.query('ROLLBACK');
    return result;
  }catch(error){await client.query('ROLLBACK');throw error}
};
const structuredContent=(title,sourceAnchors=[],labels=['human_authored'])=>{
  const sourceIds=[...new Set(sourceAnchors.map(anchor=>anchor.sourceVersionId))];
  return{contractVersion:'studio-artifact-2',title,summary:'Synthetic governed Studio artifact.',sections:[{id:'summary',title:'Summary',body:title,sourceAnchors,labels}],coverage:{selectedSourceVersionIds:sourceIds,coveredSourceVersionIds:sourceIds,complete:true}};
};
const cloneAssessHandoff=async(client,fixture,ordinal,sourceVersionId=null,caseId=null)=>{
  const ids={decision:fixture.uuid(7200+ordinal*20),review:fixture.uuid(7201+ordinal*20),resolution:fixture.uuid(7202+ordinal*20),govern:fixture.uuid(7203+ordinal*20),handoff:fixture.uuid(7204+ordinal*20)};
  const receipts=[0,1,2,3].map(offset=>fixture.uuid(7210+ordinal*20+offset));
  for(let index=0;index<receipts.length;index++)await client.query(`INSERT INTO public.assess_command_receipts(id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at) VALUES($1,$2,$3,$4,'pr-b-fixture',$5,$6,'fixture-hash','succeeded','{}',now())`,[receipts[index],fixture.org,fixture.workspace,fixture.requester,`pr-b-clone-${ordinal}-${index}`,fixture.uuid(7220+ordinal*20+index)]);
  const decisionVersion=`decision-pr-b-${ordinal}`;
  await client.query(`INSERT INTO public.assess_v2_decision_versions(id,case_id,source_version_id,org_id,workspace_id,schema_version,rule_set_version,decision_version,validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,receipt_id,created_by,created_at)
    SELECT $1,COALESCE($5,case_id),COALESCE($4,source_version_id),org_id,workspace_id,schema_version,rule_set_version,$2,validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,$3,created_by,now() FROM public.assess_v2_decision_versions WHERE id=$6`,[ids.decision,decisionVersion,receipts[0],sourceVersionId,caseId,fixture.decision]);
  await client.query(`INSERT INTO public.assess_v2_review_assignments(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_schema_version,review_sequence,material_claims,reviewer_id,assigned_by,assigned_reviewer_authorization_version,assigned_by_authorization_version,request_id,receipt_id,audit_event_id)
    SELECT $1,org_id,workspace_id,COALESCE($8,case_id),COALESCE($7,source_version_id),source_case_version,$2,$3,review_schema_version,review_sequence,material_claims,reviewer_id,assigned_by,assigned_reviewer_authorization_version,assigned_by_authorization_version,$4,$5,$6 FROM public.assess_v2_review_assignments WHERE id=$9`,[ids.review,ids.decision,decisionVersion,fixture.uuid(7230+ordinal*20),receipts[1],fixture.uuid(7231+ordinal*20),sourceVersionId,caseId,fixture.review]);
  await client.query(`INSERT INTO public.assess_v2_review_resolutions(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_id,review_schema_version,review_sequence,resolution,reviewed_confidence,conditions,rationale,reviewer_id,reviewer_authorization_version,request_id,receipt_id,audit_event_id)
    SELECT $1,org_id,workspace_id,COALESCE($9,case_id),COALESCE($8,source_version_id),source_case_version,$2,$3,$4,review_schema_version,review_sequence,resolution,reviewed_confidence,conditions,rationale,reviewer_id,reviewer_authorization_version,$5,$6,$7 FROM public.assess_v2_review_resolutions WHERE id=$10`,[ids.resolution,ids.decision,decisionVersion,ids.review,fixture.uuid(7232+ordinal*20),receipts[2],fixture.uuid(7233+ordinal*20),sourceVersionId,caseId,fixture.resolution]);
  await client.query(`INSERT INTO public.assess_v2_govern_resolutions(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_resolution_id,review_schema_version,review_sequence,actions,required_controls,rollback_requirements,monitoring_requirements,review_frequency,accountable_owner,rationale,resolver_id,resolver_authorization_version,request_id,receipt_id,audit_event_id)
    SELECT $1,org_id,workspace_id,COALESCE($9,case_id),COALESCE($8,source_version_id),source_case_version,$2,$3,$4,review_schema_version,review_sequence,actions,required_controls,rollback_requirements,monitoring_requirements,review_frequency,accountable_owner,rationale,resolver_id,resolver_authorization_version,$5,$6,$7 FROM public.assess_v2_govern_resolutions WHERE id=$10`,[ids.govern,ids.decision,decisionVersion,ids.resolution,fixture.uuid(7234+ordinal*20),receipts[3],fixture.uuid(7235+ordinal*20),sourceVersionId,caseId,fixture.govern]);
  const sourcePackage={contractVersion:'pr-b-handoff-fixture-1',ordinal};
  const packageHash=(await client.query(`SELECT public.enterprise_sha256_jsonb($1::jsonb) hash`,[JSON.stringify(sourcePackage)])).rows[0].hash;
  const handoffReceipt=fixture.uuid(7240+ordinal*20);await client.query(`INSERT INTO public.assess_command_receipts(id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at) VALUES($1,$2,$3,$4,'pr-b-fixture',$5,$6,'fixture-hash','succeeded','{}',now())`,[handoffReceipt,fixture.org,fixture.workspace,fixture.requester,`pr-b-clone-${ordinal}-handoff`,fixture.uuid(7241+ordinal*20)]);
  await client.query(`INSERT INTO public.assess_v2_studio_handoffs(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,review_resolution_id,govern_resolution_id,package,package_hash,schema_version,rule_set_version,decision_version,review_schema_version,review_sequence,handed_off_by,handoff_authorization_version,request_id,receipt_id,audit_event_id)
    SELECT $1,org_id,workspace_id,COALESCE($12,case_id),COALESCE($11,source_version_id),source_case_version,$2,$3,$4,$5::jsonb,$6,schema_version,rule_set_version,$7,review_schema_version,review_sequence,handed_off_by,handoff_authorization_version,$8,$9,$10 FROM public.assess_v2_studio_handoffs WHERE id=$13`,[ids.handoff,ids.decision,ids.resolution,ids.govern,JSON.stringify(sourcePackage),packageHash,decisionVersion,fixture.uuid(7242+ordinal*20),handoffReceipt,fixture.uuid(7243+ordinal*20),sourceVersionId,caseId,fixture.handoff]);
  return {...ids,packageHash};
};

let admin;
try{
  admin=await connect(adminUrl);
  for(const [role,attrs] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']])if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount){await admin.query(`CREATE ROLE ${role} ${attrs}`);roles.push(role)}

  const fresh=await createDatabase(admin,names.fresh);await apply(fresh,all);
  const freshTip=(await fresh.query(`SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton`)).rows[0]?.migration_tip;
  assert.equal(freshTip,currentMigrationTip);
  emit('MIGRATION-001','FRESH-PG16-CANONICAL-CHAIN','fresh-pg16',migrationContext('fresh',{migrationTip:freshTip,prBMigrationTip:'20260828120000',migrationFile:migrationName}));

  const governedTables=['studio_artifact_source_packages','studio_artifact_manual_brief_materials','studio_tenant_template_aggregates','studio_tenant_template_versions','enterprise_module_handoffs','enterprise_module_handoff_consumptions','studio_generation_staged_responses','studio_generation_recovery_events'];
  const rlsRows=(await fresh.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname`,[governedTables])).rows;
  assert.equal(rlsRows.length,governedTables.length);assert.ok(rlsRows.every(row=>row.relrowsecurity&&row.relforcerowsecurity));
  const tenantFkCount=Number((await fresh.query(`SELECT count(DISTINCT constraint_row.conrelid) n FROM pg_constraint constraint_row
    WHERE constraint_row.contype='f' AND constraint_row.connamespace='public'::regnamespace AND constraint_row.conrelid=ANY($1::regclass[])
      AND(SELECT attnum FROM pg_attribute WHERE attrelid=constraint_row.conrelid AND attname='org_id')=ANY(constraint_row.conkey)
      AND(SELECT attnum FROM pg_attribute WHERE attrelid=constraint_row.conrelid AND attname='workspace_id')=ANY(constraint_row.conkey)`,[governedTables.map(table=>`public.${table}`)])).rows[0].n);
  assert.equal(tenantFkCount,governedTables.length,'missing composite workspace/organization foreign keys');
  assert.equal((await fresh.query(`SELECT has_function_privilege('authenticated','public.studio_artifact_generation_request_v2(jsonb)','EXECUTE') allowed`)).rows[0].allowed,false);
  assert.equal((await fresh.query(`SELECT has_function_privilege('service_role','public.studio_artifact_generation_request_v2(jsonb)','EXECUTE') allowed`)).rows[0].allowed,true);
  assert.equal((await fresh.query(`SELECT has_function_privilege('authenticated','public.studio_artifact_generation_fail_v2(uuid,uuid,bigint,text)','EXECUTE') allowed`)).rows[0].allowed,false);
  assert.equal((await fresh.query(`SELECT has_function_privilege('anon','public.studio_artifact_generation_fail_v2(uuid,uuid,bigint,text)','EXECUTE') allowed`)).rows[0].allowed,false);
  assert.equal((await fresh.query(`SELECT has_function_privilege('service_role','public.studio_artifact_generation_fail_v2(uuid,uuid,bigint,text)','EXECUTE') allowed`)).rows[0].allowed,true);
  assert.equal((await fresh.query(`SELECT has_function_privilege('authenticated','public.studio_artifact_source_package_create(jsonb)','EXECUTE') allowed`)).rows[0].allowed,false);
  assert.equal((await fresh.query(`SELECT has_function_privilege('service_role','public.studio_artifact_source_package_create(jsonb)','EXECUTE') allowed`)).rows[0].allowed,true);
  assert.equal((await fresh.query(`SELECT has_function_privilege('authenticated','public.studio_artifact_manual_brief_material_retrieve(uuid,uuid,uuid)','EXECUTE') allowed`)).rows[0].allowed,false);
  assert.equal((await fresh.query(`SELECT has_function_privilege('service_role','public.studio_artifact_manual_brief_material_retrieve(uuid,uuid,uuid)','EXECUTE') allowed`)).rows[0].allowed,true);
  assert.equal((await fresh.query(`SELECT has_function_privilege('authenticated','public.enterprise_transcript_module_projection(uuid,uuid,text)','EXECUTE') allowed`)).rows[0].allowed,true);
  assert.equal((await fresh.query(`SELECT has_function_privilege('authenticated','public.studio_artifact_projection_v2(uuid,uuid,uuid)','EXECUTE') allowed`)).rows[0].allowed,true);
  assert.equal((await fresh.query(`SELECT has_function_privilege('anon','public.studio_artifact_projection_v2(uuid,uuid,uuid)','EXECUTE') allowed`)).rows[0].allowed,false);
  assert.equal((await fresh.query(`SELECT has_function_privilege('authenticated','public.studio_pr_b_handoff_binding_immutable()','EXECUTE') allowed`)).rows[0].allowed,false);
  for(const table of governedTables)assert.equal((await fresh.query(`SELECT has_table_privilege('authenticated',$1,'SELECT') OR has_table_privilege('authenticated',$1,'INSERT') OR has_table_privilege('authenticated',$1,'UPDATE') OR has_table_privilege('authenticated',$1,'DELETE') allowed`,[`public.${table}`])).rows[0].allowed,false);
  emit('MIGRATION-005','FORCED-RLS-COMPOSITE-FK-ACL','fresh-pg16-security-contract',migrationContext('fresh-security',{migrationTip:freshTip,forcedRlsTables:governedTables,compositeTenantFkCount:tenantFkCount,authenticatedProjectionOnly:true,serviceOnlyMutationRpc:true}));

  const upgrade=await createDatabase(admin,names.upgrade);await apply(upgrade,baseline);await apply(upgrade,feature);
  assert.equal((await upgrade.query(`SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton`)).rows[0]?.migration_tip,'20260828120000');
  emit('MIGRATION-002','ACCEPTED-MAIN-UPGRADE','accepted-main-upgrade',migrationContext('upgrade',{migrationTip:'20260828120000',migrationFile:migrationName}));

  const populated=await createDatabase(admin,names.populated);await apply(populated,baseline);
  const privateFixture=await createAvailablePrivateArtifactFixture(populated,'markdown',620);
  const populatedIds={handoff:'96000000-0000-4000-8000-000000000001',workPackage:'96000000-0000-4000-8000-000000000002',workPackageVersion:'96000000-0000-4000-8000-000000000003',workItem:'96000000-0000-4000-8000-000000000004',monitor:'96000000-0000-4000-8000-000000000005'};
  const acceptedStudioVersion=(await populated.query(`SELECT version,content,content_hash FROM public.studio_artifact_versions WHERE id=$1 AND artifact_id=$2`,[privateFixture.artifactVersionId,privateFixture.artifactId])).rows[0];
  const deliveryContent={contractVersion:'enterprise-delivery-package-1',studioDocumentId:privateFixture.artifactId,studioVersionId:privateFixture.artifactVersionId,assessDerived:true};
  const deliveryContentHash=(await populated.query(`SELECT public.enterprise_sha256_jsonb($1::jsonb) hash`,[JSON.stringify(deliveryContent)])).rows[0].hash;
  await populated.query(`INSERT INTO public.enterprise_studio_delivery_handoffs(id,org_id,workspace_id,studio_document_id,artifact_type,studio_version_id,studio_version,studio_content_hash,source_status,source_snapshot,status,created_by) VALUES($1,$2,$3,$4,'brd',$5,$6,$7,'approved',$8::jsonb,'approved',$9)`,[populatedIds.handoff,privateFixture.org,privateFixture.workspace,privateFixture.artifactId,privateFixture.artifactVersionId,acceptedStudioVersion.version,acceptedStudioVersion.content_hash,JSON.stringify(acceptedStudioVersion.content),privateFixture.requester]);
  await populated.query(`INSERT INTO public.enterprise_delivery_work_packages(id,org_id,workspace_id,handoff_id,current_version,status,created_by) VALUES($1,$2,$3,$4,1,'approved',$5)`,[populatedIds.workPackage,privateFixture.org,privateFixture.workspace,populatedIds.handoff,privateFixture.requester]);
  await populated.query(`INSERT INTO public.enterprise_delivery_work_package_versions(id,work_package_id,org_id,workspace_id,version,studio_document_id,artifact_type,studio_version_id,studio_version,studio_content_hash,content,content_hash,status,created_by) VALUES($1,$2,$3,$4,1,$5,'brd',$6,$7,$8,$9::jsonb,$10,'approved',$11)`,[populatedIds.workPackageVersion,populatedIds.workPackage,privateFixture.org,privateFixture.workspace,privateFixture.artifactId,privateFixture.artifactVersionId,acceptedStudioVersion.version,acceptedStudioVersion.content_hash,JSON.stringify(deliveryContent),deliveryContentHash,privateFixture.requester]);
  await populated.query(`INSERT INTO public.enterprise_delivery_work_items(id,package_version_id,org_id,workspace_id,item_type,title,description,acceptance_criteria,source_section_locator,source_document_id,source_document_version,source_document_hash,idempotency_key,created_by) VALUES($1,$2,$3,$4,'Story','Preserve accepted Assess-derived delivery','Pre-migration accepted Delivery record','[]'::jsonb,'sections.summary',$5,$6,$7,'pr-b-populated-delivery-item',$8)`,[populatedIds.workItem,populatedIds.workPackageVersion,privateFixture.org,privateFixture.workspace,privateFixture.artifactId,acceptedStudioVersion.version,acceptedStudioVersion.content_hash,privateFixture.requester]);
  const monitorHash=(await populated.query(`SELECT public.enterprise_sha256_jsonb($1::jsonb) hash`,[JSON.stringify({workPackageVersionId:populatedIds.workPackageVersion,approvedItemIds:[populatedIds.workItem],studioContentHash:acceptedStudioVersion.content_hash})])).rows[0].hash;
  await populated.query(`INSERT INTO public.enterprise_monitor_baselines(id,org_id,workspace_id,work_package_id,work_package_version_id,studio_document_id,studio_version,studio_content_hash,approved_item_ids,milestones,dependencies,blockers,risks,readiness,status,live_telemetry_connected,resource_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'[]','[]','[]','[]','review_required','approved',false,$10,$11)`,[populatedIds.monitor,privateFixture.org,privateFixture.workspace,populatedIds.workPackage,populatedIds.workPackageVersion,privateFixture.artifactId,acceptedStudioVersion.version,acceptedStudioVersion.content_hash,JSON.stringify([populatedIds.workItem]),monitorHash,privateFixture.requester]);
  const deliveryMonitorBefore=await snapshotDeliveryMonitor(populated,populatedIds);
  const before=await snapshotLegacy(populated,privateFixture);await apply(populated,feature);const after=await snapshotLegacy(populated,privateFixture);
  const deliveryMonitorAfter=await snapshotDeliveryMonitor(populated,populatedIds);assert.deepEqual(deliveryMonitorAfter,deliveryMonitorBefore);
  assert.deepEqual(after,before,'legacy canonical/private identities changed during backfill');
  const packageRows=(await populated.query(`SELECT id,artifact_id,source_mode,assess_handoff_id,assess_package_hash,package_hash,version,lineage_classification,planning_only FROM public.studio_artifact_source_packages WHERE artifact_id=$1`,[privateFixture.artifactId])).rows;
  assert.equal(packageRows.length,1);assert.equal(packageRows[0].source_mode,'assess_handoff');assert.equal(packageRows[0].version,'1');
  assert.equal(packageRows[0].package_hash,before.aggregate.source_package_hash);assert.equal(packageRows[0].assess_package_hash,before.aggregate.source_package_hash);
  const bound=(await populated.query(`SELECT source_package_id,source_package_hash,template_kind,template_version,template_hash FROM public.studio_artifact_versions WHERE id=$1`,[privateFixture.artifactVersionId])).rows[0];
  assert.equal(bound.source_package_id,packageRows[0].id);assert.equal(bound.source_package_hash,packageRows[0].package_hash);assert.equal(bound.template_kind,'system');
  const legacyVersionTrigger=(await populated.query(`SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.studio_artifact_versions'::regclass AND tgname='trg_studio_artifact_version_content_immutable'`)).rows[0];assert.equal(legacyVersionTrigger.tgenabled,'O');
  const populatedPersona={id:privateFixture.requester,capabilities:await actorCapabilities(populated,privateFixture)};
  const populatedV2=(await asAuthenticated(populated,privateFixture.requester,`SELECT public.studio_artifact_projection_v2($1,$2,$3) projection`,[privateFixture.org,privateFixture.workspace,privateFixture.artifactId])).rows[0].projection;
  assert.equal(populatedV2.contractVersion,'studio-artifact-2');assert.equal(populatedV2.ancestry.sourceMode,'assess_handoff');assert.equal(populatedV2.ancestry.caseId,before.aggregate.case_id);
  assert.equal(populatedV2.sourcePackage.id,packageRows[0].id);assert.equal(populatedV2.currentVersion.id,before.aggregate.current_version_id);assert.equal(populatedV2.currentApprovedVersion.id,before.aggregate.current_approved_version_id);
  assert.equal(JSON.stringify(populatedV2).includes('provider_instructions'),false);
  const populatedLineage={sourcePackage:{id:packageRows[0].id,hash:packageRows[0].package_hash,mode:'assess_handoff',version:1},
    template:{kind:'system',version:bound.template_version,hash:bound.template_hash},handoff:{id:before.aggregate.handoff_id},
    artifact:{id:privateFixture.artifactId,currentVersionId:before.aggregate.current_version_id,currentApprovedVersionId:before.aggregate.current_approved_version_id,renditionId:privateFixture.rendition.id}};
  emit('MIGRATION-003','POPULATED-LEGACY-BACKFILL-EXACTLY-ONCE','populated-canonical-studio',context(populatedPersona,privateFixture.org,privateFixture.workspace,{...populatedLineage,migrationScopedImmutableTrigger:{name:'trg_studio_artifact_version_content_immutable',restoredEnabled:true}}));
  emit('COMPAT-001','IDS-VERSIONS-HASHES-APPROVALS-PRIVATE-LINKS-PRESERVED','populated-canonical-private-studio',context(populatedPersona,privateFixture.org,privateFixture.workspace,{...populatedLineage,migrationScopedImmutableTrigger:{name:'trg_studio_artifact_version_content_immutable',restoredEnabled:true}}));
  emit('COMPAT-001','ACCEPTED-ASSESS-DELIVERY-MONITOR-PRESERVED','populated-delivery-monitor',context(populatedPersona,privateFixture.org,privateFixture.workspace,{...populatedLineage,delivery:{handoffId:populatedIds.handoff,workPackageId:populatedIds.workPackage,workPackageVersionId:populatedIds.workPackageVersion,workItemId:populatedIds.workItem,status:'approved'},monitor:{baselineId:populatedIds.monitor,status:'approved',liveTelemetryConnected:false},preservedExactly:true}));
  assert.match((await populated.query(`SELECT obj_description('public.document_generations'::regclass,'pg_class') comment`)).rows[0].comment,/Legacy\/unverified only/);
  assert.equal(Number((await populated.query(`SELECT count(*) n FROM information_schema.columns WHERE table_schema='public' AND table_name='document_generations' AND column_name IN('source_package_id','source_package_hash')`)).rows[0].n),0);
  emit('COMPAT-002','LEGACY-DOCUMENT-GENERATIONS-NONCANONICAL','populated-legacy-document-generations',context(populatedPersona,privateFixture.org,privateFixture.workspace,{sourcePackage:null,template:null,handoff:null,artifact:{authority:'document_generations',canonical:false,sourcePackageCount:0}}));

  const dirtyHash=await createDatabase(admin,names.dirty_hash);await apply(dirtyHash,baseline);const hashFixture=await createCommittedStudioFixture(dirtyHash);
  await dirtyHash.query(`UPDATE public.studio_artifact_aggregates SET source_package_hash=$2 WHERE id=$1`,[hashFixture.artifactId,'b'.repeat(64)]);
  await assert.rejects(apply(dirtyHash,feature),/STUDIO_PR_B_BACKFILL_REVIEW_REQUIRED/);await assertNoPrBMutation(dirtyHash);
  emit('MIGRATION-004','DIRTY-HASH-PREFLIGHT-ATOMIC','dirty-hash-ancestry',migrationContext('dirty-hash',{artifact:{id:hashFixture.artifactId},preMutationAtomic:true}));

  const dirtyMissing=await createDatabase(admin,names.dirty_missing);await apply(dirtyMissing,baseline);const missingFixture=await createCommittedStudioFixture(dirtyMissing);
  await dropAggregateForeignKeys(dirtyMissing);await dirtyMissing.query(`UPDATE public.studio_artifact_aggregates SET handoff_id=$2 WHERE id=$1`,[missingFixture.artifactId,'ffffffff-ffff-4fff-8fff-ffffffffffff']);
  await assert.rejects(apply(dirtyMissing,feature),/STUDIO_PR_B_BACKFILL_REVIEW_REQUIRED/);await assertNoPrBMutation(dirtyMissing);
  emit('MIGRATION-004','MISSING-ANCESTRY-PREFLIGHT-ATOMIC','dirty-missing-ancestry',migrationContext('dirty-missing',{artifact:{id:missingFixture.artifactId},preMutationAtomic:true}));

  const dirtyPartial=await createDatabase(admin,names.dirty_partial);await apply(dirtyPartial,baseline);await dirtyPartial.query('CREATE TABLE public.studio_artifact_source_packages(blocker integer)');
  await assert.rejects(apply(dirtyPartial,feature),/studio_artifact_source_packages/);await assertNoPrBMutation(dirtyPartial,{partialSourcePackage:true});
  emit('MIGRATION-004','PARTIAL-SCHEMA-PREFLIGHT-ATOMIC','dirty-partial-schema',migrationContext('dirty-partial',{preMutationAtomic:true}));

  const runtime=await createEnterpriseIntelligenceFixture(fresh);
  await fresh.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
    SELECT role_values.role_id,capability_values.capability
    FROM unnest($1::uuid[]) AS role_values(role_id)
    CROSS JOIN unnest($2::text[]) AS capability_values(capability)
    ON CONFLICT DO NOTHING`,[[runtime.role,runtime.routeRole],['evidence.review','transcript.sources.read','transcript.sources.manage','studio.sources.read','studio.sources.manage','studio.templates.read','studio.templates.manage','studio.templates.review','studio.templates.approve','studio.handoffs.read','studio.handoffs.request','studio.handoffs.review','studio.handoffs.approve','studio.handoffs.consume']]);
  for(const actor of [runtime.requester,runtime.reviewer,runtime.approver])runtime.authorizationVersions[actor]=Number((await fresh.query(`SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2`,[runtime.org,actor])).rows[0].version);
  await fresh.query(`INSERT INTO public.enterprise_transcript_workspace_flags(org_id,workspace_id,updated_by) VALUES($1,$2,$3) ON CONFLICT(org_id,workspace_id) DO NOTHING`,[runtime.org,runtime.workspace,runtime.requester]);
  const defaults=(await fresh.query(`SELECT studio_multisource_enabled,studio_tenant_templates_enabled,module_handoffs_enabled,direct_studio_planning_enabled FROM public.enterprise_transcript_workspace_flags WHERE org_id=$1 AND workspace_id=$2`,[runtime.org,runtime.workspace])).rows[0];
  assert.deepEqual(defaults,{studio_multisource_enabled:false,studio_tenant_templates_enabled:false,module_handoffs_enabled:false,direct_studio_planning_enabled:false});
  const defaultCounts=(await fresh.query(`SELECT (SELECT count(*) FROM public.enterprise_module_handoff_command_receipts)::int handoff_receipts,(SELECT count(*) FROM public.studio_tenant_template_command_receipts)::int template_receipts,(SELECT count(*) FROM public.studio_artifact_generation_attempts)::int generation_attempts`)).rows[0];
  const safeProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.enterprise_transcript_module_projection($1,$2,'studio') projection`,[runtime.org,runtime.workspace])).rows[0].projection;
  assert.equal(safeProjection.flags.studioMultisourceEnabled,false);assert.equal(safeProjection.flags.moduleHandoffsEnabled,false);
  assert.equal(safeProjection.sourceVersions.length,runtime.sources.filter(source=>source.parsed).length);
  assert.deepEqual(new Set(safeProjection.sourceVersions.map(source=>source.sourceVersionId)),new Set(runtime.sources.filter(source=>source.parsed).map(source=>source.sourceVersionId)));
  assert.ok(safeProjection.sourceVersions.every(source=>source.characterCount>0&&source.label.startsWith('Fixture ')));
  for(const forbidden of ['storage_path','storagePath','original_filename','originalFilename','extracted_text_hash','extractedTextHash','content_hash','contentHash'])assert.equal(JSON.stringify(safeProjection).includes(forbidden),false);
  assert.equal((await asAuthenticated(fresh,'ffffffff-ffff-4fff-8fff-ffffffffffff',`SELECT public.enterprise_transcript_module_projection($1,$2,'studio') projection`,[runtime.org,runtime.workspace])).rows[0].projection,null);
  assert.equal((await asAuthenticated(fresh,runtime.requester,`SELECT public.enterprise_transcript_module_projection($1,$2,'studio') projection`,[runtime.org,'ffffffff-ffff-4fff-8fff-ffffffffffff'])).rows[0].projection,null);
  await assert.rejects(asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_generation_request_v2('{}'::jsonb)`),/permission denied/i);
  const disabledHandoff={actorId:runtime.requester,organizationId:runtime.org,workspaceId:runtime.workspace,requestId:runtime.uuid(6900),authorizationVersion:runtime.authorizationVersions[runtime.requester],expectedVersion:0,idempotencyKey:'pr-b-default-off-handoff',commandType:'handoff.request',handoffId:runtime.uuid(6901),payload:{upstreamHandoffId:runtime.handoff,artifactType:'frd'}};
  await assert.rejects(fresh.query(`SELECT public.enterprise_assess_studio_handoff_command($1::jsonb)`,[JSON.stringify(disabledHandoff)]),/STUDIO_FEATURE_DISABLED/);
  assert.deepEqual((await fresh.query(`SELECT (SELECT count(*) FROM public.enterprise_module_handoff_command_receipts)::int handoff_receipts,(SELECT count(*) FROM public.studio_tenant_template_command_receipts)::int template_receipts,(SELECT count(*) FROM public.studio_artifact_generation_attempts)::int generation_attempts`)).rows[0],defaultCounts);
  const defaultOffEvidence={flags:defaults,readOnlyProjection:true,authenticatedMutationDenied:true,noEffectCounts:defaultCounts};
  await fresh.query(`INSERT INTO public.enterprise_transcript_workspace_flags(org_id,workspace_id,transcript_source_sets_enabled,assess_multisource_apply_enabled,unified_byok_gateway_enabled,governed_journeys_enabled,studio_multisource_enabled,studio_tenant_templates_enabled,module_handoffs_enabled,direct_studio_planning_enabled,updated_by)
   VALUES($1,$2,true,true,true,true,true,true,true,true,$3) ON CONFLICT(org_id,workspace_id) DO UPDATE SET transcript_source_sets_enabled=true,assess_multisource_apply_enabled=true,unified_byok_gateway_enabled=true,governed_journeys_enabled=true,studio_multisource_enabled=true,studio_tenant_templates_enabled=true,module_handoffs_enabled=true,direct_studio_planning_enabled=true`,[runtime.org,runtime.workspace,runtime.requester]);
  const authVersion=runtime.authorizationVersions[runtime.requester];let ordinal=1;
  const makeSet=async(owner,id,sourceVersionId,label,expected=0)=>{const receipt=await claim(fresh,runtime,'transcript.source-set.create-version',label,ordinal++);return(await fresh.query(`SELECT public.enterprise_transcript_create_source_set_version_v2($1,$2,$3,'PR B fixture','Exact source selection',$4::jsonb,true,$5,$6,$7,$8,$9,$10,$11,$12) result`,[id,owner,label,JSON.stringify([{sourceVersionId,ordinal:1,role:'primary'}]),expected,runtime.requester,runtime.org,runtime.workspace,authVersion,receipt.id,receipt.execution_token,receipt.execution_fence])).rows[0].result};
  const assessSetId=runtime.uuid(7000),studioSetId=runtime.uuid(7001);const sharedSource=runtime.sources[0].sourceVersionId;
  const assessSet=await makeSet('assess',assessSetId,sharedSource,'assess-shared');const studioSet=await makeSet('studio',studioSetId,sharedSource,'studio-shared');
  assert.notEqual(assessSet.sourceSetVersionId,studioSet.sourceSetVersionId);assert.equal(assessSet.ownerModule,'assess');assert.equal(studioSet.ownerModule,'studio');
  const runtimePersona={id:runtime.requester,capabilities:await actorCapabilities(fresh,runtime)};
  emit('SRCSET-006','INDEPENDENT-MODULE-REUSE','shared-source-independent-sets',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:null,template:null,handoff:null,artifact:null,sourceSets:{assessVersionId:assessSet.sourceSetVersionId,studioVersionId:studioSet.sourceSetVersionId,sharedSourceVersionId:sharedSource}}));
  const changedStudio=await makeSet('studio',studioSetId,runtime.sources[1].sourceVersionId,'studio-changed',1);
  assert.equal(changedStudio.version,2);assert.equal((await fresh.query(`SELECT current_version FROM public.enterprise_source_sets WHERE id=$1`,[assessSetId])).rows[0].current_version,'1');
  emit('SRCSET-004','STUDIO-MEMBERSHIP-VERSION-ISOLATION','studio-membership-change',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:null,template:null,handoff:null,artifact:null,sourceSets:{assessVersionId:assessSet.sourceSetVersionId,studioPriorVersionId:studioSet.sourceSetVersionId,studioCurrentVersionId:changedStudio.sourceSetVersionId}}));
  const beforeCross=Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_source_sets`)).rows[0].n);
  const crossReceipt=await claim(fresh,runtime,'transcript.source-set.create-version','cross-workspace',ordinal++);
  await assert.rejects(fresh.query(`SELECT public.enterprise_transcript_create_source_set_version_v2($1,'studio','Cross','PR B fixture','Exact source selection',$2::jsonb,true,0,$3,$4,$5,$6,$7,$8,$9)`,[runtime.uuid(7002),JSON.stringify([{sourceVersionId:runtime.sources[0].sourceVersionId,ordinal:1,role:'primary'}]),runtime.requester,runtime.org,'ffffffff-ffff-4fff-8fff-ffffffffffff',authVersion,crossReceipt.id,crossReceipt.execution_token,crossReceipt.execution_fence]));
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_source_sets`)).rows[0].n),beforeCross);
  emit('SRCSET-008','CROSS-WORKSPACE-NONDISCLOSURE-NO-EFFECT','cross-workspace-source-selector',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:null,template:null,handoff:null,artifact:null,sourceSets:{countBefore:beforeCross,countAfter:beforeCross}}));

  const studioBundleId=runtime.uuid(7050);const bundleReceipt=await claim(fresh,runtime,'transcript.input-bundle.lock','studio-direct-bundle',ordinal++);
  const studioBundle=(await fresh.query(`SELECT public.enterprise_transcript_lock_input_bundle_v2($1,'studio',$2::jsonb,NULL,0,$3,$4,$5,$6,$7,$8,$9) result`,[studioBundleId,JSON.stringify([{sourceSetVersionId:changedStudio.sourceSetVersionId,ordinal:1,purpose:'Synthetic direct Studio planning'}]),runtime.requester,runtime.org,runtime.workspace,authVersion,bundleReceipt.id,bundleReceipt.execution_token,bundleReceipt.execution_fence])).rows[0].result;
  const bundleProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.enterprise_transcript_module_projection($1,$2,'studio') projection`,[runtime.org,runtime.workspace])).rows[0].projection;
  const projectedBundle=bundleProjection.inputBundles.find(bundle=>bundle.inputBundleId===studioBundleId);const projectedSet=projectedBundle.sourceSetVersions[0];
  assert.equal(projectedBundle.inputBundleVersionId,studioBundle.inputBundleVersionId);assert.equal(projectedBundle.bundleHash,studioBundle.bundleHash);
  assert.equal(projectedSet.sourceSetId,studioSetId);assert.equal(projectedSet.sourceSetVersionId,changedStudio.sourceSetVersionId);assert.equal(Number(projectedSet.sourceSetVersion),2);assert.match(projectedSet.manifestHash,/^[0-9a-f]{64}$/);
  emit('SRCSET-008','STUDIO-SAFE-SOURCE-INVENTORY-BUNDLE-SELECTORS','studio-source-inventory-projection',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:null,template:null,handoff:null,artifact:null,sourceInventory:{readyVersionIds:safeProjection.sourceVersions.map(source=>source.sourceVersionId).sort(),rawTextDisclosed:false,privateLocatorDisclosed:false},inputBundle:{id:studioBundleId,versionId:studioBundle.inputBundleVersionId,version:1,hash:studioBundle.bundleHash,sourceSetId:studioSetId,sourceSetVersionId:changedStudio.sourceSetVersionId,sourceSetVersion:2,manifestHash:projectedSet.manifestHash},nonDisclosure:{unauthorized:true,crossWorkspace:true}}));
  const extractionRouteId=runtime.uuid(7040);await fresh.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by) VALUES($1,$2,$3,$4,'assess.evidence.extract','fixture-model',true,ARRAY[$5::text],1,$6,$6)`,[extractionRouteId,runtime.org,runtime.workspace,runtime.provider,runtime.routeRole,runtime.requester]);
  const exactExtractionJob=runtime.uuid(7041),exactAcceptedCandidate=runtime.uuid(7042),exactEditedCandidate=runtime.uuid(7043),wrongExtractionJob=runtime.uuid(7044),wrongJobCandidate=runtime.uuid(7045);
  const createExtraction=async(job,idempotencyKey,candidates)=>{
    await fresh.query(`INSERT INTO public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,actor_id,request_id,idempotency_key,status,approval_state) VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai','fixture-model','pr-b-extract','pr-b-1',$5,$6,$7,'running','review_required')`,[job,runtime.org,runtime.workspace,runtime.provider,runtime.requester,runtime.uuid(7046+candidates.length),idempotencyKey]);
    await fresh.query(`SELECT public.enterprise_commit_evidence_extraction($1,$2,$3,$4,$5,10,$6,'openai','fixture-model',20,10,$7::jsonb)`,[job,runtime.sources[1].sourceId,runtime.org,runtime.workspace,runtime.hash('a'),runtime.provider,JSON.stringify(candidates)]);
  };
  const candidateFixture=(id,field,value,locator)=>({id,sourceVersionId:runtime.sources[1].sourceVersionId,field,value,safeExcerpt:value,sourceLocator:locator,confidence:0.95,promptVersion:'pr-b-1',createdBy:runtime.requester});
  await createExtraction(exactExtractionJob,'pr-b-exact-extraction',[candidateFixture(exactAcceptedCandidate,'process_objective','Govern the exact accepted candidate.','normalized-text:v1:chars:0-36'),candidateFixture(exactEditedCandidate,'outcome','This edited candidate must be excluded.','normalized-text:v1:chars:37-75')]);
  const extractionReceipt=await claim(fresh,runtime,'transcript.assess.extract','exact-studio-extraction',ordinal++);
  await fresh.query(`INSERT INTO public.enterprise_transcript_extraction_bindings(id,org_id,workspace_id,job_id,receipt_id,input_bundle_version_id,input_bundle_id,bundle_hash,source_id,source_version_id,provider_route_id,provider_config_id,model,authorization_version,created_by,source_set_id,source_set_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'fixture-model',$13,$14,$15,$16)`,[runtime.uuid(7047),runtime.org,runtime.workspace,exactExtractionJob,extractionReceipt.id,studioBundle.inputBundleVersionId,studioBundleId,studioBundle.bundleHash,runtime.sources[1].sourceId,runtime.sources[1].sourceVersionId,extractionRouteId,runtime.provider,authVersion,runtime.requester,studioSetId,changedStudio.sourceSetVersionId]);
  const acceptedReviewReceipt=await claim(fresh,runtime,'transcript.assess.candidate.review','accept-exact-studio-candidate',ordinal++);
  await fresh.query(`SELECT public.enterprise_transcript_review_assess_candidate($1,1,'accepted',NULL,'Independent human acceptance','neutral',NULL,NULL,$2,$3,$4,$5,$6,$7,$8)`,[exactAcceptedCandidate,runtime.requester,runtime.org,runtime.workspace,authVersion,acceptedReviewReceipt.id,acceptedReviewReceipt.execution_token,acceptedReviewReceipt.execution_fence]);
  const editedRow=(await fresh.query(`SELECT value,excerpt_hash FROM public.enterprise_evidence_candidates WHERE id=$1`,[exactEditedCandidate])).rows[0];
  await fresh.query(`SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,'edited',$6,$7,'Synthetic edited exclusion')`,[exactEditedCandidate,runtime.org,runtime.workspace,`${editedRow.value} edited`,editedRow.excerpt_hash,runtime.reviewer,editedRow.value]);
  await createExtraction(wrongExtractionJob,'pr-b-wrong-job-extraction',[candidateFixture(wrongJobCandidate,'trigger','Accepted, but produced by the wrong extraction job.','normalized-text:v1:chars:76-128')]);
  const wrongRow=(await fresh.query(`SELECT value,excerpt_hash FROM public.enterprise_evidence_candidates WHERE id=$1`,[wrongJobCandidate])).rows[0];
  await fresh.query(`SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,'accepted',$6,$7,'Synthetic wrong-job exclusion')`,[wrongJobCandidate,runtime.org,runtime.workspace,wrongRow.value,wrongRow.excerpt_hash,runtime.reviewer,wrongRow.value]);
  const exactAnchorRow=(await fresh.query(`SELECT source_version_id,source_locator,excerpt_hash FROM public.enterprise_evidence_candidates WHERE id=$1`,[exactAcceptedCandidate])).rows[0];
  const exactStudioAnchor={sourceVersionId:exactAnchorRow.source_version_id,locator:exactAnchorRow.source_locator,anchorHash:exactAnchorRow.excerpt_hash};
  const directArtifactId=runtime.uuid(7060),directPackageId=runtime.uuid(7061);
  const directCommand={actorId:runtime.requester,organizationId:runtime.org,workspaceId:runtime.workspace,artifactId:directArtifactId,sourcePackageId:directPackageId,requestId:runtime.uuid(7062),idempotencyKey:'pr-b-source-package-direct',authorizationVersion:authVersion,payload:{sourceMode:'direct_transcript_bundle',artifactType:'frd',studioInputBundleId:studioBundleId,studioInputBundleVersionId:studioBundle.inputBundleVersionId,studioInputBundleVersion:1}};
  const directPackage=(await fresh.query(`SELECT public.studio_artifact_source_package_create($1::jsonb) result`,[JSON.stringify(directCommand)])).rows[0].result;assert.equal(directPackage.sourceMode,'direct_transcript_bundle');assert.equal(directPackage.planningOnly,true);
  const directCandidateBinding=(await fresh.query(`SELECT candidate_manifest,candidate_manifest_hash,candidate_count,anchor_manifest,anchor_manifest_hash,anchor_count FROM public.studio_artifact_source_packages WHERE id=$1`,[directPackageId])).rows[0];
  assert.equal(Number(directCandidateBinding.candidate_count),1);assert.deepEqual(directCandidateBinding.candidate_manifest.map(candidate=>candidate.candidateId),[exactAcceptedCandidate]);assert.match(directCandidateBinding.candidate_manifest_hash,/^[0-9a-f]{64}$/);assert.equal(JSON.stringify(directCandidateBinding.candidate_manifest).includes(exactEditedCandidate),false);assert.equal(JSON.stringify(directCandidateBinding.candidate_manifest).includes(wrongJobCandidate),false);
  assert.deepEqual(directCandidateBinding.anchor_manifest,[exactStudioAnchor]);assert.equal(Number(directCandidateBinding.anchor_count),1);assert.match(directCandidateBinding.anchor_manifest_hash,/^[0-9a-f]{64}$/);
  const directPreGenerationProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection;
  assert.deepEqual(Object.keys(directPreGenerationProjection).sort(),['artifactId','aggregateVersion','currentVersionId','currentApprovedVersionId','sourcePackageId','sourcePackageVersion','sourcePackageHash','sourceMode','version','lineageClassification','planningOnly','hasAssessAncestry','hasStudioTranscriptBundle','hasManualBrief','routePolicyVersion','createdAt'].sort());
  assert.equal(directPreGenerationProjection.artifactId,directArtifactId);assert.equal(Number(directPreGenerationProjection.aggregateVersion),0);assert.equal(directPreGenerationProjection.currentVersionId,null);assert.equal(directPreGenerationProjection.currentApprovedVersionId,null);
  assert.equal(directPreGenerationProjection.sourcePackageId,directPackageId);assert.equal(Number(directPreGenerationProjection.sourcePackageVersion),1);assert.equal(Number(directPreGenerationProjection.version),1);assert.equal(directPreGenerationProjection.sourcePackageHash,directPackage.sourcePackageHash);
  assert.equal(directPreGenerationProjection.sourceMode,'direct_transcript_bundle');assert.equal(directPreGenerationProjection.lineageClassification,'not_assessed');assert.equal(directPreGenerationProjection.planningOnly,true);assert.equal(directPreGenerationProjection.hasAssessAncestry,false);assert.equal(directPreGenerationProjection.hasStudioTranscriptBundle,true);assert.equal(directPreGenerationProjection.hasManualBrief,false);
  assert.equal((await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,'ffffffff-ffff-4fff-8fff-ffffffffffff',directArtifactId])).rows[0].projection,null);
  assert.equal((await asAuthenticated(fresh,'ffffffff-ffff-4fff-8fff-ffffffffffff',`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection,null);
  const directReplay=(await fresh.query(`SELECT public.studio_artifact_source_package_create($1::jsonb) result`,[JSON.stringify(directCommand)])).rows[0].result;assert.equal(directReplay.outcome,'replayed');assert.equal(directReplay.sourcePackageHash,directPackage.sourcePackageHash);
  const directPreGenerationReplayProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection;assert.deepEqual(directPreGenerationReplayProjection,directPreGenerationProjection);
  const manualArtifactId=runtime.uuid(7070),manualPackageId=runtime.uuid(7071),manualBrief='Synthetic bounded manual planning brief.';
  const manualBriefHash=(await fresh.query(`SELECT encode(public.digest(convert_to($1,'UTF8'),'sha256'),'hex') hash`,[manualBrief])).rows[0].hash;
  const manualCommand={actorId:runtime.requester,organizationId:runtime.org,workspaceId:runtime.workspace,artifactId:manualArtifactId,sourcePackageId:manualPackageId,requestId:runtime.uuid(7072),idempotencyKey:'pr-b-source-package-manual',authorizationVersion:authVersion,payload:{sourceMode:'manual_brief',artifactType:'pdd',manualBrief}};
  const manualPackage=(await fresh.query(`SELECT public.studio_artifact_source_package_create($1::jsonb) result`,[JSON.stringify(manualCommand)])).rows[0].result;assert.equal(manualPackage.sourceMode,'manual_brief');assert.equal(manualPackage.planningOnly,true);
  const manualStored=(await fresh.query(`SELECT manual_brief_hash,manual_brief FROM public.studio_artifact_manual_brief_materials WHERE source_package_id=$1`,[manualPackageId])).rows[0];assert.equal(manualStored.manual_brief_hash,manualBriefHash);assert.equal(manualStored.manual_brief,manualBrief);
  const manualCountsBeforeReplay=(await fresh.query(`SELECT (SELECT count(*) FROM public.studio_artifact_command_receipts WHERE command_type='studio.source-package.create' AND idempotency_key='pr-b-source-package-manual')::int receipts,(SELECT count(*) FROM public.studio_artifact_manual_brief_materials WHERE source_package_id=$1)::int materials`,[manualPackageId])).rows[0];
  const manualReplay=(await fresh.query(`SELECT public.studio_artifact_source_package_create($1::jsonb) result`,[JSON.stringify(manualCommand)])).rows[0].result;assert.equal(manualReplay.outcome,'replayed');assert.equal(manualReplay.sourcePackageHash,manualPackage.sourcePackageHash);
  assert.deepEqual((await fresh.query(`SELECT (SELECT count(*) FROM public.studio_artifact_command_receipts WHERE command_type='studio.source-package.create' AND idempotency_key='pr-b-source-package-manual')::int receipts,(SELECT count(*) FROM public.studio_artifact_manual_brief_materials WHERE source_package_id=$1)::int materials`,[manualPackageId])).rows[0],manualCountsBeforeReplay);
  const conflictingManualCommand={...manualCommand,requestId:runtime.uuid(7073),payload:{...manualCommand.payload,manualBrief:`${manualBrief} changed`}};
  await assert.rejects(fresh.query(`SELECT public.studio_artifact_source_package_create($1::jsonb)`,[JSON.stringify(conflictingManualCommand)]),/IDEMPOTENCY_CONFLICT/);
  assert.deepEqual((await fresh.query(`SELECT (SELECT count(*) FROM public.studio_artifact_command_receipts WHERE command_type='studio.source-package.create' AND idempotency_key='pr-b-source-package-manual')::int receipts,(SELECT count(*) FROM public.studio_artifact_manual_brief_materials WHERE source_package_id=$1)::int materials`,[manualPackageId])).rows[0],manualCountsBeforeReplay);
  const sourceCreateCountBeforeInvalid=Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_command_receipts WHERE command_type='studio.source-package.create'`)).rows[0].n);
  await assert.rejects(fresh.query(`SELECT public.studio_artifact_source_package_create($1::jsonb)`,[JSON.stringify({...directCommand,requestId:runtime.uuid(7074),idempotencyKey:'pr-b-direct-reject-manual',payload:{...directCommand.payload,manualBrief}})]),/INVALID_COMMAND/);
  await assert.rejects(fresh.query(`SELECT public.studio_artifact_source_package_create($1::jsonb)`,[JSON.stringify({...manualCommand,requestId:runtime.uuid(7075),idempotencyKey:'pr-b-manual-reject-hash',payload:{sourceMode:'manual_brief',artifactType:'pdd',manualBriefHash}})]),/INVALID_COMMAND/);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_command_receipts WHERE command_type='studio.source-package.create'`)).rows[0].n),sourceCreateCountBeforeInvalid);
  const directSystemTemplate=(await fresh.query(`SELECT * FROM public.studio_system_template_versions WHERE artifact_type='frd' AND superseded_at IS NULL`)).rows[0];const directVersionId=runtime.uuid(7080);const directContent=structuredContent('Synthetic direct planning artifact',[exactStudioAnchor],['human_authored']);
  const directContentSafety=(await fresh.query(`SELECT public.studio_pr_b_structured_artifact_content_safe($1::jsonb,package) safe,package.candidate_manifest,package.studio_input_bundle_version_id,
    public.studio_pr_b_anchor_manifest_safe(package.anchor_manifest) anchor_safe,package.anchor_manifest,
    package.anchor_manifest_hash=public.enterprise_sha256_jsonb(package.anchor_manifest) anchor_hash_safe,
    package.anchor_count=jsonb_array_length(package.anchor_manifest) anchor_count_safe
    FROM public.studio_artifact_source_packages package WHERE package.id=$2`,[JSON.stringify(directContent),directPackageId])).rows[0];
  assert.equal(directContentSafety.safe,true,JSON.stringify({directContent,...directContentSafety}));
  const invalidDirectContent={...directContent,sections:[{...directContent.sections[0],sourceAnchors:[]}]};
  await assert.rejects(fresh.query(`INSERT INTO public.studio_artifact_versions(id,artifact_id,org_id,workspace_id,version,template_id,content_schema_version,renderer_version,content,content_hash,lifecycle,author_id,author_authorization_version) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8::jsonb,public.enterprise_sha256_jsonb($8::jsonb),'draft',$9,$10)`,[runtime.uuid(7079),directArtifactId,runtime.org,runtime.workspace,directSystemTemplate.id,directSystemTemplate.content_schema_version,directSystemTemplate.renderer_version,JSON.stringify(invalidDirectContent),runtime.requester,authVersion]),/STUDIO_STRUCTURED_CONTENT_INVALID/);
  for(const [ordinalValue,driftedAnchor] of [[1,{...exactStudioAnchor,sourceVersionId:runtime.sources[0].sourceVersionId}],[2,{...exactStudioAnchor,locator:`${exactStudioAnchor.locator}:drift`}],[3,{...exactStudioAnchor,anchorHash:'f'.repeat(64)}]]){
    const driftedContent=structuredContent('Well-formed but nonmanifest anchor',[driftedAnchor],['human_authored']);
    assert.equal((await fresh.query(`SELECT public.studio_pr_b_structured_artifact_content_safe($1::jsonb,package) safe FROM public.studio_artifact_source_packages package WHERE package.id=$2`,[JSON.stringify(driftedContent),directPackageId])).rows[0].safe,false);
    await assert.rejects(fresh.query(`INSERT INTO public.studio_artifact_versions(id,artifact_id,org_id,workspace_id,version,template_id,content_schema_version,renderer_version,content,content_hash,lifecycle,author_id,author_authorization_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,public.enterprise_sha256_jsonb($9::jsonb),'draft',$10,$11)`,[runtime.uuid(7075+ordinalValue),directArtifactId,runtime.org,runtime.workspace,ordinalValue,directSystemTemplate.id,directSystemTemplate.content_schema_version,directSystemTemplate.renderer_version,JSON.stringify(driftedContent),runtime.requester,authVersion]),/STUDIO_STRUCTURED_CONTENT_INVALID/);
  }
  await fresh.query(`INSERT INTO public.studio_artifact_versions(id,artifact_id,org_id,workspace_id,version,template_id,content_schema_version,renderer_version,content,content_hash,lifecycle,author_id,author_authorization_version) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8::jsonb,public.enterprise_sha256_jsonb($8::jsonb),'draft',$9,$10)`,[directVersionId,directArtifactId,runtime.org,runtime.workspace,directSystemTemplate.id,directSystemTemplate.content_schema_version,directSystemTemplate.renderer_version,JSON.stringify(directContent),runtime.requester,authVersion]);
  await fresh.query(`UPDATE public.studio_artifact_aggregates SET current_version_id=$2,aggregate_version=1 WHERE id=$1`,[directArtifactId,directVersionId]);
  const directV2=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_projection_v2($1,$2,$3) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection;
  assert.equal(directV2.ancestry.sourceMode,'direct_transcript_bundle');assert.equal(directV2.ancestry.assessmentLabel,'not_assessed');assert.equal(directV2.ancestry.planningLabel,'planning_only');
  for(const field of ['caseId','sourceCaseVersionId','sourceCaseVersion','decisionId','decisionVersion','reviewResolutionId','governResolutionId','studioHandoffId','reviewSchemaVersion','reviewSequence'])assert.equal(directV2.ancestry[field],null);
  assert.equal(directV2.ancestry.studioInputBundleVersionId,studioBundle.inputBundleVersionId);assert.equal(directV2.sourcePackage.stale,false);assert.equal(directV2.template.templateVersionId,directSystemTemplate.id);
  const directWorkspace=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_workspace_projection_v2($1,$2,$3,0,1) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection;
  assert.equal(directWorkspace.contractVersion,'studio-workspace-2');assert.equal(directWorkspace.organizationId,runtime.org);assert.equal(directWorkspace.workspaceId,runtime.workspace);
  assert.equal(directWorkspace.artifact.id,directArtifactId);assert.equal(directWorkspace.artifact.currentVersionId,directVersionId);assert.deepEqual(directWorkspace.artifact.sections,[{id:'summary',title:'Summary',body:'Synthetic direct planning artifact',sourceAnchors:[exactStudioAnchor],labels:['human_authored']}]);
  assert.deepEqual(directWorkspace.sourcePackage,{id:directPackageId,version:1,hash:directPackage.sourcePackageHash,mode:'direct_transcript_bundle',lineageClassification:'not_assessed',planningOnly:true,inputBundle:{id:studioBundleId,versionId:studioBundle.inputBundleVersionId,version:1}});
  assert.equal(directWorkspace.selectedSources.total,1);assert.equal(directWorkspace.selectedSources.offset,0);assert.equal(directWorkspace.selectedSources.limit,1);assert.equal(directWorkspace.selectedSources.hasMore,false);assert.equal(directWorkspace.selectedSources.items.length,1);assert.equal(directWorkspace.selectedSources.items[0].sourceVersionId,exactStudioAnchor.sourceVersionId);
  assert.deepEqual(directWorkspace.coverage.selectedSourceVersionIds,[exactStudioAnchor.sourceVersionId]);assert.deepEqual(directWorkspace.coverage.coveredSourceVersionIds,[exactStudioAnchor.sourceVersionId]);assert.deepEqual(directWorkspace.coverage.uncoveredSourceVersionIds,[]);assert.equal(directWorkspace.coverage.complete,true);assert.deepEqual(directWorkspace.coverage.citations,[{sectionId:'summary',sourceVersionId:exactStudioAnchor.sourceVersionId,locator:exactStudioAnchor.locator,anchorHash:exactStudioAnchor.anchorHash}]);assert.deepEqual(directWorkspace.coverage.conflicts,[]);
  assert.deepEqual(directWorkspace.providerAvailability,{available:false,reason:'route_unavailable'});assert.deepEqual(directWorkspace.actions,['studio.artifact.draft.revise']);assert.equal(JSON.stringify(directWorkspace).includes(exactAcceptedCandidate),false);assert.equal(JSON.stringify(directWorkspace).includes('candidateProvenanceHash'),false);
  assert.equal((await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_workspace_projection_v2($1,$2,$3,0,1) projection`,[runtime.org,'ffffffff-ffff-4fff-8fff-ffffffffffff',directArtifactId])).rows[0].projection,null);
  assert.equal((await asAuthenticated(fresh,'ffffffff-ffff-4fff-8fff-ffffffffffff',`SELECT public.studio_artifact_workspace_projection_v2($1,$2,$3,0,1) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection,null);
  const summaryPage=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_summary_projection_v2($1,$2,0,1) projection`,[runtime.org,runtime.workspace])).rows[0].projection;
  assert.equal(summaryPage.contractVersion,'studio-artifact-summary-2');assert.equal(summaryPage.offset,0);assert.equal(summaryPage.limit,1);assert.ok(summaryPage.total>=1);assert.equal(summaryPage.items.length,1);
  assert.deepEqual(Object.keys(summaryPage.items[0]).sort(),['id','artifactType','aggregateVersion','lifecycle','currentVersionId','currentApprovedVersionId','sourceMode','lineageClassification','planningOnly','displayLabel','updatedAt','actions'].sort());
  assert.equal((await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_summary_projection_v2($1,$2,0,20) projection`,[runtime.org,'ffffffff-ffff-4fff-8fff-ffffffffffff'])).rows[0].projection,null);
  const deliveryCountBefore=Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_studio_delivery_handoffs`)).rows[0].n);
  const prBOnlyDeliveryGuard=Number((await upgrade.query(`SELECT count(*) n FROM pg_trigger WHERE tgrelid='public.enterprise_studio_delivery_handoffs'::regclass AND tgname='studio_pr_b_delivery_assess_handoff_only' AND NOT tgisinternal`)).rows[0].n);
  const currentChainDeliveryGuard=Number((await fresh.query(`SELECT count(*) n FROM pg_trigger WHERE tgrelid='public.enterprise_studio_delivery_handoffs'::regclass AND tgname='studio_pr_b_delivery_assess_handoff_only' AND NOT tgisinternal`)).rows[0].n);
  assert.equal(prBOnlyDeliveryGuard,1);
  assert.equal(currentChainDeliveryGuard,0);
  assert.notEqual((await fresh.query(`SELECT to_regclass('public.enterprise_delivery_source_packages') relation`)).rows[0].relation,null);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_studio_delivery_handoffs`)).rows[0].n),deliveryCountBefore);
  emit('DELIVERY-PRB-GUARD','PR-B-GUARD-RETAINED-UNTIL-PR-C-REPLACEMENT','direct-package-delivery-rejection',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:directPackageId,hash:directPackage.sourcePackageHash,mode:'direct_transcript_bundle'},template:{kind:'system',versionId:directSystemTemplate.id,version:directSystemTemplate.template_version,hash:directSystemTemplate.template_hash},handoff:null,artifact:{id:directArtifactId,versionId:directVersionId,deliveryCountBefore,deliveryCountAfter:deliveryCountBefore},compatibility:{prBOnlyGuardPresent:true,prCGeneralizedAuthorityPresent:true,legacyMutationAttempted:false}}));

  let commandOrdinal=0;
  const tenantTemplateId=runtime.uuid(7500);
  const templateCommand=async(commandType,actor,expectedVersion,payload,label,idempotencyKey=`pr-b-template-${label}`,templateId=tenantTemplateId)=>{
    const command={actorId:actor,organizationId:runtime.org,workspaceId:runtime.workspace,requestId:runtime.uuid(7510+commandOrdinal++),authorizationVersion:runtime.authorizationVersions[actor],expectedVersion,idempotencyKey,commandType,templateId:tenantTemplateId,payload};
    command.templateId=templateId;
    return{command,result:(await fresh.query(`SELECT public.studio_tenant_template_command($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result};
  };
  const unsafeTemplateCount=Number((await fresh.query(`SELECT count(*) n FROM public.studio_tenant_template_aggregates`)).rows[0].n);
  await assert.rejects(templateCommand('studio.template.create',runtime.requester,0,{name:'Unsafe','description':'Rejected','artifactClass':'brd',sectionDefinitions:[{id:'summary',title:'Summary',required:true,fieldKind:'narrative'}],fieldSchema:{providerEndpoint:'https://provider.invalid'},rendererCompatibilityVersion:'studio-json-projection-1',contentSchemaVersion:'studio-artifact-1'},'unsafe'),/INVALID_TEMPLATE_STRUCTURE/);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_tenant_template_aggregates`)).rows[0].n),unsafeTemplateCount);
  const templateCreate=await templateCommand('studio.template.create',runtime.requester,0,{name:'Governed BRD','description':'Synthetic governed tenant template','artifactClass':'brd',sectionDefinitions:[{id:'summary',title:'Summary',required:true,fieldKind:'narrative'}],fieldSchema:{title:{type:'string'},sections:{type:'array'}},rendererCompatibilityVersion:'studio-json-projection-1',contentSchemaVersion:'studio-artifact-1'},'create');
  const reviewSubmitReceiptCount=Number((await fresh.query(`SELECT count(*) n FROM public.studio_tenant_template_command_receipts`)).rows[0].n);
  await assert.rejects(templateCommand('studio.template.review.submit',runtime.requester,1,{templateId:tenantTemplateId,templateVersionId:runtime.uuid(7599)},'submit-selector-substitution'),/VERSION_CONFLICT/);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_tenant_template_command_receipts`)).rows[0].n),reviewSubmitReceiptCount);
  await templateCommand('studio.template.review.submit',runtime.requester,1,{templateId:tenantTemplateId,templateVersionId:templateCreate.result.templateVersionId},'submit');
  await templateCommand('studio.template.review.resolve',runtime.reviewer,1,{templateId:tenantTemplateId,templateVersionId:templateCreate.result.templateVersionId,outcome:'approve',rationale:'Independent synthetic review',conditions:[]},'review');
  const templateApproval=await templateCommand('studio.template.approval.resolve',runtime.approver,1,{templateId:tenantTemplateId,templateVersionId:templateCreate.result.templateVersionId,outcome:'approve',rationale:'Independent synthetic approval',conditions:[]},'approve');
  assert.equal(templateApproval.result.status,'approved');
  const approvedTemplate=(await fresh.query(`SELECT id,template_id,version,template_hash,status FROM public.studio_tenant_template_versions WHERE id=$1`,[templateApproval.result.templateVersionId])).rows[0];
  assert.equal(approvedTemplate.status,'approved');assert.equal(approvedTemplate.version,'1');
  const templateVersionCountBeforeReplay=Number((await fresh.query(`SELECT count(*) n FROM public.studio_tenant_template_versions WHERE template_id=$1`,[tenantTemplateId])).rows[0].n);
  const templateReplay=(await fresh.query(`SELECT public.studio_tenant_template_command($1::jsonb) result`,[JSON.stringify(templateCreate.command)])).rows[0].result;
  assert.equal(templateReplay.outcome,'replayed');assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_tenant_template_versions WHERE template_id=$1`,[tenantTemplateId])).rows[0].n),templateVersionCountBeforeReplay);
  const replacementTemplateId=runtime.uuid(7550);const replacementCreate=await templateCommand('studio.template.create',runtime.requester,0,{name:'Replacement BRD','description':'Synthetic approved replacement','artifactClass':'brd',sectionDefinitions:[{id:'summary',title:'Summary',required:true,fieldKind:'narrative'}],fieldSchema:{title:{type:'string'}},rendererCompatibilityVersion:'studio-json-projection-1',contentSchemaVersion:'studio-artifact-1'},'replacement-create','pr-b-template-replacement-create',replacementTemplateId);
  await templateCommand('studio.template.review.submit',runtime.requester,1,{templateId:replacementTemplateId,templateVersionId:replacementCreate.result.templateVersionId},'replacement-submit','pr-b-template-replacement-submit',replacementTemplateId);
  await templateCommand('studio.template.review.resolve',runtime.reviewer,1,{templateId:replacementTemplateId,templateVersionId:replacementCreate.result.templateVersionId,outcome:'approve',rationale:'Independent replacement review',conditions:[]},'replacement-review','pr-b-template-replacement-review',replacementTemplateId);
  const replacementApproval=await templateCommand('studio.template.approval.resolve',runtime.approver,1,{templateId:replacementTemplateId,templateVersionId:replacementCreate.result.templateVersionId,outcome:'approve',rationale:'Independent replacement approval',conditions:[]},'replacement-approve','pr-b-template-replacement-approve',replacementTemplateId);
  const replacementTemplate=(await fresh.query(`SELECT id,template_hash FROM public.studio_tenant_template_versions WHERE id=$1`,[replacementApproval.result.templateVersionId])).rows[0];
  const templateProjectionBeforeReplace=(await asAuthenticated(fresh,runtime.approver,`SELECT public.studio_tenant_template_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection;
  const projectedSystemTemplates=templateProjectionBeforeReplace.templates.filter(template=>template.ownership==='system'),projectedTenantTemplates=templateProjectionBeforeReplace.templates.filter(template=>template.ownership==='tenant');
  assert.equal(projectedSystemTemplates.length,3);assert.ok(projectedSystemTemplates.every(template=>typeof template.version==='string'&&template.version.startsWith('studio-')));assert.ok(projectedTenantTemplates.every(template=>Number.isSafeInteger(template.version)&&template.version>0));assert.equal(JSON.stringify(templateProjectionBeforeReplace).includes('providerInstructions'),false);assert.equal(JSON.stringify(templateProjectionBeforeReplace).includes('provider_instructions'),false);
  const projectedTenant=templateProjectionBeforeReplace.templates.find(template=>template.templateVersionId===approvedTemplate.id);assert.ok(projectedTenant.actions.includes('studio.generation.request'));assert.ok(projectedTenant.actions.includes('studio.template.deprecate'));
  emit('TEMPLATE-PRB-001','IMMUTABLE-THREE-PERSON-APPROVAL','tenant-template-lifecycle',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:null,template:{id:tenantTemplateId,versionId:approvedTemplate.id,version:1,hash:approvedTemplate.template_hash,status:'approved',replacementTemplateId,replacementTemplateVersionId:replacementTemplate.id,unsafeProviderAuthorityRejected:true,selectorSubstitutionRejected:true,systemCompatibilityCount:3,providerInstructionsDisclosed:false,actions:projectedTenant.actions},handoff:null,artifact:null}));

  const cloned=await cloneAssessHandoff(fresh,runtime,1);const moduleHandoffId=runtime.uuid(7600);
  const handoffCommand=async(commandType,actor,expectedVersion,payload,label,idempotencyKey=`pr-b-handoff-${label}`,handoffId=moduleHandoffId,executor=fresh)=>{
    const command={actorId:actor,organizationId:runtime.org,workspaceId:runtime.workspace,requestId:runtime.uuid(7610+commandOrdinal++),authorizationVersion:runtime.authorizationVersions[actor],expectedVersion,idempotencyKey,commandType,handoffId,payload};
    return{command,result:(await executor.query(`SELECT public.enterprise_assess_studio_handoff_command($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result};
  };
  const handoffReceiptCount=Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_module_handoff_command_receipts`)).rows[0].n);
  await assert.rejects(handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:cloned.handoff,artifactType:'brd',routePolicyVersion:999,routePolicySnapshot:{oneTimeConsumption:false}},'client-policy'),/INVALID_COMMAND/);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_module_handoff_command_receipts`)).rows[0].n),handoffReceiptCount);
  const eligibleProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.enterprise_assess_studio_handoff_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection;
  const eligibleHandoff=eligibleProjection.eligibleHandoffs.find(item=>item.upstreamHandoffId===cloned.handoff);assert.ok(eligibleHandoff);assert.deepEqual(eligibleHandoff.actions,['studio.handoff.request']);assert.equal(eligibleHandoff.direction,'inbox');
  assert.equal(JSON.stringify(eligibleProjection).includes(cloned.packageHash),false);
  const artifactCountBeforeRequest=Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_aggregates WHERE handoff_id=$1`,[cloned.handoff])).rows[0].n);
  const handoffRequest=await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:cloned.handoff,artifactType:'brd'},'request');
  assert.equal(handoffRequest.result.status,'requested');assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_aggregates WHERE handoff_id=$1`,[cloned.handoff])).rows[0].n),artifactCountBeforeRequest);
  const requesterProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.enterprise_assess_studio_handoff_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection;const requestOutbox=requesterProjection.handoffs.find(item=>item.handoffId===moduleHandoffId);
  assert.equal(requestOutbox.handoffVersionId,handoffRequest.result.handoffVersionId);assert.equal(requestOutbox.direction,'outbox');assert.equal(requestOutbox.lifecycle,'reviewer_ready');assert.equal(Number(requestOutbox.version),1);assert.ok(requestOutbox.actions.includes('studio.handoff.withdraw'));
  const reviewProjection=(await asAuthenticated(fresh,runtime.reviewer,`SELECT public.enterprise_assess_studio_handoff_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection;const reviewInbox=reviewProjection.handoffs.find(item=>item.handoffId===moduleHandoffId);assert.ok(reviewInbox.actions.includes('studio.handoff.review.resolve'));assert.equal(reviewInbox.direction,'inbox');assert.equal(reviewInbox.handoffVersionId,handoffRequest.result.handoffVersionId);
  const routePolicy=(await fresh.query(`SELECT route_policy_version,route_policy_snapshot,route_policy_hash FROM public.enterprise_module_handoffs WHERE id=$1`,[moduleHandoffId])).rows[0];
  assert.equal(routePolicy.route_policy_version,'1');assert.equal(routePolicy.route_policy_snapshot.oneTimeConsumption,true);assert.equal(routePolicy.route_policy_snapshot.independentApprovalRequired,true);assert.equal(routePolicy.route_policy_snapshot.expiryPolicy,'fixed_from_request');assert.equal(routePolicy.route_policy_snapshot.handoffTtlSeconds,604800);
  const handoffReview=await handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'approve',rationale:'Independent target review'},'review');
  const approvalProjection=(await asAuthenticated(fresh,runtime.approver,`SELECT public.enterprise_assess_studio_handoff_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection;const approvalInbox=approvalProjection.handoffs.find(item=>item.handoffId===moduleHandoffId);assert.ok(approvalInbox.actions.includes('studio.handoff.approval.resolve'));assert.equal(approvalInbox.lifecycle,'approval_ready');assert.equal(approvalInbox.handoffVersionId,handoffReview.result.handoffVersionId);
  const handoffApproval=await handoffCommand('handoff.approval.resolve',runtime.approver,2,{outcome:'approve',rationale:'Independent target approval'},'approve');
  const consumeProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.enterprise_assess_studio_handoff_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection;const approvedOutbox=consumeProjection.handoffs.find(item=>item.handoffId===moduleHandoffId);assert.ok(approvedOutbox.actions.includes('studio.handoff.consume'));assert.equal(approvedOutbox.lifecycle,'approved');assert.equal(approvedOutbox.handoffVersionId,handoffApproval.result.handoffVersionId);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_aggregates WHERE handoff_id=$1`,[cloned.handoff])).rows[0].n),artifactCountBeforeRequest);
  const handoffConsume=await handoffCommand('handoff.consume',runtime.requester,3,{},'consume');
  assert.equal(handoffConsume.result.status,'consumed');
  const consumedPackage=(await fresh.query(`SELECT id,artifact_id,package_hash,source_mode,assess_handoff_id,anchor_manifest,anchor_manifest_hash,anchor_count FROM public.studio_artifact_source_packages WHERE id=$1`,[handoffConsume.result.sourcePackageId])).rows[0];
  assert.equal(consumedPackage.source_mode,'assess_handoff');assert.equal(consumedPackage.assess_handoff_id,cloned.handoff);assert.equal(consumedPackage.package_hash,handoffConsume.result.sourcePackageHash);
  assert.deepEqual(consumedPackage.anchor_manifest,[{sourceVersionId:runtime.sourceVersion,locator:'assess:accepted-handoff',anchorHash:cloned.packageHash}]);assert.equal(Number(consumedPackage.anchor_count),1);assert.match(consumedPackage.anchor_manifest_hash,/^[0-9a-f]{64}$/);
  const consumedPreGenerationProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,consumedPackage.artifact_id])).rows[0].projection;
  assert.equal(consumedPreGenerationProjection.artifactId,consumedPackage.artifact_id);assert.equal(Number(consumedPreGenerationProjection.aggregateVersion),0);assert.equal(consumedPreGenerationProjection.currentVersionId,null);assert.equal(consumedPreGenerationProjection.currentApprovedVersionId,null);
  assert.equal(consumedPreGenerationProjection.sourcePackageId,consumedPackage.id);assert.equal(Number(consumedPreGenerationProjection.sourcePackageVersion),1);assert.equal(consumedPreGenerationProjection.sourcePackageHash,consumedPackage.package_hash);
  assert.equal(consumedPreGenerationProjection.sourceMode,'assess_handoff');assert.equal(consumedPreGenerationProjection.hasAssessAncestry,true);assert.equal(consumedPreGenerationProjection.planningOnly,false);
  const consumptionCountBeforeReplay=Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_module_handoff_consumptions WHERE handoff_id=$1`,[moduleHandoffId])).rows[0].n);
  const consumeReplay=(await fresh.query(`SELECT public.enterprise_assess_studio_handoff_command($1::jsonb) result`,[JSON.stringify(handoffConsume.command)])).rows[0].result;
  assert.equal(consumeReplay.outcome,'replayed');assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_module_handoff_consumptions WHERE handoff_id=$1`,[moduleHandoffId])).rows[0].n),consumptionCountBeforeReplay);
  const consumedPreGenerationReplayProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,consumedPackage.artifact_id])).rows[0].projection;assert.deepEqual(consumedPreGenerationReplayProjection,consumedPreGenerationProjection);
  emit('SOURCEPKG-PRB-001','PREGENERATION-SELECTORS-REPLAY-NONDISCLOSURE','direct-create-and-handoff-consume-pregeneration',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{direct:{id:directPackageId,version:1,hash:directPackage.sourcePackageHash,replayEqual:true},assess:{id:consumedPackage.id,version:1,hash:consumedPackage.package_hash,replayEqual:true}},template:null,handoff:{id:moduleHandoffId,consumed:true},artifact:{directId:directArtifactId,assessId:consumedPackage.artifact_id,aggregateVersion:0,currentVersionId:null,currentApprovedVersionId:null,capabilityDenied:true,crossWorkspaceDenied:true,rawPrivateDataDisclosed:false}}));
  emit('HANDOFF-PRB-001','SERVER-POLICY-THREE-PERSON-ONE-TIME-CONSUME','assess-studio-handoff-lifecycle',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:consumedPackage.id,hash:consumedPackage.package_hash,mode:consumedPackage.source_mode},template:null,handoff:{id:moduleHandoffId,versionId:handoffConsume.result.handoffVersionId,upstreamId:cloned.handoff,upstreamHash:cloned.packageHash,policyVersion:1,policyHash:routePolicy.route_policy_hash,expiryPolicy:'fixed_from_request',ttlSeconds:604800,status:'consumed',consumptionCount:1,eligibleBeforeRequest:true,outboxDirection:true,inboxDirection:true,clientPolicyRejected:true,serverDerivedActions:['studio.handoff.request','studio.handoff.review.resolve','studio.handoff.approval.resolve','studio.handoff.withdraw','studio.handoff.consume']},artifact:{id:consumedPackage.artifact_id}}));

  const rejectedUpstream=await cloneAssessHandoff(fresh,runtime,2),rejectedHandoffId=runtime.uuid(7620);
  await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:rejectedUpstream.handoff,artifactType:'frd'},'reject-request','pr-b-handoff-reject-request',rejectedHandoffId);
  const rejectedHandoff=await handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'reject',rationale:'Synthetic target rejection'},'reject-review','pr-b-handoff-reject-review',rejectedHandoffId);assert.equal(rejectedHandoff.result.status,'rejected');
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_aggregates WHERE handoff_id=$1`,[rejectedUpstream.handoff])).rows[0].n),0);
  const changedUpstream=await cloneAssessHandoff(fresh,runtime,3),changedHandoffId=runtime.uuid(7630);
  await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:changedUpstream.handoff,artifactType:'pdd'},'changes-request','pr-b-handoff-changes-request',changedHandoffId);
  const changesRequested=await handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'changes_requested',rationale:'Synthetic target changes requested'},'changes-review','pr-b-handoff-changes-review',changedHandoffId);assert.equal(changesRequested.result.status,'changes_requested');
  const withdrawn=await handoffCommand('handoff.withdraw',runtime.requester,2,{reason:'Synthetic withdrawal after requested changes'},'withdraw','pr-b-handoff-withdraw',changedHandoffId);assert.equal(withdrawn.result.status,'withdrawn');
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_aggregates WHERE handoff_id=$1`,[changedUpstream.handoff])).rows[0].n),0);
  const hybridCaseId=runtime.uuid(7634);
  await fresh.query('BEGIN');
  try{
    await fresh.query(`INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version,head_version_id,schema_version,rule_set_version,created_at,updated_at)
      SELECT $1,org_id,workspace_id,process_id,owner_id,status,1,$2,schema_version,rule_set_version,now(),now() FROM public.assess_v2_cases WHERE id=$3`,[hybridCaseId,exactStudioAnchor.sourceVersionId,runtime.caseId]);
    await fresh.query(`INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,description,source_kind,created_by)
      VALUES($1,$2,$3,$4,1,'Synthetic overlap source','Exact Assess and transcript source identity','create',$5)`,[exactStudioAnchor.sourceVersionId,hybridCaseId,runtime.org,runtime.workspace,runtime.requester]);
    await fresh.query('COMMIT');
  }catch(error){await fresh.query('ROLLBACK');throw error}
  const hybridUpstream=await cloneAssessHandoff(fresh,runtime,4,exactStudioAnchor.sourceVersionId,hybridCaseId),hybridHandoffId=runtime.uuid(7635);
  await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:hybridUpstream.handoff,artifactType:'brd',targetInputBundleId:studioBundleId,targetInputBundleVersionId:studioBundle.inputBundleVersionId,targetInputBundleVersion:1},'hybrid-request','pr-b-handoff-hybrid-request',hybridHandoffId);
  await handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'approve',rationale:'Independent hybrid review'},'hybrid-review','pr-b-handoff-hybrid-review',hybridHandoffId);
  await handoffCommand('handoff.approval.resolve',runtime.approver,2,{outcome:'approve',rationale:'Independent hybrid approval'},'hybrid-approve','pr-b-handoff-hybrid-approve',hybridHandoffId);
  const hybridConsume=await handoffCommand('handoff.consume',runtime.requester,3,{},'hybrid-consume','pr-b-handoff-hybrid-consume',hybridHandoffId);
  const hybridArtifactId=hybridConsume.result.resourceId,hybridPackageId=hybridConsume.result.sourcePackageId,hybridVersionId=runtime.uuid(7636);
  const hybridPackage=(await fresh.query(`SELECT anchor_manifest,anchor_manifest_hash,anchor_count FROM public.studio_artifact_source_packages WHERE id=$1`,[hybridPackageId])).rows[0];
  assert.equal(Number(hybridPackage.anchor_count),2);assert.match(hybridPackage.anchor_manifest_hash,/^[0-9a-f]{64}$/);assert.equal(new Set(hybridPackage.anchor_manifest.map(anchor=>anchor.sourceVersionId)).size,1);assert.equal(hybridPackage.anchor_manifest[0].sourceVersionId,exactStudioAnchor.sourceVersionId);assert.equal(hybridPackage.anchor_manifest[1].sourceVersionId,exactStudioAnchor.sourceVersionId);
  const hybridSystemTemplate=(await fresh.query(`SELECT * FROM public.studio_system_template_versions WHERE artifact_type='brd' AND superseded_at IS NULL`)).rows[0];const hybridContent=structuredContent('Synthetic mixed artifact',hybridPackage.anchor_manifest,['template_required']);
  await fresh.query(`INSERT INTO public.studio_artifact_versions(id,artifact_id,org_id,workspace_id,version,template_id,content_schema_version,renderer_version,content,content_hash,lifecycle,author_id,author_authorization_version) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8::jsonb,public.enterprise_sha256_jsonb($8::jsonb),'draft',$9,$10)`,[hybridVersionId,hybridArtifactId,runtime.org,runtime.workspace,hybridSystemTemplate.id,hybridSystemTemplate.content_schema_version,hybridSystemTemplate.renderer_version,JSON.stringify(hybridContent),runtime.requester,authVersion]);
  await fresh.query(`UPDATE public.studio_artifact_aggregates SET current_version_id=$2,aggregate_version=1 WHERE id=$1`,[hybridArtifactId,hybridVersionId]);
  const hybridV2=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_projection_v2($1,$2,$3) projection`,[runtime.org,runtime.workspace,hybridArtifactId])).rows[0].projection;
  const hybridWorkspace=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_workspace_projection_v2($1,$2,$3,0,20) projection`,[runtime.org,runtime.workspace,hybridArtifactId])).rows[0].projection;
  assert.equal(hybridV2.ancestry.sourceMode,'assess_plus_transcript_bundle');assert.equal(hybridV2.ancestry.assessmentLabel,'mixed');assert.equal(hybridV2.ancestry.caseId,hybridCaseId);assert.equal(hybridV2.ancestry.studioInputBundleVersionId,studioBundle.inputBundleVersionId);
  assert.equal(hybridV2.sourcePackage.stale,false);assert.equal(hybridV2.sourcePackage.studioInputBundle.sourceCount,1);assert.equal(hybridV2.sourcePackage.coverage.selectedSources,1);assert.equal(hybridV2.sourcePackage.coverage.coveredSources,1);assert.deepEqual(hybridV2.sections[0].labels,['template_required']);assert.deepEqual(hybridV2.sections[0].sourceAnchors,hybridContent.sections[0].sourceAnchors);
  assert.equal(hybridWorkspace.selectedSources.total,1);assert.equal(hybridWorkspace.selectedSources.items.length,1);assert.equal(hybridWorkspace.selectedSources.items[0].sourceVersionId,exactStudioAnchor.sourceVersionId);assert.deepEqual(hybridWorkspace.coverage.selectedSourceVersionIds,[exactStudioAnchor.sourceVersionId]);assert.equal(hybridWorkspace.artifact.sections[0].sourceAnchors.length,2);assert.equal(hybridV2.sourcePackage.coverage.selectedSources,hybridWorkspace.selectedSources.total);
  emit('SOURCEPKG-PRB-001','HYBRID-OVERLAPPING-SOURCE-SQL-DEDUPE-FINALIZE','hybrid-overlapping-source-finalize',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:hybridPackageId,mode:'assess_plus_transcript_bundle',anchorCount:2,distinctSourceVersionCount:1},template:{kind:'system',versionId:hybridSystemTemplate.id},handoff:{id:hybridHandoffId},artifact:{id:hybridArtifactId,versionId:hybridVersionId,finalized:true,artifactV2SelectedSources:1,artifactV2CoveredSources:1,workspaceSelectedSources:1,workspaceParity:true,canonicalAnchorCount:2}}));

  const staleUpstream=await cloneAssessHandoff(fresh,runtime,5),staleHandoffId=runtime.uuid(7640);
  await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:staleUpstream.handoff,artifactType:'brd',targetInputBundleId:studioBundleId,targetInputBundleVersionId:studioBundle.inputBundleVersionId,targetInputBundleVersion:1},'stale-request','pr-b-handoff-stale-request',staleHandoffId);
  await handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'approve',rationale:'Synthetic stale-path review'},'stale-review','pr-b-handoff-stale-review',staleHandoffId);
  await handoffCommand('handoff.approval.resolve',runtime.approver,2,{outcome:'approve',rationale:'Synthetic stale-path approval'},'stale-approve','pr-b-handoff-stale-approve',staleHandoffId);
  const assessWriter=await connect(urlFor(names.fresh));const studioConsumer=await connect(urlFor(names.fresh));
  const consumerPid=Number((await studioConsumer.query('SELECT pg_backend_pid() pid')).rows[0].pid);
  await assessWriter.query('BEGIN');
  await assessWriter.query(`SELECT id FROM public.assess_v2_cases WHERE id=$1 AND org_id=$2 AND workspace_id=$3 FOR UPDATE`,[runtime.caseId,runtime.org,runtime.workspace]);
  const consumePromise=handoffCommand('handoff.consume',runtime.requester,3,{},'stale-consume','pr-b-handoff-stale-consume',staleHandoffId,studioConsumer);
  let consumeWaitedOnAssessCase=false;
  for(let attemptIndex=0;attemptIndex<40&&!consumeWaitedOnAssessCase;attemptIndex++){
    await delay(25);
    consumeWaitedOnAssessCase=(await fresh.query(`SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=$1`,[consumerPid])).rows[0]?.waiting===true;
  }
  assert.equal(consumeWaitedOnAssessCase,true,'handoff consume did not serialize on the exact Assess case lock');
  const newerAcceptedUpstream=await cloneAssessHandoff(assessWriter,runtime,6);
  await assessWriter.query('COMMIT');
  const staleConsume=await consumePromise;assert.equal(staleConsume.result.status,'stale');
  const upstreamTransitionProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.enterprise_assess_studio_handoff_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection;
  assert.equal(upstreamTransitionProjection.eligibleHandoffs.some(item=>item.upstreamHandoffId===staleUpstream.handoff),false);assert.equal(upstreamTransitionProjection.eligibleHandoffs.some(item=>item.upstreamHandoffId===newerAcceptedUpstream.handoff),true);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_aggregates WHERE handoff_id=$1`,[staleUpstream.handoff])).rows[0].n),0);
  emit('HANDOFF-PRB-002','REJECT-CHANGES-WITHDRAW-STALE-NO-ARTIFACT','assess-studio-nonconsumption-lifecycle',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:null,template:null,handoff:{rejectedId:rejectedHandoffId,rejectedStatus:'rejected',changesRequestedId:changedHandoffId,withdrawnStatus:'withdrawn',staleId:staleHandoffId,staleStatus:'stale',obsoleteUpstreamId:staleUpstream.handoff,newerAcceptedUpstreamId:newerAcceptedUpstream.handoff,genuineAssessTransition:false,assessTransitionFixture:'direct-synthetic-insert-under-production-case-lock',consumeSerializedOnExactAssessCase:true},artifact:{createdCount:0}}));

  const expireHandoff=async handoffId=>{
    await fresh.query('BEGIN');
    try{await fresh.query(`ALTER TABLE public.enterprise_module_handoffs DISABLE TRIGGER studio_pr_b_handoff_binding_immutable`);await fresh.query(`UPDATE public.enterprise_module_handoffs SET requested_at=statement_timestamp()-interval '8 days',expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[handoffId]);await fresh.query(`ALTER TABLE public.enterprise_module_handoffs ENABLE TRIGGER studio_pr_b_handoff_binding_immutable`);await fresh.query('COMMIT')}catch(error){await fresh.query('ROLLBACK');throw error}
    assert.equal((await fresh.query(`SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.enterprise_module_handoffs'::regclass AND tgname='studio_pr_b_handoff_binding_immutable'`)).rows[0].tgenabled,'O');
  };
  const expiredReviewUpstream=await cloneAssessHandoff(fresh,runtime,7),expiredReviewId=runtime.uuid(7660);
  await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:expiredReviewUpstream.handoff,artifactType:'brd'},'expired-review-request','pr-b-expired-review-request',expiredReviewId);await expireHandoff(expiredReviewId);
  const expiredReviewCounts=(await fresh.query(`SELECT (SELECT count(*) FROM public.enterprise_module_handoff_versions WHERE handoff_id=$1)::int versions,(SELECT count(*) FROM public.enterprise_module_handoff_review_events WHERE handoff_id=$1)::int reviews,(SELECT count(*) FROM public.studio_artifact_aggregates WHERE handoff_id=$2)::int artifacts`,[expiredReviewId,expiredReviewUpstream.handoff])).rows[0];
  await assert.rejects(handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'approve',rationale:'Must be expired'},'expired-review','pr-b-expired-review',expiredReviewId),/HANDOFF_EXPIRED/);
  assert.deepEqual((await fresh.query(`SELECT (SELECT count(*) FROM public.enterprise_module_handoff_versions WHERE handoff_id=$1)::int versions,(SELECT count(*) FROM public.enterprise_module_handoff_review_events WHERE handoff_id=$1)::int reviews,(SELECT count(*) FROM public.studio_artifact_aggregates WHERE handoff_id=$2)::int artifacts`,[expiredReviewId,expiredReviewUpstream.handoff])).rows[0],expiredReviewCounts);
  const expiredApprovalUpstream=await cloneAssessHandoff(fresh,runtime,8),expiredApprovalId=runtime.uuid(7670);
  await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:expiredApprovalUpstream.handoff,artifactType:'frd'},'expired-approval-request','pr-b-expired-approval-request',expiredApprovalId);
  await handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'approve',rationale:'Pre-expiry review'},'expired-approval-review','pr-b-expired-approval-review',expiredApprovalId);await expireHandoff(expiredApprovalId);
  const approvalCountBeforeExpired=Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_module_handoff_approval_events WHERE handoff_id=$1`,[expiredApprovalId])).rows[0].n);
  await assert.rejects(handoffCommand('handoff.approval.resolve',runtime.approver,2,{outcome:'approve',rationale:'Must be expired'},'expired-approval','pr-b-expired-approval',expiredApprovalId),/HANDOFF_EXPIRED/);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.enterprise_module_handoff_approval_events WHERE handoff_id=$1`,[expiredApprovalId])).rows[0].n),approvalCountBeforeExpired);
  const expiredConsumeUpstream=await cloneAssessHandoff(fresh,runtime,10),expiredConsumeId=runtime.uuid(7680);
  await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:expiredConsumeUpstream.handoff,artifactType:'pdd'},'expired-consume-request','pr-b-expired-consume-request',expiredConsumeId);
  await handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'approve',rationale:'Pre-expiry review'},'expired-consume-review','pr-b-expired-consume-review',expiredConsumeId);
  await handoffCommand('handoff.approval.resolve',runtime.approver,2,{outcome:'approve',rationale:'Pre-expiry approval'},'expired-consume-approve','pr-b-expired-consume-approve',expiredConsumeId);await expireHandoff(expiredConsumeId);
  const expiredProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.enterprise_assess_studio_handoff_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection.handoffs.find(item=>item.handoffId===expiredConsumeId);
  assert.equal(expiredProjection.lifecycle,'expired');assert.deepEqual(expiredProjection.actions,[]);
  const expiredConsumeCounts=(await fresh.query(`SELECT (SELECT count(*) FROM public.enterprise_module_handoff_consumptions WHERE handoff_id=$1)::int consumptions,(SELECT count(*) FROM public.studio_artifact_aggregates WHERE handoff_id=$2)::int artifacts`,[expiredConsumeId,expiredConsumeUpstream.handoff])).rows[0];
  await assert.rejects(handoffCommand('handoff.consume',runtime.requester,3,{},'expired-consume','pr-b-expired-consume',expiredConsumeId),/HANDOFF_EXPIRED/);
  assert.deepEqual((await fresh.query(`SELECT (SELECT count(*) FROM public.enterprise_module_handoff_consumptions WHERE handoff_id=$1)::int consumptions,(SELECT count(*) FROM public.studio_artifact_aggregates WHERE handoff_id=$2)::int artifacts`,[expiredConsumeId,expiredConsumeUpstream.handoff])).rows[0],expiredConsumeCounts);
  emit('HANDOFF-PRB-003','EXPIRED-REVIEW-APPROVAL-CONSUME-NO-ARTIFACT','assess-studio-expiry-policy',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:null,template:null,handoff:{reviewExpiredId:expiredReviewId,approvalExpiredId:expiredApprovalId,consumeExpiredId:expiredConsumeId,projectionLifecycle:'expired',actions:[],ttlSeconds:604800,stableError:'HANDOFF_EXPIRED',immutableTriggerRestored:true},artifact:{createdCount:0}}));

  const generationUpstream=await cloneAssessHandoff(fresh,runtime,11),generationHandoffId=runtime.uuid(7685);
  await handoffCommand('handoff.request',runtime.requester,0,{upstreamHandoffId:generationUpstream.handoff,artifactType:'brd'},'generation-request','pr-b-handoff-generation-request',generationHandoffId);
  await handoffCommand('handoff.review.resolve',runtime.reviewer,1,{outcome:'approve',rationale:'Independent generation review'},'generation-review','pr-b-handoff-generation-review',generationHandoffId);
  await handoffCommand('handoff.approval.resolve',runtime.approver,2,{outcome:'approve',rationale:'Independent generation approval'},'generation-approve','pr-b-handoff-generation-approve',generationHandoffId);
  const generationConsume=await handoffCommand('handoff.consume',runtime.requester,3,{},'generation-consume','pr-b-handoff-generation-consume',generationHandoffId);
  const generationPackage=(await fresh.query(`SELECT id,artifact_id,package_hash,source_mode,assess_handoff_id,anchor_manifest,anchor_manifest_hash,anchor_count FROM public.studio_artifact_source_packages WHERE id=$1`,[generationConsume.result.sourcePackageId])).rows[0];
  assert.equal(generationPackage.source_mode,'assess_handoff');assert.equal(generationPackage.assess_handoff_id,generationUpstream.handoff);
  const generationPreGenerationProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,generationPackage.artifact_id])).rows[0].projection;
  assert.equal(generationPreGenerationProjection.sourcePackageId,generationPackage.id);assert.equal(generationPreGenerationProjection.sourcePackageHash,generationPackage.package_hash);

  await fresh.query(`UPDATE public.ai_provider_configs SET last_validated_at=statement_timestamp(),updated_by=$2,updated_at=statement_timestamp() WHERE id=$1`,[runtime.provider,runtime.requester]);
  const routeId=runtime.uuid(7700);await fresh.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by) VALUES($1,$2,$3,$4,'studio.document.generate','fixture-model',true,ARRAY[$5::text],1,$6,$6)`,[routeId,runtime.org,runtime.workspace,runtime.provider,runtime.routeRole,runtime.requester]);
  await fresh.query(`CREATE TEMP TABLE pr_b_gateway_effect_fixture(provider_effect_key text PRIMARY KEY,invocation_count integer NOT NULL DEFAULT 1)`);
  const manualSystemTemplate=(await fresh.query(`SELECT id,template_version,template_hash FROM public.studio_system_template_versions WHERE artifact_type='pdd' AND superseded_at IS NULL`)).rows[0];
  const manualVersionId=runtime.uuid(7690),manualContent=structuredContent('Synthetic manual planning artifact',[],['assumption']);
  await fresh.query(`INSERT INTO public.studio_artifact_versions(id,artifact_id,org_id,workspace_id,version,template_id,content_schema_version,renderer_version,content,content_hash,lifecycle,author_id,author_authorization_version) SELECT $1,$2,$3,$4,1,template.id,template.content_schema_version,template.renderer_version,$5::jsonb,public.enterprise_sha256_jsonb($5::jsonb),'draft',$6,$7 FROM public.studio_system_template_versions template WHERE template.id=$8`,[manualVersionId,manualArtifactId,runtime.org,runtime.workspace,JSON.stringify(manualContent),runtime.requester,authVersion,manualSystemTemplate.id]);
  await fresh.query(`UPDATE public.studio_artifact_aggregates SET current_version_id=$2,aggregate_version=1 WHERE id=$1`,[manualArtifactId,manualVersionId]);
  const manualV2=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_projection_v2($1,$2,$3) projection`,[runtime.org,runtime.workspace,manualArtifactId])).rows[0].projection;
  const manualWorkspaceV2=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_workspace_projection_v2($1,$2,$3,0,20) projection`,[runtime.org,runtime.workspace,manualArtifactId])).rows[0].projection;
  assert.equal(manualV2.ancestry.sourceMode,'manual_brief');assert.equal(manualV2.ancestry.caseId,null);assert.equal(manualV2.sourcePackage.manualBriefPresent,true);assert.equal(manualV2.sourcePackage.stale,false);assert.equal(manualV2.sourcePackage.coverage.selectedSources,0);assert.equal(manualV2.sourcePackage.coverage.coveredSources,0);assert.deepEqual(manualV2.sections[0].labels,['assumption']);assert.equal(JSON.stringify(manualV2).includes(manualBrief),false);assert.equal(JSON.stringify(manualV2).includes(manualBriefHash),false);
  assert.equal(manualWorkspaceV2.selectedSources.total,0);assert.deepEqual(manualWorkspaceV2.selectedSources.items,[]);assert.deepEqual(manualWorkspaceV2.coverage.selectedSourceVersionIds,[]);assert.deepEqual(manualWorkspaceV2.coverage.coveredSourceVersionIds,[]);assert.equal(manualV2.sourcePackage.coverage.selectedSources,manualWorkspaceV2.selectedSources.total);assert.equal(manualV2.sourcePackage.coverage.coveredSources,manualWorkspaceV2.coverage.coveredSourceVersionIds.length);
  const manualHead=(await fresh.query(`SELECT aggregate_version,current_version_id,current_approved_version_id,source_package_id FROM public.studio_artifact_aggregates WHERE id=$1`,[manualArtifactId])).rows[0];
  const manualGenerationCommand={actorId:runtime.requester,organizationId:runtime.org,workspaceId:runtime.workspace,requestId:runtime.uuid(7701),idempotencyKey:'pr-b-generation-manual-recovery',authorizationVersion:runtime.authorizationVersions[runtime.requester],artifactId:manualArtifactId,sourcePackageId:manualHead.source_package_id,templateKind:'system',templateVersionId:manualSystemTemplate.id,expectedAggregateVersion:Number(manualHead.aggregate_version),expectedCurrentVersionId:manualHead.current_version_id,expectedApprovedVersionId:manualHead.current_approved_version_id};
  const manualGeneration=(await fresh.query(`SELECT public.studio_artifact_generation_request_v2($1::jsonb) result`,[JSON.stringify(manualGenerationCommand)])).rows[0].result;
  assert.equal(JSON.stringify(manualGeneration.generationPlan).includes(manualBrief),false);
  const manualToken=runtime.uuid(7702);const manualClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[manualGeneration.attemptId,manualToken])).rows[0].result;assert.equal(manualClaim.providerAllowed,true);
  const studioBudgetArgs=[runtime.requester,runtime.org,runtime.workspace,authVersion,manualGeneration.receiptId,manualGeneration.attemptId,manualToken,manualClaim.executionFence,routeId,runtime.provider,'openai','studio.document.generate','fixture-model'];
  const studioBudget=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,studioBudgetArgs)).rows[0].result;
  assert.equal(studioBudget.state,'reserved');assert.equal(studioBudget.ownsProviderEffect,true);assert.equal(studioBudget.replayed,false);assert.equal(Number(studioBudget.reservedTokens),200);
  const studioBudgetRow=(await fresh.query(`SELECT authority_kind,receipt_id,job_id,studio_receipt_id,studio_attempt_id,execution_token,execution_fence,provider,capability,model,state FROM public.enterprise_ai_budget_reservations WHERE id=$1`,[studioBudget.reservationId])).rows[0];
  assert.deepEqual(studioBudgetRow,{authority_kind:'studio',receipt_id:null,job_id:null,studio_receipt_id:manualGeneration.receiptId,studio_attempt_id:manualGeneration.attemptId,execution_token:manualToken,execution_fence:String(manualClaim.executionFence),provider:'openai',capability:'studio.document.generate',model:'fixture-model',state:'reserved'});
  const studioBudgetReplay=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,studioBudgetArgs)).rows[0].result;assert.equal(studioBudgetReplay.reservationId,studioBudget.reservationId);assert.equal(studioBudgetReplay.ownsProviderEffect,false);assert.equal(studioBudgetReplay.replayed,true);
  const wrongStudioBudgetArgs=[...studioBudgetArgs];wrongStudioBudgetArgs[4]=runtime.uuid(7703);const wrongStudioBudget=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,wrongStudioBudgetArgs)).rows[0].result;assert.equal(wrongStudioBudget.errorCode,'PROVIDER_ROUTE_STALE');
  const wrongAttemptBudgetArgs=[...studioBudgetArgs];wrongAttemptBudgetArgs[5]=runtime.uuid(7704);assert.equal((await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,wrongAttemptBudgetArgs)).rows[0].result.errorCode,'PROVIDER_ROUTE_STALE');
  const wrongFenceBudgetArgs=[...studioBudgetArgs];wrongFenceBudgetArgs[7]=Number(manualClaim.executionFence)+1;assert.equal((await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,wrongFenceBudgetArgs)).rows[0].result.errorCode,'PROVIDER_ROUTE_STALE');
  const settledStudioBudget=(await fresh.query(`SELECT public.studio_artifact_settle_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,80,20,100) result`,[...studioBudgetArgs,studioBudget.reservationId])).rows[0].result;assert.equal(settledStudioBudget.state,'settled');assert.equal(settledStudioBudget.totalTokens,100);assert.equal((await fresh.query(`SELECT state FROM public.enterprise_ai_budget_reservations WHERE id=$1`,[studioBudget.reservationId])).rows[0].state,'settled');
  const recoveredManual=(await fresh.query(`SELECT public.studio_artifact_manual_brief_material_retrieve($1,$2,$3) result`,[runtime.org,runtime.workspace,manualPackageId])).rows[0].result;
  assert.deepEqual(recoveredManual,{sourcePackageId:manualPackageId,manualBrief,manualBriefHash});
  const recoveredManualReplay=(await fresh.query(`SELECT public.studio_artifact_manual_brief_material_retrieve($1,$2,$3) result`,[runtime.org,runtime.workspace,manualPackageId])).rows[0].result;assert.deepEqual(recoveredManualReplay,recoveredManual);
  assert.equal((await fresh.query(`SELECT public.studio_artifact_manual_brief_material_retrieve($1,$2,$3) result`,['ffffffff-ffff-4fff-8fff-ffffffffffff',runtime.workspace,manualPackageId])).rows[0].result,null);
  const manualLeakCheck=(await fresh.query(`SELECT strpos(to_jsonb(attempt)::text,$2) attempt_leak,
    (SELECT count(*)::int FROM public.privileged_audit_events WHERE strpos(metadata::text,$2)>0) audit_leaks
    FROM public.studio_artifact_generation_attempts attempt WHERE attempt.id=$1`,[manualGeneration.attemptId,manualBrief])).rows[0];
  assert.equal(manualLeakCheck.attempt_leak,0);assert.equal(manualLeakCheck.audit_leaks,0);
  const manualProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,manualArtifactId])).rows[0].projection;
  assert.equal(manualProjection.hasManualBrief,true);assert.equal(JSON.stringify(manualProjection).includes(manualBrief),false);assert.equal(JSON.stringify(manualProjection).includes(manualBriefHash),false);
  const manualReceipt=(await fresh.query(`SELECT command_type,status,response FROM public.studio_artifact_command_receipts WHERE id=$1`,[manualPackage.receiptId])).rows[0];assert.equal(manualReceipt.command_type,'studio.source-package.create');assert.equal(manualReceipt.status,'committed');assert.equal(JSON.stringify(manualReceipt.response).includes(manualBrief),false);
  await fresh.query(`UPDATE public.studio_artifact_generation_attempts SET timeout_at=statement_timestamp()-interval '1 second',execution_lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[manualGeneration.attemptId]);
  const settledTimeoutBefore=(await fresh.query(`SELECT state,failure_code,completed_at FROM public.studio_artifact_generation_attempts WHERE id=$1`,[manualGeneration.attemptId])).rows[0];
  await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_timeout_v2($1)`,[manualGeneration.attemptId]),/GENERATION_RECONCILIATION_REQUIRED/);
  assert.deepEqual((await fresh.query(`SELECT state,failure_code,completed_at FROM public.studio_artifact_generation_attempts WHERE id=$1`,[manualGeneration.attemptId])).rows[0],settledTimeoutBefore);
  const manualReconcileToken=runtime.uuid(7705);const manualReconcileClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[manualGeneration.attemptId,manualReconcileToken])).rows[0].result;
  assert.equal(manualReconcileClaim.providerAllowed,false);assert.equal(manualReconcileClaim.reconcileOnly,true);assert.equal((await fresh.query(`SELECT state FROM public.studio_artifact_generation_attempts WHERE id=$1`,[manualGeneration.attemptId])).rows[0].state,'reconciling');
  emit('SOURCEPKG-PRB-001','DIRECT-MANUAL-EXCLUSIVE-UNION-REPLAY','direct-and-manual-planning-packages',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{direct:{id:directPackageId,hash:directPackage.sourcePackageHash,bundleVersionId:studioBundle.inputBundleVersionId,classification:'not_assessed',planningOnly:true},manual:{id:manualPackageId,hash:manualPackage.sourcePackageHash,manualBriefHash,classification:'not_assessed',planningOnly:true,receiptCommandType:manualReceipt.command_type,idempotentReplay:true,idempotencyConflictRejected:true,serverHashDerived:true,rawProjectionDisclosed:false,recoveryAfterClaim:true,artifactV2SelectedSources:0,artifactV2CoveredSources:0,workspaceSelectedSources:0,workspaceCoveredSources:0,workspaceParity:true}},template:{kind:'system',versionId:manualSystemTemplate.id,version:manualSystemTemplate.template_version,hash:manualSystemTemplate.template_hash},handoff:null,artifact:{directId:directArtifactId,manualId:manualArtifactId,manualAttemptId:manualGeneration.attemptId,manualAttemptState:'reconciling',settledReservationTimeoutRejected:true,secondProviderEffectAuthority:false}}));
  const generationArtifactId=generationPackage.artifact_id;
  const generationRequest=async(templateKind,templateVersionId,label)=>{
    const selectors=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,generationArtifactId])).rows[0].projection;
    assert.ok(selectors);assert.equal(selectors.artifactId,generationArtifactId);assert.equal(selectors.sourcePackageHash,generationPackage.package_hash);
    const command={actorId:runtime.requester,organizationId:runtime.org,workspaceId:runtime.workspace,requestId:runtime.uuid(7710+commandOrdinal++),idempotencyKey:`pr-b-generation-${label}`,authorizationVersion:runtime.authorizationVersions[runtime.requester],artifactId:selectors.artifactId,sourcePackageId:selectors.sourcePackageId,templateKind,templateVersionId,expectedAggregateVersion:Number(selectors.aggregateVersion),expectedCurrentVersionId:selectors.currentVersionId,expectedApprovedVersionId:selectors.currentApprovedVersionId};
    return{command,selectors,result:(await fresh.query(`SELECT public.studio_artifact_generation_request_v2($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result};
  };
  const gatewayEffect=async key=>fresh.query(`INSERT INTO pr_b_gateway_effect_fixture(provider_effect_key) VALUES($1) ON CONFLICT DO NOTHING`,[key]);
  const assessedAnchor=generationPackage.anchor_manifest[0];
  const driftedAssessAnchors=[{...assessedAnchor,sourceVersionId:exactStudioAnchor.sourceVersionId},{...assessedAnchor,locator:`${assessedAnchor.locator}:drift`},{...assessedAnchor,anchorHash:'f'.repeat(64)}];
  for(let driftIndex=0;driftIndex<driftedAssessAnchors.length;driftIndex++){
    let wrongAnchorAttemptId=null;
    await fresh.query('BEGIN');
    try{
      const selectors=generationPreGenerationProjection;const wrongAnchorToken=runtime.uuid(7780+driftIndex);
      const wrongAnchorCommand={actorId:runtime.requester,organizationId:runtime.org,workspaceId:runtime.workspace,requestId:runtime.uuid(7710+commandOrdinal++),idempotencyKey:`pr-b-generation-assess-anchor-drift-${driftIndex}`,authorizationVersion:runtime.authorizationVersions[runtime.requester],artifactId:selectors.artifactId,sourcePackageId:selectors.sourcePackageId,templateKind:'tenant',templateVersionId:approvedTemplate.id,expectedAggregateVersion:Number(selectors.aggregateVersion),expectedCurrentVersionId:selectors.currentVersionId,expectedApprovedVersionId:selectors.currentApprovedVersionId};
      const wrongAnchorGeneration=(await fresh.query(`SELECT public.studio_artifact_generation_request_v2($1::jsonb) result`,[JSON.stringify(wrongAnchorCommand)])).rows[0].result;wrongAnchorAttemptId=wrongAnchorGeneration.attemptId;
      const wrongAnchorClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[wrongAnchorAttemptId,wrongAnchorToken])).rows[0].result;
      await fresh.query(`SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,$4,$5::jsonb)`,[wrongAnchorAttemptId,wrongAnchorToken,wrongAnchorClaim.executionFence,`synthetic-wrong-assess-anchor-${driftIndex}`,JSON.stringify(structuredContent('Well-formed but nonmanifest Assess anchor',[driftedAssessAnchors[driftIndex]],['template_required']))]);
      await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) result`,[wrongAnchorAttemptId,wrongAnchorToken,wrongAnchorClaim.executionFence]),/STUDIO_STRUCTURED_CONTENT_INVALID/);
    }finally{await fresh.query('ROLLBACK')}
    assert.ok(wrongAnchorAttemptId);assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_generation_attempts WHERE id=$1`,[wrongAnchorAttemptId])).rows[0].n),0);assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_versions WHERE generation_attempt_id=$1`,[wrongAnchorAttemptId])).rows[0].n),0);
  }
  const generationA=await generationRequest('tenant',approvedTemplate.id,'before-provider-loss');
  assert.deepEqual(generationA.selectors,generationPreGenerationProjection);assert.equal(generationA.result.generationPlan.sourcePackageId,generationPreGenerationProjection.sourcePackageId);assert.equal(generationA.result.generationPlan.sourcePackageHash,generationPreGenerationProjection.sourcePackageHash);
  emit('SOURCEPKG-PRB-001','PREGENERATION-FIRST-GENERATION-BINDING','handoff-consume-first-generation',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:generationA.selectors.sourcePackageId,version:Number(generationA.selectors.sourcePackageVersion),hash:generationA.selectors.sourcePackageHash,projectionBound:true},template:{kind:'tenant',versionId:approvedTemplate.id,version:1,hash:approvedTemplate.template_hash},handoff:{id:generationHandoffId,status:'consumed'},artifact:{id:generationA.selectors.artifactId,aggregateVersion:Number(generationA.selectors.aggregateVersion),currentVersionId:generationA.selectors.currentVersionId,currentApprovedVersionId:generationA.selectors.currentApprovedVersionId,attemptId:generationA.result.attemptId,serverPlanHashBound:true}}));
  const attemptsBeforeReplay=Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_generation_attempts WHERE artifact_id=$1`,[generationArtifactId])).rows[0].n);
  const generationRequestReplay=(await fresh.query(`SELECT public.studio_artifact_generation_request_v2($1::jsonb) result`,[JSON.stringify(generationA.command)])).rows[0].result;
  assert.equal(generationRequestReplay.outcome,'replayed');assert.equal(generationRequestReplay.attemptId,generationA.result.attemptId);assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_generation_attempts WHERE artifact_id=$1`,[generationArtifactId])).rows[0].n),attemptsBeforeReplay);
  const tokenA=runtime.uuid(7720);const claimA=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationA.result.attemptId,tokenA])).rows[0].result;
  assert.equal(claimA.providerAllowed,true);await gatewayEffect(claimA.providerEffectKey);
  const claimARetry=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationA.result.attemptId,tokenA])).rows[0].result;
  assert.equal(claimARetry.providerAllowed,true);assert.equal(claimARetry.providerEffectKey,claimA.providerEffectKey);await gatewayEffect(claimARetry.providerEffectKey);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM pr_b_gateway_effect_fixture WHERE provider_effect_key=$1`,[claimA.providerEffectKey])).rows[0].n),1);
  await fresh.query(`SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,'synthetic-operation-a',$4::jsonb)`,[generationA.result.attemptId,tokenA,claimA.executionFence,JSON.stringify(structuredContent('Recovered before provider response',[assessedAnchor],['template_required']))]);
  const finalizedA=(await fresh.query(`SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) result`,[generationA.result.attemptId,tokenA,claimA.executionFence])).rows[0].result;assert.equal(finalizedA.stale,false);
  const assessedV2=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_projection_v2($1,$2,$3) projection`,[runtime.org,runtime.workspace,generationArtifactId])).rows[0].projection;
  assert.deepEqual(Object.keys(assessedV2).sort(),['aggregateVersion','ancestry','approval','artifactType','assessmentLabel','contractVersion','currentApprovedVersion','currentVersion','id','lifecycle','planningLabel','readOnly','review','sections','sourcePackage','template','versions'].sort());
  assert.deepEqual(Object.keys(assessedV2.ancestry).sort(),['assessmentLabel','caseId','contractVersion','decisionId','decisionVersion','governResolutionId','organizationId','planningLabel','reviewResolutionId','reviewSchemaVersion','reviewSequence','ruleSetVersion','sourceCaseVersion','sourceCaseVersionId','sourceMode','sourcePackageHash','sourcePackageId','sourcePackageVersion','sourceSchemaVersion','studioHandoffId','studioInputBundleId','studioInputBundleVersion','studioInputBundleVersionId','workspaceId'].sort());
  assert.equal(assessedV2.ancestry.sourceMode,'assess_handoff');assert.equal(assessedV2.ancestry.caseId,runtime.caseId);assert.equal(assessedV2.ancestry.studioInputBundleId,null);assert.equal(assessedV2.sourcePackage.assessHandoff.status,'consumed');
  assert.equal(assessedV2.template.ownership,'tenant');assert.equal(assessedV2.template.templateVersionId,approvedTemplate.id);assert.equal(assessedV2.template.templateHash,approvedTemplate.template_hash);assert.equal(JSON.stringify(assessedV2).includes('provider_instructions'),false);
  assert.equal((await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_projection_v2($1,$2,$3) projection`,[runtime.org,'ffffffff-ffff-4fff-8fff-ffffffffffff',generationArtifactId])).rows[0].projection,null);
  assert.equal((await asAuthenticated(fresh,'ffffffff-ffff-4fff-8fff-ffffffffffff',`SELECT public.studio_artifact_projection_v2($1,$2,$3) projection`,[runtime.org,runtime.workspace,generationArtifactId])).rows[0].projection,null);
  emit('CONTRACT-PRB-002','POSTGRES-V2-MODE-PARITY-NONDISCLOSURE','studio-artifact-v2-projections',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{assessed:{id:generationPackage.id,artifactId:generationArtifactId},mixed:{id:hybridPackageId,artifactId:hybridArtifactId},direct:{id:directPackageId,artifactId:directArtifactId},manual:{id:manualPackageId,artifactId:manualArtifactId},rawManualBriefDisclosed:false},template:{tenantVersionId:approvedTemplate.id,systemDirectVersionId:directSystemTemplate.id,systemManualVersionId:manualSystemTemplate.id,providerInstructionsDisclosed:false},handoff:{id:generationHandoffId,hybridId:hybridHandoffId},artifact:{contractVersion:'studio-artifact-2',assessedId:generationArtifactId,mixedId:hybridArtifactId,directId:directArtifactId,manualId:manualArtifactId,truthfulDiscriminatedAncestry:true,unauthorizedNonDisclosure:true,crossWorkspaceNonDisclosure:true,legacyProjectionUnchanged:true}}));
  emit('STUDIO-TR-009','IDEMP-002-B','response-loss-before-provider',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:generationPackage.id,hash:generationPackage.package_hash},template:{kind:'tenant',versionId:approvedTemplate.id,version:1,hash:approvedTemplate.template_hash},handoff:{id:generationHandoffId},artifact:{id:generationArtifactId,attemptId:generationA.result.attemptId,versionId:finalizedA.versionId,providerEffectKey:claimA.providerEffectKey,gatewayEffectCount:1,responseLoss:'before_provider',stale:false}}));

  const generationB=await generationRequest('tenant',approvedTemplate.id,'after-stage-loss');const tokenB1=runtime.uuid(7730);
  const claimB1=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationB.result.attemptId,tokenB1])).rows[0].result;await gatewayEffect(claimB1.providerEffectKey);
  await fresh.query(`SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,'synthetic-operation-b',$4::jsonb)`,[generationB.result.attemptId,tokenB1,claimB1.executionFence,JSON.stringify(structuredContent('Recovered staged response',[assessedAnchor],['template_required']))]);
  const postEffectFailureSnapshot=async()=>(await fresh.query(`SELECT jsonb_build_object('state',attempt.state,'failureCode',attempt.failure_code,'executionToken',attempt.execution_token,'executionFence',attempt.execution_fence,'leaseExpiresAt',attempt.execution_lease_expires_at,'responseHash',attempt.response_hash,'completedAt',attempt.completed_at) attempt,
    (SELECT jsonb_build_object('id',staged.id,'executionToken',staged.execution_token,'executionFence',staged.execution_fence,'responseHash',staged.response_hash,'providerOperationId',staged.provider_operation_id) FROM public.studio_generation_staged_responses staged WHERE staged.attempt_id=attempt.id) staged,
    (SELECT count(*)::int FROM public.privileged_audit_events WHERE action='studio.artifact.generation.fail.v2' AND resource_id=attempt.id) audits,
    (SELECT count(*)::int FROM public.studio_generation_recovery_events WHERE attempt_id=attempt.id) recoveries
    FROM public.studio_artifact_generation_attempts attempt WHERE attempt.id=$1`,[generationB.result.attemptId])).rows[0];
  const beforeResponseStagedFailure=await postEffectFailureSnapshot();
  await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'GENERATION_COMPLETION_CONFLICT')`,[generationB.result.attemptId,tokenB1,claimB1.executionFence]),/VERSION_CONFLICT/);
  assert.deepEqual(await postEffectFailureSnapshot(),beforeResponseStagedFailure);
  const tokenB2=runtime.uuid(7731);const claimB2=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationB.result.attemptId,tokenB2])).rows[0].result;
  assert.equal(claimB2.providerAllowed,false);assert.equal(claimB2.reconcileOnly,true);assert.ok(Number(claimB2.executionFence)>Number(claimB1.executionFence));
  const beforeReconcilingFailure=await postEffectFailureSnapshot();
  await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'GENERATION_COMPLETION_CONFLICT')`,[generationB.result.attemptId,tokenB2,claimB2.executionFence]),/VERSION_CONFLICT/);
  assert.deepEqual(await postEffectFailureSnapshot(),beforeReconcilingFailure);
  const finalizedB=(await fresh.query(`SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) result`,[generationB.result.attemptId,tokenB2,claimB2.executionFence])).rows[0].result;assert.equal(finalizedB.stale,false);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM pr_b_gateway_effect_fixture WHERE provider_effect_key=$1`,[claimB1.providerEffectKey])).rows[0].n),1);
  emit('STUDIO-TR-009','IDEMP-002-B','response-loss-after-stage',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:generationPackage.id,hash:generationPackage.package_hash},template:{kind:'tenant',versionId:approvedTemplate.id,version:1,hash:approvedTemplate.template_hash},handoff:{id:generationHandoffId},artifact:{id:generationArtifactId,attemptId:generationB.result.attemptId,versionId:finalizedB.versionId,providerEffectKey:claimB1.providerEffectKey,gatewayEffectCount:1,responseLoss:'after_stage',reconciledFence:claimB2.executionFence,responseStagedFailureRejected:true,reconcilingFailureRejected:true,stagedResponsePreserved:true,stale:false}}));

  const generationC=await generationRequest('tenant',approvedTemplate.id,'template-stale');const tokenC=runtime.uuid(7740);
  const claimC=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationC.result.attemptId,tokenC])).rows[0].result;await gatewayEffect(claimC.providerEffectKey);
  await fresh.query(`SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,'synthetic-operation-c',$4::jsonb)`,[generationC.result.attemptId,tokenC,claimC.executionFence,JSON.stringify(structuredContent('Must remain stale history',[assessedAnchor],['template_required']))]);
  await templateCommand('studio.template.replace',runtime.approver,1,{templateId:tenantTemplateId,templateVersionId:approvedTemplate.id,replacementTemplateId,replacementTemplateVersionId:replacementTemplate.id,rationale:'Synthetic later approved replacement'},'replace');
  const headsBeforeStale=(await fresh.query(`SELECT aggregate_version,current_version_id,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1`,[generationArtifactId])).rows[0];
  const finalizedC=(await fresh.query(`SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) result`,[generationC.result.attemptId,tokenC,claimC.executionFence])).rows[0].result;assert.equal(finalizedC.stale,true);
  const headsAfterStale=(await fresh.query(`SELECT aggregate_version,current_version_id,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1`,[generationArtifactId])).rows[0];assert.deepEqual(headsAfterStale,headsBeforeStale);
  const staleVersion=(await fresh.query(`SELECT source_package_id,source_package_hash,template_kind,tenant_template_version_id,template_version,template_hash,is_stale_completion FROM public.studio_artifact_versions WHERE id=$1`,[finalizedC.versionId])).rows[0];
  assert.equal(staleVersion.is_stale_completion,true);assert.equal(staleVersion.tenant_template_version_id,approvedTemplate.id);assert.equal(staleVersion.template_hash,approvedTemplate.template_hash);
  const templateProjectionAfterReplace=(await asAuthenticated(fresh,runtime.approver,`SELECT public.studio_tenant_template_projection($1,$2) projection`,[runtime.org,runtime.workspace])).rows[0].projection;const replacedProjection=templateProjectionAfterReplace.templates.find(template=>template.templateVersionId===approvedTemplate.id);assert.equal(replacedProjection.lifecycle,'replaced');assert.equal(replacedProjection.replacement.templateVersionId,replacementTemplate.id);
  emit('STUDIO-TR-009','IDEMP-002-B','template-change-stale-completion',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:staleVersion.source_package_id,hash:staleVersion.source_package_hash},template:{kind:staleVersion.template_kind,versionId:staleVersion.tenant_template_version_id,version:Number(staleVersion.template_version),hash:staleVersion.template_hash,stateAtFinalize:'replaced',replacementVersionId:replacementTemplate.id,replacementHash:replacementTemplate.template_hash},handoff:{id:generationHandoffId},artifact:{id:generationArtifactId,attemptId:generationC.result.attemptId,versionId:finalizedC.versionId,currentVersionId:headsAfterStale.current_version_id,currentApprovedVersionId:headsAfterStale.current_approved_version_id,stale:true,headsRewritten:false}}));

  const systemTemplate=(await fresh.query(`SELECT id,template_version,template_hash FROM public.studio_system_template_versions WHERE artifact_type='brd' AND superseded_at IS NULL`)).rows[0];
  let sourceRaceOrdinal=0;
  const expectedRaceRejection=async(queryOperation,pattern)=>{
    const savepoint=`source_race_${sourceRaceOrdinal++}`;await fresh.query(`SAVEPOINT ${savepoint}`);
    await assert.rejects(queryOperation(),pattern);await fresh.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);await fresh.query(`RELEASE SAVEPOINT ${savepoint}`);
  };
  const advanceAssessSource=async(sourcePackageId,label)=>{
    const source=(await fresh.query(`SELECT upstream.case_id FROM public.studio_artifact_source_packages package JOIN public.assess_v2_studio_handoffs upstream ON upstream.id=package.assess_handoff_id AND upstream.org_id=package.org_id AND upstream.workspace_id=package.workspace_id WHERE package.id=$1`,[sourcePackageId])).rows[0];
    assert.ok(source?.case_id);const versionId=runtime.uuid(9000+sourceRaceOrdinal++);
    await fresh.query(`INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,description,source_kind,created_by)
      SELECT $1,$2,$3,$4,COALESCE(max(version),0)+1,$5,'Synthetic source-currentness transition','draft_upsert',$6 FROM public.assess_v2_case_versions WHERE case_id=$2 AND org_id=$3 AND workspace_id=$4`,[versionId,source.case_id,runtime.org,runtime.workspace,label,runtime.requester]);
    await fresh.query(`UPDATE public.assess_v2_cases SET head_version_id=$2,status='draft',updated_at=statement_timestamp() WHERE id=$1 AND org_id=$3 AND workspace_id=$4`,[source.case_id,versionId,runtime.org,runtime.workspace]);
    return{caseId:source.case_id,versionId};
  };
  const advanceStudioBundle=async sourcePackageId=>{
    const source=(await fresh.query(`SELECT studio_input_bundle_id FROM public.studio_artifact_source_packages WHERE id=$1`,[sourcePackageId])).rows[0];assert.ok(source?.studio_input_bundle_id);
    const row=(await fresh.query(`UPDATE public.enterprise_module_input_bundles SET current_version=current_version+1,updated_at=statement_timestamp() WHERE id=$1 RETURNING id,current_version`,[source.studio_input_bundle_id])).rows[0];assert.ok(row);return row;
  };
  const sourceRaceCounts=async(requestId,idempotencyKey)=>(await fresh.query(`SELECT
    (SELECT count(*)::int FROM public.studio_artifact_command_receipts WHERE command_type='studio.artifact.generation.request.v2' AND idempotency_key=$2) receipts,
    (SELECT count(*)::int FROM public.studio_artifact_generation_attempts WHERE request_id=$1) attempts,
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations reservation JOIN public.studio_artifact_generation_attempts attempt ON attempt.id=reservation.studio_attempt_id WHERE attempt.request_id=$1) reservations,
    (SELECT count(*)::int FROM public.studio_generation_recovery_events recovery JOIN public.studio_artifact_generation_attempts attempt ON attempt.id=recovery.attempt_id WHERE attempt.request_id=$1) recoveries,
    (SELECT count(*)::int FROM pr_b_gateway_effect_fixture effect JOIN public.studio_artifact_generation_attempts attempt ON attempt.provider_effect_key=effect.provider_effect_key WHERE attempt.request_id=$1) effects`,[requestId,idempotencyKey])).rows[0];
  const raceGenerationRequest=async(artifactId,sourcePackageId,templateId,label)=>{
    const selectors=(await fresh.query(`SELECT artifact.id AS "artifactId",artifact.aggregate_version AS "aggregateVersion",artifact.current_version_id AS "currentVersionId",artifact.current_approved_version_id AS "currentApprovedVersionId",package.id AS "sourcePackageId" FROM public.studio_artifact_aggregates artifact JOIN public.studio_artifact_source_packages package ON package.id=artifact.source_package_id AND package.artifact_id=artifact.id AND package.org_id=artifact.org_id AND package.workspace_id=artifact.workspace_id WHERE artifact.id=$1 AND artifact.org_id=$2 AND artifact.workspace_id=$3 AND package.id=$4`,[artifactId,runtime.org,runtime.workspace,sourcePackageId])).rows[0];assert.ok(selectors);
    const command={actorId:runtime.requester,organizationId:runtime.org,workspaceId:runtime.workspace,requestId:runtime.uuid(9100+sourceRaceOrdinal++),idempotencyKey:`pr-b-source-current-${label}`,authorizationVersion:authVersion,artifactId,sourcePackageId,templateKind:'system',templateVersionId:templateId,expectedAggregateVersion:Number(selectors.aggregateVersion),expectedCurrentVersionId:selectors.currentVersionId,expectedApprovedVersionId:selectors.currentApprovedVersionId};
    return{command,selectors,execute:()=>fresh.query(`SELECT public.studio_artifact_generation_request_v2($1::jsonb) result`,[JSON.stringify(command)])};
  };
  const assertStaleRequestNoAuthority=async({artifactId,sourcePackageId,templateId,label,advance})=>{
    await fresh.query('BEGIN');try{
      await advance(sourcePackageId);const request=await raceGenerationRequest(artifactId,sourcePackageId,templateId,label);
      const before=await sourceRaceCounts(request.command.requestId,request.command.idempotencyKey);
      assert.deepEqual(before,{receipts:0,attempts:0,reservations:0,recoveries:0,effects:0});
      await expectedRaceRejection(request.execute,/SOURCE_PACKAGE_STALE/);
      assert.deepEqual(await sourceRaceCounts(request.command.requestId,request.command.idempotencyKey),before);
      assert.equal((await fresh.query(`SELECT public.studio_pr_b_source_package_is_current($1,$2,$3) current`,[sourcePackageId,runtime.org,runtime.workspace])).rows[0].current,false);
    }finally{await fresh.query('ROLLBACK')}
    return{denied:true,requestReceiptCount:0,attemptCount:0,reservationCount:0,effectCount:0};
  };
  const assessStaleRequest=await assertStaleRequestNoAuthority({artifactId:generationArtifactId,sourcePackageId:generationPackage.id,templateId:systemTemplate.id,label:'assess-request',advance:(id)=>advanceAssessSource(id,'Superseded Assess source')});
  const bundleStaleRequest=await assertStaleRequestNoAuthority({artifactId:directArtifactId,sourcePackageId:directPackageId,templateId:directSystemTemplate.id,label:'bundle-request',advance:advanceStudioBundle});
  const hybridAssessStaleRequest=await assertStaleRequestNoAuthority({artifactId:hybridArtifactId,sourcePackageId:hybridPackageId,templateId:hybridSystemTemplate.id,label:'hybrid-assess-request',advance:(id)=>advanceAssessSource(id,'Superseded hybrid Assess source')});
  const hybridBundleStaleRequest=await assertStaleRequestNoAuthority({artifactId:hybridArtifactId,sourcePackageId:hybridPackageId,templateId:hybridSystemTemplate.id,label:'hybrid-bundle-request',advance:advanceStudioBundle});

  let claimRace;
  await fresh.query('BEGIN');try{
    const request=await raceGenerationRequest(directArtifactId,directPackageId,directSystemTemplate.id,'request-claim-race');const generation=(await request.execute()).rows[0].result;
    await advanceStudioBundle(directPackageId);const before=await sourceRaceCounts(request.command.requestId,request.command.idempotencyKey);const token=runtime.uuid(9200);
    await expectedRaceRejection(()=>fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60)`,[generation.attemptId,token]),/SOURCE_PACKAGE_STALE/);
    const after=await sourceRaceCounts(request.command.requestId,request.command.idempotencyKey);assert.deepEqual(after,before);
    const attempt=(await fresh.query(`SELECT state,execution_token,execution_fence FROM public.studio_artifact_generation_attempts WHERE id=$1`,[generation.attemptId])).rows[0];assert.deepEqual(attempt,{state:'requested',execution_token:null,execution_fence:'0'});
    claimRace={claimDenied:true,providerAuthorityGranted:false,requestReceiptCount:1,attemptCount:1,reservationCount:0,recoveryCount:0,effectCount:0};
  }finally{await fresh.query('ROLLBACK')}

  let preEffectRace;
  await fresh.query('BEGIN');try{
    const request=await raceGenerationRequest(directArtifactId,directPackageId,directSystemTemplate.id,'claim-reserve-race');const generation=(await request.execute()).rows[0].result;const token=runtime.uuid(9201);
    const claimResult=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generation.attemptId,token])).rows[0].result;assert.equal(claimResult.providerAllowed,true);
    await advanceStudioBundle(directPackageId);
    const budgetArgs=[runtime.requester,runtime.org,runtime.workspace,authVersion,generation.receiptId,generation.attemptId,token,claimResult.executionFence,routeId,runtime.provider,'openai','studio.document.generate','fixture-model'];
    const reservation=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,budgetArgs)).rows[0].result;assert.equal(reservation.errorCode,'PROVIDER_ROUTE_STALE');
    const counts=await sourceRaceCounts(request.command.requestId,request.command.idempotencyKey);assert.equal(counts.reservations,0);assert.equal(counts.effects,0);
    preEffectRace={reservationDenied:true,providerEffectAuthorityGranted:false,requestReceiptCount:1,attemptCount:1,reservationCount:0,effectCount:0};
  }finally{await fresh.query('ROLLBACK')}

  const effectFinalizeRace=async(label,advance)=>{
    await fresh.query('BEGIN');try{
      const request=await raceGenerationRequest(hybridArtifactId,hybridPackageId,hybridSystemTemplate.id,`effect-finalize-${label}`);const generation=(await request.execute()).rows[0].result;const token=runtime.uuid(9250+sourceRaceOrdinal++);
      const claimResult=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generation.attemptId,token])).rows[0].result;assert.equal(claimResult.providerAllowed,true);
      const budgetArgs=[runtime.requester,runtime.org,runtime.workspace,authVersion,generation.receiptId,generation.attemptId,token,claimResult.executionFence,routeId,runtime.provider,'openai','studio.document.generate','fixture-model'];
      const reservation=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,budgetArgs)).rows[0].result;assert.equal(reservation.ownsProviderEffect,true);
      await gatewayEffect(claimResult.providerEffectKey);
      const content=structuredContent(`Synthetic ${label} stale completion`,hybridPackage.anchor_manifest,['template_required']);
      await fresh.query(`SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,$4,$5::jsonb)`,[generation.attemptId,token,claimResult.executionFence,`synthetic-${label}`,JSON.stringify(content)]);
      await fresh.query(`SELECT public.studio_artifact_settle_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,80,20,100)`,[...budgetArgs,reservation.reservationId]);
      const headsBefore=(await fresh.query(`SELECT aggregate_version,current_version_id,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1`,[hybridArtifactId])).rows[0];
      await advance(hybridPackageId);
      const finalized=(await fresh.query(`SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) result`,[generation.attemptId,token,claimResult.executionFence])).rows[0].result;assert.equal(finalized.stale,true);assert.equal(finalized.state,'stale_completed');
      const replay=(await fresh.query(`SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) result`,[generation.attemptId,token,claimResult.executionFence])).rows[0].result;assert.equal(replay.outcome,'replayed');assert.equal(replay.versionId,finalized.versionId);
      const headsAfter=(await fresh.query(`SELECT aggregate_version,current_version_id,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1`,[hybridArtifactId])).rows[0];assert.deepEqual(headsAfter,headsBefore);
      assert.equal(Number((await fresh.query(`SELECT count(*) n FROM public.studio_artifact_versions WHERE generation_attempt_id=$1`,[generation.attemptId])).rows[0].n),1);
      return{staleCompleted:true,headMovementCount:0,currentHeadUnchanged:true,approvedHeadUnchanged:true,providerEffectCount:1,versionCount:1,replayCreatedVersion:false};
    }finally{await fresh.query('ROLLBACK')}
  };
  const assessEffectFinalize=await effectFinalizeRace('assess-source',id=>advanceAssessSource(id,'Effect-to-finalize Assess advance'));
  const bundleEffectFinalize=await effectFinalizeRace('studio-bundle',advanceStudioBundle);
  emit('STUDIO-TR-009','SOURCE-CURRENTNESS-PROVIDER-BOUNDARY','source-currentness-provider-boundary',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{assessId:generationPackage.id,directId:directPackageId,hybridId:hybridPackageId},template:{kind:'system',versionId:systemTemplate.id},handoff:{assessId:generationHandoffId,hybridId:hybridHandoffId,genuineAssessTransition:false},artifact:{assessStaleRequest,bundleStaleRequest,hybridAssessStaleRequest,hybridBundleStaleRequest,claimRace,preEffectRace,assessEffectFinalize,bundleEffectFinalize}}));

  const generationFailure=await generationRequest('system',systemTemplate.id,'fenced-failure');const failureToken=runtime.uuid(7750);
  const failureClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationFailure.result.attemptId,failureToken])).rows[0].result;
  const committedFailure=(await fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'PROVIDER_RATE_LIMITED') result`,[generationFailure.result.attemptId,failureToken,failureClaim.executionFence])).rows[0].result;
  assert.deepEqual(committedFailure,{outcome:'committed',attemptId:generationFailure.result.attemptId,state:'failed',failureCode:'PROVIDER_RATE_LIMITED',executionFence:failureClaim.executionFence});
  const failedAttempt=(await fresh.query(`SELECT state,failure_code,execution_token,execution_fence,execution_lease_expires_at,completed_at FROM public.studio_artifact_generation_attempts WHERE id=$1`,[generationFailure.result.attemptId])).rows[0];
  assert.equal(failedAttempt.state,'failed');assert.equal(failedAttempt.failure_code,'PROVIDER_RATE_LIMITED');assert.equal(failedAttempt.execution_token,failureToken);assert.equal(Number(failedAttempt.execution_fence),Number(failureClaim.executionFence));assert.equal(failedAttempt.execution_lease_expires_at,null);assert.ok(failedAttempt.completed_at);
  const failureEvidenceBeforeReplay=(await fresh.query(`SELECT (SELECT count(*) FROM public.privileged_audit_events WHERE action='studio.artifact.generation.fail.v2' AND resource_id=$1)::int audits,(SELECT count(*) FROM public.studio_generation_recovery_events WHERE attempt_id=$1 AND event_type='failed')::int recoveries`,[generationFailure.result.attemptId])).rows[0];
  const failureReplay=(await fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'PROVIDER_RATE_LIMITED') result`,[generationFailure.result.attemptId,failureToken,failureClaim.executionFence])).rows[0].result;
  assert.deepEqual(failureReplay,{outcome:'replayed',attemptId:generationFailure.result.attemptId,state:'failed',failureCode:'PROVIDER_RATE_LIMITED',executionFence:failureClaim.executionFence});
  assert.deepEqual((await fresh.query(`SELECT (SELECT count(*) FROM public.privileged_audit_events WHERE action='studio.artifact.generation.fail.v2' AND resource_id=$1)::int audits,(SELECT count(*) FROM public.studio_generation_recovery_events WHERE attempt_id=$1 AND event_type='failed')::int recoveries`,[generationFailure.result.attemptId])).rows[0],failureEvidenceBeforeReplay);

  const generationTakeover=await generationRequest('system',systemTemplate.id,'fenced-takeover');const staleFailureToken=runtime.uuid(7751),currentFailureToken=runtime.uuid(7752);
  const staleFailureClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,30) result`,[generationTakeover.result.attemptId,staleFailureToken])).rows[0].result;
  await fresh.query(`UPDATE public.studio_artifact_generation_attempts SET execution_lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[generationTakeover.result.attemptId]);
  const currentFailureClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationTakeover.result.attemptId,currentFailureToken])).rows[0].result;assert.ok(Number(currentFailureClaim.executionFence)>Number(staleFailureClaim.executionFence));
  const takeoverSnapshot=async()=>(await fresh.query(`SELECT jsonb_build_object('state',state,'failureCode',failure_code,'executionToken',execution_token,'executionFence',execution_fence,'leaseExpiresAt',execution_lease_expires_at,'completedAt',completed_at) attempt,
    (SELECT count(*)::int FROM public.privileged_audit_events WHERE action='studio.artifact.generation.fail.v2' AND resource_id=$1) audits,
    (SELECT count(*)::int FROM public.studio_generation_recovery_events WHERE attempt_id=$1) recoveries FROM public.studio_artifact_generation_attempts WHERE id=$1`,[generationTakeover.result.attemptId])).rows[0];
  const beforeStaleFailure=await takeoverSnapshot();
  await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'PROVIDER_TIMEOUT')`,[generationTakeover.result.attemptId,staleFailureToken,staleFailureClaim.executionFence]),/STALE_EXECUTION_FENCE/);
  assert.deepEqual(await takeoverSnapshot(),beforeStaleFailure);
  const takeoverFailure=(await fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'PROVIDER_TIMEOUT') result`,[generationTakeover.result.attemptId,currentFailureToken,currentFailureClaim.executionFence])).rows[0].result;assert.equal(takeoverFailure.failureCode,'PROVIDER_TIMEOUT');

  const generationSanitized=await generationRequest('system',systemTemplate.id,'failure-sanitize');const sanitizedToken=runtime.uuid(7753);
  const sanitizedClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationSanitized.result.attemptId,sanitizedToken])).rows[0].result;
  const rawInvalidFailureCode='SECRET_PROVIDER_RAW_BODY';
  const sanitizedFailure=(await fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,$4) result`,[generationSanitized.result.attemptId,sanitizedToken,sanitizedClaim.executionFence,rawInvalidFailureCode])).rows[0].result;assert.equal(sanitizedFailure.failureCode,'GENERATION_FAILED');
  const sanitizedEvidence=(await fresh.query(`SELECT attempt.failure_code,audit.metadata,recovery.failure_code recovery_failure_code,
    strpos(COALESCE(audit.metadata::text,''),$2) audit_raw_code,strpos(COALESCE(recovery.failure_code,''),$2) recovery_raw_code
    FROM public.studio_artifact_generation_attempts attempt
    JOIN public.privileged_audit_events audit ON audit.resource_id=attempt.id AND audit.action='studio.artifact.generation.fail.v2'
    JOIN public.studio_generation_recovery_events recovery ON recovery.attempt_id=attempt.id AND recovery.event_type='failed'
    WHERE attempt.id=$1`,[generationSanitized.result.attemptId,rawInvalidFailureCode])).rows[0];
  assert.equal(sanitizedEvidence.failure_code,'GENERATION_FAILED');assert.equal(sanitizedEvidence.recovery_failure_code,'GENERATION_FAILED');assert.equal(sanitizedEvidence.audit_raw_code,0);assert.equal(sanitizedEvidence.recovery_raw_code,0);
  assert.deepEqual(Object.keys(sanitizedEvidence.metadata).sort(),['artifactId','executionFence','failureCode','terminalState'].sort());

  const generationUncertain=await generationRequest('system',systemTemplate.id,'uncertain-nonterminal');const uncertainToken=runtime.uuid(7754);
  const uncertainClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationUncertain.result.attemptId,uncertainToken])).rows[0].result;
  const uncertainSnapshot=async()=>(await fresh.query(`SELECT jsonb_build_object('state',state,'failureCode',failure_code,'executionToken',execution_token,'executionFence',execution_fence,'leaseExpiresAt',execution_lease_expires_at,'completedAt',completed_at) attempt,
    (SELECT count(*)::int FROM public.privileged_audit_events WHERE action='studio.artifact.generation.fail.v2' AND resource_id=$1) audits,
    (SELECT count(*)::int FROM public.studio_generation_recovery_events WHERE attempt_id=$1) recoveries FROM public.studio_artifact_generation_attempts WHERE id=$1`,[generationUncertain.result.attemptId])).rows[0];
  const beforeUncertainFailure=await uncertainSnapshot();
  await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'GENERATION_UNCERTAIN')`,[generationUncertain.result.attemptId,uncertainToken,uncertainClaim.executionFence]),/INVALID_COMMAND/);
  assert.deepEqual(await uncertainSnapshot(),beforeUncertainFailure);
  const reconciledUncertain=(await fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'GENERATION_START_CONFLICT') result`,[generationUncertain.result.attemptId,uncertainToken,uncertainClaim.executionFence])).rows[0].result;assert.equal(reconciledUncertain.failureCode,'GENERATION_START_CONFLICT');
  emit('GENERATION-PRB-003','FENCED-FAILURE-TAKEOVER-REPLAY-SANITIZATION','generation-fenced-terminal-failure',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:generationPackage.id,hash:generationPackage.package_hash},template:{kind:'system',versionId:systemTemplate.id,version:systemTemplate.template_version,hash:systemTemplate.template_hash},handoff:{id:generationHandoffId},artifact:{id:generationArtifactId,correctOwnerAttemptId:generationFailure.result.attemptId,correctOwnerFailureCode:'PROVIDER_RATE_LIMITED',terminalReplay:true,staleTakeoverAttemptId:generationTakeover.result.attemptId,staleFence:Number(staleFailureClaim.executionFence),currentFence:Number(currentFailureClaim.executionFence),staleMutationCount:0,sanitizedAttemptId:generationSanitized.result.attemptId,sanitizedFailureCode:'GENERATION_FAILED',rawFailureDisclosed:false,uncertainAttemptId:generationUncertain.result.attemptId,uncertainTerminalizationRejected:true,cancelTimeoutCompatibility:true}}));

  const generationD=await generationRequest('system',systemTemplate.id,'cancel');const cancel=(await fresh.query(`SELECT public.studio_artifact_generation_cancel_v2($1,$2,'Synthetic cancellation') result`,[generationD.result.attemptId,runtime.requester])).rows[0].result;assert.equal(cancel.state,'cancelled');
  const cancelReplay=(await fresh.query(`SELECT public.studio_artifact_generation_cancel_v2($1,$2,'Synthetic cancellation') result`,[generationD.result.attemptId,runtime.requester])).rows[0].result;assert.equal(cancelReplay.outcome,'replayed');
  const generationE=await generationRequest('system',systemTemplate.id,'timeout');await fresh.query(`UPDATE public.studio_artifact_generation_attempts SET timeout_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[generationE.result.attemptId]);
  const timedOut=(await fresh.query(`SELECT public.studio_artifact_generation_timeout_v2($1) result`,[generationE.result.attemptId])).rows[0].result;assert.equal(timedOut.state,'timed_out');
  const timeoutReplay=(await fresh.query(`SELECT public.studio_artifact_generation_timeout_v2($1) result`,[generationE.result.attemptId])).rows[0].result;assert.equal(timeoutReplay.outcome,'replayed');
  const generationReleasedTimeout=await generationRequest('system',systemTemplate.id,'released-before-effect-timeout');const releasedTimeoutToken=runtime.uuid(7760);
  const releasedTimeoutClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[generationReleasedTimeout.result.attemptId,releasedTimeoutToken])).rows[0].result;
  const releasedTimeoutBudgetArgs=[runtime.requester,runtime.org,runtime.workspace,authVersion,generationReleasedTimeout.result.receiptId,generationReleasedTimeout.result.attemptId,releasedTimeoutToken,releasedTimeoutClaim.executionFence,routeId,runtime.provider,'openai','studio.document.generate','fixture-model'];
  const releasedTimeoutBudget=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,releasedTimeoutBudgetArgs)).rows[0].result;
  const releasedBeforeEffect=(await fresh.query(`SELECT public.studio_artifact_release_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'before_provider_effect') result`,[...releasedTimeoutBudgetArgs,releasedTimeoutBudget.reservationId])).rows[0].result;assert.equal(releasedBeforeEffect.state,'released');
  await fresh.query(`UPDATE public.studio_artifact_generation_attempts SET timeout_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[generationReleasedTimeout.result.attemptId]);
  const releasedTimeout=(await fresh.query(`SELECT public.studio_artifact_generation_timeout_v2($1) result`,[generationReleasedTimeout.result.attemptId])).rows[0].result;assert.equal(releasedTimeout.state,'timed_out');
  const leaseMatrixGeneration=await generationRequest('system',systemTemplate.id,'reservation-state-matrix');
  const reservationStateResults={};
  for(const [stateIndex,reservationState] of ['reserved','uncertain','settled','released_before_effect','released_reconciled_no_effect'].entries()){
    await fresh.query('BEGIN');
    try{
      const firstToken=runtime.uuid(7800+stateIndex*2),secondToken=runtime.uuid(7801+stateIndex*2);
      const firstClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,30) result`,[leaseMatrixGeneration.result.attemptId,firstToken])).rows[0].result;
      const reserveArgs=[runtime.requester,runtime.org,runtime.workspace,authVersion,leaseMatrixGeneration.result.receiptId,leaseMatrixGeneration.result.attemptId,firstToken,firstClaim.executionFence,routeId,runtime.provider,'openai','studio.document.generate','fixture-model'];
      const reservation=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,reserveArgs)).rows[0].result;
      if(reservationState==='uncertain')await fresh.query(`SELECT public.studio_artifact_mark_provider_budget_uncertain_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'provider_response_unknown')`,[...reserveArgs,reservation.reservationId]);
      if(reservationState==='settled')await fresh.query(`SELECT public.studio_artifact_settle_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,80,20,100)`,[...reserveArgs,reservation.reservationId]);
      if(reservationState==='released_before_effect')await fresh.query(`SELECT public.studio_artifact_release_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'before_provider_effect')`,[...reserveArgs,reservation.reservationId]);
      if(reservationState==='released_reconciled_no_effect')await fresh.query(`SELECT public.studio_artifact_release_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'reconciled_no_effect')`,[...reserveArgs,reservation.reservationId]);
      const failureSnapshot=async()=>(await fresh.query(`SELECT state,failure_code,completed_at,
        (SELECT count(*)::int FROM public.privileged_audit_events WHERE action='studio.artifact.generation.fail.v2' AND resource_id=$1) failure_audits,
        (SELECT count(*)::int FROM public.studio_generation_recovery_events WHERE attempt_id=$1 AND event_type='failed') failure_recoveries
        FROM public.studio_artifact_generation_attempts WHERE id=$1`,[leaseMatrixGeneration.result.attemptId])).rows[0];
      const beforeFailureProbe=await failureSnapshot();let terminalFailureBlocked=false,terminalFailureAllowed=false;
      await fresh.query('SAVEPOINT reservation_failure_guard');
      if(reservationState==='released_before_effect'){
        const safeReleasedFailure=(await fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'PROVIDER_TIMEOUT') result`,[leaseMatrixGeneration.result.attemptId,firstToken,firstClaim.executionFence])).rows[0].result;
        assert.equal(safeReleasedFailure.state,'failed');const afterSafeReleasedFailure=await failureSnapshot();assert.equal(afterSafeReleasedFailure.state,'failed');assert.equal(afterSafeReleasedFailure.failure_code,'PROVIDER_TIMEOUT');assert.equal(afterSafeReleasedFailure.failure_audits,beforeFailureProbe.failure_audits+1);assert.equal(afterSafeReleasedFailure.failure_recoveries,beforeFailureProbe.failure_recoveries+1);terminalFailureAllowed=true;
      }else{
        await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,'PROVIDER_TIMEOUT')`,[leaseMatrixGeneration.result.attemptId,firstToken,firstClaim.executionFence]),/GENERATION_RECONCILIATION_REQUIRED/);terminalFailureBlocked=true;
      }
      await fresh.query('ROLLBACK TO SAVEPOINT reservation_failure_guard');assert.deepEqual(await failureSnapshot(),beforeFailureProbe);
      let timeoutBlocked=false;
      if(reservationState!=='released_before_effect'){
        await fresh.query(`UPDATE public.studio_artifact_generation_attempts SET timeout_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[leaseMatrixGeneration.result.attemptId]);
        await fresh.query('SAVEPOINT reservation_timeout_guard');
        await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_timeout_v2($1)`,[leaseMatrixGeneration.result.attemptId]),/GENERATION_RECONCILIATION_REQUIRED/);
        await fresh.query('ROLLBACK TO SAVEPOINT reservation_timeout_guard');
        assert.notEqual((await fresh.query(`SELECT state FROM public.studio_artifact_generation_attempts WHERE id=$1`,[leaseMatrixGeneration.result.attemptId])).rows[0].state,'timed_out');
        timeoutBlocked=true;
      }
      await fresh.query(`UPDATE public.studio_artifact_generation_attempts SET execution_lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[leaseMatrixGeneration.result.attemptId]);
      const takeover=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[leaseMatrixGeneration.result.attemptId,secondToken])).rows[0].result;
      const reservationAfter=(await fresh.query(`SELECT state,release_reason,execution_token,execution_fence,studio_transfer_count,studio_transfer_pending FROM public.enterprise_ai_budget_reservations WHERE id=$1`,[reservation.reservationId])).rows[0];
      if(reservationState==='released_before_effect'){
        assert.equal(takeover.providerAllowed,true);assert.equal(takeover.reconcileOnly,false);assert.equal(reservationAfter.state,'reserved');assert.equal(reservationAfter.execution_token,secondToken);assert.equal(Number(reservationAfter.execution_fence),Number(takeover.executionFence));assert.equal(Number(reservationAfter.studio_transfer_count),1);assert.equal(reservationAfter.studio_transfer_pending,true);
        const transferredArgs=[...reserveArgs];transferredArgs[6]=secondToken;transferredArgs[7]=takeover.executionFence;
        const transferredOwner=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,transferredArgs)).rows[0].result;
        const transferredReplay=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,transferredArgs)).rows[0].result;
        assert.equal(transferredOwner.ownsProviderEffect,true);assert.equal(transferredReplay.ownsProviderEffect,false);
      }else{
        assert.equal(takeover.providerAllowed,false);assert.equal(takeover.reconcileOnly,true);
        assert.equal(reservationAfter.execution_token,firstToken);assert.equal(Number(reservationAfter.execution_fence),Number(firstClaim.executionFence));assert.equal(reservationAfter.studio_transfer_pending,false);
      }
      reservationStateResults[reservationState]={providerAllowed:takeover.providerAllowed,reconcileOnly:takeover.reconcileOnly,storedState:reservationAfter.state,transferCount:Number(reservationAfter.studio_transfer_count),timeoutBlocked,terminalFailureBlocked,terminalFailureAllowed};
    }finally{await fresh.query('ROLLBACK')}
  }
  const deadlockFirstToken=runtime.uuid(7820),deadlockSecondToken=runtime.uuid(7821);
  const deadlockFirstClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,30) result`,[leaseMatrixGeneration.result.attemptId,deadlockFirstToken])).rows[0].result;
  const deadlockReserveArgs=[runtime.requester,runtime.org,runtime.workspace,authVersion,leaseMatrixGeneration.result.receiptId,leaseMatrixGeneration.result.attemptId,deadlockFirstToken,deadlockFirstClaim.executionFence,routeId,runtime.provider,'openai','studio.document.generate','fixture-model'];
  const deadlockReservation=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,deadlockReserveArgs)).rows[0].result;
  await fresh.query(`UPDATE public.studio_artifact_generation_attempts SET execution_lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[leaseMatrixGeneration.result.attemptId]);
  const claimant=await connect(urlFor(names.fresh)),settler=await connect(urlFor(names.fresh));const settlerPid=Number((await settler.query('SELECT pg_backend_pid() pid')).rows[0].pid);
  await claimant.query('BEGIN');const deadlockTakeover=(await claimant.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[leaseMatrixGeneration.result.attemptId,deadlockSecondToken])).rows[0].result;assert.equal(deadlockTakeover.reconcileOnly,true);
  const settlePromise=settler.query(`SELECT public.studio_artifact_settle_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,80,20,100) result`,[...deadlockReserveArgs,deadlockReservation.reservationId]);
  let settlerWaited=false;for(let waitIndex=0;waitIndex<40&&!settlerWaited;waitIndex++){await delay(25);settlerWaited=(await fresh.query(`SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=$1`,[settlerPid])).rows[0]?.waiting===true}
  assert.equal(settlerWaited,true);await claimant.query('COMMIT');const staleSettle=(await settlePromise).rows[0].result;assert.equal(staleSettle.errorCode,'PROVIDER_ROUTE_STALE');
  emit('BUDGET-001','RESERVATION-STATE-TAKEOVER-AND-DEADLOCK-SAFE-ORDER','provider-reservation-takeover-pg-interleavings',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:generationPackage.id,hash:generationPackage.package_hash},template:{kind:'system',versionId:systemTemplate.id},handoff:{id:generationHandoffId},artifact:{id:generationArtifactId,attemptId:leaseMatrixGeneration.result.attemptId,reservationStates:reservationStateResults,releasedBeforeEffectSingleTransfer:true,releasedBeforeEffectTimeoutSafe:true,releasedBeforeEffectTerminalFailureSafe:true,noReservationTimeoutSafe:true,noReservationTerminalFailureSafe:true,attemptBeforeReservationLockOrder:true,settlerWaitedWithoutDeadlock:true}}));

  const readRuntimeActionProjections=async()=>{
    const artifactProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_projection_v2($1,$2,$3) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection;
    const workspaceProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_workspace_projection_v2($1,$2,$3,0,20) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection;
    const summaryProjection=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_summary_projection_v2($1,$2,0,50) projection`,[runtime.org,runtime.workspace])).rows[0].projection;
    const summaryItem=summaryProjection.items.find(item=>item.id===directArtifactId);assert.ok(summaryItem);
    return{artifactProjection,workspaceProjection,summaryProjection,summaryItem};
  };
  const enabledActions=await readRuntimeActionProjections();
  assert.ok(enabledActions.artifactProjection.template.actions.includes('studio.generation.request'));assert.ok(enabledActions.workspaceProjection.actions.includes('studio.artifact.draft.revise'));assert.ok(enabledActions.workspaceProjection.actions.includes('studio.generation.request'));assert.ok(enabledActions.summaryItem.actions.includes('studio.artifact.draft.revise'));
  const runtimeSuppression={};
  for(const [label,enabled,readOnly] of [['read_only',true,true],['disabled',false,false]]){
    await fresh.query(`UPDATE public.studio_artifact_runtime_control SET enabled=$1,read_only=$2,updated_at=statement_timestamp() WHERE singleton`,[enabled,readOnly]);
    const suppressed=await readRuntimeActionProjections();
    assert.equal(suppressed.artifactProjection.readOnly,true);assert.deepEqual(suppressed.artifactProjection.template.actions,[]);assert.deepEqual(suppressed.workspaceProjection.actions,[]);assert.equal(suppressed.workspaceProjection.providerAvailability.available,false);assert.equal(suppressed.workspaceProjection.providerAvailability.reason,'read_only');assert.deepEqual(suppressed.summaryItem.actions,[]);
    runtimeSuppression[label]={artifactReadable:true,workspaceReadable:true,summaryReadable:true,artifactActions:0,workspaceActions:0,summaryActions:0};
  }
  await fresh.query(`UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=true,updated_at=statement_timestamp() WHERE singleton`);
  const restoredActions=await readRuntimeActionProjections();
  assert.deepEqual(restoredActions.artifactProjection.template.actions,enabledActions.artifactProjection.template.actions);assert.deepEqual(restoredActions.workspaceProjection.actions,enabledActions.workspaceProjection.actions);assert.deepEqual(restoredActions.summaryItem.actions,enabledActions.summaryItem.actions);
  emit('MIGRATION-006','RUNTIME-CONTROL-SUPPRESSES-PROJECTION-MUTATION-ACTIONS','runtime-control-safe-readable-projections',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:directPackageId,hash:directPackage.sourcePackageHash},template:{kind:'system',versionId:directSystemTemplate.id},handoff:null,artifact:{id:directArtifactId,runtimeSuppression,restoredWithCapabilityAndLifecycle:true}}));

  const directTimeoutSelectors=(await asAuthenticated(fresh,runtime.requester,`SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection;
  const uncertainTimeoutCommand={actorId:runtime.requester,organizationId:runtime.org,workspaceId:runtime.workspace,requestId:runtime.uuid(7840),idempotencyKey:'pr-b-uncertain-reservation-timeout',authorizationVersion:authVersion,artifactId:directArtifactId,sourcePackageId:directTimeoutSelectors.sourcePackageId,templateKind:'system',templateVersionId:directSystemTemplate.id,expectedAggregateVersion:Number(directTimeoutSelectors.aggregateVersion),expectedCurrentVersionId:directTimeoutSelectors.currentVersionId,expectedApprovedVersionId:directTimeoutSelectors.currentApprovedVersionId};
  const uncertainTimeoutGeneration=(await fresh.query(`SELECT public.studio_artifact_generation_request_v2($1::jsonb) result`,[JSON.stringify(uncertainTimeoutCommand)])).rows[0].result;const uncertainTimeoutToken=runtime.uuid(7841);
  const uncertainTimeoutClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[uncertainTimeoutGeneration.attemptId,uncertainTimeoutToken])).rows[0].result;
  const uncertainTimeoutBudgetArgs=[runtime.requester,runtime.org,runtime.workspace,authVersion,uncertainTimeoutGeneration.receiptId,uncertainTimeoutGeneration.attemptId,uncertainTimeoutToken,uncertainTimeoutClaim.executionFence,routeId,runtime.provider,'openai','studio.document.generate','fixture-model'];
  const uncertainTimeoutBudget=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,uncertainTimeoutBudgetArgs)).rows[0].result;
  await fresh.query(`SELECT public.studio_artifact_mark_provider_budget_uncertain_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'provider_response_unknown')`,[...uncertainTimeoutBudgetArgs,uncertainTimeoutBudget.reservationId]);
  await fresh.query(`UPDATE public.studio_artifact_generation_attempts SET timeout_at=statement_timestamp()-interval '1 second',execution_lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[uncertainTimeoutGeneration.attemptId]);
  const uncertainTimeoutSnapshot=async()=>(await fresh.query(`SELECT state,failure_code,completed_at,(SELECT count(*)::int FROM public.privileged_audit_events WHERE action='studio.artifact.generation.timeout' AND resource_id=$1) timeout_audits,(SELECT count(*)::int FROM public.studio_generation_recovery_events WHERE attempt_id=$1 AND event_type='timed_out') timeout_recoveries FROM public.studio_artifact_generation_attempts WHERE id=$1`,[uncertainTimeoutGeneration.attemptId])).rows[0];
  const beforeUncertainTimeout=await uncertainTimeoutSnapshot();await assert.rejects(fresh.query(`SELECT public.studio_artifact_generation_timeout_v2($1)`,[uncertainTimeoutGeneration.attemptId]),/GENERATION_RECONCILIATION_REQUIRED/);assert.deepEqual(await uncertainTimeoutSnapshot(),beforeUncertainTimeout);
  const secondEffectToken=runtime.uuid(7842);const secondEffectClaim=(await fresh.query(`SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,[uncertainTimeoutGeneration.attemptId,secondEffectToken])).rows[0].result;assert.equal(secondEffectClaim.providerAllowed,false);assert.equal(secondEffectClaim.reconcileOnly,true);
  const secondEffectBudgetArgs=[...uncertainTimeoutBudgetArgs];secondEffectBudgetArgs[6]=secondEffectToken;secondEffectBudgetArgs[7]=secondEffectClaim.executionFence;
  const secondEffectBudget=(await fresh.query(`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,80) result`,secondEffectBudgetArgs)).rows[0].result;assert.equal(secondEffectBudget.errorCode,'PROVIDER_ROUTE_STALE');
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM pr_b_gateway_effect_fixture WHERE provider_effect_key=$1`,[uncertainTimeoutClaim.providerEffectKey])).rows[0].n),0);assert.equal((await fresh.query(`SELECT state FROM public.studio_artifact_generation_attempts WHERE id=$1`,[uncertainTimeoutGeneration.attemptId])).rows[0].state,'reconciling');
  emit('GENERATION-PRB-002','RESERVATION-AWARE-TIMEOUT-PRESERVES-RECONCILIATION-AUTHORITY','uncertain-reservation-timeout-composition',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:directPackageId,hash:directPackage.sourcePackageHash},template:{kind:'system',versionId:directSystemTemplate.id},handoff:null,artifact:{id:directArtifactId,attemptId:uncertainTimeoutGeneration.attemptId,reservationId:uncertainTimeoutBudget.reservationId,reservationState:'uncertain',timeoutTerminalized:false,timeoutAuditCount:0,timeoutRecoveryCount:0,reconciliationOwned:true,secondProviderAllowed:false,secondBudgetAuthority:false,providerEffectCount:0}}));
  await fresh.query('BEGIN');
  try{
    await fresh.query(`UPDATE public.enterprise_evidence_sources SET deleted_at=statement_timestamp() WHERE id=$1 AND org_id=$2 AND workspace_id=$3`,[runtime.sources[1].sourceId,runtime.org,runtime.workspace]);
    await fresh.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`,[runtime.requester]);await fresh.query('SET LOCAL ROLE authenticated');
    const historicalAfterDelete=(await fresh.query(`SELECT public.studio_artifact_workspace_projection_v2($1,$2,$3,0,20) projection`,[runtime.org,runtime.workspace,directArtifactId])).rows[0].projection;
    await fresh.query('RESET ROLE');
    assert.equal(historicalAfterDelete.selectedSources.items.some(source=>source.sourceVersionId===exactStudioAnchor.sourceVersionId),true);
    await assert.rejects(makeSet('studio',runtime.uuid(7830),exactStudioAnchor.sourceVersionId,'deleted-source-selection'),/ENTERPRISE_TRANSCRIPT_SOURCE_VERSION_NOT_READY|SOURCE_NOT_AVAILABLE|RESOURCE_NOT_AVAILABLE|SOURCE_SET_INVALID/);
  }finally{await fresh.query('ROLLBACK')}
  emit('STUDIO-TR-004','SOFT-DELETED-HISTORICAL-SOURCE-PRESERVED-NEW-SELECTION-BLOCKED','soft-deleted-immutable-package-source',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:directPackageId,hash:directPackage.sourcePackageHash},template:{kind:'system',versionId:directSystemTemplate.id},handoff:null,artifact:{id:directArtifactId,historicalProjectionPreserved:true,newSelectionBlocked:true,privateFieldsDisclosed:false}}));
  emit('GENERATION-PRB-002','CANCELLATION-TIMEOUT-REPLAY','generation-terminal-control',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:generationPackage.id,hash:generationPackage.package_hash},template:{kind:'system',versionId:systemTemplate.id,version:systemTemplate.template_version,hash:systemTemplate.template_hash},handoff:{id:generationHandoffId},artifact:{id:generationArtifactId,cancelledAttemptId:generationD.result.attemptId,timedOutAttemptId:generationE.result.attemptId,cancelReplay:true,timeoutReplay:true}}));
  emit('MIGRATION-006','DEFAULT-OFF-READONLY-EXACT-REPLAY-NO-EFFECT','fresh-default-off-and-replay',context(runtimePersona,runtime.org,runtime.workspace,{sourcePackage:{id:generationPackage.id,hash:generationPackage.package_hash},template:{id:tenantTemplateId,versionId:approvedTemplate.id},handoff:{id:generationHandoffId},artifact:{id:generationArtifactId},defaultOff:defaultOffEvidence,exactReplays:{templateVersionCountUnchanged:true,handoffConsumptionCountUnchanged:true,generationAttemptCountUnchanged:true}}));

  console.log('Governed multi-source Studio PR B PostgreSQL scenarios passed.');
}finally{
  for(const client of clients.reverse())if(client!==admin)await client.end().catch(()=>{});
  if(admin){for(const name of databases.reverse())await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(error=>{console.error(`cleanup failed ${name}: ${error.message}`);process.exitCode=1});for(const role of roles.reverse())await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(()=>{});await admin.end().catch(()=>{})}
}
