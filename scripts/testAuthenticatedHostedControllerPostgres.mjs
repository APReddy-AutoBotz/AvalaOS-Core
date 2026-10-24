import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { AUTHENTICATED_CASE_ASSERTIONS, authenticatedAcceptanceScenario } from './authenticatedAcceptanceCases.mjs';
import { authenticatedEvidenceDigest } from './authenticatedBrowserCorrelation.mjs';
import { AuthenticatedHostedController, authenticatedHostedDigest,
  AUTHENTICATED_HOSTED_PERSONAS } from './authenticatedHostedController.mjs';
import { createAuthenticatedHostedPostgresAdapter, FORBIDDEN_PERSONA_CAPABILITIES,
  REQUIRED_PERSONA_CAPABILITIES } from './authenticatedHostedControllerAdapters.mjs';
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
const privateDirectory = process.env.AUTHENTICATED_LOCAL_PROOF_DIRECTORY
  ? path.resolve(process.env.AUTHENTICATED_LOCAL_PROOF_DIRECTORY)
  : path.join(root, 'output', 'local-private', 'authenticated-product-acceptance');
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
const requiredCapabilities = REQUIRED_PERSONA_CAPABILITIES;
const pinnedAuthorHandoffRequired = Object.freeze(['studio.handoffs.read','studio.handoffs.request']);
const pinnedAuthorHandoffForbidden = Object.freeze([
  'studio.handoffs.review','studio.handoffs.approve','studio.handoffs.consume',
]);
const pinnedPersonaCapabilityCounts = Object.freeze({ author:25, reviewer:14, approver:18 });
assert.deepEqual(requiredCapabilities.author.filter(capability => capability.startsWith('studio.handoffs.')),
  pinnedAuthorHandoffRequired);
