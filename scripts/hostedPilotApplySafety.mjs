import { buildAdditiveMigrationPlan, classifyHostedTarget } from './hostedPilotActivation.mjs';

export function validateLockedTarget({ lockedTarget, preflightClassification, canonical, environmentFingerprint, preflightPlan }) {
  const classification = classifyHostedTarget(lockedTarget.inventory, canonical);
  if (!classification.mutationAllowed
    || lockedTarget.targetFingerprint !== environmentFingerprint
    || classification.inventoryDigest !== preflightClassification.inventoryDigest) throw new Error('DATABASE_CHANGED_SINCE_PREFLIGHT');
  const plan = buildAdditiveMigrationPlan(classification, canonical);
  if (plan.pending.length !== preflightPlan.pending.length
    || lockedTarget.appliedRows.some((row, index) => row.filename !== classification.inventory.appliedMigrations[index]
      || row.content_sha256 !== canonical.migrations[index]?.sha256)) throw new Error('DATABASE_CHANGED_SINCE_PREFLIGHT');
  return Object.freeze({ classification, plan });
}

export async function ensureHostedPgcryptoCompatibility(client) {
  // Catalog identity proof supersedes the former to_regprocedure('public.digest(text,text)') and
  // to_regprocedure('extensions.digest(text,text)') presence-only probes retained in contract history.
  const inspect = () => client.query(`select n.nspname as schema_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    l.lanname as language_name, p.prosrc as source, p.provolatile, p.proisstrict,
    p.proparallel, coalesce(p.proconfig, array[]::text[]) as configuration,
    owner.rolname as owner_name, current_user as current_user_name,
    ext.extname as extension_name, ext_owner.rolname as extension_owner,
    has_function_privilege('public', p.oid, 'execute') as public_execute,
    case when to_regrole('anon') is null then false else has_function_privilege('anon', p.oid, 'execute') end as anon_execute,
    case when to_regrole('authenticated') is null then false else has_function_privilege('authenticated', p.oid, 'execute') end as authenticated_execute,
    case when to_regrole('service_role') is null then false else has_function_privilege('service_role', p.oid, 'execute') end as service_execute
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang
  join pg_roles owner on owner.oid=p.proowner
  left join pg_depend d on d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
  left join pg_extension ext on ext.oid=d.refobjid
  left join pg_roles ext_owner on ext_owner.oid=ext.extowner
  where p.proname='digest' and n.nspname in ('public','extensions')
    and pg_get_function_identity_arguments(p.oid) in ('text, text','bytea, text')
  order by n.nspname, pg_get_function_identity_arguments(p.oid)`);

  const rows = (await inspect()).rows;
  const byKey = new Map(rows.map(row => [`${row.schema_name}:${row.identity_arguments}`, row]));
  if (byKey.size !== rows.length) throw new Error('PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH');
  const pair = schema => ['text, text', 'bytea, text'].map(args => byKey.get(`${schema}:${args}`));
  const publicPair = pair('public');
  const extensionsPair = pair('extensions');
  const publicReady = publicPair.every(Boolean);
  const publicAbsent = publicPair.every(value => !value);
  const extensionsReady = extensionsPair.every(Boolean);
  const extensionsAbsent = extensionsPair.every(value => !value);
  if ((!publicReady && !publicAbsent) || (!extensionsReady && !extensionsAbsent)) throw new Error('PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH');
  if (publicAbsent && extensionsAbsent) return { mode: 'pgcrypto_not_installed_yet' };

  const approvedNative = row => row.extension_name === 'pgcrypto'
    && row.owner_name === row.extension_owner;
  if (extensionsReady && !extensionsPair.every(approvedNative)) throw new Error('PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH');

  let mode = 'supabase_extensions_bridge';
  if (publicReady) {
    const nativePublic = publicPair.every(approvedNative);
    const approvedBridge = publicPair.every(row => row.extension_name == null
      && row.owner_name === row.current_user_name
      && row.language_name === 'sql'
      && row.source.trim().replace(/;$/, '') === 'select extensions.digest($1,$2)'
      && row.provolatile === 'i' && row.proisstrict === true && row.proparallel === 's'
      && row.configuration.length === 1 && row.configuration[0] === 'search_path=pg_catalog, extensions');
    if (!nativePublic && !approvedBridge) throw new Error('PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH');
    mode = nativePublic ? 'public_pgcrypto' : 'supabase_extensions_bridge';
    if (nativePublic && !extensionsAbsent) throw new Error('PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH');
    if (approvedBridge && !extensionsReady) throw new Error('PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH');
  }

  await client.query('begin');
  try {
    if (publicAbsent) await client.query(`create function public.digest(data text, algorithm text)
      returns bytea language sql immutable strict parallel safe
      set search_path=pg_catalog,extensions
      as 'select extensions.digest($1,$2)'`);
    if (publicAbsent) await client.query(`create function public.digest(data bytea, algorithm text)
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
    const verified = (await inspect()).rows.filter(row => row.schema_name === 'public');
    if (verified.length !== 2 || verified.some(row => row.public_execute || row.anon_execute || row.authenticated_execute
      || (serviceRoleExists && !row.service_execute))) throw new Error('PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH');
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
  return { mode };
}
