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
  'enterprise_ai_command_receipts', 'enterprise_ai_job_ledger', 'enterprise_ai_usage_ledger',
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
      assert.equal((await authority.query("SELECT has_table_privilege('service_role',$1,'INSERT,UPDATE,DELETE') allowed", [`public.${table}`])).rows[0].allowed, false, table);
    }
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_create_evidence_source(jsonb,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_create_evidence_source(jsonb,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_provider_lifecycle_transition(text,uuid,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_provider_lifecycle_transition(text,uuid,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
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
      enabled: true, allowedRoles: ['Admin', 'Reviewer'],
    });
    const roles = (await authority.query('SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [route])).rows[0].allowed_roles;
    assert.deepEqual(roles, ['admin', 'reviewer']);
    await rpc('provider.route.toggle', {providerConfigId: config, routeId: route, enabled: false});
    await rpc('provider.route.toggle', {providerConfigId: config, routeId: route, capability: 'assess.evidence.extract', enabled: true});
    assert.deepEqual((await authority.query('SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [route])).rows[0].allowed_roles, roles);
    const secondWorkspace = fixture.uuid(414); const secondWorkspaceRoute = fixture.uuid(415);
    await authority.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Lifecycle second workspace','lifecycle-second')", [secondWorkspace, fixture.org]);
    await authority.query(`INSERT INTO public.enterprise_ai_capability_routes(
      id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by)
      VALUES($1,$2,$3,$4,'assess.evidence.extract','gpt-fixture',true,ARRAY['admin'],$5,$5)`,
    [secondWorkspaceRoute, fixture.org, secondWorkspace, config, fixture.requester]);
    const secondKey = fixture.uuid(404);
    await rpc('provider.secret.rotate', {
      providerConfigId: config, provider: 'openai', previousKeyRefId: firstKey, keyRefId: secondKey,
      secretReference: `AVALA_PROVIDER_SECRET_OPENAI_${tenantSegment}_SECOND`,
      safeFingerprint: `sha256:${'2'.repeat(24)}`, backend: 'environment', lastValidatedAt: new Date().toISOString(),
    });
    assert.deepEqual((await authority.query('SELECT status,rotation_status,deleted_at IS NOT NULL retired FROM public.ai_provider_key_refs WHERE id=$1', [firstKey])).rows[0], {status: 'retired', rotation_status: 'rotated', retired: true});
    await rßNø¶‰žËkºwµçI”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°€½Ù•É¸Ñ¡”É•Ù¥•Ý•™¥áÑÕÉ”ÁÉ½•ÍÌœ°™¥áÑÕÉ”¹¡…Í  ”œ¤°€…•ÁÑ•œ°™¥áÑÕÉ”¹É•Ù¥•Ý•È°€½Ù•É¸Ñ¡”É•Ù¥•Ý•™¥áÑÕÉ”ÁÉ½•ÍÌœ°€•ÁÑ•……¥¹ÍÐÍ½ÕÉ”t¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä ‰UAQÁÕ‰±¥Œ¹…ÍÍ•ÍÍ}ØÉ}…Í•ÌMPÍÑ…ÑÕÌô‘É…™Ðœ]!I¥ôÄˆ°m™¥áÑÕÉ”¹…Í•%‘t¤ì(€€€½¹ÍÐ…ÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¸€ô9Õµ‰•È ¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÙ•ÉÍ¥½¸I=4ÁÕ‰±¥Œ¹…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¹Ì]!I½É}¥ôÄ9ÕÍ•É}¥ôÈœ°m™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Ét¤¤¹É½ÝÍlÁt¹Ù•ÉÍ¥½¸¤ì(€€€½¹ÍÐÉ•ÅÕ•ÍÐ€ô™¥áÑÕÉ”¹ÕÕ¥ ÌÌÀ¤ì(€€€½¹ÍÐÁÉ½µ½Ñ•€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}ÁÉ½µ½Ñ•}•Ù¥‘•¹•}Ñ½}…ÍÍ•ÍÍ}ØÈ Ä°È°Ì°Ð°Ô°Ø°Ü°à°ä¤É•ÍÕ±Ðœ°m™¥áÑÕÉ”¹…¹‘¥‘…Ñ”°™¥áÑÕÉ”¹…Í•%°€È°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°É•ÅÕ•ÍÐ°€™¥áÑÕÉ”µÁÉ½µ½Ñ¥½¸´ÀÀÄœ°…ÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¹t¤¤¹É½ÝÍlÁt¹É•ÍÕ±Ðì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÁÉ½µ½Ñ•¹½ÕÑ½µ”°€½µµ¥ÑÑ•œ¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È¡ÁÉ½µ½Ñ•¹É•Í½ÕÉ”¹…Í•Y•ÉÍ¥½¸¤°€Ì¤ì(€€€½¹ÍÐÉ•Á±…ä€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}ÁÉ½µ½Ñ•}•Ù¥‘•¹•}Ñ½}…ÍÍ•ÍÍ}ØÈ Ä°È°Ì°Ð°Ô°Ø°Ü°à°ä¤É•ÍÕ±Ðœ°m™¥áÑÕÉ”¹…¹‘¥‘…Ñ”°™¥áÑÕÉ”¹…Í•%°€È°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°É•ÅÕ•ÍÐ°€™¥áÑÕÉ”µÁÉ½µ½Ñ¥½¸´ÀÀÄœ°…ÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¹t¤¤¹É½ÝÍlÁt¹É•ÍÕ±Ðì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Á±…ä¹½ÕÑ½µ”°€É•Á±…å•œ¤ì(€€€…Ý…¥Ð…ÍÍ•ÉÐ¹É•©•ÑÌ¡…ÕÑ¡½É¥Ñä¹ÅÕ•Éä UAQÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}•Ù¥‘•¹•}…ÍÍ•ÍÍ}ÁÉ½µ½Ñ¥½¹ÌMP™¥•±‘}­•äôÄ]!I…¹‘¥‘…Ñ•}¥ôÈœ°l½ÕÑ½µ”œ°™¥áÑÕÉ”¹…¹‘¥‘…Ñ•t¤°€½9QIAI%M}AA9}=91d¼¤ì(€ô¤ì(€…Ý…¥ÐÍ•¹…É¥¼ •±¥Ù•Éä‘•É¥Ù•Ì%Ì½¡…Í¡•Ì°•¹™½É•ÌÑ¡É•”µÁ•ÉÍ½¸…ÁÁÉ½Ù…°°…¹…Ñ•Ì5½¹¥Ñ½Èœ°…Íå¹Œ€ ¤€ôøì(€€€½¹ÍÐ¡…¹‘½™˜€ô™¥áÑÕÉ”¹ÕÕ¥ ÌÐÀ¤ì½¹ÍÐÝ½É­A…­…”€ô™¥áÑÕÉ”¹ÕÕ¥ ÌÐÄ¤ì½¹ÍÐÙ•ÉÍ¥½¸€ô™¥áÑÕÉ”¹ÕÕ¥ ÌÐÈ¤ì(€€€½¹ÍÐÉ½½Ñ1½¥…°€ô™¥áÑÕÉ”¹ÕÕ¥ ÌÐÌ¤ì½¹ÍÐ¡¥±‘1½¥…°€ô™¥áÑÕÉ”¹ÕÕ¥ ÌÐÐ¤ì(€€€½¹ÍÐÉ•ÍÕ±Ð€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}‘•±¥Ù•Éå}¡…¹‘½™˜ Äèé©Í½¹ˆ°Èèé©Í½¹ˆ°Ìèé©Í½¹ˆ°Ðèé©Í½¹ˆ¤É•ÍÕ±Ðœ°l(€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡í¥è¡…¹‘½™˜°½É}¥è™¥áÑÕÉ”¹½Éœ°Ý½É­ÍÁ…•}¥è™¥áÑÕÉ”¹Ý½É­ÍÁ…”°ÍÑÕ‘¥½}‘½Õµ•¹Ñ}¥è™¥áÑÕÉ”¹…ÉÑ¥™…Ñ%°ÍÑÕ‘¥½}Ù•ÉÍ¥½¹}¥è™¥áÑÕÉ”¹Ù•ÉÍ¥½¸¹¥°ÍÑÕ‘¥½}Ù•ÉÍ¥½¸è9Õµ‰•È¡™¥áÑÕÉ”¹Ù•ÉÍ¥½¸¹Ù•ÉÍ¥½¸¤°ÍÑÕ‘¥½}½¹Ñ•¹Ñ}¡…Í è™¥áÑÕÉ”¹Ù•ÉÍ¥½¸¹½¹Ñ•¹Ñ}¡…Í °É•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Éô¤°(€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡í¥èÝ½É­A…­…”°É•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Éô¤°(€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡í¥èÙ•ÉÍ¥½¸°½¹Ñ•¹ÐèíÑ¥Ñ±”è€…¹½¹¥…°‘•±¥Ù•Éäô°½¹Ñ•¹Ñ}¡…Í è™¥áÑÕÉ”¹¡…Í  ˜œ¤°É•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Éô¤°(€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡l(€€€€€€€í¥èÉ½½Ñ1½¥…°°¥Ñ•µQåÁ”è€Á¥Œœ°Ñ¥Ñ±”è€I½½Ðœ°‘•ÍÉ¥ÁÑ¥½¸è€œœ°…•ÁÑ…¹•É¥Ñ•É¥„èlÉ•Ù¥•Ý•t°¹½¹Õ¹Ñ¥½¹…±I•ÅÕ¥É•µ•¹ÑÌèmt°Í½ÕÉ•M•Ñ¥½¹1½…Ñ½Èè€Í•Ñ¥½¹ÍlÁtœ°¥‘•µÁ½Ñ•¹å-•äè€‘•±¥Ù•ÉäµÉ½½Ð´ÀÀÄœ°É•…Ñ•‘	äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Éô°(€€€€€€€í¥è¡¥±‘1½¥…°°Á…É•¹Ñ%èÉ½½Ñ1½¥…°°¥Ñ•µQåÁ”è€Q…Í¬œ°Ñ¥Ñ±”è€¡¥±œ°‘•ÍÉ¥ÁÑ¥½¸è€œœ°…•ÁÑ…¹•É¥Ñ•É¥„èlÙ•É¥™¥•t°¹½¹Õ¹Ñ¥½¹…±I•ÅÕ¥É•µ•¹ÑÌèmt°Í½ÕÉ•M•Ñ¥½¹1½…Ñ½Èè€Í•Ñ¥½¹ÍlÁtœ°¥‘•µÁ½Ñ•¹å-•äè€‘•±¥Ù•Éäµ¡¥±´ÀÀÄœ°É•…Ñ•‘	äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Éô°(€€€€€t¤°(€€€t¤¤¹É½ÝÍlÁt¹É•ÍÕ±Ðì(€€€…ÍÍ•ÉÐ¹¹½ÑÅÕ…°¡É•ÍÕ±Ð¹½¹Ñ•¹Ñ!…Í °™¥áÑÕÉ”¹¡…Í  ˜œ¤¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÕ±Ð¹¥Ñ•µ%‘Ì¹±•¹Ñ °€È¤ì(€€€½¹ÍÐ¡¥±€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä ‰M1PÁ…É•¹Ñ}¥Ñ•µ}¥I=4ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}‘•±¥Ù•Éå}Ý½É­}¥Ñ•µÌ]!IÁ…­…•}Ù•ÉÍ¥½¹}¥ôÄ9Ñ¥Ñ±”ô¡¥±œˆ°mÙ•ÉÍ¥½¹t¤¤¹É½ÝÍlÁtì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡¡¥±¹Á…É•¹Ñ}¥Ñ•µ}¥°É•ÍÕ±Ð¹¥Ñ•µ%‘ÍlÁt¤ì(€€€½¹ÍÐÉ•Ù¥•Ý•ÉY•ÉÍ¥½¸€ô9Õµ‰•È ¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÙ•ÉÍ¥½¸I=4ÁÕ‰±¥Œ¹…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¹Ì]!I½É}¥ôÄ9ÕÍ•É}¥ôÈœ°m™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹É•Ù¥•Ý•Ét¤¤¹É½ÝÍlÁt¹Ù•ÉÍ¥½¸¤ì(€€€½¹ÍÐÉ•Ù¥•ÝÙ•¹Ð€ô™¥áÑÕÉ”¹ÕÕ¥ ÌÐÔ¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡%9MIP%9Q<ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}¡¥¡}¥µÁ…Ñ}É•Ù¥•Ý}•Ù•¹ÑÌ¡¥±½É}¥±Ý½É­ÍÁ…•}¥±É•Í½ÕÉ•}ÑåÁ”±É•Í½ÕÉ•}¥±É•Ù¥•Ý•É}¥±É•Ù¥•Ý•É}…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¸±É•Í½ÕÉ•}Ù•ÉÍ¥½¸±É•Í½ÕÉ•}¡…Í ±½ÕÑ½µ”±É…Ñ¥½¹…±”¤(€€€€€Y1UL Ä°È°Ì°‘•±¥Ù•Éå}Ý½É­}Á…­…”œ°Ð°Ô°Ø°äää°Ü°…ÁÁÉ½Ù•œ°%¹‘•Á•¹‘•¹Ð™¥áÑÕÉ”É•Ù¥•Üœ¥€°mÉ•Ù¥•ÝÙ•¹Ð°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°Ý½É­A…­…”°™¥áÑÕÉ”¹É•Ù¥•Ý•È°É•Ù¥•Ý•ÉY•ÉÍ¥½¸°™¥áÑÕÉ”¹¡…Í  œÀœ¥t¤ì(€€€…Ý…¥Ð…ÍÍ•ÉÐ¹É•©•ÑÌ¡…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}¡¥¡}¥µÁ…Ñ}…ÁÁÉ½Ù…° Äèé©Í½¹ˆ°È°Ì°Ð°Ô°Ø¤œ°m)M=8¹ÍÑÉ¥¹¥™ä¡íÉ•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°É•Ù¥•Ý•‘}‰äè™¥áÑÕÉ”¹É•Ù¥•Ý•È°…ÁÁÉ½Ù•‘}‰äè™¥áÑÕÉ”¹É•Ù¥•Ý•È°É•Ù¥•Ý}•Ù•¹Ñ}¥èÉ•Ù¥•ÝÙ•¹Ð°½ÕÑ½µ”è€…ÁÁÉ½Ù•œ°É…Ñ¥½¹…±”è€¥¹Ù…±¥Í…µ”…Ñ½Èô¤°€‘•±¥Ù•Éå}Ý½É­}Á…­…”œ°Ý½É­A…­…”°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°€…ÁÁÉ½Ù•t¤°€½9QIAI%M}AAI=Y1}MAIQ%=8¼¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}¡¥¡}¥µÁ…Ñ}…ÁÁÉ½Ù…° Äèé©Í½¹ˆ°È°Ì°Ð°Ô°Ø¤œ°m)M=8¹ÍÑÉ¥¹¥™ä¡íÉ•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°É•Ù¥•Ý•‘}‰äè™¥áÑÕÉ”¹É•Ù¥•Ý•È°…ÁÁÉ½Ù•‘}‰äè™¥áÑÕÉ”¹…ÁÁÉ½Ù•È°É•Ù¥•Ý}•Ù•¹Ñ}¥èÉ•Ù¥•ÝÙ•¹Ð°½ÕÑ½µ”è€…ÁÁÉ½Ù•œ°É…Ñ¥½¹…±”è€%¹‘•Á•¹‘•¹Ð…ÁÁÉ½Ù…°ô¤°€‘•±¥Ù•Éå}Ý½É­}Á…­…”œ°Ý½É­A…­…”°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°€…ÁÁÉ½Ù•t¤ì(€€€½¹ÍÐ‰…Í•±¥¹•%€ô™¥áÑÕÉ”¹ÕÕ¥ ÌÐØ¤ì(€€€½¹ÍÐµ½¹¥Ñ½È€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}µ½¹¥Ñ½É}‰…Í•±¥¹” Äèé©Í½¹ˆ°È°Ì°Ð¤É•ÍÕ±Ðœ°m)M=8¹ÍÑÉ¥¹¥™ä¡í¥è‰…Í•±¥¹•%°Ý½É­A…­…•Y•ÉÍ¥½¹%èÙ•ÉÍ¥½¸°…ÁÁÉ½Ù•‘%Ñ•µ%‘ÌèÉ•ÍÕ±Ð¹¥Ñ•µ%‘Ì°µ¥±•ÍÑ½¹•Ìèmt°‘•Á•¹‘•¹¥•Ìèmt°‰±½­•ÉÌèmt°É¥Í­Ìèmuô¤°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…•t¤¤¹É½ÝÍlÁt¹É•ÍÕ±Ðì(€€€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡mµ½¹¥Ñ½È¹ÍÑ…ÑÕÌ°µ½¹¥Ñ½È¹É•…‘¥¹•ÍÍt°l…ÁÁÉ½Ù…±}É•ÅÕ¥É•œ°€É•Ù¥•Ý}É•ÅÕ¥É•t¤ì(€€€½¹ÍÐÁ•ÉÍ¥ÍÑ•€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1P±¥Ù•}Ñ•±•µ•ÑÉå}½¹¹•Ñ•±É•Í½ÕÉ•}¡…Í I=4ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}µ½¹¥Ñ½É}‰…Í•±¥¹•Ì]!I¥ôÄœ°m‰…Í•±¥¹•%‘t¤¤¹É½ÝÍlÁtì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡Á•ÉÍ¥ÍÑ•¹±¥Ù•}Ñ•±•µ•ÑÉå}½¹¹•Ñ•°™…±Í”¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡Á•ÉÍ¥ÍÑ•¹É•Í½ÕÉ•}¡…Í °µ½¹¥Ñ½È¹É•Í½ÕÉ•!…Í ¤ì(€€€…Ý…¥Ð…ÍÍ•ÉÐ¹É•©•ÑÌ¡…ÕÑ¡½É¥Ñä¹ÅÕ•Éä ‰UAQÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}‘•±¥Ù•Éå}Ý½É­}¥Ñ•µÌMPÑ¥Ñ±”ôµÕÑ…Ñ•œ]!IÁ…­…•}Ù•ÉÍ¥½¹}¥ôÄˆ°mÙ•ÉÍ¥½¹t¤°€½9QIAI%M}AA9}=91d¼¤ì(€ô¤ì(€…Ý…¥ÐÍ•¹…É¥¼ 5½‘•É¹¥é…Ñ¥½¸…¹•ÍÑÉä‘•É¥Ù•Ì„½Ù•É¹•‘•¥Í¥½¸…¹ÍÍ•µ‰±”É•µ…¥¹Ì‘É…™Ðµ½¹±äÕ¹Ñ¥°…ÁÁÉ½Ù…°œ°…Íå¹Œ€ ¤€ôøì(€€€½¹ÍÐ…ÁÁ±¥…Ñ¥½¸€ô™¥áÑÕÉ”¹ÕÕ¥ ÌØÀ¤ì½¹ÍÐµ•Ñ…‘…Ñ„€ô™¥áÑÕÉ”¹ÕÕ¥ ÌØÄ¤ì½¹ÍÐÍ½ÕÉ•ÍÍ•ÍÍµ•¹Ð€ô™¥áÑÕÉ”¹ÕÕ¥ ÌØÈ¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡%9MIP%9Q<ÁÕ‰±¥Œ¹…ÍÍ•ÍÍ}…ÁÁ±¥…Ñ¥½¹}…ÍÍ•ÑÌ¡¥±½É}¥±Ý½É­ÍÁ…•}¥±¹…µ”±¹½Éµ…±¥é•‘}¹…µ”±É•…Ñ•‘}‰ä¤(€€€€€Y1UL Ä°È°Ì°¥áÑÕÉ”…ÁÁ±¥…Ñ¥½¸œ°™¥áÑÕÉ”…ÁÁ±¥…Ñ¥½¸œ°Ð¥€°m…ÁÁ±¥…Ñ¥½¸°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Ét¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡%9MIP%9Q<ÁÕ‰±¥Œ¹…ÍÍ•ÍÍ}…ÁÁ±¥…Ñ¥½¹}µ•Ñ…‘…Ñ…}Ù•ÉÍ¥½¹Ì¡¥±½É}¥±Ý½É­ÍÁ…•}¥±…ÁÁ±¥…Ñ¥½¹}¥±Ù•ÉÍ¥½¸±±¥™•å±”±µ•Ñ…‘…Ñ„±…ÕÑ¡½É}¥¤(€€€€€Y1UL Ä°È°Ì°Ð°Ä°…ÁÁÉ½Ù•œ°íôœèé©Í½¹ˆ°Ô¥€°mµ•Ñ…‘…Ñ„°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°…ÁÁ±¥…Ñ¥½¸°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Ét¤ì(€€€½¹ÍÐ…ÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¸€ô9Õµ‰•È ¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÙ•ÉÍ¥½¸I=4ÁÕ‰±¥Œ¹…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¹Ì]!I½É}¥ôÄ9ÕÍ•É}¥ôÈœ°m™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Ét¤¤¹É½ÝÍlÁt¹Ù•ÉÍ¥½¸¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡%9MIP%9Q<ÁÕ‰±¥Œ¹…ÍÍ•ÍÍ}…ÁÁ±¥…Ñ¥½¹}…ÍÍ•ÍÍµ•¹Ñ}Ù•ÉÍ¥½¹Ì (€€€€€¥±½É}¥±Ý½É­ÍÁ…•}¥±…ÁÁ±¥…Ñ¥½¹}¥±µ•Ñ…‘…Ñ…}Ù•ÉÍ¥½¹}¥±Ù•ÉÍ¥½¸±‘•¥Í¥½¹}µ½‘•±}Ù•ÉÍ¥½¸±±¥™•å±”±…ÕÑ¡½É}¥±…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¸¤(€€€€€Y1UL Ä°È°Ì°Ð°Ô°Ä°…ÍÍ•ÍÌµØÈµ…ÁÁ±¥…Ñ¥½¸µÁ½ÉÑ™½±¥¼´ÈÀÈØ´ÀÜœ°…ÁÁÉ½Ù•œ°Ø°Ü¥€°(€€€mÍ½ÕÉ•ÍÍ•ÍÍµ•¹Ð°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°…ÁÁ±¥…Ñ¥½¸°µ•Ñ…‘…Ñ„°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°…ÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¹t¤ì(€€€½¹ÍÐ‘¥µ•¹Í¥½¹Ì€ôl(€€€€€€¥¹Ñ•É…Ñ¥½¹}…•ÍÍ¥‰¥±¥Ñäœ°€Í•µ…¹Ñ¥}…¹‘}‘…Ñ…}±…É¥Ñäœ°€ÍÑ…Ñ•}…¹‘}•á•ÕÑ¥½¸œ°(€€€€€€Í•ÕÉ¥Ñå}…¹‘}½¹ÑÉ½°œ°€…É¡¥Ñ•ÑÕÉ•}¡…¹•…‰¥±¥Ñäœ°€Õ¥}…ÕÑ½µ…Ñ¥½¹}É•…‘¥¹•ÍÌœ°(€€€€€€…¥}…ÍÍ¥ÍÑ•‘}•¹¥¹••É¥¹}É•…‘¥¹•ÍÌœ°(€€€tì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡%9MIP%9Q<ÁÕ‰±¥Œ¹…ÍÍ•ÍÍ}…ÁÁ±¥…Ñ¥½¹}‘¥µ•¹Í¥½¹}É•ÍÕ±ÑÌ (€€€€€½É}¥±Ý½É­ÍÁ…•}¥±…ÁÁ±¥…Ñ¥½¹}¥±µ•Ñ…‘…Ñ…}Ù•ÉÍ¥½¹}¥±…ÍÍ•ÍÍµ•¹Ñ}Ù•ÉÍ¥½¹}¥±‘¥µ•¹Í¥½¸°(€€€€€É•…‘¥¹•ÍÍ}‰…¹±•Ù¥‘•¹•}½¹™¥‘•¹”±¡…É‘}…Ñ•Ì±•Ù¥‘•¹•}É•™Ì±µ¥ÍÍ¥¹}•Ù¥‘•¹”±É…Ñ¥½¹…±”°(€€€€€½¹ÑÉ…‘¥Ñ¥½¹Ì±É•µ•‘¥…Ñ¥½¹}É•ÅÕ¥É•µ•¹ÑÌ±Ý¡…Ñ}Ý½Õ±‘}¡…¹”¤(€€€€€M1P€Ä°È°Ì°Ð°Ô±‘¥µ•¹Í¥½¸°I•…‘äœ°Y•É¥™¥•œ°íôœèéÑ•áÑmt°mtœèé©Í½¹ˆ°(€€€€€€€€íôœèéÑ•áÑmt±IIelÙ•É¥™¥•t°íôœèéÑ•áÑmt°íôœèéÑ•áÑmt±IIel¹•Ü•Ù¥‘•¹”t(€€€€€I=4Õ¹¹•ÍÐ ØèéÑ•áÑmt¤‘¥µ•¹Í¥½¹€°m™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°…ÁÁ±¥…Ñ¥½¸°µ•Ñ…‘…Ñ„°Í½ÕÉ•ÍÍ•ÍÍµ•¹Ð°‘¥µ•¹Í¥½¹Ít¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡%9MIP%9Q<ÁÕ‰±¥Œ¹…ÍÍ•ÍÍ}…ÁÁ±¥…Ñ¥½¹}µ½‘•É¹¥é…Ñ¥½¹}É•½µµ•¹‘…Ñ¥½¹Ì (€€€€€½É}¥±Ý½É­ÍÁ…•}¥±…ÁÁ±¥…Ñ¥½¹}¥±µ•Ñ…‘…Ñ…}Ù•ÉÍ¥½¹}¥±…ÍÍ•ÍÍµ•¹Ñ}Ù•ÉÍ¥½¹}¥±‘¥ÍÁ½Í¥Ñ¥½¸°(€€€€€µ¥É…Ñ¥½¹}‰½Õ¹‘…Éä±É½±±‰…­}ÍÑÉ…Ñ•ä±•Ù¥‘•¹•}½¹™¥‘•¹”¤(€€€€€Y1UL Ä°È°Ì°Ð°Ô°…ÍÍ•µ‰±”œ°‘É…™Ðµ½¹±ä‰½Õ¹‘…Éäœ°É•Ñ…¥¸ÕÉÉ•¹ÐÍåÍÑ•´œ°Y•É¥™¥•œ¥€°(€€€m™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°…ÁÁ±¥…Ñ¥½¸°µ•Ñ…‘…Ñ„°Í½ÕÉ•ÍÍ•ÍÍµ•¹Ñt¤ì(€€€½¹ÍÐ•¹Ñ•ÉÁÉ¥Í•ÍÍ•ÍÍµ•¹Ð€ô™¥áÑÕÉ”¹ÕÕ¥ ÌØÌ¤ì½¹ÍÐ‘•¥Í¥½¸€ô™¥áÑÕÉ”¹ÕÕ¥ ÌØÐ¤ì(€€€½¹ÍÐ½µµ¥ÑÑ•€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}µ½‘•É¹¥é…Ñ¥½¹}…ÍÍ•ÍÍµ•¹Ð Äèé©Í½¹ˆ°Èèé©Í½¹ˆ¤É•ÍÕ±Ðœ°l(€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡í¥è•¹Ñ•ÉÁÉ¥Í•ÍÍ•ÍÍµ•¹Ð°½É}¥è™¥áÑÕÉ”¹½Éœ°Ý½É­ÍÁ…•}¥è™¥áÑÕÉ”¹Ý½É­ÍÁ…”°…ÁÁ±¥…Ñ¥½¹}É•˜è…ÁÁ±¥…Ñ¥½¸°Í½ÕÉ•}…ÍÍ•ÍÍµ•¹Ñ}¥èÍ½ÕÉ•ÍÍ•ÍÍµ•¹Ð°Í½ÕÉ•}µ•Ñ…‘…Ñ…}Ù•ÉÍ¥½¹}¥èµ•Ñ…‘…Ñ„°É•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Éô¤°(€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡í¥è‘•¥Í¥½¸°É•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Éô¤°(€€€t¤¤¹É½ÝÍlÁt¹É•ÍÕ±Ðì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½µµ¥ÑÑ•¹ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸°€…ÍÍ•µ‰±”œ¤ì(€€€…ÍÍ•ÉÐ¹µ…Ñ ¡½µµ¥ÑÑ•¹É•Í½ÕÉ•!…Í °€½ylÀ´å„µ™uìØÑô¼¤ì(€€€½¹ÍÐÉ•Ù¥•Ý•ÉY•ÉÍ¥½¸€ô9Õµ‰•È ¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÙ•ÉÍ¥½¸I=4ÁÕ‰±¥Œ¹…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¹Ì]!I½É}¥ôÄ9ÕÍ•É}¥ôÈœ°m™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹É•Ù¥•Ý•Ét¤¤¹É½ÝÍlÁt¹Ù•ÉÍ¥½¸¤ì(€€€½¹ÍÐ‘•¥Í¥½¹I•Ù¥•Ü€ô™¥áÑÕÉ”¹ÕÕ¥ ÌØÔ¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡%9MIP%9Q<ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}¡¥¡}¥µÁ…Ñ}É•Ù¥•Ý}•Ù•¹ÑÌ¡¥±½É}¥±Ý½É­ÍÁ…•}¥±É•Í½ÕÉ•}ÑåÁ”±É•Í½ÕÉ•}¥±É•Ù¥•Ý•É}¥±É•Ù¥•Ý•É}…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¸±É•Í½ÕÉ•}Ù•ÉÍ¥½¸±É•Í½ÕÉ•}¡…Í ±½ÕÑ½µ”±É…Ñ¥½¹…±”¤(€€€€€Y1UL Ä°È°Ì°µ½‘•É¹¥é…Ñ¥½¹}‘•¥Í¥½¸œ°Ð°Ô°Ø°Ä°Ü°…ÁÁÉ½Ù•œ°%¹‘•Á•¹‘•¹Ðµ½‘•É¹¥é…Ñ¥½¸É•Ù¥•Üœ¥€°(€€€m‘•¥Í¥½¹I•Ù¥•Ü°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°‘•¥Í¥½¸°™¥áÑÕÉ”¹É•Ù¥•Ý•È°É•Ù¥•Ý•ÉY•ÉÍ¥½¸°™¥áÑÕÉ”¹¡…Í  œÀœ¥t¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}¡¥¡}¥µÁ…Ñ}…ÁÁÉ½Ù…° Äèé©Í½¹ˆ°È°Ì°Ð°Ô°Ø¤œ°m)M=8¹ÍÑÉ¥¹¥™ä¡íÉ•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°É•Ù¥•Ý•‘}‰äè™¥áÑÕÉ”¹É•Ù¥•Ý•È°…ÁÁÉ½Ù•‘}‰äè™¥áÑÕÉ”¹…ÁÁÉ½Ù•È°É•Ù¥•Ý}•Ù•¹Ñ}¥è‘•¥Í¥½¹I•Ù¥•Ü°½ÕÑ½µ”è€…ÁÁÉ½Ù•œ°É…Ñ¥½¹…±”è€5½‘•É¹¥é…Ñ¥½¸…ÁÁÉ½Ù…°ô¤°€µ½‘•É¹¥é…Ñ¥½¹}‘•¥Í¥½¸œ°‘•¥Í¥½¸°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°€…ÁÁÉ½Ù•t¤ì(€€€½¹ÍÐ‰±Õ•ÁÉ¥¹Ð€ô™¥áÑÕÉ”¹ÕÕ¥ ÌØØ¤ì(€€€½¹ÍÐ…ÍÍ•µ‰±•€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}…ÍÍ•µ‰±•}‰±Õ•ÁÉ¥¹Ð Äèé©Í½¹ˆ°È°Ì°Ð¤É•ÍÕ±Ðœ°m)M=8¹ÍÑÉ¥¹¥™ä¡í¥è‰±Õ•ÁÉ¥¹Ð°µ½‘•É¹¥é…Ñ¥½¹•¥Í¥½¹%è‘•¥Í¥½¸°ÍÑÉÕÑÕÉ•‘½¹Ñ•¹Ðèí½µÁ½¹•¹ÑÌèmuô°É•…‘…‰±•½Õµ•¹Ðè€É…™Ðµ½¹±ä™¥áÑÕÉ”‰±Õ•ÁÉ¥¹Ðô¤°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…•t¤¤¹É½ÝÍlÁt¹É•ÍÕ±Ðì(€€€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡m…ÍÍ•µ‰±•¹ÍÑ…ÑÕÌ°…ÍÍ•µ‰±•¹•á•ÕÑ¥½¹¹…‰±•°…ÍÍ•µ‰±•¹ÉÕ¹Ñ¥µ••¹ÑÍ¹…‰±•°…ÍÍ•µ‰±•¹±¥Ù•Q•±•µ•ÑÉå¹…‰±•‘t°l‘É…™Ðœ°™…±Í”°™…±Í”°™…±Í•t¤ì(€€€½¹ÍÐ™±…Ì€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡M1P½‘•}•¹•É…Ñ¥½¹}•¹…‰±•±‘•Á±½åµ•¹Ñ}•¹…‰±•±¥¹™É…ÍÑÉÕÑÕÉ•}¡…¹•Í}•¹…‰±•°(€€€€€É•‘•¹Ñ¥…±}…•ÍÍ}•¹…‰±•±Í½ÕÉ•}ÍåÍÑ•µ}…±±Í}•¹…‰±•±ÉÕ¹Ñ¥µ•}…•¹ÑÍ}•¹…‰±•±±¥Ù•}Ñ•±•µ•ÑÉå}•¹…‰±•(€€€€€I=4ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}…ÍÍ•µ‰±•}‰±Õ•ÁÉ¥¹ÑÌ]!I¥ôÅ€°m‰±Õ•ÁÉ¥¹Ñt¤¤¹É½ÝÍlÁtì(€€€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡=‰©•Ð¹Ù…±Õ•Ì¡™±…Ì¤°m™…±Í”°™…±Í”°™…±Í”°™…±Í”°™…±Í”°™…±Í”°™…±Í•t¤ì(€€€½¹ÍÐ‰±Õ•ÁÉ¥¹ÑI•Ù¥•Ü€ô™¥áÑÕÉ”¹ÕÕ¥ ÌØÜ¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä¡%9MIP%9Q<ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}¡¥¡}¥µÁ…Ñ}É•Ù¥•Ý}•Ù•¹ÑÌ¡¥±½É}¥±Ý½É­ÍÁ…•}¥±É•Í½ÕÉ•}ÑåÁ”±É•Í½ÕÉ•}¥±É•Ù¥•Ý•É}¥±É•Ù¥•Ý•É}…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¸±É•Í½ÕÉ•}Ù•ÉÍ¥½¸±É•Í½ÕÉ•}¡…Í ±½ÕÑ½µ”±É…Ñ¥½¹…±”¤(€€€€€Y1UL Ä°È°Ì°…ÍÍ•µ‰±•}‰±Õ•ÁÉ¥¹Ðœ°Ð°Ô°Ø°Ä°Ü°…ÁÁÉ½Ù•œ°%¹‘•Á•¹‘•¹Ð‰±Õ•ÁÉ¥¹ÐÉ•Ù¥•Üœ¥€°(€€€m‰±Õ•ÁÉ¥¹ÑI•Ù¥•Ü°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°‰±Õ•ÁÉ¥¹Ð°™¥áÑÕÉ”¹É•Ù¥•Ý•È°É•Ù¥•Ý•ÉY•ÉÍ¥½¸°™¥áÑÕÉ”¹¡…Í  œÀœ¥t¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}¡¥¡}¥µÁ…Ñ}…ÁÁÉ½Ù…° Äèé©Í½¹ˆ°È°Ì°Ð°Ô°Ø¤œ°m)M=8¹ÍÑÉ¥¹¥™ä¡íÉ•…Ñ•‘}‰äè™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°É•Ù¥•Ý•‘}‰äè™¥áÑÕÉ”¹É•Ù¥•Ý•È°…ÁÁÉ½Ù•‘}‰äè™¥áÑÕÉ”¹…ÁÁÉ½Ù•È°É•Ù¥•Ý}•Ù•¹Ñ}¥è‰±Õ•ÁÉ¥¹ÑI•Ù¥•Ü°½ÕÑ½µ”è€…ÁÁÉ½Ù•œ°É…Ñ¥½¹…±”è€	±Õ•ÁÉ¥¹Ð…ÁÁÉ½Ù…°ô¤°€…ÍÍ•µ‰±•}‰±Õ•ÁÉ¥¹Ðœ°‰±Õ•ÁÉ¥¹Ð°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°€…ÁÁÉ½Ù•t¤ì(€€€…Ý…¥Ð…ÍÍ•ÉÐ¹É•©•ÑÌ¡…ÕÑ¡½É¥Ñä¹ÅÕ•Éä ‰UAQÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}…ÍÍ•µ‰±•}‰±Õ•ÁÉ¥¹ÑÌMPÍÑ…ÑÕÌôÉ•©•Ñ•œ]!I¥ôÄˆ°m‰±Õ•ÁÉ¥¹Ñt¤°€½9QIAI%M}IM=UI}%55UQ	1}=I}QI9M%Q%=9}%9Y1%¼¤ì(€ô¤ì(€…Ý…¥ÐÍ•¹…É¥¼ É•…µ½¹±äÉ½±±‰…¬‰±½­ÌµÕÑ…Ñ¥½¹ÌÝ¡¥±”…Á…‰¥±¥ÑäÁÉ½©•Ñ¥½¸É•µ…¥¹Ì…Ù…¥±…‰±”œ°…Íå¹Œ€ ¤€ôøì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä UAQÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}¥¹Ñ•±±¥•¹•}ÉÕ¹Ñ¥µ•}½¹ÑÉ½°MPÉ•…‘}½¹±äõÑÉÕ”]!IÍ¥¹±•Ñ½¸õÑÉÕ”œ¤ì(€€€…Ý…¥Ð…ÍÍ•ÉÐ¹É•©•ÑÌ¡…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}…¥}±…¥µ}½µµ…¹ Ä°È°Ì°Ð°Ô°Ø°Ü¤œ°m™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•È°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°€™¥áÑÕÉ”¹É•…‘½¹±äœ°€™¥áÑÕÉ”µÉ•…‘½¹±ä´ÀÀÄœ°™¥áÑÕÉ”¹ÕÕ¥ ÌÔÀ¤°™¥áÑÕÉ”¹¡…Í  „œ¥t¤°€½9QIAI%M}%9Q11%9}I}=91d¼¤ì(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä 	%8œ¤ì(€€€ÑÉäì(€€€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä MP1=0I=1…ÕÑ¡•¹Ñ¥…Ñ•œ¤ì(€€€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä ‰M1PÍ•Ñ}½¹™¥œ É•ÅÕ•ÍÐ¹©ÝÐ¹±…¥´¹ÍÕˆœ°Ä±ÑÉÕ”¤ˆ°m™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Ét¤ì(€€€€€½¹ÍÐÁÉ½©•Ñ¥½¸€ô€¡…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä M1PÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}•Ù¥‘•¹•}Í½ÕÉ•}ÁÉ½©•Ñ¥½¸ Ä°È°Ì¤ÁÉ½©•Ñ¥½¸œ°m™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°™¥áÑÕÉ”¹Í½ÕÉ•ÍlÁt¹Í½ÕÉ•%‘t¤¤¹É½ÝÍlÁt¹ÁÉ½©•Ñ¥½¸ì(€€€€€…ÍÍ•ÉÐ¹½¬¡ÁÉ½©•Ñ¥½¸¤ì(€€€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡=‰©•Ð¹¡…Í=Ý¸¡ÁÉ½©•Ñ¥½¸°€ÍÑ½É…•A…Ñ œ¤°™…±Í”¤ì(€€€€€…Ý…¥Ð…ÍÍ•ÉÐ¹É•©•ÑÌ¡…ÕÑ¡½É¥Ñä¹ÅÕ•Éä ‰%9MIP%9Q<ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}•Ù¥‘•¹•}ÅÕ•ÍÑ¥½¹Ì¡Í½ÕÉ•}¥±½É}¥±Ý½É­ÍÁ…•}¥±ÅÕ•ÍÑ¥½¸±ÍÑ…ÑÕÌ±É•…Ñ•‘}‰ä¤Y1UL Ä°È°Ì°™½É‰¥‘‘•¸œ°½Á•¸œ°Ð¤ˆ°m™¥áÑÕÉ”¹Í½ÕÉ•ÍlÁt¹Í½ÕÉ•%°™¥áÑÕÉ”¹½Éœ°™¥áÑÕÉ”¹Ý½É­ÍÁ…”°™¥áÑÕÉ”¹É•ÅÕ•ÍÑ•Ét¤°€½Á•Éµ¥ÍÍ¥½¸‘•¹¥•¼¤ì(€€€ô™¥¹…±±äì…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä I=11	,œ¤ìô(€€€…Ý…¥Ð…ÕÑ¡½É¥Ñä¹ÅÕ•Éä UAQÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}¥¹Ñ•±±¥•¹•}ÉÕ¹Ñ¥µ•}½¹ÑÉ½°MPÉ•…‘}½¹±äõ™…±Í”]!IÍ¥¹±•Ñ½¸õÑÉÕ”œ¤ì(€ô¤ì((€½¹Í½±”¹±½œ¡¹Ñ•ÉÁÉ¥Í”%¹Ñ•±±¥•¹”A½ÍÑÉ•ME0•á•ÕÑ…‰±”Í•¹…É¥½Ìè€‘íÍ•¹…É¥½Ì¹±•¹Ñ¡ôÁ…ÍÍ•°€À™…¥±•¹€¤ì)ô™¥¹…±±äì(€™½È€¡½¹ÍÐ±¥•¹Ð½˜±¥•¹ÑÌ¹É•Ù•ÉÍ” ¤¤¥˜€¡±¥•¹Ð€„ôô…‘µ¥¸¤…Ý…¥Ð±¥•¹Ð¹•¹ ¤¹…Ñ   ¤€ôøíô¤ì(€¥˜€¡…‘µ¥¸¤ì(€€€±•Ð±•…¹ÕÁ…¥±•€ô™…±Í”ì(€€€™½È€¡½¹ÍÐ¹…µ”½˜É•…Ñ•‘…Ñ…‰…Í•Ì¹É•Ù•ÉÍ” ¤¤ì(€€€€€ÑÉäì…Ý…¥Ð…‘µ¥¸¹ÅÕ•Éä¡I=@Q	M%a%MQL€‘í¹…µ•ô]%Q €¡=I¥€¤ì½¹Í½±”¹±½œ¡19U@I=AAQ	M€‘í¹…µ•õ€¤ìô(€€€€€…Ñ €¡•ÉÉ½È¤ì±•…¹ÕÁ…¥±•€ôÑÉÕ”ì½¹Í½±”¹•ÉÉ½È¡19U@%1Q	M€‘í¹…µ•ôè€‘í•ÉÉ½È¥¹ÍÑ…¹•½˜ÉÉ½È€ü•ÉÉ½È¹µ•ÍÍ…”€èMÑÉ¥¹œ¡•ÉÉ½È¥õ€¤ìô(€€€ô(€€€™½È€¡½¹ÍÐÉ½±”½˜É•…Ñ•‘I½±•Ì¹É•Ù•ÉÍ” ¤¤ì(€€€€€ÑÉäì…Ý…¥Ð…‘µ¥¸¹ÅÕ•Éä¡I=@I=1%a%MQL€‘íÉ½±•õ€¤ìô(€€€€€…Ñ €¡•ÉÉ½È¤ì±•…¹ÕÁ…¥±•€ôÑÉÕ”ì½¹Í½±”¹•ÉÉ½È¡19U@%1I=1€‘íÉ½±•ôè€‘í•ÉÉ½È¥¹ÍÑ…¹•½˜ÉÉ½È€ü•ÉÉ½È¹µ•ÍÍ…”€èMÑÉ¥¹œ¡•ÉÉ½È¥õ€¤ìô(€€€ô(€€€…Ý…¥Ð…‘µ¥¸¹•¹ ¤¹…Ñ   ¤€ôøíô¤ì(€€€½¹Í½±”¹±½œ¡19U@€‘í±•…¹ÕÁ…¥±•€ü€%1œ€è€AMLõ€¤ì(€€€¥˜€¡±•…¹ÕÁ…¥±•¤ÁÉ½•ÍÌ¹•á¥Ñ½‘”€ô€Äì(€ô)ô(