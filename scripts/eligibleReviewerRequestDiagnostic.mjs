export const ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_SCHEMA = 'eligible-reviewer-request-diagnostic-v1';
export const ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_ATTACHMENT = 'eligible-reviewer-request-diagnostic';
export const ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_MAX_BYTES = 1400;

const routes = ['queue', 'workspace', 'eligible'];
const requestStates = new Set(['not-observed', 'pending', 'settled', 'transport-failed']);
const outcomes = new Set(['unavailable', 'pending', 'empty', 'success', 'failed', 'incomplete']);
const statusClasses = new Set(['unavailable', 'success', 'client-error', 'server-error', 'other']);
const bindings = new Set(['equal', 'different', 'unavailable', 'ambiguous']);
const workspaceStates = new Set(['loading', 'visible', 'unavailable', 'unknown']);
const candidateStates = new Set(['selector-visible', 'loading', 'empty', 'failed', 'unknown']);
const correlations = new Set(['exact', 'ambiguous']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, expected) => record(value)
  && Object.keys(value).length === expected.length
  && expected.every(key => Object.hasOwn(value, key));
const boundedInt = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

const validateRequest = (value, route) => {
  if (!exactKeys(value, ['route', 'firstRequestOrdinal', 'requestCount', 'responseCount', 'pendingCount',
    'state', 'lastHttpStatus', 'statusClass', 'outcome', 'elapsedMs', 'elapsedSaturated'])
    || value.route !== route
    || !(value.firstRequestOrdinal === null || boundedInt(value.firstRequestOrdinal, 1, 99))
    || !boundedInt(value.requestCount, 0, 99)
    || !boundedInt(value.responseCount, 0, 99)
    || !boundedInt(value.pendingCount, 0, 99)
    || value.responseCount > value.requestCount || value.pendingCount > value.requestCount
    || value.responseCount + value.pendingCount > value.requestCount
    || !requestStates.has(value.state) || !outcomes.has(value.outcome)
    || !(value.lastHttpStatus === null || value.lastHttpStatus === 0 || boundedInt(value.lastHttpStatus, 100, 599))
    || !statusClasses.has(value.statusClass)
    || !boundedInt(value.elapsedMs, 0, 15_000)
    || typeof value.elapsedSaturated !== 'boolean'
    || value.elapsedSaturated !== (value.elapsedMs === 15_000)) return null;
  if ((value.requestCount === 0) !== (value.firstRequestOrdinal === null)
    || (value.requestCount === 0 && (value.state !== 'not-observed' || value.outcome !== 'unavailable'
      || value.lastHttpStatus !== null || value.statusClass !== 'unavailable'))
    || (value.pendingCount > 0 && value.state !== 'pending')
    || (value.state === 'pending' && (value.pendingCount === 0 || value.outcome !== 'pending'))
    || (value.state === 'settled' && (value.pendingCount !== 0 || value.responseCount === 0
      || value.lastHttpStatus === null || value.lastHttpStatus === 0))
    || (value.state === 'transport-failed' && (value.lastHttpStatus !== 0 || value.outcome !== 'failed'))
    || (value.lastHttpStatus === 0 && value.state !== 'transport-failed')
    || (value.statusClass === 'success' && !(value.lastHttpStatus >= 200 && value.lastHttpStatus <= 299))
    || (value.statusClass === 'client-error' && !(value.lastHttpStatus >= 400 && value.lastHttpStatus <= 499))
    || (value.statusClass === 'server-error' && !(value.lastHttpStatus >= 500 && value.lastHttpStatus <= 599))
    || (value.statusClass === 'unavailable' && value.lastHttpStatus !== null)
    || (value.lastHttpStatus === null && value.statusClass !== 'unavailable')
    || (value.lastHttpStatus !== null && value.lastHttpStatus >= 200 && value.lastHttpStatus <= 299
      && value.statusClass !== 'success')
    || (value.lastHttpStatus !== null && value.lastHttpStatus >= 400 && value.lastHttpStatus <= 499
      && value.statusClass !== 'client-error')
    || (value.lastHttpStatus !== null && value.lastHttpStatus >= 500 && value.lastHttpStatus <= 599
      && value.statusClass !== 'server-error')
    || (value.lastHttpStatus !== null && ((value.lastHttpStatus >= 100 && value.lastHttpStatus <= 199)
      || (value.lastHttpStatus >= 300 && value.lastHttpStatus <= 399) || value.lastHttpStatus === 0)
      && value.statusClass !== 'other')
    || (value.outcome === 'failed' && !['client-error', 'server-error', 'other'].includes(value.statusClass))
    || (['empty', 'success', 'incomplete'].includes(value.outcome) && value.statusClass !== 'success')) return null;
  return Object.freeze({ ...value });
};

