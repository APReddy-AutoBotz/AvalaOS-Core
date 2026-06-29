import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROCEDURE_NAME = 'Local Stack Readiness Evidence Procedure';
const COMMAND_LABEL = 'controlled-local-stack-readiness-procedure-run';

const readinessAttemptStatuses = new Set([
  'not-attempted',
  'attempted',
  'blocked',
  'fail-closed',
]);

const localStartupStatusBuckets = new Set([
  'not-attempted',
  'completed',
  'failed',
  'timeout',
  'unknown',
  'fail-closed',
]);

const localStackReadinessBuckets = new Set([
  'ready',
  'not-ready',
  'partial',
  'unknown',
  'fail-closed',
]);

const serviceReadinessBuckets = new Set([
  'all-ready',
  'partial-ready',
  'not-ready',
  'unknown',
  'not-captured',
  'fail-closed',
]);

const outputSafetyResults = new Set([
  'passed',
  'failed',
  'not-captured',
]);

const cleanupResults = new Set([
  'removed',
  'not-created',
  'not-needed',
  'failed',
  'not-captured',
]);

const failClosedReasons = new Set([
  'none',
  'unsafe-output',
  'raw-output-needed',
  'local-path-needed',
  'secret-like-value',
  'db-url-like-value',
  'target-like-value',
  'container-image-id-like-value',
  'machine-specific-value',
  'root-cause-inference-needed',
  'unsupported-readiness-state',
  'cleanup-failed',
  'output-too-large',
  'unknown',
]);

const proofBoundaries = Object.freeze({
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

const unsafeProbePatterns = [
  { reason: 'raw-output-needed', pattern: /\b(?:raw\s+(?:stdout|stderr|output|log)|stack\s+trace|traceback|scratch\s+output)\b/i },
  { reason: 'local-path-needed', pattern: /(?:^|[\s'"])[A-Za-z]:[\\/]/ },
  { reason: 'local-path-needed', pattern: /(?:^|[\s'"])(?:\/Users|\/home|\/var|\/tmp|\/mnt|\/Volumes)\// },
  { reason: 'db-url-like-value', pattern: /\b(?:postgres(?:ql)?:\/\/|database_url|db\s*url|database\s+name|user\s+name)\b/i },
  { reason: 'target-like-value', pattern: /\b(?:https?:\/\/|localhost|127\.0\.0\.1|host\s+value|port\s+value|ip\s+(?:value|address)|target\s+value|project\s+ref)\b/i },
  { reason: 'secret-like-value', pattern: /\b(?:secret|token|provider\s*key|service[-_\s]?role|private\s*token|anon\s+key|jwt)\b/i },
  { reason: 'secret-like-value', pattern: /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { reason: 'container-image-id-like-value', pattern: /\b(?:container\s+id|image\s+id|sha256:[0-9a-f]{12,})\b/i },
  { reason: 'container-image-id-like-value', pattern: /\b[0-9a-f]{32,64}\b/i },
  { reason: 'machine-specific-value', pattern: /\b(?:machine\s+name|computername|hostname|volume\s+name|network\s+name|local\s+config\s+value)\b/i },
];

const cloneProofBoundaries = () => ({ ...proofBoundaries });

const hasUnsafeProbe = (input) => {
  const probeValues = Array.isArray(input.syntheticSafetyProbes)
    ? input.syntheticSafetyProbes
    : [];

  for (const value of probeValues) {
    const text = String(value);
    for (const { reason, pattern } of unsafeProbePatterns) {
      if (pattern.test(text)) return reason;
    }
  }

  return null;
};

const firstUnsupportedValue = (input) => {
  if (!Number.isInteger(input.runCount) || input.runCount !== 1) return 'unsupported-readiness-state';
  if (!readinessAttemptStatuses.has(input.readinessAttemptStatus)) return 'unsupported-readiness-state';
  if (!localStartupStatusBuckets.has(input.localStartupStatusBucket)) return 'unsupported-readiness-state';
  if (!localStackReadinessBuckets.has(input.localStackReadinessBucket)) return 'unsupported-readiness-state';
  if (!serviceReadinessBuckets.has(input.serviceReadinessBucket)) return 'unsupported-readiness-state';
  if (!outputSafetyResults.has(input.outputSafetyResult)) return 'unsupported-readiness-state';
  if (!cleanupResults.has(input.cleanupResult)) return 'unsupported-readiness-state';
  if (!failClosedReasons.has(input.failClosedReason)) return 'unsupported-readiness-state';
  return null;
};

const readinessImplicationPresent = (input) => Boolean(
  input.schemaReadinessImplied
    || input.rlsReadinessImplied
    || input.artifactReadinessImplied
    || input.tenantReadinessImplied
    || input.hostedReadinessImplied
    || input.productionReadinessImplied
);

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

function createLocalStackReadinessProcedureResult(input = {}) {
  const unsafeProbeReason = hasUnsafeProbe(input);
  if (unsafeProbeReason) return failClosed(unsafeProbeReason);

  const unsupportedValue = firstUnsupportedValue(input);
  if (unsupportedValue) return failClosed(unsupportedValue);

  if (input.outputTooLarge === true) return failClosed('output-too-large');
  if (input.outputSafetyResult === 'failed') return failClosed('unsafe-output');
  if (input.cleanupResult === 'failed') return failClosed('cleanup-failed');
  if (input.rootCauseInferred === true) return failClosed('root-cause-inference-needed');
  if (readinessImplicationPresent(input)) return failClosed('unsupported-readiness-state');
  if (input.failClosedReason !== 'none') return failClosed(input.failClosedReason);

  return {
    ok: true,
    procedureName: PROCEDURE_NAME,
    commandLabel: COMMAND_LABEL,
    runCount: input.runCount,
    readinessAttemptStatus: input.readinessAttemptStatus,
    localStartupStatusBucket: input.localStartupStatusBucket,
    localStackReadinessBucket: input.localStackReadinessBucket,
    serviceReadinessBucket: input.serviceReadinessBucket,
    outputSafetyResult: input.outputSafetyResult,
    cleanupResult: input.cleanupResult,
    failClosedReason: 'none',
    proofBoundaries: cloneProofBoundaries(),
  };
}

function createNotAttemptedFailClosedResult() {
  return failClosed('unsupported-readiness-state');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const result = createNotAttemptedFailClosedResult();
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
}

export {
  COMMAND_LABEL,
  PROCEDURE_NAME,
  cleanupResults,
  createLocalStackReadinessProcedureResult,
  createNotAttemptedFailClosedResult,
  failClosedReasons,
  localStackReadinessBuckets,
  localStartupStatusBuckets,
  outputSafetyResults,
  proofBoundaries,
  readinessAttemptStatuses,
  serviceReadinessBuckets,
};
