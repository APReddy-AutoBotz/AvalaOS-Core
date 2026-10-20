import assert from 'node:assert/strict';
import {
  AUTHENTICATED_HOSTED_OBSERVATION_SOURCES as sources,
  AUTHENTICATED_OBSERVATION_FILTER_COLUMNS as columns,
  createAuthenticatedHostedObservationReader,
} from './authenticatedHostedObservationAdapter.mjs';

// Frozen pre-correction selector, used only as a PostgreSQL equivalence oracle.
const legacyQuery = source => {
  const actor = source.actorFields.length
    ? `(${source.actorFields.map(field => `to_jsonb(x)->>'${field}'=ANY($3::text[])`).join(' OR ')})` : 'false';
  const indirect = source.table === 'studio_renditions'
    ? ` OR EXISTS(SELECT 1 FROM public.studio_rendition_attempts linked
        WHERE linked.id=x.attempt_id AND linked.requested_by=ANY($3::uuid[]))`
    : source.table === 'legacy_delivery_outcome_aggregates'
      ? ` OR EXISTS(SELECT 1 FROM public.delivery_work_items linked
          WHERE linked.id=x.task_id AND linked.project_id=$4::uuid)` : '';
  return `SELECT '${source.table}'::text source,to_jsonb(x) value FROM public.${source.table} x
    WHERE to_jsonb(x)->>'org_id'=$1
      AND (NOT(to_jsonb(x)?'workspace_id') OR to_jsonb(x)->>'workspace_id'=$2)
      AND (${actor} OR (to_jsonb(x)->>'project_id'=$4 OR to_jsonb(x)->>'process_id'=$5
        OR to_jsonb(x)->>'source_process_id'=$5)${indirect})`;
};

export const legacyAuthenticatedObservationQuery = sources.map(legacyQuery).join('\nUNION ALL\n');

export async function verifyAuthenticatedObservationQueryEquivalence({ db, config, project, exerciseId }) {
  const schema = (await db.query(`SELECT table_name,column_name,data_type
    FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])`,
  [sources.map(source => source.table)])).rows;
  assert.deepEqual(Object.keys(columns).sort(), sources.map(source => source.table).sort());
  for (const source of sources) {
    const actual = schema.filter(row => row.table_name === source.table);
    assert.ok(actual.some(row => row.column_name === 'org_id' && row.data_type === 'uuid'));
    const names = new Set(['workspace_id', ...source.actorFields, 'project_id', 'process_id', 'source_process_id']);
    const relevant = actual.filter(row => names.has(row.column_name));
    assert.ok(relevant.every(row => row.data_type === 'uuid'));
    assert.deepEqual([...columns[source.table]].sort(), relevant.map(row => row.column_name).sort(),
      `observation filter schema drift: ${source.table}`);
  }
  let selectedSql, parameters;
  const reader = createAuthenticatedHostedObservationReader({ config, db: { query: async (sql, values) => {
    if (sql.includes('UNION ALL')) { selectedSql = sql; parameters = values; return { rows: [] }; }
    return { rows: [{ value: { capturedAt: '2026-10-20T00:00:00.000Z',
      actorSessions: [], exercise: null, permits: [], permitEvents: [] } }] };
  } } });
  await reader.capture({ exerciseId, from: '2020-01-01T00:00:00.000Z', project });
  // Every source still returns the entire original row, but only matching
  // records are serialized. Absent fields and nullable workspaces stay absent.
  assert.equal((selectedSql.match(/to_jsonb\(x\)/gu) ?? []).length, sources.length);
  const normalize = rows => rows.map(row => JSON.stringify(row)).sort();
  let comparisons = 0;
  for (const values of [
    parameters,
    [parameters[0], null, ...parameters.slice(2)],
    ['00000000-0000-4000-8000-000000000000', ...parameters.slice(1)],
    [parameters[0], '00000000-0000-4000-8000-000000000000', ...parameters.slice(2)],
  ]) {
    const before = await db.query(legacyAuthenticatedObservationQuery, values);
    const after = await db.query(selectedSql, values);
    assert.deepEqual(normalize(after.rows), normalize(before.rows));
    comparisons++;
  }
  return { sources: sources.length, schemaMatched: true, equivalentScopes: comparisons };
}
