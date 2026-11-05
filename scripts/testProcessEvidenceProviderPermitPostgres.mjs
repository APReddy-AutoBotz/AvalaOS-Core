import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';

const url = new URL(process.env.AUTHENTICATED_SYNTHETIC_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:61676/postgres');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname)
  || url.pathname !== '/postgres' || url.search || url.hash) throw new Error('Disposable loopback admin database required');
const name = 'process_evidence_' + randomUUID().replaceAll('-', '');
const admin = new pg.Client({ connectionString: url.href });
const project = 'abcdefghijklmnopqrst';
const fingerprint = 'sha256:' + 'a'.repeat(64);
const id = Object.fromEntries(['operator','assess','studio','shared','org','workspace','config','key','assessRoute','studioRoute'].map(k => [k, randomUUID()]));
const model = 'gpt-4.1-mini-2025-04-14';
const endpoint = 'https://api.openai.com';
const commit = 'b'.repeat(40);
const resumeCommit = 'e'.repeat(40);
const secretReference = 'AVALA_PROVIDER_SECRET_OPENAI_'+id.org.replaceAll('-','').toUpperCase()+'_TEST';
const clients = [];
const result = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
async function connect() {
  const value = new URL(url);
  value.pathname = '/' + name;
  const db = new pg.Client({ connectionString: value.href });
  await db.connect();
  clients.push(db);
  await db.query("SELECT set_config('request.headers',$1,false)", [JSON.stringify({host: project+'.supabase.co'})]);
  return db;
}
async function install(db) {
  await db.query(`DO $$BEGIN CREATE ROLE anon NOLOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
    DO $$BEGIN CREATE ROLE authenticated NOLOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
    DO $$BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
    CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
  for (const filename of (await readdir('supabase/migrations')).filter(s => s.endsWith('.sql')).sort()) {
    const sql = (await readFile('supabase/migrations/'+filename,'utf8')).replaceAll('\r\n','\n');
    await applySyntheticAiTerminalJournalMigrationForTest(db,filename,async () => {
      await db.query('BEGIN');
      try { await db.query(sql); await db.query('COMMIT'); }
      catch (error) {
        await db.query('ROLLBACK');
        throw new Error(filename+': '+error.message+(error.position?' at SQL position '+error.position:''));
      }
    });
  }
}
async function claim(db, actor, type) {
  const request = randomUUID(), token = randomUUID(), hash = 'd'.repeat(64);
  const receipt=await result(db,`SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*`,
    [actor,id.org,id.workspace,type,'test-'+request,request,hash,token]);
  return {...receipt,request_id:request,request_hash:hash};
}
await admin.connect();
let created = false;
try {
  await admin.query('CREATE DATABASE '+name);
  created = true;
  const db = await connect();
  await install(db);
  assert.equal((await result(db,'SELECT count(*)::int n FROM public.synthetic_ai_campaign_authorities')).n,0);
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id.operator,'operator@avalaos.invalid']);
  const target = (await result(db,'SELECT public.synthetic_admin_bootstrap_operator($1,$2,$3,$4) target',
    [id.operator,id.org,id.workspace,fingerprint])).target;
  const roles = await result(db,`SELECT organization_member_role_id member_role,
    (SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=t.id AND preset='author') author_role,
    (SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=t.id AND preset='reviewer') reviewer_role,
    (SELECT role_id FROM public.organization_members WHERE org_id=t.org_id AND user_id=t.operator_actor_id
      AND status='active' AND deleted_at IS NULL) operator_role
    FROM public.synthetic_admin_targets t WHERE id=$1`,[target.targetId]);
  for (const [actor,label] of [[id.assess,'assess'],[id.studio,'studio']]) {
    const email = label+'@avalaos.invalid';
    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[actor,email]);
    await db.query("INSERT INTO public.profiles(id,email,status) VALUES($1,$2,'active')",[actor,email]);
    await db.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status,joined_at,created_by) VALUES($1,$2,$3,'active',now(),$4)",[id.org,actor,roles.member_role,id.operator]);
    await db.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status,joined_at,created_by) VALUES($1,$2,$3,$4,'active',now(),$5)",[id.org,id.workspace,actor,roles.author_role,id.operator]);
  }
  const operatorAccess=(grant,version,key)=>result(db,`SELECT public.synthetic_admin_${grant?'grant':'remove'}_operator_assess_read(
    $1,$2,$3,$4,$5,$6,$7) access`,[id.operator,id.org,id.workspace,version,fingerprint,randomUUID(),key]);
  let authVersion = Number((await result(db,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[id.org,id.operator])).version);
  await assert.rejects(operatorAccess(true,authVersion,null),/INVALID_REQUEST/);
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id.shared,'shared@avalaos.invalid']);
  await db.query("INSERT INTO public.profiles(id,email,status) VALUES($1,$2,'active')",[id.shared,'shared@avalaos.invalid']);
  await db.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status,joined_at,created_by) VALUES($1,$2,$3,'active',now(),$4)",
    [id.org,id.shared,roles.operator_role,id.operator]);
  await assert.rejects(operatorAccess(true,authVersion,'shared-role-reject'),/FEATURE_DISABLED/);
  await db.query('DELETE FROM public.organization_members WHERE org_id=$1 AND user_id=$2',[id.org,id.shared]);
  const operatorCapabilitiesBefore=await result(db,`SELECT role.permissions,
    COALESCE(jsonb_agg(capability.capability_key ORDER BY capability.capability_key)
      FILTER(WHERE capability.capability_key IS NOT NULL),'[]'::jsonb) capabilities
    FROM public.roles role LEFT JOIN public.role_capabilities capability ON capability.role_id=role.id
    WHERE role.id=$1 GROUP BY role.id`,[roles.operator_role]);
  assert.equal(operatorCapabilitiesBefore.capabilities.includes('assess.read'),false);
  assert.equal(operatorCapabilitiesBefore.permissions.includes('assess.read'),false);
  const presetCapabilitiesBefore=await result(db,`SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'preset',preset.preset,'roleId',preset.role_id,'capability',capability.capability_key)
      ORDER BY preset.preset,preset.role_id,capability.capability_key),'[]'::jsonb) snapshot
    FROM public.synthetic_admin_preset_roles preset
    JOIN public.role_capabilities capability ON capability.role_id=preset.role_id
    WHERE preset.target_id=$1`,[target.targetId]);
  const membershipsBefore=await result(db,`SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'kind',entry->>'userId'),'[]'::jsonb) snapshot
    FROM (SELECT jsonb_build_object('kind','organization','userId',member.user_id,'roleId',member.role_id,
        'status',member.status,'deletedAt',member.deleted_at) entry
      FROM public.organization_members member WHERE member.org_id=$1
      UNION ALL
      SELECT jsonb_build_object('kind','workspace','userId',member.user_id,'roleId',member.role_id,
        'status',member.status,'deletedAt',member.deleted_at) entry
      FROM public.workspace_memberships member WHERE member.org_id=$1 AND member.workspace_id=$2) membership`,[id.org,id.workspace]);
  const preGrantAuthVersion=authVersion;
  const granted=(await operatorAccess(true,authVersion,'operator-access-grant')).access;
  assert.equal(granted.status,'operator_access_granted');
  authVersion=Number(granted.version);
  await assert.rejects(operatorAccess(false,preGrantAuthVersion,'operator-access-stale'),/AUTHORIZATION_STALE/);
  const operatorCapabilitiesAfter=await result(db,`SELECT role.permissions,
    COALESCE(jsonb_agg(capability.capability_key ORDER BY capability.capability_key)
      FILTER(WHERE capability.capability_key IS NOT NULL),'[]'::jsonb) capabilities
    FROM public.roles role LEFT JOIN public.role_capabilities capability ON capability.role_id=role.id
    WHERE role.id=$1 GROUP BY role.id`,[roles.operator_role]);
  assert.deepEqual(operatorCapabilitiesAfter.capabilities,
    [...operatorCapabilitiesBefore.capabilities,'assess.read'].sort());
  assert.deepEqual(operatorCapabilitiesAfter.permissions,
    [...operatorCapabilitiesBefore.permissions,'assess.read'].sort());
  assert.deepEqual(await result(db,`SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'preset',preset.preset,'roleId',preset.role_id,'capability',capability.capability_key)
      ORDER BY preset.preset,preset.role_id,capability.capability_key),'[]'::jsonb) snapshot
    FROM public.synthetic_admin_preset_roles preset
    JOIN public.role_capabilities capability ON capability.role_id=preset.role_id
    WHERE preset.target_id=$1`,[target.targetId]),presetCapabilitiesBefore);
  assert.deepEqual(await result(db,`SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'kind',entry->>'userId'),'[]'::jsonb) snapshot
    FROM (SELECT jsonb_build_object('kind','organization','userId',member.user_id,'roleId',member.role_id,
        'status',member.status,'deletedAt',member.deleted_at) entry
      FROM public.organization_members member WHERE member.org_id=$1
      UNION ALL
      SELECT jsonb_build_object('kind','workspace','userId',member.user_id,'roleId',member.role_id,
        'status',member.status,'deletedAt',member.deleted_at) entry
      FROM public.workspace_memberships member WHERE member.org_id=$1 AND member.workspace_id=$2) membership`,[id.org,id.workspace]),membershipsBefore);
  assert.equal((await operatorAccess(false,authVersion,'operator-access-remove')).access.status,'operator_access_removed');
  assert.deepEqual(await result(db,`SELECT role.permissions,
    COALESCE(jsonb_agg(capability.capability_key ORDER BY capability.capability_key)
      FILTER(WHERE capability.capability_key IS NOT NULL),'[]'::jsonb) capabilities
    FROM public.roles role LEFT JOIN public.role_capabilities capability ON capability.role_id=role.id
    WHERE role.id=$1 GROUP BY role.id`,[roles.operator_role]),operatorCapabilitiesBefore);
  authVersion=Number((await result(db,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[id.org,id.operator])).version);
  const finalGrant=(await operatorAccess(true,authVersion,'operator-access-final')).access;
  authVersion=Number(finalGrant.version);
  assert.equal((await result(db,`SELECT permissions @> '["assess.read"]'::jsonb has_read
    FROM public.roles WHERE id=$1`,[roles.operator_role])).has_read,true);
  const args=[id.operator,id.org,id.workspace,authVersion,fingerprint,project,'sha256:'+'c'.repeat(64),
    secretReference,id.config,id.key,id.assessRoute,id.studioRoute,
    new Date(Date.now()+3600000),commit,id.assess,id.studio];
  const open='SELECT public.process_evidence_open_provider_run('+args.map((_,i)=>'$'+(i+1)).join(',')+') permit';
  await db.query('SET ROLE authenticated');
  await assert.rejects(db.query(open,args),/permission denied/);
  await db.query('RESET ROLE');
  await assert.rejects(db.query(open,[...args.slice(0,-1),id.assess]),/RUN_BINDING_INVALID/);
  const permit=(await result(db,open,args)).permit;
  assert.equal(permit.maxCalls,8); assert.equal(permit.capUsdNanos,4e9); assert.equal(permit.carriedUsdNanos,0);

  const resumeExpiry = new Date(Date.now()+3600000);
  const resumeArgs=[id.operator,id.org,id.workspace,authVersion,fingerprint,project,permit.campaignId,secretReference,
    id.config,id.key,id.assessRoute,id.studioRoute,resumeExpiry,resumeCommit,id.assess,id.studio];
  const resume='SELECT public.process_evidence_resume_provider_run('+resumeArgs.map((_,i)=>'$'+(i+1)).join(',')+') permit';
  const initialRoutes=(await db.query(`SELECT id,version,allowed_roles FROM public.enterprise_ai_capability_routes
    WHERE id=ANY($1::uuid[]) ORDER BY id`,[[id.assessRoute,id.studioRoute]])).rows;
  const initialCampaign=await result(db,`SELECT id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,
    campaign_cap_usd_nanos::text cap,carried_usd_nanos::text carried,fixed_debit_usd_nanos::text debit
    FROM public.synthetic_ai_campaign_authorities WHERE id=$1`,[permit.campaignId]);

  // A retained provider-effect reservation makes the zero-use resume fail closed.
  await db.query('BEGIN');
  const unsafeReceipt=await claim(db,id.operator,'provider.validate');
  const unsafeReserveArgs=[id.operator,id.org,id.workspace,authVersion,fingerprint,project,unsafeReceipt.id,unsafeReceipt.id,
    unsafeReceipt.execution_token,unsafeReceipt.execution_fence,null,id.config,id.key,'openai',endpoint,model,
    'provider.validate','f'.repeat(64),32768];
  const unsafeRpc='SELECT public.synthetic_ai_campaign_reserve_effect('+unsafeReserveArgs.map((_,i)=>'$'+(i+1)).join(',')+') permit';
  await db.query(unsafeRpc,unsafeReserveArgs);
  await db.query('SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)',
    [id.operator,id.org,id.workspace,authVersion,fingerprint,project]);
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  await assert.rejects(db.query(resume,resumeArgs),/RESUME_HISTORY_UNSAFE/);
  await db.query('ROLLBACK');
  assert.equal((await result(db,'SELECT count(*)::int n FROM public.synthetic_ai_campaign_effect_debits')).n,0);

  // Required cleanup leaves the exact retained provider objects disabled.
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)',
    [id.operator,id.org,id.workspace,authVersion,fingerprint,project]);
  assert.deepEqual(await result(db,`SELECT enabled,status,(SELECT bool_and(NOT enabled)
    FROM public.enterprise_ai_capability_routes WHERE id=ANY($2::uuid[])) routes_off
    FROM public.synthetic_ai_campaign_authorities campaign JOIN public.ai_provider_configs config
      ON config.id=campaign.provider_config_id WHERE campaign.id=$1`,[permit.campaignId,[id.assessRoute,id.studioRoute]]),
    {enabled:false,status:'disabled',routes_off:true});

  await db.query('SET ROLE authenticated');
  await assert.rejects(db.query(resume,resumeArgs),/permission denied/);
  await db.query('RESET ROLE');
  assert.deepEqual(await result(db,`SELECT
    has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='process_evidence_resume_provider_run'`),
    {service_execute:true,authenticated_execute:false,anon_execute:false});
  assert.deepEqual(await result(db,`SELECT relation.relrowsecurity rls,relation.relforcerowsecurity force_rls,
    has_table_privilege('service_role',relation.oid,'SELECT') service_select,
    has_table_privilege('service_role',relation.oid,'INSERT') service_insert,
    has_table_privilege('authenticated',relation.oid,'SELECT') authenticated_select,
    has_table_privilege('anon',relation.oid,'SELECT') anon_select
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relname='process_evidence_provider_resume_windows'`),
    {rls:true,force_rls:true,service_select:true,service_insert:false,authenticated_select:false,anon_select:false});

  for (const [index,invalid,pattern] of [
    [3,authVersion-1,/AUTHORIZATION_STALE/],
    [6,randomUUID(),/RESUME_NOT_AUTHORIZED/],
    [7,secretReference+'_OTHER',/RESUME_BINDING_STALE/],
    [8,randomUUID(),/RESUME_NOT_AUTHORIZED/],
    [13,'not-a-commit',/RESUME_BINDING_INVALID/],
    [15,id.assess,/RESUME_BINDING_INVALID/],
  ]) {
    const values=[...resumeArgs]; values[index]=invalid;
    await assert.rejects(db.query(resume,values),pattern);
  }
  const late=[...resumeArgs];late[12]=new Date(Date.now()+2*3600000+60000);
  await assert.rejects(db.query(resume,late),/RESUME_BINDING_INVALID/);
  await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({host:'zzzzzzzzzzzzzzzzzzzz.supabase.co'})]);
  await assert.rejects(db.query(resume,resumeArgs),/RESUME_NOT_AUTHORIZED/);
  await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({host:project+'.supabase.co'})]);
  await db.query("UPDATE public.ai_provider_configs SET default_model='foreign-model',model_allowlist=ARRAY['foreign-model'] WHERE id=$1",[id.config]);
  await assert.rejects(db.query(resume,resumeArgs),/RESUME_BINDING_STALE/);
  await db.query('UPDATE public.ai_provider_configs SET default_model=$2,model_allowlist=ARRAY[$2] WHERE id=$1',[id.config,model]);
  await db.query("UPDATE public.ai_provider_key_refs SET status='active' WHERE id=$1",[id.key]);
  await assert.rejects(db.query(resume,resumeArgs),/RESUME_BINDING_STALE/);
  await db.query("UPDATE public.ai_provider_key_refs SET status='pending_review' WHERE id=$1",[id.key]);
  await db.query('UPDATE public.workspace_memberships SET role_id=$2 WHERE org_id=$3 AND workspace_id=$4 AND user_id=$1',
    [id.assess,roles.reviewer_role,id.org,id.workspace]);
  await assert.rejects(db.query(resume,resumeArgs),/RESUME_BINDING_STALE/);
  await db.query('UPDATE public.workspace_memberships SET role_id=$2 WHERE org_id=$3 AND workspace_id=$4 AND user_id=$1',
    [id.assess,roles.author_role,id.org,id.workspace]);

  assert.deepEqual(await result(db,`SELECT
    config.status,config.provider,config.endpoint_url,config.default_model,config.model_allowlist,
    config.allowed_modes,config.allowed_operations,config.evidence_ref=campaign.local_carry_seal_digest evidence_bound,
    config.budget_policy=jsonb_build_object('dailyRequests',20,'monthlyTokens',20500000) budget_bound,
    key_ref.status key_status,key_ref.resolver_type,key_ref.secret_backend_kind,
    key_ref.secret_ref=$2 secret_bound,
    (SELECT count(*)::int FROM public.enterprise_ai_capability_routes route
      WHERE route.id=ANY($3::uuid[]) AND route.org_id=$4 AND route.workspace_id=$5
        AND route.provider_config_id=$1 AND NOT route.enabled AND route.deleted_at IS NULL
        AND route.model=$6 AND route.allowed_roles=ARRAY[$7::text]) routes_bound,
    (SELECT count(*)::int FROM public.workspace_memberships member
      WHERE member.org_id=$4 AND member.workspace_id=$5
        AND member.user_id=ANY($8::uuid[]) AND member.role_id=$7::uuid AND member.status='active') actors_bound
    FROM public.ai_provider_configs config
    JOIN public.ai_provider_key_refs key_ref ON key_ref.id=config.key_ref_id
    JOIN public.synthetic_ai_campaign_authorities campaign ON campaign.provider_config_id=config.id
    WHERE config.id=$1`,[id.config,secretReference,[id.assessRoute,id.studioRoute],id.org,id.workspace,model,roles.author_role,[id.assess,id.studio]]),{
    status:'disabled',provider:'openai',endpoint_url:endpoint,default_model:model,model_allowlist:[model],
    allowed_modes:['pilot'],allowed_operations:['generate_document','test_provider_connection'],evidence_bound:true,
    budget_bound:true,key_status:'pending_review',resolver_type:'server_reference',secret_backend_kind:null,
    secret_bound:true,routes_bound:2,actors_bound:2,
  });

  const otherResume=await connect();
  const resumeRace=await Promise.allSettled([db,otherResume].map(client=>result(client,resume,resumeArgs)));
  assert.equal(resumeRace.filter(value=>value.status==='fulfilled').length,1,
    resumeRace.map(value=>value.status==='rejected'?value.reason.message:'fulfilled').join(' | '));
  assert.match(resumeRace.find(value=>value.status==='rejected').reason.message,/RESUME_NOT_AUTHORIZED|duplicate key/);
  const resumed=resumeRace.find(value=>value.status==='fulfilled').value.permit;
  assert.equal(resumed.campaignId,permit.campaignId);
  assert.equal(resumed.commit,resumeCommit);
  assert.equal(resumed.maxCalls,8); assert.equal(resumed.capUsdNanos,4e9);
  const resumedCampaign=await result(db,`SELECT id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,
    campaign_cap_usd_nanos::text cap,carried_usd_nanos::text carried,fixed_debit_usd_nanos::text debit,
    enabled,disabled_at,process_run_commit FROM public.synthetic_ai_campaign_authorities WHERE id=$1`,[permit.campaignId]);
  assert.deepEqual({...resumedCampaign,enabled:undefined,disabled_at:undefined,process_run_commit:undefined},
    {...initialCampaign,enabled:undefined,disabled_at:undefined,process_run_commit:undefined});
  assert.equal(resumedCampaign.enabled,true); assert.equal(resumedCampaign.disabled_at,null);
  assert.equal(resumedCampaign.process_run_commit,resumeCommit);
  const resumedRoutes=(await db.query(`SELECT id,version,allowed_roles,enabled FROM public.enterprise_ai_capability_routes
    WHERE id=ANY($1::uuid[]) ORDER BY id`,[[id.assessRoute,id.studioRoute]])).rows;
  assert.deepEqual(resumedRoutes.map(row=>({id:row.id,allowed_roles:row.allowed_roles})),
    initialRoutes.map(row=>({id:row.id,allowed_roles:row.allowed_roles})));
  assert.ok(resumedRoutes.every((row,index)=>row.enabled&&Number(row.version)===Number(initialRoutes[index].version)+2));
  assert.deepEqual(await result(db,`SELECT config.status,key_ref.status key_status,
    enterprise.provider_enabled enterprise_provider,studio.provider_enabled studio_provider
    FROM public.ai_provider_configs config JOIN public.ai_provider_key_refs key_ref ON key_ref.id=config.key_ref_id
    CROSS JOIN public.enterprise_intelligence_runtime_control enterprise
    CROSS JOIN public.studio_artifact_runtime_control studio WHERE config.id=$1`,[id.config]),
    {status:'active',key_status:'pending_review',enterprise_provider:false,studio_provider:false});
  assert.deepEqual(await result(db,`SELECT count(*)::int n,min(previous_commit) previous,min(resumed_commit) resumed,
    min(campaign_cap_usd_nanos)::text cap,min(maximum_effects)::int max_effects
    FROM public.process_evidence_provider_resume_windows WHERE campaign_id=$1`,[permit.campaignId]),
    {n:1,previous:commit,resumed:resumeCommit,cap:'4000000000',max_effects:8});
  await assert.rejects(db.query('UPDATE public.process_evidence_provider_resume_windows SET expires_at=expires_at WHERE campaign_id=$1',[permit.campaignId]),/RESUME_WINDOW_IMMUTABLE/);
  await assert.rejects(db.query(resume,resumeArgs),/RESUME_NOT_AUTHORIZED/);

  // Resume itself deliberately leaves both provider runtimes off. The
  // disposable controller transition below is separate and exists only to
  // exercise the retained admission/debit limits after that assertion.
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton');

  // Prove the original profile first, then roll it back so the retained
  // post-use fixture can model the actual 1 validation + 2 extraction history.
  await db.query('BEGIN');
  let savepointNumber=0;
  async function rejectedAtSavepoint(action,pattern) {
    const savepoint='expected_failure_'+(++savepointNumber);
    await db.query('SAVEPOINT '+savepoint);
    await assert.rejects(action(),pattern);
    await db.query('ROLLBACK TO SAVEPOINT '+savepoint);
    await db.query('RELEASE SAVEPOINT '+savepoint);
  }
  const receipt=await claim(db,id.operator,'provider.validate');
  const reserveArgs=[id.operator,id.org,id.workspace,authVersion,fingerprint,project,receipt.id,receipt.id,
    receipt.execution_token,receipt.execution_fence,null,id.config,id.key,'openai',endpoint,model,'provider.validate','f'.repeat(64),32768];
  const rpc='SELECT public.synthetic_ai_campaign_reserve_effect('+reserveArgs.map((_,i)=>'$'+(i+1)).join(',')+') permit';
  for (const [index,invalid] of [[1,randomUUID()],[2,randomUUID()],[10,randomUUID()],[11,randomUUID()],[15,'foreign-model']]) {
    const values=[...reserveArgs]; values[index]=invalid;
    await rejectedAtSavepoint(()=>db.query(rpc,values),/CAMPAIGN|AUTHORITY|BINDING/);
  }
  const reservation=(await result(db,rpc,reserveArgs)).permit;
  assert.ok(reservation.ownsProviderEffect);
  assert.equal((await result(db,rpc,reserveArgs)).permit.ownsProviderEffect,false);
  // No provider dispatch or refund. Even this unconsumed reservation occupies its slot.
  const next=await claim(db,id.operator,'provider.validate');
  const second=[...reserveArgs];second.splice(6,4,next.id,next.id,next.execution_token,next.execution_fence);
  await rejectedAtSavepoint(()=>db.query(rpc,second),/PERMIT_EXHAUSTED/);

  // Exercise the insert guard directly on the same durable relation. The
  // domain-specific RPC admission and fencing suites exercise production callers.
  async function debit(db, operation, actor) {
    const source=await claim(db,actor,'provider.validate');
    return db.query(`INSERT INTO public.synthetic_ai_campaign_effect_debits
      (campaign_id,receipt_id,effect_id,actor_id,org_id,workspace_id,authorization_version,execution_token,execution_fence,
       command_request_hash,effect_request_hash,maximum_output_tokens,operation,route_id,provider_config_id,key_ref_id,
       provider,endpoint,model,debit_usd_nanos)
      VALUES($1,$2,$3,$4,$5,$6,1,$7,1,$8,$8,100,$9,$10,$11,$12,'openai',$13,$14,471459200)`,
      [permit.campaignId,source.id,randomUUID(),actor,id.org,id.workspace,source.execution_token,'d'.repeat(64),operation,
       operation==='assess.evidence.extract'?id.assessRoute:id.studioRoute,id.config,id.key,endpoint,model]);
  }
  await rejectedAtSavepoint(()=>debit(db,'studio.document.generate',id.assess),/ACTOR_DENIED/);
  await debit(db,'assess.evidence.extract',id.assess);
  await debit(db,'assess.evidence.extract',id.assess);
  await rejectedAtSavepoint(()=>debit(db,'assess.evidence.extract',id.assess),/PERMIT_EXHAUSTED/);
  for(let i=0;i<5;i++)await debit(db,'studio.document.generate',id.studio);
  await rejectedAtSavepoint(()=>debit(db,'studio.document.generate',id.studio),/PERMIT_EXHAUSTED/);
  const slots=(await db.query(`SELECT operation,array_agg(process_run_slot::int ORDER BY process_run_slot) slots
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1 GROUP BY operation ORDER BY operation`,[permit.campaignId])).rows;
  assert.deepEqual(slots.map(row=>row.slots),[[1,2],[1],[1,2,3,4,5]]);
  assert.deepEqual(await result(db,`SELECT count(*)::int n,sum(debit_usd_nanos)::bigint::text reserved
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1`,[permit.campaignId]),{n:8,reserved:'3771673600'});
  await db.query('ROLLBACK');

  const rightsBeforeRenewal=await result(db,`SELECT role.permissions,
    (SELECT count(*)::int FROM public.organization_members member WHERE member.org_id=$2) organization_members,
    (SELECT count(*)::int FROM public.workspace_memberships member
      WHERE member.org_id=$2 AND member.workspace_id=$3) workspace_members
    FROM public.roles role WHERE role.id=$1`,[roles.operator_role,id.org,id.workspace]);

  // Build the retained real-use baseline with production reserve paths: one
  // validated provider and two settled extractions, all on the original ledger.
  const baselineValidationReceipt=await claim(db,id.operator,'provider.validate');
  const baselineValidationArgs=[id.operator,id.org,id.workspace,authVersion,fingerprint,project,
    baselineValidationReceipt.id,baselineValidationReceipt.id,baselineValidationReceipt.execution_token,
    baselineValidationReceipt.execution_fence,null,id.config,id.key,'openai',endpoint,model,
    'provider.validate','1'.repeat(64),32768];
  const baselineValidation=(await result(db,rpc,baselineValidationArgs)).permit;
  await db.query('UPDATE public.synthetic_ai_campaign_effect_debits SET consumed_at=now() WHERE id=$1',
    [baselineValidation.reservationId]);
  await db.query("UPDATE public.ai_provider_key_refs SET status='active' WHERE id=$1",[id.key]);
  await db.query('UPDATE public.ai_provider_configs SET last_validated_at=now() WHERE id=$1',[id.config]);
  const validatedAt=(await result(db,'SELECT last_validated_at FROM public.ai_provider_configs WHERE id=$1',[id.config])).last_validated_at;

  async function extraction(label) {
    const executionAuthVersion=Number((await result(db,`SELECT version FROM public.authorization_versions
      WHERE org_id=$1 AND user_id=$2`,[id.org,id.assess])).version);
    const source=await claim(db,id.assess,'transcript.assess.extract');
    const job=randomUUID();
    const effectHash=(label.charCodeAt(0).toString(16).padStart(2,'0')).repeat(32);
    await db.query(`INSERT INTO public.enterprise_ai_job_ledger(
      id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,actor_id,
      request_id,idempotency_key,status,approval_state,receipt_id,request_hash,execution_token,execution_fence,route_id)
      VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai',$5,'assess.evidence.extract','process-evidence-v1',$6,
      $7,$8,'running','review_required',$9,$10,$11,$12,$13)`,[
      job,id.org,id.workspace,id.config,model,id.assess,source.request_id,`process-evidence-${label}`,
      source.id,source.request_hash,source.execution_token,source.execution_fence,id.assessRoute,
    ]);
    const budget=(await result(db,`SELECT public.enterprise_ai_reserve_provider_budget(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai','assess.evidence.extract',$11,100,4096) value`,[
      id.assess,id.org,id.workspace,executionAuthVersion,source.id,job,source.execution_token,source.execution_fence,
      id.assessRoute,id.config,model,
    ])).value;
    assert.equal(budget.state,'reserved',JSON.stringify(budget));
    const campaignReservation=await result(db,`INSERT INTO public.synthetic_ai_campaign_effect_debits(
      campaign_id,receipt_id,effect_id,actor_id,org_id,workspace_id,authorization_version,
      execution_token,execution_fence,command_request_hash,effect_request_hash,maximum_output_tokens,
      operation,route_id,provider_config_id,key_ref_id,provider,endpoint,model,debit_usd_nanos,consumed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,4096,'assess.evidence.extract',$12,$13,$14,
        'openai',$15,$16,471459200,now()) RETURNING id reservation_id`,[
      permit.campaignId,source.id,job,id.assess,id.org,id.workspace,executionAuthVersion,
      source.execution_token,source.execution_fence,source.request_hash,effectHash,id.assessRoute,
      id.config,id.key,endpoint,model,
    ]);
    const settled=(await result(db,`SELECT public.enterprise_ai_settle_provider_budget_v2(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai','assess.evidence.extract',$11,$12,80,20,100) value`,[
      id.assess,id.org,id.workspace,executionAuthVersion,source.id,job,source.execution_token,source.execution_fence,
      id.assessRoute,id.config,model,budget.reservationId,
    ])).value;
    assert.equal(settled.state,'settled');
    return {source,job,budget,campaignReservation};
  }
  await extraction('baseline-one');
  await extraction('baseline-two');
  assert.deepEqual(await result(db,`SELECT count(*)::int calls,
    count(*) FILTER(WHERE consumed_at IS NOT NULL)::int consumed,
    sum(debit_usd_nanos)::bigint::text reserved FROM public.synthetic_ai_campaign_effect_debits
    WHERE campaign_id=$1`,[permit.campaignId]),{calls:3,consumed:3,reserved:'1414377600'});
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)',
    [id.operator,id.org,id.workspace,authVersion,fingerprint,project]);

  const renewalCommit='9'.repeat(40);
  const renewalExpiry=new Date(Date.now()+3600000);
  const bindingAttestedAt=new Date();
  const creditAttestedAt=new Date();
  const creditExpiry=new Date(Date.now()+3*86400000);
  const renewalRequest=randomUUID();
  const renewalArgs=[id.operator,id.org,id.workspace,authVersion,fingerprint,project,permit.campaignId,
    secretReference,'sha256:'+'2'.repeat(24),id.config,id.key,id.assessRoute,id.studioRoute,id.assess,id.studio,
    renewalCommit,renewalExpiry,renewalRequest,'post-use-window-1','sha256:'+'3'.repeat(64),bindingAttestedAt,
    'sha256:'+'4'.repeat(64),creditAttestedAt,creditExpiry,53_000_000_000];
  const renewSql='SELECT public.process_evidence_renew_provider_run_after_use('
    +renewalArgs.map((_,index)=>'$'+(index+1)).join(',')+') renewal';

  await db.query('SET ROLE authenticated');
  await assert.rejects(db.query(renewSql,renewalArgs),/permission denied/);
  await db.query('RESET ROLE');
  const staleRenewal=[...renewalArgs]; staleRenewal[3]=authVersion-1;
  await assert.rejects(db.query(renewSql,staleRenewal),/AUTHORIZATION_STALE/);
  const shortCredit=[...renewalArgs]; shortCredit[24]=4_000_000_000;
  await assert.rejects(db.query(renewSql,shortCredit),/POST_USE_HISTORY_UNSAFE/);
  const expiredCredit=[...renewalArgs]; expiredCredit[23]=new Date(Date.now()+1000);
  await assert.rejects(db.query(renewSql,expiredCredit),/POST_USE_BINDING_INVALID/);
  const badDigest=[...renewalArgs]; badDigest[19]='sha256:bad';
  await assert.rejects(db.query(renewSql,badDigest),/POST_USE_BINDING_INVALID/);
  await db.query('BEGIN');
  await db.query(`UPDATE public.enterprise_ai_budget_reservations SET state='released',release_reason=NULL,
    actual_input_tokens=NULL,actual_output_tokens=NULL,actual_total_tokens=NULL WHERE id=$1`,
    [(await result(db,`SELECT id FROM public.enterprise_ai_budget_reservations ORDER BY reserved_at LIMIT 1`)).id]);
  await assert.rejects(db.query(renewSql,renewalArgs),/POST_USE_HISTORY_UNSAFE/);
  await db.query('ROLLBACK');
  await db.query('BEGIN');
  await db.query(`UPDATE public.enterprise_ai_budget_reservations SET state='uncertain',failure_class='provider_request_failed',
    actual_input_tokens=NULL,actual_output_tokens=NULL,actual_total_tokens=NULL,settled_at=NULL WHERE id=$1`,
    [(await result(db,`SELECT id FROM public.enterprise_ai_budget_reservations ORDER BY reserved_at LIMIT 1`)).id]);
  await assert.rejects(db.query(renewSql,renewalArgs),/POST_USE_HISTORY_UNSAFE/);
  await db.query('ROLLBACK');

  const otherRenew=await connect();
  const renewalRace=await Promise.all([db,otherRenew].map(client=>result(client,renewSql,renewalArgs)));
  assert.deepEqual(renewalRace.map(value=>value.renewal.replayed).sort(),[false,true]);
  assert.equal(renewalRace[0].renewal.windowId,renewalRace[1].renewal.windowId);
  assert.equal(renewalRace[0].renewal.baselineCalls,3);
  assert.equal(renewalRace[0].renewal.maxCalls,13);
  assert.equal(renewalRace[0].renewal.maximumReservedUsdNanos,6128969600);
  assert.equal((await result(db,'SELECT last_validated_at FROM public.ai_provider_configs WHERE id=$1',[id.config])).last_validated_at.getTime(),validatedAt.getTime());
  assert.deepEqual(await result(db,`SELECT campaign.enabled,campaign.campaign_cap_usd_nanos::text cap,
    config.status,key_ref.status key_status,key_ref.safe_fingerprint,
    enterprise.provider_enabled enterprise_provider,studio.provider_enabled studio_provider
    FROM public.synthetic_ai_campaign_authorities campaign
    JOIN public.ai_provider_configs config ON config.id=campaign.provider_config_id
    JOIN public.ai_provider_key_refs key_ref ON key_ref.id=campaign.key_ref_id
    CROSS JOIN public.enterprise_intelligence_runtime_control enterprise
    CROSS JOIN public.studio_artifact_runtime_control studio WHERE campaign.id=$1`,[permit.campaignId]),{
    enabled:true,cap:'6128969600',status:'active',key_status:'active',safe_fingerprint:null,
    enterprise_provider:false,studio_provider:false,
  });
  assert.deepEqual(await result(db,`SELECT relation.relrowsecurity rls,relation.relforcerowsecurity force_rls,
    has_table_privilege('service_role',relation.oid,'SELECT') service_select,
    has_table_privilege('service_role',relation.oid,'INSERT') service_insert,
    has_table_privilege('authenticated',relation.oid,'SELECT') authenticated_select,
    has_table_privilege('anon',relation.oid,'SELECT') anon_select
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relname='process_evidence_provider_post_use_windows'`),
    {rls:true,force_rls:true,service_select:true,service_insert:false,authenticated_select:false,anon_select:false});
  await assert.rejects(db.query(`UPDATE public.process_evidence_provider_post_use_windows
    SET expires_at=expires_at WHERE id=$1`,[renewalRace[0].renewal.windowId]),/POST_USE_WINDOW_IMMUTABLE/);
  const replayMismatch=[...renewalArgs]; replayMismatch[24]=52_000_000_000;
  await assert.rejects(db.query(renewSql,replayMismatch),/POST_USE_REPLAY_MISMATCH/);

  // Cleanup can disable an otherwise healthy window before it spends another
  // slot. A fresh attested window may chain the same cumulative baseline; the
  // hard sequence ceiling still prevents unbounded renewal.
  await db.query('SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)',
    [id.operator,id.org,id.workspace,authVersion,fingerprint,project]);
  const zeroUseAttestedAt=new Date();
  const zeroUseRenewalArgs=[...renewalArgs];
  zeroUseRenewalArgs[16]=new Date(Date.now()+3600000);
  zeroUseRenewalArgs[17]=randomUUID();
  zeroUseRenewalArgs[18]='post-use-window-2-zero-use';
  zeroUseRenewalArgs[19]='sha256:'+'8'.repeat(64);
  zeroUseRenewalArgs[20]=zeroUseAttestedAt;
  zeroUseRenewalArgs[21]='sha256:'+'9'.repeat(64);
  zeroUseRenewalArgs[22]=zeroUseAttestedAt;
  const zeroUseRenewal=(await result(db,renewSql,zeroUseRenewalArgs)).renewal;
  assert.equal(zeroUseRenewal.sequence,2);
  assert.equal(zeroUseRenewal.baselineCalls,3);

  // A still-fresh validation permits extraction immediately; no paid
  // validation is forced merely because a new window was chained.
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton');
  await extraction('post-use-three');
  assert.equal((await result(db,`SELECT count(*)::int n FROM public.synthetic_ai_campaign_effect_debits
    WHERE operation='provider.validate'`)).n,1);
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)',
    [id.operator,id.org,id.workspace,authVersion,fingerprint,project]);

  const secondAttestedAt=new Date();
  const secondRenewalArgs=[...renewalArgs];
  secondRenewalArgs[16]=new Date(Date.now()+3600000);
  secondRenewalArgs[17]=randomUUID();
  secondRenewalArgs[18]='post-use-window-3';
  secondRenewalArgs[19]='sha256:'+'5'.repeat(64);
  secondRenewalArgs[20]=secondAttestedAt;
  secondRenewalArgs[21]='sha256:'+'6'.repeat(64);
  secondRenewalArgs[22]=secondAttestedAt;
  const secondRenewal=(await result(db,renewSql,secondRenewalArgs)).renewal;
  assert.equal(secondRenewal.sequence,3);
  assert.equal(secondRenewal.baselineCalls,4);
  assert.equal(secondRenewal.remainingValidation,1);
  assert.equal(secondRenewal.remainingExtractions,1);
  assert.deepEqual(await result(db,`SELECT count(*)::int windows,min(sequence_number)::int first,
    max(sequence_number)::int last,count(prior_resume_window_id)::int resume_links,
    count(prior_post_use_window_id)::int chain_links
    FROM public.process_evidence_provider_post_use_windows WHERE campaign_id=$1`,[permit.campaignId]),
    {windows:3,first:1,last:3,resume_links:1,chain_links:2});

  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton');
  const secondValidationReceipt=await claim(db,id.operator,'provider.validate');
  const secondValidationArgs=[...baselineValidationArgs];
  secondValidationArgs.splice(6,4,secondValidationReceipt.id,secondValidationReceipt.id,
    secondValidationReceipt.execution_token,secondValidationReceipt.execution_fence);
  secondValidationArgs[17]='7'.repeat(64);
  const secondValidation=(await result(db,rpc,secondValidationArgs)).permit;
  await db.query('UPDATE public.synthetic_ai_campaign_effect_debits SET consumed_at=now() WHERE id=$1',
    [secondValidation.reservationId]);
  await db.query('UPDATE public.ai_provider_configs SET last_validated_at=now() WHERE id=$1',[id.config]);
  await db.query('BEGIN');
  const thirdValidationReceipt=await claim(db,id.operator,'provider.validate');
  const thirdValidationArgs=[...secondValidationArgs];
  thirdValidationArgs.splice(6,4,thirdValidationReceipt.id,thirdValidationReceipt.id,
    thirdValidationReceipt.execution_token,thirdValidationReceipt.execution_fence);
  await assert.rejects(db.query(rpc,thirdValidationArgs),/PERMIT_EXHAUSTED/);
  await db.query('ROLLBACK');
  await extraction('post-use-four');
  await db.query('BEGIN');
  await assert.rejects(extraction('post-use-five'),/PERMIT_EXHAUSTED/);
  await db.query('ROLLBACK');
  for(let index=0;index<7;index++) await debit(db,'studio.document.generate',id.studio);
  await db.query('BEGIN');
  await assert.rejects(debit(db,'studio.document.generate',id.studio),/PERMIT_EXHAUSTED/);
  await db.query('ROLLBACK');
  assert.deepEqual(await result(db,`SELECT count(*)::int calls,sum(debit_usd_nanos)::bigint::text reserved
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1`,[permit.campaignId]),
    {calls:13,reserved:'6128969600'});
  const finalSlots=(await db.query(`SELECT operation,array_agg(process_run_slot::int ORDER BY process_run_slot) slots
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1 GROUP BY operation ORDER BY operation`,
    [permit.campaignId])).rows;
  assert.deepEqual(finalSlots.map(row=>row.slots),[[1,2,3,4],[1,2],[1,2,3,4,5,6,7]]);
  assert.deepEqual(await result(db,`SELECT role.permissions,
    (SELECT count(*)::int FROM public.organization_members member WHERE member.org_id=$2) organization_members,
    (SELECT count(*)::int FROM public.workspace_memberships member
      WHERE member.org_id=$2 AND member.workspace_id=$3) workspace_members
    FROM public.roles role WHERE role.id=$1`,[roles.operator_role,id.org,id.workspace]),rightsBeforeRenewal);
  await db.query("UPDATE public.synthetic_ai_campaign_authorities SET expires_at=clock_timestamp() WHERE id=$1",[permit.campaignId]);
  await db.query('BEGIN');
  await assert.rejects(debit(db,'studio.document.generate',id.studio),/PERMIT_INACTIVE/);
  await db.query('ROLLBACK');
  console.log('Process-evidence permit passed: original 1/2/5 profile, retained 1-validation/2-settled-extraction baseline, immutable three-window chain including zero-use renewal, fresh validation reuse, generic reserve compatibility, cumulative 2/4/7 and 13-call/USD 6.1289696 enforcement, replay/concurrency/expiry, and unchanged rights. Provider effects: zero.');
} finally {
  for(const db of clients) await db.end();
  if(created) await admin.query('DROP DATABASE '+name+' WITH (FORCE)');
  await admin.end();
}
