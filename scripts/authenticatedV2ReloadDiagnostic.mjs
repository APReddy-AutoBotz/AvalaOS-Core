import { isDeepStrictEqual } from 'node:util';

export const AUTHENTICATED_ACCEPTANCE_MODES = Object.freeze([
  'full_acceptance',
  'v2_primary_prefix_diagnostic',
  'reviewer_selection_diagnostic',
]);
export const AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA = 'authenticated-v2-reload-checkpoint-v2';
export const AUTHENTICATED_V2_RELOAD_DIAGNOSTIC_SCHEMA = 'authenticated-v2-primary-prefix-diagnostic-v2';
export const AUTHENTICATED_V2_RELOAD_PHASES = Object.freeze([
  'before-create',
  'before-reload',
  'after-reload',
]);
export const AUTHENTICATED_V2_RELOAD_READ_STAGES = Object.freeze([
  'case-discovery',
  'case',
  'decision',
  'draft-head',
  'primitives',
  'edges',
  'decision-points',
  'exception-paths',
  'application-assets',
  'application-interactions',
  'evidence-links',
]);
export const AUTHENTICATED_V2_RELOAD_COUNT_KEYS = Object.freeze([
  'v1Assessments',
  'v1AssessmentVersions',
  'v1ReadyAssessments',
  'cases',
  'caseVersions',
  'decisions',
  'assignments',
  'attestations',
  'changesRequested',
  'rejectedReviews',
  'approvedReviews',
  'governResolutions',
  'handoffs',
  'sourcePackages',
  'artifacts',
  'generationAttempts',
  'artifactVersions',
  'receipts',
  'audits',
]);

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const POSITIVE_INTEGER_TEXT = /^[1-9][0-9]*$/u;
const MAX_STAGE_ROWS = 10_000;
const MAX_STAGE_REQUESTS = 8;
const MAX_DOCUMENT_BYTES = 64 * 1024;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(`AUTHENTICATED_V2_RELOAD_DIAGNOSTIC_${code}`); };
const exactKeys = (value, expected, code) => {
  if (!record(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) fail(code);
};

export function authenticatedAcceptanceMode(environment = process.env) {
  const value = environment.AUTHENTICATED_ACCEPTANCE_MODE ?? 'full_acceptance';
  if (!AUTHENTICATED_ACCEPTANCE_MODES.includes(value)) fail('MODE_REJECTED');
  return value;
}

export const emptyAuthenticatedV2ReloadReadStages = () => AUTHENTICATED_V2_RELOAD_READ_STAGES.map(stage => ({
  stage,
  status: 'not_reached',
  httpStatus: null,
  rowCount: null,
  lifecycle: {
    requested: 0, responseStarted: 0, completed: 0, transportFailed: 0, pending: 0,
    bodyCompleted: 0, bodyFailed: 0, bodyPending: 0,
    transportFailures: { aborted: 0, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 },
  },
}));

const validateLifecycle = (value, status) => {
  exactKeys(value, [
    'requested', 'responseStarted', 'completed', 'transportFailed', 'pending',
    'bodyCompleted', 'bodyFailed', 'bodyPending',
    'transportFailures',
  ],
    'READ_STAGE_LIFECYCLE_REJECTED');
  for (const key of [
    'requested', 'responseStarted', 'completed', 'transportFailed', 'pending',
    'bodyCompleted', 'bodyFailed', 'bodyPending',
  ]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > MAX_STAGE_REQUESTS) {
      fail('READ_STAGE_LIFECYCLE_REJECTED');
    }
  }
  exactKeys(value.transportFailures, ['aborted', 'timeout', 'connection', 'protocol', 'blocked', 'other'],
    'READ_STAGE_LIFECYCLE_REJECTED');
  for (const key of ['aborted', 'timeout', 'connection', 'protocol', 'blocked', 'other']) {
    if (!Number.isSafeInteger(value.transportFailures[key]) || value.transportFailures[key] < 0
      || value.transportFailures[key] > MAX_STAGE_REQUESTS) fail('READ_STAGE_LIFECYCLE_REJECTED');
  }
  const classifiedTransportFailures = Object.values(value.transportFailures).reduce((sum, count) => sum + count, 0);
  if (value.responseStarted > value.requested || value.completed > value.responseStarted
    || value.completed + value.transportFailed + value.pending !== value.requested
    || value.bodyCompleted + value.bodyFailed + value.bodyPending !== value.responseStarted
    || classifiedTransportFailures !== value.transportFailed
    || (status === 'not_reached' && value.requested !== 0)
    || (status !== 'not_reached' && value.requested === 0)
    || (status === 'passed' && (value.responseStarted !== value.requested
      || value.completed !== value.requested || value.transportFailed !== 0 || value.pending !== 0
      || value.bodyCompleted !== value.requested || value.bodyFailed !== 0 || value.bodyPending !== 0))) {
    fail('READ_STAGE_LIFECYCLE_REJECTED');
  }
  return Object.freeze({ ...value, transportFailures: Object.freeze({ ...value.transportFailures }) });
};

