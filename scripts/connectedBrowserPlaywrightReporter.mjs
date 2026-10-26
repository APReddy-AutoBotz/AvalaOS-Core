import path from 'node:path';

import {
  CONNECTED_BROWSER_CHILD_SCHEMA,
  CONNECTED_BROWSER_PROJECTS,
  CONNECTED_BROWSER_TEST_TITLES,
  validateConnectedBrowserIdentity,
  writeConnectedBrowserChildDiagnostic,
} from './connectedBrowserDiagnostics.mjs';

const knownFailures = new Map([
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT', 'CONTROL_TIMEOUT'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED', 'SESSION_REQUIRED'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_TRANSPORT_FAILURE', 'IDENTITY_TRANSPORT'],
  ['ENTERPRISE_LIFECYCLE_BROWSER_V1_COMPLETION_TIMEOUT', 'V1_COMPLETION_TIMEOUT'],
  ['PRODUCT_NAVIGATION_SHELL_NOT_READY', 'SHELL_NOT_READY'],
]);
const locationSources = new Set([
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
]);

export const connectedBrowserFailureCode = (error, status) => {
  if (status === 'timedOut') return 'TEST_TIMEOUT';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (knownFailures.has(message)) return knownFailures.get(message);
  if (message.startsWith('Error: ') && knownFailures.has(message.slice(7))) return knownFailures.get(message.slice(7));
  return 'REDACTED';
};

export const connectedBrowserFailureLocation = (error, workspaceRoot = process.cwd()) => {
  if (!error?.location || typeof error.location.file !== 'string'
    || !Number.isInteger(error.location.line)) return undefined;
  const source = path.relative(path.resolve(workspaceRoot), path.resolve(error.location.file)).replaceAll('\\', '/');
  if (!locationSources.has(source) || error.location.line < 1 || error.location.line > 200_000) return undefined;
  return { source, line: error.location.line };
};

export default class ConnectedBrowserPlaywrightReporter {
  constructor(options = {}) {
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.identity = options.identity;
    this.failure = null;
    this.stepErrors = [];
  }

  onTestBegin() { this.stepErrors = []; }

  onStepEnd(_test, _result, step) {
    if (step?.error && this.stepErrors.length < 16) this.stepErrors.push(step.error);
  }

  onTestEnd(test, result) {
    if (this.failure || !['failed', 'timedOut'].includes(result.status)
      || !validateConnectedBrowserIdentity(this.identity)) return;
    const project = test.parent?.project?.()?.name;
    const testCategory = CONNECTED_BROWSER_TEST_TITLES.get(test.title);
    if (!CONNECTED_BROWSER_PROJECTS.includes(project) || !testCategory) return;
    const error = result.error ?? result.errors?.[0];
    const terminalMessage = typeof error?.message === 'string' ? error.message : null;
    const exact = this.stepErrors.find(candidate => candidate === error);
    const matching = terminalMessage === null ? [] : this.stepErrors.filter(candidate =>
      candidate?.message === terminalMessage);
    const correlated = exact ?? (matching.length === 1 ? matching[0] : null);
    const location = connectedBrowserFailureLocation(error, this.workspaceRoot)
      ?? connectedBrowserFailureLocation(correlated, this.workspaceRoot);
    this.failure = {
      schemaVersion: CONNECTED_BROWSER_CHILD_SCHEMA,
      identity: this.identity,
      project,
      testCategory,
      status: 'failed',
      failure: { code: connectedBrowserFailureCode(error, result.status), ...(location ? { location } : {}) },
    };
  }

  async onEnd() {
    if (this.failure) await writeConnectedBrowserChildDiagnostic(this.failure,
      { workspaceRoot: this.workspaceRoot });
  }
}
