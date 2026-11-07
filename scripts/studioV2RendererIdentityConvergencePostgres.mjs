import assert from 'node:assert/strict';
import {
  applyMigrations,
  bootstrapAuth,
  connect,
  createDatabase,
  dropDatabase,
  ensureClusterRoles,
  migrationNames,
} from './pilotOperationsPostgresSupport.mjs';

const adminUrl = process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL;
if (!adminUrl) throw new Error('ENTERPRISE_LIFECYCLE_DATABASE_URL is required.');
const migration = '20261106045007_studio_v2_renderer_identity_convergence.sql';
const migrationIndex = migrationNames.indexOf(migration);
assert.ok(migrationIndex > 0, 'identity convergence migration must be ordered');
const databaseName = `studio_v2_identity_${process.pid}`;
const admin = await connect(adminUrl);
let database;

const routines = [
  'process_evidence_renew_provider_run_after_use(uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint)',
  'process_evidence_resume_provider_run(uuid,uuid,uuid,bigint,text,text,uuid,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)',
  'synthetic_ai_campaign_activate_final_continuation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer)',
  'synthetic_ai_campaign_bootstrap(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid,uuid,uuid,timestamptz)',
  'pr_c_controlled_human_assert_marker()',
  'synthetic_ai_campaign_activate_brd_v3_quality_validation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,text,text,integer)',
  'authenticated_synthetic_local_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)',
  'authenticated_synthetic_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)',
  'enterprise_provider_secret_write(uuid,uuid,bigint,uuid,uuid,text,text,text,text)',
  'enterprise_provider_secret_resolve(uuid,uuid,text,text,text)',
  'enterprise_provider_secret_resolve_for_receipt(uuid,uuid,bigint,uuid,uuid,text,text,text)',
  'enterprise_provider_secret_observe(uuid,uuid,uuid,text,text)',
  'enterprise_provider_secret_inventory(uuid,uuid)',
  'enterprise_provider_secret_delete_for_receipt(uuid,uuid,bigint,uuid,uuid,text,text,text)',
  'enterprise_provider_secret_delete_for_cleanup(uuid,uuid,bigint,uuid,uuid,text,text,text)',
];
const metadata = async db => (await db.query(
  `SELECT p.oid::regprocedure::text identity,pg_get_userbyid(p.proowner) owner,
    p.prosecdef,p.proleakproof,p.proisstrict,p.provolatile::text,p.proparallel::text,
    p.proconfig,COALESCE(p.proacl::text,'') acl
   FROM pg_proc p
   WHERE p.oid = ANY($1::regprocedure[])
   ORDER BY identity`,
  [routines.map(identity => `public.${identity}`)],
)).rows;
const definition = async (db, identity) => (await db.query(
  'SELECT pg_get_functiondef($1::regprocedure) source',
  [`public.${identity}`],
)).rows[0].source.replaceAll('\r\n', '\n');

