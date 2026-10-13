import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { AUTHENTICATED_CASE_ASSERTIONS, authenticatedAcceptanceScenario } from './authenticatedAcceptanceCases.mjs';
import { authenticatedEvidenceDigest } from './authenticatedBrowserCorrelation.mjs';
import { AuthenticatedHostedController, authenticatedHostedDigest,
  AUTHENTICATED_HOSTED_PERSONAS } from './authenticatedHostedController.mjs';
import { createAuthenticatedHostedPostgresAdapter } from './authenticatedHostedControllerAdapters.mjs';
import { reconstructAuthenticatedHostedCaseEvidence } from './authenticatedHostedEvidence.mjs';
import {
  authenticatedHostedRequestBinding,
  createAuthenticatedHostedObservationReader,
} from './authenticatedHostedObservationAdapter.mjs';
import { createEnterpriseIntelligenceFixture } from './enterpriseIntelligencePostgresFixture.mjs';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';

const { Client } = pg;
const root = process.cwd();
const source = process.env.AUTHENTICATED_HOSTED_CONTROLLER_DATABASE_URL
  ?? process.env.AUTHENTICATED_SYNTHETIC_DATABASE_URL
  ?? 'postgres://postgres:postgres@127.0.0.1:61676/postgres';
const parsed = new URL(source);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
  || !['127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())
  || parsed.pathname !== '/postgres' || parsed.search || parsed.hash) {
  throw new Error('AUTHENTICATED_HOSTED_CONTROLLER_LOCAL_DATABASE_URL_REJECTED');
}

const database = `authenticated_hosted_controller_${process.pid}_${Date.now()}`.toLowerCase();
assert.match(database, /^[a-z0-9_]+$/u);
const privateDirectory = path.join(root, 'output', 'local-private', 'authenticated-product-acceptance');
const activeDatabaseMarker = path.join(privateDirectory, 'authenticated-hosted-controller-active-db.txt');
const urlFor = name => { const value = new URL(source); value.pathname = `/${name}`; return value.toString(); };
const migrations = readdirSync(path.join(root, 'supabase', 'migrations')).filter(name => name.endsWith('.sql')).sort();
const duplicateSafe = new Set([
  '20260923133000_pr1e_evidence_claim_operator_binding.sql',
  '20260923142120_pr1e_govern_control_alias_binding.sql',
  '20260923144653_studio_command_authority_capabilities.sql',
  '20260923151115_studio_handoff_receipt_binding.sql',
  '20260923190853_pr_c_deferred_binding_authority.sql',
]);
const catalog = JSON.parse(readFileSync(path.join(root, 'tests', 'acceptance', 'catalog', 'test-catalog.json'), 'utf8'));
const definition = catalog.cases.find(item => item.testId === 'ASSESS-003');
const deniedDefinition = catalog.cases.find(item => item.testId === 'ASSESS-002');
assert.ok(definition);
assert.ok(deniedDefinition);
const requiredCapabilities = Object.freeze({
  author: ['org.admin','operations.read','assess.read','assess.create','assess.response.write','assess.finalize',
    'assess.process.update','assess.v2.read','assess.v2.create','assess.v2.clone','assess.v2.draft.write','assess.v2.finalize',
    'studio.artifacts.read','studio.artifacts.generate','studio.artifacts.edit','studio.artifacts.review','studio.artifacts.approve',
    'project.read','project.manage','backlog.read','backlog.manage','monitor.read','workitems.import'],
  reviewer: ['assess.read','assess.v2.read','assess.v2.review','assess.v2.evidence.attest','assess.v2.approve',
    'studio.handoffs.read','studio.handoffs.review','studio.artifacts.read','studio.artifacts.review',
    'project.read','backlog.read','task.read','task.update.own','delivery.outcomes.read'],
  approver: ['assess.read','assess.v2.read','assess.v2.govern.resolve','assess.v2.studio.handoff',
    'studio.handoffs.read','studio.handoffs.request','studio.handoffs.approve','studio.handoffs.consume',
    'studio.artifacts.read','studio.artifacts.generate','studio.artifacts.edit','studio.artifacts.approve',
    'project.read','project.manage','backlog.read','backlog.manage','monitor.read','workitems.import'],
  outsider: [],
});
const forbiddenCapabilities = Object.freeze({
  reviewer: ['org.admin','byok.manage','security.manage','admin.synthetic.users.manage','assess.v2.govern.resolve'],
  approver: ['org.admin','byok.manage','security.manage','admin.synthetic.users.manage','assess.v2.approve'],
  outsider: ['org.admin','byok.manage','security.manage','admin.synthetic.users.manage','assess.process.update',
    'assess.v2.create','assess.v2.draft.write','assess.v2.review','assess.v2.approve','assess.v2.govern.resolve',
    'studio.artifacts.generate','studio.artifacts.edit','studio.artifacts.review','studio.artifacts.approve','backlog.manage'],
});

