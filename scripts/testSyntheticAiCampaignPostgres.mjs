import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const connectionString=process.env.SYNTHETIC_AI_CAMPAIGN_DISPOSABLE_DATABASE_URL;
const baselineUpgrade=process.argv[2]==='--pre-domain-budget-upgrade';
assert.deepEqual(process.argv.slice(2),baselineUpgrade?['--pre-domain-budget-upgrade']:[],'Unknown test mode');
const domainSignal=predecessorSignal=>baselineUpgrade?predecessorSignal:'SYNTHETIC_AI_CAMPAIGN_DOMAIN_STALE';
if(!connectionString)throw new Error('SYNTHETIC_AI_CAMPAIGN_DISPOSABLE_DATABASE_URL is required.');
const targetUrl=new URL(connectionString);
if(!['127.0.0.1','localhost','::1'].includes(targetUrl.hostname)||!targetUrl.pathname.slice(1).startsWith('avalaos_'))
 throw new Error('Synthetic AI campaign PostgreSQL tests require a named localhost disposable database.');

const ids=Object.fromEntries([
 'operator','author','org','workspace','providerConfig','keyRef','assessRoute','studioRoute',
].map(key=>[key,crypto.randomUUID()]));
const projectRef='abcdefghijklmnopqrst';
const requestHost=`${projectRef}.supabase.co`;
const fingerprint=`sha256:${'b'.repeat(64)}`;
const carrySeal=`sha256:${'c'.repeat(64)}`;
const provider='openai';
const endpoint='https://api.openai.com';
const model='gpt-4.1-mini-2025-04-14';
const secretRef=`AVALA_PROVIDER_SECRET_OPENAI_${ids.org.replaceAll('-','').toUpperCase()}_QA`;
const capUsdNanos=10_000_000_000;
const carryUsdNanos=869_320_000;
const debitUsdNanos=471_459_200;
const maximumOutputTokens=4096;
const migrationSql=readFileSync(new URL('../supabase/migrations/20260917173445_synthetic_ai_campaign_authority.sql',import.meta.url),'utf8');

const client=new pg.Client({connectionString});
let assertions=0;
let phase='connect';
const labels=[];
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++;};
const one=async(db,sql,values=[])=> (await db.query(sql,values)).rows[0];
const count=async(db,table,predicate='true',values=[])=>Number((await one(db,`SELECT count(*)::integer AS n FROM ${table} WHERE ${predicate}`,values)).n);
const uuid=()=>crypto.randomUUID();
const hash=label=>crypto.createHash('sha256').update(label).digest('hex');
const pass=label=>{labels.push(label);console.log(`PASS ${label}`);};
const setRequestHost=db=>db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({host:requestHost})]);
const quoteIdentifier=value=>`"${String(value).replaceAll('"','""')}"`;
const snapshotPopulatedData=async db=>{
 const tables=(await db.query(`SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public'
  UNION ALL SELECT 'auth','users' ORDER BY 1,2`)).rows;
 const snapshots={};
 for(const {schemaname,tablename} of tables){
  const qualified=`${quoteIdentifier(schemaname)}.${quoteIdentifier(tablename)}`;
  const data=(await one(db,`SELECT COALESCE(jsonb_agg(to_jsonb(snapshot_row) ORDER BY to_jsonb(snapshot_row)::text),'[]'::jsonb)::text AS data
   FROM ${qualified} AS snapshot_row`)).data;
  snapshots[`${schemaname}.${tablename}`]=hash(data);
 }
 return snapshots;
};
const snapshotPublicSchemaAuthority=async db=>{
 const relations=(await db.query(`SELECT n.nspname AS schema_name,c.relname,c.relkind::text,
  pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,COALESCE(c.relacl::text,'') AS acl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  ORDER BY c.relkind,c.relname`)).rows;
 const functions=(await db.query(`SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS identity,
  pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proleakproof,
  p.proisstrict,p.provolatile::text,p.proparallel::text,COALESCE(p.proconfig::text,''),COALESCE(p.proacl::text,'') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  ORDER BY identity`)).rows;
 const schemas=(await db.query(`SELECT nspname,pg_get_userbyid(nspowner) AS owner,COALESCE(nspacl::text,'') AS acl
  FROM pg_namespace WHERE nspname IN('public','auth') ORDER BY nspname`)).rows;
 return {
  relations:hash(JSON.stringify(relations)),
  functions:hash(JSON.stringify(functions)),
  schemas:hash(JSON.stringify(schemas)),
 };
};

