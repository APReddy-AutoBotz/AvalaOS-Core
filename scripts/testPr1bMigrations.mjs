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
const migrations = fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
const baseline = migrations.slice(0,migrations.indexOf(migration));
const all = [...baseline,migration];
const sql = n => fs.readFileSync(path.join('supabase/migrations',n),'utf8');
const fixture = fs.readFileSync('supabase/tests/migration-harness/pr1b_legacy_assess_fixture.sql','utf8');
const urlFor = name => { const u=new URL(adminUrl); u.pathname=`/${name}`; return u.toString(); };
const connect = async url => { const c=new Client({connectionString:url}); await c.connect(); return c; };
const tx = async (c,source) => { await c.query('BEGIN'); try { await c.query(source); await c.query('COMMIT'); } catch(e){ await c.query('ROLLBACK'); throw e; } };
const apply = async(c,list) => { for(const n of list) await tx(c,sql(n)); };
const bootstrap = c => tx(c,`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);

const ACTOR='11000000-0000-4000-8000-000000000001', ORG='11000000-0000-4000-8000-000000000010';
const WS='11000000-0000-4000-8000-000000000011', PROCESS='11000000-0000-4000-8000-000000000013';
const EXISTING='11000000-0000-4000-8000-000000000014';
const aggregate={responses:{q1:4},metadata:{title:'validated'},evidenceItems:[],assumptions:[]};
const scores={scoreVersion:'assess-core-2026-05',overallScore:75,dimensionScores:{strategy:75}};
const authVersion=async c => Number((await c.query(`SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2`,[ORG,ACTOR])).rows[0].version);
const rpc={
 create:(c,id,key,version,request=`31000000-0000-4000-8000-${id.slice(-12)}`)=>c.query(`SELECT pr1b_create_assessment($1,$2,$3,$4,$5,$6,$7,$8) value`,[ACTOR,ORG,WS,PROCESS,id,request,key,version]),
 upsert:(c,id,payload,expected,key,version,request='32000000-0000-4000-8000-000000000001')=>c.query(`SELECT pr1b_upsert_assessment_responses($1,$2,$3,$4,$5,$6,$7,$8,$9) value`,[ACTOR,ORG,WS,id,payload,expected,request,key,version]),
 finalize:(c,id,payload,scoreVersion,expected,key,version,request='33000000-0000-4000-8000-000000000001')=>c.query(`SELECT pr1b_finalize_assessment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value`,[ACTOR,ORG,WS,id,payload,scoreVersion,expected,request,key,version]),
};
const value=r=>r.rows[0].value;
const trusted=async(c,operation)=>{ await c.query('SET ROLE service_role'); try { return await operation(); } finally { await c.query('RESET ROLE'); } };
const state=async(c,id)=> {
 const row=(await c.query(`SELECT version,status,responses,scores,score_version FROM assessments WHERE id=$1`,[id])).rows[0];
 return row ? {...row,version:Number(row.version)} : row;
};
const counts=async(c,id)=>({
 receipts:Number((await c.query(`SELECT count(*) n FROM assess_command_receipts WHERE response->'resource'->>'assessmentId'=$1`,[id])).rows[0].n),
 audits:Number((await c.query(`SELECT count(*) n FROM privileged_audit_events WHERE resource_id=$1`,[id])).rows[0].n),
});

const assertSchema = async c => {
 const tables = await c.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN
 ('public.authorization_versions'::regclass,'public.assess_command_receipts'::regclass,'public.privileged_audit_events'::regclass) ORDER BY relname`);
 assert.equal(tables.rowCount,3); assert.ok(tables.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
 assert.equal((await c.query(`SELECT count(*)::int n FROM capabilities`)).rows[0].n,5);
};

