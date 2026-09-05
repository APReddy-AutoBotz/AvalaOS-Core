import {readFile,writeFile} from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';
import {deriveContext,loadFixture,safeResult,sha256,validatePrivilegedPostgresConnectionString} from './prCControlledHumanEnvironment.mjs';

const {Client}=pg;
export const MIGRATION_FILE='supabase/migrations/20260904120000_pr_c_controlled_human_exercise_authority.sql';
export const MIGRATION_VERSION='20260904120000';
export const PRIOR_MIGRATION_VERSION='20260831062024';
export const MIGRATION_NAME='pr_c_controlled_human_exercise_authority';
const SHA=/^[0-9a-f]{40}$/u;const DIGEST=/^sha256:[0-9a-f]{64}$/u;const DEPLOY_ID=/^[0-9a-f]{24}$/u;
const PREVIEW_ORIGIN='https://deploy-preview-264--avalaos-pilot.netlify.app';
const DOMAIN_MULTIPLIERS=Object.freeze({assess_processes:1,assess_v2_cases:1,assess_v2_studio_handoffs:1,enterprise_module_handoffs:1,studio_artifacts:2,studio_source_packages:2,delivery_handoffs:0,delivery_packages:2,monitor_baselines:1,pilot_environments:1,pilot_tenants:1});