export function validateAuthenticatedV2ReloadReadStages(value) {
  if (!Array.isArray(value) || value.length !== AUTHENTICATED_V2_RELOAD_READ_STAGES.length) {
    fail('READ_STAGES_REJECTED');
  }
  const normalized = value.map((row, index) => {
    exactKeys(row, ['stage', 'status', 'httpStatus', 'rowCount', 'lifecycle'], 'READ_STAGE_REJECTED');
    if (row.stage !== AUTHENTICATED_V2_RELOAD_READ_STAGES[index]
      || !['passed', 'failed', 'not_reached'].includes(row.status)) fail('READ_STAGE_REJECTED');
    const lifecycle = validateLifecycle(row.lifecycle, row.status);
    if (row.status === 'not_reached') {
      if (row.httpStatus !== null || row.rowCount !== null) fail('READ_STAGE_REJECTED');
    } else if (row.status === 'passed') {
      if (!Number.isInteger(row.httpStatus) || row.httpStatus < 200 || row.httpStatus > 299
        || !Number.isSafeInteger(row.rowCount) || row.rowCount < 0 || row.rowCount > MAX_STAGE_ROWS) {
        fail('READ_STAGE_REJECTED');
      }
      if (['case-discovery', 'case', 'draft-head'].includes(row.stage) && row.rowCount !== 1) {
        fail('READ_STAGE_REJECTED');
      }
      if (row.stage === 'decision' && ![0, 1].includes(row.rowCount)) fail('READ_STAGE_REJECTED');
    } else {
      if (row.httpStatus !== null
        && (!Number.isInteger(row.httpStatus) || row.httpStatus < 100 || row.httpStatus > 599)) {
        fail('READ_STAGE_REJECTED');
      }
      if (row.rowCount !== null
        && (!Number.isSafeInteger(row.rowCount) || row.rowCount < 0 || row.rowCount > MAX_STAGE_ROWS)) {
        fail('READ_STAGE_REJECTED');
      }
      if (row.httpStatus === null && row.rowCount !== null) fail('READ_STAGE_REJECTED');
    }
    if (lifecycle.responseStarted === 0 && row.httpStatus !== null) fail('READ_STAGE_REJECTED');
    if (lifecycle.responseStarted > 0 && row.httpStatus === null
      && !(lifecycle.requested > 1 && lifecycle.transportFailed > 0)) fail('READ_STAGE_REJECTED');
    return Object.freeze({ ...row, lifecycle });
  });
  const serial = normalized.slice(0, 4);
  for (let index = 1; index < serial.length; index += 1) {
    if (serial[index - 1].status === 'not_reached' && serial[index].status !== 'not_reached') {
      fail('READ_STAGE_ORDER_REJECTED');
    }
  }
  if (serial[3].status === 'not_reached' && normalized.slice(4).some(row => row.status !== 'not_reached')) {
    fail('READ_STAGE_ORDER_REJECTED');
  }
  return Object.freeze(normalized);
}

