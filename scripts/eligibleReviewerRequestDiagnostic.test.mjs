import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runAuthenticatedHostedChild } from './runAuthenticatedHostedAcceptance.mjs';
import { createAuthenticatedHostedRunDiagnostic, validateAuthenticatedHostedRunDiagnostic } from './authenticatedHostedDiagnostics.mjs';
import { ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_SCHEMA,
  validateEligibleReviewerRequestDiagnostic } from './eligibleReviewerRequestDiagnostic.mjs';

const request = (route, overrides = {}) => ({ route, firstRequestOrdinal: null, requestCount: 0,
  responseCount: 0, pendingCount: 0, state: 'not-observed', lastHttpStatus: null,
  statusClass: 'unavailable', outcome: 'unavailable', elapsedMs: 0, elapsedSaturated: false, ...overrides });
const valid = () => ({ schemaVersion: ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_SCHEMA,
  project: 'desktop-chromium', testCategory: 'govern-studio-lifecycle', assertion: 'eligible-reviewer-visible',
  pageOrdinal: 1, selectionOrdinal: 1, frozen: true, elapsedMs: 15_000, elapsedSaturated: true,
  requests: [request('queue'), request('workspace'), request('eligible', { firstRequestOrdinal: 1,
    requestCount: 1, pendingCount: 1, state: 'pending', outcome: 'pending', elapsedMs: 15_000,
    elapsedSaturated: true })], decisionBinding: 'unavailable', candidateCount: null,
  candidateCountSaturated: false, correlation: 'exact',
  ui: { workspace: 'unknown', candidates: 'unknown' } });

test('eligible reviewer diagnostic accepts exact bounded states and rejects impossible states', () => {
  assert.ok(validateEligibleReviewerRequestDiagnostic(valid()));
  for (const bad of [
    { ...valid(), extra: true },
    { ...valid(), frozen: false },
    { ...valid(), elapsedMs: 15_001 },
    { ...valid(), elapsedMs: 14_999, elapsedSaturated: true },
    { ...valid(), candidateCount: 99, candidateCountSaturated: true },
    { ...valid(), requests: [request('workspace'), request('queue'), request('eligible')] },
    { ...valid(), requests: [request('queue', { pendingCount: 1 }), request('workspace'), request('eligible')] },
    { ...valid(), requests: [request('queue', { firstRequestOrdinal: 1, requestCount: 1, responseCount: 2 }), request('workspace'), request('eligible')] },
    { ...valid(), requests: [request('queue', { firstRequestOrdinal: 1, requestCount: 1, responseCount: 1,
      state: 'settled', lastHttpStatus: 200, statusClass: 'other', outcome: 'incomplete' }), request('workspace'), request('eligible')] },
    { ...valid(), requests: [request('queue', { elapsedMs: 1 }), request('workspace'), request('eligible')] },
    { ...valid(), requests: [request('queue', { firstRequestOrdinal: 1, requestCount: 1, pendingCount: 1,
      state: 'pending', outcome: 'pending' }), request('workspace', { firstRequestOrdinal: 1, requestCount: 1,
      pendingCount: 1, state: 'pending', outcome: 'pending' }), request('eligible')] },
    { ...valid(), ui: { workspace: 'visible', candidates: 'selector-visible', raw: 'secret-canary' } },
  ]) assert.equal(validateEligibleReviewerRequestDiagnostic(bad), null);
});

test('eligible reviewer diagnostic rejects hostile, identifying, oversized and ambiguous fields', () => {
  for (const key of ['url', 'headers', 'body', 'token', 'actorId', 'decisionId', 'timestamp', 'error']) {
    assert.equal(validateEligibleReviewerRequestDiagnostic({ ...valid(), [key]: 'secret-canary' }), null);
  }
  const oversized = valid();
  oversized.requests[2] = { ...oversized.requests[2], hostile: 'x'.repeat(2000) };
  assert.equal(validateEligibleReviewerRequestDiagnostic(oversized), null);
  assert.equal(JSON.stringify(validateEligibleReviewerRequestDiagnostic(valid())).includes('secret-canary'), false);
});

test('request context survives safe child reading and final failure envelope without masking cleanup', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eligible-reviewer-child-envelope-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const diagnosticPath = path.join(root, 'diagnostic.json');
  const child = { schemaVersion: 'authenticated-hosted-playwright-diagnostic-v1',
    project: 'desktop-chromium', testCategory: 'govern-studio-lifecycle', category: 'unexpected-failure',
    operation: 'GOVERN_STUDIO_ELIGIBLE_REVIEWER_VISIBLE', requestContext: valid() };
  await writeFile(diagnosticPath, `${JSON.stringify(child)}\n`);
  await assert.rejects(runAuthenticatedHostedChild(process.execPath, ['-e', 'process.exit(7)'],
    { env: {} }, { diagnosticPath }), error => {
    assert.equal(error.message, 'AUTHENTICATED_HOSTED_RUNNER_BROWSER_EXIT_NONZERO');
    assert.deepEqual(error.authenticatedHostedPlaywrightDiagnostic, child);
    const primary = { phase: 'BROWSER_EXECUTION', category: 'EXIT_NONZERO' };
    const envelope = createAuthenticatedHostedRunDiagnostic({ failure: primary, primary,
      child: error.authenticatedHostedPlaywrightDiagnostic, cleanup: 'failed' });
    assert.deepEqual(validateAuthenticatedHostedRunDiagnostic(envelope), envelope);
    assert.equal(envelope.status, 'failed');
    assert.equal(envelope.cleanup.status, 'failed');
    assert.deepEqual(envelope.child.requestContext, valid());
    for (const hostile of [
      { ...child, operation: 'GOVERN_STUDIO_CHECKPOINT' },
      { ...child, project: 'pixel-7-chromium' },
      { ...child, requestContext: { ...valid(), raw: 'secret-canary' } },
    ]) assert.equal(validateAuthenticatedHostedRunDiagnostic({ ...envelope, child: hostile }), null);
    return true;
  });
});
