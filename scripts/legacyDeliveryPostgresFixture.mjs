import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';

const { Client } = pg;
const AUTHORITY_MIGRATION = '20261010025331_legacy_delivery_authority.sql';
const DUPLICATE_SAFE_MIGRATIONS = new Set([
  '20260923133000_pr1e_evidence_claim_operator_binding.sql',
  '20260923142120_pr1e_govern_control_alias_binding.sql',
  '20260923144653_studio_command_authority_capabilities.sql',
  '20260923151115_studio_handoff_receipt_binding.sql',
  '20260923190853_pr_c_deferred_binding_authority.sql',
]);
const id = ordinal => `a2000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;

export const LEGACY_DELIVERY_FIXTURE_VERSION = 'legacy-delivery-postgres-fixture.v1';
export const LEGACY_DELIVERY_FIXTURE_IDS = Object.freeze({
  organization: id(10), workspace: id(11), actor: id(12), assignee: id(13), ownOnly: id(14), denied: id(15),
  role: id(16), ownRole: id(17), project: id(18), process: id(19), assessment: id(20), generation: id(21),
  foreignOrganization: id(30), foreignWorkspace: id(31), foreignProject: id(32), foreignRole: id(33),
});

export function validateLegacyDeliveryDatabaseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL_REJECTED'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || parsed.hostname.toLowerCase() !== '127.0.0.1'
    || decodeURIComponent(parsed.pathname) !== '/avalaos_exhaustive'
    || parsed.search || parsed.hash) throw new Error('LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL_REJECTED');
  return parsed.toString();
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const docker = args => spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
const stopContainer = container => {
  const stopped = docker(['stop', container]);
  if (stopped.status !== 0) throw new Error('LEGACY_DELIVERY_CLEANUP_FAILED:DOCKER_STOP');
};

async function resolveDatabaseUrl(explicit) {
  if (explicit) return { url: validateLegacyDeliveryDatabaseUrl(explicit), container: null };
  if (process.env.CI) throw new Error('LEGACY_DELIVERY_ACCEPTANCE_SETUP_BLOCKED:DATABASE_URL_REQUIRED');
  const container = `avalaos-legacy-delivery-${process.pid}-${Date.now()}`;
  const password = `legacy-${randomUUID()}`;
  const started = docker(['run', '--detach', '--rm', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', 'POSTGRES_DB=avalaos_exhaustive', '-p', '127.0.0.1::5432', 'postgres:16-alpine']);
  if (started.status !== 0) throw new Error(`LEGACY_DELIVERY_ACCEPTANCE_SETUP_BLOCKED:DOCKER_START:${started.stderr.trim()}`);
  const portResult = docker(['port', container, '5432/tcp']);
  if (portResult.status !== 0) {
    stopContainer(container);
    throw new Error('LEGACY_DELIVERY_ACCEPTANCE_SETUP_BLOCKED:DOCKER_PORT');
  }
  const port = portResult.stdout.trim().match(/:(\d+)$/u)?.[1];
  if (!port) {
    stopContainer(container);
    throw new Error('LEGACY_DELIVERY_ACCEPTANCE_SETUP_BLOCKED:DOCKER_PORT');
  }
  const url = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/avalaos_exhaustive`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = new Client({ connectionString: url, connectionTimeoutMillis: 1_000 });
    try { await probe.connect(); await probe.end(); return { url, container }; }
    catch { await probe.end().catch(() => {}); await wait(250); }
  }
  stopContainer(container);
  throw new Error('LEGACY_DELIVERY_ACCEPTANCE_SETUP_BLOCKED:POSTGRES_NOT_READY');
}

const databaseUrl = (url, database) => { const value = new URL(url); value.pathname = `/${database}`; return value.toString(); };
const asRole = async (client, role, operation) => {
  await client.query('BEGIN');
  try { await client.query(`SET LOCAL ROLE ${role}`); const value = await operation(); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
};

async function createRoles(admin) {
  const created = [];
  for (const [name, attributes] of [['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS']]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount) {
      await admin.query(`CREATE ROLE ${name} ${attributes}`); created.push(name);
    }
  }
  return created;
}

