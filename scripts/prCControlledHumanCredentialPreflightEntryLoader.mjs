const PG_FIXTURE_URL = 'pr-c-credential-preflight-fixture:pg';
const SUPABASE_FIXTURE_URL = 'pr-c-credential-preflight-fixture:supabase';

const pgFixtureSource = String.raw`
import { appendFileSync } from 'node:fs';

const record = value => {
  const target = process.env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH;
  if (target) appendFileSync(target, value + '\n', 'utf8');
};

const emptyDomainCounts = Object.freeze({
  assess_processes: 0,
  assess_v2_cases: 0,
  assess_v2_studio_handoffs: 0,
  enterprise_module_handoffs: 0,
  studio_artifacts: 0,
  studio_source_packages: 0,
  delivery_handoffs: 0,
  delivery_packages: 0,
  monitor_baselines: 0,
  pilot_environments: 0,
  pilot_tenants: 0,
});

class Client {
  constructor(config) {
    this.config = config;
    record('client-created');
  }

  async connect() { record('connect'); }
  async end() { record('close'); }

  async query(input) {
    const sql = typeof input === 'string' ? input : input?.text;
    if (typeof sql !== 'string') throw new Error('fixture-query-shape');
    const normalized = sql.replace(/\s+/gu, ' ').trim().toLowerCase();
    if (normalized === 'begin transaction isolation level repeatable read read only') {
      record('begin-read-only');
      return { rows: [] };
    }
    if (normalized === 'show transaction_read_only') {
      record('show-read-only');
      return { rows: [{ transaction_read_only: 'on' }] };
    }
    if (normalized.startsWith('set local statement_timeout')) {
      record('statement-timeout');
      return { rows: [] };
    }
    if (normalized.startsWith('set local idle_in_transaction_session_timeout')) {
      record('idle-timeout');
      return { rows: [] };
    }
    if (normalized === 'rollback') {
      record('rollback');
      return { rows: [] };
    }
    if (normalized.includes('from pg_control_system()')) {
      record('inspect-target');
      return { rows: [{
        system_identifier: 'fixture-system',
        database_name: 'postgres',
        database_role: process.env.PR_C_PREFLIGHT_FIXTURE_DATABASE_ROLE,
      }] };
    }
    if (normalized.includes('from public.hosted_pilot_environment_identity')) {
      record('inspect-marker');
      return { rows: [{
        product_key: 'avalaos-core',
        environment_class: 'hosted_nonproduction_pilot',
        migration_tip: '20260831062024',
        production_authorized: false,
        customer_data_authorized: false,
        real_provider_calls_authorized: false,
      }] };
    }
    if (normalized.includes('from auth.users') && normalized.includes('from public.profiles')) {
      record('inspect-counts');
      return { rows: [{ auth_users: 0, profiles: 0, organizations: 0, workspaces: 0 }] };
    }
    if (normalized.includes('assess_processes') && normalized.includes('pilot_operations_tenants')) {
      record('inspect-domain-counts');
      return { rows: [{ ...emptyDomainCounts }] };
    }
    if (normalized.includes("to_regclass('supabase_migrations.schema_migrations')")) {
      record('inspect-history-relation');
      return { rows: [{ relation: 'supabase_migrations.schema_migrations' }] };
    }
    if (normalized.includes("table_schema='supabase_migrations'") && normalized.includes("table_name='schema_migrations'")) {
      record('inspect-history-columns');
      return { rows: [{ column_name: 'name' }, { column_name: 'statements' }, { column_name: 'version' }] };
    }
    if (normalized.includes('from supabase_migrations.schema_migrations')) {
      record('inspect-history-tip');
      return { rows: [{ version: '20260831062024', name: 'accepted-pr-c-tip' }] };
    }
    if (normalized.includes("to_regclass('public.pr_c_controlled_human_exercises')")) {
      record('inspect-schema-ready');
      return { rows: [{ ready: false }] };
    }
    if (normalized.startsWith('select (select count(*) from public.')) {
      record('inspect-provider-count');
      return { rows: [{ total: 0 }] };
    }
    throw new Error('fixture-unexpected-query');
  }
}

export default Object.freeze({ Client });
`;

const supabaseFixtureSource = String.raw`
export const createClient = () => {
  throw new Error('fixture-unexpected-supabase-client');
};
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'pg') return { url: PG_FIXTURE_URL, shortCircuit: true };
  if (specifier === '@supabase/supabase-js') return { url: SUPABASE_FIXTURE_URL, shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === PG_FIXTURE_URL) return { format: 'module', source: pgFixtureSource, shortCircuit: true };
  if (url === SUPABASE_FIXTURE_URL) return { format: 'module', source: supabaseFixtureSource, shortCircuit: true };
  return nextLoad(url, context);
}
