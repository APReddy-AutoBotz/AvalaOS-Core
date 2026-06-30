import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  COMMAND_LABEL,
  PROCEDURE_NAME,
  createLocalStackReadinessProcedureResult,
  proofBoundaries,
} from './m5.3a-3i-local-stack-readiness-procedure.mjs';

const ADAPTER_NAME = 'Local Stack Readiness Execution Adapter';
const SYNTHETIC_COMMAND_FAMILY = 'local-stack-readiness-procedure-synthetic';

const APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR = Object.freeze({
  commandFamily: SYNTHETIC_COMMAND_FAMILY,
  commandLabel: COMMAND_LABEL,
  syntheticOnly: true,
  realExecutionApproved: false,
});

const allowedOutcomeFields = new Set([
  'runCount',
  'readinessAttemptStatus',
  'localStartupStatusBucket',
  'localStackReadinessBucket',
  'serviceReadinessBucket',
  'outputSafetyResult',
  'cleanupResult',
  'failClosedReason',
]);

const rawOutputFieldNames = new Set([
  'stdout',
  'stderr',
  'stdOut',
  'stdErr',
  'log',
  'logs',
  'rawLog',
  'rawLogs',
  'rawOutput',
  'rawStdout',
  'rawStderr',
  'errorLine',
  'errorLines',
  'stack',
  'stackTrace',
  'traceback',
  'scratchOutput',
  'requiresRawOutputInspection',
  'rawOutputInspectionRequired',
]);

const rootCauseFieldNames = new Set([
  'rootCause',
  'rootCauseInferred',
  'rootCauseCategory',
  'cause',
]);

const readinessImplicationFieldNames = new Set([
  'schemaReady',
  'schemaReadinessImplied',
  'rlsReady',
  'rlsReadinessImplied',
  'artifactReady',
  'artifactReadinessImplied',
  'artifactSelectIsolationVerified',
  'tenantIsolationVerified',
  'tenantReadinessImplied',
]);

const hostedProductionFieldNames = new Set([
  'hostedReady',
  'hostedReadinessImplied',
  'productionReady',
  'productionReadinessImplied',
]);

