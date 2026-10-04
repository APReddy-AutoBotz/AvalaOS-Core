import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {validateAssessImportDatabaseUrl} from './assessImportValidationContract.mjs';
import {createEnterpriseIntelligenceFixture} from './enterpriseIntelligencePostgresFixture.mjs';
import {applySyntheticAiTerminalJournalMigrationForTest} from './syntheticAiTerminalJournalMigrationTestGuard.mjs';

const adminUrl=validateAssessImportDatabaseUrl(process.env.ASSESS_DOCUMENT_MAPPING_POSTGRES_ADMIN_URL);
const parsed=new URL(adminUrl);assert.ok(['127.0.0.1','localhost','::1'].includes(parsed.hostname));assert.equal(parsed.pathname,'/postgres');
const {Client}=pg;const uuid=()=>crypto.randomUUID();const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const one=async(db,sql,values=[])=>(await db.query(sql,values)).rows[0];
const expectedFailure=async(operation,pattern)=>{try{await operation();assert.fail('EXPECTED_FAILURE')}catch(error){assert.match(String(error?.message??error),pattern)}};
const transaction=async(db,label,operation)=>{await db.query('BEGIN');try{const result=await operation();await db.query('COMMIT');return result}catch(error){await db.query('ROLLBACK');throw new Error(`${label}:${error?.code??'UNKNOWN'}:${error?.message??'failure'}`)}};
const pass=(testId,detail)=>console.log(`ASSESS_DOCUMENT_MAPPING_PG_ASSERTION ${JSON.stringify({testId,result:'passed',detail})}`);
const v2Migration='20261003150800_synthetic_ai_brd_v2_quality_validation_allowance.sql';
const v2Predecessor='20261003123459_studio_brd_prompt_v2_semantic_fidelity.sql';
const promptV3Migration='20261004025101_studio_brd_source_fact_retention_v3.sql';
const migration='20261004112232_synthetic_ai_brd_v3_quality_validation_allowance.sql';
const predecessor=promptV3Migration;
const featureMigration='20260916083814_assess_supporting_document_mapping.sql';
const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
const migrationIndex=migrations.indexOf(migration);assert.ok(migrationIndex>0);
assert.equal(migrations[migrationIndex-1],predecessor);
const readMigration=async name=>(await readFile(join('supabase/migrations',name),'utf8')).replaceAll('\r\n','\n');
const migrationSql=await readMigration(migration);
const v2MigrationSql=await readMigration(v2Migration);
const authBootstrap=`DO $$BEGIN CREATE ROLE anon NOLOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
DO $$BEGIN CREATE ROLE authenticated NOLOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
DO $$BEGIN CREATE ROLE service_role NOLOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
GRANT USAGE ON SCHEMA auth TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`;
const applyChain=async(db,through)=>{let fixture;for(const name of migrations){if(name===featureMigration)fixture=await createEnterpriseIntelligenceFixture(db,'brd');await applySyntheticAiTerminalJournalMigrationForTest(db,name,()=>transaction(db,name,async()=>db.query(await readMigration(name))));if(name===through)break}assert.ok(fixture);return fixture};
const structuredContent=(title,sourceAnchors)=>{const sourceIds=[...new Set(sourceAnchors.map(anchor=>anchor.sourceVersionId))];return{contractVersion:'studio-artifact-2',title,
  summary:'Synthetic governed BRD quality validation.',sections:[{id:'summary',title:'Summary',body:title,sourceAnchors,labels:['template_required']}],
  coverage:{selectedSourceVersionIds:sourceIds,coveredSourceVersionIds:sourceIds,complete:true}}};
const names=[`brd_v3_quality_fresh_${process.pid}_${Date.now()}`,`brd_v3_quality_stale_${process.pid}_${Date.now()}`];
const urlFor=name=>{const value=new URL(adminUrl);value.pathname=`/${name}`;return value.toString()};

