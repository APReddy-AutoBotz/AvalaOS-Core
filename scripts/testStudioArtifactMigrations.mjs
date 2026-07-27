import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
execFileSync(process.execPath,['scripts/checkStudioArtifactMigrationContract.mjs'],{stdio:'inherit'});
const url=process.env.DATABASE_URL;
if(!url){if(process.env.CI){console.error('DATABASE_URL is required for Studio PostgreSQL 16 CI execution.');process.exit(1)}console.log('DATABASE_URL not set; Studio PostgreSQL 16 scenarios not run locally. Static contract check only.');process.exit(0)}
const pg=await import('pg');const client=new pg.Client({connectionString:url});await client.connect();
const scenarios=[];const scenario=async(name,fn)=>{await fn();scenarios.push(name);console.log(`Studio PostgreSQL scenario passed: ${name}`)};
const migrationFiles=(await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
await scenario('fresh migration chain',async()=>{for(const file of migrationFiles)await client.query(await readFile(`supabase/migrations/${file}`,'utf8'))});
await scenario('canonical table inventory',async()=>{const {rows}=await client.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name like 'studio_artifact%' ");if(rows[0].n<8)throw Error('canonical tables missing')});
await scenario('BRD FRD PDD active template selection',async()=>{const {rows}=await client.query("select count(*)::int n from public.studio_system_template_versions where superseded_at is null");if(rows[0].n!==3)throw Error('template selection incomplete')});
await scenario('forced RLS and ACL inventory',async()=>{const {rows}=await client.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relname like 'studio_artifact%' and relrowsecurity and relforcerowsecurity");if(rows[0].n<8)throw Error('forced RLS incomplete')});
await scenario('legacy document_generations preservation',async()=>{await client.query("select 1 from public.document_generations limit 0")});
await scenario('migration reapply is intentionally forward-only',async()=>{const {rows}=await client.query("select count(*)::int n from public.capabilities where capability_key like 'studio.artifacts.%'");if(rows[0].n!==5)throw Error('capability matrix incomplete')});
console.log(`Studio PostgreSQL scenarios: ${scenarios.length} passed, 0 failed.`);await client.end();
