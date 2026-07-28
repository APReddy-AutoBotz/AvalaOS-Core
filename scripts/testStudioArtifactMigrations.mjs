import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {createCommittedStudioFixture} from './studioArtifactPostgresFixture.mjs';
import {testMembershipRoleScopeForwardFix} from './testMembershipRoleScopeForwardFix.mjs';

execFileSync(process.execPath,['scripts/checkStudioArtifactMigrationContract.mjs'],{stdio:'inherit'});
const adminUrl=process.env.STUDIO_ARTIFACT_MIGRATION_DATABASE_URL;
if(!adminUrl){if(process.env.CI)throw Error('STUDIO_ARTIFACT_MIGRATION_DATABASE_URL is required');console.log('STUDIO_ARTIFACT_MIGRATION_DATABASE_URL not set; PostgreSQL scenarios not run locally.');process.exit(0)}

const {Client}=pg;
const suffix=`${process.pid}_${Date.now()}`;
const names={fresh:`studio_fresh_${suffix}`,upgrade:`studio_upgrade_${suffix}`,populated:`studio_populated_${suffix}`,dirty:`studio_dirty_${suffix}`,authority:`studio_authority_${suffix}`};
const createdDatabases=[];const createdRoles=[];const clients=[];
const migrations=(await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
const studio='20260727120000_studio_governed_artifact_authority.sql';
const membershipFix='20260727090000_pr1b_membership_role_scope_trigger_forward_fix.sql';
assert.equal(migrations.at(-1),studio,'Studio migration must be the chronological tip');
assert.ok(migrations.indexOf(membershipFix)===migrations.indexOf(studio)-1,'membership trigger correction must immediately precede Studio authority');
const baseline=migrations.filter(n=>n!==membershipFix&&n!==studio);
const featureMigrations=[membershipFix,studio];
const urlFor=name=>{const u=new URL(adminUrl);u.pathname=`/${name}`;return u.toString()};
const connect=async url=>{const c=new Client({connectionString:url});await c.connect();clients.push(c);return c};
const transaction=async(c,label,sql)=>{await c.query('BEGIN');try{await c.query(sql);await c.query('COMMIT');console.log(`APPLIED ${label}`)}catch(error){await c.query('ROLLBACK');throw Error(`${label}: ${error instanceof Error?error.message:String(error)}`)}};
const bootstrap=async c=>transaction(c,'Supabase auth bootstrap',`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
const apply=async(c,list)=>{for(const name of list)await transaction(c,name,await readFile(join('supabase/migrations',name),'utf8'))};
const createDatabase=async(admin,name)=>{assert.match(name,/^[a-z0-9_]+$/);if((await admin.query('select 1 from pg_database where datname=$1',[name])).rowCount)throw Error(`refusing to overwrite existing database ${name}`);await admin.query(`CREATE DATABASE ${name}`);createdDatabases.push(name);console.log(`CREATED DATABASE ${name}`);const c=await connect(urlFor(name));await bootstrap(c);return c};
const passed=[];const failed=[];
const scenario=async(name,fn)=>{try{await fn();passed.push(name);console.log(`PASS ${name}`)}catch(error){failed.push(name);console.error(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`)}};
const canonicalStudioTables=['studio_artifact_runtime_control','studio_system_template_versions','studio_artifact_aggregates','studio_artifact_generation_attempts','studio_artifact_versions','studio_artifact_command_receipts','studio_artifact_review_assignments','studio_artifact_review_resolutions','studio_artifact_approval_resolutions'];
const assertCanonicalRlsInventory=rows=>{
 const byName=new Map(rows.map(row=>[row.relname,row]));
 assert.equal(rows.length,canonicalStudioTables.length,'canonical Studio table inventory must contain exactly nine tables');
 for(const table of canonicalStudioTables){const row=byName.get(table);assert.ok(row,`canonical Studio table missing from RLS inventory: ${table}`);assert.equal(row.relrowsecurity,true,`${table} must enable RLS`);assert.equal(row.relforcerowsecurity,true,`${table} must force RLS`)}
};
// Mutation guard: this assertion must reject an inventory with any expected table removed.
assert.throws(()=>assertCanonicalRlsInventory([...canonicalStudioTables.slice(1),'not_a_canonical_table'].map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true}))),/missing/);
let admin;
try{
 admin=await connect(adminUrl);
 for(const [role,attrs] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']]){if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount){await admin.query(`CREATE ROLE ${role} ${attrs}`);createdRoles.push(role)}}

 // Mandatory foundations are intentionally fail-fast: dependent evidence is meaningless otherwise.
 const fresh=await createDatabase(admin,names.fresh);await apply(fresh,migrations);
 console.log('FOUNDATION PASS fresh full ordered migration chain');
 const upgrade=await createDatabase(admin,names.upgrade);await apply(upgrade,baseline);await apply(upgrade,featureMigrations);
 console.log('FOUNDATION PASS accepted-main upgrade');
 const populated=await createDatabase(admin,names.populated);await apply(populated,baseline);
 const legacyOrg='10000000-0000-4000-8000-000000000001',legacyWorkspace='10000000-0000-4000-8000-000000000002',legacyProject='10000000-0000-4000-8000-000000000003';
 await populated.query("insert into public.organizations(id,name,slug) values($1,'Legacy org','studio-legacy-org')",[legacyOrg]);
 await populated.query("insert into public.workspaces(id,org_id,name,slug) values($1,$2,'Legacy workspace','studio-legacy-workspace')",[legacyWorkspace,legacyOrg]);
 await populated.query("insert into public.projects(id,org_id,workspace_id,name) values($1,$2,$3,'Legacy project')",[legacyProject,legacyOrg,legacyWorkspace]);
 const legacyId=(await populated.query("insert into public.document_generations(org_id,workspace_id,project_id,template_id,artifacts,status) values($1,$2,$3,'legacy','{}','generated') returning id",[legacyOrg,legacyWorkspace,legacyProject])).rows[0].id;
 await apply(populated,featureMigrations);assert.equal((await populated.query('select status from public.document_generations where id=$1',[legacyId])).rows[0].status,'generated');
 console.log('FOUNDATION PASS populated upgrade and legacy preservation');

 const dirty=await createDatabase(admin,names.dirty);await apply(dirty,baseline);await dirty.query('create table public.studio_artifact_runtime_control(blocker integer)');
 await apply(dirty,[membershipFix]);
 await assert.rejects(transaction(dirty,studio,await readFile(join('supabase/migrations',studio),'utf8')),/studio_artifact_runtime_control/);
 assert.equal((await dirty.query("select to_regclass('public.studio_artifact_aggregates') relation")).rows[0].relation,null,'failed migration left partial authority');
 console.log('FOUNDATION PASS dirty upgrade rejection is atomic');

 const authority=await createDatabase(admin,names.authority);await apply(authority,migrations);
 const membershipScenarios=await testMembershipRoleScopeForwardFix(authority);
 console.log(`Membership trigger executable scenarios: ${membershipScenarios.length} passed, 0 failed.`);
 await scenario('runtime control is single-row and enabled',async()=>assert.deepEqual((await authority.query('select enabled,read_only,provider_enabled from public.studio_artifact_runtime_control')).rows,[{enabled:true,read_only:false,provider_enabled:true}]));
 await scenario('legacy document_generations remains non-canonical',async()=>assert.match((await authority.query("select obj_description('public.document_generations'::regclass) comment")).rows[0].comment,/Legacy\/unverified/));
 await scenario('BRD FRD PDD immutable templates are active',async()=>assert.deepEqual((await authority.query('select artifact_type from public.studio_system_template_versions where superseded_at is null order by artifact_type')).rows.map(r=>r.artifact_type),['brd','frd','pdd']));
 await scenario('one active generation attempt relational constraint',async()=>assert.equal((await authority.query("select count(*)::int n from pg_indexes where indexname='studio_one_active_generation_attempt'")).rows[0].n,1));
 await scenario('exact canonical table inventory enables and forces RLS',async()=>{
   const inventory=await authority.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') and relname = any($1::text[]) order by relname",[canonicalStudioTables]);
   assertCanonicalRlsInventory(inventory.rows);
 });
 await scenario('private generation RPC ACLs',async()=>{for(const signature of ['public.studio_artifact_generation_start(uuid)','public.studio_artifact_generation_complete(uuid,jsonb,text)','public.studio_artifact_generation_fail(uuid,text)']){assert.equal((await authority.query("select has_function_privilege('authenticated',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,false);assert.equal((await authority.query("select has_function_privilege('service_role',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true)}});
 await scenario('caller supplied content hash is impossible',async()=>assert.equal((await authority.query("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname='studio_artifact_generation_complete' and pg_get_function_identity_arguments(oid) like '%hash%'")).rows[0].n,0));
 await scenario('canonical jsonb hash ignores object key order',async()=>{const r=(await authority.query("select encode(public.digest(convert_to($1::jsonb::text,'UTF8'),'sha256'),'hex') a,encode(public.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') b",['{"title":"A","sections":[]}','{"sections":[],"title":"A"}'])).rows[0];assert.equal(r.a,r.b)});
 await scenario('generation start rejects fabricated attempt without disclosure',async()=>await assert.rejects(authority.query("select public.studio_artifact_generation_start('11111111-1111-4111-8111-111111111111')"),/RESOURCE_NOT_AVAILABLE/));
 await scenario('generation completion rejects fabricated attempt without disclosure',async()=>await assert.rejects(authority.query("select public.studio_artifact_generation_complete('11111111-1111-4111-8111-111111111111','{\"title\":\"A\",\"sections\":[]}'::jsonb,null)"),/RESOURCE_NOT_AVAILABLE/));
 await scenario('generation failure rejects fabricated attempt without disclosure',async()=>await assert.rejects(authority.query("select public.studio_artifact_generation_fail('11111111-1111-4111-8111-111111111111','PROVIDER_REQUEST_FAILED')"),/RESOURCE_NOT_AVAILABLE/));
 await scenario('authenticated scoped projection is executable',async()=>assert.equal((await authority.query("select has_function_privilege('authenticated','public.studio_read_artifact(uuid,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,true));
 await scenario('eligible reviewer projection is created and executable on the full chain',async()=>{
   const empty=await authority.query("select public.studio_artifact_eligible_reviewers('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444')");
   assert.equal(empty.rowCount,0);
   assert.equal((await authority.query("select has_function_privilege('authenticated','public.studio_artifact_eligible_reviewers(uuid,uuid,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,true);
 });
 await scenario('actor authority is not browser executable',async()=>assert.equal((await authority.query("select has_function_privilege('authenticated','public.studio_artifact_authority(uuid,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false));
 await scenario('command claim is service-role only',async()=>assert.equal((await authority.query("select has_function_privilege('service_role','public.studio_artifact_command_claim(jsonb)','EXECUTE') allowed")).rows[0].allowed,true));
 await scenario('production Studio projection decodes a real function-created artifact',async()=>{
   const fixture=await createCommittedStudioFixture(authority);
   const projection=(await authority.query('SELECT public.studio_artifact_projection($1,$2,$3) projection',[fixture.org,fixture.workspace,fixture.artifactId])).rows[0].projection;
   assert.ok(projection,'production projection returned null');
   assert.deepEqual(Object.keys(projection).sort(),['aggregateVersion','ancestry','approval','artifactType','currentApprovedVersion','currentVersion','id','lifecycle','readOnly','review','versions'].sort());
   assert.equal(projection.id,fixture.artifactId);assert.equal(projection.artifactType,'brd');assert.equal(projection.currentVersion.id,fixture.version.id);assert.equal(projection.currentVersion.contentHash,fixture.version.content_hash);assert.equal(projection.versions.length,fixture.versionCount);
   const dir=await mkdtemp(join(tmpdir(),'studio-projection-'));try{const file=join(dir,'projection.json');await writeFile(file,JSON.stringify(projection));execFileSync(process.execPath,['scripts/decodeStudioArtifactProjection.mjs',file,fixture.org,fixture.workspace],{stdio:'inherit'})}finally{await rm(dir,{recursive:true,force:true})}
   console.log(`REAL ARTIFACT ${fixture.artifactId} aggregate=${projection.aggregateVersion} content=${fixture.version.version} versions=${fixture.versionCount} replayAttempts=${fixture.attemptCount} replayVersions=${fixture.versionCount} requesterAuth=${fixture.authorizationVersions[fixture.requester]} reviewerAuth=${fixture.authorizationVersions[fixture.reviewer]} approverAuth=${fixture.authorizationVersions[fixture.approver]} decoder=passed`);
 });
 console.log(`Studio PostgreSQL executable scenarios: ${passed.length} passed, ${failed.length} failed.`);if(failed.length)process.exitCode=1;
}finally{
 for(const c of clients.reverse())if(c!==admin)await c.end().catch(()=>{});
 if(admin){let cleanupFailed=false;for(const name of createdDatabases.reverse())try{await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);console.log(`CLEANUP DROPPED DATABASE ${name}`)}catch(error){cleanupFailed=true;console.error(`CLEANUP FAILED DATABASE ${name}: ${error instanceof Error?error.message:String(error)}`)}for(const role of createdRoles.reverse())try{await admin.query(`DROP ROLE IF EXISTS ${role}`)}catch(error){cleanupFailed=true;console.error(`CLEANUP FAILED ROLE ${role}: ${error instanceof Error?error.message:String(error)}`)}await admin.end().catch(()=>{});console.log(`CLEANUP ${cleanupFailed?'FAILED':'PASS'}`);if(cleanupFailed)process.exitCode=1}
}
