import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cp,mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {ensureHostedPgcryptoCompatibility} from './hostedPilotApplySafety.mjs';
import {inventoryConnectedHostedTarget} from './hostedPilotDatabaseInventory.mjs';
import {classifyHostedTarget,loadCanonicalMigrationInventory} from './hostedPilotActivation.mjs';
import {
  ROUTINE_CONTRACT_PATH,routineCatalog,
} from './hostedPilotRoutineContract.mjs';
import {
  applyMigrations,bootstrapAuth,connect,createDatabase,dropDatabase,ensureClusterRoles,migrationNames,
} from './pilotOperationsPostgresSupport.mjs';

const BASELINE_COUNT=112;
const RETAINED_COUNT=113;
const POST_USE_COUNT=114;
const CURRENT_COUNT=115;
const RELEASE_BEFORE_CONTRACT='ecc740bfbd8296b5b94b71e433fff7464838393f';
const adminUrl=new URL(process.env.PILOT_OPERATIONS_DATABASE_URL??'');
if(process.argv.includes('--write-contract')&&process.env.CI)throw new Error('ROUTINE_CONTRACT_WRITE_FORBIDDEN_IN_CI');
assert.ok(['postgres:','postgresql:'].includes(adminUrl.protocol)
  && ['127.0.0.1','[::1]'].includes(adminUrl.hostname),'Disposable loopback PostgreSQL required');
assert.equal(migrationNames.length,CURRENT_COUNT,'Routine contract must preserve the exact candidate migration chain');
// Regenerate only from a fresh disposable replay. A temporary source-only copy
// avoids treating the previous committed contract as the new tip's authority.
let inventoryRoot=process.cwd();
if(process.argv.includes('--write-contract')){
  inventoryRoot=await mkdtemp(join(tmpdir(),'avalaos-routine-source-'));
  await cp('supabase/migrations',join(inventoryRoot,'supabase/migrations'),{recursive:true});
}
let canonical=await loadCanonicalMigrationInventory(inventoryRoot);
assert.equal(canonical.count,migrationNames.length);

const normalize=value=>JSON.stringify(value,null,2)+'\n';
const sourceContract=async()=>JSON.parse(await readFile(ROUTINE_CONTRACT_PATH,'utf8'));
const inventory=async db=>inventoryConnectedHostedTarget(db);
const catalog=async db=>routineCatalog((await inventory(db)).inventory.routines);
const checkpoint=(count,profiles)=>({
  migrationNames:canonical.migrations.slice(0,count).map(item=>item.name),
  migrationHashes:canonical.migrations.slice(0,count).map(item=>item.sha256),
  profiles,
});
const legacySource=execFileSync('git',['show',`${RELEASE_BEFORE_CONTRACT}:scripts/hostedPilotActivation.mjs`],{encoding:'utf8'});
const legacy=await import(`data:text/javascript;base64,${Buffer.from(legacySource).toString('base64')}`);

const databasePrefix=`routine_contract_${randomUUID().replaceAll('-','')}`;
const profiles=['standard','supabase'];
const names=Object.fromEntries(profiles.map(profile=>[profile,`${databasePrefix}_${profile}`]));
const clients=[];
let admin;

const mutateAndReject=async(db,label,sql,{setup,expected=/foreign_object_authority|canonical_routine_contract_mismatch/iu}={})=>{
  await db.query('begin');
  try{
    if(setup)await db.query(setup);
    await db.query(sql);
    const connected=await inventory(db);
    const classification=classifyHostedTarget(connected.inventory,canonical);
    assert.equal(classification.mutationAllowed,false,`${label} must fail closed`);
    assert.match(classification.reasons.join(','),expected,`${label} must retain stable rejection reason`);
  }finally{await db.query('rollback');}
  const recovered=classifyHostedTarget((await inventory(db)).inventory,canonical);
  assert.equal(recovered.classification,'avalaos_compatible',`${label} rollback must restore compatibility`);
};

