import { createHash } from 'node:crypto';

export const ROUTINE_CONTRACT_PATH = 'scripts/hostedPilotRoutineContract.json';
const hash = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => compare(a, b))) : item);

// Bodies are used only in memory to fingerprint the installed implementation.
// Neither inventory nor the source-derived contract contains routine bodies.
export function fingerprintRoutine(row) {
  if (!row.authority_metadata) return undefined;
  const { source, binary, ...metadata } = row.authority_metadata;
  return {
    owner: row.owner,
    implementationSha256: hash(stable({ ...metadata, source: source?.replaceAll('\r\n', '\n'), binary })),
    acl: [...row.authority_acl].sort((a, b) => compare(stable(a), stable(b))),
    effective: row.authority_effective,
  };
}

export function routineCatalog(routines) {
  const result = {};
  for (const row of routines) {
    if (row.schema !== 'public' || row.extension_name || row.approved_compatibility === true) continue;
    if (typeof row.argument_types !== 'string' || !row.authority) throw new Error('ROUTINE_CONTRACT_METADATA_MISSING');
    const identity = `${row.schema}.${row.name}(${row.argument_types.replaceAll('public.', '')})`;
    if (Object.hasOwn(result, identity)) throw new Error('ROUTINE_CONTRACT_IDENTITY_DUPLICATE');
    result[identity] = row.authority;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => compare(a, b)));
}

export function parseRoutineContract(bytes, migrations) {
  if (!bytes) return undefined;
  if (Buffer.byteLength(bytes) > 4_000_000) throw new Error('ROUTINE_CONTRACT_SIZE_REJECTED');
  const value = JSON.parse(bytes.toString());
  if (value.schemaVersion !== 1 || value.runtimeMigrationTip !== '20261103170103'
    || !Array.isArray(value.checkpoints) || !value.checkpoints.length || value.checkpoints.length > 4) {
    throw new Error('ROUTINE_CONTRACT_SCHEMA_REJECTED');
  }
  const lengths = new Set();
  for (const checkpoint of value.checkpoints) {
    const names = checkpoint.migrationNames, hashes = checkpoint.migrationHashes;
    if (!Array.isArray(names) || !names.length || !Array.isArray(hashes) || hashes.length !== names.length
      || lengths.has(names.length) || names.some((name, i) => name !== migrations[i]?.name || hashes[i] !== migrations[i]?.sha256)
      || Object.keys(checkpoint.profiles ?? {}).sort().join(',') !== 'standard,supabase') {
      throw new Error('ROUTINE_CONTRACT_MIGRATION_BINDING_REJECTED');
    }
    lengths.add(names.length);
    for (const catalog of Object.values(checkpoint.profiles)) {
      if (!catalog || Array.isArray(catalog) || !Object.keys(catalog).length || Object.keys(catalog).length > 1024) throw new Error('ROUTINE_CONTRACT_CATALOG_REJECTED');
      for (const [identity, record] of Object.entries(catalog)) {
        if (!/^public\.[a-z0-9_]+\([a-z0-9_ ,.[\]"]*\)$/.test(identity)
          || record.owner !== 'postgres' || !/^[0-9a-f]{64}$/.test(record.implementationSha256)
          || !Array.isArray(record.acl) || !record.acl.length || !record.effective) throw new Error('ROUTINE_CONTRACT_RECORD_REJECTED');
        for (const acl of record.acl) if (!acl || !/^(?:PUBLIC|[a-z_][a-z0-9_]*)$/.test(acl.grantee)
          || acl.grantor !== 'postgres' || acl.privilege !== 'EXECUTE' || typeof acl.grantable !== 'boolean') throw new Error('ROUTINE_CONTRACT_ACL_REJECTED');
      }
    }
  }
  if (!lengths.has(migrations.length)) throw new Error('ROUTINE_CONTRACT_TIP_REJECTED');
  return Object.freeze({ ...value, digest: hash(bytes) });
}

export function matchRoutineContract(raw, canonical) {
  const checkpoint = canonical.routineContract?.checkpoints.find(item => item.migrationNames.length === raw.appliedMigrations?.length);
  if (!checkpoint) return null; // Existing strict rules remain for unrecorded prefixes.
  if (raw.appliedMigrations.some((name, i) => name !== checkpoint.migrationNames[i])) return false;
  let actual;
  try { actual = stable(routineCatalog(raw.routines ?? [])); } catch { return false; }
  return Object.entries(checkpoint.profiles).find(([, catalog]) => stable(catalog) === actual)?.[0] ?? false;
}