export function validateAuthenticatedV2ReloadCheckpoint(input) {
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_DOCUMENT_BYTES) fail('CHECKPOINT_TOO_LARGE');
  exactKeys(input, ['schemaVersion', 'phase', 'projectName', 'persona', 'accessToken', 'browser'],
    'CHECKPOINT_REJECTED');
  if (input.schemaVersion !== AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA
    || !AUTHENTICATED_V2_RELOAD_PHASES.includes(input.phase)
    || input.projectName !== 'desktop-chromium' || input.persona !== 'author'
    || !(input.accessToken === null || typeof input.accessToken === 'string')) fail('CHECKPOINT_REJECTED');
  if (input.accessToken === null && input.phase !== 'after-reload') fail('CHECKPOINT_REJECTED');
  if (typeof input.accessToken === 'string' && (input.accessToken.length < 32 || input.accessToken.length > 16_384)) {
    fail('CHECKPOINT_REJECTED');
  }
  exactKeys(input.browser, [
    'sessionObserved', 'selectedScopeObserved', 'selectedProcessObserved', 'serverContextObserved',
    'resumedDraftRendered', 'failureRendered', 'readStages',
  ], 'BROWSER_SNAPSHOT_REJECTED');
  for (const key of [
    'sessionObserved', 'selectedScopeObserved', 'selectedProcessObserved', 'serverContextObserved',
    'resumedDraftRendered', 'failureRendered',
  ]) if (typeof input.browser[key] !== 'boolean') fail('BROWSER_SNAPSHOT_REJECTED');
  if (input.browser.resumedDraftRendered && input.browser.failureRendered) fail('BROWSER_SNAPSHOT_REJECTED');
  const readStages = validateAuthenticatedV2ReloadReadStages(input.browser.readStages);
  if (input.phase !== 'after-reload'
    && (input.browser.resumedDraftRendered || input.browser.failureRendered
      || readStages.some(row => row.status !== 'not_reached'))) fail('BROWSER_SNAPSHOT_REJECTED');
  return Object.freeze({
    phase: input.phase,
    projectName: input.projectName,
    persona: input.persona,
    accessToken: input.accessToken,
    browser: Object.freeze({
      sessionObserved: input.browser.sessionObserved,
      selectedScopeObserved: input.browser.selectedScopeObserved,
      selectedProcessObserved: input.browser.selectedProcessObserved,
      serverContextObserved: input.browser.serverContextObserved,
      resumedDraftRendered: input.browser.resumedDraftRendered,
      failureRendered: input.browser.failureRendered,
      readStages,
    }),
  });
}

export function authenticatedV2ReloadProjectionCounts(frame) {
  if (!record(frame)) fail('PROJECTION_REJECTED');
  const counts = {};
  for (const key of AUTHENTICATED_V2_RELOAD_COUNT_KEYS) {
    if (!Number.isSafeInteger(frame[key]) || frame[key] < 0) fail('PROJECTION_REJECTED');
    counts[key] = frame[key];
  }
  return Object.freeze(counts);
}

const projectionDelta = (before, after) => Object.freeze(Object.fromEntries(
  AUTHENTICATED_V2_RELOAD_COUNT_KEYS.map(key => [key, after[key] - before[key]]),
));

