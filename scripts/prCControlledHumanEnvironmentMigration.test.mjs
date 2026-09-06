import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {loadFixture} from './prCControlledHumanEnvironment.mjs';
import {buildControlledHumanBootstrapBindings,runControlledHumanBootstrapCli} from './derivePrCControlledHumanBootstrap.mjs';
import {
  MIGRATION_NAME,MIGRATION_VERSION,PRIOR_MIGRATION_VERSION,assertMigrationInventory,buildPreTipProviderCountSql,derivePreTipProviderRelations,
  deriveMigrationContext,loadMigration,migrationApply,migrationPreflight,migrationVerify,
} from './prCControlledHumanEnvironmentMigration.mjs';

const head='83cab00bee481df22351302cc8c1c00bda3f1664';
const fixture=await loadFixture();const migration=await loadMigration();
const env={PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS:'hosted_nonproduction_pilot',PR_C_CONTROLLED_HUMAN_PR_NUMBER:'264',PR_C_CONTROLLED_HUMAN_RELEASE_SHA:head,PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:head,PR_C_CONTROLLED_HUMAN_DEPLOY_ID:'6a99cc001122334455667788',PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN:'https://deploy-preview-264--avalaos-pilot.netlify.app',PR_C_CONTROLLED_HUMAN_EXERCISE_ID:'40000000-0000-4000-8000-000000000264',PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:`sha256:${'a'.repeat(64)}`,PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:`sha256:${'1'.repeat(64)}`,PR_C_CONTROLLED_HUMAN_SITE_NAME:'avalaos-pilot',PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT:'deploy-preview',PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST:migration.digest};
const context=deriveMigrationContext(env,fixture,migration,{head,dirty:''});
const marker=tip=>({product_key:'avalaos-core',environment_class:'hosted_nonproduction_pilot',migration_tip:tip,production_authorized:false,customer_data_authorized:false,real_provider_calls_authorized:false});
const domainCounts=cycles=>({assess_processes:cycles,assess_v2_cases:cycles,assess_v2_studio_handoffs:cycles,enterprise_module_handoffs:cycles,studio_artifacts:2*cycles,studio_source_packages:2*cycles,delivery_handoffs:0,delivery_packages:2*cycles,monitor_baselines:cycles,pilot_environments:cycles,pilot_tenants:cycles});
const inventory=(tip=PRIOR_MIGRATION_VERSION)=>({actualTargetFingerprint:context.targetFingerprint,marker:marker(tip),counts:{auth_users:0,profiles:0,organizations:0,workspaces:0},domainCounts:domainCounts(0),providerRows:'0',unsafeDeprovisionedRows:'0',history:{version:tip,name:tip===MIGRATION_VERSION?MIGRATION_NAME:'governed_delivery_monitor_pr_c',columns:['name','statements','version']},schemaReady:tip===MIGRATION_VERSION,exerciseHistory:[]});

test('migration context binds exact source digest and checkout head',()=>{
  assert.match(migration.digest,/^sha256:[0-9a-f]{64}$/u);
  assert.throws(()=>deriveMigrationContext({...env,PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST:`sha256:${'b'.repeat(64)}`},fixture,migration,{head,dirty:''}),/MIGRATION_DIGEST_REJECTED/u);
  assert.throws(()=>deriveMigrationContext(env,fixture,migration,{head:'b'.repeat(40),dirty:''}),/SHA_REJECTED/u);
  const relations=derivePreTipProviderRelations(migration.sql);
  for(const relation of ['ai_provider_key_refs','pilot_operations_provider_bindings','enterprise_ai_budget_reservations','enterprise_provider_secret_cleanup_jobs','enterprise_ai_command_receipts','enterprise_ai_usage_ledger','enterprise_ai_job_attempts','enterprise_ai_extraction_staged_results'])assert.ok(relations.includes(relation),relation);
  const extended=migration.sql.replace("+(SELECT count(*) FROM public.ai_usage_events)","+(SELECT count(*) FROM public.synthetic_future_provider_effects)\n     +(SELECT count(*) FROM public.ai_usage_events)");
  assert.ok(derivePreTipProviderRelations(extended).includes('synthetic_future_provider_effects'));
  const query=buildPreTipProviderCountSql(migration.sql);
  assert.match(query,/enterprise_ai_command_receipts/u);
  assert.doesNotMatch(query,/pr_c_controlled_human_/u);
});

