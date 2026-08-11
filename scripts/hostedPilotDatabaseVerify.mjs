import process from 'node:process';
import { readdir } from 'node:fs/promises';
import pg from 'pg';
const { Client } = pg;

const migrationFiles = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter((name) => /^[0-9]{14}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const latestMigration = migrationFiles.at(-1);
if (!latestMigration) throw new Error('HOSTED_PILOT_MIGRATION_INVENTORY_EMPTY');
const expectedMigrationTip = latestMigration.slice(0, 14);

const url = process.env.HOSTED_PILOT_DATABASE_URL;
if (!url) throw new Error('HOSTED_PILOT_DATABASE_URL is required (value is never logged)');
const client = new Client({ connectionString: url, application_name: 'avalaos_hosted_pilot_verify' });
await client.connect();
try {
  const marker = (await client.query(`SELECT product_key,environment_class,migration_tip,production_authorized,
    customer_data_authorized,real_provider_calls_authorized FROM public.hosted_pilot_environment_identity WHERE singleton`)).rows[0];
  if (!marker || marker.product_key !== 'avalaos-core' || marker.environment_class !== 'hosted_nonproduction_pilot'
    || marker.migration_tip !== expectedMigrationTip || marker.production_authorized || marker.customer_data_authorized
    || marker.real_provider_calls_authorized) throw new Error('HOSTED_PILOT_IDENTITY_MISMATCH');
  const names=['hosted_pilot_environment_identity','hosted_pilot_synthetic_subjects','hosted_pilot_provider_simulations'];
  const security=(await client.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
    WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])`,[names])).rows;
  if (security.length!==names.length || security.some(row=>!row.relrowsecurity||!row.relforcerowsecurity)) throw new Error('HOSTED_PILOT_RLS_MISMATCH');
  for (const role of ['anon','authenticated']) {
    for (const name of names) {
      const allowed=(await client.query(`SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed`,[role,`public.${name}`])).rows[0].allowed;
      if (allowed) throw new Error('HOSTED_PILOT_GRANT_MISMATCH');
    }
  }
  process.stdout.write(`${JSON.stringify({status:'passed',migrationTip:marker.migration_tip,forcedRls:true,browserTableAuthority:false,productionAuthorized:false})}\n`);
} finally { await client.end(); }
