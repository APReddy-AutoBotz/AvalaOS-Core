import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprintRoutine, routineCatalog, parseRoutineContract, matchRoutineContract } from './hostedPilotRoutineContract.mjs';
import { createPreflightToken, verifyPreflightToken } from './hostedPilotActivation.mjs';

const migrations = [{ name: '20261106020001_fixture.sql', sha256: 'a'.repeat(64) }];
const row = {schema:'public',name:'projection',argument_types:'uuid',owner:'postgres',
  authority_metadata:{source:'select 1\r\n',binary:null,language:'sql',securityDefiner:true,configuration:['search_path=pg_catalog']},
  authority_acl:[{grantee:'authenticated',grantor:'postgres',privilege:'EXECUTE',grantable:false},{grantee:'postgres',grantor:'postgres',privilege:'EXECUTE',grantable:false}],
  authority_effective:{anon:{execute:false,grantable:false},authenticated:{execute:true,grantable:false},service_role:{execute:false,grantable:false}}};
const entry = {...row,authority:fingerprintRoutine(row)};
const catalog = routineCatalog([entry]);
const fixture = () => ({schemaVersion:1,runtimeMigrationTip:'20261106020001',checkpoints:[{
  migrationNames:migrations.map(m=>m.name),migrationHashes:migrations.map(m=>m.sha256),profiles:{standard:catalog,supabase:catalog},
}]});
const parse = value => parseRoutineContract(Buffer.from(JSON.stringify(value)),migrations);
const canonical = {migrations,routineContract:parse(fixture())};
const raw = {appliedMigrations:migrations.map(m=>m.name),routines:[entry]};

test('canonical source binding and exact whole-profile match are required',()=>{
  assert.equal(matchRoutineContract(raw,canonical),'standard');
  for(const mutate of [v=>v.checkpoints[0].migrationHashes[0]='b'.repeat(64),v=>v.checkpoints[0].migrationNames[0]='different.sql',v=>v.checkpoints.push(v.checkpoints[0])]){
    const value=structuredClone(fixture());mutate(value);assert.throws(()=>parse(value),/ROUTINE_CONTRACT_/);
  }
  assert.equal(matchRoutineContract({...raw,appliedMigrations:['different.sql']},canonical),false);
  assert.equal(matchRoutineContract({...raw,appliedMigrations:[]},canonical),null);
  assert.equal(matchRoutineContract({...raw,routines:[]},canonical),false);
  assert.equal(matchRoutineContract({...raw,routines:[{...entry,authority:undefined}]},canonical),false);
  assert.equal(matchRoutineContract({...raw,routines:[entry,{...entry,name:'unknown'}]},canonical),false);
});

test('same identity cannot hide implementation, owner, grant, inherited access or metadata drift',()=>{
  for(const mutate of [r=>r.owner='attacker',r=>r.authority_metadata.source='select 2',r=>r.authority_metadata.configuration=['search_path=public'],
    r=>r.authority_metadata.securityDefiner=false,r=>r.authority_metadata.arguments='p_id uuid default null',
    r=>r.authority_acl.pop(),r=>r.authority_acl[0].grantable=true,
    r=>r.authority_acl.push({grantee:'unexpected',grantor:'postgres',privilege:'EXECUTE',grantable:false}),
    r=>r.authority_effective.anon.execute=true]){
    const changed=structuredClone(row);mutate(changed);
    assert.equal(matchRoutineContract({...raw,routines:[{...changed,authority:fingerprintRoutine(changed)}]},canonical),false);
  }
  const reordered=structuredClone(row);reordered.authority_acl.reverse();reordered.authority_metadata.source='select 1\n';
  assert.deepEqual(fingerprintRoutine(reordered),entry.authority);
  assert.throws(()=>routineCatalog([entry,entry]),/DUPLICATE/);
});

test('permission profiles cannot be combined row by row',()=>{
  const two=structuredClone(fixture());
  two.checkpoints[0].profiles.standard['public.second(uuid)']=entry.authority;
  two.checkpoints[0].profiles.supabase['public.second(uuid)']={...entry.authority,implementationSha256:'b'.repeat(64)};
  two.checkpoints[0].profiles.supabase['public.projection(uuid)']={...entry.authority,implementationSha256:'c'.repeat(64)};
  const mixed=[entry,{...entry,name:'second',authority:two.checkpoints[0].profiles.supabase['public.second(uuid)']}];
  assert.equal(matchRoutineContract({...raw,routines:mixed},{...canonical,routineContract:parse(two)}),false);
});

test('preflight binds the exact routine contract digest as well as migrations',()=>{
  const args={classification:{mutationAllowed:true,inventoryDigest:'i'},canonical:{...canonical,digest:'m',tip:migrations[0].name},
    expectedReleaseSha:'a'.repeat(40),environmentFingerprint:'sha256:'+'b'.repeat(64),nonce:'nonce',signingKey:'key'};
  const token=createPreflightToken(args);
  assert.equal(verifyPreflightToken({token,signingKey:'key',expected:{routineContractDigest:canonical.routineContract.digest}}),true);
  assert.equal(verifyPreflightToken({token,signingKey:'key',expected:{routineContractDigest:'d'.repeat(64)}}),false);
});