const unsafeValuePatterns = [
  { reason: 'local-path-needed', pattern: /(?:^|[\s'"])[A-Za-z]:[\\/]/ },
  { reason: 'local-path-needed', pattern: /(?:^|[\s'"])(?:\/Users|\/home|\/var|\/tmp|\/mnt|\/Volumes)\// },
  { reason: 'db-url-like-value', pattern: /\b(?:postgres(?:ql)?:\/\/|database_url|db\s*url|database\s+name|user\s+name)\b/i },
  { reason: 'target-like-value', pattern: /\b(?:https?:\/\/|localhost|127\.0\.0\.1|host\s+value|port\s+value|ip\s+(?:value|address)|target\s+value|project\s+ref)\b/i },
  { reason: 'secret-like-value', pattern: /\b(?:secret|token|provider\s*key|service[-_\s]?role|private\s*token|anon\s+key|jwt|\.env)\b/i },
  { reason: 'secret-like-value', pattern: /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { reason: 'container-image-id-like-value', pattern: /\b(?:container\s+id|image\s+id|sha256:[0-9a-f]{12,})\b/i },
  { reason: 'container-image-id-like-value', pattern: /\b[0-9a-f]{32,64}\b/i },
  { reason: 'machine-specific-value', pattern: /\b(?:machine\s+name|computername|hostname|volume\s+name|network\s+name|local\s+config\s+value)\b/i },
];

const cloneProofBoundaries = () => ({ ...proofBoundaries });

const failClosed = (reason) => ({
  ok: false,
  procedureName: PROCEDURE_NAME,
  commandLabel: COMMAND_LABEL,
  runCount: 1,
  readinessAttemptStatus: 'fail-closed',
  localStartupStatusBucket: 'fail-closed',
  localStackReadinessBucket: 'fail-closed',
  serviceReadinessBucket: 'fail-closed',
  outputSafetyResult: reason === 'cleanup-failed' ? 'not-captured' : 'failed',
  cleanupResult: reason === 'cleanup-failed' ? 'failed' : 'not-captured',
  failClosedReason: reason,
  proofBoundaries: cloneProofBoundaries(),
});

const descriptorIsApproved = (descriptor) => Boolean(
  descriptor
    && descriptor.commandFamily === APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR.commandFamily
    && descriptor.commandLabel === APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR.commandLabel
    && descriptor.syntheticOnly === true
    && descriptor.realExecutionApproved === false
);

const reasonForFieldName = (fieldName) => {
  if (rawOutputFieldNames.has(fieldName)) return 'raw-output-needed';
  if (rootCauseFieldNames.has(fieldName)) return 'root-cause-inference-needed';
  if (readinessImplicationFieldNames.has(fieldName)) return 'unsupported-readiness-state';
  if (hostedProductionFieldNames.has(fieldName)) return 'unsupported-readiness-state';
  if (!allowedOutcomeFields.has(fieldName)) return 'unsupported-readiness-state';
  return null;
};

const reasonForStringValue = (value) => {
  for (const { reason, pattern } of unsafeValuePatterns) {
    if (pattern.test(value)) return reason;
  }

  return null;
};

const findUnsafeOutcomeReason = (outcome) => {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
    return 'unsupported-readiness-state';
  }

  for (const [fieldName, value] of Object.entries(outcome)) {
    const fieldReason = reasonForFieldName(fieldName);
    if (fieldReason) return fieldReason;

    if (typeof value === 'string') {
      const valueReason = reasonForStringValue(value);
      if (valueReason) return valueReason;
    }
  }

  return null;
};

const toWrapperInput = (outcome) => ({
  runCount: outcome.runCount,
  readinessAttemptStatus: outcome.readinessAttemptStatus,
  localStartupStatusBucket: outcome.localStartupStatusBucket,
  localStackReadinessBucket: outcome.localStackReadinessBucket,
  serviceReadinessBucket: outcome.serviceReadinessBucket,
  outputSafetyResult: outcome.outputSafetyResult,
  cleanupResult: outcome.cleanupResult,
  failClosedReason: outcome.failClosedReason,
});

async function createLocalStackReadinessAdapterResult({
  commandFamilyDescriptor,
  executor,
} = {}) {
  if (!descriptorIsApproved(commandFamilyDescriptor)) {
    return failClosed('unsupported-readiness-state');
  }

  if (typeof executor !== 'function') {
    return failClosed('unsupported-readiness-state');
  }

  let executorCallCount = 0;
  let executorOutcome;

  try {
    executorOutcome = await executor({
      commandFamily: commandFamilyDescriptor.commandFamily,
      commandLabel: COMMAND_LABEL,
      syntheticOnly: true,
    });
    executorCallCount += 1;
  } catch {
    return failClosed('unsupported-readiness-state');
  }

  if (executorCallCount !== 1) {
    return failClosed('unsupported-readiness-state');
  }

  const unsafeOutcomeReason = findUnsafeOutcomeReason(executorOutcome);
  if (unsafeOutcomeReason) return failClosed(unsafeOutcomeReason);

  if (executorOutcome.runCount !== 1) {
    return failClosed('unsupported-readiness-state');
  }

  const wrapperResult = createLocalStackReadinessProcedureResult(toWrapperInput(executorOutcome));
  if (!wrapperResult.ok) return wrapperResult;

  return wrapperResult;
}

function createMissingExecutorFailClosedResult() {
  return failClosed('unsupported-readiness-state');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const result = createMissingExecutorFailClosedResult();
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
}

export {
  ADAPTER_NAME,
  APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR,
  SYNTHETIC_COMMAND_FAMILY,
  createLocalStackReadinessAdapterResult,
  createMissingExecutorFailClosedResult,
};