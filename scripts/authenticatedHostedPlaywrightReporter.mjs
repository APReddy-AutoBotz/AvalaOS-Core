import { rename, writeFile } from 'node:fs/promises';

import { AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_SCHEMA,
  authenticatedHostedPlaywrightFailureDescriptor,
  validateAuthenticatedHostedPlaywrightDiagnostic,
  validateAuthenticatedActorPhaseTimings,
  validateAuthenticatedHostedPlaywrightFailureLocation } from './authenticatedHostedDiagnostics.mjs';
import { ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_ATTACHMENT,
  ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_MAX_BYTES,
  validateEligibleReviewerRequestDiagnostic } from './eligibleReviewerRequestDiagnostic.mjs';

const TEST_CATEGORIES = new Map([
  ['selects the exact eligible reviewer, commits, replays and rejects a stale review command', 'primary-lifecycle'],
  ['creates and reloads the canonical AP Invoice Exception process through the production UI', 'primary-lifecycle'],
  ['authors, replays, rejects stale work, requests changes and resubmits through the production UI', 'primary-lifecycle'],
  ['independent approval, Govern separation and synthetic Studio generation retain exact lineage', 'govern-studio-lifecycle'],
  ['independent reviewer rejects a separate current decision without mutating the approved primary chain', 'independent-rejection'],
  ['approved Studio work publishes through legacy Docs and Delivery into read-only Monitor', 'delivery-monitor'],
  ['canonical AP Invoice Exception continues through Delivery package approval and read-only Monitor', 'delivery-monitor'],
  ['production scoring preserves low-suitability and strong-automation decisions through governed publication', 'scoring-policy'],
  ['authenticated Admin, AI and private Studio controls use server authority and measured storage boundaries', 'authenticated-controls'],
]);

