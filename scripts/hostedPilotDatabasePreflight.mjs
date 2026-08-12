import process from 'node:process';
import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import { inventoryConnectedHostedTarget } from './hostedPilotDatabaseInventory.mjs';
import { classifyHostedTarget, loadCanonicalMigrationInventory } from './hostedPilotActivation.mjs';

const { Client } = pg;
const url = process.env.HOSTED_PILOT_DATABASE_URL;
if (!url) throw new Error('HOSTED_PILOT_DATABASE_URL is required (value is never logged)');
const outputPath = process.argv[2];
if (!outputPath) throw new Error('usage: node scripts/hostedPilotDatabasePreflight.mjs <private-sanitized-inventory.json>');
const client = new Client({ connectionString: url, application_name: 'avalaos_hosted_pilot_preflight' });
try {
  await client.connect();
  const { inventory, targetFingerprint } = await inventoryConnectedHostedTarget(client);
  const classification = classifyHostedTarget(inventory, await loadCanonicalMigrationInventory());
  if (!classification.mutationAllowed) throw new Error('TARGET_REJECTED_FOREIGN_OR_DIRTY_SCHEMA');
  const publicTables = inventory.tables.filter(table => table.schema === 'public').map(table => table.name);
  const { schemas, appliedMigrations, authUserCount } = inventory;
  const marker = publicTables.includes('hosted_pilot_environment_identity')
    ? (await client.query(`SELECT product_key,environment_class,schema_contract,migration_tip,
        production_authorized,customer_data_authorized,real_provider_calls_authorized
        FROM public.hosted_pilot_environment_identity WHERE singleton`)).rows[0] : null;
  const empty = publicTables.length === 0 && appliedMigrations.length === 0 && authUserCount === 0;
  const compatible = marker?.product_key === 'avalaos-core'
    && marker.environment_class === 'hosted_nonproduction_pilot'
    && marker.production_authorized === false && marker.customer_data_authorized === false
    && marker.real_provider_calls_authorized === false;
  if ((!empty && !compatible) || (empty && authUserCount > 0)) throw new Error('TARGET_REJECTED_FOREIGN_OR_DIRTY_SCHEMA');
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: 'passed', disposition: empty ? 'dedicated_empty' : 'avalaos_compatible', targetFingerprint, tableCount: publicTables.length, authUserCount, privateInventoryWritten: true })}\n`);
} catch {
  process.stderr.write('HOSTED_PILOT_PREFLIGHT_BLOCKED: sanitized target or connectivity failure\n');
  process.exitCode = 1;
} finally { await client.end().catch(() => undefined); }
