import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {validateAssessImportDatabaseUrl} from './assessImportValidationContract.mjs';
import {createEnterpriseIntelligenceFixture} from './enterpriseIntelligencePostgresFixture.mjs';

const adminUrl=validateAssessImportDatabaseUrl(process.env.ASSESS_DOCUMENT_MAPPING_POSTGRES_ADMIN_URL);
const parsed=new URL(adminUrl);
assert.ok(['127.0.0.1','localhost','::1'].includes(parsed.hostname));
assert.equal(parsed.pathname,'/postgres');
const migrationName='20260922112911_synthetic_ai_campaign_one_time_renewal.sql';
const predecessor='20260918082307_synthetic_ai_mapping_studio_budget_authority.sql';
const featureMigration='20260916083814_assess_supporting_document_mapping.sql';
const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
assert.equal(migrations.at(-6),migrationName);
assert.equal(migrations.at(-7),predecessor);
assert.equal(migrations.at(-5),'20260923062439_studio_server_helper_permissions.sql');
assert.equal(migrations.at(-4),'20260923082000_studio_frd_section_id_contract.sql');
assert.equal(migrations.at(-3),'20260923133000_pr1e_evidence_claim_operator_binding.sql');
assert.equal(migrations.at(-2),'20260923142120_pr1e_govern_control_alias_binding.sql');
assert.equal(migrations.at(-1),'20260923144653_studio_command_authority_capabilities.sql');
const migrationSql=await readFile(join('supabase/migrations',migrationName),'utf8');
const {Client}=pg;
const names=[`ai_renewal_fresh_${process.pid}_${Date.now()}`,`ai_renewal_upgrade_${process.pid}_${Date.now()}`];
for(const name of names)assert.match(name,/^[a-z0-9_]+$/u);
const urlFor=name=>{const value=new URL(adminUrl);value.pathname=`/${name}`;return value.toString()};
const uuid=()=>crypto.randomUUID();
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const one=async(db,sql,values=[])=>(await db.query(sql,values)).rows[0];
let assertions=0;
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions+=1};
const transaction=async(db,label,sql)=>{await db.query('BEGIN');try{await db.query(sql);await db.query('COMMIT')}catch(error){await db.query('ROLLBACK');throw new Error(`${label}:${error?.code??'UNKNOWN'}:${error?.message??'failure'}`)}};
const authBootstrap=`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
GRANT USAGE ON SCHEMA auth TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`;
const expectedFailure=async(operation,pattern)=>{try{await operation();assert.fail('EXPECTED_FAILURE')}catch(error){assert.match(String(error?.message??error),pattern);assertions+=1}};
const pass=(testId,detail)=>console.log(`ASSESS_DOCUMENT_MAPPING_PG_ASSERTION ${JSON.stringify({testId,result:'passed',detail})}`);
const applyChain=async(db,{through=migrationName}={})=>{
  let fixture;
  for(const name of migrations){
    if(name===featureMigration)fixture=await createEnterpriseIntelligenceFixture(db);
    await transaction(db,name,await readFile(join('supabase/migrations',name),'utf8'));
    if(name===through)break;
  }
  assert.ok(fixture);return fixture;
};
const claimValidation=async(db,fixture,label)=>{
  const requestId=uuid(),token=uuid(),requestHash=hash(`provider.validate:${label}`);
  const row=await one(db,`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'provider.validate',$4,$5,$6,NULL,$7)).*`,[
    fixture.requester,fixture.org,fixture.workspace,`renewal-${label}`,requestId,requestHash,token,
  ]);
  check(row.status,'claimed');
  return {receiptId:row.id,effectId:uuid(),executionToken:row.execution_token,executionFence:Number(row.execution_fence),requestHash,effectHash:hash(`effect:${label}`)};
};

