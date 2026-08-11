import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+\.sql$/;
const SAFE_SCHEMAS = new Set(['auth', 'avalaos_migrations', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'pg_catalog', 'pgsodium', 'pgsodium_masks', 'public', 'realtime', 'storage', 'supabase_migrations', 'vault']);
const FOREIGN_MARKERS = /^(career_context_|clearspeak_|interview_)|^(resume_reviews|usage_ledger)$/;
const IDENTIFIER = /^[a-z_][a-z0-9_$]*$/;

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const normalized = value => [...new Set(value)].sort();

export async function loadCanonicalMigrationInventory(root = process.cwd()) {
  const directory = path.join(root, 'supabase', 'migrations');
  const names = (await readdir(directory)).filter(name => MIGRATION_NAME.test(name)).sort();
  if (!names.length) throw new Error('canonical migration chain is empty');
  const migrations = [];
  for (const name of names) {
    const sql = (await readFile(path.join(directory, name), 'utf8')).replace(/\r\n/g, '\n');
    migrations.push({ name, sha256: sha256(sql), bytes: Buffer.byteLength(sql), creates: extractCreatedRelations(sql), routines: extractCreatedRoutines(sql) });
  }
  return Object.freeze({
    algorithm: 'sha256',
    count: migrations.length,
    tip: names.at(-1),
    digest: sha256(migrations.map(({ name, sha256: digest }) => `${name}\0${digest}\n`).join('')),
    migrations,
  });
}

export function extractCreatedRelations(sql) {
  const relations = [];
  const expression = /create\s+(?:or\s+replace\s+)?(?:unlogged\s+)?(table|view|materialized\s+view|sequence|foreign\s+table)\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z_][a-z0-9_$]*)"?\.)?"?([a-z_][a-z0-9_$]*)"?/gi;
  for (const match of sql.matchAll(expression)) relations.push(`${match[2] ?? 'public'}.${match[3]}:${match[1].replace(/\s+/g, '_').toLowerCase()}`);
  return normalized(relations);
}

export function extractCreatedRoutines(sql) {
  const routines = [];
  const expression = /create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+(?:"?([a-z_][a-z0-9_$]*)"?\.)?"?([a-z_][a-z0-9_$]*)"?\s*\(([^)]*)\)/gi;
  for (const match of sql.matchAll(expression)) routines.push(`${match[1] ?? 'public'}.${match[2]}(${match[3].replace(/\s+/g, ' ').trim().toLowerCase()})`);
  return normalized(routines);
}

export function sanitizeStructuralInventory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('inventory must be an object');
  const schemas = normalized(assertIdentifiers(raw.schemas ?? [], 'schemas'));
  const tables = normalized((raw.tables ?? []).map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`tables[${index}] must be an object`);
    const schema = String(entry.schema ?? '').toLowerCase();
    const name = String(entry.name ?? '').toLowerCase();
    if (!IDENTIFIER.test(schema) || !IDENTIFIER.test(name)) throw new Error(`tables[${index}] contains an unsafe identifier`);
    const kind = String(entry.kind ?? 'r');
    if (!/^(?:r|p|v|m|S|f)$/.test(kind)) throw new Error(`tables[${index}] contains an unsafe relation kind`);
    return `${schema}.${name}:${({r:'table',p:'table',v:'view',m:'materialized_view',S:'sequence',f:'foreign_table'})[kind]}`;
  }));
  const unsafeObjectAuthority = [];
  for (const [field, entries] of [['tables', raw.tables ?? []], ['routines', raw.routines ?? []]]) entries.forEach((entry,index) => {
    if (String(entry.schema??'').toLowerCase() !== 'public') return;
    const owner=String(entry.owner??'postgres').toLowerCase(), acl=String(entry.acl??'');
    if (owner !== 'postgres' || (field==='routines' && /(?:^|,)(?:|anon|authenticated)=X/i.test(acl))) unsafeObjectAuthority.push(`${field}[${index}]`);
  });
  const routines = normalized((raw.routines ?? []).map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`routines[${index}] must be an object`);
    const schema=String(entry.schema??'').toLowerCase(), name=String(entry.name??'').toLowerCase();
    if (!IDENTIFIER.test(schema)||!IDENTIFIER.test(name)||!/^[a-z0-9_ ,\[\]."]*$/.test(String(entry.arguments??'').toLowerCase())) throw new Error(`routines[${index}] contains an unsafe identifier`);
    return `${schema}.${name}(${String(entry.arguments??'').replace(/\s+/g,' ').trim().toLowerCase()})`;
  }));
  if (!Array.isArray(raw.appliedMigrations ?? [])) throw new Error('appliedMigrations must be an array');
  const appliedMigrations = (raw.appliedMigrations ?? []).map((name, index) => {
    if (typeof name !== 'string' || !MIGRATION_NAME.test(name)) throw new Error(`appliedMigrations[${index}] is invalid`);
    return name;
  });
  const authUserCount = Number(raw.authUserCount ?? 0);
  if (!Number.isSafeInteger(authUserCount) || authUserCount < 0) throw new Error('authUserCount must be a non-negative integer');
  return Object.freeze({ schemas, tables, routines, unsafeObjectAuthority: normalized(unsafeObjectAuthority), appliedMigrations, authUserCount });
}

function assertIdentifiers(values, field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  return values.map((value, index) => {
    const identifier = String(value).toLowerCase();
    if (!IDENTIFIER.test(identifier)) throw new Error(`${field}[${index}] contains an unsafe identifier`);
    return identifier;
  });
}

