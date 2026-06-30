import assert from 'node:assert/strict';

import { COMMAND_LABEL, proofBoundaries } from './m5.3a-3i-local-stack-readiness-procedure.mjs';
import {
  APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR,
  BINDING_MODE,
  COMMAND_FAMILY,
  createLocalStackReadinessCommandBindingDescriptor,
  validateLocalStackReadinessCommandBindingDescriptor,
} from './m5.3a-3m-local-stack-readiness-command-binding.mjs';

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
};

const expectFailClosed = (overrides) => {
  const result = createLocalStackReadinessCommandBindingDescriptor(overrides);
  assert.equal(result.ok, false);
  assert.equal(result.commandFamily, COMMAND_FAMILY);
  assert.equal(result.commandLabel, COMMAND_LABEL);
  assert.equal(result.bindingMode, BINDING_MODE);
  assert.equal(result.realExecutionApproved, false);
  assert.equal(result.syntheticOnly, false);
  assert.equal(result.executionRequiresFutureApproval, true);
  assert.equal(result.runCountLimit, 1);
  assert.equal(result.failClosedReason, 'unsupported-command-binding-state');
  expectProofBoundariesUnchanged(result.proofBoundaries);
  return result;
};

const validResult = createLocalStackReadinessCommandBindingDescriptor();
assert.equal(validResult.ok, true);
assert.equal(validResult.bindingName, 'Local Stack Readiness Real Command Binding');
assert.equal(validResult.descriptor.commandFamily, COMMAND_FAMILY);
assert.equal(validResult.descriptor.commandLabel, COMMAND_LABEL);
assert.equal(validResult.descriptor.bindingMode, BINDING_MODE);
assert.equal(validResult.descriptor.realExecutionApproved, false);
assert.equal(validResult.descriptor.syntheticOnly, false);
assert.equal(validResult.descriptor.executionRequiresFutureApproval, true);
assert.equal(validResult.descriptor.runCountLimit, 1);
assert.deepEqual(validResult.descriptor.proofBoundaries, proofBoundaries);
expectProofBoundariesUnchanged(validResult.descriptor.proofBoundaries);

const validatedApproved = validateLocalStackReadinessCommandBindingDescriptor(
  APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR,
);
assert.equal(validatedApproved.ok, true);

expectFailClosed({ commandFamily: undefined });
expectFailClosed({ commandFamily: 'unsupported-command-family' });
expectFailClosed({ commandLabel: 'unsupported-command-label' });
expectFailClosed({ runCountLimit: 2 });
expectFailClosed({ realExecutionApproved: true });
expectFailClosed({ commandString: 'synthetic command text that must not be emitted' });
expectFailClosed({ shellCommand: 'synthetic shell command text' });

const syntheticPathFixture = 'Z:\\synthetic\\local-readiness-output.txt';
const localPathResult = expectFailClosed({ localPath: syntheticPathFixture });
assert.equal(JSON.stringify(localPathResult).includes(syntheticPathFixture), false);

expectFailClosed({ environmentValue: '.env synthetic value' });
expectFailClosed({ dbUrl: 'postgres://synthetic.invalid/example' });
expectFailClosed({ hostValue: 'localhost' });
expectFailClosed({ portValue: 'port value 9999' });
expectFailClosed({ ipAddress: '127.0.0.1' });
expectFailClosed({ projectRef: 'project ref synthetic' });
expectFailClosed({ targetValue: 'target value synthetic' });
expectFailClosed({ providerKey: 'synthetic provider key' });
expectFailClosed({ token: 'synthetic private token' });
expectFailClosed({ serviceRole: 'synthetic service-role value' });
expectFailClosed({ privateToken: 'synthetic private token value' });

const rawStdoutFixture = 'harmless raw stdout fixture that must not be emitted';
const rawOutputResult = expectFailClosed({ rawStdout: rawStdoutFixture });
assert.equal(JSON.stringify(rawOutputResult).includes(rawStdoutFixture), false);

expectFailClosed({ rawStderr: 'harmless raw stderr fixture' });
expectFailClosed({ rawLogs: 'harmless raw log fixture' });
expectFailClosed({ containerId: 'container id synthetic' });
expectFailClosed({ imageId: 'image id sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
expectFailClosed({ machineName: 'machine name synthetic' });
expectFailClosed({ rootCauseInferred: true });
expectFailClosed({ schemaReadinessImplied: true });
expectFailClosed({ rlsReady: true });
expectFailClosed({ artifactReady: true });
expectFailClosed({ tenantIsolationVerified: true });
expectFailClosed({ hostedReady: true });
expectFailClosed({ productionReady: true });
expectFailClosed({ unexpectedField: 'unexpected synthetic value' });

const changedProofBoundary = createLocalStackReadinessCommandBindingDescriptor({
  proofBoundaries: {
    ...proofBoundaries,
    localDbAvailability: 'ready',
  },
});
assert.equal(changedProofBoundary.ok, false);
assert.equal(changedProofBoundary.failClosedReason, 'unsupported-command-binding-state');

const changedAllowedFields = createLocalStackReadinessCommandBindingDescriptor({
  allowedSanitizedFields: [
    ...APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR.allowedSanitizedFields,
    'rawOutput',
  ],
});
assert.equal(changedAllowedFields.ok, false);
assert.equal(changedAllowedFields.failClosedReason, 'unsupported-command-binding-state');

const serializedValid = JSON.stringify(validResult);
assert.equal(Object.hasOwn(validResult.descriptor, 'commandString'), false);
assert.equal(Object.hasOwn(validResult.descriptor, 'shellCommand'), false);
assert.equal(Object.hasOwn(validResult.descriptor, 'command'), false);
assert.equal(serializedValid.includes('supabase start'), false);
assert.equal(serializedValid.includes('docker'), false);
assert.equal(serializedValid.includes('node scripts/'), false);
assert.equal(serializedValid.includes('postgres://'), false);
assert.equal(serializedValid.includes('localhost'), false);
assert.equal(serializedValid.includes('127.0.0.1'), false);
assert.equal(serializedValid.includes('Z:\\'), false);
assert.equal(serializedValid.includes('rootCauseInferred":"yes'), false);

console.log('M5.3a-3m local stack readiness command binding synthetic regression passed.');
