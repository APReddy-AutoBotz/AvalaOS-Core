import assert from 'node:assert/strict';

import { COMMAND_LABEL } from './m5.3a-3i-local-stack-readiness-procedure.mjs';
import {
  APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR,
  createLocalStackReadinessAdapterResult,
} from './m5.3a-3k-local-stack-readiness-execution-adapter.mjs';

const baseReadyOutcome = Object.freeze({
  runCount: 1,
  readinessAttemptStatus: 'attempted',
  localStartupStatusBucket: 'completed',
  localStackReadinessBucket: 'ready',
  serviceReadinessBucket: 'all-ready',
  outputSafetyResult: 'passed',
  cleanupResult: 'removed',
  failClosedReason: 'none',
});

const createExecutor = (outcome, onCall = () => {}) => async (context) => {
  onCall(context);
  return outcome;
};

const createResult = (outcome, onCall) => createLocalStackReadinessAdapterResult({
  commandFamilyDescriptor: APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR,
  executor: createExecutor(outcome, onCall),
});

const expectValid = async (outcome, expected) => {
  const result = await createResult(outcome);
  assert.equal(result.ok, true);
  assert.equal(result.commandLabel, COMMAND_LABEL);
  assert.equal(result.runCount, 1);
  assert.equal(result.failClosedReason, 'none');
  assert.equal(result.readinessAttemptStatus, expected.readinessAttemptStatus);
  assert.equal(result.localStartupStatusBucket, expected.localStartupStatusBucket);
  assert.equal(result.localStackReadinessBucket, expected.localStackReadinessBucket);
  assert.equal(result.serviceReadinessBucket, expected.serviceReadinessBucket);
  assert.equal(result.outputSafetyResult, expected.outputSafetyResult);
  assert.equal(result.cleanupResult, expected.cleanupResult);
  assert.equal(result.proofBoundaries.rootCauseInferred, 'no');
  assert.equal(result.proofBoundaries.localDbAvailability, 'unresolved');
  assert.equal(result.proofBoundaries.schemaAvailability, 'not proven');
  assert.equal(result.proofBoundaries.artifactSelectIsolation, 'not verified');
  assert.equal(result.proofBoundaries.tenantIsolation, 'not newly verified');
  assert.equal(result.proofBoundaries.rls, 'not proven');
  assert.equal(result.proofBoundaries.hostedReadiness, 'not proven');
  assert.equal(result.proofBoundaries.productionReadiness, 'not proven');
  assert.equal(result.proofBoundaries.localStartupSuccess, 'not proven');
  return result;
};

const expectFailClosed = async (outcome, reason) => {
  const result = await createResult(outcome);
  assert.equal(result.ok, false);
  assert.equal(result.commandLabel, COMMAND_LABEL);
  assert.equal(result.runCount, 1);
  assert.equal(result.readinessAttemptStatus, 'fail-closed');
  assert.equal(result.localStartupStatusBucket, 'fail-closed');
  assert.equal(result.localStackReadinessBucket, 'fail-closed');
  assert.equal(result.serviceReadinessBucket, 'fail-closed');
  assert.equal(result.failClosedReason, reason);
  assert.equal(result.proofBoundaries.rootCauseInferred, 'no');
  assert.equal(result.proofBoundaries.localDbAvailability, 'unresolved');
  assert.equal(result.proofBoundaries.schemaAvailability, 'not proven');
  assert.equal(result.proofBoundaries.artifactSelectIsolation, 'not verified');
  assert.equal(result.proofBoundaries.tenantIsolation, 'not newly verified');
  assert.equal(result.proofBoundaries.localStartupSuccess, 'not proven');
  return result;
};

const missingExecutorResult = await createLocalStackReadinessAdapterResult({
  commandFamilyDescriptor: APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR,
});
assert.equal(missingExecutorResult.ok, false);
assert.equal(missingExecutorResult.failClosedReason, 'unsupported-readiness-state');

const invalidDescriptorResult = await createLocalStackReadinessAdapterResult({
  commandFamilyDescriptor: {
    ...APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR,
    syntheticOnly: false,
  },
  executor: createExecutor(baseReadyOutcome),
});
assert.equal(invalidDescriptorResult.ok, false);
assert.equal(invalidDescriptorResult.failClosedReason, 'unsupported-readiness-state');

let validExecutorCallCount = 0;
const readyResult = await createLocalStackReadinessAdapterResult({
  commandFamilyDescriptor: APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR,
  executor: createExecutor(baseReadyOutcome, (context) => {
    validExecutorCallCount += 1;
    assert.equal(context.commandLabel, COMMAND_LABEL);
    assert.equal(context.syntheticOnly, true);
  }),
});
assert.equal(validExecutorCallCount, 1);
assert.equal(readyResult.ok, true);
assert.equal(readyResult.localStackReadinessBucket, 'ready');