assert.deepEqual(FORBIDDEN_PERSONA_CAPABILITIES.author, pinnedAuthorHandoffForbidden);
for (const [persona, count] of Object.entries(pinnedPersonaCapabilityCounts)) {
  assert.equal(requiredCapabilities[persona].length, count);
}
const additionalForbiddenCapabilities = Object.freeze({ reviewer:Object.freeze(['assess.process.update']) });
const forbiddenCapabilities = Object.freeze(Object.fromEntries(AUTHENTICATED_HOSTED_PERSONAS.map(persona => [
  persona,
  Object.freeze([...(FORBIDDEN_PERSONA_CAPABILITIES[persona] ?? []),
    ...(additionalForbiddenCapabilities[persona] ?? [])]),
])));

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
  const assertScopeMutationRejected = async ({ capability, mutation, sql }) => {
    await db.query('BEGIN');
    try {
      const changed = await db.query(sql, [ids.roles.author, capability]);
      assert.equal(changed.rowCount, 1, `${mutation}:${capability}:mutation must change one capability row`);
      const rejected = await adapter.preflight({ config, exerciseId: ids.exercise });
      assert.equal(rejected.scopeReady, false, `${mutation}:${capability}:scope must fail closed`);
    } finally {
      await db.query('ROLLBACK');
    }
  };
  for (const capability of pinnedAuthorHandoffRequired) {
    await assertScopeMutationRejected({
      capability,
      mutation: 'required_removed',
      sql: 'DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key=$2',
    });
  }
  for (const capability of pinnedAuthorHandoffForbidden) {
    await assertScopeMutationRejected({
      capability,
      mutation: 'forbidden_added',
      sql: 'INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2)',
    });
  }
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
  assert.equal(deploymentCalls.length, 1 + pinnedAuthorHandoffRequired.length + pinnedAuthorHandoffForbidden.length);
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
  } else if (process.env.AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_PROOF === 'true') {
    const actorTransaction=async(actorId,operation)=>{
      await db.query('BEGIN');
      try{
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actorId]);
        await db.query('SET LOCAL ROLE authenticated');
        const result=await operation();
        await db.query('ROLLBACK');
        return result;
      }catch(error){await db.query('ROLLBACK');throw error;}
    };
    await db.query('INSERT INTO auth.sessions(id,user_id) SELECT * FROM unnest($1::uuid[],$2::uuid[])',
      [Object.values(ids.sessions),Object.values(ids.actors)]);
    const reviewerRpcFetch=async(url,init)=>{
      const parsedUrl=new URL(url);
      assert.equal(parsedUrl.pathname,'/rest/v1/rpc/assess_v2_eligible_reviewers');
      assert.equal(init.method,'POST');
      assert.equal(init.headers.authorization,`Bearer ${tokenFor(ids.actors.reviewer,ids.sessions.reviewer)}`);
      const body=JSON.parse(init.body);
      const rows=await actorTransaction(ids.actors.reviewer,async()=>
        (await db.query('SELECT public.assess_v2_eligible_reviewers($1,$2,$3,$4) value',
          [body.p_org_id,body.p_workspace_id,body.p_case_id,body.p_decision_id])).rows.map(row=>row.value));
      return new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}});
    };
    const proofConfig={...config,acceptanceMode:'reviewer_selection_diagnostic',
      supabaseUrl:'http://127.0.0.1:61677',serviceRoleKey:'local-proof-service-role-key-more-than-thirty-two-characters'};
    const proofBindingAdapter=createAuthenticatedHostedPostgresAdapter({config:proofConfig,db:adapterDb,
      fetchImpl:reviewerRpcFetch,verifyDeployment:async()=>{throw new Error('REVIEWER_PROOF_DEPLOYMENT_UNEXPECTED');},
      verifySecretBackend:async()=>{throw new Error('REVIEWER_PROOF_SECRET_UNEXPECTED');}});
    const proofAdapter={...adapter,
      verifyReviewerSelectionCandidates:proofBindingAdapter.verifyReviewerSelectionCandidates,
      verifyReviewerSelectionAction:proofBindingAdapter.verifyReviewerSelectionAction};
    const authorVersion=Number((await db.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [ids.org,ids.actors.author])).rows[0].version);
    const reviewerVersion=Number((await db.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [ids.org,ids.actors.reviewer])).rows[0].version);
    const caseId=randomUUID();
    const createRequest=randomUUID();
    const created=(await serviceQuery('SELECT public.pr1d_create_assess_v2_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
      [ids.actors.author,ids.org,ids.workspace,caseId,project.processId,'Reviewer selection proof','',createRequest,
        `reviewer-proof-create:${caseId}`,authorVersion])).rows[0].value;
    assert.equal(created.outcome,'committed');
    const fixtureModule=loadEnterpriseLifecycleProductionModule(path.join(root,'services','assessV2','fixture.ts'));
    const fixture=structuredClone(fixtureModule.AP_INVOICE_EXCEPTION_V2_FIXTURE);
    const authoring={name:'Reviewer selection proof',description:'Local synthetic reviewer binding.',
      primitives:fixture.primitives,edges:fixture.edges,decisionPoints:fixture.decisionPoints,
      exceptionPaths:fixture.exceptionPaths,assets:fixture.assets,interactions:fixture.interactions,
      evidence:fixture.evidence,agentNecessity:fixture.agentNecessity};
    const draftRequest=randomUUID();
    const saved=(await serviceQuery('SELECT public.pr1d_upsert_assess_v2_draft($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) value',
      [ids.actors.author,ids.org,ids.workspace,caseId,1,JSON.stringify(authoring),draftRequest,
        `reviewer-proof-draft:${caseId}`,authorVersion])).rows[0].value;
    assert.equal(saved.outcome,'committed');
    const tenantAuthority=loadEnterpriseLifecycleProductionModule(
      path.join(root,'supabase','functions','_shared','tenantAuthority.ts'));
    const authorityFor=async(actorId)=>{
      const authority=await tenantAuthority.resolveTenantAuthority(actorId,{organizationId:ids.org,workspaceId:ids.workspace},{
        loadFreshProjection:()=>visibleTenantContext(actorId,ids.org,ids.workspace),
      });
      return {actorId:authority.userId,organizationId:authority.organizationId,workspaceId:authority.workspaceId,
        authorizationVersion:authority.authorizationVersion,capabilities:authority.capabilities};
    };
    const assessCommand=loadEnterpriseLifecycleProductionModule(
      path.join(root,'supabase','functions','_shared','assessV2Command.ts'));
    const assessHandlers=loadEnterpriseLifecycleProductionModule(
      path.join(root,'supabase','functions','_shared','assessV2Handlers.ts'));
    const finalRequest=randomUUID();
    const finalizeEnvelope={requestId:finalRequest,idempotencyKey:`reviewer-proof-finalize:${caseId}`,
      commandType:'assessment_v2.finalize',organizationId:ids.org,workspaceId:ids.workspace,
      authorizationVersion:authorVersion,expectedVersion:2,payload:{caseId}};
    const finalized=await assessHandlers.executeAssessV2Command(
      new Request('http://127.0.0.1/functions/v1/assess-v2-command',{method:'POST'}),finalizeEnvelope,{
        authenticate:async()=>({id:ids.actors.author}),
        loadFreshAuthority:async()=>authorityFor(ids.actors.author),
        loadFrozenV1AssessmentForClone:async()=>null,
        loadLockedCaseForFinalize:async input=>{
          const result=await serviceQuery('SELECT public.pr1d_load_assess_v2_case($1,$2,$3,$4) value',
            [input.caseId,input.organizationId,input.workspaceId,input.expectedVersion]);
          return result.rows[0]?.value??null;
        },
        executeAtomicCommand:async command=>{
          if(!command.serverDecision)throw new assessCommand.AssessV2Error('RESOURCE_NOT_AVAILABLE');
          const d=command.serverDecision;
          const result=await serviceQuery(`SELECT public.pr1d_finalize_assess_v2_case(
            $1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) value`,
          [command.actorId,command.organizationId,command.workspaceId,command.payload.caseId,command.expectedVersion,
            JSON.stringify(d.inputSnapshot),d.inputCanonical,JSON.stringify(d.evidenceSnapshot),d.evidenceCanonical,
            JSON.stringify(d.outputSnapshot),d.outputCanonical,d.inputHash,d.evidenceHash,d.outputHash,d.ruleSetVersion,
            d.decisionVersion,d.createdAt,command.requestId,command.idempotencyKey,command.authorizationVersion]);
          const value=result.rows[0]?.value;
          if(value?.errorCode)throw new assessCommand.AssessV2Error(value.errorCode);
          return value;
        },
      });
    assert.equal(finalized.outcome,'committed');
    const target=(await db.query(`SELECT c.version,d.id decision_id FROM public.assess_v2_cases c
      JOIN public.assess_v2_decision_versions d ON d.case_id=c.id AND d.source_version_id=c.head_version_id
      WHERE c.id=$1`,[caseId])).rows[0];
    assert.equal(Number(target.version),3);
    const seededAt=(await db.query('SELECT statement_timestamp() value')).rows[0].value.toISOString();
    const reviewCommand=loadEnterpriseLifecycleProductionModule(
      path.join(root,'supabase','functions','_shared','assessV2ReviewCommand.ts'));
    const reviewHandlers=loadEnterpriseLifecycleProductionModule(
      path.join(root,'supabase','functions','_shared','assessV2ReviewHandlers.ts'));
    const functions={
      'assessment_v2.review.assign':'pr1e_assign_assess_v2_review',
      'assessment_v2.review.resolve':'pr1e_resolve_assess_v2_review',
    };
    const reviewDependencies={
      authenticate:async()=>({id:ids.actors.reviewer}),
      loadFreshAuthority:async()=>authorityFor(ids.actors.reviewer),
      executeAtomicReviewCommand:async command=>{
        const fn=functions[command.commandType];
        const value=(await serviceQuery(`SELECT public.${fn}($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) value`,
          [command.actorId,command.organizationId,command.workspaceId,command.payload.caseId,
            command.payload.decisionId,command.expectedVersion,command.requestId,command.idempotencyKey,
            command.authorizationVersion,JSON.stringify(command.payload)])).rows[0].value;
        if(value?.errorCode)throw new reviewCommand.AssessV2ReviewError({NOT_FOUND:'RESOURCE_NOT_AVAILABLE',
          AUTHORIZATION_STALE:'AUTHORITY_STALE'}[value.errorCode]??value.errorCode);
        assert.ok(value&&['committed','replayed'].includes(value.outcome)&&value.resource);
        return value;
      },
    };
    const invokeReview=async envelope=>{
      const request=new Request('http://127.0.0.1/functions/v1/assess-v2-command',{method:'POST',
        headers:{authorization:`Bearer ${tokenFor(ids.actors.reviewer,ids.sessions.reviewer)}`,'content-type':'application/json'},
        body:JSON.stringify(envelope)});
      try{
        const result=await reviewHandlers.executeAssessV2ReviewCommand(request,
          reviewCommand.parseAssessV2ReviewEnvelope(envelope),reviewDependencies);
        return {status:200,body:{ok:true,...result}};
      }catch(error){
        const code=error?.code??'COMMAND_UNAVAILABLE';
        const status=['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','AUTHORITY_STALE'].includes(code)?409
          :code==='PERMISSION_DENIED'?403:code==='RESOURCE_NOT_AVAILABLE'?404:400;
        return {status,body:{ok:false,error:{code,message:'The command could not be completed.'}}};
      }
    };
    const controller=new AuthenticatedHostedController({config:proofConfig,adapter:proofAdapter,
      identity:{verifySession:async()=>({actorId:ids.actors.reviewer,sessionId:ids.sessions.reviewer})}});
    controller.exerciseId=ids.exercise;controller.startedAt=seededAt;controller.observationStartedAt=seededAt;
    controller.active=true;controller.projects.set('desktop-chromium',{...project,identities,lastBoundaryAt:seededAt});
    const reviewerToken=tokenFor(ids.actors.reviewer,ids.sessions.reviewer);
    assert.deepEqual(await controller.recordReviewerSelectionCandidates({projectName:'desktop-chromium',accessToken:reviewerToken}),
      {recorded:true,candidateCount:1});
    const assignRequest=randomUUID();
    const assignEnvelope={requestId:assignRequest,idempotencyKey:`reviewer-proof-assign:${caseId}`,
      commandType:'assessment_v2.review.assign',organizationId:ids.org,workspaceId:ids.workspace,
      authorizationVersion:reviewerVersion,expectedVersion:3,
      payload:{caseId,decisionId:target.decision_id,reviewSequence:1,reviewerId:ids.actors.reviewer}};
    const observeAction=async envelope=>{
      const started=await controller.beginBrowserAction({projectName:'desktop-chromium',accessToken:reviewerToken,
        route:'/functions/v1/assess-v2-command',requestBody:envelope});
      const response=await invokeReview(envelope);
      try{
        await controller.finishBrowserAction({projectName:'desktop-chromium',actionId:started.actionId,
          status:response.status,responseBody:response.body});
      }catch(error){
        const shape=(await serviceQuery(`SELECT count(*)::int receipt_count,
            COALESCE(bool_and(status='succeeded'),false) status_succeeded,
            COALESCE(bool_and(jsonb_typeof(response)='object'),false) response_object,
            COALESCE(bool_and(response->>'id'=$6),false) direct_id_matches,
            COALESCE(bool_and(response->'resource'->>'id'=$6),false) nested_id_matches,
            COALESCE(jsonb_agg((SELECT jsonb_agg(key ORDER BY key) FROM jsonb_object_keys(response) key)),'[]'::jsonb) response_keys
          FROM public.assess_command_receipts
          WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3 AND request_id=$4 AND command_type=$5`,
        [ids.org,ids.workspace,ids.actors.reviewer,envelope.requestId,envelope.commandType,envelope.payload.caseId])).rows[0];
        writeFileSync(path.join(privateDirectory,'reviewer-selection-receipt-shape-failure.json'),`${JSON.stringify({
          schemaVersion:'authenticated-reviewer-selection-receipt-shape-failure-v1',status:'FAIL',
          category:error instanceof Error?error.message:'UNKNOWN',shape,
          productStatus:response.status,productOutcome:response.body.outcome,
          requestDistinct:envelope.requestId!==assignEnvelope.requestId,
          idempotencyEqual:envelope.idempotencyKey===assignEnvelope.idempotencyKey,
          databaseDroppedByHarness:false},null,2)}\n`);
        throw error;
      }
      return {actionId:started.actionId,response};
    };
    const assignment=await observeAction(assignEnvelope);
    assert.equal(assignment.response.body.outcome,'committed');
    const replay=await observeAction({...assignEnvelope,requestId:randomUUID()});
    assert.equal(replay.response.body.outcome,'replayed');
    const rejectedReceiptBindings=[];
    const rejectBinding=async(name,overrides)=>{
      await assert.rejects(()=>proofBindingAdapter.verifyReviewerSelectionAction({project:{...project,identities},
        actorId:ids.actors.reviewer,requestBody:{...assignEnvelope,requestId:randomUUID()},
        responseBody:replay.response.body,status:200,...overrides}),
      /AUTHENTICATED_HOSTED_REVIEWER_(?:ACTION_|STALE_WRITE_)/u,name);
      rejectedReceiptBindings.push(name);
    };
    await rejectBinding('changed-payload-reused-key',{requestBody:{...assignEnvelope,requestId:randomUUID(),
      payload:{...assignEnvelope.payload,reviewerId:ids.actors.approver}}});
    await rejectBinding('changed-expected-version',{requestBody:{...assignEnvelope,requestId:randomUUID(),expectedVersion:4}});
    await rejectBinding('wrong-workspace',{requestBody:{...assignEnvelope,requestId:randomUUID(),workspaceId:randomUUID()}});
    await rejectBinding('wrong-actor',{actorId:ids.actors.approver});
    await rejectBinding('wrong-command',{requestBody:{...assignEnvelope,requestId:randomUUID(),commandType:'assessment_v2.review.resolve'}});
    await rejectBinding('missing-receipt',{requestBody:{...assignEnvelope,requestId:randomUUID(),idempotencyKey:'missing-receipt'}});
    await rejectBinding('replay-reuses-origin-request',{requestBody:assignEnvelope});
    await rejectBinding('committed-with-new-request',{responseBody:assignment.response.body});
    await rejectBinding('response-resource-mismatch',{responseBody:{...replay.response.body,
      resource:{...replay.response.body.resource,caseId:randomUUID()}}});
    await rejectBinding('stale-conflict-with-existing-key',{status:409,responseBody:{error:{code:'VERSION_CONFLICT'}}});
    const staleEnvelope={requestId:randomUUID(),idempotencyKey:`reviewer-proof-stale:${caseId}`,
      commandType:'assessment_v2.review.resolve',organizationId:ids.org,workspaceId:ids.workspace,
      authorizationVersion:reviewerVersion,expectedVersion:3,
      payload:{caseId,decisionId:target.decision_id,reviewSequence:1,resolution:'changes_requested',
        rationale:'Reject stale reviewer-ready state.',conditions:[]}};
    const stale=await observeAction(staleEnvelope);
    assert.equal(stale.response.status,409);assert.equal(stale.response.body.error.code,'VERSION_CONFLICT');
    await controller.recordBrowserCase({projectName:'desktop-chromium',actionIds:[assignment.actionId,replay.actionId,stale.actionId],
      row:{testId:'E2E-004',controls:{assertions:AUTHENTICATED_CASE_ASSERTIONS['E2E-004'].map(id=>({id,status:'passed'}))}}});
    await proofAdapter.quiesce({exerciseId:ids.exercise});
    await proofAdapter.cleanup({exerciseId:ids.exercise,projects:[project],sessions:Object.values(ids.sessions)});
    await db.query('DELETE FROM auth.sessions WHERE id=ANY($1::uuid[])',[Object.values(ids.sessions)]);
    await db.query("UPDATE auth.users SET banned_until='infinity'::timestamptz WHERE id=ANY($1::uuid[])",
      [Object.values(ids.actors)]);
    const cleanup=await proofAdapter.verifyCleanup({exerciseId:ids.exercise,actorIds:Object.values(ids.actors),projects:[project]});
    assert.equal(cleanup.activeSessions,0);assert.equal(cleanup.activeIdentities,0);assert.equal(cleanup.activeMemberships,0);
    assert.equal(cleanup.armedPermits,0);assert.equal(cleanup.activeSecretMaterial,0);assert.equal(cleanup.unapprovedActiveResidue,0);
    assert.equal(cleanup.nonExerciseChanged,false);assert.equal(cleanup.immutableHistoryPreserved,true);
    controller.quiesced=true;
    const diagnostic=controller.reviewerSelectionDiagnosticResult();
    const actions=controller.browserCases[0].actions;
    const rawFinalRecords=controller.serverCases[0].after.records;
    const assignmentFrameRecords=controller.reviewerSelectionServerActionFrames[0].after.records;
    const sources=['scripts/authenticatedReviewerSelectionDiagnostic.mjs','scripts/authenticatedHostedController.mjs',
      'scripts/authenticatedHostedControllerAdapters.mjs','scripts/authenticatedHostedEvidence.mjs',
      'scripts/authenticatedHostedObservationAdapter.mjs',
      'scripts/testAuthenticatedHostedControllerPostgres.mjs','scripts/testAuthenticatedReviewerSelectionPostgres.mjs'];
    const sourceDigests=Object.fromEntries(sources.map(relative=>[relative,
      `sha256:${createHash('sha256').update(readFileSync(path.join(root,relative),'utf8').replaceAll('\r\n','\n')).digest('hex')}`]));
    const proof={schemaVersion:'authenticated-reviewer-selection-server-binding-proof-v1',status:'PENDING_DATABASE_TEARDOWN',
      sourceDigests,diagnostic,serverBinding:{
        evidenceSource:'trusted-assignment-action-frame',
        assignmentFrameCaseResourceAnchored:assignmentFrameRecords.some(row=>row.source==='assess_v2_cases'&&row.recordHash
          &&row.commandBindingHash===actions[0].commandBindingHash),
        assignmentFrameAssignmentResourceAnchored:assignmentFrameRecords.some(row=>row.source==='assess_v2_review_assignments'&&row.recordHash
          &&row.commandBindingHash===actions[0].commandBindingHash),
        rawFinalFrameAnchored:rawFinalRecords.some(row=>row.commandBindingHash===actions[0].commandBindingHash),
        composedFinalEvidence:diagnostic.evidenceComposition.kind==='trusted-server-action-frame-carry-forward'
          &&diagnostic.evidenceComposition.carriedRecords===4,
        replayCommandReceiptEqual:actions[0].response.receiptIdHash===actions[1].response.receiptIdHash,
        replayRequestDistinct:actions[0].requestIdHash!==actions[1].requestIdHash,
        replayTransportBindingDistinct:actions[0].commandBindingHash!==actions[1].commandBindingHash,
        staleHasNoReceipt:actions[2].response.receiptIdHash===null,
      },rejectedReceiptBindings,providers:{enabled:false,providerCalls:0,paidCalls:0},cleanup:{scopedCleanupVerified:true,databaseDroppedByHarness:false}};
    assert.equal(proof.serverBinding.evidenceSource,'trusted-assignment-action-frame');
    assert.equal(proof.serverBinding.assignmentFrameCaseResourceAnchored,true);
    assert.equal(proof.serverBinding.assignmentFrameAssignmentResourceAnchored,true);
    assert.equal(proof.serverBinding.rawFinalFrameAnchored,false);
    assert.equal(proof.serverBinding.composedFinalEvidence,true);
    assert.equal(proof.serverBinding.replayCommandReceiptEqual,true);
    assert.equal(proof.serverBinding.replayRequestDistinct,true);
    assert.equal(proof.serverBinding.replayTransportBindingDistinct,true);
    assert.equal(proof.serverBinding.staleHasNoReceipt,true);
    writeFileSync(path.join(privateDirectory,'reviewer-selection-server-binding-proof.json'),`${JSON.stringify(proof,null,2)}\n`);
    console.log(JSON.stringify({schemaVersion:proof.schemaVersion,status:proof.status,
      serverBinding:proof.serverBinding,providers:proof.providers,cleanup:proof.cleanup}));
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
