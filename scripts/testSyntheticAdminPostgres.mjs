import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const connectionString=process.env.SYNTHETIC_ADMIN_DISPOSABLE_DATABASE_URL;
if(!connectionString)throw new Error('SYNTHETIC_ADMIN_DISPOSABLE_DATABASE_URL is required.');
const target=new URL(connectionString);
if(!['127.0.0.1','localhost','::1'].includes(target.hostname)||!target.pathname.slice(1).startsWith('avalaos_'))
 throw new Error('Synthetic Admin PostgreSQL tests require a named localhost disposable database.');
const client=new pg.Client({connectionString});
const ids=Object.fromEntries(['actor','foreignActor','org','workspace','foreignWorkspace'].map(k=>[k,crypto.randomUUID()]));
const fingerprint=`sha256:${'a'.repeat(64)}`;
let assertions=0;
let phase='transactional_assertions';
const check=(actual,expected)=>{assert.equal(actual,expected);assertions++;};
const query=async(sql,values=[])=> (await client.query(sql,values)).rows[0];
const count=async(table,predicate,values)=>Number((await query(`SELECT count(*)::integer AS n FROM ${table} WHERE ${predicate}`,values)).n);
const scope=version=>[ids.actor,ids.org,ids.workspace,version,fingerprint];
const expectedFailure=async(sql,values,signal)=>{
 await client.query('SAVEPOINT synthetic_admin_negative');
 try{
  await client.query(sql,values);
  assert.fail(`Expected ${signal}`);
 }catch(error){
  if(error?.message!==signal)throw new Error(`EXPECTED_${signal}_OBSERVED_${error?.message?.match(/^[A-Z0-9_]{3,80}$/)?.[0]??error?.code??'UNKNOWN'}`);
  assertions++;
 }finally{
  await client.query('ROLLBACK TO SAVEPOINT synthetic_admin_negative');
  await client.query('RELEASE SAVEPOINT synthetic_admin_negative');
 }
};
try{
 await client.connect();
 check((await query(`SELECT to_regprocedure('public.synthetic_admin_bootstrap_operator(uuid,uuid,uuid,text)') IS NOT NULL AS ready`)).ready,true);
 await client.query('BEGIN');
 await client.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[ids.actor,'synthetic-operator@avalaos.invalid']);
 const configured=(await query(`SELECT public.synthetic_admin_bootstrap_operator($1::uuid,$2::uuid,$3::uuid,$4::text) AS value`,
  [ids.actor,ids.org,ids.workspace,fingerprint])).value;
 check(configured.status,'configured');
 check(await count('public.synthetic_admin_targets','target_fingerprint=$1 AND enabled',[fingerprint]),1);
 check(await count('public.synthetic_admin_preset_roles','target_id=$1',[configured.targetId]),4);
 check(await count('public.role_capabilities',`role_id IN(SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=$1) AND capability_key='org.admin'`,[configured.targetId]),0);
 check(await count('public.role_capabilities',`role_id=(SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=$1 AND preset='author') AND capability_key IN('assess.read','assess.process.create','assess.create','assess.response.write')`,[configured.targetId]),4);
 const presetCaps=async(preset,capabilities)=>count('public.role_capabilities',
  `role_id=(SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=$1 AND preset='${preset}') AND capability_key=ANY($2::text[])`,
  [configured.targetId,capabilities]);
 check(await presetCaps('author',['studio.artifacts.generate','studio.sources.manage','delivery.package.manage']),3);
 check(await presetCaps('reviewer',['delivery.package.review','studio.artifacts.review']),2);
 check(await presetCaps('approver',['delivery.package.approve','studio.artifacts.approve']),2);
 check(await presetCaps('viewer',['studio.artifacts.generate','delivery.package.manage','delivery.package.review','delivery.package.approve']),0);
 check(await presetCaps('author',['org.admin','admin.synthetic.users.manage','delivery.package.review','delivery.package.approve']),0);
 check(await presetCaps('reviewer',['delivery.package.manage','delivery.package.approve','studio.artifacts.generate']),0);
 check(await presetCaps('approver',['delivery.package.manage','delivery.package.review','studio.artifacts.generate']),0);
 check(await count('public.capabilities',`capability_key='delivery.item.review'`,[]),0);
 check(await count('public.process_creation_workspace_controls','org_id=$1 AND workspace_id=$2 AND enabled AND NOT read_only AND max_active_processes=10',[ids.org,ids.workspace]),1);
 const version=Number((await query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[ids.org,ids.actor])).version);
 await query(`SELECT public.pr1b_assert_command_authority($1::uuid,$2::uuid,$3::uuid,'org.admin',$4::bigint) AS authorized`,
  [ids.actor,ids.org,ids.workspace,version]);
 check(await count('public.role_capabilities',`role_id=(SELECT role_id FROM public.organization_members WHERE org_id=$1 AND user_id=$2) AND capability_key='org.admin'`,[ids.org,ids.actor]),1);
 await query(`SELECT public.pr1b_assert_command_authority($1::uuid,$2::uuid,$3::uuid,'admin.synthetic.users.manage',$4::bigint) AS authorized`,
  [ids.actor,ids.org,ids.workspace,version]);
 check(await count('public.role_capabilities',`role_id=(SELECT role_id FROM public.organization_members WHERE org_id=$1 AND user_id=$2) AND capability_key='admin.synthetic.users.manage'`,[ids.org,ids.actor]),1);
 const reserveRequest=crypto.randomUUID();
 const reserveSql=`SELECT public.synthetic_admin_reserve($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::uuid,$7::text,$8::text,$9::text) AS value`;
 const reserveArgs=[...scope(version),reserveRequest,'reserve.fixed-key-0001','Author A','author'];
 const reserved=(await query(reserveSql,reserveArgs)).value;
 check(reserved.status,'reserved');
 check(reserved.loginId.endsWith('@avalaos.invalid'),true);
 check((await query(reserveSql,reserveArgs)).value.reservationId,reserved.reservationId);
 check(await count('public.synthetic_admin_accounts','target_id=$1',[configured.targetId]),1);
 await expectedFailure(reserveSql,[...scope(version),crypto.randomUUID(),'reserve.fixed-key-0001','Different','author'],'SYNTHETIC_ADMIN_IDEMPOTENCY_CONFLICT');
 await client.query('UPDATE public.synthetic_admin_targets SET max_accounts=1 WHERE id=$1',[configured.targetId]);
 await expectedFailure(reserveSql,[...scope(version),crypto.randomUUID(),'reserve.fixed-key-0002','Second','viewer'],'SYNTHETIC_ADMIN_QUOTA_EXCEEDED');
 const claimRequest=crypto.randomUUID();
 const claimSql=`SELECT public.synthetic_admin_claim_execution($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::uuid,$7::text,$8::uuid) AS value`;
 const claimArgs=[...scope(version),claimRequest,'execute.fixed-key-0001',reserved.reservationId];
 const claim=(await query(claimSql,claimArgs)).value;
 check(claim.status,'execution_claimed');check(claim.externalCreateAllowed,true);
 check((await query(claimSql,claimArgs)).value.externalCreateAllowed,false);
 check(await count('public.organization_members','org_id=$1 AND user_id=$2',[ids.org,claim.authUserId]),0);
 const reconcileSql=`SELECT public.synthetic_admin_reconcile($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::uuid) AS value`;
 check((await query(reconcileSql,[...scope(version),reserved.reservationId])).value.status,'reconciliation_required');
 await client.query('INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES($1,$2,$3::jsonb)',
  [claim.authUserId,claim.syntheticEmail,JSON.stringify({synthetic_admin_reservation_id:crypto.randomUUID(),synthetic_admin_target:fingerprint})]);
 await expectedFailure(reconcileSql,[...scope(version),reserved.reservationId],'SYNTHETIC_ADMIN_RECONCILIATION_REQUIRED');
 check(await count('public.profiles','id=$1',[claim.authUserId]),0);
 await client.query('UPDATE auth.users SET raw_app_meta_data=$2::jsonb WHERE id=$1',
  [claim.authUserId,JSON.stringify({synthetic_admin_reservation_id:reserved.reservationId,synthetic_admin_target:fingerprint})]);
 const active=(await query(reconcileSql,[...scope(version),reserved.reservationId])).value;
 check(active.status,'active');
 check(await count('public.organization_members','org_id=$1 AND user_id=$2 AND status=$3',[ids.org,claim.authUserId,'active']),1);
 check(await count('public.workspace_memberships','org_id=$1 AND workspace_id=$2 AND user_id=$3 AND status=$4',[ids.org,ids.workspace,claim.authUserId,'active']),1);
 check((await query(reconcileSql,[...scope(version),reserved.reservationId])).value.version,active.version);
 const listSql=`SELECT public.synthetic_admin_list($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::uuid,$7::integer) AS value`;
 const roster=(await query(listSql,[...scope(version),null,20])).value;
 check(roster.roster.length,1);check(roster.roster[0].loginId,claim.syntheticEmail);
 check(JSON.stringify(roster).includes(claim.authUserId),false);
 await expectedFailure(listSql,[ids.actor,ids.org,ids.workspace,version,`sha256:${'b'.repeat(64)}`,null,20],'SYNTHETIC_ADMIN_FEATURE_DISABLED');
 await client.query('INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,$3,$4)',
  [ids.foreignWorkspace,ids.org,'Foreign exploratory workspace','foreign-exploratory-workspace']);
 await expectedFailure(listSql,[ids.actor,ids.org,ids.foreignWorkspace,version,fingerprint,null,20],'PR1B_NOT_FOUND');
 const assignSql=`SELECT public.synthetic_admin_assign_role($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::uuid,$7::text,$8::uuid,$9::bigint,$10::text) AS value`;
 const assignRequest=crypto.randomUUID();
 const assignArgs=[...scope(version),assignRequest,'assign.fixed-key-0001',reserved.reservationId,active.version,'reviewer'];
 const assigned=(await query(assignSql,assignArgs)).value;
 check(assigned.status,'active');check(assigned.version,active.version+1);
 let memberVersion=Number((await query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
  [ids.org,claim.authUserId])).version);
 await query(`SELECT public.pr1b_assert_command_authority($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint)`,
  [claim.authUserId,ids.org,ids.workspace,'delivery.package.review',memberVersion]);
 assertions++;
 await expectedFailure(`SELECT public.pr1b_assert_command_authority($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint)`,
  [claim.authUserId,ids.org,ids.workspace,'delivery.package.manage',memberVersion],'PR1B_NOT_FOUND');
 check((await query(assignSql,assignArgs)).value.version,assigned.version);
 await expectedFailure(assignSql,[...scope(version),crypto.randomUUID(),'assign.fixed-key-0001',reserved.reservationId,active.version,'approver'],'SYNTHETIC_ADMIN_IDEMPOTENCY_CONFLICT');
 await expectedFailure(assignSql,[...scope(version),crypto.randomUUID(),'assign.fixed-key-0002',reserved.reservationId,active.version,'viewer'],'SYNTHETIC_ADMIN_VERSION_CONFLICT');
 const restored=(await query(assignSql,[...scope(version),crypto.randomUUID(),'assign.fixed-key-0003',reserved.reservationId,assigned.version,'author'])).value;
 check(restored.status,'active');check(restored.version,assigned.version+1);
 memberVersion=Number((await query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
  [ids.org,claim.authUserId])).version);
 for(const capability of ['studio.artifacts.generate','studio.sources.manage','delivery.package.manage']){
  await query(`SELECT public.pr1b_assert_command_authority($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint)`,
   [claim.authUserId,ids.org,ids.workspace,capability,memberVersion]);
  assertions++;
 }
 await expectedFailure(`SELECT public.pr1b_assert_command_authority($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint)`,
  [claim.authUserId,ids.org,ids.workspace,'delivery.package.approve',memberVersion],'PR1B_NOT_FOUND');
 const subjectVersion=Number((await query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[ids.org,claim.authUserId])).version);
 const createProcessSql=`SELECT public.create_assess_process($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::uuid,$6::text,$7::bigint,$8::uuid,$9::text,$10::text,$11::text,$12::text,$13::text) AS value`;
 const subjectProcessArgs=[claim.authUserId,ids.org,ids.workspace,subjectVersion,crypto.randomUUID(),
  'revoked-subject-key-0001',0,crypto.randomUUID(),'Revoked subject attempt','Should not commit','Operations','Medium',null];
 const revokeSql=`SELECT public.synthetic_admin_revoke($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::uuid,$7::text,$8::uuid,$9::bigint) AS value`;
 const revokeRequest=crypto.randomUUID();
 const revokedClaim=(await query(revokeSql,[...scope(version),revokeRequest,'revoke.fixed-key-0001',reserved.reservationId,restored.version])).value;
 check(revokedClaim.status,'ban_required');check(revokedClaim.externalBanAllowed,true);
 check(revokedClaim.banClaimId?.length,36);
 check(await count('public.organization_members','org_id=$1 AND user_id=$2 AND status=$3',[ids.org,claim.authUserId,'disabled']),1);
 check(await count('public.workspace_memberships','org_id=$1 AND user_id=$2 AND status=$3',[ids.org,claim.authUserId,'disabled']),1);
 check(await count('public.profiles','id=$1 AND status=$2',[claim.authUserId,'disabled']),1);
 const deniedSubject=(await query(createProcessSql,subjectProcessArgs)).value;
 check(deniedSubject.ok,false);
 check(deniedSubject.error?.code,'PERMISSION_DENIED');
 check(await count('public.assess_processes','id=$1',[subjectProcessArgs[7]]),0);
 check(await count('public.assess_command_receipts',`request_id=$1 AND command_type='process.create'`,
  [subjectProcessArgs[4]]),0);
 check(await count('public.privileged_audit_events',`request_id=$1 AND action='process.create'`,
  [subjectProcessArgs[4]]),0);
 check((await query(revokeSql,[...scope(version),revokeRequest,'revoke.fixed-key-0001',reserved.reservationId,restored.version])).value.externalBanAllowed,undefined);
 const retrySql=`SELECT public.synthetic_admin_claim_ban_retry($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::uuid,$7::text,$8::uuid) AS value`;
 const completeSql=`SELECT public.synthetic_admin_complete_ban($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10::boolean) AS value`;
 await client.query('UPDATE auth.users SET raw_app_meta_data=$2::jsonb WHERE id=$1',
  [claim.authUserId,JSON.stringify({ synthetic_admin_reservation_id:reserved.reservationId,
   synthetic_admin_target:`sha256:${'b'.repeat(64)}` })]);
 await expectedFailure(retrySql,[...scope(version),crypto.randomUUID(),'retry.foreign-marker-0001',reserved.reservationId],
  'SYNTHETIC_ADMIN_RECONCILIATION_REQUIRED');
 check(await count('public.synthetic_admin_accounts','id=$1 AND ban_attempts=1',[reserved.reservationId]),1);
 await client.query('UPDATE auth.users SET raw_app_meta_data=$2::jsonb WHERE id=$1',
  [claim.authUserId,JSON.stringify({ synthetic_admin_reservation_id:reserved.reservationId,
   synthetic_admin_target:fingerprint })]);
 check((await query(retrySql,[...scope(version),crypto.randomUUID(),'retry.active-lease-0001',reserved.reservationId])).value.externalBanAllowed,undefined);
 await client.query(`CREATE FUNCTION pg_temp.synthetic_admin_abort_uncertain_audit() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN IF NEW.action='synthetic_admin.auth.ban.uncertain' THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_TEST_AUDIT_ABORT'; END IF;
 RETURN NEW; END $$`);
 await client.query(`CREATE TRIGGER synthetic_admin_test_abort_uncertain_audit BEFORE INSERT ON public.privileged_audit_events
 FOR EACH ROW EXECUTE FUNCTION pg_temp.synthetic_admin_abort_uncertain_audit()`);
 await expectedFailure(completeSql,[...scope(version),revokeRequest,reserved.reservationId,claim.authUserId,
  revokedClaim.banClaimId,false],'SYNTHETIC_ADMIN_TEST_AUDIT_ABORT');
 check(await count('public.synthetic_admin_accounts',`id=$1 AND state='ban_required' AND version=$2`,
  [reserved.reservationId,revokedClaim.version]),1);
 check(await count('public.privileged_audit_events',`resource_id=$1 AND action='synthetic_admin.auth.ban.uncertain'`,
  [reserved.reservationId]),0);
 await client.query('DROP TRIGGER synthetic_admin_test_abort_uncertain_audit ON public.privileged_audit_events');
 await client.query('DROP FUNCTION pg_temp.synthetic_admin_abort_uncertain_audit()');
 const ban=(await query(completeSql,[...scope(version),revokeRequest,reserved.reservationId,claim.authUserId,revokedClaim.banClaimId,true])).value;
 check(ban.status,'ban_uncertain'); // An Edge success claim cannot substitute for auth.users.banned_until.
 check((await query(completeSql,[...scope(version),revokeRequest,reserved.reservationId,claim.authUserId,
  revokedClaim.banClaimId,true])).value.version,ban.version);
 const uncertainAudit=(await query(`SELECT request_id,metadata FROM public.privileged_audit_events
  WHERE resource_id=$1 AND action='synthetic_admin.auth.ban.uncertain'`,[reserved.reservationId]));
 check(uncertainAudit.request_id,revokeRequest);
 check(uncertainAudit.metadata.originalBanRequestId,revokeRequest);
 check(uncertainAudit.metadata.banClaimRequestId,revokeRequest);
 check(await count('public.privileged_audit_events',`resource_id=$1 AND action='synthetic_admin.auth.ban.uncertain'`,
  [reserved.reservationId]),1);
 const retryRequest=crypto.randomUUID();
 const retryArgs=[...scope(version),retryRequest,'retry.fixed-key-0002',reserved.reservationId];
 const retryClaim=(await query(retrySql,retryArgs)).value;
 check(retryClaim.externalBanAllowed,true);check(retryClaim.authUserId,claim.authUserId);
 check((await query(retrySql,retryArgs)).value.externalBanAllowed,undefined);
 check((await query(retrySql,[...scope(version),revokeRequest,'revoke.fixed-key-0001',reserved.reservationId])).value.externalBanAllowed,undefined);
 await expectedFailure(retrySql,[...scope(version),crypto.randomUUID(),'retry.fixed-key-0002',reserved.reservationId],
  'SYNTHETIC_ADMIN_IDEMPOTENCY_CONFLICT');
 await expectedFailure(retrySql,[ids.actor,ids.org,ids.foreignWorkspace,version,fingerprint,crypto.randomUUID(),
  'retry.wrong-scope-0001',reserved.reservationId],'PR1B_NOT_FOUND');
 await expectedFailure(retrySql,[...scope(version-1),crypto.randomUUID(),'retry.stale-version-0001',reserved.reservationId],
  'PR1B_AUTHORIZATION_STALE');
 await expectedFailure(completeSql,[...scope(version),retryRequest,reserved.reservationId,ids.foreignActor,retryClaim.banClaimId,true],
  'SYNTHETIC_ADMIN_NOT_FOUND');
 await expectedFailure(completeSql,[...scope(version),revokeRequest,reserved.reservationId,claim.authUserId,revokedClaim.banClaimId,true],
  'SYNTHETIC_ADMIN_RECONCILIATION_REQUIRED');
 await client.query(`UPDATE auth.users SET banned_until=statement_timestamp()+interval '2 hours' WHERE id=$1`,[claim.authUserId]);
 const confirmedAfterLoss=(await query(reconcileSql,[...scope(version),reserved.reservationId])).value;
 check(confirmedAfterLoss.status,'revoked');
 check((await query(completeSql,[...scope(version),retryRequest,reserved.reservationId,claim.authUserId,retryClaim.banClaimId,true])).value.version,
  confirmedAfterLoss.version);
 check(await count('public.privileged_audit_events',`resource_id=$1 AND action='synthetic_admin.auth.ban.confirm'`,[reserved.reservationId]),1);
 const confirmAudit=(await query(`SELECT request_id,metadata FROM public.privileged_audit_events
  WHERE resource_id=$1 AND action='synthetic_admin.auth.ban.confirm'`,[reserved.reservationId]));
 check(confirmAudit.request_id,revokeRequest);
 check(confirmAudit.metadata.originalBanRequestId,revokeRequest);
 check(confirmAudit.metadata.banClaimRequestId,retryRequest);
 check(await count('public.synthetic_admin_accounts',`id=$1 AND state='revoked' AND ban_completed_request_id=$2 AND ban_attempts=2`,
  [reserved.reservationId,retryRequest]),1);
 await expectedFailure(listSql,[ids.actor,ids.org,ids.workspace,version-1,fingerprint,null,20],'PR1B_AUTHORIZATION_STALE');
 await client.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[ids.foreignActor,'foreign-synthetic@avalaos.invalid']);
 await client.query('INSERT INTO public.profiles(id,email) VALUES($1,$2)',[ids.foreignActor,'foreign-synthetic@avalaos.invalid']);
 await expectedFailure(listSql,[ids.foreignActor,ids.org,ids.workspace,version,fingerprint,null,20],'PR1B_NOT_FOUND');
 await client.query(`INSERT INTO public.pr_c_controlled_human_recovery_authorities(
  exercise_digest,release_sha,deploy_id,target_fingerprint,authority_digest,operation,state,expected_version,expires_at)
  VALUES($1,$2,$3,$4,$5,'apply','prepared',0,statement_timestamp()+interval '1 hour')`,
  [`sha256:${'c'.repeat(64)}`,'d'.repeat(40),'e'.repeat(24),fingerprint,`sha256:${'f'.repeat(64)}`]);
 await expectedFailure(listSql,[...scope(version),null,20],'SYNTHETIC_ADMIN_FEATURE_DISABLED');
 await client.query('ROLLBACK');
 // The explicitly named disposable database/container is task-owned and
 // removed by the controller runner. A committed fixture lets two independent
 // clients genuinely contend for the target quota lock.
 phase='two_client_quota_race';
 await client.query('BEGIN');
 await client.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[ids.actor,'synthetic-operator@avalaos.invalid']);
 const raceTarget=(await query(`SELECT public.synthetic_admin_bootstrap_operator($1::uuid,$2::uuid,$3::uuid,$4::text) AS value`,
  [ids.actor,ids.org,ids.workspace,fingerprint])).value;
 await client.query('UPDATE public.synthetic_admin_targets SET max_accounts=1 WHERE id=$1',[raceTarget.targetId]);
 const raceVersion=Number((await query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[ids.org,ids.actor])).version);
 await client.query('COMMIT');
 const first=new pg.Client({connectionString});
 const second=new pg.Client({connectionString});
 try{
  await Promise.all([first.connect(),second.connect()]);
  const race=await Promise.allSettled([
   first.query(reserveSql,[...scope(raceVersion),crypto.randomUUID(),'race.reserve.key-0001','Race A','author']),
   second.query(reserveSql,[...scope(raceVersion),crypto.randomUUID(),'race.reserve.key-0002','Race B','viewer']),
  ]);
  check(race.filter(result=>result.status==='fulfilled').length,1);
  check(race.filter(result=>result.status==='rejected'&&result.reason?.message==='SYNTHETIC_ADMIN_QUOTA_EXCEEDED').length,1);
  check(await count('public.synthetic_admin_accounts','target_id=$1',[raceTarget.targetId]),1);
  phase='two_client_ban_retry_race';
  const raceReservation=race.find(result=>result.status==='fulfilled').value.rows[0].value;
  const claimed=(await query(claimSql,[...scope(raceVersion),crypto.randomUUID(),
   'race.execute.key-0001',raceReservation.reservationId])).value;
  await client.query('INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES($1,$2,$3::jsonb)',
   [claimed.authUserId,claimed.syntheticEmail,JSON.stringify({
    synthetic_admin_reservation_id:raceReservation.reservationId,synthetic_admin_target:fingerprint,
   })]);
  const activated=(await query(reconcileSql,[...scope(raceVersion),raceReservation.reservationId])).value;
  const raceRevokeRequest=crypto.randomUUID();
  const raceBan=(await query(revokeSql,[...scope(raceVersion),raceRevokeRequest,
   'race.revoke.key-0001',raceReservation.reservationId,activated.version])).value;
  check(raceBan.externalBanAllowed,true);
  await client.query(`UPDATE public.synthetic_admin_accounts SET ban_claim_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,
   [raceReservation.reservationId]);
  const banRace=await Promise.allSettled([
   first.query(retrySql,[...scope(raceVersion),crypto.randomUUID(),'race.ban.retry-0001',raceReservation.reservationId]),
   second.query(retrySql,[...scope(raceVersion),crypto.randomUUID(),'race.ban.retry-0002',raceReservation.reservationId]),
  ]);
  check(banRace.filter(result=>result.status==='fulfilled').length,2);
  check(banRace.filter(result=>result.status==='fulfilled'&&result.value.rows[0].value.externalBanAllowed===true).length,1);
  check(banRace.filter(result=>result.status==='fulfilled'&&result.value.rows[0].value.externalBanAllowed===undefined).length,1);
  check(await count('public.synthetic_admin_accounts','id=$1 AND ban_attempts=2',[raceReservation.reservationId]),1);
  await client.query(`UPDATE public.synthetic_admin_accounts SET ban_claim_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,
   [raceReservation.reservationId]);
  const thirdClaim=(await query(retrySql,[...scope(raceVersion),crypto.randomUUID(),
   'race.ban.retry-0003',raceReservation.reservationId])).value;
  check(thirdClaim.externalBanAllowed,true);
  check(await count('public.synthetic_admin_accounts','id=$1 AND ban_attempts=3',[raceReservation.reservationId]),1);
  check((await query(retrySql,[...scope(raceVersion),crypto.randomUUID(),
   'race.ban.retry-0004',raceReservation.reservationId])).value.externalBanAllowed,undefined);
  await client.query(`UPDATE auth.users SET banned_until=statement_timestamp()+interval '2 hours' WHERE id=$1`,[claimed.authUserId]);
  check((await query(reconcileSql,[...scope(raceVersion),raceReservation.reservationId])).value.status,'revoked');
  check((await query(retrySql,[...scope(raceVersion),crypto.randomUUID(),'race.ban.retry-0005',raceReservation.reservationId])).value.externalBanAllowed,undefined);
  check(await count('public.privileged_audit_events',`resource_id=$1 AND action='synthetic_admin.auth.ban.confirm'`,[raceReservation.reservationId]),1);
 }finally{
  await Promise.allSettled([first.end(),second.end()]);
 }
 console.log(`synthetic Admin PostgreSQL: ${assertions} assertions passed; transactional fixture rolled back; two-client quota and ban retry races passed in disposable database`);
}catch(error){
 try{await client.query('ROLLBACK');}catch{}
 const detail=String(error?.message??'')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,'[uuid]')
  .replace(/sha256:[0-9a-f]{64}/g,'[digest]')
  .replace(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/g,'[synthetic-login]')
  .slice(0,180);
 console.error(`synthetic Admin PostgreSQL failed in ${phase} after ${assertions} assertions: ${error?.code??'ASSERTION_FAILED'} ${detail}`);
 process.exitCode=1;
}finally{await client.end().catch(()=>undefined);}
