import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.PR1B_MIGRATION_DATABASE_URL;
if (!adminUrl) { console.error('PR1B_MIGRATION_DATABASE_URL is required.'); process.exit(1); }
const names = ['fresh','upgrade','dirty','readonly','forwardfix'].map(x => `avalaos_pr1b_${x}_test`);
const createdRoles = [];
const migration = '20260712120000_pr1b_identity_rbac_rls_assess.sql';
const all = fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
const baseline = all.filter(x=>x!==migration);
const sql = n => fs.readFileSync(path.join('supabase/migrations',n),'utf8');
const fixture = fs.readFileSync('supabase/tests/migration-harness/pr1b_legacy_assess_fixture.sql','utf8');
const urlFor = name => { const u=new URL(adminUrl); u.pathname=`/${name}`; return u.toString(); };
const connect = async url => { const c=new Client({connectionString:url}); await c.connect(); return c; };
const tx = async (c,source) => { await c.query('BEGIN'); try { await c.query(source); await c.query('COMMIT'); } catch(e){ await c.query('ROLLBACK'); throw e; } };
const apply = async(c,list) => { for(const n of list) await tx(c,sql(n)); };
const bootstrap = c => tx(c,`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT null::uuid';`);

const assertSchema = async c => {
 const tables = await c.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN
 ('public.authorization_versions'::regclass,'public.assess_command_receipts'::regclass,'public.privileged_audit_events'::regclass) ORDER BY relname`);
 assert.equal(tables.rowCount,3); assert.ok(tables.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
 const caps=await c.query(`SELECT capability_key FROM capabilities ORDER BY 1`); assert.equal(caps.rowCount,5);
 const fks=await c.query(`SELECT count(*)::int n FROM pg_constraint WHERE conname LIKE 'pr1b_%workspace_org_fkey' OR conname LIKE 'pr1b_%workspace_org_fkey'`);
 assert.ok(fks.rows[0].n>=3);
};

const setUid = async(c,id) => c.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${id}'::uuid $$`);
const twoTenant = async c => {
 const a='11000000-0000-4000-8000-000000000001', org='11000000-0000-4000-8000-000000000010', ws='11000000-0000-4000-8000-000000000011';
 await setUid(c,a); await c.query('SET ROLE authenticated');
 try {
  const context=await c.query(`SELECT get_tenant_context($1,$2) value`,[org,ws]);
  assert.equal(context.rows[0].value.userId,a); assert.ok(context.rows[0].value.capabilities.includes('assess.finalize'));
  assert.equal((await c.query(`SELECT count(*)::int n FROM assessments`)).rows[0].n,1);
  assert.equal((await c.query(`SELECT count(*)::int n FROM assessments WHERE org_id='22000000-0000-4000-8000-000000000020'`)).rows[0].n,0);
  assert.equal((await c.query(`SELECT count(*)::int n FROM assessments`)).rows[0].n,1);
 } finally { await c.query('RESET ROLE'); }
 const before=(await c.query(`SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2`,[org,a])).rows[0].version;
 await c.query(`UPDATE workspace_memberships SET status='disabled' WHERE org_id=$1 AND user_id=$2`,[org,a]);
 const after=(await c.query(`SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2`,[org,a])).rows[0].version;
 assert.ok(BigInt(after)>BigInt(before));
 await setUid(c,a); await c.query('SET ROLE authenticated');
 try { assert.equal((await c.query(`SELECT count(*)::int n FROM assessments`)).rows[0].n,0); assert.equal((await c.query(`SELECT get_tenant_context($1,$2) value`,[org,ws])).rows[0].value,null); }
 finally { await c.query('RESET ROLE'); }
};

const admin=await connect(adminUrl);
try {
 for(const role of ['anon','authenticated']) if((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount===0){ await admin.query(`CREATE ROLE ${role} NOLOGIN`); createdRoles.push(role); }
 for(const n of names){ assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[n])).rowCount,0); await admin.query(`CREATE DATABASE ${n} TEMPLATE template0`); }
 const fresh=await connect(urlFor(names[0])); try { await bootstrap(fresh); await apply(fresh,all); await apply(fresh,[migration]); await assertSchema(fresh); console.log('PR 1B fresh and reapply scenarios passed.'); } finally { await fresh.end(); }
 const upgrade=await connect(urlFor(names[1])); try { await bootstrap(upgrade); await apply(upgrade,baseline); await tx(upgrade,fixture); await apply(upgrade,[migration]); await assertSchema(upgrade); await twoTenant(upgrade); console.log('PR 1B populated upgrade, authorization bump, and two-tenant non-disclosure scenarios passed.'); } finally { await upgrade.end(); }
 const dirty=await connect(urlFor(names[2])); try { await bootstrap(dirty); await apply(dirty,baseline); await tx(dirty,fixture); await dirty.query(`UPDATE assessments SET workspace_id=NULL WHERE id='11000000-0000-4000-8000-000000000014'`); await assert.rejects(apply(dirty,[migration]),/PR1B_PREFLIGHT_ASSESS_WORKSPACE_REQUIRED/); assert.equal((await dirty.query(`SELECT to_regclass('public.authorization_versions') value`)).rows[0].value,null); console.log('PR 1B dirty-data transaction failure scenario passed.'); } finally { await dirty.end(); }
 const ro=await connect(urlFor(names[3])); try { await bootstrap(ro); await apply(ro,all); await ro.query('BEGIN READ ONLY'); await ro.query('SELECT count(*) FROM capabilities'); await ro.query('ROLLBACK'); console.log('PR 1B read-only fallback scenario passed.'); } finally { await ro.end(); }
 const ff=await connect(urlFor(names[4])); try {
  await bootstrap(ff); await apply(ff,baseline); await tx(ff,fixture); await apply(ff,[migration]);
  const before=(await ff.query('SELECT count(*)::int n FROM assessments')).rows[0].n;
  await tx(ff,`ALTER TABLE public.assess_command_receipts ADD COLUMN IF NOT EXISTS forward_fix_marker text;`);
  assert.equal((await ff.query('SELECT count(*)::int n FROM assessments')).rows[0].n,before);
  assert.equal((await ff.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='assess_command_receipts' AND column_name='forward_fix_marker'`)).rows[0].n,1);
  console.log('PR 1B additive forward-fix preservation scenario passed.');
 } finally { await ff.end(); }
} finally {
 for(const n of names.reverse()) await admin.query(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`);
 for(const r of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${r}`);
 await admin.end();
}
console.log('PR 1B fresh, upgrade, dirty-failure, reapply, RLS, invalidation, read-only, and forward-fix migration checks passed.');
