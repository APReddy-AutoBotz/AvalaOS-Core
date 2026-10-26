import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import { AuthenticatedHostedController, authenticatedHostedBindResponseObservation,
  authenticatedHostedResponseObservation, startAuthenticatedHostedControllerServer }
  from './authenticatedHostedController.mjs';
import { AuthenticatedHostedBrowserActionTracker }
  from './authenticatedHostedBrowserRequestClassifier.mjs';
import {
  AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT,
  AUTHENTICATED_GOVERN_STUDIO_CASE_IDS,
  AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS,
} from './authenticatedGovernStudioDiagnostic.mjs';

const D = seed => `sha256:${createHash('sha256').update(seed).digest('hex')}`;

const loadCheckpointSettlementHarness = async () => {
  const declarations = [
    {
      file: path.resolve('tests/browser/authenticatedLifecycleHarness.ts'),
      names: new Set([
        'required', 'loopbackBaseUrl', 'boundedControlFailure', 'authenticatedLifecycleControlTimeoutMs',
        'authenticatedLifecycleControlStepTitles', 'authenticatedLifecycleControlStepTitle',
        'createAuthenticatedLifecycleControl', 'createAuthenticatedLifecycleWorkQueue',
      ]),
    },
    {
      file: path.resolve('tests/browser/authenticatedHostedNetwork.ts'),
      names: new Set([
        'authenticatedLifecycleSettleCheckpointBoundary',
        'authenticatedLifecycleSettleActorNavigationBoundary',
      ]),
    },
  ];
  const selected = [];
  for (const declaration of declarations) {
    const source = fs.readFileSync(declaration.file, 'utf8');
    const ast = ts.createSourceFile(declaration.file, source, ts.ScriptTarget.Latest, true);
    const matches = ast.statements.filter(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(item => ts.isIdentifier(item.name)
        && declaration.names.has(item.name.text)));
    assert.equal(matches.length, declaration.names.size);
    selected.push(...matches.map(node => source.slice(node.getStart(ast), node.end)));
  }
  const compiled = ts.transpileModule(selected.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
};

const actionRows = () => AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT.map((contract, index) => ({
  actionId: D(String.fromCharCode(97 + index)), occurredAt: `2026-10-24T00:00:${String(index * 2).padStart(2, '0')}.000Z`,
  actorHash: D('a'), sessionHash: D('b'), requestIdHash: D(`request-${index}`),
  requestResourceIdHash: D(`resource-${index}`), commandBindingHash: D('d'),
  response: { status: contract.status, classification: contract.key === 'reviewerGovernDenial' ? 'PERMISSION_DENIED' : 'COMMITTED' },
  persona: contract.persona, commandType: contract.commandType, complete: true, status: contract.status,
  before: { capturedAt: `2026-10-24T00:00:${String(index * 2).padStart(2, '0')}.000Z`, records: [] },
  after: { capturedAt: `2026-10-24T00:00:${String(index * 2 + 1).padStart(2, '0')}.000Z`,
    records: contract.key === 'approverGovernResolution'
      ? ['assess_command_receipts', 'assess_v2_cases', 'assess_v2_govern_resolutions', 'privileged_audit_events']
        .map((source, item) => ({ source, recordHash: D(String.fromCharCode(107 + item)), rowHash: D('f'), active: true })) : [] },
}));
const lineage = () => ({
  schemaVersion: 'authenticated-govern-studio-lineage-v1', verified: true,
  reviewerGovernCapabilityAbsent: true, approverGovernCapabilityPresent: true,
  approvedReviewCount: 1, governResolutionCount: 1, studioHandoffCount: 1,
  moduleHandoffCount: 1, studioSourcePackageCount: 1,
  sameScope: true, sameCase: true, sameDecision: true, sameReviewResolution: true,
  sameGovernResolution: true, sameAssessHandoff: true, sameModuleHandoff: true, sameSourcePackage: true,
  expectedCaseVersionAdvanced: true, governCaseWrites: 1, governResolutionWrites: 1,
  governReceiptWrites: 1, governAuditWrites: 1, governOtherWrites: 0,
  providerCalls: 0, paidCalls: 0, lineageDigest: D('f'),
});
const create = (mode = 'govern_studio_diagnostic') => {
  const adapter = { verifyGovernStudioDiagnosticLineage: async () => lineage() };
  const controller = new AuthenticatedHostedController({
    config: { acceptanceMode: mode, releaseSha: 'a'.repeat(40), sourceDigest: D('e'),
      workflow: { runId: '42', attempt: '1' } }, adapter,
    identity: { created: new Map(), unknownMutationOutcomes: new Set() },
    randomId: () => '10000000-0000-4000-8000-000000000001',
  });
  controller.active = true; controller.controlIntake = 'accepting';
  controller.projects.set('desktop-chromium', { processId: '10000000-0000-4000-8000-000000000002' });
  controller.browserActions.set('desktop-chromium', actionRows());
  return controller;
};

test('response observation binds only actual handler receipt and resource fields', () => {
  const receiptId = '10000000-0000-4000-8000-000000000001';
  const resourceId = '10000000-0000-4000-8000-000000000002';
  assert.deepEqual(authenticatedHostedResponseObservation({
    status: 201, responseBody: { ok: true, outcome: 'committed', receiptId, resourceId,
      resource: { handoffId: resourceId } },
  }), { status: 201, classification: 'COMMITTED', commandIdHash: D(resourceId), receiptIdHash: D(receiptId) });
  assert.deepEqual(authenticatedHostedResponseObservation({
    status: 403, responseBody: { ok: false, error: { code: 'PERMISSION_DENIED' } },
  }), { status: 403, classification: 'PERMISSION_DENIED', commandIdHash: null, receiptIdHash: null });
  const action = { actorHash: D('actor'), requestIdHash: D('request'), commandBindingHash: D('command') };
  assert.deepEqual(authenticatedHostedBindResponseObservation({
    observation: { status: 200, classification: 'COMMITTED', commandIdHash: null, receiptIdHash: null },
    action, after: { records: [{ effectKind: 'receipt', actorHash: action.actorHash,
      requestIdHash: action.requestIdHash, commandBindingHash: action.commandBindingHash,
      receiptIdHash: D(receiptId), commandIdHash: D(resourceId) }] },
  }), { status: 200, classification: 'COMMITTED', commandIdHash: D(resourceId), receiptIdHash: D(receiptId) });
});

test('checkpoint binds exact eight actions and closes mutation intake', async () => {
  const controller = create();
  const actionIds = controller.browserActions.get('desktop-chromium').map(row => row.actionId);
  assert.deepEqual(await controller.control('/control/govern-studio-diagnostic', {
    projectName: 'desktop-chromium', actionIds,
  }), { recorded: true, actionCount: 8, terminal: true });
  await assert.rejects(controller.control('/control/setup', { projectName: 'pixel-7-chromium' }),
    /GOVERN_STUDIO_DIAGNOSTIC_TERMINAL/u);
  await assert.rejects(controller.control('/control/browser-action-start', { projectName: 'desktop-chromium' }),
    /GOVERN_STUDIO_DIAGNOSTIC_TERMINAL/u);
});

test('owned checkpoint settlement waits for held tracker finish and submits exactly once',
  { timeout: 20_000 }, async () => {
    const {
      authenticatedLifecycleSettleActorNavigationBoundary,
      authenticatedLifecycleSettleCheckpointBoundary,
      createAuthenticatedLifecycleControl,
      createAuthenticatedLifecycleWorkQueue,
    } = await loadCheckpointSettlementHarness();
    let releaseHeldFinish;
    let enterHeldFinish;
    const heldFinish = new Promise(resolve => { releaseHeldFinish = resolve; });
    const heldFinishEntered = new Promise(resolve => { enterHeldFinish = resolve; });
    let clock = Date.parse('2026-10-26T00:00:00Z');
    let finishCalls = 0;
    let lineageCalls = 0;
    const identities = Object.fromEntries(['author', 'reviewer', 'approver', 'outsider'].map(persona => [
      persona, { id: randomUUID(), sessionId: randomUUID() },
    ]));
    const cleanupCalls = { quiesce: 0, revoke: 0, cleanup: 0, verify: 0 };
    const adapter = {
      bindSession: async () => undefined,
      observe: async () => ({ capturedAt: new Date(clock += 10).toISOString(), records: [] }),
      recordBrowserAction: async ({ requestBody }) => {
        if (requestBody.commandType === 'studio.handoff.consume') {
          enterHeldFinish();
          await heldFinish;
        }
        finishCalls += 1;
      },
      verifyGovernStudioDiagnosticLineage: async () => { lineageCalls += 1; return lineage(); },
      quiesce: async () => { cleanupCalls.quiesce += 1; },
      cleanup: async () => { cleanupCalls.cleanup += 1; },
      verifyCleanup: async () => {
        cleanupCalls.verify += 1;
        return {
          activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
          activeSecretMaterial: 0, unapprovedActiveResidue: 0,
          nonExerciseChanged: false, immutableHistoryPreserved: true,
        };
      },
    };
    const controller = new AuthenticatedHostedController({
      config: {
        acceptanceMode: 'govern_studio_diagnostic', releaseSha: 'a'.repeat(40), sourceDigest: D('source'),
        workflow: { runId: '42', attempt: '1' }, actorLimitMs: 15_000, providersEnabled: false,
      },
      adapter,
      identity: {
        created: new Map(), unknownMutationOutcomes: new Set(),
        verifySession: async ({ actorId, sessionId }) => ({ actorId, sessionId }),
        revokeAll: async () => { cleanupCalls.revoke += 1; },
      },
    });
    controller.active = true;
    controller.controlIntake = 'accepting';
    controller.projects.set('desktop-chromium', {
      processId: randomUUID(), identities, lastBoundaryAt: new Date(clock).toISOString(),
    });
    const server = await startAuthenticatedHostedControllerServer(controller, {
      requestTimeoutMs: 15_000, settlementTimeoutMs: 15_000,
    });
    let externalRequests = 0;
    const boundedFetch = async (url, options) => {
      if (new URL(url).origin !== server.baseUrl) {
        externalRequests += 1;
        throw new Error('NON_OWNED_ORIGIN');
      }
      return fetch(url, options);
    };
    const control = createAuthenticatedLifecycleControl({
      baseUrl: server.baseUrl, token: server.controlToken, timeoutMs: 15_000, fetchImpl: boundedFetch,
    });
    const queue = createAuthenticatedLifecycleWorkQueue();
    const tracker = new AuthenticatedHostedBrowserActionTracker({
      backendOrigin: 'http://127.0.0.1:9', appOrigin: 'http://127.0.0.1:10',
      startAction: input => control('/control/browser-action-start', {
        projectName: 'desktop-chromium', ...input,
      }),
      prepareAction: input => control('/control/browser-action-prepare', {
        projectName: 'desktop-chromium', ...input,
      }),
      finishAction: input => control('/control/browser-action', {
        projectName: 'desktop-chromium', ...input,
      }),
    });
    const bearer = (actorId, sessionId) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({
      sub: actorId, session_id: sessionId,
    })).toString('base64url')}.${'x'.repeat(48)}`;
    let checkpointCalls = 0;
    try {
      const references = [];
      for (const contract of AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT) {
        const actor = identities[contract.persona];
        const requestBody = {
          commandType: contract.commandType,
          requestId: randomUUID(),
          payload: {
            ...(contract.key === 'studioRequest'
              ? { upstreamHandoffId: randomUUID() }
              : contract.commandType.startsWith('studio.')
                ? { handoffId: randomUUID() } : { caseId: randomUUID() }),
          },
        };
        const route = contract.commandType.startsWith('studio.')
          ? '/functions/v1/studio-artifact-command' : '/functions/v1/assess-v2-command';
        const request = {
          url: () => `http://127.0.0.1:9${route}`,
          method: () => 'POST',
          postDataJSON: () => requestBody,
          allHeaders: async () => ({ authorization: `Bearer ${bearer(actor.id, actor.sessionId)}` }),
        };
        await tracker.begin(request);
        const responseBody = contract.status === 403
          ? { ok: false, error: { code: 'PERMISSION_DENIED' } }
          : { ok: true, outcome: 'committed', receiptId: randomUUID(), resourceId: randomUUID() };
        await tracker.prepare(request, contract.status, responseBody);
        queue.enqueue(() => tracker.finish(request, contract.status, responseBody));
        references.push(tracker.reference(request));
        if (contract.key !== 'studioConsume') await queue.drain();
      }
      const actionIds = await Promise.all(references);
      await heldFinishEntered;
      const actions = controller.browserActions.get('desktop-chromium');
      assert.equal(actions.length, 8);
      assert.equal(actions.filter(action => action.complete).length, 7);
      await assert.rejects(controller.recordGovernStudioDiagnosticCheckpoint({
        projectName: 'desktop-chromium', actionIds,
      }), /GOVERN_STUDIO_DIAGNOSTIC_ACTION_REJECTED/u);
      assert.equal(controller.governStudioCheckpoint, null);

      const settledCheckpoint = authenticatedLifecycleSettleCheckpointBoundary({
        settleOwnedNetwork: () => authenticatedLifecycleSettleActorNavigationBoundary({
          settleActionAdmissions: async () => undefined,
          settleResponseBodies: async () => undefined,
          drainNetworkActions: queue.drain,
          activeActionCount: () => 0,
          waitForNextObservation: () => new Promise(resolve => setImmediate(resolve)),
        }),
        checkpoint: async () => {
          checkpointCalls += 1;
          return control('/control/govern-studio-diagnostic', {
            projectName: 'desktop-chromium', actionIds: await Promise.all(references),
          });
        },
      });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(checkpointCalls, 0);
      assert.equal(controller.governStudioCheckpoint, null);
      releaseHeldFinish();
      assert.deepEqual(await settledCheckpoint, { recorded: true, actionCount: 8, terminal: true });
      assert.equal(checkpointCalls, 1);
      assert.equal(actions.filter(action => action.complete).length, 8);
      assert.equal(finishCalls, 8);
      assert.equal(lineageCalls, 1);
      await assert.rejects(control('/control/browser-action-start', { projectName: 'desktop-chromium' }),
        /ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED/u);
    } finally {
      releaseHeldFinish();
      await queue.drain();
      await server.stopAndDrain();
      await controller.abortAndQuiesce();
    }
    assert.equal(externalRequests, 0);
    assert.deepEqual(cleanupCalls, { quiesce: 1, revoke: 1, cleanup: 1, verify: 1 });
    const listenerClosed = await new Promise(resolve => {
      const socket = net.connect(Number(new URL(server.baseUrl).port), '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(false); });
      socket.once('error', error => resolve(error.code === 'ECONNREFUSED'));
    });
    assert.equal(listenerClosed, true);
  });

