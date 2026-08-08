import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
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
  'enterprise_ai_job_attempts', 'enterprise_ai_extraction_staged_results',
  'enterprise_evidence_sources', 'enterprise_evidence_source_versions', 'enterprise_evidence_candidates',
  'enterprise_evidence_candidate_edits', 'enterprise_evidence_questions', 'enterprise_evidence_assess_promotions',
  'enterprise_studio_delivery_handoffs', 'enterprise_delivery_work_packages',
  'enterprise_delivery_work_package_versions', 'enterprise_delivery_work_items',
  'enterprise_monitor_baselines', 'enterprise_modernization_assessments',
  'enterprise_modernization_decisions', 'enterprise_assemble_blueprints',
  'enterprise_high_impact_review_events', 'enterprise_high_impact_approvals',
];
const evidenceAnchorHash = values => createHash('sha256').update(
  `evidence-excerpt-anchor-v1|${values.map(value => `${Buffer.byteLength(value, 'utf8')}:${value}`).join('|')}`,
).digest('hex');

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
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_stage_evidence_extraction_result(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,integer,integer,integer,jsonb,jsonb,text,uuid,bigint)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_stage_evidence_extraction_result(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,integer,integer,integer,jsonb,jsonb,text,uuid,bigint)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_commit_evidence_extraction(uuid,uuid,uuid,uuid,text,integer,uuid,text,text,integer,integer,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_evidence_source_locator_is_canonical(text)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_evidence_source_locator_is_canonical(text)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_promote_evidence_to_assess_v2(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,bigint)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_promote_evidence_to_assess_v2(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,bigint,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_promote_evidence_batch_to_assess_v2(uuid,jsonb,uuid,bigint,uuid,uuid,uuid,bigint,uuid,uuid,bigint)','EXECUTE') allowed")).rows[0].allowed, true);
  });

  const fixture = await createEnterpriseIntelligenceFixture(authority);
  await scenario('canonical evidence bucket and server locator authority cannot drift', async () => {
    const anchor = (await authority.query(`SELECT
      c.source_version_id,c.source_locator,c.safe_excerpt,c.value,c.excerpt_hash,c.provenance_hash,
      v.content_hash,v.extracted_text_hash,v.storage_bucket,v.source_locator_schema
      FROM public.enterprise_evidence_candidates c
      JOIN public.enterprise_evidence_source_versions v ON v.id=c.source_version_id
      WHERE c.id=$1`, [fixture.candidate])).rows[0];
    assert.equal(anchor.storage_bucket, 'source-uploads');
    assert.equal(anchor.source_locator_schema, 'normalized-text-char-range-1');
    assert.equal(anchor.source_locator, 'normalized-text:v1:chars:0-64');
    assert.equal(anchor.excerpt_hash, evidenceAnchorHash([
      anchor.source_version_id, anchor.content_hash, anchor.extracted_text_hash,
      anchor.source_locator, anchor.safe_excerpt, anchor.value,
    ]));
    assert.match(anchor.provenance_hash, /^[0-9a-f]{64}$/);
    assert.equal((await authority.query(
      "SELECT public.enterprise_evidence_source_locator_is_canonical('normalized-text:v1:chars:0-64') valid",
    )).rows[0].valid, true);
    assert.equal((await authority.query(
      "SELECT public.enterprise_evidence_source_locator_is_canonical('page:999') valid",
    )).rows[0].valid, false);
    const before = Number((await authority.query('SELECT count(*)::int n FROM public.enterprise_evidence_candidates')).rows[0].n);
    await assert.rejects(authority.query(`INSERT INTO public.enterprise_evidence_candidates(
      id,source_id,source_version_id,org_id,workspace_id,field_key,value,safe_excerpt,
      excerpt_hash,provenance_hash,source_locator,confidence,ai_job_id,prompt_version,suggestion_status,created_by
    ) VALUES($1,$2,$3,$4,$5,'process_objective','Ignored provider locator','Govern the fixture process',
      $6,$6,'page:999',0.8,$7,'fixture-1','suggested',$8)`, [
      fixture.uuid(699), fixture.sources[0].sourceId, fixture.sources[0].sourceVersionId,
      fixture.org, fixture.workspace, fixture.hash('0'), fixture.job, fixture.requester,
    ]), /ENTERPRISE_EVIDENCE_LOCATOR_INVALID|enterprise_evidence_candidates_canonical_locator/);
    const counts = (await authority.query(`SELECT
      count(*) FILTER (WHERE storage_bucket<>'source-uploads')::int bucket_mismatches,
      count(*) FILTER (WHERE source_locator_schema<>'normalized-text-char-range-1')::int locator_schema_mismatches
      FROM public.enterprise_evidence_source_versions`)).rows[0];
    const persistedProviderLocators = Number((await authority.query(
      "SELECT count(*)::int n FROM public.enterprise_evidence_candidates WHERE NOT public.enterprise_evidence_source_locator_is_canonical(source_locator)",
    )).rows[0].n);
    coãvÖÚ$z{-®éÜj×'BæFVWWVÂ‡&W7VÇBæFV6—6–öâæ&Æö6¶W'2ÂW'6—7FVBæFV6—6–öâæ&Æö6¶W'2“°¢76W'BæFVWWVÂ‡&W7VÇBæFV6—6–öâæf7F÷$&æG2ÂW'6—7FVBæ76W76ÖVçBæf7F÷%ö&æG2“°¢76W'BæFVWWVÂ‡&W7VÇBæFV6—6–öâæVÆ–v–&ÆTF—7÷6—F–öç2ÂW'6—7FVBæFV6—6–öâæVÆ–v–&ÆUöF—7÷6—F–öç2“°¢76W'BæWVÂ‡&W7VÇBæFV6—6–öâç&–Ö'”F—7÷6—F–öâÂW'6—7FVBæFV6—6–öâç&–Ö'•öF—7÷6—F–öâ“°¢76W'BæWVÂ‡&W7VÇBç&W6÷W&6T†6‚ÂW'6—7FVBæFV6—6–öâç&W6÷W&6Uö†6‚“°¢76W'BæWVÂ‡&W7VÇBç&W6÷W&6T†6‚ÂW‡V7FVD†6‚“°¢76W'BæFVWWVÂ‡&W7VÇBæFV6—6–öâæ6öæfÆ–7G2ÂµÒ“°¢76W'Bæö²‚¥4ôâç7G&–æv–g’‡&W7VÇB’æ–æ6ÇVFW2‚tTDtUôôäÅ•òr’“°¢76W'Bæö²‚¥4ôâç7G&–æv–g’‡&W7VÇB’æ–æ6ÇVFW2‚vVFvTöæÇ•ö—6öâr’“°¢6öç7B&Vf÷&U&WÆ’Ò†v—BWF†÷&—G’çVW'’†4TÄT5@¢…4TÄT5B6÷VçB‚¢“£¦–çBe$ôÒV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåö76W76ÖVçG2t„U$R–CÒC’76W76ÖVçG2À¢…4TÄT5B6÷VçB‚¢“£¦–çBe$ôÒV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåöFV6—6–öç2t„U$R–CÒC"’FV6—6–öç2À¢…4TÄT5B6÷VçB‚¢“£¦–çBe$ôÒV&Æ–2æVçFW'&—6Uö•öVffV7Eö¦÷W&æÂt„U$R&V6V—Eö–CÒC2’VffV7G6À¢¶ÖöFW&æ—¦F–öä76W76ÖVçD–BÂFV6—6–öä–BÂ&V6V—Bæ–EÒ’’ç&÷w5³Ó°¢6öç7BW†7E&WÆ’Ò†v—BWF†÷&—G’çVW'’€¢4TÄT5B‡V&Æ–2æVçFW'&—6Uö•ö6Æ–Õö6öÖÖæB€¢CÂC"ÂC2ÂvÖöFW&æ—¦F–öâæWfÇVFRrÂCBÂCRÂCbÄåTÄÂÂCp¢’’â¦À¢¶f—‡GW&Rç&WVW7FW"Âf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂÖöFW&æ—¦F–öâÖ7W'&VçBÒG¶Æ&VÇÖÀ¢æW‡EWV–B‚’Â&WVW7D†6‚ÂæW‡EWV–B‚•ÒÀ¢’’ç&÷w5³Ó°¢76W'BæFVWWVÂ…¶W†7E&WÆ’ç7FGW2ÂW†7E&WÆ’ç&W7öç6UÒÂ²v6öÖÖ—GFVBrÂ&W7VÇEÒ“°¢6öç7BgFW%&WÆ’Ò†v—BWF†÷&—G’çVW'’†4TÄT5@¢…4TÄT5B6÷VçB‚¢“£¦–çBe$ôÒV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåö76W76ÖVçG2t„U$R–CÒC’76W76ÖVçG2À¢…4TÄT5B6÷VçB‚¢“£¦–çBe$ôÒV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåöFV6—6–öç2t„U$R–CÒC"’FV6—6–öç2À¢…4TÄT5B6÷VçB‚¢“£¦–çBe$ôÒV&Æ–2æVçFW'&—6Uö•öVffV7Eö¦÷W&æÂt„U$R&V6V—Eö–CÒC2’VffV7G6À¢¶ÖöFW&æ—¦F–öä76W76ÖVçD–BÂFV6—6–öä–BÂ&V6V—Bæ–EÒ’’ç&÷w5³Ó°¢76W'BæFVWWVÂ†&Vf÷&U&WÆ’Â¶76W76ÖVçG3¢ÂFV6—6–öç3¢ÂVffV7G3¢Ò“°¢76W'BæFVWWVÂ†gFW%&WÆ’Â&Vf÷&U&WÆ’“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7B&÷fVDöæÇ’Òv—BFD76W76ÖVçB†v—B7&VFTÆ–6F–öâ‚tÖöFW&æ—¦F–öâ&÷fVBöæÇ’r’ÂÂv&÷fVBrÂG'VR“°¢6öç7B&÷fVE&W7VÇBÒv—B6öÖÖ—E6÷W&6R†&÷fVDöæÇ’Âv&÷fVBÖöæÇ’rÂG'VR“°¢76W'BæWVÂ†&÷fVE&W7VÇBæFV6—6–öâç&–Ö'”F—7÷6—F–öâÂw&WF–âr“° ¢f÷"†6öç7BÆ–fV7–6ÆRöb²vG&gBrÂw&Wf–WvW%÷&VG’rÂw&V¦V7FVBrÂw7WW'6VFVBuÒ’°¢6öç7B6÷W&6RÒv—BFD76W76ÖVçB†v—B7&VFTÆ–6F–öâ†ÖöFW&æ—¦F–öâæWvW"G¶Æ–fV7–6ÆWÖ’ÂÂv&÷fVBrÂG'VR“°¢v—BFD76W76ÖVçB‡6÷W&6RÂ"ÂÆ–fV7–6ÆR“°¢v—B76W'Bç&V¦V7G2†6öÖÖ—E6÷W&6R‡6÷W&6RÂæWvW"ÒG¶Æ–fV7–6ÆWÖ’ÂôTåDU%$•4UôÔôDU$ä•¤D”ôåõ4õU$4UôäõEô5U%$TåBò“°¢76W'BæWVÂ„çVÖ&W"‚†v—BWF†÷&—G’çVW'’€¢u4TÄT5B6÷VçB‚¢“£¦–çBâe$ôÒV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåö76W76ÖVçG2t„U$RÆ–6F–öå÷&VcÒCrÀ¢·6÷W&6RæÆ–6F–öåÒÀ¢’’ç&÷w5³Òæâ’Â“°¢Ð ¢6öç7BÆFW7Ec$&6RÒv—BFD76W76ÖVçB†v—B7&VFTÆ–6F–öâ‚tÖöFW&æ—¦F–öâÆFW7B&÷fVBc"r’ÂÂv&÷fVBr“°¢6öç7BÆFW7Ec"Òv—BFD76W76ÖVçB†ÆFW7Ec$&6RÂ"Âv&÷fVBrÂG'VRÂtFB’f:vFRæB6VÖçF–2G&ç6ÆF–öâr“°¢6öç7BÆFW7Ec%&W7VÇBÒv—B6öÖÖ—E6÷W&6R†ÆFW7Ec"ÂvÆFW7B×c"r“°¢76W'BæWVÂ†ÆFW7Ec%&W7VÇBç&–Ö'”F—7÷6—F–öâÂv•öVæ&ÆU÷w&r“° ¢6öç7BVæ¶æ÷vâÒv—BFD76W76ÖVçB†v—B7&VFTÆ–6F–öâ‚tÖöFW&æ—¦F–öâVæ¶æ÷vâ&V6öÖÖVæFF–öâr’ÂÂv&÷fVBrÂG'VRÂwVæ¶æ÷vâ&V6öÖÖVæFF–öâr“°¢v—B76W'Bç&V¦V7G2†6öÖÖ—E6÷W&6R‡Væ¶æ÷vâÂwVæ¶æ÷vâr’ÂôTåDU%$•4UôÔôDU$ä•¤D”ôåõ$T4ôÔÔTäDD”ôåô”ådÄ”Bò“°¢76W'BæWVÂ„çVÖ&W"‚†v—BWF†÷&—G’çVW'’€¢u4TÄT5B6÷VçB‚¢“£¦–çBâe$ôÒV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåö76W76ÖVçG2t„U$RÆ–6F–öå÷&VcÒCrÀ¢·Væ¶æ÷vâæÆ–6F–öåÒÀ¢’’ç&÷w5³Òæâ’Â“° ¢6öç7B6öæ7W'&VçE6÷W&6RÒv—BFD76W76ÖVçB†v—B7&VFTÆ–6F–öâ‚tÖöFW&æ—¦F–öâ6öæ7W'&VçB76W76ÖVçBr’ÂÂv&÷fVBrÂG'VR“°¢6öç7B6öçFVæFW"Òv—B6öææV7B‡W&Äf÷"†æÖW2æWF†÷&—G’’“°¢ÆWBG&ç67F–öä÷VâÒfÇ6S°¢ÆWBVæF–æs°¢G'’°¢v—B6öçFVæFW"çVW'’‚t$Tt”âr“°¢G&ç67F–öä÷VâÒG'VS°¢v—BFD76W76ÖVçB†6öæ7W'&VçE6÷W&6RÂ"ÂvG&gBrÂfÇ6RÂu&WF–âæBÖöæ—F÷"rÂ6öçFVæFW"“°¢ÆWB6WGFÆVBÒfÇ6S°¢VæF–ærÒ6öÖÖ—E6÷W&6R†6öæ7W'&VçE6÷W&6RÂv6öæ7W'&VçBr’æf–æÆÇ’‚‚’Óâ²6WGFÆVBÒG'VS²Ò“°¢v—BæWr&öÖ—6R‡&W6öÇfRÓâ6WEF–ÖV÷WB‡&W6öÇfRÂsR’“°¢76W'BæWVÂ‡6WGFÆVBÂfÇ6RÂvÖöFW&æ—¦F–öâ×W7Bv—B&V†–æBF†R7W'&VçBÖ76W76ÖVçB–ç6W'BÆö6²r“°¢v—B6öçFVæFW"çVW'’‚t4ôÔÔ•Br“°¢G&ç67F–öä÷VâÒfÇ6S°¢v—B76W'Bç&V¦V7G2‡VæF–ærÂôTåDU%$•4UôÔôDU$ä•¤D”ôåõ4õU$4UôäõEô5U%$TåBò“°¢Òf–æÆÇ’°¢–b‡G&ç67F–öä÷Vâ’v—B6öçFVæFW"çVW'’‚u$ôÄÄ$4²r“°¢Ð¢76W'BæWVÂ„çVÖ&W"‚†v—BWF†÷&—G’çVW'’€¢u4TÄT5B6÷VçB‚¢“£¦–çBâe$ôÒV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåö76W76ÖVçG2t„U$RÆ–6F–öå÷&VcÒCrÀ¢¶6öæ7W'&VçE6÷W&6RæÆ–6F–öåÒÀ¢’’ç&÷w5³Òæâ’Â“°¢6öç7Bf–æÄ6Æ–ÖVBÒçVÖ&W"‚†v—BWF†÷&—G’çVW'’€¢%4TÄT5B6÷VçB‚¢“£¦–çBâe$ôÒV&Æ–2æVçFW'&—6Uö•ö6öÖÖæE÷&V6V—G2t„U$R7FGW3Òv6Æ–ÖVBr"À¢’’ç&÷w5³Òæâ“°¢76W'BæWVÂ†f–æÄ6Æ–ÖVBÂ“°¢6öç6öÆRæÆör†ÔôDU$ä•¤D”ôâ5U%$TåBÔ54U54ÔTåBG´¥4ôâç7G&–æv–g’‡°¢&÷fVEc¢w7V66VVFVBrÂæWvW$G&gC¢w&V¦V7FVBrÂæWvW%&Wf–WvW%&VG“¢w&V¦V7FVBrÀ¢æWvW%&V¦V7FVC¢w&V¦V7FVBrÂæWvW%7WW'6VFVC¢w&V¦V7FVBrÂÆFW7D&÷fVEc#¢w7V66VVFVBrÀ¢6öæ7W'&VçE7FÆTÆ÷6W'3£Âö'6öÆWFTFV6—6–öç3£ÂVFvT6öæfÆ–7E&÷÷6VC£À¢FF&6T6öæfÆ–7G3£Â6æöæ–6Ä6öæfÆ–7DÖ—6ÖF6†W3£Â&WÆ”FF—F–öæÄFV6—6–öç3£À¢&WÆ”FF—F–öæÄVffV7G3£Âf–æÄ6Æ–ÖVBÀ¢Ò—Ö“°¢Ò“° ¢v—B66Væ&–ò‚tÖöFW&æ—¦F–öâæ6W7G'’FW&—fW2v÷fW&æVBFV6—6–öâæB76VÖ&ÆR&VÖ–ç2G&gBÖöæÇ’VçF–Â&÷fÂrÂ7–æ2‚’Óâ°¢6öç7BÆ–6F–öâÒf—‡GW&RçWV–Bƒ3c“²6öç7BÖWFFFÒf—‡GW&RçWV–Bƒ3c“²6öç7B6÷W&6T76W76ÖVçBÒf—‡GW&RçWV–Bƒ3c"“°Ð¢v—BWF†÷&—G’çVW'’†”å4U%B”åDòV&Æ–2æ76W75öÆ–6F–öåö76WG2†–BÆ÷&uö–BÇv÷&·76Uö–BÆæÖRÆæ÷&ÖÆ—¦VEöæÖRÆ7&VFVEö'’Ð¢dÅTU2‚CÂC"ÂC2Âtf—‡GW&RÆ–6F–öârÂvf—‡GW&RÆ–6F–öârÂCB–Â¶Æ–6F–öâÂf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂf—‡GW&Rç&WVW7FW%Ò“°Ð¢v—BWF†÷&—G’çVW'’†”å4U%B”åDòV&Æ–2æ76W75öÆ–6F–öåöÖWFFF÷fW'6–öç2†–BÆ÷&uö–BÇv÷&·76Uö–BÆÆ–6F–öåö–BÇfW'6–öâÆÆ–fV7–6ÆRÆÖWFFFÆWF†÷%ö–BÐ¢dÅTU2‚CÂC"ÂC2ÂCBÃÂv&÷fVBrÂw·Òs£¦§6öæ"ÂCR–Â¶ÖWFFFÂf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂÆ–6F–öâÂf—‡GW&Rç&WVW7FW%Ò“°Ð¢6öç7BWF†÷&—¦F–öåfW'6–öâÒçVÖ&W"‚†v—BWF†÷&—G’çVW'’‚u4TÄT5BfW'6–öâe$ôÒV&Æ–2æWF†÷&—¦F–öå÷fW'6–öç2t„U$R÷&uö–CÒCäBW6W%ö–CÒC"rÂ¶f—‡GW&Ræ÷&rÂf—‡GW&Rç&WVW7FW%Ò’’ç&÷w5³ÒçfW'6–öâ“°Ð¢v—BWF†÷&—G’çVW'’†”å4U%B”åDòV&Æ–2æ76W75öÆ–6F–öåö76W76ÖVçE÷fW'6–öç2€Ð¢–BÆ÷&uö–BÇv÷&·76Uö–BÆÆ–6F–öåö–BÆÖWFFF÷fW'6–öåö–BÇfW'6–öâÆFV6—6–öåöÖöFVÅ÷fW'6–öâÆÆ–fV7–6ÆRÆWF†÷%ö–BÆWF†÷&—¦F–öå÷fW'6–öâÐ¢dÅTU2‚CÂC"ÂC2ÂCBÂCRÃÂv76W72×c"ÖÆ–6F–öâ×÷'FföÆ–òÓ##bÓrrÂv&÷fVBrÂCbÂCr–ÀÐ¢·6÷W&6T76W76ÖVçBÂf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂÆ–6F–öâÂÖWFFFÂf—‡GW&Rç&WVW7FW"ÂWF†÷&—¦F–öåfW'6–öåÒ“°Ð¢6öç7BF–ÖVç6–öç2Ò°Ð¢v–çFVw&F–öåö66W76–&–Æ—G’rÂw6VÖçF–5öæEöFFö6Æ&—G’rÂw7FFUöæEöW†V7WF–öârÀÐ¢w6V7W&—G•öæEö6öçG&öÂrÂv&6†—FV7GW&Uö6†ævV&–Æ—G’rÂwV•öWFöÖF–öå÷&VF–æW72rÀÐ¢v•ö76—7FVEöVæv–æVW&–æu÷&VF–æW72rÀÐ¢Ó°Ð¢v—BWF†÷&—G’çVW'’†”å4U%B”åDòV&Æ–2æ76W75öÆ–6F–öåöF–ÖVç6–öå÷&W7VÇG2€Ð¢÷&uö–BÇv÷&·76Uö–BÆÆ–6F–öåö–BÆÖWFFF÷fW'6–öåö–BÆ76W76ÖVçE÷fW'6–öåö–BÆF–ÖVç6–öâÀÐ¢&VF–æW75ö&æBÆWf–FVæ6Uö6öæf–FVæ6RÆ†&EövFW2ÆWf–FVæ6U÷&Vg2ÆÖ—76–æuöWf–FVæ6RÇ&F–öæÆRÀÐ¢6öçG&F–7F–öç2Ç&VÖVF–F–öå÷&WV—&VÖVçG2Çv†E÷v÷VÆEö6†ævRÐ¢4TÄT5BCÂC"ÂC2ÂCBÂCRÆF–ÖVç6–öâÂu&VG’rÂufW&–f–VBrÂw·Òs£§FW‡EµÒÂuµÒs£¦§6öæ"ÀÐ¢w·Òs£§FW‡EµÒÄ%$•²wfW&–f–VBuÒÂw·Òs£§FW‡EµÒÂw·Òs£§FW‡EµÒÄ%$•²væWrWf–FVæ6RuÐÐ¢e$ôÒVææW7B‚Cc£§FW‡EµÒ’F–ÖVç6–öæÂ¶f—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂÆ–6F–öâÂÖWFFFÂ6÷W&6T76W76ÖVçBÂF–ÖVç6–öç5Ò“°Ð¢v—BWF†÷&—G’çVW'’†”å4U%B”åDòV&Æ–2æ76W75öÆ–6F–öåöÖöFW&æ—¦F–öå÷&V6öÖÖVæFF–öç2€¢÷&uö–BÇv÷&·76Uö–BÆÆ–6F–öåö–BÆÖWFFF÷fW'6–öåö–BÆ76W76ÖVçE÷fW'6–öåö–BÆF—7÷6—F–öâÀ¢Ö–w&F–öåö&÷VæF'’Ç&öÆÆ&6µ÷7G&FVw’ÆWf–FVæ6Uö6öæf–FVæ6R¢dÅTU2‚CÂC"ÂC2ÂCBÂCRÂu&V'V–ÆBF‡&÷Vv‚6öçG&öÆÆVB’Ö76—7FVBFVÆ—fW'’rÂvG&gBÖöæÇ’&÷VæF'’rÂw&WF–â7W'&VçB7—7FVÒrÂufW&–f–VBr–À¢¶f—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂÆ–6F–öâÂÖWFFFÂ6÷W&6T76W76ÖVçEÒ“°¢6öç7BVçFW'&—6T76W76ÖVçBÒf—‡GW&RçWV–Bƒ3c2“²6öç7BFV6—6–öâÒf—‡GW&RçWV–Bƒ3cB“°Ð¢6öç7B6öÖÖ—GFVBÒ†v—BWF†÷&—G’çVW'’‚u4TÄT5BV&Æ–2æVçFW'&—6Uö6öÖÖ—EöÖöFW&æ—¦F–öåö76W76ÖVçB‚C£¦§6öæ"ÂC#£¦§6öæ"’&W7VÇBrÂ°Ð¢¥4ôâç7G&–æv–g’‡¶–C¢VçFW'&—6T76W76ÖVçBÂ÷&uö–C¢f—‡GW&Ræ÷&rÂv÷&·76Uö–C¢f—‡GW&Rçv÷&·76RÂÆ–6F–öå÷&Vc¢Æ–6F–öâÂ6÷W&6Uö76W76ÖVçEö–C¢6÷W&6T76W76ÖVçBÂ6÷W&6UöÖWFFF÷fW'6–öåö–C¢ÖWFFFÂ7&VFVEö'“¢f—‡GW&Rç&WVW7FW'Ò’ÀÐ¢¥4ôâç7G&–æv–g’‡¶–C¢FV6—6–öâÂ7&VFVEö'“¢f—‡GW&Rç&WVW7FW'Ò’ÀÐ¢Ò’’ç&÷w5³Òç&W7VÇC°Ð¢76W'BæWVÂ†6öÖÖ—GFVBç&–Ö'”F—7÷6—F–öâÂw&V'V–ÆBr“°¢76W'BæÖF6‚†6öÖÖ—GFVBç&W6÷W&6T†6‚Âõå³Ó–Öe×³cGÒBò“°Ð¢6öç7B&Wf–WvW%fW'6–öâÒçVÖ&W"‚†v—BWF†÷&—G’çVW'’‚u4TÄT5BfW'6–öâe$ôÒV&Æ–2æWF†÷&—¦F–öå÷fW'6–öç2t„U$R÷&uö–CÒCäBW6W%ö–CÒC"rÂ¶f—‡GW&Ræ÷&rÂf—‡GW&Rç&Wf–WvW%Ò’’ç&÷w5³ÒçfW'6–öâ“°Ð¢6öç7BFV6—6–öå&Wf–WrÒf—‡GW&RçWV–Bƒ3cR“°Ð¢v—BWF†÷&—G’çVW'’†”å4U%B”åDòV&Æ–2æVçFW'&—6Uö†–v…ö–×7E÷&Wf–WuöWfVçG2†–BÆ÷&uö–BÇv÷&·76Uö–BÇ&W6÷W&6U÷G—RÇ&W6÷W&6Uö–BÇ&Wf–WvW%ö–BÇ&Wf–WvW%öWF†÷&—¦F–öå÷fW'6–öâÇ&W6÷W&6U÷fW'6–öâÇ&W6÷W&6Uö†6‚Æ÷WF6öÖRÇ&F–öæÆRÐ¢dÅTU2‚CÂC"ÂC2ÂvÖöFW&æ—¦F–öåöFV6—6–öârÂCBÂCRÂCbÃÂCrÂv&÷fVBrÂt–æFWVæFVçBÖöFW&æ—¦F–öâ&Wf–Wrr–ÀÐ¢¶FV6—6–öå&Wf–WrÂf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂFV6—6–öâÂf—‡GW&Rç&Wf–WvW"Â&Wf–WvW%fW'6–öâÂf—‡GW&Ræ†6‚‚sr•Ò“°Ð¢v—BWF†÷&—G’çVW'’‚u4TÄT5BV&Æ–2æVçFW'&—6Uö6öÖÖ—Eö†–v…ö–×7Eö&÷fÂ‚C£¦§6öæ"ÂC"ÂC2ÂCBÂCRÂCb’rÂ´¥4ôâç7G&–æv–g’‡¶7&VFVEö'“¢f—‡GW&Rç&WVW7FW"Â&Wf–WvVEö'“¢f—‡GW&Rç&Wf–WvW"Â&÷fVEö'“¢f—‡GW&Ræ&÷fW"Â&Wf–WuöWfVçEö–C¢FV6—6–öå&Wf–WrÂ÷WF6öÖS¢v&÷fVBrÂ&F–öæÆS¢tÖöFW&æ—¦F–öâ&÷fÂwÒ’ÂvÖöFW&æ—¦F–öåöFV6—6–öârÂFV6—6–öâÂf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂv&÷fVBuÒ“°Ð¢6öç7B&ÇVW&–çBÒf—‡GW&RçWV–Bƒ3cb“°Ð¢6öç7B76VÖ&ÆVBÒ†v—BWF†÷&—G’çVW'’‚u4TÄT5BV&Æ–2æVçFW'&—6Uö6öÖÖ—Eö76VÖ&ÆUö&ÇVW&–çB‚C£¦§6öæ"ÂC"ÂC2ÂCB’&W7VÇBrÂ´¥4ôâç7G&–æv–g’‡¶–C¢&ÇVW&–çBÂÖöFW&æ—¦F–öäFV6—6–öä–C¢FV6—6–öâÂ7G'V7GW&VD6öçFVçC¢¶6ö×öæVçG3¢µ×ÒÂ&VF&ÆTFö7VÖVçC¢tG&gBÖöæÇ’f—‡GW&R&ÇVW&–çBwÒ’Âf—‡GW&Rç&WVW7FW"Âf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76UÒ’’ç&÷w5³Òç&W7VÇC°Ð¢76W'BæFVWWVÂ…¶76VÖ&ÆVBç7FGW2Â76VÖ&ÆVBæW†V7WF–öäVæ&ÆVBÂ76VÖ&ÆVBç'VçF–ÖTvVçG4Væ&ÆVBÂ76VÖ&ÆVBæÆ—fUFVÆVÖWG'”Væ&ÆVEÒÂ²vG&gBrÂfÇ6RÂfÇ6RÂfÇ6UÒ“°Ð¢6öç7BfÆw2Ò†v—BWF†÷&—G’çVW'’†4TÄT5B6öFUövVæW&F–öåöVæ&ÆVBÆFWÆ÷–ÖVçEöVæ&ÆVBÆ–æg&7G'V7GW&Uö6†ævW5öVæ&ÆVBÀÐ¢7&VFVçF–Åö66W75öVæ&ÆVBÇ6÷W&6U÷7—7FVÕö6ÆÇ5öVæ&ÆVBÇ'VçF–ÖUövVçG5öVæ&ÆVBÆÆ—fU÷FVÆVÖWG'•öVæ&ÆV@Ð¢e$ôÒV&Æ–2æVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çG2t„U$R–CÒCÂ¶&ÇVW&–çEÒ’’ç&÷w5³Ó°Ð¢76W'BæFVWWVÂ„ö&¦V7BçfÇVW2†fÆw2’Â¶fÇ6RÂfÇ6RÂfÇ6RÂfÇ6RÂfÇ6RÂfÇ6RÂfÇ6UÒ“°Ð¢6öç7B&ÇVW&–çE&Wf–WrÒf—‡GW&RçWV–Bƒ3cr“°Ð¢v—BWF†÷&—G’çVW'’†”å4U%B”åDòV&Æ–2æVçFW'&—6Uö†–v…ö–×7E÷&Wf–WuöWfVçG2†–BÆ÷&uö–BÇv÷&·76Uö–BÇ&W6÷W&6U÷G—RÇ&W6÷W&6Uö–BÇ&Wf–WvW%ö–BÇ&Wf–WvW%öWF†÷&—¦F–öå÷fW'6–öâÇ&W6÷W&6U÷fW'6–öâÇ&W6÷W&6Uö†6‚Æ÷WF6öÖRÇ&F–öæÆRÐ¢dÅTU2‚CÂC"ÂC2Âv76VÖ&ÆUö&ÇVW&–çBrÂCBÂCRÂCbÃÂCrÂv&÷fVBrÂt–æFWVæFVçB&ÇVW&–çB&Wf–Wrr–ÀÐ¢¶&ÇVW&–çE&Wf–WrÂf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂ&ÇVW&–çBÂf—‡GW&Rç&Wf–WvW"Â&Wf–WvW%fW'6–öâÂf—‡GW&Ræ†6‚‚sr•Ò“°Ð¢v—BWF†÷&—G’çVW'’‚u4TÄT5BV&Æ–2æVçFW'&—6Uö6öÖÖ—Eö†–v…ö–×7Eö&÷fÂ‚C£¦§6öæ"ÂC"ÂC2ÂCBÂCRÂCb’rÂ´¥4ôâç7G&–æv–g’‡¶7&VFVEö'“¢f—‡GW&Rç&WVW7FW"Â&Wf–WvVEö'“¢f—‡GW&Rç&Wf–WvW"Â&÷fVEö'“¢f—‡GW&Ræ&÷fW"Â&Wf–WuöWfVçEö–C¢&ÇVW&–çE&Wf–WrÂ÷WF6öÖS¢v&÷fVBrÂ&F–öæÆS¢t&ÇVW&–çB&÷fÂwÒ’Âv76VÖ&ÆUö&ÇVW&–çBrÂ&ÇVW&–çBÂf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂv&÷fVBuÒ“°Ð¢v—B76W'Bç&V¦V7G2†WF†÷&—G’çVW'’‚%UDDRV&Æ–2æVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çG24UB7FGW3Òw&V¦V7FVBrt„U$R–CÒC"Â¶&ÇVW&–çEÒ’ÂôTåDU%$•4Uõ$U4õU$4Uô”ÔÕUD$ÄUôõ%õE$å4•D”ôåô”ådÄ”Bò“°Ð¢Ò“°Ð¢v—B66Væ&–ò‚w&VBÖöæÇ’&öÆÆ&6²&Æö6·2×WFF–öç2v†–ÆR6&–Æ—G’&ö¦V7F–öâ&VÖ–ç2f–Æ&ÆRrÂ7–æ2‚’Óâ°Ð¢v—BWF†÷&—G’çVW'’‚uUDDRV&Æ–2æVçFW'&—6Uö–çFVÆÆ–vVæ6U÷'VçF–ÖUö6öçG&öÂ4UB&VEööæÇ“×G'VRt„U$R6–ævÆWFöã×G'VRr“°Ð¢v—B76W'Bç&V¦V7G2†WF†÷&—G’çVW'’‚u4TÄT5BV&Æ–2æVçFW'&—6Uö•ö6Æ–Õö6öÖÖæB‚CÂC"ÂC2ÂCBÂCRÂCbÂCrÂC‚’rÂ¶f—‡GW&Rç&WVW7FW"Âf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂvWf–FVæ6Rç6÷W&6Ræ7&VFRrÂvf—‡GW&R×&VFöæÇ’ÓrÂf—‡GW&RçWV–Bƒ3S’Âf—‡GW&Ræ†6‚‚vr’ÂçVÆÅÒ’ÂôTåDU%$•4Uô”åDTÄÄ”tTä4Uõ$TEôôäÅ’ò“°Ð¢v—BWF†÷&—G’çVW'’‚t$Tt”âr“°Ð¢G'’°Ð¢v—BWF†÷&—G’çVW'’‚u4UBÄô4Â$ôÄRWF†VçF–6FVBr“°Ð¢v—BWF†÷&—G’çVW'’‚%4TÄT5B6WEö6öæf–r‚w&WVW7Bæ§wBæ6Æ–Òç7V"rÂCÇG'VR’"Â¶f—‡GW&Rç&WVW7FW%Ò“°Ð¢6öç7B&ö¦V7F–öâÒ†v—BWF†÷&—G’çVW'’‚u4TÄT5BV&Æ–2æVçFW'&—6UöWf–FVæ6U÷6÷W&6U÷&ö¦V7F–öâ‚CÂC"ÂC2’&ö¦V7F–öârÂ¶f—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂf—‡GW&Rç6÷W&6W5³Òç6÷W&6T–EÒ’’ç&÷w5³Òç&ö¦V7F–öã°Ð¢76W'Bæö²‡&ö¦V7F–öâ“°Ð¢76W'BæWVÂ„ö&¦V7Bæ†4÷vâ‡&ö¦V7F–öâÂw7F÷&vUF‚r’ÂfÇ6R“°Ð¢v—B76W'Bç&V¦V7G2†WF†÷&—G’çVW'’‚$”å4U%B”åDòV&Æ–2æVçFW'&—6UöWf–FVæ6U÷VW7F–öç2‡6÷W&6Uö–BÆ÷&uö–BÇv÷&·76Uö–BÇVW7F–öâÇ7FGW2Æ7&VFVEö'’’dÅTU2‚CÂC"ÂC2Âvf÷&&–FFVârÂv÷VârÂCB’"Â¶f—‡GW&Rç6÷W&6W5³Òç6÷W&6T–BÂf—‡GW&Ræ÷&rÂf—‡GW&Rçv÷&·76RÂf—‡GW&Rç&WVW7FW%Ò’Â÷W&Ö—76–öâFVæ–VBò“°Ð¢Òf–æÆÇ’²v—BWF†÷&—G’çVW'’‚u$ôÄÄ$4²r“²ÐÐ¢v—BWF†÷&—G’çVW'’‚uUDDRV&Æ–2æVçFW'&—6Uö–çFVÆÆ–vVæ6U÷'VçF–ÖUö6öçG&öÂ4UB&VEööæÇ“ÖfÇ6Rt„U$R6–ævÆWFöã×G'VRr“°Ð¢Ò“°Ð Ð¢6öç6öÆRæÆör†VçFW'&—6R–çFVÆÆ–vVæ6R÷7Fw&U5ÂW†V7WF&ÆR66Væ&–÷3¢G·66Væ&–÷2æÆVæwF‡Ò76VBÂf–ÆVBæ“°Ð§Òf–æÆÇ’°Ð¢f÷"†6öç7B6Æ–VçBöb6Æ–VçG2ç&WfW'6R‚’’–b†6Æ–VçBÓÒFÖ–â’v—B6Æ–VçBæVæB‚’æ6F6‚‚‚’Óâ·Ò“°Ð¢–b†FÖ–â’°Ð¢ÆWB6ÆVçWf–ÆVBÒfÇ6S°Ð¢f÷"†6öç7BæÖRöb7&VFVDFF&6W2ç&WfW'6R‚’’°Ð¢G'’²v—BFÖ–âçVW'’†E$õDD$4R”bU„•5E2G¶æÖWÒt•D‚„dõ$4R–“²6öç6öÆRæÆör†4ÄTåUE$õTBDD$4RG¶æÖWÖ“²ÐÐ¢6F6‚†W'&÷"’²6ÆVçWf–ÆVBÒG'VS²6öç6öÆRæW'&÷"†4ÄTåUd”ÄTBDD$4RG¶æÖWÓ¢G¶W'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢7G&–ær†W'&÷"—Ö“²ÐÐ¢ÐÐ¢f÷"†6öç7B&öÆRöb7&VFVE&öÆW2ç&WfW'6R‚’’°Ð¢G'’²v—BFÖ–âçVW'’†E$õ$ôÄR”bU„•5E2G·&öÆWÖ“²ÐÐ¢6F6‚†W'&÷"’²6ÆVçWf–ÆVBÒG'VS²6öç6öÆRæW'&÷"†4ÄTåUd”ÄTB$ôÄRG·&öÆWÓ¢G¶W'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢7G&–ær†W'&÷"—Ö“²ÐÐ¢ÐÐ¢v—BFÖ–âæVæB‚’æ6F6‚‚‚’Óâ·Ò“°Ð¢6öç6öÆRæÆör†4ÄTåUG¶6ÆVçWf–ÆVBòtd”ÄTBr¢u52wÖ“°Ð¢–b†6ÆVçWf–ÆVB’&ö6W72æW†—D6öFRÒ°Ð¢ÐÐ§ÐÐ