test('bootstrap derives only safe exact-head bindings from an empty prior-tip hosted target',()=>{
  const projectRef='abcdefghijklmnopqrst';
  const bootstrapEnv={...env,
    PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF:projectRef,
    PR_C_CONTROLLED_HUMAN_SUPABASE_URL:`https://${projectRef}.supabase.co`,
    PR_C_CONTROLLED_HUMAN_DATABASE_URL:`postgresql://postgres:never-emitted@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
  };
  delete bootstrapEnv.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST;
  const result=buildControlledHumanBootstrapBindings({env:bootstrapEnv,fixtureState:fixture,migration,inventory:inventory(),checkout:{head,dirty:''}});
  assert.equal(result.status,'bindings_derived');
  assert.equal(result.exactHead,head);assert.equal(result.reviewHeadSha,head);
  assert.equal(result.priorMigrationTip,PRIOR_MIGRATION_VERSION);assert.equal(result.migrationTip,MIGRATION_VERSION);
  assert.equal(result.targetFingerprint,context.targetFingerprint);
  assert.equal(result.githubEnvironmentVariables.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST,result.exerciseDigest);
  assert.equal(result.netlifyBranchVariables.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST,result.publicTargetDigest);
  assert.doesNotMatch(JSON.stringify(result),/never-emitted|database|project.?ref|exercise.?id|supabase[.]co/iu);
  assert.throws(()=>buildControlledHumanBootstrapBindings({env:bootstrapEnv,fixtureState:fixture,migration,inventory:inventory(),checkout:{head,dirty:'package.json'}}),/BOOTSTRAP_DIRTY_CHECKOUT/u);
  assert.throws(()=>buildControlledHumanBootstrapBindings({env:{...bootstrapEnv,PR_C_CONTROLLED_HUMAN_SUPABASE_URL:'https://avalaos.com'},fixtureState:fixture,migration,inventory:inventory(),checkout:{head,dirty:''}}),/SUPABASE_TARGET_MISMATCH/u);
  assert.throws(()=>buildControlledHumanBootstrapBindings({env:bootstrapEnv,fixtureState:fixture,migration,inventory:inventory(MIGRATION_VERSION),checkout:{head,dirty:''}}),/BOOTSTRAP_PRIOR_TIP_REQUIRED/u);
  assert.throws(()=>buildControlledHumanBootstrapBindings({env:{...bootstrapEnv,PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:`sha256:${'f'.repeat(64)}`},fixtureState:fixture,migration,inventory:inventory(),checkout:{head,dirty:''}}),/BOOTSTRAP_PUBLIC_TARGET_REJECTED/u);
});

test('bootstrap CLI sanitizes every adapter failure while preserving safe successful output and exclusive files',async()=>{
  const projectRef='abcdefghijklmnopqrst';
  const bootstrapEnv={...env,PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF:projectRef,
    PR_C_CONTROLLED_HUMAN_SUPABASE_URL:`https://${projectRef}.supabase.co`,
    PR_C_CONTROLLED_HUMAN_DATABASE_URL:`postgresql://postgres:never-emitted@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`};
  delete bootstrapEnv.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST;
  const options={fixtureState:fixture,migration,checkout:{head,dirty:''}};
  const capture=()=>{const output={stdout:'',stderr:''};return {output,io:{stdout:{write:value=>{output.stdout+=value}},stderr:{write:value=>{output.stderr+=value}}}}};
  for(const phase of ['connect','inspect','close']){
    for(const thrown of [new Error(`DNS/TLS ${bootstrapEnv.PR_C_CONTROLLED_HUMAN_DATABASE_URL}`),{message:`database ${projectRef}`,cause:new Error('private-database-role')}]){
      const adapter={};for(const method of ['connect','inspect','close'])adapter[method]=async()=>{if(method===phase)throw thrown;return method==='inspect'?inventory():undefined};
      const {output,io}=capture();
      assert.equal(await runControlledHumanBootstrapCli([],bootstrapEnv,{...options,adapter},io),1);
      assert.deepEqual(output,{stdout:'',stderr:'PR_C_CONTROLLED_HUMAN_BOOTSTRAP_FAILED\n'});
    }
  }
  const directory=mkdtempSync(path.join(os.tmpdir(),'pr264-bootstrap-output-'));
  try{
    const target=path.join(directory,'safe-bindings.json');const success=capture();
    assert.equal(await runControlledHumanBootstrapCli(['--output',target],bootstrapEnv,{...options,inventory:inventory()},success.io),0);
    assert.equal(success.output.stderr,'');const emitted=JSON.parse(success.output.stdout);
    assert.deepEqual(Object.keys(emitted).sort(),['bootstrapDigest','exactHead','status']);
    assert.equal(emitted.status,'bindings_derived');assert.equal(emitted.exactHead,head);
    const retained=readFileSync(target,'utf8');assert.equal(JSON.parse(retained).bootstrapDigest,emitted.bootstrapDigest);
    assert.doesNotMatch(retained,/never-emitted|abcdefghijklmnopqrst|supabase[.]co/u);
    const existing=capture();assert.equal(await runControlledHumanBootstrapCli(['--output',target],bootstrapEnv,{...options,inventory:inventory()},existing.io),1);
    assert.deepEqual(existing.output,{stdout:'',stderr:'PR_C_CONTROLLED_HUMAN_BOOTSTRAP_FAILED\n'});
    assert.equal(readFileSync(target,'utf8'),retained);
  }finally{rmSync(directory,{recursive:true,force:true})}
});

