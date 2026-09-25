import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { sha256 } from './prCControlledHumanEnvironment.mjs';
import { createControlledHumanPostgresClientConfig } from './prCControlledHumanPostgresTls.mjs';

const { Client } = pg;
export const SYNTHETIC_MIGRATION_FILE = 'supabase/migrations/20260924113000_pr_c_synthetic_acceptance_execution_kind.sql';
export const SYNTHETIC_MIGRATION_VERSION = '20260924113000';
export const SYNTHETIC_MIGRATION_NAME = 'pr_c_synthetic_acceptance_execution_kind';
export const SYNTHETIC_PRIOR_VERSION = '20260924052038';
export const SYNTHETIC_PRIOR_NAME = 'studio_independent_source_integration';
export const SYNTHETIC_CHAIN_START_VERSION = '20260904120000';
export const SYNTHETIC_CHAIN_START_NAME = 'pr_c_controlled_human_exercise_authority';
export const SYNTHETIC_INTERRUPTED_VERSION = '20260916083814';
export const SYNTHETIC_INTERRUPTED_NAME = 'assess_supporting_document_mapping';
export const SYNTHETIC_INTERRUPTED_MARKER_TIP = '20260916003000';

const fail = code => { throw new Error(code); };

export function classifySyntheticMigrationState(state) {
  const marker = state?.marker;
  if (!marker || marker.product_key !== 'avalaos-core' || marker.environment_class !== 'hosted_nonproduction_pilot'
    || marker.production_authorized !== false || marker.customer_data_authorized !== false || marker.real_provider_calls_authorized !== false)
    fail('PR_C_SYNTHETIC_MIGRATION_MARKER_REJECTED');
  if (state.liveExerciseCount !== 0) fail('PR_C_SYNTHETIC_MIGRATION_LIVE_EXERCISE_REJECTED');
  if (marker.migration_tip === SYNTHETIC_PRIOR_VERSION && state.latestVersion === SYNTHETIC_PRIOR_VERSION && state.latestName === SYNTHETIC_PRIOR_NAME
    && state.executionKindColumn === false && state.executionKindConstraint === false
    && state.sessionBindingTable === false && state.sessionBindingImmutableTrigger === false
    && state.humanExerciseTipAccepted === true && state.syntheticExerciseTipAccepted === false && state.markerAssertionTip === SYNTHETIC_CHAIN_START_VERSION
    && state.retainedAuthRecoveryAccepted === false) return 'pending';
  if (marker.migration_tip === SYNTHETIC_MIGRATION_VERSION && state.latestVersion === SYNTHETIC_MIGRATION_VERSION
    && state.latestName === SYNTHETIC_MIGRATION_NAME && state.executionKindColumn === true && state.executionKindConstraint === true
    && state.sessionBindingTable === true && state.sessionBindingImmutableTrigger === true
    && state.humanExerciseTipAccepted === true && state.syntheticExerciseTipAccepted === true && state.markerAssertionTip === SYNTHETIC_MIGRATION_VERSION
    && state.retainedAuthRecoveryAccepted === true) return 'current';
  fail('PR_C_SYNTHETIC_MIGRATION_STATE_REJECTED');
}

