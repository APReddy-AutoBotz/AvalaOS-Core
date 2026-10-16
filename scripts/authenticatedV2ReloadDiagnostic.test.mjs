import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA,
  AUTHENTICATED_V2_RELOAD_COUNT_KEYS,
  AUTHENTICATED_V2_RELOAD_PHASES,
  authenticatedAcceptanceMode,
  authenticatedV2ReloadProjectionCounts,
  buildAuthenticatedV2ReloadDiagnostic,
  emptyAuthenticatedV2ReloadReadStages,
  validateAuthenticatedV2ReloadCheckpoint,
  validateAuthenticatedV2ReloadReadStages,
} from './authenticatedV2ReloadDiagnostic.mjs';

const counts = value => Object.fromEntries(AUTHENTICATED_V2_RELOAD_COUNT_KEYS.map(key => [key, value]));
const failureClasses = (other = 0) => ({ aborted: 0, timeout: 0, connection: 0, protocol: 0, blocked: 0, other });
const browser = (overrides = {}) => ({
  sessionObserved: true,
  selectedScopeObserved: true,
  selectedProcessObserved: true,
  serverContextObserved: true,
  resumedDraftRendered: false,
  failureRendered: false,
  readStages: emptyAuthenticatedV2ReloadReadStages(),
  ...overrides,
});

test('full acceptance is the immutable default and the diagnostic mode is explicit', () => {
  assert.equal(authenticatedAcceptanceMode({}), 'full_acceptance');
  assert.equal(authenticatedAcceptanceMode({ AUTHENTICATED_ACCEPTANCE_MODE: 'full_acceptance' }), 'full_acceptance');
  assert.equal(authenticatedAcceptanceMode({ AUTHENTICATED_ACCEPTANCE_MODE: 'v2_primary_prefix_diagnostic' }),
    'v2_primary_prefix_diagnostic');
  assert.throws(() => authenticatedAcceptanceMode({ AUTHENTICATED_ACCEPTANCE_MODE: 'diagnostic' }), /MODE_REJECTED/u);
});