const expectedFailure=async(db,sql,values,signal)=>{
 await db.query('BEGIN');
 try{
  await db.query(sql,values);
  assert.fail(`Expected ${signal}`);
 }catch(error){
  if(error?.message!==signal){
   const observed=error?.message?.match(/^[A-Z0-9_]{3,100}$/)?.[0]??error?.code??'UNKNOWN';
   throw new Error(`EXPECTED_${signal}_OBSERVED_${observed}`);
  }
  assertions++;
 }finally{
  await db.query('ROLLBACK');
 }
};

const asServiceRoleFailure=async(sql,signal='permission denied for table synthetic_ai_campaign_effect_debits')=>{
 await client.query('BEGIN');
 try{
  await client.query('SET LOCAL ROLE service_role');
  await client.query(sql);
  assert.fail(`Expected ${signal}`);
 }catch(error){
  assert.match(error?.message??'',new RegExp(signal.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assertions++;
 }finally{
  await client.query('ROLLBACK');
 }
};

const claimReceipt=async({db=client,actor=ids.author,commandType='transcript.assess.extract',label})=>{
 const requestId=uuid();
 const executionToken=uuid();
 const requestHash=hash(`command:${label}`);
 const receipt=await one(db,`SELECT (public.enterprise_ai_claim_command(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::uuid,$7::text,NULL,$8::uuid
 )).*`,[actor,ids.org,ids.workspace,commandType,`campaign-${label}`,requestId,requestHash,executionToken]);
 check(receipt.status,'claimed');
 return {id:receipt.id,executionToken:receipt.execution_token,executionFence:Number(receipt.execution_fence),requestHash,requestId};
};

const makeAttempt=async({
 db=client,actor=ids.author,authorizationVersion,operation='assess.evidence.extract',routeId=ids.assessRoute,
 commandType='transcript.assess.extract',label,
})=>{
 const attempt={actor,authorizationVersion,operation,routeId,receipt:await claimReceipt({db,actor,commandType,label}),
  effectId:uuid(),effectRequestHash:hash(`effect:${label}`),maximumOutputTokens};
 if(operation==='assess.evidence.extract'){
  // This retained campaign test owns the legacy extraction fixture only. Native
  // mapping/Studio authority is exercised by the separate production pipeline.
  await db.query(`INSERT INTO public.enterprise_ai_job_ledger(
   id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,actor_id,
   request_id,idempotency_key,status,approval_state,receipt_id,request_hash,execution_token,execution_fence,route_id)
   VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai',$5,'assess.evidence.extract','campaign-v1',$6,
   $7,$8,'running','review_required',$9,$10,$11,$12,$13)`,
   [attempt.effectId,ids.org,ids.workspace,ids.providerConfig,model,actor,attempt.receipt.requestId,
    `campaign-job-${label}`,attempt.receipt.id,attempt.receipt.requestHash,attempt.receipt.executionToken,
    attempt.receipt.executionFence,routeId]);
  attempt.tokenBudget=(await one(db,`SELECT public.enterprise_ai_reserve_provider_budget(
   $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::uuid,$6::uuid,$7::uuid,$8::bigint,$9::uuid,$10::uuid,
   'openai','assess.evidence.extract',$11::text,100,4096) AS value`,
   [actor,ids.org,ids.workspace,authorizationVersion,attempt.receipt.id,attempt.effectId,
    attempt.receipt.executionToken,attempt.receipt.executionFence,routeId,ids.providerConfig,model])).value;
  check([attempt.tokenBudget.state,attempt.tokenBudget.ownsProviderEffect],['reserved',true]);
 }
 return attempt;
};

const reserveSql=`SELECT public.synthetic_ai_campaign_reserve_effect(
 $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::uuid,$8::uuid,$9::uuid,$10::bigint,
 $11::uuid,$12::uuid,$13::uuid,$14::text,$15::text,$16::text,$17::text,$18::text,$19::integer
) AS value`;
const consumeSql=`SELECT public.synthetic_ai_campaign_consume_effect(
 $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint,$6::text,$7::text,$8::uuid,$9::uuid,$10::uuid,$11::bigint,
 $12::uuid,$13::uuid,$14::uuid,$15::text,$16::text,$17::text,$18::text,$19::text,$20::integer
) AS value`;
const reserveArgs=(attempt,overrides={})=>[
 overrides.actor??attempt.actor,overrides.org??ids.org,overrides.workspace??ids.workspace,
 overrides.authorizationVersion??attempt.authorizationVersion,
 Object.hasOwn(overrides,'fingerprint')?overrides.fingerprint:fingerprint,
 Object.hasOwn(overrides,'projectRef')?overrides.projectRef:projectRef,
 overrides.receiptId??attempt.receipt.id,overrides.effectId??attempt.effectId,
 overrides.executionToken??attempt.receipt.executionToken,overrides.executionFence??attempt.receipt.executionFence,
 Object.hasOwn(overrides,'routeId')?overrides.routeId:attempt.routeId,overrides.providerConfigId??ids.providerConfig,
 overrides.keyRefId??ids.keyRef,overrides.provider??provider,overrides.endpoint??endpoint,overrides.model??model,
 overrides.operation??attempt.operation,overrides.effectRequestHash??attempt.effectRequestHash,
 overrides.maximumOutputTokens??attempt.maximumOutputTokens,
];
const consumeArgs=(reservationId,attempt,overrides={})=>[
 overrides.reservationId??reservationId,overrides.actor??attempt.actor,overrides.org??ids.org,
 overrides.workspace??ids.workspace,overrides.authorizationVersion??attempt.authorizationVersion,
 Object.hasOwn(overrides,'fingerprint')?overrides.fingerprint:fingerprint,
 Object.hasOwn(overrides,'projectRef')?overrides.projectRef:projectRef,
 overrides.receiptId??attempt.receipt.id,
 overrides.effectId??attempt.effectId,overrides.executionToken??attempt.receipt.executionToken,
 overrides.executionFence??attempt.receipt.executionFence,
 Object.hasOwn(overrides,'routeId')?overrides.routeId:attempt.routeId,overrides.providerConfigId??ids.providerConfig,
 overrides.keyRefId??ids.keyRef,overrides.provider??provider,overrides.endpoint??endpoint,overrides.model??model,
 overrides.operation??attempt.operation,overrides.effectRequestHash??attempt.effectRequestHash,
 overrides.maximumOutputTokens??attempt.maximumOutputTokens,
];
const reserve=(db,attempt,overrides={})=>one(db,reserveSql,reserveArgs(attempt,overrides)).then(row=>row.value);
const consume=(db,reservationId,attempt,overrides={})=>one(db,consumeSql,consumeArgs(reservationId,attempt,overrides)).then(row=>row.value);

try{
 await client.connect();
 await setRequestHost(client);

 phase='default_off_and_schema';
 check((await one(client,`SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton`)).migration_tip,baselineUpgrade?'20260917173445':'20260926053818');
 check(await count(client,'public.synthetic_ai_campaign_authorities'),0);
 check(await count(client,'public.synthetic_ai_campaign_effect_debits'),0);
 const schema=(await one(client,`SELECT
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.synthetic_ai_campaign_authorities'::regclass) AS authority_rls,
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.synthetic_ai_campaign_effect_debits'::regclass) AS debit_rls,
  has_table_privilege('service_role','public.synthetic_ai_campaign_effect_debits','SELECT') AS service_select,
  has_table_privilege('service_role','public.synthetic_ai_campaign_effect_debits','INSERT') AS service_insert,
  has_table_privilege('service_role','public.synthetic_ai_campaign_effect_debits','UPDATE') AS service_update,
  has_table_privilege('service_role','public.synthetic_ai_campaign_effect_debits','DELETE') AS service_delete`));
 check(schema,{authority_rls:true,debit_rls:true,service_select:true,service_insert:false,service_update:false,service_delete:false});
 pass('default-off campaign tables and forced-RLS/grant boundary');

 phase='operator_bootstrap';
 await client.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[ids.operator,'campaign-operator@avalaos.invalid']);
 const target=(await one(client,`SELECT public.synthetic_admin_bootstrap_operator($1::uuid,$2::uuid,$3::uuid,$4::text) AS value`,
  [ids.operator,ids.org,ids.workspace,fingerprint])).value;
 check(target.status,'configured');
 const operatorVersion=Number((await one(client,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[ids.org,ids.operator])).version);
 const bootstrapSql=`SELECT public.synthetic_ai_campaign_bootstrap(
  $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::text,$8::text,
  $9::uuid,$10::uuid,$11::uuid,$12::uuid,$13::timestamptz
 ) AS value`;
 const bootstrapArgs=[ids.operator,ids.org,ids.workspace,operatorVersion,fingerprint,projectRef,carrySeal,secretRef,
  ids.providerConfig,ids.keyRef,ids.assessRoute,ids.studioRoute,new Date(Date.now()+60*60*1000).toISOString()];
 await expectedFailure(client,bootstrapSql,[...bootstrapArgs.slice(0,5),'wrongprojectref000000',...bootstrapArgs.slice(6)],
  'SYNTHETIC_AI_CAMPAIGN_BOOTSTRAP_INVALID');
 await client.query('BEGIN');
 try{
  await client.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({host:'untrusted.invalid'})]);
  await client.query('SAVEPOINT invalid_campaign_host');
  try{
   await client.query(bootstrapSql,bootstrapArgs);
   assert.fail('Expected SYNTHETIC_AI_CAMPAIGN_SERVER_CONTEXT_REQUIRED');
  }catch(error){
   if(error?.message!=='SYNTHETIC_AI_CAMPAIGN_SERVER_CONTEXT_REQUIRED')throw error;
   assertions++;
  }finally{
   await client.query('ROLLBACK TO SAVEPOINT invalid_campaign_host');
   await client.query('RELEASE SAVEPOINT invalid_campaign_host');
  }
 }finally{
  await client.query('ROLLBACK');
 }
 check(await count(client,'public.ai_provider_configs'),0);
 check(await count(client,'public.synthetic_ai_campaign_authorities'),0);
 const bootstrapped=(await one(client,bootstrapSql,bootstrapArgs)).value;
 check(bootstrapped.status,'enabled');
 check(Number(bootstrapped.carriedUsdNanos),carryUsdNanos);
 check(Number(bootstrapped.fixedDebitUsdNanos),debitUsdNanos);
 check(Number(bootstrapped.capUsdNanos),capUsdNanos);
 const authority=await one(client,`SELECT target_fingerprint,project_ref,server_host,local_carry_seal_digest,provider,endpoint,model,
  campaign_cap_usd_nanos::text,carried_usd_nanos::text,fixed_debit_usd_nanos::text,max_input_tokens,max_output_tokens,
  input_price_usd_nanos,output_price_usd_nanos,enabled
  FROM public.synthetic_ai_campaign_authorities`);
 check(authority,{target_fingerprint:fingerprint,project_ref:projectRef,server_host:requestHost,local_carry_seal_digest:carrySeal,
  provider,endpoint,model,campaign_cap_usd_nanos:String(capUsdNanos),carried_usd_nanos:String(carryUsdNanos),
  fixed_debit_usd_nanos:String(debitUsdNanos),max_input_tokens:1_047_576,max_output_tokens:32_768,
  input_price_usd_nanos:400,output_price_usd_nanos:1600,enabled:true});
 const preservedMarkers=await one(client,`SELECT
  (SELECT real_provider_calls_authorized FROM public.synthetic_admin_targets WHERE id=$1) AS target_provider_flag,
  production_authorized,customer_data_authorized,real_provider_calls_authorized
  FROM public.hosted_pilot_environment_identity WHERE singleton`,[target.targetId]);
 check(preservedMarkers,{target_provider_flag:false,production_authorized:false,customer_data_authorized:false,real_provider_calls_authorized:false});
 pass('atomic exact-host bootstrap binds target, carry seal, price constants, and preserved provider-free markers');

 phase='author_fixture';
 const roles=await one(client,`SELECT
  (SELECT organization_member_role_id FROM public.synthetic_admin_targets WHERE id=$1) AS member_role,
  (SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=$1 AND preset='author') AS author_role`,[target.targetId]);
 await client.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[ids.author,'campaign-author@avalaos.invalid']);
 await client.query(`INSERT INTO public.profiles(id,email,status,metadata) VALUES($1,$2,'active',$3::jsonb)`,
  [ids.author,'campaign-author@avalaos.invalid',JSON.stringify({syntheticCampaignAuthor:true})]);
 await client.query(`INSERT INTO public.organization_members(org_id,user_id,role_id,status,joined_at,created_by)
  VALUES($1,$2,$3,'active',statement_timestamp(),$4)`,[ids.org,ids.author,roles.member_role,ids.operator]);
 await client.query(`INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status,joined_at,created_by)
  VALUES($1,$2,$3,$4,'active',statement_timestamp(),$5)`,[ids.org,ids.workspace,ids.author,roles.author_role,ids.operator]);
 let authorVersion=Number((await one(client,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[ids.org,ids.author])).version);
 check(await count(client,'public.role_capabilities',`role_id=$1 AND capability_key IN('evidence.write','docs.approve')`,[roles.author_role]),0);
 check(await count(client,'public.role_capabilities',`role_id=$1 AND capability_key IN('assess.v2.draft.write','studio.artifacts.generate')`,[roles.author_role]),2);
 // Legacy evidence extraction requires evidence.write. Do not misrepresent this
 // legacy job fixture as the native Assess mapping authoring chain.
 await client.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'evidence.write')",[roles.author_role]);
 authorVersion=Number((await one(client,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[ids.org,ids.author])).version);
 check(await count(client,'public.role_capabilities',"role_id=$1 AND capability_key='docs.approve'",[roles.author_role]),0);
 pass('legacy extraction author has canonical evidence-write authority without document approval');

 phase='provider_validation_charge';
 const validation=await makeAttempt({actor:ids.operator,authorizationVersion:operatorVersion,operation:'provider.validate',routeId:null,
  commandType:'provider.validate',label:'provider-validation'});
 const validationReservation=await reserve(client,validation);
 check([validationReservation.mode,validationReservation.ownsProviderEffect,validationReservation.replayed,
  Number(validationReservation.debitUsdNanos)],['campaign',true,false,debitUsdNanos]);
 const validationConsumed=await consume(client,validationReservation.reservationId,validation);
 check([validationConsumed.mode,validationConsumed.consumed],['campaign',true]);
 await client.query(`UPDATE public.ai_provider_key_refs SET status='active',updated_at=statement_timestamp()
  WHERE id=$1 AND org_id=$2`,[ids.keyRef,ids.org]);
 await client.query(`UPDATE public.ai_provider_configs SET last_validated_at=statement_timestamp(),updated_at=statement_timestamp()
  WHERE id=$1 AND org_id=$2`,[ids.providerConfig,ids.org]);
 pass('provider validation reserves and consumes one immutable campaign debit before activation state');

 phase='legacy_bypass_denials';
 const bypassAttempt=await makeAttempt({authorizationVersion:authorVersion,label:'legacy-binding-omission'});
 await expectedFailure(client,reserveSql,reserveArgs(bypassAttempt,{fingerprint:null,projectRef:null}),'SYNTHETIC_AI_CAMPAIGN_BINDING_REQUIRED');
 await expectedFailure(client,`SELECT public.synthetic_ai_campaign_assert_lifecycle_operation($1::uuid,$2::uuid,$3::uuid,'provider.secret.rotate')`,
  [ids.org,ids.workspace,ids.providerConfig],'SYNTHETIC_AI_CAMPAIGN_LIFECYCLE_DENIED');
 check((await one(client,`SELECT public.synthetic_ai_campaign_assert_lifecycle_operation($1::uuid,$2::uuid,$3::uuid,'provider.validate') AS value`,
  [ids.org,ids.workspace,ids.providerConfig])).value.mode,'campaign');
 await expectedFailure(client,`SELECT public.synthetic_ai_campaign_assert_legacy_resolver($1::uuid,$2::uuid,$3::uuid,$4::uuid)`,
  [ids.org,ids.workspace,ids.providerConfig,ids.keyRef],'SYNTHETIC_AI_LEGACY_RESOLVER_DENIED');
 // This denied attempt never obtained a currency permit or invoked a provider.
 // Release its real token reservation through the canonical transition so the
 // later currency-cap race is not masked by an unrelated daily-request limit.
 check(await count(client,'public.synthetic_ai_campaign_effect_debits','receipt_id=$1',[bypassAttempt.receipt.id]),0);
 const bypassReleased=(await one(client,`SELECT public.enterprise_ai_release_provider_budget_v2(
  $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::uuid,$6::uuid,$7::uuid,$8::bigint,$9::uuid,$10::uuid,
  'openai','assess.evidence.extract',$11::text,$12::uuid,'before_provider_effect') AS value`,
  [ids.author,ids.org,ids.workspace,authorVersion,bypassAttempt.receipt.id,bypassAttempt.effectId,
   bypassAttempt.receipt.executionToken,bypassAttempt.receipt.executionFence,ids.assessRoute,ids.providerConfig,
   model,bypassAttempt.tokenBudget.reservationId])).value;
 check(bypassReleased.state,'released');
 pass('campaign binding, lifecycle, and legacy resolver bypasses fail closed');

 phase='chained_token_and_currency_budget';
 const chained=await makeAttempt({authorizationVersion:authorVersion,label:'assess-token-and-usd'});
 const tokenBudget=chained.tokenBudget;
 check([tokenBudget.state,tokenBudget.ownsProviderEffect,tokenBudget.replayed],['reserved',true,false]);
 const chainedCurrency=await reserve(client,chained);
 check([chainedCurrency.mode,chainedCurrency.ownsProviderEffect],['campaign',true]);
 check((await consume(client,chainedCurrency.reservationId,chained)).consumed,true);
 check(await count(client,'public.enterprise_ai_budget_reservations','receipt_id=$1',[chained.receipt.id]),1);
 check(await count(client,'public.synthetic_ai_campaign_effect_debits','receipt_id=$1',[chained.receipt.id]),1);
 pass('intended author passes retained token budget plus campaign currency debit without approval capability');

 phase='binding_adversaries';
 const negative=await makeAttempt({authorizationVersion:authorVersion,label:'negative-bindings'});
 const beforeNegative=await count(client,'public.synthetic_ai_campaign_effect_debits');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{fingerprint:`sha256:${'d'.repeat(64)}`}),'SYNTHETIC_AI_CAMPAIGN_NOT_AUTHORIZED');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{projectRef:'zyxwvutsrqponmlkjihg'}),'SYNTHETIC_AI_CAMPAIGN_NOT_AUTHORIZED');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{org:uuid()}),'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{workspace:uuid()}),'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{actor:uuid()}),'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{receiptId:uuid()}),'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{executionToken:uuid()}),'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{executionFence:negative.receipt.executionFence+1}),'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{authorizationVersion:authorVersion+1}),domainSignal('PR1B_AUTHORIZATION_STALE'));
 await expectedFailure(client,reserveSql,reserveArgs(negative,{provider:'groq'}),domainSignal('SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE'));
 await expectedFailure(client,reserveSql,reserveArgs(negative,{endpoint:'https://example.invalid'}),'SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{model:'gpt-4.1-mini'}),domainSignal('SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE'));
 await expectedFailure(client,reserveSql,reserveArgs(negative,{keyRefId:uuid()}),'SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{routeId:ids.studioRoute}),domainSignal('SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE'));
 await expectedFailure(client,reserveSql,reserveArgs(negative,{effectRequestHash:'not-a-hash'}),'SYNTHETIC_AI_CAMPAIGN_BINDING_INVALID');
 await expectedFailure(client,reserveSql,reserveArgs(negative,{maximumOutputTokens:32_769}),domainSignal('SYNTHETIC_AI_CAMPAIGN_NOT_AUTHORIZED'));
 await expectedFailure(client,reserveSql,reserveArgs(validation,{maximumOutputTokens:32_769}),'SYNTHETIC_AI_CAMPAIGN_NOT_AUTHORIZED');
 check(await count(client,'public.synthetic_ai_campaign_effect_debits'),beforeNegative);
 pass('wrong target, scope, authority, provider, endpoint, model, key, route, hash, and output bound all deny without debit');

 phase='expiry';
 await client.query('BEGIN');
 try{
  await client.query(`UPDATE public.synthetic_ai_campaign_authorities
   SET created_at=statement_timestamp()-interval '2 hours',expires_at=statement_timestamp()-interval '1 hour'`);
  await client.query('SAVEPOINT expired_campaign');
  try{
   await client.query(reserveSql,reserveArgs(negative));
   assert.fail('Expected SYNTHETIC_AI_CAMPAIGN_NOT_AUTHORIZED');
  }catch(error){
   if(error?.message!=='SYNTHETIC_AI_CAMPAIGN_NOT_AUTHORIZED')throw error;
   assertions++;
  }finally{
   await client.query('ROLLBACK TO SAVEPOINT expired_campaign');
   await client.query('RELEASE SAVEPOINT expired_campaign');
  }
 }finally{
  await client.query('ROLLBACK');
 }
 check(await count(client,'public.synthetic_ai_campaign_effect_debits'),beforeNegative);
 pass('expired campaign rejects before any debit');

 phase='replay_substitution_consume_once';
 const replayAttempt=await makeAttempt({authorizationVersion:authorVersion,label:'replay-consume'});
 const replayReservation=await reserve(client,replayAttempt);
 const exactReplay=await reserve(client,replayAttempt);
 check([exactReplay.ownsProviderEffect,exactReplay.replayed,exactReplay.reservationId],
  [false,true,replayReservation.reservationId]);
 await expectedFailure(client,reserveSql,reserveArgs(replayAttempt,{effectId:uuid()}),
  domainSignal('SYNTHETIC_AI_CAMPAIGN_REPLAY_SUBSTITUTION'));
 await expectedFailure(client,reserveSql,reserveArgs(replayAttempt,{effectRequestHash:hash('substituted-effect')}),
  'SYNTHETIC_AI_CAMPAIGN_REPLAY_SUBSTITUTION');
 await expectedFailure(client,reserveSql,reserveArgs(replayAttempt,{maximumOutputTokens:4097}),
  domainSignal('SYNTHETIC_AI_CAMPAIGN_REPLAY_SUBSTITUTION'));
 const consumeBoundaryBefore=await one(client,`SELECT
  (SELECT count(*)::integer FROM public.synthetic_ai_campaign_effect_debits) AS debit_count,
  consumed_at FROM public.synthetic_ai_campaign_effect_debits WHERE id=$1`,[replayReservation.reservationId]);
 check(consumeBoundaryBefore.consumed_at,null);
 const consumeSubstitutions=[
  ['target',{fingerprint:`sha256:${'e'.repeat(64)}`} ,'SYNTHETIC_AI_CAMPAIGN_PERMIT_INVALID_OR_REPLAYED'],
  ['project',{projectRef:'zyxwvutsrqponmlkjihg'},'SYNTHETIC_AI_CAMPAIGN_PERMIT_INVALID_OR_REPLAYED'],
  ['organization',{org:uuid()},'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE'],
  ['workspace',{workspace:uuid()},'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE'],
  ['actor',{actor:uuid()},'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE'],
  ['authorization-version',{authorizationVersion:authorVersion+1},domainSignal('SYNTHETIC_AI_CAMPAIGN_PERMIT_INVALID_OR_REPLAYED')],
  ['receipt',{receiptId:uuid()},'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE'],
  ['effect',{effectId:uuid()},domainSignal('SYNTHETIC_AI_CAMPAIGN_PERMIT_INVALID_OR_REPLAYED')],
  ['execution-token',{executionToken:uuid()},'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE'],
  ['execution-fence',{executionFence:replayAttempt.receipt.executionFence+1},'SYNTHETIC_AI_CAMPAIGN_RECEIPT_STALE'],
  ['route',{routeId:ids.studioRoute},domainSignal('SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE')],
  ['provider-config',{providerConfigId:uuid()},domainSignal('SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE')],
  ['key-reference',{keyRefId:uuid()},'SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE'],
  ['provider',{provider:'groq'},domainSignal('SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE')],
  ['endpoint',{endpoint:'https://example.invalid'},'SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE'],
  ['model',{model:'gpt-4.1-mini'},domainSignal('SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE')],
  ['operation',{operation:'studio.document.generate'},domainSignal('SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE')],
  ['effect-request-hash',{effectRequestHash:hash('consume-substitution')},'SYNTHETIC_AI_CAMPAIGN_PERMIT_INVALID_OR_REPLAYED'],
  ['maximum-output',{maximumOutputTokens:4097},domainSignal('SYNTHETIC_AI_CAMPAIGN_PERMIT_INVALID_OR_REPLAYED')],
 ];
 for(const [,overrides,signal] of consumeSubstitutions){
  await expectedFailure(client,consumeSql,consumeArgs(replayReservation.reservationId,replayAttempt,overrides),signal);
 }
 const consumeBoundaryAfter=await one(client,`SELECT
  (SELECT count(*)::integer FROM public.synthetic_ai_campaign_effect_debits) AS debit_count,
  consumed_at FROM public.synthetic_ai_campaign_effect_debits WHERE id=$1`,[replayReservation.reservationId]);
 check(consumeBoundaryAfter,consumeBoundaryBefore);
 check((await consume(client,replayReservation.reservationId,replayAttempt)).consumed,true);
 await expectedFailure(client,consumeSql,consumeArgs(replayReservation.reservationId,replayAttempt),
  'SYNTHETIC_AI_CAMPAIGN_PERMIT_INVALID_OR_REPLAYED');
 await expectedFailure(client,`UPDATE public.synthetic_ai_campaign_effect_debits SET operation=operation WHERE id=$1`,
  [replayReservation.reservationId],'SYNTHETIC_AI_CAMPAIGN_DEBIT_IMMUTABLE');
 await expectedFailure(client,`DELETE FROM public.synthetic_ai_campaign_effect_debits WHERE id=$1`,
  [replayReservation.reservationId],'SYNTHETIC_AI_CAMPAIGN_DEBIT_IMMUTABLE');
 await asServiceRoleFailure(`INSERT INTO public.synthetic_ai_campaign_effect_debits DEFAULT VALUES`);
 pass('reserve replay and every immutable consume binding reject substitution without debit or consume mutation');

 phase='fill_to_final_slot';
 // Provider validation, chained Assess, and replay/consume already created three
 // debits. Add fifteen distinct effects so the two-client race owns slot 19.
 for(let index=0;index<15;index++){
  const attempt=await makeAttempt({authorizationVersion:authorVersion,label:`bounded-fill-${String(index+1).padStart(2,'0')}`});
  const reservation=await reserve(client,attempt);
  check(reservation.ownsProviderEffect,true);
 }
 check(await count(client,'public.synthetic_ai_campaign_effect_debits'),18);
 const spentBeforeRace=await one(client,`SELECT
  count(*)::integer AS effects,COALESCE(sum(debit_usd_nanos),0)::text AS debits
  FROM public.synthetic_ai_campaign_effect_debits`);
 check(spentBeforeRace,{effects:18,debits:String(18*debitUsdNanos)});

 phase='concurrent_final_slot';
 const contenderA=new pg.Client({connectionString});
 const contenderB=new pg.Client({connectionString});
 await Promise.all([contenderA.connect(),contenderB.connect()]);
 try{
  await Promise.all([setRequestHost(contenderA),setRequestHost(contenderB)]);
  const attemptA=await makeAttempt({db:contenderA,authorizationVersion:authorVersion,label:'final-slot-a'});
  const attemptB=await makeAttempt({db:contenderB,authorizationVersion:authorVersion,label:'final-slot-b'});
  const outcomes=await Promise.allSettled([reserve(contenderA,attemptA),reserve(contenderB,attemptB)]);
  // Retain bounded domain codes only, never raw PostgreSQL diagnostics or IDs.
  console.log(`Final-slot outcomes: ${outcomes.map(result=>result.status==='fulfilled'
   ? `fulfilled:owns=${result.value.ownsProviderEffect===true}`
   : `rejected:${result.reason?.message?.match(/^[A-Z0-9_]{3,100}$/)?.[0]??result.reason?.code??'UNCLASSIFIED'}`).join(',')}`);
  check(outcomes.filter(result=>result.status==='fulfilled'&&result.value.ownsProviderEffect).length,1);
  check(outcomes.filter(result=>result.status==='rejected'&&result.reason?.message==='SYNTHETIC_AI_CAMPAIGN_BUDGET_EXHAUSTED').length,1);
  const winningIndex=outcomes.findIndex(result=>result.status==='fulfilled');
  const winningAttempt=[attemptA,attemptB][winningIndex];
  const winningResult=outcomes[winningIndex].value;
  const winningReplay=await reserve(client,winningAttempt);
  check([winningReplay.ownsProviderEffect,winningReplay.replayed,winningReplay.reservationId],
   [false,true,winningResult.reservationId]);
 }finally{
  await Promise.allSettled([contenderA.end(),contenderB.end()]);
 }
 const finalSpend=await one(client,`SELECT count(*)::integer AS effects,COALESCE(sum(debit_usd_nanos),0)::text AS debits,
  $1::bigint+COALESCE(sum(debit_usd_nanos),0) AS aggregate
  FROM public.synthetic_ai_campaign_effect_debits`,[carryUsdNanos]);
 check(finalSpend,{effects:19,debits:String(19*debitUsdNanos),aggregate:String(carryUsdNanos+19*debitUsdNanos)});
 check(Number(finalSpend.aggregate),9_827_044_800);
 pass('nineteen effects fit; concurrent twentieth candidate has exactly one final-slot winner and one budget denial');

 phase='migration_reapplication_atomicity';
 const dataBeforeReapply=await snapshotPopulatedData(client);
 const schemaBeforeReapply=await snapshotPublicSchemaAuthority(client);
 check(Object.keys(dataBeforeReapply).includes('auth.users'),true);
 check(Object.keys(dataBeforeReapply).filter(name=>name.startsWith('public.')).length>0,true);
 await client.query('BEGIN');
 try{
  await client.query(migrationSql);
  assert.fail('Expected SYNTHETIC_AI_CAMPAIGN_MIGRATION_PRECONDITION_FAILED');
 }catch(error){
  if(error?.message!=='SYNTHETIC_AI_CAMPAIGN_MIGRATION_PRECONDITION_FAILED')throw error;
  assertions++;
 }finally{
  await client.query('ROLLBACK');
 }
 const dataAfterReapply=await snapshotPopulatedData(client);
 const schemaAfterReapply=await snapshotPublicSchemaAuthority(client);
 check(dataAfterReapply,dataBeforeReapply);
 check(schemaAfterReapply,schemaBeforeReapply);
 check(await count(client,'public.synthetic_ai_campaign_effect_debits'),19);
 pass('same populated-database migration reapplication fails at the exact precondition and preserves all data, functions, grants, and RLS metadata');

 phase='disable';
 const disabled=(await one(client,`SELECT public.synthetic_ai_campaign_disable($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text) AS value`,
  [ids.operator,ids.org,ids.workspace,operatorVersion,fingerprint,projectRef])).value;
 check(disabled.status,'disabled');
 check((await one(client,`SELECT enabled,disabled_at IS NOT NULL AS stamped FROM public.synthetic_ai_campaign_authorities`)),
  {enabled:false,stamped:true});
 check(await count(client,'public.enterprise_ai_capability_routes','enabled'),0);
 check(await count(client,'public.ai_provider_configs',`status='disabled'`),1);
 // A valid, previously token-reserved effect must lose currency authority when
 // the provider route is disabled; do not fabricate a new post-disable token.
 await expectedFailure(client,reserveSql,reserveArgs(negative),'SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE');
 check(await count(client,'public.synthetic_ai_campaign_effect_debits'),19);
 pass('disable turns off campaign routes/config and preserves all immutable charges');

 phase='summary';
 check(labels.length,12);
 console.log(`synthetic AI campaign PostgreSQL: ${assertions} assertions passed across ${labels.length} sanitized scenarios; 19 immutable debits retained in disposable database; no provider call or secret access occurred`);
}catch(error){
 const detail=error?.message?.match(/^[A-Z0-9_]{3,100}$/)?.[0]??error?.code??'ASSERTION_FAILED';
 console.error(`synthetic AI campaign PostgreSQL failed in ${phase} after ${assertions} assertions: ${detail}`);
 process.exitCode=1;
}finally{
 await client.end().catch(()=>{});
}