export function classifySyntheticMigrationChain(state, remote, local, targetFingerprint, expectedTargetFingerprint) {
  if (!state?.marker || state.marker.product_key !== 'avalaos-core' || state.marker.environment_class !== 'hosted_nonproduction_pilot'
    || state.marker.production_authorized !== false || state.marker.customer_data_authorized !== false
    || state.marker.real_provider_calls_authorized !== false || state.liveExerciseCount !== 0
    || targetFingerprint !== expectedTargetFingerprint)
    fail('PR_C_SYNTHETIC_MIGRATION_CHAIN_STATE_REJECTED');
  const boundary = local.findIndex(row => row.version === SYNTHETIC_CHAIN_START_VERSION);
  if (boundary < 0 || local.at(-1)?.version !== SYNTHETIC_MIGRATION_VERSION
    || local.length - boundary - 1 !== 19
    || remote.some((row, index) => row.version !== local[index]?.version || row.name !== local[index]?.name))
    fail('PR_C_SYNTHETIC_MIGRATION_CHAIN_HISTORY_REJECTED');
  if (remote.length === local.length && classifySyntheticMigrationState(state) === 'current')
    return { pendingMigrationCount: 0, priorVersion: SYNTHETIC_CHAIN_START_VERSION, targetVersion: SYNTHETIC_MIGRATION_VERSION };
  // The first protected attempt committed exactly four canonical migrations
  // before the next migration rejected retained deprovisioned history.
  if (remote.length === boundary + 5 && remote.at(-1)?.version === SYNTHETIC_INTERRUPTED_VERSION
    && remote.at(-1)?.name === SYNTHETIC_INTERRUPTED_NAME
    && state.marker.migration_tip === SYNTHETIC_INTERRUPTED_MARKER_TIP
    && state.latestVersion === SYNTHETIC_INTERRUPTED_VERSION && state.latestName === SYNTHETIC_INTERRUPTED_NAME
    && state.executionKindColumn === false && state.sessionBindingTable === false
    && state.retainedAuthRecoveryAccepted === false)
    return { pendingMigrationCount: local.length - remote.length, priorVersion: SYNTHETIC_CHAIN_START_VERSION, targetVersion: SYNTHETIC_MIGRATION_VERSION };
  if (remote.length !== boundary + 1 || state.marker.migration_tip !== SYNTHETIC_CHAIN_START_VERSION
    || state.latestVersion !== SYNTHETIC_CHAIN_START_VERSION || state.latestName !== SYNTHETIC_CHAIN_START_NAME
    || state.executionKindColumn !== false || state.sessionBindingTable !== false || state.retainedAuthRecoveryAccepted !== false)
    fail('PR_C_SYNTHETIC_MIGRATION_CHAIN_STATE_REJECTED');
  return { pendingMigrationCount: 19, priorVersion: SYNTHETIC_CHAIN_START_VERSION, targetVersion: SYNTHETIC_MIGRATION_VERSION };
}

export class SyntheticAcceptanceMigrationAdapter {
  constructor(connectionString) {
    this.client = new Client(createControlledHumanPostgresClientConfig(connectionString, { applicationName: 'avalaos_pr_c_synthetic_acceptance_migration' }));
  }
  async connect() { await this.client.connect(); }
  async close() { await this.client.end(); }
  async inspect() {
    const marker = (await this.client.query(`select product_key,environment_class,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized from public.hosted_pilot_environment_identity where singleton`)).rows[0] ?? null;
    const latest = (await this.client.query(`select version,name from supabase_migrations.schema_migrations order by version desc limit 1`)).rows[0] ?? null;
    const executionKindColumn = (await this.client.query(`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='pr_c_controlled_human_step_observations' and column_name='execution_kind' and is_nullable='NO' and column_default='''human''::text') present`)).rows[0].present;
    const executionKindConstraint = (await this.client.query(`select exists(select 1 from pg_constraint where conrelid='public.pr_c_controlled_human_step_observations'::regclass and conname='pr_c_observation_execution_kind_matches_record' and contype='c') present`)).rows[0].present;
    const sessionBindingTable = (await this.client.query(`select to_regclass('public.pr_c_synthetic_acceptance_session_bindings') is not null present`)).rows[0].present;
    const sessionBindingImmutableTrigger = sessionBindingTable && (await this.client.query(`select exists(select 1 from pg_trigger where tgrelid='public.pr_c_synthetic_acceptance_session_bindings'::regclass and tgname='pr_c_synthetic_acceptance_session_bindings_immutable' and not tgisinternal) present`)).rows[0].present;
    const exerciseTipExpression = (await this.client.query(`select pg_get_expr(conbin,conrelid,false) expression from pg_constraint where conrelid='public.pr_c_controlled_human_exercises'::regclass and conname='pr_c_controlled_human_exercises_migration_tip_check'`)).rows[0]?.expression ?? '';
    const humanExerciseTipAccepted = exerciseTipExpression.includes('20260904120000');
    const syntheticExerciseTipAccepted = exerciseTipExpression.includes('20260924113000');
    const markerDefinition = (await this.client.query(`select pg_get_functiondef('public.pr_c_controlled_human_assert_marker()'::regprocedure) definition`)).rows[0].definition;
    const markerAssertionTip = markerDefinition.includes("marker.migration_tip = '20260924113000'") ? SYNTHETIC_MIGRATION_VERSION
      : markerDefinition.includes("marker.migration_tip = '20260904120000'") ? '20260904120000' : null;
    const recoveryDefinition = (await this.client.query(`select pg_get_functiondef('public.pr_c_controlled_human_complete_recovery(text,text,text)'::regprocedure) definition`)).rows[0].definition;
    const retainedAuthRecoveryAccepted = recoveryDefinition.includes('user_record.banned_until');
    const liveExerciseCount = Number((await this.client.query(`select count(*)::int count from public.pr_c_controlled_human_exercises where lifecycle<>'deprovisioned'`)).rows[0].count);
    return { marker, latestVersion: latest?.version ?? null, latestName: latest?.name ?? null, executionKindColumn, executionKindConstraint, sessionBindingTable, sessionBindingImmutableTrigger, humanExerciseTipAccepted, syntheticExerciseTipAccepted, markerAssertionTip, retainedAuthRecoveryAccepted, liveExerciseCount };
  }
  async inspectChain() {
    await this.client.query(`select public.pr_c_controlled_human_assert_provider_state()`);
    const state = await this.inspect();
    const remote = (await this.client.query(`select version,name from supabase_migrations.schema_migrations order by version`)).rows;
    const local = (await readdir('supabase/migrations')).filter(name => /^\d{14}_[a-z0-9_]+[.]sql$/u.test(name)).sort()
      .map(name => ({ version: name.slice(0, 14), name: name.slice(15, -4) }));
    const identity = (await this.client.query(`select (select system_identifier::text from pg_control_system()) system_identifier,current_database() database_name,current_user database_role`)).rows[0];
    const targetFingerprint = sha256(`${identity.system_identifier}\0${identity.database_name}\0${identity.database_role}`);
    return classifySyntheticMigrationChain(state, remote, local, targetFingerprint, process.env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT);
  }
  async apply(migration) {
    await this.client.query('begin');
    try {
      await this.client.query(`select pg_advisory_xact_lock(hashtextextended('pr-c-synthetic-acceptance-migration',0))`);
      const state = classifySyntheticMigrationState(await this.inspect());
      if (state === 'current') { await this.client.query('rollback'); return { replayed: true }; }
      await this.client.query(migration.sql);
      await this.client.query(`insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2::text[],$3)`, [SYNTHETIC_MIGRATION_VERSION, [migration.sql], SYNTHETIC_MIGRATION_NAME]);
      await this.client.query('commit');
      if (classifySyntheticMigrationState(await this.inspect()) !== 'current') fail('PR_C_SYNTHETIC_MIGRATION_VERIFY_REJECTED');
      return { replayed: false };
    } catch (error) { await this.client.query('rollback').catch(() => undefined); throw error; }
  }
}