function fail(code){throw new Error(code)}
export async function loadMigration(path=MIGRATION_FILE){const sql=await readFile(path,'utf8');return{sql,digest:sha256(sql)}}
export function derivePreTipProviderRelations(migrationSql){
  const functionStart=migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.pr_c_controlled_human_provider_state()');
  const functionEnd=functionStart<0?-1:migrationSql.indexOf('\n$$;',functionStart);
  if(functionStart<0||functionEnd<0)fail('PR_C_CONTROLLED_HUMAN_PROVIDER_PREDICATE_SOURCE_REJECTED');
  const functionSource=migrationSql.slice(functionStart,functionEnd);
  const relations=[...functionSource.matchAll(/\b(?:FROM|JOIN)\s+public[.]([a-z][a-z0-9_]*)/giu)]
    .map(match=>match[1].toLowerCase())
    .filter(name=>!name.startsWith('pr_c_controlled_human_'));
  const unique=[...new Set(relations)].sort();
  if(unique.length<10||!unique.includes('enterprise_ai_command_receipts'))fail('PR_C_CONTROLLED_HUMAN_PROVIDER_PREDICATE_SOURCE_REJECTED');
  return Object.freeze(unique);
}
export function buildPreTipProviderCountSql(migrationSql){
  const relations=derivePreTipProviderRelations(migrationSql);
  return `select ${relations.map(name=>`(select count(*) from public.${name})`).join('+')} total`;
}
export function deriveMigrationContext(env,fixtureState,migration,checkout){
  const context=deriveContext(env,fixtureState,checkout);
  if(env.PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST!==migration.digest)fail('PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST_REJECTED');
  return Object.freeze({...context,migrationDigest:migration.digest,priorMigrationTip:PRIOR_MIGRATION_VERSION});
}
export function assertMigrationInventory(inventory,context){
  const keys=['actualTargetFingerprint','marker','counts','domainCounts','providerRows','unsafeDeprovisionedRows','history','schemaReady','exerciseHistory'];
  if(!inventory||JSON.stringify(Object.keys(inventory).sort())!==JSON.stringify(keys.sort()))fail('PR_C_CONTROLLED_HUMAN_MIGRATION_INVENTORY_REJECTED');
  if(inventory.actualTargetFingerprint!==context.targetFingerprint)fail('PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT_MISMATCH');
  const marker=inventory.marker;
  if(!marker||marker.product_key!=='avalaos-core'||marker.environment_class!=='hosted_nonproduction_pilot'||marker.production_authorized!==false||marker.customer_data_authorized!==false||marker.real_provider_calls_authorized!==false)fail('PR_C_CONTROLLED_HUMAN_MARKER_MISMATCH');
  if(Number(inventory.providerRows)!==0)fail('PR_C_CONTROLLED_HUMAN_PROVIDER_STATE_REJECTED');
  if(Number(inventory.unsafeDeprovisionedRows)!==0)fail('PR_C_CONTROLLED_HUMAN_PARTIAL_RESET_REJECTED');
  if(!inventory.history||!['version','name','statements'].every(column=>inventory.history.columns.includes(column)))fail('PR_C_CONTROLLED_HUMAN_MIGRATION_HISTORY_REJECTED');
  if(marker.migration_tip===PRIOR_MIGRATION_VERSION){
    if(inventory.history.version!==PRIOR_MIGRATION_VERSION||inventory.schemaReady||Object.values(inventory.counts).some(value=>Number(value)!==0)||Object.values(inventory.domainCounts).some(value=>Number(value)!==0))fail('PR_C_CONTROLLED_HUMAN_MIGRATION_PRIOR_STATE_REJECTED');
    return 'pending';
  }
  if(marker.migration_tip===MIGRATION_VERSION){
    if(inventory.history.version!==MIGRATION_VERSION||inventory.history.name!==MIGRATION_NAME||!inventory.schemaReady)fail('PR_C_CONTROLLED_HUMAN_MIGRATION_CURRENT_STATE_REJECTED');
    if(!Array.isArray(inventory.exerciseHistory))fail('PR_C_CONTROLLED_HUMAN_HISTORY_REJECTED');
    let live=0;const digests=new Set();
    for(const exercise of inventory.exerciseHistory){
      if(!exercise||digests.has(exercise.exercise_digest)||!['active','read_only','deprovisioned'].includes(exercise.lifecycle)||!DIGEST.test(exercise.exercise_digest??'')
        ||!SHA.test(exercise.release_sha??'')||exercise.review_head_sha!==exercise.release_sha||!DEPLOY_ID.test(exercise.deploy_id??'')||exercise.deploy_origin!==PREVIEW_ORIGIN
        ||exercise.target_fingerprint!==context.targetFingerprint||exercise.public_target_digest!==context.publicTargetDigest||!DIGEST.test(exercise.persona_manifest_digest??'')||!DIGEST.test(exercise.fixture_manifest_digest??'')
        ||exercise.migration_tip!==MIGRATION_VERSION)fail('PR_C_CONTROLLED_HUMAN_HISTORY_REJECTED');
      if(exercise.lifecycle!=='deprovisioned'){
        live++;
        if(exercise.exercise_digest!==context.exerciseDigest||exercise.release_sha!==context.releaseSha||exercise.review_head_sha!==context.reviewHeadSha
          ||exercise.deploy_id!==context.deployId||exercise.deploy_origin!==context.deployOrigin||exercise.public_target_digest!==context.publicTargetDigest||exercise.persona_manifest_digest!==context.personaManifestDigest
          ||exercise.fixture_manifest_digest!==context.fixtureManifestDigest)fail('PR_C_CONTROLLED_HUMAN_HISTORY_REJECTED');
      }
      digests.add(exercise.exercise_digest);
    }
    if(live>1)fail('PR_C_CONTROLLED_HUMAN_HISTORY_REJECTED');
    const cycles=inventory.exerciseHistory.length;const expected={auth_users:12*cycles,profiles:12*cycles,organizations:2*cycles,workspaces:3*cycles};
    if(Object.entries(expected).some(([key,value])=>Number(inventory.counts[key])!==value))fail('PR_C_CONTROLLED_HUMAN_UNEXPECTED_DATA');
    if(Object.entries(DOMAIN_MULTIPLIERS).some(([key,multiplier])=>Number(inventory.domainCounts?.[key])!==multiplier*cycles))fail('PR_C_CONTROLLED_HUMAN_UNEXPECTED_DOMAIN_DATA');
    return 'current';
  }
  fail('PR_C_CONTROLLED_HUMAN_MIGRATION_TIP_REJECTED');
}

