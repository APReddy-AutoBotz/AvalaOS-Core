import assert from 'node:assert/strict';
import {
  AUTHENTICATED_HOSTED_OBSERVATION_SOURCES as sources,
  AUTHENTICATED_OBSERVATION_FILTER_COLUMNS as columns,
  AUTHENTICATED_HOSTED_SOURCE_QUERY,
  AUTHENTICATED_HOSTED_CAPTURE_QUERY,
  createAuthenticatedHostedObservationReader,
} from './authenticatedHostedObservationAdapter.mjs';
import pg from 'pg';
import { authenticatedEvidenceDigest } from './authenticatedBrowserCorrelation.mjs';

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
  void exerciseId;
  const selectedSql = AUTHENTICATED_HOSTED_SOURCE_QUERY;
  const parameters = [config.scope.organizationId, config.scope.workspaceId,
    Object.values(project.identities).map(identity => identity.id), project.projectId, project.processId];
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

export async function verifyAuthenticatedObservationSnapshot({ connectionString, db, config, project, exerciseId }) {
  assert.equal(new URL(connectionString).hostname, '127.0.0.1');
  const readerConnection = new pg.Client({ connectionString });
  await readerConnection.connect();
  const original = (await db.query('SELECT to_jsonb(x) value FROM public.assess_processes x WHERE id=$1',
    [project.processId])).rows[0].value;
  let capture;
  try {
    assert.equal((await db.query(`SELECT provolatile FROM pg_proc
      WHERE oid='public.authenticated_synthetic_observe(uuid,timestamptz,timestamptz)'::regprocedure`))
      .rows[0].provolatile, 's');
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(319320)');
    const reader = createAuthenticatedHostedObservationReader({ config, db: { query(sql, values) {
      assert.equal(sql, AUTHENTICATED_HOSTED_CAPTURE_QUERY);
      // Test-only lock after statement snapshot acquisition, before authority
      // execution. No sleeps in the reader and no altered product filters.
      const gated = sql.replace('WITH authority AS MATERIALIZED (',
        'WITH barrier AS MATERIALIZED (SELECT pg_advisory_xact_lock(319320)), authority AS MATERIALIZED (')
        .replace('statement_timestamp()) value', 'statement_timestamp()) value FROM barrier');
      return readerConnection.query(gated, values);
    } } });
    const from = new Date(Date.now() - 60_000).toISOString();
    capture = reader.capture({ exerciseId, from, project });
    void capture.catch(() => {});
    const deadline = performance.now() + 10_000;
    while (!(await db.query(`SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted`,
      [readerConnection.processID])).rowCount) {
      assert.ok(performance.now() < deadline, 'reader acquired its snapshot and reached the barrier');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    await db.query('UPDATE public.assess_processes SET updated_at=clock_timestamp() WHERE id=$1', [project.processId]);
    await db.query('COMMIT');
    const beforeCommitFrame = await capture;
    const processRecordHash = authenticatedEvidenceDigest({ source: 'assess_processes', identity: { id: project.processId } });
    const findProcess = frame => frame.records.find(row => row.recordHash === processRecordHash);
    assert.equal(findProcess(beforeCommitFrame).rowHash, authenticatedEvidenceDigest(original));
    const later = await createAuthenticatedHostedObservationReader({ config, db: readerConnection })
      .capture({ exerciseId, from, project });
    assert.notEqual(findProcess(later).rowHash, findProcess(beforeCommitFrame).rowHash);
    assert.ok(Date.parse(later.capturedAt) > Date.parse(beforeCommitFrame.capturedAt));
    return { stableAuthority: true, lateCommitExcluded: true, priorCommitIncluded: true };
  } finally {
    await db.query('ROLLBACK');
    await capture?.catch(() => {});
    await readerConnection.end();
    await db.query('UPDATE public.assess_processes SET updated_at=$2 WHERE id=$1',
      [project.processId, original.updated_at]);
  }
}
