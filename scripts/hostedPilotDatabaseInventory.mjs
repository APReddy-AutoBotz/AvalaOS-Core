import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function inventoryConnectedHostedTarget(client) {
  const { rows: [identity] } = await client.query(`select
    (select system_identifier::text from pg_control_system()) as system_identifier,
    current_database() as database_name,
    current_user as database_role`);
  if (!identity?.system_identifier || !identity?.database_name || !identity?.database_role) {
    throw new Error('HOSTED_TARGET_IDENTITY_UNAVAILABLE');
  }

  const schemas = (await client.query(`select nspname from pg_namespace
    where nspname not like 'pg_%' and nspname <> 'information_schema'
    order by nspname`)).rows.map(row => row.nspname);
  const tables = (await client.query(`select schemaname as schema, tablename as name from pg_tables
    where schemaname not like 'pg_%' and schemaname <> 'information_schema'
    order by schemaname,tablename`)).rows;
  const authUserCount = Number((await client.query(`select case when to_regclass('auth.users') is null then 0
    else (select count(*)::integer from auth.users) end as count`)).rows[0]?.count ?? 0);
  const ledgerExists = (await client.query(`select to_regclass('avalaos_migrations.applied') is not null as present`)).rows[0]?.present === true;
  const appliedRows = ledgerExists
    ? (await client.query(`select filename,content_sha256 from avalaos_migrations.applied order by filename`)).rows
    : [];

  return Object.freeze({
    targetFingerprint: sha256(`${identity.system_identifier}\0${identity.database_name}\0${identity.database_role}`),
    inventory: {
      schemas,
      tables,
      appliedMigrations: appliedRows.map(row => row.filename),
      authUserCount,
    },
    appliedRows,
  });
}
