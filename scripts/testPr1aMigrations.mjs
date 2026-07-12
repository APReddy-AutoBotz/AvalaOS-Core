import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const adminConnection = process.env.PR1A_MIGRATION_DATABASE_URL;
if (!adminConnection) {
  console.error('PR1A_MIGRATION_DATABASE_URL is required for the isolated migration harness.');
  process.exit(1);
}

const databaseNames = {
  fresh: 'avalaos_pr1a_fresh_test',
  upgrade: 'avalaos_pr1a_upgrade_test',
  dirty: 'avalaos_pr1a_dirty_test',
};
const createdDatabases = [];
const createdRoles = [];

const databaseConnection = databaseName => {
  const value = new URL(adminConnection);
  value.pathname = `/${databaseName}`;
  return value.toString();
};

const connect = async connectionString => {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
};

const migrationsDir = 'supabase/migrations';
const migrationNames = fs.readdirSync(migrationsDir)
  .filter(name => name.endsWith('.sql'))
  .sort();
const pr1aMigration = '20260710120000_pr1a_required_ai_audit.sql';
const baselineMigrations = migrationNames.filter(name => name !== pr1aMigration);
const legacyFixture = fs.readFileSync(
  'supabase/tests/migration-harness/pr1a_legacy_ai_audit_fixture.sql',
  'utf8',
);

const runSql = async (client, label, sql) => {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`Applied ${label}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

const applyMigrations = async (client, names) => {
  for (const name of names) {
    await runSql(client, name, fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
  }
};

const ensureSupabaseRoles = async admin => {
  for (const role of ['anon', 'authenticated']) {
    assert.match(role, /^[a-z_]+$/);
    const existing = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE ROLE ${role} NOLOGIN`);
      createdRoles.push(role);
    }
  }
};

const bootstrapSupabaseAuthority = async client => runSql(client, 'Supabase auth bootstrap', `
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
`);

