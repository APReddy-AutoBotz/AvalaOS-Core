import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';

const {Client} = pg;
export const featureMigration = '20260809120000_pilot_operations_control_plane.sql';
export const migrationNames = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();

export const databaseUrlFor = (adminUrl, database) => {
  assert.match(database, /^[a-z][a-z0-9_]+$/);
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
};

export async function connect(url) {
  const client = new Client({connectionString: url});
  await client.connect();
  return client;
}

export async function ensureClusterRoles(admin) {
  for (const [role, attributes] of [['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS']]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) await admin.query(`CREATE ROLE ${role} ${attributes}`);
  }
}

export async function createDatabase(admin, adminUrl, name) {
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount, 0, `Refusing to overwrite ${name}`);
  await admin.query(`CREATE DATABASE ${name}`);
  return connect(databaseUrlFor(adminUrl, name));
}

export async function bootstrapAuth(client) {
  await client.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
}

export async function applyMigrations(client, names) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS avalaos_migrations;
    CREATE TABLE IF NOT EXISTS avalaos_migrations.applied(
      filename text PRIMARY KEY,
      content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
      release_sha text NOT NULL CHECK(release_sha ~ '^[0-9a-f]{40}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
  for (const name of names) {
    const sql=await readFile(join('supabase/migrations', name), 'utf8');
    const contentSha256=createHash('sha256').update(sql).digest('hex');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(`INSERT INTO avalaos_migrations.applied(filename,content_sha256,release_sha)
        VALUES($1,$2,$3) ON CONFLICT(filename) DO UPDATE SET content_sha256=excluded.content_sha256,
        release_sha=excluded.release_sha`,[name,contentSha256,'0'.repeat(40)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function dropDatabase(admin, name) {
  if (!/^[a-z][a-z0-9_]+$/.test(name)) throw new Error('Unsafe disposable database name.');
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}
