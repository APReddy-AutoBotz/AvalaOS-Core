import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR,
  validateLocalStackReadinessCommandBindingDescriptor,
} from './m5.3a-3m-local-stack-readiness-command-binding.mjs';
import {
  APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR,
  createLocalStackReadinessAdapterResult,
} from './m5.3a-3k-local-stack-readiness-execution-adapter.mjs';
import {
  COMMAND_LABEL,
  PROCEDURE_NAME,
  proofBoundaries,
} from './m5.3a-3i-local-stack-readiness-procedure.mjs';

const INTEGRATION_NAME = 'Local Stack Readiness Real Binding Adapter Integration';
const INTEGRATION_MODE = 'synthetic-only-real-binding-adapter-integration';

const DEFAULT_SYNTHETIC_OUTCOME = Object.freeze({
  runCount: 1,
  readinessAttemptStatus: 'blocked',
  localStartupStatusBucket: 'unknown',
  localStackReadinessBucket: 'unknown',
  serviceReadinessBucket: 'unknown',
  outputSafetyResult: 'not-captured',
  cleanupResult: 'not-needed',
  failClosedReason: 'none',
});

const allowedIntegrationFields = new Set([
  'realCommandBindingDescriptor',
  'syntheticOutcome',
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
  'scratchOutput',
  'stack',
  'stackTrace',
  'traceback',
]);

const readinessImplicationFieldNames = new Set([
  'rootCause',
  'rootCauseInferred',
  'schemaReady',
  'schemaReadinessImplied',
  'rlsReady',
  'rlsReadinessImplied',
  'artifactReady',
  'artifactReadinessImplied',
  'artifactSelectIsolationVerified',
  'tenantIsolationVerified',
  'tenantReadinessImplied',
  'hostedReady',
  'hostedReadinessImplied',
  'productionReady',
  'productionReadinessImplied',
]);

const unsafeValuePatterns = [
  { reason: 'raw-output-needed', pattern: /\b(?:raw\s+(?:stdout|stderr|output|log)|stack\s+trace|traceback|scratch\s+output)\b/i },
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

const failClosed = (reason = 'unsupported-readiness-state') => ({
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

const reasonForFieldName = (fieldName) => {
  if (rawOutputFieldNames.has(fieldName)) return 'raw-output-needed';
  if (readinessImplicationFieldNames.has(fieldName)) {
    return fieldName === 'rootCause' || fieldName === 'rootCauseInferred'
      ? 'root-cause-inference-needed'
      : 'unsupported-readiness-state';
  }
  if (!allowedIntegrationFields.has(fieldName)) return 'unsupported-readiness-state';
  return null;
};

const reasonForStringValue = (value) => {
  for (const { reason, pattern } of unsafeValuePatterns) {
    if (pattern.test(value)) return reason;
  }

  return null;
};

const firstUnsafeInputReason = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'unsupported-readiness-state';
  }

  for (const [fieldName, value] of Object.entries(input)) {
    const fieldReason = reasonForFieldName(fieldName);
    if (fieldReason) return fieldReason;

    if (typeof value === 'string') {
      const valueReason = reasonForStringValue(value);
      if (valueReason) return valueReason;
    }
  }

  return null;
};

const cloneOutcome = (outcome) => ({ ...outcome });

const descriptorHasRequiredApprovalBoundary = (descriptor) => Boolean(
  descriptor.realExecutionApproved === false
    && descriptor.executionRequiresFutureApproval === true
    && descriptor.runCountLimit === 1
    && !Object.hasOwn(descriptor, 'commandString')
    && !Object.hasOwn(descriptor, 'shellCommand')
    && !Object.hasOwn(descriptor, 'command')
);

async function createLocalStackReadinessRealBindingAdapterIntegrationResult(input = {}) {
  const inputReason = firstUnsafeInputReason(input);
  if (inputReason) return failClosed(inputReason);

  const {
    realCommandBindingDescriptor = APPROVED_REAL_COMMAND_FAMILY_DESCRIPTOR,
    syntheticOutcome = DEFAULT_SYNTHETIC_OUTCOME,
  } = input;

  const descriptorResult = validateLocalStackReadinessCommandBindingDescriptor(
    realCommandBindingDescriptor,
  );
  if (!descriptorResult.ok) return failClosed('unsupported-readiness-state');

  if (!descriptorHasRequiredApprovalBoundary(descriptorResult.descriptor)) {
    return failClosed('unsupported-readiness-state');
  }

  let syntheticRunCount = 0;
  const adapterResult = await createLocalStackReadinessAdapterResult({
    commandFamilyDescriptor: APPROVED_SYNTHETIC_COMMAND_FAMILY_DESCRIPTOR,
    executor: async (context) => {
      syntheticRunCount += 1;
      if (
        syntheticRunCount !== 1
          || context.commandLabel !== COMMAND_LABEL
          || context.syntheticOnly !== true
      ) {
        return {
          ...DEFAULT_SYNTHETIC_OUTCOME,
          readinessAttemptStatus: 'fail-closed',
          localStartupStatusBucket: 'fail-closed',
          localStackReadinessBucket: 'fail-closed',
          serviceReadinessBucket: 'fail-closed',
          outputSafetyResult: 'failed',
          cleanupResult: 'not-captured',
          failClosedReason: 'unsupported-readiness-state',
        };
      }

      return cloneOutcome(syntheticOutcome);
    },
  });

  if (syntheticRunCount !== 1) return failClosed('unsupported-readiness-state');
  if (!adapterResult.ok) return adapterResult;

  return adapterResult;
}

function createMissingRealBindingAdapterIntegrationFailClosedResult() {
  return failClosed('unsupported-readiness-state');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const result = createMissingRealBindingAdapterIntegrationFailClosedResult();
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
}

export {
  DEFAULT_SYNTHETIC_OUTCOME,
  INTEGRATION_MODE,
  INTEGRATION_NAME,
  createLocalStackReadinessRealBindingAdapterIntegrationResult,
  createMissingRealBindingAdapterIntegrationFailClosedResult,
};
