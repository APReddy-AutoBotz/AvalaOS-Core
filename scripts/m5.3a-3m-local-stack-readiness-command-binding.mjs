import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  COMMAND_LABEL,
  proofBoundaries,
} from './m5.3a-3i-local-stack-readiness-procedure.mjs';

const BINDING_NAME = 'Local Stack Readiness Real Command Binding';
const COMMAND_FAMILY = 'local-stack-readiness-real-command-family';
const BINDING_MODE = 'metadata-only-real-command-family-binding';
const FAIL_CLOSED_REASON = 'unsupported-command-binding-state';

const allowedSanitizedFields = Object.freeze([
  'runCount',
  'commandLabel',
  'readinessAttemptStatus',
  'localStartupStatusBucket',
  'localStackReadinessBucket',
  'serviceReadinessBucket',
  'outputSafetyResult',
  'cleanupResult',
  'failClosedReason',
  'proofBoundaries',
]);

const prohibitedEvidence = Object.freeze([
  'literal command string',
  'raw stdout, stderr, or logs',
  'stack traces',
  'scratch output',
  'local paths',
  '.env values',
  'host, port, or IP values',
  'DB URLs',
  'database names',
  'user names',
  'project refs',
  'target values',
  'row payloads',
  'auth headers',
  'claim values',
  'provider keys',
  'service-role values',
  'private tokens',
  'hosted identifiers',
  'container IDs',
  'image IDs',
  'machine-specific values',
]);

const stopFailClosedConditions = Object.freeze([
  'command family missing or unsupported',
  'command label missing or unsupported',
  'run count limit is not one',
  'real execution approval is true',
  'literal command string is provided',
  'local path-like value is provided',
  'environment value is provided',
  'DB URL, host, port, IP, project, or target value is provided',
  'secret, token, provider, service-role, or private value is provided',
  'raw output or log field is provided',
  'container or image ID-like value is provided',
  'machine-specific value is provided',
  'schema, RLS, artifact, tenant, hosted, or production readiness is implied',
  'root cause is inferred',
  'unsupported field appears',
]);

const approvedProofBoundaries = Object.freeze({
  rootCauseInferred: proofBoundaries.rootCauseInferred,
  localDbAvailability: proofBoundaries.localDbAvailability,
  schemaAvailability: proofBoundaries.schemaAvailability,
  artifactSelectIsolation: proofBoundaries.artifactSelectIsolation,
  tenantIsolation: proofBoundaries.tenantIsolation,
  rls: proofBoundaries.rls,
  hostedReadiness: proofBoundaries.hostedReadiness,
  productionReadiness: proofBoundaries.productionReadiness,
  localStartupSuccess: proofBoundaries.localStartupSuccess,
});

const APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR = Object.freeze({
  commandFamily: COMMAND_FAMILY,
  commandLabel: COMMAND_LABEL,
  bindingMode: BINDING_MODE,
  realExecutionApproved: false,
  syntheticOnly: false,
  executionRequiresFutureApproval: true,
  runCountLimit: 1,
  allowedSanitizedFields,
  prohibitedEvidence,
  stopFailClosedConditions,
  proofBoundaries: approvedProofBoundaries,
});

const allowedDescriptorFields = new Set(Object.keys(APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR));

const forbiddenFieldNames = new Set([
  'args',
  'argv',
  'authHeader',
  'claimValue',
  'command',
  'commandArgs',
  'commandString',
  'containerId',
  'databaseName',
  'dbUrl',
  'dockerImage',
  'dotenv',
  'env',
  'environment',
  'environmentValue',
  'host',
  'hostValue',
  'imageId',
  'ipAddress',
  'localConfig',
  'localPath',
  'machineName',
  'port',
  'portValue',
  'privateToken',
  'projectRef',
  'providerKey',
  'rawLog',
  'rawLogs',
  'rawOutput',
  'rawStderr',
  'rawStdout',
  'rootCause',
  'rootCauseInferred',
  'schemaReady',
  'schemaReadinessImplied',
  'shellCommand',
  'serviceRole',
  'stderr',
  'stdout',
  'target',
  'targetValue',
  'token',
  'userName',
]);