export function validateEligibleReviewerRequestDiagnostic(value) {
  if (!exactKeys(value, ['schemaVersion', 'project', 'testCategory', 'assertion', 'pageOrdinal',
    'selectionOrdinal', 'frozen', 'elapsedMs', 'elapsedSaturated', 'requests', 'decisionBinding',
    'candidateCount', 'candidateCountSaturated', 'correlation', 'ui'])
    || value.schemaVersion !== ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_SCHEMA
    || !['desktop-chromium', 'pixel-7-chromium'].includes(value.project)
    || value.testCategory !== 'govern-studio-lifecycle'
    || value.assertion !== 'eligible-reviewer-visible'
    || !boundedInt(value.pageOrdinal, 1, 9)
    || !boundedInt(value.selectionOrdinal, 1, 9)
    || value.frozen !== true
    || !boundedInt(value.elapsedMs, 0, 15_000)
    || typeof value.elapsedSaturated !== 'boolean'
    || value.elapsedSaturated !== (value.elapsedMs === 15_000)
    || !Array.isArray(value.requests) || value.requests.length !== routes.length
    || !bindings.has(value.decisionBinding)
    || !(value.candidateCount === null || boundedInt(value.candidateCount, 0, 99))
    || typeof value.candidateCountSaturated !== 'boolean'
    || !correlations.has(value.correlation)
    || !exactKeys(value.ui, ['workspace', 'candidates'])
    || !workspaceStates.has(value.ui.workspace) || !candidateStates.has(value.ui.candidates)) return null;
  const requests = routes.map((route, index) => validateRequest(value.requests[index], route));
  if (requests.some(item => !item)) return null;
  const observedOrdinals = requests.map(item => item.firstRequestOrdinal).filter(item => item !== null);
  const requestTotal = requests.reduce((sum, item) => sum + item.requestCount, 0);
  if (requestTotal > 99 || new Set(observedOrdinals).size !== observedOrdinals.length
    || observedOrdinals.some(ordinal => ordinal > requestTotal)
    || requests.some(item => item.state === 'not-observed'
      && (item.responseCount !== 0 || item.pendingCount !== 0 || item.elapsedMs !== 0 || item.elapsedSaturated))) return null;
  if ((value.candidateCount === null && value.candidateCountSaturated)
    || (value.candidateCountSaturated && (value.candidateCount !== 99
      || requests[2].outcome !== 'incomplete' || value.correlation !== 'ambiguous'))
    || (!value.candidateCountSaturated && value.candidateCount !== null
      && !['empty', 'success'].includes(requests[2].outcome))
    || (value.candidateCount === 0 && requests[2].outcome !== 'empty')
    || (!value.candidateCountSaturated && value.candidateCount !== null
      && value.candidateCount > 0 && requests[2].outcome !== 'success')) return null;
  const safe = Object.freeze({ ...value, requests: Object.freeze(requests), ui: Object.freeze({ ...value.ui }) });
  return Buffer.byteLength(JSON.stringify(safe), 'utf8') <= ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_MAX_BYTES
    ? safe : null;
}
