import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import pg from 'pg';
import {
  CANONICAL_HANDS_ON_CAPABILITIES,
  canonicalHandsOnSafeResult,
  createCanonicalHandsOnAuthClient,
  executeCanonicalHandsOnAccess,
  prepareCanonicalHandsOnAccess,
  revokeCanonicalHandsOnAccess,
  validateCanonicalHandsOnBundle,
  validateCanonicalHandsOnDatabaseTarget,
  validateCanonicalHandsOnProtectedScope,
  validateCanonicalHandsOnRoleInventory,
} from './canonicalHandsOnAccess.mjs';

const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
const roles = ['00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000014'];
const keys = ['author','reviewer','approver','deliveryOwner'];
const release = 'a'.repeat(40); const operator = 'b'.repeat(40);
const bundle = () => ({
  schemaVersion:'canonical-hands-on-access-v1',bundleId:'00000000-0000-4000-8000-000000000099',
  targetProjectRef:'abcdefghijklmnopqrst',targetPublicDigest:`sha256:${'c'.repeat(64)}`,
  organizationId:'00000000-0000-4000-8000-000000000100',workspaceId:'00000000-0000-4000-8000-000000000101',
  migrationVersion:'20261019161723',operatorSha:operator,previewReleaseSha:release,
  previewUrl:'https://ap-acceptance-aaaaaaaa--avalaos-pilot.netlify.app',
  createdAt:'2026-10-31T10:00:00.000Z',expiresAt:'2026-11-02T10:00:00.000Z',
  personas:keys.map((key,index)=>({key,userId:ids[index],roleId:roles[index],
    loginId:`hands-on.abcdefgh.${key==='deliveryOwner'?'delivery-owner':key}@example.invalid`,password:`Aa7!canonical-${key}-password-2026`})),
});
const validate = value => validateCanonicalHandsOnBundle(value,{operation:'prepare',operatorSha:operator,
  previewReleaseSha:release,previewUrl:value.previewUrl,now:new Date('2026-10-31T12:00:00.000Z')});

test('bundle binds exact release, target, expiry and four distinct personas without exposing it', () => {
  const value=validate(bundle());assert.equal(value.personas.length,4);
  const result=canonicalHandsOnSafeResult('prepare','prepared',value,{accessActive:true,createdIdentities:4});
  assert.deepEqual(Object.keys(result).sort(),['accessActive','bundleDigest','createdIdentities','customerRows','operation',
    'personaCount','production','providersEnabled','schemaVersion','state'].sort());
  assert.doesNotMatch(JSON.stringify(result),/@example\.invalid|password|00000000-0000-4000-8000-000000000099/u);
});

test('bundle rejects drift, duplicate identities, unsafe expiry and leaked request binding', () => {
  for(const mutate of [
    value=>{value.previewReleaseSha='d'.repeat(40);},
    value=>{value.personas[1].userId=value.personas[0].userId;},
    value=>{value.expiresAt='2026-11-30T10:00:00.000Z';},
    value=>{value.personas[0].loginId='human@example.com';},
  ]){const value=bundle();mutate(value);assert.throws(()=>validate(value),/CANONICAL_HANDS_ON_/u);}
});

test('revoke accepts an elapsed operator-managed deadline while prepare does not', () => {
  const value=bundle();value.expiresAt='2026-10-31T11:00:00.000Z';
  assert.throws(()=>validate(value),/EXPIRY_REJECTED/u);
  assert.equal(validateCanonicalHandsOnBundle(value,{operation:'revoke',operatorSha:operator,
    previewReleaseSha:release,previewUrl:value.previewUrl,now:new Date('2026-10-31T12:00:00.000Z')}).expiresAt,
  '2026-10-31T11:00:00.000Z');
});

test('protected acceptance scope binds the exact synthetic org and workspace', () => {
  const value=validate(bundle());
  const scope={organizationId:value.organizationId,workspaceId:value.workspaceId,roleIds:{
    author:roles[0],reviewer:roles[1],approver:roles[2],outsider:ids[0],deliveryOwner:ids[1],
  }};
  assert.equal(validateCanonicalHandsOnProtectedScope(scope,value),true);
  scope.workspaceId=ids[0];
  assert.throws(()=>validateCanonicalHandsOnProtectedScope(scope,value),/TARGET_BINDING_REJECTED/u);
});

