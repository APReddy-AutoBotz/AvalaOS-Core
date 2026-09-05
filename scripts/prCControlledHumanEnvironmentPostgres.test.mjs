import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { PostgresEnvironmentAdapter, assertTargetInventory, buildIdentifiers, controlledHumanStepEvidenceSpec, deriveContext, deterministicUuid, loadFixture, postDeprovisionVerify, seedAssessUpstream, sha256, validateControlledHumanObserverEnvelopeBridge } from './prCControlledHumanEnvironment.mjs';
import {MIGRATION_FILE,PostgresEnvironmentMigrationAdapter,deriveMigrationContext,loadMigration,migrationApply,migrationPreflight,migrationVerify} from './prCControlledHumanEnvironmentMigration.mjs';
import {CONTROLLED_HUMAN_CATALOG,CONTROLLED_HUMAN_EXECUTION_ORDER,CONTROLLED_HUMAN_SERVER_ACTIONS,HUMAN_DUTY_BY_PERSONA,validateControlledHumanObservedDuty,validateControlledHumanProofPairs} from './prCControlledHumanEvidenceContract.mjs';

const {Client}=pg;
const adminUrl=process.env.PR_C_CONTROLLED_HUMAN_TEST_DATABASE_URL;
const jsonTextSha=value=>sha256(JSON.stringify(value));
const denialManualItems=[{clientKey:'item-0001',itemType:'Task',title:'Synthetic denial probe',description:'Synthetic non-production authorization denial probe.',acceptanceCriteria:['The real production authority rejects this request.'],nonFunctionalRequirements:['No side effect is committed.']}];
const denialManualSelectors={manualBriefDigest:sha256('Synthetic controlled-human denial probe'),orderedItemsDigest:sha256(denialManualItems),itemCount:1};

