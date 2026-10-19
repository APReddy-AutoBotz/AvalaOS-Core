import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';
import { createEnterpriseIntelligenceFixture } from './enterpriseIntelligencePostgresFixture.mjs';
import { AUTHENTICATED_SYNTHETIC_ACTIVE_RESIDUE_SQL } from './authenticatedHostedControllerAdapters.mjs';

const { Client } = pg;
const root = process.cwd();
const source = process.env.AUTHENTICATED_SYNTHETIC_DATABASE_URL
  ?? 'postgres://postgres:postgres@127.0.0.1:61676/postgres';
const parsed = new URL(source);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
  || !['127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())
  || parsed.pathname !== '/postgres' || parsed.search || parsed.hash) {
  throw new Error('AUTHENTICATED_SYNTHETIC_LOCAL_DATABASE_URL_REJECTED');
}
const database = `authenticated_synthetic_${process.pid}_${Date.now()}`.toLowerCase();
assert.match(database, /^[a-z0-9_]+$/u);
const urlFor = name => { const value = new URL(source); value.pathname = `/${name}`; return value.toString(); };
const migrations = readdirSync(path.join(root, 'supabase', 'migrations')).filter(name => name.endsWith('.sql')).sort();
const duplicateSafe = new Set([
  '20260923133000_pr1e_evidence_claim_operator_binding.sql',
  '20260923142120_pr1e_govern_control_alias_binding.sql',
  '20260923144653_studio_command_authority_capabilities.sql',
  '20260923151115_studio_handoff_receipt_binding.sql',
  '20260923190853_pr_c_deferred_binding_authority.sql',
]);
const ids = {
  org: '81000000-0000-4000-8000-000000000001', workspace: '81000000-0000-4000-8000-000000000002',
  foreignOrg: '81000000-0000-4000-8000-000000000003', foreignWorkspace: '81000000-0000-4000-8000-000000000004',
  actor: '81000000-0000-4000-8000-000000000005', foreignActor: '81000000-0000-4000-8000-000000000006',
  role: '81000000-0000-4000-8000-000000000007', session: '81000000-0000-4000-8000-000000000008',
  foreignSession: '81000000-0000-4000-8000-000000000009', exercise: '81000000-0000-4000-8000-000000000010',
  request: '81000000-0000-4000-8000-000000000011', permit: '81000000-0000-4000-8000-000000000012',
  expiredRequest: '81000000-0000-4000-8000-000000000013', expiredPermit: '81000000-0000-4000-8000-000000000014',
  studioRequest: '81000000-0000-4000-8000-000000000015', studioPermit: '81000000-0000-4000-8000-000000000016',
  studioToken: '81000000-0000-4000-8000-000000000017',
  successRequest: '81000000-0000-4000-8000-000000000018', successPermit: '81000000-0000-4000-8000-000000000019',
  successToken: '81000000-0000-4000-8000-000000000020',
  ordinaryRoute: '81000000-0000-4000-8000-000000000021',
  ordinaryRequest: '81000000-0000-4000-8000-000000000022',
  ordinaryToken: '81000000-0000-4000-8000-000000000023',
  localExercise: '81000000-0000-4000-8000-000000000024',
};
const hash = character => character.repeat(64);
const authority = async (client, sql, parameters = []) => {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE service_role');
    const result = await client.query(sql, parameters);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

const admin = new Client({ connectionString: source });
let db;
let created = false;
let fixture;
let ordinaryAttemptId;
try {
  await admin.connect();
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      await admin.query(`CREATE ROLE ${role} NOLOGIN${role === 'service_role' ? ' BYPASSRLS' : ''}`);
    }
  }
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount, 0);
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  db = new Client({ connectionString: urlFor(database) });
  await db.connect();
  await db.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;`);
  for (const name of migrations) {
    if (name === '20261019161723_local_real_backend_authenticated_acceptance.sql') {
      assert.equal(name, migrations.at(-1), 'local acceptance authority must be the final migration');
      assert.equal((await db.query(
        'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip,
      '20261011053000');
      assert.equal((await db.query(`SELECT
        to_regprocedure('public.authenticated_synthetic_local_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)') value`)).rows[0].value,
      null);
      assert.deepEqual((await db.query(`SELECT
        EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='authenticated_synthetic_exercises' AND column_name='execution_kind') execution_kind,
        EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='authenticated_synthetic_exercises' AND column_name='build_digest') build_digest`)).rows[0],
      { execution_kind: false, build_digest: false });
    }
    if (name === '20260916083814_assess_supporting_document_mapping.sql') {
      fixture = await createEnterpriseIntelligenceFixture(db, 'brd');
    }
    if (name === '20261010144356_authenticated_hosted_exercise_authority.sql') {
      assert.ok(fixture);
      await db.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
        SELECT role_values.role_id,capability_values.capability FROM unnest($1::uuid[]) role_values(role_id)
        CROSS JOIN unnest($2::text[]) capability_values(capability) ON CONFLICT DO NOTHING`,
      [[fixture.role, fixture.routeRole], ['studio.artifacts.generate', 'studio.sources.read', 'studio.sources.manage']]);
      await db.query('UPDATE public.ai_provider_configs SET last_validated_at=statement_timestamp() WHERE id=$1', [fixture.provider]);
      await db.query(`INSERT INTO public.enterprise_ai_capability_routes(
        id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by)
        VALUES($1,$2,$3,$4,'studio.document.generate','fixture-model',true,ARRAY[$5::text],1,$6,$6)`,
      [ids.ordinaryRoute, fixture.org, fixture.workspace, fixture.provider, fixture.routeRole, fixture.requester]);
      await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(
        org_id,workspace_id,unified_byok_gateway_enabled,studio_multisource_enabled,module_handoffs_enabled,updated_by)
        VALUES($1,$2,true,true,true,$3)
        ON CONFLICT(org_id,workspace_id) DO UPDATE SET
          unified_byok_gateway_enabled=true,studio_multisource_enabled=true,module_handoffs_enabled=true,updated_by=$3`,
      [fixture.org, fixture.workspace, fixture.requester]);
      await db.query('UPDATE public.enterprise_intelligence_runtime_control SET enabled=true,read_only=false,provider_enabled=true WHERE singleton');
      await db.query('UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=true WHERE singleton');
      const ordinaryArtifact = (await db.query(`SELECT aggregate.id,aggregate.aggregate_version,aggregate.current_version_id,
        aggregate.current_approved_version_id,aggregate.source_package_id
        FROM public.studio_artifact_aggregates aggregate WHERE aggregate.id=$1`, [fixture.artifactId])).rows[0];
      const ordinaryTemplate = (await db.query("SELECT id FROM public.studio_system_template_versions WHERE artifact_type='brd' AND superseded_at IS NULL")).rows[0];
      const ordinaryAuthorizationVersion = Number((await db.query(
        'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.requester])).rows[0].version);
      const ordinaryRequest = (await db.query('SELECT public.studio_artifact_generation_request_v2($1::jsonb) value', [JSON.stringify({
        actorId: fixture.requester, organizationId: fixture.org, workspaceId: fixture.workspace,
        requestId: ids.ordinaryRequest, idempotencyKey: 'authenticated-synthetic-ordinary-provider-v3',
        authorizationVersion: ordinaryAuthorizationVersion, artifactId: ordinaryArtifact.id,
        sourcePackageId: ordinaryArtifact.source_package_id, templateKind: 'system', templateVersionId: ordinaryTemplate.id,
        expectedAggregateVersion: Number(ordinaryArtifact.aggregate_version), expectedCurrentVersionId: ordinaryArtifact.current_version_id,
        expectedApprovedVersionId: ordinaryArtifact.current_approved_version_id,
      })])).rows[0].value;
      ordinaryAttemptId = ordinaryRequest.attemptId;
      const ordinaryClaim = (await db.query('SELECT public.studio_artifact_generation_claim_v2($1,$2,45) value',
        [ordinaryAttemptId, ids.ordinaryToken])).rows[0].value;
      await db.query('SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,$4)',
        [ordinaryAttemptId, ids.ordinaryToken, Number(ordinaryClaim.executionFence), 'PROVIDER_REQUEST_FAILED']);
      assert.deepEqual((await db.query(`SELECT state,provider_plan_state,prompt_key,prompt_version
        FROM public.studio_artifact_generation_attempts WHERE id=$1`, [ordinaryAttemptId])).rows[0], {
        state: 'failed', provider_plan_state: 'bound', prompt_key: 'studio-multisource-generation', prompt_version: 'studio-pr-b-3',
      });
      await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
      await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
    }
    const sql = readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8').replaceAll('\r\n', '\n');
    const apply = async () => {
      await db.query('BEGIN');
      try { await db.query(sql); await db.query('COMMIT'); }
      catch (error) { await db.query('ROLLBACK'); throw error; }
    };
    try {
      await applySyntheticAiTerminalJournalMigrationForTest(db, name, apply);
      if (duplicateSafe.has(name)) await apply();
    } catch (error) {
      throw new Error(`AUTHENTICATED_SYNTHETIC_MIGRATION_FAILED:${name}:${error.message}`, { cause: error });
    }
    if (name === '20261010144356_authenticated_hosted_exercise_authority.sql') {
      assert.deepEqual((await db.query(`SELECT state,provider_plan_state,transport_kind,prompt_key,prompt_version,
        authenticated_synthetic_permit_id IS NULL permit_is_null
        FROM public.studio_artifact_generation_attempts WHERE id=$1`, [ordinaryAttemptId])).rows[0], {
        state: 'failed', provider_plan_state: 'bound', transport_kind: 'provider', prompt_key: 'studio-multisource-generation',
        prompt_version: 'studio-pr-b-3', permit_is_null: true,
      });
    }
    if (name === '20261019161723_local_real_backend_authenticated_acceptance.sql') {
      assert.equal((await db.query(
        'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip,
      '20261019161723');
      assert.deepEqual((await db.query(`SELECT
        EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='authenticated_synthetic_exercises' AND column_name='execution_kind') execution_kind,
        EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='authenticated_synthetic_exercises' AND column_name='build_digest') build_digest`)).rows[0],
      { execution_kind: true, build_digest: true });
    }
  }

  assert.equal((await db.query('SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip,
    '20261019161723');
  assert.deepEqual((await authority(db,
    'SELECT public.enterprise_provider_secret_backend_capability() value')).rows[0].value, {
    backendKind: 'supabase_vault', available: false, migrationTip: '20261019161723',
    exerciseActive: false, providerCallsAuthorized: false,
  });

  // Installation succeeds in retained fixtures that have auth.users but not
  // auth.sessions. Runtime authority is added only in this dedicated test.
  assert.equal((await db.query("SELECT to_regclass('auth.sessions') value")).rows[0].value, null);
  assert.equal((await db.query('SELECT count(*)::int count FROM public.authenticated_synthetic_exercises')).rows[0].count, 0);
  assert.deepEqual((await db.query(`SELECT
    has_function_privilege('authenticated','public.studio_artifact_generation_request_authenticated_synthetic(jsonb)','EXECUTE') authenticated_request,
    has_function_privilege('authenticated','public.studio_artifact_generation_claim_authenticated_synthetic(uuid,uuid,integer)','EXECUTE') authenticated_claim,
    has_function_privilege('service_role','public.studio_artifact_generation_request_authenticated_synthetic(jsonb)','EXECUTE') service_request,
    has_function_privilege('service_role','public.studio_artifact_generation_claim_authenticated_synthetic(uuid,uuid,integer)','EXECUTE') service_claim`)).rows[0],
  { authenticated_request: false, authenticated_claim: false, service_request: true, service_claim: true });
  assert.ok(fixture);
  ids.org = fixture.org; ids.workspace = fixture.workspace; ids.actor = fixture.requester; ids.role = fixture.role;
  await db.query('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz)');
  await db.query('INSERT INTO auth.users(id) VALUES($1) ON CONFLICT DO NOTHING', [ids.actor]);
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [ids.foreignActor]);
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4)',
    [ids.session, ids.actor, ids.foreignSession, ids.foreignActor]);
  await db.query("INSERT INTO public.profiles(id,email,full_name) VALUES($1,'foreign@synthetic.invalid','Foreign')", [ids.foreignActor]);
  await db.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Foreign synthetic','foreign-synthetic')", [ids.foreignOrg]);
  await db.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Foreign workspace','foreign')", [ids.foreignWorkspace, ids.foreignOrg]);
  await db.query('UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET enabled=true,read_only=false,provider_enabled=false WHERE singleton');
  await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(
    org_id,workspace_id,unified_byok_gateway_enabled,studio_multisource_enabled,module_handoffs_enabled,updated_by)
    VALUES($1,$2,false,true,true,$3)
    ON CONFLICT(org_id,workspace_id) DO UPDATE SET studio_multisource_enabled=true,module_handoffs_enabled=true,updated_by=$3`,
  [ids.org, ids.workspace, ids.actor]);

  const inactive = await authority(db, 'SELECT public.authenticated_synthetic_consume_process_fault($1,$2,$3,NULL,$4,$5,$6,$7) value',
    [ids.actor, ids.org, ids.workspace, 'process.update', ids.request, hash('a'), 2]);
  assert.deepEqual(inactive.rows[0].value, { consumed: false });
  await assert.rejects(() => authority(db,
    'SELECT public.authenticated_synthetic_exercise_activate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    [ids.exercise, hash('a').slice(0, 40), 'f'.repeat(24), 'https://foreign.invalid', `sha256:${hash('b')}`,
      '20261019161723', `sha256:${hash('c')}`, `sha256:${hash('d')}`, 'hosted-authenticated-synthetic-profile-v3',
      `sha256:${hash('e')}`, `sha256:${hash('f')}`, ids.org, ids.workspace, new Date(Date.now() + 3_600_000)]));
  const activated = await authority(db,
    'SELECT public.authenticated_synthetic_exercise_activate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) value',
    [ids.exercise, hash('a').slice(0, 40), 'f'.repeat(24), 'https://avalaos-pilot.netlify.app', `sha256:${hash('b')}`,
      '20261019161723', `sha256:${hash('c')}`, `sha256:${hash('d')}`, 'hosted-authenticated-synthetic-profile-v3',
      `sha256:${hash('e')}`, `sha256:${hash('f')}`, ids.org, ids.workspace, new Date(Date.now() + 3_600_000)]);
  assert.equal(activated.rows[0].value.lifecycle, 'active');
  await authority(db, 'SELECT public.authenticated_synthetic_bind_session($1,$2,$3,$4)',
    [ids.exercise, ids.actor, ids.session, 'author']);
  await assert.rejects(() => authority(db, 'SELECT public.authenticated_synthetic_bind_session($1,$2,$3,$4)',
    [ids.exercise, ids.actor, ids.foreignSession, 'foreign-session']));
  await db.query("UPDATE auth.sessions SET not_after=statement_timestamp()-interval '1 second' WHERE id=$1", [ids.session]);
  await assert.rejects(() => authority(db, 'SELECT public.authenticated_synthetic_arm_permit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [ids.exercise, ids.expiredPermit, 'process_server_error_precommit', 'process.update', ids.actor, ids.session,
      ids.expiredRequest, hash('a'), 2, new Date(Date.now() + 600_000)]));
  await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [ids.session]);
  await authority(db, 'SELECT public.authenticated_synthetic_arm_permit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [ids.exercise, ids.permit, 'process_server_error_precommit', 'process.update', ids.actor, ids.session,
      ids.request, hash('a'), 2, new Date(Date.now() + 600_000)]);
  await assert.rejects(() => authority(db,
    'SELECT public.authenticated_synthetic_consume_process_fault($1,$2,$3,$4,$5,$6,$7,$8)',
    [ids.actor, ids.org, ids.workspace, ids.foreignSession, 'process.update', ids.request, hash('a'), 2]));
  await assert.rejects(() => authority(db,
    'SELECT public.authenticated_synthetic_consume_process_fault($1,$2,$3,$4,$5,$6,$7,$8)',
    [ids.actor, ids.org, ids.workspace, ids.session, 'process.update', ids.request, hash('b'), 2]));
  const baseline = (await db.query(`SELECT
    (SELECT count(*)::int FROM public.assess_command_receipts) receipts,
    (SELECT count(*)::int FROM public.privileged_audit_events) audits,
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations) budgets`)).rows[0];
  const consumed = await authority(db, 'SELECT public.authenticated_synthetic_consume_process_fault($1,$2,$3,$4,$5,$6,$7,$8) value',
    [ids.actor, ids.org, ids.workspace, ids.session, 'process.update', ids.request, hash('a'), 2]);
  assert.deepEqual(consumed.rows[0].value, { consumed: true });
  await assert.rejects(() => authority(db,
    'SELECT public.authenticated_synthetic_consume_process_fault($1,$2,$3,$4,$5,$6,$7,$8)',
    [ids.actor, ids.org, ids.workspace, ids.session, 'process.update', ids.request, hash('a'), 2]));
  assert.deepEqual((await db.query(`SELECT
    (SELECT count(*)::int FROM public.assess_command_receipts) receipts,
    (SELECT count(*)::int FROM public.privileged_audit_events) audits,
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations) budgets`)).rows[0], baseline);

  const artifact = (await db.query(`SELECT aggregate.id,aggregate.aggregate_version,aggregate.current_version_id,
    aggregate.current_approved_version_id,aggregate.source_package_id,package.package_hash
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_artifact_source_packages package ON package.id=aggregate.source_package_id
    WHERE aggregate.id=$1`, [fixture.artifactId])).rows[0];
  assert.ok(artifact);
  const template = (await db.query("SELECT id,template_version FROM public.studio_system_template_versions WHERE artifact_type='brd' AND superseded_at IS NULL")).rows[0];
  const authorizationVersion = Number((await db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [ids.org, ids.actor])).rows[0].version);
  await authority(db, 'SELECT public.authenticated_synthetic_arm_permit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [ids.exercise, ids.studioPermit, 'studio_failure_after_claim', 'studio.generation.request', ids.actor, ids.session,
      ids.studioRequest, hash('9'), Number(artifact.aggregate_version), new Date(Date.now() + 600_000)]);
  const studioCommand = {
    actorId: ids.actor, organizationId: ids.org, workspaceId: ids.workspace, requestId: ids.studioRequest,
    idempotencyKey: 'authenticated-synthetic-studio-request', authorizationVersion,
    artifactId: artifact.id, sourcePackageId: artifact.source_package_id, templateKind: 'system', templateVersionId: template.id,
    expectedAggregateVersion: Number(artifact.aggregate_version), expectedCurrentVersionId: artifact.current_version_id,
    expectedApprovedVersionId: artifact.current_approved_version_id, authenticatedSyntheticPermitId: ids.studioPermit,
    authenticatedSyntheticKind: 'studio_failure_after_claim', authenticatedSyntheticSessionId: ids.session,
    authenticatedSyntheticPayloadHash: hash('9'),
  };
  const studioRequested = (await authority(db,
    'SELECT public.studio_artifact_generation_request_authenticated_synthetic($1::jsonb) value',
    [JSON.stringify(studioCommand)])).rows[0].value;
  assert.equal(studioRequested.outcome, 'committed');
  const studioAttempt = (await db.query(`SELECT * FROM public.studio_artifact_generation_attempts WHERE id=$1`, [studioRequested.attemptId])).rows[0];
  assert.equal(studioAttempt.transport_kind, 'authenticated_synthetic');
  assert.equal(studioAttempt.provider_route_id, null); assert.equal(studioAttempt.provider_config_id, null);
  // The existing immutable-binding trigger rejects route substitution before
  // PostgreSQL evaluates the provider-plan CHECK constraint.
  await assert.rejects(() => db.query('UPDATE public.studio_artifact_generation_attempts SET provider_route_id=$1 WHERE id=$2',
    [ids.ordinaryRoute, studioRequested.attemptId]), /STUDIO_IMMUTABLE/);
  assert.equal((await db.query('SELECT provider_route_id FROM public.studio_artifact_generation_attempts WHERE id=$1',
    [studioRequested.attemptId])).rows[0].provider_route_id, null);
  const studioClaim = (await authority(db,
    'SELECT public.studio_artifact_generation_claim_authenticated_synthetic($1,$2,45) value',
    [studioRequested.attemptId, ids.studioToken])).rows[0].value;
  assert.equal(studioClaim.providerAllowed, true); assert.equal(studioClaim.authenticatedSyntheticPermitId, ids.studioPermit);
  const studioConsumed = (await authority(db,
    'SELECT public.authenticated_synthetic_consume_studio_permit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) value',
    [ids.studioPermit, ids.actor, ids.org, ids.workspace, ids.session, ids.studioRequest, hash('9'),
      Number(artifact.aggregate_version), studioRequested.attemptId, ids.studioToken, Number(studioClaim.executionFence)])).rows[0].value;
  assert.deepEqual(studioConsumed, { consumed: true, kind: 'studio_failure_after_claim' });
  const replayCounts = (await db.query(`SELECT
    (SELECT count(*)::int FROM public.studio_artifact_generation_attempts WHERE id=$1) attempts,
    (SELECT count(*)::int FROM public.studio_artifact_command_receipts WHERE request_id=$2) receipts,
    (SELECT count(*)::int FROM public.privileged_audit_events WHERE request_id=$2) audits,
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations WHERE studio_attempt_id=$1) budgets`,
  [studioRequested.attemptId, ids.studioRequest])).rows[0];
  const resolvedReplay = (await authority(db,
    'SELECT public.authenticated_synthetic_resolve_studio_permit($1,$2,$3,$4,$5,$6,$7) value',
    [ids.actor, ids.org, ids.workspace, ids.session, ids.studioRequest, hash('9'), Number(artifact.aggregate_version)])).rows[0].value;
  assert.equal(resolvedReplay.active, true);
  const studioReplay = (await authority(db,
    'SELECT public.studio_artifact_generation_request_authenticated_synthetic($1::jsonb) value',
    [JSON.stringify(studioCommand)])).rows[0].value;
  assert.equal(studioReplay.outcome, 'replayed'); assert.equal(studioReplay.attemptId, studioRequested.attemptId);
  assert.deepEqual((await db.query(`SELECT
    (SELECT count(*)::int FROM public.studio_artifact_generation_attempts WHERE id=$1) attempts,
    (SELECT count(*)::int FROM public.studio_artifact_command_receipts WHERE request_id=$2) receipts,
    (SELECT count(*)::int FROM public.privileged_audit_events WHERE request_id=$2) audits,
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations WHERE studio_attempt_id=$1) budgets`,
  [studioRequested.attemptId, ids.studioRequest])).rows[0], replayCounts);
  await assert.rejects(() => authority(db,
    'SELECT public.studio_artifact_generation_request_authenticated_synthetic($1::jsonb)',
    [JSON.stringify({ ...studioCommand, sourcePackageId: ids.foreignWorkspace })]), /STUDIO_IDEMPOTENCY_CONFLICT/);
  await authority(db, 'SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,$4)',
    [studioRequested.attemptId, ids.studioToken, Number(studioClaim.executionFence), 'PROVIDER_REQUEST_FAILED']);

  const successHead = (await db.query(`SELECT aggregate_version,current_version_id,current_approved_version_id
    FROM public.studio_artifact_aggregates WHERE id=$1`, [artifact.id])).rows[0];
  await authority(db, 'SELECT public.authenticated_synthetic_arm_permit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [ids.exercise, ids.successPermit, 'studio_deterministic_success', 'studio.generation.request', ids.actor, ids.session,
      ids.successRequest, hash('8'), Number(successHead.aggregate_version), new Date(Date.now() + 600_000)]);
  const successCommand = {
    ...studioCommand, requestId: ids.successRequest, idempotencyKey: 'authenticated-synthetic-studio-success',
    expectedAggregateVersion: Number(successHead.aggregate_version), expectedCurrentVersionId: successHead.current_version_id,
    expectedApprovedVersionId: successHead.current_approved_version_id, authenticatedSyntheticPermitId: ids.successPermit,
    authenticatedSyntheticKind: 'studio_deterministic_success', authenticatedSyntheticPayloadHash: hash('8'),
  };
  const successRequested = (await authority(db,
    'SELECT public.studio_artifact_generation_request_authenticated_synthetic($1::jsonb) value',
    [JSON.stringify(successCommand)])).rows[0].value;
  const activeResidue = async () => Number((await db.query(
    `SELECT ${AUTHENTICATED_SYNTHETIC_ACTIVE_RESIDUE_SQL} value`)).rows[0].value);
  assert.equal(await activeResidue(), 2, 'the active exercise and requested attempt both block a new run');
  const successClaim = (await authority(db,
    'SELECT public.studio_artifact_generation_claim_authenticated_synthetic($1,$2,45) value',
    [successRequested.attemptId, ids.successToken])).rows[0].value;
  await authority(db,
    'SELECT public.authenticated_synthetic_consume_studio_permit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [ids.successPermit, ids.actor, ids.org, ids.workspace, ids.session, ids.successRequest, hash('8'),
      Number(successHead.aggregate_version), successRequested.attemptId, ids.successToken, Number(successClaim.executionFence)]);
  await db.query('BEGIN');
  try {
    await db.query('SELECT public.authenticated_synthetic_quiesce($1)', [ids.exercise]);
    assert.equal(await activeResidue(), 1,
      'a consumed permit and revoked sessions cannot certify an unfinished server attempt as cleaned');
  } finally { await db.query('ROLLBACK'); }
  const serverMaterial = (await db.query(`SELECT package.anchor_manifest,template.provider_instructions
    FROM public.studio_artifact_source_packages package
    JOIN public.studio_system_template_versions template ON template.id=$2
    WHERE package.id=$1`, [artifact.source_package_id, template.id])).rows[0];
  const anchors = serverMaterial.anchor_manifest;
  const selectedSourceVersionIds = [...new Set(anchors.map(anchor => anchor.sourceVersionId))].sort();
  const sectionTitle = id => {
    const words = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').trim().toLowerCase();
    return `${words[0].toUpperCase()}${words.slice(1)}`;
  };
  const generatedContent = {
    contractVersion: 'studio-artifact-2', title: 'BRD authenticated acceptance artifact',
    summary: 'Deterministic provider-free output derived from authoritative server-loaded sources and the approved template.',
    sections: serverMaterial.provider_instructions.sections.map((id, index) => {
      const title = sectionTitle(id);
      return { id, title, body: `Authenticated acceptance ${title.toLowerCase()} derived from authoritative server-selected sources.`,
        sourceAnchors: index === 0 ? anchors : [], labels: index === 0 ? [] : ['template_required'] };
    }),
    coverage: { selectedSourceVersionIds, coveredSourceVersionIds: selectedSourceVersionIds, complete: true },
  };
  await authority(db, 'SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,$4,$5::jsonb)',
    [successRequested.attemptId, ids.successToken, Number(successClaim.executionFence),
      `authenticated-synthetic:${ids.successPermit}`, JSON.stringify(generatedContent)]);
  const finalized = (await authority(db, 'SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) value',
    [successRequested.attemptId, ids.successToken, Number(successClaim.executionFence)])).rows[0].value;
  assert.equal(finalized.state, 'completed'); assert.equal(finalized.stale, false);
  assert.equal(await activeResidue(), 1, 'terminal attempts are retained history, not active residue');
  assert.equal((await db.query('SELECT count(*)::int count FROM public.enterprise_ai_budget_reservations WHERE studio_attempt_id=$1',
    [successRequested.attemptId])).rows[0].count, 0);

  await authority(db, 'SELECT public.authenticated_synthetic_arm_permit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [ids.exercise, ids.expiredPermit, 'process_server_error_precommit', 'process.update', ids.actor, ids.session,
      ids.expiredRequest, hash('a'), 2, new Date(Date.now() + 600_000)]);
  await db.query("UPDATE public.authenticated_synthetic_permits SET expires_at=statement_timestamp()-interval '1 second' WHERE id=$1", [ids.expiredPermit]);
  await assert.rejects(() => authority(db,
    'SELECT public.authenticated_synthetic_consume_process_fault($1,$2,$3,$4,$5,$6,$7,$8)',
    [ids.actor, ids.org, ids.workspace, ids.session, 'process.update', ids.expiredRequest, hash('a'), 2]));
  await authority(db, 'SELECT public.authenticated_synthetic_quiesce($1)', [ids.exercise]);
  assert.equal(await activeResidue(), 0, 'quiescence with terminal attempts permits cleanup certification');
  assert.equal((await db.query("SELECT count(*)::int count FROM public.authenticated_synthetic_permits WHERE state='armed'")).rows[0].count, 0);

  const localActivationSql =
    'SELECT public.authenticated_synthetic_local_exercise_activate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) value';
  const localActivation = [ids.localExercise, hash('2').slice(0, 40), `sha256:${hash('3')}`,
    'http://127.0.0.1:4173', `sha256:${hash('4')}`, '20261019161723', `sha256:${hash('5')}`,
    `sha256:${hash('6')}`, 'local-real-backend-authenticated-profile-v1', `sha256:${hash('7')}`,
    `sha256:${hash('8')}`, ids.org, ids.workspace, new Date(Date.now() + 3_600_000)];
  assert.deepEqual((await db.query(`SELECT
    has_function_privilege('service_role','public.authenticated_synthetic_local_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)','EXECUTE') service_activate,
    has_function_privilege('authenticated','public.authenticated_synthetic_local_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)','EXECUTE') authenticated_activate,
    has_function_privilege('anon','public.authenticated_synthetic_local_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)','EXECUTE') anon_activate`)).rows[0],
  { service_activate: true, authenticated_activate: false, anon_activate: false });
  await assert.rejects(() => authority(db, localActivationSql,
    localActivation.with(3, 'https://avalaos-pilot.netlify.app')), /LOCAL_REAL_BACKEND_ACCEPTANCE_ACTIVATION_REJECTED/);
  await assert.rejects(() => authority(db, localActivationSql,
    localActivation.with(2, 'f'.repeat(24))), /LOCAL_REAL_BACKEND_ACCEPTANCE_ACTIVATION_REJECTED/);
  await assert.rejects(() => authority(db, localActivationSql,
    localActivation.with(2, null)), /LOCAL_REAL_BACKEND_ACCEPTANCE_ACTIVATION_REJECTED/);
  await assert.rejects(() => authority(db, localActivationSql,
    localActivation.with(13, new Date(Date.now() - 1_000))), /LOCAL_REAL_BACKEND_ACCEPTANCE_ACTIVATION_REJECTED/);
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=true WHERE singleton');
  await assert.rejects(() => authority(db, localActivationSql, localActivation),
    /LOCAL_REAL_BACKEND_ACCEPTANCE_ACTIVATION_REJECTED/);
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  const localActivated = (await authority(db, localActivationSql, localActivation)).rows[0].value;
  assert.equal(localActivated.executionKind, 'local_real_backend_authenticated');
  assert.equal(localActivated.buildDigest, `sha256:${hash('3')}`);
  assert.deepEqual((await db.query(`SELECT execution_kind,deployment_id,origin,build_digest,profile_version
    FROM public.authenticated_synthetic_exercises WHERE id=$1`, [ids.localExercise])).rows[0], {
    execution_kind: 'local_real_backend_authenticated', deployment_id: null, origin: 'http://127.0.0.1:4173',
    build_digest: `sha256:${hash('3')}`, profile_version: 'local-real-backend-authenticated-profile-v1',
  });
  const hostedIdentity = (await db.query(`SELECT execution_kind,deployment_id,build_digest
    FROM public.authenticated_synthetic_exercises WHERE id=$1`, [ids.exercise])).rows[0];
  assert.deepEqual(hostedIdentity, {
    execution_kind: 'hosted_authenticated_synthetic', deployment_id: 'f'.repeat(24), build_digest: null,
  });
  await assert.rejects(() => db.query(
    'UPDATE public.authenticated_synthetic_exercises SET deployment_id=NULL WHERE id=$1', [ids.exercise]),
  /authenticated_synthetic_exercises_execution_identity_check/);
  const localObserved = (await authority(db,
    "SELECT public.authenticated_synthetic_observe($1,statement_timestamp()-interval '1 hour',statement_timestamp()) value",
    [ids.localExercise])).rows[0].value.exercise;
  assert.equal(localObserved.executionKind, 'local_real_backend_authenticated');
  assert.equal(localObserved.buildDigest, `sha256:${hash('3')}`);
  assert.equal(Object.hasOwn(localObserved, 'deploymentIdHash'), false);
  await assert.rejects(() => db.query(
    'UPDATE public.authenticated_synthetic_exercises SET build_digest=NULL WHERE id=$1', [ids.localExercise]),
  /authenticated_synthetic_exercises_execution_identity_check/);
  await authority(db, 'SELECT public.authenticated_synthetic_bind_session($1,$2,$3,$4)',
    [ids.localExercise, ids.actor, ids.session, 'author']);
  await authority(db, 'SELECT public.authenticated_synthetic_quiesce($1)', [ids.localExercise]);
  assert.deepEqual((await db.query(`SELECT exercise.lifecycle,binding.state
    FROM public.authenticated_synthetic_exercises exercise
    JOIN public.authenticated_synthetic_actor_sessions binding ON binding.exercise_id=exercise.id
    WHERE exercise.id=$1`, [ids.localExercise])).rows[0], { lifecycle: 'quiesced', state: 'revoked' });
  assert.equal(await activeResidue(), 0);
  console.log('authenticated synthetic PostgreSQL: install, default-off, session/tenant/request/expiry, fenced Studio consume/replay and zero-effect guards passed');
} finally {
  if (db) await db.end().catch(() => {});
  if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
}
