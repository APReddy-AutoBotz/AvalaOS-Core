const MILESTONE_NAME = 'M5.3a-9 RLS and Artifact Evidence Harness Synthetic Boundary Implementation';

const ALLOWED_ASSERTION_NAMES = Object.freeze([
  'schema-availability-precondition',
  'rls-helper-tenant-context-boundary',
  'rls-helper-missing-context-fail-closed',
  'rls-helper-invalid-context-fail-closed',
  'artifact-select-same-tenant-allowed-if-approved',
  'artifact-select-cross-tenant-blocked',
  'artifact-select-missing-context-blocked',
  'artifact-select-invalid-context-blocked',
  'artifact-select-output-sanitization',
  'evidence-harness-fail-closed-safety',
]);

const ALLOWED_INPUT_FIELDS = Object.freeze([
  'milestoneName',
  'assertionName',
  'runCount',
  'approvalScope',
  'tenantBoundaryScope',
  'requestedOutputFields',
  'requestedMode',
  'proofBoundaryAcknowledgement',
]);

const ALLOWED_OUTPUT_FIELDS = Object.freeze([
  'milestoneName',
  'assertionName',
  'runCount',
  'schemaAvailabilityBucket',
  'rlsHelperBehaviorBucket',
  'artifactSelectIsolationBucket',
  'tenantBoundaryBucket',
  'outputSafetyResult',
  'cleanupResult',
  'failClosedReason',
  'proofBoundaries',
]);

const SANITIZED_BUCKET_VALUES = Object.freeze([
  'not-run',
  'proposed-only',
  'synthetic-boundary-valid',
  'blocked-approval-missing',
  'blocked-unsupported-assertion',
  'blocked-run-count',
  'blocked-prohibited-input',
  'blocked-prohibited-output',
  'blocked-execution-mode',
  'blocked-proof-boundary-missing',
  'fail-closed',
]);

const PROOF_BOUNDARIES = Object.freeze({
  rootCauseInferred: 'no',
  localDbAvailability: 'unresolved',
  schemaAvailability: 'not proven',
  artifactSelectIsolation: 'not verified',
  tenantIsolation: 'not newly verified',
  rls: 'not proven',
  hostedReadiness: 'not proven',
  productionReadiness: 'not proven',
  localStartupSuccess: 'not proven',
});

const APPROVED_APPROVAL_SCOPE = 'ap-approved-synthetic-boundary-implementation';
const APPROVED_TENANT_BOUNDARY_SCOPE = 'synthetic-boundary-only';
const APPROVED_REQUESTED_MODE = 'synthetic-boundary';
const APPROVED_PROOF_ACKNOWLEDGEMENT = true;

const allowedAssertionNameSet = new Set(ALLOWED_ASSERTION_NAMES);
const allowedInputFieldSet = new Set(ALLOWED_INPUT_FIELDS);
const allowedOutputFieldSet = new Set(ALLOWED_OUTPUT_FIELDS);
const bucketValueSet = new Set(SANITIZED_BUCKET_VALUES);

const executionModeSignals = Object.freeze([
  'real',
  'execute',
  'execution',
  'db',
  'database',
  'schema',
  'sql',
  'rls',
  'artifact',
  'select',
  'hosted',
  'command',
  'shell',
  'docker',
  'supabase',
  'provider',
  'classifier',
  'readiness',
]);

const prohibitedFieldSignals = Object.freeze([
  'auth',
  'claim',
  'command',
  'container',
  'database',
  'db',
  'docker',
  'dotenv',
  'env',
  'host',
  'image',
  'ip',
  'local',
  'machine',
  'path',
  'payload',
  'port',
  'private',
  'project',
  'provider',
  'raw',
  'row',
  'secret',
  'serviceRole',
  'service-role',
  'shell',
  'stderr',
  'stdout',
  'target',
  'token',
]);

