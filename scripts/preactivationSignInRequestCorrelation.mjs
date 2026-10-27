export const PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_SCHEMA =
  'preactivation-sign-in-request-correlation-v1';
export const PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION =
  'preactivation-sign-in-request-correlation';
export const PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_BYTE_CAP = 1_500;

const routeEnums = new Set([
  'tenant-session', 'process-command', 'eligible-reviewers', 'other-business', 'non-business',
]);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const boundedCount = value => Number.isInteger(value) && value >= 0 && value <= 999;
const boundedOrdinal = value => Number.isInteger(value) && value >= 1 && value <= 99;
const deepFreeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const routeEnum = value => {
  const route = typeof value === 'string' ? value : '';
  if (route === '/functions/v1/tenant-session') return 'tenant-session';
  if (route === '/functions/v1/process-command') return 'process-command';
  if (route === '/rest/v1/rpc/assess_v2_eligible_reviewers') return 'eligible-reviewers';
  if (/^\/(?:functions\/v1\/[a-z0-9-]+|rest\/v1\/rpc\/[a-z0-9_]+)$/u.test(route)) {
    return 'other-business';
  }
  return 'non-business';
};

const requestRoute = request => {
  try { return routeEnum(new URL(request.url()).pathname); } catch { return 'non-business'; }
};

const validateTarget = value => exactKeys(value, [
  'ordinal', 'route', 'requestEventSeen', 'routeSeen', 'admissionStarted', 'admissionSettled', 'gate',
]) && boundedOrdinal(value.ordinal) && routeEnums.has(value.route)
  && ['requestEventSeen', 'routeSeen', 'admissionStarted', 'admissionSettled']
    .every(key => typeof value[key] === 'boolean')
  && exactKeys(value.gate, ['armed', 'waiting', 'released'])
  && Object.values(value.gate).every(item => typeof item === 'boolean');

const validatePending = value => exactKeys(value, ['ordinal', 'route'])
  && boundedOrdinal(value.ordinal) && routeEnums.has(value.route);

export const validatePreactivationSignInRequestCorrelation = value => {
  if (!exactKeys(value, ['schemaVersion', 'state', 'target', 'pendingAdmissions', 'counts', 'overflow'])
    || value.schemaVersion !== PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_SCHEMA
    || !['captured', 'incomplete'].includes(value.state)
    || !(value.target === null || validateTarget(value.target))
    || !Array.isArray(value.pendingAdmissions) || value.pendingAdmissions.length > 16
    || !value.pendingAdmissions.every(validatePending)
    || new Set(value.pendingAdmissions.map(item => item.ordinal)).size !== value.pendingAdmissions.length
    || !exactKeys(value.counts, ['pendingAdmissions', 'activeActions'])
    || !boundedCount(value.counts.pendingAdmissions) || !boundedCount(value.counts.activeActions)
    || typeof value.overflow !== 'boolean') return null;
  if ((value.state === 'captured') !== (value.target !== null && !value.overflow)) return null;
  if (value.state === 'captured') {
    const targetPending = value.pendingAdmissions.find(item => item.ordinal === value.target.ordinal);
    if (value.counts.pendingAdmissions !== value.pendingAdmissions.length
      || (targetPending && targetPending.route !== value.target.route)
      || value.target.admissionSettled && !value.target.admissionStarted
      || (value.target.admissionStarted && !value.target.admissionSettled) !== Boolean(targetPending)) return null;
  }
  const serialized = JSON.stringify(value);
  return Buffer.byteLength(serialized, 'utf8') <= PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_BYTE_CAP
    ? value : null;
};

export const capturePreactivationSignInRequestCorrelationAnnotation = ({ collector, annotations, input }) => {
  try {
    const snapshot = collector.freeze(input);
    const description = JSON.stringify(snapshot);
    if (Buffer.byteLength(description, 'utf8') > PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_BYTE_CAP) return false;
    annotations.push({ type: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION, description });
    return true;
  } catch { return false; }
};