async function prepare(db,{fresh}){
  await db.query(authBootstrap);const fixture=await applyChain(db,v2Predecessor);
  await db.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
    SELECT role_values.role_id,capability_values.capability FROM unnest($1::uuid[]) role_values(role_id)
    CROSS JOIN unnest($2::text[]) capability_values(capability) ON CONFLICT DO NOTHING`,[[fixture.role,fixture.routeRole],['org.admin','admin.synthetic.users.manage','studio.artifacts.generate','studio.sources.read','studio.sources.manage']]);
  const authorizationVersion=Number((await one(db,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,fixture.requester])).version);
  const projectRef='abcdefghijklmnopqrst',requestHost=`${projectRef}.supabase.co`,fingerprint=`sha256:${'b'.repeat(64)}`;
  await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({host:requestHost})]);
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET enabled=true,read_only=false,provider_enabled=false WHERE singleton`);
  await db.query(`UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=false WHERE singleton`);
  await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(org_id,workspace_id,unified_byok_gateway_enabled,studio_multisource_enabled,module_handoffs_enabled,updated_by)
    VALUES($1,$2,true,true,true,$3) ON CONFLICT(org_id,workspace_id) DO UPDATE SET unified_byok_gateway_enabled=true,
    studio_multisource_enabled=true,module_handoffs_enabled=true,updated_by=$3`,[fixture.org,fixture.workspace,fixture.requester]);
  await db.query(`UPDATE public.ai_provider_key_refs SET secret_ref=$2,status='active' WHERE id=$1`,[fixture.keyRef,`AVALA_PROVIDER_SECRET_OPENAI_${fixture.org.replaceAll('-','').toUpperCase()}_QA`]);
  await db.query(`UPDATE public.ai_provider_configs SET default_model='gpt-4.1-mini-2025-04-14',model_allowlist=ARRAY['gpt-4.1-mini-2025-04-14'],
    endpoint_url='https://api.openai.com',last_validated_at=CASE WHEN $2 THEN statement_timestamp()-interval '1 hour' ELSE statement_timestamp()-interval '25 hours' END,
    status='active' WHERE id=$1`,[fixture.provider,fresh]);
  const assessRoute=uuid(),studioRoute=uuid(),targetId=uuid();
  for(const [id,capability] of [[assessRoute,'assess.evidence.extract'],[studioRoute,'studio.document.generate']])await db.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,'gpt-4.1-mini-2025-04-14',true,ARRAY[$6::text],1,$7,$7)`,[id,fixture.org,fixture.workspace,fixture.provider,capability,fixture.routeRole,fixture.requester]);
  await db.query(`INSERT INTO public.synthetic_admin_targets(id,target_fingerprint,org_id,workspace_id,operator_actor_id,organization_member_role_id,environment_class,enabled)
    VALUES($1,$2,$3,$4,$5,$6,'hosted_nonproduction_pilot',true)`,[targetId,fingerprint,fixture.org,fixture.workspace,fixture.requester,fixture.role]);
  const campaignId=(await one(db,`INSERT INTO public.synthetic_ai_campaign_authorities(target_id,target_fingerprint,project_ref,server_host,local_carry_seal_digest,
    org_id,workspace_id,operator_actor_id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,statement_timestamp()-interval '20 days',statement_timestamp()-interval '19 days') RETURNING id`,[
    targetId,fingerprint,projectRef,requestHost,`sha256:${'c'.repeat(64)}`,fixture.org,fixture.workspace,fixture.requester,fixture.provider,fixture.keyRef,assessRoute,studioRoute])).id;

  const aggregate=await one(db,'SELECT * FROM public.studio_artifact_aggregates WHERE id=$1',[fixture.artifactId]);
  const packageRow=await one(db,'SELECT * FROM public.studio_artifact_source_packages WHERE id=$1',[aggregate.source_package_id]);
  const v1=await one(db,'SELECT * FROM public.studio_artifact_versions WHERE id=$1',[aggregate.current_version_id]);
  const v2=uuid(),v2Content={...v1.content,title:'Approved synthetic BRD v2'};
  await db.query(`INSERT INTO public.studio_artifact_versions(id,artifact_id,org_id,workspace_id,version,parent_version_id,template_id,content_schema_version,renderer_version,
    content,content_hash,lifecycle,author_id,author_authorization_version,source_package_id,source_package_hash,template_kind,tenant_template_version_id,
    template_version,template_hash,is_stale_completion)
    VALUES($1,$2,$3,$4,2,$5,$6,$7,$8,$9::jsonb,public.enterprise_sha256_jsonb($9::jsonb),'approved',$10,$11,$12,$13,$14,$15,$16,$17,false)`,[
    v2,fixture.artifactId,fixture.org,fixture.workspace,v1.id,v1.template_id,v1.content_schema_version,v1.renderer_version,JSON.stringify(v2Content),fixture.requester,
    authorizationVersion,packageRow.id,packageRow.package_hash,v1.template_kind,v1.tenant_template_version_id,v1.template_version,v1.template_hash]);
  await db.query(`UPDATE public.studio_artifact_aggregates SET aggregate_version=aggregate_version+1,current_version_id=$2,current_approved_version_id=$2,lifecycle='approved' WHERE id=$1`,[fixture.artifactId,v2]);
  const baselineAggregate=Number((await one(db,'SELECT aggregate_version FROM public.studio_artifact_aggregates WHERE id=$1',[fixture.artifactId])).aggregate_version);
  const immutableVersions=(await db.query('SELECT id,content_hash,content FROM public.studio_artifact_versions WHERE id=ANY($1::uuid[]) ORDER BY id',[[v1.id,v2]])).rows;

  const finalId=uuid();
  let predecessorCompatibility=null;
  if(fresh){
    await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton');
    const requestId=uuid(),executionToken=uuid(),requestHash=hash('predecessor-last-slot-command');
    const receipt=await one(db,`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'provider.validate','predecessor-last-slot',$4,$5,NULL,$6)).*`,
      [fixture.requester,fixture.org,fixture.workspace,requestId,requestHash,executionToken]);
    predecessorCompatibility={reservationId:uuid(),receiptId:receipt.id,effectId:uuid(),executionToken,executionFence:receipt.execution_fence,
      requestHash,effectHash:hash('predecessor-last-slot-effect')};
    await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  }
  await db.query('BEGIN');
  try{
    await db.query('SET LOCAL session_replication_role=replica');
    await db.query(`INSERT INTO public.synthetic_ai_campaign_final_continuations(id,campaign_id,prior_renewal_id,reconciliation_id,activated_by,authorization_version,
      target_fingerprint,project_ref,org_id,workspace_id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,source_package_id,artifact_id,
      source_package_hash,release_sha,source_attestation_digest,binding_digest,result,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'{}'::jsonb,
        statement_timestamp()-interval '5 minutes',statement_timestamp()+interval '12 hours')`,[
      finalId,campaignId,uuid(),uuid(),fixture.requester,authorizationVersion,fingerprint,projectRef,fixture.org,fixture.workspace,fixture.provider,fixture.keyRef,
      assessRoute,studioRoute,packageRow.id,fixture.artifactId,packageRow.package_hash,'a'.repeat(40),`sha256:${'d'.repeat(64)}`,`sha256:${hash('final-binding')}`]);
    const operations=['provider.validate','provider.validate','assess.evidence.extract','studio.document.generate','studio.document.generate','studio.document.generate','studio.document.generate','provider.validate'];
    for(let i=0;i<operations.length;i+=1){const operation=operations[i],route=operation==='provider.validate'?null:operation==='assess.evidence.extract'?assessRoute:studioRoute;
      const compatibility=i===7?predecessorCompatibility:null;
      await db.query(`INSERT INTO public.synthetic_ai_campaign_effect_debits(id,campaign_id,renewal_id,final_continuation_id,receipt_id,effect_id,authority_kind,
        actor_id,org_id,workspace_id,authorization_version,execution_token,execution_fence,command_request_hash,effect_request_hash,maximum_output_tokens,
        operation,route_id,provider_config_id,key_ref_id,provider,endpoint,model,debit_usd_nanos,reserved_at,consumed_at)
        VALUES($1,$2,NULL,$3,$4,$5,'enterprise',$6,$7,$8,$9,$10,$11,$12,$13,4096,$14,$15,$16,$17,'openai','https://api.openai.com',
          'gpt-4.1-mini-2025-04-14',471459200,statement_timestamp()-interval '4 minutes',
          CASE WHEN $18 THEN NULL ELSE statement_timestamp()-interval '4 minutes' END)`,[
        compatibility?.reservationId??uuid(),campaignId,i>=6?finalId:null,compatibility?.receiptId??uuid(),compatibility?.effectId??uuid(),fixture.requester,fixture.org,fixture.workspace,
        authorizationVersion,compatibility?.executionToken??uuid(),compatibility?.executionFence??1,compatibility?.requestHash??hash(`command-${i}`),compatibility?.effectHash??hash(`effect-${i}`),operation,route,
        fixture.provider,fixture.keyRef,Boolean(compatibility)]);}
    await db.query('SET LOCAL session_replication_role=origin');await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error}

  const before=await one(db,`SELECT md5(to_jsonb(authority)::text) campaign,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(debit) ORDER BY debit.id),'[]'::jsonb)::text) FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=authority.id) debits
    FROM public.synthetic_ai_campaign_authorities authority WHERE authority.id=$1`,[campaignId]);
  await applySyntheticAiTerminalJournalMigrationForTest(db,v2Migration,()=>transaction(db,v2Migration,async()=>db.query(v2MigrationSql)));
  const after=await one(db,`SELECT md5(to_jsonb(authority)::text) campaign,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(debit)-'brd_v2_quality_window_id' ORDER BY debit.id),'[]'::jsonb)::text) FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=authority.id) debits,
    (SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=authority.id AND debit.brd_v2_quality_window_id IS NOT NULL) tagged
    FROM public.synthetic_ai_campaign_authorities authority WHERE authority.id=$1`,[campaignId]);
  assert.equal(after.campaign,before.campaign);assert.equal(after.debits,before.debits);assert.equal(after.tagged,0);
  if(predecessorCompatibility){
    await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton');
    await db.query(`SELECT public.synthetic_ai_campaign_consume_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12,$13,
      'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','provider.validate',$14,4096)`,[predecessorCompatibility.reservationId,fixture.requester,
      fixture.org,fixture.workspace,authorizationVersion,fingerprint,projectRef,predecessorCompatibility.receiptId,predecessorCompatibility.effectId,
      predecessorCompatibility.executionToken,predecessorCompatibility.executionFence,fixture.provider,fixture.keyRef,predecessorCompatibility.effectHash]);
    assert.ok((await one(db,'SELECT consumed_at FROM public.synthetic_ai_campaign_effect_debits WHERE id=$1',[predecessorCompatibility.reservationId])).consumed_at);
    await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  }
  return{fixture,authorizationVersion,projectRef,fingerprint,campaignId,finalId,assessRoute,studioRoute,packageRow,v2,baselineAggregate,immutableVersions,predecessorCompatibility};
}

