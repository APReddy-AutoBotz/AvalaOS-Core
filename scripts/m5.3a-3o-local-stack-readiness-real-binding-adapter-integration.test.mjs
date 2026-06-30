import assert from 'node:assert/strict';

import { COMMAND_LABEL, proofBoundaries } from './m5.3a-3i-local-stack-readiness-procedure.mjs';
import {
  APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR,
  COMMAND_FAMILY,
} from './m5.3a-3m-local-stack-readiness-command-binding.mjs';
import {
  DEFAULT_SYNTHETIC_OUTCOME,
  createLocalStackReadinessRealBindingAdapterIntegrationResult,
} from './m5.3a-3o-local-stack-readiness-real-binding-adapter-integration.mjs';

const descriptorWith = (overrides = {}) => ({
  ...APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR,
  ...overrides,
});

const outcomeWith = (overrides = {}) => ({
  ...DEFAULT_SYNTHETIC_OUTCOME,
  ...overrides,
});

const expectProofBoundariesUnchanged = (boundaries) => {
  assert.equal(boundaries.rootCauseInferred, 'no');
  assert.equal(boundaries.localDbAvailability, 'unresolved');
  assert.equal(boundaries.schemaAvailability, 'not proven');
  assert.equal(boundaries.artifactSelectIsolation, 'not verified');
  assert.equal(boundaries.tenantIsolation, 'not newly verified');
  assert.equal(boundaries.rls, 'not proven');
  assert.equal(boundaries.hostedReadiness, 'not proven');
  assert.equal(boundaries.productionReadiness, 'not proven');
  assert.equal(boundaries.localStartupSuccess, 'not proven');
  assert.deepEqual(boundaries, proofBoundaries);
};

const expectFailClosed = async (options, reason = 'unsupported-readiness-state') => {
  const result = await createLocalStackReadinessRealBindingAdapterIntegrationResult(options);
  assert.equal(result.ok, false);
  assert.equal(result.commandLabel, COMMAND_LABEL);
  assert.equal(result.runCount, 1);
  assert.equal(result.readinessAttemptStatus, 'fail-closed');
  assert.equal(result.localStartupStatusBucket, 'fail-closed');
  assert.equal(result.localStackReadinessBucket, 'fail-closed');
  assert.equal(result.serviceReadinessBucket, 'fail-closed');
  assert.equal(result.failClosedReason, reason);
  expectProofBoundariesUnchanged(result.proofBoundaries);
  return result;
};

const validResult = await createLocalStackReadinessRealBindingAdapterIntegrationResult();
assert.equal(validResult.ok, true);
assert.equal(validResult.commandLabel, COMMAND_LABEL);
assert.equal(validResult.runCount, 1);
assert.equal(validResult.readinessAttemptStatus, 'blocked');
assert.equal(validResult.localStartupStatusBucket, 'unknown');
assert.equal(validResult.localStackReadinessBucket, 'unknown');
assert.equal(validResult.serviceReadinessBucket, 'unknown');
assert.equal(validResult.outputSafetyResult, 'not-captured');
assert.equal(validResult.cleanupResult, 'not-needed');
assert.equal(validResult.failClosedReason, 'none');
expectProofBoundariesUnchanged(validResult.proofBoundaries);

await expectFailClosed({
  realCommandBindingDescriptor: descriptorWith({ commandFamily: 'unsupported-command-family' }),
});

await expectFailClosed({
  realCommandBindingDescriptor: descriptorWith({ realExecutionApproved: true }),
});

await expectFailClosed({
  realCommandBindingDescriptor: descriptorWith({ executionRequiresFutureApproval: false }),
});

await expectFailClosed({
  realCommandBindingDescriptor: descriptorWith({ runCountLimit: 2 }),
});

const commandTextFixture = 'synthetic command text that must not be emitted';
const literalCommandResult = await expectFailClosed({
  realCommandBindingDescriptor: descriptorWith({ commandString: commandTextFixture }),
});
assert.equal(JSON.stringify(literalCommandResult).includes(commandTextFixture), false);

await expectFailClosed({
  realCommandBindingDescriptor: descriptorWith({ shellCommand: 'synthetic shell command text' }),
});

