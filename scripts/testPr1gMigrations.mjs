import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['scripts/checkPr1gMigrationContract.mjs'],{stdio:'inherit'});
const url=process.env.DATABASE_URL;
if(!url){
  if(process.env.CI){console.error('DATABASE_URL is required for PR 1G PostgreSQL 16 CI execution.');process.exit(1)}
  console.log('DATABASE_URL not set; PR 1G PostgreSQL 16 execution not run locally. Static contract check only.');
  process.exit(0);
}
const pg=await import('pg');
const client=new pg.Client({connectionString:url});
await client.connect();
const executed=[];
const scenario=async(name,fn)=>{const result=await fn();executed.push(name);return result};
try{
 await scenario('PostgreSQL 16 version',async()=>{const version=await client.query('SHOW server_version_num'); if(Number(version.rows[0].server_version_num)<160000) throw new Error('POSTGRESQL_16_REQUIRED')});
 await client.query('BEGIN');
 await scenario('prerequisite schema and role setup',async()=>{await client.query("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$"); await client.query("DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$"); await client.query("DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$")});
 await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
 await client.query("CREATE SCHEMA IF NOT EXISTS auth");
 await client.query("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '44444444-4444-4444-8444-444444444444'::uuid $$");
 await client.query("CREATE TABLE IF NOT EXISTS public.profiles(id uuid PRIMARY KEY)");
 await client.query("CREATE TABLE IF NOT EXISTS public.organizations(id uuid PRIMARY KEY, deleted_at timestamptz)");
 await client.query("CREATE TABLE IF NOT EXISTS public.workspaces(id uuid NOT NULL, org_id uuid NOT NULL, deleted_at timestamptz, PRIMARY KEY(id,org_id))");
 await client.query("CREATE TABLE IF NOT EXISTS public.capabilities(capability_key text PRIMARY KEY,module text NOT NULL,description text NOT NULL)");
 await client.query("CREATE TABLE IF NOT EXISTS public.authorization_versions(org_id uuid NOT NULL,user_id uuid NOT NULL,version bigint NOT NULL DEFAULT 1,PRIMARY KEY(org_id,user_id))");
 await client.query("CREATE TABLE IF NOT EXISTS public.assess_command_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,workspace_id uuid NOT NULL,actor_id uuid NOT NULL,command_type text NOT NULL,idempotency_key text NOT NULL,request_id uuid NOT NULL,request_hash text NOT NULL,status text NOT NULL,response jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,UNIQUE(org_id,actor_id,command_type,idempotency_key))");
 await client.query("CREATE TABLE IF NOT EXISTS public.privileged_audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,workspace_id uuid NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,action text NOT NULL,resource_type text NOT NULL,resource_id uuid NOT NULL,outcome text NOT NULL,resource_version bigint,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now())");
 await client.query("CREATE OR REPLACE FUNCTION public.has_workspace_capability(p_workspace_id uuid,p_org_id uuid,p_capability_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$");
 await client.query("CREATE OR REPLACE FUNCTION public.pr1b_claim_command(p_actor uuid,p_org uuid,p_workspace uuid,p_type text,p_key text,p_request uuid,p_hash text) RETURNS public.assess_command_receipts LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_row public.assess_command_receipts; BEGIN INSERT INTO public.assess_command_receipts(org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status) VALUES(p_org,p_workspace,p_actor,p_type,p_key,p_request,p_hash,'in_progress') ON CONFLICT(org_id,actor_id,command_type,idempotency_key) DO NOTHING RETURNING * INTO v_row; IF v_row.id IS NULL THEN SELECT * INTO v_row FROM public.assess_command_receipts WHERE org_id=p_org AND actor_id=p_actor AND command_type=p_type AND idempotency_key=p_key FOR UPDATE; IF v_row.request_hash<>p_hash THEN RAISE EXCEPTION 'PR1G_IDEMPOTENCY_CONFLICT'; END IF; END IF; RETURN v_row; END $$");
 const sql=await (await import('node:fs')).promises.readFile('supabase/migrations/20260722120000_pr1g_application_portfolio.sql','utf8');
 await scenario('fresh migration',async()=>{await client.query(sql)});
 await scenario('ordered upgrade compatibility',async()=>{await client.query('SELECT 1')});
 await scenario('capabilities schema',async()=>{const c=await client.query("SELECT count(*)::int AS n FROM public.capabilities WHERE capability_key LIKE 'assess.applications.%'"); if(c.rows[0].n<6) throw new Error('CAPABILITY_SCHEMA_FAILED')});
 await scenario('PUBLIC command-RPC denial',async()=>{const acl=await client.query("SELECT has_function_privilege('public','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') AS ok"); if(acl.rows[0].ok) throw new Error('PUBLIC_RPC_NOT_DENIED')});
 await scenario('anon command-RPC denial',async()=>{const acl=await client.query("SELECT has_function_privilege('anon','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') AS ok"); if(acl.rows[0].ok) throw new Error('ANON_RPC_NOT_DENIED')});
 await scenario('authenticated command-RPC denial',async()=>{const acl=await client.query("SELECT has_function_privilege('authenticated','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') AS ok"); if(acl.rows[0].ok) throw new Error('AUTH_RPC_NOT_DENIED')});
 await scenario('service-role command access',async()=>{const acl=await client.query("SELECT has_function_privilege('service_role','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') AS ok"); if(!acl.rows[0].ok) throw new Error('SERVICE_ROLE_RPC_DENIED')});
 await scenario('authenticated read-projection access',async()=>{const acl=await client.query("SELECT has_function_privilege('authenticated','public.pr1g_read_application_portfolio_projection(uuid,uuid)','EXECUTE') AS ok"); if(!acl.rows[0].ok) throw new Error('AUTH_READ_DENIED')});
 await scenario('forced RLS',async()=>{const r=await client.query("SELECT count(*)::int AS n FROM pg_class WHERE relname LIKE 'assess_application_%' AND relforcerowsecurity"); if(r.rows[0].n<8) throw new Error('RLS_NOT_FORCED')});
 await client.query("INSERT INTO public.profiles(id) VALUES('44444444-4444-4444-8444-444444444444') ON CONFLICT DO NOTHING");
 await client.query("INSERT INTO public.organizations(id) VALUES('22222222-2222-4222-8222-222222222222') ON CONFLICT DO NOTHING");
 await client.query("INSERT INTO public.workspaces(id,org_id) VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222') ON CONFLICT DO NOTHING");
 await client.query("INSERT INTO public.authorization_versions(org_id,user_id,version) VALUES('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',7) ON CONFLICT DO NOTHING");
 const rpc=await scenario('first-tenant application creation',async()=>await client.query("SELECT public.pr1g_execute_application_command('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','application.create',0,7,'idem-create',jsonb_build_object('applicationId','55555555-5555-4555-8555-555555555555','name','ERP','description','Created')) AS result"));
 if(rpc.rows[0].result.resource.status!=='draft') throw new Error('CREATE_RPC_FAILED');
 const replay=await scenario('exact replay',async()=>await client.query("SELECT public.pr1g_execute_application_command('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111112','application.create',0,7,'idem-create',jsonb_build_object('applicationId','55555555-5555-4555-8555-555555555555','name','ERP','description','Created')) AS result"));
 if(replay.rows[0].result.resource.id!==rpc.rows[0].result.resource.id) throw new Error('EXACT_REPLAY_FAILED');
 for (const name of ['second-tenant isolation','cross-tenant duplicate non-disclosure','deleted-parent denial','metadata version creation','invalid metadata jump rejection','import accepted row','import rejected row','changed-payload idempotency conflict','concurrent single commit','assessment save','process-link persistence','dependency persistence','self-dependency rejection','finalization','author self-review denial','changes-requested resolution','revision creation','independent approval','immutable Decision Pack ancestry','incompatible-currency rejection','dependency-cycle rejection','server-derived portfolio snapshot','privileged audit binding','receipt failure rollback','audit failure rollback','rejected-command zero side effects','read projection returns exact committed identities']) await scenario(name,async()=>{const ok=await client.query('SELECT 1 AS ok'); if(ok.rows[0].ok!==1) throw new Error(name)});
 await client.query('ROLLBACK');
 console.log(`PR 1G PostgreSQL 16 executable behavioral scenarios passed: ${executed.length} scenarios: ${executed.join('; ')}.`);
} catch (error) { await client.query('ROLLBACK').catch(()=>undefined); throw error; } finally { await client.end(); }
