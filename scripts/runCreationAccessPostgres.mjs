import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const runId = randomUUID();
const name = `avalaos-creation-access-${runId}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const report = { schemaVersion: 1, runId, kind: 'disposable-postgresql-16', status: 'running', migrations: [], scenarios: [], cleanup: 'not_started' };
const artifactDir = join(root, 'output/creation-access', `postgres-${runId}`);
await mkdir(artifactDir, { recursive: true });
let containerId;
let admin;
const clients = [];
const sanitize = value => String(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[synthetic-id]').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[local-database]');
const connect = async connectionString => { const c = new pg.Client({ connectionString, connectionTimeoutMillis: 2500 }); await c.connect(); clients.push(c); return c; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const child = (script, env) => new Promise((resolveResult, reject) => {
  const proc = spawn(process.execPath, [script], { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  proc.stdout.on('data', data => { stdout += data; });
  proc.stderr.on('data', data => { stderr += data; });
  const timeout = setTimeout(() => proc.kill(), 180_000);
  proc.once('error', reject);
  proc.once('close', async code => {
    clearTimeout(timeout);
    const output = sanitize(stdout + stderr);
    await writeFile(join(artifactDir, `${script.split('/').at(-1)}.log`), output);
    console.log(output.trim());
    report.scenarios.push({ command: [process.execPath, script], exitCode: code, status: code === 0 ? 'passed' : 'failed', outputSha256: createHash('sha256').update(output).digest('hex') });
    if (code !== 0) reject(new Error(`LOCAL_POSTGRES_SCENARIO_FAILED:${script}`)); else resolveResult();
  });
});

try {
  // Existing local image only. No pull, bind mount, persistent volume, remote DB
  // override, production connection, or pruning is supported by this runner.
  docker('image', 'inspect', 'postgres:16-alpine');
  containerId = docker('run', '-d', '--name', name, '--label', `avalaos.creation-access-run=${runId}`,
    '--pull=never', '--memory=1g', '--memory-swap=1g', '--cpus=1', '--pids-limit=128',
    '--log-opt', 'max-size=1m', '--log-opt', 'max-file=1',
    '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:16-alpine');
  assert.match(containerId, /^[0-9a-f]{64}$/);
  const inspect = JSON.parse(docker('inspect', containerId))[0];
  assert.equal(inspect.Config.Labels['avalaos.creation-access-run'], runId);
  const published = inspect.NetworkSettings.Ports['5432/tcp'];
  assert.equal(published.length, 1); assert.equal(published[0].HostIp, '127.0.0.1');
  const url = new URL(`postgresql://postgres@127.0.0.1:${published[0].HostPort}/postgres`);
  for (let attempt = 0; attempt < 30; attempt++) {
    try { admin = await connect(url.toString()); break; } catch { await wait(1000); }
  }
  if (!admin) throw new Error('LOCAL_POSTGRES_STARTUP_UNCONFIRMED');
  assert.match((await admin.query('SHOW server_version')).rows[0].server_version, /^16\./);
  await admin.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS');
  const migrations = (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql')).sort();
  const split = migrations.indexOf('20260915142940_creation_access_process_authority.sql');
  assert.ok(split > 0);
  const apply = async (db, files) => {
    for (const file of files) {
      const sql = await readFile(join('supabase/migrations', file), 'utf8');
      await db.query('BEGIN');
      try { await db.query(sql); await db.query('COMMIT'); }
      catch (error) { await db.query('ROLLBACK'); console.error(`Migration failed: ${file}; SQLSTATE ${error.code ?? 'unknown'}`); throw error; }
      if (!report.migrations.some(row => row.path === file)) report.migrations.push({ path: file, sha256: createHash('sha256').update(sql).digest('hex') });
    }
  };
  const createDb = async suffix => {
    const dbName = `avalaos_creation_access_${suffix}`;
    await admin.query(`CREATE DATABASE ${dbName}`);
    const dbUrl = new URL(url); dbUrl.pathname = `/${dbName}`;
    const db = await connect(dbUrl.toString());
    await db.query(`CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb NOT NULL DEFAULT '{}',banned_until timestamptz,email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    return { db, dbUrl };
  };
  const processDb = await createDb('process');
  await apply(processDb.db, migrations);
  console.log(`Fresh PostgreSQL 16 migration chain applied: ${migrations.length} migrations.`);
  await child('scripts/testProcessCreationPostgres.mjs', { PROCESS_CREATION_DISPOSABLE_DATABASE_URL: processDb.dbUrl.toString() });
  const adminDb = await createDb('admin');
  await apply(adminDb.db, migrations);
  await child('scripts/testSyntheticAdminPostgres.mjs', { SYNTHETIC_ADMIN_DISPOSABLE_DATABASE_URL: adminDb.dbUrl.toString() });

  const upgrade = await createDb('upgrade');
  await apply(upgrade.db, migrations.slice(0, split));
  const ids = Array.from({ length: 4 }, () => randomUUID());
  await upgrade.db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [ids[0], 'retained@example.invalid']);
  await upgrade.db.query('INSERT INTO profiles(id,email) VALUES($1,$2)', [ids[0], 'retained@example.invalid']);
  await upgrade.db.query('INSERT INTO organizations(id,name,slug) VALUES($1,$2,$3)', [ids[1], 'Retained synthetic organization', 'retained-synthetic']);
  await upgrade.db.query('INSERT INTO workspaces(id,org_id,name,slug) VALUES($1,$2,$3,$4)', [ids[2], ids[1], 'Retained workspace', 'retained']);
  await upgrade.db.query(`INSERT INTO assess_processes(id,org_id,workspace_id,owner_id,name,description,department,criticality,status)
    VALUES($1,$2,$3,$4,'Retained process','Unchanged','Synthetic','Medium','Not Started')`, [ids[3], ids[1], ids[2], ids[0]]);
  const retained = async () => (await upgrade.db.query('SELECT id,org_id,workspace_id,owner_id,name,description,department,criticality,status FROM assess_processes WHERE id=$1', [ids[3]])).rows[0];
  const before = await retained();
  const forwardName = '20260916003000_creation_access_migration_identity_convergence.sql';
  assert.equal(migrations.at(-1), forwardName);
  const forwardSql = await readFile(join('supabase/migrations', forwardName), 'utf8');
  const rejectIdentityPrecondition = async mutation => {
    await upgrade.db.query('BEGIN');
    try {
      if (mutation) await mutation();
      await assert.rejects(upgrade.db.query(forwardSql), /CREATION_ACCESS_IDENTITY_PRECONDITION_FAILED/);
    } finally { await upgrade.db.query('ROLLBACK'); }
    assert.equal((await upgrade.db.query('SELECT migration_tip FROM hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip, '20260904120000');
  };
  await rejectIdentityPrecondition(); // The old frozen target has no predecessor tables.
  await apply(upgrade.db, migrations.slice(split, -1));
  await rejectIdentityPrecondition(() => upgrade.db.query('DELETE FROM hosted_pilot_environment_identity'));
  await rejectIdentityPrecondition(async () => {
    await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check');
    await upgrade.db.query("UPDATE hosted_pilot_environment_identity SET migration_tip='99999999999999'");
  });
  report.scenarios.push({ scenario: 'forward-identity-preconditions-rollback-without-marker-change', status: 'passed', assertions: 6 });
  await apply(upgrade.db, [forwardName]);
  assert.deepEqual(await retained(), before);
  assert.equal((await upgrade.db.query('SELECT count(*)::int AS n FROM synthetic_admin_targets')).rows[0].n, 0);
  assert.equal((await upgrade.db.query('SELECT count(*)::int AS n FROM process_creation_workspace_controls')).rows[0].n, 0);
  report.scenarios.push({ scenario: 'populated-upgrade-preserves-process-and-default-off-targets', status: 'passed', assertions: 3 });
  console.log('Populated upgrade: 3 assertions passed; retained process unchanged and new controls remain unconfigured.');
  // The retained operational identity must follow the same final migration
  // ledger on both fresh and accepted-baseline upgrades, including stale/ahead
  // marker denial. Running only the new feature RPCs misses this dependency.
  await child('scripts/testPilotOperationsPostgres.mjs', { PILOT_OPERATIONS_DATABASE_URL: url.toString() });
  // Retained PR C assertions apply the complete chain too. Running them here
  // catches stale fresh-tip assumptions before the exact-head CI evidence run.
  await child('scripts/testTranscriptFlowPrCPostgres.mjs', { TRANSCRIPT_FLOW_PR_C_MIGRATION_DATABASE_URL: url.toString() });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failureCode = /^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'LOCAL_POSTGRES_CHECK_FAILED';
  console.error(`Creation-access PostgreSQL failed: ${report.failureCode}`);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(client => client.end().catch(() => undefined)));
  if (containerId) {
    try {
      const inspect = JSON.parse(docker('inspect', containerId))[0];
      assert.equal(inspect.Id, containerId);
      assert.equal(inspect.Name, `/${name}`);
      assert.equal(inspect.Config.Labels['avalaos.creation-access-run'], runId);
      docker('rm', '-f', containerId);
      report.cleanup = 'verified_owned_container_removed';
      console.log('Removed only this run’s disposable synthetic PostgreSQL container and its memory-backed databases.');
    } catch { report.cleanup = 'unconfirmed'; report.status = 'failed'; process.exitCode = 1; }
  } else report.cleanup = 'no_container_created';
  await writeFile(join(artifactDir, 'result.json'), JSON.stringify(report, null, 2) + '\n');
}
