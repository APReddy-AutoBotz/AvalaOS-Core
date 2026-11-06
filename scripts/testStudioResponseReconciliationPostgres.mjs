import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {
  applyMigrations, bootstrapAuth, connect, createDatabase, dropDatabase,
  ensureClusterRoles, migrationNames,
} from './pilotOperationsPostgresSupport.mjs';

const adminUrl = new URL(process.env.PILOT_OPERATIONS_DATABASE_URL ?? '');
if (!['postgres:', 'postgresql:'].includes(adminUrl.protocol)
  || !['127.0.0.1', '[::1]'].includes(adminUrl.hostname)
  || adminUrl.pathname !== '/postgres' || adminUrl.search || adminUrl.hash) {
  throw new Error('Disposable loopback PostgreSQL required');
}
assert.equal(migrationNames.at(-1), '20261106210205_studio_sdd_pdf_branch_routing.sql');

const name = `studio_response_reconciliation_${randomUUID().replaceAll('-', '')}`;
const ids = Object.fromEntries([
  'user', 'org', 'workspace', 'artifact', 'source', 'route', 'config', 'receipt',
  'attempt', 'reservation', 'token', 'invalidAttempt', 'invalidToken',
  'noCandidateAttempt', 'noCandidateReservation', 'noCandidateToken',
].map(key => [key, randomUUID()]));
const hash = character => character.repeat(64);
const response = {sections: [{key: 'summary', heading: 'Summary', body: 'Provider candidate.'}]};
let admin;
let db;

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rejected = async (action, pattern) => assert.rejects(action, pattern);