const v2ActivationSql=`SELECT public.synthetic_ai_campaign_activate_brd_v2_quality_validation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) result`;
const activateV2=async(db,state,seconds=3600)=>one(db,v2ActivationSql,[state.fixture.requester,state.fixture.org,state.fixture.workspace,state.authorizationVersion,
  state.fingerprint,state.projectRef,state.campaignId,state.finalId,state.fixture.provider,state.fixture.keyRef,state.assessRoute,state.studioRoute,
  state.fixture.requester,state.authorizationVersion,state.packageRow.id,state.packageRow.package_hash,state.fixture.artifactId,state.v1Template??state.templateId,
  state.v2,state.v2,'e'.repeat(40),`sha256:${'f'.repeat(64)}`,seconds]);
const claimValidation=async(db,state,label)=>{const request=uuid(),token=uuid(),requestHash=hash(`validation:${label}`);const row=await one(db,
  `SELECT (public.enterprise_ai_claim_command($1,$2,$3,'provider.validate',$4,$5,$6,NULL,$7)).*`,[state.fixture.requester,state.fixture.org,state.fixture.workspace,label,request,requestHash,token]);
  return{...row,effect:uuid(),effectHash:hash(`validation-effect:${label}`),requestHash}};
const reserveValidation=async(db,state,item)=>one(db,`SELECT public.synthetic_ai_campaign_reserve_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,
  'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','provider.validate',$13,4096) result`,[state.fixture.requester,state.fixture.org,state.fixture.workspace,
  state.authorizationVersion,state.fingerprint,state.projectRef,item.id,item.effect,item.execution_token,item.execution_fence,state.fixture.provider,state.fixture.keyRef,item.effectHash]);