const prohibitedValueSignals = Object.freeze([
  '.env',
  'auth header',
  'claim value',
  'command string',
  'container id',
  'database url',
  'db url',
  'host value',
  'image id',
  'ip value',
  'local path',
  'machine value',
  'port value',
  'private token',
  'provider key',
  'raw log',
  'raw output',
  'raw stderr',
  'raw stdout',
  'row payload',
  'service role',
  'shell command',
  'target value',
]);

const stringHasAnySignal = (value, signals) => {
  const normalized = value.toLowerCase();
  return signals.some((signal) => normalized.includes(signal.toLowerCase()));
};

const isPlainObject = (value) => Boolean(
  value
    && typeof value === 'object'
    && !Array.isArray(value)
);

const cloneProofBoundaries = () => ({ ...PROOF_BOUNDARIES });

const sanitizeRunCount = (runCount) => (
  Number.isInteger(runCount) && runCount >= 0 && runCount <= 1 ? runCount : 0
);

const sanitizeAssertionName = (assertionName) => (
  allowedAssertionNameSet.has(assertionName) ? assertionName : 'not-run'
);

const resultWithReason = (input = {}, reason = 'fail-closed') => {
  const bucket = bucketValueSet.has(reason) ? reason : 'fail-closed';

  return {
    milestoneName: MILESTONE_NAME,
    assertionName: sanitizeAssertionName(input.assertionName),
    runCount: sanitizeRunCount(input.runCount),
    schemaAvailabilityBucket: bucket,
    rlsHelperBehaviorBucket: bucket,
    artifactSelectIsolationBucket: bucket,
    tenantBoundaryBucket: bucket,
    outputSafetyResult: bucket,
    cleanupResult: bucket === 'synthetic-boundary-valid' ? 'not-run' : bucket,
    failClosedReason: bucket,
    proofBoundaries: cloneProofBoundaries(),
  };
};

function approvedAssertionRegistry() {
  return ALLOWED_ASSERTION_NAMES.map((assertionName) => ({
    assertionName,
    mode: 'synthetic-boundary only',
    realExecuted: false,
    readinessEvidence: false,
    schemaProof: false,
    rlsProof: false,
    artifactSelectProof: false,
    futureApApprovalRequiredForRealExecution: true,
  }));
}

function sanitizedOutputContract() {
  return {
    allowedOutputFields: [...ALLOWED_OUTPUT_FIELDS],
    sanitizedBucketValues: [...SANITIZED_BUCKET_VALUES],
  };
}

function proofBoundaryRecorder() {
  return cloneProofBoundaries();
}

function failClosedDecisionMapper(reason) {
  return bucketValueSet.has(reason) ? reason : 'fail-closed';
}

function runCountLimiter(runCount) {
  return {
    ok: Number.isInteger(runCount) && runCount >= 0 && runCount <= 1,
    reason: 'blocked-run-count',
  };
}

function approvalScopeChecker(approvalScope, tenantBoundaryScope) {
  return {
    ok: approvalScope === APPROVED_APPROVAL_SCOPE
      && tenantBoundaryScope === APPROVED_TENANT_BOUNDARY_SCOPE,
    reason: 'blocked-approval-missing',
  };
}

function approvedAssertionChecker(assertionName) {
  return {
    ok: allowedAssertionNameSet.has(assertionName),
    reason: 'blocked-unsupported-assertion',
  };
}

function noExecutionGuard(requestedMode) {
  if (requestedMode !== APPROVED_REQUESTED_MODE) {
    return { ok: false, reason: 'blocked-execution-mode' };
  }

  if (typeof requestedMode === 'string' && stringHasAnySignal(requestedMode, executionModeSignals)) {
    return { ok: false, reason: 'blocked-execution-mode' };
  }

  return { ok: true, reason: 'synthetic-boundary-valid' };
}

function prohibitedOutputGuard(requestedOutputFields) {
  if (!Array.isArray(requestedOutputFields)) {
    return { ok: false, reason: 'blocked-prohibited-output' };
  }

  const ok = requestedOutputFields.every((fieldName) => (
    typeof fieldName === 'string'
      && allowedOutputFieldSet.has(fieldName)
      && !stringHasAnySignal(fieldName, prohibitedFieldSignals)
  ));

  return {
    ok,
    reason: ok ? 'synthetic-boundary-valid' : 'blocked-prohibited-output',
  };
}