const admin=new Client({connectionString:adminUrl});
const opened=[];
try{
  await admin.connect();
  const version=Number((await one(admin,"SELECT current_setting('server_version_num')::int version")).version);
  assert.ok(version>=160000&&version<180000);
  for(const name of names)await admin.query(`CREATE DATABASE ${name}`);

  // Renewal-chain proof through its own tip: the new objects remain
  // default-empty, forced-RLS and service-read-only. The later Studio helper
  // successor is covered by the full fresh-chain creation-access runner.
  const fresh=new Client({connectionString:urlFor(names[0])});opened.push(fresh);await fresh.connect();
  await transaction(fresh,'auth-bootstrap',authBootstrap);
  await applyChain(fresh);
  const freshState=await one(fresh,`SELECT
    (SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton) tip,
    (SELECT count(*)::int FROM public.synthetic_ai_campaign_renewals) renewals,
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.synthetic_ai_campaign_renewals'::regclass) forced_rls,
    has_table_privilege('service_role','public.synthetic_ai_campaign_renewals','SELECT') service_select,
    has_table_privilege('service_role','public.synthetic_ai_campaign_renewals','INSERT') service_insert`);
  check(freshState,{tip:'20260922112911',renewals:0,forced_rls:true,service_select:true,service_insert:false});
  pass('MAP-PG-RENEWAL-001','fresh migration chain creates an empty forced-RLS renewal authority with service read-only access');

  // Populated upgrade proof begins at the exact predecessor.
  const db=new Client({connectionString:urlFor(names[1])});opened.push(db);await db.connect();
  await transaction(db,'auth-bootstrap',authBootstrap);
  const fixture=await applyChain(db,{through:predecessor});
  const projectRef='abcdefghijklmnopqrst',requestHost=`${projectRef}.supabase.co`,fingerprint=`sha256:${'b'.repeat(64)}`;
  await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({host:requestHost})]);
  await db.query(`INSERT INTO public.role_capabilities(role_id,capability_key) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`,[
    fixture.routeRole,['org.admin','admin.synthetic.users.manage','assess.v2.draft.write','studio.artifacts.generate','evidence.write'],
  ]);
  const authorizationVersion=Number((await one(db,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,fixture.requester])).version);
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET enabled=true,read_only=false,provider_enabled=true WHERE singleton`);
  await db.query(`UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=true WHERE singleton`);
  await db.query(`UPDATE public.ai_provider_key_refs SET secret_ref=$2,status='active' WHERE id=$1`,[
    fixture.keyRef,`AVALA_PROVIDER_SECRET_OPENAI_${fixture.org.replaceAll('-','').toUpperCase()}_QA`,
  ]);
  await db.query(`UPDATE public.ai_provider_configs SET default_model='gpt-4.1-mini-2025-04-14',
    model_allowlist=ARRAY['gpt-4.1-mini-2025-04-14'],endpoint_url='https://api.openai.com',
    last_validated_at=statement_timestamp(),status='active' WHERE id=$1`,[fixture.provider]);
  const assessRoute=uuid(),studioRoute=uuid(),targetId=uuid();
  for(const [id,capability] of [[assessRoute,'assess.evidence.extract'],[studioRoute,'studio.document.generate']])
    await db.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,'gpt-4.1-mini-2025-04-14',true,ARRAY[$6::text],1,$7,$7)`,[id,fixture.org,fixture.workspace,fixture.provider,capability,fixture.routeRole,fixture.requester]);
  await db.query(`INSERT INTO public.synthetic_admin_targets(id,target_fingerprint,org_id,workspace_id,operator_actor_id,organization_member_role_id,environment_class,enabled)
    VALUES($1,$2,$3,$4,$5,$6,'hosted_nonproduction_pilot',true)`,[targetId,fingerprint,fixture.org,fixture.workspace,fixture.requester,fixture.role]);
  const campaignId=(await one(db,`INSERT INTO public.synthetic_ai_campaign_authorities(target_id,target_fingerprint,project_ref,server_host,local_carry_seal_digest,
    org_id,workspace_id,operator_actor_id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour') RETURNING id`,[
    targetId,fingerprint,projectRef,requestHost,`sha256:${'c'.repeat(64)}`,fixture.org,fixture.workspace,fixture.requester,
    fixture.provider,fixture.keyRef,assessRoute,studioRoute,
  ])).id;
  const baseline=await claimValidation(db,fixture,'retained-baseline');
  await db.query(`INSERT INTO public.synthetic_ai_campaign_effect_debits(campaign_id,receipt_id,effect_id,authority_kind,actor_id,org_id,workspace_id,
    authorization_version,execution_token,execution_fence,command_request_hash,effect_request_hash,maximum_output_tokens,operation,route_id,
    provider_config_id,key_ref_id,provider,endpoint,model,debit_usd_nanos,reserved_at,consumed_at)
    VALUES($1,$2,$3,'enterprise',$4,$5,$6,$7,$8,$9,$10,$11,4096,'provider.validate',NULL,$12,$13,'openai','https://api.openai.com',
      'gpt-4.1-mini-2025-04-14',471459200,statement_timestamp()-interval '90 minutes',statement_timestamp()-interval '89 minutes')`,[
    campaignId,baseline.receiptId,baseline.effectId,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,
    baseline.executionToken,baseline.executionFence,baseline.requestHash,baseline.effectHash,fixture.provider,fixture.keyRef,
  ]);
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton`);
  await db.query(`UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton`);
  const before=await one(db,`SELECT md5(to_jsonb(authority)::text) campaign,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(debit) ORDER BY debit.id),'[]'::jsonb)::text) FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=authority.id) debits
    FROM public.synthetic_ai_campaign_authorities authority WHERE authority.id=$1`,[campaignId]);
  await transaction(db,migrationName,migrationSql);
  const after=await one(db,`SELECT md5(to_jsonb(authority)::text) campaign,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(debit)-'renewal_id' ORDER BY debit.id),'[]'::jsonb)::text) FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=authority.id) debits
    FROM public.synthetic_ai_campaign_authorities authority WHERE authority.id=$1`,[campaignId]);
  check(after.campaign,before.campaign,'upgrade must not rewrite original campaign');
  check(after.debits,before.debits,'upgrade must not rewrite original debit');
  pass('MAP-PG-RENEWAL-002','populated upgrade preserves the exact original campaign and historical validation debit');

  const reserveValidationSql=`SELECT public.synthetic_ai_campaign_reserve_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,
    'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','provider.validate',$13,4096) result`;
  const validationArgs=item=>[fixture.requester,fixture.org,fixture.workspace,authorizationVersion,fingerprint,projectRef,item.receiptId,
    item.effectId,item.executionToken,item.executionFence,fixture.provider,fixture.keyRef,item.effectHash];
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton`);
  const noRenewal=await claimValidation(db,fixture,'expired-without-renewal');
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton`);
  await expectedFailure(()=>db.query(reserveValidationSql,validationArgs(noRenewal)),/SYNTHETIC_AI_CAMPAIGN_NOT_AUTHORIZED/u);
  await expectedFailure(()=>db.query(reserveValidationSql,validationArgs(baseline)),/SYNTHETIC_AI_CAMPAIGN_NOT_AUTHORIZED/u);
  pass('MAP-PG-RENEWAL-003','an expired campaign without a renewal denies both a new reservation and prior-debit replay');

  const renewalArgs=[fixture.requester,fixture.org,fixture.workspace,authorizationVersion,fingerprint,projectRef,campaignId,
    fixture.provider,fixture.keyRef,assessRoute,studioRoute,1_340_779_200,300];
  const renewalSql=`SELECT public.synthetic_ai_campaign_renew_once($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result`;
  const rowsBefore=Number((await one(db,'SELECT count(*)::int n FROM public.synthetic_ai_campaign_renewals')).n);
  await expectedFailure(()=>db.query(renewalSql,[...renewalArgs.slice(0,11),1_340_779_199,300]),/SYNTHETIC_AI_CAMPAIGN_RENEWAL_INVALID/u);
  await expectedFailure(()=>db.query(renewalSql,[...renewalArgs.slice(0,5),'bbbbbbbbbbbbbbbbbbbb',...renewalArgs.slice(6)]),/SYNTHETIC_AI_CAMPAIGN_(SERVER_CONTEXT_REQUIRED|RENEWAL_NOT_AUTHORIZED)/u);
  await expectedFailure(()=>db.query(renewalSql,[uuid(),...renewalArgs.slice(1)]),/PR1B_NOT_FOUND|SYNTHETIC_AI_CAMPAIGN_RENEWAL_NOT_AUTHORIZED/u);
  check(Number((await one(db,'SELECT count(*)::int n FROM public.synthetic_ai_campaign_renewals')).n),rowsBefore);

  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton`);
  const unconsumed=await claimValidation(db,fixture,'unconsumed-history');
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton`);
  await db.query('BEGIN');
  try{
    await db.query(`INSERT INTO public.synthetic_ai_campaign_effect_debits(campaign_id,receipt_id,effect_id,authority_kind,actor_id,org_id,workspace_id,
      authorization_version,execution_token,execution_fence,command_request_hash,effect_request_hash,maximum_output_tokens,operation,route_id,
      provider_config_id,key_ref_id,provider,endpoint,model,debit_usd_nanos)
      VALUES($1,$2,$3,'enterprise',$4,$5,$6,$7,$8,$9,$10,$11,4096,'provider.validate',NULL,$12,$13,'openai',
        'https://api.openai.com','gpt-4.1-mini-2025-04-14',471459200)`,[
      campaignId,unconsumed.receiptId,unconsumed.effectId,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,
      unconsumed.executionToken,unconsumed.executionFence,unconsumed.requestHash,unconsumed.effectHash,fixture.provider,fixture.keyRef,
    ]);
    await expectedFailure(()=>db.query(renewalSql,renewalArgs),/SYNTHETIC_AI_CAMPAIGN_RENEWAL_HISTORY_UNSAFE/u);
  }finally{await db.query('ROLLBACK')}

  await db.query('BEGIN');
  try{
    await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton`);
    const requestId=uuid(),token=uuid(),requestHash=hash('uncertain-token-budget'),jobId=uuid();
    const receipt=await one(db,`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'transcript.assess.extract',$4,$5,$6,NULL,$7)).*`,[
      fixture.requester,fixture.org,fixture.workspace,'renewal-uncertain-budget',requestId,requestHash,token,
    ]);
    await db.query(`INSERT INTO public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,
      prompt_version,actor_id,request_id,idempotency_key,status,approval_state,receipt_id,request_hash,execution_token,execution_fence,route_id)
      VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai','gpt-4.1-mini-2025-04-14','renewal-test','v1',$5,$6,$7,
        'running','review_required',$8,$9,$10,$11,$12)`,[
      jobId,fixture.org,fixture.workspace,fixture.provider,fixture.requester,requestId,`renewal-job-${jobId}`,
      receipt.id,requestHash,receipt.execution_token,receipt.execution_fence,assessRoute,
    ]);
    await db.query(`INSERT INTO public.enterprise_ai_budget_reservations(receipt_id,job_id,authority_kind,org_id,workspace_id,actor_id,
      authorization_version,route_id,provider_config_id,provider,capability,model,state,estimated_input_tokens,maximum_output_tokens,
      failure_class,execution_token,execution_fence,day_bucket,month_bucket)
      VALUES($1,$2,'enterprise',$3,$4,$5,$6,$7,$8,'openai','assess.evidence.extract','gpt-4.1-mini-2025-04-14','uncertain',
        100,4096,'transport_timeout',$9,$10,current_date,date_trunc('month',current_date)::date)`,[
      receipt.id,jobId,fixture.org,fixture.workspace,fixture.requester,authorizationVersion,assessRoute,fixture.provider,
      receipt.execution_token,receipt.execution_fence,
    ]);
    await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton`);
    await expectedFailure(()=>db.query(renewalSql,renewalArgs),/SYNTHETIC_AI_CAMPAIGN_RENEWAL_HISTORY_UNSAFE/u);
  }finally{await db.query('ROLLBACK')}

  await db.query('BEGIN');
  try{
    await db.query(`UPDATE public.synthetic_ai_campaign_authorities SET enabled=false,disabled_at=statement_timestamp() WHERE id=$1`,[campaignId]);
    await expectedFailure(()=>db.query(renewalSql,renewalArgs),/SYNTHETIC_AI_CAMPAIGN_RENEWAL_NOT_AUTHORIZED/u);
  }finally{await db.query('ROLLBACK')}
  pass('MAP-PG-RENEWAL-004','wrong authority, scope, binding, baseline charge, disabled campaign, unconsumed debit and uncertain token budget reject without a renewal row');

  // One-second renewal in a rolled-back transaction proves that consume checks
  // the renewal deadline, without changing retained campaign history.
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton`);
  const expiring=await claimValidation(db,fixture,'expiry');
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton`);
  await db.query('BEGIN');
  try{
    const expiringRenewal=(await one(db,renewalSql,[...renewalArgs.slice(0,12),1])).result;
    const reserveSql=`SELECT public.synthetic_ai_campaign_reserve_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','provider.validate',$13,4096) result`;
    const reserveArgs=[fixture.requester,fixture.org,fixture.workspace,authorizationVersion,fingerprint,projectRef,expiring.receiptId,
      expiring.effectId,expiring.executionToken,expiring.executionFence,fixture.provider,fixture.keyRef,expiring.effectHash];
    const permit=(await one(db,reserveSql,reserveArgs)).result;check(permit.ownsProviderEffect,true);
    await db.query('SELECT pg_sleep(1.1)');
    await expectedFailure(()=>db.query(`SELECT public.synthetic_ai_campaign_consume_effect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12,$13,
      'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14','provider.validate',$14,4096)`,[
      permit.reservationId,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,fingerprint,projectRef,
      expiring.receiptId,expiring.effectId,expiring.executionToken,expiring.executionFence,fixture.provider,fixture.keyRef,expiring.effectHash,
    ]),/SYNTHETIC_AI_CAMPAIGN_PERMIT_INVALID_OR_REPLAYED/u);
    check(expiringRenewal.status,'renewed');
  }finally{await db.query('ROLLBACK')}
  pass('MAP-PG-RENEWAL-005','consume rechecks the renewal deadline and rejects an expired permit');

  const renewal=(await one(db,renewalSql,renewalArgs)).result;
  check([renewal.status,Number(renewal.baselineAggregateUsdNanos),Number(renewal.maximumAdditionalEffects),Number(renewal.maximumAggregateUsdNanos)],
    ['renewed',1_340_779_200,6,4_169_534_400]);
  await expectedFailure(()=>db.query(renewalSql,renewalArgs),/SYNTHETIC_AI_CAMPAIGN_RENEWAL_NOT_AUTHORIZED/u);
  await expectedFailure(()=>db.query(`UPDATE public.synthetic_ai_campaign_renewals SET expires_at=expires_at WHERE id=$1`,[renewal.renewalId]),/SYNTHETIC_AI_CAMPAIGN_RENEWAL_IMMUTABLE/u);
  pass('MAP-PG-RENEWAL-006','only one immutable renewal can be appended to the original campaign');

  // Fill five consumed renewal debits through privileged fixture setup. The
  // final provider-validation slot is then contested through the real RPC.
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton`);
  for(let index=0;index<5;index+=1){
    const item=await claimValidation(db,fixture,`fill-${index}`);
    await db.query(`INSERT INTO public.synthetic_ai_campaign_effect_debits(campaign_id,renewal_id,receipt_id,effect_id,authority_kind,actor_id,org_id,workspace_id,
      authorization_version,execution_token,execution_fence,command_request_hash,effect_request_hash,maximum_output_tokens,operation,route_id,
      provider_config_id,key_ref_id,provider,endpoint,model,debit_usd_nanos,consumed_at)
      VALUES($1,$2,$3,$4,'enterprise',$5,$6,$7,$8,$9,$10,$11,$12,4096,'assess.evidence.extract',$13,$14,$15,'openai',
        'https://api.openai.com','gpt-4.1-mini-2025-04-14',471459200,statement_timestamp())`,[
      campaignId,renewal.renewalId,item.receiptId,item.effectId,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,
      item.executionToken,item.executionFence,item.requestHash,item.effectHash,assessRoute,fixture.provider,fixture.keyRef,
    ]);
  }
  const contenders=[await claimValidation(db,fixture,'final-a'),await claimValidation(db,fixture,'final-b')];
  const clients=[];
  try{
    for(let index=0;index<2;index++){const client=new Client({connectionString:urlFor(names[1])});clients.push(client);await client.connect();await client.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({host:requestHost})])}
    const outcomes=await Promise.allSettled(clients.map((client,index)=>one(client,reserveValidationSql,validationArgs(contenders[index]))));
    check(outcomes.filter(item=>item.status==='fulfilled').length,1);
    check(outcomes.filter(item=>item.status==='rejected'&&/SYNTHETIC_AI_CAMPAIGN_EFFECT_LIMIT_REACHED/u.test(item.reason?.message??'')).length,1);
    const winner=outcomes.findIndex(item=>item.status==='fulfilled');
    const permit=outcomes[winner].value.result;
    const replay=(await one(db,reserveValidationSql,validationArgs(contenders[winner]))).result;
    check([replay.replayed,replay.ownsProviderEffect,replay.reservationId],[true,false,permit.reservationId]);
    const totals=await one(db,`SELECT count(*) FILTER(WHERE renewal_id=$1)::int renewed,
      869320000+sum(debit_usd_nanos)::bigint aggregate FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$2`,[renewal.renewalId,campaignId]);
    check([totals.renewed,Number(totals.aggregate)],[6,4_169_534_400]);
  }finally{await Promise.allSettled(clients.map(client=>client.end()))}
  pass('MAP-PG-RENEWAL-007','concurrent final-slot reservation has one winner while exact replay preserves the aggregate ceiling');

  const snapshot=await one(db,`SELECT (SELECT count(*)::int FROM public.synthetic_ai_campaign_renewals) renewals,
    (SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits) debits,
    (SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits WHERE consumed_at IS NULL) unconsumed`);
  await expectedFailure(()=>transaction(db,'reapply',migrationSql),/SYNTHETIC_AI_CAMPAIGN_RENEWAL_MIGRATION_PRECONDITION_FAILED/u);
  check(await one(db,`SELECT (SELECT count(*)::int FROM public.synthetic_ai_campaign_renewals) renewals,
    (SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits) debits,
    (SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits WHERE consumed_at IS NULL) unconsumed`),snapshot);
  pass('MAP-PG-RENEWAL-008','migration reapply fails before mutation and preserves all renewal/debit history');

  console.log(`synthetic AI renewal PostgreSQL: ${assertions} assertions passed across 8 sanitized scenarios; zero provider calls and zero secret reads`);
}finally{
  await Promise.allSettled(opened.map(client=>client.end()));
  if(admin){
    const cleanupFailures=[];
    for(const name of names){
      try{
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
        const remaining=Number((await one(admin,'SELECT count(*)::int n FROM pg_database WHERE datname=$1',[name])).n);
        if(remaining!==0)cleanupFailures.push(`${name}:still_present`);
        else console.log(`ASSESS_DOCUMENT_MAPPING_PG_CLEANUP ${JSON.stringify({database:name,status:'dropped_and_absent'})}`);
      }catch(error){cleanupFailures.push(`${name}:${error?.code??'UNKNOWN'}`)}
    }
    await admin.end();
    if(cleanupFailures.length)throw new Error(`SYNTHETIC_AI_RENEWAL_DATABASE_CLEANUP_FAILED:${cleanupFailures.join(',')}`);
  }
}
