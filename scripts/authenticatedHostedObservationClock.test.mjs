import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { AuthenticatedHostedController, authenticatedHostedDigest } from './authenticatedHostedController.mjs';
import { createAuthenticatedHostedObservationReader } from './authenticatedHostedObservationAdapter.mjs';

const tokenFor = (actorId, sessionId) => `header.${Buffer.from(JSON.stringify({
  sub: actorId,
  session_id: sessionId,
})).toString('base64url')}.signature-padding-that-keeps-the-token-bounded`;
const digest = character => `sha256:${character.repeat(64)}`;

const runClockCase = async ({ runnerStartedAt }) => {
  const actorId = randomUUID();
  const sessionId = randomUUID();
  const identities = Object.fromEntries(['author', 'reviewer', 'approver', 'outsider']
    .map(persona => [persona, { id: persona === 'author' ? actorId : randomUUID() }]));
  const project = { projectId: randomUUID(), processId: randomUUID(), identities };
  const scope = { organizationId: randomUUID(), workspaceId: randomUUID() };
  const databaseCutoff = '2026-10-10T00:00:10.000Z';
  const databaseFrames = [
    '2026-10-10T00:00:11.000Z',
    '2026-10-10T00:00:12.000Z',
  ];
  const captureParameters = [];
  const db = { async query(sql, parameters) {
    if (sql === 'SELECT public.authenticated_synthetic_observe($1,$2,statement_timestamp()) value') {
      captureParameters.push(parameters);
      const capturedAt = databaseFrames.shift();
      return { rows: [{ value: {
        capturedAt,
        exercise: null,
        actorSessions: [{
          actorHash: authenticatedHostedDigest(actorId),
          sessionHash: authenticatedHostedDigest(sessionId),
        }],
        permits: [],
        permitEvents: [],
      } }] };
    }
    assert.match(sql, /FROM public[.]assess_processes/u);
    return { rows: [] };
  } };
  const reader = createAuthenticatedHostedObservationReader({ db, config: { scope } });
  const config = {
    releaseSha: 'a'.repeat(40), deploymentId: 'deployment', migrationVersion: '20261010144356',
    backendDigest: digest('b'), secretBackendKind: 'supabase_vault', targetPublicDigest: digest('c'),
    baselineDigest: digest('d'), migrationDigest: digest('e'), exerciseDigest: digest('f'),
    catalogDigest: digest('1'), sourceDigest: digest('2'), origin: 'https://pilot.example.invalid', scope,
  };
  const runnerFrames = [runnerStartedAt, new Date(Date.parse(runnerStartedAt) + 1_000).toISOString()];
  const controller = new AuthenticatedHostedController({
    config,
    now: () => new Date(runnerFrames.shift()),
    identity: { verifySession: async () => ({ actorId, sessionId }) },
    adapter: {
      preflight: async () => ({
        syntheticTarget: true, production: false, releaseSha: config.releaseSha,
        deploymentId: config.deploymentId, migrationVersion: config.migrationVersion,
        backendDigest: config.backendDigest, providersEnabled: false, runtimeReady: true,
        secretBackendKind: config.secretBackendKind, secretBackendWritable: true,
        publicTargetDigest: config.targetPublicDigest, baselineDigest: config.baselineDigest,
        customerRows: 0, unapprovedActiveResidue: 0, scopeReady: true,
        observationStartedAt: databaseCutoff,
      }),
      activate: async () => {},
      bindSession: async () => {},
      observe: input => reader.capture(input),
    },
  });
  await controller.preflightAndActivate();
  controller.projects.set('desktop-chromium', {
    ...project,
    lastBoundaryAt: controller.observationStartedAt,
  });
  const started = await controller.beginBrowserAction({
    projectName: 'desktop-chromium',
    accessToken: tokenFor(actorId, sessionId),
    route: '/functions/v1/process-command',
    requestBody: { requestId: randomUUID(), commandType: 'process.update' },
  });
  await controller.finishBrowserAction({
    projectName: 'desktop-chromium',
    actionId: started.actionId,
    status: 403,
    responseBody: { error: { code: 'PERMISSION_DENIED' } },
  });
  await controller.recordBrowserCase({
    projectName: 'desktop-chromium', actionIds: [started.actionId],
    row: { testId: 'ASSESS-002', controls: { assertions: [
      { id: 'persisted-process-edit-denied', status: 'passed' },
      { id: 'unchanged-process-after-reload', status: 'passed' },
    ] } },
  });
  assert.deepEqual(captureParameters, [
    [controller.exerciseId, databaseCutoff],
    [controller.exerciseId, '2026-10-10T00:00:11.000Z'],
  ]);
  assert.deepEqual(controller.serverCases[0].window, {
    startedAt: '2026-10-10T00:00:11.000Z',
    completedAt: '2026-10-10T00:00:12.000Z',
  });
};

test('database-ahead and runner-ahead clocks cannot reverse or widen observation cursors', async () => {
  await runClockCase({ runnerStartedAt: '2026-10-10T00:00:00.000Z' });
  await runClockCase({ runnerStartedAt: '2026-10-10T00:01:00.000Z' });
});