test('read stages are complete, canonical, prerequisite-bounded and cross-field checked', () => {
  assert.equal(validateAuthenticatedV2ReloadReadStages(emptyAuthenticatedV2ReloadReadStages()).length, 11);
  const passed = emptyAuthenticatedV2ReloadReadStages().map((row, index) => ({
    ...row,
    status: 'passed',
    httpStatus: index === 1 ? 206 : 200,
    rowCount: ['case-discovery', 'case', 'draft-head'].includes(row.stage) ? 1 : 0,
    lifecycle: { requested: 1, responseStarted: 1, completed: 1, transportFailed: 0, pending: 0,
      bodyCompleted: 1, bodyFailed: 0, bodyPending: 0, transportFailures: failureClasses() },
  }));
  assert.equal(validateAuthenticatedV2ReloadReadStages(passed)[1].httpStatus, 206);
  const requestFailed = structuredClone(passed);
  requestFailed[4] = { ...requestFailed[4], status: 'failed', httpStatus: null, rowCount: null,
    lifecycle: { requested: 1, responseStarted: 0, completed: 0, transportFailed: 1, pending: 0,
      bodyCompleted: 0, bodyFailed: 0, bodyPending: 0, transportFailures: failureClasses(1) } };
  for (let index = 5; index < requestFailed.length; index += 1) {
    requestFailed[index] = { ...requestFailed[index], status: 'not_reached', httpStatus: null, rowCount: null,
      lifecycle: { requested: 0, responseStarted: 0, completed: 0, transportFailed: 0, pending: 0,
        bodyCompleted: 0, bodyFailed: 0, bodyPending: 0, transportFailures: failureClasses() } };
  }
  assert.equal(validateAuthenticatedV2ReloadReadStages(requestFailed)[4].status, 'failed');
  const independentChildren = structuredClone(passed);
  independentChildren[5] = { ...independentChildren[5], status: 'not_reached', httpStatus: null, rowCount: null,
    lifecycle: { requested: 0, responseStarted: 0, completed: 0, transportFailed: 0, pending: 0,
      bodyCompleted: 0, bodyFailed: 0, bodyPending: 0, transportFailures: failureClasses() } };
  assert.equal(validateAuthenticatedV2ReloadReadStages(independentChildren)[6].status, 'passed');
  const retryAggregates = structuredClone(passed);
  retryAggregates[1] = { ...retryAggregates[1], status: 'failed', httpStatus: 503, rowCount: null };
  retryAggregates[3] = { ...retryAggregates[3], status: 'failed', httpStatus: 503, rowCount: null };
  assert.equal(validateAuthenticatedV2ReloadReadStages(retryAggregates)[4].status, 'passed');
  assert.throws(() => validateAuthenticatedV2ReloadReadStages(passed.toReversed()), /READ_STAGE_REJECTED/u);
  assert.throws(() => validateAuthenticatedV2ReloadReadStages(passed.map((row, index) => index === 0
    ? { ...row, httpStatus: 403 } : row)), /READ_STAGE_REJECTED/u);
  assert.throws(() => validateAuthenticatedV2ReloadReadStages(passed.map((row, index) => index === 0
    ? { ...row, rowCount: 0 } : row)), /READ_STAGE_REJECTED/u);
  assert.throws(() => validateAuthenticatedV2ReloadReadStages(passed.map((row, index) => index === 4
    ? { ...row, rowCount: 10_001 } : row)), /READ_STAGE_REJECTED/u);
  const gap = structuredClone(passed);
  gap[3] = { ...gap[3], status: 'not_reached', httpStatus: null, rowCount: null,
    lifecycle: { requested: 0, responseStarted: 0, completed: 0, transportFailed: 0, pending: 0,
      bodyCompleted: 0, bodyFailed: 0, bodyPending: 0, transportFailures: failureClasses() } };
  assert.throws(() => validateAuthenticatedV2ReloadReadStages(gap), /READ_STAGE_ORDER_REJECTED/u);

  const pendingBody = structuredClone(passed);
  pendingBody[1] = { ...pendingBody[1], status: 'failed', rowCount: null,
    lifecycle: { requested: 1, responseStarted: 1, completed: 0, transportFailed: 0, pending: 1,
      bodyCompleted: 0, bodyFailed: 0, bodyPending: 1, transportFailures: failureClasses() } };
  assert.equal(validateAuthenticatedV2ReloadReadStages(pendingBody)[1].lifecycle.bodyPending, 1);
  const malformedBody = structuredClone(passed);
  malformedBody[1] = { ...malformedBody[1], status: 'failed', rowCount: null,
    lifecycle: { requested: 1, responseStarted: 1, completed: 1, transportFailed: 0, pending: 0,
      bodyCompleted: 0, bodyFailed: 1, bodyPending: 0, transportFailures: failureClasses() } };
  assert.equal(validateAuthenticatedV2ReloadReadStages(malformedBody)[1].lifecycle.bodyFailed, 1);
  const inconsistentFailureClass = structuredClone(passed);
  inconsistentFailureClass[1].lifecycle.transportFailures.other = 1;
  assert.throws(() => validateAuthenticatedV2ReloadReadStages(inconsistentFailureClass),
    /READ_STAGE_LIFECYCLE_REJECTED/u);
  const rawFailure = structuredClone(requestFailed);
  rawFailure[4].lifecycle.transportFailures.errorText = 'forbidden raw transport text';
  assert.throws(() => validateAuthenticatedV2ReloadReadStages(rawFailure), /READ_STAGE_LIFECYCLE_REJECTED/u);
});

test('checkpoint parser accepts a transient missing post-reload session but no pre-reload omission', () => {
  const token = `aaa.${Buffer.from(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111',
    session_id: '22222222-2222-4222-8222-222222222222' })).toString('base64url')}.bbb`;
  const initial = validateAuthenticatedV2ReloadCheckpoint({
    schemaVersion: AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA,
    phase: 'before-create',
    projectName: 'desktop-chromium',
    persona: 'author',
    accessToken: token,
    browser: browser(),
  });
  assert.equal(initial.phase, 'before-create');
  assert.equal(initial.accessToken, token);
  const missing = validateAuthenticatedV2ReloadCheckpoint({
    schemaVersion: AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA,
    phase: 'after-reload',
    projectName: 'desktop-chromium',
    persona: 'author',
    accessToken: null,
    browser: browser({ sessionObserved: false, selectedScopeObserved: false, selectedProcessObserved: false,
      serverContextObserved: false }),
  });
  assert.equal(missing.accessToken, null);
  assert.throws(() => validateAuthenticatedV2ReloadCheckpoint({ ...initial, accessToken: null }),
    /CHECKPOINT_REJECTED/u);
  assert.throws(() => validateAuthenticatedV2ReloadCheckpoint({ ...initial, projectName: 'x'.repeat(70_000) }),
    /CHECKPOINT_TOO_LARGE/u);
});

