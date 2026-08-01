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
  'studio_rendition_deletion_complete(uuid,bigint,text)',
  'studio_rendition_deletion_fail(uuid,bigint,text)',
]) assert.ok(forward.includes(`public.${signature}`),`missing forward-fix RPC ${signature}`);
assert.match(forward,/CREATE OR REPLACE FUNCTION public\.studio_private_artifact_projection\(\s*p_org uuid,\s*p_workspace uuid,\s*p_artifact_version uuid/s);
assert.match(forward,/REVOKE ALL ON FUNCTION public\.studio_rendition_deletion_complete\(uuid\),\s*public\.studio_rendition_deletion_fail\(uuid,text\)\s*FROM PUBLIC, anon, authenticated, service_role/s);
assert.match(forward,/DROP FUNCTION IF EXISTS public\.studio_rendition_deletion_complete\(uuid,bigint\)/);
assert.match(forward,/GRANT EXECUTE ON FUNCTION[\s\S]+studio_private_artifact_reconciliation_due\(integer\)[\s\S]+TO service_role/);
assert.doesNotMatch(forward,/GRANT EXECUTE ON FUNCTION[\s\S]+studio_private_artifact_reconciliation_due\(integer\)[\s\S]+TO (?:anon|authenticated)/);
assert.match(forward,/DROP INDEX IF EXISTS public\.studio_one_unresolved_deletion_request/);
assert.match(forward,/studio_deletion_requests_rendition_history/);
assert.match(forward,/r\.lifecycle NOT IN \('available','deletion_requested','deletion_failed'\)/);
assert.match(forward,/active_attempt\.state IN \(\s*'requested','executing','reconciliation_required','reconciling'/s);
assert.match(forward,/command_type = 'studio\.rendition\.retention\.extend'[\s\S]+STUDIO_DELETION_BLOCKED/);
assert.match(forward,/command_type = 'studio\.rendition\.deletion\.request'[\s\S]+NOT EXISTS \(\s*SELECT 1[\s\S]+studio_rendition_deletion_resolutions/s);
assert.match(
  forward,
  /studio_private_artifact_command_claim\(p_command jsonb\)[\s\S]+?#variable_conflict use_variable[\s\S]+?receipt\.org_id = org\s+AND receipt\.actor_id = actor\s+AND receipt\.command_type = command_type\s+AND receipt\.idempotency_key = command_idempotency_key/s,
  'effective receipt lookup must use the canonical org, actor, command type, and key tuple',
);
assert.match(forward,/canonical\.artifact_version_id = v\.id[\s\S]+canonical\.format = format_name[\s\S]+canonical\.renderer_version = renderer/s);
const forwardFunction = name =>
  new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`, 'u').exec(forward)?.[0] ?? '';
const effectiveForwardFunction = name =>
  [...forward.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`, 'gu'))].at(-1)?.[0] ?? '';
