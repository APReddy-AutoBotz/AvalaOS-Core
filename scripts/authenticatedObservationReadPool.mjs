import { performance } from 'node:perf_hooks';

import pg from 'pg';

import { AUTHENTICATED_HOSTED_SESSION_QUERY } from './authenticatedHostedControllerAdapters.mjs';
import { AUTHENTICATED_HOSTED_CAPTURE_QUERY } from './authenticatedHostedObservationAdapter.mjs';

export const READ_POOL_MAX = 4;

const METRIC_FIELDS = Object.freeze(['count', 'failed', 'totalMs', 'maxMs', 'inFlight', 'maxInFlight']);
const METRIC_LIMIT = 2_147_483_647;
const QUERY_KIND = new Map([
  [AUTHENTICATED_HOSTED_SESSION_QUERY, 'session'],
  [AUTHENTICATED_HOSTED_CAPTURE_QUERY, 'capture'],
]);

const bounded = value => Number.isFinite(value)
  ? Math.min(METRIC_LIMIT, Math.max(0, Math.round(value)))
  : 0;
const createMetric = () => ({ count: 0, failed: 0, totalMs: 0, maxMs: 0, inFlight: 0, maxInFlight: 0 });
const readonlyOptions = options => [options, '-c default_transaction_read_only=on'].filter(Boolean).join(' ');

export function createAuthenticatedObservationReadPool({
  clientConfig,
  createPool = config => new pg.Pool(config),
  now = () => performance.now(),
}) {
  if (!clientConfig || typeof clientConfig !== 'object') {
    throw new Error('AUTHENTICATED_OBSERVATION_READ_POOL_CONFIG_REQUIRED');
  }
  const pool = createPool({
    ...clientConfig,
    options: readonlyOptions(clientConfig.options),
    max: READ_POOL_MAX,
    min: READ_POOL_MAX,
  });
  const metrics = Object.fromEntries(['session', 'capture'].map(kind => [kind, {
    queue: createMetric(),
    service: createMetric(),
  }]));
  let state = 'created';
  let idleFailure = false;

  const record = async (metric, operation) => {
    metric.count = bounded(metric.count + 1);
    metric.inFlight = bounded(metric.inFlight + 1);
    metric.maxInFlight = Math.max(metric.maxInFlight, metric.inFlight);
    const startedAt = now();
    try {
      return await operation();
    } catch (error) {
      metric.failed = bounded(metric.failed + 1);
      throw error;
    } finally {
      const elapsed = bounded(now() - startedAt);
      metric.totalMs = bounded(metric.totalMs + elapsed);
      metric.maxMs = Math.max(metric.maxMs, elapsed);
      metric.inFlight = Math.max(0, metric.inFlight - 1);
    }
  };
  const onIdleError = () => { idleFailure = true; };
  if (typeof pool?.on !== 'function' || typeof pool?.connect !== 'function'
    || typeof pool?.end !== 'function') {
    throw new Error('AUTHENTICATED_OBSERVATION_READ_POOL_INVALID');
  }
  pool.on('error', onIdleError);

  const end = async () => {
    if (state === 'closed') return;
    state = 'closing';
    let closeError = null;
    try {
      await pool.end();
    } catch (error) {
      closeError = error;
    } finally {
      state = 'closed';
      if (typeof pool.off === 'function') pool.off('error', onIdleError);
      else if (typeof pool.removeListener === 'function') pool.removeListener('error', onIdleError);
    }
    if (closeError) throw closeError;
    if (idleFailure) throw new Error('AUTHENTICATED_OBSERVATION_READ_POOL_IDLE_FAILURE');
  };

  const start = async () => {
    if (state !== 'created') throw new Error('AUTHENTICATED_OBSERVATION_READ_POOL_START_REJECTED');
    state = 'starting';
    const warmups = await Promise.allSettled(
      Array.from({ length: READ_POOL_MAX }, () => Promise.resolve().then(() => pool.connect())),
    );
    const clients = warmups.filter(result => result.status === 'fulfilled').map(result => result.value);
    for (const client of clients) {
      try { client.release(); } catch { idleFailure = true; }
    }
    if (warmups.some(result => result.status === 'rejected') || idleFailure) {
      let cleanupError = null;
      try { await end(); } catch (error) { cleanupError = error; }
      const errors = [new Error('AUTHENTICATED_OBSERVATION_READ_POOL_WARMUP_FAILED')];
      if (cleanupError) errors.push(cleanupError);
      throw errors.length === 1 ? errors[0]
        : new AggregateError(errors, 'AUTHENTICATED_OBSERVATION_READ_POOL_WARMUP_CLEANUP_FAILED');
    }
    state = 'started';
  };

  const query = async (sql, values) => {
    const kind = QUERY_KIND.get(sql);
    if (!kind) throw new Error('AUTHENTICATED_OBSERVATION_READ_POOL_QUERY_REJECTED');
    if (state !== 'started' || idleFailure) {
      throw new Error('AUTHENTICATED_OBSERVATION_READ_POOL_UNAVAILABLE');
    }
    let client;
    let queryError;
    try {
      client = await record(metrics[kind].queue, () => pool.connect());
      if (idleFailure) throw new Error('AUTHENTICATED_OBSERVATION_READ_POOL_UNAVAILABLE');
      return await record(metrics[kind].service, () => client.query(sql, values));
    } catch (error) {
      queryError = error;
      throw error;
    } finally {
      if (client) client.release(queryError);
    }
  };

  const snapshot = () => Object.freeze(Object.fromEntries(['session', 'capture'].map(kind => [kind,
    Object.freeze(Object.fromEntries(['queue', 'service'].map(phase => [phase,
      Object.freeze(Object.fromEntries(METRIC_FIELDS.map(field => [field, bounded(metrics[kind][phase][field])]))),
    ]))),
  ])));

  const resetMetrics = () => {
    if (Object.values(metrics).some(kind => kind.queue.inFlight !== 0 || kind.service.inFlight !== 0)) {
      throw new Error('AUTHENTICATED_OBSERVATION_READ_POOL_METRICS_ACTIVE');
    }
    for (const kind of Object.values(metrics)) {
      for (const phase of [kind.queue, kind.service]) {
        for (const field of METRIC_FIELDS) phase[field] = 0;
      }
    }
  };

  return Object.freeze({ start, query, end, snapshot, resetMetrics });
}
