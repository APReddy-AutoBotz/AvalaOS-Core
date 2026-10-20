import assert from 'node:assert/strict';
import { AUTHENTICATED_HOSTED_CAPTURE_QUERY, AUTHENTICATED_HOSTED_SOURCE_QUERY,
  AUTHENTICATED_HOSTED_OBSERVATION_SOURCES, AUTHENTICATED_OBSERVATION_FILTER_COLUMNS,
} from './authenticatedHostedObservationAdapter.mjs';
import { runObservationRoundTripProof } from './authenticatedObservationRoundTripProof.mjs';

// Frozen PR320 selector, used only by the local before/after mechanism proof.
const priorSource = source => {
  const columns = AUTHENTICATED_OBSERVATION_FILTER_COLUMNS[source.table];
  const field = name => columns.includes(name) ? `x.${name}::text` : 'NULL::text';
  const actor = source.actorFields.length
    ? `(${source.actorFields.map(name => `${field(name)}=ANY($3::text[])`).join(' OR ')})` : 'false';
  const indirect = source.table === 'studio_renditions'
    ? ` OR EXISTS(SELECT 1 FROM public.studio_rendition_attempts linked
        WHERE linked.id=x.attempt_id AND linked.requested_by=ANY($3::uuid[]))`
    : source.table === 'legacy_delivery_outcome_aggregates'
      ? ` OR EXISTS(SELECT 1 FROM public.delivery_work_items linked
          WHERE linked.id=x.task_id AND linked.project_id=$4::uuid)` : '';
  return `SELECT '${source.table}'::text source,to_jsonb(x) value FROM public.${source.table} x
    WHERE x.org_id::text=$1
      AND ${columns.includes('workspace_id') ? 'x.workspace_id::text=$2' : 'true'}
      AND (${actor} OR (${field('project_id')}=$4 OR ${field('process_id')}=$5
        OR ${field('source_process_id')}=$5)${indirect})`;
};

export async function runObservationDrainProof({ db, connectionString, config, adapter, project, ids, retainedIds, retainedActor }) {
  const baseline = AUTHENTICATED_HOSTED_CAPTURE_QUERY.replace(AUTHENTICATED_HOSTED_SOURCE_QUERY,
    AUTHENTICATED_HOSTED_OBSERVATION_SOURCES.map(priorSource).join('\nUNION ALL\n'));
  const candidate = AUTHENTICATED_HOSTED_CAPTURE_QUERY;
  assert.notEqual(candidate, baseline);
  const historyRows = 250000;
  await db.query(`INSERT INTO document_generations(org_id,workspace_id,project_id,created_by,template_id,artifacts)
    SELECT $1,$2,$3,$4,'brd',jsonb_build_object('synthetic',true)
    FROM generate_series(1,$5::int)`,
  [ids.org, ids.workspace, retainedIds.project, retainedActor, historyRows]);
  await db.query('ANALYZE public.document_generations');
  const values = [ids.org, ids.workspace, Object.values(ids.actors), project.projectId, project.processId,
    ids.exercise, new Date(Date.now() - 60_000).toISOString()];
  const explain = async sql => {
    const plan = (await db.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, values)).rows[0]['QUERY PLAN'][0];
    const scans = [];
    const visit = node => {
      if (node['Relation Name'] === 'document_generations') scans.push({
        type: node['Node Type'], rows: node['Actual Rows'], removed: node['Rows Removed by Filter'] ?? 0,
        blocksHit: node['Shared Hit Blocks'], blocksRead: node['Shared Read Blocks'],
      });
      for (const child of node.Plans ?? []) visit(child);
    };
    visit(plan.Plan);
    return { planningMs: plan['Planning Time'], executionMs: plan['Execution Time'],
      jitMs: plan.JIT?.Timing?.Total ?? 0, scans };
  };
  const plans = { baseline: await explain(baseline), candidate: await explain(candidate) };
  console.log(JSON.stringify({ kind: 'local-drain-query-plans', historyRows, plans }));
  const results = {};
  for (const [name, captureQuery] of [['baseline', baseline], ['candidate', candidate]]) {
    results[name] = await runObservationRoundTripProof({ connectionString, config, adapter, project, ids,
      expectedStatements: 3, captureQuery, scenarios: [[33, 0]], expectedTimeout: () => name === 'baseline' });
  }
  return { kind: 'local-indexable-observation-drain-proof', historyRows, injectedRoundTripMs: 0,
    historicalHostedCauseProven: false, plans, results };
}
