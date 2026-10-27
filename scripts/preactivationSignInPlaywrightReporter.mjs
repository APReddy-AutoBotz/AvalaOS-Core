import path from 'node:path';

import {
  PREACTIVATION_SIGN_IN_CHILD_SCHEMA,
  PREACTIVATION_SIGN_IN_SUMMARY_SCHEMA,
  PREACTIVATION_SIGN_IN_PHASES,
  PREACTIVATION_SIGN_IN_PROJECTS,
  PREACTIVATION_SIGN_IN_TEST_TITLES,
  validatePreactivationSignInIdentity,
  writePreactivationSignInChild,
  writePreactivationSignInSummary,
} from './preactivationSignInDiagnostics.mjs';
import {
  PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION,
  PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_BYTE_CAP,
  validatePreactivationSignInRequestCorrelation,
} from './preactivationSignInRequestCorrelation.mjs';

const knownFailures = new Map([
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT', 'CONTROL_TIMEOUT'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED', 'SESSION_REQUIRED'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REJECTED', 'SESSION_REJECTED'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_TRANSPORT_FAILURE', 'IDENTITY_TRANSPORT'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_CREDENTIAL_REJECTED', 'IDENTITY_REJECTED'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_V1_COMPLETION_TIMEOUT', 'V1_COMPLETION_TIMEOUT'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AMBIGUOUS', 'PROCESS_AMBIGUOUS'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AUTHORITY_REJECTED', 'PROCESS_AUTHORITY_REJECTED'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED', 'CONTROL_REJECTED'],
]);
const locationSources = new Set([
  'tests/browser/authenticatedHostedSignInEntry.spec.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/authenticatedHostedNetwork.ts',
  'tests/browser/enterpriseLifecycleAcceptance/v1AssessmentCompletion.ts',
]);

export const preactivationSignInFailureCode = (error, status) => {
  if (status === 'timedOut') return 'TEST_TIMEOUT';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (knownFailures.has(message)) return knownFailures.get(message);
  if (message.startsWith('Error: ') && knownFailures.has(message.slice(7))) {
    return knownFailures.get(message.slice(7));
  }
  return 'REDACTED';
};

export const preactivationSignInFailureLocation = (error, workspaceRoot = process.cwd()) => {
  if (!error?.location || typeof error.location.file !== 'string'
    || !Number.isInteger(error.location.line)) return undefined;
  const source = path.relative(path.resolve(workspaceRoot), path.resolve(error.location.file)).replaceAll('\\', '/');
  if (!locationSources.has(source) || error.location.line < 1 || error.location.line > 200_000) return undefined;
  return { source, line: error.location.line };
};

export const preactivationSignInRequestCorrelation = (test, { phase, project, testCategory, ambiguous }) => {
  if (phase !== 'entry' || testCategory !== 'authenticated-sign-in') {
    return { state: 'not-applicable', reason: 'NOT_APPLICABLE', detail: null };
  }
  if (ambiguous || project === 'unknown') return { state: 'invalid', reason: 'AMBIGUOUS', detail: null };
  const annotations = Array.isArray(test.annotations)
    ? test.annotations.filter(annotation => annotation?.type === PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION)
    : [];
  if (annotations.length === 0) return { state: 'unavailable', reason: 'MISSING', detail: null };
  if (annotations.length !== 1) return { state: 'invalid', reason: 'DUPLICATE', detail: null };
  const description = annotations[0]?.description;
  if (typeof description !== 'string'
    || Buffer.byteLength(description, 'utf8') > PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_BYTE_CAP) {
    return { state: 'invalid', reason: 'SCHEMA', detail: null };
  }
  try {
    const detail = validatePreactivationSignInRequestCorrelation(JSON.parse(description));
    return detail ? { state: 'available', reason: 'CAPTURED', detail }
      : { state: 'invalid', reason: 'SCHEMA', detail: null };
  } catch { return { state: 'invalid', reason: 'SCHEMA', detail: null }; }
};

export default class PreactivationSignInPlaywrightReporter {
  constructor(options = {}) {
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.identity = options.identity;
    this.phase = options.phase;
    this.phaseNonce = options.phaseNonce;
    this.failure = null;
    this.stepErrors = [];
    this.terminalCases = { total: 0, passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0 };
  }

  onTestBegin() { this.stepErrors = []; }

  onStdOut() { /* raw subprocess output is intentionally suppressed */ }

  onStdErr() { /* raw subprocess output is intentionally suppressed */ }

  onStepEnd(_test, _result, step) {
    if (step?.error && this.stepErrors.length < 16) this.stepErrors.push(step.error);
  }

  onTestEnd(test, result) {
    if (!validatePreactivationSignInIdentity(this.identity)
      || !PREACTIVATION_SIGN_IN_PHASES.includes(this.phase)
      || !/^[a-f0-9]{64}$/u.test(this.phaseNonce ?? '')) return;
    const terminalStatus = Object.hasOwn(this.terminalCases, result.status) ? result.status : 'interrupted';
    this.terminalCases.total += 1;
    this.terminalCases[terminalStatus] += 1;
    if (this.failure || !['failed', 'timedOut'].includes(result.status)) return;
    const reportedProject = test.parent?.project?.()?.name;
    const project = PREACTIVATION_SIGN_IN_PROJECTS.includes(reportedProject) ? reportedProject : 'unknown';
    const testCategory = PREACTIVATION_SIGN_IN_TEST_TITLES.get(test.title) ?? 'unknown';
    const error = result.error ?? result.errors?.[0];
    const exact = this.stepErrors.find(candidate => candidate === error);
    const ambiguous = project === 'unknown' || testCategory === 'unknown'
      || (Array.isArray(result.errors) && result.errors.length > 1);
    const location = ambiguous ? undefined : preactivationSignInFailureLocation(error, this.workspaceRoot)
      ?? preactivationSignInFailureLocation(exact, this.workspaceRoot);
    const durationMs = Number.isFinite(result.duration)
      ? Math.min(3_600_000, Math.max(0, Math.round(result.duration))) : 0;
    const requestCorrelation = preactivationSignInRequestCorrelation(test,
      { phase: this.phase, project, testCategory, ambiguous });
    this.failure = {
      schemaVersion: PREACTIVATION_SIGN_IN_CHILD_SCHEMA,
      identity: this.identity,
      phase: this.phase,
      phaseNonce: this.phaseNonce,
      project,
      testCategory,
      status: result.status,
      durationMs,
      failure: { code: ambiguous ? 'REDACTED' : preactivationSignInFailureCode(error, result.status),
        ...(location ? { location } : {}) },
      requestCorrelation,
    };
  }

  async onEnd() {
    if (validatePreactivationSignInIdentity(this.identity)
      && PREACTIVATION_SIGN_IN_PHASES.includes(this.phase)
      && /^[a-f0-9]{64}$/u.test(this.phaseNonce ?? '')) {
      await writePreactivationSignInSummary({
        schemaVersion: PREACTIVATION_SIGN_IN_SUMMARY_SCHEMA,
        identity: this.identity,
        phase: this.phase,
        phaseNonce: this.phaseNonce,
        terminalCases: this.terminalCases,
      }, { workspaceRoot: this.workspaceRoot });
    }
    if (this.failure) await writePreactivationSignInChild(this.failure,
      { workspaceRoot: this.workspaceRoot });
  }
}
