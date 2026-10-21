import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

import { AuthenticatedHostedController, authenticatedHostedDigest,
  AUTHENTICATED_HOSTED_PREPARATION_MAX } from './authenticatedHostedController.mjs';

const projectName = 'desktop-chromium';
const digest = value => authenticatedHostedDigest(value);
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const createController = ({ observe, recordBrowserAction = async () => undefined,
  verifyAssessmentFinalizeCase, cleanup = false } = {}) => {
  let nextId = 0;
  const calls = [];
  const adapter = {
    observe: observe ?? (async () => ({ capturedAt: `2026-10-21T00:00:${String(++nextId).padStart(2, '0')}.000Z`, records: [] })),
    recordBrowserAction: async input => { calls.push(input.status); return recordBrowserAction(input); },
    ...(verifyAssessmentFinalizeCase ? { verifyAssessmentFinalizeCase } : {}),
    ...(cleanup ? {
      quiesce: async () => undefined,
      cleanup: async () => undefined,
      verifyCleanup: async () => ({ activeSessions: 0, activeIdentities: 0, activeMemberships: 0,
        armedPermits: 0, activeSecretMaterial: 0, unapprovedActiveResidue: 0,
        nonExerciseChanged: false, immutableHistoryPreserved: true }),
    } : {}),
  };
  const controller = new AuthenticatedHostedController({
    config: { scope: { organizationId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222' }, acceptanceMode: 'full_acceptance' },
    adapter,
    identity: { revokeAll: async () => undefined },
    randomId: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
  });
  controller.active = true;
  controller.projects.set(projectName, { lastBoundaryAt: '2026-10-20T23:59:59.000Z' });
  controller.resolveBrowserActionBinding = async () => ({ actorHash: digest('actor'), sessionHash: digest('session'),
    persona: 'author', actorId: '33333333-3333-4333-8333-333333333333',
    sessionId: '44444444-4444-4444-8444-444444444444' });
  return { controller, calls };
};

const begin = controller => controller.beginBrowserAction({ projectName, accessToken: 'fixture',
  requestBody: { method: 'POST' }, route: '/functions/v1/process-command' });

test('production fail-stop queue joins later prepared reads but suppresses their commits', async () => {
  const source = readFileSync(new URL('../tests/browser/authenticatedLifecycleHarness.ts', import.meta.url), 'utf8');
  const exports = {};
  new Function('exports', ts.transpileModule(source.slice(source.indexOf('export const createAuthenticatedLifecycleWorkQueue'),
    source.indexOf('const reportIdentityDiagnostic')), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText)(exports);
  const queue = exports.createAuthenticatedLifecycleWorkQueue();
  const laterCapture = deferred(), commitFailed = deferred();
  const failure = new Error('LOCAL_FIRST_COMMIT_FAILURE');
  let captures = 0;
  const { controller, calls } = createController({ cleanup: true,
    observe: async () => {
      const capture = ++captures;
      if (capture === 4) await laterCapture.promise;
      return { capturedAt: capture <= 2 ? '2026-10-21T00:00:01.000Z' : '2026-10-21T00:00:02.000Z', records: [] };
    },
    recordBrowserAction: async () => { commitFailed.resolve(); throw failure; },
  });
  const actions = [await begin(controller), await begin(controller)];
  for (const action of actions) {
    const prepared = controller.control('/control/browser-action-prepare', {
      projectName, actionId: action.actionId, status: 200, responseBody: {},
    });
    queue.enqueue(async () => controller.control('/control/browser-action', {
      projectName, actionId: action.actionId, status: 200, preparationMode: 'server-owned', ...await prepared,
    }), prepared);
  }
  let settled = false;
  const drained = queue.drain().then(() => { throw new Error('FAILURE_WAS_DROPPED'); }, error => {
    assert.equal(error, failure); settled = true;
  });
  await commitFailed.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'later accepted capture remains owned');
  assert.equal(calls.length, 1);
  laterCapture.resolve();
  await drained;
  assert.equal(calls.length, 1, 'later record/secret hook never executes');
  assert.equal(controller.browserActions.get(projectName).some(action => action.complete), false);
  assert.equal(controller.projects.get(projectName).lastBoundaryAt, '2026-10-21T00:00:01.000Z');
  assert.equal(controller.browserActionPreparationSnapshot().ready, 1);
  await controller.abortAndQuiesce();
  assert.equal(controller.browserActionPreparations.size, 0);
  assert.equal(controller.controlOperations.size, 0);
});

test('server-owned preparation retains one private frame and finish consumes only its exact ack', async () => {
  const frames = [
    { capturedAt: '2026-10-21T00:00:01.000Z', records: [] },
    { capturedAt: '2026-10-21T00:00:02.000Z', records: [] },
  ];
  let captures = 0;
  const { controller, calls } = createController({ observe: async () => frames[captures++] });
  const action = await begin(controller);
  const responseBody = { outcome: 'accepted', privateFixture: 'never-returned' };
  await assert.rejects(controller.prepareBrowserAction({ projectName, actionId: action.actionId, status: 202,
    responseBody, scope: { injected: true } }), /BROWSER_ACTION_PREPARATION_REJECTED/u);
  const ack = await controller.prepareBrowserAction({ projectName, actionId: action.actionId, status: 202, responseBody });
  assert.deepEqual(Object.keys(ack).sort(), ['preparationId', 'responseDigest']);
  assert.equal(ack.responseDigest, digest(responseBody));
  assert.equal(JSON.stringify(ack).includes('privateFixture'), false);
  assert.equal(captures, 2);
  assert.equal(controller.browserActionPreparationSnapshot().ready, 1);
  await assert.rejects(controller.prepareBrowserAction({ projectName, actionId: action.actionId, status: 202, responseBody }),
    /BROWSER_ACTION_PREPARATION_BINDING_REJECTED/u);
  await assert.rejects(controller.finishBrowserAction({ projectName, actionId: action.actionId, status: 202,
    responseBody }), /BROWSER_ACTION_PREPARATION_REJECTED/u, 'legacy fallback is forbidden after preparation');
  await assert.rejects(controller.finishBrowserAction({ projectName, actionId: action.actionId, status: 201,
    preparationMode: 'server-owned', ...ack }), /BROWSER_ACTION_PREPARATION_BINDING_REJECTED/u);
  assert.deepEqual(await controller.finishBrowserAction({ projectName, actionId: action.actionId, status: 202,
    preparationMode: 'server-owned', ...ack }), { recorded: true, actionId: action.actionId });
  assert.equal(captures, 2, 'prepared finish cannot recapture');
  assert.deepEqual(calls, [202]);
  assert.equal(controller.browserActionPreparationSnapshot().ready, 0);
  await assert.rejects(controller.finishBrowserAction({ projectName, actionId: action.actionId, status: 202,
    preparationMode: 'server-owned', ...ack }), /BROWSER_ACTION_BINDING_REJECTED/u);
});

test('preparation scheduler caps four reads while serial finish preserves response order', async () => {
  const beforeFrames = Array.from({ length: 5 }, (_, index) => ({
    capturedAt: `2026-10-21T00:00:0${index + 1}.000Z`, records: [],
  }));
  const captureGates = [];
  let calls = 0; let active = 0; let maxActive = 0;
  const { controller, calls: commits } = createController({ observe: async () => {
    if (calls < beforeFrames.length) return beforeFrames[calls++];
    const index = calls++ - beforeFrames.length;
    const gate = deferred();
    captureGates[index] = gate;
    active += 1; maxActive = Math.max(maxActive, active);
    await gate.promise;
    active -= 1;
    return { capturedAt: `2026-10-21T00:01:0${index + 1}.000Z`, records: [] };
  } });
  const actions = [];
  for (let index = 0; index < 5; index++) actions.push(await begin(controller));
  const preparations = actions.map((action, index) => controller.prepareBrowserAction({
    projectName, actionId: action.actionId, status: 200 + index, responseBody: { index },
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, AUTHENTICATED_HOSTED_PREPARATION_MAX);
  assert.equal(maxActive, AUTHENTICATED_HOSTED_PREPARATION_MAX);
  assert.equal(controller.browserActionPreparationSnapshot().queued, 1);
  assert.equal(controller.browserActionPreparationSnapshot().maxQueued, 1);
  captureGates[1].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(captureGates.length, 5, 'queued capture starts when one slot releases');
  for (const gate of captureGates) gate.resolve();
  const acks = await Promise.all(preparations);
  assert.equal(controller.browserActionPreparationSnapshot().ready, 5);
  for (let index = 0; index < actions.length; index++) {
    await controller.finishBrowserAction({ projectName, actionId: actions[index].actionId, status: 200 + index,
      preparationMode: 'server-owned', ...acks[index] });
  }
  assert.deepEqual(commits, [200, 201, 202, 203, 204]);
  const snapshot = controller.browserActionPreparationSnapshot();
  assert.equal(snapshot.count, 5);
  assert.equal(snapshot.failed, 0);
  assert.equal(snapshot.inFlight, 0);
  assert.equal(snapshot.queued, 0);
  assert.equal(snapshot.ready, 0);
  assert.equal(snapshot.maxInFlight, AUTHENTICATED_HOSTED_PREPARATION_MAX);
});

test('abort clears an unused prepared frame and prevents any later commit', async () => {
  const frames = [
    { capturedAt: '2026-10-21T00:00:01.000Z', records: [] },
    { capturedAt: '2026-10-21T00:00:02.000Z', records: [{ privateFixture: 'discarded' }] },
  ];
  let capture = 0;
  const { controller, calls } = createController({ cleanup: true, observe: async () => frames[capture++] });
  const action = await begin(controller);
  const ack = await controller.prepareBrowserAction({ projectName, actionId: action.actionId, status: 200,
    responseBody: { privateFixture: 'discarded' } });
  assert.equal(controller.browserActionPreparationSnapshot().ready, 1);
  assert.deepEqual(await controller.abortAndQuiesce(), { quiesced: true });
  assert.equal(controller.browserActionPreparationSnapshot().ready, 0);
  assert.deepEqual(calls, []);
  await assert.rejects(controller.finishBrowserAction({ projectName, actionId: action.actionId, status: 200,
    preparationMode: 'server-owned', ...ack }), /INTAKE_CLOSED/u);
});

test('abort owns active and bounded queued preparations before cleanup', async () => {
  let captures = 0;
  const { controller, calls } = createController({ cleanup: true, observe: async ({ signal }) => {
    captures += 1;
    if (captures <= 6) {
      return { capturedAt: `2026-10-21T00:00:${String(captures).padStart(2, '0')}.000Z`, records: [] };
    }
    return new Promise((_resolve, reject) => {
      const onAbort = () => reject(new Error('OBSERVATION_ABORTED'));
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
  } });
  const actions = [];
  for (let index = 0; index < 6; index++) actions.push(await begin(controller));
  const preparations = actions.map((action, index) => controller.runControlOperation(signal => (
    controller.prepareBrowserAction({ projectName, actionId: action.actionId, status: 200,
      responseBody: { index } }, signal)
  )));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.browserActionPreparationSnapshot().inFlight, AUTHENTICATED_HOSTED_PREPARATION_MAX);
  assert.equal(controller.browserActionPreparationSnapshot().queued, 2);
  assert.deepEqual(await controller.abortAndQuiesce(), { quiesced: true });
  const settled = await Promise.allSettled(preparations);
  assert.equal(settled.every(item => item.status === 'rejected'), true);
  assert.deepEqual(calls, []);
  assert.equal(controller.controlOperations.size, 0);
  assert.equal(controller.browserActionPreparations.size, 0);
  const snapshot = controller.browserActionPreparationSnapshot();
  assert.equal(snapshot.inFlight, 0);
  assert.equal(snapshot.queued, 0);
  assert.equal(snapshot.ready, 0);
  assert.equal(snapshot.failed, 6);
});

test('failed serial commit destroys its prepared frame and cannot fall back or replay', async () => {
  const frames = [
    { capturedAt: '2026-10-21T00:00:01.000Z', records: [] },
    { capturedAt: '2026-10-21T00:00:02.000Z', records: [{ privateFixture: 'discarded-on-failure' }] },
  ];
  let capture = 0;
  const { controller, calls } = createController({
    observe: async () => frames[capture++],
    recordBrowserAction: async () => { throw new Error('RECORD_REJECTED'); },
  });
  const action = await begin(controller);
  const ack = await controller.prepareBrowserAction({ projectName, actionId: action.actionId, status: 200,
    responseBody: { privateFixture: 'discarded-on-failure' } });
  await assert.rejects(controller.finishBrowserAction({ projectName, actionId: action.actionId, status: 200,
    preparationMode: 'server-owned', ...ack }), /RECORD_REJECTED/u);
  assert.deepEqual(calls, [200]);
  assert.equal(controller.browserActionPreparationSnapshot().ready, 0);
  assert.equal(controller.browserActionPreparations.has(action.actionId), false);
  const retainedAction = controller.browserActions.get(projectName).find(item => item.actionId === action.actionId);
  assert.equal('rawRequestBody' in retainedAction, false);
  await assert.rejects(controller.finishBrowserAction({ projectName, actionId: action.actionId, status: 200,
    responseBody: {} }), /BROWSER_ACTION_BINDING_REJECTED/u, 'claimed commit cannot use legacy fallback');
  await assert.rejects(controller.finishBrowserAction({ projectName, actionId: action.actionId, status: 200,
    preparationMode: 'server-owned', ...ack }), /BROWSER_ACTION_BINDING_REJECTED/u, 'claimed commit cannot replay');
});

test('intake stop during awaited verification suppresses the later serial record effect', async () => {
  const verificationStarted = deferred();
  const releaseVerification = deferred();
  const frames = [
    { capturedAt: '2026-10-21T00:00:01.000Z', records: [] },
    { capturedAt: '2026-10-21T00:00:02.000Z', records: [] },
  ];
  let capture = 0;
  const { controller, calls } = createController({
    observe: async () => frames[capture++],
    verifyAssessmentFinalizeCase: async () => {
      verificationStarted.resolve();
      await releaseVerification.promise;
      return null;
    },
  });
  const action = await begin(controller);
  const retainedAction = controller.browserActions.get(projectName).find(item => item.actionId === action.actionId);
  retainedAction.route = '/functions/v1/assess-command';
  retainedAction.commandType = 'assessment.finalize';
  const ack = await controller.prepareBrowserAction({ projectName, actionId: action.actionId, status: 200,
    responseBody: {} });
  const finish = controller.runControlOperation(signal => controller.finishBrowserAction({
    projectName, actionId: action.actionId, status: 200, preparationMode: 'server-owned', ...ack,
  }, signal));
  await verificationStarted.promise;
  controller.stopControlIntake();
  releaseVerification.resolve();
  await assert.rejects(finish, /INTAKE_CLOSED/u);
  await controller.joinControlOperations();
  assert.deepEqual(calls, [], 'record hook remains suppressed after verifier cancellation');
  assert.equal(controller.browserActionPreparations.size, 0);
  assert.equal('rawRequestBody' in retainedAction, false);
});
