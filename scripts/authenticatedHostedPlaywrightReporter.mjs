import { rename, writeFile } from 'node:fs/promises';

import { AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_SCHEMA,
  validateAuthenticatedHostedPlaywrightDiagnostic } from './authenticatedHostedDiagnostics.mjs';

const TEST_CATEGORIES = new Map([
  ['authors, replays, rejects stale work, requests changes and resubmits through the production UI', 'primary-lifecycle'],
  ['independent approval, Govern separation and synthetic Studio generation retain exact lineage', 'govern-studio-lifecycle'],
  ['independent reviewer rejects a separate current decision without mutating the approved primary chain', 'independent-rejection'],
  ['approved Studio work publishes through legacy Docs and Delivery into read-only Monitor', 'delivery-monitor'],
  ['production scoring preserves low-suitability and strong-automation decisions through governed publication', 'scoring-policy'],
  ['authenticated Admin, AI and private Studio controls use server authority and measured storage boundaries', 'authenticated-controls'],
]);

const projectCategory = test => {
  const project = test?.parent?.project?.()?.name;
  return ['desktop-chromium', 'pixel-7-chromium'].includes(project) ? project : 'unknown';
};
const testCategory = test => TEST_CATEGORIES.get(test?.title) ?? 'unknown';
const resultCategory = status => status === 'timedOut' ? 'timeout'
  : status === 'interrupted' ? 'interrupted' : 'unexpected-failure';

export default class AuthenticatedHostedPlaywrightReporter {
  constructor() {
    this.failure = null;
    this.runnerError = false;
  }

  onTestBegin(test) {
    if (!this.failure) this.current = { project: projectCategory(test), testCategory: testCategory(test) };
  }

  onStepEnd(test, _result, step) {
    if (this.failure || !step?.error || step.category !== 'hook') return;
    const category = step.title === 'beforeAll hook' ? 'project-bootstrap'
      : step.title === 'afterAll hook' ? 'project-teardown' : null;
    if (category) this.failure = { project: projectCategory(test), testCategory: category,
      category: 'unexpected-failure' };
  }

  onTestEnd(test, result) {
    if (!this.failure && result.status !== test.expectedStatus) {
      this.failure = { project: projectCategory(test), testCategory: testCategory(test),
        category: resultCategory(result.status) };
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
    });
    if (!value) return;
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  }
}
