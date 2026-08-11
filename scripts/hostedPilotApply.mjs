#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { buildAdditiveMigrationPlan, classifyHostedTarget, loadCanonicalMigrationInventory, verifyPreflightToken } from './hostedPilotActivation.mjs';

const [inventoryPath, tokenPath] = process.argv.slice(2);
const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (value is never logged)`);
  return value;
};

if (!inventoryPath || !tokenPath) throw new Error('usage: node scripts/hostedPilotApply.mjs <sanitized-inventory.json> <private-token-file>');
const expectedReleaseSha = required('HOSTED_PILOT_EXPECTED_RELEASE_SHA');
const actualReleaseSha = required('HOSTED_PILOT_ACTUAL_RELEASE_SHA');
if (expectedReleaseSha !== actualReleaseSha) throw new Error('RELEASE_IDENTITY_MISMATCH');
const environmentFingerprint = required('HOSTED_PILOT_ENVIRONMENT_FINGERPRINT');
const nonce = required('HOSTED_PILOT_PREFLIGHT_NONCE');
const signingKey = required('HOSTED_PILOT_PREFLIGHT_SIGNING_KEY');
const databaseUrl = required('HOSTED_PILOT_DATABASE_URL');
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const token = (await readFile(tokenPath, 'utf8')).trim();
const canonical = await loadCanonicalMigrationInventory();
const classification = classifyHostedTarget(inventory, canonical);
const expected = { expectedReleaseSha, environmentFingerprint, inventoryDigest: classification.inventoryDigest, migrationDigest: canonical.digest, migrationTip: canonical.tip, nonce };
if (!verifyPreflightToken({ token, signingKey, expected })) throw new Error('PREFLIGHT_BINDING_MISMATCH');
const plan = buildAdditiveMigrationPlan(classification, canonical);

export async function ensureHostedPgcryptoCompatibility(client) {
  const { rows: [state] } = await client.query(`select
    to_regprocedure('public.digest(text,text)') is not null as public_text_digest,
    to_regprocedure('public.digest(bytea,text)') is not null as public_bytea_digest,
    to_regprocedure('extensions.digest(text,text)') is not null as extensions_text_digest,
    to_regprocedure('extensions.digest(bytea,text)') is not null as extensions_bytea_digest`);

  const publicReady = state?.public_text_digest === true && state?.public_bytea_digest === true;
  const publicAbsent = state?.public_text_digest === false && state?.public_bytea_digest === false;
  const extensionsReady = state?.extensions_text_digest === true && state?.extensions_bytea_digest === true;
  const extensionsAbsent = state?.extensions_text_digest === false && state?.extensions_bytea_digest === false;

  if (publicReady) return { mode: 'public_pgcrypto' };
  if (publicAbsent && extensionsAbsent) return { mode: 'pgcrypto_not_installed_yet' };
  if (!publicAbsent || !extensionsReady) throw new Error('PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH');

  await client.query(`create or replace function public.digest(data text, algorithm text)
    returns bytea language sql immutable strict parallel safe
    set search_path=pg_catalog,extensions
    as 'select extensions.digest($1,$2)'`);
  await client.query(`create or replace function public.digest(data bytea, algorithm text)
    returns bytea language sql immutable strict parallel safe
    set search_path=pg_catalog,extensions
    as 'select extensions.digest($1,$2)'`);
  await client.query(`revoke all on function public.digest(text,text),public.digest(bytea,text) from public`);
  for (const role of ['anon', 'authenticated']) {
    const exists = (await client.query('select exists(select 1 from pg_roles where rolname=$1) as present', [role])).rows[0]?.present === true;
    if (exists) await client.query(`revoke all on function public.digest(text,text),public.digest(bytea,text) from ${role}`);
  }
  const serviceRoleExists = (await client.query("select exists(select 1 from pg_roles where rolname='service_role') as present")).rows[0]?.present === true;
  if (serviceRoleExists) await client.query(`grant execute on function public.digest(text,text),public.digest(bytea,text) to service_role`);
  return { mode: 'supabase_extensions_bridge' };
}

const client = new pg.Client({ connectionString: databaseUrl, application_name: 'avalaos_hosted_pilot_additive_apply' });
await client.connect();
try {
  await client.query(`select pg_advisory_lock(hashtextextended('avalaos:hosted-pilot:migrations', 0))`);
  await ensureHostedPgcryptoCompatibility(client);
  await client.query(`create schema if not exists avalaos_migrations`);
  await client.query(`create table if not exists avalaos_migrations.applied (
    filename text primary key, content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
    release_sha text not null check (release_sha ~ '^[0-9a-f]{40}$'), applied_at timestamptz not null default clock_timestamp())`);
  const applied = (await client.query(`select filename, content_sha256 from avalaos_migrations.applied order by filename`)).rows;
  if (applied.length !== classification.inventory.appliedMigrations.length || applied.some((row, index) => row.filename !== classification.inventory.appliedMigrations[index] || row.content_sha256 !== canonical.migrations[index]?.sha256)) {
    throw new Error('DATABASE_CHANGED_SINCE_PREFLIGHT');
  }
  for (const migration of plan.pending) {
    const sql = await readFile(new URL(`../supabase/migrations/${migration.name}`, import.meta.url), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query(`insert into avalaos_migrations.applied(filename,content_sha256,release_sha) values ($1,$2,$3)`, [migration.name, migration.sha256, expectedReleaseSha]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
  process.stdout.write(`${JSON.stringify({ status: 'applied', mode: 'additive_only', appliedCount: plan.pending.length, canonicalDigest: canonical.digest, canonicalTip: canonical.tip, productionAuthorized: false })}\n`);
} catch {
  process.stderr.write('HOSTED_PILOT_APPLY_BLOCKED: sanitized failure; retain maintenance/read-only and forward-repair only\n');
  process.exitCode = 1;
} finally {
  await client.query(`select pg_advisory_unlock(hashtextextended('avalaos:hosted-pilot:migrations', 0))`).catch(() => undefined);
  await client.end();
}