for (const [name, mutate, pattern] of [
  ['wrong mode', controller => { controller.config.acceptanceMode = 'full_acceptance'; }, /CHECKPOINT_REJECTED/u],
  ['wrong frontend', (_controller, input) => { input.projectName = 'pixel-7-chromium'; }, /CHECKPOINT_REJECTED/u],
  ['wrong ordering', (_controller, input) => { [input.actionIds[0], input.actionIds[1]] = [input.actionIds[1], input.actionIds[0]]; }, /ACTION_REJECTED/u],
  ['wrong status', controller => { controller.browserActions.get('desktop-chromium')[1].status = 200; }, /ACTION_REJECTED/u],
  ['missing request binding', controller => { controller.browserActions.get('desktop-chromium')[1].requestIdHash = null; }, /ACTION_REJECTED/u],
  ['duplicate request binding', controller => {
    controller.browserActions.get('desktop-chromium')[1].requestIdHash = controller.browserActions.get('desktop-chromium')[0].requestIdHash;
  }, /ACTION_REJECTED/u],
]) test(`checkpoint rejects ${name}`, async () => {
  const controller = create();
  const input = { projectName: 'desktop-chromium',
    actionIds: controller.browserActions.get('desktop-chromium').map(row => row.actionId) };
  mutate(controller, input);
  await assert.rejects(controller.recordGovernStudioDiagnosticCheckpoint(input), pattern);
});

