import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
export const CATALOG_LIMITS = Object.freeze({ schemas: 64, relations: 512, routines: 1024, payloadBytes: 2_000_000, statementTimeoutMs: 15_000 });

const assertBoundedCount = (label, value, ceiling) => {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > ceiling) throw new Error(`HOSTED_TARGET_CATALOG_${label.toUpperCase()}_LIMIT`);
};

export async function inventoryConnectedHostedTarget(client) {
  await client.query(`set statement_timeout = '${CATALOG_LIMITS.statementTimeoutMs}ms'`);
  const { rows: [identity] } = await client.query(`select
    (select system_identifier::text from pg_control_system()) as system_identifier,
    current_database() as database_name,
    current_user as database_role`);
  if (!identity?.system_identifier || !identity?.database_name || !identity?.database_role) {
    throw new Error('HOSTED_TARGET_IDENTITY_UNAVAILABLE');
  }

  const counts = (await client.query(`select
    (select count(*) from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema')::integer schemas,
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname <> 'information_schema' and c.relkind in ('r','p','v','m','S','f'))::integer relations,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%' and n.nspname <> 'information_schema')::integer routines`)).rows[0];
  assertBoundedCount('schemas', counts.schemas, CATALOG_LIMITS.schemas);
  assertBoundedCount('relations', counts.relations, CATALOG_LIMITS.relations);
  assertBoundedCount('routines', counts.routines, CATALOG_LIMITS.routines);
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
      coalesce(array_to_string(p.proacl,','),'') as acl,p.prokind as kind,
      (n.nspname='public' and p.proname='digest' and pg_get_function_identity_arguments(p.oid) in ('text, text','bytea, text')
       and l.lanname='sql' and trim(trailing ';' from btrim(p.prosrc))='select extensions.digest($1,$2)'
       and p.provolatile='i' and p.proisstrict and p.proparallel='s' and owner.rolname=current_user
       and p.proconfig=ARRAY['search_path=pg_catalog, extensions']::text[]
       and not has_function_privilege('PUBLIC',p.oid,'EXECUTE')
       and (to_regrole('anon') is null or not has_function_privilege('anon',p.oid,'EXECUTE'))
       and (to_regrole('authenticated') is null or not has_function_privilege('authenticated',p.oid,'EXECUTE'))) as approved_compatibility
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles owner on owner.oid=p.proowner join pg_language l on l.oid=p.prolang
    where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
    order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`)).rows;
  const authUserCount = Number((await client.query(`select case when to_regclass('auth.users') is null then 0
    else (select count(*)::integer from auth.users) end as count`)).rows[0]?.count ?? 0);
  const ledgerExists = (await client.query(`select to_regclass('avalaos_migrations.applied') is not null as present`)).rows[0]?.present === true;
  const appliedRows = ledgerExists
    ? (await client.query(`select filename,content_sha256 from avalaos_migrations.applied order by filename`)).rows
    : [];

  const payloadBytes = Buffer.byteLength(JSON.stringify({ schemas, tables, routines, appliedRows }));
  if (payloadBytes > CATALOG_LIMITS.payloadBytes) throw new Error('HOSTED_TARGET_CATALOG_PAYLOAD_LIMIT');
  return Object.freeze({
    targetFingerprint: `sha256:${sha256(`${identity.system_identifier}\0${identity.database_name}\0${identity.database_role}`)}`,
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
