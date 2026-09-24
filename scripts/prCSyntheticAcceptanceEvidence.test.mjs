import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_EXECUTION_ORDER,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
  HUMAN_DUTY_BY_PERSONA,
  canonicalDigest,
} from './prCControlledHumanEvidenceContract.mjs';
import {
  SYNTHETIC_PERSONA_ORDER,
  SYNTHETIC_STEP_COUNT,
  buildSyntheticObserverRequest,
  buildSyntheticSessionBindingRequest,
  requiredSyntheticBrowserAssertionId,
  validateSyntheticBrowserCampaign,
  validateSyntheticCleanup,
  validateSyntheticOwnerPolicy,
  validateSyntheticServerSafety,
} from './prCSyntheticAcceptanceEvidence.mjs';
import {
  EXPECTED_MIGRATION_TIP,
  SYNTHETIC_ACCEPTANCE_MIGRATION_TIP,
  deriveContext,
  validateControlledExerciseObserverRequest,
} from './prCControlledHumanEnvironment.mjs';

const digest = value => `sha256:${String(value).padStart(64, '0').slice(-64)}`;
const catalogByCheckpoint = new Map(CONTROLLED_HUMAN_CATALOG.map(record => [record.checkpointId, record]));
const serverActions = new Set(CONTROLLED_HUMAN_SERVER_ACTIONS.map(record => `${record.checkpointId}\0${record.stepId}`));
const executionPosition = new Map(CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId => catalogByCheckpoint.get(checkpointId).steps.map(step => `${checkpointId}\0${step.stepId}`))
  .map((key, index) => [key, index]));

const checkpoints = CONTROLLED_HUMAN_CATALOG.map((checkpoint, checkpointIndex) => ({
  checkpointId: checkpoint.checkpointId,
  journeyId: checkpoint.journeyId,
  testIds: checkpoint.testIds,
  outcome: 'passed',
  steps: checkpoint.steps.map((step, stepIndex) => ({
    stepId: step.stepId,
    personaKey: step.personaKey,
    outcome: 'passed',
    startedAt: new Date(Date.UTC(2026, 8, 24, 0, 0, executionPosition.get(`${checkpoint.checkpointId}\0${step.stepId}`) * 2)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 8, 24, 0, 0, executionPosition.get(`${checkpoint.checkpointId}\0${step.stepId}`) * 2 + 1)).toISOString(),
    applicationActorDigest: digest(100 + SYNTHETIC_PERSONA_ORDER.indexOf(step.personaKey)),
    applicationSessionDigest: digest(200 + SYNTHETIC_PERSONA_ORDER.indexOf(step.personaKey)),
    browserArtifact: {
      artifactId: `artifact-${checkpoint.checkpointId.toLowerCase()}-${stepIndex}`,
      route: '/enterprise', viewport: 'desktop-chrome',
      assertions: [{ assertionId: requiredSyntheticBrowserAssertionId(checkpoint.checkpointId, step.stepId), kind: 'dom', result: 'passed', actualDigest: digest(300 + checkpointIndex * 10 + stepIndex) }],
      interactionSequence: ['navigate', 'observe'],
      serverAnchor: serverActions.has(`${checkpoint.checkpointId}\0${step.stepId}`) ? { challengeToken: digest(400 + checkpointIndex * 10 + stepIndex) } : null,
      serverBinding: serverActions.has(`${checkpoint.checkpointId}\0${step.stepId}`) ? { bindingToken: digest(500 + checkpointIndex * 10 + stepIndex) } : null,
    },
  })),
}));
const personas = SYNTHETIC_PERSONA_ORDER.map((personaKey, index) => ({
  personaKey, role: HUMAN_DUTY_BY_PERSONA[personaKey], applicationActorDigest: digest(100 + index), applicationSessionDigest: digest(200 + index),
  signedOutAt: new Date(Date.UTC(2026, 8, 24, 1, 0, index)).toISOString(), signOutEvidenceDigest: digest(900 + index),
}));
const binding = {
  repository: 'APReddy-AutoBotz/AvalaOS-Core', prNumber: 264, branch: 'controller/governed-delivery-monitor-pr-c-20260831', exactHead: 'a'.repeat(40),
  preview: { origin: 'https://deploy-preview-264--avalaos-pilot.netlify.app', deployId: 'b'.repeat(24), releaseSha: 'a'.repeat(40), environment: 'hosted_nonproduction_pilot', context: 'deploy-preview', reviewId: 264, siteName: 'avalaos-pilot' },
  backend: { exerciseDigest: digest(1), targetFingerprint: digest(2), publicTargetDigest: digest(3), personaManifestDigest: digest(4), fixtureManifestDigest: digest(5), migrationTip: '20260924113000' },
  producer: { workflowPath: '.github/workflows/transcript-flow-pr-c.yml', job: 'synthetic_role_acceptance', event: 'workflow_dispatch', runId: '1001', runAttempt: 1, owner: 'APReddy-AutoBotz' },
};