try {
  admin = await connect(adminUrl.href);
  await ensureClusterRoles(admin);
  db = await createDatabase(admin, adminUrl.href, name);
  await bootstrapAuth(db);
  await db.query(`ALTER TABLE auth.users ADD COLUMN email text`);
  await applyMigrations(db, migrationNames);

  assert.equal((await one(`SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton`)).migration_tip,
    '20261106210205');
  for (const relation of ['studio_generation_provider_candidates', 'studio_generation_spent_output_lost_reconciliations']) {
    assert.deepEqual(await one(`SELECT relrowsecurity rls,relforcerowsecurity force_rls,
      has_table_privilege('service_role',oid,'SELECT') service_select,
      has_table_privilege('authenticated',oid,'SELECT') authenticated_select,
      has_table_privilege('anon',oid,'SELECT') anon_select
      FROM pg_class WHERE oid=$1::regclass`, [`public.${relation}`]),
    {rls: true, force_rls: true, service_select: false, authenticated_select: false, anon_select: false});
  }
  for (const routine of [
    'studio_artifact_generation_candidate_capture_v1(uuid,uuid,bigint,text,jsonb,integer,integer,integer)',
    'studio_artifact_generation_candidate_load_v1(uuid,uuid,bigint)',
    'studio_artifact_generation_candidate_reject_v1(uuid,uuid,bigint,text)',
    'process_evidence_reconcile_spent_output_lost(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid,text,uuid,text,text,timestamptz)',
  ]) {
    assert.deepEqual(await one(`SELECT has_function_privilege('service_role',$1,'EXECUTE') service_execute,
      has_function_privilege('authenticated',$1,'EXECUTE') authenticated_execute,
      has_function_privilege('anon',$1,'EXECUTE') anon_execute`, [`public.${routine}`]),
    {service_execute: true, authenticated_execute: false, anon_execute: false});
  }

  const template = await one(`SELECT id,template_version,template_hash
    FROM public.studio_system_template_versions WHERE artifact_type='brd' AND superseded_at IS NULL`);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`INSERT INTO auth.users(id) VALUES($1)`, [ids.user]);
  await db.query(`INSERT INTO public.profiles(id,email)
    VALUES($1,'studio-response-fixture@invalid.example')`, [ids.user]);
  await db.query(`INSERT INTO public.organizations(id,name,slug)
    VALUES($1,'Studio response fixture','studio-response-fixture')`, [ids.org]);
  await db.query(`INSERT INTO public.workspaces(id,org_id,name,slug)
    VALUES($1,$2,'Studio response fixture','studio-response-fixture')`, [ids.workspace, ids.org]);
  await db.query(`INSERT INTO public.studio_artifact_generation_attempts(
      id,artifact_id,org_id,workspace_id,requested_by,request_id,template_id,input_hash,state,
      source_package_id,source_package_hash,template_kind,template_version,template_hash,
      expected_aggregate_version,requester_authorization_version,provider_plan_state,
      provider_route_id,provider_config_id,provider_name,provider_model,prompt_key,prompt_version,
      provider_plan_hash,execution_token,execution_fence,execution_lease_expires_at,provider_effect_key)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'generating',$9,$10,'system',$11,$12,0,1,'bound',
      $13,$14,'openai','gpt-4.1-mini-2025-04-14','studio-multisource-generation','studio-pr-b-3',
      $15,$16,1,statement_timestamp()+interval '10 minutes',$17)`, [
    ids.attempt, ids.artifact, ids.org, ids.workspace, ids.user, randomUUID(), template.id,
    hash('1'), ids.source, hash('2'), template.template_version, template.template_hash,
    ids.route, ids.config, hash('3'), ids.token, hash('4'),
  ]);
  await db.query(`INSERT INTO public.enterprise_ai_budget_reservations(
      id,receipt_id,job_id,authority_kind,studio_receipt_id,studio_attempt_id,
      org_id,workspace_id,actor_id,authorization_version,route_id,provider_config_id,
      provider,capability,model,state,estimated_input_tokens,maximum_output_tokens,
      execution_token,execution_fence,day_bucket,month_bucket)
    VALUES($1,NULL,NULL,'studio',$2,$3,$4,$5,$6,1,$7,$8,'openai',
      'studio.document.generate','gpt-4.1-mini-2025-04-14','reserved',100,1000,
      $9,1,current_date,date_trunc('month',current_date)::date)`, [
    ids.reservation, ids.receipt, ids.attempt, ids.org, ids.workspace, ids.user,
    ids.route, ids.config, ids.token,
  ]);
  await db.query(`SET session_replication_role=origin`);

  const captureSql = `SELECT public.studio_artifact_generation_candidate_capture_v1(
    $1,$2,$3,$4,$5::jsonb,$6,$7,$8) value`;
  const captureArgs = [ids.attempt, ids.token, 1, 'provider-operation-1', response, 80, 20, 100];
  const captured = (await one(captureSql, captureArgs)).value;
  assert.equal(captured.outcome, 'committed');
  assert.equal(captured.state, 'captured');
  assert.equal(captured.reservationId, ids.reservation);
  assert.deepEqual(captured.usage, {inputTokens: 80, outputTokens: 20, totalTokens: 100});
  assert.equal((await one(captureSql, captureArgs)).value.outcome, 'replayed');
  await rejected(() => db.query(captureSql, [...captureArgs.slice(0, 4), {...response, changed: true}, ...captureArgs.slice(5)]),
    /IDEMPOTENCY_CONFLICT/);
  await rejected(() => db.query(captureSql, [ids.attempt, randomUUID(), 1, ...captureArgs.slice(3)]),
    /IDEMPOTENCY_CONFLICT|STALE_EXECUTION_FENCE/);

  const loaded = (await one(`SELECT public.studio_artifact_generation_candidate_load_v1($1,$2,1) value`,
    [ids.attempt, ids.token])).value;
  assert.deepEqual(loaded.response, response);
  assert.equal(loaded.providerOperationId, 'provider-operation-1');
  await rejected(() => db.query(`SELECT public.studio_artifact_generation_candidate_load_v1($1,$2,2)`,
    [ids.attempt, ids.token]), /STALE_EXECUTION_FENCE/);

  const auditBefore = Number((await one(`SELECT count(*)::int n FROM public.privileged_audit_events`)).n);
  await db.query('BEGIN');
  try {
    await rejected(() => db.query(`SELECT public.studio_artifact_generation_stage_v2($1,$2,1,'wrong-operation',$3::jsonb)`,
      [ids.attempt, ids.token, response]), /GENERATION_CANDIDATE_MISMATCH/);
    await db.query('ROLLBACK');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  assert.equal((await one(`SELECT state FROM public.studio_generation_provider_candidates WHERE attempt_id=$1`,
    [ids.attempt])).state, 'captured');
  assert.equal(Number((await one(`SELECT count(*)::int n FROM public.privileged_audit_events`)).n), auditBefore);

  const postcomposed = {...response, acceptedSourceFacts: [{field: 'responseTarget', value: 'two working days'}]};
  const staged = (await one(`SELECT public.studio_artifact_generation_stage_v2($1,$2,1,$3,$4::jsonb) value`,
    [ids.attempt, ids.token, 'provider-operation-1', postcomposed])).value;
  assert.equal(staged.state, 'response_staged');
  assert.equal((await one(`SELECT state FROM public.studio_generation_provider_candidates WHERE attempt_id=$1`,
    [ids.attempt])).state, 'validated');
  await rejected(() => db.query(`UPDATE public.studio_generation_provider_candidates SET response_content='{}'::jsonb
    WHERE attempt_id=$1`, [ids.attempt]), /STUDIO_GENERATION_CANDIDATE_IMMUTABLE/);

  await db.query(`SET session_replication_role=replica`);
  await db.query(`INSERT INTO public.studio_artifact_generation_attempts(
      id,artifact_id,org_id,workspace_id,requested_by,request_id,template_id,input_hash,state,
      source_package_id,source_package_hash,template_kind,template_version,template_hash,
      expected_aggregate_version,requester_authorization_version,provider_plan_state,
      provider_route_id,provider_config_id,provider_name,provider_model,prompt_key,prompt_version,
      provider_plan_hash,execution_token,execution_fence,execution_lease_expires_at,provider_effect_key)
    SELECT $1,$2,org_id,workspace_id,requested_by,$3,template_id,$4,'generating',$5,$6,
      template_kind,template_version,template_hash,expected_aggregate_version,
      requester_authorization_version,provider_plan_state,provider_route_id,provider_config_id,
      provider_name,provider_model,prompt_key,prompt_version,$7,$8,1,
      statement_timestamp()+interval '10 minutes',$9
    FROM public.studio_artifact_generation_attempts WHERE id=$10`, [
    ids.noCandidateAttempt, randomUUID(), randomUUID(), hash('a'), randomUUID(), hash('b'),
    hash('c'), ids.noCandidateToken, hash('d'), ids.attempt,
  ]);
  await db.query(`INSERT INTO public.enterprise_ai_budget_reservations(
      id,receipt_id,job_id,authority_kind,studio_receipt_id,studio_attempt_id,
      org_id,workspace_id,actor_id,authorization_version,route_id,provider_config_id,
      provider,capability,model,state,estimated_input_tokens,maximum_output_tokens,
      execution_token,execution_fence,day_bucket,month_bucket)
    SELECT $1,NULL,NULL,'studio',$2,$3,org_id,workspace_id,actor_id,authorization_version,
      route_id,provider_config_id,provider,capability,model,'reserved',estimated_input_tokens,
      maximum_output_tokens,$4,1,day_bucket,month_bucket
    FROM public.enterprise_ai_budget_reservations WHERE id=$5`, [
    ids.noCandidateReservation, randomUUID(), ids.noCandidateAttempt, ids.noCandidateToken, ids.reservation,
  ]);
  await db.query(`SET session_replication_role=origin`);
  await rejected(() => db.query(`SELECT public.studio_artifact_generation_stage_v2(
    $1,$2,1,'provider-operation-without-capture',$3::jsonb)`,
  [ids.noCandidateAttempt, ids.noCandidateToken, response]), /GENERATION_CANDIDATE_REQUIRED/);

  await db.query(`SET session_replication_role=replica`);
  await db.query(`INSERT INTO public.studio_artifact_generation_attempts(
      id,artifact_id,org_id,workspace_id,requested_by,request_id,template_id,input_hash,state,
      source_package_id,source_package_hash,template_kind,template_version,template_hash,
      expected_aggregate_version,requester_authorization_version,provider_plan_state,
      execution_token,execution_fence,provider_effect_key)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'response_staged',$9,$10,'system',$11,$12,0,1,
      'legacy_unverified',$13,1,$14)`, [
    ids.invalidAttempt, randomUUID(), ids.org, ids.workspace, ids.user, randomUUID(), template.id,
    hash('5'), randomUUID(), hash('6'), template.template_version, template.template_hash,
    ids.invalidToken, hash('7'),
  ]);
  await db.query(`INSERT INTO public.studio_generation_staged_responses(
      attempt_id,artifact_id,org_id,workspace_id,execution_token,execution_fence,response_content,
      response_hash,schema_status)
    SELECT id,artifact_id,org_id,workspace_id,execution_token,execution_fence,'{}'::jsonb,
      public.enterprise_sha256_jsonb('{}'::jsonb),'invalid'
    FROM public.studio_artifact_generation_attempts WHERE id=$1`, [ids.invalidAttempt]);
  await db.query(`SET session_replication_role=origin`);
  await rejected(() => db.query(`SELECT public.studio_artifact_generation_finalize_v2($1,$2,1)`,
    [ids.invalidAttempt, ids.invalidToken]), /VERSION_CONFLICT/);
  assert.equal(Number((await one(`SELECT count(*)::int n FROM public.studio_artifact_versions
    WHERE generation_attempt_id=$1`, [ids.invalidAttempt])).n), 0);

  await db.query(`SET session_replication_role=replica`);
  await db.query(`UPDATE public.enterprise_ai_budget_reservations SET state='settled',
    actual_input_tokens=80,actual_output_tokens=20,actual_total_tokens=100,settled_at=statement_timestamp()
    WHERE id=$1`, [ids.reservation]);
  await db.query(`UPDATE public.studio_artifact_generation_attempts SET state='generating',
    provider_operation_id=NULL,response_hash=NULL WHERE id=$1`, [ids.attempt]);
  await db.query(`DELETE FROM public.studio_generation_staged_responses WHERE attempt_id=$1`, [ids.attempt]);
  await db.query(`UPDATE public.studio_generation_provider_candidates SET state='captured',resolved_at=NULL
    WHERE attempt_id=$1`, [ids.attempt]);
  await db.query(`SET session_replication_role=origin`);
  const rejectedCandidate = (await one(`SELECT public.studio_artifact_generation_candidate_reject_v1(
    $1,$2,1,'PROVIDER_OUTPUT_INVALID') value`, [ids.attempt, ids.token])).value;
  assert.deepEqual({state: rejectedCandidate.state, failureCode: rejectedCandidate.failureCode},
    {state: 'rejected', failureCode: 'PROVIDER_OUTPUT_INVALID'});
  assert.equal((await one(`SELECT state FROM public.studio_artifact_generation_attempts WHERE id=$1`,
    [ids.attempt])).state, 'provider_rejected');
  assert.equal(Number((await one(`SELECT count(*)::int n FROM public.studio_artifact_versions
    WHERE generation_attempt_id=$1`, [ids.attempt])).n), 0);
  await rejected(() => db.query(`SELECT public.studio_artifact_generation_candidate_reject_v1(
    $1,$2,1,'SOURCE_COVERAGE_INCOMPLETE')`, [ids.attempt, ids.token]), /IDEMPOTENCY_CONFLICT/);

  const beforeLost = await one(`SELECT
    (SELECT count(*)::int FROM public.studio_generation_spent_output_lost_reconciliations) reconciliations,
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations WHERE state='uncertain') uncertain`);
  await rejected(() => db.query(`SELECT public.process_evidence_reconcile_spent_output_lost(
    NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)`),
  /STUDIO_SPENT_OUTPUT_LOST_BINDING_INVALID/);
  assert.deepEqual(await one(`SELECT
    (SELECT count(*)::int FROM public.studio_generation_spent_output_lost_reconciliations) reconciliations,
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations WHERE state='uncertain') uncertain`), beforeLost);

  await db.query(`SET session_replication_role=replica`);
  await db.query(`DELETE FROM public.studio_generation_provider_candidates WHERE org_id=$1`, [ids.org]);
  await db.query(`DELETE FROM public.studio_generation_staged_responses WHERE org_id=$1`, [ids.org]);
  await db.query(`DELETE FROM public.studio_generation_recovery_events WHERE org_id=$1`, [ids.org]);
  await db.query(`DELETE FROM public.enterprise_ai_budget_reservations WHERE org_id=$1`, [ids.org]);
  await db.query(`DELETE FROM public.studio_artifact_generation_attempts WHERE org_id=$1`, [ids.org]);
  await db.query(`DELETE FROM public.privileged_audit_events WHERE org_id=$1`, [ids.org]);
  await db.query(`DELETE FROM public.workspaces WHERE id=$1`, [ids.workspace]);
  await db.query(`DELETE FROM public.organizations WHERE id=$1`, [ids.org]);
  await db.query(`DELETE FROM public.profiles WHERE id=$1`, [ids.user]);
  await db.query(`DELETE FROM auth.users WHERE id=$1`, [ids.user]);
  await db.query(`SET session_replication_role=origin`);

  const run = Object.fromEntries([
    'operator', 'assess', 'studio', 'org', 'workspace', 'config', 'key',
    'assessRoute', 'studioRoute', 'attempt', 'artifact', 'source', 'receipt',
    'reservation', 'debit', 'token',
  ].map(key => [key, randomUUID()]));
  const project = 'abcdefghijklmnopqrst';
  const fingerprint = `sha256:${hash('a')}`;
  const secretReference = `AVALA_PROVIDER_SECRET_OPENAI_${run.org.replaceAll('-', '').toUpperCase()}_TEST`;
  await db.query(`SELECT set_config('request.headers',$1,false)`,
    [JSON.stringify({host: `${project}.supabase.co`})]);
  await db.query(`INSERT INTO auth.users(id,email) VALUES($1,$2)`,
    [run.operator, 'operator-response-reconciliation@invalid.example']);
  const target = (await one(`SELECT public.synthetic_admin_bootstrap_operator($1,$2,$3,$4) value`,
    [run.operator, run.org, run.workspace, fingerprint])).value;
  const roles = await one(`SELECT organization_member_role_id member_role,
      (SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=target.id AND preset='author') author_role
    FROM public.synthetic_admin_targets target WHERE target.id=$1`, [target.targetId]);
  for (const [actor, label] of [[run.assess, 'assess'], [run.studio, 'studio']]) {
    await db.query(`INSERT INTO auth.users(id,email) VALUES($1,$2)`,
      [actor, `${label}-response-reconciliation@invalid.example`]);
    await db.query(`INSERT INTO public.profiles(id,email,status) VALUES($1,$2,'active')`,
      [actor, `${label}-response-reconciliation@invalid.example`]);
    await db.query(`INSERT INTO public.organization_members(
        org_id,user_id,role_id,status,joined_at,created_by)
      VALUES($1,$2,$3,'active',statement_timestamp(),$4)`,
    [run.org, actor, roles.member_role, run.operator]);
    await db.query(`INSERT INTO public.workspace_memberships(
        org_id,workspace_id,user_id,role_id,status,joined_at,created_by)
      VALUES($1,$2,$3,$4,'active',statement_timestamp(),$5)`,
    [run.org, run.workspace, actor, roles.author_role, run.operator]);
  }
  let operatorVersion = Number((await one(`SELECT version FROM public.authorization_versions
    WHERE org_id=$1 AND user_id=$2`, [run.org, run.operator])).version);
  const access = (await one(`SELECT public.synthetic_admin_grant_operator_assess_read(
    $1,$2,$3,$4,$5,$6,$7) value`, [
    run.operator, run.org, run.workspace, operatorVersion, fingerprint, randomUUID(), 'response-reconciliation-access',
  ])).value;
  operatorVersion = Number(access.version);
  const openArgs = [
    run.operator, run.org, run.workspace, operatorVersion, fingerprint, project,
    `sha256:${hash('c')}`, secretReference, run.config, run.key, run.assessRoute,
    run.studioRoute, new Date(Date.now() + 60 * 60 * 1000), hash('b').slice(0, 40),
    run.assess, run.studio,
  ];
  const permit = (await one(`SELECT public.process_evidence_open_provider_run(
    ${openArgs.map((_, index) => `$${index + 1}`).join(',')}) value`, openArgs)).value;
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton`);
  await db.query(`UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton`);
  await db.query(`SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)`,
    [run.operator, run.org, run.workspace, operatorVersion, fingerprint, project]);
  const resumeArgs = [run.operator, run.org, run.workspace, operatorVersion, fingerprint, project,
    permit.campaignId, secretReference, run.config, run.key, run.assessRoute, run.studioRoute,
    new Date(Date.now() + 60 * 60 * 1000), hash('e').slice(0, 40), run.assess, run.studio];
  await one(`SELECT public.process_evidence_resume_provider_run(
    ${resumeArgs.map((_, index) => `$${index + 1}`).join(',')}) value`, resumeArgs);

  const assessVersion = Number((await one(`SELECT version FROM public.authorization_versions
    WHERE org_id=$1 AND user_id=$2`, [run.org, run.assess])).version);
  const validationReceipt = randomUUID();
  const extractionFixtures = [1, 2].map(slot => ({
    slot, receipt: randomUUID(), effect: randomUUID(), reservation: randomUUID(), token: randomUUID(),
  }));
  await db.query(`SET session_replication_role=replica`);
  await db.query(`INSERT INTO public.synthetic_ai_campaign_effect_debits(
      campaign_id,receipt_id,effect_id,authority_kind,actor_id,org_id,workspace_id,
      authorization_version,execution_token,execution_fence,command_request_hash,effect_request_hash,
      maximum_output_tokens,operation,route_id,provider_config_id,key_ref_id,provider,endpoint,model,
      debit_usd_nanos,consumed_at,process_run_slot)
    VALUES($1,$2,$2,'enterprise',$3,$4,$5,$6,$7,1,$8,$9,32768,'provider.validate',NULL,
      $10,$11,'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14',471459200,
      statement_timestamp(),1)`, [permit.campaignId, validationReceipt, run.operator, run.org,
    run.workspace, operatorVersion, randomUUID(), hash('1'), hash('2'), run.config, run.key]);
  for (const fixture of extractionFixtures) {
    await db.query(`INSERT INTO public.synthetic_ai_campaign_effect_debits(
        campaign_id,receipt_id,effect_id,authority_kind,actor_id,org_id,workspace_id,
        authorization_version,execution_token,execution_fence,command_request_hash,effect_request_hash,
        maximum_output_tokens,operation,route_id,provider_config_id,key_ref_id,provider,endpoint,model,
        debit_usd_nanos,consumed_at,process_run_slot)
      VALUES($1,$2,$3,'enterprise',$4,$5,$6,$7,$8,1,$9,$10,4096,'assess.evidence.extract',$11,
        $12,$13,'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14',471459200,
        statement_timestamp(),$14)`, [permit.campaignId, fixture.receipt, fixture.effect, run.assess,
      run.org, run.workspace, assessVersion, fixture.token, hash('3'), hash('4'), run.assessRoute,
      run.config, run.key, fixture.slot]);
    await db.query(`INSERT INTO public.enterprise_ai_budget_reservations(
        id,receipt_id,job_id,authority_kind,org_id,workspace_id,actor_id,authorization_version,
        route_id,provider_config_id,provider,capability,model,state,estimated_input_tokens,
        maximum_output_tokens,actual_input_tokens,actual_output_tokens,actual_total_tokens,
        execution_token,execution_fence,day_bucket,month_bucket,settled_at)
      VALUES($1,$2,$3,'enterprise',$4,$5,$6,$7,$8,$9,'openai','assess.evidence.extract',
        'gpt-4.1-mini-2025-04-14','settled',100,4096,80,20,100,$10,1,current_date,
        date_trunc('month',current_date)::date,statement_timestamp())`, [fixture.reservation,
      fixture.receipt, fixture.effect, run.org, run.workspace, run.assess, assessVersion,
      run.assessRoute, run.config, fixture.token]);
  }
  await db.query(`SET session_replication_role=origin`);
  await db.query(`UPDATE public.ai_provider_key_refs SET status='active' WHERE id=$1`, [run.key]);
  await db.query(`UPDATE public.ai_provider_configs SET last_validated_at=statement_timestamp() WHERE id=$1`,
    [run.config]);
  await db.query(`SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)`,
    [run.operator, run.org, run.workspace, operatorVersion, fingerprint, project]);

  const postUseArgs = (sequence, commit) => [
    run.operator, run.org, run.workspace, operatorVersion, fingerprint, project, permit.campaignId,
    secretReference, `sha256:${'2'.repeat(24)}`, run.config, run.key, run.assessRoute,
    run.studioRoute, run.assess, run.studio, commit, new Date(Date.now() + 60 * 60 * 1000),
    randomUUID(), `response-reconciliation-window-${sequence}`,
    `sha256:${String(sequence + 2).repeat(64)}`, new Date(),
    `sha256:${String(sequence + 4).repeat(64)}`, new Date(),
    new Date(Date.now() + 3 * 86400000), 53_000_000_000,
  ];
  const renewSql = args => `SELECT public.process_evidence_renew_provider_run_after_use(
    ${args.map((_, index) => `$${index + 1}`).join(',')}) value`;
  const firstRenewalArgs = postUseArgs(1, hash('6').slice(0, 40));
  const firstRenewal = (await one(renewSql(firstRenewalArgs), firstRenewalArgs)).value;
  assert.equal(firstRenewal.baselineCalls, 3);
  const runTemplate = await one(`SELECT id,template_version,template_hash
    FROM public.studio_system_template_versions WHERE artifact_type='sdd' AND superseded_at IS NULL`);

  await db.query(`SET session_replication_role=replica`);
  await db.query(`INSERT INTO public.studio_artifact_generation_attempts(
      id,artifact_id,org_id,workspace_id,requested_by,request_id,template_id,input_hash,state,
      source_package_id,source_package_hash,template_kind,template_version,template_hash,
      expected_aggregate_version,requester_authorization_version,provider_plan_state,
      provider_route_id,provider_config_id,provider_name,provider_model,prompt_key,prompt_version,
      provider_plan_hash,execution_token,execution_fence,execution_lease_expires_at,provider_effect_key)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'generating',$9,$10,'system',$11,$12,0,1,'bound',
      $13,$14,'openai','gpt-4.1-mini-2025-04-14','studio-multisource-generation','studio-pr-b-1',
      $15,$16,1,statement_timestamp()-interval '1 minute',$17)`, [
    run.attempt, run.artifact, run.org, run.workspace, run.studio, randomUUID(), runTemplate.id,
    hash('8'), run.source, hash('9'), runTemplate.template_version, runTemplate.template_hash,
    run.studioRoute, run.config, hash('d'), run.token, hash('e'),
  ]);
  await db.query(`INSERT INTO public.enterprise_ai_budget_reservations(
      id,receipt_id,job_id,authority_kind,studio_receipt_id,studio_attempt_id,
      org_id,workspace_id,actor_id,authorization_version,route_id,provider_config_id,
      provider,capability,model,state,estimated_input_tokens,maximum_output_tokens,
      failure_class,execution_token,execution_fence,day_bucket,month_bucket)
    VALUES($1,NULL,NULL,'studio',$2,$3,$4,$5,$6,1,$7,$8,'openai',
      'studio.document.generate','gpt-4.1-mini-2025-04-14','uncertain',100,4000,
      'provider_timeout',$9,1,current_date,date_trunc('month',current_date)::date)`, [
    run.reservation, run.receipt, run.attempt, run.org, run.workspace, run.studio,
    run.studioRoute, run.config, run.token,
  ]);
  await db.query(`INSERT INTO public.synthetic_ai_campaign_effect_debits(
      id,campaign_id,receipt_id,effect_id,authority_kind,studio_receipt_id,studio_attempt_id,
      actor_id,org_id,workspace_id,authorization_version,execution_token,execution_fence,
      command_request_hash,effect_request_hash,maximum_output_tokens,operation,route_id,
      provider_config_id,key_ref_id,provider,endpoint,model,debit_usd_nanos,consumed_at,process_run_slot)
    VALUES($1,$2,NULL,$3,'studio',$4,$3,$5,$6,$7,1,$8,1,$9,$10,4000,
      'studio.document.generate',$11,$12,$13,'openai','https://api.openai.com',
      'gpt-4.1-mini-2025-04-14',471459200,statement_timestamp(),1)`, [
    run.debit, permit.campaignId, run.attempt, run.receipt, run.studio, run.org, run.workspace,
    run.token, hash('f'), hash('0'), run.studioRoute, run.config, run.key,
  ]);
  await db.query(`SET session_replication_role=origin`);
  await db.query(`SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)`,
    [run.operator, run.org, run.workspace, operatorVersion, fingerprint, project]);

  const reconcileArgs = [
    run.operator, run.org, run.workspace, operatorVersion, fingerprint, project,
    permit.campaignId, run.attempt, run.reservation, run.debit, run.receipt, run.token,
    1, run.studioRoute, run.config, run.key, 'gpt-4.1-mini-2025-04-14', randomUUID(),
    'spent-output-lost-exact-attempt', `sha256:${hash('1')}`, new Date(),
  ];
  const reconcileSql = `SELECT public.process_evidence_reconcile_spent_output_lost(
    ${reconcileArgs.map((_, index) => `$${index + 1}`).join(',')}) value`;
  await db.query(`UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton`);
  await rejected(() => db.query(reconcileSql, reconcileArgs), /STUDIO_SPENT_OUTPUT_LOST_RUNTIME_NOT_OFF/);
  await db.query(`UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton`);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`INSERT INTO public.enterprise_provider_secret_backend_ownerships(
      key_ref_id,exercise_id,receipt_id,org_id,workspace_id,provider,backend_kind,
      secret_reference_hash,safe_fingerprint,vault_secret_id,state)
    VALUES($1,$2,$3,$4,$5,'openai','supabase_vault',$6,$7,$8,'written')`, [
    run.key, randomUUID(), randomUUID(), run.org, run.workspace, hash('2'),
    `sha256:${'3'.repeat(24)}`, randomUUID(),
  ]);
  await db.query(`SET session_replication_role=origin`);
  await rejected(() => db.query(reconcileSql, reconcileArgs), /STUDIO_SPENT_OUTPUT_LOST_RUNTIME_NOT_OFF/);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`DELETE FROM public.enterprise_provider_secret_backend_ownerships WHERE key_ref_id=$1`, [run.key]);
  await db.query(`SET session_replication_role=origin`);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`UPDATE public.studio_artifact_generation_attempts
    SET execution_lease_expires_at=statement_timestamp()+interval '1 minute' WHERE id=$1`, [run.attempt]);
  await db.query(`SET session_replication_role=origin`);
  await rejected(() => db.query(reconcileSql, reconcileArgs), /STUDIO_SPENT_OUTPUT_LOST_HISTORY_UNSAFE/);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`UPDATE public.studio_artifact_generation_attempts
    SET execution_lease_expires_at=statement_timestamp()-interval '1 minute' WHERE id=$1`, [run.attempt]);
  await db.query(`SET session_replication_role=origin`);
  const staleAttestation = [...reconcileArgs];
  staleAttestation[20] = new Date(Date.now() - 16 * 60 * 1000);
  await rejected(() => db.query(reconcileSql, staleAttestation), /STUDIO_SPENT_OUTPUT_LOST_BINDING_INVALID/);

  await db.query(`SET session_replication_role=replica`);
  await db.query(`UPDATE public.enterprise_ai_budget_reservations
    SET failure_class='provider_request_failed' WHERE id=$1`, [run.reservation]);
  await db.query(`SET session_replication_role=origin`);
  await rejected(() => db.query(reconcileSql, reconcileArgs), /STUDIO_SPENT_OUTPUT_LOST_HISTORY_UNSAFE/);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`UPDATE public.enterprise_ai_budget_reservations
    SET failure_class='provider_timeout' WHERE id=$1`, [run.reservation]);
  await db.query(`SET session_replication_role=origin`);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`UPDATE public.enterprise_ai_budget_reservations
    SET failure_class=NULL WHERE id=$1`, [run.reservation]);
  await db.query(`SET session_replication_role=origin`);
  await rejected(() => db.query(reconcileSql, reconcileArgs), /STUDIO_SPENT_OUTPUT_LOST_HISTORY_UNSAFE/);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`UPDATE public.enterprise_ai_budget_reservations
    SET failure_class='provider_timeout' WHERE id=$1`, [run.reservation]);
  await db.query(`UPDATE public.studio_artifact_generation_attempts
    SET provider_operation_id='unpersisted-provider-result' WHERE id=$1`, [run.attempt]);
  await db.query(`SET session_replication_role=origin`);
  await rejected(() => db.query(reconcileSql, reconcileArgs), /STUDIO_SPENT_OUTPUT_LOST_HISTORY_UNSAFE/);
  await db.query(`SET session_replication_role=replica`);
  await db.query(`UPDATE public.studio_artifact_generation_attempts
    SET provider_operation_id=NULL WHERE id=$1`, [run.attempt]);
  await db.query(`SET session_replication_role=origin`);
  const wrongDebit = [...reconcileArgs];
  wrongDebit[9] = randomUUID();
  await rejected(() => db.query(reconcileSql, wrongDebit), /STUDIO_SPENT_OUTPUT_LOST_HISTORY_UNSAFE/);

  const conservativeBefore = await one(`SELECT reservation.state,reservation.failure_class,
      reservation.actual_total_tokens,reservation.release_reason,
      debit.debit_usd_nanos::text debit_usd_nanos,debit.consumed_at IS NOT NULL consumed
    FROM public.enterprise_ai_budget_reservations reservation
    JOIN public.synthetic_ai_campaign_effect_debits debit ON debit.id=$2
    WHERE reservation.id=$1`, [run.reservation, run.debit]);
  const cumulativeLedgerBefore = await one(`SELECT count(*)::int call_count,
      count(*) FILTER (WHERE consumed_at IS NOT NULL)::int consumed_count,
      COALESCE(sum(debit_usd_nanos),0)::text debit_usd_nanos
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1`, [permit.campaignId]);
  await db.query('BEGIN');
  await db.query(`SET LOCAL session_replication_role=replica`);
  await db.query(`UPDATE public.enterprise_ai_budget_reservations
    SET failure_class='pre_settlement_persistence_failed' WHERE id=$1`, [run.reservation]);
  await db.query(`SET LOCAL session_replication_role=origin`);
  const preservedPriorClass = (await one(reconcileSql, reconcileArgs)).value;
  assert.equal(preservedPriorClass.failureClass, 'pre_settlement_persistence_failed');
  await db.query('ROLLBACK');
  await db.query('BEGIN');
  const rolledBack = (await one(reconcileSql, reconcileArgs)).value;
  assert.equal(rolledBack.disposition, 'spent_output_lost');
  await db.query('ROLLBACK');
  assert.equal(Number((await one(`SELECT count(*)::int n
    FROM public.studio_generation_spent_output_lost_reconciliations WHERE attempt_id=$1`, [run.attempt])).n), 0);
  assert.equal((await one(`SELECT state FROM public.studio_artifact_generation_attempts WHERE id=$1`,
    [run.attempt])).state, 'generating');

  const reconciled = (await one(reconcileSql, reconcileArgs)).value;
  assert.equal(reconciled.disposition, 'spent_output_lost');
  assert.equal(reconciled.actualUsage, 'unknown');
  assert.equal(reconciled.callAllocationRetained, true);
  assert.equal(reconciled.providerRetryAuthorized, false);
  assert.equal(reconciled.failureClass, 'provider_timeout');
  assert.equal((await one(`SELECT state FROM public.studio_artifact_generation_attempts WHERE id=$1`,
    [run.attempt])).state, 'spent_output_lost');
  assert.deepEqual(await one(`SELECT reservation.state,reservation.failure_class,
      reservation.actual_total_tokens,reservation.release_reason,
      debit.debit_usd_nanos::text debit_usd_nanos,debit.consumed_at IS NOT NULL consumed
    FROM public.enterprise_ai_budget_reservations reservation
    JOIN public.synthetic_ai_campaign_effect_debits debit ON debit.id=$2
    WHERE reservation.id=$1`, [run.reservation, run.debit]), conservativeBefore);
  assert.deepEqual(await one(`SELECT count(*)::int call_count,
      count(*) FILTER (WHERE consumed_at IS NOT NULL)::int consumed_count,
      COALESCE(sum(debit_usd_nanos),0)::text debit_usd_nanos
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1`, [permit.campaignId]),
  cumulativeLedgerBefore);
  assert.equal((await one(`SELECT reservation_failure_class FROM
    public.studio_generation_spent_output_lost_reconciliations WHERE attempt_id=$1`,
  [run.attempt])).reservation_failure_class, 'provider_timeout');
  assert.equal((await one(`SELECT metadata->>'failureClass' failure_class
    FROM public.privileged_audit_events
    WHERE action='studio.artifact.generation.spent-output-lost.reconcile' AND resource_id=$1`,
  [run.attempt])).failure_class, 'provider_timeout');
  assert.equal((await one(reconcileSql, reconcileArgs)).value.replayed, true);
  const replayMismatch = [...reconcileArgs];
  replayMismatch[18] = 'spent-output-lost-changed-binding';
  await rejected(() => db.query(reconcileSql, replayMismatch), /STUDIO_SPENT_OUTPUT_LOST_REPLAY_MISMATCH/);
  await rejected(() => db.query(`UPDATE public.studio_generation_spent_output_lost_reconciliations
    SET result=result WHERE attempt_id=$1`, [run.attempt]), /STUDIO_IMMUTABLE/);

  const secondRenewalArgs = postUseArgs(2, hash('7').slice(0, 40));
  await db.query('BEGIN');
  await db.query(`UPDATE public.enterprise_ai_budget_reservations SET state='uncertain',
    failure_class='provider_request_failed',actual_input_tokens=NULL,actual_output_tokens=NULL,
    actual_total_tokens=NULL,settled_at=NULL WHERE id=$1`, [extractionFixtures[0].reservation]);
  await rejected(() => db.query(renewSql(secondRenewalArgs), secondRenewalArgs),
    /PROCESS_EVIDENCE_POST_USE_HISTORY_UNSAFE/);
  await db.query('ROLLBACK');

  const secondRenewal = (await one(renewSql(secondRenewalArgs), secondRenewalArgs)).value;
  assert.equal(secondRenewal.baselineCalls, 4);
  assert.equal(secondRenewal.maximumReservedUsdNanos, 6128969600);
  assert.equal(Number((await one(`SELECT count(*)::int n
    FROM public.synthetic_ai_campaign_effect_debits WHERE campaign_id=$1`, [permit.campaignId])).n), 4);
  assert.equal((await one(`SELECT state FROM public.enterprise_ai_budget_reservations WHERE id=$1`,
    [run.reservation])).state, 'uncertain');

  const routePolicy = {policy: 'manual_acceptance_fixture', version: 1};
  const manualBrief = 'Synthetic SDD replacement source after conservative lost-output reconciliation.';
  await db.query(`SET session_replication_role=replica`);
  await db.query(`INSERT INTO public.studio_artifact_aggregates(
      id,org_id,workspace_id,source_package_hash,source_schema_version,rule_set_version,
      review_schema_version,review_sequence,artifact_type,aggregate_version,lifecycle,created_by,
      source_package_id,source_mode,lineage_classification,planning_only)
    VALUES($1,$2,$3,$4,'studio-source-package-1','planning-only','planning-review-1',1,
      'sdd',0,'draft',$5,$6,'manual_brief','not_assessed',true)`, [
    run.artifact, run.org, run.workspace, hash('9'), run.studio, run.source,
  ]);
  await db.query(`INSERT INTO public.studio_artifact_source_packages(
      id,artifact_id,org_id,workspace_id,version,source_mode,manual_brief_hash,
      lineage_classification,planning_only,route_policy_version,route_policy_snapshot,
      route_policy_hash,package_hash,created_by)
    VALUES($1,$2,$3,$4,1,'manual_brief',
      encode(public.digest(convert_to($5,'UTF8'),'sha256'),'hex'),'not_assessed',true,1,$6::jsonb,
      public.enterprise_sha256_jsonb($6::jsonb),$7,$8)`, [
    run.source, run.artifact, run.org, run.workspace, manualBrief, routePolicy, hash('9'), run.studio,
  ]);
  await db.query(`INSERT INTO public.studio_artifact_manual_brief_materials(
      source_package_id,artifact_id,org_id,workspace_id,manual_brief,manual_brief_hash,created_by)
    VALUES($1,$2,$3,$4,$5,encode(public.digest(convert_to($5,'UTF8'),'sha256'),'hex'),$6)`, [
    run.source, run.artifact, run.org, run.workspace, manualBrief, run.studio,
  ]);
  await db.query(`SET session_replication_role=origin`);
  await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(
      org_id,workspace_id,unified_byok_gateway_enabled,studio_multisource_enabled,updated_by)
    VALUES($1,$2,true,true,$3)
    ON CONFLICT(org_id,workspace_id) DO UPDATE SET
      unified_byok_gateway_enabled=true,studio_multisource_enabled=true,updated_by=excluded.updated_by`,
  [run.org, run.workspace, run.operator]);
  await db.query(`UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton`);
  const studioVersion = Number((await one(`SELECT version FROM public.authorization_versions
    WHERE org_id=$1 AND user_id=$2`, [run.org, run.studio])).version);
  const replacementCommand = {
    actorId: run.studio,
    organizationId: run.org,
    workspaceId: run.workspace,
    requestId: randomUUID(),
    idempotencyKey: 'spent-output-lost-fresh-replacement',
    authorizationVersion: studioVersion,
    artifactId: run.artifact,
    sourcePackageId: run.source,
    templateKind: 'system',
    templateVersionId: runTemplate.id,
    expectedAggregateVersion: 0,
    expectedCurrentVersionId: null,
    expectedApprovedVersionId: null,
  };
  const replacement = (await one(`SELECT public.studio_artifact_generation_request_v2($1::jsonb) value`,
    [replacementCommand])).value;
  assert.equal(replacement.state, 'requested');
  assert.notEqual(replacement.attemptId, run.attempt);
  assert.deepEqual(await one(`SELECT
      count(*) FILTER(WHERE state='spent_output_lost')::int lost,
      count(*) FILTER(WHERE state='requested')::int replacement
    FROM public.studio_artifact_generation_attempts WHERE artifact_id=$1`, [run.artifact]),
  {lost: 1, replacement: 1});

  console.log('Studio response reconciliation PostgreSQL scenarios passed.');
} finally {
  if (db) await db.end().catch(() => {});
  if (admin) {
    await dropDatabase(admin, name).catch(() => {});
    await admin.end().catch(() => {});
  }
}
