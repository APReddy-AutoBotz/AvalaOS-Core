import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const adminUrl=process.env.PR1E_MIGRATION_DATABASE_URL;if(!adminUrl){console.error('PR1E_MIGRATION_DATABASE_URL is required.');process.exit(1);}
const {Client}=pg;const dbName='avalaos_pr1e_migration_test';const createdRoles=[];
const urlFor=name=>{const u=new URL(adminUrl);u.pathname=`/${name}`;return u.toString()};
const connect=async url=>{const c=new Client({connectionString:url});await c.connect();return c};
const tx=async(c,sql)=>{await c.query('BEGIN');try{await c.query(sql);await c.query('COMMIT')}catch(error){await c.query('ROLLBACK');throw error}};
let admin;let test;
try{
  admin=await connect(adminUrl);
  for(const [role,attrs] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']]){if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount){await admin.query(`CREATE ROLE ${role} ${attrs}`);createdRoles.push(role)}}
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);await admin.query(`CREATE DATABASE ${dbName}`);test=await connect(urlFor(dbName));
  await tx(test,"CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  const migrations=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
  for(const name of migrations)await tx(test,fs.readFileSync(path.join('supabase/migrations',name),'utf8'));
  for(const table of ['assess_v2_review_assignments','assess_v2_evidence_attestations','assess_v2_review_resolutions','assess_v2_govern_resolutions','assess_v2_studio_handoffs','assess_v2_studio_sources']){
    assert.equal((await test.query('SELECT relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',[`public.${table}`])).rows[0].relforcerowsecurity,true);
    assert.equal((await test.query("SELECT has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') allowed",[`public.${table}`])).rows[0].allowed,false);
  }
  for(const fn of ['pr1e_assign_assess_v2_review','pr1e_attest_assess_v2_evidence','pr1e_resolve_assess_v2_review','pr1e_start_assess_v2_revision','pr1e_resolve_assess_v2_govern','pr1e_handoff_assess_v2_studio']){
    const signature=`public.${fn}(uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)`;
    assert.equal((await test.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,false);
    assert.equal((await test.query("SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true);
  }
  console.log('PR 1E PostgreSQL 16 fresh/ordered-upgrade schema, forced-RLS, and private-RPC ACL tests passed.');
}finally{if(test)await test.end().catch(()=>{});if(admin){await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(()=>{});for(const role of createdRoles.reverse())await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(()=>{});await admin.end().catch(()=>{})}}
