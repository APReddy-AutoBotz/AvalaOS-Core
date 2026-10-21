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
import { AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA } from './authenticatedHostedFixtureIdentity.mjs';
import { reconstructAuthenticatedHostedCaseEvidence } from './authenticatedHostedEvidence.mjs';
import {
  authenticatedHostedRequestBinding,
  createAuthenticatedHostedObservationReader,
} from './authenticatedHostedObservationAdapter.mjs';
import { createEnterpriseIntelligenceFixture } from './enterpriseIntelligencePostgresFixture.mjs';
import { loadEnterpriseLifecycleProductionModule } from './enterpriseLifecyclePostgresFixture.mjs';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';
import { verifyAuthenticatedObservationQueryEquivalence, verifyAuthenticatedObservationSnapshot } from './authenticatedObservationQueryProof.mjs';

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
const safetyDefinition = catalog.cases.find(item => item.testId === 'SAFETY-002');
assert.ok(definition);
assert.ok(deniedDefinition);
assert.ok(safetyDefinition);
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
  reviewer: ['org.admin','byok.manage','security.manage','admin.synthetic.users.manage','assess.process.update','assess.v2.govern.resolve'],
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
if (process.env.AUTHENTICATED_OBSERVATION_DRAIN_PROOF === 'true') {
  // Alphabetic UUIDs make the mixed-case equivalence checks non-vacuous.
  const alphabetic = object => {
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === 'string') object[key] = value.replace('82000000', '82abcdef');
      else alphabetic(value);
    }
  };
  alphabetic(ids);
}
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
  migrationVersion: '20261019161723',
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
const retainedIds = { process: randomUUID(), project: randomUUID(), foreignProcess: randomUUID() };
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
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
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

  // Persistent synthetic workspaces keep these rows after earlier actors are revoked.
  // They predate the new exercise baseline and must never be reused or removed.
  await db.query(`INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status,owner_id,created_by,updated_by)
    VALUES($1,$2,$3,'desktop-chromium-postgres connected lifecycle','Draft',$4,$4,$4)`,
  [retainedIds.process,ids.org,ids.workspace,ids.actors.author]);
  await db.query(`INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by,source_process_id)
    VALUES($1,$2,$3,'desktop-chromium-postgres delivery project',$4,$4,$4,$5)`,
  [retainedIds.project,ids.org,ids.workspace,ids.actors.author,retainedIds.process]);
  await db.query(`INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status,owner_id,created_by,updated_by)
    VALUES($1,$2,$3,'desktop-chromium-postgres connected lifecycle','Draft',$4,$4,$4)`,
  [retainedIds.foreignProcess,bootstrapFixture.org,bootstrapFixture.workspace,ids.actors.author]);
  const retainedHistory = async () => (await db.query(`SELECT
    (SELECT to_jsonb(p) FROM public.assess_processes p WHERE id=$1) process,
    (SELECT to_jsonb(p) FROM public.projects p WHERE id=$2) project,
    (SELECT to_jsonb(p) FROM public.assess_processes p WHERE id=$3) foreign_process`,
  [retainedIds.process,retainedIds.project,retainedIds.foreignProcess])).rows[0];
  const retainedBefore = await retainedHistory();
  const visibleCatalog = async (actorId, workspaceId = ids.workspace) => {
    await db.query('BEGIN');
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actorId]);
      await db.query('SET LOCAL ROLE authenticated');
      return {
        processes: (await db.query('SELECT id,name FROM public.assess_processes WHERE org_id=$1 AND workspace_id=$2',
          [workspaceId===ids.workspace?ids.org:bootstrapFixture.org,workspaceId])).rows,
        projects: (await db.query('SELECT id,name FROM public.projects WHERE org_id=$1 AND workspace_id=$2 AND deleted_at IS NULL',
          [workspaceId===ids.workspace?ids.org:bootstrapFixture.org,workspaceId])).rows,
      };
    } finally { await db.query('ROLLBACK'); }
  };
  const visibleProcess = async (actorId, processId) => {
    await db.query('BEGIN');
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actorId]);
      await db.query('SET LOCAL ROLE authenticated');
      return (await db.query(`SELECT id,org_id,workspace_id,name,description,department,criticality,authority_version
        FROM public.assess_processes WHERE id=$1`,[processId])).rows[0] ?? null;
    } finally { await db.query('ROLLBACK'); }
  };
  const visibleTenantContext = async (actorId, organizationId, workspaceId) => {
    await db.query('BEGIN');
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actorId]);
      await db.query('SET LOCAL ROLE authenticated');
      return (await db.query('SELECT public.get_tenant_context($1,$2) value',[organizationId,workspaceId])).rows[0]?.value ?? null;
    } finally { await db.query('ROLLBACK'); }
  };

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
  const observationEquivalence = await verifyAuthenticatedObservationQueryEquivalence({ db, config, project, exerciseId: ids.exercise });
  const observationSnapshot = await verifyAuthenticatedObservationSnapshot({
    connectionString: urlFor(database), db, config, project, exerciseId: ids.exercise });
  if (process.env.AUTHENTICATED_OBSERVATION_FINISH_PROOF === 'true') {
    await db.query('INSERT INTO auth.sessions(id,user_id) SELECT * FROM unnest($1::uuid[],$2::uuid[])',
      [Object.values(ids.sessions), Object.values(ids.actors)]);
    const { runObservationFinishProof } = await import('./authenticatedObservationFinishProof.mjs');
    const proof = await runObservationFinishProof({ db, connectionString: urlFor(database), config, adapter, project, ids,
      mode: process.env.OBSERVATION_FINISH_MODE ?? 'baseline' });
    proof.equivalence = observationEquivalence; proof.snapshot = observationSnapshot;
    writeFileSync(path.join(privateDirectory, `observation-finish-${proof.mode}-proof.json`), JSON.stringify(proof, null, 2)+'\n');
    console.log(JSON.stringify(proof));
  } else if (process.env.AUTHENTICATED_OBSERVATION_QUEUE_PROOF === 'true') {
    await db.query('INSERT INTO auth.sessions(id,user_id) SELECT * FROM unnest($1::uuid[],$2::uuid[])',
      [Object.values(ids.sessions), Object.values(ids.actors)]);
    const { runObservationQueueProof } = await import('./authenticatedObservationQueueProof.mjs');
    const proof = await runObservationQueueProof({db,connectionString:urlFor(database),config,adapter,project,ids,
      mode:process.env.OBSERVATION_QUEUE_MODE ?? 'baseline'});
    proof.equivalence=observationEquivalence;proof.snapshot=observationSnapshot;
    writeFileSync(path.join(privateDirectory,`observation-queue-${proof.mode}-proof.json`),JSON.stringify(proof,null,2)+'\n');
    console.log(JSON.stringify(proof));
  } else if (process.env.AUTHENTICATED_OBSERVATION_DRAIN_PROOF === 'true') {
    assert.deepEqual(observationEquivalence.caseSensitiveFields, [0, 1, 2, 3, 4]);
    await db.query('INSERT INTO auth.sessions(id,user_id) SELECT * FROM unnest($1::uuid[],$2::uuid[])',
      [Object.values(ids.sessions), Object.values(ids.actors)]);
    const { runObservationDrainProof } = await import('./authenticatedObservationDrainProof.mjs');
    const proof = await runObservationDrainProof({ db, connectionString: urlFor(database), config, adapter, project, ids,
      retainedIds, retainedActor: bootstrapFixture.requester });
    proof.equivalence = observationEquivalence;
    proof.snapshot = observationSnapshot;
    writeFileSync(path.join(privateDirectory, 'observer-drain-index-proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof));
  } else if (process.env.AUTHENTICATED_OBSERVATION_ROUNDTRIP_PROOF === 'true') {
    await db.query('INSERT INTO auth.sessions(id,user_id) SELECT * FROM unnest($1::uuid[],$2::uuid[])',
      [Object.values(ids.sessions), Object.values(ids.actors)]);
    const { runObservationRoundTripProof } = await import('./authenticatedObservationRoundTripProof.mjs');
    const proof = await runObservationRoundTripProof({ connectionString: urlFor(database), config, adapter, project, ids,
      expectedStatements: Number(process.env.OBSERVATION_PROOF_STATEMENTS ?? '3') });
    proof.equivalence = observationEquivalence;
    proof.snapshot = observationSnapshot;
    writeFileSync(path.join(privateDirectory, `observer-roundtrip-${process.env.OBSERVATION_PROOF_STATEMENTS ?? '3'}-proof.json`),
      JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof));
  } else if (process.env.AUTHENTICATED_OBSERVATION_BROWSER_PROOF === 'true') {
    // Focused local-only comparison: current actor requests must not serialize
    // retained document bodies owned by a different actor/project.
    await db.query(`INSERT INTO document_generations(org_id,workspace_id,project_id,created_by,template_id,artifacts)
      SELECT $1,$2,$3,$4,'brd',jsonb_build_object('synthetic',true,'text',repeat('x',12000000))
      FROM generate_series(1,24)`, [ids.org, ids.workspace, retainedIds.project, bootstrapFixture.requester]);
    await db.query('INSERT INTO auth.sessions(id,user_id) SELECT * FROM unnest($1::uuid[],$2::uuid[])',
      [Object.values(ids.sessions), Object.values(ids.actors)]);
    const { runObserverBrowserProof } = await import('./authenticatedObservationBrowserProof.mjs');
    const proof = await runObserverBrowserProof({ db: adapterDb, config, adapter, project, ids });
    writeFileSync(path.join(privateDirectory, 'observer-browser-proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof));
  } else {
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

  // Independent fixed oracle for the trusted fixture binding above; do not derive
  // expected labels by calling the helper whose insertion/alias pairing we verify.
  assert.equal(project.aliases.process,'desktop-chromium-postgres connected lifecycle [run 12345.1 e1bc3b7134bf]');
  assert.equal(project.deliveryProject.name,'desktop-chromium-postgres delivery project [run 12345.1 e1bc3b7134bf]');
  const reviewerCatalog = await visibleCatalog(ids.actors.reviewer);
  assert.ok(reviewerCatalog.processes.some(row=>row.id===retainedIds.process));
  assert.ok(reviewerCatalog.projects.some(row=>row.id===retainedIds.project));
  assert.deepEqual(reviewerCatalog.processes.filter(row=>row.name===project.aliases.process),
    [{id:project.processId,name:project.aliases.process}], 'the current alias selects only the newly seeded process');
  assert.deepEqual(reviewerCatalog.projects.filter(row=>row.name===project.deliveryProject.name),
    [{id:project.projectId,name:project.deliveryProject.name}], 'the current alias selects only the newly seeded project');
  const freshReviewerProcess = await visibleProcess(ids.actors.reviewer,project.processId);
  assert.deepEqual(freshReviewerProcess, {
    id: project.processId,
    org_id: ids.org,
    workspace_id: ids.workspace,
    name: project.aliases.process,
    ...AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA,
    authority_version: '1',
  }, 'reviewer RLS sees explicit valid metadata on the fresh version-1 process before author mutation');
  assert.notEqual(project.aliases.process,retainedBefore.process.name);
  assert.notEqual(project.deliveryProject.name,retainedBefore.project.name);
  assert.deepEqual((await visibleCatalog(ids.actors.outsider)).processes,[], 'membership without assess.read cannot read processes');
  assert.deepEqual(await visibleCatalog(ids.actors.reviewer,bootstrapFixture.workspace),{processes:[],projects:[]},
    'same-name history in another workspace stays hidden');
  assert.deepEqual(await retainedHistory(),retainedBefore);

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
  const initialFrame = await reader.capture({ exerciseId: ids.exercise, from: startedAt, project });
  const adapterBefore = await adapter.observe({ exerciseId: ids.exercise, from: startedAt, project });
  assert.ok(Number.isFinite(Date.parse(initialFrame.capturedAt)));
  assert.ok(Number.isFinite(Date.parse(adapterBefore.capturedAt)));
  assert.deepEqual(adapterBefore.records, initialFrame.records);
  const authorizationVersion = Number((await db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [ids.org, ids.actors.author],
  )).rows[0].version);
  const assessCommandModule = loadEnterpriseLifecycleProductionModule(
    path.join(root,'supabase','functions','_shared','assessCommand.ts'));
  const assessRouter = loadEnterpriseLifecycleProductionModule(
    path.join(root,'supabase','functions','_shared','assessRouter.ts'));
  const tenantAuthority = loadEnterpriseLifecycleProductionModule(
    path.join(root,'supabase','functions','_shared','tenantAuthority.ts'));
  const authorityFor = async (actorId,organizationId,workspaceId) => {
    try {
      const authority=await tenantAuthority.resolveTenantAuthority(actorId,{organizationId,workspaceId},{
        loadFreshProjection: input=>visibleTenantContext(actorId,input.organizationId,input.workspaceId),
      });
      return {actorId:authority.userId,organizationId:authority.organizationId,workspaceId:authority.workspaceId,
        authorizationVersion:authority.authorizationVersion,permissions:authority.capabilities};
    } catch(error) {
      if(error?.code==='TENANT_ACCESS_DENIED')return null;
      throw error;
    }
  };
  const assessDependencies = {
    authenticate: async request => {
      assert.equal(request.headers.get('authorization'),`Bearer ${tokenFor(ids.actors.author,ids.sessions.author)}`);
      return {id:ids.actors.author};
    },
    loadFreshAuthority: input=>authorityFor(input.actorId,input.organizationId,input.workspaceId),
    loadAssessmentForFinalize: async input => {
      const row=(await serviceQuery(`SELECT id,process_id,version,responses FROM public.assessments
        WHERE id=$1 AND org_id=$2 AND workspace_id=$3 AND deleted_at IS NULL`,
      [input.assessmentId,input.organizationId,input.workspaceId])).rows[0];
      if(!row)return null;
      if(Number(row.version)!==input.expectedVersion)throw new assessCommandModule.AssessCommandError('VERSION_CONFLICT');
      const aggregate=row.responses;
      if(!aggregate||typeof aggregate!=='object'||Array.isArray(aggregate)
        ||!aggregate.responses||typeof aggregate.responses!=='object'||Array.isArray(aggregate.responses)
        ||!aggregate.metadata||typeof aggregate.metadata!=='object'||Array.isArray(aggregate.metadata))return null;
      return {assessmentId:row.id,processId:row.process_id,version:Number(row.version),responses:aggregate.responses,
        metadata:aggregate.metadata,evidenceItems:Array.isArray(aggregate.evidenceItems)?aggregate.evidenceItems:[],
        assumptions:Array.isArray(aggregate.assumptions)?aggregate.assumptions:[]};
    },
    executeAtomicCommand: async command => {
      const common=[command.actorId,command.organizationId,command.workspaceId];let result;
      if(command.commandType==='assessment.create')result=await serviceQuery(
        'SELECT public.pr1b_create_assessment($1,$2,$3,$4,$5,$6,$7,$8) value',
        [...common,command.payload.processId,command.resourceId,command.requestId,command.idempotencyKey,
          command.authorizationVersion]);
      else if(command.commandType==='assessment.response.upsert')result=await serviceQuery(
        'SELECT public.pr1b_upsert_assessment_responses($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) value',
        [...common,command.resourceId,JSON.stringify(command.payload),command.expectedVersion,command.requestId,
          command.idempotencyKey,command.authorizationVersion]);
      else if(command.commandType==='assessment.finalize'){
        const scores=command.payload.scores;
        result=await serviceQuery(
          'SELECT public.pr1b_finalize_assessment($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) value',
          [...common,command.resourceId,JSON.stringify(scores),scores.scoreVersion,command.expectedVersion,
            command.requestId,command.idempotencyKey,command.authorizationVersion]);
      }else throw new assessCommandModule.AssessCommandError('COMMAND_NOT_SUPPORTED');
      const value=result.rows[0]?.value;
      const mapping={VERSION_CONFLICT:'VERSION_CONFLICT',IDEMPOTENCY_CONFLICT:'IDEMPOTENCY_CONFLICT',
        AUTHORIZATION_STALE:'AUTHORITY_STALE',NOT_FOUND:'RESOURCE_NOT_AVAILABLE',INVALID_COMMAND:'INVALID_COMMAND',
        INVALID_SCORE_VERSION:'INVALID_COMMAND'};
      if(value?.errorCode)throw new assessCommandModule.AssessCommandError(mapping[value.errorCode]??'COMMAND_UNAVAILABLE');
      if(!value||!['committed','replayed'].includes(value.outcome)||!value.resource){
        throw new assessCommandModule.AssessCommandError('COMMAND_UNAVAILABLE');
      }
      return {outcome:value.outcome,resource:value.resource};
    },
  };
  const authorAccessToken=tokenFor(ids.actors.author,ids.sessions.author);
  const invokeAssess=async envelope=>{
    const response=await assessRouter.handleAssessRequest(new Request('http://127.0.0.1/functions/v1/assess-command',{
      method:'POST',headers:{authorization:`Bearer ${authorAccessToken}`,'content-type':'application/json'},
      body:JSON.stringify(envelope),
    }),assessDependencies);
    return {status:response.status,body:await response.json()};
  };
  const foreignScopeRequestId=randomUUID();
  const foreignScopeResult=await invokeAssess({requestId:foreignScopeRequestId,
    idempotencyKey:`assessment.create.${foreignScopeRequestId}`,commandType:'assessment.create',
    organizationId:randomUUID(),workspaceId:randomUUID(),authorizationVersion,
    payload:{processId:project.processId}});
  assert.equal(foreignScopeResult.status,404);
  assert.deepEqual(foreignScopeResult.body,{ok:false,error:{
    code:'RESOURCE_NOT_AVAILABLE',message:'The command could not be completed.',
  }});
  assert.deepEqual((await serviceQuery(`SELECT
      (SELECT count(*)::int FROM public.assessments WHERE id=$1) assessments,
      (SELECT count(*)::int FROM public.assess_command_receipts WHERE request_id=$1) receipts,
      (SELECT count(*)::int FROM public.privileged_audit_events WHERE request_id=$1) audits`,
  [foreignScopeRequestId])).rows[0],{assessments:0,receipts:0,audits:0});
  const createRequestId=randomUUID();
  const createEnvelope={requestId:createRequestId,idempotencyKey:`assessment.create.${createRequestId}`,
    commandType:'assessment.create',organizationId:ids.org,workspaceId:ids.workspace,authorizationVersion,
    payload:{processId:project.processId}};
  const createdAssessment=await invokeAssess(createEnvelope);
  assert.equal(createdAssessment.status,200);
  assert.deepEqual(createdAssessment.body,{ok:true,outcome:'committed',resource:{assessmentId:createRequestId,
    status:'Draft',version:1}});
  const assessmentResponses={
    processStructure:{standardization:4,ruleDeterminism:4,exceptionPredictability:3,processMaturity:4},
    workPattern:{volume:1200,manualEffort:0.75,averageHourlyCost:65,reworkPain:3,cycleTimePain:4},
    dataProfile:{inputStructure:80,unstructuredLoad:2,dataSensitivity:2},judgment:{judgmentIntensity:2,goalAmbiguity:2},
    systems:{systemReadiness:4,orchestrationComplexity:3},
    risk:{riskCriticality:2,governanceSensitivity:2,errorReversibility:4},
  };
  const assessmentMetadata={completionQuality:90,templateFit:true,stakeholderCoverage:4,evidenceQuality:4,assumptionQuality:4};
  const upsertRequestId=randomUUID();
  const upsertEnvelope={requestId:upsertRequestId,idempotencyKey:`assessment.response.upsert.${upsertRequestId}`,
    commandType:'assessment.response.upsert',organizationId:ids.org,workspaceId:ids.workspace,authorizationVersion,
    expectedVersion:1,payload:{assessmentId:createRequestId,responses:assessmentResponses,metadata:assessmentMetadata,
      evidenceItems:[],assumptions:[]}};
  const upsertedAssessment=await invokeAssess(upsertEnvelope);
  assert.equal(upsertedAssessment.status,200);
  assert.deepEqual(upsertedAssessment.body,{ok:true,outcome:'committed',resource:{assessmentId:createRequestId,
    status:'Draft',version:2}});

  const controller=new AuthenticatedHostedController({config,adapter,
    identity:{verifySession:async()=>({actorId:ids.actors.author,sessionId:ids.sessions.author})}});
  controller.exerciseId=ids.exercise;controller.startedAt=preflight.observationStartedAt;
  controller.observationStartedAt=preflight.observationStartedAt;controller.active=true;
  controller.projects.set('desktop-chromium',{...project,lastBoundaryAt:preflight.observationStartedAt});
  const finalizeRequestId=randomUUID();
  const finalizeEnvelope={requestId:finalizeRequestId,idempotencyKey:`assessment.finalize.${finalizeRequestId}`,
    commandType:'assessment.finalize',organizationId:ids.org,workspaceId:ids.workspace,authorizationVersion,
    expectedVersion:2,payload:{assessmentId:createRequestId}};
  const finalizeAction=await controller.beginBrowserAction({projectName:'desktop-chromium',accessToken:authorAccessToken,
    route:'/functions/v1/assess-command',requestBody:finalizeEnvelope});
  const finalizedResponse=await invokeAssess(finalizeEnvelope);
  assert.equal(finalizedResponse.status,200);
  await controller.finishBrowserAction({projectName:'desktop-chromium',actionId:finalizeAction.actionId,
    status:finalizedResponse.status,responseBody:finalizedResponse.body});
  const persistedAssessment=(await serviceQuery(`SELECT status,version,score_version,scores,updated_by
    FROM public.assessments WHERE id=$1 AND org_id=$2 AND workspace_id=$3`,
  [createRequestId,ids.org,ids.workspace])).rows[0];
  const assessmentChecks={
    'persisted-discovery-inputs-scored':persistedAssessment?.status==='Ready for Review'
      &&Number(persistedAssessment?.version)===3&&persistedAssessment?.score_version==='assess-core-2026-05'
      &&persistedAssessment?.scores?.scoreVersion==='assess-core-2026-05'
      &&persistedAssessment?.updated_by===ids.actors.author,
    'production-completion-committed':finalizedResponse.body?.ok===true
      &&finalizedResponse.body?.outcome==='committed'
      &&finalizedResponse.body?.resource?.assessmentId===createRequestId
      &&finalizedResponse.body?.resource?.status==='Ready for Review'
      &&finalizedResponse.body?.resource?.version===3
      &&finalizedResponse.body?.resource?.scoreVersion==='assess-core-2026-05',
  };
  assert.ok(Object.values(assessmentChecks).every(Boolean));
  await controller.recordBrowserCase({projectName:'desktop-chromium',actionIds:[finalizeAction.actionId],
    row:{testId:'ASSESS-003',controls:{assertions:AUTHENTICATED_CASE_ASSERTIONS['ASSESS-003'].map(id=>({
      id,status:assessmentChecks[id]?'passed':'failed',
    }))}}});
  const reconstructed=reconstructAuthenticatedHostedCaseEvidence({browser:controller.browserCases[0],
    server:controller.serverCases[0],definition});
  assert.equal(reconstructed.status, 'PASS');
  assert.equal(reconstructed.measurements.logicalMutations, 1);
  assert.equal(reconstructed.measurements.domainWrites, 1);
  assert.equal(reconstructed.measurements.receiptWrites, 1);
  assert.equal(reconstructed.measurements.auditWrites, 1);
  assert.equal(reconstructed.measurements.providerCalls, 0);
  assert.equal(reconstructed.measurements.paidCalls, 0);
  assert.equal(reconstructed.measurements.budgetReservations, 0);
  assert.equal(reconstructed.measurements.budgetDebits, 0);
  assert.equal(reconstructed.measurements.foreignWrites,0);
  const finalAction=controller.browserCases[0].actions[0];
  assert.equal(finalAction.commandBindingHash,authenticatedHostedRequestBinding({requestId:finalizeRequestId,
    actorHash:authenticatedHostedDigest(ids.actors.author),commandType:'assessment.finalize',
    payload:finalizeEnvelope,requireUuid:true}).commandBindingHash);
  assert.ok(finalAction.response.receiptIdHash);

  const deniedController = new AuthenticatedHostedController({
    config,
    now: () => new Date('2036-10-10T00:00:00.000Z'),
    identity: { verifySession: async () => ({ actorId: ids.actors.reviewer, sessionId: ids.sessions.reviewer }) },
    adapter,
  });
  deniedController.exerciseId = ids.exercise;
  deniedController.startedAt = preflight.observationStartedAt;
  deniedController.observationStartedAt = preflight.observationStartedAt;
  deniedController.active = true;
  deniedController.projects.set('desktop-chromium-rejection', {
    ...project,
    lastBoundaryAt: preflight.observationStartedAt,
  });
  const deniedRequestId = randomUUID();
  const deniedAuthorizationVersion = Number((await db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
    [ids.org, ids.actors.reviewer],
  )).rows[0].version);
  const reviewerProcess = await visibleProcess(ids.actors.reviewer,project.processId);
  assert.equal(reviewerProcess?.org_id,ids.org);
  assert.equal(reviewerProcess?.workspace_id,ids.workspace);
  const reviewerProcessVersion = Number(reviewerProcess?.authority_version);
  assert.equal(reviewerProcessVersion,1);
  const deniedPayload = {
    processId: reviewerProcess.id,
    name: 'Unauthorized process rename',
    description: reviewerProcess.description,
    department: reviewerProcess.department,
    criticality: reviewerProcess.criticality,
  };
  const deniedEnvelope = {
    requestId: deniedRequestId,
    idempotencyKey: `process.update.${deniedRequestId}`,
    commandType: 'process.update',
    organizationId: ids.org,
    workspaceId: ids.workspace,
    authorizationVersion: deniedAuthorizationVersion,
    expectedVersion: reviewerProcessVersion,
    payload: deniedPayload,
  };
  const deniedBefore = await adapter.frame('/control/process-frame', { project, testId: 'ASSESS-002' });
  const deniedAccessToken = tokenFor(ids.actors.reviewer, ids.sessions.reviewer);
  const deniedAction = await deniedController.beginBrowserAction({
    projectName: 'desktop-chromium-rejection',
    accessToken: deniedAccessToken,
    route: '/functions/v1/process-command',
    requestBody: deniedEnvelope,
  });
  const processRouter = loadEnterpriseLifecycleProductionModule(
    path.join(root,'supabase','functions','_shared','processCommandRouter.ts'));
  let deniedAtomicCalls = 0;
  let deniedAuthorityCalls = 0;
  let deniedAuthority = null;
  const deniedHandlerResponse = await processRouter.handleProcessCommandRequest(new Request(
    'http://127.0.0.1/functions/v1/process-command', {
      method: 'POST',
      headers: { authorization: `Bearer ${deniedAccessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(deniedEnvelope),
    }), {
    creation: {
      authenticate: async () => { throw new Error('UNEXPECTED_CREATION_ROUTE'); },
      authority: async () => null,
      atomic: async () => { throw new Error('UNEXPECTED_CREATION_ATOMIC'); },
    },
    update: {
      authenticate: async request => {
        assert.equal(request.headers.get('authorization'),`Bearer ${deniedAccessToken}`);
        return { id: ids.actors.reviewer };
      },
      authority: async (_request,actorId,envelope) => {
        deniedAuthorityCalls += 1;
        deniedAuthority = await tenantAuthority.resolveTenantAuthority(actorId, {
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          expectedAuthorizationVersion: envelope.authorizationVersion,
        }, {
          loadFreshProjection: input => visibleTenantContext(actorId,input.organizationId,input.workspaceId),
        });
        return deniedAuthority;
      },
      atomic: async () => { deniedAtomicCalls += 1; throw new Error('DENIED_ATOMIC_MUST_NOT_RUN'); },
    },
  });
  const deniedHandlerBody = await deniedHandlerResponse.json();
  assert.equal(deniedHandlerResponse.status,403);
  assert.deepEqual(deniedHandlerBody,{ok:false,error:{
    code:'PERMISSION_DENIED',message:'Process update could not be completed.',
  }});
  assert.equal(deniedAuthorityCalls,1);
  assert.equal(deniedAtomicCalls,0);
  assert.equal(deniedAuthority.userId,ids.actors.reviewer);
  assert.equal(deniedAuthority.capabilities.includes('assess.read'),true);
  assert.equal(deniedAuthority.capabilities.includes('assess.process.update'),false);
  // Defense in depth: the database mutation function independently rejects the same actor and envelope.
  const deniedResult = (await serviceQuery(
    'SELECT public.update_assess_process($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) value',
    [ids.actors.reviewer, ids.org, ids.workspace, deniedAuthorizationVersion, deniedRequestId,
      `process.update.${deniedRequestId}`, reviewerProcessVersion, deniedPayload.processId, deniedPayload.name, deniedPayload.description,
      deniedPayload.department, deniedPayload.criticality],
  )).rows[0].value;
  assert.deepEqual(deniedResult, { ok: false, error: { code: 'PERMISSION_DENIED' } });
  await db.query('SELECT pg_sleep(0.01)');
  await deniedController.finishBrowserAction({
    projectName: 'desktop-chromium-rejection', actionId: deniedAction.actionId, status: 403,
    responseBody: deniedHandlerBody,
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
  const deniedAfter = await adapter.frame('/control/process-frame', { project, testId: 'ASSESS-002' });
  assert.deepEqual(deniedAfter, deniedBefore, 'reviewer capability denial preserves the independently read process frame');

  const syntheticAuthority = loadEnterpriseLifecycleProductionModule(
    path.join(root,'supabase','functions','_shared','authenticatedSyntheticAuthority.ts'));
  const safetyRequestId = randomUUID();
  const authorProcess = await visibleProcess(ids.actors.author,project.processId);
  const safetyEnvelope = {
    requestId: safetyRequestId,
    idempotencyKey: `process.update.${safetyRequestId}`,
    commandType: 'process.update',
    organizationId: ids.org,
    workspaceId: ids.workspace,
    authorizationVersion,
    expectedVersion: Number(authorProcess.authority_version),
    payload: {
      processId: authorProcess.id,
      name: 'Precommit failure must remain uncommitted',
      description: authorProcess.description,
      department: authorProcess.department,
      criticality: authorProcess.criticality,
    },
  };
  const safetyBefore = await adapter.frame('/control/process-frame', { project, testId: 'SAFETY-002' });
  const safetyBoundary = await adapter.observe({ exerciseId: ids.exercise,
    from: preflight.observationStartedAt, project });
  const safetyController = new AuthenticatedHostedController({
    config,
    identity: { verifySession: async () => ({ actorId: ids.actors.author, sessionId: ids.sessions.author }) },
    adapter,
  });
  safetyController.exerciseId = ids.exercise;
  safetyController.startedAt = preflight.observationStartedAt;
  safetyController.observationStartedAt = preflight.observationStartedAt;
  safetyController.active = true;
  safetyController.projects.set('desktop-chromium-safety', {
    ...project,
    lastBoundaryAt: safetyBoundary.capturedAt,
  });
  const safetyAction = await safetyController.beginBrowserAction({
    projectName: 'desktop-chromium-safety',
    accessToken: authorAccessToken,
    route: '/functions/v1/process-command',
    requestBody: safetyEnvelope,
  });
  const safetyPayloadHash = authenticatedHostedDigest(safetyEnvelope).slice('sha256:'.length);
  const armed = await safetyController.armBrowserFault({
    projectName: 'desktop-chromium-safety',
    persona: 'author',
    kind: 'process_server_error_precommit',
    commandType: 'process.update',
    requestBody: safetyEnvelope,
    accessToken: authorAccessToken,
  });
  assert.equal(armed.state,'armed');
  let safetyAtomicCalls = 0;
  const safetyOrder = [];
  const safetyDependencies = {
    creation: {
      authenticate: async () => { throw new Error('UNEXPECTED_CREATION_ROUTE'); },
      authority: async () => null,
      atomic: async () => { throw new Error('UNEXPECTED_CREATION_ATOMIC'); },
    },
    update: {
      authenticate: async request => {
        assert.equal(request.headers.get('authorization'),`Bearer ${tokenFor(ids.actors.author,ids.sessions.author)}`);
        return { id: ids.actors.author };
      },
      authority: async (_request,actorId,envelope) => {
        safetyOrder.push('authority');
        return tenantAuthority.resolveTenantAuthority(actorId, {
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          expectedAuthorizationVersion: envelope.authorizationVersion,
        }, { loadFreshProjection: input => visibleTenantContext(actorId,input.organizationId,input.workspaceId) });
      },
      consumePrecommitFault: async (request,body,actorId,envelope) => {
        safetyOrder.push('consume');
        return syntheticAuthority.consumeAuthenticatedSyntheticProcessFault({
          request, body, actorId,
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          commandType: 'process.update',
          requestId: envelope.requestId,
          expectedVersion: envelope.expectedVersion,
        }, async (name,args) => {
          assert.equal(name,'authenticated_synthetic_consume_process_fault');
          assert.equal(args.p_session_id,ids.sessions.author,
            'the production adapter preserves the verified session in the test runtime');
          assert.equal(args.p_payload_hash,await syntheticAuthority.authenticatedSyntheticPayloadHash(body));
          return (await serviceQuery(
            'SELECT public.authenticated_synthetic_consume_process_fault($1,$2,$3,$4,$5,$6,$7,$8) value',
            [args.p_actor_id,args.p_org_id,args.p_workspace_id,args.p_session_id,args.p_command_type,
              args.p_request_id,args.p_payload_hash,args.p_expected_version],
          )).rows[0].value;
        });
      },
      atomic: async () => { safetyAtomicCalls += 1; throw new Error('SAFETY_ATOMIC_MUST_NOT_RUN'); },
    },
  };
  const safetyRequest = body => new Request('http://127.0.0.1/functions/v1/process-command', {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenFor(ids.actors.author,ids.sessions.author)}`,
      'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const mismatchedSafetyResponse = await processRouter.handleProcessCommandRequest(
    safetyRequest({ ...safetyEnvelope, payload: { ...safetyEnvelope.payload, name: 'Mismatched payload' } }),
    safetyDependencies,
  );
  assert.equal(mismatchedSafetyResponse.status,503);
  assert.equal((await db.query('SELECT state FROM public.authenticated_synthetic_permits WHERE id=$1',
    [armed.permitId])).rows[0].state,'armed','a mismatched payload cannot consume the permit');
  const safetyResponse = await processRouter.handleProcessCommandRequest(safetyRequest(safetyEnvelope),safetyDependencies);
  const safetyBody = await safetyResponse.json();
  assert.equal(safetyResponse.status,503);
  assert.deepEqual(safetyBody,{ok:false,error:{
    code:'COMMAND_UNAVAILABLE',message:'Process update could not be completed.',
  }});
  await db.query('SELECT pg_sleep(0.01)');
  await safetyController.finishBrowserAction({
    projectName: 'desktop-chromium-safety', actionId: safetyAction.actionId, status: 503,
    responseBody: safetyBody,
  });
  assert.deepEqual(safetyOrder,['authority','consume','authority','consume'],
    'fresh authority is established before every permit-consumption attempt');
  assert.equal(safetyAtomicCalls,0);
  const consumedPermit = (await db.query(`SELECT kind,command_type,actor_id,session_id,request_id,payload_hash,
      expected_version::int,state,consumed_at IS NOT NULL consumed,
      (SELECT count(*)::int FROM public.authenticated_synthetic_permit_events event
        WHERE event.permit_id=permit.id AND event.event_type='consumed_precommit') consumed_events
    FROM public.authenticated_synthetic_permits permit WHERE id=$1`,[armed.permitId])).rows[0];
  assert.deepEqual(consumedPermit,{
    kind:'process_server_error_precommit',command_type:'process.update',actor_id:ids.actors.author,
    session_id:ids.sessions.author,request_id:safetyRequestId,payload_hash:safetyPayloadHash,
    expected_version:safetyEnvelope.expectedVersion,state:'consumed',consumed:true,consumed_events:1,
  });
  const safetyAfter = await adapter.frame('/control/process-frame', { project, testId: 'SAFETY-002' });
  assert.deepEqual(safetyAfter,safetyBefore,
    'the real consumed precommit permit returns 503 without process, receipt, or audit mutation');
  // These browser assertions are controlled verifier inputs, not observed UI proof.
  // The separate connected-browser job must establish preserved input/no false success.
  await safetyController.recordBrowserCase({
    projectName: 'desktop-chromium-safety', actionIds: [safetyAction.actionId],
    row: { testId: 'SAFETY-002', controls: { assertions: [
      { id: 'server-error-command-not-committed', status: 'passed' },
      { id: 'input-preserved-without-success', status: 'passed' },
    ] } },
  });
  const safetyEvidence = reconstructAuthenticatedHostedCaseEvidence({
    browser: safetyController.browserCases[0], server: safetyController.serverCases[0],
    definition: safetyDefinition,
  });
  assert.equal(safetyEvidence.status,'PASS');
  assert.equal(safetyEvidence.measurements.denialObserved,true);
  for (const measurement of [
    'logicalMutations','domainWrites','secretWrites','storageWrites','generationAttemptWrites',
    'receiptWrites','auditWrites','concurrencyWrites','providerCalls',
    'paidCalls','providerTokens','budgetReservations','budgetDebits','foreignWrites',
  ]) assert.equal(safetyEvidence.measurements[measurement],0,`SAFETY-002 ${measurement} remains zero`);
  assert.equal(safetyEvidence.measurements.beforeHash,safetyEvidence.measurements.afterHash,
    'SAFETY-002 reconstructs the unchanged independent resource frame');
  const safetyBrowserAction = safetyController.browserCases[0].actions[0];
  assert.equal(safetyBrowserAction.requestIdHash,authenticatedHostedDigest(safetyRequestId));
  assert.equal(safetyBrowserAction.browserPayloadHash,`sha256:${safetyPayloadHash}`);
  assert.ok(safetyController.serverCases[0].after.records.some(row => row.effectKind === 'control'
    && row.commandBindingHash === safetyBrowserAction.commandBindingHash
    && row.requestIdHash === safetyBrowserAction.requestIdHash
    && row.persistedPayloadHash === safetyBrowserAction.browserPayloadHash),
  'SAFETY-002 server evidence correlates the exact consumed permit payload to the browser action');

  const processFrame = await adapter.frame('/control/process-frame', { project, testId: 'ASSESS-003' });
  assert.equal(processFrame.receipts, 0);
  assert.equal(processFrame.audits, 0);
  assert.match(processFrame.targetHash, /^sha256:[0-9a-f]{64}$/u);
  const lifecycleFrame = await adapter.frame('/control/lifecycle-frame', { project, testId: 'ASSESS-003' });
  assert.equal(lifecycleFrame.receipts, 3);
  assert.equal(lifecycleFrame.audits, 3);

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
  assert.deepEqual(await retainedHistory(),retainedBefore,'cleanup preserves all prior process/project history');
  assert.equal((await db.query('SELECT deleted_at FROM public.assess_processes WHERE id=$1',[project.processId])).rows[0].deleted_at,null);
  assert.equal((await db.query('SELECT deleted_at FROM public.projects WHERE id=$1',[project.projectId])).rows[0].deleted_at,null);
  assert.deepEqual(await visibleCatalog(ids.actors.reviewer),{processes:[],projects:[]},'revoked membership denies the retained catalog');
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
  }
} finally {
  if (db) await db.end().catch(() => {});
  let cleaned = !created;
  if (created) {
    try { await admin.query(`DROP DATABASE ${database} WITH (FORCE)`); cleaned = true; } catch { cleaned = false; }
  }
  if (cleaned) { try { unlinkSync(activeDatabaseMarker); } catch {} }
  await admin.end().catch(() => {});
}
