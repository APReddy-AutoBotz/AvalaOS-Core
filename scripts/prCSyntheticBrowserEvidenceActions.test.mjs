import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTROLLED_HUMAN_SERVER_ACTIONS,
  canonicalJson,
  sha256Digest,
} from './prCControlledHumanEvidenceContract.mjs';
import {
  buildSyntheticApiEvidenceDescriptor,
  executeSyntheticApiEvidenceAction,
  isSyntheticApiEvidenceStep,
} from './prCSyntheticBrowserEvidenceActions.mjs';

const UUIDS = Object.freeze({
  workspace: '11111111-1111-4111-a111-111111111111',
  handoff: '22222222-2222-4222-a222-222222222222',
  package: '33333333-3333-4333-a333-333333333333',
  packageVersion: '44444444-4444-4444-a444-444444444444',
  artifact: '55555555-5555-4555-a555-555555555555',
  artifactVersion: '66666666-6666-4666-a666-666666666666',
  request: '77777777-7777-4777-a777-777777777777',
});
const EXERCISE = `sha256:${'1'.repeat(64)}`;
const CHALLENGE = `sha256:${'2'.repeat(64)}`;
const BINDING = `sha256:${'3'.repeat(64)}`;
const digest = value => sha256Digest(Buffer.from(typeof value === 'string' ? value : canonicalJson(value), 'utf8'));
const contractFor = planned => CONTROLLED_HUMAN_SERVER_ACTIONS.find(item => item.checkpointId === planned.checkpointId && item.stepId === planned.stepId);

const planned = Object.freeze([
  { checkpointId: 'CH-05', stepId: 'replay-consumption-same-target', personaKey: 'delivery_consumer' },
  { checkpointId: 'CH-08', stepId: 'replay-baseline-creation', personaKey: 'delivery_approver' },
  { checkpointId: 'CH-12', stepId: 'revoked-actor-projection-denied', personaKey: 'revoked_actor' },
  { checkpointId: 'CH-12', stepId: 'revoked-actor-mutation-denied', personaKey: 'revoked_actor' },
  { checkpointId: 'CH-12', stepId: 'same-org-other-workspace-projection-denied', personaKey: 'same_org_other_workspace' },
  { checkpointId: 'CH-12', stepId: 'same-org-other-workspace-mutation-denied', personaKey: 'same_org_other_workspace' },
  { checkpointId: 'CH-12', stepId: 'cross-org-projection-denied', personaKey: 'cross_org_actor' },
  { checkpointId: 'CH-12', stepId: 'cross-org-mutation-denied', personaKey: 'cross_org_actor' },
  { checkpointId: 'CH-13', stepId: 'reject-stale-authorization', personaKey: 'delivery_author' },
  { checkpointId: 'CH-13', stepId: 'reject-stale-source-change', personaKey: 'delivery_author' },
]);

const replayFor = step => step.stepId === 'replay-consumption-same-target'
  ? {
      resourceDigest: digest({ resourceFamily: 'delivery_work_package', resourceId: UUIDS.package }),
      body: {
        commandType: 'delivery.handoff.consume', requestId: UUIDS.request, idempotencyKey: 'original-consume-key',
        organizationId: UUIDS.workspace, workspaceId: UUIDS.workspace,
        payload: { handoffId: UUIDS.handoff, expectedHandoffVersion: 3 },
      },
    }
  : {
      resourceDigest: digest({ resourceFamily: 'monitor_baseline', resourceId: UUIDS.package }),
      body: {
        commandType: 'monitor.baseline.create', requestId: UUIDS.request, idempotencyKey: 'original-baseline-key',
        organizationId: UUIDS.workspace, workspaceId: UUIDS.workspace,
        payload: { workPackageId: UUIDS.package, expectedPackageVersion: 4, expectedPackageVersionId: UUIDS.packageVersion },
      },
    };

const descriptorFor = step => buildSyntheticApiEvidenceDescriptor(step, {
  workspaceId: UUIDS.workspace,
  authorizationVersion: 7,
  replay: contractFor(step).transitionKind === 'replay_existing' ? replayFor(step) : undefined,
  deliveryPackage: { id: UUIDS.package, aggregateVersion: 9, currentVersion: 4, currentVersionId: UUIDS.packageVersion },
  sourceArtifact: {
    id: UUIDS.artifact, aggregateVersion: 6, lifecycle: 'approved',
    currentVersion: { id: UUIDS.artifactVersion }, currentApprovedVersion: { id: UUIDS.artifactVersion },
    sourcePackage: { sourceMode: 'assess_plus_transcript_bundle' },
  },
});