export function buildAuthenticatedV2ReloadDiagnostic({ source, checkpoints, cleanup, reloadTargetUnchanged }) {
  exactKeys(source, ['releaseSha', 'runId', 'attempt', 'producer', 'sourceDigest'], 'SOURCE_REJECTED');
  if (!SHA.test(source.releaseSha) || !POSITIVE_INTEGER_TEXT.test(source.runId)
    || !POSITIVE_INTEGER_TEXT.test(source.attempt) || source.producer !== 'protected-hosted-controller'
    || !DIGEST.test(source.sourceDigest)) {
    fail('SOURCE_REJECTED');
  }
  if (!Array.isArray(checkpoints) || checkpoints.length > AUTHENTICATED_V2_RELOAD_PHASES.length) {
    fail('CHECKPOINT_INVENTORY_REJECTED');
  }
  const safeCheckpoints = checkpoints.map((checkpoint, index) => {
    exactKeys(checkpoint, ['phase', 'sessionContinuity', 'browser', 'projectionCounts'], 'CHECKPOINT_RECORD_REJECTED');
    if (checkpoint.phase !== AUTHENTICATED_V2_RELOAD_PHASES[index]
      || !['verified', 'missing', 'invalid'].includes(checkpoint.sessionContinuity)) {
      fail('CHECKPOINT_RECORD_REJECTED');
    }
    exactKeys(checkpoint.browser, [
      'sessionObserved', 'selectedScopeObserved', 'selectedProcessObserved', 'serverContextObserved',
      'resumedDraftRendered', 'failureRendered', 'readStages',
    ], 'CHECKPOINT_RECORD_REJECTED');
    for (const key of [
      'sessionObserved', 'selectedScopeObserved', 'selectedProcessObserved', 'serverContextObserved',
      'resumedDraftRendered', 'failureRendered',
    ]) if (typeof checkpoint.browser[key] !== 'boolean') fail('CHECKPOINT_RECORD_REJECTED');
    if (checkpoint.browser.resumedDraftRendered && checkpoint.browser.failureRendered) {
      fail('CHECKPOINT_RECORD_REJECTED');
    }
    const browser = Object.freeze({
      ...checkpoint.browser,
      readStages: validateAuthenticatedV2ReloadReadStages(checkpoint.browser.readStages),
    });
    return Object.freeze({
      phase: checkpoint.phase,
      sessionContinuity: checkpoint.sessionContinuity,
      browser,
      projectionCounts: authenticatedV2ReloadProjectionCounts(checkpoint.projectionCounts),
    });
  });
  exactKeys(cleanup, ['status'], 'CLEANUP_REJECTED');
  if (cleanup.status !== 'verified') fail('CLEANUP_REJECTED');
  const diagnosticCompleted = safeCheckpoints.length === AUTHENTICATED_V2_RELOAD_PHASES.length;
  if (diagnosticCompleted ? typeof reloadTargetUnchanged !== 'boolean' : reloadTargetUnchanged !== null) {
    fail('CHECKPOINT_INVENTORY_REJECTED');
  }
  const creationDelta = diagnosticCompleted
    ? projectionDelta(safeCheckpoints[0].projectionCounts, safeCheckpoints[1].projectionCounts) : null;
  const reloadDelta = diagnosticCompleted
    ? projectionDelta(safeCheckpoints[1].projectionCounts, safeCheckpoints[2].projectionCounts) : null;
  const reloadProjectionUnchanged = diagnosticCompleted
    ? reloadTargetUnchanged && Object.values(reloadDelta).every(value => value === 0) : null;
  const after = diagnosticCompleted ? safeCheckpoints[2] : null;
  const readFailed = after?.browser.readStages.some(row => row.status === 'failed') ?? false;
  const readIncomplete = after?.browser.readStages.some(row => row.status === 'not_reached') ?? true;
  const browserContinuity = after === null ? false : [
    after.browser.sessionObserved,
    after.browser.selectedScopeObserved,
    after.browser.selectedProcessObserved,
    after.browser.serverContextObserved,
  ].every(value => value === true);
  const observedOutcome = !diagnosticCompleted ? 'control_failure'
    : after.sessionContinuity !== 'verified' ? 'continuity_failure'
      : browserContinuity && after.browser.resumedDraftRendered && !after.browser.failureRendered
        && !readFailed && !readIncomplete
        ? 'draft_resumed'
        : readFailed || after.browser.failureRendered ? 'read_failure' : 'incomplete';
  const result = Object.freeze({
    schemaVersion: AUTHENTICATED_V2_RELOAD_DIAGNOSTIC_SCHEMA,
    mode: 'v2_primary_prefix_diagnostic',
    source: Object.freeze({ ...source }),
    project: 'desktop-chromium',
    persona: 'author',
    diagnosticCompleted,
    acceptancePromoted: false,
    observedOutcome,
    reloadProjectionUnchanged,
    creationDelta,
    reloadDelta,
    checkpoints: Object.freeze(safeCheckpoints),
    cleanup: Object.freeze({ status: 'verified' }),
  });
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) fail('OUTPUT_TOO_LARGE');
  if (/access[_-]?token|refresh[_-]?token|service[_-]?role|password|targetHash|recordHash|rowHash|https?:\/\//iu.test(serialized)) {
    fail('OUTPUT_PRIVACY_REJECTED');
  }
  return result;
}