export function classifyHostedTarget(raw, canonical) {
  const inventory = sanitizeStructuralInventory(raw);
  const canonicalNames = canonical.migrations.map(item => item.name);
  const expectedRelations = new Set(canonical.migrations.flatMap(item => item.creates));
  const expectedRoutines = new Set(canonical.migrations.flatMap(item => item.routines ?? []));
  const appTables = inventory.tables.filter(name => name.startsWith('public.'));
  const appRoutines = inventory.routines.filter(name => name.startsWith('public.'));
  const foreignTables = appTables.filter(name => !expectedRelations.has(name) || FOREIGN_MARKERS.test(name.slice(7).split(':')[0]));
  const foreignRoutines = appRoutines.filter(name => !expectedRoutines.has(name));
  const foreignSchemas = inventory.schemas.filter(schema => !SAFE_SCHEMAS.has(schema));
  const isPrefix = inventory.appliedMigrations.every((name, index) => canonicalNames[index] === name);
  const duplicateOrReordered = inventory.appliedMigrations.length !== new Set(inventory.appliedMigrations).size;
  const expectedAtState = new Set(canonical.migrations.slice(0, inventory.appliedMigrations.length).flatMap(item => item.creates));
  const expectedRoutinesAtState = new Set(canonical.migrations.slice(0, inventory.appliedMigrations.length).flatMap(item => item.routines ?? []));
  const missingRelations = [...expectedAtState].filter(relation => !inventory.tables.includes(relation));
  const relationsAheadOfLedger = appTables.filter(relation => expectedRelations.has(relation) && !expectedAtState.has(relation));
  const routinesAheadOfLedger = appRoutines.filter(routine => expectedRoutines.has(routine) && !expectedRoutinesAtState.has(routine));
  const empty = appTables.length === 0 && appRoutines.length === 0 && inventory.appliedMigrations.length === 0 && inventory.authUserCount === 0;
  const reasons = [];
  if (inventory.authUserCount > 0 && inventory.appliedMigrations.length === 0) reasons.push('auth_users_on_uninitialized_target');
  if (foreignSchemas.length) reasons.push('foreign_schema');
  if (foreignTables.length) reasons.push(FOREIGN_MARKERS.test(foreignTables.map(x => x.slice(7)).join('|')) ? 'known_foreign_product_schema' : 'foreign_table');
  if (foreignRoutines.length) reasons.push('foreign_routine');
  if (inventory.unsafeObjectAuthority.length) reasons.push('foreign_object_authority');
  if (!isPrefix || duplicateOrReordered || inventory.appliedMigrations.length > canonicalNames.length) reasons.push('migration_history_not_canonical_prefix');
  if (missingRelations.length) reasons.push('partially_initialized_or_dirty_schema');
  if (relationsAheadOfLedger.length) reasons.push('relations_ahead_of_migration_ledger');
  if (routinesAheadOfLedger.length) reasons.push('routines_ahead_of_migration_ledger');
  const classification = reasons.length ? 'rejected' : empty ? 'dedicated_empty' : 'avalaos_compatible';
  return Object.freeze({ classification, mutationAllowed: classification !== 'rejected', reasons: normalized(reasons), foreignSchemas, foreignTables, foreignRoutines, missingRelations, relationsAheadOfLedger, routinesAheadOfLedger, inventoryDigest: sha256(canonicalJson(inventory)), inventory });
}

export function buildAdditiveMigrationPlan(classification, canonical) {
  if (!classification?.mutationAllowed) throw new Error(`target rejected: ${(classification?.reasons ?? ['preflight_missing']).join(',')}`);
  const applied = classification.inventory.appliedMigrations;
  const pending = canonical.migrations.slice(applied.length).map(({ name, sha256: digest, bytes }) => ({ name, sha256: digest, bytes }));
  return Object.freeze({ mode: 'additive_only', destructiveResetPermitted: false, canonicalDigest: canonical.digest, canonicalTip: canonical.tip, appliedCount: applied.length, pending });
}

export function createPreflightToken({ classification, canonical, expectedReleaseSha, environmentFingerprint, nonce, signingKey }) {
  if (!classification?.mutationAllowed) throw new Error('cannot authorize a rejected target');
  for (const [name, value] of Object.entries({ expectedReleaseSha, environmentFingerprint, nonce, signingKey })) if (typeof value !== 'string' || !value) throw new Error(`${name} is required`);
  if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha)) throw new Error('expectedReleaseSha must be a full lowercase Git SHA');
  if (!/^[0-9a-f]{64}$/.test(environmentFingerprint)) throw new Error('environmentFingerprint must be a SHA-256 digest');
  const payload = { schemaVersion: 'hosted-pilot-preflight-v1', expectedReleaseSha, environmentFingerprint, inventoryDigest: classification.inventoryDigest, migrationDigest: canonical.digest, migrationTip: canonical.tip, nonce };
  const encoded = Buffer.from(canonicalJson(payload)).toString('base64url');
  const signature = createHmac('sha256', signingKey).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyPreflightToken({ token, signingKey, expected }) {
  if (typeof token !== 'string' || typeof signingKey !== 'string' || !signingKey) return false;
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) return false;
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(createHmac('sha256', signingKey).update(encoded).digest('base64url'));
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return false;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return false; }
  return Object.entries(expected).every(([key, value]) => payload[key] === value);
}
