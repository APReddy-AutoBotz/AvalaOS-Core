import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';

execFileSync(process.execPath, ['scripts/checkPr1gMigrationContract.mjs'], { stdio: 'inherit' });

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) {
    console.error('DATABASE_URL is required for PR 1G PostgreSQL 16 CI execution.');
    process.exit(1);
  }
  console.log('DATABASE_URL not set; PR 1G PostgreSQL 16 execution not run locally. Static contract check only.');
  process.exit(0);
}

const pg = await import('pg');
const client = new pg.Client({ connectionString: url });
await client.connect();

const executed = [];
const scenario = async (name, fn) => {
  console.log(`PR 1G PostgreSQL scenario started: ${name}`);
  const result = await fn();
  executed.push(name);
  console.log(`PR 1G PostgreSQL scenario passed: ${name}`);
  return result;
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const expectSqlFailure = async (name, expected, fn) => scenario(name, async () => {
  try {
    await fn();
    throw new Error(`${name}: expected SQL failure containing ${expected}`);
  } catch (error) {
    if (!String(error.message).includes(expected)) throw error;
  }
});

let uuidSequence = 1;
const nextUuid = () => `00000000-0000-4000-8000-${String(uuidSequence++).padStart(12, '0')}`;
const ORG = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const WS_B = '33333333-3333-4333-8333-333333333335';
const ACTOR = '44444444-4444-4444-8444-444444444444';
const REVIEWER_A = '44444444-4444-4444-8444-444444444445';
const REVIEWER_B = '44444444-4444-4444-8444-444444444446';
const OTHER_ORG = '22222222-2222-4222-8222-222222222223';
const OTHER_WS = '33333333-3333-4333-8333-333333333334';
const OTHER_APP = '55555555-5555-4555-8555-555555555556';
const ORG_ROLE = '55555555-5555-4555-8555-555555555557';
const OTHER_ACTOR = '44444444-4444-4444-8444-444444444447';
const ORG_ONLY_ACTOR = '44444444-4444-4444-8444-444444444448';
const OTHER_ROLE = '55555555-5555-4555-8555-555555555558';
const WORKSPACE_ROLE = '55555555-5555-4555-8555-555555555559';
const AUTH_VERSION = 7;
const canonicalDimensions = [
  'integration_accessibility',
  'semantic_and_data_clarity',
  'state_and_execution',
  'security_and_control',
  'architecture_changeability',
  'ui_automation_readiness',
  'ai_assisted_engineering_readiness',
];

const canonicalMetadata = (name, overrides = {}) => ({
  name,
  businessCapabilities: [],
  supportedProcesses: [],
  businessCriticality: 'Unknown',
  lifecycleState: 'Unknown',
  sourceCode: 'Unknown',
  documentationQuality: 'Unknown',
  automatedTestMaturity: 'Unknown',
  deploymentRepeatability: 'Unknown',
  observability: 'Unknown',
  dataClassifications: [],
  regulatedData: 'Unknown',
  operatingRegions: [],
  interfaces: [],
  upstreamDependencies: [],
  downstreamDependencies: [],
  realTime: 'Unknown',
  eventDriven: 'Unknown',
  synchronous: 'Unknown',
  batch: 'Unknown',
  synthetic: false,
  ...overrides,
});
const evidenceFor = (sourceType = 'test', synthetic = false) => canonicalDimensions.map((claim, index) => ({
  id: `${sourceType}-${index}-${nextUuid()}`,
  claimIds: [claim],
  sourceType,
  fresh: true,
  independent: true,
  accepted: true,
  contradicts: false,
  synthetic,
}));

const rpc = async (connection, {
  actor = ACTOR,
  type,
  expected = 0,
  key = `idem-${nextUuid()}`,
  payload,
  requestId = nextUuid(),
  org = ORG,
  workspace = WS,
}) => {
  await connection.query('BEGIN');
  try {
    await connection.query('SET LOCAL ROLE service_role');
    const caller=await connection.query('SELECT auth.uid() actor');
    assert(caller.rows[0].actor===null,'SERVICE_ROLE_CALLER_UID_MUST_BE_NULL');
    const result = await connection.query(
      `SELECT public.pr1g_execute_application_command(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::text,$9::jsonb
      ) AS result`,
      [org, workspace, actor, requestId, type, expected, AUTH_VERSION, key, JSON.stringify(payload)],
    );
    await connection.query('COMMIT');
    return result.rows[0].result;
  } catch(error) {
    await connection.query('ROLLBACK');
    throw error;
  }
};
const createApplication = async (name, id = nextUuid()) => {
  const result = await rpc(client, {
    type: 'application.create',
    payload: { applicationId: id, name, description: `${name} application` },
  });
  assert(result.resource.id === id && result.resource.status === 'draft', `CREATE_FAILED_${name}`);
  return id;
};
const createMetadata = async (applicationId, metadata, evidence = [], id = nextUuid()) => {
  const result = await rpc(client, {
    type: 'application.metadata.upsert',
    payload: { applicationId, metadataVersionId: id, metadataVersion: 1, metadata, evidence },
  });
  assert(result.resource.id === id && result.resource.version === 1, `METADATA_FAILED_${metadata.name}`);
  return id;
};
const saveAssessment = async (applicationId, assessmentVersionId, extra = {}, expected = 0, version = 1) => rpc(client, {
  type: 'application.assessment.save',
  expected,
  payload: {
    assessmentVersionId,
    applicationId,
    metadataVersion: 1,
    assessmentVersion: version,
    processLinks: [],
    dependencies: [],
    ...extra,
  },
});
const finalizeAssessment = async (applicationId, assessmentVersionId, expected, metadataVersion = 1, key) => rpc(client, {
  type: 'application.assessment.finalize',
  expected,
  key,
  payload: { assessmentVersionId, applicationId, metadataVersion, rationale: 'Ready for independent review' },
});
const resolveReview = async (connection, actor, applicationId, assessmentVersionId, expected, key, resolution = 'changes_requested') => rpc(connection, {
  actor,
  type: 'application.assessment.review.resolve',
  expected,
  key,
  payload: {
    assessmentVersionId,
    applicationId,
    metadataVersion: 1,
    resolution,
    rationale: 'Independent evidence review',
    conditions: resolution === 'changes_requested' ? ['Add evidence'] : [],
  },
});
const startRevision = async (connection, applicationId, assessmentVersionId, expected, key, rationale = 'Revise after review') => rpc(connection, {
  type: 'application.assessment.revision.start',
  expected,
  key,
  payload: { assessmentVersionId, applicationId, metadataVersion: 1, rationale },
});
const createSnapshot = async (expected, id = nextUuid(), key) => rpc(client, {
  type: 'application.portfolio.snapshot.create',
  expected,
  key,
  payload: { portfolioSnapshotId: id },
});

try {
  await scenario('PostgreSQL 16 version', async () => {
    const version = await client.query('SHOW server_version_num');
    assert(Number(version.rows[0].server_version_num) >= 160000, 'POSTGRESQL_16_REQUIRED');
  });

  await scenario('disposable database schema recreation', async () => {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO postgres');
    await client.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
  });
  await scenario('accepted migration-chain and role setup', async () => {
    await client.query("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await client.query("DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await client.query("DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await client.query('CREATE SCHEMA auth');
    await client.query('CREATE TABLE auth.users(id uuid PRIMARY KEY)');
    await client.query("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$");
    await client.query('GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role');
    await client.query('GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role');
    const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
    const throughPr1g=migrations.slice(0,migrations.indexOf('20260726120000_pr1g_authority_concurrency_correction.sql')+1);
    for(const migration of throughPr1g)await client.query(await readFile(`supabase/migrations/${migration}`,'utf8'));
  });
  await scenario('accepted PR1F schema fixture compatibility', async () => {
    const result = await client.query("SELECT to_regclass('public.assess_v2_review_resolutions') reviews,to_regclass('public.assess_v2_economic_versions') economics");
    assert(result.rows[0].reviews && result.rows[0].economics, 'PR1F_SCHEMA_COMPATIBILITY_FAILED');
  });
  await scenario('capabilities schema', async () => {
    const result = await client.query("SELECT count(*)::int n FROM public.capabilities WHERE capability_key LIKE 'assess.applications.%'");
    assert(result.rows[0].n === 7, 'CAPABILITY_SCHEMA_FAILED');
  });
  await scenario('RPC privilege boundaries', async () => {
    const result = await client.query(`SELECT
      has_function_privilege('public','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') public_execute,
      has_function_privilege('anon','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') anon_execute,
      has_function_privilege('authenticated','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') authenticated_execute,
      has_function_privilege('service_role','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') service_execute,
      has_function_privilege('authenticated','public.pr1g_read_application_portfolio_projection(uuid,uuid)','EXECUTE') authenticated_read`);
    const row = result.rows[0];
    assert(!row.public_execute && !row.anon_execute && !row.authenticated_execute && row.service_execute && row.authenticated_read, 'RPC_PRIVILEGE_BOUNDARY_FAILED');
  });
  await scenario('internal PR 1G function ACL matrix', async () => {
    const signatures = [
      'pr1g_reject_immutable()',
      'pr1g_reject_finalized_metadata_update()',
      'pr1g_error_envelope(text)',
      'pr1g_assert_application_authority(uuid,uuid,uuid,text,bigint)',
      'pr1g_command_capability(text)',
      'pr1g_evidence_valid(jsonb)',
      'pr1g_metadata_valid(jsonb)',
      'pr1g_evidence_confidence(uuid,text)',
      'pr1g_copy_application_decisions(uuid,uuid)',
      'pr1g_dimension_missing_evidence(jsonb,text)',
      'pr1g_derive_process_link_authority()',
      'pr1g_verified_process_links(uuid,uuid)',
    ];
    for (const signature of signatures) {
      const result = await client.query(
        `SELECT has_function_privilege('public',$1,'EXECUTE') public_execute,
          has_function_privilege('anon',$1,'EXECUTE') anon_execute,
          has_function_privilege('authenticated',$1,'EXECUTE') authenticated_execute,
          has_function_privilege('service_role',$1,'EXECUTE') service_execute`,
        [`public.${signature}`],
      );
      assert(Object.values(result.rows[0]).every((value) => value === false), `INTERNAL_FUNCTION_ACL_EXPOSED_${signature}`);
    }
  });
  const expectRoleHelperDenial = async (name, role, sql, parameters = []) => expectSqlFailure(name, 'permission denied for function', async () => {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query(sql, parameters);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  await expectRoleHelperDenial('anon internal helper direct invocation denial','anon',"SELECT public.pr1g_evidence_confidence($1,'security_and_control')",[nextUuid()]);
  await expectRoleHelperDenial('authenticated detailed helper direct invocation denial','authenticated',"SELECT public.pr1g_evidence_confidence($1,'security_and_control')",[nextUuid()]);
  await expectRoleHelperDenial('authenticated snapshot helper direct invocation denial','authenticated','SELECT * FROM public.pr1g_verified_process_links($1,$2)',[ORG,WS]);
  await expectRoleHelperDenial('cross-tenant internal helper direct invocation denial','authenticated','SELECT * FROM public.pr1g_verified_process_links($1,$2)',[OTHER_ORG,OTHER_WS]);
  await scenario('forced RLS on every PR 1G tenant table', async () => {
    const result = await client.query("SELECT count(*)::int n FROM pg_class WHERE relname LIKE 'assess_application_%' AND relforcerowsecurity");
    assert(result.rows[0].n === 11, 'RLS_NOT_FORCED_ON_ALL_TABLES');
  });

  await scenario('tenant and actor authority fixtures', async () => {
    await client.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4),($5)', [ACTOR, REVIEWER_A, REVIEWER_B, OTHER_ACTOR, ORG_ONLY_ACTOR]);
    await client.query("INSERT INTO public.profiles(id,email) VALUES($1,'actor@example.invalid'),($2,'reviewer-a@example.invalid'),($3,'reviewer-b@example.invalid'),($4,'other@example.invalid'),($5,'org-only@example.invalid')", [ACTOR, REVIEWER_A, REVIEWER_B, OTHER_ACTOR, ORG_ONLY_ACTOR]);
    await client.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Tenant A','tenant-a'),($2,'Tenant B','tenant-b')", [ORG, OTHER_ORG]);
    await client.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Workspace A','workspace-a'),($3,$2,'Workspace B','workspace-b'),($4,$5,'Other tenant workspace','other-workspace')", [WS, ORG, WS_B, OTHER_WS, OTHER_ORG]);
    await client.query("INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'PR1G authority','pr1g-authority','organization','[]'),($3,$4,'Other authority','other-authority','organization','[]')", [ORG_ROLE, ORG, OTHER_ROLE, OTHER_ORG]);
    await client.query("INSERT INTO public.roles(id,org_id,workspace_id,name,slug,scope,permissions) VALUES($1,$2,$3,'Workspace authority','workspace-authority','workspace','[]')",[WORKSPACE_ROLE,ORG,WS]);
    await client.query("INSERT INTO public.role_capabilities(role_id,capability_key) SELECT $1,capability_key FROM public.capabilities WHERE capability_key LIKE 'assess.applications.%'", [ORG_ROLE]);
    await client.query("INSERT INTO public.role_capabilities(role_id,capability_key) SELECT $1,capability_key FROM public.capabilities WHERE capability_key LIKE 'assess.applications.%'", [OTHER_ROLE]);
    await client.query("INSERT INTO public.role_capabilities(role_id,capability_key) SELECT $1,capability_key FROM public.capabilities WHERE capability_key LIKE 'assess.applications.%'", [WORKSPACE_ROLE]);
    await client.query('ALTER TABLE public.organization_members DISABLE TRIGGER trg_pr1b_org_membership_role_scope');
    await client.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$5,'active'),($1,$3,$5,'active'),($1,$4,$5,'active'),($1,$9,$5,'active'),($6,$7,$8,'active')", [ORG, ACTOR, REVIEWER_A, REVIEWER_B, ORG_ROLE, OTHER_ORG, OTHER_ACTOR, OTHER_ROLE, ORG_ONLY_ACTOR]);
    await client.query('ALTER TABLE public.organization_members ENABLE TRIGGER trg_pr1b_org_membership_role_scope');
    await client.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) VALUES($1,$2,$3,NULL,'active'),($1,$4,$3,NULL,'active'),($1,$2,$5,NULL,'active'),($1,$2,$6,$10,'active'),($7,$8,$9,NULL,'active')", [ORG, WS, ACTOR, WS_B, REVIEWER_A, REVIEWER_B, OTHER_ORG, OTHER_WS, OTHER_ACTOR, WORKSPACE_ROLE]);
    await client.query('INSERT INTO public.authorization_versions(org_id,user_id,version) VALUES($1,$2,$5),($1,$3,$5),($1,$4,$5),($1,$8,$5),($6,$7,$5) ON CONFLICT(org_id,user_id) DO UPDATE SET version=excluded.version', [ORG, ACTOR, REVIEWER_A, REVIEWER_B, AUTH_VERSION, OTHER_ORG, OTHER_ACTOR, ORG_ONLY_ACTOR]);
    await client.query('INSERT INTO public.assess_application_assets(id,org_id,workspace_id,name,normalized_name,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [OTHER_APP, OTHER_ORG, OTHER_WS, 'Other tenant app', 'other tenant app', 'Tenant B', ACTOR]);
  });

  const resetActorVersion=()=>client.query('UPDATE public.authorization_versions SET version=$1 WHERE org_id=$2 AND user_id IN($3,$4,$5,$6)',[AUTH_VERSION,ORG,ACTOR,REVIEWER_A,REVIEWER_B,ORG_ONLY_ACTOR]);
  const replaceOrganizationApplicationCapabilities=async(capabilities)=>{
    await client.query("DELETE FROM role_capabilities WHERE role_id=$1 AND capability_key LIKE 'assess.applications.%'",[ORG_ROLE]);
    for(const capability of capabilities)await client.query('INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,$2)',[ORG_ROLE,capability]);
    await resetActorVersion();
  };
  const restoreOrganizationApplicationCapabilities=()=>replaceOrganizationApplicationCapabilities([
    'assess.applications.read','assess.applications.write','assess.applications.import','assess.applications.finalize',
    'assess.applications.review','assess.applications.portfolio.read','assess.applications.portfolio.write',
  ]);
  const restoreOrganizationMembership=async()=>{await client.query('ALTER TABLE organization_members DISABLE TRIGGER trg_pr1b_org_membership_role_scope');try{await client.query("INSERT INTO organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')",[ORG,ACTOR,ORG_ROLE])}finally{await client.query('ALTER TABLE organization_members ENABLE TRIGGER trg_pr1b_org_membership_role_scope')}};
  const deniedAuthority=async(name,actor,change,restore,expected='PR1B_NOT_FOUND')=>{
    await change();
    await expectSqlFailure(name,expected,()=>rpc(client,{actor,type:'application.create',payload:{applicationId:nextUuid(),name:'Denied actor',description:'Denied'}}));
    await restore();
    await resetActorVersion();
  };
  await expectSqlFailure('fabricated actor governed denial','PR1B_NOT_FOUND',()=>rpc(client,{actor:nextUuid(),type:'application.create',payload:{applicationId:nextUuid(),name:'Denied',description:'Denied'}}));
  await deniedAuthority('inactive profile governed denial',ACTOR,()=>client.query("UPDATE profiles SET status='disabled' WHERE id=$1",[ACTOR]),()=>client.query("UPDATE profiles SET status='active' WHERE id=$1",[ACTOR]));
  await deniedAuthority('deleted profile governed denial',ACTOR,()=>client.query('UPDATE profiles SET deleted_at=now() WHERE id=$1',[ACTOR]),()=>client.query('UPDATE profiles SET deleted_at=NULL WHERE id=$1',[ACTOR]));
  await deniedAuthority('missing organization membership governed denial',ACTOR,()=>client.query('DELETE FROM organization_members WHERE org_id=$1 AND user_id=$2',[ORG,ACTOR]),restoreOrganizationMembership);
  await deniedAuthority('inactive organization membership governed denial',ACTOR,()=>client.query("UPDATE organization_members SET status='disabled' WHERE org_id=$1 AND user_id=$2",[ORG,ACTOR]),()=>client.query("UPDATE organization_members SET status='active' WHERE org_id=$1 AND user_id=$2",[ORG,ACTOR]));
  await deniedAuthority('deleted organization membership governed denial',ACTOR,()=>client.query('UPDATE organization_members SET deleted_at=now() WHERE org_id=$1 AND user_id=$2',[ORG,ACTOR]),()=>client.query('UPDATE organization_members SET deleted_at=NULL WHERE org_id=$1 AND user_id=$2',[ORG,ACTOR]));
  await deniedAuthority('missing workspace membership governed denial',ACTOR,()=>client.query('DELETE FROM workspace_memberships WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3',[ORG,WS,ACTOR]),()=>client.query("INSERT INTO workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')",[ORG,WS,ACTOR]));
  await deniedAuthority('inactive workspace membership governed denial',ACTOR,()=>client.query("UPDATE workspace_memberships SET status='disabled' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[ORG,WS,ACTOR]),()=>client.query("UPDATE workspace_memberships SET status='active' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[ORG,WS,ACTOR]));
  await deniedAuthority('deleted workspace membership governed denial',ACTOR,()=>client.query('UPDATE workspace_memberships SET deleted_at=now() WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3',[ORG,WS,ACTOR]),()=>client.query('UPDATE workspace_memberships SET deleted_at=NULL WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3',[ORG,WS,ACTOR]));
  await deniedAuthority('inactive organization governed denial',ACTOR,()=>client.query("UPDATE organizations SET status='disabled' WHERE id=$1",[ORG]),()=>client.query("UPDATE organizations SET status='active' WHERE id=$1",[ORG]));
  await deniedAuthority('deleted organization governed denial',ACTOR,()=>client.query('UPDATE organizations SET deleted_at=now() WHERE id=$1',[ORG]),()=>client.query('UPDATE organizations SET deleted_at=NULL WHERE id=$1',[ORG]));
  await deniedAuthority('inactive workspace governed denial',ACTOR,()=>client.query("UPDATE workspaces SET status='disabled' WHERE id=$1 AND org_id=$2",[WS,ORG]),()=>client.query("UPDATE workspaces SET status='active' WHERE id=$1 AND org_id=$2",[WS,ORG]));
  await deniedAuthority('deleted workspace governed denial',ACTOR,()=>client.query('UPDATE workspaces SET deleted_at=now() WHERE id=$1 AND org_id=$2',[WS,ORG]),()=>client.query('UPDATE workspaces SET deleted_at=NULL WHERE id=$1 AND org_id=$2',[WS,ORG]));
  await deniedAuthority('missing organization role capability governed denial',ACTOR,()=>client.query("DELETE FROM role_capabilities WHERE role_id=$1 AND capability_key='assess.applications.write'",[ORG_ROLE]),()=>client.query("INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,'assess.applications.write')",[ORG_ROLE]));
  await deniedAuthority('inactive organization role governed denial',ACTOR,()=>client.query("UPDATE roles SET status='disabled' WHERE id=$1",[ORG_ROLE]),()=>client.query("UPDATE roles SET status='active' WHERE id=$1",[ORG_ROLE]));
  await deniedAuthority('deleted organization role governed denial',ACTOR,()=>client.query('UPDATE roles SET deleted_at=now() WHERE id=$1',[ORG_ROLE]),()=>client.query('UPDATE roles SET deleted_at=NULL WHERE id=$1',[ORG_ROLE]));
  const disableOrganizationWrite=()=>client.query("DELETE FROM role_capabilities WHERE role_id=$1 AND capability_key='assess.applications.write'",[ORG_ROLE]);
  const restoreOrganizationWrite=()=>client.query("INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,'assess.applications.write') ON CONFLICT DO NOTHING",[ORG_ROLE]);
  await deniedAuthority('missing workspace role capability governed denial',REVIEWER_B,async()=>{await disableOrganizationWrite();await client.query("DELETE FROM role_capabilities WHERE role_id=$1 AND capability_key='assess.applications.write'",[WORKSPACE_ROLE])},async()=>{await client.query("INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,'assess.applications.write')",[WORKSPACE_ROLE]);await restoreOrganizationWrite()});
  await deniedAuthority('inactive workspace role governed denial',REVIEWER_B,async()=>{await disableOrganizationWrite();await client.query("UPDATE roles SET status='disabled' WHERE id=$1",[WORKSPACE_ROLE])},async()=>{await client.query("UPDATE roles SET status='active' WHERE id=$1",[WORKSPACE_ROLE]);await restoreOrganizationWrite()});
  await deniedAuthority('deleted workspace role governed denial',REVIEWER_B,async()=>{await disableOrganizationWrite();await client.query('UPDATE roles SET deleted_at=now() WHERE id=$1',[WORKSPACE_ROLE])},async()=>{await client.query('UPDATE roles SET deleted_at=NULL WHERE id=$1',[WORKSPACE_ROLE]);await restoreOrganizationWrite()});
  await expectSqlFailure('actor belonging only to another tenant governed denial','PR1B_NOT_FOUND',()=>rpc(client,{actor:OTHER_ACTOR,type:'application.create',payload:{applicationId:nextUuid(),name:'Other tenant',description:'Denied'}}));
  await expectSqlFailure('organization actor without target workspace governed denial','PR1B_NOT_FOUND',()=>rpc(client,{actor:ORG_ONLY_ACTOR,type:'application.create',payload:{applicationId:nextUuid(),name:'Org only',description:'Denied'}}));
  await expectSqlFailure('stale authorization version governed denial','PR1B_AUTHORIZATION_STALE',async()=>{await client.query('UPDATE authorization_versions SET version=$1 WHERE org_id=$2 AND user_id=$3',[AUTH_VERSION+1,ORG,ACTOR]);try{return await rpc(client,{type:'application.create',payload:{applicationId:nextUuid(),name:'Stale',description:'Denied'}})}finally{await resetActorVersion()}});
  for(const [name,capability] of [
    ['portfolio read alone cannot create snapshot','assess.applications.portfolio.read'],
    ['general application read cannot create snapshot','assess.applications.read'],
    ['general application write cannot create snapshot','assess.applications.write'],
  ])await expectSqlFailure(name,'PR1B_NOT_FOUND',async()=>{await replaceOrganizationApplicationCapabilities([capability]);try{return await createSnapshot(0)}finally{await restoreOrganizationApplicationCapabilities()}});
  await scenario('portfolio write permits snapshot for valid active actor',async()=>{
    await replaceOrganizationApplicationCapabilities(['assess.applications.portfolio.write']);
    try{await client.query("SELECT public.pr1g_assert_application_authority($1,$2,$3,'assess.applications.portfolio.write',$4)",[ACTOR,ORG,WS,AUTH_VERSION])}finally{await restoreOrganizationApplicationCapabilities()}
  });
  await expectSqlFailure('revoked actor cannot create snapshot with portfolio write','PR1B_NOT_FOUND',async()=>{await client.query("UPDATE workspace_memberships SET status='disabled' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[ORG,WS,ACTOR]);try{return await createSnapshot(0)}finally{await client.query("UPDATE workspace_memberships SET status='active' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[ORG,WS,ACTOR]);await resetActorVersion()}});
  await expectSqlFailure('cross-tenant actor cannot create snapshot with portfolio write','PR1B_NOT_FOUND',()=>rpc(client,{actor:OTHER_ACTOR,type:'application.portfolio.snapshot.create',expected:0,payload:{portfolioSnapshotId:nextUuid()}}));
  await expectSqlFailure('feature-disabled governed denial','PR1G_FEATURE_DISABLED',async()=>{await client.query("SELECT set_config('app.pr1g_enabled','off',false)");try{return await rpc(client,{type:'application.create',payload:{applicationId:nextUuid(),name:'Disabled',description:'Denied'}})}finally{await client.query("SELECT set_config('app.pr1g_enabled','on',false)")}});
  await expectSqlFailure('read-only governed denial','PR1G_READ_ONLY',async()=>{await client.query("SELECT set_config('app.pr1g_read_only','on',false)");try{return await rpc(client,{type:'application.create',payload:{applicationId:nextUuid(),name:'Read only',description:'Denied'}})}finally{await client.query("SELECT set_config('app.pr1g_read_only','off',false)")}});
  await scenario('service-role mutation accepts valid actor with null auth uid',async()=>{const id=await createApplication('Null caller uid authority');assert(Boolean(id),'VALID_ACTOR_SERVICE_ROLE_FAILED')});
  const delegatedWorkspaceGuardId=nextUuid();
  const delegatedWorkspaceGuardKey=`delegated-workspace-${nextUuid()}`;
  const delegatedWorkspaceGuardPayload={applicationId:delegatedWorkspaceGuardId,name:'Delegated workspace guard',description:'Workspace A authority'};
  const delegatedWorkspaceGuardFirst=await rpc(client,{type:'application.create',key:delegatedWorkspaceGuardKey,payload:delegatedWorkspaceGuardPayload});
  await scenario('delegated command same-workspace exact replay',async()=>{
    const replay=await rpc(client,{type:'application.create',key:delegatedWorkspaceGuardKey,payload:delegatedWorkspaceGuardPayload});
    assert(replay.resource.id===delegatedWorkspaceGuardFirst.resource.id,'DELEGATED_SAME_WORKSPACE_REPLAY_RESOURCE_FAILED');
  });
  await expectSqlFailure('delegated command same-workspace changed-payload conflict','PR1B_IDEMPOTENCY_CONFLICT',()=>rpc(client,{
    type:'application.create',key:delegatedWorkspaceGuardKey,payload:{...delegatedWorkspaceGuardPayload,description:'Changed payload'},
  }));
  await scenario('delegated-command cross-workspace receipt denial',async()=>{
    const before=await client.query(`SELECT
      (SELECT count(*)::int FROM assess_application_assets WHERE org_id=$1 AND workspace_id=$2) applications,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$2) receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$2) audits`,[ORG,WS_B]);
    await expectSqlFailure('delegated cross-workspace stable idempotency conflict','PR1B_IDEMPOTENCY_CONFLICT',()=>rpc(client,{
      workspace:WS_B,type:'application.create',key:delegatedWorkspaceGuardKey,payload:delegatedWorkspaceGuardPayload,
    }));
    const after=await client.query(`SELECT
      (SELECT count(*)::int FROM assess_application_assets WHERE org_id=$1 AND workspace_id=$2) applications,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$2) receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$2) audits,
      (SELECT count(*)::int FROM assess_application_assets WHERE id=$3 AND org_id=$1 AND workspace_id=$2) disclosed_resource`,
    [ORG,WS_B,delegatedWorkspaceGuardId]);
    assert(JSON.stringify(before.rows[0])===JSON.stringify({
      applications:after.rows[0].applications,receipts:after.rows[0].receipts,audits:after.rows[0].audits,
    }),'DELEGATED_CROSS_WORKSPACE_SIDE_EFFECT');
    assert(after.rows[0].disclosed_resource===0,'DELEGATED_CROSS_WORKSPACE_RESOURCE_DISCLOSED');
  });
  await scenario('authorization-before-receipt inspection',async()=>{
    await client.query('UPDATE authorization_versions SET version=$1 WHERE org_id=$2 AND user_id=$3',[AUTH_VERSION+1,ORG,ACTOR]);
    try {
      await expectSqlFailure('stale actor rejected before foreign-workspace receipt inspection','PR1B_AUTHORIZATION_STALE',()=>rpc(client,{
        workspace:WS_B,type:'application.create',key:delegatedWorkspaceGuardKey,payload:delegatedWorkspaceGuardPayload,
      }));
    } finally {
      await resetActorVersion();
    }
    await disableOrganizationWrite();
    try {
      await expectSqlFailure('unauthorized actor rejected before foreign-workspace receipt inspection','PR1B_NOT_FOUND',()=>rpc(client,{
        workspace:WS_B,type:'application.create',key:delegatedWorkspaceGuardKey,payload:delegatedWorkspaceGuardPayload,
      }));
    } finally {
      await restoreOrganizationWrite();
      await resetActorVersion();
    }
    await expectSqlFailure('cross-tenant actor rejected before receipt inspection','PR1B_NOT_FOUND',()=>rpc(client,{
      actor:OTHER_ACTOR,workspace:WS_B,type:'application.create',key:delegatedWorkspaceGuardKey,payload:delegatedWorkspaceGuardPayload,
    }));
  });
  await scenario('concurrent authorization lock serializes revocation and next mutation denies',async()=>{
    const authoritySession=new pg.Client({connectionString:url}),revocationSession=new pg.Client({connectionString:url});await Promise.all([authoritySession.connect(),revocationSession.connect()]);
    try{
      await authoritySession.query('BEGIN');await authoritySession.query("SELECT public.pr1b_assert_command_authority($1,$2,$3,'assess.applications.write',$4)",[ACTOR,ORG,WS,AUTH_VERSION]);
      let revoked=false;const revocation=revocationSession.query("UPDATE workspace_memberships SET status='disabled' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[ORG,WS,ACTOR]).then(()=>{revoked=true});
      await new Promise(resolve=>setTimeout(resolve,50));assert(!revoked,'REVOCATION_INTERLEAVED_WITH_AUTHORITY_LOCK');
      await authoritySession.query('COMMIT');await revocation;
      await expectSqlFailure('post-revocation next mutation governed denial','PR1B_NOT_FOUND',()=>rpc(client,{type:'application.create',payload:{applicationId:nextUuid(),name:'Revoked',description:'Denied'}}));
      await revocationSession.query("UPDATE workspace_memberships SET status='active' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[ORG,WS,ACTOR]);await resetActorVersion();
    }finally{await Promise.all([authoritySession.end(),revocationSession.end()])}
  });

  const gatedApp = await createApplication('Gated UI');
  const gatedMeta = await createMetadata(
    gatedApp,
    canonicalMetadata('Gated UI', { interfaces: ['UI-only'] }),
    evidenceFor(),
  );
  const gatedAssessment = nextUuid();
  await scenario('assessment save derives exactly seven unique canonical dimensions', async () => {
    await saveAssessment(gatedApp, gatedAssessment);
    const result = await client.query(
      'SELECT count(*)::int total,count(DISTINCT dimension)::int unique_count,array_agg(dimension ORDER BY dimension) names FROM public.assess_application_dimension_results WHERE assessment_version_id=$1',
      [gatedAssessment],
    );
    assert(result.rows[0].total === 7 && result.rows[0].unique_count === 7, 'SEVEN_UNIQUE_DIMENSIONS_REQUIRED');
    assert(JSON.stringify(result.rows[0].names) === JSON.stringify([...canonicalDimensions].sort()), 'CANONICAL_DIMENSION_NAMES_MISMATCH');
  });
  await scenario('server-derived recommendation and hard-gate behavior', async () => {
    const result = await client.query(
      `SELECT r.disposition,r.evidence_confidence,r.prerequisites,r.alternatives_rejected,
        (SELECT hard_gates FROM public.assess_application_dimension_results WHERE assessment_version_id=$1 AND dimension='ui_automation_readiness') ui_gates
       FROM public.assess_application_modernization_recommendations r WHERE r.assessment_version_id=$1`,
      [gatedAssessment],
    );
    assert(result.rowCount === 1, 'SERVER_RECOMMENDATION_REQUIRED');
    assert(result.rows[0].disposition === 'Insufficient evidence', 'HARD_GATE_DISPOSITION_MISMATCH');
    assert(result.rows[0].ui_gates.includes('UI_AUTOMATION_POSITIVE_EVIDENCE_REQUIRED'), 'UI_HARD_GATE_MISSING');
    assert(result.rows[0].alternatives_rejected.includes('UI_AUTOMATION_POSITIVE_EVIDENCE_REQUIRED'), 'RECOMMENDATION_GATE_MISSING');
    assert(result.rows[0].prerequisites.includes('stableInterface'), 'RECOMMENDATION_EVIDENCE_PREREQUISITE_MISSING');
  });
  const completeBridge={stableInterface:true,controlAccessibility:true,deterministicErrorDetection:true,reversibilityOrCompensation:true,materialActionApproval:true,monitoring:true,humanOwner:true};
  const completeAi={legalSourceRights:true,executableAcceptanceTests:true,reproducibleBuild:true,controlledSecurityReview:true,humanEngineeringOwner:true,controlledDeploymentRollback:true};
  const parityDefinitions=[
    {name:'native API event',metadata:canonicalMetadata('Native API event',{interfaces:['REST/GraphQL','messaging/event']})},
    {name:'file batch',metadata:canonicalMetadata('File batch',{interfaces:['file/batch'],batch:true,realTime:false,synchronous:false})},
    {name:'low documentation',metadata:canonicalMetadata('Low documentation',{documentationQuality:'low'})},
    {name:'regulated data',metadata:canonicalMetadata('Regulated data',{regulatedData:true})},
    {name:'unavailable source',metadata:canonicalMetadata('Unavailable source',{sourceCode:'unavailable'})},
    {name:'batch execution',metadata:canonicalMetadata('Batch execution',{batch:true,realTime:false,synchronous:false})},
    {name:'UI incomplete bridge',metadata:canonicalMetadata('UI incomplete bridge',{interfaces:['UI-only'],bridgeEvidence:{stableInterface:true}})},
    {name:'UI complete bridge',metadata:canonicalMetadata('UI complete bridge',{interfaces:['UI-only'],bridgeEvidence:completeBridge})},
    {name:'incomplete AI controls',metadata:canonicalMetadata('Incomplete AI controls',{aiControls:{legalSourceRights:true}})},
    {name:'complete AI insufficient evidence',metadata:canonicalMetadata('Complete AI insufficient evidence',{aiControls:completeAi}),evidence:[]},
    {name:'complete AI accepted evidence',metadata:canonicalMetadata('Complete AI accepted evidence',{aiControls:completeAi})},
    {name:'age invariant young',assetName:'Age invariant young asset',metadata:canonicalMetadata('Age invariant',{ageYears:2})},
    {name:'age invariant old',assetName:'Age invariant old asset',metadata:canonicalMetadata('Age invariant',{ageYears:47})},
  ];
  await scenario('mechanical PostgreSQL and production TypeScript evaluator parity',async()=>{
    const bridgeFixtures=[];
    for(const definition of parityDefinitions){
      const evidence=definition.evidence??evidenceFor();
      const applicationId=await createApplication(definition.assetName??definition.name);
      await createMetadata(applicationId,definition.metadata,evidence);
      const assessmentVersionId=nextUuid();
      await saveAssessment(applicationId,assessmentVersionId);
      const dimensionsResult=await client.query(`SELECT dimension,readiness_band AS band,evidence_confidence AS confidence,hard_gates AS "hardGates",evidence_refs AS "evidenceReferences",missing_evidence AS "missingEvidence",rationale,contradictions,remediation_requirements AS "remediationRequirements",what_would_change AS "whatWouldChange"
        FROM assess_application_dimension_results WHERE assessment_version_id=$1 ORDER BY dimension`,[assessmentVersionId]);
      const recommendationResult=await client.query(`SELECT disposition,application_id AS "applicationId",1 AS "metadataVersion",affected_processes AS "affectedProcesses",affected_primitives AS "affectedPrimitives",why,alternatives_considered AS "alternativesConsidered",alternatives_rejected AS "alternativesRejected",prerequisites,required_controls AS "requiredControls",migration_boundary AS "migrationBoundary",dependency_impacts AS "dependencyImpacts",rollback_strategy AS rollback,evidence_confidence AS confidence,open_evidence_gaps AS "openEvidenceGaps",what_would_change AS "whatWouldChange"
        FROM assess_application_modernization_recommendations WHERE assessment_version_id=$1 ORDER BY id LIMIT 1`,[assessmentVersionId]);
      bridgeFixtures.push({name:definition.name,applicationId,orgId:ORG,workspaceId:WS,metadataVersion:1,metadata:definition.metadata,evidence,postgres:{dimensions:dimensionsResult.rows,recommendation:recommendationResult.rows[0]}});
    }
    const parityPath=`/tmp/avalaos-pr1g-parity-${process.pid}.json`;
    await writeFile(parityPath,JSON.stringify(bridgeFixtures),{mode:0o600});
    try{execFileSync(process.execPath,['scripts/runPr1gApplicationPortfolioParityBridge.mjs',parityPath],{stdio:'inherit'})}finally{await unlink(parityPath)}
  });
  await scenario('client-authored authority fields are rejected', async () => {
    for (const field of ['dimensions', 'recommendations', 'confidence', 'bands', 'gates', 'dispositions']) {
      const before = await client.query('SELECT count(*)::int n FROM public.assess_application_assessment_versions');
      try {
        await saveAssessment(gatedApp, nextUuid(), { [field]: [] }, 1, 2);
        throw new Error(`CLIENT_AUTHORED_${field.toUpperCase()}_ACCEPTED`);
      } catch (error) {
        assert(String(error.message).includes('PR1G_INVALID_COMMAND'), `CLIENT_AUTHORED_${field.toUpperCase()}_WRONG_ERROR`);
      }
      const after = await client.query('SELECT count(*)::int n FROM public.assess_application_assessment_versions');
      assert(after.rows[0].n === before.rows[0].n, `CLIENT_AUTHORED_${field.toUpperCase()}_PERSISTED`);
    }
  });

  const syntheticApp = await createApplication('Synthetic evidence');
  const syntheticEvidence = evidenceFor('synthetic_fixture', true);
  const syntheticMeta = await createMetadata(
    syntheticApp,
    canonicalMetadata('Synthetic evidence', { synthetic: true }),
    syntheticEvidence,
  );
  const syntheticAssessment = nextUuid();
  await scenario('durable immutable source evidence and synthetic evidence never verifies', async () => {
    await saveAssessment(syntheticApp, syntheticAssessment);
    const confidence = await client.query('SELECT array_agg(DISTINCT evidence_confidence) confidences FROM public.assess_application_dimension_results WHERE assessment_version_id=$1', [syntheticAssessment]);
    assert(!confidence.rows[0].confidences.includes('Verified'), 'SYNTHETIC_EVIDENCE_VERIFIED');
    await expectSqlFailure('source evidence update immutability', 'PR1G_IMMUTABLE_RECORD', () => client.query('UPDATE public.assess_application_source_evidence SET accepted=false WHERE metadata_version_id=$1', [syntheticMeta]));
    await expectSqlFailure('source evidence delete immutability', 'PR1G_IMMUTABLE_RECORD', () => client.query('DELETE FROM public.assess_application_source_evidence WHERE metadata_version_id=$1', [syntheticMeta]));
    const durable = await client.query('SELECT count(*)::int n FROM public.assess_application_source_evidence WHERE metadata_version_id=$1', [syntheticMeta]);
    assert(durable.rows[0].n === 7, 'SOURCE_EVIDENCE_NOT_DURABLE');
  });

  const malformedRows = [
    { name: '' },
    { ...canonicalMetadata('Unknown property'), unsupportedAuthority: true },
    { ...canonicalMetadata('Wrong array'), interfaces: 'REST/GraphQL' },
    { ...canonicalMetadata('Wrong enum'), sourceCode: 'trusted' },
    { ...canonicalMetadata('Wrong boolean'), regulatedData: 'false' },
    { ...canonicalMetadata('Malformed bridge controls'), bridgeEvidence: { stableInterface: 'yes' } },
    { ...canonicalMetadata('Malformed AI controls'), aiControls: { legalSourceRights: 1 } },
    { ...canonicalMetadata('Malformed evidence'), evidence:[{id:'bad',claimIds:'not-an-array',sourceType:'test',fresh:true,independent:true,accepted:true}] },
    { ...canonicalMetadata('Duplicate evidence identifiers'), evidence:[
      {id:'duplicate',claimIds:['integration_accessibility'],sourceType:'test',fresh:true,independent:true,accepted:true},
      {id:'duplicate',claimIds:['semantic_and_data_clarity'],sourceType:'test',fresh:true,independent:true,accepted:true},
    ] },
  ];
  const importReceiptId = nextUuid();
  await scenario('strict malformed import-row rejection', async () => {
    const valid = canonicalMetadata('Imported valid');
    await rpc(client, {
      type: 'application.import',
      payload: { importReceiptId, payloadHash: 'strict-import', rows: [valid, ...malformedRows] },
    });
    const result = await client.query(
      "SELECT count(*) FILTER(WHERE outcome='success')::int successes,count(*) FILTER(WHERE outcome='rejected')::int rejections,count(*) FILTER(WHERE outcome='rejected' AND error_code='INVALID_METADATA')::int invalid FROM public.assess_application_import_row_outcomes WHERE import_receipt_id=$1",
      [importReceiptId],
    );
    assert(result.rows[0].successes === 1 && result.rows[0].rejections === 9 && result.rows[0].invalid === 9, 'STRICT_IMPORT_REJECTION_FAILED');
  });
  await scenario('import receipt counts match persisted row outcomes', async () => {
    const result = await client.query(
      `SELECT r.success_count,r.rejection_count,
        count(*) FILTER(WHERE o.outcome='success')::int persisted_successes,
        count(*) FILTER(WHERE o.outcome='rejected')::int persisted_rejections
       FROM public.assess_application_import_receipts r
       JOIN public.assess_application_import_row_outcomes o ON o.import_receipt_id=r.id
       WHERE r.id=$1 GROUP BY r.id`,
      [importReceiptId],
    );
    const row = result.rows[0];
    assert(row.success_count === row.persisted_successes && row.rejection_count === row.persisted_rejections, 'IMPORT_RECEIPT_COUNTS_MISMATCH');
  });
  const duplicateReceipt=nextUuid(),duplicateKey=`import-duplicates-${nextUuid()}`,duplicatePayload={importReceiptId:duplicateReceipt,payloadHash:'duplicates',rows:[canonicalMetadata('Duplicate in batch'),canonicalMetadata('Duplicate in batch'),canonicalMetadata('Imported valid')]};
  await scenario('mixed import persists batch and existing-workspace duplicate outcomes',async()=>{
    const result=await rpc(client,{type:'application.import',key:duplicateKey,payload:duplicatePayload});
    assert(result.resource.successCount===1&&result.resource.rejectionCount===2,'DUPLICATE_IMPORT_COUNTS_FAILED');
    const outcomes=await client.query('SELECT outcome,error_code FROM assess_application_import_row_outcomes WHERE import_receipt_id=$1 ORDER BY row_number',[duplicateReceipt]);
    assert(outcomes.rows[0].outcome==='success'&&outcomes.rows.slice(1).every(row=>row.error_code==='DUPLICATE_IN_WORKSPACE'),'DUPLICATE_IMPORT_OUTCOMES_FAILED');
  });
  await scenario('unexpected import infrastructure failure aborts and rolls back the complete command',async()=>{
    const receiptId=nextUuid(),requestId=nextUuid(),key=`infrastructure-failure-${nextUuid()}`;
    const validName=`Valid before infrastructure failure ${nextUuid()}`;
    const failureName=`Injected infrastructure failure ${nextUuid()}`;
    await client.query(`CREATE FUNCTION public.pr1g_test_import_infrastructure_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.name LIKE 'Injected infrastructure failure %' THEN RAISE EXCEPTION 'PR1G_TEST_UNEXPECTED_DATABASE_FAILURE'; END IF; RETURN NEW; END $$`);
    await client.query(`CREATE TRIGGER pr1g_test_import_infrastructure_failure BEFORE INSERT ON public.assess_application_assets
      FOR EACH ROW EXECUTE FUNCTION public.pr1g_test_import_infrastructure_failure()`);
    try{
      let failure;
      try{
        await rpc(client,{type:'application.import',key,requestId,payload:{importReceiptId:receiptId,payloadHash:'infrastructure-failure',rows:[
          {...canonicalMetadata(validName),evidence:evidenceFor()},
          {...canonicalMetadata(failureName),evidence:evidenceFor()},
        ]}});
      }catch(error){failure=error}
      assert(failure&&String(failure.message).includes('PR1G_TEST_UNEXPECTED_DATABASE_FAILURE'),'INFRASTRUCTURE_FAILURE_NOT_RETHROWN');
      assert(!String(failure.message).includes('INVALID_METADATA')&&!String(failure.message).includes('DUPLICATE_IN_WORKSPACE'),'INFRASTRUCTURE_FAILURE_CLASSIFIED_AS_ROW_REJECTION');
      const persisted=await client.query(`SELECT
        (SELECT count(*)::int FROM assess_application_import_receipts WHERE id=$1) receipts,
        (SELECT count(*)::int FROM assess_application_import_row_outcomes WHERE import_receipt_id=$1) outcomes,
        (SELECT count(*)::int FROM assess_application_assets WHERE name=ANY($2::text[])) applications,
        (SELECT count(*)::int FROM assess_application_metadata_versions m JOIN assess_application_assets a ON a.id=m.application_id WHERE a.name=ANY($2::text[])) metadata,
        (SELECT count(*)::int FROM assess_application_source_evidence e JOIN assess_application_assets a ON a.id=e.application_id WHERE a.name=ANY($2::text[])) evidence,
        (SELECT count(*)::int FROM privileged_audit_events WHERE request_id=$3 AND action='application.import' AND outcome='succeeded') audits,
        (SELECT count(*)::int FROM assess_command_receipts WHERE request_id=$3) commands`,[receiptId,[validName,failureName],requestId]);
      assert(Object.values(persisted.rows[0]).every(value=>value===0),'INFRASTRUCTURE_FAILURE_LEFT_COMMITTED_IMPORT_STATE');
    }finally{
      await client.query('DROP TRIGGER IF EXISTS pr1g_test_import_infrastructure_failure ON public.assess_application_assets');
      await client.query('DROP FUNCTION IF EXISTS public.pr1g_test_import_infrastructure_failure()');
    }
  });
  await scenario('import exact replay returns durable receipt without duplicate outcomes',async()=>{
    const replay=await rpc(client,{type:'application.import',key:duplicateKey,payload:duplicatePayload});
    assert(replay.resource.id===duplicateReceipt,'IMPORT_REPLAY_RECEIPT_FAILED');
    const count=await client.query('SELECT count(*)::int n FROM assess_application_import_row_outcomes WHERE import_receipt_id=$1',[duplicateReceipt]);
    assert(count.rows[0].n===3,'IMPORT_REPLAY_DUPLICATED_OUTCOMES');
  });
  await expectSqlFailure('import changed-payload idempotency conflict','PR1B_IDEMPOTENCY_CONFLICT',()=>rpc(client,{type:'application.import',key:duplicateKey,payload:{...duplicatePayload,payloadHash:'changed'}}));
  await scenario('500-row import boundary persists exactly 500 governed outcomes',async()=>{
    const receipt=nextUuid(),rows=Array.from({length:500},(_,index)=>canonicalMetadata(`Boundary application ${index}`));
    const result=await rpc(client,{type:'application.import',payload:{importReceiptId:receipt,payloadHash:'boundary-500',rows}});
    assert(result.resource.successCount===500&&result.resource.rejectionCount===0,'IMPORT_500_BOUNDARY_FAILED');
  });
  await expectSqlFailure('501-row import rejected before receipt persistence','PR1G_INVALID_COMMAND',()=>rpc(client,{type:'application.import',payload:{importReceiptId:nextUuid(),payloadHash:'boundary-501',rows:Array.from({length:501},(_,index)=>canonicalMetadata(`Rejected boundary ${index}`))}}));

  await expectSqlFailure('missing dependency rejection', 'violates foreign key constraint', () => saveAssessment(
    syntheticApp,
    nextUuid(),
    { dependencies: [{ upstreamApplicationId: nextUuid(), downstreamApplicationId: syntheticApp, dependencyType: 'runtime' }] },
    1,
    2,
  ));
  await expectSqlFailure('cross-tenant dependency rejection', 'violates foreign key constraint', () => saveAssessment(
    syntheticApp,
    nextUuid(),
    { dependencies: [{ upstreamApplicationId: OTHER_APP, downstreamApplicationId: syntheticApp, dependencyType: 'runtime' }] },
    1,
    2,
  ));

  const readyApp = await createApplication('Verified API');
  const readyMeta = await createMetadata(
    readyApp,
    canonicalMetadata('Verified API', {
      interfaces: ['REST/GraphQL'],
      documentationQuality:'high',
      regulatedData:false,
      sourceCode:'available_legal_access',
      deploymentRepeatability:'deterministic',
      realTime:true,
      synchronous:true,
      aiControls: {
        legalSourceRights: true,
        executableAcceptanceTests: true,
        reproducibleBuild: true,
        controlledSecurityReview: true,
        humanEngineeringOwner: true,
        controlledDeploymentRollback: true,
      },
    }),
    evidenceFor(),
  );
  const readyAssessment = nextUuid();
  await saveAssessment(readyApp, readyAssessment);

  const insufficientApp = await createApplication('Insufficient evidence');
  const insufficientMeta = await createMetadata(insufficientApp, canonicalMetadata('Insufficient evidence'), []);
  const insufficientAssessment = nextUuid();
  await saveAssessment(insufficientApp, insufficientAssessment);

  const authorityProcess=nextUuid(),authorityCase=nextUuid(),authoritySource=nextUuid(),authorityPrimitive=nextUuid();
  const authorityDecision=nextUuid(),authorityReviewAssignment=nextUuid(),authorityReview=nextUuid(),authorityGovern=nextUuid();
  const economicDraft=nextUuid(),economicResolution=nextUuid(),approvedEconomics=nextUuid();
  const fixtureReceipt=async(commandType)=>{
    const id=nextUuid();
    await client.query(`INSERT INTO public.assess_command_receipts(
      id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'succeeded','{}',now())`,
      [id,ORG,WS,ACTOR,commandType,`authority-${nextUuid()}`,nextUuid(),'a'.repeat(64)]);
    return id;
  };
  await scenario('authoritative PR 1D, PR 1E and PR 1F linkage fixture',async()=>{
    const decisionReceipt=await fixtureReceipt('authority.decision');
    const assignmentReceipt=await fixtureReceipt('authority.assignment');
    const reviewReceipt=await fixtureReceipt('authority.review');
    const governReceipt=await fixtureReceipt('authority.govern');
    await client.query('BEGIN');
    try{
      await client.query("INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status,created_by) VALUES($1,$2,$3,'Authoritative process','Draft',$4)",[authorityProcess,ORG,WS,ACTOR]);
      await client.query("INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version,head_version_id) VALUES($1,$2,$3,$4,$5,'govern_resolved',1,$6)",[authorityCase,ORG,WS,authorityProcess,ACTOR,authoritySource]);
      await client.query("INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) VALUES($1,$2,$3,$4,1,'Authoritative case','create',$5)",[authoritySource,authorityCase,ORG,WS,ACTOR]);
      await client.query("INSERT INTO public.assess_v2_primitives(id,version_id,case_id,org_id,workspace_id,payload) VALUES($1,$2,$3,$4,$5,'{}')",[authorityPrimitive,authoritySource,authorityCase,ORG,WS]);
      await client.query(`INSERT INTO public.assess_v2_decision_versions(
        id,case_id,source_version_id,org_id,workspace_id,schema_version,rule_set_version,decision_version,
        validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,
        receipt_id,created_by,created_at)
        VALUES($1,$2,$3,$4,$5,'schema','rules','decision-1','reviewer-ready','{}','[]','{}',$6,$6,$6,$7,$8,now())`,
        [authorityDecision,authorityCase,authoritySource,ORG,WS,'b'.repeat(64),decisionReceipt,ACTOR]);
      await client.query(`INSERT INTO public.assess_v2_review_assignments(
        id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
        review_schema_version,review_sequence,material_claims,reviewer_id,assigned_by,
        assigned_reviewer_authorization_version,assigned_by_authorization_version,request_id,receipt_id,audit_event_id)
        VALUES($1,$2,$3,$4,$5,1,$6,'decision-1','assess-v2-review-2026-07',1,'[]',$7,$7,$8,$8,$9,$10,$11)`,
        [authorityReviewAssignment,ORG,WS,authorityCase,authoritySource,authorityDecision,REVIEWER_A,AUTH_VERSION,nextUuid(),assignmentReceipt,nextUuid()]);
      await client.query(`INSERT INTO public.assess_v2_review_resolutions(
        id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
        review_id,review_schema_version,review_sequence,resolution,reviewed_confidence,rationale,reviewer_id,
        reviewer_authorization_version,request_id,receipt_id,audit_event_id)
        VALUES($1,$2,$3,$4,$5,1,$6,'decision-1',$7,'assess-v2-review-2026-07',1,'approved','Verified','approved',$8,$9,$10,$11,$12)`,
        [authorityReview,ORG,WS,authorityCase,authoritySource,authorityDecision,authorityReviewAssignment,REVIEWER_A,AUTH_VERSION,nextUuid(),reviewReceipt,nextUuid()]);
      await client.query(`INSERT INTO public.assess_v2_govern_resolutions(
        id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
        review_resolution_id,review_schema_version,review_sequence,actions,required_controls,review_frequency,
        accountable_owner,rationale,resolver_id,resolver_authorization_version,request_id,receipt_id,audit_event_id)
        VALUES($1,$2,$3,$4,$5,1,$6,'decision-1',$7,'assess-v2-review-2026-07',1,'[]','[]','annual','owner','resolved',$8,$9,$10,$11,$12)`,
        [authorityGovern,ORG,WS,authorityCase,authoritySource,authorityDecision,authorityReview,REVIEWER_A,AUTH_VERSION,nextUuid(),governReceipt,nextUuid()]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error}
    await client.query(`INSERT INTO public.assess_v2_economic_versions(
      id,org_id,workspace_id,case_id,source_version_id,decision_id,approved_review_id,model_version,formula_version,
      lifecycle,version,currency,baseline_period,analysis_horizon_years,implementation_horizon_months,author_id,
      assumptions,scenario_results,confidence)
      VALUES($1,$2,$3,$4,$5,$6,$7,'assess-v2-economics-model-2026-07','assess-v2-economics-formulas-2026-07',
      'reviewer_ready',1,'USD','FY26',1,12,$8,'{}','[]','Verified')`,
      [economicDraft,ORG,WS,authorityCase,authoritySource,authorityDecision,authorityReview,ACTOR]);
    await client.query(`INSERT INTO public.assess_v2_economic_review_resolutions(
      id,org_id,workspace_id,case_id,decision_id,economic_version_id,approved_review_id,reviewer_id,
      reviewer_authorization_version,resolution,rationale)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved','approved')`,
      [economicResolution,ORG,WS,authorityCase,authorityDecision,economicDraft,authorityReview,REVIEWER_A,AUTH_VERSION]);
    await client.query(`INSERT INTO public.assess_v2_economic_versions(
      id,org_id,workspace_id,case_id,source_version_id,decision_id,approved_review_id,model_version,formula_version,
      lifecycle,version,currency,baseline_period,analysis_horizon_years,implementation_horizon_months,author_id,
      reviewer_id,assumptions,scenario_results,confidence,prior_economic_version_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,'assess-v2-economics-model-2026-07','assess-v2-economics-formulas-2026-07',
      'approved',2,'USD','FY26',1,12,$8,$9,'{}','[]','Verified',$10)`,
      [approvedEconomics,ORG,WS,authorityCase,authoritySource,authorityDecision,authorityReview,ACTOR,REVIEWER_A,economicDraft]);
  });
  const linkedApp=await createApplication('Authoritatively linked application');
  await createMetadata(linkedApp,canonicalMetadata('Authoritatively linked application'),evidenceFor());
  const linkedAssessment=nextUuid();
  const authoritativeLink={
    processId:authorityProcess,primitiveId:authorityPrimitive,applicationId:linkedApp,metadataVersion:1,
    assessmentVersionId:linkedAssessment,interactionType:'read',economicsRef:approvedEconomics,
  };
  await scenario('server derives exact Govern state and approved economics currency',async()=>{
    await saveAssessment(linkedApp,linkedAssessment,{processLinks:[authoritativeLink]});
    const row=(await client.query('SELECT * FROM public.pr1g_verified_process_links($1,$2) WHERE application_id=$3',[ORG,WS,linkedApp])).rows[0];
    assert(row?.case_id===authorityCase&&row.decision_id===authorityDecision&&row.govern_resolution_id===authorityGovern,'GOVERN_ANCESTRY_NOT_DERIVED');
    assert(row.economics_ref===approvedEconomics&&row.economics_currency.trim()==='USD'&&row.economic_review_resolution_id===economicResolution,'ECONOMICS_AUTHORITY_NOT_DERIVED');
  });
  await expectSqlFailure('forged economics reference rejection','PR1G_NOT_FOUND',()=>saveAssessment(linkedApp,nextUuid(),{processLinks:[{...authoritativeLink,assessmentVersionId:nextUuid(),economicsRef:nextUuid()}]},1,2));
  await expectSqlFailure('cross-tenant process reference rejection','PR1G_NOT_FOUND',()=>saveAssessment(linkedApp,nextUuid(),{processLinks:[{...authoritativeLink,processId:nextUuid(),assessmentVersionId:nextUuid(),economicsRef:null}]},1,2));
  await scenario('stale Govern ancestry rejects before link authority',async()=>{
    await client.query("UPDATE public.assess_v2_cases SET status='draft' WHERE id=$1",[authorityCase]);
    try{await expectSqlFailure('stale Govern reference rejection','PR1G_NOT_FOUND',()=>saveAssessment(linkedApp,nextUuid(),{processLinks:[{...authoritativeLink,assessmentVersionId:nextUuid(),economicsRef:null}]},1,2))}
    finally{await client.query("UPDATE public.assess_v2_cases SET status='govern_resolved' WHERE id=$1",[authorityCase])}
  });

  await scenario('multi-node dependency-cycle rejection', async () => {
    await client.query(
      `INSERT INTO public.assess_application_dependencies(org_id,workspace_id,upstream_application_id,downstream_application_id,dependency_type,metadata_version_id,created_by)
       VALUES($1,$2,$3,$4,'runtime',$5,$6),($1,$2,$4,$7,'runtime',$8,$6),($1,$2,$7,$3,'runtime',$9,$6)`,
      [ORG, WS, readyApp, gatedApp, gatedMeta, ACTOR, insufficientApp, insufficientMeta, readyMeta],
    );
    try {
      await createSnapshot(0);
      throw new Error('MULTI_NODE_CYCLE_ACCEPTED');
    } catch (error) {
      assert(String(error.message).includes('PR1G_DEPENDENCY_CYCLE'), 'MULTI_NODE_CYCLE_WRONG_ERROR');
    }
    await client.query('DELETE FROM public.assess_application_dependencies');
  });
  await scenario('legacy unverifiable Govern and economics links remain durable but non-authoritative', async () => {
    const legacyLink=nextUuid();
    await client.query('ALTER TABLE public.assess_process_application_links DISABLE TRIGGER trg_pr1g_process_link_authority');
    try {
      await client.query(
        `INSERT INTO public.assess_process_application_links(id,org_id,workspace_id,process_id,primitive_id,application_id,application_metadata_version_id,assessment_version_id,interaction_type,govern_state,economics_ref,economics_currency,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'read','approved',$9,'USD',$10)`,
        [legacyLink,ORG, WS, nextUuid(), nextUuid(), readyApp, readyMeta, readyAssessment, nextUuid(), ACTOR],
      );
    } finally {
      await client.query('ALTER TABLE public.assess_process_application_links ENABLE TRIGGER trg_pr1g_process_link_authority');
    }
    const verified=await client.query('SELECT count(*)::int n FROM public.pr1g_verified_process_links($1,$2) WHERE id=$3',[ORG,WS,legacyLink]);
    assert(verified.rows[0].n===0,'UNVERIFIABLE_LINK_BLESSED');
  });
  await scenario('deterministic dependency-ordered waves', async () => {
    await client.query(
      `INSERT INTO public.assess_application_dependencies(org_id,workspace_id,upstream_application_id,downstream_application_id,dependency_type,metadata_version_id,created_by)
       VALUES($1,$2,$3,$4,'runtime',$5,$6),($1,$2,$4,$7,'runtime',$8,$6)`,
      [ORG, WS, readyApp, gatedApp, gatedMeta, ACTOR, insufficientApp, insufficientMeta],
    );
    const snapshot = await createSnapshot(0);
    const persisted = await client.query('SELECT snapshot FROM public.assess_application_portfolio_snapshots WHERE id=$1', [snapshot.resource.id]);
    const waveByApp = Object.fromEntries(persisted.rows[0].snapshot.waves.map((row) => [row.applicationId, row.wave]));
    assert(waveByApp[readyApp] === 1 && waveByApp[gatedApp] === 2 && waveByApp[insufficientApp] === 3, 'DEPENDENCY_WAVE_ORDER_FAILED');
  });
  await scenario('hard-gated and insufficient-evidence wave qualification', async () => {
    const result = await client.query('SELECT snapshot FROM public.assess_application_portfolio_snapshots ORDER BY created_at DESC LIMIT 1');
    const qualified = Object.fromEntries(result.rows[0].snapshot.waves.map((row) => [row.applicationId, row.qualified]));
    assert(qualified[readyApp] === true, 'VERIFIED_UNGATED_APP_NOT_QUALIFIED');
    assert(qualified[gatedApp] === false, 'HARD_GATED_APP_QUALIFIED');
    assert(qualified[insufficientApp] === false, 'INSUFFICIENT_EVIDENCE_APP_QUALIFIED');
  });
  await scenario('capability isolation across direct tables and projection RPC',async()=>{
    const readAs=async(actor)=>{
      await client.query('BEGIN');
      try{
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);
        await client.query('SET LOCAL ROLE authenticated');
        const direct=await client.query(`SELECT
          (SELECT count(*)::int FROM public.assess_application_assets) applications,
          (SELECT count(*)::int FROM public.assess_application_source_evidence) evidence,
          (SELECT count(*)::int FROM public.assess_application_portfolio_snapshots) snapshots`);
        const projected=await client.query('SELECT public.pr1g_read_application_portfolio_projection($1,$2) projection',[ORG,WS]);
        await client.query('COMMIT');
        return{...direct.rows[0],projection:projected.rows[0].projection};
      }catch(error){await client.query('ROLLBACK');throw error}
    };
    await replaceOrganizationApplicationCapabilities(['assess.applications.read']);
    const applicationsOnly=await readAs(ACTOR);
    assert(applicationsOnly.applications>0&&applicationsOnly.evidence>0&&applicationsOnly.snapshots===0,'APPLICATIONS_READ_DIRECT_ISOLATION_FAILED');
    assert(applicationsOnly.projection.inventory.length>0&&applicationsOnly.projection.portfolioSnapshot===null,'APPLICATIONS_READ_PROJECTION_ISOLATION_FAILED');
    await replaceOrganizationApplicationCapabilities(['assess.applications.portfolio.read']);
    const portfolioOnly=await readAs(ACTOR);
    assert(portfolioOnly.applications===0&&portfolioOnly.evidence===0&&portfolioOnly.snapshots>0,'PORTFOLIO_READ_DIRECT_ISOLATION_FAILED');
    assert(portfolioOnly.projection.inventory.length===0&&portfolioOnly.projection.processLinks.length===0&&portfolioOnly.projection.portfolioSnapshot.version===1,'PORTFOLIO_READ_PROJECTION_ISOLATION_FAILED');
    await replaceOrganizationApplicationCapabilities(['assess.applications.read','assess.applications.portfolio.read']);
    const both=await readAs(ACTOR);
    assert(both.applications>0&&both.snapshots>0&&both.projection.inventory.length>0&&both.projection.portfolioSnapshot.version===1,'COMBINED_READ_AUTHORITY_FAILED');
    await replaceOrganizationApplicationCapabilities([]);
    await expectSqlFailure('neither read capability projection denial','PR1G_NOT_FOUND',()=>readAs(ACTOR));
    await restoreOrganizationApplicationCapabilities();
    await client.query("UPDATE workspace_memberships SET status='disabled' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[ORG,WS,ACTOR]);
    await expectSqlFailure('inactive authorization projection denial','PR1G_NOT_FOUND',()=>readAs(ACTOR));
    await client.query("UPDATE workspace_memberships SET status='active' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[ORG,WS,ACTOR]);
    await expectSqlFailure('cross-tenant projection denial','PR1G_NOT_FOUND',()=>readAs(OTHER_ACTOR));
    await resetActorVersion();
  });
  await expectSqlFailure('stale snapshot expected-version rejection', 'PR1G_VERSION_CONFLICT', () => createSnapshot(0));

  await scenario('full projection shape and nested committed authority data', async () => {
    await client.query('BEGIN');
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[ACTOR]);
    await client.query('SET LOCAL ROLE authenticated');
    const result = await client.query('SELECT public.pr1g_read_application_portfolio_projection($1,$2) projection', [ORG, WS]);
    await client.query('COMMIT');
    const projection = result.rows[0].projection;
    for (const key of ['inventory', 'metadataVersions', 'importReceipts', 'rowOutcomes', 'processLinks', 'dependencies', 'assessments', 'dimensions', 'recommendations', 'reviews', 'portfolioSnapshot', 'waves', 'economicsReferences']) {
      assert(Object.hasOwn(projection, key), `PROJECTION_KEY_MISSING_${key}`);
    }
    const inventory = projection.inventory.find((row) => row.id === gatedApp);
    assert(inventory?.metadata?.name === 'Gated UI' && inventory.metadataVersion === 1 && Array.isArray(inventory.evidence) && inventory.evidence.length === 7, 'PROJECTION_INVENTORY_SHAPE_FAILED');
    const nested = projection.assessments.find((row) => row.id === gatedAssessment);
    assert(nested?.metadataVersion === 1 && nested.version === 1 && nested.dimensions.length === 7 && nested.recommendations.length === 1, 'PROJECTION_NESTED_ASSESSMENT_SHAPE_FAILED');
    assert(projection.importReceipts.some((row) => row.id === importReceiptId), 'PROJECTION_IMPORT_RECEIPT_MISSING');
    assert(projection.rowOutcomes.filter((row) => row.importReceiptId === importReceiptId).length === 10, 'PROJECTION_ROW_OUTCOMES_MISSING');
    const projectionPath=`/tmp/avalaos-pr1g-projection-${process.pid}.json`;
    await writeFile(projectionPath,JSON.stringify(projection),{mode:0o600});
    try{execFileSync(process.execPath,['scripts/runPr1gProjectionDecoderBridge.mjs',projectionPath,ORG,WS],{stdio:'inherit'})}finally{await unlink(projectionPath)}
  });
  const incompleteApp=await createApplication('Incomplete latest decisions');
  const incompleteMeta=await createMetadata(incompleteApp,canonicalMetadata('Incomplete latest decisions'),evidenceFor());
  await client.query(`INSERT INTO assess_application_assessment_versions(id,org_id,workspace_id,application_id,metadata_version_id,version,decision_model_version,lifecycle,author_id,authorization_version)
    VALUES($1,$2,$3,$4,$5,1,'assess-v2-application-portfolio-2026-07','draft',$6,$7)`,[nextUuid(),ORG,WS,incompleteApp,incompleteMeta,ACTOR,AUTH_VERSION]);
  const snapshotWorkspaceGuardId=nextUuid();
  const snapshotWorkspaceGuardKey=`snapshot-workspace-${nextUuid()}`;
  let snapshotWorkspaceGuardFirst;
  await scenario('snapshot independently fails closed on incomplete latest decisions',async()=>{
    snapshotWorkspaceGuardFirst=await createSnapshot(1,snapshotWorkspaceGuardId,snapshotWorkspaceGuardKey);
    const persisted=await client.query('SELECT snapshot FROM assess_application_portfolio_snapshots WHERE id=$1',[snapshotWorkspaceGuardFirst.resource.id]);
    const wave=persisted.rows[0].snapshot.waves.find(row=>row.applicationId===incompleteApp);
    assert(wave?.qualified===false,'INCOMPLETE_DECISION_SET_QUALIFIED');
  });
  await scenario('snapshot same-workspace exact replay',async()=>{
    const replay=await createSnapshot(1,snapshotWorkspaceGuardId,snapshotWorkspaceGuardKey);
    assert(replay.resource.id===snapshotWorkspaceGuardFirst.resource.id&&replay.resource.version===snapshotWorkspaceGuardFirst.resource.version,'SNAPSHOT_SAME_WORKSPACE_REPLAY_FAILED');
  });
  await expectSqlFailure('snapshot same-workspace changed-payload conflict','PR1G_IDEMPOTENCY_CONFLICT',()=>createSnapshot(1,nextUuid(),snapshotWorkspaceGuardKey));
  await scenario('snapshot cross-workspace receipt denial',async()=>{
    const before=await client.query(`SELECT
      (SELECT count(*)::int FROM assess_application_portfolio_snapshots WHERE org_id=$1 AND workspace_id=$2) source_snapshots,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3 AND command_type='application.portfolio.snapshot.create' AND idempotency_key=$4) source_receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3 AND action='application.portfolio.snapshot.create' AND resource_id=$5) source_audits,
      (SELECT count(*)::int FROM assess_application_portfolio_snapshots WHERE org_id=$1 AND workspace_id=$6) target_snapshots,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$6) target_receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$6) target_audits`,
    [ORG,WS,ACTOR,snapshotWorkspaceGuardKey,snapshotWorkspaceGuardId,WS_B]);
    await expectSqlFailure('snapshot cross-workspace stable idempotency conflict','PR1B_IDEMPOTENCY_CONFLICT',()=>rpc(client,{
      workspace:WS_B,type:'application.portfolio.snapshot.create',expected:0,key:snapshotWorkspaceGuardKey,
      payload:{portfolioSnapshotId:snapshotWorkspaceGuardId},
    }));
    const after=await client.query(`SELECT
      (SELECT count(*)::int FROM assess_application_portfolio_snapshots WHERE org_id=$1 AND workspace_id=$2) source_snapshots,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3 AND command_type='application.portfolio.snapshot.create' AND idempotency_key=$4) source_receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3 AND action='application.portfolio.snapshot.create' AND resource_id=$5) source_audits,
      (SELECT count(*)::int FROM assess_application_portfolio_snapshots WHERE org_id=$1 AND workspace_id=$6) target_snapshots,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$6) target_receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$6) target_audits`,
    [ORG,WS,ACTOR,snapshotWorkspaceGuardKey,snapshotWorkspaceGuardId,WS_B]);
    assert(JSON.stringify(before.rows[0])===JSON.stringify(after.rows[0]),'SNAPSHOT_CROSS_WORKSPACE_SIDE_EFFECT_OR_DISCLOSURE');
  });

  const lifecycleApp = await createApplication('Lifecycle authority');
  await createMetadata(lifecycleApp, canonicalMetadata('Lifecycle authority'), evidenceFor());
  const lifecycleDraft = nextUuid();
  await saveAssessment(lifecycleApp, lifecycleDraft);
  const lifecycleReady = (await finalizeAssessment(lifecycleApp, lifecycleDraft, 1)).resource;
  await expectSqlFailure('self-review denial', 'PR1G_PERMISSION_DENIED', () => resolveReview(client, ACTOR, lifecycleApp, lifecycleReady.id, 2, `self-review-${nextUuid()}`));
  const reviewKey = `review-replay-${nextUuid()}`;
  const reviewed = await scenario('review resolution exact replay success', async () => {
    const first = await resolveReview(client, REVIEWER_A, lifecycleApp, lifecycleReady.id, 2, reviewKey);
    const replay = await resolveReview(client, REVIEWER_A, lifecycleApp, lifecycleReady.id, 2, reviewKey);
    assert(first.resource.id === replay.resource.id && first.resource.version === replay.resource.version, 'REVIEW_EXACT_REPLAY_FAILED');
    return first.resource;
  });
  await expectSqlFailure('review changed-payload idempotency conflict', 'PR1B_IDEMPOTENCY_CONFLICT', () => resolveReview(client, REVIEWER_A, lifecycleApp, lifecycleReady.id, 2, reviewKey, 'approved'));
  await expectSqlFailure('stale review resolution rejection', 'PR1G_VERSION_CONFLICT', () => resolveReview(client, REVIEWER_B, lifecycleApp, lifecycleReady.id, 2, `stale-review-${nextUuid()}`));
  const revisionKey = `revision-replay-${nextUuid()}`;
  const revised = await scenario('revision start exact replay success', async () => {
    const first = await startRevision(client, lifecycleApp, reviewed.id, 3, revisionKey);
    const replay = await startRevision(client, lifecycleApp, reviewed.id, 3, revisionKey);
    assert(first.resource.id === replay.resource.id && first.resource.version === replay.resource.version, 'REVISION_EXACT_REPLAY_FAILED');
    return first.resource;
  });
  await expectSqlFailure('revision changed-payload idempotency conflict', 'PR1B_IDEMPOTENCY_CONFLICT', () => startRevision(client, lifecycleApp, reviewed.id, 3, revisionKey, 'Changed payload'));
  await expectSqlFailure('stale revision-start rejection', 'PR1G_VERSION_CONFLICT', () => startRevision(client, lifecycleApp, reviewed.id, 3, `stale-revision-${nextUuid()}`));
  assert(revised.version === 4, 'REVISION_VERSION_FAILED');
  const decisionSemantics=async(applicationId,version)=>{
    const result=await client.query(`SELECT
      COALESCE((SELECT jsonb_agg(to_jsonb(d)-ARRAY['id','assessment_version_id'] ORDER BY d.dimension) FROM assess_application_dimension_results d WHERE d.assessment_version_id=a.id),'[]'::jsonb) dimensions,
      COALESCE((SELECT jsonb_agg(to_jsonb(q)-ARRAY['id','assessment_version_id'] ORDER BY q.id) FROM assess_application_modernization_recommendations q WHERE q.assessment_version_id=a.id),'[]'::jsonb) recommendations
      FROM assess_application_assessment_versions a WHERE a.application_id=$1 AND a.version=$2`,[applicationId,version]);
    return result.rows[0];
  };
  await scenario('full decision semantics survive finalize changes-requested review and revision start',async()=>{
    const rows=await client.query(`SELECT a.version,a.lifecycle,count(DISTINCT d.dimension)::int dimensions,count(DISTINCT q.id)::int recommendations
      FROM assess_application_assessment_versions a
      LEFT JOIN assess_application_dimension_results d ON d.assessment_version_id=a.id
      LEFT JOIN assess_application_modernization_recommendations q ON q.assessment_version_id=a.id
      WHERE a.application_id=$1 GROUP BY a.id ORDER BY a.version`,[lifecycleApp]);
    assert(rows.rows.length===4,'LIFECYCLE_VERSION_COUNT_FAILED');
    for(const row of rows.rows)assert(row.dimensions===7&&row.recommendations>=1,`INCOMPLETE_LIFECYCLE_DECISIONS_${row.lifecycle}`);
    const semantics=await Promise.all([1,2,3,4].map(version=>decisionSemantics(lifecycleApp,version)));
    for(let index=1;index<semantics.length;index++)assert(JSON.stringify(semantics[index])===JSON.stringify(semantics[0]),`LIFECYCLE_FULL_SEMANTIC_COPY_MISMATCH_V${index+1}`);
  });
  const approvedApp=await createApplication('Approved lifecycle authority');
  await createMetadata(approvedApp,canonicalMetadata('Approved lifecycle authority'),evidenceFor());
  const approvedDraft=nextUuid();await saveAssessment(approvedApp,approvedDraft);
  const approvedReady=(await finalizeAssessment(approvedApp,approvedDraft,1)).resource;
  const approved=(await resolveReview(client,REVIEWER_A,approvedApp,approvedReady.id,2,`approved-${nextUuid()}`,'approved')).resource;
  await scenario('approved review preserves complete full decision semantics',async()=>{
    const rows=await client.query('SELECT count(DISTINCT dimension)::int dimensions,(SELECT count(*)::int FROM assess_application_modernization_recommendations WHERE assessment_version_id=$1) recommendations FROM assess_application_dimension_results WHERE assessment_version_id=$1',[approved.id]);
    assert(rows.rows[0].dimensions===7&&rows.rows[0].recommendations>=1,'APPROVED_DECISIONS_NOT_PRESERVED');
    const semantics=await Promise.all([1,2,3].map(version=>decisionSemantics(approvedApp,version)));
    assert(semantics.slice(1).every(value=>JSON.stringify(value)===JSON.stringify(semantics[0])),'APPROVED_FULL_SEMANTIC_COPY_MISMATCH');
  });

  const mismatchApp = await createApplication('Mismatch authority');
  await createMetadata(mismatchApp, canonicalMetadata('Mismatch authority'), evidenceFor());
  const mismatchDraft = nextUuid();
  await saveAssessment(mismatchApp, mismatchDraft);
  await expectSqlFailure('metadata-version mismatch rejection', 'PR1G_VERSION_CONFLICT', () => finalizeAssessment(mismatchApp, mismatchDraft, 1, 2));
  await expectSqlFailure('application mismatch rejection', 'PR1G_VERSION_CONFLICT', () => finalizeAssessment(gatedApp, mismatchDraft, 1, 1));

  const ancestryApp = await createApplication('Superseded ancestry');
  await createMetadata(ancestryApp, canonicalMetadata('Superseded ancestry'), evidenceFor());
  const ancestryV1 = nextUuid();
  const ancestryV2 = nextUuid();
  await saveAssessment(ancestryApp, ancestryV1);
  await saveAssessment(ancestryApp, ancestryV2, {}, 1, 2);
  await expectSqlFailure('superseded ancestry rejection', 'PR1G_VERSION_CONFLICT', () => finalizeAssessment(ancestryApp, ancestryV1, 1));

  const replayApp=await createApplication('Assessment replay authority');
  await createMetadata(replayApp,canonicalMetadata('Assessment replay authority'),evidenceFor());
  const replayAssessmentId=nextUuid();
  const replayKey=`assessment-replay-${nextUuid()}`;
  const replayPayload={assessmentVersionId:replayAssessmentId,applicationId:replayApp,metadataVersion:1,assessmentVersion:1,processLinks:[],dependencies:[]};
  const replayFirst=await rpc(client,{type:'application.assessment.save',expected:0,key:replayKey,payload:replayPayload});
  await finalizeAssessment(replayApp,replayAssessmentId,1);
  await scenario('assessment save exact replay precedes advanced-version validation',async()=>{
    const before=await client.query(`SELECT
      (SELECT count(*)::int FROM assess_application_assessment_versions WHERE application_id=$1) assessments,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$2 AND actor_id=$3 AND command_type='application.assessment.save' AND idempotency_key=$4) receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$2 AND actor_id=$3 AND action='application.assessment.save' AND resource_id=$5) audits`,
    [replayApp,ORG,ACTOR,replayKey,replayAssessmentId]);
    const replay=await rpc(client,{type:'application.assessment.save',expected:0,key:replayKey,payload:replayPayload});
    const after=await client.query(`SELECT
      (SELECT count(*)::int FROM assess_application_assessment_versions WHERE application_id=$1) assessments,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$2 AND actor_id=$3 AND command_type='application.assessment.save' AND idempotency_key=$4) receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$2 AND actor_id=$3 AND action='application.assessment.save' AND resource_id=$5) audits`,
    [replayApp,ORG,ACTOR,replayKey,replayAssessmentId]);
    assert(replay.resource.id===replayFirst.resource.id&&replay.resource.version===replayFirst.resource.version,'ASSESSMENT_EXACT_REPLAY_RESPONSE_FAILED');
    assert(JSON.stringify(before.rows[0])===JSON.stringify(after.rows[0]),'ASSESSMENT_EXACT_REPLAY_SIDE_EFFECT');
  });
  await scenario('assessment-save cross-workspace receipt denial',async()=>{
    const before=await client.query(`SELECT
      (SELECT count(*)::int FROM assess_application_assessment_versions WHERE org_id=$1 AND workspace_id=$2 AND application_id=$3) source_assessments,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$4 AND command_type='application.assessment.save' AND idempotency_key=$5) source_receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$4 AND action='application.assessment.save' AND resource_id=$6) source_audits,
      (SELECT count(*)::int FROM assess_application_assessment_versions WHERE org_id=$1 AND workspace_id=$7) target_assessments,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$7) target_receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$7) target_audits`,
    [ORG,WS,replayApp,ACTOR,replayKey,replayAssessmentId,WS_B]);
    await expectSqlFailure('assessment save cross-workspace stable idempotency conflict','PR1B_IDEMPOTENCY_CONFLICT',()=>rpc(client,{
      workspace:WS_B,type:'application.assessment.save',expected:0,key:replayKey,payload:replayPayload,
    }));
    const after=await client.query(`SELECT
      (SELECT count(*)::int FROM assess_application_assessment_versions WHERE org_id=$1 AND workspace_id=$2 AND application_id=$3) source_assessments,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$4 AND command_type='application.assessment.save' AND idempotency_key=$5) source_receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$4 AND action='application.assessment.save' AND resource_id=$6) source_audits,
      (SELECT count(*)::int FROM assess_application_assessment_versions WHERE org_id=$1 AND workspace_id=$7) target_assessments,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$7) target_receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE org_id=$1 AND workspace_id=$7) target_audits`,
    [ORG,WS,replayApp,ACTOR,replayKey,replayAssessmentId,WS_B]);
    assert(JSON.stringify(before.rows[0])===JSON.stringify(after.rows[0]),'ASSESSMENT_CROSS_WORKSPACE_SIDE_EFFECT_OR_DISCLOSURE');
  });
  await expectSqlFailure('assessment save changed-payload idempotency conflict','PR1B_IDEMPOTENCY_CONFLICT',()=>rpc(client,{
    type:'application.assessment.save',expected:0,key:replayKey,payload:{...replayPayload,dependencies:[{upstreamApplicationId:gatedApp,downstreamApplicationId:replayApp,dependencyType:'runtime'}]},
  }));
  await expectSqlFailure('assessment save stale actor rejected before version evaluation','PR1B_AUTHORIZATION_STALE',async()=>{
    await client.query('UPDATE authorization_versions SET version=$1 WHERE org_id=$2 AND user_id=$3',[AUTH_VERSION+1,ORG,ACTOR]);
    try{return await rpc(client,{type:'application.assessment.save',expected:999,payload:{...replayPayload,assessmentVersionId:nextUuid(),assessmentVersion:1000}})}
    finally{await resetActorVersion()}
  });
  await expectSqlFailure('assessment save unauthorized actor rejected before version evaluation','PR1B_NOT_FOUND',async()=>{
    await disableOrganizationWrite();
    try{return await rpc(client,{type:'application.assessment.save',expected:999,payload:{...replayPayload,assessmentVersionId:nextUuid(),assessmentVersion:1000}})}
    finally{await restoreOrganizationWrite();await resetActorVersion()}
  });
  await expectSqlFailure('assessment save cross-tenant actor non-disclosure before version evaluation','PR1B_NOT_FOUND',()=>rpc(client,{
    actor:OTHER_ACTOR,type:'application.assessment.save',expected:999,payload:{...replayPayload,assessmentVersionId:nextUuid(),assessmentVersion:1000},
  }));

  const concurrentApp = await createApplication('Concurrent review');
  await createMetadata(concurrentApp, canonicalMetadata('Concurrent review'), evidenceFor());
  const concurrentDraft = nextUuid();
  await saveAssessment(concurrentApp, concurrentDraft);
  const concurrentReady = (await finalizeAssessment(concurrentApp, concurrentDraft, 1)).resource;
  await scenario('concurrent review resolution using separate PostgreSQL sessions', async () => {
    const reviewerOne = new pg.Client({ connectionString: url });
    const reviewerTwo = new pg.Client({ connectionString: url });
    await Promise.all([reviewerOne.connect(), reviewerTwo.connect()]);
    try {
      const outcomes = await Promise.allSettled([
        resolveReview(reviewerOne, REVIEWER_A, concurrentApp, concurrentReady.id, 2, `concurrent-review-a-${nextUuid()}`, 'approved'),
        resolveReview(reviewerTwo, REVIEWER_B, concurrentApp, concurrentReady.id, 2, `concurrent-review-b-${nextUuid()}`, 'changes_requested'),
      ]);
      const successes = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
      assert(successes.length === 1 && failures.length === 1, 'CONCURRENT_REVIEW_SINGLE_COMMIT_REQUIRED');
      const concurrentFailure = String(failures[0].reason?.message);
      assert(concurrentFailure.includes('PR1G_VERSION_CONFLICT'), `CONCURRENT_REVIEW_WRONG_FAILURE: ${concurrentFailure}`);
      const persisted = await client.query('SELECT count(*)::int n FROM public.assess_application_review_resolutions WHERE assessment_version_id=$1', [concurrentReady.id]);
      assert(persisted.rows[0].n === 1, 'CONCURRENT_REVIEW_RESOLUTION_COUNT_FAILED');
    } finally {
      await Promise.all([reviewerOne.end(), reviewerTwo.end()]);
    }
  });
  const concurrentAssessmentApp=await createApplication('Concurrent assessment');
  await createMetadata(concurrentAssessmentApp,canonicalMetadata('Concurrent assessment'),evidenceFor());
  await scenario('concurrent assessment saves advance from committed application version',async()=>{
    const writerOne=new pg.Client({connectionString:url});
    const writerTwo=new pg.Client({connectionString:url});
    await Promise.all([writerOne.connect(),writerTwo.connect()]);
    const save=(connection,id,key)=>rpc(connection,{
      type:'application.assessment.save',expected:0,key,
      payload:{assessmentVersionId:id,applicationId:concurrentAssessmentApp,metadataVersion:1,
        assessmentVersion:1,processLinks:[],dependencies:[]},
    });
    try{
      const outcomes=await Promise.allSettled([
        save(writerOne,nextUuid(),`concurrent-assessment-a-${nextUuid()}`),
        save(writerTwo,nextUuid(),`concurrent-assessment-b-${nextUuid()}`),
      ]);
      const successes=outcomes.filter(outcome=>outcome.status==='fulfilled');
      const failures=outcomes.filter(outcome=>outcome.status==='rejected');
      assert(successes.length===1&&failures.length===1,'CONCURRENT_ASSESSMENT_SINGLE_COMMIT_REQUIRED');
      assert(String(failures[0].reason?.message).includes('PR1G_VERSION_CONFLICT'),'CONCURRENT_ASSESSMENT_WRONG_FAILURE');
      const persisted=await client.query('SELECT count(*)::int n,max(version)::int version FROM public.assess_application_assessment_versions WHERE application_id=$1',[concurrentAssessmentApp]);
      assert(persisted.rows[0].n===1&&persisted.rows[0].version===1,'CONCURRENT_ASSESSMENT_VERSION_AUTHORITY_FAILED');
    }finally{await Promise.all([writerOne.end(),writerTwo.end()])}
  });
  await scenario('concurrent snapshot allocation commits exactly one version under independent sessions', async () => {
    const snapshotOne = new pg.Client({ connectionString: url });
    const snapshotTwo = new pg.Client({ connectionString: url });
    await Promise.all([snapshotOne.connect(), snapshotTwo.connect()]);
    const snapshotRpc=(connection,id,key)=>rpc(connection,{
      type:'application.portfolio.snapshot.create',
      expected:2,
      key,
      payload:{portfolioSnapshotId:id},
    });
    try {
      const ids=[nextUuid(),nextUuid()];
      const outcomes=await Promise.allSettled([
        snapshotRpc(snapshotOne,ids[0],`concurrent-snapshot-a-${nextUuid()}`),
        snapshotRpc(snapshotTwo,ids[1],`concurrent-snapshot-b-${nextUuid()}`),
      ]);
      const successes=outcomes.filter(outcome=>outcome.status==='fulfilled');
      const failures=outcomes.filter(outcome=>outcome.status==='rejected');
      assert(successes.length===1&&failures.length===1,'CONCURRENT_SNAPSHOT_SINGLE_COMMIT_REQUIRED');
      assert(String(failures[0].reason?.message).includes('PR1G_VERSION_CONFLICT'),'CONCURRENT_SNAPSHOT_WRONG_FAILURE');
      const persisted=await client.query(
        'SELECT count(*)::int n,min(version)::bigint min_version,max(version)::bigint max_version FROM public.assess_application_portfolio_snapshots WHERE id=ANY($1::uuid[])',
        [ids],
      );
      assert(persisted.rows[0].n===1&&Number(persisted.rows[0].min_version)===3&&Number(persisted.rows[0].max_version)===3,'CONCURRENT_SNAPSHOT_VERSION_AUTHORITY_FAILED');
    } finally {
      await Promise.all([snapshotOne.end(),snapshotTwo.end()]);
    }
  });

  console.log(`PR 1G PostgreSQL 16 executable behavioral scenarios passed: ${executed.length} passed, 0 failed.`);
  console.log('Internal function ACL scenarios: all PR 1G helpers deny PUBLIC, anon, authenticated and service-role direct execution; authenticated projection and service-role command remain executable.');
  console.log('Direct helper denial scenarios: anon, authenticated, capability-limited and cross-tenant invocations are permission denied without rows or mutations.');
  console.log('Capability-isolation scenarios: direct table and projection/RPC access for applications.read, portfolio.read, both, neither, revoked/inactive and cross-tenant authority.');
  console.log('Authoritative Process × Application linkage scenarios: verified ancestry plus forged, cross-tenant, stale Govern and economics fail-closed rejection.');
  console.log('Delegated-command cross-workspace receipt denial: stable PR1B_IDEMPOTENCY_CONFLICT with no resource, Workspace B application, receipt or audit event.');
  console.log('Assessment-save cross-workspace receipt denial: stable PR1B_IDEMPOTENCY_CONFLICT before replay or application-version inspection with no resource or Workspace B mutation.');
  console.log('Snapshot cross-workspace receipt denial: stable PR1B_IDEMPOTENCY_CONFLICT without a unique violation, resource disclosure or Workspace B mutation.');
  console.log('Same-workspace exact replay: delegated command, assessment save and snapshot creation returned their original committed resources without duplicate effects.');
  console.log('Same-workspace changed-payload conflict: delegated command, assessment save and snapshot creation returned stable idempotency conflicts.');
  console.log('Authorization-before-receipt inspection: stale, unauthorized and cross-tenant actors were denied before the canonical receipt guard.');
  console.log('Assessment version progression scenarios: first, successor, exact replay after advancement, changed-payload conflict, authorization-before-version, stale conflict and application-scoped lifecycle authority.');
  console.log('Concurrent assessment allocation: exactly one committed version 1 and one deterministic PR1G_VERSION_CONFLICT under independent PostgreSQL sessions.');
  console.log('Concurrent snapshot allocation: one committed version 3 and one deterministic PR1G_VERSION_CONFLICT under independent PostgreSQL sessions.');
  console.log(`Scenario detail: ${executed.join('; ')}.`);
} finally {
  await client.end();
}