test('database target binds TLS URL, project ref, user and database before connection', () => {
  assert.equal(validateCanonicalHandsOnDatabaseTarget(
    'postgresql://postgres:private@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full',
    'abcdefghijklmnopqrst'),true);
  assert.equal(validateCanonicalHandsOnDatabaseTarget(
    'postgresql://postgres.abcdefghijklmnopqrst:private@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=verify-full',
    'abcdefghijklmnopqrst'),true);
  for(const target of [
    'postgresql://postgres:private@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres?sslmode=verify-full',
    'postgresql://postgres:private@db.abcdefghijklmnopqrst.supabase.co:5432/other?sslmode=verify-full',
    'postgresql://postgres:private@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
  ]) assert.throws(()=>validateCanonicalHandsOnDatabaseTarget(target,'abcdefghijklmnopqrst'),/DATABASE_TARGET_REJECTED/u);
});

test('role inventory requires exact least-privilege sets and rejects org admin or extra capabilities', () => {
  const value=validate(bundle());
  const inventory=value.personas.map(persona=>({id:persona.roleId,org_id:value.organizationId,workspace_id:null,
    scope:'organization',status:'active',capabilities:[...CANONICAL_HANDS_ON_CAPABILITIES[persona.key]]}));
  assert.equal(validateCanonicalHandsOnRoleInventory(inventory,value),true);
  inventory[0].capabilities.push('org.admin');
  assert.throws(()=>validateCanonicalHandsOnRoleInventory(inventory,value),/ROLE_INVENTORY_REJECTED/u);
});

test('Auth client sends password only to exact create call and reconciles by exact UUID', async () => {
  const value=validate(bundle());const calls=[];
  const client=createCanonicalHandsOnAuthClient({origin:`https://${bundle().targetProjectRef}.supabase.co`,
    serviceRoleKey:'s'.repeat(40),fetchImpl:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({
      id:value.personas[0].userId,email:value.personas[0].loginId,app_metadata:{canonical_hands_on_bundle:value.bundleId,
        canonical_hands_on_target:value.targetPublicDigest,canonical_hands_on_persona:'author'},
    }),{status:200,headers:{'content-type':'application/json'}});}});
  const created=await client.create(value,value.personas[0]);
  assert.equal(client.owned(created,value,value.personas[0]),true);
  assert.equal(calls.length,1);assert.match(calls[0].url,/\/auth\/v1\/admin\/users$/u);
  assert.equal(JSON.parse(calls[0].init.body).password,value.personas[0].password);
  assert.doesNotMatch(JSON.stringify(calls[0].init.headers),new RegExp(value.personas[0].password,'u'));
});

test('Auth transport and deletion uncertainty fail closed as reconciliation required', async () => {
  const client=createCanonicalHandsOnAuthClient({origin:`https://${bundle().targetProjectRef}.supabase.co`,
    serviceRoleKey:'s'.repeat(40),fetchImpl:async()=>{throw new Error('private');}});
  await assert.rejects(client.get(bundle().personas[0]),/AUTH_OUTCOME_RECONCILIATION_REQUIRED/u);
});

test('Auth revoke bans and retains the exact owned identity', async () => {
  const value=validate(bundle());const calls=[];
  const client=createCanonicalHandsOnAuthClient({origin:`https://${bundle().targetProjectRef}.supabase.co`,
    serviceRoleKey:'s'.repeat(40),fetchImpl:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({
      id:value.personas[0].userId,email:value.personas[0].loginId,banned_until:'2099-01-01T00:00:00.000Z',
      app_metadata:{canonical_hands_on_bundle:value.bundleId,canonical_hands_on_target:value.targetPublicDigest,
        canonical_hands_on_persona:'author'},
    }),{status:200,headers:{'content-type':'application/json'}});}});
  const banned=await client.ban(value.personas[0]);
  assert.equal(client.owned(banned,value,value.personas[0]),true);assert.equal(client.banned(banned),true);
  assert.equal(calls[0].init.method,'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body),{ban_duration:'876000h'});
});