const seedPopulatedLegacyAudit = async client => {
  const actorId = '66666666-6666-4666-8666-666666666666';
  const orgId = '77777777-7777-4777-8777-777777777777';
  await client.query('INSERT INTO auth.users (id) VALUES ($1)', [actorId]);
  await client.query(`INSERT INTO public.profiles (id, email) VALUES ($1, 'legacy-populated@example.invalid')`, [actorId]);
  await client.query(`INSERT INTO public.organizations (id, name, slug) VALUES ($1, 'Legacy Populated', 'legacy-populated')`, [orgId]);
  const job = await client.query(`INSERT INTO public.ai_generation_jobs (org_id, user_id, job_type, status, input_refs, output_ref, started_at) VALUES ($1, $2, 'generate_document', 'running', '{}'::jsonb, '{}'::jsonb, NOW()) RETURNING id`, [orgId, actorId]);
  await client.query(`INSERT INTO public.ai_usage_events (org_id, user_id, job_id, provider, input_tokens, output_tokens, total_tokens, metadata) VALUES ($1, $2, $3, 'test', 1, 2, 3, '{}'::jsonb)`, [orgId, actorId, job.rows[0].id]);
};
const assertPr1aSchema = async client => {
  const relationResult = await client.query(`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE oid IN ('public.ai_generation_jobs'::regclass, 'public.ai_usage_events'::regclass)
    ORDER BY relname
  `);
  assert.deepEqual(relationResult.rows, [
    { relname: 'ai_generation_jobs', relrowsecurity: true, relforcerowsecurity: true },
    { relname: 'ai_usage_events', relrowsecurity: true, relforcerowsecurity: true },
  ]);

  const policyResult = await client.query(`
    SELECT count(*)::int AS count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('ai_generation_jobs', 'ai_usage_events')
  `);
  assert.equal(policyResult.rows[0].count, 0);

  const constraintResult = await client.query(`
    SELECT conname, convalidated
    FROM pg_constraint
    WHERE conrelid IN ('public.ai_generation_jobs'::regclass, 'public.ai_usage_events'::regclass)
      AND conname LIKE 'pr1a_%'
    ORDER BY conname
  `);
  assert.equal(constraintResult.rows.length, 8);
  assert.equal(constraintResult.rows.every(row => row.convalidated), true);

  const triggerResult = await client.query(`
    SELECT count(*)::int AS count
    FROM pg_trigger
    WHERE tgrelid = 'public.ai_generation_jobs'::regclass
      AND tgname = 'trg_pr1a_ai_generation_jobs_transition'
      AND NOT tgisinternal
  `);
  assert.equal(triggerResult.rows[0].count, 1);

  const actorId = '11111111-1111-4111-8111-111111111111';
  const orgId = '22222222-2222-4222-8222-222222222222';
  await client.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [actorId]);
  await client.query(
    `INSERT INTO public.profiles (id, email) VALUES ($1, 'migration-test@example.invalid') ON CONFLICT DO NOTHING`,
    [actorId],
  );
  await client.query(
    `INSERT INTO public.organizations (id, name, slug) VALUES ($1, 'Migration Test', 'migration-test') ON CONFLICT DO NOTHING`,
    [orgId],
  );
  const jobResult = await client.query(`
    INSERT INTO public.ai_generation_jobs (
      org_id, user_id, job_type, status, input_refs, output_ref, started_at
    ) VALUES ($1, $2, 'export_document', 'running', '{}'::jsonb, '{}'::jsonb, NOW())
    RETURNING id
  `, [orgId, actorId]);
  const jobId = jobResult.rows[0].id;
  await client.query(`
    UPDATE public.ai_generation_jobs
    SET status = 'succeeded', completed_at = NOW(), output_ref = '{"artifact":"recorded"}'::jsonb
    WHERE id = $1
  `, [jobId]);

  await assert.rejects(
    client.query(`UPDATE public.ai_generation_jobs SET status = 'running', completed_at = NULL WHERE id = $1`, [jobId]),
    /Terminal AI audit jobs are immutable/,
  );
  await assert.rejects(
    client.query(`
      INSERT INTO public.ai_usage_events (
        org_id, user_id, provider, input_tokens, output_tokens, total_tokens
      ) VALUES ($1, $2, 'test', -1, 0, 0)
    `, [orgId, actorId]),
    /pr1a_ai_usage_events_required_check/,
  );

  await assert.rejects(
    client.query(`UPDATE public.ai_generation_jobs SET output_ref = '{"artifact":"tampered"}'::jsonb WHERE id = $1`, [jobId]),
    /Terminal AI audit jobs are immutable/,
  );
  const duplicateCompletion = await client.query(`UPDATE public.ai_generation_jobs SET status = 'succeeded', completed_at = NOW() WHERE id = $1 AND status = 'running' RETURNING id`, [jobId]);
  assert.equal(duplicateCompletion.rowCount, 0);
  await assert.rejects(
    client.query(`INSERT INTO public.ai_usage_events (org_id, user_id, job_id, provider, input_tokens, output_tokens, total_tokens) VALUES ($1, $2, $3, 'test', 2, 3, 4)`, [orgId, actorId, jobId]),
    /pr1a_ai_usage_events_required_check/,
  );
  const usage = await client.query(`INSERT INTO public.ai_usage_events (org_id, user_id, job_id, provider, input_tokens, output_tokens, total_tokens) VALUES ($1, $2, $3, 'test', 2, 3, 5) RETURNING id`, [orgId, actorId, jobId]);
  await assert.rejects(
    client.query(`UPDATE public.ai_usage_events SET total_tokens = 6 WHERE id = $1`, [usage.rows[0].id]),
    /AI usage audit events are immutable/,
  );
  await assert.rejects(
    client.query(`UPDATE public.ai_generation_jobs SET output_ref = output_ref WHERE id = $1`, [jobId]),
    /Terminal AI audit jobs are immutable/,
  );
  await assert.rejects(client.query(`DELETE FROM public.ai_generation_jobs WHERE id = $1`, [jobId]), /cannot be deleted/);
  await assert.rejects(client.query(`DELETE FROM public.ai_usage_events WHERE id = $1`, [usage.rows[0].id]), /AI usage audit events are immutable/);

  const queuedJob = await client.query(`INSERT INTO public.ai_generation_jobs (org_id, user_id, job_type, status, input_refs, output_ref) VALUES ($1, $2, 'generate_document', 'queued', '{}'::jsonb, '{}'::jsonb) RETURNING id`, [orgId, actorId]);
  await assert.rejects(client.query(`DELETE FROM public.ai_generation_jobs WHERE id = $1`, [queuedJob.rows[0].id]), /cannot be deleted/);
  const runningJob = await client.query(`INSERT INTO public.ai_generation_jobs (org_id, user_id, job_type, status, input_refs, output_ref, started_at) VALUES ($1, $2, 'generate_document', 'running', '{}'::jsonb, '{}'::jsonb, NOW()) RETURNING id`, [orgId, actorId]);
  await assert.rejects(client.query(`DELETE FROM public.ai_generation_jobs WHERE id = $1`, [runningJob.rows[0].id]), /cannot be deleted/);
  await client.query(`UPDATE public.ai_generation_jobs SET status = 'failed', completed_at = NOW(), error_message = 'sanitized failure' WHERE id = $1`, [runningJob.rows[0].id]);

  for (const role of ['anon', 'authenticated']) {
    assert.match(role, /^[a-z_]+$/);
    await client.query(`SET ROLE ${role}`);
    try {
      for (const operation of [
        `SELECT * FROM public.ai_generation_jobs`,
        `INSERT INTO public.ai_generation_jobs DEFAULT VALUES`,
        `UPDATE public.ai_generation_jobs SET status = 'queued'`,
        `DELETE FROM public.ai_generation_jobs`,
        `SELECT * FROM public.ai_usage_events`,
        `INSERT INTO public.ai_usage_events DEFAULT VALUES`,
        `UPDATE public.ai_usage_events SET total_tokens = 0`,
        `DELETE FROM public.ai_usage_events`,
      ]) await assert.rejects(client.query(operation), /permission denied/);
    } finally {
      await client.query('RESET ROLE');
    }
  }
  const otherActorId = '33333333-3333-4333-8333-333333333333';
  const otherOrgId = '44444444-4444-4444-8444-444444444444';
  await client.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [otherActorId]);
  await client.query(`INSERT INTO public.profiles (id, email) VALUES ($1, 'migration-other@example.invalid') ON CONFLICT DO NOTHING`, [otherActorId]);
  await client.query(`INSERT INTO public.organizations (id, name, slug) VALUES ($1, 'Migration Other', 'migration-other') ON CONFLICT DO NOTHING`, [otherOrgId]);
  await assert.rejects(
    client.query(`INSERT INTO public.ai_usage_events (org_id, user_id, job_id, provider, input_tokens, output_tokens, total_tokens) VALUES ($1, $2, $3, 'test', 0, 0, 0)`, [otherOrgId, otherActorId, jobId]),
    /pr1a_ai_usage_events_job_authority_fkey/,
  );
};

