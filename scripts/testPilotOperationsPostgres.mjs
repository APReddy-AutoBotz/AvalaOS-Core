import assert from 'node:assert/strict';
import process from 'node:process';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {
  applyMigrations, bootstrapAuth, connect, createDatabase, databaseUrlFor, dropDatabase, ensureClusterRoles,
  featureMigration, migrationNames,
} from './pilotOperationsPostgresSupport.mjs';
import {loadCanonicalMigrationInventory, normalizeRoutineIdentityArguments} from './hostedPilotActivation.mjs';
import {createCommittedStudioFixture} from './studioArtifactPostgresFixture.mjs';
import {
  HOSTED_EVIDENCE_FAMILIES,HOSTED_EVIDENCE_FAMILY_CONTRACTS,HOSTED_SCENARIO_SOURCE_PATH,HOSTED_SCENARIO_SOURCE_SHA256,
  hostedEvidenceFamilyContractSha256,
} from './hostedEvidenceFamilyAttestation.mjs';

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

const normalizedPublicRoutineIdentity = ({name,arguments: identityArguments}) =>
  `public.${name}(${normalizeRoutineIdentityArguments(identityArguments)})`;

const assertExactCatalogParity = (actual, expected, message) =>
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), message);

try {
  admin=await connect(adminUrl); clients.push(admin); await ensureClusterRoles(admin);
  const fresh=await createDatabase(admin,adminUrl,names.fresh); clients.push(fresh); await bootstrapAuth(fresh); await applyMigrations(fresh,migrationNames);
  const upgrade=await createDatabase(admin,adminUrl,names.upgrade); clients.push(upgrade); await bootstrapAuth(upgrade); await applyMigrations(upgrade,baseline); await applyMigrations(upgrade,correction);
  const canonical=await loadCanonicalMigrationInventory();
  for(const [label,db] of [['fresh',fresh],['accepted-baseline upgrade',upgrade]]) {
    const relations=(await db.query(`select 'public.'||c.relname||':'||(case c.relkind when 'r' then 'table' when 'p' then 'table' when 'v' then 'view' when 'm' then 'materialized_view' when 'S' then 'sequence' when 'f' then 'foreign_table' end) identity from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in('r','p','v','m','S','f') order by identity`)).rows.map(row=>row.identity);
    const routineRows=(await db.query(`
      select p.proname name, pg_get_function_identity_arguments(p.oid) arguments,
        exists (
          select 1 from pg_depend d join pg_extension e on e.oid=d.refobjid
          where d.classid='pg_proc'::regclass and d.objid=p.oid
            and d.refclassid='pg_extension'::regclass and d.deptype='e'
        ) extension_owned
      from pg_proc p
      where p.pronamespace='public'::regnamespace
      order by p.proname, pg_get_function_identity_arguments(p.oid)
    `)).rows;
    const routines=routineRows.filter(row=>!row.extension_owned).map(normalizedPublicRoutineIdentity);
    const canonicalRelations=canonical.relations.filter(value=>value.startsWith('public.'));
    const canonicalRoutines=canonical.routines.filter(value=>value.startsWith('public.'));
    assertExactCatalogParity(relations,canonicalRelations,`${label} relation catalog must equal checkout-derived final canonical state`);
    assertExactCatalogParity(routines,canonicalRoutines,`${label} routine catalog must equal checkout-derived final canonical state`);

    assert.equal(
      normalizeRoutineIdentityArguments('p_org uuid, p_workspace uuid, p_note text DEFAULT NULL'),
      normalizeRoutineIdentityArguments('uuid, uuid, text'),
      `${label} named and type-only PostgreSQL identities must normalize identically`,
    );
    assert.ok(
      routineRows.some(row=>row.extension_owned && row.name==='digest'),
      `${label} must exercise an extension-owned pgcrypto routine`,
    );
    assert.equal(
      routines.some(identity=>identity.startsWith('public.digest(')),
      false,
      `${label} extension-owned pgcrypto routines must not become application routines`,
    );
    assert.throws(
      ()=>assertExactCatalogParity(routines.slice(1),canonicalRoutines,`${label} missing routine regression`),
      /missing routine regression/,
      `${label} a deliberately missing canonical application routine must fail parity`,
    );
    assert.throws(
      ()=>assertExactCatalogParity([...routines,'public.unexpected_application_routine(uuid)'],canonicalRoutines,`${label} extra routine regression`),
      /extra routine regression/,
      `${label} a deliberately extra non-extension application routine must fail parity`,
    );
  }
  for (const [label,db] of [['fresh',fresh],['accepted-baseline upgrade',upgrade]]) {
    assert.equal(Number((await db.query("SELECT current_setting('server_version_num')::int version")).rows[0].version)>=160000,true);
    const tables=['pilot_operations_environments','pilot_operations_release_candidates','pilot_operations_release_events','pilot_operations_provider_bindings','pilot_operations_tenants','pilot_operations_recovery_drills','pilot_operations_command_receipts','pilot_operations_audit_events','pilot_operations_evidence_manifests','pilot_operations_promotion_sequences','pilot_operations_promotion_history','pilot_operations_candidate_sequences','pilot_operations_candidate_history'];
    const rls=(await db.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",[tables])).rows;
    assert.equal(rls.length,tables.length);
    for(const row of rls) assert.deepEqual([row.relrowsecurity,row.relforcerowsecurity],[true,true],row.relname);
    for(const table of tables) assert.equal((await db.query("SELECT has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') allowed",[`public.${table}`])).rows[0].allowed,false,table);
    assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.pilot_operations_command(uuid,uuid,uuid,text,uuid,text,text,bigint,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("SELECT has_function_privilege('service_role','public.pilot_operations_command(uuid,uuid,uuid,text,uuid,text,text,bigint,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed,true);
    assert.equal((await db.query('SELECT public.hosted_pilot_assert_current_identity() tip')).rows[0].tip,canonical.tip.slice(0,14));
    const digestArgs=['a'.repeat(40),'.github/workflows/hosted-pilot-activation-evidence-producer.yml','31565268188',1,
      `sha256:${'b'.repeat(64)}`,`sha256:${'c'.repeat(64)}`,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',7];
    const evidenceDigest=async args=>(await db.query('SELECT public.hosted_pilot_executed_evidence_digest($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) digest',args)).rows[0].digest;
    const originalDigest=await evidenceDigest(digestArgs);
    assert.equal(await evidenceDigest(digestArgs),originalDigest,`${label}: identical executed-evidence selectors must hash identically`);
    for(let index=0;index<digestArgs.length;index++) {
      const changed=[...digestArgs];
      changed[index]=index===3||index===10?Number(changed[index])+1:index>=6&&index<=9?String(changed[index]).replace(/.$/,String(index)):`${changed[index]}|boundary`;
      if(index===0) changed[index]='d'.repeat(40);
      if(index===4||index===5) changed[index]=`sha256:${(index===4?'e':'f').repeat(64)}`;
      assert.notEqual(await evidenceDigest(changed),originalDigest,`${label}: selector ${index} must be digest-bound`);
    }
    console.log(`POSTGRES PASS ${label}: applied schema, forced RLS, tenant-table denial, and service-only command authority`);
  }
  const assertIdentityMutationFails=async(db,mutation,label)=>{
    await db.query('BEGIN');
    try {
      await mutation(db);
      await assert.rejects(db.query('SELECT public.hosted_pilot_assert_current_identity()'),/HOSTED_PILOT_IDENTITY_MISMATCH/,label);
    } finally { await db.query('ROLLBACK'); }
  };
  for(const [label,db] of [['fresh',fresh],['accepted-baseline upgrade',upgrade]]) {
    await assertIdentityMutationFails(db,d=>d.query('DELETE FROM avalaos_migrations.applied WHERE filename=$1',[canonical.migrations.at(-1).name]),`${label}: missing latest ledger row must fail closed`);
    await assertIdentityMutationFails(db,async d=>{ await d.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check'); await d.query("UPDATE hosted_pilot_environment_identity SET migration_tip='20260811170000'"); },`${label}: stale marker must fail closed`);
    await assertIdentityMutationFails(db,async d=>{ await d.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check'); await d.query("UPDATE hosted_pilot_environment_identity SET migration_tip='99999999999999'"); },`${label}: forged ahead marker must fail closed`);
    await assertIdentityMutationFails(db,async d=>{ await d.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_environment_class_check'); await d.query("UPDATE hosted_pilot_environment_identity SET environment_class='wrong_environment'"); },`${label}: wrong environment must fail closed`);
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

  const hostedWorkflow='.github/workflows/hosted-pilot-activation-evidence-producer.yml';
  const hostedRun='31587931745', hostedAttempt=1;
  const databaseFingerprint=(await fresh.query(`SELECT 'sha256:'||encode(public.digest(
    convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')||decode('00','hex')||
    convert_to(current_database(),'UTF8')||decode('00','hex')||convert_to(current_user,'UTF8'),'sha256'),'hex') fingerprint`)).rows[0].fingerprint;
  const deploymentFingerprint=`sha256:${'2'.repeat(64)}`;
  const evidenceFamilies=[...HOSTED_EVIDENCE_FAMILIES];
  const constructedFamilyProvenance=family=>{
    const contract=HOSTED_EVIDENCE_FAMILY_CONTRACTS[family];
    const sources=[...new Map(contract.assertions.map(item=>[item.sourcePath,{path:item.sourcePath,sha256:item.sourceSha256}])).values()];
    return {testIds:[...contract.testIds],contractSha256:hostedEvidenceFamilyContractSha256(family),
      assertionOutcomes:contract.assertions.map(item=>({assertionId:item.assertionId,status:'PASS',sourceArtifactSha256:item.sourceSha256,observationSha256:`sha256:${'a'.repeat(64)}`})),sourceArtifacts:sources};
  };
  for(const family of evidenceFamilies){
    const sqlContract=(await fresh.query('SELECT public.hosted_pilot_evidence_family_contract($1) contract',[family])).rows[0].contract;
    assert.deepEqual(sqlContract,{family,testIds:[...HOSTED_EVIDENCE_FAMILY_CONTRACTS[family].testIds],assertions:HOSTED_EVIDENCE_FAMILY_CONTRACTS[family].assertions.map(item=>({...item})),contractSha256:hostedEvidenceFamilyContractSha256(family)},`${family} SQL and JS contracts must be byte-for-byte equivalent`);
  }
  await assert.rejects(fresh.query('SELECT public.hosted_pilot_ingest_exercise_evidence_family($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [fixture.org,fixture.workspace,'97000000-0000-4000-8000-000000000090',nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,
      databaseFingerprint,deploymentFingerprint,'hosted_nonproduction_pilot','tenant-adversarial','a'.repeat(64),'executed_hosted_evidence']),/HOSTED_EVIDENCE_LEGACY_INGEST_DISABLED/);
  const tenantProvenance=constructedFamilyProvenance('tenant-adversarial');
  const v2IngestIdentity='public.hosted_pilot_ingest_exercise_evidence_family_v2(uuid,uuid,uuid,text,text,text,bigint,text,text,text,text,text,jsonb,text,jsonb,jsonb)';
  const callerPassArgs=[fixture.org,fixture.workspace,'97000000-0000-4000-8000-000000000082',nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,
    databaseFingerprint,deploymentFingerprint,'hosted_nonproduction_pilot','tenant-adversarial','hosted_nonproduction_pilot',JSON.stringify(tenantProvenance.testIds),
    tenantProvenance.contractSha256,JSON.stringify(tenantProvenance.assertionOutcomes),JSON.stringify(tenantProvenance.sourceArtifacts)];
  await assert.rejects(fresh.query(
    'SELECT public.hosted_pilot_ingest_exercise_evidence_family_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16::jsonb)',callerPassArgs),
    /HOSTED_EVIDENCE_CALLER_ASSERTIONS_DISABLED/,'even the database owner cannot submit constructed PASS outcomes');
  const internalExecutorIdentity='public.hosted_pilot_execute_evidence_families_internal(uuid,uuid,uuid,text,text,text,bigint,text,text)';
  await fresh.query(`GRANT EXECUTE ON FUNCTION ${internalExecutorIdentity} TO service_role`);
  await fresh.query('SET SESSION AUTHORIZATION service_role');
  try{
    await assert.rejects(fresh.query(
      'SELECT public.hosted_pilot_execute_evidence_families_internal($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [fixture.org,fixture.workspace,'97000000-0000-4000-8000-000000000082',nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,databaseFingerprint,deploymentFingerprint]),
      /HOSTED_EVIDENCE_EXECUTOR_OWNER_REQUIRED/,'true non-owner session_user must not execute hosted proof derivation');
  }finally{
    await fresh.query('RESET SESSION AUTHORIZATION');
    await fresh.query(`REVOKE ALL ON FUNCTION ${internalExecutorIdentity} FROM service_role`);
  }
  await fresh.query('SELECT public.hosted_pilot_bootstrap_synthetic($1,$2,$3,$4,$5)',[fixture.requester,fixture.org,fixture.workspace,authorizationVersion,'bootstrap']);
  const crossScopeExercise='97000000-0000-4000-8000-000000000110';
  const crossScopeObservation=(await fresh.query(
    'SELECT public.hosted_pilot_execute_assertion_scenario($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',[
      'hosted-database--cross-tenant-nondisclosure',fixture.org,fixture.workspace,crossScopeExercise,nextPayload.gitSha,
      hostedWorkflow,hostedRun,hostedAttempt,databaseFingerprint,deploymentFingerprint,
    ])).rows[0].result;
  assert.equal(crossScopeObservation.passed,true,'cross-tenant proof must deny a positively authorized source actor against an existing foreign scope');
  for(const fact of ['sourceScopeProjectionAuthorized','foreignScopeExists','foreignProtectedResourceExists',
    'foreignOrganizationMembershipAbsent','foreignWorkspaceMembershipAbsent','unauthorizedReadDenied','unauthorizedMutationDenied'])
    assert.equal(crossScopeObservation.predicate[fact],true,`${fact} must be observed`);
  assert.equal(Number((await fresh.query(`SELECT count(*) n FROM organizations foreign_org
    JOIN workspaces foreign_workspace ON foreign_workspace.org_id=foreign_org.id
    JOIN pilot_operations_release_candidates protected ON protected.org_id=foreign_org.id AND protected.workspace_id=foreign_workspace.id
    WHERE foreign_org.settings->>'exerciseRunId'=$1`,[crossScopeExercise])).rows[0].n),1,
  'the denied foreign scope must contain one real protected candidate');
  for(const scenario of ['success','failure','timeout','revoked','rotated']) {
    const providerArgs=[fixture.requester,fixture.org,fixture.workspace,authorizationVersion,`postgres-hosted-${scenario}`,scenario,JSON.stringify({scenario,synthetic:true})];
    const first=(await fresh.query('SELECT public.hosted_pilot_simulate_provider($1,$2,$3,$4,$5,$6,$7) result',providerArgs)).rows[0].result;
    const responseLossReplay=(await fresh.query('SELECT public.hosted_pilot_simulate_provider($1,$2,$3,$4,$5,$6,$7) result',providerArgs)).rows[0].result;
    assert.deepEqual(responseLossReplay,first,`${scenario} provider observation must converge after response loss`);
  }
  const hostedRecoveryArgs=[fixture.org,fixture.workspace,environment.resourceId,'Pilot Operations',hostedRun,nextPayload.gitSha,'4'.repeat(64),'5'.repeat(64),nextPayload.schemaVersion,fixture.requester];
  await fresh.query('SELECT public.pilot_operations_ingest_recovery_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',hostedRecoveryArgs);

  const executeExercise=exercise=>fresh.query(
    'SELECT public.hosted_pilot_execute_evidence_families_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
    [fixture.org,fixture.workspace,exercise,nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,databaseFingerprint,deploymentFingerprint],
  );
  const recordExercise=exercise=>fresh.query(
    'SELECT public.hosted_pilot_record_verification_result($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',
    [fixture.org,fixture.workspace,exercise,nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,
      databaseFingerprint,deploymentFingerprint,recoveryActor,recoveryAuthorizationVersion],
  );
  const currentExercise='97000000-0000-4000-8000-000000000092';
  await assert.rejects(recordExercise(currentExercise),/HOSTED_CURRENT_EXERCISE_PROOF_MISSING/,'successful jobs without derived families cannot finalize');
  const wrongReleaseExercise='97000000-0000-4000-8000-000000000095';
  await assert.rejects(fresh.query(
    'SELECT public.hosted_pilot_execute_evidence_families_internal($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [fixture.org,fixture.workspace,wrongReleaseExercise,'9'.repeat(40),hostedWorkflow,hostedRun,hostedAttempt,databaseFingerprint,deploymentFingerprint]),
    /HOSTED_ASSERTION_EXECUTION_FAILED_/,'a release without executable state must not derive PASS');
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM hosted_pilot_evidence_observations WHERE exercise_run_id=$1',[wrongReleaseExercise])).rows[0].n),0,'failed derivation must roll back partial observations');

  const fakeExercise='97000000-0000-4000-8000-000000000097';
  for(const family of evidenceFamilies) {
    const provenance=constructedFamilyProvenance(family);
    await fresh.query(`INSERT INTO hosted_pilot_exercise_evidence_families(
      org_id,workspace_id,exercise_run_id,release_sha,producer_workflow_path,producer_run_id,producer_run_attempt,
      target_fingerprint,deployment_fingerprint,hosted_target,evidence_family,evidence_sha256,disposition,
      provenance_schema_version,environment,test_ids,contract_sha256,assertion_outcomes,source_artifacts,
      observation_schema_version,observation_binding,observation_set_sha256)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'hosted_nonproduction_pilot',$10,$11,'executed_hosted_evidence',
        'hosted-family-assertion-v2','hosted_nonproduction_pilot',$12::jsonb,$13,$14::jsonb,$15::jsonb,
        'hosted-family-derived-observation-v1',$16::jsonb,$17)`,[
      fixture.org,fixture.workspace,fakeExercise,nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,
      databaseFingerprint,deploymentFingerprint,family,'b'.repeat(64),JSON.stringify(provenance.testIds),provenance.contractSha256,
      JSON.stringify(provenance.assertionOutcomes),JSON.stringify(provenance.sourceArtifacts),JSON.stringify({family,constructed:true}),'c'.repeat(64),
    ]);
  }
  assert.equal((await fresh.query('SELECT bool_or(public.hosted_pilot_evidence_family_derived_valid(org_id,workspace_id,exercise_run_id,evidence_family)) valid FROM hosted_pilot_exercise_evidence_families WHERE exercise_run_id=$1',[fakeExercise])).rows[0].valid,false,'constructed PASS identifiers without observations must be invalid');
  await assert.rejects(recordExercise(fakeExercise),/HOSTED_CURRENT_EXERCISE_PROOF_MISSING/,'constructed all-PASS rows without executable observations cannot finalize');

  const prepareArgs=[fixture.org,fixture.workspace,currentExercise,nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,databaseFingerprint,deploymentFingerprint];
  const responseLossCommitPhase=(await fresh.query(
    'SELECT public.hosted_pilot_prepare_response_loss_scenario($1,$2,$3,$4,$5,$6,$7,$8,$9) result',prepareArgs)).rows[0].result;
  assert.deepEqual(responseLossCommitPhase,{status:'response_loss_committed',businessResponseExposed:false,productionAuthorized:false},
    'first exact-run invocation must commit while withholding the business response');
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM hosted_pilot_response_loss_preparations WHERE exercise_run_id=$1 AND preparation_txid<>txid_current()',
    [currentExercise])).rows[0].n),1,'retry must observe an immutable preparation committed by an earlier transaction');
  await assert.rejects(executeExercise(currentExercise),/HOSTED_ASSERTION_EXECUTION_FAILED_HOSTED_JOURNEY_RECOVERY_EVIDENCE_BOUND/,
    'ambient same-release recovery/rollback rows must not be wrapped as current-run evidence');
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM hosted_pilot_evidence_observations WHERE exercise_run_id=$1',[currentExercise])).rows[0].n),0,
    'missing exact-run operational preparation must roll back every partial family observation');

  const selectorMaterial=[fixture.org,fixture.workspace,currentExercise,nextPayload.gitSha,hostedWorkflow,hostedRun,String(hostedAttempt),databaseFingerprint,deploymentFingerprint].join('|');
  const selectorSha=label=>createHash('sha256').update(`${label}|${selectorMaterial}`).digest('hex');
  const exactRecoveryArtifact=selectorSha('hosted-exact-recovery-artifact');
  const exactRecoveryEvidence=selectorSha('hosted-exact-recovery-evidence');
  const exactRecovery=(await fresh.query(
    'SELECT public.pilot_operations_ingest_recovery_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',[
      fixture.org,fixture.workspace,environment.resourceId,'Pilot Operations',hostedRun,nextPayload.gitSha,
      exactRecoveryArtifact,exactRecoveryEvidence,nextPayload.schemaVersion,fixture.requester,
    ])).rows[0].result;
  const exactRecoveryDrill=exactRecovery.resourceId;

  const exactReviewer='97000000-0000-4000-8000-000000000074';
  await fresh.query('INSERT INTO auth.users(id) VALUES($1)',[exactReviewer]);
  await fresh.query("INSERT INTO profiles(id,email) VALUES($1,'exact-run-reviewer@pilot.invalid')",[exactReviewer]);
  await fresh.query("INSERT INTO organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')",[fixture.org,exactReviewer,reviewerRole]);
  await fresh.query("INSERT INTO workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')",[fixture.org,fixture.workspace,exactReviewer]);
  const exactReviewerAuthorizationVersion=Number((await fresh.query(
    'SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,exactReviewer])).rows[0].version);
  const beforeExactPromotion=(await fresh.query('SELECT public.pilot_operations_projection($1,$2,$3,$4) result',
    [fixture.requester,fixture.org,fixture.workspace,authorizationVersion])).rows[0].result;
  const exactRollbackPayload={...nextPayload,buildIdentity:`hosted-exact-rollback-${hostedRun}-${hostedAttempt}`,
    evidenceManifestSha256:selectorSha('hosted-exact-rollback-manifest')};
  const exactRollbackCandidate=(await command('register_release_candidate',`hosted-exact-register-${hostedRun}-${hostedAttempt}`,exactRollbackPayload,0)).rows[0].result;
  await fresh.query(`INSERT INTO pilot_operations_evidence_manifests(candidate_id,org_id,workspace_id,environment_id,git_sha,build_identity,
    workflow_name,workflow_run_id,workflow_head_sha,manifest_sha256,schema_version,migration_compatible,required_gates,status,verified_at)
    VALUES($1,$2,$3,$4,$5,$6,'Pilot Operations',$7,$5,$8,$9,true,$10::jsonb,'verified',now())`,[
      exactRollbackCandidate.resourceId,fixture.org,fixture.workspace,environment.resourceId,nextPayload.gitSha,exactRollbackPayload.buildIdentity,
      hostedRun,exactRollbackPayload.evidenceManifestSha256,nextPayload.schemaVersion,JSON.stringify(gates),
    ]);
  const exactRollbackValidated=(await command('validate_release_candidate',`hosted-exact-validate-${hostedRun}-${hostedAttempt}`,
    {candidateId:exactRollbackCandidate.resourceId},exactRollbackCandidate.version)).rows[0].result;
  const exactRollbackApproved=(await command('approve_promotion',`hosted-exact-approve-${hostedRun}-${hostedAttempt}`,
    {candidateId:exactRollbackCandidate.resourceId},exactRollbackValidated.version,undefined,exactReviewer,exactReviewerAuthorizationVersion)).rows[0].result;
  const exactRollbackPromoted=(await command('simulate_promotion',`hosted-exact-promote-${hostedRun}-${hostedAttempt}`,
    {candidateId:exactRollbackCandidate.resourceId,target:'non_live'},exactRollbackApproved.version)).rows[0].result;
  const exactRollbackKey=`hosted-exact-rollback-${currentExercise.replaceAll('-','')}-${hostedRun}-${hostedAttempt}`;
  const exactRollbackCommandPayload={candidateId:exactRollbackCandidate.resourceId,environmentId:environment.resourceId,
    rollbackTargetCandidateId:beforeExactPromotion.promotedRelease.id,rollbackTargetVersion:beforeExactPromotion.promotedRelease.version};
  await command('rollback_non_live_promotion',exactRollbackKey,exactRollbackCommandPayload,exactRollbackPromoted.version,
    undefined,recoveryActor,recoveryAuthorizationVersion);
  const exactRollbackReceipt=(await fresh.query(`SELECT * FROM pilot_operations_command_receipts
    WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3 AND operation='rollback_non_live_promotion' AND idempotency_key=$4`,
  [fixture.org,fixture.workspace,recoveryActor,exactRollbackKey])).rows[0];
  const exactRollbackEvent=(await fresh.query('SELECT * FROM pilot_operations_rollback_events WHERE request_id=$1',
    [exactRollbackReceipt.initial_request_id])).rows[0];
  const bindArgs=[...prepareArgs,exactRecoveryDrill,exactRollbackEvent.id,exactRollbackReceipt.id];
  const exactBinding=(await fresh.query(
    'SELECT public.hosted_pilot_bind_exact_run_operational_execution($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result',bindArgs)).rows[0].result;
  assert.equal(exactBinding.status,'bound');
  assert.equal((await fresh.query(
    'SELECT public.hosted_pilot_exact_run_operational_execution_valid($1,$2,$3,$4,$5,$6,$7,$8,$9) valid',prepareArgs)).rows[0].valid,true);

  for(const [label,args] of [
    ['wrong scope',['97000000-0000-4000-8000-999999999991',...prepareArgs.slice(1),exactRecoveryDrill,exactRollbackEvent.id,exactRollbackReceipt.id]],
    ['wrong release',[...prepareArgs.slice(0,3),'9'.repeat(40),...prepareArgs.slice(4),exactRecoveryDrill,exactRollbackEvent.id,exactRollbackReceipt.id]],
    ['wrong attempt',[...prepareArgs.slice(0,6),hostedAttempt+1,...prepareArgs.slice(7),exactRecoveryDrill,exactRollbackEvent.id,exactRollbackReceipt.id]],
    ['wrong target',[...prepareArgs.slice(0,7),`sha256:${'7'.repeat(64)}`,...prepareArgs.slice(8),exactRecoveryDrill,exactRollbackEvent.id,exactRollbackReceipt.id]],
    ['wrong deployment',[...prepareArgs.slice(0,8),`sha256:${'8'.repeat(64)}`,exactRecoveryDrill,exactRollbackEvent.id,exactRollbackReceipt.id]],
  ]) await assert.rejects(fresh.query(
    'SELECT public.hosted_pilot_bind_exact_run_operational_execution($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',args),
  /HOSTED_EXACT_RUN_OPERATIONAL_PREPARATION_INVALID/,`${label} must not bind canonical operations`);
  const staleRecoveryDrill=(await fresh.query(`SELECT recovery_drill_id FROM pilot_operations_recovery_evidence_ingestions
    WHERE org_id=$1 AND workspace_id=$2 AND artifact_sha256=$3`,[fixture.org,fixture.workspace,'4'.repeat(64)])).rows[0].recovery_drill_id;
  await assert.rejects(fresh.query(
    'SELECT public.hosted_pilot_bind_exact_run_operational_execution($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [...prepareArgs,staleRecoveryDrill,exactRollbackEvent.id,exactRollbackReceipt.id]),
  /HOSTED_EXACT_RUN_OPERATIONAL_PREPARATION_INVALID/,'ambient pre-preparation recovery evidence must not bind');

  const ownerWrapperExercise='97000000-0000-4000-8000-000000000111';
  await fresh.query(`INSERT INTO hosted_pilot_exact_run_operational_executions(org_id,workspace_id,exercise_run_id,release_sha,
    producer_workflow_path,producer_run_id,producer_run_attempt,target_fingerprint,deployment_fingerprint,response_loss_receipt_id,
    response_loss_resource_id,recovery_drill_id,rollback_event_id,rollback_receipt_id,binding_txid)
    SELECT org_id,workspace_id,$1,release_sha,producer_workflow_path,producer_run_id,producer_run_attempt,target_fingerprint,
      deployment_fingerprint,response_loss_receipt_id,response_loss_resource_id,recovery_drill_id,rollback_event_id,rollback_receipt_id,txid_current()
    FROM hosted_pilot_exact_run_operational_executions WHERE exercise_run_id=$2`,[ownerWrapperExercise,currentExercise]);
  assert.equal((await fresh.query(
    'SELECT public.hosted_pilot_exact_run_operational_execution_valid($1,$2,$3,$4,$5,$6,$7,$8,$9) valid',[
      fixture.org,fixture.workspace,ownerWrapperExercise,nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,databaseFingerprint,deploymentFingerprint,
    ])).rows[0].valid,false,'an owner-written wrapper over current canonical rows must not validate for another exercise');
  assert.equal((await fresh.query(`SELECT public.hosted_pilot_assertion_predicate_valid(
    'hosted-recovery--recovery-evidence-bound',$1::jsonb) valid`,[JSON.stringify({
      exactReleaseRecoveryEvidenceCount:99,exactRunRecoveryExecutionCount:0,exactRunRecoveryExecutionBound:false,
      historicalRecoveryRowsExcluded:true,
    })])).rows[0].valid,false,'ambient same-release recovery counts must not satisfy the exact-run predicate');
  assert.equal((await fresh.query(`SELECT public.hosted_pilot_assertion_predicate_valid(
    'hosted-recovery--exact-release-rollback-event',$1::jsonb) valid`,[JSON.stringify({
      exactReleaseRollbackEventCount:99,exactRunRollbackExecutionCount:0,exactRunRollbackExecutionBound:false,
      historicalRollbackRowsExcluded:true,
    })])).rows[0].valid,false,'ambient same-release rollback counts must not satisfy the exact-run predicate');

  const executed=(await executeExercise(currentExercise)).rows[0].result;
  assert.equal(executed.status,'derived'); assert.equal(executed.evidenceFamilyCount,5); assert.equal(executed.productionAuthorized,false);
  const expectedObservationCount=evidenceFamilies.reduce((count,family)=>count+HOSTED_EVIDENCE_FAMILY_CONTRACTS[family].assertions.length,0);
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM hosted_pilot_evidence_observations WHERE exercise_run_id=$1',[currentExercise])).rows[0].n),expectedObservationCount);
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM hosted_pilot_evidence_scenario_observations WHERE exercise_run_id=$1',[currentExercise])).rows[0].n),expectedObservationCount,'every family observation must have one DB-owned exact-run scenario observation');
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM hosted_pilot_exercise_evidence_families WHERE exercise_run_id=$1 AND public.hosted_pilot_evidence_family_derived_valid(org_id,workspace_id,exercise_run_id,evidence_family)',[currentExercise])).rows[0].n),5);
  assert.equal(Number((await fresh.query("SELECT count(DISTINCT scenario) n FROM hosted_pilot_provider_simulations WHERE idempotency_key LIKE $1",
    [`hosted-provider-${currentExercise.replaceAll('-','')}-${hostedRun}-${hostedAttempt}-%`])).rows[0].n),5,'provider family must execute the exact current-run scenario set');
  assert.deepEqual((await executeExercise(currentExercise)).rows[0].result,executed,'response-loss retry must converge on the immutable derived observation set');

  const insertForgedScenario=async({exercise,assertionId='hosted-database--synthetic-subject-role-matrix',predicate={subjectCount:5,distinctRoleCount:5},
    runAttempt=hostedAttempt,deployment=deploymentFingerprint,bindingOverrides={},sourcePath=HOSTED_SCENARIO_SOURCE_PATH,sourceSha=HOSTED_SCENARIO_SOURCE_SHA256})=>{
    const binding={family:'tenant-adversarial',releaseSha:nextPayload.gitSha,producerWorkflowPath:hostedWorkflow,producerRunId:hostedRun,
      producerRunAttempt:runAttempt,organizationId:fixture.org,workspaceId:fixture.workspace,exerciseRunId:exercise,
      targetFingerprint:databaseFingerprint,deploymentFingerprint:deployment,...bindingOverrides};
    const scenarioPayload={schemaVersion:'hosted-exact-run-scenario-v1',binding,assertionId,result:'PASS',predicate,sourcePath,sourceSha256:sourceSha};
    await fresh.query(`INSERT INTO hosted_pilot_evidence_scenario_observations(
      org_id,workspace_id,exercise_run_id,release_sha,producer_workflow_path,producer_run_id,producer_run_attempt,
      target_fingerprint,deployment_fingerprint,evidence_family,assertion_id,source_path,source_sha256,
      scenario_schema_version,scenario_payload,scenario_sha256)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'tenant-adversarial',$10,$11,$12,
        'hosted-exact-run-scenario-v1',$13::jsonb,encode(public.digest(convert_to($13::jsonb::text,'UTF8'),'sha256'),'hex'))`,[
      fixture.org,fixture.workspace,exercise,nextPayload.gitSha,hostedWorkflow,hostedRun,runAttempt,databaseFingerprint,deployment,
      assertionId,sourcePath,sourceSha.slice(7),JSON.stringify(scenarioPayload),
    ]);
  };
  const assertForgedScenarioRejected=async(exercise,message,{attempt=hostedAttempt,deployment=deploymentFingerprint}={})=>{
    await assert.rejects(fresh.query(
      'SELECT public.hosted_pilot_execute_evidence_families_internal($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [fixture.org,fixture.workspace,exercise,nextPayload.gitSha,hostedWorkflow,hostedRun,attempt,databaseFingerprint,deployment]),
      /HOSTED_SCENARIO_OBSERVATION_CONFLICT/,message);
    assert.equal(Number((await fresh.query('SELECT count(*) n FROM hosted_pilot_exercise_evidence_families WHERE exercise_run_id=$1',[exercise])).rows[0].n),0,`${message}: no family wrapper may survive`);
  };
  const staleScenario='97000000-0000-4000-8000-000000000101';
  await insertForgedScenario({exercise:staleScenario,runAttempt:hostedAttempt+1});
  await assertForgedScenarioRejected(staleScenario,'stale run-attempt scenario must fail closed');
  const wrongDeploymentScenario='97000000-0000-4000-8000-000000000102';
  await insertForgedScenario({exercise:wrongDeploymentScenario,deployment:`sha256:${'3'.repeat(64)}`});
  await assertForgedScenarioRejected(wrongDeploymentScenario,'wrong-deployment scenario must fail closed');
  const wrongScopeScenario='97000000-0000-4000-8000-000000000103';
  await insertForgedScenario({exercise:wrongScopeScenario,bindingOverrides:{organizationId:'97000000-0000-4000-8000-999999999999'}});
  await assertForgedScenarioRejected(wrongScopeScenario,'wrong-scope scenario payload must fail closed');
  const incompleteDenialScenario='97000000-0000-4000-8000-000000000104';
  await insertForgedScenario({exercise:incompleteDenialScenario,assertionId:'hosted-database--cross-tenant-nondisclosure',predicate:{
    unauthorizedReadDenied:true,unauthorizedMutationDenied:false,readErrorNondisclosing:true,mutationErrorNondisclosing:true,
    activeForeignScopeActor:true,sourceScopeProjectionAuthorized:true,foreignScopeExists:true,foreignProtectedResourceExists:true,
    foreignOrganizationMembershipAbsent:true,foreignWorkspaceMembershipAbsent:true,
    rowsDisclosed:0,receiptSideEffects:0,auditSideEffects:0,businessSideEffects:0,
  }});
  await assertForgedScenarioRejected(incompleteDenialScenario,'incomplete cross-tenant denial must fail closed');
  const replayPredicate={responseDiscardedBeforeRetry:true,durableCommitBeforeRetry:true,exactReplayResponseMatched:true,committedReceiptCount:1,businessEffectDelta:1,
    resourceBusinessEffectCount:1,canonicalAuditEventCount:1,changedPayloadConflictRejected:true};
  for(const [exercise,field,message] of [
    ['97000000-0000-4000-8000-000000000105','exactReplayResponseMatched','missing replay equality'],
    ['97000000-0000-4000-8000-000000000106','resourceBusinessEffectCount','missing single business effect'],
    ['97000000-0000-4000-8000-000000000107','changedPayloadConflictRejected','missing changed-payload conflict'],
    ['97000000-0000-4000-8000-000000000109','durableCommitBeforeRetry','missing prior durable commit'],
  ]){
    const predicate={...replayPredicate,[field]:field==='resourceBusinessEffectCount'?0:false};
    await insertForgedScenario({exercise,assertionId:'hosted-database--response-loss-exact-replay',predicate});
    await assertForgedScenarioRejected(exercise,`${message} must fail closed`);
  }
  const substitutedSourceScenario='97000000-0000-4000-8000-000000000108';
  await insertForgedScenario({exercise:substitutedSourceScenario,sourcePath:'supabase/migrations/20260813020000_hosted_oidc_verifier_bridge.sql',sourceSha:`sha256:${'4'.repeat(64)}`});
  await assertForgedScenarioRejected(substitutedSourceScenario,'substituted proof source must fail closed');
    const ledgerText=[...canonical.migrations].sort((a,b)=>a.name.localeCompare(b.name)).map(item=>
      `${item.name}:${createHash('sha256').update(item.sql.replace(/\r\n/gu,'\n')).digest('hex')}`
    ).join('\n');
  const expectedLedgerDigest=`sha256:${createHash('sha256').update(ledgerText).digest('hex')}`;
  await fresh.query('CREATE SCHEMA extensions AUTHORIZATION postgres');
  await fresh.query("CREATE FUNCTION extensions.digest(bytea,text) RETURNS bytea LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS 'SELECT public.digest($1,$2)'");
  await fresh.query('REVOKE ALL ON SCHEMA extensions FROM PUBLIC,anon,authenticated,service_role');
  await fresh.query('REVOKE ALL ON FUNCTION extensions.digest(bytea,text) FROM PUBLIC,anon,authenticated,service_role');
  const oidcExecuteArgs=[fixture.org,fixture.workspace,currentExercise,nextPayload.gitSha,hostedWorkflow,hostedRun,hostedAttempt,
    databaseFingerprint,deploymentFingerprint,canonical.migrations.length,expectedLedgerDigest];
  const oidcExecuted=(await fresh.query('SELECT public.hosted_pilot_oidc_execute($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',oidcExecuteArgs)).rows[0].result;
  assert.equal(oidcExecuted.status,'derived'); assert.equal(oidcExecuted.preflight.status,'passed');
  const oidcExecuteIdentity='public.hosted_pilot_oidc_execute(uuid,uuid,uuid,text,text,text,bigint,text,text,bigint,text)';
  await fresh.query(`GRANT EXECUTE ON FUNCTION ${oidcExecuteIdentity} TO anon`);
  try {
    await assert.rejects(fresh.query('SELECT public.hosted_pilot_oidc_execute($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',oidcExecuteArgs),/HOSTED_OIDC_EXECUTOR_ACL_MISMATCH/,'OIDC executor must detect browser ACL drift before derivation');
  } finally {
    await fresh.query(`REVOKE ALL ON FUNCTION ${oidcExecuteIdentity} FROM anon`);
  }
  await assert.rejects(fresh.query(
    'SELECT public.hosted_pilot_record_verification_result($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [fixture.org,fixture.workspace,currentExercise,nextPayload.gitSha,hostedWorkflow,'31587931746',hostedAttempt,databaseFingerprint,deploymentFingerprint,recoveryActor,recoveryAuthorizationVersion]),
    /HOSTED_CURRENT_EXERCISE_PROOF_MISSING/,'a substituted producer run cannot consume exact-run evidence');
  const hostedRecorded=(await recordExercise(currentExercise)).rows[0].result;
  assert.equal(hostedRecorded.status,'recorded');
  assert.equal(hostedRecorded.familyDigest.length,5);
  const hostedReplay=(await recordExercise(currentExercise)).rows[0].result;
  assert.equal(hostedReplay.status,'exact_replay');assert.equal(hostedReplay.exerciseRunId,currentExercise);assert.equal(hostedReplay.productionAuthorized,false);assert.equal(hostedReplay.familyDigest.length,5);

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
  assert.equal(pendingProjection.rollback.eligible,true); assert.equal(pendingProjection.rollback.targetCandidateId,exactRollbackCandidate.resourceId,
    'post-rollback history must select the immediately preceding exact-run promoted release');
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

  // SAFETY-005 / SAFETY-RESPONSE_LOST_AFTER_COMMIT: execute the production
  // command in its own committed transaction, deliberately discard its only
  // client response, then recover the exact canonical response by identity.
  const responseLossPayload={...candidatePayload,gitSha:'6'.repeat(40),buildIdentity:'safety-005-response-loss',evidenceManifestSha256:'6'.repeat(64)};
  const responseLossRequest='99000000-0000-4000-8000-000000000505';
  const responseLossKey='safety-005-response-lost-after-commit';
  const responseLossArgs=[fixture.requester,fixture.org,fixture.workspace,'register_release_candidate',responseLossRequest,responseLossKey,JSON.stringify(responseLossPayload),authorizationVersion,0,JSON.stringify(responseLossPayload)];
  const effectsBefore=Number((await fresh.query('SELECT count(*) n FROM pilot_operations_candidate_history WHERE environment_id=$1',[environment.resourceId])).rows[0].n);
  await fresh.query('BEGIN');
  await fresh.query('SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) result',responseLossArgs); // response intentionally discarded
  await fresh.query('COMMIT');
  const receiptRows=(await fresh.query('SELECT id,response_body,resource_id,status,initial_request_id FROM pilot_operations_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND operation=$3 AND idempotency_key=$4',[fixture.org,fixture.workspace,'register_release_candidate',responseLossKey])).rows;
  assert.equal(receiptRows.length,1,'SAFETY-005 must retain exactly one immutable receipt after the discarded response');
  const receipt=receiptRows[0];
  assert.equal(receipt.status,'committed');
  assert.equal(receipt.initial_request_id,responseLossRequest);
  const recovered=(await fresh.query('SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) result',responseLossArgs)).rows[0].result;
  assert.deepEqual(recovered,receipt.response_body,'SAFETY-005 retry must recover the exact canonical committed response');
  assert.equal(recovered.resourceId,receipt.resource_id,'SAFETY-005 canonical response and receipt must bind the same resource');
  const responseLossExactReplayVerified=JSON.stringify(recovered)===JSON.stringify(receipt.response_body)&&recovered.resourceId===receipt.resource_id;
  const persisted=(await fresh.query('SELECT id,git_sha,build_identity,evidence_manifest_sha256,schema_version,lifecycle,version FROM pilot_operations_release_candidates WHERE id=$1 AND org_id=$2 AND workspace_id=$3',[recovered.resourceId,fixture.org,fixture.workspace])).rows[0];
  assert.ok(persisted,'SAFETY-005 canonical resource must resolve to the persisted candidate');
  assert.equal(persisted.build_identity,responseLossPayload.buildIdentity);
  assert.equal(persisted.git_sha,responseLossPayload.gitSha);
  assert.equal(persisted.evidence_manifest_sha256,responseLossPayload.evidenceManifestSha256);
  assert.equal(persisted.schema_version,responseLossPayload.schemaVersion);
  assert.equal(persisted.lifecycle,'draft');
  assert.equal(Number(persisted.version),Number(recovered.version));
  const effectsAfter=Number((await fresh.query('SELECT count(*) n FROM pilot_operations_candidate_history WHERE environment_id=$1',[environment.resourceId])).rows[0].n);
  const resourceEffects=Number((await fresh.query('SELECT count(*) n FROM pilot_operations_candidate_history WHERE environment_id=$1 AND candidate_id=$2',[environment.resourceId,recovered.resourceId])).rows[0].n);
  assert.equal(effectsAfter,effectsBefore+1,'SAFETY-005 must commit exactly one business effect');
  assert.equal(resourceEffects,1,'SAFETY-005 candidate history must contain the committed resource exactly once');
  const responseLossExactlyOneEffectVerified=effectsAfter===effectsBefore+1&&resourceEffects===1;
  assert.equal(Number((await fresh.query('SELECT count(*) n FROM pilot_operations_audit_events WHERE receipt_id=$1 AND action=$2 AND resource_id=$3 AND result=$4',[receipt.id,'register_release_candidate',recovered.resourceId,'committed'])).rows[0].n),1,'SAFETY-005 must retain exactly one canonical audit event');
  let responseLossConflictRejected=false,responseLossForeignTenantNonDisclosure=false;
  await assert.rejects(fresh.query('SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',[...responseLossArgs.slice(0,6),JSON.stringify({...responseLossPayload,buildIdentity:'conflict'}),...responseLossArgs.slice(7,9),JSON.stringify({...responseLossPayload,buildIdentity:'conflict'})]),/IDEMPOTENCY_CONFLICT/);responseLossConflictRejected=true;
  await assert.rejects(fresh.query('SELECT public.pilot_operations_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',[fixture.requester,'99000000-0000-4000-8000-000000000999','99000000-0000-4000-8000-000000000998','register_release_candidate',responseLossRequest,responseLossKey,JSON.stringify(responseLossPayload),authorizationVersion,0,JSON.stringify(responseLossPayload)]),/PR1B_NOT_FOUND/,'SAFETY-005 foreign tenant replay must be non-disclosing');responseLossForeignTenantNonDisclosure=true;

  // Recovery rotation deliberately fenced the historical reviewer above. Keep the
  // later serialization fixture independent so it cannot accidentally reuse that
  // revoked actor or its stale authorization version.
  const serializationReviewer='97000000-0000-4000-8000-000000000073';
  await fresh.query('INSERT INTO auth.users(id) VALUES($1)',[serializationReviewer]);
  await fresh.query("INSERT INTO profiles(id,email) VALUES($1,'serialization-reviewer@pilot.invalid')",[serializationReviewer]);
  await fresh.query("INSERT INTO organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')",[fixture.org,serializationReviewer,reviewerRole]);
  await fresh.query("INSERT INTO workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')",[fixture.org,fixture.workspace,serializationReviewer]);
  const serializationReviewerAuthorizationVersion=Number((await fresh.query(
    'SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',
    [fixture.org,serializationReviewer],
  )).rows[0].version);
  const serializationReviewerCapabilities=(await fresh.query(
    "SELECT EXISTS(SELECT 1 FROM role_capabilities WHERE role_id=$1 AND capability_key='release.approve') approved, EXISTS(SELECT 1 FROM role_capabilities WHERE role_id=$1 AND capability_key='release.promote') promoted",
    [reviewerRole],
  )).rows[0];
  assert.deepEqual(serializationReviewerCapabilities,{approved:true,promoted:false},'serialization reviewer must retain active approval-only authority');
  assert.equal((await fresh.query(
    "SELECT EXISTS(SELECT 1 FROM role_capabilities rc WHERE rc.capability_key='release.approve' AND rc.role_id IN (SELECT om.role_id FROM organization_members om WHERE om.org_id=$1 AND om.user_id=$3 AND om.status='active' UNION SELECT wm.role_id FROM workspace_memberships wm WHERE wm.org_id=$1 AND wm.workspace_id=$2 AND wm.user_id=$3 AND wm.status='active')) approved",
    [fixture.org,fixture.workspace,recoveryActor],
  )).rows[0].approved,false,'recovery operator must not gain workspace approval authority');

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
    const accepted=(await command('approve_promotion',`postgres-serialized-approve-${label}`,{candidateId:registered.resourceId},checked.version,undefined,serializationReviewer,serializationReviewerAuthorizationVersion)).rows[0].result;
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
  const assertionResults=[
    ['pilot-operations-postgres--responseLossExactReplayVerified',responseLossExactReplayVerified],
    ['pilot-operations-postgres--responseLossExactlyOneEffectVerified',responseLossExactlyOneEffectVerified],
    ['pilot-operations-postgres--responseLossConflictRejected',responseLossConflictRejected],
    ['pilot-operations-postgres--responseLossForeignTenantNonDisclosure',responseLossForeignTenantNonDisclosure],
  ].map(([assertionId,passed])=>({assertionId,status:passed?'PASS':'FAIL'}));
  const assertionDisposition=assertionResults.every(item=>item.status==='PASS')?'passed':'failed';
  assert.equal(assertionDisposition,'passed','machine assertion artifact must derive from the executed response-loss checks');
  await writeFile('artifacts/pilot-operations/postgres-execution.json',JSON.stringify({
    kind:'executed_disposable_postgresql',postgresMajor:16,head:process.env.CANDIDATE_SHA??null,runId:process.env.GITHUB_RUN_ID??null,
    runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT??0),workflowPath:process.env.ACCEPTANCE_WORKFLOW_PATH??null,environment:'disposable-ci',
    scope:{evidenceScope:'executed-fixture',fixtureId:'synthetic-pilot-operations-response-loss',organizationId:fixture.org,workspaceId:fixture.workspace},
    freshApplied:true,acceptedBaselineUpgradeApplied:true,forcedRlsVerified:true,maintenanceDenied:true,concurrentReplayVerified:true,
    expectedVersionVerified:true,staleAuthorizationDenied:true,evidenceBindingVerified:true,separationOfDutyVerified:true,deprovisionRevocationVerified:true,
    deprovisionLifecycleDisclosureBounded:true,deprovisionNonDisclosureVerified:true,deprovisionReplayDenied:true,recoveryDeprovisionDenied:true,actorBoundBootstrapReplayVerified:true,pendingCandidateProjectionVerified:true,canonicalRecoveryProjectionVerified:true,schemaReadinessConsistent:true,reactivationAuthorizedPathVerified:true,rollbackEligibleVerified:true,rollbackReplayVerified:true,rollbackZeroHostedMutationVerified:true,recoveryRuntimeControlsVerified:true,recoveryZeroMutationOnDenialVerified:true,liveActivationStopVerified:true,
    promotionHistorySerialized:true,invertedTransactionOrderVerified:true,gapFreePromotionSequenceVerified:true,pendingRegistrationSerialized:true,invertedRegistrationOrderVerified:true,gapFreeCandidateSequenceVerified:true,
    crossTenantDisclosureDenied:true,responseLossAfterCommitTestId:'SAFETY-005',responseLossAfterCommitBranch:'SAFETY-RESPONSE_LOST_AFTER_COMMIT',responseLossExactReplayVerified,responseLossExactlyOneEffectVerified,responseLossConflictRejected,responseLossForeignTenantNonDisclosure,liveActivationAuthorized:false,
    assertionDisposition,assertionResults,
  },null,2)+'\n');
} finally {
  for(const client of clients.slice(1).reverse()) await client.end().catch(()=>{});
  if(admin){for(const name of Object.values(names)) await dropDatabase(admin,name).catch(()=>{});await admin.end().catch(()=>{});}
}