test('PostgreSQL 16 applies exact migration and repeats two complete seed/deprovision cycles with retained history',{skip:!adminUrl},async()=>{
  const suffix=`${process.pid}_${Date.now()}`;const databaseName=`pr_c_controlled_human_${suffix}`;
  const url=new URL(adminUrl);const databaseUrl=new URL(adminUrl);databaseUrl.pathname=`/${databaseName}`;
  const admin=new Client({connectionString:url.toString()});await admin.connect();let database;let migrationAdapter;
  try{
    for(const [role,attributes] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']])
      if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)await admin.query(`create role ${role} ${attributes}`);
    assert.match(databaseName,/^[a-z0-9_]+$/u);await admin.query(`create database ${databaseName}`);
    const bootstrap=new Client({connectionString:databaseUrl.toString()});await bootstrap.connect();
    await bootstrap.query(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}'::jsonb);create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade);create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[] not null,name text not null);`);
    const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
    const migrationIndex=migrations.indexOf(MIGRATION_FILE.split('/').at(-1));assert.ok(migrationIndex>0);
    for(const name of migrations.slice(0,migrationIndex)){const sql=await readFile(join('supabase/migrations',name),'utf8');await bootstrap.query('begin');try{await bootstrap.query(sql);await bootstrap.query(`insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2::text[],$3)`,[name.slice(0,14),[sql],name.slice(15,-4)]);await bootstrap.query('commit')}catch(error){await bootstrap.query('rollback');throw new Error(`${name}: ${error.message}`)}}
    const identity=(await bootstrap.query(`select (select system_identifier::text from pg_control_system()) system_identifier,current_database() database_name,current_user database_role`)).rows[0];
    const targetFingerprint=sha256(`${identity.system_identifier}\0${identity.database_name}\0${identity.database_role}`);await bootstrap.end();
    const fixtureState=await loadFixture();const head='83cab00bee481df22351302cc8c1c00bda3f1664';const migration=await loadMigration();
    const baseEnvironment={PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS:'hosted_nonproduction_pilot',PR_C_CONTROLLED_HUMAN_PR_NUMBER:'264',PR_C_CONTROLLED_HUMAN_RELEASE_SHA:head,PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:head,PR_C_CONTROLLED_HUMAN_DEPLOY_ID:'6a99cc001122334455667788',PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN:'https://deploy-preview-264--avalaos-pilot.netlify.app',PR_C_CONTROLLED_HUMAN_EXERCISE_ID:'40000000-0000-4000-8000-000000000264',PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:targetFingerprint,PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:`sha256:${'1'.repeat(64)}`,PR_C_CONTROLLED_HUMAN_SITE_NAME:'avalaos-pilot',PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT:'deploy-preview'};
    const context=deriveContext(baseEnvironment,fixtureState,{head,dirty:''});const migrationContext=deriveMigrationContext({...baseEnvironment,PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST:migration.digest},fixtureState,migration,{head,dirty:''});
    migrationAdapter=new PostgresEnvironmentMigrationAdapter(databaseUrl.toString(),migration.sql);await migrationAdapter.connect();assert.equal((await migrationPreflight(migrationContext,migrationAdapter)).disposition,'exact_additive_apply');
    try { assert.equal((await migrationApply(migrationContext,migrationAdapter,migration)).replayed,false); }
    catch(error) { throw new Error(`${error.message} position=${error.position??'unknown'} where=${error.where??'unknown'}`,{cause:error}); }
    await migrationVerify(migrationContext,migrationAdapter);assert.equal((await migrationApply(migrationContext,migrationAdapter,migration)).replayed,true);await migrationAdapter.close();migrationAdapter=null;
    database=new PostgresEnvironmentAdapter(databaseUrl.toString());await database.connect();
    const abortContext=deriveContext({...baseEnvironment,PR_C_CONTROLLED_HUMAN_EXERCISE_ID:'40000000-0000-4000-8000-000000000263'},fixtureState,{head,dirty:''});const partialUser=deterministicUuid(abortContext.exerciseId,'partial-auth-user');
    await database.prepareRecovery(abortContext,'apply',0);await database.client.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'prc264.partial@example.invalid',$2::jsonb)`,[partialUser,JSON.stringify({synthetic:true,exerciseDigest:abortContext.exerciseDigest,personaKey:'requester'})]);await database.recordAuthUser(abortContext,partialUser);
    await assert.rejects(database.completeRecovery(abortContext,'apply'),/PR_C_CONTROLLED_HUMAN_RECOVERY_REJECTED/u);
    await assert.rejects(database.prepareRecovery({...abortContext,deployId:'f'.repeat(24)},'abort',0),/PR_C_CONTROLLED_HUMAN_RECOVERY_REJECTED/u);
    await assert.rejects(database.prepareRecovery(abortContext,'expiry',0),/PR_C_CONTROLLED_HUMAN_RECOVERY_REJECTED/u);
    await database.prepareRecovery(abortContext,'abort',0);await assert.rejects(database.completeRecovery(abortContext,'abort'),/PR_C_CONTROLLED_HUMAN_RECOVERY_REJECTED/u);
    await database.client.query('delete from auth.users where id=$1',[partialUser]);await database.completeRecovery(abortContext,'abort');assert.equal((await database.recoveryAuthority(abortContext,'abort')).state,'completed');
    const users=fixtureState.personas.map((persona,index)=>({id:deterministicUuid(context.exerciseId,`postgres-user-${index}`),email:`prc264.postgres.${index}@example.invalid`,key:persona.key,state:persona.state,credentialGenerationDigest:sha256({exerciseDigest:context.exerciseDigest,personaKey:persona.key,index})}));
    const applyRecovery=await database.prepareRecovery(context,'apply',0);assert.equal(applyRecovery.state,'prepared');
    for(const user of users)await database.client.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[user.id,user.email,JSON.stringify({synthetic:true,exerciseDigest:context.exerciseDigest,personaKey:user.key})]);
    for(const user of users)await database.recordAuthUser(context,user.id);
    const seeded=await database.seed(context,fixtureState,users);assert.deepEqual(seeded,{replayed:false,personaCount:12,studioArtifactCount:2,eligibleStudioArtifactCount:2,packageCount:2,baselineCount:1,transcriptSourceCount:4,sourceSetCount:2,inputBundleCount:2,candidateCount:2,conflictCount:1,tenantTemplateCount:1,lifecycle:'active',concurrencyVersion:1});
    const preCompletionInventory=await database.inspect(context);assertTargetInventory(preCompletionInventory,context);
    const completionRaceScope=(await database.client.query(`select org_id,workspace_id from public.pr_c_controlled_human_exercises where exercise_digest=$1`,[context.exerciseDigest])).rows[0];
    const lateProviderReceiptId=deterministicUuid(context.exerciseId,'late-provider-recovery-completion-race');
    const lateProviderRequestId=deterministicUuid(context.exerciseId,'late-provider-recovery-completion-request');
    await database.client.query('begin');
    try{
      await database.client.query(`insert into public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,initial_request_id,last_request_id,request_hash,status,response) values($1,$2,$3,$4,'provider.validate','provider','late-provider-recovery-completion',$5,$5,$6,'claimed','{}'::jsonb)`,[lateProviderReceiptId,completionRaceScope.org_id,completionRaceScope.workspace_id,users[0].id,lateProviderRequestId,'a'.repeat(64)]);
      await database.client.query('savepoint late_provider_completion_boundary');
      await assert.rejects(database.completeRecovery(context,'apply'),/PR_C_CONTROLLED_HUMAN_PROVIDER_STATE_REJECTED/u);
      await database.client.query('rollback to savepoint late_provider_completion_boundary');
      assert.notEqual((await database.recoveryAuthority(context,'apply')).state,'completed');
    }finally{
      await database.client.query('rollback');
    }
    await database.completeRecovery(context,'apply');assert.equal((await database.recoveryAuthority(context,'apply')).state,'completed');
    await assert.rejects(database.client.query(`insert into public.pr_c_controlled_human_exercises(id,exercise_digest,environment_class,pull_request_number,release_sha,review_head_sha,deploy_id,deploy_origin,target_fingerprint,public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,org_id,workspace_id,lifecycle,quiesced_at,deprovisioned_at)
      select $1,$2,environment_class,pull_request_number,release_sha,review_head_sha,deploy_id,'https://deploy-preview-264--substituted-site.netlify.app',target_fingerprint,public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,org_id,workspace_id,'deprovisioned',statement_timestamp(),statement_timestamp()
      from public.pr_c_controlled_human_exercises where exercise_digest=$3`,[deterministicUuid(context.exerciseId,'wrong-origin-exercise'),`sha256:${'f'.repeat(64)}`,context.exerciseDigest]),/check constraint/u);
    const verified=await database.verify(context,12);assert.equal(verified.activeMembershipCount,11);assert.equal(verified.studioArtifactCount,2);assert.equal(verified.eligibleStudioArtifactCount,2);assert.equal(verified.packageCount,2);assert.equal(verified.baselineCount,1);assert.equal(verified.providerRowCount,0);
    const attestation=(await database.client.query(`select public.pr_c_controlled_human_public_attestation($1,$2,$3,$4,$5,$6) result`,[context.releaseSha,context.reviewHeadSha,context.deployId,context.deployOrigin,context.exerciseDigest,context.publicTargetDigest])).rows[0].result;
    assert.equal(attestation.attested,true);assert.equal(attestation.exerciseDigest,context.exerciseDigest);assert.equal(Object.hasOwn(attestation,'organizationId'),false);
    await assert.rejects(database.client.query(`select public.pr_c_controlled_human_public_attestation($1,$2,$3,$4,$5,$6)`,[context.releaseSha,context.reviewHeadSha,context.deployId,'https://avalaos.com',context.exerciseDigest,context.publicTargetDigest]),/PR_C_CONTROLLED_HUMAN_ATTESTATION_MISMATCH/u);
    // Mutually exclusive human outcomes run in independent transactions. Capture a
    // step only after the real completion RPC succeeds, before that fixture rolls
    // back, so the final catalog equality check cannot hide an unexecuted branch.
    const completedPositiveSteps=new Set();
    const authenticProofPairs=[];
    const recordBinding=(binding,anchor,result)=>{
      assert.equal(binding.result,result);assert.ok(anchor?.challengeToken);
      const contract=CONTROLLED_HUMAN_SERVER_ACTIONS.find(item=>item.stepId===binding.stepId);assert.ok(contract);
      authenticProofPairs.push({checkpointId:contract.checkpointId,stepId:binding.stepId,anchor,binding});
      return binding;
    };
    const recordPositiveBinding=(binding,anchor)=>{completedPositiveSteps.add(binding.stepId);return recordBinding(binding,anchor,'succeeded')};
    const recordNegativeBinding=(binding,anchor)=>recordBinding(binding,anchor,'denied');
    let generationBinding=(await database.client.query(`select artifact.id artifact_id,artifact.aggregate_version,artifact.current_version_id,artifact.current_approved_version_id,package.id source_package_id,package.version source_package_version,package.package_hash,
      template.id template_id,template.current_approved_version_id template_version_id,version.version template_version,version.template_hash,binding.auth_user_id actor_id,authority.version authorization_version,exercise.org_id,exercise.workspace_id
      from public.pr_c_controlled_human_exercises exercise join public.pr_c_controlled_human_persona_bindings binding on binding.exercise_id=exercise.id and binding.persona_key='requester'
      join public.authorization_versions authority on authority.org_id=exercise.org_id and authority.user_id=binding.auth_user_id
      join public.studio_artifact_aggregates artifact on artifact.org_id=exercise.org_id and artifact.workspace_id=exercise.workspace_id and artifact.source_mode='assess_handoff'
      join public.studio_artifact_source_packages package on package.id=artifact.source_package_id
      join public.studio_tenant_template_aggregates template on template.org_id=exercise.org_id and template.workspace_id=exercise.workspace_id and template.lifecycle='approved'
      join public.studio_tenant_template_versions version on version.id=template.current_approved_version_id where exercise.exercise_digest=$1`,[context.exerciseDigest])).rows[0];
    let generationCommand={contractVersion:'pr-c-controlled-human-synthetic-studio-generation-1',actorId:generationBinding.actor_id,requestId:deterministicUuid(context.exerciseId,'synthetic-generation-request'),idempotencyKey:'synthetic-generation-exact',organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,authorizationVersion:Number(generationBinding.authorization_version),environmentClass:'hosted_nonproduction_pilot',prNumber:264,releaseSha:context.releaseSha,reviewHeadSha:context.reviewHeadSha,deployId:context.deployId,deployOrigin:context.deployOrigin,exerciseDigest:context.exerciseDigest,targetFingerprint:context.targetFingerprint,artifactId:generationBinding.artifact_id,sourcePackageId:generationBinding.source_package_id,sourcePackageVersion:Number(generationBinding.source_package_version),sourcePackageHash:generationBinding.package_hash,expectedAggregateVersion:Number(generationBinding.aggregate_version),expectedCurrentVersionId:generationBinding.current_version_id,expectedApprovedVersionId:generationBinding.current_approved_version_id,template:{kind:'tenant',templateId:generationBinding.template_id,versionId:generationBinding.template_version_id,version:Number(generationBinding.template_version),hash:generationBinding.template_hash}};
    const generationSnapshot=async()=>(await database.client.query(`select
      (select count(*)::int from public.pr_c_controlled_human_synthetic_generation_receipts) receipts,
      (select count(*)::int from public.studio_artifact_versions where artifact_id=$1) versions,
      (select count(*)::int from public.privileged_audit_events where action='pr_c.controlled_human.synthetic_studio_generate') audits,
      (select count(*)::int from public.studio_artifact_generation_attempts) attempts,
      aggregate_version,current_version_id,current_approved_version_id from public.studio_artifact_aggregates where id=$1`,[generationBinding.artifact_id])).rows[0];
    const providerBoundaryLabels=new Set(['provider row present','provider job ledger present','provider usage ledger present','provider job attempt present','provider staged extraction present','legacy AI generation job present','legacy AI usage event present','provider audit event present','provider effect journal present','provider runtime effect present','nonoffline provider job effect present','Studio generation attempt present','isolated provider key reference','isolated pilot provider binding','isolated provider budget reservation','isolated provider cleanup job','isolated standalone provider receipt','isolated usage ledger','isolated job attempt','isolated staged result','isolated provider effect']);
    const rejectGeneration=async({label,command=generationCommand,mutate,pattern})=>{
      const before=await generationSnapshot();await database.client.query('begin');
      try{
        if(mutate)await mutate();
        if(providerBoundaryLabels.has(label)){
          const inventory=await database.inspect(context);assert.ok(Number(inventory.providerRows)>0,`${label} must reach the canonical provider predicate`);
          assert.throws(()=>assertTargetInventory(inventory,context),/PROVIDER_STATE_REJECTED/u,`${label} preflight/observer inventory boundary`);
          const lifecycle=await database.lifecycleInspection(context);assert.ok(Number(lifecycle.safety.realProviderCalls)>0||Number(lifecycle.safety.providerEgress)>0,`${label} terminal observation boundary`);
          await database.client.query('savepoint provider_attestation_boundary');
          await assert.rejects(database.client.query(`select public.pr_c_controlled_human_public_attestation($1,$2,$3,$4,$5,$6)`,[context.releaseSha,context.reviewHeadSha,context.deployId,context.deployOrigin,context.exerciseDigest,context.publicTargetDigest]),/ATTESTATION_MISMATCH/u,`${label} unauthenticated browser attestation boundary`);
          await database.client.query('rollback to savepoint provider_attestation_boundary');
          await database.client.query('savepoint provider_final_boundary');
          await assert.rejects(database.client.query(`select public.pr_c_controlled_human_assert_provider_state()`),/PROVIDER_STATE_REJECTED/u,`${label} canonical final boundary`);
          await database.client.query('rollback to savepoint provider_final_boundary');
          await database.client.query('savepoint provider_recovery_boundary');
          await assert.rejects(database.prepareRecovery(context,'quiesce',1),/PROVIDER_STATE_REJECTED/u,`${label} recovery preflight boundary`);
          await database.client.query('rollback to savepoint provider_recovery_boundary');
          await database.client.query('savepoint provider_quiesce_boundary');
          await assert.rejects(database.quiesce(context,1),/PROVIDER_STATE_REJECTED/u,`${label} quiesce boundary`);
          await database.client.query('rollback to savepoint provider_quiesce_boundary');
        }
        await database.client.query('savepoint provider_generation_boundary');
        await assert.rejects(database.client.query(`select public.pr_c_controlled_human_synthetic_studio_generate($1::jsonb)`,[JSON.stringify(command)]),pattern,label);
        await database.client.query('rollback to savepoint provider_generation_boundary');
      }finally{await database.client.query('rollback')}
      assert.deepEqual(await generationSnapshot(),before,`${label} changed generation state`);
    };
    const reviewer=users.find(user=>user.key==='studio_reviewer');
    const substitutedCommands=[
      ['wrong exact head',{...generationCommand,releaseSha:'e'.repeat(40),reviewHeadSha:'e'.repeat(40)}],
      ['wrong deploy',{...generationCommand,deployId:'e'.repeat(24)}],
      ['wrong exercise',{...generationCommand,exerciseDigest:`sha256:${'e'.repeat(64)}`}],
      ['wrong target',{...generationCommand,targetFingerprint:`sha256:${'e'.repeat(64)}`}],
      ['wrong scope',{...generationCommand,organizationId:deterministicUuid(context.exerciseId,'wrong-command-org'),workspaceId:deterministicUuid(context.exerciseId,'wrong-command-workspace')}],
      ['non-requester persona',{...generationCommand,actorId:reviewer.id,authorizationVersion:1}],
      ['stale authorization',{...generationCommand,authorizationVersion:generationCommand.authorizationVersion+1}],
      ['wrong source package',{...generationCommand,sourcePackageId:deterministicUuid(context.exerciseId,'wrong-source-package')}],
      ['wrong source version',{...generationCommand,sourcePackageVersion:generationCommand.sourcePackageVersion+1}],
      ['wrong source hash',{...generationCommand,sourcePackageHash:'e'.repeat(64)}],
      ['wrong aggregate version',{...generationCommand,expectedAggregateVersion:generationCommand.expectedAggregateVersion+1}],
      ['wrong current version',{...generationCommand,expectedCurrentVersionId:deterministicUuid(context.exerciseId,'wrong-current-version')}],
      ['wrong approved version',{...generationCommand,expectedApprovedVersionId:deterministicUuid(context.exerciseId,'wrong-approved-version')}],
      ['wrong template id',{...generationCommand,template:{...generationCommand.template,templateId:deterministicUuid(context.exerciseId,'wrong-template')}}],
      ['wrong template version id',{...generationCommand,template:{...generationCommand.template,versionId:deterministicUuid(context.exerciseId,'wrong-template-version')}}],
      ['wrong template version',{...generationCommand,template:{...generationCommand.template,version:generationCommand.template.version+1}}],
      ['wrong template hash',{...generationCommand,template:{...generationCommand.template,hash:'e'.repeat(64)}}],
    ];
    for(const [label,command] of substitutedCommands)await rejectGeneration({label,command});
    const mutationCases=[
      ['requester capability revoked',()=>database.client.query(`delete from public.role_capabilities capability using public.pr_c_controlled_human_persona_bindings binding where binding.exercise_id=$1 and binding.persona_key='requester' and capability.role_id=binding.role_id and capability.capability_key='studio.artifacts.generate'`,[context.exerciseId])],
      ['source package currentness',()=>database.client.query(`update public.studio_artifact_aggregates set source_package_hash=$2 where id=$1`,[generationBinding.artifact_id,'e'.repeat(64)])],
      ['template aggregate currentness',()=>database.client.query(`update public.studio_tenant_template_aggregates set current_version=current_version+1 where id=$1`,[generationBinding.template_id])],
      ['template artifact class',()=>database.client.query(`update public.studio_tenant_template_aggregates set artifact_class='pdd' where id=$1`,[generationBinding.template_id])],
      ['Studio runtime read only',()=>database.client.query(`update public.studio_artifact_runtime_control set read_only=true where singleton`)],
      ['Studio runtime disabled',()=>database.client.query(`update public.studio_artifact_runtime_control set enabled=false where singleton`)],
      ['Studio provider enabled',()=>database.client.query(`update public.studio_artifact_runtime_control set provider_enabled=true where singleton`)],
      ['Enterprise runtime read only',()=>database.client.query(`update public.enterprise_intelligence_runtime_control set read_only=true where singleton`)],
      ['Enterprise runtime disabled',()=>database.client.query(`update public.enterprise_intelligence_runtime_control set enabled=false where singleton`)],
      ['Enterprise provider enabled',()=>database.client.query(`update public.enterprise_intelligence_runtime_control set provider_enabled=true where singleton`)],
      ['provider row present',()=>database.client.query(`insert into public.hosted_pilot_provider_simulations(org_id,workspace_id,actor_id,idempotency_key,scenario,request_sha256,result_sha256,outcome) values($1,$2,$3,'synthetic-provider-row','success',$4,$5,'simulated_success')`,[generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,'a'.repeat(64),'b'.repeat(64)])],
      ['provider job ledger present',()=>database.client.query(`insert into public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider,model,prompt_key,prompt_version,source_refs,actor_id,request_id,idempotency_key,status,approval_state,metadata) values($1,$2,$3,'studio.document.generate','openai','forbidden-provider-model','forbidden-provider-job','1','[]'::jsonb,$4,$5,'forbidden-provider-job','queued','review_required','{}'::jsonb)`,[deterministicUuid(context.exerciseId,'forbidden-provider-job'),generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,deterministicUuid(context.exerciseId,'forbidden-provider-job-request')])],
      ['provider usage ledger present',async()=>{
        const providerId=deterministicUuid(context.exerciseId,'forbidden-usage-provider'),jobId=deterministicUuid(context.exerciseId,'forbidden-usage-job');
        await database.client.query(`insert into public.ai_provider_configs(id,org_id,provider,display_name,default_model,status,created_by,updated_by) values($1,$2,'openai','Forbidden usage provider','forbidden-model','active',$3,$3)`,[providerId,generationBinding.org_id,generationBinding.actor_id]);
        await database.client.query(`insert into public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,source_refs,actor_id,request_id,idempotency_key,status,approval_state,metadata) values($1,$2,$3,'studio.document.generate',$4,'openai','forbidden-model','forbidden-usage','1','[]'::jsonb,$5,$6,'forbidden-usage-job','queued','review_required','{}'::jsonb)`,[jobId,generationBinding.org_id,generationBinding.workspace_id,providerId,generationBinding.actor_id,deterministicUuid(context.exerciseId,'forbidden-usage-request')]);
        await database.client.query(`insert into public.enterprise_ai_usage_ledger(job_id,provider_config_id,org_id,workspace_id,provider,model,input_tokens,output_tokens) values($1,$2,$3,$4,'openai','forbidden-model',1,1)`,[jobId,providerId,generationBinding.org_id,generationBinding.workspace_id]);
      }],
      ['provider job attempt present',async()=>{
        const receiptId=deterministicUuid(context.exerciseId,'forbidden-attempt-receipt'),jobId=deterministicUuid(context.exerciseId,'forbidden-attempt-job'),requestId=deterministicUuid(context.exerciseId,'forbidden-attempt-request');
        await database.client.query(`insert into public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,initial_request_id,last_request_id,request_hash,status,resource_id,response) values($1,$2,$3,$4,'studio.document.generate','provider','forbidden-attempt',$5,$5,$6,'claimed',$2,'{}'::jsonb)`,[receiptId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,requestId,'a'.repeat(64)]);
        await database.client.query(`insert into public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider,model,prompt_key,prompt_version,source_refs,actor_id,request_id,idempotency_key,status,approval_state,metadata,receipt_id) values($1,$2,$3,'studio.document.generate','openai','forbidden-model','forbidden-attempt','1','[]'::jsonb,$4,$5,'forbidden-attempt-job','running','review_required','{}'::jsonb,$6)`,[jobId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,requestId,receiptId]);
        await database.client.query(`insert into public.enterprise_ai_job_attempts(job_id,receipt_id,org_id,workspace_id,actor_id,execution_token,execution_fence,attempt_number,attempt_kind,lease_expires_at) values($1,$2,$3,$4,$5,$6,1,1,'claimed',statement_timestamp()+interval '5 minutes')`,[jobId,receiptId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,deterministicUuid(context.exerciseId,'forbidden-attempt-token')]);
      }],
      ['provider staged extraction present',async()=>{
        const source=(await database.client.query(`select source.id source_id,version.id source_version_id from public.enterprise_evidence_sources source join public.enterprise_evidence_source_versions version on version.source_id=source.id where source.org_id=$1 and source.workspace_id=$2 limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
        const providerId=deterministicUuid(context.exerciseId,'forbidden-stage-provider'),routeId=deterministicUuid(context.exerciseId,'forbidden-stage-route'),receiptId=deterministicUuid(context.exerciseId,'forbidden-stage-receipt'),jobId=deterministicUuid(context.exerciseId,'forbidden-stage-job'),requestId=deterministicUuid(context.exerciseId,'forbidden-stage-request');
        await database.client.query(`insert into public.ai_provider_configs(id,org_id,provider,display_name,default_model,status,created_by,updated_by) values($1,$2,'openai','Forbidden stage provider','forbidden-model','active',$3,$3)`,[providerId,generationBinding.org_id,generationBinding.actor_id]);
        await database.client.query(`insert into public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,created_by,updated_by) values($1,$2,$3,$4,'assess.evidence.extract','forbidden-model',true,$5,$5)`,[routeId,generationBinding.org_id,generationBinding.workspace_id,providerId,generationBinding.actor_id]);
        await database.client.query(`insert into public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,initial_request_id,last_request_id,request_hash,status,resource_id,response,completed_at) values($1,$2,$3,$4,'evidence.extract','provider','forbidden-stage',$5,$5,$6,'committed',$7,'{}'::jsonb,statement_timestamp())`,[receiptId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,requestId,'a'.repeat(64),source.source_id]);
        await database.client.query(`insert into public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,source_refs,actor_id,request_id,idempotency_key,status,output_hash,approval_state,metadata,receipt_id,source_id,source_version_id,route_id) values($1,$2,$3,'assess.evidence.extract',$4,'openai','forbidden-model','forbidden-stage','1','[]'::jsonb,$5,$6,'forbidden-stage-job','succeeded',$7,'review_required','{}'::jsonb,$8,$9,$10,$11)`,[jobId,generationBinding.org_id,generationBinding.workspace_id,providerId,generationBinding.actor_id,requestId,'b'.repeat(64),receiptId,source.source_id,source.source_version_id,routeId]);
        await database.client.query(`insert into public.enterprise_ai_extraction_staged_results(job_id,receipt_id,org_id,workspace_id,actor_id,source_id,source_version_id,route_id,provider_config_id,provider,model,request_hash,output_hash,latency_ms,token_input,token_output,candidates,safe_result,staged_payload_hash,execution_token,execution_fence) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'openai','forbidden-model',$10,$11,1,1,1,'[]'::jsonb,'{}'::jsonb,$12,$13,1)`,[jobId,receiptId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,source.source_id,source.source_version_id,routeId,providerId,'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),deterministicUuid(context.exerciseId,'forbidden-stage-token')]);
      }],
      ['legacy AI generation job present',()=>database.client.query(`insert into public.ai_generation_jobs(id,org_id,user_id,job_type,status,model,input_refs,output_ref) values($1,$2,$3,'generate_document','queued','forbidden-model','{}'::jsonb,'{}'::jsonb)`,[deterministicUuid(context.exerciseId,'forbidden-legacy-generation'),generationBinding.org_id,generationBinding.actor_id])],
      ['legacy AI usage event present',()=>database.client.query(`insert into public.ai_usage_events(id,org_id,user_id,provider,model,input_tokens,output_tokens,total_tokens,metadata) values($1,$2,$3,'openai','forbidden-model',1,1,2,'{}'::jsonb)`,[deterministicUuid(context.exerciseId,'forbidden-legacy-usage'),generationBinding.org_id,generationBinding.actor_id])],
      ['provider audit event present',()=>database.client.query(`insert into public.ai_provider_audit_events(id,event_type,org_id,workspace_id,provider,operation,status,actor_id,metadata) values($1,'provider_probe',$2,$3,'openai','synthetic-test','recorded',$4,'{"synthetic":true}'::jsonb)`,[deterministicUuid(context.exerciseId,'forbidden-provider-audit'),generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id])],
      ['provider effect journal present',async()=>{
        const receiptId=deterministicUuid(context.exerciseId,'forbidden-provider-effect-receipt');
        const requestId=deterministicUuid(context.exerciseId,'forbidden-provider-effect-request');
        await database.client.query(`insert into public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,initial_request_id,last_request_id,request_hash,status,resource_id,response,completed_at) values($1,$2,$3,$4,'provider.validate','ingestion','forbidden-provider-effect',$5,$5,$6,'committed',$2,'{}'::jsonb,statement_timestamp())`,[receiptId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,requestId,'a'.repeat(64)]);
        await database.client.query(`insert into public.enterprise_ai_effect_journal(receipt_id,org_id,workspace_id,operation_type,effect_key,resource_id,terminal_status,safe_result,result_hash,execution_fence) values($1,$2,$3,'provider.execute','forbidden-provider-effect',$2,'committed','{}'::jsonb,public.enterprise_sha256_jsonb('{}'::jsonb),1)`,[receiptId,generationBinding.org_id,generationBinding.workspace_id]);
      }],
      ['provider runtime effect present',async()=>{
        const receiptId=deterministicUuid(context.exerciseId,'forbidden-provider-runtime-receipt'),requestId=deterministicUuid(context.exerciseId,'forbidden-provider-runtime-request');
        await database.client.query(`insert into public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,initial_request_id,last_request_id,request_hash,status,resource_id,response,completed_at) values($1,$2,$3,$4,'evidence.extract','provider','forbidden-provider-runtime',$5,$5,$6,'committed',$2,'{}'::jsonb,statement_timestamp())`,[receiptId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,requestId,'a'.repeat(64)]);
        await database.client.query(`insert into public.enterprise_ai_effect_journal(receipt_id,org_id,workspace_id,operation_type,effect_key,resource_id,terminal_status,safe_result,result_hash,execution_fence) values($1,$2,$3,'evidence.extract','forbidden-provider-runtime',$2,'committed','{}'::jsonb,public.enterprise_sha256_jsonb('{}'::jsonb),1)`,[receiptId,generationBinding.org_id,generationBinding.workspace_id]);
      }],
      ['nonoffline provider job effect present',async()=>{
        const receiptId=deterministicUuid(context.exerciseId,'forbidden-model-effect-receipt'),requestId=deterministicUuid(context.exerciseId,'forbidden-model-effect-request'),jobId=deterministicUuid(context.exerciseId,'forbidden-model-effect-job');
        await database.client.query(`insert into public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,initial_request_id,last_request_id,request_hash,status,resource_id,response,completed_at) values($1,$2,$3,$4,'evidence.extract','ingestion','forbidden-model-effect',$5,$5,$6,'committed',$2,'{}'::jsonb,statement_timestamp())`,[receiptId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,requestId,'a'.repeat(64)]);
        await database.client.query(`insert into public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider,model,prompt_key,prompt_version,source_refs,actor_id,request_id,idempotency_key,status,output_hash,approval_state,metadata,receipt_id) values($1,$2,$3,'assess.evidence.extract','openai','forbidden-model','forbidden-model-effect','1','[]'::jsonb,$4,$5,'forbidden-model-effect','succeeded',$6,'review_required','{}'::jsonb,$7)`,[jobId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,requestId,'b'.repeat(64),receiptId]);
        await database.client.query(`insert into public.enterprise_ai_effect_journal(receipt_id,org_id,workspace_id,operation_type,effect_key,resource_id,terminal_status,safe_result,result_hash,execution_fence) values($1,$2,$3,'evidence.extract','forbidden-model-effect',$2,'committed','{}'::jsonb,public.enterprise_sha256_jsonb('{}'::jsonb),1)`,[receiptId,generationBinding.org_id,generationBinding.workspace_id]);
      }],
      ['Studio generation attempt present',async()=>{
        // Superuser-only fixture bypass creates an otherwise valid retained row;
        // the controller predicate, not production triggers, must fail closed.
        await database.client.query(`alter table public.studio_artifact_generation_attempts disable trigger user`);
        await database.client.query(`insert into public.studio_artifact_generation_attempts(id,artifact_id,org_id,workspace_id,requested_by,request_id,tenant_template_version_id,input_hash,state,source_package_id,source_package_hash,template_kind,template_version,template_hash,expected_aggregate_version,expected_current_version_id,expected_approved_version_id,requester_authorization_version,provider_plan_state,provider_effect_key,completed_at) values($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10,'tenant',$11,$12,$13,$14,$15,$16,'legacy_unverified',$17,statement_timestamp())`,[
          deterministicUuid(context.exerciseId,'forbidden-studio-generation-attempt'),generationBinding.artifact_id,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,deterministicUuid(context.exerciseId,'forbidden-studio-generation-request'),generationBinding.template_version_id,'a'.repeat(64),generationBinding.source_package_id,generationBinding.package_hash,String(generationBinding.template_version),generationBinding.template_hash,Number(generationBinding.aggregate_version),generationBinding.current_version_id,generationBinding.current_approved_version_id,Number(generationBinding.authorization_version),'b'.repeat(64)]);
        await database.client.query(`alter table public.studio_artifact_generation_attempts enable trigger user`);
      }],
      ['inactive exercise',()=>database.client.query(`update public.pr_c_controlled_human_exercises set lifecycle='read_only',quiesced_at=statement_timestamp(),concurrency_version=concurrency_version+1 where exercise_digest=$1`,[context.exerciseDigest])],
    ];
    for(const [label,mutate] of mutationCases)await rejectGeneration({label,mutate});
    const bootstrapGeneration=(await database.client.query(`select public.pr_c_controlled_human_synthetic_studio_generate($1::jsonb) result`,[JSON.stringify({...generationCommand,requestId:deterministicUuid(context.exerciseId,'synthetic-generation-bootstrap-request'),idempotencyKey:'synthetic-generation-bootstrap'})])).rows[0].result;
    assert.equal(bootstrapGeneration.outcome,'committed');assert.equal(bootstrapGeneration.resource.synthetic,true);
    generationBinding={...generationBinding,...(await database.client.query(`select aggregate_version,current_version_id,current_approved_version_id from public.studio_artifact_aggregates where id=$1`,[generationBinding.artifact_id])).rows[0]};
    await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[generationBinding.actor_id]);
    let generationSelectors={artifactId:generationBinding.artifact_id,sourcePackageId:generationBinding.source_package_id,
      sourcePackageVersion:Number(generationBinding.source_package_version),sourcePackageHash:generationBinding.package_hash,
      templateKind:'tenant',templateId:generationBinding.template_id,templateVersionId:generationBinding.template_version_id,
      templateVersionDigest:sha256(Number(generationBinding.template_version)),templateHash:generationBinding.template_hash,
      expectedCurrentVersionId:generationBinding.current_version_id,expectedApprovedVersionId:generationBinding.current_approved_version_id};
    await assert.rejects(database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','generate-source-bound-document','studio_artifact',$2,$3,$4::jsonb)`,
      [context.exerciseDigest,generationBinding.artifact_id,Number(generationBinding.aggregate_version),JSON.stringify({outer:{manualBrief:'never persist me'}})]),/ANCHOR_REJECTED/u);
    await assert.rejects(database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','generate-source-bound-document','studio_artifact',$2,$3,$4::jsonb)`,
      [context.exerciseDigest,generationBinding.artifact_id,Number(generationBinding.aggregate_version),JSON.stringify({outer:{selector:'unsafe free form customer value'}})]),/ANCHOR_REJECTED/u);
    await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,sha256('missing-positive-anchor')]),/PREANCHOR_REQUIRED/u);
    await assert.rejects(database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','generate-source-bound-document','studio_artifact',$2,$3,$4::jsonb)`,
      [context.exerciseDigest,generationBinding.artifact_id,Number(generationBinding.aggregate_version)+1,JSON.stringify(generationSelectors)]),/ANCHOR_VERSION_REJECTED/u);
    const otherGenerationBinding=(await database.client.query(`select artifact.id artifact_id,artifact.aggregate_version,artifact.current_version_id,artifact.current_approved_version_id,package.id source_package_id,package.version source_package_version,package.package_hash
      from public.studio_artifact_aggregates artifact join public.studio_artifact_source_packages package on package.id=artifact.source_package_id
      where artifact.org_id=$1 and artifact.workspace_id=$2 and artifact.id<>$3 order by artifact.id limit 1`,[generationBinding.org_id,generationBinding.workspace_id,generationBinding.artifact_id])).rows[0];
    await database.client.query('begin');try{
      const wrongTargetAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','generate-source-bound-document','studio_artifact',$2,$3,$4::jsonb) result`,[context.exerciseDigest,generationBinding.artifact_id,Number(generationBinding.aggregate_version),JSON.stringify(generationSelectors)])).rows[0].result;
      await database.client.query(`insert into public.pr_c_controlled_human_synthetic_generation_receipts(id,exercise_id,org_id,workspace_id,actor_id,request_id,idempotency_key,request_hash,artifact_id,source_package_id,source_package_hash,version_id,output_hash,status,response,created_at,completed_at)
        values($1,$2,$3,$4,$5,$6,'synthetic-generation-wrong-target',$7,$8,$9,$10,$11,$12,'committed','{}'::jsonb,statement_timestamp(),statement_timestamp())`,[deterministicUuid(context.exerciseId,'wrong-target-receipt'),context.exerciseId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,wrongTargetAnchor.execution.requestId,'c'.repeat(64),otherGenerationBinding.artifact_id,otherGenerationBinding.source_package_id,otherGenerationBinding.package_hash,otherGenerationBinding.current_version_id,'d'.repeat(64)]);
      await database.client.query(`insert into public.privileged_audit_events(id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata,created_at)
        values($1,$2,$3,$4,$5,'pr_c.controlled_human.synthetic_studio_generate','studio_artifact',$6,'succeeded',$7,'{}'::jsonb,statement_timestamp())`,[deterministicUuid(context.exerciseId,'wrong-target-audit'),generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,wrongTargetAnchor.execution.requestId,otherGenerationBinding.artifact_id,Number(otherGenerationBinding.aggregate_version)+1]);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,wrongTargetAnchor.safeAnchor.challengeToken]),/INTENT_REJECTED/u);
    }finally{await database.client.query('rollback')}
    await database.client.query('begin');try{
      const wrongVersionAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','generate-source-bound-document','studio_artifact',$2,$3,$4::jsonb) result`,[context.exerciseDigest,generationBinding.artifact_id,Number(generationBinding.aggregate_version),JSON.stringify(generationSelectors)])).rows[0].result;
      await database.client.query(`insert into public.pr_c_controlled_human_synthetic_generation_receipts(id,exercise_id,org_id,workspace_id,actor_id,request_id,idempotency_key,request_hash,artifact_id,source_package_id,source_package_hash,version_id,output_hash,status,response,created_at,completed_at)
        values($1,$2,$3,$4,$5,$6,'synthetic-wrong-post-version',$7,$8,$9,$10,$11,$12,'committed','{}'::jsonb,statement_timestamp(),statement_timestamp())`,[deterministicUuid(context.exerciseId,'wrong-version-receipt'),context.exerciseId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,wrongVersionAnchor.execution.requestId,'a'.repeat(64),generationBinding.artifact_id,generationBinding.source_package_id,generationBinding.package_hash,generationBinding.current_version_id,'b'.repeat(64)]);
      await database.client.query(`insert into public.privileged_audit_events(id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata,created_at)
        values($1,$2,$3,$4,$5,'pr_c.controlled_human.synthetic_studio_generate','studio_artifact',$6,'succeeded',$7,'{}'::jsonb,statement_timestamp())`,[deterministicUuid(context.exerciseId,'wrong-version-audit'),generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,wrongVersionAnchor.execution.requestId,generationBinding.artifact_id,Number(generationBinding.aggregate_version)+2]);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,wrongVersionAnchor.safeAnchor.challengeToken]),/INTENT_REJECTED|TRANSITION_REJECTED/u);
    }finally{await database.client.query('rollback')}
    const runGenerationSuccess=async()=>{
      const generationAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','generate-source-bound-document','studio_artifact',$2,$3,$4::jsonb) result`,
        [context.exerciseDigest,generationBinding.artifact_id,Number(generationBinding.aggregate_version),JSON.stringify(generationSelectors)])).rows[0].result;
      generationCommand.requestId=generationAnchor.execution.requestId;
      const generated=(await database.client.query(`select public.pr_c_controlled_human_synthetic_studio_generate($1::jsonb) result`,[JSON.stringify(generationCommand)])).rows[0].result;assert.equal(generated.outcome,'committed');assert.equal(generated.resource.generationKind,'synthetic_controlled_human');assert.equal(generated.resource.synthetic,true);
      const replayed=(await database.client.query(`select public.pr_c_controlled_human_synthetic_studio_generate($1::jsonb) result`,[JSON.stringify(generationCommand)])).rows[0].result;assert.equal(replayed.outcome,'replayed');assert.equal(replayed.resource.versionId,generated.resource.versionId);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_synthetic_studio_generate($1::jsonb)`,[JSON.stringify({...generationCommand,sourcePackageHash:'f'.repeat(64)})]),/REPLAY_REJECTED/u);
      assert.equal(Number((await database.client.query(`select count(*) count from public.pr_c_controlled_human_synthetic_generation_receipts`)).rows[0].count),2);assert.equal(Number((await database.client.query(`select count(*) count from public.studio_artifact_versions where id=$1`,[generated.resource.versionId])).rows[0].count),1);
      const generatedBinding=recordPositiveBinding((await database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2) result`,[context.exerciseDigest,generationAnchor.safeAnchor.challengeToken])).rows[0].result,generationAnchor.safeAnchor);
      assert.deepEqual(Object.keys(generatedBinding).sort(),['action','anchorToken','auditDigest','bindingToken','causalLineageDigest','causalParentBindingToken','causalParentResourceDigest','contractVersion','denialCodeDigest','expectedVersion','intentDigest','issuedAt','observedVersion','receiptDigest','requestDigest','resourceDigest','resourceFamily','result','stepId'].sort());
      assert.equal(generatedBinding.action,'pr_c.controlled_human.synthetic_studio_generate');assert.equal(generatedBinding.resourceFamily,'studio_artifact_version');assert.equal(generatedBinding.result,'succeeded');assert.equal(generatedBinding.observedVersion,generatedBinding.expectedVersion+1);assert.match(generatedBinding.bindingToken,/^sha256:[0-9a-f]{64}$/u);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,generationAnchor.safeAnchor.challengeToken]),/PREANCHOR_REQUIRED/u);
    };
    const handoffActors=Object.fromEntries((await database.client.query(`select binding.persona_key,binding.auth_user_id,authority.version authorization_version
      from public.pr_c_controlled_human_persona_bindings binding join public.authorization_versions authority on authority.org_id=binding.org_id and authority.user_id=binding.auth_user_id
      where binding.exercise_id=$1 and binding.persona_key=any(array['requester','studio_reviewer','studio_approver'])`,[context.exerciseId])).rows.map(row=>[row.persona_key,row]));
    const humanAssessHandoff=deterministicUuid(context.exerciseId,'assess-studio-handoff-human');
    const humanModuleHandoff=deterministicUuid(context.exerciseId,'controlled-human-module-handoff');
    const hybridTargetBundle=(await database.client.query(`select bundle.id,version.id version_id,version.version,version.bundle_hash
      from public.enterprise_module_input_bundles bundle join public.enterprise_module_input_bundle_versions version
        on version.input_bundle_id=bundle.id and version.version=bundle.current_version
      join public.pr_c_controlled_human_resource_ownership ownership
        on ownership.exercise_id=$3 and ownership.resource_family='input_bundle' and ownership.resource_id=bundle.id
      where bundle.org_id=$1 and bundle.workspace_id=$2 and bundle.owner_module='studio' and version.status='locked'
        and exists(select 1 from public.enterprise_module_input_bundle_items bundle_item
          join public.enterprise_source_set_version_items source_item on source_item.source_set_version_id=bundle_item.source_set_version_id
          where bundle_item.input_bundle_version_id=version.id)
      order by bundle.id limit 1`,[generationBinding.org_id,generationBinding.workspace_id,context.exerciseId])).rows[0];
    assert.ok(hybridTargetBundle,'CH-03 requires an exact locked Studio supplement bundle');
    await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[generationBinding.actor_id]);
    const hybridOfflineLineage=(await database.client.query(`select public.pr_c_controlled_human_prepare_offline_lineage($1,$2,$3) result`,[context.exerciseDigest,hybridTargetBundle.id,Number(hybridTargetBundle.version)])).rows[0].result;
    assert.equal(hybridOfflineLineage.status,'prepared');assert.ok(Number(hybridOfflineLineage.createdLineageCount)>0);
    const offlineProvider=(await database.client.query(`select job.id job_id,job.receipt_id,job.provider_config_id,job.route_id,job.source_id,job.source_version_id,job.actor_id
      from public.enterprise_ai_job_ledger job where job.org_id=$1 and job.workspace_id=$2 and job.model='synthetic-no-provider' order by job.id limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
    const pilotEnvironment=(await database.client.query(`select id from public.pilot_operations_environments where org_id=$1 and workspace_id=$2 limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
    assert.ok(offlineProvider?.job_id&&pilotEnvironment?.id,'isolated provider adversarials require exact accepted offline lineage');
    const isolatedProviderMutations=[
      ['isolated provider key reference',()=>database.client.query(`insert into public.ai_provider_key_refs(id,org_id,provider,resolver_type,secret_ref,safe_label,status,created_by,updated_by) values($1,$2,'groq','manual_placeholder','SYNTHETIC_REFERENCE_ONLY','Synthetic controlled-human key reference','disabled',$3,$3)`,[deterministicUuid(context.exerciseId,'isolated-key-ref'),generationBinding.org_id,generationBinding.actor_id])],
      ['isolated pilot provider binding',()=>database.client.query(`insert into public.pilot_operations_provider_bindings(id,org_id,workspace_id,environment_id,provider_configuration_id,purpose,configured,enabled,created_by) values($1,$2,$3,$4,$5,'assessment',false,false,$6)`,[deterministicUuid(context.exerciseId,'isolated-pilot-binding'),generationBinding.org_id,generationBinding.workspace_id,pilotEnvironment.id,offlineProvider.provider_config_id,generationBinding.actor_id])],
      ['isolated provider budget reservation',()=>database.client.query(`insert into public.enterprise_ai_budget_reservations(id,receipt_id,job_id,org_id,workspace_id,actor_id,authorization_version,route_id,provider_config_id,provider,capability,model,state,estimated_input_tokens,maximum_output_tokens,execution_token,execution_fence,day_bucket,month_bucket) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'groq','assess.evidence.extract','synthetic-no-provider','reserved',1,1,$10,1,current_date,date_trunc('month',current_date)::date)`,[deterministicUuid(context.exerciseId,'isolated-budget'),offlineProvider.receipt_id,offlineProvider.job_id,generationBinding.org_id,generationBinding.workspace_id,offlineProvider.actor_id,Number(generationBinding.authorization_version),offlineProvider.route_id,offlineProvider.provider_config_id,deterministicUuid(context.exerciseId,'isolated-budget-token')])],
      ['isolated provider cleanup job',async()=>{
        // The FK prerequisite is intentionally bypassed by the disposable PG16
        // superuser so the cleanup row is the sole provider-unsafe row. Column
        // and domain constraints still validate the adversarial row itself.
        await database.client.query(`alter table public.enterprise_provider_secret_cleanup_jobs disable trigger all`);
        await database.client.query(`insert into public.enterprise_provider_secret_cleanup_jobs(id,key_ref_id,org_id,provider,state) values($1,$2,$3,'groq','pending')`,[deterministicUuid(context.exerciseId,'isolated-cleanup'),deterministicUuid(context.exerciseId,'isolated-cleanup-key-ref'),generationBinding.org_id]);
        await database.client.query(`alter table public.enterprise_provider_secret_cleanup_jobs enable trigger all`);
      }],
      ['isolated standalone provider receipt',()=>database.client.query(`insert into public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,initial_request_id,last_request_id,request_hash,status,response) values($1,$2,$3,$4,'provider.validate','provider','isolated-provider-receipt',$5,$5,$6,'claimed','{}'::jsonb)`,[deterministicUuid(context.exerciseId,'isolated-provider-receipt'),generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,deterministicUuid(context.exerciseId,'isolated-provider-receipt-request'),'a'.repeat(64)])],
      ['isolated usage ledger',()=>database.client.query(`insert into public.enterprise_ai_usage_ledger(job_id,provider_config_id,org_id,workspace_id,provider,model,input_tokens,output_tokens) values($1,$2,$3,$4,'groq','synthetic-no-provider',1,1)`,[offlineProvider.job_id,offlineProvider.provider_config_id,generationBinding.org_id,generationBinding.workspace_id])],
      ['isolated job attempt',()=>database.client.query(`insert into public.enterprise_ai_job_attempts(job_id,receipt_id,org_id,workspace_id,actor_id,execution_token,execution_fence,attempt_number,attempt_kind,lease_expires_at) values($1,$2,$3,$4,$5,$6,1,1,'claimed',statement_timestamp()+interval '5 minutes')`,[offlineProvider.job_id,offlineProvider.receipt_id,generationBinding.org_id,generationBinding.workspace_id,offlineProvider.actor_id,deterministicUuid(context.exerciseId,'isolated-job-attempt-token')])],
      ['isolated staged result',()=>database.client.query(`insert into public.enterprise_ai_extraction_staged_results(job_id,receipt_id,org_id,workspace_id,actor_id,source_id,source_version_id,route_id,provider_config_id,provider,model,request_hash,output_hash,latency_ms,token_input,token_output,candidates,safe_result,staged_payload_hash,execution_token,execution_fence) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'groq','synthetic-no-provider',$10,$11,1,1,1,'[]'::jsonb,'{}'::jsonb,$12,$13,1)`,[offlineProvider.job_id,offlineProvider.receipt_id,generationBinding.org_id,generationBinding.workspace_id,offlineProvider.actor_id,offlineProvider.source_id,offlineProvider.source_version_id,offlineProvider.route_id,offlineProvider.provider_config_id,'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),deterministicUuid(context.exerciseId,'isolated-staged-token')])],
      ['isolated provider effect',()=>database.client.query(`insert into public.enterprise_ai_effect_journal(receipt_id,org_id,workspace_id,operation_type,effect_key,resource_id,terminal_status,safe_result,result_hash,execution_fence) values($1,$2,$3,'provider.execute','isolated-provider-effect',$2,'committed','{}'::jsonb,public.enterprise_sha256_jsonb('{}'::jsonb),1)`,[offlineProvider.receipt_id,generationBinding.org_id,generationBinding.workspace_id])],
    ];
    for(const [label,mutate] of isolatedProviderMutations)await rejectGeneration({label,mutate});
    const runHandoffStep=async({persona,stepId,commandType,expectedVersion,commandExpectedVersion=expectedVersion,payload,targetFamily,targetId})=>{
      const actor=handoffActors[persona];await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor.auth_user_id]);
      const selectorBindings=commandType==='handoff.request'
        ? {upstreamHandoffId:payload.upstreamHandoffId,artifactType:payload.artifactType,targetInputBundleId:payload.targetInputBundle.id,targetInputBundleVersionId:payload.targetInputBundle.versionId,targetInputBundleVersion:payload.targetInputBundle.version}
        : commandType==='handoff.consume'
          ? {handoffId:humanModuleHandoff,handoffVersion:expectedVersion}
          : {handoffId:humanModuleHandoff,handoffVersion:expectedVersion,outcome:payload.outcome,
            rationaleDigest:jsonTextSha(payload.rationale),conditionsDigest:sha256([])};
      const anchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03',$2,$3,$4,$5,$6::jsonb) result`,[context.exerciseDigest,stepId,targetFamily,targetId,expectedVersion,JSON.stringify(selectorBindings)])).rows[0].result;
      const commandPayload=commandType==='handoff.request'?{upstreamHandoffId:payload.upstreamHandoffId,artifactType:payload.artifactType,targetInputBundleId:payload.targetInputBundle.id,targetInputBundleVersionId:payload.targetInputBundle.versionId,targetInputBundleVersion:payload.targetInputBundle.version}:payload;
      const command={actorId:actor.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,requestId:anchor.execution.requestId,authorizationVersion:Number(actor.authorization_version),expectedVersion:commandExpectedVersion,idempotencyKey:`pr264-human-${stepId}`,commandType,handoffId:humanModuleHandoff,payload:commandPayload};
      const result=(await database.client.query(`select public.enterprise_assess_studio_handoff_command($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result;
      const binding=recordPositiveBinding((await database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2) result`,[context.exerciseDigest,anchor.safeAnchor.challengeToken])).rows[0].result,anchor.safeAnchor);
      assert.equal(binding.action,commandType);assert.equal(binding.result,'succeeded');await database.client.query('select pg_sleep(0.005)');return {result,binding};
    };
    await database.client.query('begin');try{
      const actors=Object.fromEntries(users.map(user=>[user.key,{id:user.id}]));const versions=Object.fromEntries((await database.client.query(`select binding.persona_key,authority.version from public.pr_c_controlled_human_persona_bindings binding join public.authorization_versions authority on authority.org_id=binding.org_id and authority.user_id=binding.auth_user_id where binding.exercise_id=$1`,[context.exerciseId])).rows.map(row=>[row.persona_key,Number(row.version)]));
      const alternate=await seedAssessUpstream(database.client,context,buildIdentifiers(context,fixtureState),actors,versions,'-intent-b');const requester=handoffActors.requester;
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[requester.auth_user_id]);
      const exactTargetInputBundle={id:hybridTargetBundle.id,versionId:hybridTargetBundle.version_id,version:Number(hybridTargetBundle.version)};
      const anchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','request-studio-handoff','assess_studio_handoff',$2,1,$3::jsonb) result`,[context.exerciseDigest,humanAssessHandoff,JSON.stringify({upstreamHandoffId:humanAssessHandoff,artifactType:'brd',targetInputBundleId:exactTargetInputBundle.id,targetInputBundleVersionId:exactTargetInputBundle.versionId,targetInputBundleVersion:exactTargetInputBundle.version})])).rows[0].result;
      const substituted={actorId:requester.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,requestId:anchor.execution.requestId,authorizationVersion:Number(requester.authorization_version),expectedVersion:0,idempotencyKey:'pr264-upstream-b-substitution',commandType:'handoff.request',handoffId:deterministicUuid(context.exerciseId,'intent-b-module-handoff'),payload:{upstreamHandoffId:alternate.journey.assessHandoff,artifactType:'brd'}};
      await database.client.query(`select public.enterprise_assess_studio_handoff_command($1::jsonb)`,[JSON.stringify(substituted)]);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,anchor.safeAnchor.challengeToken]),/INTENT_REJECTED/u);
    }finally{await database.client.query('rollback')}
    const runModuleHandoffSuccess=async()=>{
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[generationBinding.actor_id]);
      const lineage=(await database.client.query(`select public.pr_c_controlled_human_prepare_offline_lineage($1,$2,$3) result`,[context.exerciseDigest,hybridTargetBundle.id,Number(hybridTargetBundle.version)])).rows[0].result;
      assert.equal(lineage.status,'prepared');assert.equal(Number(lineage.createdLineageCount),0);
      const targetInputBundle={id:hybridTargetBundle.id,versionId:hybridTargetBundle.version_id,version:Number(hybridTargetBundle.version)};
      const requestedHandoff=await runHandoffStep({persona:'requester',stepId:'request-studio-handoff',commandType:'handoff.request',expectedVersion:1,commandExpectedVersion:0,payload:{upstreamHandoffId:humanAssessHandoff,artifactType:'brd',targetInputBundle},targetFamily:'assess_studio_handoff',targetId:humanAssessHandoff});
      assert.equal(requestedHandoff.binding.resourceFamily,'module_handoff');assert.equal(requestedHandoff.binding.observedVersion,1);
      const reviewedHandoff=await runHandoffStep({persona:'studio_reviewer',stepId:'review-studio-handoff',commandType:'handoff.review.resolve',expectedVersion:1,payload:{outcome:'approve',rationale:'Independent controlled-human module handoff review'},targetFamily:'module_handoff',targetId:humanModuleHandoff});
      assert.equal(reviewedHandoff.binding.observedVersion,2);
      const approvedHandoff=await runHandoffStep({persona:'studio_approver',stepId:'approve-studio-handoff',commandType:'handoff.approval.resolve',expectedVersion:2,payload:{outcome:'approve',rationale:'Independent controlled-human module handoff approval'},targetFamily:'module_handoff',targetId:humanModuleHandoff});
      assert.equal(approvedHandoff.binding.observedVersion,3);
      const consumedHandoff=await runHandoffStep({persona:'requester',stepId:'accept-studio-handoff',commandType:'handoff.consume',expectedVersion:3,payload:{},targetFamily:'module_handoff',targetId:humanModuleHandoff});
      assert.equal(consumedHandoff.binding.resourceFamily,'studio_artifact');assert.equal(consumedHandoff.binding.observedVersion,0);assert.equal(consumedHandoff.result.resourceId.length,36);
      const causal=(await database.client.query(`select package.source_mode,package.assess_handoff_id,package.studio_input_bundle_id,package.studio_input_bundle_version_id,package.studio_input_bundle_version,package.studio_bundle_hash,artifact.source_case_version,artifact.aggregate_version
        from public.studio_artifact_aggregates artifact join public.studio_artifact_source_packages package on package.id=artifact.source_package_id
        where artifact.id=$1`,[consumedHandoff.result.resourceId])).rows[0];
      assert.equal(causal.source_mode,'assess_plus_transcript_bundle');assert.equal(causal.assess_handoff_id,humanAssessHandoff);
      assert.equal(causal.studio_input_bundle_id,hybridTargetBundle.id);assert.equal(causal.studio_input_bundle_version_id,hybridTargetBundle.version_id);
      assert.equal(Number(causal.studio_input_bundle_version),Number(hybridTargetBundle.version));assert.equal(causal.studio_bundle_hash,hybridTargetBundle.bundle_hash);
      assert.notEqual(Number(causal.source_case_version),Number(causal.aggregate_version),'Assess sourceVersion and Studio aggregateVersion are distinct axes');
      return consumedHandoff.result.resourceId;
    };
    await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[handoffActors.requester.auth_user_id]);
    await assert.rejects(database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','request-studio-handoff','assess_studio_handoff',$2,1,$3::jsonb)`,[
      context.exerciseDigest,humanAssessHandoff,JSON.stringify({upstreamHandoffId:humanAssessHandoff,artifactType:'brd',targetInputBundleId:null,targetInputBundleVersionId:null,targetInputBundleVersion:null})]),/ANCHOR_REJECTED/u);
    const exactHandoffSelector={upstreamHandoffId:humanAssessHandoff,artifactType:'brd',targetInputBundleId:hybridTargetBundle.id,targetInputBundleVersionId:hybridTargetBundle.version_id,targetInputBundleVersion:Number(hybridTargetBundle.version)};
    const assertHandoffSelectorMismatch=async(label,selector)=>{await database.client.query('begin');try{
      const anchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','request-studio-handoff','assess_studio_handoff',$2,1,$3::jsonb) result`,[context.exerciseDigest,humanAssessHandoff,JSON.stringify(selector)])).rows[0].result;
      const command={actorId:handoffActors.requester.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,requestId:anchor.execution.requestId,authorizationVersion:Number(handoffActors.requester.authorization_version),expectedVersion:0,idempotencyKey:`pr264-selector-${label}`,commandType:'handoff.request',handoffId:deterministicUuid(context.exerciseId,`selector-${label}`),payload:{upstreamHandoffId:humanAssessHandoff,artifactType:'brd',targetInputBundleId:hybridTargetBundle.id,targetInputBundleVersionId:hybridTargetBundle.version_id,targetInputBundleVersion:Number(hybridTargetBundle.version)}};
      await database.client.query(`select public.enterprise_assess_studio_handoff_command($1::jsonb)`,[JSON.stringify(command)]);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,anchor.safeAnchor.challengeToken]),/INTENT_REJECTED/u);
    }finally{await database.client.query('rollback')}};
    for(const [label,selector] of [
      ['foreign-bundle',{...exactHandoffSelector,targetInputBundleId:deterministicUuid(context.exerciseId,'foreign-bundle')}],
      ['stale-bundle-version',{...exactHandoffSelector,targetInputBundleVersion:Number(hybridTargetBundle.version)+1}],
      ['swapped-version-id',{...exactHandoffSelector,targetInputBundleVersionId:deterministicUuid(context.exerciseId,'swapped-bundle-version')}],
      ['wrong-version-axis',{...exactHandoffSelector,targetInputBundleVersionId:humanAssessHandoff}],
    ])await assertHandoffSelectorMismatch(label,selector);
    await database.client.query('begin');try{
      const requesterActor=handoffActors.requester;await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[requesterActor.auth_user_id]);
      await database.client.query(`select public.enterprise_assess_studio_handoff_command($1::jsonb)`,[JSON.stringify({actorId:requesterActor.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,
        requestId:deterministicUuid(context.exerciseId,'opposite-request'),authorizationVersion:Number(requesterActor.authorization_version),expectedVersion:0,idempotencyKey:'pr264-opposite-prerequisite',commandType:'handoff.request',handoffId:humanModuleHandoff,payload:{upstreamHandoffId:humanAssessHandoff,artifactType:'brd'}})]);
      const reviewerActor=handoffActors.studio_reviewer;await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[reviewerActor.auth_user_id]);
      const oppositeAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','review-studio-handoff','module_handoff',$2,1,$3::jsonb) result`,[context.exerciseDigest,humanModuleHandoff,JSON.stringify({handoffId:humanModuleHandoff,handoffVersion:1,outcome:'approve',rationaleDigest:jsonTextSha('Adversarial opposite outcome'),conditionsDigest:sha256([])})])).rows[0].result;
      const oppositeCommand={actorId:reviewerActor.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,requestId:oppositeAnchor.execution.requestId,authorizationVersion:Number(reviewerActor.authorization_version),expectedVersion:1,idempotencyKey:'pr264-opposite-outcome',commandType:'handoff.review.resolve',handoffId:humanModuleHandoff,payload:{outcome:'changes_requested',rationale:'Adversarial opposite outcome'}};
      await database.client.query(`select public.enterprise_assess_studio_handoff_command($1::jsonb)`,[JSON.stringify(oppositeCommand)]);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,oppositeAnchor.safeAnchor.challengeToken]),/INTENT_REJECTED/u);
    }finally{await database.client.query('rollback')}
    const requesterAuthorizationVersion=Number(generationBinding.authorization_version);
    await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[generationBinding.actor_id]);
    await database.client.query('begin');try{
      const bundleA=(await database.client.query(`select bundle.id,version.id version_id,version.version,version.bundle_hash,item.source_set_version_id,item.source_set_id,item.resource_hash,item.declared_purpose from public.enterprise_module_input_bundles bundle join public.enterprise_module_input_bundle_versions version on version.input_bundle_id=bundle.id and version.version=bundle.current_version join public.enterprise_module_input_bundle_items item on item.input_bundle_version_id=version.id where bundle.org_id=$1 and bundle.workspace_id=$2 and bundle.owner_module='studio' limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
      const bundleB=deterministicUuid(context.exerciseId,'intent-b-input-bundle'),bundleBVersion=deterministicUuid(context.exerciseId,'intent-b-input-bundle-version');
      await database.client.query(`insert into public.enterprise_module_input_bundles(id,org_id,workspace_id,owner_module,current_version,created_by) values($1,$2,$3,'studio',1,$4)`,[bundleB,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id]);
      await database.client.query(`insert into public.enterprise_module_input_bundle_versions(id,input_bundle_id,org_id,workspace_id,version,bundle_hash,status,created_by) values($1,$2,$3,$4,1,$5,'locked',$6)`,[bundleBVersion,bundleB,generationBinding.org_id,generationBinding.workspace_id,'e'.repeat(64),generationBinding.actor_id]);
      await database.client.query(`insert into public.enterprise_module_input_bundle_items(input_bundle_version_id,input_bundle_id,org_id,workspace_id,ordinal,item_kind,source_set_version_id,source_set_id,resource_hash,declared_purpose) values($1,$2,$3,$4,1,'source_set',$5,$6,$7,$8)`,[bundleBVersion,bundleB,generationBinding.org_id,generationBinding.workspace_id,bundleA.source_set_version_id,bundleA.source_set_id,bundleA.resource_hash,bundleA.declared_purpose]);
      const providerId=deterministicUuid(context.exerciseId,'intent-b-provider'),routeId=deterministicUuid(context.exerciseId,'intent-b-route');
      await database.client.query(`insert into public.ai_provider_configs(id,org_id,provider,display_name,default_model,status,created_by,updated_by) values($1,$2,'groq','Synthetic transaction-only intent verifier','synthetic-model','active',$3,$3)`,[providerId,generationBinding.org_id,generationBinding.actor_id]);
      await database.client.query(`insert into public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,created_by,updated_by) values($1,$2,$3,$4,'assess.evidence.extract','synthetic-model',false,$5,$5)`,[routeId,generationBinding.org_id,generationBinding.workspace_id,providerId,generationBinding.actor_id]);
      const sourceRows=(await database.client.query(`select source.id source_id,source_version.id source_version_id,item.source_set_id,item.source_set_version_id from public.enterprise_source_set_version_items item join public.enterprise_evidence_source_versions source_version on source_version.id=item.source_version_id join public.enterprise_evidence_sources source on source.id=source_version.source_id where item.source_set_version_id=$1 order by item.ordinal`,[bundleA.source_set_version_id])).rows;
      for(const [index,source] of sourceRows.entries()){
        const receiptId=deterministicUuid(context.exerciseId,`intent-b-extraction-receipt-${index}`),jobId=deterministicUuid(context.exerciseId,`intent-b-extraction-job-${index}`);
        const extractionRequest=deterministicUuid(context.exerciseId,`intent-b-extract-request-${index}`);
        await database.client.query(`insert into public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,initial_request_id,last_request_id,request_hash,status,resource_id,response,completed_at) values($1,$2,$3,$4,'evidence.extract','ingestion',$5,$6,$6,$7,'committed',$8,'{}'::jsonb,statement_timestamp())`,[receiptId,generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id,`intent-b-extract-${index}`,extractionRequest,'a'.repeat(64),source.source_id]);
        await database.client.query(`insert into public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,source_refs,actor_id,request_id,idempotency_key,status,output_hash,approval_state,receipt_id,source_id,source_version_id,route_id) values($1,$2,$3,'assess.evidence.extract',$4,'groq','synthetic-model','intent-verifier','1',$5::jsonb,$6,$7,$8,'succeeded',$9,'review_required',$10,$11,$12,$13)`,[jobId,generationBinding.org_id,generationBinding.workspace_id,providerId,JSON.stringify([{sourceId:source.source_id,sourceVersionId:source.source_version_id}]),generationBinding.actor_id,deterministicUuid(context.exerciseId,`intent-b-job-request-${index}`),`intent-b-job-${index}`,'b'.repeat(64),receiptId,source.source_id,source.source_version_id,routeId]);
        await database.client.query(`insert into public.enterprise_transcript_extraction_bindings(org_id,workspace_id,job_id,receipt_id,input_bundle_version_id,input_bundle_id,bundle_hash,source_id,source_version_id,provider_route_id,provider_config_id,model,authorization_version,created_by,source_set_id,source_set_version_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'synthetic-model',$12,$13,$14,$15)`,[generationBinding.org_id,generationBinding.workspace_id,jobId,receiptId,bundleBVersion,bundleB,'e'.repeat(64),source.source_id,source.source_version_id,routeId,providerId,requesterAuthorizationVersion,generationBinding.actor_id,source.source_set_id,source.source_set_version_id]);
        await database.client.query(`insert into public.enterprise_evidence_candidates(id,source_id,source_version_id,org_id,workspace_id,field_key,value,safe_excerpt,excerpt_hash,provenance_hash,version,source_locator,confidence,ai_job_id,prompt_version,suggestion_status,created_by,reviewed_by,reviewed_at) values($1,$2,$3,$4,$5,'process_objective','Synthetic transaction-only candidate','Synthetic candidate',$6,$7,1,$8,1,$9,'1','accepted',$10,$10,statement_timestamp())`,[deterministicUuid(context.exerciseId,`intent-b-candidate-${index}`),source.source_id,source.source_version_id,generationBinding.org_id,generationBinding.workspace_id,'c'.repeat(64),'d'.repeat(64),`normalized-text:v1:chars:${index*10}-${index*10+9}`,jobId,generationBinding.actor_id]);
      }
      const directSelectors={sourceMode:'direct_transcript_bundle',artifactType:'brd',studioInputBundleId:bundleA.id,studioInputBundleVersionId:bundleA.version_id,studioInputBundleVersion:Number(bundleA.version)};
      const directAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-10','create-direct-studio-plan','input_bundle',$2,$3,$4::jsonb) result`,[context.exerciseDigest,bundleA.id,Number(bundleA.version),JSON.stringify(directSelectors)])).rows[0].result;
      const directCommand={actorId:generationBinding.actor_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,artifactId:deterministicUuid(context.exerciseId,'intent-b-direct-artifact'),sourcePackageId:deterministicUuid(context.exerciseId,'intent-b-direct-package'),requestId:directAnchor.execution.requestId,idempotencyKey:'intent-b-direct-source',authorizationVersion:requesterAuthorizationVersion,payload:{sourceMode:'direct_transcript_bundle',artifactType:'brd',studioInputBundleId:bundleB,studioInputBundleVersionId:bundleBVersion,studioInputBundleVersion:1}};
      await database.client.query(`select public.studio_artifact_source_package_create($1::jsonb)`,[JSON.stringify(directCommand)]);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,directAnchor.safeAnchor.challengeToken]),/INTENT_REJECTED/u);
    }finally{await database.client.query('rollback')}
    const runDirectSourceSuccess=async()=>{await database.client.query('begin');try{
    await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[generationBinding.actor_id]);
    const directBundle=(await database.client.query(`select bundle.id,version.id version_id,version.version,version.bundle_hash from public.enterprise_module_input_bundles bundle join public.enterprise_module_input_bundle_versions version on version.input_bundle_id=bundle.id and version.version=bundle.current_version where bundle.org_id=$1 and bundle.workspace_id=$2 and bundle.owner_module='studio' limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
    const offlineLineage=(await database.client.query(`select public.pr_c_controlled_human_prepare_offline_lineage($1,$2,$3) result`,[context.exerciseDigest,directBundle.id,Number(directBundle.version)])).rows[0].result;
    assert.equal(offlineLineage.status,'prepared');assert.equal(Number(offlineLineage.createdLineageCount),0);
    const offlineReplay=(await database.client.query(`select public.pr_c_controlled_human_prepare_offline_lineage($1,$2,$3) result`,[context.exerciseDigest,directBundle.id,Number(directBundle.version)])).rows[0].result;
    assert.equal(offlineReplay.createdLineageCount,0);assert.equal(offlineReplay.lineageDigest,offlineLineage.lineageDigest);
    const directSelectors={sourceMode:'direct_transcript_bundle',artifactType:'brd',studioInputBundleId:directBundle.id,studioInputBundleVersionId:directBundle.version_id,studioInputBundleVersion:Number(directBundle.version)};
    const sourcePackageAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-10','create-direct-studio-plan','input_bundle',$2,$3,$4::jsonb) result`,[
      context.exerciseDigest,directBundle.id,Number(directBundle.version),JSON.stringify(directSelectors)])).rows[0].result;
    const createdArtifactId=deterministicUuid(context.exerciseId,'anchored-source-package-artifact');
    const createdSourcePackageId=deterministicUuid(context.exerciseId,'anchored-source-package');
    const sourcePackageCommand={actorId:generationBinding.actor_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,artifactId:createdArtifactId,sourcePackageId:createdSourcePackageId,
      requestId:sourcePackageAnchor.execution.requestId,idempotencyKey:'anchored-source-package-create',authorizationVersion:requesterAuthorizationVersion,payload:{sourceMode:'direct_transcript_bundle',artifactType:'brd',studioInputBundleId:directBundle.id,studioInputBundleVersionId:directBundle.version_id,studioInputBundleVersion:Number(directBundle.version)}};
    const createdSourcePackage=(await database.client.query(`select public.studio_artifact_source_package_create($1::jsonb) result`,[JSON.stringify(sourcePackageCommand)])).rows[0].result;
    assert.equal(createdSourcePackage.resourceId,createdArtifactId);assert.equal(createdSourcePackage.sourcePackageId,createdSourcePackageId);
    const sourcePackageBinding=recordPositiveBinding((await database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2) result`,[context.exerciseDigest,sourcePackageAnchor.safeAnchor.challengeToken])).rows[0].result,sourcePackageAnchor.safeAnchor);
    assert.equal(sourcePackageBinding.action,'studio.source-package.create');assert.equal(sourcePackageBinding.resourceFamily,'studio_source_package');assert.equal(sourcePackageBinding.observedVersion,1);
    assert.notEqual(sourcePackageBinding.resourceDigest,sourcePackageAnchor.safeAnchor.targetDigest,'created-target proof must differ from its exact pre-action parent anchor');
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}};
    await database.client.query('begin');try{
      const executedArtifact=(await database.client.query(`select id,aggregate_version,current_version_id,current_approved_version_id from public.studio_artifact_aggregates where org_id=$1 and workspace_id=$2 and lifecycle='approved' order by id limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
      const anchoredArtifact=(await database.client.query(`select id,aggregate_version,current_version_id,current_approved_version_id from public.studio_artifact_aggregates where org_id=$1 and workspace_id=$2 and id<>$3 order by id limit 1`,[generationBinding.org_id,generationBinding.workspace_id,executedArtifact.id])).rows[0];assert.ok(anchoredArtifact&&executedArtifact);
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[generationBinding.actor_id]);
      const selectors={studioArtifactId:anchoredArtifact.id,studioArtifactVersionId:anchoredArtifact.current_approved_version_id,targetWorkspaceId:generationBinding.workspace_id,expectedAggregateVersion:Number(anchoredArtifact.aggregate_version),expectedCurrentVersionId:anchoredArtifact.current_version_id,expectedApprovedVersionId:anchoredArtifact.current_approved_version_id};
      const deliveryAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-04','request-exact-studio-handoff','studio_artifact',$2,$3,$4::jsonb) result`,[context.exerciseDigest,anchoredArtifact.id,Number(anchoredArtifact.aggregate_version),JSON.stringify(selectors)])).rows[0].result;
      const command={action:'delivery.handoff.request',actorId:generationBinding.actor_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,authorizationVersion:requesterAuthorizationVersion,receiptId:deterministicUuid(context.exerciseId,'delivery-intent-b-receipt'),requestId:deliveryAnchor.execution.requestId,idempotencyKey:'delivery-intent-b',executionToken:deterministicUuid(context.exerciseId,'delivery-intent-b-token'),executionFence:991,targetWorkspaceId:generationBinding.workspace_id,studioArtifactId:executedArtifact.id,studioArtifactVersionId:executedArtifact.current_approved_version_id,expectedAggregateVersion:Number(executedArtifact.aggregate_version),expectedCurrentVersionId:executedArtifact.current_version_id,expectedApprovedVersionId:executedArtifact.current_approved_version_id};
      await database.client.query(`select public.enterprise_delivery_monitor_command($1::jsonb)`,[JSON.stringify(command)]);
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,deliveryAnchor.safeAnchor.challengeToken]),/INTENT_REJECTED/u);
    }finally{await database.client.query('rollback')}
    const runResponseLossSuccess=async()=>{
    const responseLossActors=Object.fromEntries((await database.client.query(`select binding.persona_key,binding.auth_user_id,authority.version authorization_version from public.pr_c_controlled_human_persona_bindings binding join public.authorization_versions authority on authority.org_id=binding.org_id and authority.user_id=binding.auth_user_id where binding.exercise_id=$1 and binding.persona_key=any(array['delivery_author','delivery_reviewer'])`,[context.exerciseId])).rows.map(row=>[row.persona_key,row]));
    const recoveryPackage=(await database.client.query(`select package.id,package.current_version,package.current_version_id,package.aggregate_version from public.enterprise_delivery_work_packages package where package.org_id=$1 and package.workspace_id=$2 and package.status='draft' and not exists(select 1 from public.enterprise_monitor_baselines baseline where baseline.work_package_id=package.id) order by package.id limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
    const recoveryItems=(await database.client.query(`select aggregate.id item_aggregate_id,aggregate.aggregate_version,aggregate.current_version_id,version.item_type,version.title,version.description,version.acceptance_criteria,version.non_functional_requirements from public.enterprise_delivery_work_item_aggregates aggregate join public.enterprise_delivery_work_item_versions version on version.id=aggregate.current_version_id where aggregate.work_package_id=$1 order by aggregate.id`,[recoveryPackage.id])).rows;
    let responseLossOrdinal=700;
    const invokeDelivery=async(actor,action,payload,key,requestId=deterministicUuid(context.exerciseId,`response-loss-request-${responseLossOrdinal}`),idempotencyKey=`pr264-response-loss-${key}`)=>{
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor.auth_user_id]);
      const ordinal=responseLossOrdinal++;
      const command={action,actorId:actor.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,authorizationVersion:Number(actor.authorization_version),receiptId:deterministicUuid(context.exerciseId,`response-loss-receipt-${ordinal}`),requestId,idempotencyKey,executionToken:deterministicUuid(context.exerciseId,`response-loss-token-${ordinal}`),executionFence:ordinal,...payload};
      return {command,result:(await database.client.query(`select public.enterprise_delivery_monitor_command($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result};
    };
    for(const item of recoveryItems)await invokeDelivery(responseLossActors.delivery_author,'delivery.item.review',{itemAggregateId:item.item_aggregate_id,expectedAggregateVersion:Number(item.aggregate_version),expectedItemVersionId:item.current_version_id,outcome:'accepted',rationale:'Synthetic response-loss prerequisite acceptance.'},`accept-${item.item_aggregate_id}`);
    const terminalPackage=(await database.client.query(`select id,current_version,current_version_id,aggregate_version from public.enterprise_delivery_work_packages where id=$1`,[recoveryPackage.id])).rows[0];
    await invokeDelivery(responseLossActors.delivery_reviewer,'delivery.package.review.resolve',{workPackageId:terminalPackage.id,expectedPackageVersion:Number(terminalPackage.current_version),expectedPackageVersionId:terminalPackage.current_version_id,expectedPackageAggregateVersion:Number(terminalPackage.aggregate_version),outcome:'changes_requested',rationale:'Synthetic response-loss recovery requires one explicit descendant revision.'},'changes-requested');
    const blockedItems=(await database.client.query(`select aggregate.id item_aggregate_id,aggregate.aggregate_version,aggregate.current_version_id,version.item_type,version.title,version.description,version.acceptance_criteria,version.non_functional_requirements from public.enterprise_delivery_work_item_aggregates aggregate join public.enterprise_delivery_work_item_versions version on version.id=aggregate.current_version_id where aggregate.work_package_id=$1 order by aggregate.id`,[recoveryPackage.id])).rows;
    const blockedPackage=(await database.client.query(`select id,current_version,current_version_id,aggregate_version from public.enterprise_delivery_work_packages where id=$1`,[recoveryPackage.id])).rows[0];
    const expectedItems=blockedItems.map(item=>({itemAggregateId:item.item_aggregate_id,expectedAggregateVersion:Number(item.aggregate_version),expectedItemVersionId:item.current_version_id}));
    const revised=blockedItems[0];const itemRevisions=[{...expectedItems[0],rationale:'Synthetic response-loss exact retry.',item:{itemType:revised.item_type,title:`${revised.title} — reconciled`,description:revised.description,acceptanceCriteria:revised.acceptance_criteria,nonFunctionalRequirements:revised.non_functional_requirements}}];
    const revisionSelectors={workPackageId:blockedPackage.id,expectedPackageVersion:Number(blockedPackage.current_version),expectedPackageVersionId:blockedPackage.current_version_id,expectedPackageAggregateVersion:Number(blockedPackage.aggregate_version),expectedItemsDigest:sha256(expectedItems),expectedItemCount:expectedItems.length,itemRevisionsDigest:sha256(itemRevisions),revisionCount:itemRevisions.length};
    await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[responseLossActors.delivery_author.auth_user_id]);
    const responseLossAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-13','simulate-response-loss','delivery_work_package',$2,$3,$4::jsonb) result`,[context.exerciseDigest,blockedPackage.id,Number(blockedPackage.aggregate_version),JSON.stringify(revisionSelectors)])).rows[0].result;
    const responseLossKey='pr264-response-loss-revision';
    const firstRevision=await invokeDelivery(responseLossActors.delivery_author,'delivery.package.revision.commit',{workPackageId:blockedPackage.id,expectedPackageVersion:Number(blockedPackage.current_version),expectedPackageVersionId:blockedPackage.current_version_id,expectedPackageAggregateVersion:Number(blockedPackage.aggregate_version),expectedItems,itemRevisions},'revision',responseLossAnchor.execution.requestId,responseLossKey);
    const retryRevision=await invokeDelivery(responseLossActors.delivery_author,'delivery.package.revision.commit',{workPackageId:blockedPackage.id,expectedPackageVersion:Number(blockedPackage.current_version),expectedPackageVersionId:blockedPackage.current_version_id,expectedPackageAggregateVersion:Number(blockedPackage.aggregate_version),expectedItems,itemRevisions},'revision-retry',deterministicUuid(context.exerciseId,'response-loss-retry-request'),responseLossKey);
    assert.deepEqual(retryRevision.result,firstRevision.result);
    const responseLossBinding=recordPositiveBinding((await database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2) result`,[context.exerciseDigest,responseLossAnchor.safeAnchor.challengeToken])).rows[0].result,responseLossAnchor.safeAnchor);
    assert.equal(responseLossBinding.action,'delivery.package.revision.commit');assert.equal(responseLossBinding.observedVersion,responseLossBinding.expectedVersion+1);
    };
    const deliveryActors=Object.fromEntries((await database.client.query(`select binding.persona_key,binding.auth_user_id
      from public.pr_c_controlled_human_persona_bindings binding where binding.exercise_id=$1
      and binding.persona_key=any(array['requester','delivery_target_acceptor','delivery_consumer','delivery_author','delivery_reviewer','delivery_approver'])`,[context.exerciseId])).rows.map(row=>[row.persona_key,row]));
    let controlledOrdinal=1200;
    const invokeControlledDelivery=async({checkpointId,stepId,personaKey,targetFamily,targetId,expectedVersion,selectors,action,payload,idempotencyKey})=>{
      const actor=deliveryActors[personaKey];assert.ok(actor,`missing controlled actor ${personaKey}`);
      const authorizationVersion=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,actor.auth_user_id])).rows[0].version);
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor.auth_user_id]);
      const anchorDiagnostic=(await database.client.query(`select spec.selector_schema,
        public.pr_c_controlled_human_selector_contract_valid(spec.selector_schema,$7::jsonb,$4,$5,$6,spec.expected_outcome) selector_valid,
        case when $4='delivery_work_package' and spec.target_version_dimension='current_version'
          then (select package.current_version from public.enterprise_delivery_work_packages package where package.id=$5)
          else public.pr_c_controlled_human_current_resource_version(exercise.id,$8,$4,$5) end actual_version
        from public.pr_c_controlled_human_intent_catalog spec cross join public.pr_c_controlled_human_exercises exercise
        where spec.checkpoint_id=$2 and spec.step_id=$3 and exercise.exercise_digest=$1`,[context.exerciseDigest,checkpointId,stepId,targetFamily,targetId,expectedVersion,JSON.stringify(selectors),actor.auth_user_id])).rows[0];
      assert.equal(anchorDiagnostic?.selector_valid,true,`${stepId} selector rejected (${anchorDiagnostic?.selector_schema})`);
      const diagnosticExpectedVersion=stepId==='replay-consumption-same-target'?Number(expectedVersion)+1:Number(expectedVersion);
      assert.equal(Number(anchorDiagnostic?.actual_version),diagnosticExpectedVersion,`${stepId} target version mismatch`);
      const anchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,$2,$3,$4,$5,$6,$7::jsonb) result`,[context.exerciseDigest,checkpointId,stepId,targetFamily,targetId,expectedVersion,JSON.stringify(selectors)])).rows[0].result;
      const ordinal=controlledOrdinal++;
      const command={action,actorId:actor.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,authorizationVersion,
        receiptId:deterministicUuid(context.exerciseId,`controlled-receipt-${ordinal}`),requestId:anchor.execution.requestId,
        idempotencyKey:anchor.execution.businessIdempotencyKey??idempotencyKey??`pr264-controlled-${stepId}-${ordinal}`,
        executionToken:deterministicUuid(context.exerciseId,`controlled-token-${ordinal}`),executionFence:ordinal,...payload};
      const result=(await database.client.query(`select public.enterprise_delivery_monitor_command($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result;
      await database.client.query('set constraints all deferred');
      const binding=recordPositiveBinding((await database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2) result`,[context.exerciseDigest,anchor.safeAnchor.challengeToken])).rows[0].result,anchor.safeAnchor);
      assert.equal(binding.stepId,stepId);assert.equal(binding.action,action);await database.client.query('select pg_sleep(0.005)');return {anchor,command,result,binding};
    };
    const invokeDeliveryPrerequisite=async(personaKey,action,payload,label,idempotencyKey)=>{
      const actor=deliveryActors[personaKey];
      const authorizationVersion=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,actor.auth_user_id])).rows[0].version);
      const ordinal=controlledOrdinal++;await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor.auth_user_id]);
      const result=(await database.client.query(`select public.enterprise_delivery_monitor_command($1::jsonb) result`,[JSON.stringify({action,actorId:actor.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,authorizationVersion,
        receiptId:deterministicUuid(context.exerciseId,`controlled-prerequisite-receipt-${ordinal}`),requestId:deterministicUuid(context.exerciseId,`controlled-prerequisite-request-${ordinal}`),idempotencyKey:idempotencyKey??`pr264-controlled-prerequisite-${label}-${ordinal}`,
        executionToken:deterministicUuid(context.exerciseId,`controlled-prerequisite-token-${ordinal}`),executionFence:ordinal,...payload})])).rows[0].result;
      await database.client.query('set constraints all deferred');return result;
    };
    const approvedArtifact=async(excludedArtifactId=null)=>(await database.client.query(`select id,aggregate_version,current_version_id,current_approved_version_id from public.studio_artifact_aggregates
      where org_id=$1 and workspace_id=$2 and lifecycle='approved' and current_version_id=current_approved_version_id
        and ($3::uuid is null or id<>$3::uuid)
      order by id limit 1`,[generationBinding.org_id,generationBinding.workspace_id,excludedArtifactId])).rows[0];
    const handoffRequestDescriptor=artifact=>({targetWorkspaceId:generationBinding.workspace_id,studioArtifactId:artifact.id,studioArtifactVersionId:artifact.current_approved_version_id,
      expectedAggregateVersion:Number(artifact.aggregate_version),expectedCurrentVersionId:artifact.current_version_id,expectedApprovedVersionId:artifact.current_approved_version_id});
    const handoffDecisionDescriptor=(handoffId,expectedHandoffVersion,outcome,rationale)=>({handoffId,expectedHandoffVersion,outcome,rationaleDigest:jsonTextSha(rationale)});
    const packageDecisionDescriptor=(pkg,outcome,rationale)=>({workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,
      expectedPackageAggregateVersion:Number(pkg.aggregate_version),outcome,rationaleDigest:jsonTextSha(rationale)});
    const packageState=async id=>(await database.client.query(`select id,current_version,current_version_id,aggregate_version from public.enterprise_delivery_work_packages where id=$1`,[id])).rows[0];
    const packageItems=async id=>(await database.client.query(`select aggregate.id item_aggregate_id,aggregate.aggregate_version,aggregate.current_version_id,
      version.item_type,version.title,version.description,version.acceptance_criteria,version.non_functional_requirements
      from public.enterprise_delivery_work_item_aggregates aggregate join public.enterprise_delivery_work_item_versions version on version.id=aggregate.current_version_id
      where aggregate.work_package_id=$1 order by aggregate.id`,[id])).rows;
    const studioArtifactState=async id=>(await database.client.query(`select artifact.id,artifact.aggregate_version,artifact.current_version_id,version.version artifact_version,version.content
      from public.studio_artifact_aggregates artifact join public.studio_artifact_versions version on version.id=artifact.current_version_id where artifact.id=$1`,[id])).rows[0];
    let studioOrdinal=1600;
    const invokeStudioPrerequisite=async(personaKey,commandType,artifactId,payload,label)=>{
      const actor=handoffActors[personaKey],state=await studioArtifactState(artifactId);
      const authorizationVersion=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,actor.auth_user_id])).rows[0].version);
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor.auth_user_id]);const ordinal=studioOrdinal++;
      const command={commandType,requestId:deterministicUuid(context.exerciseId,`controlled-studio-prerequisite-request-${ordinal}`),idempotencyKey:`pr264-controlled-studio-${label}-${ordinal}`,
        organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,actorId:actor.auth_user_id,authorizationVersion,
        expectedAggregateVersion:Number(state.aggregate_version),expectedArtifactVersion:Number(state.artifact_version),payload};
      const result=(await database.client.query(`select public.studio_artifact_command_claim($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result;
      await database.client.query('set constraints all deferred');return result;
    };
    const invokeControlledStudioDecision=async({checkpointId,stepId,personaKey,artifactId,commandType,rationale,conditions=[]})=>{
      const actor=handoffActors[personaKey],state=await studioArtifactState(artifactId),selectors={artifactId,artifactVersionId:state.current_version_id,outcome:'approve',rationaleDigest:jsonTextSha(rationale),conditionsDigest:sha256(conditions)};
      const authorizationVersion=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,actor.auth_user_id])).rows[0].version);
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor.auth_user_id]);
      const anchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,$2,$3,'studio_artifact',$4,$5,$6::jsonb) result`,[context.exerciseDigest,checkpointId,stepId,artifactId,Number(state.aggregate_version),JSON.stringify(selectors)])).rows[0].result;
      const ordinal=studioOrdinal++;const command={commandType,requestId:anchor.execution.requestId,idempotencyKey:`pr264-controlled-studio-${stepId}-${ordinal}`,
        organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,actorId:actor.auth_user_id,authorizationVersion,
        expectedAggregateVersion:Number(state.aggregate_version),expectedArtifactVersion:Number(state.artifact_version),payload:{artifactId,artifactVersionId:state.current_version_id,outcome:'approve',rationale,conditions}};
      await database.client.query(`select public.studio_artifact_command_claim($1::jsonb)`,[JSON.stringify(command)]);await database.client.query('set constraints all deferred');
      const binding=recordPositiveBinding((await database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2) result`,[context.exerciseDigest,anchor.safeAnchor.challengeToken])).rows[0].result,anchor.safeAnchor);
      await database.client.query('select pg_sleep(0.005)');return binding;
    };
    const prepareStudioReview=async artifactId=>{
      let state=await studioArtifactState(artifactId);const content={...state.content,title:`${state.content.title??'Synthetic document'} controlled review`};
      await invokeStudioPrerequisite('requester','studio.artifact.draft.revise',artifactId,{artifactId,parentVersionId:state.current_version_id,content},'revise');
      state=await studioArtifactState(artifactId);await invokeStudioPrerequisite('requester','studio.artifact.review.submit',artifactId,{artifactId,artifactVersionId:state.current_version_id},'submit');
      state=await studioArtifactState(artifactId);await invokeStudioPrerequisite('studio_reviewer','studio.artifact.review.assign',artifactId,{artifactId,artifactVersionId:state.current_version_id,reviewerId:handoffActors.studio_reviewer.auth_user_id},'assign');
    };

    // CH-01 uses the real enterprise-AI conflict receipt/effect journal and the canonical Assess review authority.
    await database.client.query('begin');try{
      const conflict=(await database.client.query(`select id,current_resolution_version,candidate_ids from public.enterprise_assess_evidence_conflicts
        where org_id=$1 and workspace_id=$2 and is_material order by id limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
      const actor=handoffActors.requester,authorizationVersion=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,actor.auth_user_id])).rows[0].version);
      const rationale='Choose the independently inspected primary controlled-human candidate.';const candidateId=conflict.candidate_ids[0];
      const selectors={conflictId:conflict.id,resolutionVersion:Number(conflict.current_resolution_version),resolution:'choose_candidate',candidateId,authoredValueDigest:jsonTextSha(null),rationaleDigest:jsonTextSha(rationale)};
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor.auth_user_id]);
      const anchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-01','resolve-material-assess-conflict','assess_conflict',$2,$3,$4::jsonb) result`,[context.exerciseDigest,conflict.id,Number(conflict.current_resolution_version),JSON.stringify(selectors)])).rows[0].result;
      const executionToken=deterministicUuid(context.exerciseId,'controlled-assess-conflict-execution');
      const receipt=(await database.client.query(`select (public.enterprise_ai_claim_command($1,$2,$3,'transcript.assess.conflict.resolve',$4,$5,$6,null,$7)).*`,[actor.auth_user_id,generationBinding.org_id,generationBinding.workspace_id,'pr264-controlled-assess-conflict',anchor.execution.requestId,'a'.repeat(64),executionToken])).rows[0];
      const resolution=(await database.client.query(`select public.enterprise_transcript_resolve_assess_conflict($1,$2,'choose_candidate',$3,null,$4,$5,$6,$7,$8,$9,$10,$11) result`,[conflict.id,Number(conflict.current_resolution_version),candidateId,rationale,actor.auth_user_id,generationBinding.org_id,generationBinding.workspace_id,authorizationVersion,receipt.id,receipt.execution_token,receipt.execution_fence])).rows[0].result;
      await database.client.query(`select public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)`,[receipt.id,generationBinding.org_id,generationBinding.workspace_id,receipt.execution_token,receipt.execution_fence,JSON.stringify(resolution),conflict.id]);
      recordPositiveBinding((await database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2) result`,[context.exerciseDigest,anchor.safeAnchor.challengeToken])).rows[0].result,anchor.safeAnchor);
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}
    await database.client.query('select pg_sleep(0.03)');

    await database.client.query('begin');try{
      const requester=handoffActors.requester,reviewer=handoffActors.studio_reviewer;
      const requesterAuthorization=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,requester.auth_user_id])).rows[0].version);
      const reviewerAuthorization=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,reviewer.auth_user_id])).rows[0].version);
      const id=label=>deterministicUuid(context.exerciseId,`controlled-assess-review-${label}`);const processId=id('process'),caseId=id('case'),versionId=id('version'),decisionId=id('decision'),evidenceId=id('evidence'),assignmentId=id('assignment');
      await database.client.query(`insert into public.assess_processes(id,org_id,workspace_id,name,status) values($1,$2,$3,'Controlled Assess review coverage','Draft')`,[processId,generationBinding.org_id,generationBinding.workspace_id]);
      await database.client.query(`insert into public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version) values($1,$2,$3,$4,$5,'in_review',2)`,[caseId,generationBinding.org_id,generationBinding.workspace_id,processId,requester.auth_user_id]);
      await database.client.query(`insert into public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) values($1,$2,$3,$4,1,'Controlled Assess review source','create',$5)`,[versionId,caseId,generationBinding.org_id,generationBinding.workspace_id,requester.auth_user_id]);
      await database.client.query(`update public.assess_v2_cases set head_version_id=$1 where id=$2`,[versionId,caseId]);
      const fixtureReceipts=[id('decision-receipt'),id('assignment-receipt'),id('attestation-receipt')];
      for(const [index,receiptId] of fixtureReceipts.entries())await database.client.query(`insert into public.assess_command_receipts(id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at)
        values($1,$2,$3,$4,'controlled-human-review-prerequisite',$5,$6,$7,'succeeded','{}'::jsonb,statement_timestamp())`,[receiptId,generationBinding.org_id,generationBinding.workspace_id,index===2?reviewer.auth_user_id:requester.auth_user_id,`pr264-review-prerequisite-${index}`,id(`fixture-request-${index}`),'b'.repeat(64)]);
      const output={trace:[{fieldIds:['claim.controlled'],evidenceIds:[evidenceId]}],controls:['Audit'],actionControls:[]};
      await database.client.query(`insert into public.assess_v2_decision_versions(id,case_id,source_version_id,org_id,workspace_id,schema_version,rule_set_version,decision_version,validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,receipt_id,created_by,created_at)
        values($1,$2,$3,$4,$5,'schema','rules','decision-controlled','reviewer-ready','{}','[]',$6::jsonb,$7,$7,$7,$8,$9,statement_timestamp())`,[decisionId,caseId,versionId,generationBinding.org_id,generationBinding.workspace_id,JSON.stringify(output),'c'.repeat(64),fixtureReceipts[0],requester.auth_user_id]);
      await database.client.query(`insert into public.assess_v2_evidence_links(id,version_id,case_id,org_id,workspace_id,payload) values($1,$2,$3,$4,$5,$6::jsonb)`,[evidenceId,versionId,caseId,generationBinding.org_id,generationBinding.workspace_id,JSON.stringify({claimIds:['claim.controlled'],status:'submitted',validated:false,owner:requester.auth_user_id})]);
      const claims=[{claimId:'claim.controlled',evidenceIds:[evidenceId]}];
      await database.client.query(`insert into public.assess_v2_review_assignments(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_schema_version,review_sequence,material_claims,reviewer_id,assigned_by,assigned_reviewer_authorization_version,assigned_by_authorization_version,request_id,receipt_id,audit_event_id)
        values($1,$2,$3,$4,$5,1,$6,'decision-controlled','assess-v2-review-2026-07',1,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)`,[assignmentId,generationBinding.org_id,generationBinding.workspace_id,caseId,versionId,decisionId,JSON.stringify(claims),reviewer.auth_user_id,requester.auth_user_id,reviewerAuthorization,requesterAuthorization,id('assignment-request'),fixtureReceipts[1],id('assignment-audit')]);
      await database.client.query(`insert into public.assess_v2_evidence_attestations(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_id,review_schema_version,review_sequence,evidence_id,claim_ids,evidence_submitter_id,reviewer_id,reviewer_authorization_version,outcome,rationale,request_id,receipt_id,audit_event_id)
        values($1,$2,$3,$4,$5,1,$6,'decision-controlled',$7,'assess-v2-review-2026-07',1,$8,array['claim.controlled'],$9,$10,$11,'accepted','Accepted exact controlled evidence',$12,$13,$14)`,[id('attestation'),generationBinding.org_id,generationBinding.workspace_id,caseId,versionId,decisionId,assignmentId,evidenceId,requester.auth_user_id,reviewer.auth_user_id,reviewerAuthorization,id('attestation-request'),fixtureReceipts[2],id('attestation-audit')]);
      // Commit the transaction-local fixture before the human action. The real
      // Assess authority then owns its own transaction timestamp after the
      // server-issued anchor, matching the browser request boundary.
      await database.client.query('commit');
      const rationale='Approve the exact independently attested Assess result.',conditions=[];const selectors={caseId,decisionId,reviewSequence:1,resolution:'approved',rationaleDigest:jsonTextSha(rationale),conditionsDigest:sha256(conditions)};
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[reviewer.auth_user_id]);
      const anchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-01','approve-assess-result','assess_case',$2,2,$3::jsonb) result`,[context.exerciseDigest,caseId,JSON.stringify(selectors)])).rows[0].result;
      const result=(await database.client.query(`select public.pr1e_resolve_assess_v2_review($1,$2,$3,$4,$5,2,$6,$7,$8,$9::jsonb) result`,[reviewer.auth_user_id,generationBinding.org_id,generationBinding.workspace_id,caseId,decisionId,anchor.execution.requestId,'pr264-controlled-assess-review',reviewerAuthorization,JSON.stringify({reviewSequence:1,resolution:'approved',rationale,conditions})])).rows[0].result;
      assert.equal(result.outcome,'committed');recordPositiveBinding((await database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2) result`,[context.exerciseDigest,anchor.safeAnchor.challengeToken])).rows[0].result,anchor.safeAnchor);
    }catch(error){await database.client.query('rollback');throw error}

    await database.client.query('begin');try{
      const artifact=(await approvedArtifact(generationBinding.artifact_id)).id;await prepareStudioReview(artifact);
      await database.client.query('commit');
      await invokeControlledStudioDecision({checkpointId:'CH-02',stepId:'review-studio-document',personaKey:'studio_reviewer',artifactId:artifact,commandType:'studio.artifact.review.resolve',rationale:'Independent controlled-human Studio review.'});
      await invokeControlledStudioDecision({checkpointId:'CH-02',stepId:'approve-studio-document',personaKey:'studio_approver',artifactId:artifact,commandType:'studio.artifact.approval.resolve',rationale:'Independent controlled-human Studio approval.'});
    }catch(error){await database.client.query('rollback');throw error}
    await database.client.query('select pg_sleep(0.03)');
    const hybridArtifactId=await runModuleHandoffSuccess();
    // A second, independently valid exercise-owned consumed hybrid chain must
    // never substitute for the exact chain bound by the CH-03 request/consume.
    await database.client.query('begin');try{
      const actors=Object.fromEntries(users.map(user=>[user.key,{id:user.id}]));
      const versions=Object.fromEntries((await database.client.query(`select binding.persona_key,authority.version from public.pr_c_controlled_human_persona_bindings binding join public.authorization_versions authority on authority.org_id=binding.org_id and authority.user_id=binding.auth_user_id where binding.exercise_id=$1`,[context.exerciseId])).rows.map(row=>[row.persona_key,Number(row.version)]));
      const alternate=await seedAssessUpstream(database.client,context,buildIdentifiers(context,fixtureState),actors,versions,'-valid-chain-b');
      const chainBHandoff=deterministicUuid(context.exerciseId,'valid-chain-b-module-handoff');
      const invokeChainB=async(persona,commandType,expectedVersion,payload)=>{
        const actor=handoffActors[persona];await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor.auth_user_id]);
        return (await database.client.query(`select public.enterprise_assess_studio_handoff_command($1::jsonb) result`,[JSON.stringify({actorId:actor.auth_user_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,
          requestId:deterministicUuid(context.exerciseId,`valid-chain-b-${commandType}`),authorizationVersion:Number(actor.authorization_version),expectedVersion,idempotencyKey:`pr264-valid-chain-b-${commandType}`,commandType,handoffId:chainBHandoff,payload})])).rows[0].result;
      };
      await invokeChainB('requester','handoff.request',0,{upstreamHandoffId:alternate.journey.assessHandoff,artifactType:'brd',targetInputBundleId:hybridTargetBundle.id,targetInputBundleVersionId:hybridTargetBundle.version_id,targetInputBundleVersion:Number(hybridTargetBundle.version)});
      await invokeChainB('studio_reviewer','handoff.review.resolve',1,{outcome:'approve',rationale:'Valid independent chain B review'});
      await invokeChainB('studio_approver','handoff.approval.resolve',2,{outcome:'approve',rationale:'Valid independent chain B approval'});
      const consumedB=await invokeChainB('requester','handoff.consume',3,{});
      const chainB=(await database.client.query(`select artifact.id artifact_id,artifact.aggregate_version,artifact.current_version_id,artifact.current_approved_version_id,package.id source_package_id,package.version source_package_version,package.package_hash
        from public.studio_artifact_aggregates artifact join public.studio_artifact_source_packages package on package.id=artifact.source_package_id
        where artifact.id=$1 and package.source_mode='assess_plus_transcript_bundle'`,[consumedB.resourceId])).rows[0];
      assert.ok(chainB&&chainB.artifact_id!==hybridArtifactId,'adversarial requires two distinct valid consumed hybrid chains');
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[generationBinding.actor_id]);
      const chainBSelectors={artifactId:chainB.artifact_id,sourcePackageId:chainB.source_package_id,sourcePackageVersion:Number(chainB.source_package_version),sourcePackageHash:chainB.package_hash,
        templateKind:'tenant',templateId:generationBinding.template_id,templateVersionId:generationBinding.template_version_id,templateVersionDigest:sha256(Number(generationBinding.template_version)),templateHash:generationBinding.template_hash,
        expectedCurrentVersionId:chainB.current_version_id,expectedApprovedVersionId:chainB.current_approved_version_id};
      const anchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-03','generate-source-bound-document','studio_artifact',$2,$3,$4::jsonb) result`,[context.exerciseDigest,chainB.artifact_id,Number(chainB.aggregate_version),JSON.stringify(chainBSelectors)])).rows[0].result;
      const chainBCommand={...generationCommand,requestId:anchor.execution.requestId,idempotencyKey:'pr264-valid-chain-b-generation',artifactId:chainB.artifact_id,sourcePackageId:chainB.source_package_id,
        sourcePackageVersion:Number(chainB.source_package_version),sourcePackageHash:chainB.package_hash,expectedAggregateVersion:Number(chainB.aggregate_version),expectedCurrentVersionId:chainB.current_version_id,expectedApprovedVersionId:chainB.current_approved_version_id};
      const generatedB=(await database.client.query(`select public.pr_c_controlled_human_synthetic_studio_generate($1::jsonb) result`,[JSON.stringify(chainBCommand)])).rows[0].result;
      assert.equal(generatedB.outcome,'committed');
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_complete_step($1,$2)`,[context.exerciseDigest,anchor.safeAnchor.challengeToken]),/CAUSAL_CHAIN_REJECTED/u);
    }finally{await database.client.query('rollback')}
    generationBinding=(await database.client.query(`select artifact.id artifact_id,artifact.aggregate_version,artifact.current_version_id,artifact.current_approved_version_id,package.id source_package_id,package.version source_package_version,package.package_hash,
      template.id template_id,template.current_approved_version_id template_version_id,version.version template_version,version.template_hash,binding.auth_user_id actor_id,authority.version authorization_version,exercise.org_id,exercise.workspace_id
      from public.pr_c_controlled_human_exercises exercise join public.pr_c_controlled_human_persona_bindings binding on binding.exercise_id=exercise.id and binding.persona_key='requester'
      join public.authorization_versions authority on authority.org_id=exercise.org_id and authority.user_id=binding.auth_user_id
      join public.studio_artifact_aggregates artifact on artifact.id=$2 and artifact.org_id=exercise.org_id and artifact.workspace_id=exercise.workspace_id
      join public.studio_artifact_source_packages package on package.id=artifact.source_package_id and package.source_mode='assess_plus_transcript_bundle'
      join public.studio_tenant_template_aggregates template on template.org_id=exercise.org_id and template.workspace_id=exercise.workspace_id and template.lifecycle='approved'
      join public.studio_tenant_template_versions version on version.id=template.current_approved_version_id where exercise.exercise_digest=$1`,[context.exerciseDigest,hybridArtifactId])).rows[0];
    assert.ok(generationBinding,'CH-03 generation must bind the consumed hybrid artifact');
    generationCommand={...generationCommand,actorId:generationBinding.actor_id,organizationId:generationBinding.org_id,workspaceId:generationBinding.workspace_id,authorizationVersion:Number(generationBinding.authorization_version),artifactId:generationBinding.artifact_id,sourcePackageId:generationBinding.source_package_id,sourcePackageVersion:Number(generationBinding.source_package_version),sourcePackageHash:generationBinding.package_hash,expectedAggregateVersion:Number(generationBinding.aggregate_version),expectedCurrentVersionId:generationBinding.current_version_id,expectedApprovedVersionId:generationBinding.current_approved_version_id,template:{kind:'tenant',templateId:generationBinding.template_id,versionId:generationBinding.template_version_id,version:Number(generationBinding.template_version),hash:generationBinding.template_hash}};
    generationSelectors={artifactId:generationBinding.artifact_id,sourcePackageId:generationBinding.source_package_id,sourcePackageVersion:Number(generationBinding.source_package_version),sourcePackageHash:generationBinding.package_hash,templateKind:'tenant',templateId:generationBinding.template_id,templateVersionId:generationBinding.template_version_id,templateVersionDigest:sha256(Number(generationBinding.template_version)),templateHash:generationBinding.template_hash,expectedCurrentVersionId:generationBinding.current_version_id,expectedApprovedVersionId:generationBinding.current_approved_version_id};
    await database.client.query('select pg_sleep(0.03)');
    await runGenerationSuccess();
    await database.client.query('select pg_sleep(0.03)');
    await database.client.query('begin');try{
      const artifact=generationBinding.artifact_id;
      let hybridState=await studioArtifactState(artifact);
      await invokeStudioPrerequisite('requester','studio.artifact.review.submit',artifact,{artifactId:artifact,artifactVersionId:hybridState.current_version_id},'hybrid-submit');
      hybridState=await studioArtifactState(artifact);
      await invokeStudioPrerequisite('studio_reviewer','studio.artifact.review.assign',artifact,{artifactId:artifact,artifactVersionId:hybridState.current_version_id,reviewerId:handoffActors.studio_reviewer.auth_user_id},'hybrid-assign');
      hybridState=await studioArtifactState(artifact);
      await invokeStudioPrerequisite('studio_reviewer','studio.artifact.review.resolve',artifact,{artifactId:artifact,artifactVersionId:hybridState.current_version_id,outcome:'approve',rationale:'Independent hybrid Studio review.',conditions:[]},'hybrid-review');
      await database.client.query('commit');
      await invokeControlledStudioDecision({checkpointId:'CH-03',stepId:'approve-hybrid-studio-document',personaKey:'studio_approver',artifactId:artifact,commandType:'studio.artifact.approval.resolve',rationale:'Approve exact hybrid Studio document.'});
    }catch(error){await database.client.query('rollback');throw error}

    // CH-04 deliberately exercises both mutually exclusive target-review outcomes in independent transactions.
    await database.client.query('begin');try{
      const artifact=await approvedArtifact();const request=handoffRequestDescriptor(artifact);
      const created=await invokeControlledDelivery({checkpointId:'CH-04',stepId:'request-exact-studio-handoff',personaKey:'requester',targetFamily:'studio_artifact',targetId:artifact.id,expectedVersion:Number(artifact.aggregate_version),selectors:request,action:'delivery.handoff.request',payload:request});
      const rationale='Controlled-human reviewer requests exact handoff changes.';const decision=handoffDecisionDescriptor(created.result.resourceId,1,'changes_requested',rationale);
      await invokeControlledDelivery({checkpointId:'CH-04',stepId:'request-handoff-changes',personaKey:'delivery_target_acceptor',targetFamily:'delivery_handoff',targetId:created.result.resourceId,expectedVersion:1,selectors:decision,action:'delivery.handoff.review.resolve',payload:{handoffId:created.result.resourceId,expectedHandoffVersion:1,outcome:'changes_requested',rationale}});
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}
    await database.client.query('select pg_sleep(0.03)');
    await database.client.query('begin');try{
      const artifact=await approvedArtifact();const request=handoffRequestDescriptor(artifact);
      const created=await invokeDeliveryPrerequisite('requester','delivery.handoff.request',request,'ch04-rejected-request');
      const rationale='Controlled-human reviewer rejects the fresh exact handoff.';const decision=handoffDecisionDescriptor(created.resourceId,1,'rejected',rationale);
      await invokeControlledDelivery({checkpointId:'CH-04',stepId:'reject-new-exact-handoff-request',personaKey:'delivery_target_acceptor',targetFamily:'delivery_handoff',targetId:created.resourceId,expectedVersion:1,selectors:decision,action:'delivery.handoff.review.resolve',payload:{handoffId:created.resourceId,expectedHandoffVersion:1,outcome:'rejected',rationale}});
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}
    await database.client.query('select pg_sleep(0.03)');

    // CH-05 proves request/review/approval/consume and a new replay attempt using the original business idempotency identity.
    await database.client.query('begin');try{
      const artifact=await approvedArtifact();const request=handoffRequestDescriptor(artifact);
      const created=await invokeControlledDelivery({checkpointId:'CH-05',stepId:'request-fresh-exact-handoff',personaKey:'requester',targetFamily:'studio_artifact',targetId:artifact.id,expectedVersion:Number(artifact.aggregate_version),selectors:request,action:'delivery.handoff.request',payload:request});
      const reviewRationale='Independent target reviewer accepts exact governed lineage.';const review=handoffDecisionDescriptor(created.result.resourceId,1,'approved',reviewRationale);
      await invokeControlledDelivery({checkpointId:'CH-05',stepId:'review-handoff-independently',personaKey:'delivery_target_acceptor',targetFamily:'delivery_handoff',targetId:created.result.resourceId,expectedVersion:1,selectors:review,action:'delivery.handoff.review.resolve',payload:{handoffId:created.result.resourceId,expectedHandoffVersion:1,outcome:'approved',rationale:reviewRationale}});
      const approvalRationale='Independent target approver accepts exact governed lineage.';const approval=handoffDecisionDescriptor(created.result.resourceId,2,'approved',approvalRationale);
      await invokeControlledDelivery({checkpointId:'CH-05',stepId:'approve-handoff-independently',personaKey:'delivery_approver',targetFamily:'delivery_handoff',targetId:created.result.resourceId,expectedVersion:2,selectors:approval,action:'delivery.handoff.approval.resolve',payload:{handoffId:created.result.resourceId,expectedHandoffVersion:2,outcome:'approved',rationale:approvalRationale}});
      const consume=await invokeControlledDelivery({checkpointId:'CH-05',stepId:'consume-approved-handoff-once',personaKey:'delivery_consumer',targetFamily:'delivery_handoff',targetId:created.result.resourceId,expectedVersion:3,selectors:{handoffId:created.result.resourceId,expectedHandoffVersion:3},action:'delivery.handoff.consume',payload:{handoffId:created.result.resourceId,expectedHandoffVersion:3}});
      await database.client.query('savepoint third_replay_rejected');
      await invokeDeliveryPrerequisite('delivery_consumer','delivery.handoff.consume',{handoffId:created.result.resourceId,expectedHandoffVersion:3},'third-attempt-predecessor',consume.command.idempotencyKey);
      await assert.rejects(invokeControlledDelivery({checkpointId:'CH-05',stepId:'replay-consumption-same-target',personaKey:'delivery_consumer',targetFamily:'delivery_handoff',targetId:created.result.resourceId,expectedVersion:3,selectors:{handoffId:created.result.resourceId,expectedHandoffVersion:3},action:'delivery.handoff.consume',payload:{handoffId:created.result.resourceId,expectedHandoffVersion:3}}),/REPLAY_REJECTED/u);
      await database.client.query('rollback to savepoint third_replay_rejected');
      const replay=await invokeControlledDelivery({checkpointId:'CH-05',stepId:'replay-consumption-same-target',personaKey:'delivery_consumer',targetFamily:'delivery_handoff',targetId:created.result.resourceId,expectedVersion:3,selectors:{handoffId:created.result.resourceId,expectedHandoffVersion:3},action:'delivery.handoff.consume',payload:{handoffId:created.result.resourceId,expectedHandoffVersion:3}});
      assert.equal(replay.result.resourceId,consume.result.resourceId);
      assert.equal(Number((await database.client.query(`select count(*) count from public.enterprise_delivery_monitor_effects where receipt_id=$1`,[consume.command.receiptId])).rows[0].count),1);
      assert.equal(Number((await database.client.query(`select count(*) count from public.enterprise_delivery_monitor_command_attempts where receipt_id=$1`,[consume.command.receiptId])).rows[0].count),2);
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}
    await database.client.query('select pg_sleep(0.03)');

    const manualItems=[
      {clientKey:'a-root',itemType:'Epic',title:'Controlled root',description:'Synthetic root scope.',acceptanceCriteria:['Root is reviewed.'],nonFunctionalRequirements:[]},
      {clientKey:'b-child',parentClientKey:'a-root',itemType:'Task',title:'Controlled child',description:'Synthetic child scope.',acceptanceCriteria:['Child is reviewed.'],nonFunctionalRequirements:['No execution.']},
    ];
    const manualSelectors=(brief,items)=>({manualBriefDigest:sha256(brief),orderedItemsDigest:sha256([...items].sort((a,b)=>a.clientKey.localeCompare(b.clientKey))),itemCount:items.length});
    // A well-formed authored-item selector cannot attest a different immutable
    // item body than the one the production command actually committed.
    await database.client.query('begin');try{
      const manual=await invokeDeliveryPrerequisite('delivery_author','delivery.package.create.manual',{manualBrief:'False selector edited package',items:manualItems},'false-edited-selector-package');
      const edited=(await packageItems(manual.resourceId))[0];const rationale='Edit exact immutable item body.';
      const actualItem={itemType:edited.item_type,title:`${edited.title} actual`,description:edited.description,acceptanceCriteria:edited.acceptance_criteria,nonFunctionalRequirements:edited.non_functional_requirements};
      const falseSelectors={itemAggregateId:edited.item_aggregate_id,expectedAggregateVersion:Number(edited.aggregate_version),expectedItemVersionId:edited.current_version_id,outcome:'edited',rationaleDigest:jsonTextSha(rationale),authoredItemDigest:sha256({...actualItem,title:`${edited.title} substituted`})};
      await assert.rejects(invokeControlledDelivery({checkpointId:'CH-06',stepId:'edit-one-item-with-rationale',personaKey:'delivery_author',targetFamily:'delivery_item',targetId:edited.item_aggregate_id,expectedVersion:Number(edited.aggregate_version),selectors:falseSelectors,action:'delivery.item.review',payload:{itemAggregateId:edited.item_aggregate_id,expectedAggregateVersion:Number(edited.aggregate_version),expectedItemVersionId:edited.current_version_id,outcome:'edited',rationale,item:actualItem}}),/INTENT_REJECTED/u);
    }finally{await database.client.query('rollback')}
    // CH-06/07/08 use one coherent governed package, including complete-set proof, selected revision, and exact replay.
    await database.client.query('begin');try{
      const manual=await invokeDeliveryPrerequisite('delivery_author','delivery.package.create.manual',{manualBrief:'Controlled governed package',items:manualItems},'governed-package');
      let items=await packageItems(manual.resourceId);const edited=items[0];const editRationale='Explicitly edit only this selected descendant.';
      const editedItem={itemType:edited.item_type,title:`${edited.title} revised`,description:edited.description,acceptanceCriteria:edited.acceptance_criteria,nonFunctionalRequirements:edited.non_functional_requirements};
      const editSelectors={itemAggregateId:edited.item_aggregate_id,expectedAggregateVersion:Number(edited.aggregate_version),expectedItemVersionId:edited.current_version_id,outcome:'edited',rationaleDigest:jsonTextSha(editRationale),authoredItemDigest:sha256(editedItem)};
      await invokeControlledDelivery({checkpointId:'CH-06',stepId:'edit-one-item-with-rationale',personaKey:'delivery_author',targetFamily:'delivery_item',targetId:edited.item_aggregate_id,expectedVersion:Number(edited.aggregate_version),selectors:editSelectors,action:'delivery.item.review',payload:{itemAggregateId:edited.item_aggregate_id,expectedAggregateVersion:Number(edited.aggregate_version),expectedItemVersionId:edited.current_version_id,outcome:'edited',rationale:editRationale,item:editedItem}});
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}
    await database.client.query('begin');try{
      const manual=await invokeDeliveryPrerequisite('delivery_author','delivery.package.create.manual',{manualBrief:'Controlled governed package for complete decisions',items:manualItems},'governed-complete-package');
      let items=await packageItems(manual.resourceId);
      const first=items[0];await invokeDeliveryPrerequisite('delivery_author','delivery.item.review',{itemAggregateId:first.item_aggregate_id,expectedAggregateVersion:Number(first.aggregate_version),expectedItemVersionId:first.current_version_id,outcome:'accepted',rationale:'Accept first current proposal.'},'accept-first');
      items=await packageItems(manual.resourceId);const last=items[1];const completeSet=items.map(item=>({itemAggregateId:item.item_aggregate_id,expectedAggregateVersion:Number(item.aggregate_version),expectedItemVersionId:item.current_version_id}));const lastRationale='Accept final proposal after inspecting the complete bounded set.';
      const completeSelectors={itemAggregateId:last.item_aggregate_id,expectedAggregateVersion:Number(last.aggregate_version),expectedItemVersionId:last.current_version_id,outcome:'accepted',rationaleDigest:jsonTextSha(lastRationale),completeItemSetDigest:sha256(completeSet),completeItemCount:completeSet.length};
      await invokeControlledDelivery({checkpointId:'CH-06',stepId:'decide-every-current-proposal',personaKey:'delivery_author',targetFamily:'delivery_item',targetId:last.item_aggregate_id,expectedVersion:Number(last.aggregate_version),selectors:completeSelectors,action:'delivery.item.review',payload:{itemAggregateId:last.item_aggregate_id,expectedAggregateVersion:Number(last.aggregate_version),expectedItemVersionId:last.current_version_id,outcome:'accepted',rationale:lastRationale}});
      let pkg=await packageState(manual.resourceId);const changesRationale='Request one explicit descendant revision.';const changesSelectors=packageDecisionDescriptor(pkg,'changes_requested',changesRationale);
      await invokeControlledDelivery({checkpointId:'CH-07',stepId:'request-package-changes',personaKey:'delivery_reviewer',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors:changesSelectors,action:'delivery.package.review.resolve',payload:{...changesSelectors,rationale:changesRationale,rationaleDigest:undefined,outcome:'changes_requested'}});
      items=await packageItems(pkg.id);const expectedItems=items.map(item=>({itemAggregateId:item.item_aggregate_id,expectedAggregateVersion:Number(item.aggregate_version),expectedItemVersionId:item.current_version_id}));const selected=items[0];const revisionItem={itemType:selected.item_type,title:`${selected.title} recovery`,description:selected.description,acceptanceCriteria:selected.acceptance_criteria,nonFunctionalRequirements:selected.non_functional_requirements};const revisionRationale='Commit exactly one selected child change.';const itemRevisions=[{...expectedItems[0],rationale:revisionRationale,item:revisionItem}];
      const revisionSelectors={workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,expectedPackageAggregateVersion:Number(pkg.aggregate_version),expectedItemsDigest:sha256(expectedItems),expectedItemCount:expectedItems.length,itemRevisionsDigest:sha256(itemRevisions),revisionCount:itemRevisions.length};
      const revision=await invokeControlledDelivery({checkpointId:'CH-07',stepId:'commit-only-explicitly-edited-descendants',personaKey:'delivery_author',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.aggregate_version),selectors:revisionSelectors,action:'delivery.package.revision.commit',payload:{workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,expectedPackageAggregateVersion:Number(pkg.aggregate_version),expectedItems,itemRevisions}});
      const revisedItems=await packageItems(pkg.id);
      for(const [index,item] of revisedItems.entries())await invokeDeliveryPrerequisite('delivery_author','delivery.item.review',{itemAggregateId:item.item_aggregate_id,expectedAggregateVersion:Number(item.aggregate_version),expectedItemVersionId:item.current_version_id,outcome:'accepted',rationale:`Accept revised snapshot item ${index+1}.`},`accept-revised-${index}`);
      pkg=await packageState(pkg.id);const reviewRationale='Review complete revised package independently.';const reviewSelectors=packageDecisionDescriptor(pkg,'approved',reviewRationale);
      await invokeControlledDelivery({checkpointId:'CH-07',stepId:'review-complete-revised-package',personaKey:'delivery_reviewer',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors:reviewSelectors,action:'delivery.package.review.resolve',payload:{workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,expectedPackageAggregateVersion:Number(pkg.aggregate_version),outcome:'approved',rationale:reviewRationale}});
      const approvalRationale='Approve the exact independently reviewed revision.';const approvalSelectors=packageDecisionDescriptor(pkg,'approved',approvalRationale);
      await invokeControlledDelivery({checkpointId:'CH-07',stepId:'approve-exact-revised-package',personaKey:'delivery_approver',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors:approvalSelectors,action:'delivery.package.approval.resolve',payload:{workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,expectedPackageAggregateVersion:Number(pkg.aggregate_version),outcome:'approved',rationale:approvalRationale}});
      const baselineSelectors={workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id};
      const baseline=await invokeControlledDelivery({checkpointId:'CH-08',stepId:'create-baseline-with-exact-package-selectors',personaKey:'delivery_approver',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors:baselineSelectors,action:'monitor.baseline.create',payload:baselineSelectors});
      const baselineReplay=await invokeControlledDelivery({checkpointId:'CH-08',stepId:'replay-baseline-creation',personaKey:'delivery_approver',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors:baselineSelectors,action:'monitor.baseline.create',payload:baselineSelectors});
      assert.equal(baselineReplay.result.resourceId,baseline.result.resourceId);assert.equal(Number((await database.client.query(`select count(*) count from public.enterprise_delivery_monitor_effects where receipt_id=$1`,[baseline.command.receiptId])).rows[0].count),1);
      assert.equal(Number((await database.client.query(`select count(*) count from public.enterprise_delivery_monitor_command_attempts where receipt_id=$1`,[baseline.command.receiptId])).rows[0].count),2);
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}
    await database.client.query('select pg_sleep(0.05)');

    // CH-11 proves the direct manual path against its exact authored tree and independent decisions.
    await database.client.query('begin');try{
      const brief='Controlled direct Delivery package';const selectors={...manualSelectors(brief,manualItems),manualBriefDigest:sha256('Substituted but well-formed manual brief')};
      const authorizationVersion=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,deliveryActors.delivery_author.auth_user_id])).rows[0].version);
      await assert.rejects(invokeControlledDelivery({checkpointId:'CH-11',stepId:'create-manual-delivery-package',personaKey:'delivery_author',targetFamily:'workspace',targetId:generationBinding.workspace_id,expectedVersion:authorizationVersion,selectors,action:'delivery.package.create.manual',payload:{manualBrief:brief,items:manualItems}}),/INTENT_REJECTED/u);
    }finally{await database.client.query('rollback')}
    const runManualDeliverySuccess=async()=>{await database.client.query('begin');try{
      const brief='Controlled direct Delivery package';const selectors=manualSelectors(brief,manualItems);
      const manual=await invokeControlledDelivery({checkpointId:'CH-11',stepId:'create-manual-delivery-package',personaKey:'delivery_author',targetFamily:'workspace',targetId:generationBinding.workspace_id,
        expectedVersion:Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,deliveryActors.delivery_author.auth_user_id])).rows[0].version),selectors,action:'delivery.package.create.manual',payload:{manualBrief:brief,items:manualItems}});
      for(const [index,item] of manual.result.items.entries())await invokeDeliveryPrerequisite('delivery_author','delivery.item.review',{itemAggregateId:item.aggregateId,expectedAggregateVersion:1,expectedItemVersionId:item.versionId,outcome:'accepted',rationale:`Accept manual item ${index+1}.`},`accept-manual-${index}`);
      const pkg=await packageState(manual.result.resourceId);const reviewRationale='Review complete manual package independently.';const reviewSelectors=packageDecisionDescriptor(pkg,'approved',reviewRationale);
      await invokeControlledDelivery({checkpointId:'CH-11',stepId:'review-manual-delivery-package',personaKey:'delivery_reviewer',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors:reviewSelectors,action:'delivery.package.review.resolve',payload:{workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,expectedPackageAggregateVersion:Number(pkg.aggregate_version),outcome:'approved',rationale:reviewRationale}});
      const approvalRationale='Approve exact manual package independently.';const approvalSelectors=packageDecisionDescriptor(pkg,'approved',approvalRationale);
      await invokeControlledDelivery({checkpointId:'CH-11',stepId:'approve-manual-delivery-package',personaKey:'delivery_approver',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors:approvalSelectors,action:'delivery.package.approval.resolve',payload:{workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,expectedPackageAggregateVersion:Number(pkg.aggregate_version),outcome:'approved',rationale:approvalRationale}});
      const baselineSelectors={workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id};
      await invokeControlledDelivery({checkpointId:'CH-11',stepId:'create-read-only-manual-baseline',personaKey:'delivery_approver',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors:baselineSelectors,action:'monitor.baseline.create',payload:baselineSelectors});
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}};

    // CH-10 carries a real approved direct-transcript Studio artifact through Delivery while retaining not-assessed lineage.
    await database.client.query('select pg_sleep(0.05)');
    await runDirectSourceSuccess();
    await database.client.query('begin');try{
      let artifact=(await database.client.query(`select artifact.id,artifact.aggregate_version,artifact.current_version_id,artifact.current_approved_version_id
        from public.studio_artifact_aggregates artifact join public.studio_artifact_source_packages source on source.id=artifact.source_package_id
        where artifact.org_id=$1 and artifact.workspace_id=$2 and source.planning_only=true order by artifact.id limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];assert.ok(artifact);
      await prepareStudioReview(artifact.id);
      await invokeStudioPrerequisite('studio_reviewer','studio.artifact.review.resolve',artifact.id,{artifactId:artifact.id,artifactVersionId:(await studioArtifactState(artifact.id)).current_version_id,outcome:'approve',rationale:'Review direct planning Studio artifact.',conditions:[]},'direct-review');
      await invokeStudioPrerequisite('studio_approver','studio.artifact.approval.resolve',artifact.id,{artifactId:artifact.id,artifactVersionId:(await studioArtifactState(artifact.id)).current_version_id,outcome:'approve',rationale:'Approve direct planning Studio artifact.',conditions:[]},'direct-approval');
      artifact=(await database.client.query(`select id,aggregate_version,current_version_id,current_approved_version_id from public.studio_artifact_aggregates where id=$1`,[artifact.id])).rows[0];
      const request=handoffRequestDescriptor(artifact);
      const created=await invokeControlledDelivery({checkpointId:'CH-10',stepId:'handoff-direct-studio-plan',personaKey:'requester',targetFamily:'studio_artifact',targetId:artifact.id,expectedVersion:Number(artifact.aggregate_version),selectors:request,action:'delivery.handoff.request',payload:request});
      await invokeDeliveryPrerequisite('delivery_target_acceptor','delivery.handoff.review.resolve',{handoffId:created.result.resourceId,expectedHandoffVersion:1,outcome:'approved',rationale:'Review direct planning handoff.'},'direct-handoff-review');
      await invokeDeliveryPrerequisite('delivery_approver','delivery.handoff.approval.resolve',{handoffId:created.result.resourceId,expectedHandoffVersion:2,outcome:'approved',rationale:'Approve direct planning handoff.'},'direct-handoff-approval');
      const consumed=await invokeDeliveryPrerequisite('delivery_consumer','delivery.handoff.consume',{handoffId:created.result.resourceId,expectedHandoffVersion:3},'direct-handoff-consume');
      for(const [index,item] of (await packageItems(consumed.resourceId)).entries())await invokeDeliveryPrerequisite('delivery_author','delivery.item.review',{itemAggregateId:item.item_aggregate_id,expectedAggregateVersion:Number(item.aggregate_version),expectedItemVersionId:item.current_version_id,outcome:'accepted',rationale:`Accept direct planning item ${index+1}.`},`direct-item-${index}`);
      const pkg=await packageState(consumed.resourceId);
      await invokeDeliveryPrerequisite('delivery_reviewer','delivery.package.review.resolve',{workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,expectedPackageAggregateVersion:Number(pkg.aggregate_version),outcome:'approved',rationale:'Review direct planning package.'},'direct-package-review');
      const rationale='Approve direct planning package without assessed classification.';const selectors=packageDecisionDescriptor(pkg,'approved',rationale);
      await invokeControlledDelivery({checkpointId:'CH-10',stepId:'approve-direct-planning-package',personaKey:'delivery_approver',targetFamily:'delivery_work_package',targetId:pkg.id,expectedVersion:Number(pkg.current_version),selectors,action:'delivery.package.approval.resolve',payload:{workPackageId:pkg.id,expectedPackageVersion:Number(pkg.current_version),expectedPackageVersionId:pkg.current_version_id,expectedPackageAggregateVersion:Number(pkg.aggregate_version),outcome:'approved',rationale}});
      await database.client.query('commit');
    }catch(error){await database.client.query('rollback');throw error}
    await database.client.query('select pg_sleep(0.03)');
    await database.client.query('select pg_sleep(0.05)');
    await runManualDeliverySuccess();
    await database.client.query('select pg_sleep(0.03)');
    await assert.rejects(database.client.query(`select public.pr_c_controlled_human_issue_step_binding($1,'CH-12','revoked-actor-projection-denied',$2)`,[context.exerciseDigest,deterministicUuid(context.exerciseId,'evidence-only-denial')]),/PREANCHOR_REQUIRED/u);
    const revokedActor=users.find(user=>user.key==='revoked_actor').id;
    await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[revokedActor]);
    const revokedAuthority=(await database.client.query(`select authority.version,binding.role_id from public.authorization_versions authority join public.pr_c_controlled_human_persona_bindings binding on binding.org_id=authority.org_id and binding.auth_user_id=authority.user_id where authority.org_id=$1 and authority.user_id=$2`,[generationBinding.org_id,revokedActor])).rows[0];
    const revokedVersion=Number(revokedAuthority.version);
    await database.client.query('begin');try{
      await database.client.query(`update public.profiles set status='active' where id=$1`,[revokedActor]);
      await database.client.query(`update public.organization_members set status='active',disabled_at=null where user_id=$1 and org_id=$2`,[revokedActor,generationBinding.org_id]);
      await database.client.query(`update public.workspace_memberships set status='active',disabled_at=null where user_id=$1 and org_id=$2 and workspace_id=$3`,[revokedActor,generationBinding.org_id,generationBinding.workspace_id]);
      await database.client.query(`insert into public.role_capabilities(role_id,capability_key) values($1,'project.read')`,[revokedAuthority.role_id]);
      const activeVersion=Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,revokedActor])).rows[0].version);
      const successAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-12','revoked-actor-projection-denied','workspace',$2,$3,'{}'::jsonb) result`,[context.exerciseDigest,generationBinding.workspace_id,activeVersion])).rows[0].result;
      await database.client.query('savepoint unexpected_success');
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_execute_denied_step($1,$2)`,[context.exerciseDigest,successAnchor.safeAnchor.challengeToken]),/NEGATIVE_UNEXPECTED_SUCCESS/u);
      await database.client.query('rollback to savepoint unexpected_success');
      assert.equal(Number((await database.client.query(`select count(*) count from public.pr_c_controlled_human_action_bindings where anchor_id=(select id from public.pr_c_controlled_human_action_anchors where challenge_token=$1)`,[successAnchor.safeAnchor.challengeToken])).rows[0].count),0);
    }finally{await database.client.query('rollback')}
    const projectionAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-12','revoked-actor-projection-denied','workspace',$2,$3,'{}'::jsonb) result`,[context.exerciseDigest,generationBinding.workspace_id,revokedVersion])).rows[0].result;
    const projectionBinding=(await database.client.query(`select public.pr_c_controlled_human_execute_denied_step($1,$2) result`,[context.exerciseDigest,projectionAnchor.safeAnchor.challengeToken])).rows[0].result;
    recordNegativeBinding(projectionBinding,projectionAnchor.safeAnchor);
    assert.equal(projectionBinding.result,'denied');assert.equal((await database.client.query(`select denial_proof_kind from public.pr_c_controlled_human_action_bindings where binding_token=$1`,[projectionBinding.bindingToken])).rows[0].denial_proof_kind,'server_denied_attempt');
    const mutationAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-12','revoked-actor-mutation-denied','workspace',$2,$3,$4::jsonb) result`,[context.exerciseDigest,generationBinding.workspace_id,revokedVersion,JSON.stringify(denialManualSelectors)])).rows[0].result;
    const mutationBinding=(await database.client.query(`select public.pr_c_controlled_human_execute_denied_step($1,$2) result`,[context.exerciseDigest,mutationAnchor.safeAnchor.challengeToken])).rows[0].result;
    recordNegativeBinding(mutationBinding,mutationAnchor.safeAnchor);
    assert.equal(mutationBinding.result,'denied');assert.equal((await database.client.query(`select denial_proof_kind from public.pr_c_controlled_human_action_bindings where binding_token=$1`,[mutationBinding.bindingToken])).rows[0].denial_proof_kind,'server_denied_attempt');
    await assert.rejects(database.client.query(`update public.pr_c_controlled_human_action_bindings set observed_version=observed_version+1 where binding_token=$1`,[mutationBinding.bindingToken]),/IMMUTABLE/u);
    for(const [personaKey,projectionStep,mutationStep] of [
      ['same_org_other_workspace','same-org-other-workspace-projection-denied','same-org-other-workspace-mutation-denied'],
      ['cross_org_actor','cross-org-projection-denied','cross-org-mutation-denied'],
    ]){
      const negativeActor=(await database.client.query(`select binding.auth_user_id,authority.version authorization_version from public.pr_c_controlled_human_persona_bindings binding join public.authorization_versions authority on authority.org_id=binding.org_id and authority.user_id=binding.auth_user_id where binding.exercise_id=$1 and binding.persona_key=$2`,[context.exerciseId,personaKey])).rows[0];
      await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[negativeActor.auth_user_id]);
      const deniedProjectionAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-12',$2,'workspace',$3,$4,'{}'::jsonb) result`,[context.exerciseDigest,projectionStep,generationBinding.workspace_id,Number(negativeActor.authorization_version)])).rows[0].result;
      const deniedProjection=(await database.client.query(`select public.pr_c_controlled_human_execute_denied_step($1,$2) result`,[context.exerciseDigest,deniedProjectionAnchor.safeAnchor.challengeToken])).rows[0].result;
      recordNegativeBinding(deniedProjection,deniedProjectionAnchor.safeAnchor);
      assert.equal(deniedProjection.result,'denied');
      const deniedMutationAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-12',$2,'workspace',$3,$4,$5::jsonb) result`,[context.exerciseDigest,mutationStep,generationBinding.workspace_id,Number(negativeActor.authorization_version),JSON.stringify(denialManualSelectors)])).rows[0].result;
      const deniedMutation=(await database.client.query(`select public.pr_c_controlled_human_execute_denied_step($1,$2) result`,[context.exerciseDigest,deniedMutationAnchor.safeAnchor.challengeToken])).rows[0].result;
      recordNegativeBinding(deniedMutation,deniedMutationAnchor.safeAnchor);
      assert.equal(deniedMutation.result,'denied');
    }
    // CH-14 is entirely browser/human-attested. Preserve a bounded interval for
    // those ordered observations before the CH-13 response-loss operation.
    await database.client.query('select pg_sleep(0.12)');
    await runResponseLossSuccess();
    const deliveryAuthor=(await database.client.query(`select binding.auth_user_id actor_id,authority.version authorization_version from public.pr_c_controlled_human_persona_bindings binding join public.authorization_versions authority on authority.org_id=binding.org_id and authority.user_id=binding.auth_user_id where binding.exercise_id=$1 and binding.persona_key='delivery_author'`,[context.exerciseId])).rows[0];
    await database.client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[deliveryAuthor.actor_id]);
    const packages=(await database.client.query(`select id,aggregate_version,current_version,current_version_id from public.enterprise_delivery_work_packages where org_id=$1 and workspace_id=$2 order by id limit 2`,[generationBinding.org_id,generationBinding.workspace_id])).rows;
    await database.client.query('begin');try{
      await assert.rejects(database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-13','reject-stale-authorization','delivery_work_package',$2,$3,$4::jsonb) result`,[context.exerciseDigest,packages[0].id,Number(packages[0].aggregate_version),JSON.stringify({workPackageId:packages[1].id,expectedPackageVersion:Number(packages[1].current_version),expectedPackageVersionId:packages[1].current_version_id,expectedPackageAggregateVersion:Number(packages[1].aggregate_version),expectedItemsDigest:sha256([{item:'other-target'}]),expectedItemCount:1,itemRevisionsDigest:sha256([{item:'other-target'}]),revisionCount:1})]),/ANCHOR_REJECTED/u);
    }finally{await database.client.query('rollback')}
    const staleSelector={workPackageId:packages[0].id,expectedPackageVersion:Number(packages[0].current_version),expectedPackageVersionId:packages[0].current_version_id,expectedPackageAggregateVersion:Number(packages[0].aggregate_version),expectedItemsDigest:sha256([{item:'stale-auth-precondition'}]),expectedItemCount:1,itemRevisionsDigest:sha256([{item:'stale-auth-precondition'}]),revisionCount:1};
    const staleAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-13','reject-stale-authorization','delivery_work_package',$2,$3,$4::jsonb) result`,[context.exerciseDigest,packages[0].id,Number(packages[0].aggregate_version),JSON.stringify(staleSelector)])).rows[0].result;
    const staleBinding=(await database.client.query(`select public.pr_c_controlled_human_execute_denied_step($1,$2) result`,[context.exerciseDigest,staleAnchor.safeAnchor.challengeToken])).rows[0].result;
    recordNegativeBinding(staleBinding,staleAnchor.safeAnchor);
    const staleDenialDigest=(await database.client.query(`select 'sha256:'||public.pr_c_controlled_human_sha256_jsonb(jsonb_build_object('denialCode','ENTERPRISE_DELIVERY_RESOURCE_STALE')) digest`)).rows[0].digest;
    assert.equal(staleBinding.result,'denied');assert.equal(staleBinding.denialCodeDigest,staleDenialDigest);
    assert.equal(Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,deliveryAuthor.actor_id])).rows[0].version),Number(deliveryAuthor.authorization_version)+1);
    const staleSourceArtifact=(await database.client.query(`select artifact.id,artifact.aggregate_version,artifact.current_version_id,artifact.current_approved_version_id from public.studio_artifact_aggregates artifact join public.studio_artifact_source_packages source on source.id=artifact.source_package_id and source.artifact_id=artifact.id where artifact.org_id=$1 and artifact.workspace_id=$2 and artifact.lifecycle='approved' and artifact.current_version_id=artifact.current_approved_version_id and source.source_mode in('direct_transcript_bundle','assess_handoff','assess_plus_transcript_bundle') order by (source.source_mode='manual_brief'),artifact.id limit 1`,[generationBinding.org_id,generationBinding.workspace_id])).rows[0];
    assert.ok(staleSourceArtifact,'stale-source adversarial requires an approved governed-source artifact');
    const currentDeliveryAuthorVersion=Number(deliveryAuthor.authorization_version)+1;
    const staleSourceSelectors={targetWorkspaceId:generationBinding.workspace_id,studioArtifactId:staleSourceArtifact.id,studioArtifactVersionId:staleSourceArtifact.current_approved_version_id,expectedAggregateVersion:Number(staleSourceArtifact.aggregate_version),expectedCurrentVersionId:staleSourceArtifact.current_version_id,expectedApprovedVersionId:staleSourceArtifact.current_approved_version_id};
    const staleSourceAnchor=(await database.client.query(`select public.pr_c_controlled_human_anchor_step($1,'CH-13','reject-stale-source-change','studio_artifact',$2,$3,$4::jsonb) result`,[context.exerciseDigest,staleSourceArtifact.id,Number(staleSourceArtifact.aggregate_version),JSON.stringify(staleSourceSelectors)])).rows[0].result;
    const staleSourceBinding=(await database.client.query(`select public.pr_c_controlled_human_execute_denied_step($1,$2) result`,[context.exerciseDigest,staleSourceAnchor.safeAnchor.challengeToken])).rows[0].result;
    recordNegativeBinding(staleSourceBinding,staleSourceAnchor.safeAnchor);
    assert.equal(staleSourceBinding.result,'denied');assert.equal(Number((await database.client.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[generationBinding.org_id,deliveryAuthor.actor_id])).rows[0].version),currentDeliveryAuthorVersion);
    const positiveCoverage=(await database.client.query(`select
      array(select step_id from public.pr_c_controlled_human_intent_catalog where observation_kind='server_event' order by checkpoint_id,step_id) expected,
      array(select distinct binding.step_id from public.pr_c_controlled_human_action_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.exercise_digest=$1 and binding.observation_kind='server_event' order by binding.step_id) completed`,[context.exerciseDigest])).rows[0];
    assert.equal(positiveCoverage.expected.length,34,'canonical server-event catalog size drifted');
    assert.deepEqual([...positiveCoverage.completed].sort(),[...positiveCoverage.expected].sort(),'every positive catalog step must remain persisted through anchor -> production authority -> exact controlled completion');
    assert.deepEqual([...completedPositiveSteps].sort(),[...positiveCoverage.expected].sort(),'the in-process success ledger must exactly match the persisted positive catalog');
    const sqlCatalog=(await database.client.query(`select
      array_agg(step_id order by checkpoint_id,step_id) all_steps,
      array_agg(step_id order by checkpoint_id,step_id) filter(where observation_kind='server_event') positive_steps,
      array_agg(step_id order by checkpoint_id,step_id) filter(where observation_kind='negative_attempt') negative_steps
      from public.pr_c_controlled_human_intent_catalog`)).rows[0];
    assert.equal(sqlCatalog.all_steps.length,42);assert.equal(sqlCatalog.positive_steps.length,34);assert.equal(sqlCatalog.negative_steps.length,8);
    const persistedCatalog=(await database.client.query(`select array_agg(step_id order by checkpoint_id,step_id) steps from public.pr_c_controlled_human_action_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.exercise_digest=$1`,[context.exerciseDigest])).rows[0].steps;
    assert.deepEqual([...persistedCatalog].sort(),[...sqlCatalog.all_steps].sort(),'all 42 machine-observable bindings must be persisted before observation');
    assert.equal(authenticProofPairs.length,42,'duplicate, extra, or missing authentic envelope');
    assert.deepEqual(authenticProofPairs.filter(pair=>pair.binding.result==='succeeded').map(pair=>pair.stepId).sort(),[...sqlCatalog.positive_steps].sort());
    assert.deepEqual(authenticProofPairs.filter(pair=>pair.binding.result==='denied').map(pair=>pair.stepId).sort(),[...sqlCatalog.negative_steps].sort());
    assert.equal(validateControlledHumanProofPairs(authenticProofPairs),authenticProofPairs);
    assert.deepEqual(validateControlledHumanObserverEnvelopeBridge(authenticProofPairs),{total:42,positive:34,negative:8});
    await database.client.query(`select set_config('request.jwt.claim.sub','',false)`);
    const scope=(await database.client.query(`select exercise.org_id,exercise.workspace_id,binding.auth_user_id requester_id,(select id from public.workspaces where org_id=exercise.org_id and id<>exercise.workspace_id limit 1) other_workspace_id from public.pr_c_controlled_human_exercises exercise join public.pr_c_controlled_human_persona_bindings binding on binding.exercise_id=exercise.id and binding.persona_key='requester' where exercise.exercise_digest=$1`,[context.exerciseDigest])).rows[0];
    const humanProcess=deterministicUuid(context.exerciseId,'representative-human-process');await database.client.query(`insert into public.assess_processes(id,org_id,workspace_id,name,status) values($1,$2,$3,'Representative human mutation','Draft')`,[humanProcess,scope.org_id,scope.workspace_id]);assertTargetInventory(await database.inspect(context),context);
    const wrongScopeProcess=deterministicUuid(context.exerciseId,'wrong-scope-process');await database.client.query(`insert into public.assess_processes(id,org_id,workspace_id,name,status) values($1,$2,$3,'Wrong scope mutation','Draft')`,[wrongScopeProcess,scope.org_id,scope.other_workspace_id]);const wrongScopeInventory=await database.inspect(context);assert.ok(Number(wrongScopeInventory.unownedResourceRows)>0);assert.throws(()=>assertTargetInventory(wrongScopeInventory,context),/UNOWNED_RESOURCE_REJECTED/u);await database.client.query(`delete from public.assess_processes where id=$1`,[wrongScopeProcess]);
    await assert.rejects(database.quiesce(context,2),/PR_C_CONTROLLED_HUMAN_STATE_MISMATCH/u);
    await database.prepareRecovery(context,'quiesce',1);
    const quiesced=await database.quiesce(context,1);assert.equal(quiesced.lifecycle,'read_only');assert.equal(quiesced.runtimeControlReadOnlyCount,2);assert.equal(quiesced.featureFlagCountEnabled,0);assert.ok(Number.isFinite(Date.parse(quiesced.transitionedAt)));
    assert.deepEqual(await database.quiesce(context,1),quiesced);
    const quiescedInspection=await database.lifecycleInspection(context);await database.bindQuiescedHistory(context,2,quiescedInspection.immutableHistoryDigest);await database.completeRecovery(context,'quiesce');
    const finalQuiesce={...quiesced,concurrencyVersion:2};
    const readOnlyAttestation=(await database.client.query(`select public.pr_c_controlled_human_public_attestation($1,$2,$3,$4,$5,$6) result`,[context.releaseSha,context.reviewHeadSha,context.deployId,context.deployOrigin,context.exerciseDigest,context.publicTargetDigest])).rows[0].result;assert.equal(readOnlyAttestation.attested,true);
    assert.equal((await database.client.query(`select read_only and not provider_enabled safe from public.enterprise_intelligence_runtime_control where singleton`)).rows[0].safe,true);
    assert.equal((await database.client.query(`select read_only and not provider_enabled safe from public.studio_artifact_runtime_control where singleton`)).rows[0].safe,true);
    assert.equal((await database.client.query(`select maintenance and read_only and lifecycle='maintenance' safe from public.pilot_operations_environments`)).rows[0].safe,true);
    const finalQuiesceTime=Date.parse(finalQuiesce.transitionedAt);const seededTime=new Date((await database.client.query(`select min(event.created_at) created_at from public.pr_c_controlled_human_operation_events event join public.pr_c_controlled_human_exercises exercise on exercise.id=event.exercise_id where exercise.exercise_digest=$1 and event.operation='seeded'`,[context.exerciseDigest])).rows[0].created_at).getTime();
    const catalog=new Map(CONTROLLED_HUMAN_CATALOG.map(record=>[record.checkpointId,record]));
    const persistedPairs=(await database.client.query(`select anchor.checkpoint_id,anchor.step_id,anchor.safe_anchor,binding.safe_record,anchor.created_at anchor_at,binding.created_at binding_at
      from public.pr_c_controlled_human_action_anchors anchor join public.pr_c_controlled_human_action_bindings binding on binding.anchor_id=anchor.id
      join public.pr_c_controlled_human_exercises exercise on exercise.id=anchor.exercise_id where exercise.exercise_digest=$1 order by anchor.created_at,anchor.checkpoint_id,anchor.step_id`,[context.exerciseDigest])).rows;
    const persistedProofPairs=persistedPairs.map(row=>({checkpointId:row.checkpoint_id,stepId:row.step_id,anchor:row.safe_anchor,binding:row.safe_record}));
    validateControlledHumanProofPairs(persistedProofPairs);assert.equal(persistedProofPairs.length,42);
    const timingByStep=new Map(persistedPairs.map(row=>[`${row.checkpoint_id}\0${row.step_id}`,{anchorAt:new Date(row.anchor_at).getTime(),bindingAt:new Date(row.binding_at).getTime(),bindingToken:row.safe_record.bindingToken}]));
    const dutySteps=humanRole=>CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId=>catalog.get(checkpointId).steps.filter(step=>HUMAN_DUTY_BY_PERSONA[step.personaKey]===humanRole).map(step=>({checkpointId,...step})));
    const buildObservedDutyRequest=humanRole=>{
      const expected=dutySteps(humanRole);let cursor=seededTime;return expected.map((step,index)=>{
        const timing=timingByStep.get(`${step.checkpointId}\0${step.stepId}`);let started;let completed;
        if(timing){started=timing.anchorAt;completed=Math.max(timing.bindingAt,started+1);assert.ok(started>cursor,`${humanRole}:${step.stepId} real action order drifted`);}
        else if(step.stepId==='verify-history-readable-and-actions-absent'){started=Math.max(cursor+1,finalQuiesceTime+1);completed=started+1;}
        else {started=cursor+1;completed=started+1;const next=expected.slice(index+1).map(item=>timingByStep.get(`${item.checkpointId}\0${item.stepId}`)).find(Boolean);if(next)assert.ok(completed<next.anchorAt,`${humanRole}:${step.stepId} lacks an authentic observation interval`);else assert.ok(completed<finalQuiesceTime,`${humanRole}:${step.stepId} crossed quiesce`);}
        cursor=completed;return{checkpointId:step.checkpointId,stepId:step.stepId,personaKey:step.personaKey,startedAt:new Date(started).toISOString(),completedAt:new Date(completed).toISOString(),attemptDigest:sha256({humanRole,checkpointId:step.checkpointId,stepId:step.stepId,started}),bindingToken:timing?.bindingToken??null};
      });
    };
    const observedDuties=[];
    for(const humanRole of ['requester','reviewer','approver']){
      const steps=buildObservedDutyRequest(humanRole);const observed=await database.observeDuty(context,humanRole,steps,sha256({humanRole,steps}));
      const validation=validateControlledHumanObservedDuty({humanRole,requestedSteps:steps,serverSteps:observed.steps,proofPairs:persistedProofPairs});
      observedDuties.push({humanRole,steps,observed,validation});
      assert.equal(observed.steps.length,steps.length);assert.ok(observed.steps.every((record,index)=>record.humanAttemptDigest===steps[index].attemptDigest));
    }
    const observedMachineKeys=observedDuties.flatMap(duty=>duty.validation.machineStepKeys).sort();
    assert.deepEqual(observedMachineKeys,CONTROLLED_HUMAN_SERVER_ACTIONS.map(item=>`${item.checkpointId}\0${item.stepId}`).sort(),'observer coverage must equal the exact 42-step machine catalog');
    validateControlledHumanProofPairs(persistedProofPairs,observedDuties.flatMap(duty=>duty.observed.steps));
    const observedStep=new Map(observedDuties.flatMap(duty=>duty.observed.steps.map(step=>[step.stepId,step])));
    const proofSentinel=(await database.client.query(`select 'sha256:'||public.pr_c_controlled_human_sha256_jsonb(jsonb_build_object('proof','not_applicable')) digest`)).rows[0].digest;
    const auditlessSentinel=(await database.client.query(`select 'sha256:'||public.pr_c_controlled_human_sha256_jsonb(jsonb_build_object('auditId',null)) digest`)).rows[0].digest;
    assert.equal(observedStep.get('resolve-material-assess-conflict').auditDigest,auditlessSentinel);
    assert.equal(observedStep.get('accept-studio-handoff').version,0);assert.equal(observedStep.get('accept-studio-handoff').resourceFamily,'studio_artifact');
    assert.equal(observedStep.get('review-studio-document').resourceFamily,'studio_artifact_review');assert.equal(observedStep.get('request-package-changes').resourceFamily,'delivery_package_review');
    assert.equal(observedStep.get('replay-consumption-same-target').receiptDigest,observedStep.get('consume-approved-handoff-once').receiptDigest);
    assert.notEqual(observedStep.get('replay-consumption-same-target').causalEventDigest,observedStep.get('consume-approved-handoff-once').causalEventDigest);
    for(const contract of CONTROLLED_HUMAN_SERVER_ACTIONS.filter(item=>item.observationKind==='negative_attempt')){const record=observedStep.get(contract.stepId);assert.equal(record.receiptDigest,proofSentinel);if(record.denialProofKind==='server_denied_attempt')assert.equal(record.auditDigest,proofSentinel);}
    assert.notEqual(observedStep.get('review-studio-document').receiptDigest,proofSentinel);assert.notEqual(observedStep.get('review-studio-document').auditDigest,proofSentinel);
    const replayStep=observedStep.get('replay-consumption-same-target');const replayPair=persistedPairs.find(row=>row.step_id==='replay-consumption-same-target');
    const replayAttempt=(await database.client.query(`select id,request_id,receipt_id,action,created_at from public.enterprise_delivery_monitor_command_attempts where request_id=(select request_id from public.pr_c_controlled_human_action_bindings where binding_token=$1)`,[replayPair.safe_record.bindingToken])).rows[0];
    const expectedReplayCausality=sha256({kind:'delivery_command_attempt',id:replayAttempt.id,requestId:replayAttempt.request_id,receiptId:replayAttempt.receipt_id,action:replayAttempt.action,eventAt:new Date(replayAttempt.created_at).toISOString()});
    assert.equal(replayStep.causalEventDigest,expectedReplayCausality,'replay observation must bind the current attempt rather than the prior receipt');
    const reviewerSteps=observedDuties.find(duty=>duty.humanRole==='reviewer').steps;
    assert.ok(reviewerSteps.filter(step=>step.stepId!=='verify-history-readable-and-actions-absent').every(step=>Date.parse(step.completedAt)<finalQuiesceTime));
    assert.ok(Date.parse(reviewerSteps.find(step=>step.stepId==='verify-history-readable-and-actions-absent').startedAt)>=finalQuiesceTime);
    await assert.rejects(database.observeDuty(context,'reviewer',reviewerSteps,sha256('substituted-observer-request')),/OBSERVER_REQUEST_REJECTED/u);
    assert.equal(Number((await database.client.query(`select count(*) count from public.pr_c_controlled_human_step_observations`)).rows[0].count),observedDuties.reduce((total,duty)=>total+duty.steps.length,0));
    for(let index=0;index<3;index++)await database.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[deterministicUuid(context.exerciseId,`session-${index}`),users[index].id]);
    const sessionCount=await database.revokeSessions(context);assert.equal(sessionCount,3);
    assert.deepEqual(await database.boundUserIds(context),[...users].sort((left,right)=>left.key.localeCompare(right.key)).map(user=>user.id));
    assert.equal(Number((await database.client.query(`select count(*) count from auth.sessions where user_id=any($1::uuid[])`,[users.map(user=>user.id)])).rows[0].count),0);
    await database.prepareRecovery(context,'deprovision',2);const deprovisioned=await database.finalizeDeprovision(context,2,sessionCount,12);assert.equal(deprovisioned.lifecycle,'deprovisioned');assert.equal(deprovisioned.concurrencyVersion,3);await database.completeRecovery(context,'deprovision');const postState=await database.lifecycleInspection(context);assert.equal(postState.immutableHistoryRetained,true);assert.equal(postState.domainRowsDeleted,0);assert.equal(postState.activeSessionCount,0);assert.deepEqual(postState.safety,{providerEgress:0,realProviderCalls:0,customerDataRecords:0,externalUsers:0});
    await database.client.query('begin');try{
      await database.client.query(`insert into public.ai_provider_audit_events(id,event_type,org_id,workspace_id,provider,operation,status,actor_id,metadata) values($1,'post_observer_probe',$2,$3,'openai','synthetic-test','recorded',$4,'{"synthetic":true}'::jsonb)`,[deterministicUuid(context.exerciseId,'post-observer-provider-traffic'),generationBinding.org_id,generationBinding.workspace_id,generationBinding.actor_id]);
      assert.equal((await database.lifecycleInspection(context)).safety.providerEgress,1);await assert.rejects(postDeprovisionVerify(context,database),/PROVIDER_STATE_REJECTED|PARTIAL_RESET_REJECTED/u);
    }finally{await database.client.query('rollback')}
    const postVerified=await postDeprovisionVerify(context,database);assert.deepEqual(postVerified.safety,{providerEgress:0,realProviderCalls:0,customerDataRecords:0,externalUsers:0});
    assert.equal(Number((await database.client.query(`select count(*) count from public.enterprise_delivery_work_packages`)).rows[0].count),7);
    assert.equal(Number((await database.client.query(`select count(*) count from public.enterprise_monitor_baselines`)).rows[0].count),3);
    const auditCountAfterFirst=Number((await database.client.query(`select count(*) count from public.privileged_audit_events`)).rows[0].count);assert.ok(auditCountAfterFirst>=2);
    assert.equal(Number((await database.client.query(`select count(*) count from public.workspace_memberships where status='active'`)).rows[0].count),0);
    assert.equal(Number((await database.client.query(`select count(*) count from public.profiles where status='disabled'`)).rows[0].count),12);
    assert.equal(Number((await database.client.query(`select count(*) count from public.organization_members where status='active'`)).rows[0].count),0);
    assert.equal(Number((await database.client.query(`select count(*) count from public.organizations where status='suspended'`)).rows[0].count),2);
    assert.equal(Number((await database.client.query(`select count(*) count from public.workspaces where status='suspended'`)).rows[0].count),3);
    assert.equal(Number((await database.client.query(`select count(*) count from public.pilot_operations_tenants where lifecycle='deprovisioned'`)).rows[0].count),1);
    assert.equal(Number((await database.client.query(`select count(*) count from public.pilot_operations_environments where lifecycle='deactivated' and maintenance and read_only`)).rows[0].count),1);
    assert.equal(Number((await database.client.query(`select count(*) count from public.pr_c_controlled_human_operation_events`)).rows[0].count),5);
    const newHead='d'.repeat(40);const contextTwo=deriveContext({PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS:'hosted_nonproduction_pilot',PR_C_CONTROLLED_HUMAN_PR_NUMBER:'264',PR_C_CONTROLLED_HUMAN_RELEASE_SHA:newHead,PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:newHead,PR_C_CONTROLLED_HUMAN_DEPLOY_ID:'6b99cc001122334455667788',PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN:'https://deploy-preview-264--avalaos-pilot.netlify.app',PR_C_CONTROLLED_HUMAN_EXERCISE_ID:'40000000-0000-4000-8000-000000000265',PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:targetFingerprint,PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:`sha256:${'1'.repeat(64)}`,PR_C_CONTROLLED_HUMAN_SITE_NAME:'avalaos-pilot',PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT:'deploy-preview'},fixtureState,{head:newHead,dirty:''});
    const staleSession=deterministicUuid(context.exerciseId,'stale-session-after-reset');await database.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[staleSession,users[0].id]);
    const unsafeRetainedInventory=await database.inspect(contextTwo);assert.ok(Number(unsafeRetainedInventory.unsafeDeprovisionedRows)>0);assert.throws(()=>assertTargetInventory(unsafeRetainedInventory,contextTwo),/PARTIAL_RESET_REJECTED/u);
    await database.client.query('delete from auth.sessions where id=$1',[staleSession]);
    const retainedInventory=await database.inspect(contextTwo);assert.equal(retainedInventory.exercise,null);assert.equal(retainedInventory.priorExercises.length,1);assertTargetInventory(retainedInventory,contextTwo);
    const usersTwo=fixtureState.personas.map((persona,index)=>({id:deterministicUuid(contextTwo.exerciseId,`postgres-user-${index}`),email:`prc264.postgres.cycle2.${index}@example.invalid`,key:persona.key,state:persona.state,credentialGenerationDigest:sha256({exerciseDigest:contextTwo.exerciseDigest,personaKey:persona.key,index})}));
    await database.prepareRecovery(contextTwo,'apply',0);
    for(const user of usersTwo)await database.client.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[user.id,user.email,JSON.stringify({synthetic:true,exerciseDigest:contextTwo.exerciseDigest,personaKey:user.key})]);
    for(const user of usersTwo)await database.recordAuthUser(contextTwo,user.id);
    const seededTwo=await database.seed(contextTwo,fixtureState,usersTwo);assert.equal(seededTwo.studioArtifactCount,2);assert.equal(seededTwo.eligibleStudioArtifactCount,2);await database.completeRecovery(contextTwo,'apply');await database.verify(contextTwo,12);
    for(let index=0;index<2;index++)await database.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[deterministicUuid(contextTwo.exerciseId,`session-${index}`),usersTwo[index].id]);
    await database.prepareRecovery(contextTwo,'quiesce',1);await database.quiesce(contextTwo,1);const secondQuiescedInspection=await database.lifecycleInspection(contextTwo);await database.bindQuiescedHistory(contextTwo,2,secondQuiescedInspection.immutableHistoryDigest);await database.completeRecovery(contextTwo,'quiesce');const secondSessionCount=await database.revokeSessions(contextTwo);assert.equal(secondSessionCount,2);await database.prepareRecovery(contextTwo,'deprovision',2);await database.finalizeDeprovision(contextTwo,2,secondSessionCount,12);await database.completeRecovery(contextTwo,'deprovision');
    assert.equal(Number((await database.client.query(`select count(*) count from public.pr_c_controlled_human_exercises where lifecycle='deprovisioned'`)).rows[0].count),2);
    assert.equal(Number((await database.client.query(`select count(*) count from public.studio_artifact_aggregates`)).rows[0].count),6);
    assert.equal(Number((await database.client.query(`select count(*) count from public.enterprise_delivery_work_packages`)).rows[0].count),9);
    assert.equal(Number((await database.client.query(`select count(*) count from public.enterprise_monitor_baselines`)).rows[0].count),4);
    assert.ok(Number((await database.client.query(`select count(*) count from public.privileged_audit_events`)).rows[0].count)>auditCountAfterFirst);
    assert.equal(Number((await database.client.query(`select count(*) count from public.workspace_memberships where status='active'`)).rows[0].count),0);
    assert.equal(Number((await database.client.query(`select count(*) count from public.profiles where status='disabled'`)).rows[0].count),24);
    assert.equal(Number((await database.client.query(`select count(*) count from public.organizations where status='suspended'`)).rows[0].count),4);
    assert.equal(Number((await database.client.query(`select count(*) count from public.workspaces where status='suspended'`)).rows[0].count),6);
    assert.equal(Number((await database.client.query(`select count(*) count from public.pilot_operations_tenants where lifecycle='deprovisioned'`)).rows[0].count),2);
    assert.equal(Number((await database.client.query(`select count(*) count from public.pr_c_controlled_human_operation_events`)).rows[0].count),10);
  }finally{
    if(migrationAdapter)await migrationAdapter.close().catch(()=>undefined);
    if(database)await database.close();
    await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()`,[databaseName]).catch(()=>undefined);
    await admin.query(`drop database if exists ${databaseName}`).catch(()=>undefined);
    await admin.end();
  }
});
