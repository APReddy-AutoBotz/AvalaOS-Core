import fs from 'node:fs';
import { Client } from 'pg';

const sql = fs.readFileSync('supabase/migrations/20260721120000_pr1f_assess_v2_economics.sql','utf8');
const checks = [
  'capability_key,module,description','ON CONFLICT(capability_key)',
  'CREATE TABLE IF NOT EXISTS public.assess_v2_economic_versions','CREATE TABLE IF NOT EXISTS public.assess_v2_realized_outcomes','CREATE TABLE IF NOT EXISTS public.assess_v2_outcome_reviews','CREATE TABLE IF NOT EXISTS public.assess_v2_calibration_snapshots',
  'UNIQUE(id,case_id,workspace_id,org_id)','FOREIGN KEY(approved_review_id,case_id,decision_id,workspace_id,org_id)',
  'pr1f_calculate_economics','FORCE ROW LEVEL SECURITY','REVOKE ALL ON FUNCTION public.pr1f_execute_assess_v2_economics_command','GRANT EXECUTE ON FUNCTION public.pr1f_execute_assess_v2_economics_command',
  'public.pr1b_assert_command_authority','assessment_v2.economics.create','assessment_v2.economics.draft.upsert','assessment_v2.economics.finalize','assessment_v2.economics.review.resolve','assessment_v2.economics.revision.start','assessment_v2.outcomes.record','assessment_v2.outcomes.review','assessment_v2.calibration.snapshot.create',
  'PR1F_APPROVED_REVIEW_REQUIRED','PR1F_INVALID_LIFECYCLE','PR1F_INCOMPLETE_ECONOMICS','PR1F_READ_ONLY','PR1F_IDEMPOTENCY_CONFLICT','privileged_audit_events','assess.v2.calibration.write'
];
for (const check of checks) if (!sql.includes(check)) throw new Error(`PR 1F migration contract missing ${check}`);

if (!process.env.DATABASE_URL) {
  console.log('PR 1F migration contract checks passed (static). Set DATABASE_URL to execute PostgreSQL 16 migration/RLS/RPC checks.');
  process.exit(0);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const version = await client.query('show server_version_num');
  if (Number(version.rows[0].server_version_num) < 160000) throw new Error(`POSTGRESQL_16_REQUIRED: ${version.rows[0].server_version_num}`);
  await client.query('begin');
  await client.query('create schema if not exists public');
  await client.query('create extension if not exists pgcrypto');
  await client.query("do $$ begin create role anon; exception when duplicate_object then null; end $$;");
  await client.query("do $$ begin create role authenticated; exception when duplicate_object then null; end $$;");
  await client.query("do $$ begin create role service_role; exception when duplicate_object then null; end $$;");
  await client.query("create table if not exists public.capabilities(capability_key text primary key,module text not null,description text not null)");
  await client.query("create table if not exists public.assess_command_receipts(id uuid primary key default gen_random_uuid(),actor_id uuid,org_id uuid,workspace_id uuid,command_type text,idempotency_key text,request_id uuid,request_hash text,status text,response jsonb,unique(actor_id,org_id,workspace_id,command_type,idempotency_key))");
  await client.query("create table if not exists public.privileged_audit_events(id uuid primary key default gen_random_uuid(),org_id uuid,workspace_id uuid,actor_id uuid,request_id uuid,action text,resource_type text,resource_id uuid,outcome text,resource_version bigint)");
  await client.query("create table if not exists public.assess_v2_runtime_control(singleton boolean primary key default true,enabled boolean not null default true,read_only boolean not null default false)");
  await client.query("insert into public.assess_v2_runtime_control(singleton,enabled,read_only) values(true,true,false) on conflict(singleton) do update set enabled=true,read_only=false");
  await client.query("create table if not exists public.assess_v2_cases(id uuid not null,workspace_id uuid not null,org_id uuid not null,deleted_at timestamptz,primary key(id,workspace_id,org_id))");
  await client.query("create table if not exists public.assess_v2_decision_versions(id uuid not null,case_id uuid not null,workspace_id uuid not null,org_id uuid not null,source_version_id uuid not null,primary key(id,case_id,workspace_id,org_id))");
  await client.query("create table if not exists public.assess_v2_review_resolutions(id uuid not null,case_id uuid not null,decision_id uuid not null,workspace_id uuid not null,org_id uuid not null,source_version_id uuid not null,resolution text not null,resolved_at timestamptz not null default now(),primary key(id,case_id,decision_id,workspace_id,org_id))");
  await client.query("create or replace function public.has_workspace_capability(uuid,uuid,text) returns boolean language sql stable as $$ select true $$");
  await client.query("create or replace function public.pr1b_assert_command_authority(uuid,uuid,uuid,text,bigint) returns void language plpgsql as $$ begin if $4='invalid' then raise exception 'PR1F_INVALID_CAPABILITY'; end if; end $$");
  await client.query(sql);
  const tables = await client.query("select relrowsecurity, relforcerowsecurity from pg_class where relname in ('assess_v2_economic_versions','assess_v2_realized_outcomes','assess_v2_outcome_reviews') order by relname");
  if (tables.rows.some(row => !row.relrowsecurity || !row.relforcerowsecurity)) throw new Error('PR1F_RLS_NOT_FORCED');
  await client.query('rollback');
  console.log('PR 1F PostgreSQL 16 executable migration checks passed: fresh migration, forced RLS, private RPC ACL and append-only outcome review schema.');
} catch (error) {
  await client.query('rollback').catch(()=>{});
  throw error;
} finally {
  await client.end();
}