const ids = {
  org: '82000000-0000-4000-8000-000000000001',
  workspace: '82000000-0000-4000-8000-000000000002',
  roles: {
    author: '82000000-0000-4000-8000-000000000011',
    reviewer: '82000000-0000-4000-8000-000000000012',
    approver: '82000000-0000-4000-8000-000000000013',
    outsider: '82000000-0000-4000-8000-000000000014',
  },
  actors: {
    author: '82000000-0000-4000-8000-000000000021',
    reviewer: '82000000-0000-4000-8000-000000000022',
    approver: '82000000-0000-4000-8000-000000000023',
    outsider: '82000000-0000-4000-8000-000000000024',
  },
  sessions: {
    author: '82000000-0000-4000-8000-000000000031',
    reviewer: '82000000-0000-4000-8000-000000000032',
    approver: '82000000-0000-4000-8000-000000000033',
    outsider: '82000000-0000-4000-8000-000000000034',
  },
  exercise: '82000000-0000-4000-8000-000000000041',
  request: '82000000-0000-4000-8000-000000000042',
};
const digest = character => `sha256:${character.repeat(64)}`;
const identities = Object.fromEntries(AUTHENTICATED_HOSTED_PERSONAS.map(persona => [persona, {
  id: ids.actors[persona],
  email: `hosted.controller.${persona}@example.invalid`,
  password: `unused-${persona}`,
}]));
const config = {
  releaseSha: 'a'.repeat(40),
  deploymentId: 'b'.repeat(24),
  origin: 'https://avalaos-pilot.netlify.app',
  backendDigest: digest('c'),
  migrationVersion: '20261011053000',
  migrationDigest: digest('d'),
  exerciseDigest: digest('e'),
  profileVersion: 'hosted-authenticated-synthetic-profile-v3',
  catalogDigest: digest('f'),
  sourceDigest: digest('1'),
  secretBackendKind: 'hashicorp_vault',
  targetPublicDigest: digest('2'),
  workflow: { runId: '12345', attempt: '1' },
  scope: { organizationId: ids.org, workspaceId: ids.workspace, roleIds: ids.roles },
};

const admin = new Client({ connectionString: source });
let db;
let created = false;
let bootstrapFixture;
const serviceQuery = async (sql, parameters = []) => {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE service_role');
    const result = await db.query(sql, parameters);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};
