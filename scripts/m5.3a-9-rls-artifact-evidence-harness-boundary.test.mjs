import assert from 'node:assert/strict';

import {
  ALLOWED_ASSERTION_NAMES,
  ALLOWED_OUTPUT_FIELDS,
  MILESTONE_NAME,
  PROOF_BOUNDARIES,
  SANITIZED_BUCKET_VALUES,
  approvedAssertionRegistry,
  createApprovedSyntheticBoundaryInput,
  failClosedDecisionMapper,
  harnessBoundaryValidator,
  proofBoundaryRecorder,
  sanitizedOutputContract,
} from './m5.3a-9-rls-artifact-evidence-harness-boundary.mjs';

const expectedOutputFields = [...ALLOWED_OUTPUT_FIELDS].sort();

const assertOnlyAllowedOutputFields = (result) => {
  assert.deepEqual(Object.keys(result).sort(), expectedOutputFields);
};

const assertProofBoundariesPresent = (result) => {
  assert.deepEqual(result.proofBoundaries, PROOF_BOUNDARIES);
  assert.equal(result.proofBoundaries.rootCauseInferred, 'no');
  assert.equal(result.proofBoundaries.localDbAvailability, 'unresolved');
  assert.equal(result.proofBoundaries.schemaAvailability, 'not proven');
  assert.equal(result.proofBoundaries.artifactSelectIsolation, 'not verified');
  assert.equal(result.proofBoundaries.tenantIsolation, 'not newly verified');
  assert.equal(result.proofBoundaries.rls, 'not proven');
  assert.equal(result.proofBoundaries.hostedReadiness, 'not proven');
  assert.equal(result.proofBoundaries.productionReadiness, 'not proven');
  assert.equal(result.proofBoundaries.localStartupSuccess, 'not proven');
};

const assertSanitizedBucketsOnly = (result) => {
  assert.ok(SANITIZED_BUCKET_VALUES.includes(result.schemaAvailabilityBucket));
  assert.ok(SANITIZED_BUCKET_VALUES.includes(result.rlsHelperBehaviorBucket));
  assert.ok(SANITIZED_BUCKET_VALUES.includes(result.artifactSelectIsolationBucket));
  assert.ok(SANITIZED_BUCKET_VALUES.includes(result.tenantBoundaryBucket));
  assert.ok(SANITIZED_BUCKET_VALUES.includes(result.outputSafetyResult));
  assert.ok(SANITIZED_BUCKET_VALUES.includes(result.cleanupResult));
  assert.ok(SANITIZED_BUCKET_VALUES.includes(result.failClosedReason));
};

const assertNoRawOrLocalOutput = (result, redactedFixture = 'redacted-prohibited-value') => {
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('rawStdout'), false);
  assert.equal(serialized.includes('rawStderr'), false);
  assert.equal(serialized.includes('rawOutput'), false);
  assert.equal(serialized.includes('rawLogs'), false);
  assert.equal(serialized.includes('stackTrace'), false);
  assert.equal(serialized.includes('scratchOutput'), false);
  assert.equal(serialized.includes('localPath'), false);
  assert.equal(serialized.includes('dbUrl'), false);
  assert.equal(serialized.includes('authHeader'), false);
  assert.equal(serialized.includes('claimValue'), false);
  assert.equal(serialized.includes('providerKey'), false);
  assert.equal(serialized.includes('serviceRole'), false);
  assert.equal(serialized.includes('privateToken'), false);
  assert.equal(serialized.includes('containerId'), false);
  assert.equal(serialized.includes('imageId'), false);
  assert.equal(serialized.includes('machineSpecificValue'), false);
  assert.equal(serialized.includes(redactedFixture), false);
};

const assertNoReadinessClaim = (result) => {
  assert.equal(Object.hasOwn(result, 'schemaReady'), false);
  assert.equal(Object.hasOwn(result, 'rlsReady'), false);
  assert.equal(Object.hasOwn(result, 'artifactReady'), false);
  assert.equal(Object.hasOwn(result, 'tenantIsolationVerified'), false);
  assert.equal(Object.hasOwn(result, 'hostedReady'), false);
  assert.equal(Object.hasOwn(result, 'productionReady'), false);
  assert.equal(Object.values(result.proofBoundaries).includes('ready'), false);
  assert.equal(Object.values(result.proofBoundaries).includes('proven'), false);
  assert.equal(Object.values(result.proofBoundaries).includes('verified'), false);
};

const assertSafeResultShape = (result) => {
  assertOnlyAllowedOutputFields(result);
  assertProofBoundariesPresent(result);
  assertSanitizedBucketsOnly(result);
  assertNoRawOrLocalOutput(result);
  assertNoReadinessClaim(result);
};

const expectFailClosed = (overrides, expectedReason) => {
  const result = harnessBoundaryValidator(createApprovedSyntheticBoundaryInput(overrides));
  assert.equal(result.failClosedReason, expectedReason);
  assertSafeResultShape(result);
  return result;
};