test('dedicated result retains only counts, deltas and observations and never promotes acceptance', () => {
  const stages = emptyAuthenticatedV2ReloadReadStages().map(row => ({ ...row, status: 'passed', httpStatus: 200,
    rowCount: ['case-discovery', 'case', 'draft-head'].includes(row.stage) ? 1 : 0,
    lifecycle: { requested: 1, responseStarted: 1, completed: 1, transportFailed: 0, pending: 0,
      bodyCompleted: 1, bodyFailed: 0, bodyPending: 0, transportFailures: failureClasses() } }));
  const checkpoints = AUTHENTICATED_V2_RELOAD_PHASES.map((phase, index) => ({
    phase,
    sessionContinuity: 'verified',
    browser: browser(index === 2 ? { resumedDraftRendered: true, readStages: stages } : {}),
    projectionCounts: counts(index === 0 ? 0 : 1),
  }));
  const result = buildAuthenticatedV2ReloadDiagnostic({
    source: { releaseSha: 'a'.repeat(40), runId: '123', attempt: '1', producer: 'protected-hosted-controller',
      sourceDigest: `sha256:${'b'.repeat(64)}` },
    checkpoints,
    cleanup: { status: 'verified' },
    reloadTargetUnchanged: true,
  });
  assert.equal(result.observedOutcome, 'draft_resumed');
  assert.equal(result.diagnosticCompleted, true);
  assert.equal(result.acceptancePromoted, false);
  assert.equal(result.reloadProjectionUnchanged, true);
  assert.equal(result.creationDelta.cases, 1);
  assert.equal(result.reloadDelta.cases, 0);
  assert.doesNotMatch(JSON.stringify(result), /token|targetHash|https?:\/\//iu);
  const hostile = structuredClone(checkpoints);
  hostile[2].browser.sessionObserved = 'true';
  assert.throws(() => buildAuthenticatedV2ReloadDiagnostic({ source: result.source, checkpoints: hostile,
    cleanup: { status: 'verified' }, reloadTargetUnchanged: true }), /CHECKPOINT_RECORD_REJECTED/u);
  const missingServerContext = structuredClone(checkpoints);
  missingServerContext[2].browser.serverContextObserved = false;
  assert.equal(buildAuthenticatedV2ReloadDiagnostic({ source: result.source, checkpoints: missingServerContext,
    cleanup: { status: 'verified' }, reloadTargetUnchanged: true }).observedOutcome, 'incomplete');
});

test('projection sanitizer rejects missing, negative and raw-only frames', () => {
  assert.deepEqual(authenticatedV2ReloadProjectionCounts({ ...counts(0), targetHash: 'private' }), counts(0));
  assert.throws(() => authenticatedV2ReloadProjectionCounts({ ...counts(0), cases: -1 }), /PROJECTION_REJECTED/u);
  assert.throws(() => authenticatedV2ReloadProjectionCounts({ targetHash: 'private' }), /PROJECTION_REJECTED/u);
});

test('partial failure artifact preserves reached checkpoints without manufacturing completion', () => {
  const result = buildAuthenticatedV2ReloadDiagnostic({
    source: { releaseSha: 'a'.repeat(40), runId: '123', attempt: '1', producer: 'protected-hosted-controller',
      sourceDigest: `sha256:${'b'.repeat(64)}` },
    checkpoints: [{ phase: 'before-create', sessionContinuity: 'verified', browser: browser(),
      projectionCounts: counts(0) }],
    cleanup: { status: 'verified' },
    reloadTargetUnchanged: null,
  });
  assert.equal(result.diagnosticCompleted, false);
  assert.equal(result.observedOutcome, 'control_failure');
  assert.equal(result.creationDelta, null);
  assert.equal(result.reloadProjectionUnchanged, null);
  assert.equal(result.acceptancePromoted, false);
});