export const createPreactivationSignInRequestCorrelationCollector = () => {
  const entries = new WeakMap();
  const pending = new Set();
  let nextOrdinal = 1;
  let overflow = false;
  let frozen = null;
  const entryFor = request => {
    if (!request || (typeof request !== 'object' && typeof request !== 'function')) return null;
    const existing = entries.get(request);
    if (existing) return existing;
    if (nextOrdinal > 99) { overflow = true; return null; }
    const entry = { ordinal: nextOrdinal++, route: requestRoute(request), requestEventSeen: false,
      routeSeen: false, admissionStarted: false, admissionSettled: false };
    entries.set(request, entry);
    return entry;
  };
  const passive = operation => {
    if (frozen) return;
    try { operation(); } catch { overflow = true; }
  };
  const onRoute = request => passive(() => {
    if (requestRoute(request) === 'non-business') return;
    const entry = entryFor(request);
    if (entry) { entry.routeSeen = true; entry.route = requestRoute(request); }
  });
  const onRequest = request => passive(() => {
    if (requestRoute(request) === 'non-business') return;
    const entry = entryFor(request);
    if (entry) { entry.requestEventSeen = true; entry.route = requestRoute(request); }
  });
  const onStart = (request, classification) => passive(() => {
    const entry = entryFor(request);
    if (!entry) return;
    entry.route = routeEnum(classification?.route);
    entry.admissionStarted = true;
    pending.add(entry);
    if (pending.size > 16) overflow = true;
  });
  const onSettled = request => passive(() => {
    const entry = entryFor(request);
    if (!entry) return;
    entry.admissionSettled = true;
    pending.delete(entry);
  });
  const freeze = ({ targetRequest = null, gate = {}, pendingActionStarts = 0, activeActionCount = 0 } = {}) => {
    if (frozen) return frozen;
    const targetEntry = entryFor(targetRequest);
    const safeCount = value => {
      if (!boundedCount(value)) { overflow = true; return Math.max(0, Math.min(999, Number(value) || 0)); }
      return value;
    };
    const safePendingActionStarts = safeCount(pendingActionStarts);
    const safeActiveActionCount = safeCount(activeActionCount);
    if (safePendingActionStarts !== pending.size) overflow = true;
    if (targetEntry?.admissionSettled && !targetEntry.admissionStarted) overflow = true;
    const pendingAdmissions = [...pending].slice(0, 16).map(entry => ({
      ordinal: entry.ordinal, route: entry.route,
    }));
    if (pending.size > 16) overflow = true;
    const value = {
      schemaVersion: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_SCHEMA,
      state: targetEntry && !overflow ? 'captured' : 'incomplete',
      target: targetEntry ? {
        ordinal: targetEntry.ordinal,
        route: targetEntry.route,
        requestEventSeen: targetEntry.requestEventSeen,
        routeSeen: targetEntry.routeSeen,
        admissionStarted: targetEntry.admissionStarted,
        admissionSettled: targetEntry.admissionSettled,
        gate: { armed: gate.armed === true, waiting: gate.waiting === true, released: gate.released === true },
      } : null,
      pendingAdmissions,
      counts: { pendingAdmissions: safePendingActionStarts, activeActions: safeActiveActionCount },
      overflow,
    };
    frozen = validatePreactivationSignInRequestCorrelation(value)
      ? structuredClone(value)
      : { schemaVersion: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_SCHEMA, state: 'incomplete', target: null,
        pendingAdmissions: [], counts: { pendingAdmissions: 0, activeActions: 0 }, overflow: true };
    return deepFreeze(frozen);
  };
  return Object.freeze({
    actionDiagnostics: Object.freeze({ onStart, onSettled }),
    requestDiagnostics: Object.freeze({ onRoute, onRequest }),
    freeze,
  });
};