const unsafeValuePatterns = [
  /(?:^|[\s'"])[A-Za-z]:[\\/]/,
  /(?:^|[\s'"])(?:\/Users|\/home|\/var|\/tmp|\/mnt|\/Volumes)\//,
  /\b(?:postgres(?:ql)?:\/\/|database_url|db\s*url|database\s+name|user\s+name)\b/i,
  /\b(?:https?:\/\/|localhost|127\.0\.0\.1|host\s+value|port\s+value|ip\s+(?:value|address)|target\s+value|project\s+ref)\b/i,
  /\b(?:secret|token|provider\s*key|service[-_\s]?role|private\s*token|anon\s+key|jwt|\.env)\b/i,
  /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /\b(?:container\s+id|image\s+id|sha256:[0-9a-f]{12,})\b/i,
  /\b[0-9a-f]{32,64}\b/i,
  /\b(?:machine\s+name|computername|hostname|volume\s+name|network\s+name|local\s+config\s+value)\b/i,
];

const cloneProofBoundaries = () => ({ ...approvedProofBoundaries });

const cloneDescriptor = () => ({
  ...APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR,
  allowedSanitizedFields: [...allowedSanitizedFields],
  prohibitedEvidence: [...prohibitedEvidence],
  stopFailClosedConditions: [...stopFailClosedConditions],
  proofBoundaries: cloneProofBoundaries(),
});

const failClosed = () => ({
  ok: false,
  bindingName: BINDING_NAME,
  commandFamily: COMMAND_FAMILY,
  commandLabel: COMMAND_LABEL,
  bindingMode: BINDING_MODE,
  realExecutionApproved: false,
  syntheticOnly: false,
  executionRequiresFutureApproval: true,
  runCountLimit: 1,
  failClosedReason: FAIL_CLOSED_REASON,
  proofBoundaries: cloneProofBoundaries(),
});

const arraysEqual = (actual, expected) => (
  Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
);

const proofBoundariesEqual = (actual) => Boolean(
  actual
    && typeof actual === 'object'
    && !Array.isArray(actual)
    && Object.keys(actual).length === Object.keys(approvedProofBoundaries).length
    && Object.entries(approvedProofBoundaries).every(([key, value]) => actual[key] === value)
);

const scalarDescriptorFieldsSupported = (descriptor) => Boolean(
  descriptor.commandFamily === COMMAND_FAMILY
    && descriptor.commandLabel === COMMAND_LABEL
    && descriptor.bindingMode === BINDING_MODE
    && descriptor.realExecutionApproved === false
    && descriptor.syntheticOnly === false
    && descriptor.executionRequiresFutureApproval === true
    && descriptor.runCountLimit === 1
);

const descriptorListsSupported = (descriptor) => Boolean(
  arraysEqual(descriptor.allowedSanitizedFields, allowedSanitizedFields)
    && arraysEqual(descriptor.prohibitedEvidence, prohibitedEvidence)
    && arraysEqual(descriptor.stopFailClosedConditions, stopFailClosedConditions)
);

const fieldNameIsForbidden = (fieldName) => {
  const normalized = fieldName.toLowerCase();
  return forbiddenFieldNames.has(fieldName)
    || forbiddenFieldNames.has(normalized)
    || normalized.includes('commandstring')
    || normalized.includes('shellcommand')
    || normalized.includes('raw')
    || normalized.includes('secret')
    || normalized.includes('token')
    || normalized.includes('serviceRole'.toLowerCase())
    || normalized.includes('private')
    || normalized.includes('dotenv')
    || normalized.includes('environment')
    || normalized.includes('localpath')
    || normalized.includes('localconfig')
    || normalized.includes('container')
    || normalized.includes('imageid')
    || normalized.includes('rootcause')
    || normalized.includes('schemaready')
    || normalized.includes('rlsready')
    || normalized.includes('artifactready')
    || normalized.includes('tenantisolation')
    || normalized.includes('hostedready')
    || normalized.includes('productionready');
};

const stringValueIsUnsafe = (value) => unsafeValuePatterns.some((pattern) => pattern.test(value));

const unsupportedExtraFieldPresent = (descriptor) => Object.keys(descriptor).some((fieldName) => (
  !allowedDescriptorFields.has(fieldName) || fieldNameIsForbidden(fieldName)
));

const unsafeExtraValuePresent = (descriptor) => Object.entries(descriptor).some(([fieldName, value]) => {
  if (allowedDescriptorFields.has(fieldName)) return false;
  if (typeof value === 'string') return stringValueIsUnsafe(value);
  if (Array.isArray(value)) return value.some((entry) => typeof entry === 'string' && stringValueIsUnsafe(entry));
  return false;
});

function validateLocalStackReadinessCommandBindingDescriptor(descriptor = {}) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return failClosed();
  if (unsupportedExtraFieldPresent(descriptor)) return failClosed();
  if (unsafeExtraValuePresent(descriptor)) return failClosed();
  if (!scalarDescriptorFieldsSupported(descriptor)) return failClosed();
  if (!descriptorListsSupported(descriptor)) return failClosed();
  if (!proofBoundariesEqual(descriptor.proofBoundaries)) return failClosed();

  return {
    ok: true,
    bindingName: BINDING_NAME,
    descriptor: cloneDescriptor(),
  };
}

function createLocalStackReadinessCommandBindingDescriptor(overrides = {}) {
  return validateLocalStackReadinessCommandBindingDescriptor({
    ...cloneDescriptor(),
    ...overrides,
  });
}

function createMissingCommandBindingFailClosedResult() {
  return failClosed();
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const result = createMissingCommandBindingFailClosedResult();
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
}

export {
  APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR,
  BINDING_MODE,
  BINDING_NAME,
  COMMAND_FAMILY,
  createLocalStackReadinessCommandBindingDescriptor,
  createMissingCommandBindingFailClosedResult,
  validateLocalStackReadinessCommandBindingDescriptor,
};
