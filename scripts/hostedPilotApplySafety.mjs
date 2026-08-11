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

  await client.query('begin');
  try {
    await client.query(`create function public.digest(data text, algorithm text)
      returns bytea language sql immutable strict parallel safe
      set search_path=pg_catalog,extensions
      as 'select extensions.digest($1,$2)'`);
    await client.query(`create function public.digest(data bytea, algorithm text)
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
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
  return { mode: 'supabase_extensions_bridge' };
}