const assertPrivileges = async c => {
 const signatures=[
  'pr1b_create_assessment(uuid,uuid,uuid,uuid,uuid,uuid,text,bigint)',
  'pr1b_upsert_assessment_responses(uuid,uuid,uuid,uuid,jsonb,bigint,uuid,text,bigint)',
  'pr1b_finalize_assessment(uuid,uuid,uuid,uuid,jsonb,text,bigint,uuid,text,bigint)',
 ];
 for(const signature of signatures) {
  const publicExecute=await c.query(`SELECT COALESCE(bool_or(a.grantee=0 AND a.privilege_type='EXECUTE'),false) allowed
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure`,[signature]);
  assert.equal(publicExecute.rows[0].allowed,false,`PUBLIC executes ${signature}`);
  for(const role of ['anon','authenticated'])
   assert.equal((await c.query(`SELECT has_function_privilege($1,$2,'EXECUTE') allowed`,[role,signature])).rows[0].allowed,false,`${role} executes ${signature}`);
 }
 for(const signature of signatures) assert.equal((await c.query(`SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed`,[signature])).rows[0].allowed,true);
 const roleScopeHelper='pr1b_enforce_referenced_role_scope()';
 const helperPublicExecute=await c.query(`SELECT COALESCE(bool_or(a.grantee=0 AND a.privilege_type='EXECUTE'),false) allowed
   FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure`,[roleScopeHelper]);
 assert.equal(helperPublicExecute.rows[0].allowed,false,`PUBLIC executes ${roleScopeHelper}`);
 for(const role of ['anon','authenticated'])
  assert.equal((await c.query(`SELECT has_function_privilege($1,$2,'EXECUTE') allowed`,[role,roleScopeHelper])).rows[0].allowed,false,`${role} executes ${roleScopeHelper}`);
 assert.equal((await c.query(`SELECT has_function_privilege('authenticated','get_tenant_context(uuid,uuid)','EXECUTE') allowed`)).rows[0].allowed,true);
 for(const role of ['anon','authenticated']) {
  await c.query(`SET ROLE ${role}`);
  try {
   await assert.rejects(c.query(`SELECT pr1b_create_assessment($1,$2,$3,$4,$5,$6,$7,$8)`,[ACTOR,ORG,WS,PROCESS,'34000000-0000-4000-8000-000000000010','34000000-0000-4000-8000-000000000011','direct-create',1]),/permission denied/i);
   await assert.rejects(c.query(`SELECT pr1b_upsert_assessment_responses($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[ACTOR,ORG,WS,EXISTING,{bad:true},1,'34000000-0000-4000-8000-000000000012','direct-upsert',1]),/permission denied/i);
   await assert.rejects(c.query(`SELECT pr1b_finalize_assessment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[ACTOR,ORG,WS,EXISTING,{scoreVersion:'forged'},'forged',1,'34000000-0000-4000-8000-000000000013','direct-finalize',1]),/permission denied/i);
  }
  finally { await c.query('RESET ROLE'); }
 }
};