async function applyChain(client, throughMigration) {
  await client.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;`);
  const migrations = (await readdir(join('supabase', 'migrations'))).filter(name => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), AUTHORITY_MIGRATION, 'legacy Delivery migration must be current tip');
  const last = migrations.indexOf(throughMigration);
  assert.notEqual(last, -1, `migration not found: ${throughMigration}`);
  for (const name of migrations.slice(0, last + 1)) {
    const sql = (await readFile(join('supabase', 'migrations', name), 'utf8')).replaceAll('\r\n', '\n');
    const apply = async () => {
      await client.query('BEGIN');
      try { await client.query(sql); await client.query('COMMIT'); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    };
    try {
      await applySyntheticAiTerminalJournalMigrationForTest(client, name, apply);
      if (DUPLICATE_SAFE_MIGRATIONS.has(name)) await apply();
    } catch (error) {
      throw new Error(`LEGACY_DELIVERY_MIGRATION_FAILED:${name}:${error.message}`, { cause: error });
    }
  }
}

async function seed(client) {
  const x = LEGACY_DELIVERY_FIXTURE_IDS;
  await client.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4)', [x.actor, x.assignee, x.ownOnly, x.denied]);
  await client.query(`INSERT INTO public.profiles(id,email) VALUES
    ($1,'delivery-actor@example.invalid'),($2,'delivery-assignee@example.invalid'),
    ($3,'delivery-own@example.invalid'),($4,'delivery-denied@example.invalid')`, [x.actor, x.assignee, x.ownOnly, x.denied]);
  await client.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Legacy Delivery fixture','legacy-delivery-fixture'),($2,'Foreign fixture','legacy-delivery-foreign')", [x.organization, x.foreignOrganization]);
  await client.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Delivery workspace','delivery-workspace'),($3,$4,'Foreign workspace','foreign-workspace')", [x.workspace, x.organization, x.foreignWorkspace, x.foreignOrganization]);
  await client.query(`INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES
    ($1,$2,'Delivery authority','delivery-authority','organization','[]'),
    ($3,$2,'Own task authority','own-task-authority','organization','[]'),
    ($4,$5,'Foreign authority','foreign-authority','organization','[]')`, [x.role, x.organization, x.ownRole, x.foreignRole, x.foreignOrganization]);
  for (const capability of ['task.read','task.create','task.update','task.assign','task.delete','backlog.read','backlog.manage','workitems.import','project.manage']) {
    await client.query('INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2)', [x.role, capability]);
  }
  await client.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'task.update.own')", [x.ownRole]);
  await client.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'task.read')", [x.foreignRole]);
  for (const actor of [x.actor, x.assignee]) {
    await client.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')", [x.organization, actor, x.role]);
    await client.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')", [x.organization, x.workspace, actor]);
  }
  await client.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')", [x.organization, x.ownOnly, x.ownRole]);
  await client.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')", [x.organization, x.workspace, x.ownOnly]);
  await client.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')", [x.foreignOrganization, x.denied, x.foreignRole]);
  await client.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')", [x.foreignOrganization, x.foreignWorkspace, x.denied]);
  await client.query("INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by) VALUES($1,$2,$3,'Legacy Delivery',$4,$4,$4),($5,$6,$7,'Foreign',$8,$8,$8)", [x.project, x.organization, x.workspace, x.actor, x.foreignProject, x.foreignOrganization, x.foreignWorkspace, x.denied]);
  await client.query("INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status,created_by,updated_by) VALUES($1,$2,$3,'Source process','Draft',$4,$4)", [x.process, x.organization, x.workspace, x.actor]);
  await client.query("INSERT INTO public.assessments(id,process_id,org_id,workspace_id,status,created_by,updated_by) VALUES($1,$2,$3,$4,'Approved',$5,$5)", [x.assessment, x.process, x.organization, x.workspace, x.actor]);
  const artifacts = { workItems: [
    { type: 'Epic', title: 'Modernize intake', description: 'Grouping only', acceptanceCriteria: [] },
    { type: 'Story', title: 'Capture governed request', description: 'Persist a request.', acceptanceCriteria: ['Actor is authorized'] },
    { type: 'Task', title: 'Publish receipt', description: 'Persist the receipt.', acceptanceCriteria: ['Receipt is immutable'] },
  ] };
  await client.query(`INSERT INTO public.document_generations
    (id,org_id,workspace_id,project_id,template_id,artifacts,status,created_by,updated_by,source_process_id,source_assessment_id)
    VALUES($1,$2,$3,$4,'joined-brd-v4',$5::jsonb,'generated',$6,$6,$7,$8)`,
  [x.generation, x.organization, x.workspace, x.project, JSON.stringify(artifacts), x.actor, x.process, x.assessment]);
  return artifacts;
}

export async function createLegacyDeliveryPostgresFixture(options = {}) {
  const resolved = await resolveDatabaseUrl(options.databaseUrl ?? process.env.LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL);
  const database = `legacy_delivery_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const cleanup = { attempted: false, verified: false };
  let admin; let db; let closed = false; let databaseCreated = false; let createdRoles = [];
  const stopOwnedContainer = () => {
    if (!resolved.container) return;
    stopContainer(resolved.container);
  };
  try {
    admin = new Client({ connectionString: resolved.url, connectionTimeoutMillis: 10_000 });
    await admin.connect();
    createdRoles = await createRoles(admin);
    await admin.query(`CREATE DATABASE ${database}`);
    databaseCreated = true;
    db = new Client({ connectionString: databaseUrl(resolved.url, database), connectionTimeoutMillis: 10_000 });
    await db.connect();
    await applyChain(db, options.throughMigration ?? AUTHORITY_MIGRATION);
    const artifacts = options.seed === false ? null : await seed(db);
    const authorizationVersion = async actor => Number((await db.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [LEGACY_DELIVERY_FIXTURE_IDS.organization, actor],
    )).rows[0]?.version);
    const callCommand = async ({ actor = LEGACY_DELIVERY_FIXTURE_IDS.actor, org = LEGACY_DELIVERY_FIXTURE_IDS.organization,
      workspace = LEGACY_DELIVERY_FIXTURE_IDS.workspace, version, requestId = randomUUID(), key, action, payload }) => {
      const authorityVersion = version ?? await authorizationVersion(actor);
      return (await asRole(db, 'service_role', () => db.query(`SELECT public.legacy_delivery_apply_command(
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb) value`, [actor, org, workspace, authorityVersion, requestId, key, action, JSON.stringify(payload)]))).rows[0].value;
    };
    const callQuery = async ({ actor = LEGACY_DELIVERY_FIXTURE_IDS.actor, org = LEGACY_DELIVERY_FIXTURE_IDS.organization,
      workspace = LEGACY_DELIVERY_FIXTURE_IDS.workspace, version, projectId = LEGACY_DELIVERY_FIXTURE_IDS.project,
      limit = 100, cursor = null, sourceGenerationId = null, includeRetained = true }) => {
      const authorityVersion = version ?? await authorizationVersion(actor);
      return (await asRole(db, 'service_role', () => db.query(`SELECT public.legacy_delivery_query(
        $1,$2,$3,$4,$5,$6,$7,$8,$9) value`, [actor, org, workspace, authorityVersion, projectId, limit, cursor, sourceGenerationId, includeRetained]))).rows[0].value;
    };
    const snapshot = async () => (await db.query(`SELECT
      (SELECT count(*)::int FROM public.delivery_work_items WHERE authority_version IS NOT NULL) tasks,
      (SELECT count(*)::int FROM public.legacy_delivery_imports) imports,
      (SELECT count(*)::int FROM public.legacy_delivery_command_receipts) receipts,
      (SELECT count(*)::int FROM public.privileged_audit_events WHERE action LIKE 'legacy_delivery.%') audits`)).rows[0];
    const close = async () => {
      if (closed) return cleanup.verified; closed = true; cleanup.attempted = true;
      const errors = [];
      await db.end().catch(error => errors.push(error));
      await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
        .then(() => { databaseCreated = false; }).catch(error => errors.push(error));
      let residual = 1;
      try { residual = Number((await admin.query('SELECT count(*) n FROM pg_database WHERE datname=$1', [database])).rows[0].n); }
      catch (error) { errors.push(error); }
      if (residual !== 0) errors.push(new Error('LEGACY_DELIVERY_CLEANUP_FAILED:DATABASE_PRESENT'));
      for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(error => errors.push(error));
      await admin.end().catch(error => errors.push(error));
      try { stopOwnedContainer(); } catch (error) { errors.push(error); }
      cleanup.verified = errors.length === 0 && residual === 0;
      if (!cleanup.verified) throw new AggregateError(errors, 'LEGACY_DELIVERY_CLEANUP_FAILED');
      return true;
    };
    return { version: LEGACY_DELIVERY_FIXTURE_VERSION, ids: LEGACY_DELIVERY_FIXTURE_IDS, artifacts, db,
      authorizationVersion, callCommand, callQuery, snapshot, cleanup, asRole: (role, operation) => asRole(db, role, operation), close };
  } catch (error) {
    cleanup.attempted = true;
    const cleanupErrors = [];
    await db?.end().catch(() => {});
    if (admin) {
      if (databaseCreated) await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).catch(value => cleanupErrors.push(value));
      for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(value => cleanupErrors.push(value));
      await admin.end().catch(value => cleanupErrors.push(value));
    }
    try { stopOwnedContainer(); } catch (value) { cleanupErrors.push(value); }
    cleanup.verified = cleanupErrors.length === 0;
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], 'LEGACY_DELIVERY_SETUP_AND_CLEANUP_FAILED');
    throw error;
  }
}

export const LEGACY_DELIVERY_AUTHORITY_MIGRATION = AUTHORITY_MIGRATION;
