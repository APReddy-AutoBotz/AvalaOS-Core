import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { AuthenticatedHostedController, authenticatedHostedBindResponseObservation,
  authenticatedHostedResponseObservation }
  from './authenticatedHostedController.mjs';
import {
  AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT,
  AUTHENTICATED_GOVERN_STUDIO_CASE_IDS,
  AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS,
} from './authenticatedGovernStudioDiagnostic.mjs';

const D = seed => `sha256:${createHash('sha256').update(seed).digest('hex')}`;
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