test('bootstrap Git failure cannot relay child stderr before the sanitized caller diagnostic',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pr264-bootstrap-git-'));
  try{
    const moduleUrl=pathToFileURL(path.resolve('scripts/derivePrCControlledHumanBootstrap.mjs')).href;
    const code=`import {bootstrapCheckoutIdentity} from ${JSON.stringify(moduleUrl)};try{bootstrapCheckoutIdentity(${JSON.stringify(directory)})}catch{process.stderr.write('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_FAILED\\n');process.exitCode=1}`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});
    assert.equal(result.error,undefined);assert.equal(result.status,1);assert.equal(result.stdout,'');
    assert.equal(result.stderr,'PR_C_CONTROLLED_HUMAN_BOOTSTRAP_FAILED\n');
  }finally{rmSync(directory,{recursive:true,force:true})}
});

test('migration inventory accepts only exact prior empty or exact current accounted state',()=>{
  assert.equal(assertMigrationInventory(inventory(),context),'pending');assert.equal(assertMigrationInventory(inventory(MIGRATION_VERSION),context),'current');
  for(const mutate of [value=>{value.marker.environment_class='production'},value=>{value.providerRows='1'},value=>{value.unsafeDeprovisionedRows='1'},value=>{value.counts.auth_users=1},value=>{value.domainCounts.monitor_baselines=1},value=>{value.history.version='20260828120000'},value=>{value.schemaReady=true}]){const value=structuredClone(inventory());mutate(value);assert.throws(()=>assertMigrationInventory(value,context),/PR_C_CONTROLLED_HUMAN_/u)}
  const retained=inventory(MIGRATION_VERSION);retained.counts={auth_users:12,profiles:12,organizations:2,workspaces:3};retained.domainCounts=domainCounts(1);retained.exerciseHistory=[{exercise_digest:`sha256:${'c'.repeat(64)}`,release_sha:'c'.repeat(40),review_head_sha:'c'.repeat(40),deploy_id:'cccccccccccccccccccccccc',deploy_origin:context.deployOrigin,target_fingerprint:context.targetFingerprint,public_target_digest:context.publicTargetDigest,persona_manifest_digest:`sha256:${'d'.repeat(64)}`,fixture_manifest_digest:`sha256:${'e'.repeat(64)}`,migration_tip:context.migrationTip,lifecycle:'deprovisioned'}];assert.equal(assertMigrationInventory(retained,context),'current');
  retained.exerciseHistory[0].lifecycle='active';assert.throws(()=>assertMigrationInventory(retained,context),/HISTORY_REJECTED/u);
  retained.exerciseHistory[0].lifecycle='deprovisioned';retained.exerciseHistory[0].review_head_sha='f'.repeat(40);assert.throws(()=>assertMigrationInventory(retained,context),/HISTORY_REJECTED/u);
});

test('migration phases are sanitized and exact apply is replay-safe',async()=>{
  const prior=inventory();const current=inventory(MIGRATION_VERSION);let applied=0;
  const adapter={inspect:async()=>applied?current:prior,apply:async(_context,exact)=>{assert.equal(exact.digest,migration.digest);applied++;return{replayed:false,migrationDigest:migration.digest,migrationTip:MIGRATION_VERSION}}};
  const preflight=await migrationPreflight(context,adapter);assert.equal(preflight.disposition,'exact_additive_apply');assert.equal(preflight.migrationDigest,migration.digest);
  const result=await migrationApply(context,adapter,migration);assert.equal(result.migrationTip,MIGRATION_VERSION);assert.equal(result.replayed,false);
  await assert.rejects(migrationApply(context,adapter,{...migration,sql:`${migration.sql}\nselect 1;`}),/MIGRATION_DIGEST_REJECTED/u);
  const verified=await migrationVerify(context,adapter);assert.equal(verified.status,'passed');assert.doesNotMatch(JSON.stringify(verified),/database_url|service[_-]?role|password/iu);
});
