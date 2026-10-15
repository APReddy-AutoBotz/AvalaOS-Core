import { rename, writeFile } from 'node:fs/promises';

import { AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_SCHEMA,
  authenticatedHostedPlaywrightFailureDescriptor,
  validateAuthenticatedHostedPlaywrightDiagnostic,
  validateAuthenticatedHostedPlaywrightFailureLocation } from './authenticatedHostedDiagnostics.mjs';

const TEST_CATEGORIES = new Map([
  ['authors, replays, rejects stale work, requests changes and resubmits through the production UI', 'primary-lifecycle'],
  ['independent approval, Govern separation and synthetic Studio generation retain exact lineage', 'govern-studio-lifecycle'],
  ['independent reviewer rejects a separate current decision without mutating the approved primary chain', 'independent-rejection'],
  ['approved Studio work publishes through legacy Docs and Delivery into read-only Monitor', 'delivery-monitor'],
  ['production scoring preserves low-suitability and strong-automation decisions through governed publication', 'scoring-policy'],
  ['authenticated Admin, AI and private Studio controls use server authority and measured storage boundaries', 'authenticated-controls'],
]);

const OPERATION_TITLES = new Map([
  ['hosted:control:action-start', 'ACTION_START'],
  ['hosted:control:permit-arm', 'PERMIT_ARM'],
  ['hosted:control:action-finish', 'ACTION_FINISH'],
  ['hosted:control:case-submit', 'CASE_SUBMIT'],
  ['hosted:control:session-bind', 'SESSION_BIND'],
  ['hosted:control:setup', 'SETUP'],
  ['hosted:control:observe', 'OBSERVE'],
  ['hosted:control:other', 'OTHER_CONTROL'],
  ['hosted:queue:network-drain', 'NETWORK_DRAIN'],
  ['hosted:queue:case-drain', 'CASE_DRAIN'],
  ['hosted:safety:offline', 'SAFETY_OFFLINE'],
  ['hosted:safety:server', 'SAFETY_SERVER'],
  ['hosted:safety:timeout', 'SAFETY_TIMEOUT'],
  ['hosted:primary:v1-assessment-completion', 'V1_ASSESSMENT_COMPLETION'],
  ['hosted:primary:journey', 'PRIMARY_JOURNEY'],
  ['hosted:primary:process-denial', 'PRIMARY_PROCESS_DENIAL'],
  ['hosted:primary:safety-and-runtime', 'PRIMARY_SAFETY_AND_RUNTIME'],
  ['hosted:primary:v2-authoring-and-review', 'PRIMARY_V2_AUTHORING_AND_REVIEW'],
]);

const projectCategory = test => {
  const project = test?.parent?.project?.()?.name;
  return ['desktop-chromium', 'pixel-7-chromium'].includes(project) ? project : 'unknown';
};
const testCategory = test => TEST_CATEGORIES.get(test?.title) ?? 'unknown';
const resultCategory = status => status === 'timedOut' ? 'timeout'
  : status === 'interrupted' ? 'interrupted' : 'unexpected-failure';
const sameFailure = (left, right) => left === right || (
  typeof left?.message === 'string' && left.message === right?.message
  && typeof left?.location?.file === 'string' && left.location.file === right?.location?.file
  && left.location.line === right?.location?.line
);
const correlatedFailedOperation = (operations, primary) => {
  const identical = operations.filter(item => item.error === primary);
  if (identical.length > 0) return identical[0];
  const equivalent = operations.filter(item => sameFailure(item.error, primary));
  return equivalent.length === 1 ? equivalent[0] : null;
};
const boundedLocation = location => {
  const source = typeof location?.file === 'string' ? location.file.replaceAll('\\', '/') : '';
  const root = process.cwd().replaceAll('\\', '/');
  const relative = source.startsWith(`${root}/`) ? source.slice(root.length + 1) : source;
  return validateAuthenticatedHostedPlaywrightFailureLocation({ source: relative, line: location?.line });
};

export default class AuthenticatedHostedPlaywrightReporter {
  constructor() {
    this.failure = null;
    this.runnerError = false;
    this.currentHookFailures = [];
    this.currentOperations = [];
    this.failedOperations = [];
    this.timedOutOperation = null;
  }

  onTestBegin(test) {
    if (!this.failure) {
      this.current = { project: projectCategory(test), testCategory: testCategory(test) };
      this.currentHookFailures = [];
      this.currentOperations = [];
      this.failedOperations = [];
      this.timedOutOperation = null;
    }
  }

  onStepBegin(_test, _result, step) {
    if (this.failure) return;
    const operation = OPERATION_TITLES.get(step?.title);
    if (!operation) return;
    this.currentOperations.push({ step, operation, location: boundedLocation(step.location) });
  }

  onStepEnd(test, result, step) {
    if (this.failure) return;
    const index = this.currentOperations.findLastIndex(item => item.step === step);
    if (index >= 0) {
      const [completed] = this.currentOperations.splice(index, 1);
      if (step?.error) this.failedOperations.push({ ...completed, error: step.error });
      if (!this.timedOutOperation && result?.status === 'timedOut' && step?.error) {
        this.timedOutOperation = completed;
      }
    }
    if (!step?.error || step.category !== 'hook') return;
    const category = step.title === 'beforeAll hook' ? 'project-bootstrap'
      : step.title === 'afterAll hook' ? 'project-teardown' : null;
    this.currentHookFailures.push({ error: step.error, category });
  }

  onTestEnd(test, result) {
    if (!this.failure && result.status !== test.expectedStatus) {
      const primary = result.error ?? result.errors?.[0] ?? null;
      const primaryHook = this.currentHookFailures?.find(item => sameFailure(item.error, primary));
      this.failureDescriptor = authenticatedHostedPlaywrightFailureDescriptor(primary);
      this.failureLocation = primary?.location ? boundedLocation(primary.location) : null;
      if (this.failureDescriptor?.phase === 'CONTROL_CHANNEL'
        && this.failureDescriptor.code === 'CONTROL_REQUEST_TIMEOUT') {
        const correlated = correlatedFailedOperation(this.failedOperations, primary);
        this.failureOperation = correlated?.operation;
        this.failureLocation ??= correlated?.location ?? null;
      }
      if (result.status === 'timedOut' && !this.failureDescriptor && !this.failureLocation) {
        const active = this.timedOutOperation ?? this.currentOperations.at(-1) ?? null;
        this.failureOperation = active?.operation;
        this.failureLocation = active?.location ?? null;
      }
      this.failure = { project: projectCategory(test),
        testCategory: primaryHook?.category ?? testCategory(test),
        category: resultCategory(result.status) };
      this.currentHookFailures = [];
    }
  }

  onError() {
    this.runnerError = true;
  }

  async onEnd(result) {
    if (result.status === 'passed') return;
    const path = process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    if (!path) return;
    const category = result.status === 'timedout' ? 'timeout'
      : result.status === 'interrupted' ? 'interrupted'
        : this.runnerError && !this.failure ? 'configuration' : 'unexpected-failure';
    const value = validateAuthenticatedHostedPlaywrightDiagnostic({
      schemaVersion: AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_SCHEMA,
      project: this.failure?.project ?? this.current?.project ?? 'unknown',
      testCategory: this.failure?.testCategory ?? this.current?.testCategory ?? 'runner',
      category: this.failure?.category ?? category,
      ...(this.failureOperation ? { operation: this.failureOperation } : {}),
      ...(this.failureDescriptor ?? {}),
      ...(this.failureLocation ? { location: this.failureLocation } : {}),
    });
    if (!value) return;
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  }
}