const mutationAcceptance = async (c,url) => {
 await assertPrivileges(c);
 await c.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`,[ACTOR]);
 let av=await authVersion(c);

 const ORG_ROLE='11000000-0000-4000-8000-000000000012';
 const WORKSPACE_ROLE='11000000-0000-4000-8000-000000000015';
 const OTHER_WS='11000000-0000-4000-8000-000000000016';
 await c.query(`INSERT INTO workspaces(id,org_id,name,slug) VALUES($1,$2,'A Other Workspace','other')`,[OTHER_WS,ORG]);
 await c.query(`INSERT INTO roles(id,org_id,workspace_id,name,slug,scope,permissions) VALUES($1,$2,$3,'Workspace Auditor','workspace-auditor','workspace','[]')`,[WORKSPACE_ROLE,ORG,WS]);
 await c.query(`INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,'assess.audit.read')`,[WORKSPACE_ROLE]);
 await c.query(`DELETE FROM role_capabilities WHERE role_id=$1 AND capability_key='assess.audit.read'`,[ORG_ROLE]);
 await c.query(`UPDATE workspace_memberships SET role_id=$1 WHERE org_id=$2 AND workspace_id=$3 AND user_id=$4`,[WORKSPACE_ROLE,ORG,WS,ACTOR]);
 av=await authVersion(c);

 const context=async()=> (await c.query(`SELECT get_tenant_context($1,$2) value`,[ORG,WS])).rows[0].value;
 const has=async capability => (await c.query(`SELECT has_workspace_capability($1,$2,$3) value`,[WS,ORG,capability])).rows[0].value;
 const privateAllows=async(capability,version)=>{
  version ??= await authVersion(c);
  try { await c.query(`SELECT pr1b_assert_command_authority($1,$2,$3,$4,$5)`,[ACTOR,ORG,WS,capability,version]); return true; }
  catch(e) { assert.match(e.message,/PR1B_(?:NOT_FOUND|AUTHORIZATION_STALE)/); return false; }
 };
 const snapshot=async(role,membershipTable)=>({
  role:(await c.query(`SELECT row_to_json(r) value FROM roles r WHERE id=$1`,[role])).rows[0].value,
  membership:(await c.query(`SELECT row_to_json(m) value FROM ${membershipTable} m WHERE role_id=$1`,[role])).rows[0].value,
  version:await authVersion(c), context:await context(), hasCreate:await has('assess.create'), hasAudit:await has('assess.audit.read'),
  privateCreate:await privateAllows('assess.create'), privateAudit:await privateAllows('assess.audit.read'),
 });
 const rejectedRoleMutation=async(role,membershipTable,statement,params=[])=>{
  const before=await snapshot(role,membershipTable);
  await c.query('BEGIN'); await c.query('SAVEPOINT rejected_role_mutation');
  await assert.rejects(c.query(statement,params),/PR1B_REFERENCED_ROLE_SCOPE_INVALID/);
  await c.query('ROLLBACK TO SAVEPOINT rejected_role_mutation'); await c.query('COMMIT');
  assert.deepEqual(await snapshot(role,membershipTable),before);
 };
 await rejectedRoleMutation(ORG_ROLE,'organization_members',`UPDATE roles SET scope='workspace',workspace_id=$1 WHERE id=$2`,[WS,ORG_ROLE]);
 await rejectedRoleMutation(ORG_ROLE,'organization_members',`UPDATE roles SET org_id='22000000-0000-4000-8000-000000000020' WHERE id=$1`,[ORG_ROLE]);
 await rejectedRoleMutation(ORG_ROLE,'organization_members',`UPDATE roles SET workspace_id=$1,scope='workspace' WHERE id=$2`,[WS,ORG_ROLE]);
 await rejectedRoleMutation(WORKSPACE_ROLE,'workspace_memberships',`UPDATE roles SET scope='organization',workspace_id=NULL WHERE id=$1`,[WORKSPACE_ROLE]);
 await rejectedRoleMutation(WORKSPACE_ROLE,'workspace_memberships',`UPDATE roles SET org_id='22000000-0000-4000-8000-000000000020' WHERE id=$1`,[WORKSPACE_ROLE]);
 await rejectedRoleMutation(WORKSPACE_ROLE,'workspace_memberships',`UPDATE roles SET workspace_id=$1 WHERE id=$2`,[OTHER_WS,WORKSPACE_ROLE]);

 assert.deepEqual((await context()).capabilities,['assess.audit.read','assess.create','assess.finalize','assess.read','assess.response.write']);
 assert.equal(await has('assess.audit.read'),true); assert.equal(await privateAllows('assess.audit.read'),true);
 const disableVersion=await authVersion(c);
 await c.query(`UPDATE roles SET status='disabled' WHERE id=$1`,[WORKSPACE_ROLE]);
 assert.equal(await authVersion(c),disableVersion+1); assert.equal(await has('assess.audit.read'),false);
 assert.equal((await context()).capabilities.includes('assess.audit.read'),false);
 assert.equal(await privateAllows('assess.audit.read'),false);
 await c.query(`UPDATE roles SET status='active' WHERE id=$1`,[WORKSPACE_ROLE]);
 assert.equal(await authVersion(c),disableVersion+2); assert.equal(await has('assess.audit.read'),true);
 assert.equal(await privateAllows('assess.audit.read'),true);

 await c.query(`UPDATE workspace_memberships SET role_id=NULL WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3`,[ORG,WS,ACTOR]);
 assert.equal(await has('assess.audit.read'),false); assert.equal(await has('assess.create'),true);
 assert.deepEqual((await context()).capabilities,['assess.create','assess.finalize','assess.read','assess.response.write']);
 await c.query(`UPDATE workspace_memberships SET role_id=$1 WHERE org_id=$2 AND workspace_id=$3 AND user_id=$4`,[WORKSPACE_ROLE,ORG,WS,ACTOR]);

 await c.query('ALTER TABLE roles DISABLE TRIGGER trg_pr1b_referenced_role_scope');
 try {
  await c.query(`UPDATE roles SET scope='workspace',workspace_id=$1 WHERE id=$2`,[WS,ORG_ROLE]);
  assert.equal(await has('assess.create'),false);
  assert.equal((await context()).capabilities.includes('assess.create'),false);
  assert.equal(await privateAllows('assess.create'),false);
 } finally {
  await c.query(`UPDATE roles SET scope='organization',workspace_id=NULL,org_id=$1 WHERE id=$2`,[ORG,ORG_ROLE]);
  await c.query('ALTER TABLE roles ENABLE TRIGGER trg_pr1b_referenced_role_scope');
 }
 assert.equal(await has('assess.create'),true);
 av=await authVersion(c);
 console.log('PR 1B referenced-role mutation, explicit provenance, revocation/re-enable, roleless inheritance, and legacy-bypass scenarios passed.');

 const forgedBefore=await state(c,EXISTING);
 assert.equal(value(await trusted(c,()=>rpc.finalize(c,EXISTING,{scoreVersion:'forged',overallScore:100},'forged',1,'forged-score',av))).errorCode,'INVALID_SCORE_VERSION');
 assert.deepEqual(await state(c,EXISTING),forgedBefore);
 assert.equal(value(await trusted(c,()=>rpc.upsert(c,EXISTING,{responses:'malformed'},1,'malformed',av))).errorCode,'INVALID_COMMAND');
 assert.deepEqual(await state(c,EXISTING),forgedBefore);

 const created='41000000-0000-4000-8000-000000000001';
 const createResult=value(await trusted(c,()=>rpc.create(c,created,'create-once',av))); assert.equal(createResult.outcome,'committed');
 const replay=value(await trusted(c,()=>rpc.create(c,created,'create-once',av))); assert.deepEqual(replay,createResult);
 assert.equal(value(await trusted(c,()=>rpc.create(c,'41000000-0000-4000-8000-000000000002','create-once',av))).errorCode,'IDEMPOTENCY_CONFLICT');
 assert.deepEqual(await counts(c,created),{receipts:1,audits:1});

 const upsert=value(await trusted(c,()=>rpc.upsert(c,created,aggregate,1,'upsert-once',av))); assert.equal(upsert.resource.version,2);
 assert.equal((await state(c,created)).version,2);
 const beforeConflict=await state(c,created), beforeConflictCounts=await counts(c,created);
 assert.equal(value(await trusted(c,()=>rpc.upsert(c,created,aggregate,1,'version-conflict',av))).errorCode,'VERSION_CONFLICT');
 assert.deepEqual(await state(c,created),beforeConflict); assert.deepEqual(await counts(c,created),beforeConflictCounts);
 const finalized=value(await trusted(c,()=>rpc.finalize(c,created,scores,'assess-core-2026-05',2,'finalize',av)));
 assert.equal(finalized.resource.scoreVersion,'assess-core-2026-05'); assert.equal((await state(c,created)).score_version,'assess-core-2026-05');

 const concurrent='42000000-0000-4000-8000-000000000001';
 const c2=await connect(url); try {
  const [one,two]=await Promise.all([trusted(c,()=>rpc.create(c,concurrent,'concurrent',av)),trusted(c2,()=>rpc.create(c2,concurrent,'concurrent',av))]);
  assert.deepEqual(value(one),value(two)); assert.deepEqual(await counts(c,concurrent),{receipts:1,audits:1});
 } finally { await c2.end(); }

 assert.equal(value(await trusted(c,()=>rpc.upsert(c,'22000000-0000-4000-8000-000000000025',aggregate,1,'cross-tenant',av))).errorCode,'NOT_FOUND');
 assert.equal(value(await trusted(c,()=>rpc.upsert(c,'43000000-0000-4000-8000-000000000099',aggregate,1,'missing',av))).errorCode,'NOT_FOUND');

 await c.query(`CREATE FUNCTION public.pr1b_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'forced database failure detail'; END$$`);
 await c.query(`CREATE TRIGGER pr1b_test_audit_failure BEFORE INSERT ON privileged_audit_events FOR EACH ROW EXECUTE FUNCTION public.pr1b_test_fail()`);
 const failId='43000000-0000-4000-8000-000000000001';
 const unavailable=value(await trusted(c,()=>rpc.create(c,failId,'forced-audit',av))); assert.deepEqual(unavailable,{ok:false,errorCode:'COMMAND_UNAVAILABLE'});
 assert.equal((await c.query(`SELECT count(*)::int n FROM assessments WHERE id=$1`,[failId])).rows[0].n,0); assert.deepEqual(await counts(c,failId),{receipts:0,audits:0});
 await c.query('DROP TRIGGER pr1b_test_audit_failure ON privileged_audit_events');

 await c.query(`CREATE TRIGGER pr1b_test_receipt_failure BEFORE UPDATE ON assess_command_receipts FOR EACH ROW EXECUTE FUNCTION public.pr1b_test_fail()`);
 const receiptFail='43000000-0000-4000-8000-000000000002';
 assert.equal(value(await trusted(c,()=>rpc.create(c,receiptFail,'forced-receipt',av))).errorCode,'COMMAND_UNAVAILABLE');
 assert.equal((await c.query(`SELECT count(*)::int n FROM assessments WHERE id=$1`,[receiptFail])).rows[0].n,0); assert.deepEqual(await counts(c,receiptFail),{receipts:0,audits:0});
 await c.query('DROP TRIGGER pr1b_test_receipt_failure ON assess_command_receipts'); await c.query('DROP FUNCTION public.pr1b_test_fail()');

 await c.query(`UPDATE workspace_memberships SET status='disabled' WHERE org_id=$1 AND user_id=$2`,[ORG,ACTOR]);
 assert.ok(await authVersion(c)>av); // revocation occurred after the simulated Edge authority read
 const revokeId='43000000-0000-4000-8000-000000000003';
 assert.equal(value(await trusted(c,()=>rpc.create(c,revokeId,'revoked',av))).errorCode,'NOT_FOUND');
 assert.equal((await c.query(`SELECT count(*)::int n FROM assessments WHERE id=$1`,[revokeId])).rows[0].n,0);
 console.log('PR 1B real RPC privilege, adversarial, idempotency, concurrency, rollback, revocation, and non-disclosure scenarios passed.');
};

const admin=await connect(adminUrl);
try {
 for(const [role,attrs] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']]) if((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount===0){ await admin.query(`CREATE ROLE ${role} ${attrs}`); createdRoles.push(role); }
 for(const n of names){ assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[n])).rowCount,0); await admin.query(`CREATE DATABASE ${n} TEMPLATE template0`); }
 const fresh=await connect(urlFor(names[0])); try { await bootstrap(fresh); await apply(fresh,all); await apply(fresh,[migration]); await assertSchema(fresh); console.log('PR 1B fresh and reapply scenarios passed.'); } finally { await fresh.end(); }
 const upgrade=await connect(urlFor(names[1])); try { await bootstrap(upgrade); await apply(upgrade,baseline); await tx(upgrade,fixture); await apply(upgrade,[migration]); await assertSchema(upgrade); await mutationAcceptance(upgrade,urlFor(names[1])); console.log('PR 1B populated upgrade scenario passed.'); } finally { await upgrade.end(); }
 const dirty=await connect(urlFor(names[2])); try {
  await bootstrap(dirty); await apply(dirty,baseline); await tx(dirty,fixture);
  await dirty.query(`UPDATE assessments SET workspace_id=NULL WHERE id=$1`,[EXISTING]);
  await assert.rejects(apply(dirty,[migration]),/PR1B_PREFLIGHT_ASSESS_WORKSPACE_REQUIRED/);
  assert.equal((await dirty.query(`SELECT to_regclass('public.authorization_versions') value`)).rows[0].value,null);
  await dirty.query(`UPDATE assessments SET workspace_id=$1 WHERE id=$2`,[WS,EXISTING]);
  await dirty.query(`UPDATE roles SET scope='workspace',workspace_id=$1 WHERE id='11000000-0000-4000-8000-000000000012'`,[WS]);
  await assert.rejects(apply(dirty,[migration]),/PR1B_PREFLIGHT_ORGANIZATION_MEMBERSHIP_ROLE_INVALID/);
  await dirty.query(`UPDATE roles SET scope='organization',workspace_id=NULL WHERE id='11000000-0000-4000-8000-000000000012'`);
  await dirty.query(`UPDATE organization_members SET role_id='22000000-0000-4000-8000-000000000023' WHERE org_id=$1 AND user_id=$2`,[ORG,ACTOR]);
  await assert.rejects(apply(dirty,[migration]),/PR1B_PREFLIGHT_ORGANIZATION_MEMBERSHIP_ROLE_INVALID/);
  await dirty.query(`UPDATE organization_members SET role_id='11000000-0000-4000-8000-000000000012' WHERE org_id=$1 AND user_id=$2`,[ORG,ACTOR]);
  await dirty.query(`UPDATE roles SET status='disabled' WHERE id='11000000-0000-4000-8000-000000000012'`);
  await assert.rejects(apply(dirty,[migration]),/PR1B_PREFLIGHT_ORGANIZATION_MEMBERSHIP_ROLE_INVALID/);
  await dirty.query(`UPDATE roles SET status='active' WHERE id='11000000-0000-4000-8000-000000000012'`);
  await dirty.query(`UPDATE workspace_memberships SET role_id='22000000-0000-4000-8000-000000000023' WHERE org_id=$1 AND user_id=$2`,[ORG,ACTOR]);
  await assert.rejects(apply(dirty,[migration]),/PR1B_PREFLIGHT_WORKSPACE_MEMBERSHIP_ROLE_INVALID/);
  console.log('PR 1B dirty Assess, organization-role, workspace-role, foreign-role, inactive-role, and roleless-upgrade preflight scenarios passed.');
 } finally { await dirty.end(); }
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
console.log('PR 1B complete disposable PostgreSQL acceptance matrix passed.');
