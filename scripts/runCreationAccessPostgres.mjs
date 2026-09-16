import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {approvedFullChainTip} from './prCMigrationTailContract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const runId = randomUUID();
const name = `avalaos-creation-access-${runId}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const report = { schemaVersion: 1, runId, kind: 'disposable-postgresql-16', status: 'running', migrations: [], scenarios: [], cleanup: 'not_started' };
const artifactDir = join(root, 'output/creation-access', `postgres-${runId}`);
await mkdir(artifactDir, { recursive: true });
let containerId;
let admin;
const clients = [];
const sanitize = value => String(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[synthetic-id]').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[local-database]');
const connect = async connectionString => { const c = new pg.Client({ connectionString, connectionTimeoutMillis: 2500 }); await c.connect(); clients.push(c); return c; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const child = (script, env) => new Promise((resolveResult, reject) => {
  const proc = spawn(process.execPath, [script], { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  proc.stdout.on('data', data => { stdout += data; });
  proc.stderr.on('data', data => { stderr += data; });
  const timeout = setTimeout(() => proc.kill(), 180_000);
  proc.once('error', reject);
  proc.once('close', async code => {
    clearTimeout(timeout);
    const output = sanitize(stdout + stderr);
    await writeFile(join(artifactDir, `${script.split('/').at(-1)}.log`), output);
    console.log(output.trim());
    report.scenarios.push({ command: [process.execPath, script], exitCode: code, status: code === 0 ? 'passed' : 'failed', outputSha256: createHash('sha256').update(output).digest('hex') });
    if (code !== 0) reject(new Error(`LOCAL_POSTGRES_SCENARIO_FAILED:${script}`)); else resolveResult();
  });
});

try {
  // Existing local image only. No pull, bind mount, persistent volume, remote DB
  // override, production connection, or pruning is supported by this runner.
  docker('image', 'inspect', 'postgres:16-alpine');
  containerId = docker('run', '-d', '--name', name, '--label', `avalaos.creation-access-run=${runId}`,
    '--pull=never', '--memory=1g', '--memory-swap=1g', '--cpus=1', '--pids-limit=128',
    '--log-opt', 'max-size=1m', '--log-opt', 'max-file=1',
    '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:16-alpine');
  assert.match(containerId, /^[0-9a-f]{64}$/);
  const inspect = JSON.parse(docker('inspect', containerId))[0];
  assert.equal(inspect.Config.Labels['avalaos.creation-access-run'], runId);
  const published = inspect.NetworkSettings.Ports['5432/tcp'];
  assert.equal(published.length, 1); assert.equal(published[0].HostIp, '127.0.0.1');
  const url = new URL(`postgresql://postgres@127.0.0.1:${published[0].HostPort}/postgres`);
  for (let attempt = 0; attempt < 30; attempt++) {
    try { admin = await connect(url.toString()); break; } catch { await wait(1000); }
  }
  if (!admin) throw new Error('LOCAL_POSTGRES_STARTUP_UNCONFIRMED');
  assert.match((await admin.query('SHOW server_version')).rows[0].server_version, /^16\./);
  await admin.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS');
  const migrations = (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql')).sort();
  assert.equal(approvedFullChainTip(migrations), '20260916181916');
  const creationStart = migrations.indexOf('20260915142940_creation_access_process_authority.sql');
  const oldConvergenceIndex = migrations.indexOf('20260916003000_creation_access_migration_identity_convergence.sql');
  const mappingIndex = migrations.indexOf('20260916083814_assess_supporting_document_mapping.sql');
  const mappingConvergenceIndex = migrations.indexOf('20260916151050_assess_document_mapping_identity_convergence.sql');
  const xlsxCorrectionIndex = migrations.indexOf('20260916181916_assess_document_xlsx_ingestion_authority.sql');
  assert.ok(creationStart > 0);
  assert.deepEqual([oldConvergenceIndex, mappingIndex, mappingConvergenceIndex, xlsxCorrectionIndex],
    [creationStart + 2, creationStart + 3, creationStart + 4, creationStart + 5]);
  assert.equal(xlsxCorrectionIndex, migrations.length - 1);
  const apply = async (db, files) => {
    for (const file of files) {
      const sql = await readFile(join('supabase/migrations', file), 'utf8');
      await db.query('BEGIN');
      try { await db.query(sql); await db.query('COMMIT'); }
      catch (error) { await db.query('ROLLBACK'); console.error(`Migration failed: ${file}; SQLSTATE ${error.code ?? 'unknown'}`); throw error; }
      if (!report.migrations.some(row => row.path === file)) report.migrations.push({ path: file, sha256: createHash('sha256').update(sql).digest('hex') });
    }
  };
  const createDb = async suffix => {
    const dbName = `avalaos_creation_access_${suffix}`;
    await admin.query(`CREATE DATABASE ${dbName}`);
    const dbUrl = new URL(url); dbUrl.pathname = `/${dbName}`;
    const db = await connect(dbUrl.toString());
    await db.query(`CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb NOT NULL DEFAULT '{}',banned_until timestamptz,email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    return { db, dbUrl };
  };
  const assertFinalIdentity = async db => {
    assert.deepEqual((await db.query(`SELECT product_key,environment_class,schema_contract,migration_tip,
      production_authorized,customer_data_authorized,real_provider_calls_authorized
      FROM hosted_pilot_environment_identity WHERE singleton`)).rows[0], {
      product_key: 'avalaos-core', environment_class: 'hosted_nonproduction_pilot', schema_contract: 'hosted-pilot-2026-08',
      migration_tip: '20260916181916', production_authorized: false, customer_data_authorized: false,
      real_provider_calls_authorized: false,
    });
    assert.equal((await db.query(`SELECT pg_get_expr(conbin,conrelid,false) expression FROM pg_constraint
      WHERE conrelid='hosted_pilot_environment_identity'::regclass
        AND conname='hosted_pilot_environment_identity_migration_tip_check'`)).rows[0].expression,
      "(migration_tip = '20260916181916'::text)");
  };
  const processDb = await createDb('process');
  await apply(processDb.db, migrations);
  await assertFinalIdentity(processDb.db);
  console.log(`Fresh PostgreSQL 16 migration chain applied: ${migrations.length} migrations.`);
  await child('scripts/testProcessCreationPostgres.mjs', { PROCESS_CREATION_DISPOSABLE_DATABASE_URL: processDb.dbUrl.toString() });
  const adminDb = await createDb('admin');
  await apply(adminDb.db, migrations);
  await assertFinalIdentity(adminDb.db);
  await child('scripts/testSyntheticAdminPostgres.mjs', { SYNTHETIC_ADMIN_DISPOSABLE_DATABASE_URL: adminDb.dbUrl.toString() });

  const upgrade = await createDb('upgrade');
  await apply(upgrade.db, migrations.slice(0, creationStart));
  const ids = Array.from({ length: 4 }, () => randomUUID());
  await upgrade.db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [ids[0], 'retained@example.invalid']);
  await upgrade.db.query('INSERT INTO profiles(id,email) VALUES($1,$2)', [ids[0], 'retained@example.invalid']);
  await upgrade.db.query('INSERT INTO organizations(id,name,slug) VALUES($1,$2,$3)', [ids[1], 'Retained synthetic organization', 'retained-synthetic']);
  await upgrade.db.query('INSERT INTO workspaces(id,org_id,name,slug) VALUES($1,$2,$3,$4)', [ids[2], ids[1], 'Retained workspace', 'retained']);
  await upgrade.db.query(`INSERT INTO assess_processes(id,org_id,workspace_id,owner_id,name,description,department,criticality,status)
    VALUES($1,$2,$3,$4,'Retained process','Unchanged','Synthetic','Medium','Not Started')`, [ids[3], ids[1], ids[2], ids[0]]);
  const retained = async () => (await upgrade.db.query('SELECT id,org_id,workspace_id,owner_id,name,description,department,criticality,status FROM assess_processes WHERE id=$1', [ids[3]])).rows[0];
  const before = await retained();
  const oldConvergenceName = migrations[oldConvergenceIndex];
  const mappingName = migrations[mappingIndex];
  const mappingConvergenceName = migrations[mappingConvergenceIndex];
  const xlsxCorrectionName = migrations[xlsxCorrectionIndex];
  const oldConvergenceSql = await readFile(join('supabase/migrations', oldConvergenceName), 'utf8');
  const mappingConvergenceSql = await readFile(join('supabase/migrations', mappingConvergenceName), 'utf8');
  const xlsxCorrectionSql = await readFile(join('supabase/migrations', xlsxCorrectionName), 'utf8');
  const rejectOldIdentityPrecondition = async mutation => {
    await upgrade.db.query('BEGIN');
    try {
      if (mutation) await mutation();
      await assert.rejects(upgrade.db.query(oldConvergenceSql), /CREATION_ACCESS_IDENTITY_PRECONDITION_FAILED/);
    } finally { await upgrade.db.query('ROLLBACK'); }
    assert.equal((await upgrade.db.query('SELECT migration_tip FROM hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip, '20260904120000');
  };
  await rejectOldIdentityPrecondition(); // The old frozen target has no creation-access predecessors.
  await apply(upgrade.db, migrations.slice(creationStart, oldConvergenceIndex));
  await rejectOldIdentityPrecondition(() => upgrade.db.query('DELETE FROM hosted_pilot_environment_identity'));
  await rejectOldIdentityPrecondition(async () => {
    await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check');
    await upgrade.db.query("UPDATE hosted_pilot_environment_identity SET migration_tip='99999999999999'");
  });
  report.scenarios.push({ scenario: 'forward-identity-preconditions-rollback-without-marker-change', status: 'passed', assertions: 6 });
  await apply(upgrade.db, [oldConvergenceName]);
  await apply(upgrade.db, [mappingName]);

  const assertOldMappingIdentity = async () => {
    const identity = (await upgrade.db.query(`SELECT product_key,environment_class,schema_contract,migration_tip,
      production_authorized,customer_data_authorized,real_provider_calls_authorized
      FROM hosted_pilot_environment_identity WHERE singleton`)).rows[0];
    assert.deepEqual(identity, { product_key: 'avalaos-core', environment_class: 'hosted_nonproduction_pilot',
      schema_contract: 'hosted-pilot-2026-08', migration_tip: '20260916003000', production_authorized: false,
      customer_data_authorized: false, real_provider_calls_authorized: false });
    assert.equal((await upgrade.db.query(`SELECT pg_get_expr(conbin,conrelid,false) expression FROM pg_constraint
      WHERE conrelid='hosted_pilot_environment_identity'::regclass
        AND conname='hosted_pilot_environment_identity_migration_tip_check'`)).rows[0].expression,
      "(migration_tip = '20260916003000'::text)");
  };
  const mappingIdentityNegativeCases = [];
  const rejectFinalIdentityPrecondition = async (name, mutation) => {
    report.activeScenario = name;
    await upgrade.db.query('BEGIN');
    try {
      if (mutation) await mutation();
      await assert.rejects(upgrade.db.query(mappingConvergenceSql), /ASSESS_MAPPING_IDENTITY_PRECONDITION_FAILED/);
    } finally { await upgrade.db.query('ROLLBACK'); }
    await assertOldMappingIdentity();
    assert.deepEqual(await retained(), before);
    mappingIdentityNegativeCases.push(name);
    delete report.activeScenario;
  };
  await rejectFinalIdentityPrecondition('missing-marker', () => upgrade.db.query('DELETE FROM hosted_pilot_environment_identity'));
  await rejectFinalIdentityPrecondition('duplicate-marker', async () => {
    await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_pkey');
    await upgrade.db.query(`INSERT INTO hosted_pilot_environment_identity(singleton,product_key,environment_class,schema_contract,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized)
      SELECT singleton,product_key,environment_class,schema_contract,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized
      FROM hosted_pilot_environment_identity`);
  });
  await rejectFinalIdentityPrecondition('wrong-marker', async () => {
    await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check');
    await upgrade.db.query("UPDATE hosted_pilot_environment_identity SET migration_tip='99999999999999'");
  });
  await rejectFinalIdentityPrecondition('missing-old-constraint', () => upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check'));
  for (const flag of ['production_authorized','customer_data_authorized','real_provider_calls_authorized']) {
    await rejectFinalIdentityPrecondition(`unsafe-${flag}`, async () => {
      // PostgreSQL truncates generated identifiers to 63 bytes. Resolve the
      // exact single-column CHECK rather than inventing its long name.
      const constraints = (await upgrade.db.query(`SELECT constraint_row.conname FROM pg_constraint constraint_row
        JOIN pg_attribute attribute_row ON attribute_row.attrelid=constraint_row.conrelid
          AND constraint_row.conkey=ARRAY[attribute_row.attnum]::smallint[]
        WHERE constraint_row.conrelid='public.hosted_pilot_environment_identity'::regclass
          AND constraint_row.contype='c' AND attribute_row.attname=$1`, [flag])).rows;
      assert.equal(constraints.length, 1);
      assert.match(constraints[0].conname, /^[a-z_]+$/);
      await upgrade.db.query(`ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT "${constraints[0].conname}"`);
      await upgrade.db.query(`UPDATE hosted_pilot_environment_identity SET ${flag}=true`);
    });
  }
  await rejectFinalIdentityPrecondition('missing-mapping-relation', () => upgrade.db.query('DROP TABLE enterprise_assess_document_mapping_applications CASCADE'));
  await rejectFinalIdentityPrecondition('missing-mapping-flag', () => upgrade.db.query('ALTER TABLE enterprise_transcript_workspace_flags DROP COLUMN assess_document_mapping_enabled CASCADE'));
  await rejectFinalIdentityPrecondition('missing-terminal-commit-rpc', () => upgrade.db.query(`DROP FUNCTION enterprise_commit_assess_document_mapping_preview_v1(uuid,uuid,text,uuid,bigint,uuid,uuid,jsonb,uuid,uuid,uuid,bigint,uuid,uuid,bigint) CASCADE`));
  for (const state of ['prepared','external_effect_started','database_committed','completed','aborted']) {
    await rejectFinalIdentityPrecondition(`retained-recovery-authority-${state}`, async () => {
      await upgrade.db.query(`INSERT INTO pr_c_controlled_human_recovery_authorities(exercise_digest,release_sha,deploy_id,target_fingerprint,authority_digest,operation,state,expected_version,expires_at)
        VALUES($1,$2,$3,$4,$5,'abort',$6,0,statement_timestamp()+interval '1 hour')`,
        [`sha256:${'1'.repeat(64)}`, '2'.repeat(40), '3'.repeat(24), `sha256:${'4'.repeat(64)}`, `sha256:${'5'.repeat(64)}`, state]);
    });
  }
  for (const lifecycle of ['active','read_only','deprovisioned','quarantined']) {
    const terminal = ['deprovisioned','quarantined'].includes(lifecycle);
    await rejectFinalIdentityPrecondition(`retained-controlled-human-exercise-${lifecycle}`, () => upgrade.db.query(`INSERT INTO pr_c_controlled_human_exercises(id,exercise_digest,environment_class,pull_request_number,release_sha,review_head_sha,deploy_id,deploy_origin,target_fingerprint,public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,org_id,workspace_id,lifecycle,quiesced_at,quiesced_history_digest,deprovisioned_at)
      VALUES($1,$2,'hosted_nonproduction_pilot',264,$3,$3,$4,'https://deploy-preview-264--avalaos-pilot.netlify.app',$5,$6,$7,$8,'20260904120000',$9,$10,$11,$12,$13,$14)`,
      [randomUUID(), `sha256:${'6'.repeat(64)}`, '7'.repeat(40), '8'.repeat(24), `sha256:${'9'.repeat(64)}`, `sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`, `sha256:${'c'.repeat(64)}`, ids[1], ids[2], lifecycle,
        lifecycle === 'active' ? null : new Date(), terminal ? `sha256:${'d'.repeat(64)}` : null, terminal ? new Date() : null]));
  }
  report.scenarios.push({ scenario: 'mapping-identity-preconditions-rollback-without-partial-effects', status: 'passed', cases: mappingIdentityNegativeCases });
  const concurrentWriter = await connect(upgrade.dbUrl.toString());
  const fencedHistories = [];
  await upgrade.db.query('BEGIN');
  try {
    await upgrade.db.query(mappingConvergenceSql);
    for (const table of ['pr_c_controlled_human_exercises', 'pr_c_controlled_human_recovery_authorities']) {
      await concurrentWriter.query('BEGIN');
      try {
        await concurrentWriter.query("SET LOCAL lock_timeout='250ms'");
        // Every INSERT/UPDATE/DELETE requires this table lock. A second writer
        // cannot enter between the empty-history gate and the marker commit.
        await assert.rejects(concurrentWriter.query(`LOCK TABLE public.${table} IN ROW EXCLUSIVE MODE`), error => error.code === '55P03');
        fencedHistories.push(table);
      } finally { await concurrentWriter.query('ROLLBACK'); }
    }
  } finally { await upgrade.db.query('ROLLBACK'); }
  await assertOldMappingIdentity();
  assert.deepEqual(await retained(), before);
  report.scenarios.push({ scenario: 'mapping-identity-blocks-concurrent-history-writers-until-commit', status: 'passed', cases: fencedHistories });
  await apply(upgrade.db, [mappingConvergenceName]);
  assert.deepEqual(await retained(), before);
  const assertPreXlsxIdentity = async () => {
    const identity = (await upgrade.db.query(`SELECT product_key,environment_class,schema_contract,migration_tip,
      production_authorized,customer_data_authorized,real_provider_calls_authorized
      FROM hosted_pilot_environment_identity WHERE singleton`)).rows[0];
    assert.deepEqual(identity, { product_key: 'avalaos-core', environment_class: 'hosted_nonproduction_pilot',
      schema_contract: 'hosted-pilot-2026-08', migration_tip: '20260916151050', production_authorized: false,
      customer_data_authorized: false, real_provider_calls_authorized: false });
    assert.equal((await upgrade.db.query(`SELECT pg_get_expr(conbin,conrelid,false) expression FROM pg_constraint
      WHERE conrelid='hosted_pilot_environment_identity'::regclass
        AND conname='hosted_pilot_environment_identity_migration_tip_check'`)).rows[0].expression,
      "(migration_tip = '20260916151050'::text)");
  };
  await assertPreXlsxIdentity();
  const classifierAuthority = async db => (await db.query(`SELECT
    function_row.oid::text oid,
    function_row.proowner::regrole::text owner,
    COALESCE(function_row.proacl::text,'') acl,
    COALESCE(function_row.proconfig::text,'') config,
    function_row.proisstrict is_strict,
    function_row.provolatile volatility,
    function_row.prosecdef security_definer,
    function_row.proleakproof leakproof,
    function_row.proparallel parallel,
    language_row.lanname language,
    encode(sha256(convert_to(replace(function_row.prosrc,E'\\r\\n',E'\\n'),'UTF8')),'hex') body_hash
    FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_language language_row ON language_row.oid=function_row.prolang
    WHERE function_row.oid='public.enterprise_assess_v2_source_type(text,text)'::regprocedure`)).rows[0];
  const classifierBeforeXlsx = await classifierAuthority(upgrade.db);
  assert.deepEqual({
    body_hash: classifierBeforeXlsx.body_hash,
    is_strict: classifierBeforeXlsx.is_strict,
    volatility: classifierBeforeXlsx.volatility,
    security_definer: classifierBeforeXlsx.security_definer,
    leakproof: classifierBeforeXlsx.leakproof,
    parallel: classifierBeforeXlsx.parallel,
    language: classifierBeforeXlsx.language,
  }, {
    body_hash: '6cbb1ff74fb00854063571ff52a4d53c0c14d3ef25a348d9a75f651a0a8f8a21',
    is_strict: true,
    volatility: 'i',
    security_definer: false,
    leakproof: false,
    parallel: 'u',
    language: 'plpgsql',
  });
  await upgrade.db.query(`INSERT INTO enterprise_transcript_workspace_flags(
    org_id,workspace_id,transcript_source_sets_enabled,assess_multisource_apply_enabled,
    unified_byok_gateway_enabled,governed_journeys_enabled,assess_document_mapping_enabled,updated_by
  ) VALUES($1,$2,true,true,true,true,true,$3)`, [ids[1],ids[2],ids[0]]);
  const retainedSource = { id: randomUUID(), version: randomUUID() };
  await upgrade.db.query('SELECT enterprise_create_evidence_source($1::jsonb,$2::jsonb)', [JSON.stringify({
    id: retainedSource.id, org_id: ids[1], workspace_id: ids[2], display_name: 'Retained synthetic text',
    source_kind: 'upload', mime_type: 'text/plain', created_by: ids[0],
  }), JSON.stringify({
    id: retainedSource.version, source_id: retainedSource.id, org_id: ids[1], workspace_id: ids[2],
    original_filename: 'retained.txt', content_hash: 'e'.repeat(64), content_bytes: 32,
    storage_bucket: 'source-uploads', storage_path: `${ids[1]}/${ids[2]}/enterprise-evidence/${retainedSource.id}.bin`,
    extracted_text_hash: 'f'.repeat(64), extracted_character_count: 32, created_by: ids[0],
  })]);
  const retainedXlsxUpgradeState = async () => (await upgrade.db.query(`SELECT
    (SELECT assess_document_mapping_enabled FROM enterprise_transcript_workspace_flags WHERE org_id=$1 AND workspace_id=$2) mapping_enabled,
    (SELECT parser_kind FROM enterprise_evidence_source_versions WHERE id=$3) parser_kind,
    (SELECT count(*)::int FROM enterprise_evidence_sources WHERE id=$4) source_count`,
  [ids[1],ids[2],retainedSource.version,retainedSource.id])).rows[0];
  const retainedBeforeXlsx = await retainedXlsxUpgradeState();
  assert.deepEqual(retainedBeforeXlsx,{mapping_enabled:true,parser_kind:'text_native',source_count:1});

  const xlsxNegativeCases=[];
  const rejectXlsxPrecondition=async(name,mutation)=>{
    report.activeScenario=name;
    await upgrade.db.query('BEGIN');
    try{
      if(mutation)await mutation();
      await assert.rejects(upgrade.db.query(xlsxCorrectionSql),/ASSESS_DOCUMENT_XLSX_INGESTION_PRECONDITION_FAILED/);
    }finally{await upgrade.db.query('ROLLBACK')}
    await assertPreXlsxIdentity();
    assert.deepEqual(await retained(),before);
    assert.deepEqual(await retainedXlsxUpgradeState(),retainedBeforeXlsx);
    xlsxNegativeCases.push(name);delete report.activeScenario;
  };
  await rejectXlsxPrecondition('xlsx-missing-marker',()=>upgrade.db.query('DELETE FROM hosted_pilot_environment_identity'));
  await rejectXlsxPrecondition('xlsx-duplicate-marker',async()=>{
    await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_pkey');
    await upgrade.db.query(`INSERT INTO hosted_pilot_environment_identity(singleton,product_key,environment_class,schema_contract,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized)
      SELECT singleton,product_key,environment_class,schema_contract,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized FROM hosted_pilot_environment_identity`);
  });
  await rejectXlsxPrecondition('xlsx-wrong-marker',async()=>{await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check');await upgrade.db.query("UPDATE hosted_pilot_environment_identity SET migration_tip='99999999999999'")});
  await rejectXlsxPrecondition('xlsx-missing-old-constraint',()=>upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check'));
  for(const flag of ['production_authorized','customer_data_authorized','real_provider_calls_authorized'])await rejectXlsxPrecondition(`xlsx-unsafe-${flag}`,async()=>{
    const constraint=(await upgrade.db.query(`SELECT constraint_row.conname FROM pg_constraint constraint_row JOIN pg_attribute attribute_row
      ON attribute_row.attrelid=constraint_row.conrelid AND constraint_row.conkey=ARRAY[attribute_row.attnum]::smallint[]
      WHERE constraint_row.conrelid='hosted_pilot_environment_identity'::regclass AND constraint_row.contype='c' AND attribute_row.attname=$1`,[flag])).rows[0];
    await upgrade.db.query(`ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT "${constraint.conname}"`);await upgrade.db.query(`UPDATE hosted_pilot_environment_identity SET ${flag}=true`);
  });
  await rejectXlsxPrecondition('xlsx-missing-source-mime-contract',()=>upgrade.db.query('ALTER TABLE enterprise_evidence_sources DROP CONSTRAINT enterprise_evidence_sources_mime_type_check'));
  await rejectXlsxPrecondition('xlsx-missing-parser-kind-contract',()=>upgrade.db.query('ALTER TABLE enterprise_evidence_source_versions DROP CONSTRAINT enterprise_evidence_source_versions_parser_kind_check'));
  await rejectXlsxPrecondition('xlsx-disabled-source-trigger',()=>upgrade.db.query('ALTER TABLE enterprise_evidence_source_versions DISABLE TRIGGER enterprise_source_version_derive_before_insert'));
  await rejectXlsxPrecondition('xlsx-mutated-old-function-body',async()=>{
    const definition=(await upgrade.db.query("SELECT pg_get_functiondef('public.enterprise_source_version_derive()'::regprocedure) definition")).rows[0].definition;
    assert.ok(definition.includes('FOR SHARE'));
    await upgrade.db.query(definition.replace('FOR SHARE','FOR KEY SHARE'));
  });
  await rejectXlsxPrecondition('xlsx-mutated-old-classifier-body',async()=>{
    const definition=(await upgrade.db.query("SELECT pg_get_functiondef('public.enterprise_assess_v2_source_type(text,text)'::regprocedure) definition")).rows[0].definition;
    assert.ok(definition.includes("RETURN 'document';"));
    await upgrade.db.query(definition.replace("RETURN 'document';","RETURN 'document'::text;"));
  });
  for(const state of ['prepared','external_effect_started','database_committed','completed','aborted'])await rejectXlsxPrecondition(`xlsx-retained-recovery-${state}`,()=>upgrade.db.query(`INSERT INTO pr_c_controlled_human_recovery_authorities(exercise_digest,release_sha,deploy_id,target_fingerprint,authority_digest,operation,state,expected_version,expires_at)
    VALUES($1,$2,$3,$4,$5,'abort',$6,0,statement_timestamp()+interval '1 hour')`,[`sha256:${'1'.repeat(64)}`,'2'.repeat(40),'3'.repeat(24),`sha256:${'4'.repeat(64)}`,`sha256:${'5'.repeat(64)}`,state]));
  for(const lifecycle of ['active','read_only','deprovisioned','quarantined']){
    const terminal=['deprovisioned','quarantined'].includes(lifecycle);
    await rejectXlsxPrecondition(`xlsx-retained-exercise-${lifecycle}`,()=>upgrade.db.query(`INSERT INTO pr_c_controlled_human_exercises(id,exercise_digest,environment_class,pull_request_number,release_sha,review_head_sha,deploy_id,deploy_origin,target_fingerprint,public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,org_id,workspace_id,lifecycle,quiesced_at,quiesced_history_digest,deprovisioned_at)
      VALUES($1,$2,'hosted_nonproduction_pilot',264,$3,$3,$4,'https://deploy-preview-264--avalaos-pilot.netlify.app',$5,$6,$7,$8,'20260904120000',$9,$10,$11,$12,$13,$14)`,[randomUUID(),`sha256:${'6'.repeat(64)}`,'7'.repeat(40),'8'.repeat(24),`sha256:${'9'.repeat(64)}`,`sha256:${'a'.repeat(64)}`,`sha256:${'b'.repeat(64)}`,`sha256:${'c'.repeat(64)}`,ids[1],ids[2],lifecycle,lifecycle==='active'?null:new Date(),terminal?`sha256:${'d'.repeat(64)}`:null,terminal?new Date():null]));
  }
  report.scenarios.push({scenario:'xlsx-ingestion-preconditions-rollback-without-partial-effects',status:'passed',cases:xlsxNegativeCases});
  await upgrade.db.query('BEGIN');
  try{
    await upgrade.db.query(xlsxCorrectionSql);
    for(const table of ['hosted_pilot_environment_identity','pr_c_controlled_human_exercises','pr_c_controlled_human_recovery_authorities','enterprise_evidence_sources','enterprise_evidence_source_versions']){
      await concurrentWriter.query('BEGIN');
      try{await concurrentWriter.query("SET LOCAL lock_timeout='250ms'");await assert.rejects(concurrentWriter.query(`LOCK TABLE ${table} IN ROW EXCLUSIVE MODE`),error=>error.code==='55P03')}
      finally{await concurrentWriter.query('ROLLBACK')}
    }
  }finally{await upgrade.db.query('ROLLBACK')}
  await assertPreXlsxIdentity();assert.deepEqual(await retainedXlsxUpgradeState(),retainedBeforeXlsx);
  report.scenarios.push({scenario:'xlsx-ingestion-blocks-concurrent-identity-history-and-source-writers',status:'passed',tables:5});
  await apply(upgrade.db,[xlsxCorrectionName]);
  assert.deepEqual(await retained(), before);
  assert.deepEqual(await retainedXlsxUpgradeState(),retainedBeforeXlsx);
  const classifierAfterXlsx = await classifierAuthority(upgrade.db);
  const {body_hash: classifierOldBodyHash,...classifierOldMetadata} = classifierBeforeXlsx;
  const {body_hash: classifierNewBodyHash,...classifierNewMetadata} = classifierAfterXlsx;
  assert.deepEqual(classifierNewMetadata,classifierOldMetadata,'XLSX classifier upgrade must preserve OID, owner, ACL, config, STRICT/IMMUTABLE/invoker, leakproof, parallel, and language metadata.');
  assert.notEqual(classifierNewBodyHash,classifierOldBodyHash);
  await assertFinalIdentity(upgrade.db);
  assert.equal((await upgrade.db.query('SELECT count(*)::int AS n FROM synthetic_admin_targets')).rows[0].n, 0);
  assert.equal((await upgrade.db.query('SELECT count(*)::int AS n FROM process_creation_workspace_controls')).rows[0].n, 0);
  report.scenarios.push({ scenario: 'populated-upgrade-preserves-process-flags-source-classifier-and-default-off-targets', status: 'passed', assertions: 9 });
  console.log('Populated upgrade: retained process, enabled mapping flag, text source, classifier authority metadata, exact final identity, and unconfigured creation targets are preserved.');
  // The retained operational identity must follow the same final migration
  // ledger on both fresh and accepted-baseline upgrades, including stale/ahead
  // marker denial. Running only the new feature RPCs misses this dependency.
  await child('scripts/testPilotOperationsPostgres.mjs', { PILOT_OPERATIONS_DATABASE_URL: url.toString() });
  // Retained PR C assertions apply the complete chain too. Running them here
  // catches stale fresh-tip assumptions before the exact-head CI evidence run.
  await child('scripts/testTranscriptFlowPrCPostgres.mjs', { TRANSCRIPT_FLOW_PR_C_MIGRATION_DATABASE_URL: url.toString() });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failureCode = /^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'LOCAL_POSTGRES_CHECK_FAILED';
  console.error(`Creation-access PostgreSQL failed: ${report.failureCode}; scenario ${report.activeScenario ?? 'full-chain'}`);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(client => client.end().catch(() => undefined)));
  if (containerId) {
    try {
      const inspect = JSON.parse(docker('inspect', containerId))[0];
      assert.equal(inspect.Id, containerId);
      assert.equal(inspect.Name, `/${name}`);
      assert.equal(inspect.Config.Labels['avalaos.creation-access-run'], runId);
      docker('rm', '-f', containerId);
      report.cleanup = 'verified_owned_container_removed';
      console.log('Removed only this run’s disposable synthetic PostgreSQL container and its memory-backed databases.');
    } catch { report.cleanup = 'unconfirmed'; report.status = 'failed'; process.exitCode = 1; }
  } else report.cleanup = 'no_container_created';
  await writeFile(join(artifactDir, 'result.json'), JSON.stringify(report, null, 2) + '\n');
}