try {
  await ensureClusterRoles(admin);
  database = await createDatabase(admin, adminUrl, databaseName);
  await bootstrapAuth(database);
  await database.query('ALTER TABLE auth.users ADD COLUMN email text');
  await applyMigrations(database, migrationNames.slice(0, migrationIndex));

  const markerBefore = (await database.query(
    'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton',
  )).rows[0].migration_tip;
  assert.equal(markerBefore, '20261106040803');
  const metadataBefore = await metadata(database);
  assert.equal(metadataBefore.length, routines.length);
  for (const identity of routines) {
    const source = await definition(database, identity);
    assert.equal((source.match(/20261106020001/gu) ?? []).length, 1, identity);
    assert.equal(source.includes('20261106045007'), false, identity);
  }

  const actor = 'a1000000-0000-4000-8000-000000000001';
  const org = 'a1000000-0000-4000-8000-000000000002';
  const workspace = 'a1000000-0000-4000-8000-000000000003';
  const providerConfig = 'a1000000-0000-4000-8000-000000000004';
  const keyRef = 'a1000000-0000-4000-8000-000000000005';
  const assessRoute = 'a1000000-0000-4000-8000-000000000006';
  const studioRoute = 'a1000000-0000-4000-8000-000000000007';
  const fingerprint = `sha256:${'b'.repeat(64)}`;
  const projectRef = 'abcdefghijklmnopqrst';
  await database.query(
    "SELECT set_config('request.headers',$1,false)",
    [JSON.stringify({ host: `${projectRef}.supabase.co` })],
  );
  await database.query(
    'INSERT INTO auth.users(id,email) VALUES($1,$2)',
    [actor, 'identity-operator@avalaos.invalid'],
  );
  const target = (await database.query(
    'SELECT public.synthetic_admin_bootstrap_operator($1::uuid,$2::uuid,$3::uuid,$4::text) value',
    [actor, org, workspace, fingerprint],
  )).rows[0].value;
  assert.equal(target.status, 'configured');
  const authorizationVersion = Number((await database.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
    [org, actor],
  )).rows[0].version);
  const bootstrapSql = `SELECT public.synthetic_ai_campaign_bootstrap(
    $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::text,$8::text,
    $9::uuid,$10::uuid,$11::uuid,$12::uuid,$13::timestamptz
  ) value`;
  const bootstrapArgs = [
    actor, org, workspace, authorizationVersion, fingerprint, projectRef,
    `sha256:${'c'.repeat(64)}`,
    `AVALA_PROVIDER_SECRET_OPENAI_${org.replaceAll('-', '').toUpperCase()}_QA`,
    providerConfig, keyRef, assessRoute, studioRoute,
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  ];
  await assert.rejects(
    database.query(bootstrapSql, bootstrapArgs),
    error => error?.message === 'SYNTHETIC_AI_CAMPAIGN_TARGET_NOT_EMPTY',
  );
  assert.equal(Number((await database.query(
    'SELECT count(*) n FROM public.synthetic_ai_campaign_authorities',
  )).rows[0].n), 0);

  const substitutedIdentity = routines[3];
  const originalDefinition = await definition(database, substitutedIdentity);
  const substitutedDefinition = originalDefinition.replace(
    '20261106020001',
    '20261106012003',
  );
  assert.notEqual(substitutedDefinition, originalDefinition);
  await database.query(substitutedDefinition);
  await assert.rejects(
    applyMigrations(database, [migration]),
    /STUDIO_V2_RENDERER_FUNCTION_SOURCE_MISMATCH/u,
  );
  assert.equal((await database.query(
    'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton',
  )).rows[0].migration_tip, '20261106040803');
  await database.query(originalDefinition);

  await applyMigrations(database, [migration]);
  assert.equal((await database.query(
    'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton',
  )).rows[0].migration_tip, '20261106045007');
  assert.deepEqual(await metadata(database), metadataBefore);
  for (const identity of routines) {
    const source = await definition(database, identity);
    assert.equal(source.includes('20261106020001'), false, identity);
    assert.equal((source.match(/20261106045007/gu) ?? []).length, 1, identity);
  }

  const bootstrapped = (await database.query(bootstrapSql, bootstrapArgs)).rows[0].value;
  assert.equal(bootstrapped.status, 'enabled');
  assert.equal(bootstrapped.providerConfigId, providerConfig);
  assert.equal(Number((await database.query(
    'SELECT count(*) n FROM public.synthetic_ai_campaign_authorities',
  )).rows[0].n), 1);
  const disposition = (await database.query(
    `SELECT production_authorized,customer_data_authorized,real_provider_calls_authorized
     FROM public.hosted_pilot_environment_identity WHERE singleton`,
  )).rows[0];
  assert.deepEqual(disposition, {
    production_authorized: false,
    customer_data_authorized: false,
    real_provider_calls_authorized: false,
  });
  console.log('studio V2 identity convergence PostgreSQL: original bootstrap failure, source guard, authority preservation and corrected bootstrap passed');
} finally {
  if (database) await database.end();
  await dropDatabase(admin, databaseName);
  await admin.end();
}
