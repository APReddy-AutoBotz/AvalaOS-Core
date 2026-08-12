import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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

// Removes comments without touching quoted strings, identifiers, or dollar-quoted
// function bodies. Newlines are retained so diagnostics remain useful.
export function stripSqlComments(sql) {
  let out = '', i = 0, state = 'code', dollar = '';
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (state === 'line') { if (c === '\n') { out += c; state = 'code'; } else out += ' '; i++; continue; }
    if (state === 'block') { if (c === '*' && n === '/') { out += '  '; i += 2; state = 'code'; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (state === 'single') { out += c; if (c === "'" && n === "'") { out += n; i += 2; continue; } if (c === "'") state = 'code'; i++; continue; }
    if (state === 'double') { out += c; if (c === '"' && n === '"') { out += n; i += 2; continue; } if (c === '"') state = 'code'; i++; continue; }
    if (state === 'dollar') { if (sql.startsWith(dollar, i)) { out += dollar; i += dollar.length; state = 'code'; } else { out += c; i++; } continue; }
    if (c === '-' && n === '-') { out += '  '; i += 2; state = 'line'; continue; }
    if (c === '/' && n === '*') { out += '  '; i += 2; state = 'block'; continue; }
    if (c === "'") { out += c; i++; state = 'single'; continue; }
    if (c === '"') { out += c; i++; state = 'double'; continue; }
    if (c === '$') { const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/); if (match) { dollar = match[0]; out += dollar; i += dollar.length; state = 'dollar'; continue; } }
    out += c; i++;
  }
  if (state === 'block') throw new Error('unterminated SQL block comment');
  return out;
}

const splitArguments = value => {
  const result=[]; let start=0, depth=0, quoted=false;
  for(let i=0;i<value.length;i++){ const c=value[i]; if(c==='"') quoted=!quoted; else if(!quoted&&c==='(') depth++; else if(!quoted&&c===')') depth--; else if(!quoted&&c===','&&depth===0){result.push(value.slice(start,i));start=i+1;} }
  if(value.trim()) result.push(value.slice(start)); return result;
};
const TYPE_ALIASES = new Map([['int','integer'],['int4','integer'],['int8','bigint'],['bool','boolean'],['float8','double precision'],['varchar','character varying'],['timestamptz','timestamp with time zone'],['timestampz','timestamp with time zone']]);
export function normalizeRoutineIdentityArguments(argumentsSql) {
  return splitArguments(argumentsSql).map(raw => {
    let arg=raw.trim().replace(/\s+(?:default\s+|=)[\s\S]*$/i,'').trim();
    arg=arg.replace(/^(?:in\s+|inout\s+|variadic\s+)/i,'').trim();
    const tokens=arg.match(/"(?:[^"]|"")+"|[^\s]+/g)??[];
    if(tokens.length>1 && !/^(?:double|character|timestamp|time|bit|interval)$/i.test(tokens[0]) && !tokens[0].includes('.') && !tokens[0].endsWith('[]')) tokens.shift();
    let type=tokens.join(' ').toLowerCase().replace(/\s+/g,' ').replace(/\s*\[\s*\]/g,'[]');
    type=TYPE_ALIASES.get(type)??type;
    return type;
  }).join(', ');
}

export function canonicalObjectsAtPrefix(migrations, count=migrations.length) {
  const relations=new Map(), routines=new Map();
  for(const migration of migrations.slice(0,count)) {
    for(const op of migration.objectOperations??[]) {
      const target=op.kind==='routine'?routines:relations;
      if(op.action==='drop') target.delete(op.identity);
      else if(op.action==='rename') {
        if(op.kind==='routine') {
          if(target.delete(op.identity)) target.set(op.newIdentity,op.newIdentity);
        } else {
          const oldPrefix=`${op.identity}:`;
          for(const identity of [...target.keys()]) {
            if(identity.startsWith(oldPrefix)) {
              target.delete(identity);
              const kind=identity.slice(oldPrefix.length);
              target.set(`${op.newIdentity}:${kind}`,`${op.newIdentity}:${kind}`);
            }
          }
        }
      } else target.set(op.identity,op.identity);
    }
  }
  return {relations:new Set(relations.keys()),routines:new Set(routines.keys())};
}