await expectValid({
  ...baseReadyOutcome,
  localStackReadinessBucket: 'not-ready',
  serviceReadinessBucket: 'not-ready',
}, {
  readinessAttemptStatus: 'attempted',
  localStartupStatusBucket: 'completed',
  localStackReadinessBucket: 'not-ready',
  serviceReadinessBucket: 'not-ready',
  outputSafetyResult: 'passed',
  cleanupResult: 'removed',
});

await expectValid({
  ...baseReadyOutcome,
  localStackReadinessBucket: 'partial',
  serviceReadinessBucket: 'partial-ready',
}, {
  readinessAttemptStatus: 'attempted',
  localStartupStatusBucket: 'completed',
  localStackReadinessBucket: 'partial',
  serviceReadinessBucket: 'partial-ready',
  outputSafetyResult: 'passed',
  cleanupResult: 'removed',
});

await expectValid({
  ...baseReadyOutcome,
  readinessAttemptStatus: 'blocked',
  localStartupStatusBucket: 'unknown',
  localStackReadinessBucket: 'unknown',
  serviceReadinessBucket: 'unknown',
  outputSafetyResult: 'not-captured',
  cleanupResult: 'not-needed',
}, {
  readinessAttemptStatus: 'blocked',
  localStartupStatusBucket: 'unknown',
  localStackReadinessBucket: 'unknown',
  serviceReadinessBucket: 'unknown',
  outputSafetyResult: 'not-captured',
  cleanupResult: 'not-needed',
});

await expectFailClosed({
  ...baseReadyOutcome,
  runCount: 2,
}, 'unsupported-readiness-state');

await expectFailClosed({
  ...baseReadyOutcome,
  rawOutputInspectionRequired: true,
}, 'raw-output-needed');

const harmlessRawFixture = 'harmless repeated fixture text that must not be copied';
const rawStdoutResult = await expectFailClosed({
  ...baseReadyOutcome,
  stdout: harmlessRawFixture,
}, 'raw-output-needed');
assert.equal(JSON.stringify(rawStdoutResult).includes(harmlessRawFixture), false);

await expectFailClosed({
  ...baseReadyOutcome,
  stderr: 'harmless synthetic error text',
}, 'raw-output-needed');

await expectFailClosed({
  ...baseReadyOutcome,
  logs: 'harmless synthetic log text',
}, 'raw-output-needed');

await expectFailClosed({
  ...baseReadyOutcome,
  cleanupResult: 'C:\\Users\\example\\scratch-output.log',
}, 'local-path-needed');

await expectFailClosed({
  ...baseReadyOutcome,
  localStartupStatusBucket: 'postgres://synthetic.invalid/example',
}, 'db-url-like-value');

await expectFailClosed({
  ...baseReadyOutcome,
  outputSafetyResult: 'synthetic private token value',
}, 'secret-like-value');

await expectFailClosed({
  ...baseReadyOutcome,
  serviceReadinessBucket: 'image id sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}, 'container-image-id-like-value');

await expectFailClosed({
  ...baseReadyOutcome,
  localStartupStatusBucket: 'hostname workstation-001',
}, 'machine-specific-value');

await expectFailClosed({
  ...baseReadyOutcome,
  rootCauseInferred: true,
}, 'root-cause-inference-needed');

await expectFailClosed({
  ...baseReadyOutcome,
  schemaReadinessImplied: true,
}, 'unsupported-readiness-state');

await expectFailClosed({
  ...baseReadyOutcome,
  rlsReadinessImplied: true,
}, 'unsupported-readiness-state');

await expectFailClosed({
  ...baseReadyOutcome,
  artifactReadinessImplied: true,
}, 'unsupported-readiness-state');

await expectFailClosed({
  ...baseReadyOutcome,
  tenantIsolationVerified: true,
}, 'unsupported-readiness-state');

await expectFailClosed({
  ...baseReadyOutcome,
  hostedReadinessImplied: true,
}, 'unsupported-readiness-state');

await expectFailClosed({
  ...baseReadyOutcome,
  productionReadinessImplied: true,
}, 'unsupported-readiness-state');

await expectFailClosed({
  ...baseReadyOutcome,
  cleanupResult: 'failed',
}, 'cleanup-failed');

await expectFailClosed({
  ...baseReadyOutcome,
  outputSafetyResult: 'failed',
}, 'unsafe-output');

await expectFailClosed({
  ...baseReadyOutcome,
  localStartupStatusBucket: 'failed',
}, 'unsupported-readiness-state');

const serializedReady = JSON.stringify(readyResult);
assert.equal(serializedReady.includes('supabase'), false);
assert.equal(serializedReady.includes('docker'), false);
assert.equal(serializedReady.includes('node scripts/'), false);
assert.equal(serializedReady.includes(COMMAND_LABEL), true);

console.log('M5.3a-3k local stack readiness execution adapter synthetic regression passed.');