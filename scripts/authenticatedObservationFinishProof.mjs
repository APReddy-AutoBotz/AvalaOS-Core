import assert from 'node:assert/strict';
import { createAuthenticatedObservationReadPool } from './authenticatedObservationReadPool.mjs';
import { runObservationRoundTripProof } from './authenticatedObservationRoundTripProof.mjs';

// Both arms retain PR323's four readers. Only after-frame scheduling differs.
// The fanout and wire RTT are controlled stress inputs, not hosted measurements.
export async function runObservationFinishProof({ db, connectionString, config, adapter, project, ids, mode }) {
  assert.ok(['baseline', 'candidate'].includes(mode));
  const proof = await runObservationRoundTripProof({ connectionString, config, adapter, project, ids,
    expectedStatements: 3, scenarios: [[29, 400]], expectedTimeout: () => mode === 'baseline',
    prepareAfterCapture: mode === 'candidate',
    createQueryClient: ({ connectionString }) => {
      const read = createAuthenticatedObservationReadPool({ clientConfig: { connectionString,
        connectionTimeoutMillis: 20000, query_timeout: 30000, statement_timeout: 29000 } });
      return { connect: () => read.start(), end: () => read.end(), snapshot: () => read.snapshot(),
        resetMetrics: () => read.resetMetrics(), query: (sql, values) => sql.startsWith('UPDATE auth.sessions')
          ? db.query(sql, values) : read.query(sql, values) };
    },
  });
  return { kind: 'local-observation-finish-pipeline-proof', mode, controlledRttMs: 400, fanout: 29,
    fanoutBasis: 'Retained peak admissions; failing hosted window count unknown',
    historicalHostedCauseProven: false, proof };
}