const consumeValidation=async(db,state,item,reservation)=>db.query(`SELECT public.synthetic_ai_campaign_consume_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12,$13,
  'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','provider.validate',$14,4096)`,[reservation,state.fixture.requester,state.fixture.org,state.fixture.workspace,
  state.authorizationVersion,state.fingerprint,state.projectRef,item.id,item.effect,item.execution_token,item.execution_fence,state.fixture.provider,state.fixture.keyRef,item.effectHash]);
async function requestClaimReserve(db,state,label,expectedPrompt='studio-pr-b-2',deferPermit=false){
  const aggregate=await one(db,'SELECT aggregate_version,current_version_id,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1',[state.fixture.artifactId]);
  const template=await one(db,"SELECT id FROM public.studio_system_template_versions WHERE artifact_type='brd' AND superseded_at IS NULL");state.templateId=template.id;
  const request=await one(db,`SELECT public.studio_artifact_generation_request_v2($1::jsonb) result`,[JSON.stringify({actorId:state.fixture.requester,
    organizationId:state.fixture.org,workspaceId:state.fixture.workspace,requestId:uuid(),idempotencyKey:`brd-quality-${label}`,authorizationVersion:state.authorizationVersion,
    artifactId:state.fixture.artifactId,sourcePackageId:state.packageRow.id,templateKind:'system',templateVersionId:template.id,
    expectedAggregateVersion:Number(aggregate.aggregate_version),expectedCurrentVersionId:aggregate.current_version_id,expectedApprovedVersionId:aggregate.current_approved_version_id})]);
  const token=uuid();const claim=(await one(db,'SELECT public.studio_artifact_generation_claim_v2($1,$2,300) result',[request.result.attemptId,token])).result;
  assert.equal(claim.promptVersion,expectedPrompt);
  const budgetArgs=[state.fixture.requester,state.fixture.org,state.fixture.workspace,state.authorizationVersion,request.result.receiptId,
    request.result.attemptId,token,claim.executionFence,state.studioRoute,state.fixture.provider,'openai','studio.document.generate','gpt-4.1-mini-2025-04-14'];
  const budget=(await one(db,`SELECT public.studio_artifact_reserve_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,120,4000) result`,budgetArgs)).result;
  assert.equal(budget.state,'reserved');assert.equal(budget.ownsProviderEffect,true);
  const effectHash=hash(`studio-effect:${label}`);const permit=deferPermit?null:(await one(db,`SELECT public.synthetic_ai_campaign_reserve_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
    'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','studio.document.generate',$14,4000) result`,[state.fixture.requester,state.fixture.org,state.fixture.workspace,
    state.authorizationVersion,state.fingerprint,state.projectRef,request.result.receiptId,request.result.attemptId,token,claim.executionFence,state.studioRoute,
    state.fixture.provider,state.fixture.keyRef,effectHash])).result;
  return{request:request.result,claim,token,effectHash,permit,budget,budgetArgs};
}
const consumeStudio=async(db,state,flow)=>db.query(`SELECT public.synthetic_ai_campaign_consume_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
  'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','studio.document.generate',$15,4000)`,[flow.permit.reservationId,state.fixture.requester,state.fixture.org,
  state.fixture.workspace,state.authorizationVersion,state.fingerprint,state.projectRef,flow.request.receiptId,flow.request.attemptId,flow.token,flow.claim.executionFence,
  state.studioRoute,state.fixture.provider,state.fixture.keyRef,flow.effectHash]);