const disposableUrl=process.env.CANONICAL_HANDS_ON_DISPOSABLE_DATABASE_URL;
const disposableAuth=(db,value)=>{
  let reads=Promise.resolve();
  const decode=row=>row?{id:row.id,email:row.email,banned_until:row.banned_until?.toISOString?.()??row.banned_until,
    app_metadata:row.app_metadata}:null;
  const get=persona=>{
    const result=reads.then(async()=>decode((await db.query(
      'SELECT id,email,banned_until,app_metadata FROM auth.users WHERE id=$1',[persona.userId])).rows[0]));
    reads=result.then(()=>undefined,()=>undefined);return result;
  };
  const owned=(user,bound,persona)=>Boolean(user&&user.id===persona.userId&&user.email===persona.loginId
    &&user.app_metadata?.canonical_hands_on_bundle===bound.bundleId
    &&user.app_metadata?.canonical_hands_on_target===bound.targetPublicDigest
    &&user.app_metadata?.canonical_hands_on_persona===persona.key);
  return Object.freeze({
    get,
    create:async(bound,persona)=>decode((await db.query(`INSERT INTO auth.users(id,email,app_metadata)
      VALUES($1,$2,$3::jsonb) RETURNING id,email,banned_until,app_metadata`,[persona.userId,persona.loginId,
      JSON.stringify({canonical_hands_on_bundle:bound.bundleId,canonical_hands_on_target:bound.targetPublicDigest,
        canonical_hands_on_persona:persona.key})])).rows[0]),
    ban:async persona=>decode((await db.query(`UPDATE auth.users SET banned_until='2099-01-01T00:00:00.000Z'
      WHERE id=$1 RETURNING id,email,banned_until,app_metadata`,[persona.userId])).rows[0]),
    removeUnactivated:async persona=>{await db.query('DELETE FROM auth.users WHERE id=$1',[persona.userId]);return true;},
    active:user=>Boolean(user&&(!user.banned_until||Date.parse(user.banned_until)<=Date.now())),
    banned:user=>Boolean(user&&Date.parse(user.banned_until)>Date.now()+30_000),owned,
  });
};

