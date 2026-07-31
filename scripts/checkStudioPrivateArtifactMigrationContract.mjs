import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';

const file='supabase/migrations/20260729163251_studio_private_artifact_authority.sql';
const sql=await readFile(file,'utf8');
const forwardFile='supabase/migrations/20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql';
const forward=await readFile(forwardFile,'utf8');
const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
assert.equal(migrations.at(-1),'20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql','PR #217 forward fix must be the chronological tip');
const acceptedBlob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
assert.equal(acceptedBlob,'3383268eab95d1b2f12f4bb8a77246e63c3e30a3','accepted PR #217 migration blob drift');
const capabilities=['studio.artifacts.rendition.generate','studio.artifacts.download','studio.artifacts.retention.manage','studio.artifacts.legal_hold.manage','studio.artifacts.delete.request','studio.artifacts.delete.approve'];
for(const capability of capabilities)assert.match(sql,new RegExp(capability.replaceAll('.','\\.')));
const tables=['studio_private_artifact_runtime_control','studio_retention_policies','studio_private_artifact_command_receipts','studio_rendition_attempts','studio_renditions','studio_rendition_retention_extensions','studio_rendition_legal_hold_events','studio_rendition_deletion_requests','studio_rendition_deletion_resolutions','studio_rendition_deletion_attempts','studio_artifact_download_receipts'];
for(const table of tables){assert.match(sql,new RegExp(`CREATE TABLE public\\.${table}\\b`));assert.match(sql,new RegExp(`'${table}'`))}
const serviceFunctions=['studio_private_artifact_authority(uuid,uuid,uuid)','studio_private_artifact_command_claim(jsonb)','studio_rendition_attempt_start(uuid)','studio_rendition_attempt_rendered(uuid,text,text,bigint,text,text,text,text,text)','studio_rendition_attempt_complete(uuid)','studio_rendition_attempt_fail(uuid,text)','studio_rendition_reconciliation_claim(uuid)','studio_deletion_reconciliation_claim(uuid)','studio_rendition_deletion_complete(uuid)','studio_rendition_deletion_fail(uuid,text)','studio_artifact_download_claim(jsonb)','studio_artifact_download_complete(uuid)','studio_artifact_download_fail(uuid,text)'];
for(const signature of serviceFunctions){assert.ok(sql.includes(`public.${signature}`),`missing private RPC ${signature}`)}
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.studio_private_artifact_projection\(uuid,uuid,uuid\) TO authenticated/);
assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC,anon,authenticated,service_role/);
assert.match(sql,/ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON TABLE public\.%I FROM PUBLIC,anon,authenticated/);
assert.match(sql,/to_regclass\('storage\.buckets'\)[\s\S]+to_regclass\('storage\.objects'\)/);
assert.match(sql,/studio-private-artifacts','studio-private-artifacts',false/);
assert.match(sql,/bucket_id text NOT NULL CHECK\(bucket_id='studio-private-artifacts'\)/);
assert.doesNotMatch(sql,/studio-private-archive/);
assert.match(sql,/REVOKE ALL ON FUNCTION[^\n]+studio_rendition_reconciliation_claim\(uuid\)[^\n]+studio_deletion_reconciliation_claim\(uuid\)[^\n]+FROM PUBLIC,anon,authenticated,service_role/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION[^\n]+studio_rendition_reconciliation_claim\(uuid\)[^\n]+studio_deletion_reconciliation_claim\(uuid\)[^\n]+TO service_role/);
assert.match(sql,/AS RESTRICTIVE FOR ALL TO anon,authenticated/);
assert.doesNotMatch(sql,/CREATE SCHEMA\s+storage/i);
assert.doesNotMatch(sql,/CREATE TABLE\s+storage\./i);
assert.match(sql,/authorization deliberately precedes receipt and resource inspection/i);
assert.match(sql,/current_approved_version_id=sv\.id[\s\S]+sv\.lifecycle='approved'/);
assert.match(sql,/p_command->'payload'\?\|ARRAY\['bucket','bucketId','objectKey','contentHash','byteLength','mimeType','safeFilename','rendererVersion','storageProvider'\]/);
assert.match(sql,/RETENTION_CANNOT_SHORTEN/);
assert.match(sql,/STUDIO_SEPARATION_OF_DUTY/);
assert.match(sql,/STUDIO_DELETION_BLOCKED/);
assert.match(sql,/public\.studio_active_hold_count\(r\.id\)/);
assert.match(sql,/retention->>'indefinite'='true'/);
assert.match(sql,/lifecycle='deleted'.*deleted_at IS NOT NULL/);
assert.match(sql,/STUDIO_PRIVATE_IMMUTABLE/);
assert.match(sql,/WHEN command_type='studio\.rendition\.generate' THEN jsonb_build_object\('renditionClaim',claim\)/);
assert.match(sql,/WHEN command_type='studio\.rendition\.deletion\.resolve' AND claim IS NOT NULL THEN jsonb_build_object\('deletionClaim',claim\)/);
assert.match(sql,/RETURN jsonb_build_object\('outcome','replayed'[\s\S]+receipt\.response/);
const projection=/CREATE OR REPLACE FUNCTION public\.studio_private_artifact_projection[\s\S]+?\$\$;/.exec(sql)?.[0]??'';
for(const forbidden of ['bucket_id','object_key','signedUrl','rationale','storage_provider'])assert.ok(!projection.includes(forbidden),`safe projection exposes ${forbidden}`);
const auditMetadata=[...sql.matchAll(/jsonb_build_object\(([^;]+)\)/g)].map(match=>match[1]).join('\n');
for(const forbidden of ["'objectKey'","'bucketId'","'signedUrl'","'rationale'"])assert.ok(!auditMetadata.includes(forbidden)||sql.includes(`claim:=jsonb_build_object`),`audit may contain ${forbidden}`);
for(const signature of [
  'studio_private_artifact_reconciliation_due(integer)',
  'studio_rendition_reconciliation_rendered(uuid,bigint,text,text,bigint,text,text,text,text,text)',
  'studio_rendition_reconciliation_complete(uuid,bigint)',
  'studio_rendition_reconciliation_fail(uuid,bigint,text)',
  'studio_rendition_deletion_execution_claim(uuid)',
  'studio_rendition_deletion_complete(uuid,bigint)',
  'studio_rendition_deletion_fail(uuid,bigint,text)',
]) assert.ok(forward.includes(`public.${signature}`),`missing forward-fix RPC ${signature}`);
assert.match(forward,/CREATE OR REPLACE FUNCTION public\.studio_private_artifact_projection\(\s*p_org uuid,\s*p_workspace uuid,\s*p_artifact_version uuid/s);
assert.match(forward,/REVOKE ALL ON FUNCTION public\.studio_rendition_deletion_complete\(uuid\),\s*public\.studio_rendition_deletion_fail\(uuid,text\)\s*FROM PUBLIC, anon, authenticated, service_role/s);
assert.match(forward,/GRANT EXECUTE ON FUNCTION[\s\S]+studio_private_artifact_reconciliation_due\(integer\)[\s\S]+TO service_role/);
assert.doesNotMatch(forward,/GRANT EXECUTE ON FUNCTION[\s\S]+studio_private_artifact_reconciliation_due\(integer\)[\s\S]+TO (?:anon|authenticated)/);
assert.match(forward,/DROP INDEX IF EXISTS public\.studio_one_unresolved_deletion_request/);
assert.match(forward,/studio_deletion_requests_rendition_history/);
assert.match(forward,/r\.lifecycle NOT IN \('available','deletion_requested','deletion_failed'\)/);
assert.match(forward,/active_attempt\.state IN \(\s*'requested','executing','reconciliation_required','reconciling'/s);
assert.match(forward,/command_type = 'studio\.rendition\.retention\.extend'[\s\S]+STUDIO_DELETION_BLOCKED/);
assert.match(forward,/command_type = 'studio\.rendition\.deletion\.request'[\s\S]+NOT EXISTS \(\s*SELECT 1[\s\S]+studio_rendition_deletion_resolutions/s);
assert.match(forward,/canonical\.artifact_version_id = v\.id[\s\S]+canonical\.format = format_name[\s\S]+canonical\.renderer_version = renderer/s);
assert.ok(
  forward.indexOf('prior_receipt.id IS NOT NULL') <
    forward.indexOf('canonical.artifact_version_id = v.id'),
  'exact generation replay must precede canonical tombstone rejection',
);
console.log(`Studio private artifact migration contract passed: accepted blob ${acceptedBlob}, additive forward-fix tip, ${tables.length} forced-RLS tables, ${capabilities.length} capabilities, fenced service RPCs, one safe projection.`);