const registry = approvedAssertionRegistry();
assert.equal(registry.length, ALLOWED_ASSERTION_NAMES.length);
for (const assertionName of ALLOWED_ASSERTION_NAMES) {
  const registryEntry = registry.find((entry) => entry.assertionName === assertionName);
  assert.equal(registryEntry.mode, 'synthetic-boundary only');
  assert.equal(registryEntry.realExecuted, false);
  assert.equal(registryEntry.readinessEvidence, false);
  assert.equal(registryEntry.schemaProof, false);
  assert.equal(registryEntry.rlsProof, false);
  assert.equal(registryEntry.artifactSelectProof, false);
  assert.equal(registryEntry.futureApApprovalRequiredForRealExecution, true);

  const result = harnessBoundaryValidator(createApprovedSyntheticBoundaryInput({ assertionName }));
  assert.equal(result.milestoneName, MILESTONE_NAME);
  assert.equal(result.assertionName, assertionName);
  assert.equal(result.runCount, 1);
  assert.equal(result.failClosedReason, 'synthetic-boundary-valid');
  assertSafeResultShape(result);
}

const outputContract = sanitizedOutputContract();
assert.deepEqual(outputContract.allowedOutputFields, ALLOWED_OUTPUT_FIELDS);
assert.deepEqual(outputContract.sanitizedBucketValues, SANITIZED_BUCKET_VALUES);
assert.deepEqual(proofBoundaryRecorder(), PROOF_BOUNDARIES);
assert.equal(failClosedDecisionMapper('blocked-run-count'), 'blocked-run-count');
assert.equal(failClosedDecisionMapper('unsupported-internal-reason'), 'fail-closed');

const unsupportedAssertion = expectFailClosed(
  { assertionName: 'unsupported-assertion' },
  'blocked-unsupported-assertion',
);
assert.equal(unsupportedAssertion.assertionName, 'not-run');

expectFailClosed({ approvalScope: undefined }, 'blocked-approval-missing');
expectFailClosed({ approvalScope: 'ambiguous' }, 'blocked-approval-missing');
expectFailClosed({ tenantBoundaryScope: undefined }, 'blocked-approval-missing');
expectFailClosed({ runCount: 2 }, 'blocked-run-count');
expectFailClosed({ runCount: undefined }, 'blocked-run-count');
expectFailClosed({ runCount: '1' }, 'blocked-run-count');
expectFailClosed({ runCount: -1 }, 'blocked-run-count');

for (const requestedMode of [
  'real-execution',
  'db-execution',
  'schema-inspection',
  'rls-test',
  'artifact-assertion',
  'hosted-validation',
  'command-execution',
]) {
  expectFailClosed({ requestedMode }, 'blocked-execution-mode');
}

for (const prohibitedFieldName of [
  'dbUrl',
  'hostValue',
  'portValue',
  'ipValue',
  'localPath',
  'envValue',
  'rowPayload',
  'authHeader',
  'claimValue',
  'providerKey',
  'serviceRole',
  'privateToken',
  'hostedIdentifier',
  'containerId',
  'imageId',
  'concreteCommandString',
  'shellCommand',
  'machineSpecificValue',
]) {
  const result = harnessBoundaryValidator({
    ...createApprovedSyntheticBoundaryInput(),
    [prohibitedFieldName]: 'redacted-prohibited-value',
  });
  assert.equal(result.failClosedReason, 'blocked-prohibited-input');
  assertSafeResultShape(result);
  assertNoRawOrLocalOutput(result, 'redacted-prohibited-value');
}

for (const prohibitedOutputField of [
  'rawStdout',
  'rawStderr',
  'rawOutput',
  'rawLogs',
  'stackTrace',
  'scratchOutput',
  'localPath',
  'dbUrl',
  'authHeader',
  'claimValue',
  'providerKey',
  'serviceRole',
  'privateToken',
  'hostedIdentifier',
  'containerId',
  'imageId',
  'machineSpecificValue',
]) {
  const result = harnessBoundaryValidator(createApprovedSyntheticBoundaryInput({
    requestedOutputFields: [...ALLOWED_OUTPUT_FIELDS, prohibitedOutputField],
  }));
  assert.equal(result.failClosedReason, 'blocked-prohibited-output');
  assertSafeResultShape(result);
}

expectFailClosed({ requestedOutputFields: undefined }, 'blocked-prohibited-output');
expectFailClosed({ requestedOutputFields: ['milestoneName'] }, 'synthetic-boundary-valid');
expectFailClosed({ proofBoundaryAcknowledgement: undefined }, 'blocked-proof-boundary-missing');
expectFailClosed({ proofBoundaryAcknowledgement: false }, 'blocked-proof-boundary-missing');

const nonObjectResult = harnessBoundaryValidator(null);
assert.equal(nonObjectResult.failClosedReason, 'blocked-prohibited-input');
assertSafeResultShape(nonObjectResult);

const validResult = harnessBoundaryValidator(createApprovedSyntheticBoundaryInput());
assert.equal(validResult.failClosedReason, 'synthetic-boundary-valid');
assertSafeResultShape(validResult);

console.log('M5.3a-9 RLS and artifact evidence harness synthetic boundary tests passed.');
