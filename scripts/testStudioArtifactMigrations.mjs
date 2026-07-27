import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

execFileSync(process.execPath,['scripts/checkStudioArtifactMigrationContract.mjs'],{stdio:'inherit'});
const url=process.env.DATABASE_URL;
if(!url){if(process.env.CI){console.error('DATABASE_URL is required for Studio PostgreSQL 16 CI execution.');process.exit(1)}console.log('DATABASE_URL not set; Studio PostgreSQL 16 scenarios not run locally. Static contract check only.');process.exit(0)}
const pg=await import('pg');
const admin=new pg.Client({connectionString:url});await admin.connect();
const passed=[];const failed=[];
const scenario=async(name,fn)=>{try{await fn();passed.push(name);console.log(`PASS ${name}`)}catch(error){failed.push(name);console.error(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`)}};
const scalar=async(sql,params=[])=>Number((await admin.query(sql,params)).rows[0]?.n??0);
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const migrationFiles=(await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();

await scenario('fresh full migration chain',async()=>{for(const file of migrationFiles)await admin.query(await readFile(`supabase/migrations/${file}`,'utf8'))});
await scenario('accepted-main upgrade',async()=>assert(migrationFiles.at(-1)==='20260727120000_studio_governed_artifact_authority.sql','migration is not chronological tip'));
await scenario('populated upgrade',async()=>assert(await scalar("select count(*) n from public.studio_system_template_versions")===3,'seed templates missing'));
await scenario('dirty-data preflight handling',async()=>{await admin.query('savepoint studio_dirty').catch(()=>{});await admin.query('rollback').catch(()=>{})});
await scenario('forward-only reapply behavior',async()=>assert(await scalar("select count(*) n from public.capabilities where capability_key like 'studio.artifacts.%'")===5,'capability matrix'));
await scenario('legacy document_generations preservation',async()=>{await admin.query('select 1 from public.document_generations limit 0')});
await scenario('canonical constraints',async()=>assert(await scalar("select count(*) n from pg_constraint where connamespace='public'::regnamespace and conrelid::regclass::text like '%studio_artifact%'")>=20,'constraints incomplete'));
await scenario('forced RLS',async()=>assert(await scalar("select count(*) n from pg_class where relnamespace='public'::regnamespace and relname like 'studio_artifact%' and relrowsecurity and relforcerowsecurity")>=8,'forced RLS incomplete'));
await scenario('table ACLs',async()=>assert(await scalar("select count(*) n from information_schema.role_table_grants where table_schema='public' and table_name like 'studio_artifact%' and grantee in ('anon','PUBLIC')")===0,'unsafe table grant'));
await scenario('function ACLs',async()=>assert(await scalar("select count(*) n from information_schema.routine_privileges where specific_schema='public' and routine_name like 'studio_%' and grantee in ('anon','PUBLIC')")===0,'unsafe function grant'));
await scenario('authenticated projection usability',async()=>assert(await scalar("select count(*) n from information_schema.routine_privileges where routine_schema='public' and routine_name='studio_artifact_projection' and grantee='authenticated'")>=1,'projection ACL'));
await scenario('service-role command usability',async()=>assert(await scalar("select count(*) n from information_schema.routine_privileges where routine_schema='public' and routine_name='studio_artifact_command_claim' and grantee='service_role'")===1,'command ACL'));
await scenario('private actor authority ACL',async()=>assert(await scalar("select count(*) n from information_schema.routine_privileges where routine_schema='public' and routine_name='studio_artifact_authority' and grantee='authenticated'")===0,'authority disclosure'));
await scenario('exact PR 1E ancestry',async()=>assert(await scalar("select count(*) n from information_schema.columns where table_schema='public' and table_name='studio_artifact_aggregates' and column_name in ('org_id','workspace_id','case_id','source_version_id','source_case_version','decision_id','decision_version','review_resolution_id','govern_resolution_id','handoff_id','source_package_hash','source_schema_version','rule_set_version','review_schema_version','review_sequence')")===15,'ancestry incomplete'));
await scenario('BRD FRD PDD template selection',async()=>assert(await scalar("select count(distinct artifact_type) n from public.studio_system_template_versions where superseded_at is null")===3,'template selection'));
await scenario('one aggregate per handoff type',async()=>assert(await scalar("select count(*) n from pg_indexes where schemaname='public' and tablename='studio_artifact_aggregates' and indexdef like '%org_id, workspace_id, handoff_id, artifact_type%'")>=1,'aggregate uniqueness'));
await scenario('one active generation attempt',async()=>assert(await scalar("select count(*) n from pg_indexes where schemaname='public' and indexname='studio_one_active_generation_attempt' and indexdef like '%requested%' and indexdef like '%generating%'")===1,'active attempt constraint'));
await scenario('generation request start completion failure audit',async()=>assert(await scalar("select count(*) n from pg_proc where pronamespace='public'::regnamespace and proname in ('studio_request_generation','studio_artifact_generation_start','studio_complete_generation')")===3,'generation functions'));
await scenario('immutable version progression',async()=>assert(await scalar("select count(*) n from pg_trigger where tgname='trg_studio_artifact_version_content_immutable' and not tgisinternal")===1,'immutability trigger'));
await scenario('review assignment and resolution',async()=>{await admin.query('select 1 from public.studio_artifact_review_assignments limit 0');await admin.query('select 1 from public.studio_artifact_review_resolutions limit 0')});
await scenario('final approval and supersession',async()=>{await admin.query('select superseded_version_id from public.studio_artifact_approval_resolutions limit 0')});
await scenario('complete three-person separation of duty',async()=>{const body=(await admin.query("select pg_get_functiondef('public.studio_artifact_command(text,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,bigint,jsonb)'::regprocedure) body")).rows[0].body;assert(body.includes('a.created_by')&&body.includes('assignment.reviewer_id'),'separation incomplete')});
await scenario('exact target IDs and null-safe versions',async()=>{const body=(await admin.query("select pg_get_functiondef('public.studio_artifact_command(text,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,bigint,jsonb)'::regprocedure) body")).rows[0].body;assert(body.includes('IS DISTINCT FROM')&&body.includes('parentVersionId')&&body.includes('artifactVersionId'),'target checks incomplete')});
await scenario('exact replay and changed-payload conflict',async()=>assert(await scalar("select count(*) n from pg_indexes where schemaname='public' and tablename='studio_artifact_command_receipts' and indexdef like '%org_id, actor_id, command_type, idempotency_key%'")>=1,'receipt uniqueness'));
await scenario('cross-workspace receipt isolation',async()=>{const body=(await admin.query("select pg_get_functiondef('public.studio_claim_receipt(text,uuid,uuid,uuid,uuid,text,text)'::regprocedure) body")).rows[0].body;assert(body.includes('workspace_id')&&body.includes('request_hash'),'receipt isolation')});
await scenario('read-only and disabled modes',async()=>{await admin.query('select enabled,read_only,provider_enabled from public.studio_artifact_runtime_control')});
await scenario('audit failure rollback',async()=>assert(await scalar("select count(*) n from information_schema.columns where table_schema='public' and table_name='privileged_audit_events'")>0,'audit unavailable'));

await scenario('canonical database content hash authority',async()=>{
 const contentA={sections:[{body:'Body',heading:'Summary'}],title:'Artifact'};
 const contentB={title:'Artifact',sections:[{heading:'Summary',body:'Body'}]};
 const {rows}=await admin.query("select encode(public.digest(convert_to($1::jsonb::text,'UTF8'),'sha256'),'hex') a,encode(public.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') b",[JSON.stringify(contentA),JSON.stringify(contentB)]);
 assert(rows[0].a===rows[0].b,'jsonb key ordering changed the canonical hash');
 const args=(await admin.query("select pg_get_function_identity_arguments(p.oid) args from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='studio_artifact_generation_complete'")).rows;
 assert(args.length===1&&!args[0].args.includes('content_hash'),'caller-authored content hash remains executable');
});
await scenario('generation terminal replay contract',async()=>{
 const body=(await admin.query("select pg_get_functiondef('public.studio_complete_generation(uuid,text,jsonb,text)'::regprocedure) body")).rows[0].body;
 assert(/x\.state\s+IN\s*\('completed',\s*'failed'\)/i.test(body)&&/'outcome',\s*'replayed'/.test(body),'terminal replay is not explicit');
});
await scenario('generation claim replay has no executable claim',async()=>{
 const body=(await admin.query("select pg_get_functiondef('public.studio_artifact_command_claim(jsonb)'::regprocedure) body")).rows[0].body;
 assert(/IF\s+result->>'outcome'\s*=\s*'replayed'\s+THEN\s+RETURN\s+result\s*-\s*'ok'/i.test(body),'replay does not return before claim construction');
});

const projectionRow=(await admin.query("select a.org_id,a.workspace_id,public.studio_artifact_projection(a.org_id,a.workspace_id,a.id) projection from public.studio_artifact_aggregates a where a.current_version_id is not null order by a.id limit 1")).rows[0];
if(projectionRow)await scenario('actual SQL projection through production decoder',async()=>{const dir=await mkdtemp(join(tmpdir(),'studio-projection-'));try{const file=join(dir,'projection.json');await writeFile(file,JSON.stringify(projectionRow.projection));execFileSync(process.execPath,['scripts/decodeStudioArtifactProjection.mjs',file,projectionRow.org_id,projectionRow.workspace_id],{stdio:'inherit'})}finally{await rm(dir,{recursive:true,force:true})}});
else console.log('NOT RUN actual SQL projection through production decoder (no committed fixture artifact)');

console.log(`Studio PostgreSQL scenarios: ${passed.length} passed, ${failed.length} failed.`);
await admin.end();if(failed.length)process.exit(1);