test('owner policy is exact, versioned, and PR scoped', async () => {
  const policy = JSON.parse(await readFile('testing/process-lifecycle/contracts/pr-c-solo-owner-synthetic-policy.json', 'utf8'));
  assert.equal(validateSyntheticOwnerPolicy(policy), policy);
  for (const mutate of [
    value => { value.policyId = 'other'; }, value => { value.scope.prNumber = 265; },
    value => { value.scope.controlledHumanResult = 'passed'; }, value => { value.owner = 'someone-else'; },
  ]) {
    const changed = structuredClone(policy); mutate(changed);
    assert.throws(() => validateSyntheticOwnerPolicy(changed), /PR_C_SYNTHETIC_POLICY/u);
  }
});

test('synthetic observer requests cover all 83 steps with application identities', () => {
  const requests = ['requester', 'reviewer', 'approver'].map(role => buildSyntheticObserverRequest(role, checkpoints));
  assert.equal(requests.reduce((total, request) => total + request.steps.length, 0), SYNTHETIC_STEP_COUNT);
  assert.equal(new Set(requests.flatMap(request => request.steps.map(step => `${step.checkpointId}\0${step.stepId}`))).size, 83);
  for (const request of requests) {
    const validated = validateControlledExerciseObserverRequest(request);
    assert.equal(validated.executionKind, 'synthetic'); assert.equal(validated.role, request.syntheticRole);
    assert.ok(request.steps.every(step => /^sha256:[0-9a-f]{64}$/u.test(step.applicationActorDigest)
      && /^sha256:[0-9a-f]{64}$/u.test(step.applicationSessionDigest)
      && step.attemptDigest === canonicalDigest(checkpoints.find(record => record.checkpointId === step.checkpointId).steps.find(record => record.stepId === step.stepId).browserArtifact)));
  }
});

test('session binding request binds every distinct application actor and session deterministically', () => {
  const request = buildSyntheticSessionBindingRequest([...personas].reverse());
  assert.equal(request.executionKind, 'synthetic');
  assert.equal(request.personas.length, 12);
  assert.deepEqual(request.personas.map(record => record.personaKey), [...request.personas.map(record => record.personaKey)].sort());
  const reused = structuredClone(personas); reused[1].applicationSessionDigest = reused[0].applicationSessionDigest;
  assert.throws(() => buildSyntheticSessionBindingRequest(reused), /SESSION_BINDING_REUSE/u);
});

test('human and synthetic observer envelopes remain disjoint', () => {
  const synthetic = buildSyntheticObserverRequest('requester', checkpoints);
  const human = { humanRole: 'requester', steps: synthetic.steps.map(({ applicationActorDigest: _actor, applicationSessionDigest: _session, ...step }) => step) };
  assert.equal(validateControlledExerciseObserverRequest(human).executionKind, 'human');
  assert.throws(() => validateControlledExerciseObserverRequest({ ...human, executionKind: 'synthetic' }), /OBSERVER_REQUEST_REJECTED/u);
  const missingIdentity = structuredClone(synthetic); delete missingIdentity.steps[0].applicationSessionDigest;
  assert.throws(() => validateControlledExerciseObserverRequest(missingIdentity), /OBSERVER_REQUEST_REJECTED/u);
});

test('synthetic context advances only through the exact approved policy selector', () => {
  const head = 'a'.repeat(40); const publicTargetDigest = digest(1);
  const env = {
    PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS: 'hosted_nonproduction_pilot', PR_C_CONTROLLED_HUMAN_PR_NUMBER: '264',
    PR_C_CONTROLLED_HUMAN_RELEASE_SHA: head, PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA: head,
    PR_C_CONTROLLED_HUMAN_DEPLOY_ID: 'b'.repeat(24), PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
    PR_C_CONTROLLED_HUMAN_EXERCISE_ID: '11111111-1111-4111-a111-111111111111', PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: digest(2),
    PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: publicTargetDigest, PR_C_CONTROLLED_HUMAN_SITE_NAME: 'avalaos-pilot',
    PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT: 'deploy-preview',
  };
  const fixtureState = { fixture: { preview: { originPattern: '^https://deploy-preview-264--avalaos-pilot\\.netlify\\.app$' } }, personaManifestDigest: digest(3), fixtureManifestDigest: digest(4) };
  assert.equal(deriveContext(env, fixtureState, { head, dirty: '' }).migrationTip, EXPECTED_MIGRATION_TIP);
  assert.equal(deriveContext({ ...env, PR_C_SYNTHETIC_ACCEPTANCE_POLICY: 'solo-owner-synthetic-v1' }, fixtureState, { head, dirty: '' }).migrationTip, SYNTHETIC_ACCEPTANCE_MIGRATION_TIP);
  assert.throws(() => deriveContext({ ...env, PR_C_SYNTHETIC_ACCEPTANCE_POLICY: 'other' }, fixtureState, { head, dirty: '' }), /SYNTHETIC_POLICY_REJECTED/u);
});

