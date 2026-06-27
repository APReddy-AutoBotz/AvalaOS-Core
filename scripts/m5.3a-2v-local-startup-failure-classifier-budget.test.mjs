import assert from 'node:assert/strict';

import {
  SAFE_OUTPUT_LINE_BUDGET,
  buildBoundedStartupCapture,
  classifyBoundedOutput,
  createResult,
} from './m5.3a-2k-local-stack-startup-failure-classifier.mjs';

const timeoutResult = { status: null, error: { code: 'ETIMEDOUT' } };
const nonzeroResult = { status: 1 };

const repeatedSafeLines = (count) => Array.from(
  { length: count },
  () => 'safe-output-line',
).join('\n');

const createSyntheticResult = ({ output, startResult, outputSafety = 'passed', scratchCleanup = 'removed' }) => {
  const capture = buildBoundedStartupCapture([output]);
  const classification = classifyBoundedOutput(capture, startResult);

  return createResult({
    startupAttempt: 'attempted',
    classification: classification.classification,
    confidence: classification.confidence,
    outputSafety,
    scratchCleanup,
    rawOutput: capture.rawOutput,
    outputBudget: capture.outputBudget,
    startResult,
  });
};

const oversizedOutput = repeatedSafeLines(SAFE_OUTPUT_LINE_BUDGET + 1);
const timeoutOversized = createSyntheticResult({
  output: oversizedOutput,
  startResult: timeoutResult,
});

assert.equal(timeoutOversized.classification, 'local-startup-timeout-with-oversized-output');
assert.equal(timeoutOversized.signal.confidence, 'low');
assert.equal(timeoutOversized.signal.timeoutFlag, true);
assert.equal(timeoutOversized.signal.lineCountBucket, 'oversized');
assert.equal(timeoutOversized.signal.safetyBlockReasonCategory, 'output-too-large');
assert.ok(timeoutOversized.lines.includes('root cause inferred: no, only sanitized failure category reported'));
assert.ok(timeoutOversized.lines.includes('local DB availability: unresolved'));
assert.ok(timeoutOversized.lines.includes('schema availability: not proven'));
assert.ok(timeoutOversized.lines.includes('artifact SELECT isolation: not verified'));
assert.ok(timeoutOversized.lines.includes('tenant isolation: not newly verified'));
assert.ok(!timeoutOversized.lines.some((line) => line.includes('safe-output-line')));

const nonTimeoutOversized = createSyntheticResult({
  output: oversizedOutput,
  startResult: nonzeroResult,
});

assert.equal(nonTimeoutOversized.classification, 'unknown-local-startup-failure');
assert.equal(nonTimeoutOversized.signal.timeoutFlag, false);
assert.equal(nonTimeoutOversized.signal.lineCountBucket, 'oversized');
assert.equal(nonTimeoutOversized.signal.safetyBlockReasonCategory, 'output-too-large');
assert.ok(!nonTimeoutOversized.lines.some((line) => line.includes('safe-output-line')));

const knownSafeOutput = createSyntheticResult({
  output: 'docker daemon is not running',
  startResult: nonzeroResult,
});

assert.equal(knownSafeOutput.classification, 'docker-daemon-unavailable');
assert.equal(knownSafeOutput.signal.confidence, 'high');
assert.equal(knownSafeOutput.signal.outputSafetyResult, 'passed');
assert.ok(!knownSafeOutput.lines.some((line) => line.includes('docker daemon is not running')));

const unsafeOutput = createSyntheticResult({
  output: 'safe-output-line',
  startResult: nonzeroResult,
  outputSafety: 'failed',
});

assert.equal(unsafeOutput.classification, 'classification-output-safety-failed');
assert.equal(unsafeOutput.exitCode, 2);
assert.ok(unsafeOutput.lines.includes('classification: classification-output-safety-failed'));

const scratchCleanupFailure = createSyntheticResult({
  output: 'safe-output-line',
  startResult: timeoutResult,
  scratchCleanup: 'failed',
});

assert.equal(scratchCleanupFailure.classification, 'classification-output-safety-failed');
assert.equal(scratchCleanupFailure.exitCode, 2);
assert.ok(scratchCleanupFailure.lines.includes('scratch cleanup: failed'));

console.log('M5.3a-2v classifier budget synthetic regression passed.');
