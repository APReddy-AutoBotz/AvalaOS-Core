import assert from 'node:assert/strict';

import {
  captureSanitizedClassifierEvidence,
} from './m5.3a-2z-classifier-evidence-capture.mjs';

const validLines = [
  'startup attempt: attempted',
  'classification: local-startup-timeout-with-oversized-output',
  'confidence: low',
  'output safety: passed',
  'scratch cleanup: removed',
  'root cause inferred: no, only sanitized failure category reported',
  'local DB availability: unresolved',
  'schema availability: not proven',
  'artifact SELECT isolation: not verified',
  'tenant isolation: not newly verified',
  'redacted signal startupAttemptStatus: attempted',
  'redacted signal exitResultClass: timeout',
  'redacted signal commandPhaseClass: unknown',
  'redacted signal outputSizeBucket: oversized',
  'redacted signal lineCountBucket: large',
  'redacted signal timeoutFlag: true',
  'redacted signal knownPatternFamilyCounts: docker=0,supabase-cli=0,network=0,health=0,permission=0,config=0,resource=0,unknown=1',
  'redacted signal sanitizedCategoryCandidates: local-startup-timeout-with-oversized-output',
  'redacted signal confidence: low',
  'redacted signal outputSafetyResult: passed',
  'redacted signal scratchCleanupResult: removed',
  'redacted signal safetyBlockReasonCategory: output-too-large',
  'redacted signal noSecretsConfirmation: passed',
  'redacted signal noLocalPathConfirmation: passed',
  'redacted signal noRawLogConfirmation: passed',
];

const expectFailClosed = (lines, reasonCategory) => {
  const result = captureSanitizedClassifierEvidence(lines);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'fail-closed');
  assert.equal(result.reasonCategory, reasonCategory);
  assert.equal(result.capture, null);
  assert.equal(result.proofBoundaries.classifierCategoryNewlyProven, 'no');
  return result;
};

const validCapture = captureSanitizedClassifierEvidence(validLines);

assert.equal(validCapture.ok, true);
assert.equal(validCapture.status, 'captured');
assert.equal(validCapture.capture.classification, 'local-startup-timeout-with-oversized-output');
assert.equal(validCapture.capture.confidence, 'low');
assert.equal(validCapture.capture.rootCauseInferred, 'no');
assert.equal(validCapture.capture.localDbAvailability, 'unresolved');
assert.equal(validCapture.capture.schemaAvailability, 'not proven');
assert.equal(validCapture.capture.artifactSelectIsolation, 'not verified');
assert.equal(validCapture.capture.tenantIsolation, 'not newly verified');
assert.equal(validCapture.capture.redactedSignal.timeoutFlag, true);
assert.equal(validCapture.capture.redactedSignal.outputSizeBucket, 'oversized');
assert.equal(validCapture.capture.redactedSignal.lineCountBucket, 'large');

expectFailClosed([
  'startup attempt: attempted',
  'classification: classification-output-safety-failed',
  'confidence: high',
  'output safety: failed',
  'scratch cleanup: removed',
  'root cause inferred: no, only sanitized failure category reported',
  'local DB availability: unresolved',
  'schema availability: not proven',
  'artifact SELECT isolation: not verified',
  'tenant isolation: not newly verified',
], 'output-safety-failed');

expectFailClosed(
  validLines.filter((line) => !line.startsWith('confidence:')),
  'missing-required-field',
);

expectFailClosed([
  ...validLines,
  'unexpected field: sanitized value',
], 'unapproved-field');

expectFailClosed(
  validLines.map((line) => (
    line.startsWith('redacted signal sanitizedCategoryCandidates:')
      ? 'redacted signal sanitizedCategoryCandidates: local-startup-timeout-with-oversized-output,https://example.invalid'
      : line
  )),
  'target-or-url-like',
);

expectFailClosed([
  ...validLines,
  'raw stdout: synthetic fixture text',
], 'raw-output-like');

expectFailClosed(
  validLines.map((line) => (
    line.startsWith('classification:')
      ? 'classification: C:\\Users\\example\\scratch.log'
      : line
  )),
  'local-path-like',
);

expectFailClosed([
  ...validLines,
  'command label: node scripts/m5.3a-2k-local-stack-startup-failure-classifier.mjs --classify',
], 'literal-command-string');

expectFailClosed(
  validLines.map((line) => (
    line.startsWith('confidence:')
      ? 'confidence: certain'
      : line
  )),
  'malformed-field-value',
);

expectFailClosed(
  validLines.map((line) => (
    line.startsWith('scratch cleanup:')
      ? 'scratch cleanup: failed'
      : line.startsWith('redacted signal scratchCleanupResult:')
        ? 'redacted signal scratchCleanupResult: failed'
        : line
  )),
  'scratch-cleanup-failed',
);

expectFailClosed(
  validLines.map((line) => (
    line.startsWith('output safety:')
      ? 'output safety: failed'
      : line.startsWith('redacted signal outputSafetyResult:')
        ? 'redacted signal outputSafetyResult: failed'
        : line
  )),
  'output-safety-failed',
);

expectFailClosed([], 'missing-output');

expectFailClosed(
  validLines.map((line) => (
    line.startsWith('local DB availability:')
      ? 'local DB availability: available'
      : line
  )),
  'readiness-implied',
);

expectFailClosed(
  validLines.map((line) => (
    line.startsWith('root cause inferred:')
      ? 'root cause inferred: yes'
      : line
  )),
  'root-cause-implied',
);

expectFailClosed(
  validLines.map((line) => (
    line.startsWith('redacted signal noRawLogConfirmation:')
      ? 'redacted signal noRawLogConfirmation: failed'
      : line
  )),
  'unsafe-confirmation-failed',
);

console.log('M5.3a-2z classifier evidence capture synthetic regression passed.');