let adapterQueryTail = Promise.resolve();
const adapterDb = {
  query(sql, parameters = []) {
    const operation = adapterQueryTail.then(() => (
      /^SELECT public[.]authenticated_synthetic_/u.test(sql.trim())
        ? serviceQuery(sql, parameters) : db.query(sql, parameters)
    ));
    adapterQueryTail = operation.catch(() => {});
    return operation;
  },
};
const tokenFor = (actorId, sessionId) => `header.${Buffer.from(JSON.stringify({
  sub: actorId,
  session_id: sessionId,
})).toString('base64url')}.signature-padding-that-keeps-the-token-bounded`;

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
  mkdirSync(privateDirectory, { recursive: true });
  writeFileSync(activeDatabaseMarker, `${database}\n`, { encoding: 'utf8', flag: 'w' });
  db = new Client({ connectionString: urlFor(database) });
  await db.connect();
  await db.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;`);
  for (const name of migrations) {
    if (name === '20260916083814_assess_supporting_document_mapping.sql') {
      bootstrapFixture = await createEnterpriseIntelligenceFixture(db, 'brd');
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
      throw new Error(`AUTHENTICATED_HOSTED_CONTROLLER_MIGRATION_FAILED:${name}:${error.message}`, { cause: error });
    }
  }
  await db.query(`CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY)`);
  await db.query(`INSERT INTO supabase_migrations.schema_migrations(version)
    SELECT unnest($1::text[])`, [migrations.map(name => name.slice(0, 14))]);
  await db.query(`CREATE TABLE auth.sessions(
    id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    not_after timestamptz,refreshed_at timestamptz NOT NULL DEFAULT statement_timestamp()
  )`);
  await db.query('INSERT INTO auth.users(id,email) SELECT * FROM unnest($1::uuid[],$2::text[])', [
    Object.values(ids.actors), AUTHENTICATED_HOSTED_PERSONAS.map(persona => identities[persona].email),
  ]);
  await db.query(`INSERT INTO public.organizations(id,name,slug,status,settings)
    VALUES($1,'Authenticated hosted controller','authenticated-hosted-controller','active','{"synthetic":true}'::jsonb)`, [ids.org]);
  await db.query(`INSERT INTO public.workspaces(id,org_id,name,slug,status,metadata)
    VALUES($2,$1,'Authenticated hosted controller','authenticated-hosted-controller','active','{"synthetic":true}'::jsonb)`,
  [ids.org, ids.workspace]);
  for (const persona of AUTHENTICATED_HOSTED_PERSONAS) {
    await db.query(`INSERT INTO public.roles(id,org_id,name,slug,scope,permissions,status)
      VALUES($1,$2,$3,$4,'organization','[]','active')`,
    [ids.roles[persona], ids.org, `Hosted ${persona}`, `hosted-${persona}`]);
    if (requiredCapabilities[persona].length) {
      await db.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
        SELECT $1,unnest($2::text[])`, [ids.roles[persona], requiredCapabilities[persona]]);
    }
  }
  await db.query(`INSERT INTO public.profiles(id,email,full_name,status,metadata)
    VALUES($1,$2,'Hosted author bootstrap','active',$3::jsonb)`,
  [ids.actors.author, identities.author.email, JSON.stringify({ synthetic: true, exerciseDigest: config.exerciseDigest })]);
  await db.query(`INSERT INTO public.process_update_workspace_controls(org_id,workspace_id,enabled,read_only)
    VALUES($1,$2,true,false)`, [ids.org, ids.workspace]);
  await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(
    org_id,workspace_id,unified_byok_gateway_enabled,studio_multisource_enabled,module_handoffs_enabled,updated_by)
    VALUES($1,$2,false,false,false,$3)`, [ids.org, ids.workspace, ids.actors.author]);
  await db.query(`INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled)
    VALUES($1,$2,false)`, [ids.org, ids.workspace]);
  await db.query(`INSERT INTO public.studio_delivery_workspace_controls(
    org_id,workspace_id,publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled)
    VALUES($1,$2,false,false,false)`, [ids.org, ids.workspace]);
  await db.query('UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET enabled=true,read_only=false,provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.assess_v2_runtime_control SET enabled=true,read_only=false WHERE singleton');

  const deploymentCalls = [];
  const secretCalls = [];
  const adapter = createAuthenticatedHostedPostgresAdapter({
    config,
    db: adapterDb,
    verifyDeployment: async () => {
      deploymentCalls.push('verified');
      return { syntheticTarget: true, production: false, releaseSha: config.releaseSha,
        deploymentId: config.deploymentId, backendDigest: config.backendDigest,
        publicTargetDigest: config.targetPublicDigest };
    },
    verifySecretBackend: async () => ({ kind: 'hashicorp_vault', writable: true }),
    cleanupSecretBackend: async input => { secretCalls.push(input); },
  });
  const preflight = await adapter.preflight({ config, exerciseId: ids.exercise });
  assert.match(preflight.baselineDigest, /^sha256:[0-9a-f]{64}$/u);
  config.baselineDigest = preflight.baselineDigest;
  assert.deepEqual(preflight, {
    syntheticTarget: true, production: false, releaseSha: config.releaseSha, deploymentId: config.deploymentId,
    backendDigest: config.backendDigest, migrationVersion: config.migrationVersion, providersEnabled: false, runtimeReady: true,
    secretBackendKind: 'hashicorp_vault', secretBackendWritable: true, publicTargetDigest: config.targetPublicDigest,
    customerRows: 0, unapprovedActiveResidue: 0, scopeReady: true, baselineDigest: config.baselineDigest,
    observationStartedAt: preflight.observationStartedAt,
  });
  assert.ok(Number.isFinite(Date.parse(preflight.observationStartedAt)));
  assert.equal(deploymentCalls.length, 1);
  for (const persona of AUTHENTICATED_HOSTED_PERSONAS) {
    const actual = new Set((await db.query('SELECT capability_key FROM public.role_capabilities WHERE role_id=$1',
      [ids.roles[persona]])).rows.map(row => row.capability_key));
    assert.ok(requiredCapabilities[persona].every(capability => actual.has(capability)));
    assert.ok((forbiddenCapabilities[persona] ?? []).every(capability => !actual.has(capability)));
  }
  assert.deepEqual((await db.query(`SELECT
    has_function_privilege('service_role','public.authenticated_synthetic_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)','EXECUTE') activate,
    has_function_privilege('authenticated','public.authenticated_synthetic_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)','EXECUTE') browser_activate`)).rows[0],
  { activate: true, browser_activate: false });
  assert.ok(bootstrapFixture);
  const ownershipCutoff = (await db.query('SELECT statement_timestamp() value')).rows[0].value.toISOString();

  const activated = await adapter.activate({
    exerciseId: ids.exercise, releaseSha: config.releaseSha, deploymentId: config.deploymentId, origin: config.origin,
    backendDigest: config.backendDigest, migrationVersion: config.migrationVersion, migrationDigest: config.migrationDigest,
    exerciseDigest: config.exerciseDigest, profileVersion: config.profileVersion, catalogDigest: config.catalogDigest,
    sourceDigest: config.sourceDigest, organizationId: ids.org, workspaceId: ids.workspace,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  assert.equal(activated.lifecycle, 'active');

  const initialControls = async () => (await db.query(`SELECT
    (SELECT to_jsonb(x) FROM public.legacy_delivery_workspace_controls x WHERE org_id=$1 AND workspace_id=$2) legacy,
    (SELECT to_jsonb(x) FROM public.studio_delivery_workspace_controls x WHERE org_id=$1 AND workspace_id=$2) studio,
    (SELECT to_jsonb(x) FROM public.enterprise_transcript_workspace_flags x WHERE org_id=$1 AND workspace_id=$2) flags`,
  [ids.org,ids.workspace])).rows[0];
  const beforeSetupControls = await initialControls();
  await adapter.cleanup({exerciseId:ids.exercise,projects:[]});
  assert.deepEqual(await initialControls(),beforeSetupControls,
    'aborting before setup must not remove or alter existing controls');

  const setup = await adapter.setupProject({
    projectName: 'desktop-chromium-postgres', exerciseId: ids.exercise,
    exerciseDigest: config.exerciseDigest, scope: config.scope, identities,
  });
  const project = { ...setup, identities };
  const rejectionProject = { ...await adapter.setupProject({
    projectName: 'desktop-chromium-rejection', exerciseId: ids.exercise,
    exerciseDigest: config.exerciseDigest, scope: config.scope, identities,
  }), identities };
  assert.equal((await db.query(`SELECT count(*)::int count FROM public.organization_members
    WHERE org_id=$1 AND user_id=ANY($2::uuid[]) AND deleted_at IS NULL`,
  [ids.org,Object.values(ids.actors)])).rows[0].count,4,
  'a second scenario reuses the same verified persona memberships');
  assert.equal((await db.query('SELECT count(*)::int count FROM public.assess_processes WHERE id=$1 AND org_id=$2 AND workspace_id=$3',
    [project.processId, ids.org, ids.workspace])).rows[0].count, 1);
  assert.equal((await db.query('SELECT count(*)::int count FROM public.ai_provider_configs WHERE org_id=$1 AND deleted_at IS NULL',
    [ids.org])).rows[0].count, 3);

  await db.query('INSERT INTO auth.sessions(id,user_id) SELECT * FROM unnest($1::uuid[],$2::uuid[])', [
    Object.values(ids.sessions), Object.values(ids.actors),
  ]);
  const bindings = {};
  for (const persona of AUTHENTICATED_HOSTED_PERSONAS) {
    bindings[persona] = await adapter.bindSession({
      exerciseId: ids.exercise, actorId: ids.actors[persona], sessionId: ids.sessions[persona],
      persona: `${persona}_desktop-chromium`,
    });
  }
  assert.deepEqual(await adapter.bindSession({
    exerciseId: ids.exercise, actorId: ids.actors.author, sessionId: ids.sessions.author,
    persona: 'author_desktop-chromium',
  }), bindings.author);
  await assert.rejects(() => adapter.bindSession({
    exerciseId: ids.exercise, actorId: ids.actors.reviewer, sessionId: ids.sessions.reviewer,
    persona: 'author_desktop-chromium',
  }), /AUTHENTICATED_SYNTHETIC_SESSION_REJECTED|duplicate key/iu);
  assert.equal((await db.query('SELECT count(*)::int count FROM public.authenticated_synthetic_actor_sessions WHERE exercise_id=$1',
    [ids.exercise])).rows[0].count, 4);

  const reader = createAuthenticatedHostedObservationReader({ db: adapterDb, config });
  const exerciseOwnership = {
    actorIds: Object.values(ids.actors), projectIds: [project.projectId], processIds: [project.processId],
  };
  const nonExerciseBaseline = await reader.nonExerciseDigest({ cutoff: ownershipCutoff, ownership: exerciseOwnership });
  await db.query('BEGIN');
  try {
    await db.query(`INSERT INTO public.assess_processes(
      id,org_id,workspace_id,name,status,owner_id,created_by,updated_by)
      VALUES($1,$2,$3,'Foreign non-exercise probe','Draft',$4,$4,$4)`,
    [randomUUID(), bootstrapFixture.org, bootstrapFixture.workspace, ids.actors.author]);
    assert.notEqual(await reader.nonExerciseDigest({ cutoff: ownershipCutoff, ownership: exerciseOwnership }),
      nonExerciseBaseline);
  } finally { await db.query('ROLLBACK'); }
  assert.equal(await reader.nonExerciseDigest({ cutoff: ownershipCutoff, ownership: exerciseOwnership }),
    nonExerciseBaseline);
  await db.query('BEGIN');
  try {
    await db.query("UPDATE public.assess_processes SET name='Preexisting non-exercise probe' WHERE id=$1",
      [bootstrapFixture.process]);
    assert.notEqual(await reader.nonExerciseDigest({ cutoff: ownershipCutoff, ownership: exerciseOwnership }),
      nonExerciseBaseline);
  } finally { await db.query('ROLLBACK'); }
  assert.equal(await reader.nonExerciseDigest({ cutoff: ownershipCutoff, ownership: exerciseOwnership }),
    nonExerciseBaseline);
  const startedAt = preflight.observationStartedAt;
  const before = await reader.capture({ exerciseId: ids.exercise, from: startedAt, project });
  const adapterBefore = await adapter.observe({ exerciseId: ids.exercise, from: startedAt, project });
  assert.ok(Number.isFinite(Date.parse(before.capturedAt)));
  assert.ok(Number.isFinite(Date.parse(adapterBefore.capturedAt)));
  assert.deepEqual(adapterBefore.records, before.records);
  const authorizationVersion = Number((await db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [ids.org, ids.actors.author],
  )).rows[0].version);
  const payload = {
    name: 'Authenticated hosted discovery complete', description: 'Persisted through the production process command.',
    department: 'Operations', criticality: 'High', expectedVersion: 1,
  };
  const result = (await serviceQuery(
    'SELECT public.update_assess_process($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) value',
    [ids.actors.author, ids.org, ids.workspace, authorizationVersion, ids.request,
      'hosted-controller-process-update', 1, project.processId, payload.name, payload.description,
      payload.department, payload.criticality],
  )).rows[0].value;
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'committed');
  assert.equal(result.resource.version, 2);
  const after = await reader.capture({ exerciseId: ids.exercise, from: before.capturedAt, project });
  const completedAt = after.capturedAt;
  const participant = {
    persona: 'author', actorHash: authenticatedHostedDigest(ids.actors.author),
    sessionHash: authenticatedHostedDigest(ids.sessions.author),
  };
  const requestBinding = authenticatedHostedRequestBinding({
    requestId: ids.request, actorHash: participant.actorHash, commandType: 'process.update', payload, requireUuid: true,
  });
  const receipt = (await db.query(`SELECT id FROM public.assess_command_receipts
    WHERE org_id=$1 AND actor_id=$2 AND request_id=$3 AND command_type='process.update'`,
  [ids.org, ids.actors.author, ids.request])).rows[0];
  assert.ok(receipt);
  const browser = {
    testId: 'ASSESS-003', project: 'desktop-chromium', scenario: authenticatedAcceptanceScenario('ASSESS-003'),
    window: { startedAt: before.capturedAt, completedAt }, participants: [participant],
    actions: [{ actionId: authenticatedEvidenceDigest('authenticated-hosted-controller-action'), occurredAt: completedAt,
      actorHash: participant.actorHash, sessionHash: participant.sessionHash, ...requestBinding,
      response: { status: 200, classification: 'SUCCESS', commandIdHash: null,
        receiptIdHash: authenticatedHostedDigest(receipt.id) } }],
    assertions: AUTHENTICATED_CASE_ASSERTIONS['ASSESS-003'].map(id => ({
      id, comparator: 'equals', expected: true, actual: true, observedAt: completedAt, source: 'actual-product-browser',
    })),
    source: 'actual-product-browser',
  };
  const server = {
    testId: browser.testId, project: browser.project, scenario: browser.scenario,
    window: browser.window, participants: browser.participants, before, after,
  };
  const reconstructed = reconstructAuthenticatedHostedCaseEvidence({ browser, server, definition });
  assert.equal(reconstructed.status, 'PASS');
  assert.equal(reconstructed.measurements.logicalMutations, 1);
  assert.equal(reconstructed.measurements.domainWrites, 1);
  assert.equal(reconstructed.measurements.receiptWrites, 1);
  assert.equal(reconstructed.measurements.auditWrites, 1);
  assert.equal(reconstructed.measurements.providerCalls, 0);
  assert.equal(reconstructed.measurements.paidCalls, 0);
  assert.equal(reconstructed.measurements.budgetReservations, 0);
  assert.equal(reconstructed.measurements.budgetDebits, 0);

  const deniedController = new AuthenticatedHostedController({
    config,
    now: () => new Date('2036-10-10T00:00:00.000Z'),
    identity: { verifySession: async () => ({ actorId: ids.actors.outsider, sessionId: ids.sessions.outsider }) },
    adapter,
  });
  deniedController.exerciseId = ids.exercise;
  deniedController.startedAt = preflight.observationStartedAt;
  deniedController.observationStartedAt = preflight.observationStartedAt;
  deniedController.active = true;
  deniedController.projects.set('desktop-chromium-rejection', {
    ...rejectionProject,
    lastBoundaryAt: preflight.observationStartedAt,
  });
  const deniedRequestId = randomUUID();
  const deniedAuthorizationVersion = Number((await db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
    [ids.org, ids.actors.outsider],
  )).rows[0].version);
  const deniedAction = await deniedController.beginBrowserAction({
    projectName: 'desktop-chromium-rejection',
    accessToken: tokenFor(ids.actors.outsider, ids.sessions.outsider),
    route: '/functions/v1/process-command',
    requestBody: { requestId: deniedRequestId, commandType: 'process.update', expectedVersion: 1 },
  });
  const deniedResult = (await serviceQuery(
    'SELECT public.update_assess_process($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) value',
    [ids.actors.outsider, ids.org, ids.workspace, deniedAuthorizationVersion, deniedRequestId,
      'hosted-controller-denied-update', 1, rejectionProject.processId, payload.name, payload.description,
      payload.department, payload.criticality],
  )).rows[0].value;
  assert.deepEqual(deniedResult, { ok: false, error: { code: 'PERMISSION_DENIED' } });
  await db.query('SELECT pg_sleep(0.01)');
  await deniedController.finishBrowserAction({
    projectName: 'desktop-chromium-rejection', actionId: deniedAction.actionId, status: 403,
    responseBody: deniedResult,
  });
  await deniedController.recordBrowserCase({
    projectName: 'desktop-chromium-rejection', actionIds: [deniedAction.actionId],
    row: { testId: 'ASSESS-002', controls: { assertions: [
      { id: 'persisted-process-edit-denied', status: 'passed' },
      { id: 'unchanged-process-after-reload', status: 'passed' },
    ] } },
  });
  const deniedEvidence = reconstructAuthenticatedHostedCaseEvidence({
    browser: deniedController.browserCases[0], server: deniedController.serverCases[0], definition: deniedDefinition,
  });
  assert.equal(deniedEvidence.status, 'PASS');
  assert.equal(deniedEvidence.measurements.logicalMutations, 0);
  assert.equal(deniedEvidence.measurements.receiptWrites, 0);
  assert.equal(deniedEvidence.measurements.auditWrites, 0);

  const processFrame = await adapter.frame('/control/process-frame', { project, testId: 'ASSESS-003' });
  assert.equal(processFrame.receipts, 1);
  assert.equal(processFrame.audits, 1);
  assert.match(processFrame.targetHash, /^sha256:[0-9a-f]{64}$/u);
  const lifecycleFrame = await adapter.frame('/control/lifecycle-frame', { project, testId: 'ASSESS-003' });
  assert.equal(lifecycleFrame.receipts, 1);
  assert.equal(lifecycleFrame.audits, 1);

  assert.deepEqual(await adapter.control('/control/assess-v2-runtime', { enabled: false, project }), { enabled: false });
  assert.equal((await db.query('SELECT enabled FROM public.assess_v2_runtime_control WHERE singleton')).rows[0].enabled, false);
  assert.deepEqual(await adapter.control('/control/assess-v2-runtime', { enabled: true, project }), { enabled: true });
  assert.deepEqual((await db.query('SELECT enabled,read_only FROM public.assess_v2_runtime_control WHERE singleton')).rows[0],
    { enabled: true, read_only: false });
  assert.deepEqual(await adapter.control('/control/assess-v2-runtime', { enabled: false, project }), { enabled: false });

  const processCount = (await db.query('SELECT count(*)::int count FROM public.assess_processes WHERE org_id=$1 AND workspace_id=$2',
    [ids.org, ids.workspace])).rows[0].count;
  await assert.rejects(() => adapter.setupProject({
    projectName: 'pixel-7-chromium-partial', exerciseId: ids.exercise,
    exerciseDigest: config.exerciseDigest, scope: config.scope, identities: { author: identities.author },
  }));
  assert.equal((await db.query('SELECT count(*)::int count FROM public.assess_processes WHERE org_id=$1 AND workspace_id=$2',
    [ids.org, ids.workspace])).rows[0].count, processCount);

  const zeroEffectsBefore = (await db.query(`SELECT
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations WHERE org_id=$1) budgets,
    (SELECT count(*)::int FROM public.ai_provider_audit_events WHERE org_id=$1) provider_audits,
    (SELECT count(*)::int FROM public.studio_artifact_generation_attempts WHERE org_id=$1) generation_attempts`, [ids.org])).rows[0];
  await adapter.quiesce({ exerciseId: ids.exercise });
  await db.query('DELETE FROM auth.sessions WHERE user_id=ANY($1::uuid[])', [Object.values(ids.actors)]);
  await db.query("UPDATE auth.users SET banned_until=statement_timestamp()+interval '100 years' WHERE id=ANY($1::uuid[])",
    [Object.values(ids.actors)]);
  const cleanup = await adapter.cleanup({ exerciseId: ids.exercise, projects: [project,rejectionProject], sessions: Object.values(ids.sessions) });
  assert.deepEqual(cleanup, { transientResourcesRemoved: true, secretReferencesRevoked: 0 });
  assert.equal(secretCalls.length, 0);
  const verified = await adapter.verifyCleanup({
    exerciseId: ids.exercise, actorIds: Object.values(ids.actors), projects: [project,rejectionProject],
  });
  assert.equal(verified.activeSessions, 0);
  assert.equal(verified.activeIdentities, 0);
  assert.equal(verified.activeMemberships, 0);
  assert.equal(verified.armedPermits, 0);
  assert.equal(verified.activeSecretMaterial, 0);
  assert.equal(verified.unapprovedActiveResidue, 0);
  assert.equal(verified.nonExerciseChanged, false);
  assert.equal(verified.immutableHistoryPreserved, true);
  assert.equal(verified.retainedImmutableHistory, true);
  assert.ok(verified.resources.some(item => item.kind === 'exercise_history'
    && item.classification === 'retained_immutable' && item.status === 'preserved'));
  assert.deepEqual((await db.query('SELECT enabled,read_only FROM public.assess_v2_runtime_control WHERE singleton')).rows[0],
    { enabled: true, read_only: false });
  assert.deepEqual((await db.query(`SELECT
    (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations WHERE org_id=$1) budgets,
    (SELECT count(*)::int FROM public.ai_provider_audit_events WHERE org_id=$1) provider_audits,
    (SELECT count(*)::int FROM public.studio_artifact_generation_attempts WHERE org_id=$1) generation_attempts`, [ids.org])).rows[0],
  zeroEffectsBefore);

  console.log('authenticated hosted controller PostgreSQL: DB clock, setup, session binding, production mutation, denied-action correlation, CAS restore and cleanup passed');
} finally {
  if (db) await db.end().catch(() => {});
  let cleaned = !created;
  if (created) {
    try { await admin.query(`DROP DATABASE ${database} WITH (FORCE)`); cleaned = true; } catch { cleaned = false; }
  }
  if (cleaned) { try { unlinkSync(activeDatabaseMarker); } catch {} }
  await admin.end().catch(() => {});
}