async function finalizeStudio(db,state,flow,title,operationId){
  await consumeStudio(db,state,flow);
  await db.query(`SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,$4,$5::jsonb)`,[flow.request.attemptId,flow.token,flow.claim.executionFence,
    operationId,JSON.stringify(structuredContent(title,state.packageRow.anchor_manifest))]);
  const settlement=(await one(db,`SELECT public.studio_artifact_settle_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,120,120,240) result`,
    [...flow.budgetArgs,flow.budget.reservationId])).result;
  assert.equal(settlement.state,'settled');
  return (await one(db,'SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) result',[flow.request.attemptId,flow.token,flow.claim.executionFence])).result;
}

async function prepareSuccessor(db,{fresh}){
  const state=await prepare(db,{fresh:true});
  state.templateId=(await one(db,"SELECT id FROM public.studio_system_template_versions WHERE artifact_type='brd' AND superseded_at IS NULL")).id;
  const v2Activation=(await activateV2(db,state,7200)).result;
  assert.equal(v2Activation.validationRequired,false);
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton');
  const v2Flow=await requestClaimReserve(db,state,'v2-predecessor','studio-pr-b-2');
  const v2Finalized=await finalizeStudio(db,state,v2Flow,'BRD prompt-v2 predecessor','synthetic-brd-v2-predecessor');
  assert.equal(v2Finalized.state,'completed');
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  const heads=await one(db,'SELECT aggregate_version,current_version_id,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1',[state.fixture.artifactId]);
  assert.equal(heads.current_version_id,v2Finalized.versionId);assert.equal(heads.current_approved_version_id,state.v2);
  const draft3=await one(db,'SELECT * FROM public.studio_artifact_versions WHERE id=$1',[v2Finalized.versionId]);
  assert.deepEqual({version:Number(draft3.version),lifecycle:draft3.lifecycle},{version:3,lifecycle:'draft'});
  const priorQuality=await one(db,"SELECT * FROM public.synthetic_ai_brd_v2_quality_validation_windows WHERE campaign_id=$1 AND prompt_version='studio-pr-b-2'",[state.campaignId]);
  assert.equal(Number((await one(db,'SELECT count(*)::int n FROM public.synthetic_ai_campaign_effect_debits WHERE brd_v2_quality_window_id=$1 AND consumed_at IS NOT NULL',[priorQuality.id])).n),1);
  await db.query(`UPDATE public.ai_provider_configs SET last_validated_at=statement_timestamp()-CASE WHEN $2 THEN interval '1 hour' ELSE interval '25 hours' END WHERE id=$1`,[state.fixture.provider,fresh]);
  await applySyntheticAiTerminalJournalMigrationForTest(db,promptV3Migration,()=>transaction(db,promptV3Migration,async()=>db.query(await readMigration(promptV3Migration))));
  const before=await one(db,`SELECT md5((to_jsonb(quality_row)-'prior_quality_window_id')::text) quality,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(debit) ORDER BY debit.id),'[]'::jsonb)::text) FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=$1) debits
    FROM public.synthetic_ai_brd_v2_quality_validation_windows quality_row WHERE quality_row.id=$2`,[state.campaignId,priorQuality.id]);
  await applySyntheticAiTerminalJournalMigrationForTest(db,migration,()=>transaction(db,migration,async()=>db.query(migrationSql)));
  const after=await one(db,`SELECT md5((to_jsonb(quality_row)-'prior_quality_window_id')::text) quality,quality_row.prior_quality_window_id,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(debit) ORDER BY debit.id),'[]'::jsonb)::text) FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=$1) debits
    FROM public.synthetic_ai_brd_v2_quality_validation_windows quality_row WHERE quality_row.id=$2`,[state.campaignId,priorQuality.id]);
  assert.equal(after.quality,before.quality);assert.equal(after.debits,before.debits);assert.equal(after.prior_quality_window_id,null);
  return{...state,priorQuality,draft3,aggregateVersion:Number(heads.aggregate_version)};
}