const processFieldName = ['process', 'Runner'].join('');
await expectFailClosed({
  realCommandBindingDescriptor: descriptorWith({ [processFieldName]: 'synthetic process runner value' }),
});

const rawStdoutFixture = 'harmless raw stdout fixture that must not be emitted';
const rawStdoutResult = await expectFailClosed({
  syntheticOutcome: outcomeWith({ rawStdout: rawStdoutFixture }),
}, 'raw-output-needed');
assert.equal(JSON.stringify(rawStdoutResult).includes(rawStdoutFixture), false);

await expectFailClosed({
  syntheticOutcome: outcomeWith({ stderr: 'harmless synthetic stderr text' }),
}, 'raw-output-needed');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ logs: 'harmless synthetic log text' }),
}, 'raw-output-needed');

const localPathFixture = 'Z:\\synthetic\\local-stack-readiness.txt';
const localPathResult = await expectFailClosed({
  syntheticOutcome: outcomeWith({ cleanupResult: localPathFixture }),
}, 'local-path-needed');
assert.equal(JSON.stringify(localPathResult).includes(localPathFixture), false);

await expectFailClosed({
  syntheticOutcome: outcomeWith({ outputSafetyResult: '.env synthetic value' }),
});

await expectFailClosed({
  syntheticOutcome: outcomeWith({ localStartupStatusBucket: 'postgres://synthetic.invalid/example' }),
}, 'db-url-like-value');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ localStartupStatusBucket: 'localhost' }),
}, 'target-like-value');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ serviceReadinessBucket: 'target value synthetic' }),
}, 'target-like-value');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ outputSafetyResult: 'synthetic provider key value' }),
}, 'secret-like-value');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ serviceReadinessBucket: 'image id sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
}, 'container-image-id-like-value');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ localStartupStatusBucket: 'machine name synthetic' }),
}, 'machine-specific-value');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ rootCauseInferred: true }),
}, 'root-cause-inference-needed');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ schemaReadinessImplied: true }),
});

await expectFailClosed({
  syntheticOutcome: outcomeWith({ rlsReadinessImplied: true }),
});

await expectFailClosed({
  syntheticOutcome: outcomeWith({ artifactReadinessImplied: true }),
});

await expectFailClosed({
  syntheticOutcome: outcomeWith({ tenantIsolationVerified: true }),
});

await expectFailClosed({
  syntheticOutcome: outcomeWith({ hostedReadinessImplied: true }),
});

await expectFailClosed({
  syntheticOutcome: outcomeWith({ productionReadinessImplied: true }),
});

await expectFailClosed({
  syntheticOutcome: outcomeWith({ cleanupResult: 'failed' }),
}, 'cleanup-failed');

await expectFailClosed({
  syntheticOutcome: outcomeWith({ runCount: 2 }),
});

await expectFailClosed({
  rawStdout: 'top-level raw output must fail closed',
}, 'raw-output-needed');

const serializedValid = JSON.stringify(validResult);
assert.equal(serializedValid.includes('commandString'), false);
assert.equal(serializedValid.includes('shellCommand'), false);
assert.equal(serializedValid.includes(COMMAND_FAMILY), false);
assert.equal(serializedValid.includes('supabase start'), false);
assert.equal(serializedValid.includes('docker'), false);
assert.equal(serializedValid.includes('node scripts/'), false);
assert.equal(serializedValid.includes('postgres://'), false);
assert.equal(serializedValid.includes('localhost'), false);
assert.equal(serializedValid.includes('127.0.0.1'), false);
assert.equal(serializedValid.includes('Z:\\'), false);
assert.equal(Object.hasOwn(validResult, 'realExecutionApproved'), false);
assert.equal(Object.hasOwn(validResult, 'executionRequiresFutureApproval'), false);
assert.equal(Object.hasOwn(validResult, 'commandString'), false);
assert.equal(Object.hasOwn(validResult, 'shellCommand'), false);
assert.equal(Object.hasOwn(validResult, 'command'), false);
expectProofBoundariesUnchanged(validResult.proofBoundaries);

console.log('M5.3a-3o local stack readiness real binding adapter integration synthetic regression passed.');
