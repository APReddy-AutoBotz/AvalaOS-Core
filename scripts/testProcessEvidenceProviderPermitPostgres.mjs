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
const id = Object.fromEntries(['operator','assess','studio','org','workspace','config','key','assessRoute','studioRoute'].map(k => [k, randomUUID()]));
const model = 'gpt-4.1-mini-2025-04-14';
const endpoint = 'https://api.openai.com';
const commit = 'b'.repeat(40);
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
      catch (error) { await db.query('ROLLBACK'); throw new Error(filename+': '+error.message); }
    });
  }
}
async function claim(db, actor, type) {
  const request = randomUUID(), token = randomUUID(), hash = 'd'.repeat(64);
  return result(db,`SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*`,
    [actor,id.org,id.workspace,type,'test-'+request,request,hash,token]);
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
    (SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=t.id AND preset='author') author_role
    FROM public.synthetic_admin_targets t WHERE id=$1`,[target.targetId]);
  for (const [actor,label] of [[id.assess,'assess'],[id.studio,'studio']]) {
    const email = label+'@avalaos.invalid';
    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[actor,email]);
    await db.query("INSERT INTO public.profiles(id,email,status) VALUES($1,$2,'active')",[actor,email]);
    await db.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status,joined_at,created_by) VALUES($1,$2,$3,'active',now(),$4)",[id.org,actor,roles.member_role,id.operator]);
    await db.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status,joined_at,created_by) VALUES($1,$2,$3,$4,'active',now(),$5)",[id.org,id.workspace,actor,roles.author_role,id.operator]);
  }
  const authVersion = Number((await result(db,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[id.org,id.operator])).version);
  const args=[id.operator,id.org,id.workspace,authVersion,fingerprint,project,'sha256:'+'c'.repeat(64),
    'AVALA_PROVIDER_SECRET_OPENAI_'+id.org.replaceAll('-','').toUpperCase()+'_TEST',id.config,id.key,id.assessRoute,id.studioRoute,
    new Date(Date.now()+3600000),commit,id.assess,id.studio];
  const open='SELECT public.process_evidence_open_provider_run('+args.map((_,i)=>'$'+(i+1)).join(',')+') permit';
  await db.query('SET ROLE authenticated');
  await assert.rejects(db.query(open,args),/permission denied/);
  await db.query('RESET ROLE');
  await assert.rejects(db.query(open,[...args.slice(0,-1),id.assess]),/RUN_BINDING_INVALID/);
  const permit=(await result(db,open,args)).permit;
  assert.equal(permit.maxCalls,8); assert.equal(permit.capUsdNanos,4e9); assert.equal(permit.carriedUsdNanos,0);
  const receipt=await claim(db,id.operator,'provider.validate');
  const reserveArgs=[id.operator,id.org,id.workspace,authVersion,fingerprint,project,receipt.id,receipt.id,
    receipt.execution_token,receipt.execution_fence,null,id.config,id.key,'openai',endpoint,model,'provider.validate','f'.repeat(64),32768];
  const rpc='SELECT public.synthetic_ai_campaign_reserve_effect('+reserveArgs.map((_,i)=>'$'+(i+1)).join(',')+') permit';
  for (const [index,invalid] of [[1,randomUUID()],[2,randomUUID()],[10,randomUUID()],[11,randomUUID()],[15,'foreign-model']]) {
    const values=[...reserveArgs]; values[index]=invalid;
    await assert.rejects(db.query(rpc,values),/CAMPAIGN|AUTHORITY|BINDING/);
  }
  const reservation=(await result(db,rpc,reserveArgs)).permit;
  assert.ok(reservation.ownsProviderEffect);
  assert.equal((await result(db,rpc,reserveArgs)).permit.ownsProviderEffect,false);
  // No provider dispatch or refund. Even this unconsumed reservation occupies its slot.
  const next=await claim(db,id.operator,'provider.validate');
  const second=[...reserveArgs];second.splice(6,4,next.id,next.id,next.execution_token,next.execution_fence);
  await assert.rejects(db.query(rpc,second),/PERMIT_EXHAUSTED/);

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
  await assert.rejects(debit(db,'studio.document.generate',id.assess),/ACTOR_DENIED/);
  await debit(db,'assess.evidence.extract',id.assess);
  const other=await connect();
  const race=await Promise.allSettled([db,other].map(c=>debit(c,'assess.evidence.extract',id.assess)));
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  assert.match(race.find(r=>r.status==='rejected').reason.message,/PERMIT_EXHAUSTED/);
  for(let i=0;i<5;i++)await debit(db,'studio.document.generate',id.studio);
  await assert.rejects(debit(db,'studio.document.generate',id.studio),/PERMIT_EXHAUSTED/);
  const slots=(await db.query(`SELECT operation,array_agg(process_run_slot::int ORDER BY process_run_slot) slots
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1 GROUP BY operation ORDER BY operation`,[permit.campaignId])).rows;
  assert.deepEqual(slots.map(row=>row.slots),[[1,2],[1],[1,2,3,4,5]]);
  assert.deepEqual(await result(db,`SELECT count(*)::int n,sum(debit_usd_nanos)::bigint::text reserved
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1`,[permit.campaignId]),{n:8,reserved:'3771673600'});
  await db.query("UPDATE public.synthetic_ai_campaign_authorities SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[permit.campaignId]);
  await assert.rejects(db.query('UPDATE public.synthetic_ai_campaign_effect_debits SET consumed_at=now() WHERE id=$1',[reservation.reservationId]),/PERMIT_INACTIVE/);
  console.log('Process-evidence permit passed: empty target, actor/tenant/model, 1/2/5 limits, concurrent reservations, replay without redispatch, expiry and eight durable debits below USD 4. Provider effects: zero.');
} finally {
  for(const db of clients) await db.end();
  if(created) await admin.query('DROP DATABASE '+name+' WITH (FORCE)');
  await admin.end();
}