test('disposable PostgreSQL proves trigger-safe prepare and drift-tolerant history-preserving revoke',
  {skip:!disposableUrl,timeout:30_000},async()=>{
  const target=new URL(disposableUrl);
  assert.equal(['127.0.0.1','localhost'].includes(target.hostname),true);
  assert.equal(target.pathname,'/canonical_hands_on_disposable');
  const db=new pg.Client({connectionString:disposableUrl});await db.connect();
  try{
    await db.query(`DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE;
      CREATE SCHEMA public; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text NOT NULL,banned_until timestamptz,app_metadata jsonb NOT NULL);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id));
      CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,email text NOT NULL,
        full_name text,status text NOT NULL DEFAULT 'active',metadata jsonb NOT NULL DEFAULT '{}'::jsonb,deleted_at timestamptz);
      CREATE FUNCTION auth.create_profile() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN INSERT INTO public.profiles(id,email,status,metadata) VALUES(NEW.id,NEW.email,''active'',''{"synthetic":true}''::jsonb); RETURN NEW; END';
      CREATE TRIGGER auth_user_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.create_profile();
      CREATE TABLE public.organizations(id uuid PRIMARY KEY,status text NOT NULL,settings jsonb NOT NULL,deleted_at timestamptz);
      CREATE TABLE public.workspaces(id uuid PRIMARY KEY,org_id uuid NOT NULL,status text NOT NULL,metadata jsonb NOT NULL,deleted_at timestamptz);
      CREATE TABLE public.roles(id uuid PRIMARY KEY,org_id uuid NOT NULL,workspace_id uuid,scope text NOT NULL,status text NOT NULL,deleted_at timestamptz);
      CREATE TABLE public.role_capabilities(role_id uuid NOT NULL,capability_key text NOT NULL,PRIMARY KEY(role_id,capability_key));
      CREATE TABLE public.organization_members(org_id uuid NOT NULL,user_id uuid NOT NULL,role_id uuid,status text NOT NULL,
        joined_at timestamptz,deleted_at timestamptz,PRIMARY KEY(org_id,user_id));
      CREATE TABLE public.workspace_memberships(org_id uuid NOT NULL,workspace_id uuid NOT NULL,user_id uuid NOT NULL,status text NOT NULL,
        joined_at timestamptz,disabled_at timestamptz,deleted_at timestamptz,PRIMARY KEY(org_id,workspace_id,user_id));
      CREATE TABLE public.authorization_versions(org_id uuid NOT NULL,user_id uuid NOT NULL,version bigint NOT NULL,PRIMARY KEY(org_id,user_id));
      CREATE TABLE public.hosted_pilot_environment_identity(singleton boolean PRIMARY KEY,product_key text NOT NULL,
        environment_class text NOT NULL,migration_tip text NOT NULL,production_authorized boolean NOT NULL,
        customer_data_authorized boolean NOT NULL,real_provider_calls_authorized boolean NOT NULL);
      CREATE TABLE public.studio_artifact_runtime_control(singleton boolean PRIMARY KEY,provider_enabled boolean NOT NULL);
      CREATE TABLE public.enterprise_intelligence_runtime_control(singleton boolean PRIMARY KEY,provider_enabled boolean NOT NULL);
      CREATE TABLE public.authenticated_synthetic_exercises(id uuid PRIMARY KEY,lifecycle text NOT NULL);
      CREATE TABLE public.studio_artifact_generation_attempts(id uuid PRIMARY KEY,transport_kind text NOT NULL,state text NOT NULL);
      CREATE TABLE public.enterprise_provider_secret_cleanup_jobs(id uuid PRIMARY KEY,state text NOT NULL);
      CREATE TABLE public.enterprise_ai_capability_routes(id uuid PRIMARY KEY,org_id uuid NOT NULL,workspace_id uuid NOT NULL,enabled boolean NOT NULL);
      CREATE TABLE public.business_history(id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES public.profiles(id),detail text NOT NULL);
      INSERT INTO public.hosted_pilot_environment_identity VALUES(true,'avalaos-core','hosted_nonproduction_pilot','20261019161723',false,false,false);
      INSERT INTO public.studio_artifact_runtime_control VALUES(true,false);
      INSERT INTO public.enterprise_intelligence_runtime_control VALUES(true,false);`);
    const value=validate(bundle());
    await db.query(`INSERT INTO public.organizations VALUES($1,'active','{"synthetic":true}',NULL)`,
      [value.organizationId]);
    await db.query(`INSERT INTO public.workspaces VALUES($1,$2,'active','{"synthetic":true}',NULL)`,
      [value.workspaceId,value.organizationId]);
    for(const persona of value.personas){
      await db.query(`INSERT INTO public.roles VALUES($1,$2,NULL,'organization','active',NULL)`,
        [persona.roleId,value.organizationId]);
      for(const capability of CANONICAL_HANDS_ON_CAPABILITIES[persona.key]){
        await db.query('INSERT INTO public.role_capabilities VALUES($1,$2)',[persona.roleId,capability]);
      }
    }
    const auth=disposableAuth(db,value);
    const prepared=await prepareCanonicalHandsOnAccess({db,auth,bundle:value});
    assert.equal(prepared.accessActive,true);
    assert.equal(Number((await db.query(`SELECT count(*) value FROM public.profiles
      WHERE metadata->>'canonicalHandsOnBundle'=$1`,[value.bundleId])).rows[0].value),4,
    'Auth-created profiles must be reconciled, not collide or be blindly adopted');
    await db.query(`UPDATE public.authorization_versions SET version=7;
      UPDATE public.studio_artifact_runtime_control SET provider_enabled=true;
      UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true;
      INSERT INTO public.authenticated_synthetic_exercises VALUES('10000000-0000-4000-8000-000000000001','active');`);
    await db.query(`INSERT INTO public.role_capabilities VALUES($1,'org.admin')`,[value.personas[0].roleId]);
    for(const [index,persona] of value.personas.entries()){
      await db.query('INSERT INTO auth.sessions VALUES($1,$2)',[`20000000-0000-4000-8000-00000000000${index+1}`,persona.userId]);
      await db.query('INSERT INTO public.business_history VALUES($1,$2,$3)',
        [`30000000-0000-4000-8000-00000000000${index+1}`,persona.userId,'immutable synthetic history']);
    }
    const revokeEnvironment={
      CANONICAL_HANDS_ON_OPERATION:'revoke',CANONICAL_HANDS_ON_OPERATOR_SHA:value.operatorSha,
      CANONICAL_HANDS_ON_PREVIEW_RELEASE_SHA:value.previewReleaseSha,CANONICAL_HANDS_ON_PREVIEW_URL:value.previewUrl,
      CANONICAL_HANDS_ON_ACCESS_BUNDLE:JSON.stringify(value),
      AUTHENTICATED_ACCEPTANCE_SUPABASE_URL:`https://${value.targetProjectRef}.supabase.co`,
      AUTHENTICATED_ACCEPTANCE_DATABASE_URL:`postgresql://postgres:private@db.${value.targetProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
      AUTHENTICATED_ACCEPTANCE_SCOPE:JSON.stringify({organizationId:value.organizationId,workspaceId:value.workspaceId,
        roleIds:{author:roles[0],reviewer:roles[1],approver:roles[2],outsider:ids[0],deliveryOwner:ids[1]}}),
    };
    const revoked=await executeCanonicalHandsOnAccess({env:revokeEnvironment,database:db,authClient:auth,
      fetchImpl:async()=>{throw new Error('preview deliberately gone');}});
    assert.equal(revoked.identitiesRetainedBanned,4);
    const retained=(await db.query(`SELECT
      (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM auth.sessions) sessions,
      (SELECT count(*) FROM public.business_history) history,
      (SELECT count(*) FROM public.profiles WHERE status='disabled') disabled,
      (SELECT count(*) FROM public.organization_members WHERE status='active') active_org,
      (SELECT count(*) FROM public.workspace_memberships WHERE status='active') active_workspace`)).rows[0];
    assert.deepEqual(Object.fromEntries(Object.entries(retained).map(([key,value])=>[key,Number(value)])),
      {users:4,sessions:0,history:4,disabled:4,active_org:0,active_workspace:0});
    assert.equal((await revokeCanonicalHandsOnAccess({db,auth,bundle:value})).exactReplay,true);
    await db.query(`DELETE FROM public.role_capabilities WHERE capability_key='org.admin';
      UPDATE public.studio_artifact_runtime_control SET provider_enabled=false;
      UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false;
      DELETE FROM public.authenticated_synthetic_exercises;
      CREATE OR REPLACE FUNCTION auth.create_profile() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN INSERT INTO public.profiles(id,email,status,metadata) VALUES(NEW.id,NEW.email,''active'',''{"synthetic":true,"canonicalHandsOnBundle":"40000000-0000-4000-8000-000000000099"}''::jsonb); RETURN NEW; END';`);
    const foreignRaw=bundle();foreignRaw.bundleId='40000000-0000-4000-8000-000000000098';
    foreignRaw.personas=foreignRaw.personas.map((persona,index)=>({...persona,
      userId:`50000000-0000-4000-8000-00000000000${index+1}`,
      loginId:`hands-on.ijklmnop.${persona.key==='deliveryOwner'?'delivery-owner':persona.key}@example.invalid`}));
    const foreign=validate(foreignRaw);const foreignAuth=disposableAuth(db,foreign);
    await assert.rejects(prepareCanonicalHandsOnAccess({db,auth:foreignAuth,bundle:foreign}),
      /PARTIAL_STATE_RECONCILIATION_REQUIRED/u);
    const foreignState=(await db.query(`SELECT
      (SELECT count(*) FROM public.profiles WHERE id=ANY($1::uuid[])
        AND metadata->>'canonicalHandsOnBundle'='40000000-0000-4000-8000-000000000099') foreign_profiles,
      (SELECT count(*) FROM public.organization_members WHERE user_id=ANY($1::uuid[])) memberships`,
    [foreign.personas.map(persona=>persona.userId)])).rows[0];
    assert.deepEqual({foreignProfiles:Number(foreignState.foreign_profiles),memberships:Number(foreignState.memberships)},
      {foreignProfiles:4,memberships:0});
    await assert.rejects(revokeCanonicalHandsOnAccess({db,auth:foreignAuth,bundle:foreign}),
      /PARTIAL_STATE_RECONCILIATION_REQUIRED/u,'foreign profile markers must never be adopted even during cleanup');
    await db.query('DELETE FROM auth.users WHERE id=ANY($1::uuid[])',[foreign.personas.map(persona=>persona.userId)]);
  }finally{await db.end();}
});

test('workflow uses protected scope, never uploads access evidence, and keeps revoke operator-managed', () => {
  const workflow=readFileSync(new URL('../.github/workflows/canonical-hands-on-access.yml',import.meta.url),'utf8');
  assert.match(workflow,/environment: hosted-nonproduction-pilot/u);
  assert.match(workflow,/if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow,/git merge-base --is-ancestor "\$REQUESTED_OPERATOR_SHA" "\$GITHUB_SHA"/u);
  assert.match(workflow,/CANONICAL_HANDS_ON_DISPOSABLE_DATABASE_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/canonical_hands_on_disposable/u);
  assert.match(workflow,/AUTHENTICATED_ACCEPTANCE_SCOPE: \$\{\{ secrets\.AUTHENTICATED_ACCEPTANCE_SCOPE \}\}/u);
  assert.doesNotMatch(workflow,/upload-artifact|schedule:|cron:/u);
  const shellBlocks=[...workflow.matchAll(/run: \|\n(?<body>(?: {10}.+\n?)*)/gu)].map(match=>match.groups?.body ?? '');
  assert.equal(shellBlocks.some(block=>/\$\{\{\s*inputs\./u.test(block)),false);
  const source=readFileSync(new URL('./canonicalHandsOnAccess.mjs',import.meta.url),'utf8');
  assert.match(source,/identitiesRetainedBanned: 4/u);
  assert.match(source,/operatorManagedExpiry: true/u);
  assert.match(source,/if \(operation === 'prepare'\) await previewIdentity/u);
});
