import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, truncate, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import process from 'node:process';
import {createCommittedStudioFixture} from './studioArtifactPostgresFixture.mjs';
import {
  applyMigrations, bootstrapAuth, connect, createDatabase, databaseUrlFor, dropDatabase,
  ensureClusterRoles, migrationNames,
} from './pilotOperationsPostgresSupport.mjs';

const adminUrl=process.env.PILOT_OPERATIONS_DATABASE_URL;
if(!adminUrl){if(process.env.CI)throw new Error('PILOT_OPERATIONS_DATABASE_URL is required in CI.');console.log('Pilot Operations PostgreSQL recovery skipped: PILOT_OPERATIONS_DATABASE_URL is not set.');process.exit(0)}
const suffix=`${process.pid}_${Date.now()}`,names={source:`pilot_recovery_source_${suffix}`,restore:`pilot_recovery_restore_${suffix}`};
const directory=await mkdtemp(join(tmpdir(),'avalaos-pilot-recovery-'));
const dump=join(directory,'synthetic.dump'),corrupt=join(directory,'synthetic-corrupt.dump'),manifestPath=join(directory,'manifest.json');
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const validateManifest=(value,buffer)=>{
  assert.equal(value.schemaVersion,'pilot-operations-backup-v1','wrong backup schema version');
  assert.equal(value.syntheticOnly,true,'only synthetic backup evidence is accepted');
  assert.equal(value.sourceEnvironment,'disposable_ci','backup environment must be disposable');
  assert.equal(value.byteLength,buffer.length,'incomplete backup length');
  assert.equal(value.sha256,sha256(buffer),'backup digest mismatch');
};
let admin,source,restored;
try{
  admin=await connect(adminUrl);await ensureClusterRoles(admin);
  source=await createDatabase(admin,adminUrl,names.source);await bootstrapAuth(source);await applyMigrations(source,migrationNames);
  const fixture=await createCommittedStudioFixture(source);
  const environment='98000000-0000-4000-8000-000000000001',candidate='98000000-0000-4000-8000-000000000002',receipt='98000000-0000-4000-8000-000000000003',audit='98000000-0000-4000-8000-000000000004';
  await source.query("INSERT INTO pilot_operations_environments(id,org_id,workspace_id,environment_type,lifecycle,expected_schema_version,maintenance,read_only,created_by) VALUES($1,$2,$3,'pilot_candidate','active_non_live','pilot-operations-2026-08',false,true,$4)",[environment,fixture.org,fixture.workspace,fixture.requester]);
  await source.query("INSERT INTO pilot_operations_release_candidates(id,org_id,workspace_id,environment_id,git_sha,build_identity,evidence_manifest_sha256,schema_version,lifecycle,created_by) VALUES($1,$2,$3,$4,$5,'synthetic-ci-build',$6,'pilot-operations-2026-08','validated',$7)",[candidate,fixture.org,fixture.workspace,environment,'a'.repeat(40),'b'.repeat(64),fixture.requester]);
  const response={resourceId:candidate,version:1,lifecycle:'validated',liveActivationAuthorized:false};
  await source.query("INSERT INTO pilot_operations_command_receipts(id,org_id,workspace_id,actor_id,operation,idempotency_key,initial_request_id,request_hash,status,response_body,resource_id) VALUES($1,$2,$3,$4,'validate_release_candidate','synthetic-response-loss',$5,$6,'committed',$7::jsonb,$8)",[receipt,fixture.org,fixture.workspace,fixture.requester,'98000000-0000-4000-8000-000000000005','c'.repeat(64),JSON.stringify(response),candidate]);
  await source.query("INSERT INTO pilot_operations_audit_events(id,org_id,workspace_id,actor_id,action,resource_id,receipt_id,result,metadata) VALUES($1,$2,$3,$4,'validate_release_candidate',$5,$6,'committed','{\"synthetic\":true}'::jsonb)",[audit,fixture.org,fixture.workspace,fixture.requester,candidate,receipt]);
  const invariants=(await source.query("SELECT (SELECT count(*) FROM assess_v2_studio_handoffs)::int handoffs,(SELECT count(*) FROM studio_artifact_command_receipts)::int artifact_receipts,(SELECT count(*) FROM pilot_operations_command_receipts)::int operation_receipts,(SELECT count(*) FROM pilot_operations_audit_events)::int operation_audits")).rows[0];
  execFileSync('pg_dump',['--format=custom','--no-owner','--no-acl','--file',dump,databaseUrlFor(adminUrl,names.source)],{stdio:'inherit'});
  const bytes=await readFile(dump);const manifest={schemaVersion:'pilot-operations-backup-v1',sha256:sha256(bytes),byteLength:bytes.length,syntheticOnly:true,sourceEnvironment:'disposable_ci'};await writeFile(manifestPath,JSON.stringify(manifest));
  const readManifest=JSON.parse(await readFile(manifestPath,'utf8'));validateManifest(readManifest,await readFile(dump));
  assert.throws(()=>validateManifest({...readManifest,schemaVersion:'pilot-operations-backup-v0'},bytes),/wrong backup schema version/);
  assert.throws(()=>validateManifest({...readManifest,byteLength:bytes.length-1},bytes),/incomplete backup length/);
  assert.throws(()=>validateManifest({...readManifest,sha256:'0'.repeat(64)},bytes),/backup digest mismatch/);
  await writeFile(corrupt,bytes);await truncate(corrupt,Math.max(1,bytes.length-1024));assert.notEqual(sha256(await readFile(corrupt)),readManifest.sha256,'truncated backup must fail manifest integrity');
  restored=await createDatabase(admin,adminUrl,names.restore);await restored.end();restored=null;
  const interrupted=spawnSync('pg_restore',['--exit-on-error','--no-owner','--no-acl','--dbname',databaseUrlFor(adminUrl,names.restore),corrupt],{encoding:'utf8'});assert.notEqual(interrupted.status,0,'truncated restore must fail closed');
  await dropDatabase(admin,names.restore);restored=await createDatabase(admin,adminUrl,names.restore);await restored.end();restored=null;
  execFileSync('pg_restore',['--exit-on-error','--no-owner','--no-acl','--dbname',databaseUrlFor(adminUrl,names.restore),dump],{stdio:'inherit'});
  restored=await connect(databaseUrlFor(adminUrl,names.restore));
  const restoredInvariants=(await restored.query("SELECT (SELECT count(*) FROM assess_v2_studio_handoffs)::int handoffs,(SELECT count(*) FROM studio_artifact_command_receipts)::int artifact_receipts,(SELECT count(*) FROM pilot_operations_command_receipts)::int operation_receipts,(SELECT count(*) FROM pilot_operations_audit_events)::int operation_audits")).rows[0];assert.deepEqual(restoredInvariants,invariants);
  const canonical=(await restored.query('SELECT response_body FROM pilot_operations_command_receipts WHERE id=$1',[receipt])).rows[0];assert.deepEqual(canonical.response_body,response);
  assert.equal(Number((await restored.query('SELECT count(*) n FROM pilot_operations_command_receipts WHERE id=$1',[receipt])).rows[0].n),1);assert.equal(Number((await restored.query('SELECT count(*) n FROM pilot_operations_audit_events WHERE receipt_id=$1',[receipt])).rows[0].n),1);
  assert.equal((await restored.query("SELECT lifecycle FROM pilot_operations_environments WHERE id=$1",[environment])).rows[0].lifecycle,'active_non_live');
  assert.equal((await restored.query("SELECT relforcerowsecurity FROM pg_class WHERE oid='public.pilot_operations_command_receipts'::regclass")).rows[0].relforcerowsecurity,true);
  await mkdir('artifacts/pilot-operations',{recursive:true});
  await writeFile('artifacts/pilot-operations/postgres-recovery.json',JSON.stringify({
    kind:'executed_disposable_postgresql_recovery',postgresMajor:16,head:process.env.CANDIDATE_SHA??null,runId:process.env.GITHUB_RUN_ID??null,
    backupSha256:manifest.sha256,backupByteLength:manifest.byteLength,cleanRestoreVerified:true,corruptionRejected:true,
    incompleteBackupRejected:true,wrongVersionRejected:true,interruptedRetryVerified:true,canonicalReceiptVerified:true,
    syntheticOnly:true,liveActivationAuthorized:false,
  },null,2)+'\n');
  console.log('POSTGRES RECOVERY PASS backup -> clean restore, canonical lineage/control invariants, corruption rejection, interrupted restore retry, and canonical response-loss receipt');
}finally{
  if(source)await source.end().catch(()=>{});if(restored)await restored.end().catch(()=>{});
  if(admin){for(const name of Object.values(names))await dropDatabase(admin,name).catch(()=>{});await admin.end().catch(()=>{})}
  await rm(directory,{recursive:true,force:true});
}
