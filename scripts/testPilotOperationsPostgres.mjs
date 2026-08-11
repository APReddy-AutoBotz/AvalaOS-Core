import assert from 'node:assert/strict';
import process from 'node:process';
import {mkdir, writeFile} from 'node:fs/promises';
import {
  applyMigrations, bootstrapAuth, connect, createDatabase, databaseUrlFor, dropDatabase, ensureClusterRoles,
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
    const tables=['pilot_operations_environments','pilot_operations_release_candidates','pilot_operations_release_events','pilot_operations_provider_bindings','pilot_operations_tenants','pilot_operations_recovery_drills','pilot_operations_command_receipts','pilot_operations_audit_events','pilot_operations_evidence_manifests','pilot_operations_promotion_sequences','pilot_operations_promotion_history','pilot_operations_candidate_sequences','pilot_operations_candidate_history'];
    const rls=(await db.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",[tables])).rows;
    assert.equal(rls.length,tables.length);
    for(const row of rls) assert.deepEqual([row.relrowsecurity,row.relforcerowsecurity],[true,true],row.relname);
    for(const table of tables) assert.equal((await db.query("SELECT has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') allowed",[`public.${table}`])).rows[0].allowed,false,table);
    assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.pilot_operations_command(uuid,uuid,uuid,text,uuid,text,text,bigint,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("SELECT has_function_privilege('service_role','public.pilot_operations_command(uuid,uuid,uuid,text,uuid,text,text,bigint,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed,true);
    console.log(`POSTGRES PASS ${label}: applied schema, forced RLS, tenant-table denial, and service-only command authority`);
  }
  const fixture=await createCommittedStudioFixture(fresh);
  await fresh.query("INSERT INTO role_capabilities(role_id,capability_key) SELECT $1,capability_key FROM capabilities WHERE capability_key IN('operations.read','operations.manage','release.manage','release.validate','release.approve','release.promote','org.admin') ON CONFLICT DO NOTHING",[fixture.role]);
  const reviewerRole='97000000-0000-4000-8000-000000000070';
  await fresh.query("INSERT INTO roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Pilot approval reviewer','pilot-approval-reviewer','organization','[]')",[reviewerRole,fixture.org]);
  await fresh.query("INSERT INTO role_capabilities(role_id,capability_key) SELECT $1,capability_key FROM capabilities WHERE capability_key IN('operations.read','release.approve') ON CONFLICT DO NOTHING",[reviewerRole]);
  await fresh.query('UPDATE organization_members SET role_id=$1 WHERE org_id=$2 AND user_id=$3',[reviewerRole,fixture.org,fixture.reviewer]);
  const recoveryActor='97000000-0000-4000-8000-000000000071', recoverySeedRole='97000000-0000-4000-8000-000000000072';
  await fresh.query('INSERT INTO auth.users(id) VALUES($1)',[recoveryActor]);
  await fresh.query("INSERT INTO profiles(id,email) VALUES($1,'recovery-operator@pilot.invalid')",[recoveryActor]);
  await fresh.query("INSERT INTO roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Recovery seed','recovery-seed','organization','[]')",[recoverySeedRole,fixture.org]);
  await fresh.query("INSERT INTO organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')",[fixture.org,recoveryActor,recoverySeedRole]);
  await fresh.query("INSERT INTO workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')",[fixture.org,fixture.workspace,recoveryActor]);
  const authorizationVersion=Number((await fresh.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,fixture.requester])).rows[0].version);
  const provisioned=(await fresh.query('SELECT public.hosted_pilot_provision_recovery_operator($1,$2,$3,$4,$5) result',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion,recoveryActor])).rows[0].result;
  assert.deepEqual(provisioned.capabilities,['operations.read','release.promote']); assert.equal(provisioned.approvalAuthority,false); assert.equal(provisioned.productionAuthorized,false);
  let recoveryAuthorizationVersion=Number((await fresh.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,recoveryActor])).rows[0].version);
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
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM pilot_operations_candidate_history WHERE environment_id=$1',[environment.resourceId])).rows[0].n),1,'concurrent same-key registration must converge to one candidate ordinal');
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
  const onePromotedProjection=(await fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4) result',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion])).rows[0].result;
  assert.equal(onePromotedProjection.rollback.eligible,false);
  assert.equal(onePromotedProjection.rollback.reason,'ROLLBACK_PRIOR_CANDIDATE_NOT_FOUND','one promoted release plus unrelated pending work must remain rollback-ineligible');

  const nextPayload={...validPayload,gitSha:'1'.repeat(40),buildIdentity:'postgres-rollback-current',evidenceManifestSha256:'2'.repeat(64)};
  const next=(await command('register_release_candidate','postgres-rollback-candidate',nextPayload,0)).rows[0].result;
  await fresh.query(`INSERT INTO pilot_operations_evidence_manifests(candidate_id,org_id,workspace_id,environment_id,git_sha,build_identity,workflow_name,workflow_run_id,workflow_head_sha,manifest_sha256,schema_version,migration_compatible,required_gates,status,verified_at) VALUES($1,$2,$3,$4,$5,$6,'Pilot Operations','31329036282',$5,$7,$8,true,$9::jsonb,'verified',now())`,[next.resourceId,fixture.org,fixture.workspace,environment.resourceId,nextPayload.gitSha,nextPayload.buildIdentity,nextPayload.evidenceManifestSha256,nextPayload.schemaVersion,JSON.stringify(gates)]);
  const nextValidated=(await command('validate_release_candidate','postgres-rollback-validate',{candidateId:next.resourceId},next.version)).rows[0].result;
  const nextApproved=(await command('approve_promotion','postgres-rollback-approve',{candidateId:next.resourceId},nextValidated.version,undefined,fixture.reviewer,reviewerAuthorizationVersion)).rows[0].result;
  const nextPromoted=(await command('simulate_promotion','postgres-rollback-promote',{candidateId:next.resourceId,target:'non_live'},nextApproved.version)).rows[0].result;
  // Historical approval cannot be erased by later recovery provisioning. Rotation back to
  // the dedicated operator must atomically fence the former owner and effective role.
  await fresh.query("UPDATE profiles SET email='historical-approver@pilot.invalid' WHERE id=$1",[fixture.reviewer]);
  await fresh.query('SELECT public.hosted_pilot_provision_recovery_operator($1,$2,$3,$4,$5)',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion,fixture.reviewer]);
  const reviewerRecoveryVersion=Number((await fresh.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,fixture.reviewer])).rows[0].version);
  const rollbackPayloadForHistory={candidateId:next.resourceId,environmentId:environment.resourceId,rollbackTargetCandidateId:valid.resourceId,rollbackTargetVersion:promoted.version};
  await assert.rejects(command('rollback_non_live_promotion','postgres-rollback-historical-approver',rollbackPayloadForHistory,nextPromoted.version,undefined,fixture.reviewer,reviewerRecoveryVersion),/SEPARATION_OF_DUTY_REQUIRED/);
  await fresh.query('SELECT public.hosted_pilot_provision_recovery_operator($1,$2,$3,$4,$5)',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion,recoveryActor]);
  recoveryAuthorizationVersion=Number((await fresh.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,recoveryActor])).rows[0].version);
  assert.equal(Number((await fresh.query("SELECT count(*) n FROM hosted_pilot_recovery_operators WHERE org_id=$1 AND workspace_id=$2 AND lifecycle='active'",[fixture.org,fixture.workspace])).rows[0].n),1);
  assert.equal((await fresh.query('SELECT lifecycle FROM hosted_pilot_recovery_operators WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3',[fixture.org,fixture.workspace,fixture.reviewer])).rows[0].lifecycle,'revoked');
  assert.equal((await fresh.query('SELECT role_id IS NULL AS fenced FROM workspace_memberships WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3',[fixture.org,fixture.workspace,fixture.reviewer])).rows[0].fenced,true);
  const rollbackProjection=(await fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4) result',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion])).rows[0].result;
  assert.equal(rollbackProjection.release.id,candidate.resourceId,'the unrelated draft remains separately actionable');
  assert.equal(rollbackProjection.promotedRelease.id,next.resourceId,'current promoted truth must come from immutable promotion history');
  assert.equal(rollbackProjection.rollback.eligible,true); assert.equal(rollbackProjection.rollback.targetCandidateId,valid.resourceId);
  await command('set_runtime_control','postgres-rollback-maintenance-on',{environmentId:environment.resourceId,maintenance:true,readOnly:false},3);
  const maintenanceProjection=(await fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4) result',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion])).rows[0].result;
  assert.equal(maintenanceProjection.rollback.eligible,false); assert.equal(maintenanceProjection.rollback.reason,'MAINTENANCE_MODE');
  await command('set_runtime_control','postgres-rollback-maintenance-off',{environmentId:environment.resourceId,maintenance:false,readOnly:false},4);
  await command('set_runtime_control','postgres-rollback-readonly-on',{environmentId:environment.resourceId,maintenance:false,readOnly:true},5);
  const readOnlyProjection=(await fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4) result',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion])).rows[0].result;
  assert.equal(readOnlyProjection.rollback.eligible,false); assert.equal(readOnlyProjection.rollback.reason,'READ_ONLY_MODE');
  await command('set_runtime_control','postgres-rollback-readonly-off',{environmentId:environment.resourceId,maintenance:false,readOnly:false},6);
  const rollbackPayload={candidateId:next.resourceId,environmentId:environment.resourceId,rollbackTargetCandidateId:valid.resourceId,rollbackTargetVersion:promoted.version};
  const assertNonDisclosingAuthorityDenial=(promise,label)=>assert.rejects(
    promise,
    error=>{
      assert.match(String(error?.message),/PR1B_NOT_FOUND/,`${label} must use the canonical non-disclosing authority result`);
      assert.doesNotMatch(String(error?.message),/PR1B_FORBIDDEN/,`${label} must not disclose capability membership`);
      return true;
    },
  );
  await assertNonDisclosingAuthorityDenial(command('rollback_non_live_promotion','postgres-rollback-same-promoter',rollbackPayload,nextPromoted.version),'unprovisioned original promoter');
  await assert.rejects(command('rollback_non_live_promotion','postgres-rollback-stale-operator',rollbackPayload,nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion-1),/PR1B_AUTHORIZATION_STALE/);
  const nonDisclosingRollbackCases=[
    ['active in-tenant approval-only actor',()=>command('rollback_non_live_promotion','postgres-rollback-approver',rollbackPayload,nextPromoted.version,undefined,fixture.reviewer,reviewerAuthorizationVersion)],
    ['cross-tenant actor',()=>fresh.query(
      'SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',
      [recoveryActor,'97000000-0000-4000-8000-000000000080','97000000-0000-4000-8000-000000000081','rollback_non_live_promotion','97000000-0000-4000-8000-000000000082','postgres-cross-tenant-rollback',JSON.stringify(rollbackPayload),recoveryAuthorizationVersion,nextPromoted.version,JSON.stringify(rollbackPayload)],
    )],
    ['nonexistent actor',()=>command('rollback_non_live_promotion','postgres-rollback-nonexistent-actor',rollbackPayload,nextPromoted.version,undefined,'97000000-0000-4000-8000-000000000083',1)],
  ];
  for(const [label,attempt] of nonDisclosingRollbackCases) await assertNonDisclosingAuthorityDenial(attempt(),label);
  await fresh.query("UPDATE hosted_pilot_recovery_operators SET lifecycle='disabled' WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3",[fixture.org,fixture.workspace,recoveryActor]);
  await assertNonDisclosingAuthorityDenial(command('rollback_non_live_promotion','postgres-rollback-disabled-record',rollbackPayload,nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion),'disabled provisioned operator record');
  assert.equal(Number((await fresh.query("SELECT count(*) n FROM pilot_operations_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND operation='rollback_non_live_promotion'",[fixture.org,fixture.workspace])).rows[0].n),0,'operator lifecycle denial must happen before receipt creation');
  await fresh.query("UPDATE hosted_pilot_recovery_operators SET lifecycle='revoked' WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3",[fixture.org,fixture.workspace,recoveryActor]);
  await assertNonDisclosingAuthorityDenial(command('rollback_non_live_promotion','postgres-rollback-revoked-record',rollbackPayload,nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion),'revoked provisioned operator record');
  await fresh.query("UPDATE hosted_pilot_recovery_operators SET lifecycle='active' WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3",[fixture.org,fixture.workspace,recoveryActor]);
  await fresh.query("UPDATE organization_members SET status='disabled',disabled_at=now() WHERE org_id=$1 AND user_id=$2",[fixture.org,recoveryActor]);
  recoveryAuthorizationVersion=Number((await fresh.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,recoveryActor])).rows[0].version);
  await assertNonDisclosingAuthorityDenial(command('rollback_non_live_promotion','postgres-rollback-disabled-operator',rollbackPayload,nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion),'disabled recovery operator');
  await fresh.query("UPDATE organization_members SET status='removed',disabled_at=now() WHERE org_id=$1 AND user_id=$2",[fixture.org,recoveryActor]);
  recoveryAuthorizationVersion=Number((await fresh.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,recoveryActor])).rows[0].version);
  await assertNonDisclosingAuthorityDenial(command('rollback_non_live_promotion','postgres-rollback-revoked-operator',rollbackPayload,nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion),'revoked recovery operator');
  await fresh.query("UPDATE organization_members SET status='active',disabled_at=NULL WHERE org_id=$1 AND user_id=$2",[fixture.org,recoveryActor]);
  recoveryAuthorizationVersion=Number((await fresh.query('SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,recoveryActor])).rows[0].version);
  const rollback=(await command('rollback_non_live_promotion','postgres-rollback',rollbackPayload,nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion)).rows[0].result;
  const replay=(await command('rollback_non_live_promotion','postgres-rollback',rollbackPayload,nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion)).rows[0].result;
  assert.deepEqual(replay,rollback); assert.equal(rollback.liveActivationAuthorized,false);
  await assert.rejects(command('rollback_non_live_promotion','postgres-rollback',{...rollbackPayload,rollbackTargetVersion:promoted.version+1},nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion),/IDEMPOTENCY_CONFLICT/);
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM pilot_operations_rollback_events WHERE org_id=$1 AND workspace_id=$2',[fixture.org,fixture.workspace])).rows[0].n),1);
  await assert.rejects(command('rollback_non_live_promotion','postgres-rollback-stale',rollbackPayload,nextPromoted.version,undefined,recoveryActor,recoveryAuthorizationVersion),/VERSION_CONFLICT|ROLLBACK_NOT_ELIGIBLE/);

  const evidenceArgs=[fixture.org,fixture.workspace,environment.resourceId,'Pilot Operations','31329036283','3'.repeat(40),'4'.repeat(64),'5'.repeat(64),candidatePayload.schemaVersion,fixture.requester];
  const evidenceCount=async()=>Number((await fresh.query('SELECT count(*) n FROM pilot_operations_recovery_evidence_ingestions WHERE org_id=$1 AND workspace_id=$2',[fixture.org,fixture.workspace])).rows[0].n);
  const beforeEvidence=await evidenceCount();
  await command('set_runtime_control','postgres-recovery-maintenance',{environmentId:environment.resourceId,maintenance:true,readOnly:false,disabledFeatures:[]},7);
  await assert.rejects(fresh.query('SELECT public.pilot_operations_ingest_recovery_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',evidenceArgs),/MAINTENANCE_MODE/); assert.equal(await evidenceCount(),beforeEvidence);
  await command('set_runtime_control','postgres-recovery-read-only',{environmentId:environment.resourceId,maintenance:false,readOnly:true,disabledFeatures:[]},8);
  await assert.rejects(fresh.query('SELECT public.pilot_operations_ingest_recovery_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',evidenceArgs),/READ_ONLY_MODE/); assert.equal(await evidenceCount(),beforeEvidence);
  await command('set_runtime_control','postgres-recovery-disabled',{environmentId:environment.resourceId,maintenance:false,readOnly:false,disabledFeatures:['recovery']},9);
  await assert.rejects(fresh.query('SELECT public.pilot_operations_ingest_recovery_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',evidenceArgs),/FEATURE_DISABLED/); assert.equal(await evidenceCount(),beforeEvidence);
  await command('set_runtime_control','postgres-recovery-enabled',{environmentId:environment.resourceId,maintenance:false,readOnly:false,disabledFeatures:[]},10);
  const recoveryCommitted=(await fresh.query('SELECT public.pilot_operations_ingest_recovery_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',evidenceArgs)).rows[0].result; assert.equal(await evidenceCount(),beforeEvidence+1);
  const recoveryReplay=(await fresh.query('SELECT public.pilot_operations_ingest_recovery_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',evidenceArgs)).rows[0].result; assert.deepEqual(recoveryReplay,recoveryCommitted); assert.equal(await evidenceCount(),beforeEvidence+1);

  const tenant=(await command('bootstrap_tenant','postgres-bootstrap',{environmentId:environment.resourceId},0)).rows[0].result;
  await assertNonDisclosingAuthorityDenial(command('bootstrap_tenant','postgres-bootstrap',{environmentId:environment.resourceId},0,undefined,fixture.reviewer,reviewerAuthorizationVersion),'approval-only bootstrap replay actor');
  const pendingPayload={...candidatePayload,gitSha:'6'.repeat(40),buildIdentity:'postgres-pending-after-promotion',evidenceManifestSha256:'7'.repeat(64)};
  const pending=(await command('register_release_candidate','postgres-pending-after-promotion',pendingPayload,0)).rows[0].result;
  const pendingProjection=(await fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4) result',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion])).rows[0].result;
  assert.equal(pendingProjection.release.id,pending.resourceId); assert.equal(pendingProjection.promotedRelease.id,valid.resourceId);
  assert.equal(pendingProjection.rollback.eligible,true); assert.equal(pendingProjection.rollback.targetCandidateId,next.resourceId,'post-rollback history must select the immediately preceding promoted release');
  assert.equal(pendingProjection.health.schemaCompatible,false); assert.ok(pendingProjection.blockers.includes('SCHEMA_INCOMPATIBLE'));
  assert.equal(pendingProjection.recovery.backupState,'completed'); assert.equal(pendingProjection.recovery.restoreState,'completed');
  const deprovisioned=(await command('deprovision_tenant','postgres-deprovision',{},tenant.version??1)).rows[0].result;
  assert.equal(deprovisioned.lifecycle,'deprovisioned');
  await assert.rejects(command('register_release_candidate','postgres-pending-after-promotion',pendingPayload,0),/TENANT_DEPROVISIONED/,'current tenant lifecycle must precede committed receipt replay');
  const evidenceAfterDeprovision=[...evidenceArgs]; evidenceAfterDeprovision[4]='31329036284'; evidenceAfterDeprovision[6]='8'.repeat(64); evidenceAfterDeprovision[7]='9'.repeat(64);
  await assert.rejects(fresh.query('SELECT public.pilot_operations_ingest_recovery_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',evidenceAfterDeprovision),/TENANT_DEPROVISIONED/); assert.equal(await evidenceCount(),beforeEvidence+1);
  await assert.rejects(
    fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4)',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion]),
    /TENANT_DEPROVISIONED/,
    'a retained authorized actor may learn the bounded deprovisioned lifecycle state',
  );
  await assert.rejects(
    fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4)',[
      '99000000-0000-4000-8000-999999999999',fixture.org,fixture.workspace,authorizationVersion,
    ]),
    /PR1B_NOT_FOUND/,
    'an actor without tenant authority must receive only the non-disclosing denial',
  );
  await assert.rejects(command('register_release_candidate','postgres-deprovision-denial',{...candidatePayload,gitSha:'b'.repeat(40)},0),/TENANT_DEPROVISIONED/);
  const reactivated=(await command('reactivate_tenant','postgres-reactivate',{},2)).rows[0].result;
  assert.equal(reactivated.lifecycle,'active');
  const postReactivation=(await command('register_release_candidate','postgres-reactivation-authorized',{...candidatePayload,gitSha:'c'.repeat(40)},0)).rows[0].result;
  assert.equal(postReactivation.lifecycle,'draft','reactivation must restore the governed authorized mutation path');

  // Registration transaction A starts first without taking the environment lock.
  // B registers first; A registers last and must own actionable-current truth even
  // though A's transaction timestamp is older.
  const registrationA=await connect(databaseUrlFor(adminUrl,names.fresh)); clients.push(registrationA);
  const registrationB=await connect(databaseUrlFor(adminUrl,names.fresh)); clients.push(registrationB);
  let registrationRequest=850;
  const registerOn=(db,key,payload)=>db.query('SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) result',[fixture.requester,fixture.org,fixture.workspace,'register_release_candidate',`99000000-0000-4000-8000-${String(registrationRequest++).padStart(12,'0')}`,key,JSON.stringify(payload),authorizationVersion,0,JSON.stringify(payload)]);
  const registrationPayloadB={...candidatePayload,gitSha:'8'.repeat(40),buildIdentity:'postgres-registration-first',evidenceManifestSha256:'8'.repeat(64)};
  const registrationPayloadA={...candidatePayload,gitSha:'9'.repeat(40),buildIdentity:'postgres-registration-delayed',evidenceManifestSha256:'9'.repeat(64)};
  await registrationA.query('BEGIN'); await registrationA.query('SELECT now()');
  const registeredB=(await registerOn(registrationB,'postgres-registration-first',registrationPayloadB)).rows[0].result;
  const registeredA=(await registerOn(registrationA,'postgres-registration-delayed',registrationPayloadA)).rows[0].result;
  await registrationA.query('COMMIT');
  const registrationProjection=(await fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4) result',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion])).rows[0].result;
  assert.equal(registrationProjection.release.id,registeredA.resourceId,'last environment-serialized registration must be actionable current');
  const candidateOrdinals=(await fresh.query('SELECT candidate_ordinal FROM pilot_operations_candidate_history WHERE environment_id=$1 ORDER BY candidate_ordinal',[environment.resourceId])).rows.map(row=>Number(row.candidate_ordinal));
  assert.deepEqual(candidateOrdinals,Array.from({length:candidateOrdinals.length},(_,index)=>index+1));
  const candidateHistoryCount=candidateOrdinals.length;
  assert.deepEqual((await registerOn(registrationB,'postgres-registration-first',registrationPayloadB)).rows[0].result,registeredB);
  assert.deepEqual((await registerOn(registrationA,'postgres-registration-delayed',registrationPayloadA)).rows[0].result,registeredA);
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM pilot_operations_candidate_history WHERE environment_id=$1',[environment.resourceId])).rows[0].n),candidateHistoryCount,'exact registration replay must allocate no candidate ordinal');

  // Transaction A starts first but deliberately does not acquire the environment
  // lock. Transaction B promotes first; A then promotes and must receive the later
  // ordinal even though its transaction timestamp is older.
  const preparePromotion=async(label,digit)=>{
    const payload={...validPayload,gitSha:digit.repeat(40),buildIdentity:`postgres-serialized-${label}`,evidenceManifestSha256:digit.repeat(64)};
    const registered=(await command('register_release_candidate',`postgres-serialized-register-${label}`,payload,0)).rows[0].result;
    await fresh.query(`INSERT INTO pilot_operations_evidence_manifests(candidate_id,org_id,workspace_id,environment_id,git_sha,build_identity,workflow_name,workflow_run_id,workflow_head_sha,manifest_sha256,schema_version,migration_compatible,required_gates,status,verified_at) VALUES($1,$2,$3,$4,$5,$6,'Pilot Operations',$7,$5,$8,$9,true,$10::jsonb,'verified',now())`,[registered.resourceId,fixture.org,fixture.workspace,environment.resourceId,payload.gitSha,payload.buildIdentity,label==='delayed'?'31329036285':'31329036286',payload.evidenceManifestSha256,payload.schemaVersion,JSON.stringify(gates)]);
    const checked=(await command('validate_release_candidate',`postgres-serialized-validate-${label}`,{candidateId:registered.resourceId},registered.version)).rows[0].result;
    const accepted=(await command('approve_promotion',`postgres-serialized-approve-${label}`,{candidateId:registered.resourceId},checked.version,undefined,fixture.reviewer,reviewerAuthorizationVersion)).rows[0].result;
    return {registered,accepted};
  };
  const delayed=await preparePromotion('delayed','4');
  const firstSerialized=await preparePromotion('first','5');
  const delayedClient=await connect(databaseUrlFor(adminUrl,names.fresh)); clients.push(delayedClient);
  const firstClient=await connect(databaseUrlFor(adminUrl,names.fresh)); clients.push(firstClient);
  let serializedRequest=700;
  const promoteOn=(db,key,item)=>db.query('SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) result',[fixture.requester,fixture.org,fixture.workspace,'simulate_promotion',`99000000-0000-4000-8000-${String(serializedRequest++).padStart(12,'0')}`,key,JSON.stringify({candidateId:item.registered.resourceId,target:'non_live'}),authorizationVersion,item.accepted.version,JSON.stringify({candidateId:item.registered.resourceId,target:'non_live'})]);
  await delayedClient.query('BEGIN'); await delayedClient.query('SELECT now()');
  await promoteOn(firstClient,'postgres-serialized-first',firstSerialized);
  await promoteOn(delayedClient,'postgres-serialized-delayed',delayed); await delayedClient.query('COMMIT');
  const serializedProjection=(await fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4) result',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion])).rows[0].result;
  assert.equal(serializedProjection.promotedRelease.id,delayed.registered.resourceId,'serialized lock/commit order, not transaction start time, owns current truth');
  assert.equal(serializedProjection.rollback.targetCandidateId,firstSerialized.registered.resourceId);
  const ordinals=(await fresh.query('SELECT promotion_ordinal FROM pilot_operations_promotion_history WHERE environment_id=$1 ORDER BY promotion_ordinal',[environment.resourceId])).rows.map(row=>Number(row.promotion_ordinal));
  assert.deepEqual(ordinals,Array.from({length:ordinals.length},(_,index)=>index+1),'committed promotion sequence must remain gap-free');
  const beforeReplay=ordinals.length;
  const serializedReplay=(await promoteOn(firstClient,'postgres-serialized-first',firstSerialized)).rows[0].result;
  assert.equal(serializedReplay.resourceId,firstSerialized.registered.resourceId);
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM pilot_operations_promotion_history WHERE environment_id=$1',[environment.resourceId])).rows[0].n),beforeReplay,'exact replay must not allocate history');
  await fresh.query('SET ROLE authenticated');
  await assert.rejects(fresh.query('SELECT count(*) n FROM pilot_operations_release_candidates'),/permission denied/,'authenticated cross-tenant reads must disclose no rows or counts');
  await fresh.query('RESET ROLE');
  console.log('POSTGRES PASS exact evidence, lifecycle/SoD, required versions, maintenance, replay, deprovision/reactivation, and tenant non-disclosure');
  await mkdir('artifacts/pilot-operations',{recursive:true});
  await writeFile('artifacts/pilot-operations/postgres-execution.json',JSON.stringify({
    kind:'executed_disposable_postgresql',postgresMajor:16,head:process.env.CANDIDATE_SHA??null,runId:process.env.GITHUB_RUN_ID??null,
    freshApplied:true,acceptedBaselineUpgradeApplied:true,forcedRlsVerified:true,maintenanceDenied:true,concurrentReplayVerified:true,
    expectedVersionVerified:true,staleAuthorizationDenied:true,evidenceBindingVerified:true,separationOfDutyVerified:true,deprovisionRevocationVerified:true,
    deprovisionLifecycleDisclosureBounded:true,deprovisionNonDisclosureVerified:true,deprovisionReplayDenied:true,recoveryDeprovisionDenied:true,actorBoundBootstrapReplayVerified:true,pendingCandidateProjectionVerified:true,canonicalRecoveryProjectionVerified:true,schemaReadinessConsistent:true,reactivationAuthorizedPathVerified:true,rollbackEligibleVerified:true,rollbackReplayVerified:true,rollbackZeroHostedMutationVerified:true,recoveryRuntimeControlsVerified:true,recoveryZeroMutationOnDenialVerified:true,liveActivationStopVerified:true,
    promotionHistorySerialized:true,invertedTransactionOrderVerified:true,gapFreePromotionSequenceVerified:true,pendingRegistrationSerialized:true,invertedRegistrationOrderVerified:true,gapFreeCandidateSequenceVerified:true,
    crossTenantDisclosureDenied:true,liveActivationAuthorized:false,
  },null,2)+'\n');
} finally {
  for(const client of clients.slice(1).reverse()) await client.end().catch(()=>{});
  if(admin){for(const name of Object.values(names)) await dropDatabase(admin,name).catch(()=>{});await admin.end().catch(()=>{});}
}