const v3ActivationSql=`SELECT public.synthetic_ai_campaign_activate_brd_v3_quality_validation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) result`;
const activateV3=async(db,state,overrides={})=>one(db,v3ActivationSql,[state.fixture.requester,state.fixture.org,state.fixture.workspace,
  overrides.authorizationVersion??state.authorizationVersion,state.fingerprint,state.projectRef,state.campaignId,overrides.priorQuality??state.priorQuality.id,
  state.fixture.provider,state.fixture.keyRef,state.assessRoute,overrides.studioRoute??state.studioRoute,state.fixture.requester,
  overrides.generationAuthorizationVersion??state.authorizationVersion,state.packageRow.id,overrides.sourceHash??state.packageRow.package_hash,
  state.fixture.artifactId,state.templateId,overrides.currentVersion??state.draft3.id,state.v2,'e'.repeat(40),`sha256:${'f'.repeat(64)}`,overrides.seconds??3600]);
const reserveStudioFlow=async(db,state,flow)=>one(db,`SELECT public.synthetic_ai_campaign_reserve_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
  'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','studio.document.generate',$14,4000) result`,[state.fixture.requester,state.fixture.org,
  state.fixture.workspace,state.authorizationVersion,state.fingerprint,state.projectRef,flow.request.receiptId,flow.request.attemptId,flow.token,
  flow.claim.executionFence,state.studioRoute,state.fixture.provider,state.fixture.keyRef,flow.effectHash]);

