import assert from 'node:assert/strict';

import {
  COMMAND_LABEL,
  createLocalStackReadinessProcedureResult,
} from './m5.3a-3i-local-stack-readiness-procedure.mjs';

const baseReadyInput = {
  runCount: 1,
  readinessAttemptStatus: 'attempted',
  localStartupStatusBucket: 'completed',
  localStackReadinessBucket: 'ready',
  serviceReadinessBucket: 'all-ready',
  outputSafetyResult: 'passed',
  cleanupResult: 'removed',
  failClosedReason: 'none',
};

const expectValid = (input, expected) => {
  const result = createLocalStackReadinessProcedureResult(input);
  assert.equal(result.ok, true);
  assert.equal(result.commandLabel, COMMAND_LABEL);
  assert.equal(result.failClosedReason, 'none');
  assert.equal(result.readinessAttemptStatus, expected.readinessAttemptStatus);
  assert.equal(result.localStartupStatusBucket, expected.localStartupStatusBucket);
  assert.equal(result.localStackReadinessBucket, expected.localStackReadinessBucket);
  assert.equal(result.serviceReadinessBucket, expected.serviceReadinessBucket);
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

const expectFailClosed = (input, reason) => {
  const result = createLocalStackReadinessProcedureResult(input);
  assert.equal(result.ok, false);
  assert.equal(result.commandLabel, COMMAND_LABEL);
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

const readyResult = expectValid(baseReadyInput, {
  readinessAttemptStatus: 'attempted',
  localStartupStatusBucket: 'completed',
  localStackReadinessBucket: 'ready',
  serviceReadinessBucket: 'all-ready',
});

expectValid({
  ...baseReadyInput,
  localStackReadinessBucket: 'not-ready',
  serviceReadinessBucket: 'not-ready',
}, {
  readinessAttemptStatus: 'attempted',
  localStartupStatusBucket: 'completed',
  localStackReadinessBucket: 'not-ready',
  serviceReadinessBucket: 'not-ready',
});

expectValid({
  ...baseReadyInput,
  localStackReadinessBucket: 'partial',
  serviceReadinessBucket: 'partial-ready',
}, {
  readinessAttemptStatus: 'attempted',
  localStartupStatusBucket: 'completed',
  localStackReadinessBucket: 'partial',
  serviceReadinessBucket: 'partial-ready',
});

expectValid({
  ...baseReadyInput,
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
});

expectFailClosed({
  ...baseReadyInput,
  syntheticSafetyProbes: ['raw stdout: harmless synthetic fixture text'],
}, 'raw-output-needed');

expectFailClosed({
  ...baseReadyInput,
  syntheticSafetyProbes: ['C:\\Users\\example\\scratch-output.log'],
}, 'local-path-needed');

expectFailClosed({
  ...baseReadyInput,
  syntheticSafetyProbes: ['postgres://synthetic.invalid/example'],
}, 'db-url-like-value');

expectFailClosed({
  ...baseReadyInput,
  syntheticSafetyProbes: ['synthetic private token value'],
}, 'secret-like-value');

expectFailClosed({
  ...baseReadyInput,
  syntheticSafetyProbes: ['image id sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
}, 'container-image-id-like-value');

expectFailClosed({
  ...baseReadyInput,
  syntheticSafetyProbes: ['hostname workstation-001'],
}, 'machine-specific-value');

expectFailClosed({
  ...baseReadyInput,
  rootCauseInferred: true,
}, 'root-cause-inference-needed');

expectFailClosed({
  ...baseReadyInput,
  schemaReadinessImplied: true,
}, 'unsupported-readiness-state');

expectFailClosed({
  ...baseReadyInput,
  rlsReadinessImplied: true,
}, 'unsupported-readiness-state');

expectFailClosed({
  ...baseReadyInput,
  artifactReadinessImplied: true,
}, 'unsupported-readiness-state');

expectFailClosed({
  ...baseReadyInput,
  cleanupResult: 'failed',
}, 'cleanup-failed');

expectFailClosed({
  ...baseReadyInput,
  outputTooLarge: true,
}, 'output-too-large');

expectFailClosed({
  ...baseReadyInput,
  outputSafetyResult: 'failed',
}, 'unsafe-output');

expectFailClosed({
  ...baseReadyInput,
  runCount: 2,
}, 'unsupported-readiness-state');

const unsafeProbe = 'raw stdout: this harmless repeated fixture text must not be copied';
const unsafeResult = expectFailClosed({
  ...baseReadyInput,
  syntheticSafetyProbes: [unsafeProbe],
}, 'raw-output-needed');
assert.equal(JSON.stringify(unsafeResult).includes(unsafeProbe), false);

const serializedReady = JSON.stringify(readyResult);
assert.equal(serializedReady.includes('supabase start'), false);
assert.equal(serializedReady.includes('docker '), false);
assert.equal(serializedReady.includes('node scripts/'), false);
assert.equal(serializedReady.includes(COMMAND_LABEL), true);

console.log('M5.3a-3i local stack readiness procedure synthetic regression passed.');
