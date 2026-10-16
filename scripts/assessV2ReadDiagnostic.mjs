import { createHash } from 'node:crypto';

const sentinel = '00000000-0000-0000-0000-000000000000';
const errorCategories = new Map([
  ['42501', 'PERMISSION_DENIED'], ['42703', 'COLUMN_UNAVAILABLE'],
  ['42P01', 'RELATION_UNAVAILABLE'], ['PGRST204', 'COLUMN_CACHE_UNAVAILABLE'],
  ['PGRST205', 'RELATION_CACHE_UNAVAILABLE'], ['PGRST301', 'TOKEN_REJECTED'],
]);
const childTables = ['primitives', 'edges', 'decision_points', 'exception_paths',
  'application_assets', 'application_interactions', 'evidence_links'];
export const V2_READ_PROBES = Object.freeze([
  { stage: 'discovery', table: 'assess_v2_cases', select: 'id',
    filters: { org_id: `eq.${sentinel}`, workspace_id: `eq.${sentinel}`, process_id: `eq.${sentinel}`,
      deleted_at: 'is.null', status: 'neq.superseded' }, order: 'updated_at.desc,id.asc' },
  { stage: 'case', table: 'assess_v2_cases',
    select: 'id,org_id,workspace_id,process_id,owner_id,status,version,schema_version,rule_set_version,source_v1_assessment_id,source_v1_score_version,created_at,updated_at,head_version_id',
    filters: { id: `eq.${sentinel}`, deleted_at: 'is.null' } },
  { stage: 'decision', table: 'assess_v2_decision_versions',
    select: 'id,case_id,source_version_id,schema_version,rule_set_version,decision_version,validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,input_canonical,evidence_canonical,output_canonical,supersedes_decision_id,created_by,created_at',
    filters: { case_id: `eq.${sentinel}` }, order: 'created_at.desc' },
  { stage: 'head', table: 'assess_v2_case_versions', select: 'name,description,agent_necessity,imported_facts',
    filters: { id: `eq.${sentinel}` } },
  ...childTables.map(name => ({ stage: name, table: `assess_v2_${name}`, select: 'payload',
    filters: { version_id: `eq.${sentinel}` } })),
].map(item => Object.freeze({ ...item, filters: Object.freeze(item.filters) })));

export function v2ReadProbeUrl(origin, probe) {
  if (!V2_READ_PROBES.includes(probe)) throw new Error('V2_DIAGNOSTIC_PROBE_REJECTED');
  const base = new URL(origin);
  if (base.origin !== origin || base.username || base.password
    || !(base.protocol === 'https:' || (base.protocol === 'http:' && base.hostname === '127.0.0.1'))) {
    throw new Error('V2_DIAGNOSTIC_ORIGIN_REJECTED');
  }
  const url = new URL(`/rest/v1/${probe.table}`, base);
  url.searchParams.set('select', probe.select);
  for (const [key, value] of Object.entries(probe.filters)) url.searchParams.set(key, value);
  if (probe.order) url.searchParams.set('order', probe.order);
  url.searchParams.set('limit', '0');
  return url;
}

// No bodies, headers, addresses, IDs or database definitions leave these helpers.
export async function runV2RowFreeProbes({ origin, headers, fetchImpl = fetch }) {
  const results = [];
  for (const probe of V2_READ_PROBES) {
    let status = null;
    let category = 'TRANSPORT_UNAVAILABLE';
    try {
      const response = await fetchImpl(v2ReadProbeUrl(origin, probe), {
        method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
      });
      status = response.status;
      const body = await response.json();
      if (response.ok) {
        if (!Array.isArray(body) || body.length !== 0) throw new Error('V2_DIAGNOSTIC_ROWS_RETURNED');
        category = 'EMPTY_SUCCESS';
      } else {
        category = errorCategories.get(body?.code) ?? 'UNCLASSIFIED_HTTP_FAILURE';
      }
    } catch (error) {
      if (error?.message === 'V2_DIAGNOSTIC_ROWS_RETURNED') throw error;
    }
    results.push({ stage: probe.stage, status, category });
  }
  return results;
}

const tables = [...new Set(V2_READ_PROBES.map(probe => probe.table))];
export async function inspectV2ReadCatalog(db) {
  await db.query('BEGIN READ ONLY');
  try {
    await db.query("SET LOCAL statement_timeout='15s'");
    const rows = (await db.query(`SELECT c.relname AS name, c.relrowsecurity AS rls,
      c.relforcerowsecurity AS forced,
      has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
      has_schema_privilege('authenticated','public','USAGE') AS schema_usage,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod))
        ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      (SELECT jsonb_agg(jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
        'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'public' ELSE pg_get_userbyid(role_id) END ORDER BY role_id)
          FROM unnest(p.polroles) AS role_id),
        'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
        ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [tables])).rows;
    return tables.map(name => {
      const row = rows.find(item => item.name === name);
      const needed = new Set(V2_READ_PROBES.filter(p => p.table === name).flatMap(p =>
        [...p.select.split(','), ...Object.keys(p.filters), ...(p.order?.split(',').map(v => v.split('.')[0]) ?? [])]));
      return { table: name, exists: Boolean(row), rls: row?.rls ?? false, forced: row?.forced ?? false,
        authenticatedSelect: row?.authenticated_select ?? false, schemaUsage: row?.schema_usage ?? false,
        requiredColumnsPresent: Boolean(row && [...needed].every(column => row.columns.some(c => c.name === column))),
        policyCount: row?.policies?.length ?? 0,
        definitionDigest: createHash('sha256').update(JSON.stringify(row ? { columns: row.columns, policies: row.policies } : null)).digest('hex') };
    });
  } finally {
    await db.query('ROLLBACK');
  }
}