test('catalog assertion ids are state specific and stable', () => {
  const ids = CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId => {
    const checkpoint = catalogByCheckpoint.get(checkpointId);
    return checkpoint.steps.map(step => requiredSyntheticBrowserAssertionId(checkpointId, step.stepId));
  });
  assert.equal(ids.length, 83); assert.equal(new Set(ids).size, 83);
  assert.ok(ids.every(value => value.endsWith('.observed') && value.startsWith('ch-')));
});

test('candidate binding rejects wrong head, deploy, run, and reused role session', () => {
  assert.doesNotThrow(() => validateSyntheticBrowserCampaign({ binding, personas, checkpoints }));
  for (const mutate of [
    value => { value.binding.exactHead = 'c'.repeat(40); },
    value => { value.binding.preview.deployId = 'invalid'; },
    value => { value.binding.producer.runAttempt = 0; },
    value => { value.personas[1].applicationSessionDigest = value.personas[0].applicationSessionDigest; },
    value => { value.personas[2].applicationActorDigest = value.personas[0].applicationActorDigest; },
  ]) {
    const candidate = { binding: structuredClone(binding), personas: structuredClone(personas), checkpoints: structuredClone(checkpoints) };
    mutate(candidate);
    assert.throws(() => validateSyntheticBrowserCampaign(candidate), /PR_C_SYNTHETIC_/u);
  }
});

test('green process shape cannot replace a required per-step browser observation', () => {
  const candidate = { binding: structuredClone(binding), personas: structuredClone(personas), checkpoints: structuredClone(checkpoints) };
  candidate.checkpoints[0].steps[0].browserArtifact.assertions = [{ assertionId: 'process.exit.zero', kind: 'network', result: 'passed', actualDigest: digest(999) }];
  assert.throws(() => validateSyntheticBrowserCampaign(candidate), /REQUIRED_STATE_ASSERTION/u);
  candidate.checkpoints[0].steps[0].browserArtifact.assertions = [];
  assert.throws(() => validateSyntheticBrowserCampaign(candidate), /ASSERTIONS/u);
});

test('post-observer egress and failed cleanup cannot produce acceptance', () => {
  const steps = Array.from({ length: 83 }, () => ({ safety: { providerEgress: 0, realProviderCalls: 0, customerDataRecords: 0, externalUsers: 0 } }));
  assert.deepEqual(validateSyntheticServerSafety(steps), { providerEgress: 0, realProviderCalls: 0, customerDataRecords: 0, externalUsers: 0 });
  steps[82].safety.providerEgress = 1;
  assert.throws(() => validateSyntheticServerSafety(steps), /PR_C_SYNTHETIC_SAFETY/u);
  const cleanup = { deprovisionRecord: { lifecycle: 'deprovisioned', immutableHistoryRetained: true, domainRowsDeleted: 0 }, postDeprovisionRecord: { lifecycle: 'deprovisioned', immutableHistoryRetained: true, domainRowsDeleted: 0, activeSessionCount: 0, postInspectionDigest: digest(8) } };
  assert.equal(validateSyntheticCleanup(cleanup), true);
  cleanup.postDeprovisionRecord.activeSessionCount = 1;
  assert.throws(() => validateSyntheticCleanup(cleanup), /POST_DEPROVISION_RESULT/u);
});

test('downloaded session verification is exposed only as raw-evidence replay', async () => {
  const source = await readFile('scripts/prCSyntheticAcceptanceEvidence.mjs', 'utf8');
  assert.doesNotMatch(source, /export const validateSyntheticAcceptanceSession\s*=/u);
  assert.match(source, /export const verifySyntheticAcceptanceSession\s*=\s*\(\{ session, policy, binding, personas, checkpoints, sessionBindingRecord, serverObservers, quiesceRecord, deprovisionRecord, postDeprovisionRecord, completedAt \}\)/u);
  assert.match(source, /PR_C_SYNTHETIC_SESSION_RAW_EVIDENCE_MISMATCH/u);
});