const createDatabase = async (admin, databaseName) => {
  assert.match(databaseName, /^[a-z0-9_]+$/);
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  assert.equal(existing.rowCount, 0, `Refusing to replace existing database ${databaseName}.`);
  await admin.query(`CREATE DATABASE ${databaseName} TEMPLATE template0`);
  createdDatabases.push(databaseName);
};

const dropCreatedDatabases = async admin => {
  for (const databaseName of createdDatabases.reverse()) {
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  }
};

const dropCreatedRoles = async admin => {
  for (const role of createdRoles.reverse()) {
    assert.match(role, /^[a-z_]+$/);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
};

const main = async () => {
  const admin = await connect(adminConnection);
  try {
    await ensureSupabaseRoles(admin);
    await createDatabase(admin, databaseNames.fresh);
    await createDatabase(admin, databaseNames.upgrade);
    await createDatabase(admin, databaseNames.dirty);

    const fresh = await connect(databaseConnection(databaseNames.fresh));
    try {
      await bootstrapSupabaseAuthority(fresh);
      await applyMigrations(fresh, migrationNames);
      await applyMigrations(fresh, [pr1aMigration]);
      await assertPr1aSchema(fresh);
      console.log('Fresh canonical migration scenario passed.');
    } finally {
      await fresh.end();
    }

    const dirty = await connect(databaseConnection(databaseNames.dirty));
    try {
      await bootstrapSupabaseAuthority(dirty);
      await applyMigrations(dirty, baselineMigrations);
      await runSql(dirty, 'legacy AI audit fixture', legacyFixture);
      const dirtyOrgId = '55555555-5555-4555-8555-555555555555';
      await dirty.query(`INSERT INTO public.organizations (id, name, slug) VALUES ($1, 'Dirty Migration', 'dirty-migration')`, [dirtyOrgId]);
      await dirty.query(`INSERT INTO public.ai_generation_jobs (org_id, user_id, job_type, status) VALUES ($1, NULL, 'other', 'queued')`, [dirtyOrgId]);
      await assert.rejects(applyMigrations(dirty, [pr1aMigration]), /PR1A_PREFLIGHT_AI_JOBS_REQUIRED_FIELDS/);
      console.log('Dirty legacy-data preflight failure scenario passed without inventing authority.');
    } finally {
      await dirty.end();
    }
    const upgrade = await connect(databaseConnection(databaseNames.upgrade));
    try {
      await bootstrapSupabaseAuthority(upgrade);
      await applyMigrations(upgrade, baselineMigrations);
      await runSql(upgrade, 'legacy AI audit fixture', legacyFixture);
      await seedPopulatedLegacyAudit(upgrade);
      await applyMigrations(upgrade, [pr1aMigration]);
      await applyMigrations(upgrade, [pr1aMigration]);
      await assertPr1aSchema(upgrade);
      console.log('Supported legacy-upgrade migration scenario passed.');
    } finally {
      await upgrade.end();
    }
  } finally {
    try {
      await dropCreatedDatabases(admin);
    } finally {
      try {
        await dropCreatedRoles(admin);
      } finally {
        await admin.end();
      }
    }
  }

  console.log('PR 1A isolated fresh, idempotency, upgrade, RLS, and failure migration checks passed.');
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
