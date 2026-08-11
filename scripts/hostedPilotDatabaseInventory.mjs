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
  const tables = (await client.query(`select n.nspname as schema,c.relname as name,c.relkind as kind,
      owner.rolname as owner,coalesce(array_to_string(c.relacl,','),'') as acl
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles owner on owner.oid=c.relowner
    where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
      and c.relkind in ('r','p','v','m','S','f') order by n.nspname,c.relkind,c.relname`)).rows;
  const routines = (await client.query(`select n.nspname as schema,p.proname as name,
      pg_get_function_identity_arguments(p.oid) as arguments,owner.rolname as owner,
      coalesce(array_to_string(p.proacl,','),'') as acl,p.prokind as kind
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles owner on owner.oid=p.proowner
    where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
    order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`)).rows;
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
      routines,
      appliedMigrations: appliedRows.map(row => row.filename),
      authUserCount,
    },
    appliedRows,
  });
}
