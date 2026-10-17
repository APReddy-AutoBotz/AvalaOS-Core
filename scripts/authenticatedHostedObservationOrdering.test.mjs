import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthenticatedHostedController, authenticatedHostedDigest as digest } from './authenticatedHostedController.mjs';

const at = second => `2026-10-17T00:00:${String(second).padStart(2, '0')}.000Z`;
const frame = second => ({ capturedAt: at(second), records: [] });
const projectName = 'desktop-chromium';
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const binding = { persona: 'author', actorHash: digest('actor'), sessionHash: digest('session'),
  actorId: '20000000-0000-4000-8000-000000000001', sessionId: '20000000-0000-4000-8000-000000000002' };
const request = { projectName, accessToken: 'local-fixture', requestBody: { method: 'GET' },
  route: '/functions/v1/tenant-session' };

test('out-of-order action observations preserve a monotonic cutoff and each original frame', async () => {
  const observations = [];
  const controller = new AuthenticatedHostedController({ config: {}, identity: {}, adapter: {
    observe: input => { const pending = deferred(); observations.push({ ...pending, from: input.from }); return pending.promise; },
  } });
  controller.active = true;
  // Session authorization is outside this scheduling test; production frame
  // capture and action/case methods are exercised without a network or tokens.
  controller.resolveBrowserActionBinding = async () => binding;
  controller.projects.set(projectName, { lastBoundaryAt: at(0) });
  const firstStart = controller.beginBrowserAction(request);
  const secondStart = controller.beginBrowserAction(request);
  await Promise.resolve();
  assert.equal(observations.length, 2);
  assert.deepEqual(observations.map(item => item.from), [at(0), at(0)]);
  observations[1].resolve(frame(3));
  const second = await secondStart;
  observations[0].resolve(frame(1));
  const first = await firstStart;
  assert.equal(controller.projects.get(projectName).lastBoundaryAt, at(3));

  const firstFinish = controller.finishBrowserAction({ projectName, actionId: first.actionId, status: 200, responseBody: {} });
  const secondFinish = controller.finishBrowserAction({ projectName, actionId: second.actionId, status: 200, responseBody: {} });
  assert.deepEqual(observations.slice(2).map(item => item.from), [at(1), at(3)]);
  observations[3].resolve(frame(7));
  await secondFinish;
  observations[2].resolve(frame(6));
  await firstFinish;
  assert.equal(controller.projects.get(projectName).lastBoundaryAt, at(7));
  const actions = controller.browserActions.get(projectName);
  assert.deepEqual(actions.find(item => item.actionId === first.actionId).before, frame(1));
  assert.deepEqual(actions.find(item => item.actionId === first.actionId).after, frame(6));
  assert.deepEqual(actions.find(item => item.actionId === second.actionId).before, frame(3));
  assert.deepEqual(actions.find(item => item.actionId === second.actionId).after, frame(7));
  const thirdStart = controller.beginBrowserAction(request);
  await Promise.resolve();
  assert.equal(observations[4].from, at(7));
  observations[4].resolve(frame(8));
  await thirdStart;
});

for (const invalid of [false, true]) test(`late ${invalid ? 'rejected' : 'accepted'} case submission cannot rewind the observation cutoff`, async () => {
  const controller = new AuthenticatedHostedController({ config: {}, identity: {}, adapter: {} });
  controller.active = true;
  controller.projects.set(projectName, { lastBoundaryAt: at(10) });
  const actionId = digest('old-action');
  controller.browserActions.set(projectName, [{ actionId, occurredAt: at(1), ...binding,
    requestIdHash: digest('request'), browserPayloadHash: digest('payload'), commandBindingHash: digest('command'),
    response: { status: 403, classification: 'PERMISSION_DENIED' },
    route: '/functions/v1/process-command', status: 403, complete: true, before: frame(1), after: frame(2) }]);
  const row = { testId: 'ASSESS-002', controls: { assertions: invalid ? [] : [
    { id: 'persisted-process-edit-denied', status: 'passed' },
    { id: 'unchanged-process-after-reload', status: 'passed' },
  ] } };
  const record = controller.recordBrowserCase({ projectName, row, actionIds: [actionId] });
  if (invalid) await assert.rejects(record, /BROWSER_ASSERTIONS_REJECTED/);
  else await record;
  assert.equal(controller.projects.get(projectName).lastBoundaryAt, at(10));
  assert.equal(controller.browserCases.length, invalid ? 0 : 1);
  assert.equal(controller.serverCases.length, invalid ? 0 : 1);
  if (!invalid) {
    assert.deepEqual(controller.browserCases[0].window, { startedAt: at(1), completedAt: at(2) });
    assert.deepEqual(controller.serverCases[0].before, frame(1));
    assert.deepEqual(controller.serverCases[0].after, frame(2));
  }
});
