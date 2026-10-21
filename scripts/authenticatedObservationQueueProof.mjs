import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { AUTHENTICATED_HOSTED_CAPTURE_QUERY } from './authenticatedHostedObservationAdapter.mjs';
import { runObservationRoundTripProof } from './authenticatedObservationRoundTripProof.mjs';

// Test-only instrumentation of the installed pg driver's actual dequeue point.
// Service wall time includes transport/server/decoding; EXPLAIN below separately
// measures server planning/execution. No SQL, parameters or result rows survive.
function measuredSerialClient(connectionString, phase) {
  const client = new pg.Client({ connectionString });
  let metrics = {};
  const add = (key, duration) => {
    const m = metrics[key] ??= { count: 0, totalMs: 0, maxMs: 0 };
    const ms = Math.round(duration);m.count++;m.totalMs += ms;m.maxMs = Math.max(m.maxMs, ms);
  };
  return {
    connect: () => client.connect(), end: () => client.end(),
    on: (...args) => client.on(...args),
    query(sql, values) {
      const enqueued = performance.now();
      const key = `${phase.getStore() ?? 'identity'}:${sql.includes('FROM auth.sessions') ? 'session' : 'capture'}`;
      return new Promise((resolve, reject) => {
        let submitted;
        const query = new pg.Query(sql, values, (error, result) => {
          assert.notEqual(submitted, undefined);
          add(`${key}:queue`, submitted - enqueued);
          add(`${key}:service`, performance.now() - submitted);
          if (error) reject(error); else resolve(result);
        });
        const submit = query.submit.bind(query);
        query.submit = connection => { submitted = performance.now();return submit(connection); };
        client.query(query);
      });
    },
    snapshot: () => structuredClone(metrics),
    resetMetrics: () => { metrics = {}; },
  };
}

export async function runObservationQueueProof({ db, connectionString, config, adapter, project, ids, mode = 'baseline' }) {
  assert.ok(['baseline', 'candidate'].includes(mode));
  const values = [config.scope.organizationId,config.scope.workspaceId,Object.values(ids.actors),
    project.projectId,project.processId,ids.exercise,new Date(Date.now()-60_000).toISOString()];
  const explain = (await db.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${AUTHENTICATED_HOSTED_CAPTURE_QUERY}`,values))
    .rows[0]['QUERY PLAN'][0];
  const server = { planningMs: explain['Planning Time'], executionMs: explain['Execution Time'] };
  let createQueryClient;
  if (mode === 'baseline') createQueryClient = ({connectionString,phase}) => measuredSerialClient(connectionString,phase);
  else {
    const { createAuthenticatedObservationReadPool } = await import('./authenticatedObservationReadPool.mjs');
    createQueryClient = ({connectionString}) => {
      const read = createAuthenticatedObservationReadPool({clientConfig:{connectionString,connectionTimeoutMillis:20000,
        query_timeout:30000,statement_timeout:29000}});
      // Only the revoked-session fixture changes a row, through its separate
      // primary connection. The tested read facility never receives that write.
      return {connect:()=>read.start(),end:()=>read.end(),snapshot:()=>read.snapshot(),resetMetrics:()=>read.resetMetrics(),
        query:(sql,params)=>sql.startsWith('UPDATE auth.sessions') ? db.query(sql,params) : read.query(sql,params)};
    };
  }
  const proof = await runObservationRoundTripProof({connectionString,config,adapter,project,ids,
    expectedStatements:3,scenarios:[[28,200]],expectedTimeout:()=>mode==='baseline',createQueryClient});
  const result={kind:'local-observation-queue-service-proof',mode,controlledRttMs:200,fanout:28,
    fanoutBasis:'PR322 peak admissions; not the final actor-window request count',
    serviceMeaning:'Exclusive query submission to completion wall time, including transport/server/decoding',
    historicalHostedCauseProven:false,server,proof};
  writeFileSync(`output/local-private/authenticated-product-acceptance/observation-queue-${mode}-proof.json`,JSON.stringify(result,null,2)+'\n');
  return result;
}
