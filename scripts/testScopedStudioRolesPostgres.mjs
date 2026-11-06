import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';

const rawUrl = process.env.PILOT_OPERATIONS_DATABASE_URL;
if (!rawUrl) throw new Error('PILOT_OPERATIONS_DATABASE_URL_REQUIRED');
const adminUrl = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(adminUrl.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname)
  || adminUrl.pathname !== '/postgres' || adminUrl.search || adminUrl.hash) {
  throw new Error('PILOT_OPERATIONS_DATABASE_URL_REJECTED');
}

const databaseName = `scoped_studio_roles_${randomUUID().replaceAll('-', '')}`;
const ids = Object.fromEntries([
  'operator','assess','studio','other','organization','workspace','provider','key','assessRoute','studioRoute',
  'studioAccount','assessAccount','variantRole','futureRoute',
].map(name => [name, randomUUID()]));
const projectRef = 'abcdefghijklmnopqrst';
const fingerprint = `sha256:${'a'.repeat(64)}`;
const model = 'gpt-4.1-mini-2025-04-14';
const endpoint = 'https://api.openai.com';
const secretReference = `AVALA_PROVIDER_SECRET_OPENAI_${ids.organization.replaceAll('-', '').toUpperCase()}_SCOPED`;
const commit = 'b'.repeat(40);
const resumedCommit = 'c'.repeat(40);
const clients = [];
const admin = new pg.Client({ connectionString: adminUrl.href });
const one = async (client, sql, values = []) => (await client.query(sql, values)).rows[0];
const dbUrl = name => {
  const value = new URL(adminUrl.href);
  value.pathname = `/${name}`;
  return value.href;
};
const expectFailure = async (operation, pattern) => {
  try {
    await operation();
    assert.fail('EXPECTED_FAILURE');
  } catch (error) {
    assert.match(String(error instanceof Error ? error.message : error), pattern);
  }
};
const connect = async () => {
  const client = new pg.Client({ connectionString: dbUrl(databaseName) });
  await client.connect();
  clients.push(client);
  await client.query("SELECT set_config('request.headers',$1,false)", [JSON.stringify({ host: `${projectRef}.supabase.co` })]);
  return client;
};
async function install(client) {
  await client.query(`DO $$BEGIN CREATE ROLE anon NOLOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
    DO $$BEGIN CREATE ROLE authenticated NOLOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
    DO $$BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
  const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '20261106020001_studio_response_reconciliation.sql');
  for (const filename of migrations) {
    const sql = (await readFile(`supabase/migrations/${filename}`, 'utf8')).replaceAll('\r\n', '\n');
    await applySyntheticAiTerminalJournalMigrationForTest(client, filename, async () => {
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${filename}:${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
}

const accountEmail = actor => `synthetic-${actor}@avalaos.invalid`;
const generationRequest = async (client, actor, authorizationVersion, label) => {
  const artifactId = randomUUID();
  const packageId = randomUUID();
  const packageCommand = {
    actorId: actor,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    artifactId,
    sourcePackageId: packageId,
    requestId: randomUUID(),
    idempotencyKey: `scoped-studio-package-${label}`,
    authorizationVersion,
    payload: {
      sourceMode: 'manual_brief',
      artifactType: 'pdd',
      manualBrief: `Synthetic scoped Studio route proof ${label}.`,
    },
  };
  const created = (await one(client,
    'SELECT public.studio_artifact_source_package_create($1::jsonb) result',
    [JSON.stringify(packageCommand)])).result;
  const artifact = await one(client, `SELECT aggregate_version,current_version_id,current_approved_version_id
    FROM public.studio_artifact_aggregates WHERE id=$1`, [artifactId]);
  const template = await one(client, `SELECT id FROM public.studio_system_template_versions
    WHERE artifact_type='pdd' AND superseded_at IS NULL`);
  const command = {
    actorId: actor,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    requestId: randomUUID(),
    idempotencyKey: `scoped-studio-generation-${label}`,
    authorizationVersion,
    artifactId,
    sourcePackageId: packageId,
    templateKind: 'system',
    templateVersionId: template.id,
    expectedAggregateVersion: Number(artifact.aggregate_version),
    expectedCurrentVersionId: artifact.current_version_id,
    expectedApprovedVersionId: artifact.current_approved_version_id,
  };
  return {
    artifactId,
    packageId,
    package: created,
    command,
    invoke: () => one(client, 'SELECT public.studio_artifact_generation_request_v2($1::jsonb) result',
      [JSON.stringify(command)]).then(row => row.result),
  };
};

await admin.connect();
let created = false;
try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  created = true;
  const db = await connect();
  await install(db);
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');

  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [ids.operator, 'operator@avalaos.invalid']);
  const target = (await one(db, 'SELECT public.synthetic_admin_bootstrap_operator($1,$2,$3,$4) target',
    [ids.operator, ids.organization, ids.workspace, fingerprint])).target;
  const roles = await one(db, `SELECT organization_member_role_id member_role,
      (SELECT role_id FROM public.synthetic_admin_preset_roles WHERE target_id=t.id AND preset='author') author_role,
      (SELECT role_id FROM public.organization_members WHERE org_id=t.org_id AND user_id=t.operator_actor_id
        AND status='active' AND deleted_at IS NULL) operator_role
    FROM public.synthetic_admin_targets t WHERE id=$1`, [target.targetId]);

  for (const [actor, label, accountId] of [
    [ids.assess, 'assess', ids.assessAccount],
    [ids.studio, 'studio', ids.studioAccount],
    [ids.other, 'other', null],
  ]) {
    const email = `${label}@avalaos.invalid`;
    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [actor, email]);
    await db.query("INSERT INTO public.profiles(id,email,status) VALUES($1,$2,'active')", [actor, email]);
    await db.query(`INSERT INTO public.organization_members(
      org_id,user_id,role_id,status,joined_at,created_by
    ) VALUES($1,$2,$3,'active',statement_timestamp(),$4)`,
    [ids.organization, actor, roles.member_role, ids.operator]);
    await db.query(`INSERT INTO public.workspace_memberships(
      org_id,workspace_id,user_id,role_id,status,joined_at,created_by
    ) VALUES($1,$2,$3,$4,'active',statement_timestamp(),$5)`,
    [ids.organization, ids.workspace, actor, roles.author_role, ids.operator]);
    if (accountId) {
      await db.query(`INSERT INTO public.synthetic_admin_accounts(
        id,target_id,org_id,workspace_id,auth_user_id,synthetic_email,label,preset,state,
        reserved_by,reserve_request_id,reserve_key,activated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,'author','active',$8,$9,$10,statement_timestamp())`, [
        accountId,target.targetId,ids.organization,ids.workspace,actor,accountEmail(actor),
        `Scoped ${label}`,ids.operator,randomUUID(),`scoped-${label}-reservation`,
      ]);
    }
  }

  await db.query(`INSERT INTO public.roles(
    id,org_id,workspace_id,name,slug,scope,permissions,status,created_by
  ) VALUES($1,$2,$3,'Scoped Studio author','scoped-studio-author','workspace','[]'::jsonb,'active',$4)`,
  [ids.variantRole,ids.organization,ids.workspace,ids.operator]);
  await db.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
    SELECT $1::uuid,capability_key FROM public.role_capabilities WHERE role_id=$2::uuid
    UNION SELECT $1::uuid,capability FROM unnest(public.synthetic_admin_studio_variant_increment('studio-author')) capability`,
  [ids.variantRole,roles.author_role]);
  await db.query(`UPDATE public.roles SET permissions=(SELECT jsonb_agg(capability_key ORDER BY capability_key)
    FROM public.role_capabilities WHERE role_id=$1) WHERE id=$1`, [ids.variantRole]);
  let operatorVersion = Number((await one(db, `SELECT version FROM public.authorization_versions
    WHERE org_id=$1 AND user_id=$2`, [ids.organization,ids.operator])).version);
  const operatorGrant = (await one(db, `SELECT public.synthetic_admin_grant_operator_assess_read(
    $1,$2,$3,$4,$5,$6,$7) result`, [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,randomUUID(),'scoped-operator-assess-read',
  ])).result;
  operatorVersion = Number(operatorGrant.version);

  const openArgs = [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,projectRef,
    `sha256:${'d'.repeat(64)}`,secretReference,ids.provider,ids.key,ids.assessRoute,ids.studioRoute,
    new Date(Date.now()+3_600_000),commit,ids.assess,ids.studio,
  ];
  const permit = (await one(db, `SELECT public.process_evidence_open_provider_run(
    ${openArgs.map((_, index) => `$${index+1}`).join(',')}) result`, openArgs)).result;
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)',
    [ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,projectRef]);
  await db.query(`INSERT INTO public.synthetic_admin_studio_actor_role_bindings(
    target_id,account_id,actor_id,base_preset,base_role_id,variant,variant_role_id,configured_by
  ) VALUES($1,$2,$3,'author',$4,'studio-author',$5,$6)`,
  [target.targetId,ids.studioAccount,ids.studio,roles.author_role,ids.variantRole,ids.operator]);
  const readRoster = async () => (await one(db, `SELECT public.synthetic_admin_list(
    $1,$2,$3,$4,$5,NULL,20) result`, [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,
  ])).result.roster;
  const rosterBefore = await readRoster();
  const studioBefore = rosterBefore.find(row => row.reservationId===ids.studioAccount);
  const assessBefore = rosterBefore.find(row => row.reservationId===ids.assessAccount);
  assert.deepEqual({
    rolePreset:studioBefore.rolePreset,baseRolePreset:studioBefore.baseRolePreset,
    studioVariant:studioBefore.studioVariant,studioVariantActive:studioBefore.studioVariantActive,
    assignableRolePresets:studioBefore.assignableRolePresets,
  }, {
    rolePreset:'author',baseRolePreset:'author',studioVariant:'studio-author',
    studioVariantActive:false,assignableRolePresets:['author','studio-author'],
  });
  assert.deepEqual({
    rolePreset:assessBefore.rolePreset,baseRolePreset:assessBefore.baseRolePreset,
    studioVariant:assessBefore.studioVariant,studioVariantActive:assessBefore.studioVariantActive,
    assignableRolePresets:assessBefore.assignableRolePresets,
  }, {
    rolePreset:'author',baseRolePreset:'author',studioVariant:null,studioVariantActive:false,
    assignableRolePresets:['author','reviewer','approver','viewer'],
  });
  await expectFailure(() => one(db, `SELECT public.process_evidence_open_provider_run(
    ${openArgs.map((_, index) => `$${index+1}`).join(',')}) result`, openArgs),
  /PROCESS_EVIDENCE_STUDIO_ACTOR_PREBOUND/);

  const routeBefore = await one(db, `SELECT allowed_roles,enabled,version FROM public.enterprise_ai_capability_routes
    WHERE id=$1`, [ids.studioRoute]);
  assert.deepEqual(routeBefore.allowed_roles, [roles.author_role]);
  assert.equal(routeBefore.enabled, false);
  const resumeArgs = [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,projectRef,permit.campaignId,
    secretReference,ids.provider,ids.key,ids.assessRoute,ids.studioRoute,
    new Date(Date.now()+3_600_000),resumedCommit,ids.assess,ids.studio,
  ];
  const resumeSql = `SELECT public.process_evidence_resume_provider_run(
    ${resumeArgs.map((_, index) => `$${index+1}`).join(',')}) result`;

  // Reproduce the original mismatch: the exact Studio actor has the scoped
  // role but the retained route still names the shared author role.
  await db.query('BEGIN');
  await db.query(`UPDATE public.workspace_memberships SET role_id=$1
    WHERE org_id=$2 AND workspace_id=$3 AND user_id=$4`,
  [ids.variantRole,ids.organization,ids.workspace,ids.studio]);
  await expectFailure(() => db.query(resumeSql,resumeArgs), /RESUME_BINDING_STALE/);
  await db.query('ROLLBACK');

  const studioVersion = Number((await one(db, `SELECT version FROM public.authorization_versions
    WHERE org_id=$1 AND user_id=$2`, [ids.organization,ids.studio])).version);
  const assigned = (await one(db, `SELECT public.synthetic_admin_assign_studio_variant(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result`, [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,randomUUID(),
    'scoped-studio-assign',ids.studioAccount,1,'studio-author',
  ])).result;
  assert.equal(assigned.studioVariantActive,true);
  const studioAssigned = (await readRoster()).find(row => row.reservationId===ids.studioAccount);
  assert.deepEqual({
    rolePreset:studioAssigned.rolePreset,baseRolePreset:studioAssigned.baseRolePreset,
    studioVariant:studioAssigned.studioVariant,studioVariantActive:studioAssigned.studioVariantActive,
    version:Number(studioAssigned.version),
  }, {
    rolePreset:'studio-author',baseRolePreset:'author',studioVariant:'studio-author',
    studioVariantActive:true,version:Number(assigned.version),
  });
  assert.ok(Number((await one(db, `SELECT version FROM public.authorization_versions
    WHERE org_id=$1 AND user_id=$2`, [ids.organization,ids.studio])).version)>studioVersion);
  assert.deepEqual(await one(db, `SELECT
      (SELECT role_id FROM public.workspace_memberships WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3) studio_role,
      (SELECT role_id FROM public.workspace_memberships WHERE org_id=$1 AND workspace_id=$2 AND user_id=$4) assess_role,
      (SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$5) studio_route_roles,
      (SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$6) assess_route_roles`,
  [ids.organization,ids.workspace,ids.studio,ids.assess,ids.studioRoute,ids.assessRoute]), {
    studio_role:ids.variantRole,assess_role:roles.author_role,
    studio_route_roles:[ids.variantRole],assess_route_roles:[roles.author_role],
  });

  const resumed = (await one(db,resumeSql,resumeArgs)).result;
  assert.equal(resumed.status,'resumed');
  await db.query("UPDATE public.ai_provider_key_refs SET status='active' WHERE id=$1", [ids.key]);
  await db.query(`UPDATE public.ai_provider_configs
    SET last_validated_at=statement_timestamp() WHERE id=$1`, [ids.provider]);

  await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(
      org_id,workspace_id,unified_byok_gateway_enabled,studio_multisource_enabled,
      direct_studio_planning_enabled,updated_by
    ) VALUES($1,$2,true,true,true,$3)
    ON CONFLICT(org_id,workspace_id) DO UPDATE
    SET unified_byok_gateway_enabled=true,studio_multisource_enabled=true,
      direct_studio_planning_enabled=true,updated_by=excluded.updated_by`,
  [ids.organization,ids.workspace,ids.operator]);
  await db.query(`UPDATE public.studio_artifact_runtime_control
    SET enabled=true,read_only=false,provider_enabled=true WHERE singleton`);

  const activeStudioVersion = Number((await one(db, `SELECT version FROM public.authorization_versions
    WHERE org_id=$1 AND user_id=$2`, [ids.organization,ids.studio])).version);
  const admitted = await generationRequest(db,ids.studio,activeStudioVersion,'admitted');
  const generation = await admitted.invoke();
  assert.equal(generation.generationPlan.providerRouteId,ids.studioRoute);

  // The ordinary Assess author keeps its original role and cannot borrow the
  // scoped Studio route even though its base role still has generation rights.
  const assessVersion = Number((await one(db, `SELECT version FROM public.authorization_versions
    WHERE org_id=$1 AND user_id=$2`, [ids.organization,ids.assess])).version);
  const denied = await generationRequest(db,ids.assess,assessVersion,'assess-denied');
  await expectFailure(denied.invoke, /PROVIDER_ROUTE_UNAVAILABLE/);

  // Exercise real paid admission through the production Studio token-budget
  // and campaign-currency routines, but roll it back before any provider use.
  await db.query('BEGIN');
  const executionToken = randomUUID();
  const generationClaim = (await one(db, `SELECT public.studio_artifact_generation_claim_v2($1,$2,60) result`,
    [generation.attemptId,executionToken])).result;
  assert.equal(generationClaim.providerAllowed,true);
  const tokenBudget = (await one(db, `SELECT public.studio_artifact_reserve_provider_budget_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai','studio.document.generate',$11,120,4000) result`, [
    ids.studio,ids.organization,ids.workspace,activeStudioVersion,generation.receiptId,generation.attemptId,
    executionToken,generationClaim.executionFence,ids.studioRoute,ids.provider,model,
  ])).result;
  assert.equal(tokenBudget.state,'reserved',JSON.stringify(tokenBudget));
  const currency = (await one(db, `SELECT public.synthetic_ai_campaign_reserve_effect(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'openai',$14,$15,'studio.document.generate',$16,4000) result`, [
    ids.studio,ids.organization,ids.workspace,activeStudioVersion,fingerprint,projectRef,
    generation.receiptId,generation.attemptId,executionToken,generationClaim.executionFence,
    ids.studioRoute,ids.provider,ids.key,endpoint,model,'e'.repeat(64),
  ])).result;
  assert.equal(currency.ownsProviderEffect,true);
  assert.equal((await one(db, `SELECT count(*)::int count FROM public.synthetic_ai_campaign_effect_debits
    WHERE campaign_id=$1`, [permit.campaignId])).count,1);
  await db.query('ROLLBACK');

  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('SELECT public.synthetic_ai_campaign_disable($1,$2,$3,$4,$5,$6)',
    [ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,projectRef]);

  await db.query(`INSERT INTO public.enterprise_ai_capability_routes(
    id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by
  ) VALUES($1,$2,$3,$4,'studio.document.generate',$5,false,ARRAY[$6::text],1,$7,$7)`,
  [ids.futureRoute,ids.organization,ids.workspace,ids.provider,model,roles.author_role,ids.operator]);

  const assessAccountBefore = await one(db, 'SELECT version FROM public.synthetic_admin_accounts WHERE id=$1', [ids.assessAccount]);
  const routeBeforeOtherActor = await one(db, 'SELECT allowed_roles,version FROM public.enterprise_ai_capability_routes WHERE id=$1', [ids.studioRoute]);
  const unboundAssigned = (await one(db, `SELECT public.synthetic_admin_assign_studio_variant(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,'reviewer') result`, [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,randomUUID(),
    'scoped-assess-legacy',ids.assessAccount,Number(assessAccountBefore.version),
  ])).result;
  const assessAssigned = (await readRoster()).find(row => row.reservationId===ids.assessAccount);
  assert.deepEqual({
    rolePreset:assessAssigned.rolePreset,baseRolePreset:assessAssigned.baseRolePreset,
    studioVariant:assessAssigned.studioVariant,studioVariantActive:assessAssigned.studioVariantActive,
    assignableRolePresets:assessAssigned.assignableRolePresets,version:Number(assessAssigned.version),
  }, {
    rolePreset:'reviewer',baseRolePreset:'reviewer',studioVariant:null,studioVariantActive:false,
    assignableRolePresets:['author','reviewer','approver','viewer'],version:Number(unboundAssigned.version),
  });
  const unboundRestored = (await one(db, `SELECT public.synthetic_admin_assign_studio_variant(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,'author') result`, [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,randomUUID(),
    'scoped-assess-legacy-restore',ids.assessAccount,Number(unboundAssigned.version),
  ])).result;
  const assessRestored = (await readRoster()).find(row => row.reservationId===ids.assessAccount);
  assert.equal(assessRestored.rolePreset,'author');
  assert.equal(assessRestored.baseRolePreset,'author');
  assert.equal(Number(assessRestored.version),Number(unboundRestored.version));
  assert.deepEqual(await one(db, 'SELECT allowed_roles,version FROM public.enterprise_ai_capability_routes WHERE id=$1', [ids.studioRoute]),routeBeforeOtherActor);

  await expectFailure(() => one(db, `SELECT public.synthetic_admin_assign_studio_variant(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,'studio-reviewer') result`, [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,randomUUID(),
    'scoped-unsupported-variant',ids.studioAccount,Number(assigned.version),
  ]), /FEATURE_DISABLED/);

  // A second assignee cannot use the dedicated role to bypass the exact actor
  // binding. The failed restore leaves both membership and route unchanged.
  await db.query('BEGIN');
  await db.query(`UPDATE public.workspace_memberships SET role_id=$1
    WHERE org_id=$2 AND workspace_id=$3 AND user_id=$4`,
  [ids.variantRole,ids.organization,ids.workspace,ids.other]);
  await expectFailure(() => one(db, `SELECT public.synthetic_admin_assign_studio_variant(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,'author') result`, [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,randomUUID(),
    'scoped-split-role-restore',ids.studioAccount,Number(assigned.version),
  ]), /STUDIO_VARIANT_UNSAFE/);
  await db.query('ROLLBACK');
  assert.deepEqual((await one(db, 'SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [ids.studioRoute])).allowed_roles,[ids.variantRole]);

  const restored = (await one(db, `SELECT public.synthetic_admin_assign_studio_variant(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,'author') result`, [
    ids.operator,ids.organization,ids.workspace,operatorVersion,fingerprint,randomUUID(),
    'scoped-studio-restore',ids.studioAccount,Number(assigned.version),
  ])).result;
  assert.equal(restored.studioVariantActive,false);
  const studioRestored = (await readRoster()).find(row => row.reservationId===ids.studioAccount);
  assert.deepEqual({
    rolePreset:studioRestored.rolePreset,baseRolePreset:studioRestored.baseRolePreset,
    studioVariant:studioRestored.studioVariant,studioVariantActive:studioRestored.studioVariantActive,
    version:Number(studioRestored.version),
  }, {
    rolePreset:'author',baseRolePreset:'author',studioVariant:'studio-author',
    studioVariantActive:false,version:Number(restored.version),
  });
  assert.deepEqual(await one(db, `SELECT
      (SELECT role_id FROM public.workspace_memberships WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3) studio_role,
      (SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$4) studio_route_roles,
      (SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$5) future_route_roles,
      (SELECT enabled FROM public.enterprise_ai_capability_routes WHERE id=$4) studio_route_enabled`,
  [ids.organization,ids.workspace,ids.studio,ids.studioRoute,ids.futureRoute]), {
    studio_role:roles.author_role,studio_route_roles:[roles.author_role],
    future_route_roles:[roles.author_role],studio_route_enabled:false,
  });
  await expectFailure(() => db.query(
    'SELECT public.process_evidence_studio_actor_route_role($1,$2,$3)',
    [target.targetId,ids.studio,roles.author_role]), /STUDIO_ROLE_BINDING_STALE/);

  assert.deepEqual(await one(db, `SELECT
      has_function_privilege('service_role','public.process_evidence_studio_actor_route_role(uuid,uuid,uuid)','EXECUTE') service_helper,
      has_function_privilege('authenticated','public.process_evidence_studio_actor_route_role(uuid,uuid,uuid)','EXECUTE') authenticated_helper,
      has_function_privilege('service_role','public.synthetic_admin_assign_studio_variant(uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text)','EXECUTE') service_assign,
      has_function_privilege('authenticated','public.synthetic_admin_assign_studio_variant(uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text)','EXECUTE') authenticated_assign,
      has_function_privilege('service_role','public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)','EXECUTE') service_list,
      has_function_privilege('authenticated','public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)','EXECUTE') authenticated_list,
      has_function_privilege('anon','public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)','EXECUTE') anon_list,
      (SELECT prosecdef FROM pg_proc WHERE oid='public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)'::regprocedure) list_security_definer,
      (SELECT proconfig FROM pg_proc WHERE oid='public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)'::regprocedure) list_config`), {
    service_helper:false,authenticated_helper:false,service_assign:true,authenticated_assign:false,
    service_list:true,authenticated_list:false,anon_list:false,list_security_definer:true,
    list_config:['search_path=pg_catalog'],
  });
  console.log('Scoped Studio roles PostgreSQL passed: exact prebinding, unbound and bound roster currentness, legacy assignment, atomic disabled-route grant/restore, real prior mismatch rejection, zero-use permit resume, production Studio generation/token/currency admission without provider use, split-role and unsupported-variant denial, unrelated-route preservation, and revoked internal helpers.');
} finally {
  for (const client of clients) await client.end().catch(() => undefined);
  if (created) await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`).catch(() => undefined);
  await admin.end();
}