const OPERATION_TITLES = new Map([
  ['hosted:actor:entry-initial', 'ACTOR_ENTRY_INITIAL'],
  ['hosted:actor:entry-canonical', 'ACTOR_ENTRY_CANONICAL'],
  ['hosted:actor:entry-cached', 'ACTOR_ENTRY_CACHED'],
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
  ['hosted:queue:teardown', 'QUEUE_TEARDOWN'],
  ['hosted:safety:offline', 'SAFETY_OFFLINE'],
  ['hosted:safety:server', 'SAFETY_SERVER'],
  ['hosted:safety:timeout', 'SAFETY_TIMEOUT'],
  ['hosted:primary:v1-assessment-completion', 'V1_ASSESSMENT_COMPLETION'],
  ['hosted:primary:journey', 'PRIMARY_JOURNEY'],
  ['hosted:primary:process-denial', 'PRIMARY_PROCESS_DENIAL'],
  ['hosted:primary:safety-and-runtime', 'PRIMARY_SAFETY_AND_RUNTIME'],
  ['hosted:primary:v2-authoring-and-review', 'PRIMARY_V2_AUTHORING_AND_REVIEW'],
  ['hosted:primary:v2-finalization-and-review', 'PRIMARY_V2_FINALIZATION_AND_REVIEW'],
  ['hosted:govern-studio:reviewer-approval', 'GOVERN_STUDIO_REVIEWER_APPROVAL'],
  ['hosted:govern-studio:reviewer-denial', 'GOVERN_STUDIO_REVIEWER_DENIAL'],
  ['hosted:govern-studio:approver-resolution', 'GOVERN_STUDIO_APPROVER_RESOLUTION'],
  ['hosted:govern-studio:assess-handoff', 'GOVERN_STUDIO_ASSESS_HANDOFF'],
  ['hosted:govern-studio:studio-request', 'GOVERN_STUDIO_STUDIO_REQUEST'],
  ['hosted:govern-studio:studio-review', 'GOVERN_STUDIO_STUDIO_REVIEW'],
  ['hosted:govern-studio:studio-final-accept', 'GOVERN_STUDIO_STUDIO_FINAL_ACCEPT'],
  ['hosted:govern-studio:source-consume', 'GOVERN_STUDIO_SOURCE_CONSUME'],
  ['hosted:govern-studio:checkpoint', 'GOVERN_STUDIO_CHECKPOINT'],
  ['hosted:govern-studio:eligible-reviewer-visible', 'GOVERN_STUDIO_ELIGIBLE_REVIEWER_VISIBLE'],
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
const firstErrorLine = error => typeof error?.message === 'string'
  ? error.message.replace(/\u001b\[[0-9;]*m/gu, '').split('\n')[0].trim().replace(/^Error: /u, '') : '';
const isStepAncestor = (ancestor, step) => {
  for (let parent = step?.parent; parent; parent = parent.parent) {
    if (parent === ancestor) return true;
  }
  return false;
};
const correlatedDeadlineOperation = (operations, result, primary) => {
  // Playwright reports the test deadline first, then the cancelled browser API
  // error. Known steps can already have ended while result.status was still
  // unset. Correlate that *reported* API error, never the last completed step.
  if (result.status !== 'timedOut') return null;
  const deadline = firstErrorLine(primary);
  if (!/^Test timeout of [1-9][0-9]*ms exceeded\.$/u.test(deadline)) return null;
  const secondary = (result.errors ?? []).filter(error => error !== primary
    && /^[a-zA-Z][a-zA-Z0-9_.]*: /u.test(firstErrorLine(error))
    && firstErrorLine(error).endsWith(`: ${deadline}`));
  if (secondary.length !== 1) return null;
  const matches = operations.filter(item => sameFailure(item.error, secondary[0])
    || (typeof item.error?.stack === 'string' && item.error.stack.length > 0
      && item.error.stack === secondary[0].stack && item.error.message === secondary[0].message));
  const leaves = matches.filter(item => !matches.some(other => other !== item
    && isStepAncestor(item.step, other.step)));
  return leaves.length === 1 && matches.every(item => item === leaves[0]
    || isStepAncestor(item.step, leaves[0].step)) ? leaves[0] : null;
};
const boundedLocation = location => {
  const source = typeof location?.file === 'string' ? location.file.replaceAll('\\', '/') : '';
  const root = process.cwd().replaceAll('\\', '/');
  const relative = source.startsWith(`${root}/`) ? source.slice(root.length + 1) : source;
  return validateAuthenticatedHostedPlaywrightFailureLocation({ source: relative, line: location?.line });
};
export const authenticatedHostedChildDiagnosticWithinCap = (value, maxBytes = 2000) =>
  Number.isSafeInteger(maxBytes) && maxBytes >= 1 && maxBytes <= 2000
  && Buffer.byteLength(`${JSON.stringify(value)}\n`, 'utf8') <= maxBytes;
export const boundedAuthenticatedHostedPlaywrightDiagnostic = (fields, maxBytes = 2000) => {
  let value = validateAuthenticatedHostedPlaywrightDiagnostic(fields);
  if (value && authenticatedHostedChildDiagnosticWithinCap(value, maxBytes)) return value;
  if (!fields?.requestContext) return null;
  const { requestContext: _discarded, ...base } = fields;
  value = validateAuthenticatedHostedPlaywrightDiagnostic(base);
  return value && authenticatedHostedChildDiagnosticWithinCap(value, maxBytes) ? value : null;
};
const requestContext = (result, project, category) => {
  const matches = (result?.attachments ?? []).filter(item => item?.name === ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_ATTACHMENT);
  if (matches.length !== 1 || matches[0].contentType !== 'application/json' || matches[0].path
    || !Buffer.isBuffer(matches[0].body) || matches[0].body.length > ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_MAX_BYTES) return null;
  try {
    const value = validateEligibleReviewerRequestDiagnostic(JSON.parse(matches[0].body.toString('utf8')));
    return value && value.project === project && value.testCategory === category ? value : null;
  } catch { return null; }
};

export default class AuthenticatedHostedPlaywrightReporter {
  constructor() {
    this.failure = null;
    this.runnerError = false;
    this.currentHookFailures = [];
    this.currentOperations = [];
    this.failedOperations = [];
    this.timedOutOperation = null;
    this.actorPhaseTimings = new Map();
    this.failedActorBoundaries = [];
  }

  onTestBegin(test) {
    if (!this.failure) {
      this.current = { project: projectCategory(test), testCategory: testCategory(test) };
      this.currentHookFailures = [];
      this.currentOperations = [];
      this.failedOperations = [];
      this.timedOutOperation = null;
      this.actorPhaseTimings = new Map();
      this.failedActorBoundaries = [];
    }
  }

  onStepBegin(_test, _result, step) {
    if (this.failure) return;
    if (step?.title === 'hosted:actor-boundary') this.actorPhaseTimings = new Map();
    const operation = OPERATION_TITLES.get(step?.title);
    if (!operation) return;
    this.currentOperations.push({ step, operation, location: boundedLocation(step.location) });
  }

  onStepEnd(test, result, step) {
    if (this.failure) return;
    const phase = typeof step?.title === 'string' ? step.title.slice('hosted:actor-phase:'.length) : '';
    const ms = Math.round(step?.duration);
    if (step?.title?.startsWith('hosted:actor-phase:')
      && validateAuthenticatedActorPhaseTimings([{ phase, count: 1, totalMs: ms, maxMs: ms }])) {
      const prior = this.actorPhaseTimings?.get(phase) ?? { phase, count: 0, totalMs: 0, maxMs: 0 };
      this.actorPhaseTimings?.set(phase, { phase, count: prior.count + 1,
        totalMs: prior.totalMs + ms, maxMs: Math.max(prior.maxMs, ms) });
    }
    if (step?.title === 'hosted:actor-boundary' && step.error) {
      this.failedActorBoundaries.push({ error: step.error,
        phaseTimings: validateAuthenticatedActorPhaseTimings([...this.actorPhaseTimings.values()]) });
    }
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
      this.failurePhaseTimings = correlatedFailedOperation(this.failedActorBoundaries, primary)?.phaseTimings;
      this.failureLocation = primary?.location ? boundedLocation(primary.location) : null;
      if ((this.failureDescriptor?.phase === 'CONTROL_CHANNEL'
        && this.failureDescriptor.code === 'CONTROL_REQUEST_TIMEOUT')
        || this.failureDescriptor?.phase === 'ACTOR_TRANSITION'
        || !this.failureDescriptor) {
        const correlated = correlatedFailedOperation(this.failedOperations, primary);
        this.failureOperation = correlated?.operation;
        this.failureLocation ??= correlated?.location ?? null;
      }
      if (!this.failureDescriptor && !this.failureOperation) {
        const correlated = correlatedDeadlineOperation(this.failedOperations, result, primary);
        this.failureOperation = correlated?.operation;
        this.failureLocation ??= correlated?.location ?? null;
      }
      if (result.status === 'timedOut' && !this.failureDescriptor && !this.failureLocation && !this.failureOperation) {
        const active = this.timedOutOperation ?? this.currentOperations.at(-1) ?? null;
        this.failureOperation = active?.operation;
        this.failureLocation = active?.location ?? null;
      }
      this.failure = { project: projectCategory(test),
        testCategory: primaryHook?.category ?? testCategory(test),
        category: resultCategory(result.status) };
      this.requestContext = this.failureOperation === 'GOVERN_STUDIO_ELIGIBLE_REVIEWER_VISIBLE'
        ? requestContext(result, this.failure.project, this.failure.testCategory) : null;
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
    const fields = {
      schemaVersion: AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_SCHEMA,
      project: this.failure?.project ?? this.current?.project ?? 'unknown',
      testCategory: this.failure?.testCategory ?? this.current?.testCategory ?? 'runner',
      category: this.failure?.category ?? category,
      ...(this.failureOperation ? { operation: this.failureOperation } : {}),
      ...(this.failureDescriptor ?? {}),
      ...(this.failurePhaseTimings ? { phaseTimings: this.failurePhaseTimings } : {}),
      ...(this.failureLocation ? { location: this.failureLocation } : {}),
      ...(this.requestContext ? { requestContext: this.requestContext } : {}),
    };
    const value = boundedAuthenticatedHostedPlaywrightDiagnostic(fields);
    if (!value) return;
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  }
}