const deletionComplete = forwardFunction('studio_rendition_deletion_complete');
const deletionFail = forwardFunction('studio_rendition_deletion_fail');
const deletionReconciliationClaim = forwardFunction('studio_deletion_reconciliation_claim');
const deletionExecutionClaim = forwardFunction('studio_rendition_deletion_execution_claim');
assert.match(deletionComplete,/p_provider_outcome text[\s\S]+privileged_audit_events[\s\S]+studio\.rendition\.deletion\.complete/);
assert.match(deletionFail,/studio_assert_actor[\s\S]+privileged_audit_events[\s\S]+studio\.rendition\.deletion\.fail/);
assert.match(deletionReconciliationClaim,/privileged_audit_events[\s\S]+studio\.rendition\.deletion\.reconciliation\.exhausted/);
for (const body of [deletionComplete,deletionFail,deletionReconciliationClaim]) {
  assert.doesNotMatch(body,/'(?:bucket|bucketId|objectKey|credentials|signedUrl)'/u);
}
const deletionExecutionAuditMetadata = /'studio\.rendition\.deletion\.execution\.claim'[\s\S]+?jsonb_build_object\(([\s\S]+?)\n\s*\)\n\s*\);/u.exec(deletionExecutionClaim)?.[1] ?? '';
assert.ok(deletionExecutionAuditMetadata,'deletion execution claim audit metadata must be present');
assert.doesNotMatch(deletionExecutionAuditMetadata,/'(?:bucket|bucketId|objectKey|credentials|signedUrl)'/u);
assert.ok(
  forward.indexOf('prior_receipt.id IS NOT NULL') <
    forward.indexOf('canonical.artifact_version_id = v.id'),
  'exact generation replay must precede canonical tombstone rejection',
);
const commandClaim = effectiveForwardFunction('studio_private_artifact_command_claim');
const generationLock = effectiveForwardFunction('studio_rendition_generation_lock');
const completionInternal = effectiveForwardFunction('studio_rendition_attempt_complete_internal');
const normalComplete = effectiveForwardFunction('studio_rendition_attempt_complete');
const normalFail = effectiveForwardFunction('studio_rendition_attempt_fail');
const recoveryAuthority = effectiveForwardFunction('studio_rendition_recovery_authority');
const renditionAttemptGuard = effectiveForwardFunction('studio_rendition_attempt_guard');
const renditionReconciliationClaim = effectiveForwardFunction('studio_rendition_reconciliation_claim');
const recoveryRendered = effectiveForwardFunction('studio_rendition_reconciliation_rendered');
const recoveryComplete = effectiveForwardFunction('studio_rendition_reconciliation_complete');
const recoveryFail = effectiveForwardFunction('studio_rendition_reconciliation_fail');
for (const field of ['p_org','p_workspace','p_artifact_version','p_format','p_renderer_version']) {
  assert.match(generationLock,new RegExp(`\\b${field}\\b`),`generation lock identity missing ${field}`);
}
assert.match(generationLock,/pg_advisory_xact_lock[\s\S]+studio-rendition-generation-v1/);
assert.ok(
  commandClaim.indexOf('studio_rendition_generation_lock') < commandClaim.indexOf('canonical.artifact_version_id = v.id'),
  'generation claim must lock before canonical inspection',
);
assert.ok(
  commandClaim.indexOf('active_attempt.state IN') > commandClaim.indexOf('studio_rendition_generation_lock'),
  'generation claim must recheck active attempts under the shared lock',
);
assert.match(commandClaim,/active_attempt\.state IN \(\s*'requested','rendering','uploaded','reconciliation_required','reconciling'/s);
assert.ok(
  completionInternal.indexOf('studio_rendition_generation_lock') < completionInternal.indexOf('FROM public.studio_renditions canonical'),
  'completion must take the shared generation lock before canonical inspection',
);
assert.match(normalComplete,/studio_rendition_attempt_complete_internal\(p_attempt,NULL::bigint\)/);
assert.doesNotMatch(normalComplete,/'reconciling'/);
assert.match(normalFail,/x\.state NOT IN \('requested','rendering','uploaded'\)/);
assert.doesNotMatch(normalFail,/x\.state NOT IN \([^\n]*'reconciling'/);
assert.match(recoveryAuthority,/x\.state <> 'reconciling'[\s\S]+x\.execution_fence <> p_fence[\s\S]+reconciliation_claimed_at IS NULL[\s\S]+studio_assert_actor[\s\S]+current_approved_version_id = version\.id/s);
assert.match(recoveryRendered,/studio_rendition_recovery_authority\(p_attempt,p_fence\)/);
assert.match(recoveryComplete,/studio_rendition_attempt_complete_internal\(p_attempt,p_fence\)/);
assert.doesNotMatch(recoveryComplete,/studio_rendition_attempt_complete\(p_attempt\)/);
assert.match(recoveryFail,/studio_rendition_recovery_authority\(p_attempt,p_fence\)/);
assert.match(forward,/ADD COLUMN IF NOT EXISTS reconciliation_phase text/);
assert.match(forward,/studio_rendition_attempts_reconciliation_phase_check[\s\S]+pre_render[\s\S]+verify_or_upload/);
assert.match(renditionAttemptGuard,/'reconciliation_phase'/);
assert.match(
  renditionReconciliationClaim,
  /WHEN x\.state = 'reconciling' THEN x\.reconciliation_phase/,
  'expired reconciling work must retain its persisted recovery phase',
);
assert.doesNotMatch(
  renditionReconciliationClaim,
  /CASE WHEN x\.state IN \('requested','rendering'\) THEN 'pre_render' ELSE 'verify_or_upload' END/,
  'reconciling phase must not be reclassified from state alone',
);
assert.match(renditionReconciliationClaim,/reconciliation_phase = phase/);
assert.match(recoveryRendered,/reconciliation_phase = 'verify_or_upload'/);
assert.ok(
  renditionReconciliationClaim.indexOf('reconciliation_phase = phase') <
    renditionReconciliationClaim.indexOf("'studio.rendition.reconciliation.claim'"),
  'the persisted phase must commit with ownership before its audit',
);
assert.match(
  renditionReconciliationClaim,
  /studio\.rendition\.reconciliation\.claim/,
  'rendition recovery ownership must be audited',
);
assert.match(
  renditionReconciliationClaim,
  /studio\.rendition\.reconciliation\.exhausted/,
  'terminal rendition exhaustion must be audited',
);
assert.ok(
  renditionReconciliationClaim.indexOf("SET state = 'reconciling'") <
    renditionReconciliationClaim.indexOf("'studio.rendition.reconciliation.claim'"),
  'the recovery-ownership transition must precede its atomic audit insert',
);
assert.ok(
  renditionReconciliationClaim.indexOf("'studio.rendition.reconciliation.claim'") <
    renditionReconciliationClaim.indexOf("RETURN jsonb_strip_nulls"),
  'no executable recovery claim may be returned before its audit insert',
);
assert.match(
  renditionReconciliationClaim,
  /SET state = 'failed',[\s\S]+?'studio\.rendition\.reconciliation\.exhausted'[\s\S]+?RETURN NULL/,
  'terminal rendition exhaustion and its audit must share the function transaction',
);
for (const token of [
  "'attemptId'", "'artifactVersionId'", "'format'", "'previousState'",
  "'recoveryPhase'", "'previousReconciliationCount'", "'reconciliationCount'",
  "'previousExecutionFence'", "'executionFence'", "'terminalState'",
]) assert.match(renditionReconciliationClaim,new RegExp(token.replaceAll("'","\\'")));
const renditionClaimAudit = /'studio\.rendition\.reconciliation\.claim'[\s\S]+?\n\s*\);/u.exec(renditionReconciliationClaim)?.[0] ?? '';
const renditionExhaustionAudit = /'studio\.rendition\.reconciliation\.exhausted'[\s\S]+?\n\s*\);/u.exec(renditionReconciliationClaim)?.[0] ?? '';
for (const body of [renditionClaimAudit,renditionExhaustionAudit]) {
  assert.ok(body.includes('privileged_audit_events') || body.length > 0);
  assert.doesNotMatch(body,/'(?:bucket|bucketId|objectKey|signedUrl|approvedContent|credentials|serviceRole)'/u);
}
assert.match(
  deletionReconciliationClaim,
  /studio\.rendition\.deletion\.reconciliation\.claim/,
  'deletion recovery ownership must be audited',
);
assert.match(
  deletionReconciliationClaim,
  /SELECT \* INTO control[\s\S]+studio_private_artifact_runtime_control[\s\S]+FOR SHARE[\s\S]+control\.singleton IS NULL[\s\S]+NOT control\.enabled[\s\S]+control\.read_only[\s\S]+NOT control\.provider_enabled[\s\S]+NOT control\.deletion_enabled[\s\S]+STUDIO_READ_ONLY/,
  'deletion recovery must fail closed under locked runtime controls',
);
assert.ok(
  deletionReconciliationClaim.indexOf('SELECT * INTO control') <
    deletionReconciliationClaim.indexOf('next_count := a.reconciliation_count + 1'),
  'runtime control validation must precede deletion retry consumption',
);
assert.ok(
  deletionReconciliationClaim.indexOf('SELECT * INTO control') <
    deletionReconciliationClaim.indexOf("SET state = 'failed'"),
  'runtime control validation must precede deletion exhaustion',
);
assert.ok(
  deletionReconciliationClaim.indexOf("SET state = 'reconciling'") <
    deletionReconciliationClaim.indexOf("'studio.rendition.deletion.reconciliation.claim'"),
  'deletion ownership must update before its atomic audit insert',
);
assert.ok(
  deletionReconciliationClaim.indexOf("'studio.rendition.deletion.reconciliation.claim'") <
    deletionReconciliationClaim.indexOf("RETURN jsonb_build_object"),
  'deletion recovery authority must not return before its audit insert',
);
for (const token of [
  "'deletionAttemptId'", "'deletionRequestId'", "'resolutionId'", "'previousState'",
  "'previousReconciliationCount'", "'reconciliationCount'", "'currentExecutionFence'",
  "'resultingLifecycleVersion'", "'recoveryKind'", "'providerAuthorityIssued'",
]) assert.match(deletionReconciliationClaim,new RegExp(token.replaceAll("'","\\'")));
const deletionClaimAudit = /'studio\.rendition\.deletion\.reconciliation\.claim'[\s\S]+?\n\s*\);/u.exec(deletionReconciliationClaim)?.[0] ?? '';
assert.doesNotMatch(deletionClaimAudit,/'(?:bucket|bucketId|objectKey|signedUrl|storageProvider|credentials|privateClaim|workerSecret)'/u);
assert.match(deletionClaimAudit,/'providerAuthorityIssued',false/);
assert.match(
  deletionExecutionClaim,
  /studio\.rendition\.deletion\.execution\.claim/,
  'provider deletion authority must be audited at its exact fence',
);
assert.ok(
  deletionExecutionClaim.indexOf("SET state = 'executing'") <
    deletionExecutionClaim.indexOf("'studio.rendition.deletion.execution.claim'"),
  'the execution attempt update must precede its atomic audit',
);
assert.ok(
  deletionExecutionClaim.indexOf("'studio.rendition.deletion.execution.claim'") <
    deletionExecutionClaim.indexOf('RETURN jsonb_build_object'),
  'no private deletion binding may return before its execution audit',
);
assert.match(deletionExecutionClaim,/'executionFence',next_fence/);
assert.match(deletionExecutionClaim,/'fence', next_fence/);
assert.match(deletionComplete,/'executionFence',p_fence/);
assert.match(deletionFail,/'executionFence',p_fence/);
for (const token of [
  "'deletionAttemptId'", "'deletionRequestId'", "'resolutionId'", "'previousState'",
  "'previousExecutionFence'", "'executionFence'", "'previousReconciliationCount'",
  "'reconciliationCount'", "'resultingLifecycleVersion'", "'executionKind'",
]) assert.match(deletionExecutionClaim,new RegExp(token.replaceAll("'","\\'")));
const deletionExecutionAudit = /'studio\.rendition\.deletion\.execution\.claim'[\s\S]+?\n\s*\);/u.exec(deletionExecutionClaim)?.[0] ?? '';
assert.doesNotMatch(deletionExecutionAudit,/'(?:bucket|bucketId|objectKey|signedUrl|storageProvider|provider|credential|privateClaim|workerSecret|secret)'/u);
assert.match(
  forward,
  /REVOKE ALL ON FUNCTION[\s\S]+studio_rendition_deletion_execution_claim\(uuid\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role;[\s\S]+GRANT EXECUTE ON FUNCTION[\s\S]+studio_deletion_reconciliation_claim\(uuid\),[\s\S]+studio_rendition_deletion_execution_claim\(uuid\)[\s\S]+TO service_role;/,
  'deletion ownership and execution claims must remain service-only',
);
assert.doesNotMatch(
  forward,
  /GRANT EXECUTE ON FUNCTION[\s\S]+(?:studio_deletion_reconciliation_claim|studio_rendition_deletion_execution_claim)\(uuid\)[\s\S]+TO (?:anon|authenticated);/,
  'deletion ownership or execution authority must never be granted to browser roles',
);
assert.match(
  commandClaim,
  /request\.id = command_deletion_request_id[\s\S]+request\.rendition_id = r\.id[\s\S]+request\.org_id = org[\s\S]+request\.workspace_id = workspace[\s\S]+FOR UPDATE OF request/,
  'new deletion resolutions must bind the request to the locked rendition and tenant scope',
);
assert.match(commandClaim,/NOT EXISTS \([\s\S]+studio_rendition_deletion_resolutions existing_resolution[\s\S]+existing_resolution\.request_id = request\.id/);
assert.ok(
  commandClaim.indexOf('request.rendition_id = r.id') <
    commandClaim.lastIndexOf('studio_private_artifact_command_claim_pr217_accepted'),
  'deletion request binding must precede delegation for a new command',
);
assert.match(forward,/REVOKE ALL ON FUNCTION[\s\S]+studio_rendition_generation_lock\(uuid,uuid,uuid,text,text\)[\s\S]+studio_rendition_recovery_authority\(uuid,bigint\)[\s\S]+studio_rendition_attempt_complete_internal\(uuid,bigint\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/);
console.log(`Studio private artifact migration contract passed: accepted blob ${acceptedBlob}, additive forward-fix tip, ${tables.length} forced-RLS tables, ${capabilities.length} capabilities, fenced service RPCs, one safe projection.`);