const apiFor = (step, descriptor, { corruptAnchor = false, corruptBinding = false } = {}) => {
  const contract = contractFor(step);
  const calls = [];
  const safeAnchor = {
    contractVersion: 'pr-c-controlled-human-step-anchor-1', stepId: step.stepId, action: contract.action,
    targetFamily: descriptor.targetFamily, targetDigest: digest({ resourceFamily: descriptor.targetFamily, resourceId: descriptor.targetId }),
    expectedVersion: descriptor.expectedVersion, transitionKind: contract.transitionKind,
    selectorDigest: digest(descriptor.selectorBindings), intentDigest: `sha256:${'4'.repeat(64)}`,
    requestDigest: `sha256:${'5'.repeat(64)}`, challengeToken: CHALLENGE,
  };
  const binding = result => ({
    contractVersion: 'pr-c-controlled-human-step-binding-3', stepId: step.stepId,
    action: corruptBinding ? 'wrong.action' : contract.action, result,
    expectedVersion: descriptor.expectedVersion, observedVersion: descriptor.expectedVersion,
    resourceDigest: descriptor.replay?.resourceDigest ?? digest({ resourceFamily: descriptor.targetFamily, resourceId: descriptor.targetId }),
    denialCodeDigest: digest({ denialCode: contract.expectedDenialCode ?? 'not_applicable' }),
    anchorToken: CHALLENGE, requestDigest: safeAnchor.requestDigest, intentDigest: safeAnchor.intentDigest, bindingToken: BINDING,
  });
  return {
    calls,
    api: {
      async rpc(name, args) {
        calls.push({ kind: 'rpc', name, args });
        if (name === 'pr_c_controlled_human_anchor_step') return {
          safeAnchor: corruptAnchor ? { ...safeAnchor, selectorDigest: `sha256:${'f'.repeat(64)}` } : safeAnchor,
          execution: { requestId: UUIDS.request, ...(contract.transitionKind === 'replay_existing' ? { businessIdempotencyKey: 'server-owned-replay-key' } : {}) },
        };
        if (name === 'pr_c_controlled_human_execute_denied_step') return binding('denied');
        if (name === 'pr_c_controlled_human_complete_step') return binding('succeeded');
        assert.fail(`unexpected rpc ${name}`);
      },
      async invoke(name, body, expectation) {
        calls.push({ kind: 'invoke', name, body, expectation });
        return { ok: true, outcome: 'replayed' };
      },
    },
  };
};

test('routes exactly the two replay and eight denial catalog steps', () => {
  assert.equal(planned.length, 10);
  for (const step of planned) assert.equal(isSyntheticApiEvidenceStep(step), true, `${step.checkpointId}:${step.stepId}`);
  assert.equal(isSyntheticApiEvidenceStep({ ...planned[0], personaKey: 'requester' }), false);
  assert.equal(isSyntheticApiEvidenceStep({ checkpointId: 'CH-05', stepId: 'consume-approved-handoff-once', personaKey: 'delivery_consumer' }), false);
});

test('builds SQL-exact replay and denial descriptor shapes for all ten steps', () => {
  for (const step of planned) {
    const descriptor = descriptorFor(step);
    const contract = contractFor(step);
    assert.equal(descriptor.targetFamily, contract.targetFamily);
    assert.match(descriptor.targetId, /^[0-9a-f-]{36}$/u);
    assert.ok(descriptor.expectedVersion > 0);
    if (contract.transitionKind === 'replay_existing') {
      assert.deepEqual(descriptor.selectorBindings, descriptor.replay.body.payload);
    } else if (contract.selectorSchema === 'negative_projection') {
      assert.deepEqual(descriptor.selectorBindings, {});
    } else if (contract.selectorSchema === 'negative_manual') {
      assert.deepEqual(Object.keys(descriptor.selectorBindings).sort(), ['itemCount', 'manualBriefDigest', 'orderedItemsDigest']);
      assert.equal(descriptor.selectorBindings.itemCount, 1);
    } else if (contract.selectorSchema === 'negative_revision') {
      assert.equal(descriptor.selectorBindings.workPackageId, UUIDS.package);
      assert.equal(descriptor.selectorBindings.expectedPackageAggregateVersion, 9);
    } else if (contract.selectorSchema === 'negative_handoff') {
      assert.equal(descriptor.selectorBindings.studioArtifactId, UUIDS.artifact);
      assert.equal(descriptor.selectorBindings.expectedAggregateVersion, 6);
    } else assert.fail(`unexpected selector schema ${contract.selectorSchema}`);
  }
});

