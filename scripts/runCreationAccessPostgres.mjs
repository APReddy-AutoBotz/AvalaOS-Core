import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {approvedFullChainTip} from './prCMigrationTailContract.mjs';
import {PROJECTION_MIGRATION_REJECTION_CASES} from './projectionRpcPostgrestContract.mjs';

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
const child = (script, env, args = []) => new Promise((resolveResult, reject) => {
  const proc = spawn(process.execPath, [script, ...args], { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  proc.stdout.on('data', data => { stdout += data; });
  proc.stderr.on('data', data => { stderr += data; });
  const timeout = setTimeout(() => proc.kill(), 180_000);
  proc.once('error', reject);
  proc.once('close', async code => {
    clearTimeout(timeout);
    const output = sanitize(stdout + stderr);
    await writeFile(join(artifactDir, `${script.split('/').at(-1)}${args.length ? '-baseline' : ''}.log`), output);
    console.log(output.trim());
    report.scenarios.push({ command: [process.execPath, script, ...args], exitCode: code, status: code === 0 ? 'passed' : 'failed', outputSha256: createHash('sha256').update(output).digest('hex') });
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
  assert.equal(approvedFullChainTip(migrations), '20260923082000');
  assert.equal(migrations.length, 84);
  const creationStart = migrations.indexOf('20260915142940_creation_access_process_authority.sql');
  const oldConvergenceIndex = migrations.indexOf('20260916003000_creation_access_migration_identity_convergence.sql');
  const mappingIndex = migrations.indexOf('20260916083814_assess_supporting_document_mapping.sql');
  const mappingConvergenceIndex = migrations.indexOf('20260916151050_assess_document_mapping_identity_convergence.sql');
  const xlsxCorrectionIndex = migrations.indexOf('20260916181916_assess_document_xlsx_ingestion_authority.sql');
  const projectionVolatilityIndex = migrations.indexOf('20260916203406_projection_rpc_volatility_authority.sql');
  assert.ok(creationStart > 0);
  assert.deepEqual([oldConvergenceIndex, mappingIndex, mappingConvergenceIndex, xlsxCorrectionIndex, projectionVolatilityIndex],
    [creationStart + 2, creationStart + 3, creationStart + 4, creationStart + 5, creationStart + 6]);
  const campaignAuthorityIndex = migrations.indexOf('20260917173445_synthetic_ai_campaign_authority.sql');
  assert.equal(campaignAuthorityIndex, projectionVolatilityIndex + 1);
  const domainBudgetIndex = migrations.indexOf('20260918082307_synthetic_ai_mapping_studio_budget_authority.sql');
  assert.equal(domainBudgetIndex, campaignAuthorityIndex + 1);
  const renewalIndex = migrations.indexOf('20260922112911_synthetic_ai_campaign_one_time_renewal.sql');
  assert.equal(renewalIndex, domainBudgetIndex + 1);
  assert.equal(migrations[renewalIndex + 1], '20260923062439_studio_server_helper_permissions.sql');
  assert.equal(migrations[renewalIndex + 2], '20260923082000_studio_frd_section_id_contract.sql');
  assert.equal(renewalIndex, migrations.length - 3);
  const apply = async (db, files) => {
    for (const file of files) {
      const sql = await readFile(join('supabase/migrations', file), 'utf8');
      await db.query('BEGIN');
      try { await db.query(sql); await db.query('COMMIT'); }
      catch (error) {
        await db.query('ROLLBACK');
        // Retain only fixed domain codes; never expose SQL diagnostics, rows,
        // connection strings, function arguments or raw exception objects.
        const domainCode = /^[A-Z][A-Z0-9_]{1,100}$/.test(error.message ?? '') ? error.message : 'UNCLASSIFIED';
        report.migrationFailure = { path: file, sqlstate: error.code ?? 'unknown', domainCode };
        console.error(`Migration failed: ${file}; SQLSTATE ${error.code ?? 'unknown'}; domain ${domainCode}`);
        throw error;
      }
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
  const assertFinalIdentity = async (db, expectedTip = '20260923082000') => {
    assert.deepEqual((await db.query(`SELECT product_key,environment_class,schema_contract,migration_tip,
      production_authorized,customer_data_authorized,real_provider_calls_authorized
      FROM hosted_pilot_environment_identity WHERE singleton`)).rows[0], {
      product_key: 'avalaos-core', environment_class: 'hosted_nonproduction_pilot', schema_contract: 'hosted-pilot-2026-08',
      migration_tip: expectedTip, production_authorized: false, customer_data_authorized: false,
      real_provider_calls_authorized: false,
    });
    assert.equal((await db.query(`SELECT pg_get_expr(conbin,conrelid,false) expression FROM pg_constraint
      WHERE conrelid='hosted_pilot_environment_identity'::regclass
        AND conname='hosted_pilot_environment_identity_migration_tip_check'`)).rows[0].expression,
      `(migration_tip = '${expectedTip}'::text)`);
  };
  const processDb = await createDb('process');
  await apply(processDb.db, migrations);
  await assertFinalIdentity(processDb.db);
  for (const signature of [
    'public.enterprise_sha256_jsonb(jsonb)',
    'public.studio_pr_b_anchor_manifest(jsonb,uuid,text)',
    'public.studio_pr_b_anchor_manifest_safe(jsonb)',
    'public.enterprise_direct_studio_route_policy()',
  ]) {
    const grants = (await processDb.db.query(`SELECT
      has_function_privilege('service_role',$1,'EXECUTE') service,
      has_function_privilege('authenticated',$1,'EXECUTE') authenticated,
      has_function_privilege('anon',$1,'EXECUTE') anonymous`, [signature])).rows[0];
    assert.deepEqual(grants, { service: true, authenticated: false, anonymous: false },
      `Studio helper permission boundary: ${signature}`);
  }
  console.log(`Fresh PostgreSQL 16 migration chain applied: ${migrations.length} migrations.`);
  await child('scripts/testProcessCreationPostgres.mjs', { PROCESS_CREATION_DISPOSABLE_DATABASE_URL: processDb.dbUrl.toString() });
  const adminDb = await createDb('admin');
  await apply(adminDb.db, migrations);
  await assertFinalIdentity(adminDb.db);
  await child('scripts/testSyntheticAdminPostgres.mjs', { SYNTHETIC_ADMIN_DISPOSABLE_DATABASE_URL: adminDb.dbUrl.toString() });

  // Separate fresh synthetic DB: campaign bootstrap must prove an empty provider
  // surface, not depend on preceding suites' fixture mutations.
  const campaignDb = await createDb('ai_campaign');
  await apply(campaignDb.db, migrations);
  await assertFinalIdentity(campaignDb.db);
  await child('scripts/testSyntheticAiCampaignPostgres.mjs', { SYNTHETIC_AI_CAMPAIGN_DISPOSABLE_DATABASE_URL: campaignDb.dbUrl.toString() });

  // Execute the predecessor's real campaign tests before upgrading its populated
  // ledger. Snapshot old columns only; adding nullable identity columns must not
  // rewrite any charge, consumed timestamp, carry, cap, expiry or disabled state.
  const budgetUpgrade = await createDb('ai_budget_upgrade');
  await apply(budgetUpgrade.db, migrations.slice(0, domainBudgetIndex));
  await assertFinalIdentity(budgetUpgrade.db, '20260917173445');
  await child('scripts/testSyntheticAiCampaignPostgres.mjs', {
    SYNTHETIC_AI_CAMPAIGN_DISPOSABLE_DATABASE_URL: budgetUpgrade.dbUrl.toString(),
  }, ['--pre-domain-budget-upgrade']);
  const debitColumns = (await budgetUpgrade.db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='synthetic_ai_campaign_effect_debits' ORDER BY ordinal_position`)).rows.map(row=>row.column_name);
  assert.ok(debitColumns.every(column=>/^[a-z_]+$/.test(column)));
  const budgetSnapshot = async () => ({
    campaigns: (await budgetUpgrade.db.query('SELECT * FROM synthetic_ai_campaign_authorities ORDER BY id')).rows,
    debits: (await budgetUpgrade.db.query(`SELECT ${debitColumns.join(',')} FROM synthetic_ai_campaign_effect_debits ORDER BY id`)).rows,
    tokens: (await budgetUpgrade.db.query(`SELECT to_jsonb(b)-ARRAY['assess_mapping_run_id','assess_mapping_transfer_count','assess_mapping_last_transfer_at','assess_mapping_transfer_pending'] AS value FROM enterprise_ai_budget_reservations b ORDER BY id`)).rows,
  });
  report.activeScenario='domain-budget-predecessor-snapshot';
  const budgetBefore = await budgetSnapshot();
  assert.equal(budgetBefore.debits.length, 19);
  const domainBudgetSql = await readFile(join('supabase/migrations', migrations[domainBudgetIndex]), 'utf8');
  const budgetSchemaSnapshot = async () => createHash('sha256').update(JSON.stringify({
    functions:(await budgetUpgrade.db.query(`SELECT p.oid::text,p.proname,pg_get_functiondef(p.oid) definition,
      p.proacl::text,p.proconfig::text,p.proowner::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' ORDER BY p.oid`)).rows,
    relations:(await budgetUpgrade.db.query(`SELECT c.oid::text,c.relname,c.relacl::text,c.relowner::text,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.oid`)).rows,
    constraints:(await budgetUpgrade.db.query(`SELECT c.oid::text,c.conname,pg_get_constraintdef(c.oid) definition
      FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY c.oid`)).rows,
  })).digest('hex');
  const predecessorSchema = await budgetSchemaSnapshot();
  const rejectedBudgetPreconditions=[];
  for(const [label,mutation] of [
    ['wrong-predecessor', "UPDATE hosted_pilot_environment_identity SET migration_tip='20260916203406' WHERE singleton"],
    ['wrong-product', "UPDATE hosted_pilot_environment_identity SET product_key='foreign-product' WHERE singleton"],
    ['production-flag', 'UPDATE hosted_pilot_environment_identity SET production_authorized=true WHERE singleton'],
    ['customer-flag', 'UPDATE hosted_pilot_environment_identity SET customer_data_authorized=true WHERE singleton'],
    ['provider-flag', 'UPDATE hosted_pilot_environment_identity SET real_provider_calls_authorized=true WHERE singleton'],
  ]) {
    report.activeScenario=`domain-budget-precondition-${label}`;
    await budgetUpgrade.db.query('BEGIN');
    try {
      // Deliberate corruption is confined to this disposable transaction; it
      // proves the migration guards, not merely the predecessor CHECK clauses.
      const checks=(await budgetUpgrade.db.query(`SELECT conname FROM pg_constraint
        WHERE conrelid='hosted_pilot_environment_identity'::regclass AND contype='c'`)).rows;
      for(const {conname} of checks){assert.match(conname,/^[a-z0-9_]+$/);await budgetUpgrade.db.query(`ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT ${conname}`);}
      await budgetUpgrade.db.query(mutation);
      await assert.rejects(budgetUpgrade.db.query(domainBudgetSql), error=>
        error.message==='SYNTHETIC_AI_DOMAIN_BUDGET_MIGRATION_PRECONDITION_FAILED');
      rejectedBudgetPreconditions.push(label);
    } finally { await budgetUpgrade.db.query('ROLLBACK'); }
    assert.deepEqual(await budgetSnapshot(),budgetBefore);
    assert.equal(await budgetSchemaSnapshot(),predecessorSchema);
    await assertFinalIdentity(budgetUpgrade.db,'20260917173445');
  }
  report.activeScenario='domain-budget-populated-forward-apply';
  await apply(budgetUpgrade.db, [migrations[domainBudgetIndex]]);
  await assertFinalIdentity(budgetUpgrade.db, '20260918082307');
  report.activeScenario='domain-budget-preserve-populated-ledgers';
  assert.deepEqual(await budgetSnapshot(), budgetBefore);
  assert.equal((await budgetUpgrade.db.query(`SELECT count(*)::int n FROM synthetic_ai_campaign_effect_debits
    WHERE authority_kind='enterprise'`)).rows[0].n, 19);
  assert.equal((await budgetUpgrade.db.query(`SELECT count(*)::int n FROM enterprise_ai_budget_reservations
    WHERE assess_mapping_run_id IS NOT NULL OR assess_mapping_transfer_count<>0
      OR assess_mapping_last_transfer_at IS NOT NULL OR assess_mapping_transfer_pending`)).rows[0].n,0);
  report.activeScenario='domain-budget-function-privileges';
  const changedFunctionNames=[...new Set([
    ...[...domainBudgetSql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)/giu)].map(match=>match[1]),
    // Existing functions receiving drift-guarded body-only forwards must also
    // appear in the actual deployed privilege inventory.
    'synthetic_ai_campaign_bootstrap','studio_artifact_generation_claim_v2',
    'enterprise_ai_reserve_provider_budget','studio_artifact_reserve_provider_budget_v2',
  ])];
  assert.ok(changedFunctionNames.length>=7,'The domain lifecycle and currency RPCs must be present.');
  for(const name of changedFunctionNames)assert.ok(Buffer.byteLength(name,'utf8')<=63,'New RPC names must not be silently truncated');
  const functionPrivileges=(await budgetUpgrade.db.query(`SELECT p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[changedFunctionNames])).rows;
  assert.deepEqual([...new Set(functionPrivileges.map(row=>row.proname))].sort(),changedFunctionNames.sort());
  for(const row of functionPrivileges){
    assert.equal(row.anon_execute,false,`${row.proname} must not be callable by anonymous clients`);
    assert.equal(row.authenticated_execute,false,`${row.proname} must not be callable by browser clients`);
    if(row.prosecdef)assert.ok(row.proconfig?.includes('search_path=pg_catalog'),`${row.proname} requires fixed search_path`);
  }
  report.activeScenario='domain-budget-ledger-privileges';
  assert.deepEqual((await budgetUpgrade.db.query(`SELECT relname,relrowsecurity,relforcerowsecurity,
    has_table_privilege('service_role',oid,'INSERT') service_insert,
    has_table_privilege('service_role',oid,'UPDATE') service_update,
    has_table_privilege('service_role',oid,'DELETE') service_delete
    FROM pg_class WHERE oid IN('public.enterprise_ai_budget_reservations'::regclass,'public.synthetic_ai_campaign_effect_debits'::regclass)
    ORDER BY relname`)).rows,[
      {relname:'enterprise_ai_budget_reservations',relrowsecurity:true,relforcerowsecurity:true,service_insert:false,service_update:false,service_delete:false},
      {relname:'synthetic_ai_campaign_effect_debits',relrowsecurity:true,relforcerowsecurity:true,service_insert:false,service_update:false,service_delete:false},
    ]);
  report.activeScenario='domain-budget-reapply-atomicity';
  const successorSchema=await budgetSchemaSnapshot();
  await budgetUpgrade.db.query('BEGIN');
  try {
    await assert.rejects(budgetUpgrade.db.query(domainBudgetSql), error=>
      error.message==='SYNTHETIC_AI_DOMAIN_BUDGET_MIGRATION_PRECONDITION_FAILED');
  } finally { await budgetUpgrade.db.query('ROLLBACK'); }
  assert.deepEqual(await budgetSnapshot(), budgetBefore);
  assert.equal(await budgetSchemaSnapshot(),successorSchema);
  await assertFinalIdentity(budgetUpgrade.db, '20260918082307');
  report.scenarios.push({ scenario:'populated-domain-budget-upgrade-and-reapply-preserve-all-existing-charge-and-token-authority', status:'passed', retainedDebits:19, rejectedPreconditions:rejectedBudgetPreconditions });
  delete report.activeScenario;
  await budgetUpgrade.db.end();
  await admin.query('DROP DATABASE avalaos_creation_access_ai_budget_upgrade');

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
  const projectionVolatilityName = migrations[projectionVolatilityIndex];
  const oldConvergenceSql = await readFile(join('supabase/migrations', oldConvergenceName), 'utf8');
  const mappingConvergenceSql = await readFile(join('supabase/migrations', mappingConvergenceName), 'utf8');
  const xlsxCorrectionSql = await readFile(join('supabase/migrations', xlsxCorrectionName), 'utf8');
  const projectionVolatilitySql = await readFile(join('supabase/migrations', projectionVolatilityName), 'utf8');
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
  assert.equal(xlsxNegativeCases.length,21);
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
  const assertPreProjectionIdentity = async () => {
    const identity = (await upgrade.db.query(`SELECT product_key,environment_class,schema_contract,migration_tip,
      production_authorized,customer_data_authorized,real_provider_calls_authorized
      FROM hosted_pilot_environment_identity WHERE singleton`)).rows[0];
    assert.deepEqual(identity, { product_key: 'avalaos-core', environment_class: 'hosted_nonproduction_pilot',
      schema_contract: 'hosted-pilot-2026-08', migration_tip: '20260916181916', production_authorized: false,
      customer_data_authorized: false, real_provider_calls_authorized: false });
    assert.equal((await upgrade.db.query(`SELECT pg_get_expr(conbin,conrelid,false) expression FROM pg_constraint
      WHERE conrelid='hosted_pilot_environment_identity'::regclass
        AND conname='hosted_pilot_environment_identity_migration_tip_check'`)).rows[0].expression,
      "(migration_tip = '20260916181916'::text)");
  };
  const projectionAuthority = async db => {
    const rows = (await db.query(`SELECT function_row.proname,
      encode(sha256(convert_to(replace(function_row.prosrc,E'\\r\\n',E'\\n'),'UTF8')),'hex') body_hash,
      function_row.provolatile volatility,
      to_jsonb(function_row)-'provolatile' metadata
      FROM pg_catalog.pg_proc function_row
      WHERE function_row.oid IN(
        'public.enterprise_delivery_workspace_projection(uuid,uuid,jsonb)'::regprocedure,
        'public.enterprise_monitor_approved_baselines_projection(uuid,uuid,jsonb)'::regprocedure
      ) ORDER BY function_row.proname`)).rows;
    assert.equal(rows.length,2);
    return Object.fromEntries(rows.map(row=>[row.proname,row]));
  };
  const projectionIdentityAuthority = async db => (await db.query(`SELECT jsonb_build_object(
    'rows',(SELECT jsonb_agg(to_jsonb(identity_row) ORDER BY identity_row.singleton) FROM hosted_pilot_environment_identity identity_row),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'type',constraint_row.contype,
      'validated',constraint_row.convalidated,'definition',pg_get_constraintdef(constraint_row.oid,true)) ORDER BY constraint_row.conname)
      FROM pg_constraint constraint_row WHERE constraint_row.conrelid='hosted_pilot_environment_identity'::regclass)) evidence`)).rows[0].evidence;
  await assertPreProjectionIdentity();
  const projectionIdentityBefore = await projectionIdentityAuthority(upgrade.db);
  const projectionBefore = await projectionAuthority(upgrade.db);
  assert.deepEqual({
    deliveryHash:projectionBefore.enterprise_delivery_workspace_projection.body_hash,
    deliveryVolatility:projectionBefore.enterprise_delivery_workspace_projection.volatility,
    monitorHash:projectionBefore.enterprise_monitor_approved_baselines_projection.body_hash,
    monitorVolatility:projectionBefore.enterprise_monitor_approved_baselines_projection.volatility,
  },{
    deliveryHash:'5e5f103ab825a120fb97b22a31f06d99323d735fc99b26053a91098a99076068',deliveryVolatility:'s',
    monitorHash:'16d0e6206cacff577253c75f8d0b3f1d43ba05d4030e81c6bcde66a127580a80',monitorVolatility:'s',
  });
  const projectionNegativeCases=[];
  const rejectProjectionPrecondition=async(name,mutation)=>{
    report.activeScenario=name;
    await upgrade.db.query('BEGIN');
    try{
      if(mutation)await mutation();
      await assert.rejects(upgrade.db.query(projectionVolatilitySql),/PROJECTION_RPC_VOLATILITY_PRECONDITION_FAILED/);
    }finally{await upgrade.db.query('ROLLBACK')}
    await assertPreProjectionIdentity();
    assert.deepEqual(await projectionIdentityAuthority(upgrade.db),projectionIdentityBefore);
    assert.deepEqual(await projectionAuthority(upgrade.db),projectionBefore);
    assert.deepEqual(await retained(),before);
    assert.deepEqual(await retainedXlsxUpgradeState(),retainedBeforeXlsx);
    projectionNegativeCases.push(name);delete report.activeScenario;
  };
  await rejectProjectionPrecondition('projection-missing-marker',()=>upgrade.db.query(
    'DELETE FROM hosted_pilot_environment_identity'));
  await rejectProjectionPrecondition('projection-duplicate-marker',async()=>{
    await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_pkey');
    await upgrade.db.query(`INSERT INTO hosted_pilot_environment_identity(singleton,product_key,environment_class,schema_contract,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized)
      SELECT singleton,product_key,environment_class,schema_contract,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized FROM hosted_pilot_environment_identity`);
  });
  await rejectProjectionPrecondition('projection-missing-predecessor-constraint',()=>upgrade.db.query(
    'ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check'));
  await rejectProjectionPrecondition('projection-stale-marker',async()=>{
    await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check');
    await upgrade.db.query("UPDATE hosted_pilot_environment_identity SET migration_tip='20260915142942'");
  });
  await rejectProjectionPrecondition('projection-ahead-marker',async()=>{
    await upgrade.db.query('ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check');
    await upgrade.db.query("UPDATE hosted_pilot_environment_identity SET migration_tip='99999999999999'");
  });
  for(const flag of ['production_authorized','customer_data_authorized','real_provider_calls_authorized'])await rejectProjectionPrecondition(`projection-unsafe-${flag}`,async()=>{
    const constraint=(await upgrade.db.query(`SELECT constraint_row.conname FROM pg_constraint constraint_row JOIN pg_attribute attribute_row
      ON attribute_row.attrelid=constraint_row.conrelid AND constraint_row.conkey=ARRAY[attribute_row.attnum]::smallint[]
      WHERE constraint_row.conrelid='hosted_pilot_environment_identity'::regclass AND constraint_row.contype='c' AND attribute_row.attname=$1`,[flag])).rows[0];
    assert.ok(constraint?.conname);
    await upgrade.db.query(`ALTER TABLE hosted_pilot_environment_identity DROP CONSTRAINT "${constraint.conname}"`);
    await upgrade.db.query(`UPDATE hosted_pilot_environment_identity SET ${flag}=true`);
  });
  await rejectProjectionPrecondition('projection-delivery-body-drift',async()=>{
    const definition=(await upgrade.db.query("SELECT pg_get_functiondef('public.enterprise_delivery_workspace_projection(uuid,uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
    assert.ok(definition.includes('IF jsonb_typeof'));
    await upgrade.db.query(definition.replace('IF jsonb_typeof','IF /* projection-body-drift */ jsonb_typeof'));
  });
  await rejectProjectionPrecondition('projection-monitor-owner-drift',async()=>{
    await upgrade.db.query('GRANT CREATE ON SCHEMA public TO authenticated');
    await upgrade.db.query('ALTER FUNCTION enterprise_monitor_approved_baselines_projection(uuid,uuid,jsonb) OWNER TO authenticated');
  });
  await rejectProjectionPrecondition('projection-delivery-acl-drift',()=>upgrade.db.query(
    'REVOKE EXECUTE ON FUNCTION enterprise_delivery_workspace_projection(uuid,uuid,jsonb) FROM authenticated'));
  await rejectProjectionPrecondition('projection-monitor-config-drift',()=>upgrade.db.query(
    'ALTER FUNCTION enterprise_monitor_approved_baselines_projection(uuid,uuid,jsonb) SET search_path TO public'));
  await rejectProjectionPrecondition('projection-delivery-security-drift',()=>upgrade.db.query(
    'ALTER FUNCTION enterprise_delivery_workspace_projection(uuid,uuid,jsonb) SECURITY INVOKER'));
  await rejectProjectionPrecondition('projection-monitor-volatility-drift',()=>upgrade.db.query(
    'ALTER FUNCTION enterprise_monitor_approved_baselines_projection(uuid,uuid,jsonb) IMMUTABLE'));
  await rejectProjectionPrecondition('projection-retained-recovery-history',()=>upgrade.db.query(`INSERT INTO pr_c_controlled_human_recovery_authorities(
    exercise_digest,release_sha,deploy_id,target_fingerprint,authority_digest,operation,state,expected_version,expires_at)
    VALUES($1,$2,$3,$4,$5,'abort','completed',0,statement_timestamp()+interval '1 hour')`,
    [`sha256:${'1'.repeat(64)}`,'2'.repeat(40),'3'.repeat(24),`sha256:${'4'.repeat(64)}`,`sha256:${'5'.repeat(64)}`]));
  await rejectProjectionPrecondition('projection-retained-exercise-history',()=>upgrade.db.query(`INSERT INTO pr_c_controlled_human_exercises(
    id,exercise_digest,environment_class,pull_request_number,release_sha,review_head_sha,deploy_id,deploy_origin,target_fingerprint,
    public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,org_id,workspace_id,lifecycle)
    VALUES($1,$2,'hosted_nonproduction_pilot',264,$3,$3,$4,'https://deploy-preview-264--avalaos-pilot.netlify.app',$5,$6,$7,$8,'20260904120000',$9,$10,'active')`,
    [randomUUID(),`sha256:${'6'.repeat(64)}`,'7'.repeat(40),'8'.repeat(24),`sha256:${'9'.repeat(64)}`,`sha256:${'a'.repeat(64)}`,`sha256:${'b'.repeat(64)}`,`sha256:${'c'.repeat(64)}`,ids[1],ids[2]]));
  assert.deepEqual(projectionNegativeCases,PROJECTION_MIGRATION_REJECTION_CASES);
  report.scenarios.push({scenario:'projection-volatility-preconditions-rollback-without-partial-effects',status:'passed',cases:projectionNegativeCases,
    rollbackProof:'exact_pre79_identity_two_function_metadata_and_retained_state'});
  const projectionFencedTables=[];
  await upgrade.db.query('BEGIN');
  try{
    await upgrade.db.query(projectionVolatilitySql);
    for(const table of ['hosted_pilot_environment_identity','pr_c_controlled_human_exercises','pr_c_controlled_human_recovery_authorities']){
      await concurrentWriter.query('BEGIN');
      try{
        await concurrentWriter.query("SET LOCAL lock_timeout='250ms'");
        await assert.rejects(concurrentWriter.query(`LOCK TABLE ${table} IN ROW EXCLUSIVE MODE`),error=>error.code==='55P03');
        projectionFencedTables.push(table);
      }finally{await concurrentWriter.query('ROLLBACK')}
    }
  }finally{await upgrade.db.query('ROLLBACK')}
  await assertPreProjectionIdentity();
  assert.deepEqual(await projectionIdentityAuthority(upgrade.db),projectionIdentityBefore);
  assert.deepEqual(await projectionAuthority(upgrade.db),projectionBefore);
  assert.equal(projectionFencedTables.length,3);
  report.scenarios.push({scenario:'projection-volatility-blocks-concurrent-identity-and-history-writers',status:'passed',tables:projectionFencedTables});
  await apply(upgrade.db,[projectionVolatilityName]);
  const projectionAfter=await projectionAuthority(upgrade.db);
  for(const name of ['enterprise_delivery_workspace_projection','enterprise_monitor_approved_baselines_projection']){
    assert.equal(projectionAfter[name].volatility,'v');
    assert.equal(projectionAfter[name].body_hash,projectionBefore[name].body_hash);
    assert.deepEqual(projectionAfter[name].metadata,projectionBefore[name].metadata,
      `${name} must preserve whole pg_proc metadata except volatility`);
  }
  await assertFinalIdentity(upgrade.db, '20260916203406');
  assert.equal((await upgrade.db.query('SELECT count(*)::int AS n FROM synthetic_admin_targets')).rows[0].n, 0);
  assert.equal((await upgrade.db.query('SELECT count(*)::int AS n FROM process_creation_workspace_controls')).rows[0].n, 0);
  report.scenarios.push({ scenario: 'populated-78-to-79-upgrade-preserves-process-flags-source-classifier-projection-metadata-and-default-off-targets', status: 'passed', assertions: 17 });
  console.log('Populated 78-to-79 upgrade: retained process, enabled mapping flag, text source, classifier authority, projection RPC metadata, exact final identity, and unconfigured creation targets are preserved.');
  await apply(upgrade.db, [migrations[campaignAuthorityIndex]]);
  await assertFinalIdentity(upgrade.db, '20260917173445');
  await apply(upgrade.db, [migrations[domainBudgetIndex]]);
  await assertFinalIdentity(upgrade.db, '20260918082307');
  assert.deepEqual(await retained(), before);
  assert.deepEqual(await retainedXlsxUpgradeState(), retainedBeforeXlsx);
  assert.deepEqual(await projectionAuthority(upgrade.db), projectionAfter);
  report.scenarios.push({ scenario: 'campaign-authority-successor-preserves-retained-process-source-and-projections', status: 'passed' });
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
