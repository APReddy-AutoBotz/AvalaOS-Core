import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {ensureHostedPgcryptoCompatibility} from './hostedPilotApplySafety.mjs';
import {inventoryConnectedHostedTarget} from './hostedPilotDatabaseInventory.mjs';
import {classifyHostedTarget, loadCanonicalMigrationInventory} from './hostedPilotActivation.mjs';

// Execute the actual failed helper, not a mock of its catalog response.
const baseline = '727363d1d62cacdd5e6768363aabbcda63be25d1';
const original = execFileSync('git', ['show', `${baseline}:scripts/hostedPilotApplySafety.mjs`], {encoding:'utf8'})
  .replace("'./hostedPilotActivation.mjs'", JSON.stringify(new URL('./hostedPilotActivation.mjs', import.meta.url).href));
const legacy = await import(`data:text/javascript;base64,${Buffer.from(original).toString('base64')}`);
const legacyInventorySource = execFileSync('git', ['show', `${baseline}:scripts/hostedPilotDatabaseInventory.mjs`], {encoding:'utf8'});
const legacyInventory = await import(`data:text/javascript;base64,${Buffer.from(legacyInventorySource).toString('base64')}`);
const adminUrl = new URL(process.env.PILOT_OPERATIONS_DATABASE_URL ?? '');
assert.ok(['postgres:', 'postgresql:'].includes(adminUrl.protocol) && ['127.0.0.1', '[::1]'].includes(adminUrl.hostname), 'Disposable loopback PostgreSQL required');
const name = `digest_identity_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Client({connectionString:adminUrl.href});
let db, created = false;
const canonical = await loadCanonicalMigrationInventory();
const wrappers = async () => (await db.query(`select p.oid::text oid,
  pg_get_function_identity_arguments(p.oid) identity_arguments,
  pg_catalog.oidvectortypes(p.proargtypes) argument_types,
  owner.rolname owner, current_user current_owner, l.lanname language,
  p.prosrc source, p.provolatile, p.proisstrict, p.proparallel, p.proconfig,
  has_function_privilege('public',p.oid,'execute') public_execute,
  has_function_privilege('anon',p.oid,'execute') anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,
  has_function_privilege('service_role',p.oid,'execute') service_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_roles owner on owner.oid=p.proowner join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.proname='digest' order by argument_types`)).rows;
const inventory = async () => {
  const result = await inventoryConnectedHostedTarget(db);
  return {result, classification:classifyHostedTarget(result.inventory,canonical)};
};
const verify = async () => {
  const rows = await wrappers();
  assert.deepEqual(rows.map(r=>r.identity_arguments), ['data bytea, algorithm text','data text, algorithm text']);
  for(const row of rows) {
    assert.equal(row.owner,row.current_owner);
    assert.equal(row.language,'sql');
    assert.equal(row.source,'select extensions.digest($1,$2)');
    assert.deepEqual([row.provolatile,row.proisstrict,row.proparallel],['i',true,'s']);
    assert.deepEqual(row.proconfig,['search_path=pg_catalog, extensions']);
    assert.deepEqual([row.public_execute,row.anon_execute,row.authenticated_execute,row.service_execute],[false,false,false,true]);
  }
  const {result,classification} = await inventory();
  assert.equal(result.inventory.routines.filter(r=>r.schema==='public' && r.approved_compatibility).length,2);
  assert.equal(classification.mutationAllowed,true);
  assert.deepEqual(classification.foreignRoutines,[]);
  return rows.map(r=>r.oid);
};
await admin.connect();
try {
  for(const role of ['anon','authenticated','service_role']) {
    if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount) await admin.query(`create role ${role} nologin`);
  }
  await admin.query(`create database ${name}`); created=true;
  const url=new URL(adminUrl);url.pathname=`/${name}`;
  db=new pg.Client({connectionString:url.href});await db.connect();
  await db.query('create schema auth; create table auth.users(id uuid primary key); create schema extensions; create extension pgcrypto with schema extensions');
  await assert.rejects(legacy.ensureHostedPgcryptoCompatibility(db),/PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH/);
  assert.deepEqual(await wrappers(),[], 'Original failure must roll back both wrappers');
  assert.equal((await ensureHostedPgcryptoCompatibility(db)).mode,'supabase_extensions_bridge');
  const ids=await verify();
  const oldInventory=await legacyInventory.inventoryConnectedHostedTarget(db);
  assert.equal(oldInventory.inventory.routines.filter(r=>r.schema==='public'&&r.approved_compatibility).length,0);
  assert.equal(classifyHostedTarget(oldInventory.inventory,canonical).mutationAllowed,false);
  await ensureHostedPgcryptoCompatibility(db);
  assert.deepEqual(await verify(),ids,'Subsequent inspection must preserve both function identities');

  await db.query("create or replace function public.digest(data text, algorithm text) returns bytea language sql immutable strict parallel safe set search_path=pg_catalog,extensions as 'select decode(''00'',''hex'')'");
  await assert.rejects(ensureHostedPgcryptoCompatibility(db),/PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH/);
  assert.equal((await inventory()).classification.mutationAllowed,false);
  await db.query("create or replace function public.digest(data text, algorithm text) returns bytea language sql immutable strict parallel safe set search_path=pg_catalog,extensions as 'select extensions.digest($1,$2)'");
  await verify();
  for(const role of ['public','anon','authenticated']) {
    await db.query(`grant execute on function public.digest(text,text) to ${role}`);
    assert.equal((await inventory()).classification.mutationAllowed,false,`${role} execute must reject inventory`);
    // Existing trusted-helper behavior repairs grants, then verifies real ACLs.
    await ensureHostedPgcryptoCompatibility(db);
    await verify();
  }
  await db.query('revoke execute on function public.digest(text,text) from service_role');
  await ensureHostedPgcryptoCompatibility(db);await verify();
  await db.query('grant execute on function public.digest(text,text) to authenticated');
  const failedRevoke={query:(sql,...args)=>String(sql).startsWith('revoke all on function public.digest') && String(sql).endsWith('from authenticated')
    ? Promise.resolve({rows:[]}) : db.query(sql,...args)};
  await assert.rejects(ensureHostedPgcryptoCompatibility(failedRevoke),/PGCRYPTO_SCHEMA_COMPATIBILITY_MISMATCH/);
  assert.equal((await inventory()).classification.mutationAllowed,false);
  await ensureHostedPgcryptoCompatibility(db);await verify();
  console.log('PASS: original real-PG failure; named overloads; production inventory; idempotence; substituted body rejection; browser ACL rejection/repair; failed repair rollback; service-role access');
} finally {
  if(db)await db.end();
  if(created)await admin.query(`drop database ${name} with (force)`);
  await admin.end();
}