export class PostgresEnvironmentMigrationAdapter{
  constructor(connectionString,migrationSql){if(!connectionString)fail('PR_C_CONTROLLED_HUMAN_DATABASE_URL_REQUIRED');validatePrivilegedPostgresConnectionString(connectionString);this.preTipProviderCountSql=buildPreTipProviderCountSql(migrationSql);const local=['localhost','127.0.0.1','::1'].includes(new URL(connectionString).hostname);this.client=new Client({connectionString,application_name:'avalaos_pr_c_controlled_human_migration'});if(!local&&(this.client.connectionParameters?.ssl===false||this.client.connectionParameters?.ssl?.rejectUnauthorized===false))fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REJECTED')}
  async connect(){await this.client.connect()}
  async close(){await this.client.end().catch(()=>undefined)}
  async inspect(){
    const identity=(await this.client.query(`select (select system_identifier::text from pg_control_system()) system_identifier,current_database() database_name,current_user database_role`)).rows[0];
    const actualTargetFingerprint=sha256(`${identity.system_identifier}\0${identity.database_name}\0${identity.database_role}`);
    const marker=(await this.client.query(`select product_key,environment_class,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized from public.hosted_pilot_environment_identity where singleton`)).rows[0]??null;
    const counts=(await this.client.query(`select (select count(*)::int from auth.users) auth_users,(select count(*)::int from public.profiles) profiles,(select count(*)::int from public.organizations) organizations,(select count(*)::int from public.workspaces) workspaces`)).rows[0];
    const domainCounts=(await this.client.query(`select
      (select count(*)::int from public.assess_processes) assess_processes,(select count(*)::int from public.assess_v2_cases) assess_v2_cases,
      (select count(*)::int from public.assess_v2_studio_handoffs) assess_v2_studio_handoffs,(select count(*)::int from public.enterprise_module_handoffs) enterprise_module_handoffs,
      (select count(*)::int from public.studio_artifact_aggregates) studio_artifacts,(select count(*)::int from public.studio_artifact_source_packages) studio_source_packages,
      (select count(*)::int from public.enterprise_delivery_handoffs) delivery_handoffs,(select count(*)::int from public.enterprise_delivery_work_packages) delivery_packages,
      (select count(*)::int from public.enterprise_monitor_baselines) monitor_baselines,(select count(*)::int from public.pilot_operations_environments) pilot_environments,
      (select count(*)::int from public.pilot_operations_tenants) pilot_tenants`)).rows[0];
    const relation=(await this.client.query(`select to_regclass('supabase_migrations.schema_migrations') relation`)).rows[0].relation;
    if(!relation)fail('PR_C_CONTROLLED_HUMAN_MIGRATION_HISTORY_REJECTED');
    const columns=(await this.client.query(`select column_name from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by column_name`)).rows.map(row=>row.column_name);
    const latest=(await this.client.query(`select version,name from supabase_migrations.schema_migrations order by version desc limit 1`)).rows[0]??null;
    const schemaReady=(await this.client.query(`select to_regclass('public.pr_c_controlled_human_exercises') is not null and to_regprocedure('public.pr_c_controlled_human_public_attestation(text,text,text,text,text,text)') is not null ready`)).rows[0].ready;
    const providerState=schemaReady?(await this.client.query(`select public.pr_c_controlled_human_provider_state() state`)).rows[0].state:null;
    const providerRows=schemaReady
      ?Number(providerState.unsafeRows)+Number(providerState.providerEgress)+Number(providerState.providerCalls)
      :(await this.client.query(this.preTipProviderCountSql)).rows[0].total;
    const exerciseHistory=schemaReady?(await this.client.query(`select exercise_digest,release_sha,review_head_sha,deploy_id,deploy_origin,target_fingerprint,public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,lifecycle from public.pr_c_controlled_human_exercises order by created_at,exercise_digest`)).rows:[];
    const unsafeDeprovisionedRows=schemaReady?(await this.client.query(`select
      (select count(*) from public.profiles profile join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=profile.id join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and profile.status<>'disabled')+
      (select count(*) from public.workspace_memberships membership join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=membership.user_id join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and membership.status='active')+
      (select count(*) from public.organization_members membership join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=membership.user_id join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and membership.status='active')+
      (select count(*) from public.organizations organization where organization.status<>'suspended' and exists(select 1 from public.pr_c_controlled_human_persona_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and binding.org_id=organization.id))+
      (select count(*) from public.workspaces workspace where workspace.status<>'suspended' and exists(select 1 from public.pr_c_controlled_human_persona_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and binding.workspace_id=workspace.id))+
      (select count(*) from public.pilot_operations_environments environment join public.pr_c_controlled_human_exercises exercise on exercise.org_id=environment.org_id and exercise.workspace_id=environment.workspace_id where exercise.lifecycle='deprovisioned' and (environment.lifecycle<>'deactivated' or not environment.maintenance or not environment.read_only))+
      (select count(*) from public.pilot_operations_tenants tenant join public.pr_c_controlled_human_exercises exercise on exercise.org_id=tenant.org_id and exercise.workspace_id=tenant.workspace_id where exercise.lifecycle='deprovisioned' and tenant.lifecycle<>'deprovisioned')+
      (select count(*) from auth.sessions session join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=session.user_id join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned') total`)).rows[0].total:0;
    return{actualTargetFingerprint,marker,counts,domainCounts,providerRows,unsafeDeprovisionedRows,history:{version:latest?.version??null,name:latest?.name??null,columns},schemaReady,exerciseHistory};
  }
  async apply(context,migration){
    if(!migration||migration.digest!==context.migrationDigest||sha256(migration.sql)!==context.migrationDigest)fail('PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST_REJECTED');
    await this.client.query('begin');
    try{
      await this.client.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`,[context.targetFingerprint]);
      const state=assertMigrationInventory(await this.inspect(),context);
      if(state==='current'){await this.client.query('rollback');return{replayed:true,migrationDigest:context.migrationDigest,migrationTip:MIGRATION_VERSION}}
      await this.client.query(migration.sql);
      await this.client.query(`insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2::text[],$3)`,[MIGRATION_VERSION,[migration.sql],MIGRATION_NAME]);
      await this.client.query('commit');
      const verified=assertMigrationInventory(await this.inspect(),context);
      if(verified!=='current')fail('PR_C_CONTROLLED_HUMAN_MIGRATION_VERIFY_REJECTED');
      return{replayed:false,migrationDigest:context.migrationDigest,migrationTip:MIGRATION_VERSION};
    }catch(error){await this.client.query('rollback').catch(()=>undefined);throw error}
  }
}

export async function migrationPreflight(context,adapter){const state=assertMigrationInventory(await adapter.inspect(),context);return safeResult('migration-preflight','passed',context,{migrationDigest:context.migrationDigest,priorMigrationTip:PRIOR_MIGRATION_VERSION,disposition:state==='current'?'exact_replay':'exact_additive_apply',unexpectedDataCount:0,providerRowCount:0})}
export async function migrationApply(context,adapter,migration){if(!migration||migration.digest!==context.migrationDigest||sha256(migration.sql)!==context.migrationDigest)fail('PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST_REJECTED');const result=await adapter.apply(context,migration);return safeResult('migration-apply','passed',context,{...result,priorMigrationTip:PRIOR_MIGRATION_VERSION,unexpectedDataCount:0,providerRowCount:0})}
export async function migrationVerify(context,adapter){const state=assertMigrationInventory(await adapter.inspect(),context);if(state!=='current')fail('PR_C_CONTROLLED_HUMAN_MIGRATION_VERIFY_REJECTED');return safeResult('migration-verify','passed',context,{migrationDigest:context.migrationDigest,priorMigrationTip:PRIOR_MIGRATION_VERSION,migrationTip:MIGRATION_VERSION,unexpectedDataCount:0,providerRowCount:0})}

async function emit(result,path){const bytes=`${JSON.stringify(result,null,2)}\n`;if(path)await writeFile(path,bytes,{encoding:'utf8',mode:0o600,flag:'wx'});process.stdout.write(`${JSON.stringify(result)}\n`)}
async function main(){
  const [phase,...args]=process.argv.slice(2);if(!['preflight','apply','verify'].includes(phase))fail('usage: prCControlledHumanEnvironmentMigration.mjs <preflight|apply|verify> [--output path]');
  const outputIndex=args.indexOf('--output');const outputPath=outputIndex>=0?args[outputIndex+1]:undefined;if(outputIndex>=0&&!outputPath)fail('PR_C_CONTROLLED_HUMAN_OUTPUT_REQUIRED');
  const fixtureState=await loadFixture();const migration=await loadMigration();const context=deriveMigrationContext(process.env,fixtureState,migration);
  const adapter=new PostgresEnvironmentMigrationAdapter(process.env.PR_C_CONTROLLED_HUMAN_DATABASE_URL,migration.sql);await adapter.connect();
  try{if(phase==='preflight')return emit(await migrationPreflight(context,adapter),outputPath);if(phase==='apply')return emit(await migrationApply(context,adapter,migration),outputPath);return emit(await migrationVerify(context,adapter),outputPath)}finally{await adapter.close()}
}
if(process.argv[1]&&new URL(import.meta.url).pathname.replace(/^\/[A-Za-z]:/u,value=>value.slice(1)).replaceAll('/','\\').toLowerCase()===process.argv[1].toLowerCase())main().catch(error=>{process.stderr.write(`${error instanceof Error?error.message:'PR_C_CONTROLLED_HUMAN_MIGRATION_FAILED'}\n`);process.exitCode=1});
