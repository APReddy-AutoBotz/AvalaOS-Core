import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { AUTHENTICATED_HOSTED_CAPTURE_QUERY } from './authenticatedHostedObservationAdapter.mjs';

// Closed aggregate vocabulary: never retain SQL, arguments, results, errors,
// tokens, routes, actor identifiers or request identifiers. Query wall time
// includes pg.Client queue wait; it is deliberately not labelled server time.
export const OBSERVATION_TIMING_KEYS = Object.freeze([
  'admission', 'prepare', 'finish', 'identity', 'beforeObservation', 'afterObservation',
  'sessionQuery', 'beforeCaptureQuery', 'afterCaptureQuery',
]);
const LEGACY_OBSERVATION_TIMING_KEYS = Object.freeze(
  OBSERVATION_TIMING_KEYS.filter(key => key !== 'prepare'),
);
const FIELDS = ['count', 'failed', 'totalMs', 'maxMs', 'inFlight', 'maxInFlight'];
const LIMIT = 2_147_483_647;
const bounded = n => Number.isFinite(n) ? Math.min(LIMIT, Math.max(0, Math.round(n))) : 0;

export function validateObservationTimings(value) {
  if (!value) return null;
  const keys = Object.keys(value);
  const vocabulary = [OBSERVATION_TIMING_KEYS, LEGACY_OBSERVATION_TIMING_KEYS]
    .find(candidate => keys.length === candidate.length && keys.every(key => candidate.includes(key)));
  if (!vocabulary) return null;
  const result = {};
  for (const key of vocabulary) {
    const item = value[key];
    if (!item || Object.keys(item).length !== FIELDS.length
      || Object.keys(item).some(field => !FIELDS.includes(field))
      || FIELDS.some(field => !Number.isSafeInteger(item[field]) || item[field] < 0 || item[field] > LIMIT)
      || item.failed > item.count || item.inFlight > item.maxInFlight || item.maxInFlight > item.count
      || item.maxMs > item.totalMs) return null;
    result[key] = Object.freeze(Object.fromEntries(FIELDS.map(field => [field, item[field]])));
  }
  return Object.freeze(result);
}

export function createObservationTimings({ now = () => performance.now() } = {}) {
  const context = new AsyncLocalStorage();
  const metrics = Object.fromEntries(OBSERVATION_TIMING_KEYS.map(key => [key,
    { count: 0, failed: 0, totalMs: 0, maxMs: 0, inFlight: 0, maxInFlight: 0 }]));
  const measure = async (key, operation) => {
    const item = metrics[key];
    item.count = bounded(item.count + 1); item.inFlight = bounded(item.inFlight + 1);
    item.maxInFlight = Math.max(item.maxInFlight, item.inFlight);
    const start = now();
    try { return await operation(); }
    catch (error) { item.failed = bounded(item.failed + 1); throw error; }
    finally {
      const elapsed = bounded(now() - start);
      item.totalMs = bounded(item.totalMs + elapsed); item.maxMs = Math.max(item.maxMs, elapsed);
      item.inFlight--;
    }
  };
  const inAction = (key, operation) => context.run(key, () => measure(key, operation));
  const current = () => context.getStore();
  return Object.freeze({
    admission: operation => inAction('admission', operation),
    prepare: operation => inAction('prepare', operation),
    finish: operation => inAction('finish', operation),
    identity: operation => current() === 'admission' ? measure('identity', operation) : operation(),
    observe: operation => current() === 'admission' ? measure('beforeObservation', operation)
      : ['prepare', 'finish'].includes(current()) ? measure('afterObservation', operation) : operation(),
    query(database, sql, values) {
      const phase = current();
      const key = phase && sql === AUTHENTICATED_HOSTED_CAPTURE_QUERY
        ? (phase === 'admission' ? 'beforeCaptureQuery'
          : ['prepare', 'finish'].includes(phase) ? 'afterCaptureQuery' : null)
        : phase === 'admission' && typeof sql === 'string' && sql.includes('FROM auth.sessions')
          ? 'sessionQuery' : null;
      return key ? measure(key, () => database.query(sql, values)) : database.query(sql, values);
    },
    snapshot: () => validateObservationTimings(metrics),
  });
}