try{
  admin=await connect(adminUrl.href);clients.push(admin);await ensureClusterRoles(admin);
  const snapshots={},baselineSnapshots={},retainedSnapshots={},postUseSnapshots={},inventories={};
  for(const profile of profiles){
    const db=await createDatabase(admin,adminUrl.href,names[profile]);clients.push(db);
    await bootstrapAuth(db);
    await db.query('create schema extensions; create extension pgcrypto with schema extensions');
    if(profile==='supabase')await db.query(`alter default privileges for role postgres in schema public
      grant execute on functions to anon,authenticated,service_role`);
    await ensureHostedPgcryptoCompatibility(db);
    await applyMigrations(db,migrationNames.slice(0,BASELINE_COUNT));
    baselineSnapshots[profile]=await catalog(db);
    await applyMigrations(db,migrationNames.slice(BASELINE_COUNT,RETAINED_COUNT));
    retainedSnapshots[profile]=await catalog(db);
    await applyMigrations(db,migrationNames.slice(RETAINED_COUNT,POST_USE_COUNT));
    postUseSnapshots[profile]=await catalog(db);
    await applyMigrations(db,migrationNames.slice(POST_USE_COUNT));
    const connected=await inventory(db);
    assert.equal(legacy.classifyHostedTarget(connected.inventory,canonical).mutationAllowed,false,
      'original classifier must reproduce the installed-catalog rejection');
    const currentCatalog=routineCatalog(connected.inventory.routines);
    assert.deepEqual(currentCatalog,await catalog(db),'repeat exact-candidate inspection must be stable');
    snapshots[profile]=currentCatalog;
    inventories[profile]=connected.inventory;
  }

  const generated={schemaVersion:1,runtimeMigrationTip:'20261105110657',checkpoints:[
    checkpoint(BASELINE_COUNT,Object.fromEntries(profiles.map(profile=>[profile,baselineSnapshots[profile]]))),
    checkpoint(RETAINED_COUNT,Object.fromEntries(profiles.map(profile=>[profile,retainedSnapshots[profile]]))),
    checkpoint(POST_USE_COUNT,Object.fromEntries(profiles.map(profile=>[profile,postUseSnapshots[profile]]))),
    checkpoint(CURRENT_COUNT,Object.fromEntries(profiles.map(profile=>[profile,snapshots[profile]]))),
  ]};
  if(process.argv.includes('--write-contract')){
    await writeFile(ROUTINE_CONTRACT_PATH,normalize(generated),{encoding:'utf8'});
  }else{
    assert.deepEqual(generated,await sourceContract(),'committed contract must equal a fresh exact migration replay');
  }
  canonical=await loadCanonicalMigrationInventory();
  assert.ok(canonical.routineContract,'production loader must bind the committed contract to the exact chain');
  for(const profile of profiles){
    assert.equal(classifyHostedTarget(inventories[profile],canonical).classification,'avalaos_compatible');
  }

  const db=clients.find((_,index)=>index===2); // Supabase-profile database; index 0 is admin.
  const authProjection=`public.get_tenant_context(uuid,uuid)`;
  const authProjectionIdentity='public.get_tenant_context(uuid, uuid)';
  const serviceOnly=`public.synthetic_ai_campaign_request_host()`;
  const exactCatalog=await catalog(db);
  assert.equal(exactCatalog[authProjectionIdentity].effective.authenticated.execute,true,
    'normal authenticated RPC grant must be preserved');
  assert.equal(exactCatalog[authProjectionIdentity].effective.service_role.execute,true,
    'normal service RPC grant must be preserved');
  await mutateAndReject(db,'unexpected PUBLIC grant',`grant execute on function ${serviceOnly} to public`);
  await mutateAndReject(db,'unexpected anon grant',`grant execute on function ${serviceOnly} to anon`);
  await mutateAndReject(db,'unexpected authenticated grant',`grant execute on function ${serviceOnly} to authenticated`);
  await mutateAndReject(db,'unexpected custom grantee',`create role routine_contract_attacker; grant execute on function ${serviceOnly} to routine_contract_attacker`,
    {setup:null});
  await mutateAndReject(db,'grant option',`grant execute on function ${authProjection} to authenticated with grant option`);
  await mutateAndReject(db,'required authenticated grant removal',`revoke execute on function ${authProjection} from authenticated`);
  await mutateAndReject(db,'required service grant removal',`revoke execute on function ${authProjection} from service_role`);
  await mutateAndReject(db,'implementation substitution',`create or replace function public.get_tenant_context(
    p_org_id uuid,p_workspace_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog
    as 'begin return ''{}''::jsonb; end'`);
  await mutateAndReject(db,'owner substitution',`create role routine_contract_owner; alter function ${authProjection} owner to routine_contract_owner`);
  await mutateAndReject(db,'search path substitution',`alter function ${authProjection} set search_path=public`);
  await mutateAndReject(db,'security metadata substitution',`alter function ${authProjection} leakproof parallel safe`);
  await mutateAndReject(db,'unknown overload',`create function public.get_tenant_context(text) returns jsonb
    language sql stable as 'select jsonb_build_object(''status'',''unexpected'')'`);
  await mutateAndReject(db,'inherited browser access',`create role routine_contract_parent;
    grant execute on function ${serviceOnly} to routine_contract_parent;
    grant routine_contract_parent to authenticated`);

  const artifactPath='artifacts/pilot-operations/postgres-execution.json';
  let artifact={};try{artifact=JSON.parse(await readFile(artifactPath,'utf8'));}catch{}
  artifact.routineContract={fullInstalledAuthorityAccepted:true,requiredGrantsVerified:true,
    unexpectedGrantsRejected:true,implementationDriftRejected:true,ownerDriftRejected:true,
    repeatInspectionStable:true,existingCandidatePermissionsPreserved:true,
    profiles:[...profiles],migrationCount:canonical.count};
  await mkdir('artifacts/pilot-operations',{recursive:true});
  await writeFile(artifactPath,normalize(artifact),{encoding:'utf8'});
  console.log('PASS: canonical routine authority and implementation contract; standard/Supabase profiles; adversarial drift; stable reinspection');
}finally{
  for(let index=clients.length-1;index>0;index--)await clients[index].end().catch(()=>{});
  if(admin){for(const name of Object.values(names))await dropDatabase(admin,name).catch(()=>{});await admin.end().catch(()=>{});}
}
