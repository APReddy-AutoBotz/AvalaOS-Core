import assert from 'node:assert/strict';
import process from 'node:process';
import {mkdir, writeFile} from 'node:fs/promises';
import {
  applyMigrations, bootstrapAuth, connect, createDatabase, dropDatabase, ensureClusterRoles,
  featureMigration, migrationNames,
} from './pilotOperationsPostgresSupport.mjs';
import {createCommittedStudioFixture} from './studioArtifactPostgresFixture.mjs';

const adminUrl = process.env.PILOT_OPERATIONS_DATABASE_URL;
if (!adminUrl) {
  if (process.env.CI) throw new Error('PILOT_OPERATIONS_DATABASE_URL is required in CI.');
  console.log('Pilot Operations PostgreSQL scenarios skipped: PILOT_OPERATIONS_DATABASE_URL is not set.');
  process.exit(0);
}
const featureIndex = migrationNames.indexOf(featureMigration);
assert.ok(featureIndex > 0, 'Pilot Operations migration is missing from the ordered chain.');
const baseline = migrationNames.slice(0, featureIndex);
const correction = migrationNames.slice(featureIndex);
const suffix = `${process.pid}_${Date.now()}`;
const names = {fresh:`pilot_ops_fresh_${suffix}`, upgrade:`pilot_ops_upgrade_${suffix}`};
const clients=[];
let admin;
try {
  admin=await connect(adminUrl); clients.push(admin); await ensureClusterRoles(admin);
  const fresh=await createDatabase(admin,adminUrl,names.fresh); clients.push(fresh); await bootstrapAuth(fresh); await applyMigrations(fresh,migrationNames);
  const upgrade=await createDatabase(admin,adminUrl,names.upgrade); clients.push(upgrade); await bootstrapAuth(upgrade); await applyMigrations(upgrade,baseline); await applyMigrations(upgrade,correction);
  for (const [label,db] of [['fresh',fresh],['accepted-baseline upgrade',upgrade]]) {
    assert.equal(Number((await db.query("SELECT current_setting('server_version_num')::int version")).rows[0].version)>=160000,true);
    const tables=['pilot_operations_environments','pilot_operations_release_candidates','pilot_operations_release_events','pilot_operations_provider_bindings','pilot_operations_tenants','pilot_operations_recovery_drills','pilot_operations_command_receipts','pilot_operations_audit_events','pilot_operations_evidence_manifests'];
    const rls=(await db.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",[tables])).rows;
    assert.equal(rls.length,tables.length);
    for(const row of rls) assert.deepEqual([row.relrowsecurity,row.relforcerowsecurity],[true,true],row.relname);
    for(const table of tables) assert.equal((await db.query("SELECT has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') allowed",[`public.${table}`])).rows[0].allowed,false,table);
    assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.pilot_operations_command(uuid,uuid,uuid,text,uuid,text,text,bigint,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("SELECT has_function_privilege('service_role','public.pilot_operations_command(uuid,uuid,uuid,text,uuid,text,text,bigint,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed,true);
    console.log(`POSTGRES PASS ${label}: applied schema, forced RLS, tenant-table denial, and service-only command authority`);
  }
  const fixture=await createCommittedStudioFixture(fresh);
  await fresh.query("INSERT INTO role_capabilities(role_id,capability_key) SELECT $1,capability_key FROM capabilities WHERE capability_key IN('operations.manage','release.manage','release.validate','release.approve','release.promote','org.admin') ON CONFLICT DO NOTHING",[fixture.role]);
  const authorizationVersion=Number((await fresh.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,fixture.requester])).rows[0].version);
  let ordinal=100;
  const command=(operation,key,payload,expectedVersion=0,requestPayload=JSON.stringify(payload),actor=fixture.requester,actorAuthorizationVersion=authorizationVersion)=>fresh.query(
    'SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) result',
    [actor,fixture.org,fixture.workspace,operation,`99000000-0000-4000-8000-${String(ordinal++).padStart(12,'0')}`,key,requestPayload,actorAuthorizationVersion,expectedVersion,JSON.stringify(payload)],
  );
  const environment=(await command('register_environment','postgres-env-register',{environmentType:'pilot_candidate',schemaVersion:'pilot-operations-2026-08',requiredCapabilities:[]})).rows[0].result;
  await command('set_runtime_control','postgres-maintenance-on',{environmentId:environment.resourceId,maintenance:true,readOnly:false},environment.version);
  const candidatePayload={environmentId:environment.resourceId,gitSha:'d'.repeat(40),buildIdentity:'postgres-synthetic-build',evidenceManifestSha256:'e'.repeat(64),schemaVersion:'pilot-operations-2026-08'};
  await assert.rejects(command('register_release_candidate','postgres-maintenance-denial',candidatePayload,0),/MAINTENANCE_MODE/);
  await command('set_runtime_control','postgres-maintenance-off',{environmentId:environment.resourceId,maintenance:false,readOnly:false},2);
  const raw=JSON.stringify(candidatePayload);
  const [concurrentA,concurrentB]=await Promise.all([
    command('register_release_candidate','postgres-concurrent-idempotency',candidatePayload,0,raw),
    command('register_release_candidate','postgres-concurrent-idempotency',candidatePayload,0,raw),
  ]);
  assert.deepEqual(concurrentA.rows[0].result,concurrentB.rows[0].result);
  const candidate=concurrentA.rows[0].result;
  assert.equal(Number((await fresh.query("SELECT count(*) n FROM pilot_operations_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND operation='register_release_candidate' AND idempotency_key='postgres-concurrent-idempotency'",[fixture.org,fixture.workspace])).rows[0].n),1);
  await assert.rejects(command('register_release_candidate','postgres-concurrent-idempotency',{...candidatePayload,buildIdentity:'changed'},0,JSON.stringify({...candidatePayload,buildIdentity:'changed'})),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(fresh.query(
    'SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9::jsonb)',
    [fixture.requester,fixture.org,fixture.workspace,'validate_release_candidate','99000000-0000-4000-8000-000000000999','postgres-missing-version',JSON.stringify({candidateId:candidate.resourceId}),authorizationVersion,JSON.stringify({candidateId:candidate.resourceId})],
  ),/EXPECTED_VERSION_REQUIRED/);
  await fresh.query(`INSERT INTO pilot_operations_evidence_manifests(
    candidate_id,org_id,workspace_id,environment_id,git_sha,build_identity,workflow_name,
    workflow_run_id,workflow_head_sha,manifest_sha256,schema_version,migration_compatible,
    required_gates,status,verified_at) VALUES($1,$2,$3,$4,$5,$6,'Pilot Operations','31329036281',$5,$7,$8,true,$9::jsonb,'verified',now())`,[
    candidate.resourceId,fixture.org,fixture.workspace,environment.resourceId,candidatePayload.gitSha,candidatePayload.buildIdentity,
    candidatePayload.evidenceManifestSha256,candidatePayload.schemaVersion,JSON.stringify({'operations-source':true}),
  ]);
  await assert.rejects(command('validate_release_candidate','postgres-fabricated-evidence',{candidateId:candidate.resourceId},candidate.version),/EVIDENCE_NOT_VERIFIED/);

  const validPayload={...candidatePayload,gitSha:'f'.repeat(40),buildIdentity:'postgres-exact-head-build',evidenceManifestSha256:'a'.repeat(64)};
  const valid=(await command('register_release_candidate','postgres-valid-candidate',validPayload,0)).rows[0].result;
  const gates=Object.fromEntries(['retained-authority','operations-source','postgres-fresh-upgrade','tenant-adversarial','backup-restore-recovery','maintenance-rollback','browser-desktop','browser-pixel7','accessibility-performance','security-hygiene'].map(key=>[key,true]));
  await fresh.query(`INSERT INTO pilot_operations_evidence_manifests(
    candidate_id,org_id,workspace_id,environment_id,git_sha,build_identity,workflow_name,
    workflow_run_id,workflow_head_sha,manifest_sha256,schema_version,migration_compatible,
    required_gates,status,verified_at) VALUES($1,$2,$3,$4,$5,$6,'Pilot Operations','31329036281',$5,$7,$8,true,$9::jsonb,'verified',now())`,[
    valid.resourceId,fixture.org,fixture.workspace,environment.resourceId,validPayload.gitSha,validPayload.buildIdentity,
    validPayload.evidenceManifestSha256,validPayload.schemaVersion,JSON.stringify(gates),
  ]);
  const validated=(await command('validate_release_candidate','postgres-validate-exact-evidence',{candidateId:valid.resourceId},valid.version)).rows[0].result;
  const staleReviewerAuthorizationVersion=fixture.authorizationVersions[fixture.reviewer];
  const reviewerAuthorizationVersion=Number((await fresh.query(
    'SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',
    [fixture.org,fixture.reviewer],
  )).rows[0].version);
  assert.ok(reviewerAuthorizationVersion > staleReviewerAuthorizationVersion,'granting retained operations capabilities must advance reviewer authority');
  await assert.rejects(
    command('approve_promotion','postgres-approve-stale-authority',{candidateId:valid.resourceId},validated.version,undefined,fixture.reviewer,staleReviewerAuthorizationVersion),
    /PR1B_AUTHORIZATION_STALE/,
  );
  const approved=(await command('approve_promotion','postgres-approve-separate-actor',{candidateId:valid.resourceId},validated.version,undefined,fixture.reviewer,reviewerAuthorizationVersion)).rows[0].result;
  const promoted=(await command('simulate_promotion','postgres-simulate-non-live',{candidateId:valid.resourceId,target:'non_live'},approved.version)).rows[0].result;
  assert.equal(promoted.lifecycle,'promoted_non_live');

  const tenant=(await command('bootstrap_tenant','postgres-bootstrap',{environmentId:environment.resourceId},0)).rows[0].result;
  const deprovisioned=(await command('deprovision_tenant','postgres-deprovision',{},tenant.version??1)).rows[0].result;
  assert.equal(deprovisioned.lifecycle,'deprovisioned');
  await assert.rejects(fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4)',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion]),/TENANT_DEPROVISIONED/);
  await assert.rejects(command('register_release_candidate','postgres-deprovision-denial',{...candidatePayload,gitSha:'b'.repeat(40)},0),/TENANT_DEPROVISIONED/);
  const reactivated=(await command('reactivate_tenant','postgres-reactivate',{},2)).rows[0].result;
  assert.equal(reactivated.lifecycle,'active');
  await fresh.query('SET ROLE authenticated');
  await assert.rejects(fresh.query('SELECT count(*) n FROM pilot_operations_release_candidates'),/permission denied/,'authenticated cross-tenant reads must disclose no rows or counts');
  await fresh.query('RESET ROLE');
  console.log('POSTGRES PASS exact evidence, lifecycle/SoD, required versions, maintenance, replay, deprovision/reactivation, and tenant non-disclosure');
  await mkdir('artifacts/pilot-operations',{recursive:true});
  await writeFile('artifacts/pilot-operations/postgres-execution.json',JSON.stringify({
    kind:'executed_disposable_postgresql',postgresMajor:16,head:process.env.CANDIDATE_SHA??null,runId:process.env.GITHUB_RUN_ID??null,
    freshApplied:true,acceptedBaselineUpgradeApplied:true,forcedRlsVerified:true,maintenanceDenied:true,concurrentReplayVerified:true,
    expectedVersionVerified:true,staleAuthorizationDenied:true,evidenceBindingVerified:true,separationOfDutyVerified:true,deprovisionRevocationVerified:true,
    crossTenantDisclosureDenied:true,liveActivationAuthorized:false,
  },null,2)+'\n');
} finally {
  for(const client of clients.slice(1).reverse()) await client.end().catch(()=>{});
  if(admin){for(const name of Object.values(names)) await dropDatabase(admin,name).catch(()=>{});await admin.end().catch(()=>{});}
}