test('new mode rejects provider generation permits and commands before dispatch', async () => {
  const controller = create();
  await assert.rejects(controller.armPermit({ kind: 'studio_deterministic_success' }), /PERMIT_REJECTED/u);
  await assert.rejects(controller.beginBrowserAction({ projectName: 'desktop-chromium', accessToken: 'unused',
    route: '/functions/v1/studio-artifact-command', requestBody: {
      commandType: 'studio.artifact.generation.request', requestId: '10000000-0000-4000-8000-000000000003',
    },
  }), /DOWNSTREAM_REJECTED/u);
});

test('result requires exact inventory, target proof and verified cleanup without promotion', async () => {
  const controller = create();
  const actionIds = controller.browserActions.get('desktop-chromium').map(row => row.actionId);
  await controller.recordGovernStudioDiagnosticCheckpoint({ projectName: 'desktop-chromium', actionIds });
  controller.browserCases = AUTHENTICATED_GOVERN_STUDIO_CASE_IDS.map(testId => ({ testId, project: 'desktop-chromium' }));
  controller.serverCases = AUTHENTICATED_GOVERN_STUDIO_CASE_IDS.map(testId => ({ testId, project: 'desktop-chromium' }));
  controller.governStudioTargetRows = AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS.map(testId => ({
    testId, observations: { browser: { result: testId === 'GOVERN-005'
      ? { independentApprovalCommitted: true, approvedCurrentVersionVisible: true }
      : testId === 'GOVERN-007'
        ? { reviewerControlDisabled: true, exactCurrentScope: true, exactCurrentVersion: true,
          requestBindingDigest: D('a'), separationDenialZeroEffects: true, independentResolutionCommitted: true }
        : { approvedHandoffConsumed: true, exactSourceAncestryVisible: true } } },
  }));
  assert.throws(() => controller.governStudioDiagnosticResult(), /RESULT_REJECTED/u);
  controller.quiesced = true;
  const result = controller.governStudioDiagnosticResult();
  assert.equal(result.diagnosticCompleted, true);
  assert.equal(result.fullAcceptanceExecuted, false);
  assert.equal(result.acceptancePromoted, false);
  assert.equal(result.providerGenerationExecuted, false);
  controller.browserCases.pop();
  assert.throws(() => controller.governStudioDiagnosticResult(), /RESULT_REJECTED/u);
});
