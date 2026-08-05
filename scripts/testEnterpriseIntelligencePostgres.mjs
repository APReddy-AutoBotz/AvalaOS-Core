import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {createEnterpriseIntelligenceFixture} from './enterpriseIntelligencePostgresFixture.mjs';

execFileSync(process.execPath, ['scripts/testEnterpriseIntelligenceMigration.mjs'], {stdio: 'inherit'});

const adminUrl = process.env.ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL;
if (!adminUrl) {
  if (process.env.CI) throw new Error('ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL is required in CI.');
  console.log('Enterprise Intelligence PostgreSQL 16 scenarios skipped: ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL is not set.');
  process.exit(0);
}

const {Client} = pg;
const feature = '20260804120000_enterprise_intelligence_authority.sql';
const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
const featureIndex = migrations.indexOf(feature);
assert.ok(featureIndex > 0, 'Enterprise Intelligence migration is missing from the chronological chain.');
const baseline = migrations.slice(0, featureIndex);
const featureChain = migrations.slice(featureIndex);
const suffix = `${process.pid}_${Date.now()}`;
const names = {
  fresh: `enterprise_fresh_${suffix}`,
  upgrade: `enterprise_upgrade_${suffix}`,
  populated: `enterprise_populated_${suffix}`,
  dirty: `enterprise_dirty_${suffix}`,
  authority: `enterprise_authority_${suffix}`,
};
const clients = [];
const createdDatabases = [];
const createdRoles = [];
const urlFor = name => { const url = new URL(adminUrl); url.pathname = `/${name}`; return url.toString(); };
const connect = async url => { const client = new Client({connectionString: url}); await client.connect(); clients.push(client); return client; };
const transaction = async (client, label, sql) => {
  await client.query('BEGIN');
  try { await client.query(sql); await client.query('COMMIT'); console.log(`APPLIED ${label}`); }
  catch (error) { await client.query('ROLLBACK'); throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
};
const bootstrap = client => transaction(client, 'Supabase auth bootstrap', `
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid primary key);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);
const apply = async (client, list) => {
  for (const name of list) await transaction(client, name, await readFile(join('supabase/migrations', name), 'utf8'));
};
const createDatabase = async (admin, name) => {
  assert.match(name, /^[a-z0-9_]+$/);
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount, 0, `Refusing to overwrite ${name}`);
  await admin.query(`CREATE DATABASE ${name}`);
  createdDatabases.push(name);
  console.log(`CREATED DATABASE ${name}`);
  const client = await connect(urlFor(name));
  await bootstrap(client);
  return client;
};
const scenarios = [];
const scenario = async (name, operation) => {
  await operation();
  scenarios.push(name);
  console.log(`PASS ${name}`);
};
const enterpriseTables = [
  'enterprise_intelligence_runtime_control', 'enterprise_ai_capability_routes',
  'enterprise_ai_command_receipts', 'enterprise_ai_receipt_replay_requests',
  'enterprise_ai_effect_journal', 'enterprise_ai_job_ledger', 'enterprise_ai_usage_ledger',
  'enterprise_evidence_sources', 'enterprise_evidence_source_versions', 'enterprise_evidence_candidates',
  'enterprise_evidence_candidate_edits', 'enterprise_evidence_questions', 'enterprise_evidence_assess_promotions',
  'enterprise_studio_delivery_handoffs', 'enterprise_delivery_work_packages',
  'enterprise_delivery_work_package_versions', 'enterprise_delivery_work_items',
  'enterprise_monitor_baselines', 'enterprise_modernization_assessments',
  'enterprise_modernization_decisions', 'enterprise_assemble_blueprints',
  'enterprise_high_impact_review_events', 'enterprise_high_impact_approvals',
];

let admin;
try {
  admin = await connect(adminUrl);
  for (const [role, attributes] of [['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS']]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      await admin.query(`CREATE ROLE ${role} ${attributes}`);
      createdRoles.push(role);
    }
  }

  const fresh = await createDatabase(admin, names.fresh);
  await apply(fresh, migrations);
  console.log('FOUNDATION PASS fresh ordered apply');

  const upgrade = await createDatabase(admin, names.upgrade);
  await apply(upgrade, baseline);
  await apply(upgrade, featureChain);
  console.log('FOUNDATION PASS accepted-main-to-feature upgrade');

  const populated = await createDatabase(admin, names.populated);
  await apply(populated, baseline);
  const legacyOrg = '99100000-0000-4000-8000-000000000001';
  const legacyProvider = '99100000-0000-4000-8000-000000000002';
  await populated.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Enterprise legacy','enterprise-legacy')", [legacyOrg]);
  await populated.query("INSERT INTO public.ai_provider_configs(id,org_id,provider,display_name,status) VALUES($1,$2,'gemini','Legacy provider','active')", [legacyProvider, legacyOrg]);
  await apply(populated, featureChain);
  assert.deepEqual((await populated.query('SELECT endpoint_url,deployment_name,model_allowlist,budget_policy FROM public.ai_provider_configs WHERE id=$1', [legacyProvider])).rows[0], {
    endpoint_url: null, deployment_name: null, model_allowlist: [], budget_policy: {},
  });
  console.log('FOUNDATION PASS populated upgrade preserves provider rows');

  const dirty = await createDatabase(admin, names.dirty);
  await apply(dirty, baseline);
  await dirty.query('CREATE TABLE public.enterprise_ai_capability_routes(blocker integer)');
  await assert.rejects(transaction(dirty, feature, await readFile(join('supabase/migrations', feature), 'utf8')), /ENTERPRISE_INTELLIGENCE_DIRTY_SCHEMA/);
  assert.equal((await dirty.query("SELECT to_regclass('public.enterprise_evidence_sources') relation")).rows[0].relation, null);
  assert.equal((await dirty.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_provider_configs' AND column_name='endpoint_url'")).rows[0].n, 0);
  assert.equal((await dirty.query("SELECT count(*)::int n FROM public.capabilities WHERE capability_key='evidence.write'")).rows[0].n, 0);
  console.log('FOUNDATION PASS incompatible dirty-schema rejection is atomic');

  const authority = await createDatabase(admin, names.authority);
  await apply(authority, migrations);

  await scenario('PostgreSQL 16 and exact forced-RLS inventory', async () => {
    assert.equal(Number((await authority.query("SELECT current_setting('server_version_num')::int version")).rows[0].version) >= 160000, true);
    const rows = (await authority.query(
      "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",
      [enterpriseTables],
    )).rows;
    assert.equal(rows.length, enterpriseTables.length);
    for (const row of rows) assert.deepEqual([row.relrowsecurity, row.relforcerowsecurity], [true, true], row.relname);
  });
  await scenario('least-privilege table and RPC grants', async () => {
    for (const table of enterpriseTables) {
      assert.equal((await authority.query("SELECT has_table_privilege('authenticated',$1,'SELECT') allowed", [`public.${table}`])).rows[0].allowed, false, table);
      assert.equal((await authority.query("SELECT has_table_privilege('service_role',$1,'SELECT') allowed", [`public.${table}`])).rows[0].allowed, true, table);
      const appendOnly = table === 'enterprise_ai_receipt_replay_requests' || table === 'enterprise_ai_effect_journal';
      assert.equal((await authority.query("SELECT has_table_privilege('service_role',$1,'INSERT') allowed", [`public.${table}`])).rows[0].allowed, appendOnly, `${table}:insert`);
      assert.equal((await authority.query("SELECT has_table_privilege('service_role',$1,'UPDATE,DELETE') allowed", [`public.${table}`])).rows[0].allowed, false, `${table}:update-delete`);
    }
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_create_evidence_source(jsonb,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_create_evidence_source(jsonb,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_create_evidence_source(jsonb,jsonb,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_provider_lifecycle_transition(text,uuid,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_provider_lifecycle_transition(text,uuid,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_provider_lifecycle_transition(text,uuid,uuid,uuid,bigint,jsonb,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
  });

  const fixture = await createEnterpriseIntelligenceFixture(authority);
  await scenario('provider lifecycle is atomic, tenant-bound, freshness-gated, sanitized, and fail-closed', async () => {
    const rpc = async (operation, payload, version = authorizationVersion) => (
      await authority.query(
        'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb) result',
        [operation, fixture.requester, fixture.org, fixture.workspace, version, JSON.stringify(payload)],
      )
    ).rows[0].result;
    const authorizationVersion = Number((await authority.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [fixture.org, fixture.requester],
    )).rows[0].version);
    const config = fixture.uuid(400); const route = fixture.uuid(401);
    const registerPayload = {
      providerConfigId: config, provider: 'openai', displayName: 'Lifecycle provider',
      endpoint: null, deployment: null, defaultModel: 'gpt-fixture', modelAllowlist: ['gpt-fixture'],
      capabilities: ['assess.evidence.extract'], budget: {monthlyRequestLimit: 100},
      routes: [{id: route, capability: 'assess.evidence.extract', model: 'gpt-fixture'}],
    };
    await assert.rejects(rpc('provider.register', registerPayload, authorizationVersion - 1), /PR1B_AUTHORIZATION_STALE/);
    assert.equal((await authority.query('SELECT count(*)::int n FROM public.ai_provider_configs WHERE id=$1', [config])).rows[0].n, 0);
    const foreignOrg = fixture.uuid(410); const foreignWorkspace = fixture.uuid(411);
    await authority.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Lifecycle foreign','lifecycle-foreign')", [foreignOrg]);
    await authority.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Lifecycle foreign','lifecycle-foreign')", [foreignWorkspace, foreignOrg]);
    await assert.rejects(authority.query(
      'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb)',
      ['provider.register', fixture.requester, foreignOrg, foreignWorkspace, authorizationVersion, JSON.stringify({...registerPayload, providerConfigId: fixture.uuid(412)})],
    ), /PR1B_NOT_FOUND|PR1B_AUTHORIZATION_STALE/);
    await assert.rejects(rpc('provider.register', {...registerPayload, providerConfigId: fixture.uuid(402), providerKey: 'sk-test-must-never-persist'}), /ENTERPRISE_PROVIDER_LIFECYCLE_INVALID/);
    await assert.rejects(rpc('provider.register', {...registerPayload, providerConfigId: fixture.uuid(413), budget: {nested: {api_key: 'sk-nested-must-never-persist'}}}), /ENTERPRISE_PROVIDER_LIFECYCLE_INVALID/);
    const registered = await rpc('provider.register', registerPayload);
    assert.deepEqual([registered.providerConfigId, registered.status], [config, 'pending_review']);
    assert.deepEqual((await authority.query('SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [route])).rows[0].allowed_roles, [fixture.routeRole]);
    const tenantSegment = fixture.org.replaceAll('-', '').toUpperCase();
    const firstKey = fixture.uuid(403);
    const firstReference = `AVALA_PROVIDER_SECRET_OPENAI_${tenantSegment}_FIRST`;
    await rpc('provider.secret.bind', {
      providerConfigId: config, provider: 'openai', keyRefId: firstKey,
      secretReference: firstReference, safeFingerprint: `sha256:${'1'.repeat(24)}`, backend: 'environment',
    });
    await rpc('provider.validate', {providerConfigId: config, lastValidatedAt: '2000-01-01T00:00:00.000Z'});
    const serverValidation = (await authority.query('SELECT last_validated_at FROM public.ai_provider_configs WHERE id=$1', [config])).rows[0].last_validated_at;
    assert.ok(Date.now() - new Date(serverValidation).getTime() < 60_000);
    await authority.query("UPDATE public.ai_provider_configs SET last_validated_at=now()-interval '25 hours' WHERE id=$1", [config]);
    await assert.rejects(rpc('provider.activate', {providerConfigId: config, keyRefId: firstKey}), /ENTERPRISE_PROVIDER_VALIDATION_STALE/);
    await rpc('provider.validate', {providerConfigId: config, lastValidatedAt: new Date().toISOString()});
    await rpc('provider.activate', {providerConfigId: config, keyRefId: firstKey});
    await rpc('provider.route.toggle', {
      providerConfigId: config, routeId: route, capability: 'assess.evidence.extract',
      enabled: true, allowedRoles: [fixture.routeRole],
    });
    const roles = (await authority.query('SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [route])).rows[0].allowed_roles;
    assert.deepEqual(roles, [fixture.routeRole]);
    await assert.rejects(rpc('provider.route.toggle', {
      providerConfigId: config, routeId: route, capability: 'assess.evidence.extract',
      enabled: true, allowedRoles: ['workspace reviewer'],
    }), /ENTERPRISE_PROVIDER_ROUTE_ROLES_INVALID/);
    await rpc('provider.route.toggle', {providerConfigId: config, routeId: route, enabled: false});
    await rpc('provider.route.toggle', {providerConfigId: config, routeId: route, capability: 'assess.evidence.extract', enabled: true});
    assert.deepEqual((await authority.query('SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [route])).rows[0].allowed_roles, roles);
    const secondWorkspace = fixture.uuid(414); const secondWorkspaceRoute = fixture.uuid(415); const secondWorkspaceRole = fixture.uuid(416);
    await authority.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Lifecycle second workspace','lifecycle-second')", [secondWorkspace, fixture.org]);
    await authority.query("INSERT INTO public.roles(id,org_id,workspace_id,name,slug,scope,permissions) VALUES($1,$2,$3,'Lifecycle second role','lifecycle-second-role','workspace','[]')", [secondWorkspaceRole, fixture.org, secondWorkspace]);
    await authority.query(`INSERT INTO public.enterprise_ai_capability_routes(
      id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by)
      VALUES($1,$2,$3,$4,'assess.evidence.extract','gpt-fixture',true,ARRAY[$6::text],$5,$5)`,
    [secondWorkspaceRoute, fixture.org, secondWorkspace, config, fixture.requester, secondWorkspaceRole]);
    const secondKey = fixture.uuid(404);
    await rpc('provider.secret.rotate', {
      providerConfigId: config, provider: 'openai', previousKeyRefId: firstKey, keyRefId: secondKey,
      secretReference: `AVALA_PROVIDER_SECRET_OPENAI_${tenantSegment}_SECOND`,
      safeFingerprint: `sha256:${'2'.repeat(24)}`, backend: 'environment', lastValidatedAt: new Date().toISOString(),
    });
    assert.deepEqual((await authority.query('SELECT status,rotation_status,deleted_at IS NOT NULL retired FROM public.ai_provider_key_refs WHERE id=$1', [firstKey])).rows[0], {status: 'retired', rotation_status: 'rotated', retired: true});
    await rpc('provider.revoke', {providerConfigId: config, keyRefId: secondKey, disableAllRoutes: true});
    assert.deepEqual((await authority.query('SELECT c.status,r.enabled,k.status key_status FROM public.ai_provider_configs c JOIN public.enterprise_ai_capability_routes r ON r.provider_config_id=c.id JOIN public.ai_provider_key_refs k ON k.id=$2 WHERE c.id=$1', [config, secondKey])).rows[0], {status: 'retired', enabled: false, key_status: 'retired'});
    assert.deepEqual((await authority.query('SELECT workspace_id,enabled FROM public.enterprise_ai_capability_routes WHERE provider_config_id=$1 ORDER BY workspace_id', [config])).rows, [
      {workspace_id: fixture.workspace, enabled: false},
      {workspace_id: secondWorkspace, enabled: false},
    ].sort((left, right) => left.workspace_id.localeCompare(right.workspace_id)));
    const evidence = (await authority.query('SELECT count(*)::int events, bool_and(org_id=$2 AND workspace_id=$3) tenant_bound, string_agg(metadata::text,\' \') metadata FROM public.ai_provider_audit_events WHERE provider_config_id=$1', [config, fixture.org, fixture.workspace])).rows[0];
    assert.equal(evidence.events, 10);
    assert.equal(evidence.tenant_bound, true);
    assert.doesNotMatch(evidence.metadata, /sk-test-must-never-persist|AVALA_PROVIDER_SECRET|providerKey/i);
  });
  await scenario('provider organization authority and exact workspace routes are separated', async () => {
    const workspaceB = fixture.uuid(630); const routeA = fixture.uuid(631); const routeB = fixture.uuid(632);
    const workspaceManager = fixture.uuid(633); const orgMemberRole = fixture.uuid(634); const workspaceRole = fixture.uuid(635);
    await authority.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Provider workspace B','provider-workspace-b')", [workspaceB, fixture.org]);
    await authority.query('INSERT INTO auth.users(id) VALUES($1)', [workspaceManager]);
    await authority.query("INSERT INTO public.profiles(id,email) VALUES($1,'workspace-manager@fixture.invalid')", [workspaceManager]);
    await authority.query("INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Organization member','provider-org-member','organization','[]')", [orgMemberRole, fixture.org]);
    await authority.query("INSERT INTO public.roles(id,org_id,workspace_id,name,slug,scope,permissions) VALUES($1,$2,$3,'Workspace provider manager','provider-workspace-manager','workspace','[]')", [workspaceRole, fixture.org, workspaceB]);
    await authority.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'byok.manage'),($1,'security.manage')", [workspaceRole]);
    await authority.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')", [fixture.org, workspaceManager, orgMemberRole]);
    await authority.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) VALUES($1,$2,$3,$4,'active')", [fixture.org, workspaceB, workspaceManager, workspaceRole]);
    const managerVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, workspaceManager])).rows[0].version);
    await authority.query(`INSERT INTO public.enterprise_ai_capability_routes(
      id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by)
 …10227 tokens truncated… = Number((await authority.query('SELECT count(*)::int n FROM public.enterprise_evidence_questions')).rows[0].n);
    await authority.query("INSERT INTO public.enterprise_evidence_questions(id,source_id,org_id,workspace_id,question,status,created_by) VALUES($1,$2,$3,$4,'Post-commit truth fixture','open',$5)", [effectId, fixture.sources[0].sourceId, fixture.org, fixture.workspace, fixture.requester]);
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET ingestion_enabled=false WHERE singleton=true');
    assert.equal((await authority.query('SELECT status FROM public.enterprise_ai_command_receipts WHERE id=$1', [receipt.id])).rows[0]?.status, 'claimed');
    const completed = (await authority.query("SELECT completed.* FROM public.enterprise_ai_complete_command($1,$2,$3,'{\"outcome\":\"committed\"}'::jsonb,$4) completed", [receipt.id, fixture.org, fixture.workspace, effectId])).rows[0];
    assert.deepEqual([completed.status, completed.response.outcome], ['committed', 'committed']);
    const replay = (await authority.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*', [fixture.requester, fixture.org, fixture.workspace, 'evidence.candidate.review', 'post-commit-control-001', request, hash, null])).rows[0];
    assert.deepEqual([replay.id, replay.status, replay.response.outcome], [receipt.id, 'committed', 'committed']);
    assert.equal(Number((await authority.query('SELECT count(*)::int n FROM public.enterprise_evidence_questions')).rows[0].n), beforeEffects + 1);
    await assert.rejects(authority.query('SELECT public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)', [fixture.requester, fixture.org, fixture.workspace, 'evidence.candidate.review', 'post-commit-control-001', request, fixture.hash('0'), null]), /ENTERPRISE_AI_IDEMPOTENCY_CONFLICT/);
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET ingestion_enabled=true WHERE singleton=true');
    console.log(`POST COMMIT CONTROL CHANGE ${JSON.stringify({receiptStatus:completed.status,effectDelta:1,replayStatus:replay.status,duplicateEffects:0,conflict:'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT'})}`);
  });
  await scenario('terminal failure finalizes while disabled and no claimed receipts remain', async () => {
    const receipt = (await authority.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*', [fixture.requester, fixture.org, fixture.workspace, 'assemble.blueprint.create', 'disabled-failure-001', fixture.uuid(590), fixture.hash('7'), null])).rows[0];
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET assemble_enabled=false WHERE singleton=true');
    const failed = (await authority.query("SELECT failed.* FROM public.enterprise_ai_fail_command($1,$2,$3,'{\"code\":\"TERMINAL_FIXTURE_FAILURE\"}'::jsonb,false) failed", [receipt.id, fixture.org, fixture.workspace])).rows[0];
    assert.deepEqual([failed.status, failed.response.code], ['failed', 'TERMINAL_FIXTURE_FAILURE']);
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET assemble_enabled=true WHERE singleton=true');
    const claimed = Number((await authority.query("SELECT count(*)::int n FROM public.enterprise_ai_command_receipts WHERE status='claimed'")).rows[0].n);
    assert.equal(claimed, 0);
    console.log(`RECEIPT FINALIZATION COUNTS ${JSON.stringify({failedWhileDisabled:1,claimedFinal:claimed})}`);
  });
  await scenario('candidate lineage, stale edit rejection, and edited Assess draft promotion', async () => {
    const initial = (await authority.query('SELECT value,version,provenance_hash FROM public.enterprise_evidence_candidates WHERE id=$1', [fixture.candidate])).rows[0];
    const edited = (await authority.query('SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [fixture.candidate, fixture.org, fixture.workspace, 'Govern the reviewed fixture process', fixture.hash('e'), 'edited', fixture.reviewer, initial.value, 'Corrected against source'])).rows[0].result;
    assert.equal(Number(edited.version), 2);
    assert.notEqual(edited.provenanceHash, initial.provenance_hash);
    await assert.rejects(authority.query('SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9)', [fixture.candidate, fixture.org, fixture.workspace, 'stale', fixture.hash('e'), 'edited', fixture.reviewer, initial.value, 'stale']), /ENTERPRISE_EVIDENCE_VERSION_CONFLICT/);
    const editHistory = (await authority.query('SELECT actor_id,next_value,resulting_version,resulting_provenance_hash FROM public.enterprise_evidence_candidate_edits WHERE candidate_id=$1', [fixture.candidate])).rows;
    assert.equal(editHistory.length, 1);
    assert.deepEqual([editHistory[0].actor_id, editHistory[0].next_value, Number(editHistory[0].resulting_version), editHistory[0].resulting_provenance_hash], [fixture.reviewer, 'Govern the reviewed fixture process', 2, edited.provenanceHash]);
    await authority.query("UPDATE public.assess_v2_cases SET status='draft' WHERE id=$1", [fixture.caseId]);
    const authorizationVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.requester])).rows[0].version);
    const request = fixture.uuid(330);
    const promoted = (await authority.query('SELECT public.enterprise_promote_evidence_to_assess_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [fixture.candidate, fixture.caseId, 2, fixture.requester, fixture.org, fixture.workspace, request, 'fixture-promotion-001', authorizationVersion])).rows[0].result;
    assert.equal(promoted.outcome, 'committed');
    assert.equal(Number(promoted.resource.caseVersion), 3);
    assert.equal((await authority.query('SELECT suggestion_status FROM public.enterprise_evidence_candidates WHERE id=$1', [fixture.candidate])).rows[0].suggestion_status, 'edited');
    const replay = (await authority.query('SELECT public.enterprise_promote_evidence_to_assess_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [fixture.candidate, fixture.caseId, 2, fixture.requester, fixture.org, fixture.workspace, request, 'fixture-promotion-001', authorizationVersion])).rows[0].result;
    assert.equal(replay.outcome, 'replayed');
    await assert.rejects(authority.query('UPDATE public.enterprise_evidence_assess_promotions SET field_key=$1 WHERE candidate_id=$2', ['outcome', fixture.candidate]), /ENTERPRISE_APPEND_ONLY/);
  });
  await scenario('Delivery derives IDs/hashes, enforces three-person approval, and gates Monitor', async () => {
    const handoff = fixture.uuid(340); const workPackage = fixture.uuid(341); const version = fixture.uuid(342);
    const rootLogical = fixture.uuid(343); const childLogical = fixture.uuid(344);
    const result = (await authority.query('SELECT public.enterprise_commit_delivery_handoff($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb) result', [
      JSON.stringify({id: handoff, org_id: fixture.org, workspace_id: fixture.workspace, studio_document_id: fixture.artifactId, studio_version_id: fixture.version.id, studio_version: Number(fixture.version.version), studio_content_hash: fixture.version.content_hash, created_by: fixture.requester}),
      JSON.stringify({id: workPackage, created_by: fixture.requester}),
      JSON.stringify({id: version, content: {title: 'Canonical delivery'}, content_hash: fixture.hash('f'), created_by: fixture.requester}),
      JSON.stringify([
        {id: rootLogical, itemType: 'Epic', title: 'Root', description: '', acceptanceCriteria: ['reviewed'], nonFunctionalRequirements: [], sourceSectionLocator: 'sections[0]', idempotencyKey: 'delivery-root-001', createdBy: fixture.requester},
        {id: childLogical, parentId: rootLogical, itemType: 'Task', title: 'Child', description: '', acceptanceCriteria: ['verified'], nonFunctionalRequirements: [], sourceSectionLocator: 'sections[0]', idempotencyKey: 'delivery-child-001', createdBy: fixture.requester},
      ]),
    ])).rows[0].result;
    assert.notEqual(result.contentHash, fixture.hash('f'));
    assert.equal(result.itemIds.length, 2);
    const child = (await authority.query("SELECT parent_item_id FROM public.enterprise_delivery_work_items WHERE package_version_id=$1 AND title='Child'", [version])).rows[0];
    assert.equal(child.parent_item_id, result.itemIds[0]);
    const reviewerVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.reviewer])).rows[0].version);
    const reviewEvent = fixture.uuid(345);
    await authority.query(`INSERT INTO public.enterprise_high_impact_review_events(id,org_id,workspace_id,resource_type,resource_id,reviewer_id,reviewer_authorization_version,resource_version,resource_hash,outcome,rationale)
      VALUES($1,$2,$3,'delivery_work_package',$4,$5,$6,999,$7,'approved','Independent fixture review')`, [reviewEvent, fixture.org, fixture.workspace, workPackage, fixture.reviewer, reviewerVersion, fixture.hash('0')]);
    await assert.rejects(authority.query('SELECT public.enterprise_commit_high_impact_approval($1::jsonb,$2,$3,$4,$5,$6)', [JSON.stringify({created_by: fixture.requester, reviewed_by: fixture.reviewer, approved_by: fixture.reviewer, review_event_id: reviewEvent, outcome: 'approved', rationale: 'invalid same actor'}), 'delivery_work_package', workPackage, fixture.org, fixture.workspace, 'approved']), /ENTERPRISE_APPROVAL_SEPARATION/);
    await authority.query('SELECT public.enterprise_commit_high_impact_approval($1::jsonb,$2,$3,$4,$5,$6)', [JSON.stringify({created_by: fixture.requester, reviewed_by: fixture.reviewer, approved_by: fixture.approver, review_event_id: reviewEvent, outcome: 'approved', rationale: 'Independent approval'}), 'delivery_work_package', workPackage, fixture.org, fixture.workspace, 'approved']);
    const baselineId = fixture.uuid(346);
    const monitor = (await authority.query('SELECT public.enterprise_commit_monitor_baseline($1::jsonb,$2,$3,$4) result', [JSON.stringify({id: baselineId, workPackageVersionId: version, approvedItemIds: result.itemIds, milestones: [], dependencies: [], blockers: [], risks: []}), fixture.requester, fixture.org, fixture.workspace])).rows[0].result;
    assert.deepEqual([monitor.status, monitor.readiness], ['approval_required', 'review_required']);
    const persisted = (await authority.query('SELECT live_telemetry_connected,resource_hash FROM public.enterprise_monitor_baselines WHERE id=$1', [baselineId])).rows[0];
    assert.equal(persisted.live_telemetry_connected, false);
    assert.equal(persisted.resource_hash, monitor.resourceHash);
    await assert.rejects(authority.query("UPDATE public.enterprise_delivery_work_items SET title='mutated' WHERE package_version_id=$1", [version]), /ENTERPRISE_APPEND_ONLY/);
  });
  await scenario('Modernization ancestry derives a governed decision and Assemble remains draft-only until approval', async () => {
    const application = fixture.uuid(360); const metadata = fixture.uuid(361); const sourceAssessment = fixture.uuid(362);
    await authority.query(`INSERT INTO public.assess_application_assets(id,org_id,workspace_id,name,normalized_name,created_by)
      VALUES($1,$2,$3,'Fixture application','fixture application',$4)`, [application, fixture.org, fixture.workspace, fixture.requester]);
    await authority.query(`INSERT INTO public.assess_application_metadata_versions(id,org_id,workspace_id,application_id,version,lifecycle,metadata,author_id)
      VALUES($1,$2,$3,$4,1,'approved','{}'::jsonb,$5)`, [metadata, fixture.org, fixture.workspace, application, fixture.requester]);
    const authorizationVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.requester])).rows[0].version);
    await authority.query(`INSERT INTO public.assess_application_assessment_versions(
      id,org_id,workspace_id,application_id,metadata_version_id,version,decision_model_version,lifecycle,author_id,authorization_version)
      VALUES($1,$2,$3,$4,$5,1,'assess-v2-application-portfolio-2026-07','approved',$6,$7)`,
    [sourceAssessment, fixture.org, fixture.workspace, application, metadata, fixture.requester, authorizationVersion]);
    const dimensions = [
      'integration_accessibility', 'semantic_and_data_clarity', 'state_and_execution',
      'security_and_control', 'architecture_changeability', 'ui_automation_readiness',
      'ai_assisted_engineering_readiness',
    ];
    await authority.query(`INSERT INTO public.assess_application_dimension_results(
      org_id,workspace_id,application_id,metadata_version_id,assessment_version_id,dimension,
      readiness_band,evidence_confidence,hard_gates,evidence_refs,missing_evidence,rationale,
      contradictions,remediation_requirements,what_would_change)
      SELECT $1,$2,$3,$4,$5,dimension,'Ready','Verified','{}'::text[],'[]'::jsonb,
        '{}'::text[],ARRAY['verified'],'{}'::text[],'{}'::text[],ARRAY['new evidence']
      FROM unnest($6::text[]) dimension`, [fixture.org, fixture.workspace, application, metadata, sourceAssessment, dimensions]);
    await authority.query(`INSERT INTO public.assess_application_modernization_recommendations(
      org_id,workspace_id,application_id,metadata_version_id,assessment_version_id,disposition,
      migration_boundary,rollback_strategy,evidence_confidence)
      VALUES($1,$2,$3,$4,$5,'assemble','draft-only boundary','retain current system','Verified')`,
    [fixture.org, fixture.workspace, application, metadata, sourceAssessment]);
    const enterpriseAssessment = fixture.uuid(363); const decision = fixture.uuid(364);
    const committed = (await authority.query('SELECT public.enterprise_commit_modernization_assessment($1::jsonb,$2::jsonb) result', [
      JSON.stringify({id: enterpriseAssessment, org_id: fixture.org, workspace_id: fixture.workspace, application_ref: application, source_assessment_id: sourceAssessment, source_metadata_version_id: metadata, created_by: fixture.requester}),
      JSON.stringify({id: decision, created_by: fixture.requester}),
    ])).rows[0].result;
    assert.equal(committed.primaryDisposition, 'assemble');
    assert.match(committed.resourceHash, /^[0-9a-f]{64}$/);
    const reviewerVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.reviewer])).rows[0].version);
    const decisionReview = fixture.uuid(365);
    await authority.query(`INSERT INTO public.enterprise_high_impact_review_events(id,org_id,workspace_id,resource_type,resource_id,reviewer_id,reviewer_authorization_version,resource_version,resource_hash,outcome,rationale)
      VALUES($1,$2,$3,'modernization_decision',$4,$5,$6,1,$7,'approved','Independent modernization review')`,
    [decisionReview, fixture.org, fixture.workspace, decision, fixture.reviewer, reviewerVersion, fixture.hash('0')]);
    await authority.query('SELECT public.enterprise_commit_high_impact_approval($1::jsonb,$2,$3,$4,$5,$6)', [JSON.stringify({created_by: fixture.requester, reviewed_by: fixture.reviewer, approved_by: fixture.approver, review_event_id: decisionReview, outcome: 'approved', rationale: 'Modernization approval'}), 'modernization_decision', decision, fixture.org, fixture.workspace, 'approved']);
    const blueprint = fixture.uuid(366);
    const assembled = (await authority.query('SELECT public.enterprise_commit_assemble_blueprint($1::jsonb,$2,$3,$4) result', [JSON.stringify({id: blueprint, modernizationDecisionId: decision, structuredContent: {components: []}, readableDocument: 'Draft-only fixture blueprint'}), fixture.requester, fixture.org, fixture.workspace])).rows[0].result;
    assert.deepEqual([assembled.status, assembled.executionEnabled, assembled.runtimeAgentsEnabled, assembled.liveTelemetryEnabled], ['draft', false, false, false]);
    const flags = (await authority.query(`SELECT code_generation_enabled,deployment_enabled,infrastructure_changes_enabled,
      credential_access_enabled,source_system_calls_enabled,runtime_agents_enabled,live_telemetry_enabled
      FROM public.enterprise_assemble_blueprints WHERE id=$1`, [blueprint])).rows[0];
    assert.deepEqual(Object.values(flags), [false, false, false, false, false, false, false]);
    const blueprintReview = fixture.uuid(367);
    await authority.query(`INSERT INTO public.enterprise_high_impact_review_events(id,org_id,workspace_id,resource_type,resource_id,reviewer_id,reviewer_authorization_version,resource_version,resource_hash,outcome,rationale)
      VALUES($1,$2,$3,'assemble_blueprint',$4,$5,$6,1,$7,'approved','Independent blueprint review')`,
    [blueprintReview, fixture.org, fixture.workspace, blueprint, fixture.reviewer, reviewerVersion, fixture.hash('0')]);
    await authority.query('SELECT public.enterprise_commit_high_impact_approval($1::jsonb,$2,$3,$4,$5,$6)', [JSON.stringify({created_by: fixture.requester, reviewed_by: fixture.reviewer, approved_by: fixture.approver, review_event_id: blueprintReview, outcome: 'approved', rationale: 'Blueprint approval'}), 'assemble_blueprint', blueprint, fixture.org, fixture.workspace, 'approved']);
    await assert.rejects(authority.query("UPDATE public.enterprise_assemble_blueprints SET status='rejected' WHERE id=$1", [blueprint]), /ENTERPRISE_RESOURCE_IMMUTABLE_OR_TRANSITION_INVALID/);
  });
  await scenario('read-only rollback blocks mutations while capability projection remains available', async () => {
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET read_only=true WHERE singleton=true');
    await assert.rejects(authority.query('SELECT public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)', [fixture.requester, fixture.org, fixture.workspace, 'evidence.source.create', 'fixture-readonly-001', fixture.uuid(350), fixture.hash('a'), null]), /ENTERPRISE_INTELLIGENCE_READ_ONLY/);
    await authority.query('BEGIN');
    try {
      await authority.query('SET LOCAL ROLE authenticated');
      await authority.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [fixture.requester]);
      const projection = (await authority.query('SELECT public.enterprise_evidence_source_projection($1,$2,$3) projection', [fixture.org, fixture.workspace, fixture.sources[0].sourceId])).rows[0].projection;
      assert.ok(projection);
      assert.equal(Object.hasOwn(projection, 'storagePath'), false);
      await assert.rejects(authority.query("INSERT INTO public.enterprise_evidence_questions(source_id,org_id,workspace_id,question,status,created_by) VALUES($1,$2,$3,'forbidden','open',$4)", [fixture.sources[0].sourceId, fixture.org, fixture.workspace, fixture.requester]), /permission denied/);
    } finally { await authority.query('ROLLBACK'); }
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET read_only=false WHERE singleton=true');
  });

  console.log(`Enterprise Intelligence PostgreSQL executable scenarios: ${scenarios.length} passed, 0 failed.`);
} finally {
  for (const client of clients.reverse()) if (client !== admin) await client.end().catch(() => {});
  if (admin) {
    let cleanupFailed = false;
    for (const name of createdDatabases.reverse()) {
      try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); console.log(`CLEANUP DROPPED DATABASE ${name}`); }
      catch (error) { cleanupFailed = true; console.error(`CLEANUP FAILED DATABASE ${name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    for (const role of createdRoles.reverse()) {
      try { await admin.query(`DROP ROLE IF EXISTS ${role}`); }
      catch (error) { cleanupFailed = true; console.error(`CLEANUP FAILED ROLE ${role}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    await admin.end().catch(() => {});
    console.log(`CLEANUP ${cleanupFailed ? 'FAILED' : 'PASS'}`);
    if (cleanupFailed) process.exitCode = 1;
  }
}