const fieldNameIsAllowedAndSafe = (fieldName) => (
  allowedInputFieldSet.has(fieldName)
    && !stringHasAnySignal(fieldName, prohibitedFieldSignals)
);

const valueContainsProhibitedClass = (value) => {
  if (typeof value === 'string') {
    return stringHasAnySignal(value, prohibitedValueSignals);
  }

  if (Array.isArray(value)) {
    return value.some(valueContainsProhibitedClass);
  }

  if (isPlainObject(value)) {
    return Object.entries(value).some(([fieldName, entryValue]) => (
      stringHasAnySignal(fieldName, prohibitedFieldSignals)
        || valueContainsProhibitedClass(entryValue)
    ));
  }

  return false;
};

const prohibitedInputGuard = (input) => {
  if (!isPlainObject(input)) {
    return { ok: false, reason: 'blocked-prohibited-input' };
  }

  const ok = Object.entries(input).every(([fieldName, value]) => (
    fieldNameIsAllowedAndSafe(fieldName)
      && !valueContainsProhibitedClass(value)
  ));

  return {
    ok,
    reason: ok ? 'synthetic-boundary-valid' : 'blocked-prohibited-input',
  };
};

const proofBoundaryAcknowledgementChecker = (proofBoundaryAcknowledgement) => ({
  ok: proofBoundaryAcknowledgement === APPROVED_PROOF_ACKNOWLEDGEMENT,
  reason: 'blocked-proof-boundary-missing',
});

const milestoneChecker = (milestoneName) => ({
  ok: milestoneName === MILESTONE_NAME,
  reason: 'fail-closed',
});

const checksInOrder = (input) => [
  milestoneChecker(input.milestoneName),
  approvalScopeChecker(input.approvalScope, input.tenantBoundaryScope),
  approvedAssertionChecker(input.assertionName),
  runCountLimiter(input.runCount),
  noExecutionGuard(input.requestedMode),
  proofBoundaryAcknowledgementChecker(input.proofBoundaryAcknowledgement),
  prohibitedInputGuard(input),
  prohibitedOutputGuard(input.requestedOutputFields),
];

function harnessBoundaryValidator(input = {}) {
  if (!isPlainObject(input)) return resultWithReason({}, 'blocked-prohibited-input');

  for (const check of checksInOrder(input)) {
    if (!check.ok) return resultWithReason(input, failClosedDecisionMapper(check.reason));
  }

  return resultWithReason(input, 'synthetic-boundary-valid');
}

function createApprovedSyntheticBoundaryInput(overrides = {}) {
  return {
    milestoneName: MILESTONE_NAME,
    assertionName: ALLOWED_ASSERTION_NAMES[0],
    runCount: 1,
    approvalScope: APPROVED_APPROVAL_SCOPE,
    tenantBoundaryScope: APPROVED_TENANT_BOUNDARY_SCOPE,
    requestedOutputFields: [...ALLOWED_OUTPUT_FIELDS],
    requestedMode: APPROVED_REQUESTED_MODE,
    proofBoundaryAcknowledgement: APPROVED_PROOF_ACKNOWLEDGEMENT,
    ...overrides,
  };
}

export {
  ALLOWED_ASSERTION_NAMES,
  ALLOWED_INPUT_FIELDS,
  ALLOWED_OUTPUT_FIELDS,
  MILESTONE_NAME,
  PROOF_BOUNDARIES,
  SANITIZED_BUCKET_VALUES,
  approvedAssertionRegistry,
  approvalScopeChecker,
  createApprovedSyntheticBoundaryInput,
  failClosedDecisionMapper,
  harnessBoundaryValidator,
  noExecutionGuard,
  prohibitedOutputGuard,
  proofBoundaryRecorder,
  runCountLimiter,
  sanitizedOutputContract,
};