test('executes anchor-command-complete for both exact replay identities', async () => {
  for (const step of planned.slice(0, 2)) {
    const descriptor = descriptorFor(step); const { api, calls } = apiFor(step, descriptor); const interactions = [];
    const proof = await executeSyntheticApiEvidenceAction({ api, planned: step, descriptor, exerciseDigest: EXERCISE, interactionSequence: interactions });
    assert.equal(proof.serverBinding.result, 'succeeded');
    assert.deepEqual(calls.map(call => call.kind === 'rpc' ? call.name : call.name), [
      'pr_c_controlled_human_anchor_step', 'enterprise-intelligence-command', 'pr_c_controlled_human_complete_step',
    ]);
    const invocation = calls[1];
    assert.equal(invocation.body.requestId, UUIDS.request);
    assert.equal(invocation.body.idempotencyKey, 'server-owned-replay-key');
    assert.deepEqual(invocation.expectation, { checkpointId: step.checkpointId, stepId: step.stepId, action: contractFor(step).action });
    assert.equal(interactions.some(value => value.includes(UUIDS.package) || value.includes(UUIDS.handoff)), false);
  }
});

test('executes anchor-denied binding without an ordinary command for all eight denials', async () => {
  for (const step of planned.slice(2)) {
    const descriptor = descriptorFor(step); const { api, calls } = apiFor(step, descriptor); const interactions = [];
    const proof = await executeSyntheticApiEvidenceAction({ api, planned: step, descriptor, exerciseDigest: EXERCISE, interactionSequence: interactions });
    assert.equal(proof.serverBinding.result, 'denied');
    assert.deepEqual(calls.map(call => call.name), ['pr_c_controlled_human_anchor_step', 'pr_c_controlled_human_execute_denied_step']);
    assert.equal(interactions.some(value => Object.values(UUIDS).some(id => value.includes(id))), false);
  }
});

test('rejects persona, replay, selector, anchor, and completion mismatches before accepting proof', async () => {
  assert.throws(() => descriptorFor({ ...planned[0], personaKey: 'requester' }), /PR_C_SYNTHETIC_BROWSER_API_STEP_REJECTED/u);
  const wrongReplay = replayFor(planned[0]); wrongReplay.body = { ...wrongReplay.body, commandType: 'monitor.baseline.create' };
  assert.throws(() => buildSyntheticApiEvidenceDescriptor(planned[0], { replay: wrongReplay }), /PR_C_SYNTHETIC_BROWSER_API_REPLAY_BINDING_MISSING/u);

  const staleStep = planned.at(-2); const descriptor = descriptorFor(staleStep);
  const mismatched = { ...descriptor, selectorBindings: { ...descriptor.selectorBindings, workPackageId: UUIDS.artifact } };
  const noCalls = { rpc: async () => assert.fail('selector mismatch reached API'), invoke: async () => assert.fail('selector mismatch reached API') };
  await assert.rejects(() => executeSyntheticApiEvidenceAction({ api: noCalls, planned: staleStep, descriptor: mismatched, exerciseDigest: EXERCISE, interactionSequence: [] }), /PR_C_SYNTHETIC_BROWSER_API_SELECTOR_REJECTED/u);

  const replayStep = planned[0]; const replayDescriptor = descriptorFor(replayStep);
  await assert.rejects(() => executeSyntheticApiEvidenceAction({ api: apiFor(replayStep, replayDescriptor, { corruptAnchor: true }).api,
    planned: replayStep, descriptor: replayDescriptor, exerciseDigest: EXERCISE, interactionSequence: [] }), /PR_C_SYNTHETIC_BROWSER_API_ANCHOR_REJECTED/u);
  await assert.rejects(() => executeSyntheticApiEvidenceAction({ api: apiFor(replayStep, replayDescriptor, { corruptBinding: true }).api,
    planned: replayStep, descriptor: replayDescriptor, exerciseDigest: EXERCISE, interactionSequence: [] }), /PR_C_SYNTHETIC_BROWSER_API_COMPLETION_REJECTED/u);
});
