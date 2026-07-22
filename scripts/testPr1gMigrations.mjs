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
try{
 const version=await client.query('SHOW server_version_num');
 if(Number(version.rows[0].server_version_num)<160000) throw new Error('POSTGRESQL_16_REQUIRED');
 await client.query('BEGIN');
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
 await client.query(sql);
 await client.query("INSERT INTO public.profiles(id) VALUES('44444444-4444-4444-8444-444444444444') ON CONFLICT DO NOTHING");
 await client.query("INSERT INTO public.organizations(id) VALUES('22222222-2222-4222-8222-222222222222') ON CONFLICT DO NOTHING");
 await client.query("INSERT INTO public.workspaces(id,org_id) VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222') ON CONFLICT DO NOTHING");
 await client.query("INSERT INTO public.authorization_versions(org_id,user_id,version) VALUES('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',7) ON CONFLICT DO NOTHING");
 const rpc=await client.query("SELECT public.pr1g_execute_application_command('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','application.create',0,7,'idem-create',jsonb_build_object('applicationId','55555555-5555-4555-8555-555555555555','name','ERP','description','Created')) AS result");
 if(rpc.rows[0].result.resource.status!=='draft') throw new Error('CREATE_RPC_FAILED');
 const replay=await client.query("SELECT public.pr1g_execute_application_command('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111112','application.create',0,7,'idem-create',jsonb_build_object('applicationId','55555555-5555-4555-8555-555555555555','name','ERP','description','Created')) AS result");
 if(replay.rows[0].result.resource.id!==rpc.rows[0].result.resource.id) throw new Error('EXACT_REPLAY_FAILED');
 await client.query('ROLLBACK');
 console.log('PR 1G PostgreSQL 16 executable migration/RPC smoke passed: fresh migration, service-role RPC, exact replay, receipts and audit in one transaction.');
} catch (error) { await client.query('ROLLBACK').catch(()=>undefined); throw error; } finally { await client.end(); }
