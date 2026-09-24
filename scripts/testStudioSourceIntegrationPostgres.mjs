import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { createEnterpriseIntelligenceFixture } from './enterpriseIntelligencePostgresFixture.mjs';

const adminUrl = process.env.STUDIO_SOURCE_INTEGRATION_DATABASE_URL;
if (!adminUrl) {
  if (process.env.CI) throw new Error('STUDIO_SOURCE_INTEGRATION_DATABASE_URL is required in CI.');
  console.log('Studio source PostgreSQL scenarios skipped: STUDIO_SOURCE_INTEGRATION_DATABASE_URL is not set.');
  process.exit(0);
}
const parsedAdminUrl = new URL(adminUrl);
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsedAdminUrl.hostname));
assert.equal(parsedAdminUrl.pathname, '/postgres');

const { Client } = pg;
const migrationName = '20260924052038_studio_independent_source_integration.sql';
const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
assert.equal(migrations.at(-2), migrationName);
assert.equal(migrations.at(-1), '20260924113000_pr_c_synthetic_acceptance_execution_kind.sql');
const databaseName = `studio_source_${process.pid}_${Date.now()}`;
assert.match(databaseName, /^[a-z0-9_]+$/);
const urlFor = name => { const value = new URL(adminUrl); value.pathname = `/${name}`; return value.toString(); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fixed = number => `97000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const actor = fixed(330);
const one = async (db, sql, values = []) => (await db.query(sql, values)).rows[0];
const count = async (db, table, where = '', values = []) => Number((await one(db, `SELECT count(*)::int n FROM ${table} ${where}`, values)).n);
const asAuthenticated = async (db, actorId, sql, values = []) => {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actorId]);
    const result = await db.query(sql, values);
    await db.query('ROLLBACK');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};
const transaction = async (db, label, sql) => {
  await db.query('BEGIN');
  try { await db.query(sql); await db.query('COMMIT'); }
  catch (error) { await db.query('ROLLBACK'); throw new Error(`${label}: ${error?.code ?? 'UNKNOWN'}: ${error?.message ?? String(error)}`); }
};
const expectedFailure = async (operation, pattern) => {
  try { await operation(); assert.fail('EXPECTED_FAILURE'); }
  catch (error) {
    assert.match(String(error?.message ?? error), pattern);
    return error;
  }
};
const marker = (testId, assertionId, lineage, participants = []) => console.log(`PR_C_ASSERTION ${JSON.stringify({
  testId, assertionId, fixture: 'studio-source-exact-v1', owner: 'studio-source-postgres', result: 'passed',
  runtimeContext: {
    persona: { id: actor, state: 'active', capabilities: ['studio.sources.manage'] },
    ...(participants.length > 0 ? { participants } : {}),
    organizationId: lineage.organizationId, workspaceId: lineage.workspaceId, lineage,
  },
})}`);

let admin;
let db;
const createdRoles = [];
try {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  for (const [role, attributes] of [['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS']]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      await admin.query(`CREATE ROLE ${role} ${attributes}`);
      createdRoles.push(role);
    }
  }
  await admin.query(`CREATE DATABASE ${databaseName}`);
  db = new Client({ connectionString: urlFor(databaseName) });
  await db.connect();
  await transaction(db, 'auth bootstrap', `
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid primary key,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  for (const migration of migrations.slice(0, -1)) await transaction(db, migration, await readFile(join('supabase/migrations', migration), 'utf8'));
  assert.ok(Number((await one(db, "SELECT current_setting('server_version_num')::int version")).version) >= 160000);

  // A populated pre-migration Studio set may already reference shared/Assess-library
  // evidence. The additive upgrade must retain it and remain default-off.
  const fixture = await createEnterpriseIntelligenceFixture(db);
  assert.equal(fixture.org, fixed(10));
  assert.equal(fixture.workspace, fixed(11));
  const legacyShared = fixture.sources.find(item => item.parsed);
  assert.ok(legacyShared);
  const legacySharedRow = await one(db, `SELECT content_hash,extracted_text_hash,extracted_character_count
    FROM public.enterprise_evidence_source_versions WHERE id=$1`, [legacyShared.sourceVersionId]);
  const legacySet = fixed(320);
  const legacySetVersion = fixed(321);
  await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(org_id,workspace_id,updated_by)
    VALUES($1,$2,$3) ON CONFLICT(org_id,workspace_id) DO NOTHING`, [fixture.org, fixture.workspace, fixture.requester]);
  await db.query(`INSERT INTO public.enterprise_source_sets(id,org_id,workspace_id,owner_module,display_label,current_version,status,created_by)
    VALUES($1,$2,$3,'studio','Retained shared Studio set',1,'locked',$4)`, [legacySet, fixture.org, fixture.workspace, fixture.requester]);
  await db.query(`INSERT INTO public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by)
    VALUES($1,$2,$3,$4,1,'Retained shared evidence',$5,1,$6,'locked',$7)`, [legacySetVersion, legacySet, fixture.org,
    fixture.workspace, sha('legacy-shared-studio-set'), legacySharedRow.extracted_character_count, fixture.requester]);
  await db.query(`INSERT INTO public.enterprise_source_set_version_items(source_set_version_id,source_set_id,source_version_id,source_id,
    org_id,workspace_id,ordinal,semantic_role,content_hash,extracted_text_hash,extracted_character_count)
    VALUES($1,$2,$3,$4,$5,$6,1,'reference',$7,$8,$9)`, [legacySetVersion, legacySet, legacyShared.sourceVersionId,
    legacyShared.sourceId, fixture.org, fixture.workspace, legacySharedRow.content_hash, legacySharedRow.extracted_text_hash,
    legacySharedRow.extracted_character_count]);
  const legacyBundle = fixed(322);
  const legacyBundleVersion = fixed(323);
  const legacyRoute = fixed(324);
  const legacyReceipt = fixed(325);
  const legacyBinding = fixed(326);
  await db.query(`INSERT INTO public.enterprise_module_input_bundles(id,org_id,workspace_id,owner_module,current_version,created_by)
    VALUES($1,$2,$3,'studio',1,$4)`, [legacyBundle, fixture.org, fixture.workspace, fixture.requester]);
  await db.query(`INSERT INTO public.enterprise_module_input_bundle_versions(id,input_bundle_id,org_id,workspace_id,version,bundle_hash,status,created_by)
    VALUES($1,$2,$3,$4,1,$5,'locked',$6)`, [legacyBundleVersion, legacyBundle, fixture.org, fixture.workspace,
    sha('legacy-studio-bundle'), fixture.requester]);
  await db.query(`INSERT INTO public.enterprise_module_input_bundle_items(input_bundle_version_id,input_bundle_id,org_id,workspace_id,ordinal,item_kind,
    source_set_version_id,source_set_id,resource_hash,declared_purpose) VALUES($1,$2,$3,$4,1,'source_set',$5,$6,$7,'Retained Studio compatibility')`,
    [legacyBundleVersion, legacyBundle, fixture.org, fixture.workspace, legacySetVersion, legacySet, sha('legacy-shared-studio-set')]);
  await db.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by)
    VALUES($1,$2,$3,$4,'assess.evidence.extract','fixture-model',true,ARRAY[$5::text],$6,$6)`,
    [legacyRoute, fixture.org, fixture.workspace, fixture.provider, fixture.routeRole, fixture.requester]);
  await db.query(`INSERT INTO public.enterprise_ai_command_receipts(id,org_id,workspace_id,actor_id,command_type,runtime_area,idempotency_key,
    initial_request_id,last_request_id,request_hash,status,resource_id,response,completed_at) VALUES($1,$2,$3,$4,'transcript.assess.extract','ingestion',
    'legacy-studio-binding-001',$5,$5,$6,'committed',$7,'{}'::jsonb,statement_timestamp())`,
    [legacyReceipt, fixture.org, fixture.workspace, fixture.requester, fixed(327), sha('legacy-studio-binding'), fixture.job]);
  await db.query(`INSERT INTO public.enterprise_transcript_extraction_bindings(id,org_id,workspace_id,job_id,receipt_id,input_bundle_version_id,
    input_bundle_id,bundle_hash,source_id,source_version_id,provider_route_id,provider_config_id,model,authorization_version,created_by,source_set_id,source_set_version_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'fixture-model',$13,$14,$15,$16)`, [legacyBinding, fixture.org,
    fixture.workspace, fixture.job, legacyReceipt, legacyBundleVersion, legacyBundle, sha('legacy-studio-bundle'), legacyShared.sourceId,
    legacyShared.sourceVersionId, legacyRoute, fixture.provider, fixture.authorizationVersions[fixture.requester], fixture.requester, legacySet, legacySetVersion]);
  const legacyCandidate = await one(db, `SELECT value,excerpt_hash FROM public.enterprise_evidence_candidates WHERE id=$1`, [fixture.candidate]);
  await db.query(`SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,'accepted',$6,$7,'Retained pre-migration Studio review')`,
    [fixture.candidate, fixture.org, fixture.workspace, legacyCandidate.value, legacyCandidate.excerpt_hash, fixture.reviewer, legacyCandidate.value]);
  await transaction(db, migrationName, await readFile(join('supabase/migrations', migrationName), 'utf8'));
  assert.equal(await count(db, 'public.enterprise_source_set_version_items', 'WHERE source_set_version_id=$1', [legacySetVersion]), 1);
  assert.equal(await count(db, 'public.studio_legacy_extraction_binding_compatibility', 'WHERE binding_id=$1 AND job_id=$2', [legacyBinding, fixture.job]), 1);
  await expectedFailure(() => db.query(`INSERT INTO public.enterprise_transcript_extraction_bindings(id,org_id,workspace_id,job_id,receipt_id,
    input_bundle_version_id,input_bundle_id,bundle_hash,source_id,source_version_id,provider_route_id,provider_config_id,model,authorization_version,
    created_by,source_set_id,source_set_version_id) SELECT $1,org_id,workspace_id,$2,receipt_id,input_bundle_version_id,input_bundle_id,bundle_hash,
    source_id,source_version_id,provider_route_id,provider_config_id,model,authorization_version,created_by,source_set_id,source_set_version_id
    FROM public.enterprise_transcript_extraction_bindings WHERE id=$3`, [fixed(328), fixed(329), legacyBinding]),
  /ENTERPRISE_TRANSCRIPT_EXTRACTION_BINDING_STALE/);
  assert.equal((await one(db, `SELECT studio_source_integration_enabled FROM public.enterprise_transcript_workspace_flags
    WHERE org_id=$1 AND workspace_id=$2`, [fixture.org, fixture.workspace])).studio_source_integration_enabled, false);

  const identity = await one(db, `SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton`);
  assert.equal(identity.migration_tip, '20260924052038');
  const identityConstraint = await one(db, `SELECT pg_get_expr(conbin,conrelid,false) expression FROM pg_constraint
    WHERE conrelid='public.hosted_pilot_environment_identity'::regclass AND conname='hosted_pilot_environment_identity_migration_tip_check'`);
  assert.equal(identityConstraint.expression, "(migration_tip = '20260924052038'::text)");
  const role = fixed(331);
  const orgRole = fixed(332);
  const packageActor = fixed(333);
  const packageRole = fixed(334);
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [actor, 'studio-source-author@fixture.invalid']);
  await db.query('INSERT INTO public.profiles(id,email) VALUES($1,$2)', [actor, 'studio-source-author@fixture.invalid']);
  await db.query(`INSERT INTO public.roles(id,org_id,name,slug,scope,permissions,status)
    VALUES($1,$2,'Studio source organization member','studio-source-org-member','organization','[]','active')`, [orgRole, fixture.org]);
  await db.query(`INSERT INTO public.roles(id,org_id,workspace_id,name,slug,scope,permissions,status)
    VALUES($1,$2,$3,'Studio source author','studio-source-author','workspace','[]','active')`, [role, fixture.org, fixture.workspace]);
  await db.query(`INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'studio.sources.manage')`, [role]);
  await db.query(`INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')`, [fixture.org, actor, orgRole]);
  await db.query(`INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) VALUES($1,$2,$3,$4,'active')`,
    [fixture.org, fixture.workspace, actor, role]);
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [packageActor, 'studio-package-author@fixture.invalid']);
  await db.query('INSERT INTO public.profiles(id,email) VALUES($1,$2)', [packageActor, 'studio-package-author@fixture.invalid']);
  await db.query(`INSERT INTO public.roles(id,org_id,workspace_id,name,slug,scope,permissions,status)
    VALUES($1,$2,$3,'Studio package author','studio-package-author','workspace','[]','active')`, [packageRole, fixture.org, fixture.workspace]);
  await db.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
    SELECT $1,unnest(ARRAY['studio.artifacts.generate','studio.artifacts.read']::text[])`, [packageRole]);
  await db.query(`INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')`, [fixture.org, packageActor, orgRole]);
  await db.query(`INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) VALUES($1,$2,$3,$4,'active')`,
    [fixture.org, fixture.workspace, packageActor, packageRole]);
  const authorizationVersion = Number((await one(db,
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, actor])).version);
  assert.ok(authorizationVersion > 0);
  const packageAuthorizationVersion = Number((await one(db,
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, packageActor])).version);
  assert.ok(packageAuthorizationVersion > 0);

  const claim = async (command, key, requestHash, token = crypto.randomUUID()) => one(db,
    `SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*`,
    [actor, fixture.org, fixture.workspace, command, key, crypto.randomUUID(), requestHash, token]);

  // The one-time snapshot preserves populated pre-migration Studio packages
  // without turning the default-off new Studio extraction path on.
  await db.query(`UPDATE public.enterprise_transcript_workspace_flags SET direct_studio_planning_enabled=true,
    studio_multisource_enabled=true,studio_source_integration_enabled=false,updated_by=$3 WHERE org_id=$1 AND workspace_id=$2`,
  [fixture.org, fixture.workspace, packageActor]);
  const legacyArtifact = fixed(335);
  const legacyPackage = fixed(336);
  const legacyPackageCommand = {
    actorId: packageActor, organizationId: fixture.org, workspaceId: fixture.workspace, artifactId: legacyArtifact,
    sourcePackageId: legacyPackage, requestId: fixed(337), idempotencyKey: 'legacy-snapshot-package-001',
    authorizationVersion: packageAuthorizationVersion,
    payload: { sourceMode: 'direct_transcript_bundle', artifactType: 'brd', studioInputBundleId: legacyBundle,
      studioInputBundleVersionId: legacyBundleVersion, studioInputBundleVersion: 1 },
  };
  const legacyPackageResult = (await one(db, `SELECT public.studio_artifact_source_package_create($1::jsonb) result`,
    [JSON.stringify(legacyPackageCommand)])).result;
  assert.equal(legacyPackageResult.outcome, 'committed');
  assert.equal(legacyPackageResult.planningOnly, true);
  assert.equal(Number((await one(db, `SELECT candidate_count FROM public.studio_artifact_source_packages WHERE id=$1`, [legacyPackage])).candidate_count), 1);
  const legacyProjection = (await asAuthenticated(db, packageActor,
    `SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`, [fixture.org, fixture.workspace, legacyArtifact])).rows[0].projection;
  assert.equal(legacyProjection.sourcePackageId, legacyPackage);

  // Actual source-create preflight precedes the Storage-equivalent record write.
  const sourceId = fixed(340);
  const sourceVersionId = fixed(341);
  const sourceReceipt = await claim('studio.source.create', 'studio-source-create-001', sha('source-create-request'));
  const sourceRowsBefore = await count(db, 'public.enterprise_evidence_sources', 'WHERE id=$1', [sourceId]);
  await db.query(`INSERT INTO public.enterprise_transcript_workspace_flags(org_id,workspace_id,updated_by)
    VALUES($1,$2,$3) ON CONFLICT(org_id,workspace_id) DO UPDATE SET studio_multisource_enabled=false,
    studio_source_integration_enabled=false,unified_byok_gateway_enabled=false,updated_by=$3`, [fixture.org, fixture.workspace, actor]);
  await expectedFailure(() => db.query(`SELECT public.studio_source_create_preflight_v1($1,$2,$3,$4,$5,$6,$7)`,
    [actor, fixture.org, fixture.workspace, authorizationVersion, sourceReceipt.id, sourceReceipt.execution_token, sourceReceipt.execution_fence]),
  /ENTERPRISE_TRANSCRIPT_FEATURE_DISABLED/);
  assert.equal(await count(db, 'public.enterprise_evidence_sources', 'WHERE id=$1', [sourceId]), sourceRowsBefore);
  assert.equal(await count(db, 'public.studio_source_version_ownerships', 'WHERE source_version_id=$1', [sourceVersionId]), 0);

  await db.query(`UPDATE public.enterprise_transcript_workspace_flags SET studio_multisource_enabled=true,
    studio_source_integration_enabled=true,unified_byok_gateway_enabled=true,updated_by=$3
    WHERE org_id=$1 AND workspace_id=$2`, [fixture.org, fixture.workspace, actor]);
  const preflight = (await one(db, `SELECT public.studio_source_create_preflight_v1($1,$2,$3,$4,$5,$6,$7) result`,
    [actor, fixture.org, fixture.workspace, authorizationVersion, sourceReceipt.id, sourceReceipt.execution_token, sourceReceipt.execution_fence])).result;
  assert.deepEqual(preflight, { allowed: true, ownerModule: 'studio' });
  const source = { id: sourceId, org_id: fixture.org, workspace_id: fixture.workspace, display_name: 'Studio private SOP', source_kind: 'pasted_text', mime_type: 'text/plain', created_by: actor };
  const version = { id: sourceVersionId, source_id: sourceId, org_id: fixture.org, workspace_id: fixture.workspace,
    original_filename: 'studio-private-sop.txt', content_hash: sha('studio-private-sop'), content_bytes: 64,
    storage_bucket: 'source-uploads', storage_path: `${fixture.org}/${fixture.workspace}/enterprise-evidence/${sourceId}.bin`, created_by: actor };
  const createResult = { resourceId: sourceId, sourceId, sourceVersionId, ownerModule: 'studio', status: 'uploaded' };
  await db.query(`SELECT public.studio_create_evidence_source_record_v1($1::jsonb,$2::jsonb,$3,$4,$5,$6,$7,$8::jsonb)`,
    [JSON.stringify(source), JSON.stringify(version), actor, authorizationVersion, sourceReceipt.id, sourceReceipt.execution_token,
      sourceReceipt.execution_fence, JSON.stringify(createResult)]);
  const parsedHash = sha('studio private extracted text');
  const parseResult = { ...createResult, status: 'parsed' };
  await db.query(`SELECT public.studio_record_source_extraction_success_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [sourceVersionId, fixture.org, fixture.workspace, parsedHash, 64, actor, authorizationVersion, sourceReceipt.id,
      sourceReceipt.execution_token, sourceReceipt.execution_fence, JSON.stringify(parseResult)]);
  const created = await one(db, `SELECT version.extraction_status,ownership.owner_module FROM public.enterprise_evidence_source_versions version
    JOIN public.studio_source_version_ownerships ownership ON ownership.source_version_id=version.id WHERE version.id=$1`, [sourceVersionId]);
  assert.deepEqual(created, { extraction_status: 'parsed', owner_module: 'studio' });

  const shared = fixture.sources.find(item => item.parsed);
  assert.ok(shared);
  const sharedRow = await one(db, `SELECT content_hash,extracted_text_hash,extracted_character_count FROM public.enterprise_evidence_source_versions WHERE id=$1`, [shared.sourceVersionId]);
  const privateRow = await one(db, `SELECT content_hash,extracted_text_hash,extracted_character_count FROM public.enterprise_evidence_source_versions WHERE id=$1`, [sourceVersionId]);

  // Assess cannot consume Studio-private evidence, while Studio can combine shared and private evidence.
  const assessSet = fixed(342);
  const assessSetVersion = fixed(343);
  await db.query(`INSERT INTO public.enterprise_source_sets(id,org_id,workspace_id,owner_module,display_label,current_version,status,created_by)
    VALUES($1,$2,$3,'assess','Assess private rejection',1,'locked',$4)`, [assessSet, fixture.org, fixture.workspace, actor]);
  await db.query(`INSERT INTO public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by)
    VALUES($1,$2,$3,$4,1,'Must reject Studio-private evidence',$5,1,$6,'locked',$7)`,
    [assessSetVersion, assessSet, fixture.org, fixture.workspace, sha('assess-private'), privateRow.extracted_character_count, actor]);
  await expectedFailure(() => db.query(`INSERT INTO public.enterprise_source_set_version_items(source_set_version_id,source_set_id,source_version_id,source_id,
    org_id,workspace_id,ordinal,semantic_role,content_hash,extracted_text_hash,extracted_character_count)
    VALUES($1,$2,$3,$4,$5,$6,1,'primary',$7,$8,$9)`, [assessSetVersion, assessSet, sourceVersionId, sourceId, fixture.org,
    fixture.workspace, privateRow.content_hash, privateRow.extracted_text_hash, privateRow.extracted_character_count]), /STUDIO_PRIVATE_SOURCE_OWNER_MISMATCH/);

  const sourceSet = fixed(344);
  const sourceSetVersion = fixed(345);
  const bundle = fixed(346);
  const bundleVersion = fixed(347);
  await db.query(`INSERT INTO public.enterprise_source_sets(id,org_id,workspace_id,owner_module,display_label,current_version,status,created_by)
    VALUES($1,$2,$3,'studio','Studio shared plus private',1,'locked',$4)`, [sourceSet, fixture.org, fixture.workspace, actor]);
  await db.query(`INSERT INTO public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by)
    VALUES($1,$2,$3,$4,1,'Studio shared and private exact set',$5,2,$6,'locked',$7)`, [sourceSetVersion, sourceSet,
    fixture.org, fixture.workspace, sha('studio-source-set'), Number(sharedRow.extracted_character_count) + Number(privateRow.extracted_character_count), actor]);
  for (const item of [
    { sourceVersionId: shared.sourceVersionId, sourceId: shared.sourceId, row: sharedRow, ordinal: 1, role: 'primary' },
    { sourceVersionId, sourceId, row: privateRow, ordinal: 2, role: 'supporting' },
  ]) await db.query(`INSERT INTO public.enterprise_source_set_version_items(source_set_version_id,source_set_id,source_version_id,source_id,
    org_id,workspace_id,ordinal,semantic_role,content_hash,extracted_text_hash,extracted_character_count)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [sourceSetVersion, sourceSet, item.sourceVersionId, item.sourceId,
    fixture.org, fixture.workspace, item.ordinal, item.role, item.row.content_hash, item.row.extracted_text_hash, item.row.extracted_character_count]);
  await db.query(`INSERT INTO public.enterprise_module_input_bundles(id,org_id,workspace_id,owner_module,current_version,created_by)
    VALUES($1,$2,$3,'studio',1,$4)`, [bundle, fixture.org, fixture.workspace, actor]);
  await db.query(`INSERT INTO public.enterprise_module_input_bundle_versions(id,input_bundle_id,org_id,workspace_id,version,bundle_hash,status,created_by)
    VALUES($1,$2,$3,$4,1,$5,'locked',$6)`, [bundleVersion, bundle, fixture.org, fixture.workspace, sha('studio-bundle'), actor]);
  await db.query(`INSERT INTO public.enterprise_module_input_bundle_items(input_bundle_version_id,input_bundle_id,org_id,workspace_id,ordinal,item_kind,
    source_set_version_id,source_set_id,resource_hash,declared_purpose) VALUES($1,$2,$3,$4,1,'source_set',$5,$6,$7,'Exact Studio extraction')`,
    [bundleVersion, bundle, fixture.org, fixture.workspace, sourceSetVersion, sourceSet, sha('studio-source-set')]);

  await db.query(`UPDATE public.ai_provider_configs SET last_validated_at=statement_timestamp(),budget_policy=$2::jsonb,status='active' WHERE id=$1`,
    [fixture.provider, JSON.stringify({ dailyRequests: 20, monthlyTokens: 100000 })]);
  const route = fixed(348);
  await db.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by)
    VALUES($1,$2,$3,$4,'studio.evidence.extract','fixture-model',true,ARRAY[$5::text],$6,$6)`,
    [route, fixture.org, fixture.workspace, fixture.provider, role, actor]);
  const bindings = [
    { ordinal: 1, sourceSetId: sourceSet, sourceSetVersionId: sourceSetVersion, sourceSetVersion: 1, sourceId: shared.sourceId, sourceVersionId: shared.sourceVersionId },
    { ordinal: 2, sourceSetId: sourceSet, sourceSetVersionId: sourceSetVersion, sourceSetVersion: 1, sourceId, sourceVersionId },
  ];

  const extractReceipt = await claim('studio.bundle.extract', 'studio-bundle-extract-001', sha('extract-request'));
  const job = fixed(349);
  const claimResult = (await one(db, `SELECT public.studio_claim_source_extraction_v1($1,$2,$3,1,$4::jsonb,$5,$6,'openai','fixture-model',
    'studio.evidence.extract','studio-evidence-extract-1',$7,$8,$9,$10,$11,$12,$13,$14) result`, [job, bundle, bundleVersion,
    JSON.stringify(bindings), route, fixture.provider, sha('extract-request'), actor, fixture.org, fixture.workspace, authorizationVersion,
    extractReceipt.id, extractReceipt.execution_token, extractReceipt.execution_fence])).result;
  assert.deepEqual(claimResult, { state: 'owned', ownsExecution: true, jobId: job });
  const reserve = (await one(db, `SELECT public.enterprise_ai_reserve_provider_budget($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai',
    'studio.evidence.extract','fixture-model',120,80) result`, [actor, fixture.org, fixture.workspace, authorizationVersion, extractReceipt.id,
    job, extractReceipt.execution_token, extractReceipt.execution_fence, route, fixture.provider])).result;
  assert.equal(reserve.state, 'reserved');
  assert.equal(reserve.ownsProviderEffect, true);
  const candidates = [
    { id: fixed(350), sourceId: shared.sourceId, sourceVersionId: shared.sourceVersionId, field: 'process_objective', value: 'Govern shared evidence', safeExcerpt: 'Govern shared evidence safely.', sourceLocator: 'normalized-text:v1:chars:0-30', confidence: 0.91, promptVersion: 'studio-evidence-extract-1', createdBy: actor },
    { id: fixed(351), sourceId, sourceVersionId, field: 'risks', value: 'Initial private risk', safeExcerpt: 'A private Studio risk requires review.', sourceLocator: 'normalized-text:v1:chars:0-40', confidence: 0.88, promptVersion: 'studio-evidence-extract-1', createdBy: actor },
    { id: fixed(352), sourceId, sourceVersionId, field: 'systems', value: 'Legacy private system', safeExcerpt: 'A private system may be rejected.', sourceLocator: 'normalized-text:v1:chars:41-80', confidence: 0.79, promptVersion: 'studio-evidence-extract-1', createdBy: actor },
  ];
  const stagedResult = { resourceId: job, jobId: job, status: 'staged', candidateCount: candidates.length };
  await db.query(`SELECT public.studio_stage_source_extraction_v1($1,$2::jsonb,$3,120,40,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
    [job, JSON.stringify(candidates), sha('provider-output'), JSON.stringify(stagedResult), actor, fixture.org, fixture.workspace,
      authorizationVersion, extractReceipt.id, extractReceipt.execution_token, extractReceipt.execution_fence]);
  const settled = (await one(db, `SELECT public.enterprise_ai_settle_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai',
    'studio.evidence.extract','fixture-model',$11,120,40,160) result`, [actor, fixture.org, fixture.workspace, authorizationVersion,
    extractReceipt.id, job, extractReceipt.execution_token, extractReceipt.execution_fence, route, fixture.provider, reserve.reservationId])).result;
  assert.equal(settled.state, 'settled');
  const committed = (await one(db, `SELECT public.studio_commit_source_extraction_v1($1,$2,$3,$4,$5,$6,$7,$8) result`,
    [job, actor, fixture.org, fixture.workspace, authorizationVersion, extractReceipt.id, extractReceipt.execution_token, extractReceipt.execution_fence])).result;
  assert.equal(committed.status, 'succeeded');
  assert.equal(await count(db, 'public.enterprise_ai_usage_ledger', 'WHERE job_id=$1', [job]), 1);

  const bindingRows = (await db.query(`SELECT id,source_version_id,source_set_id,source_set_version_id FROM public.studio_source_extraction_bindings
    WHERE job_id=$1 ORDER BY ordinal`, [job])).rows;
  assert.equal(bindingRows.length, 2);
  const decisions = [
    { candidate: candidates[0], binding: bindingRows[0], status: 'accepted', value: candidates[0].value, reason: '' },
    { candidate: candidates[1], binding: bindingRows[1], status: 'edited', value: 'Edited private risk with bounded rationale', reason: 'Corrected by the Studio source author.' },
    { candidate: candidates[2], binding: bindingRows[1], status: 'rejected', value: candidates[2].value, reason: 'Not relevant to this package.' },
  ];
  for (let index = 0; index < decisions.length; index += 1) {
    const item = decisions[index];
    const receipt = await claim('studio.candidate.review', `studio-candidate-review-00${index + 1}`, sha(`review-${index}`));
    const review = (await one(db, `SELECT public.studio_review_source_candidate_v1($1,1,$2,$3,$4,$5,1,$6,$7,1,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) result`,
      [item.candidate.id, job, item.binding.id, bundle, bundleVersion, sourceSet, sourceSetVersion, item.candidate.sourceId,
        item.candidate.sourceVersionId, item.status, item.value, item.reason, actor, fixture.org, fixture.workspace, authorizationVersion,
        receipt.id, receipt.execution_token, receipt.execution_fence])).result;
    assert.equal(review.status, item.status);
  }
  const edited = await one(db, `SELECT value,excerpt_hash,suggestion_status,version FROM public.enterprise_evidence_candidates WHERE id=$1`, [candidates[1].id]);
  assert.equal(edited.suggestion_status, 'edited');
  assert.equal(Number(edited.version), 2);
  const expectedEditedAnchor = (await one(db, `SELECT public.enterprise_evidence_excerpt_anchor_hash($1,$2,$3,$4,$5,$6) anchor`,
    [sourceVersionId, privateRow.content_hash, privateRow.extracted_text_hash, candidates[1].sourceLocator,
      candidates[1].safeExcerpt, decisions[1].value])).anchor;
  assert.equal(edited.excerpt_hash, expectedEditedAnchor);
  const manifest = (await one(db, `SELECT public.studio_pr_b_candidate_manifest($1,$2,$3) manifest`, [fixture.org, fixture.workspace, bundleVersion])).manifest;
  assert.equal(manifest.length, 2);
  assert.deepEqual(new Set(manifest.map(item => item.sourceVersionId)), new Set([shared.sourceVersionId, sourceVersionId]));
  assert.equal(manifest.some(item => item.candidateId === candidates[2].id), false);

  // Generic Assess authority cannot consume Studio-private source versions or
  // Studio-job candidates, including candidates derived from a shared source.
  const privateAssessJob = fixed(353);
  const jobsBeforeGeneric = await count(db, 'public.enterprise_ai_job_ledger');
  const providerEffectsBeforeGeneric = await count(db, 'public.enterprise_ai_effect_journal');
  const budgetReservationsBeforeGeneric = await count(db, 'public.enterprise_ai_budget_reservations');
  const providerUsageBeforeGeneric = await count(db, 'public.enterprise_ai_usage_ledger');
  const auditsBeforeGeneric = await count(db, 'public.privileged_audit_events');
  const genericExtractError = await expectedFailure(() => db.query(`INSERT INTO public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider_config_id,provider,
    model,prompt_key,prompt_version,source_refs,source_id,source_version_id,actor_id,request_id,idempotency_key,status,approval_state)
    VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai','fixture-model','assess.evidence.extract','generic-assess-1','[]'::jsonb,
    $5,$6,$7,$8,'generic-private-source-001','running','review_required')`, [privateAssessJob, fixture.org, fixture.workspace,
    fixture.provider, sourceId, sourceVersionId, fixture.requester, fixed(354)]), /ENTERPRISE_EVIDENCE_RESOURCE_NOT_FOUND/);
  assert.equal(await count(db, 'public.enterprise_ai_job_ledger', 'WHERE id=$1', [privateAssessJob]), 0);
  const genericReviewReceipt = await claim('evidence.candidate.review', 'generic-studio-review-001', sha('generic-studio-review'));
  const genericReviewReceiptBefore = await one(db, `SELECT status,response,resource_id FROM public.enterprise_ai_command_receipts WHERE id=$1`,
    [genericReviewReceipt.id]);
  const sharedStudioCandidateBefore = await one(db, `SELECT value,suggestion_status,version,provenance_hash FROM public.enterprise_evidence_candidates WHERE id=$1`, [candidates[0].id]);
  const genericReviewError = await expectedFailure(() => db.query(`SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,'accepted',$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [candidates[0].id, fixture.org, fixture.workspace, sharedStudioCandidateBefore.value, manifest.find(item => item.candidateId === candidates[0].id).anchorHash,
      fixture.reviewer, sharedStudioCandidateBefore.value, 'Generic review must not cross Studio lineage.', genericReviewReceipt.id,
      genericReviewReceipt.execution_token, genericReviewReceipt.execution_fence, JSON.stringify({ resourceId: candidates[0].id })]),
  /ENTERPRISE_EVIDENCE_RESOURCE_NOT_FOUND/);
  const sharedStudioCandidateAfter = await one(db,
    `SELECT value,suggestion_status,version,provenance_hash FROM public.enterprise_evidence_candidates WHERE id=$1`, [candidates[0].id]);
  assert.deepEqual(sharedStudioCandidateAfter, sharedStudioCandidateBefore);
  const genericReviewReceiptAfter = await one(db,
    `SELECT status,response,resource_id FROM public.enterprise_ai_command_receipts WHERE id=$1`, [genericReviewReceipt.id]);
  assert.deepEqual(genericReviewReceiptAfter, genericReviewReceiptBefore);
  const promotionsBefore = await count(db, 'public.enterprise_evidence_assess_promotions');
  const genericPromoteError = await expectedFailure(() => db.query(`INSERT INTO public.enterprise_evidence_assess_promotions(id,org_id,workspace_id,candidate_id,source_id,
    source_version_id,assess_case_id,assess_case_version_id,assess_case_version,candidate_version,candidate_provenance_hash,field_key,promoted_by,
    assess_evidence_link_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11,$12,$13)`, [fixed(355), fixture.org, fixture.workspace,
    candidates[0].id, shared.sourceId, shared.sourceVersionId, fixed(356), fixed(357), sharedStudioCandidateBefore.version,
    sharedStudioCandidateBefore.provenance_hash, candidates[0].field, fixture.reviewer, fixed(358)]),
  /ENTERPRISE_EVIDENCE_RESOURCE_NOT_FOUND/);
  assert.equal(await count(db, 'public.enterprise_evidence_assess_promotions'), promotionsBefore);
  assert.equal(await count(db, 'public.enterprise_ai_effect_journal'), providerEffectsBeforeGeneric);
  const genericDenialStatus = error => String(error?.message ?? error).match(/ENTERPRISE_EVIDENCE_RESOURCE_NOT_FOUND/)?.[0];
  const genericAssessCommandDenials = [
    { commandType: 'evidence.extract', status: genericDenialStatus(genericExtractError) },
    { commandType: 'evidence.candidate.review', status: genericDenialStatus(genericReviewError) },
    { commandType: 'evidence.assess.promote', status: genericDenialStatus(genericPromoteError) },
  ];
  assert.deepEqual(genericAssessCommandDenials.map(item => item.status), [
    'ENTERPRISE_EVIDENCE_RESOURCE_NOT_FOUND',
    'ENTERPRISE_EVIDENCE_RESOURCE_NOT_FOUND',
    'ENTERPRISE_EVIDENCE_RESOURCE_NOT_FOUND',
  ]);
  const genericAssessSideEffects = {
    jobRowsCreated: (await count(db, 'public.enterprise_ai_job_ledger')) - jobsBeforeGeneric,
    candidateRowsMutated: JSON.stringify(sharedStudioCandidateAfter) === JSON.stringify(sharedStudioCandidateBefore) ? 0 : 1,
    promotionRowsCreated: (await count(db, 'public.enterprise_evidence_assess_promotions')) - promotionsBefore,
    commandReceiptRowsMutated: JSON.stringify(genericReviewReceiptAfter) === JSON.stringify(genericReviewReceiptBefore) ? 0 : 1,
    providerEffectRowsCreated: (await count(db, 'public.enterprise_ai_effect_journal')) - providerEffectsBeforeGeneric,
    budgetReservationRowsCreated: (await count(db, 'public.enterprise_ai_budget_reservations')) - budgetReservationsBeforeGeneric,
    providerUsageRowsCreated: (await count(db, 'public.enterprise_ai_usage_ledger')) - providerUsageBeforeGeneric,
    privilegedAuditRowsCreated: (await count(db, 'public.privileged_audit_events')) - auditsBeforeGeneric,
  };
  assert.deepEqual(genericAssessSideEffects, {
    jobRowsCreated: 0,
    candidateRowsMutated: 0,
    promotionRowsCreated: 0,
    commandReceiptRowsMutated: 0,
    providerEffectRowsCreated: 0,
    budgetReservationRowsCreated: 0,
    providerUsageRowsCreated: 0,
    privilegedAuditRowsCreated: 0,
  });

  const genericReviewedOnly = fixed(359);
  await db.query(`INSERT INTO public.enterprise_evidence_candidates(id,source_id,source_version_id,org_id,workspace_id,field_key,value,safe_excerpt,
    excerpt_hash,provenance_hash,version,source_locator,confidence,ai_job_id,prompt_version,suggestion_status,created_by,reviewed_by,reviewed_at)
    SELECT $1,source_id,source_version_id,org_id,workspace_id,'completion','Generic reviewed-only candidate',safe_excerpt,excerpt_hash,
    provenance_hash,1,'normalized-text:v1:chars:81-100',0.5,ai_job_id,prompt_version,'accepted',created_by,$2,statement_timestamp()
    FROM public.enterprise_evidence_candidates WHERE id=$3`, [genericReviewedOnly, fixture.reviewer, candidates[1].id]);
  const decisionOwnedManifest = (await one(db, `SELECT public.studio_pr_b_candidate_manifest($1,$2,$3) manifest`,
    [fixture.org, fixture.workspace, bundleVersion])).manifest;
  assert.equal(decisionOwnedManifest.some(item => item.candidateId === genericReviewedOnly), false);
  assert.equal(decisionOwnedManifest.length, 2);

  // Create the actual immutable planning-only package through the public RPC,
  // prove exact receipt/audit/replay, then prove new ancestry is denied while
  // the feature is off but the committed package remains readable/replayable.
  const packageArtifact = fixed(370);
  const packageId = fixed(371);
  const packageCommand = {
    actorId: packageActor, organizationId: fixture.org, workspaceId: fixture.workspace, artifactId: packageArtifact,
    sourcePackageId: packageId, requestId: fixed(372), idempotencyKey: 'studio-source-package-001',
    authorizationVersion: packageAuthorizationVersion,
    payload: { sourceMode: 'direct_transcript_bundle', artifactType: 'pdd', studioInputBundleId: bundle,
      studioInputBundleVersionId: bundleVersion, studioInputBundleVersion: 1 },
  };
  const packageResult = (await one(db, `SELECT public.studio_artifact_source_package_create($1::jsonb) result`,
    [JSON.stringify(packageCommand)])).result;
  assert.equal(packageResult.outcome, 'committed');
  assert.equal(packageResult.planningOnly, true);
  const storedPackage = await one(db, `SELECT candidate_manifest,candidate_manifest_hash,candidate_count,planning_only,lineage_classification
    FROM public.studio_artifact_source_packages WHERE id=$1`, [packageId]);
  assert.deepEqual(storedPackage.candidate_manifest, decisionOwnedManifest);
  assert.equal(storedPackage.candidate_manifest_hash, (await one(db,
    `SELECT public.enterprise_sha256_jsonb($1::jsonb) hash`, [JSON.stringify(decisionOwnedManifest)])).hash);
  assert.equal(Number(storedPackage.candidate_count), 2);
  assert.equal(storedPackage.planning_only, true);
  assert.equal(storedPackage.lineage_classification, 'not_assessed');
  const packageReceipt = await one(db, `SELECT status,response,resource_id FROM public.studio_artifact_command_receipts
    WHERE org_id=$1 AND actor_id=$2 AND command_type='studio.source-package.create' AND idempotency_key=$3`,
  [fixture.org, packageActor, packageCommand.idempotencyKey]);
  assert.equal(packageReceipt.status, 'committed');
  assert.equal(packageReceipt.resource_id, packageArtifact);
  assert.equal(packageReceipt.response.sourcePackageId, packageId);
  assert.equal(await count(db, 'public.privileged_audit_events', `WHERE actor_id=$1 AND action='studio.source-package.create' AND resource_id=$2`,
    [packageActor, packageArtifact]), 1);
  const packageProjectionBeforeDisable = (await asAuthenticated(db, packageActor,
    `SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`, [fixture.org, fixture.workspace, packageArtifact])).rows[0].projection;
  assert.equal(packageProjectionBeforeDisable.sourcePackageId, packageId);
  await db.query(`UPDATE public.enterprise_transcript_workspace_flags SET studio_source_integration_enabled=false,updated_by=$3
    WHERE org_id=$1 AND workspace_id=$2`, [fixture.org, fixture.workspace, packageActor]);
  const packageReplay = (await one(db, `SELECT public.studio_artifact_source_package_create($1::jsonb) result`,
    [JSON.stringify(packageCommand)])).result;
  assert.equal(packageReplay.outcome, 'replayed');
  assert.equal(packageReplay.sourcePackageHash, packageResult.sourcePackageHash);
  assert.deepEqual((await asAuthenticated(db, packageActor, `SELECT public.studio_artifact_source_package_projection($1,$2,$3) projection`,
    [fixture.org, fixture.workspace, packageArtifact])).rows[0].projection, packageProjectionBeforeDisable);
  const packagesBeforeDisabled = await count(db, 'public.studio_artifact_source_packages');
  const receiptsBeforeDisabled = await count(db, 'public.studio_artifact_command_receipts');
  const disabledPackageError = await expectedFailure(() => db.query(`SELECT public.studio_artifact_source_package_create($1::jsonb)`, [JSON.stringify({
    ...packageCommand, artifactId: fixed(373), sourcePackageId: fixed(374), requestId: fixed(375), idempotencyKey: 'studio-source-package-disabled-001',
  })]), /STUDIO_FEATURE_DISABLED/);
  assert.equal(await count(db, 'public.studio_artifact_source_packages'), packagesBeforeDisabled);
  assert.equal(await count(db, 'public.studio_artifact_command_receipts'), receiptsBeforeDisabled);
  const packageEvidence = {
    packageArtifact, packageId, packageActor, planningOnly: storedPackage.planning_only,
    candidateManifestCount: Number(storedPackage.candidate_count), packageOutcome: packageResult.outcome,
    packageReceiptStatus: packageReceipt.status, replayOutcome: packageReplay.outcome,
    disabledAttemptStatus: String(disabledPackageError?.message ?? disabledPackageError).match(/STUDIO_FEATURE_DISABLED/)?.[0],
    featureEnabledDuringDisabledAttempt: false,
    committedPackageRows: await count(db, 'public.studio_artifact_source_packages', 'WHERE id=$1', [packageId]),
    committedReceiptRows: await count(db, 'public.studio_artifact_command_receipts',
      `WHERE actor_id=$1 AND command_type='studio.source-package.create' AND idempotency_key=$2`, [packageActor, packageCommand.idempotencyKey]),
    committedAuditRows: await count(db, 'public.privileged_audit_events', `WHERE actor_id=$1 AND action='studio.source-package.create' AND resource_id=$2`,
      [packageActor, packageArtifact]),
    disabledNewPackageRows: (await count(db, 'public.studio_artifact_source_packages')) - packagesBeforeDisabled,
    disabledNewPackageReceiptRows: (await count(db, 'public.studio_artifact_command_receipts')) - receiptsBeforeDisabled,
  };
  await db.query(`UPDATE public.enterprise_transcript_workspace_flags SET studio_source_integration_enabled=true,updated_by=$3
    WHERE org_id=$1 AND workspace_id=$2`, [fixture.org, fixture.workspace, actor]);

  // Wrong scope fails before any provider budget or extraction side effect.
  const runsBeforeWrongScope = await count(db, 'public.studio_source_extraction_runs');
  await expectedFailure(() => db.query(`SELECT public.studio_source_create_preflight_v1($1,$2,$3,$4,$5,$6,$7)`,
    [actor, fixture.org, fixed(999), authorizationVersion, sourceReceipt.id, sourceReceipt.execution_token, sourceReceipt.execution_fence]),
  /ENTERPRISE_AI_STALE_EXECUTION_FENCE|PR1B_NOT_FOUND/);
  assert.equal(await count(db, 'public.studio_source_extraction_runs'), runsBeforeWrongScope);

  const lifecycle = async (suffix, transition) => {
    const receipt = await claim('studio.bundle.extract', `studio-budget-${suffix}-001`, sha(`budget-${suffix}`));
    const lifecycleJob = fixed(360 + (suffix === 'release' ? 0 : 1));
    await db.query(`SELECT public.studio_claim_source_extraction_v1($1,$2,$3,1,$4::jsonb,$5,$6,'openai','fixture-model',
      'studio.evidence.extract','studio-evidence-extract-1',$7,$8,$9,$10,$11,$12,$13,$14)`, [lifecycleJob, bundle, bundleVersion,
      JSON.stringify(bindings), route, fixture.provider, sha(`budget-${suffix}`), actor, fixture.org, fixture.workspace, authorizationVersion,
      receipt.id, receipt.execution_token, receipt.execution_fence]);
    const reservation = (await one(db, `SELECT public.enterprise_ai_reserve_provider_budget($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai',
      'studio.evidence.extract','fixture-model',20,20) result`, [actor, fixture.org, fixture.workspace, authorizationVersion, receipt.id,
      lifecycleJob, receipt.execution_token, receipt.execution_fence, route, fixture.provider])).result;
    return transition({ receipt, job: lifecycleJob, reservation });
  };
  await lifecycle('release', async ({ receipt, job: lifecycleJob, reservation }) => {
    const released = (await one(db, `SELECT public.enterprise_ai_release_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai',
      'studio.evidence.extract','fixture-model',$11,'before_provider_effect') result`, [actor, fixture.org, fixture.workspace, authorizationVersion,
      receipt.id, lifecycleJob, receipt.execution_token, receipt.execution_fence, route, fixture.provider, reservation.reservationId])).result;
    assert.equal(released.state, 'released');
    const replay = (await one(db, `SELECT public.enterprise_ai_release_provider_budget_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai',
      'studio.evidence.extract','fixture-model',$11,'before_provider_effect') result`, [actor, fixture.org, fixture.workspace, authorizationVersion,
      receipt.id, lifecycleJob, receipt.execution_token, receipt.execution_fence, route, fixture.provider, reservation.reservationId])).result;
    assert.equal(replay.replayed, true);
  });
  let uncertainLineage;
  await lifecycle('uncertain', async ({ receipt, job: lifecycleJob, reservation }) => {
    const uncertain = (await one(db, `SELECT public.enterprise_ai_mark_provider_budget_uncertain_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai',
      'studio.evidence.extract','fixture-model',$11,'transport_timeout') result`, [actor, fixture.org, fixture.workspace, authorizationVersion,
      receipt.id, lifecycleJob, receipt.execution_token, receipt.execution_fence, route, fixture.provider, reservation.reservationId])).result;
    assert.equal(uncertain.state, 'uncertain');
    const failed = (await one(db, `SELECT public.studio_fail_source_extraction_v1($1,'PROVIDER_RESPONSE_LOST',$2,$3,$4,$5,$6,$7,$8) result`,
      [lifecycleJob, actor, fixture.org, fixture.workspace, authorizationVersion, receipt.id, receipt.execution_token, receipt.execution_fence])).result;
    assert.equal(failed.status, 'uncertain');
    assert.equal(await count(db, 'public.enterprise_ai_usage_ledger', 'WHERE job_id=$1', [lifecycleJob]), 0);
    uncertainLineage = { receiptId: receipt.id, extractionJobId: lifecycleJob, reservationId: reservation.reservationId,
      recoveryState: failed.status, providerUsageRows: 0 };
  });

  // A workspace that has any campaign history never falls back to the generic
  // Studio extraction budget path. The effective renewal window is recognized,
  // but this unapproved capability/route remains denied before provider effect.
  const campaignTarget = fixed(380);
  const campaignStudioRoute = fixed(381);
  const campaignId = fixed(382);
  const campaignRenewal = fixed(383);
  const projectRef = 'abcdefghijklmnopqrst';
  const targetFingerprint = `sha256:${'d'.repeat(64)}`;
  await db.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,
    allowed_roles,created_by,updated_by) VALUES($1,$2,$3,$4,'studio.document.generate','gpt-4.1-mini-2025-04-14',true,
    ARRAY[$5::text],$6,$6)`, [campaignStudioRoute, fixture.org, fixture.workspace, fixture.provider, packageRole, packageActor]);
  await db.query(`INSERT INTO public.synthetic_admin_targets(id,target_fingerprint,org_id,workspace_id,operator_actor_id,
    organization_member_role_id,environment_class,enabled) VALUES($1,$2,$3,$4,$5,$6,'hosted_nonproduction_pilot',true)`,
  [campaignTarget, targetFingerprint, fixture.org, fixture.workspace, packageActor, orgRole]);
  await db.query(`INSERT INTO public.synthetic_ai_campaign_authorities(id,target_id,target_fingerprint,project_ref,server_host,
    local_carry_seal_digest,org_id,workspace_id,operator_actor_id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour')`,
  [campaignId, campaignTarget, targetFingerprint, projectRef, `${projectRef}.supabase.co`, `sha256:${'e'.repeat(64)}`, fixture.org,
    fixture.workspace, packageActor, fixture.provider, fixture.keyRef, legacyRoute, campaignStudioRoute]);
  await db.query(`INSERT INTO public.synthetic_ai_campaign_renewals(id,campaign_id,renewed_by,authorization_version,target_fingerprint,
    project_ref,server_host,org_id,workspace_id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,binding_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,statement_timestamp(),statement_timestamp()+interval '5 minutes')`,
  [campaignRenewal, campaignId, packageActor, packageAuthorizationVersion, targetFingerprint, projectRef, `${projectRef}.supabase.co`, fixture.org,
    fixture.workspace, fixture.provider, fixture.keyRef, legacyRoute, campaignStudioRoute, `sha256:${'f'.repeat(64)}`]);
  const campaignReceipt = await claim('studio.bundle.extract', 'studio-campaign-fallback-001', sha('campaign-fallback'));
  const campaignJob = fixed(384);
  await db.query(`SELECT public.studio_claim_source_extraction_v1($1,$2,$3,1,$4::jsonb,$5,$6,'openai','fixture-model',
    'studio.evidence.extract','studio-evidence-extract-1',$7,$8,$9,$10,$11,$12,$13,$14)`, [campaignJob, bundle, bundleVersion,
    JSON.stringify(bindings), route, fixture.provider, sha('campaign-fallback'), actor, fixture.org, fixture.workspace, authorizationVersion,
    campaignReceipt.id, campaignReceipt.execution_token, campaignReceipt.execution_fence]);
  const reservationsBeforeCampaign = await count(db, 'public.enterprise_ai_budget_reservations');
  const usageBeforeCampaign = await count(db, 'public.enterprise_ai_usage_ledger');
  const effectsBeforeCampaign = await count(db, 'public.enterprise_ai_effect_journal');
  await expectedFailure(() => db.query(`SELECT public.enterprise_ai_reserve_provider_budget($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai',
    'studio.evidence.extract','fixture-model',20,20)`, [actor, fixture.org, fixture.workspace, authorizationVersion, campaignReceipt.id,
    campaignJob, campaignReceipt.execution_token, campaignReceipt.execution_fence, route, fixture.provider]),
  /SYNTHETIC_AI_CAMPAIGN_BUDGET_BINDING_INVALID/);
  assert.equal(await count(db, 'public.enterprise_ai_budget_reservations'), reservationsBeforeCampaign);
  assert.equal(await count(db, 'public.enterprise_ai_usage_ledger'), usageBeforeCampaign);
  assert.equal(await count(db, 'public.enterprise_ai_effect_journal'), effectsBeforeCampaign);

  marker('STUDIO-TR-003', 'studio-source-postgres-package-manifest', {
    actorId: actor, organizationId: fixture.org, workspaceId: fixture.workspace, inputBundleId: bundle,
    inputBundleVersionId: bundleVersion, sourceSetVersionId: sourceSetVersion, sourceVersionId,
    extractionJobId: job, acceptedCandidateCount: manifest.length, sharedSourceVersionId: shared.sourceVersionId,
    privateSourceVersionId: sourceVersionId, rejectedCandidateId: candidates[2].id, ...packageEvidence,
    genericAssessCommandDenials, genericAssessSideEffects,
  }, [{ id: packageActor, state: 'active', capabilities: ['studio.artifacts.generate', 'studio.artifacts.read'] }]);
  marker('IDEMP-002-B', 'studio-source-postgres-budget-uncertain-recovery', {
    actorId: actor, organizationId: fixture.org, workspaceId: fixture.workspace, ...uncertainLineage,
  });
  console.log('studio source PostgreSQL scenarios passed');
} finally {
  if (db) await db.end().catch(() => undefined);
  if (admin) {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [databaseName]).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`).catch(() => undefined);
    for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}