export function extractObjectOperations(sql) {
  const source=stripSqlComments(sql), operations=[];
  const relation=/\b(create(?:\s+or\s+replace)?|drop)\s+(?:unlogged\s+)?(table|view|materialized\s+view|sequence|foreign\s+table)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?(?:"?([a-z_][a-z0-9_$]*)"?\.)?"?([a-z_][a-z0-9_$]*)"?/gi;
  for(const m of source.matchAll(relation)) operations.push({index:m.index,kind:'relation',action:m[1].toLowerCase().startsWith('drop')?'drop':'create',identity:`${m[3]??'public'}.${m[4]}:${m[2].replace(/\s+/g,'_').toLowerCase()}`});
  const routine=/\b(create(?:\s+or\s+replace)?|drop)\s+(?:function|procedure)\s+(?:if\s+exists\s+)?(?:"?([a-z_][a-z0-9_$]*)"?\.)?"?([a-z_][a-z0-9_$]*)"?\s*\(([^;]*?)\)(?=\s*(?:returns|language|as|;|cascade|restrict))/gis;
  for(const m of source.matchAll(routine)) operations.push({index:m.index,kind:'routine',action:m[1].toLowerCase().startsWith('drop')?'drop':'create',identity:`${m[2]??'public'}.${m[3]}(${normalizeRoutineIdentityArguments(m[4])})`});
  const routineRename=/\balter\s+(?:function|procedure)\s+(?:if\s+exists\s+)?(?:"?([a-z_][a-z0-9_$]*)"?\.)?"?([a-z_][a-z0-9_$]*)"?\s*\(([^;]*?)\)\s+rename\s+to\s+"?([a-z_][a-z0-9_$]*)"?/gis;
  for(const m of source.matchAll(routineRename)) {
    const schema=m[1]??'public', args=normalizeRoutineIdentityArguments(m[3]);
    operations.push({index:m.index,kind:'routine',action:'rename',identity:`${schema}.${m[2]}(${args})`,newIdentity:`${schema}.${m[4]}(${args})`});
  }
  const relationRename=/\balter\s+(?:table|view|materialized\s+view|sequence|foreign\s+table)\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?([a-z_][a-z0-9_$]*)"?\.)?"?([a-z_][a-z0-9_$]*)"?\s+rename\s+to\s+"?([a-z_][a-z0-9_$]*)"?/gis;
  for(const m of source.matchAll(relationRename)) {
    const schema=m[1]??'public';
    operations.push({index:m.index,kind:'relation',action:'rename',identity:`${schema}.${m[2]}`,newIdentity:`${schema}.${m[3]}`});
  }
  return operations.sort((a,b)=>a.index-b.index).map(({index,...op})=>op);
}

export async function loadCanonicalMigrationInventory(root = process.cwd()) {
  const directory = path.join(root, 'supabase', 'migrations');
  const names = (await readdir(directory)).filter(name => MIGRATION_NAME.test(name)).sort();
  if (!names.length) throw new Error('canonical migration chain is empty');
  const migrations = [];
  for (const name of names) {
    const bytes = await readFile(path.join(directory, name));
    const sql=bytes.toString('utf8'), objectOperations=extractObjectOperations(sql);
    migrations.push({ name, sha256: sha256(bytes), bytes: bytes.length, sql, objectOperations, creates: extractCreatedRelations(sql), routines: extractCreatedRoutines(sql) });
  }
  const finalObjects=canonicalObjectsAtPrefix(migrations);
  return Object.freeze({
    algorithm: 'sha256',
    count: migrations.length,
    tip: names.at(-1),
    digest: sha256(migrations.map(({ name, sha256: digest }) => `${name}\0${digest}\n`).join('')),
    migrations, relations:normalized(finalObjects.relations), routines:normalized(finalObjects.routines),
  });
}