const admin=new Client({connectionString:adminUrl});const opened=[];
try{
  await admin.connect();for(const name of names)await admin.query(`CREATE DATABASE ${name}`);
  const freshDb=new Client({connectionString:urlFor(names[0])});opened.push(freshDb);await freshDb.connect();const fresh=await prepareSuccessor(freshDb,{fresh:true});
  const acl=await one(freshDb,`SELECT c.relrowsecurity,c.relforcerowsecurity,
    has_function_privilege('anon','public.synthetic_ai_campaign_activate_brd_v3_quality_validation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,text,text,integer)','EXECUTE') anon_execute,
    has_function_privilege('authenticated','public.synthetic_ai_campaign_activate_brd_v3_quality_validation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,text,text,integer)','EXECUTE') authenticated_execute,
    has_function_privilege('service_role','public.synthetic_ai_campaign_activate_brd_v3_quality_validation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,text,text,integer)','EXECUTE') service_execute,
    has_table_privilege('service_role','public.synthetic_ai_brd_v2_quality_validation_windows','SELECT') service_select,
    has_table_privilege('service_role','public.synthetic_ai_brd_v2_quality_validation_windows','UPDATE') service_update
    FROM pg_catalog.pg_class c WHERE c.oid='public.synthetic_ai_brd_v2_quality_validation_windows'::regclass`);
  assert.deepEqual(acl,{relrowsecurity:true,relforcerowsecurity:true,anon_execute:false,authenticated_execute:false,service_execute:true,service_select:true,service_update:false});
  await expectedFailure(()=>activateV3(freshDb,fresh,{priorQuality:uuid()}),/SYNTHETIC_AI_BRD_V3_QUALITY_HISTORY_UNSAFE/);
  await expectedFailure(()=>activateV3(freshDb,fresh,{generationAuthorizationVersion:fresh.authorizationVersion+1}),/AUTHORIZATION|VERSION/);
  await expectedFailure(()=>activateV3(freshDb,fresh,{sourceHash:'0'.repeat(64)}),/SYNTHETIC_AI_BRD_V3_QUALITY_HISTORY_UNSAFE/);
  await expectedFailure(()=>activateV3(freshDb,fresh,{studioRoute:uuid()}),/SYNTHETIC_AI_BRD_V3_QUALITY_HISTORY_UNSAFE/);
  await expectedFailure(()=>activateV3(freshDb,fresh,{currentVersion:uuid()}),/SYNTHETIC_AI_BRD_V3_QUALITY_HISTORY_UNSAFE/);
  const freshActivation=(await activateV3(freshDb,fresh,{seconds:7200})).result;
  assert.equal(freshActivation.validationRequired,false);assert.equal(Number(freshActivation.maximumAggregateUsdNanos),5583912000);
  await expectedFailure(()=>activateV3(freshDb,fresh,{seconds:7199}),/SYNTHETIC_AI_BRD_V3_QUALITY_REPLAY_MISMATCH/);
  await freshDb.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton');
  await freshDb.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton');
  const direct=await requestClaimReserve(freshDb,fresh,'v3-direct','studio-pr-b-3',true);
  const raceClients=[new Client({connectionString:urlFor(names[0])}),new Client({connectionString:urlFor(names[0])})];opened.push(...raceClients);
  await Promise.all(raceClients.map(async client=>{await client.connect();await client.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({host:`${fresh.projectRef}.supabase.co`})])}));
  const raceResults=(await Promise.all(raceClients.map(client=>reserveStudioFlow(client,fresh,direct)))).map(row=>row.result);
  assert.equal(raceResults[0].reservationId,raceResults[1].reservationId);
  assert.equal(raceResults.filter(result=>result.ownsProviderEffect).length,1);assert.equal(raceResults.filter(result=>result.replayed).length,1);
  direct.permit=raceResults.find(result=>result.ownsProviderEffect);
  const finalized=await finalizeStudio(freshDb,fresh,direct,'BRD prompt-v3 quality fixture','synthetic-brd-v3-quality');
  assert.equal(finalized.state,'completed');
  const heads=await one(freshDb,'SELECT current_version_id,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1',[fresh.fixture.artifactId]);
  assert.equal(heads.current_version_id,finalized.versionId);assert.equal(heads.current_approved_version_id,fresh.v2);
  const draft4=await one(freshDb,'SELECT version,lifecycle FROM public.studio_artifact_versions WHERE id=$1',[finalized.versionId]);
  assert.deepEqual({version:Number(draft4.version),lifecycle:draft4.lifecycle},{version:4,lifecycle:'draft'});
  assert.deepEqual((await freshDb.query('SELECT id,content_hash,content FROM public.studio_artifact_versions WHERE id=ANY($1::uuid[]) ORDER BY id',[fresh.immutableVersions.map(version=>version.id)])).rows,fresh.immutableVersions);
  assert.deepEqual(await one(freshDb,'SELECT id,content_hash,content FROM public.studio_artifact_versions WHERE id=$1',[fresh.draft3.id]),
    {id:fresh.draft3.id,content_hash:fresh.draft3.content_hash,content:fresh.draft3.content});
  await freshDb.query('BEGIN');try{await expectedFailure(()=>requestClaimReserve(freshDb,fresh,'v3-second','studio-pr-b-3'),/SYNTHETIC_AI_CAMPAIGN_EFFECT_LIMIT_REACHED/)}finally{await freshDb.query('ROLLBACK')}
  const freshTotals=await one(freshDb,`SELECT count(*)::int debits,count(*) FILTER(WHERE brd_v2_quality_window_id IS NOT NULL)::int quality,
    869320000+sum(debit_usd_nanos)::bigint aggregate FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1`,[fresh.campaignId]);
  assert.deepEqual({debits:freshTotals.debits,quality:freshTotals.quality,aggregate:Number(freshTotals.aggregate)},{debits:10,quality:2,aggregate:5583912000});
  await freshDb.query('BEGIN');try{
    await freshDb.query('SET LOCAL session_replication_role=replica');
    await freshDb.query("UPDATE public.synthetic_ai_brd_v2_quality_validation_windows SET created_at=statement_timestamp()-interval '2 minutes',expires_at=statement_timestamp()-interval '1 minute' WHERE campaign_id=$1 AND prompt_version='studio-pr-b-3'",[fresh.campaignId]);
    await freshDb.query('SET LOCAL session_replication_role=origin');
    assert.equal((await one(freshDb,'SELECT public.synthetic_ai_campaign_active_until($1) value',[fresh.campaignId])).value,null);
  }finally{await freshDb.query('ROLLBACK')}
  pass('MAP-PG-BRD-V3-QUALITY-001-fresh','fresh v3 successor permits one replay-safe prompt-v3 generation, appends draft v4, preserves approved v2 and permanently excludes its v2 predecessor');

  const staleDb=new Client({connectionString:urlFor(names[1])});opened.push(staleDb);await staleDb.connect();const stale=await prepareSuccessor(staleDb,{fresh:false});
  const staleActivation=(await activateV3(staleDb,stale)).result;assert.equal(staleActivation.validationRequired,true);assert.equal(Number(staleActivation.maximumAggregateUsdNanos),6055371200);
  await staleDb.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton');
  const validation=await claimValidation(staleDb,stale,'v3-quality-validation');
  const validationPermit=(await reserveValidation(staleDb,stale,validation)).result;
  await consumeValidation(staleDb,stale,validation,validationPermit.reservationId);
  await staleDb.query('UPDATE public.ai_provider_configs SET last_validated_at=statement_timestamp() WHERE id=$1',[stale.fixture.provider]);
  await staleDb.query(`UPDATE public.enterprise_ai_command_receipts SET status='committed',response='{"validated":true}'::jsonb,completed_at=statement_timestamp() WHERE id=$1`,[validation.id]);
  await staleDb.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton');
  const afterValidation=await requestClaimReserve(staleDb,stale,'v3-after-validation','studio-pr-b-3');
  const staleFinalized=await finalizeStudio(staleDb,stale,afterValidation,'BRD prompt-v3 stale fixture','synthetic-brd-v3-stale');
  assert.equal(staleFinalized.state,'completed');
  const extraValidation=await claimValidation(staleDb,stale,'v3-validation-extra');
  await expectedFailure(()=>reserveValidation(staleDb,stale,extraValidation),/SYNTHETIC_AI_CAMPAIGN_EFFECT_LIMIT_REACHED/);
  const staleTotals=await one(staleDb,`SELECT count(*)::int debits,count(*) FILTER(WHERE brd_v2_quality_window_id IS NOT NULL)::int quality,
    869320000+sum(debit_usd_nanos)::bigint aggregate FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1`,[stale.campaignId]);
  assert.deepEqual({debits:staleTotals.debits,quality:staleTotals.quality,aggregate:Number(staleTotals.aggregate)},{debits:11,quality:3,aggregate:6055371200});
  pass('MAP-PG-BRD-V3-QUALITY-002-stale','stale v3 successor requires one successful validation before one prompt-v3 generation and rejects every additional paid slot');
  console.log('synthetic AI BRD-v3 quality validation PostgreSQL: 2 focused scenarios passed; zero provider calls, zero secret reads, zero hosted access');
}finally{
  await Promise.allSettled(opened.map(client=>client.end()));const failures=[];
  for(const name of names){try{await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);if(Number((await one(admin,'SELECT count(*)::int n FROM pg_database WHERE datname=$1',[name])).n)!==0)failures.push(`${name}:still_present`);else console.log(`ASSESS_DOCUMENT_MAPPING_PG_CLEANUP ${JSON.stringify({database:name,status:'dropped_and_absent'})}`)}catch(error){failures.push(`${name}:${error?.code??'UNKNOWN'}`)}}
  await admin.end();if(failures.length)throw new Error(`SYNTHETIC_AI_BRD_V3_QUALITY_DATABASE_CLEANUP_FAILED:${failures.join(',')}`);
}