const loadMigration = async () => {
  const sql = await readFile(SYNTHETIC_MIGRATION_FILE, 'utf8');
  if (/^\s*(?:BEGIN|COMMIT)\s*;/imu.test(sql)) fail('PR_C_SYNTHETIC_MIGRATION_TRANSACTION_REJECTED');
  return { sql, digest: sha256(sql) };
};

export async function runSyntheticMigration(phase, adapter, migration) {
  if (process.env.PR_C_SYNTHETIC_ACCEPTANCE_POLICY !== 'solo-owner-synthetic-v1') fail('PR_C_SYNTHETIC_MIGRATION_POLICY_REJECTED');
  if (phase === 'chain-preflight') return { schemaVersion: 'pr-c-synthetic-acceptance-migration-1', phase, status: 'passed', ...await adapter.inspectChain() };
  const state = classifySyntheticMigrationState(await adapter.inspect());
  if (phase === 'preflight') return { schemaVersion: 'pr-c-synthetic-acceptance-migration-1', phase, status: 'passed', disposition: state, migrationVersion: SYNTHETIC_MIGRATION_VERSION, migrationDigest: migration.digest };
  if (phase === 'apply') return { schemaVersion: 'pr-c-synthetic-acceptance-migration-1', phase, status: 'passed', ...await adapter.apply(migration), migrationVersion: SYNTHETIC_MIGRATION_VERSION, migrationDigest: migration.digest };
  if (phase === 'verify' && state === 'current') return { schemaVersion: 'pr-c-synthetic-acceptance-migration-1', phase, status: 'passed', disposition: state, migrationVersion: SYNTHETIC_MIGRATION_VERSION, migrationDigest: migration.digest };
  fail('PR_C_SYNTHETIC_MIGRATION_VERIFY_REJECTED');
}

async function main() {
  const [phase, ...args] = process.argv.slice(2);
  if (!['chain-preflight', 'preflight', 'apply', 'verify'].includes(phase)) fail('usage: prCSyntheticAcceptanceMigration.mjs <chain-preflight|preflight|apply|verify> [--output path]');
  const outputIndex = args.indexOf('--output'); const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  const migration = await loadMigration();
  const adapter = new SyntheticAcceptanceMigrationAdapter(process.env.PR_C_CONTROLLED_HUMAN_DATABASE_URL);
  await adapter.connect();
  try {
    const result = await runSyntheticMigration(phase, adapter, migration);
    if (output) await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await adapter.close(); }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'PR_C_SYNTHETIC_MIGRATION_FAILED'}\n`); process.exitCode = 1; });
}