export function loadCanonicalMigrationInventoryFromGit(commit, root = process.cwd()) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('canonical Git commit is invalid');
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, 'supabase/migrations'], { cwd: root, encoding: 'utf8' })
    .split('\n').map(value => value.trim()).filter(name => MIGRATION_NAME.test(name.split('/').at(-1))).map(name => name.split('/').at(-1)).sort();
  if (!names.length) throw new Error('canonical Git migration chain is empty');
  const migrations = names.map(name => {
    const bytes = execFileSync('git', ['show', `${commit}:supabase/migrations/${name}`], { cwd: root, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
    const sql=bytes.toString('utf8'), objectOperations=extractObjectOperations(sql);
    return { name, sha256: sha256(bytes), bytes: bytes.length, sql, objectOperations, creates: extractCreatedRelations(sql), routines: extractCreatedRoutines(sql) };
  });
  const finalObjects=canonicalObjectsAtPrefix(migrations);
  return Object.freeze({ algorithm: 'sha256', count: migrations.length, tip: names.at(-1),
    digest: sha256(migrations.map(({ name, sha256: digest }) => `${name}\0${digest}\n`).join('')), migrations,
    relations:normalized(finalObjects.relations),routines:normalized(finalObjects.routines) });
}

export function extractCreatedRelations(sql) {
  return normalized(extractObjectOperations(sql).filter(op=>op.kind==='relation'&&op.action==='create').map(op=>op.identity));
}

export function extractCreatedRoutines(sql) {
  return normalized(extractObjectOperations(sql).filter(op=>op.kind==='routine'&&op.action==='create').map(op=>op.identity));
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
  const approvedCompatibilityRoutines=normalized((raw.routines??[]).filter(entry=>entry.approved_compatibility===true)
    .map(entry=>`${String(entry.schema).toLowerCase()}.${String(entry.name).toLowerCase()}(${String(entry.arguments).replace(/\s+/g,' ').trim().toLowerCase()})`));
  if (!Array.isArray(raw.appliedMigrations ?? [])) throw new Error('appliedMigrations must be an array');
  const appliedMigrations = (raw.appliedMigrations ?? []).map((name, index) => {
    if (typeof name !== 'string' || !MIGRATION_NAME.test(name)) throw new Error(`appliedMigrations[${index}] is invalid`);
    return name;
  });
  const authUserCount = Number(raw.authUserCount ?? 0);
  if (!Number.isSafeInteger(authUserCount) || authUserCount < 0) throw new Error('authUserCount must be a non-negative integer');
  return Object.freeze({ schemas, tables, routines, approvedCompatibilityRoutines, unsafeObjectAuthority: normalized(unsafeObjectAuthority), appliedMigrations, authUserCount });
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
  const finalObjects=canonicalObjectsAtPrefix(canonical.migrations);
  const expectedRelations = finalObjects.relations;
  const expectedRoutines = finalObjects.routines;
  const appTables = inventory.tables.filter(name => name.startsWith('public.'));
  const appRoutines = inventory.routines.filter(name => name.startsWith('public.'));
  const foreignTables = appTables.filter(name => !expectedRelations.has(name) || FOREIGN_MARKERS.test(name.slice(7).split(':')[0]));
  const foreignRoutines = appRoutines.filter(name => !expectedRoutines.has(name) && !inventory.approvedCompatibilityRoutines.includes(name));
  const foreignSchemas = inventory.schemas.filter(schema => !SAFE_SCHEMAS.has(schema));
  const isPrefix = inventory.appliedMigrations.every((name, index) => canonicalNames[index] === name);
  const duplicateOrReordered = inventory.appliedMigrations.length !== new Set(inventory.appliedMigrations).size;
  const stateObjects=canonicalObjectsAtPrefix(canonical.migrations,inventory.appliedMigrations.length);
  const expectedAtState = stateObjects.relations;
  const expectedRoutinesAtState = stateObjects.routines;
  const missingRelations = [...expectedAtState].filter(relation => !inventory.tables.includes(relation));
  const missingRoutines = [...expectedRoutinesAtState].filter(routine => !inventory.routines.includes(routine));
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
  if (missingRoutines.length) reasons.push('missing_canonical_routine');
  if (relationsAheadOfLedger.length) reasons.push('relations_ahead_of_migration_ledger');
  if (routinesAheadOfLedger.length) reasons.push('routines_ahead_of_migration_ledger');
  const classification = reasons.length ? 'rejected' : empty ? 'dedicated_empty' : 'avalaos_compatible';
  return Object.freeze({ classification, mutationAllowed: classification !== 'rejected', reasons: normalized(reasons), foreignSchemas, foreignTables, foreignRoutines, missingRelations, missingRoutines, relationsAheadOfLedger, routinesAheadOfLedger, inventoryDigest: sha256(canonicalJson(inventory)), inventory });
}

export function buildAdditiveMigrationPlan(classification, canonical) {
  if (!classification?.mutationAllowed) throw new Error(`target rejected: ${(classification?.reasons ?? ['preflight_missing']).join(',')}`);
  const applied = classification.inventory.appliedMigrations;
  const pending = canonical.migrations.slice(applied.length).map(({ name, sha256: digest, bytes, sql }) => Object.freeze({ name, sha256: digest, bytes, sql }));
  return Object.freeze({ mode: 'additive_only', destructiveResetPermitted: false, canonicalDigest: canonical.digest, canonicalTip: canonical.tip, appliedCount: applied.length, pending });
}

export function createPreflightToken({ classification, canonical, expectedReleaseSha, environmentFingerprint, nonce, signingKey }) {
  if (!classification?.mutationAllowed) throw new Error('cannot authorize a rejected target');
  for (const [name, value] of Object.entries({ expectedReleaseSha, environmentFingerprint, nonce, signingKey })) if (typeof value !== 'string' || !value) throw new Error(`${name} is required`);
  if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha)) throw new Error('expectedReleaseSha must be a full lowercase Git SHA');
  if (!/^sha256:[0-9a-f]{64}$/.test(environmentFingerprint)) throw new Error('environmentFingerprint must use the canonical sha256:<digest> representation');
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
