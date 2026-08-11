import process from 'node:process';
import pg from 'pg';
import { writeFile } from 'node:fs/promises';

const { Client } = pg;
const url = process.env.HOSTED_PILOT_DATABASE_URL;
if (!url) throw new Error('HOSTED_PILOT_DATABASE_URL is required (value is never logged)');
const outputPath = process.argv[2];
if (!outputPath) throw new Error('usage: node scripts/hostedPilotDatabasePreflight.mjs <private-sanitized-inventory.json>');
const client = new Client({ connectionString: url, application_name: 'avalaos_hosted_pilot_preflight' });
try {
  await client.connect();
  const schemas = (await client.query(`SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'
    AND nspname NOT IN ('information_schema','extensions','graphql','graphql_public','realtime','storage','auth','vault','supabase_migrations')
    ORDER BY nspname`)).rows.map(row => row.nspname);
  const publicTables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map(row => row.tablename);
  const authUserCount = Number((await client.query(`SELECT count(*)::integer AS count FROM auth.users`)).rows[0]?.count ?? 0);
  const ledgerExists = (await client.query(`SELECT to_regclass('avalaos_migrations.applied') IS NOT NULL AS present`)).rows[0]?.present;
  const appliedMigrations = ledgerExists
    ? (await client.query(`SELECT filename FROM avalaos_migrations.applied ORDER BY filename`)).rows.map(row => row.filename)
    : [];
  const marker = publicTables.includes('hosted_pilot_environment_identity')
    ? (await client.query(`SELECT product_key,environment_class,schema_contract,migration_tip,
        production_authorized,customer_data_authorized,real_provider_calls_authorized
        FROM public.hosted_pilot_environment_identity WHERE singleton`)).rows[0] : null;
  const empty = publicTables.length === 0 && schemas.every(name => name === 'public');
  const compatible = marker?.product_key === 'avalaos-core'
    && marker.environment_class === 'hosted_nonproduction_pilot'
    && marker.production_authorized === false && marker.customer_data_authorized === false
    && marker.real_provider_calls_authorized === false;
  if ((!empty && !compatible) || (empty && authUserCount > 0)) throw new Error('TARGET_REJECTED_FOREIGN_OR_DIRTY_SCHEMA');
  const inventory = { schemas, tables: publicTables.map(name => ({ schema: 'public', name })), appliedMigrations, authUserCount };
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: 'passed', disposition: empty ? 'dedicated_empty' : 'avalaos_compatible', tableCount: publicTables.length, authUserCount, privateInventoryWritten: true })}\n`);
} catch {
  process.stderr.write('HOSTED_PILOT_PREFLIGHT_BLOCKED: sanitized target or connectivity failure\n');
  process.exitCode = 1;
} finally { await client.end().catch(() => undefined); }
