import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildV2FullPrefixResult,
  buildV2FullPrefixVariantResult,
  classifyV2FullPrefixFailure,
  resolveV2FullPrefixLocalSelection,
  runIndependentV2FullPrefixVariants,
} from './v2FullPrefixReproduction.mjs';

const stages = [
  'case-discovery', 'case', 'decision', 'draft-head', 'primitives', 'edges',
  'decision-points', 'exception-paths', 'application-assets', 'application-interactions', 'evidence-links',
].map(stage => ({
  stage, status: 'passed', httpStatus: 200, rowCount: stage === 'decision' ? 0 : 1,
  lifecycle: {
    requested: 1, responseStarted: 1, completed: 1, transportFailed: 0, pending: 0,
    bodyCompleted: 1, bodyFailed: 0, bodyPending: 0,
    transportFailures: { aborted: 0, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 },
  },
}));
const passing = variant => ({
  variant,
  execution: 'passed',
  cleanup: 'passed',
  artifactObserved: true,
  browser: {
    variant, navigation: 'passed', renderOutcome: 'resumed', observerFailure: false,
    serverContextObserved: true, sessionObserved: true, scopeNavigationObserved: true,
    processNavigationObserved: true, readStages: stages,
    barrier: variant === 'barrier' ? 'lifecycle-frame' : 'none',
    diagnosticCheckpointEquivalent: false, lifecycleFrameCaptured: true,
    caseDelta: 1, caseVersionDelta: 1, failureStage: null,
    queues: { network: 'passed', cases: 'passed' },
  },
  controller: {
    browserCaseCount: 7, serverCaseCount: 7, actionCount: 9, completedActionCount: 9,
    caseIds: ['ASSESS-002', 'ASSESS-003', 'ASSESS-018', 'ASSESS-020', 'SAFETY-001', 'SAFETY-002', 'SAFETY-003'],
    contractSatisfied: true,
  },
  network: { observedHttpRequests: 30, nonLoopbackRequests: 0 },
});

test('an immediate failure is retained while the fresh barrier comparison still runs', async () => {
  const attempted = [];
  const results = await runIndependentV2FullPrefixVariants(async variant => {
    attempted.push(variant);
    if (variant === 'immediate') throw new Error('secret failure detail');
    return passing(variant);
  });
  assert.deepEqual(attempted, ['immediate', 'barrier']);
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].browser, null);
  assert.deepEqual(results[0].setupFailure, { stage: 'variant-execution', code: 'UNCLASSIFIED' });
  assert.equal(results[1].status, 'passed');
  assert.doesNotMatch(JSON.stringify(results), /secret failure detail/u);
});

test('pre-browser setup failures retain only allowlisted codes or SQLSTATE', () => {
  assert.deepEqual(classifyV2FullPrefixFailure(
    new Error('AUTHENTICATED_SYNTHETIC_ACTIVATION_REJECTED: private detail'),
    'controller-create',
  ), { stage: 'controller-create', code: 'AUTHENTICATED_SYNTHETIC_ACTIVATION_REJECTED' });
  const sqlError = new Error('private relation and identifier detail');
  sqlError.code = '42P01';
  const classified = classifyV2FullPrefixFailure(sqlError, 'controller-create');
  assert.deepEqual(classified, { stage: 'controller-create', code: 'SQLSTATE_42P01' });
  assert.doesNotMatch(JSON.stringify(classified), /private|relation|identifier/u);
});

test('failure evidence preserves bounded lifecycle counts and removes arbitrary fields', () => {
  const failed = passing('immediate');
  failed.browser.renderOutcome = 'unresolved';
  failed.browser.failureStage = 'render';
  failed.browser.rawException = 'sensitive exception';
  failed.rawToken = 'sensitive token';
  const variant = buildV2FullPrefixVariantResult(failed);
  assert.equal(variant.status, 'failed');
  assert.equal(variant.browser.failureStage, 'render');
  assert.equal(variant.browser.readStages.length, 11);
  assert.deepEqual(variant.browser.readStages[0].lifecycle, stages[0].lifecycle);
  assert.doesNotMatch(JSON.stringify(variant), /sensitive/u);

  const result = buildV2FullPrefixResult({
    variants: [variant, buildV2FullPrefixVariantResult(passing('barrier'))],
    native: { active: 0, requests: 24, responses: 24, completed: 24, cancelled: 0, failed: 0,
      statusClasses: { 200: 24 }, raw: 'sensitive native detail' },
    baseline: '6e253b2c3d4c18a9106ee53449cc374d2214d4cb',
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.conclusion, 'reproduced');
  assert.doesNotMatch(JSON.stringify(result), /sensitive/u);
});

test('local selector rejects hosted, unauthenticated, diagnostic and unknown modes', () => {
  assert.equal(resolveV2FullPrefixLocalSelection({ variant: undefined, authenticated: false,
    hosted: true, mode: 'full_acceptance' }), null);
  assert.equal(resolveV2FullPrefixLocalSelection({ variant: 'immediate', authenticated: true,
    hosted: false, mode: 'full_acceptance' }), 'immediate');
  assert.throws(() => resolveV2FullPrefixLocalSelection({ variant: 'unknown', authenticated: true,
    hosted: false, mode: 'full_acceptance' }), /REPRODUCTION_REJECTED/u);
  assert.throws(() => resolveV2FullPrefixLocalSelection({ variant: 'barrier', authenticated: true,
    hosted: true, mode: 'full_acceptance' }), /SCOPE_REJECTED/u);
  assert.throws(() => resolveV2FullPrefixLocalSelection({ variant: 'barrier', authenticated: false,
    hosted: false, mode: 'full_acceptance' }), /SCOPE_REJECTED/u);
  assert.throws(() => resolveV2FullPrefixLocalSelection({ variant: 'barrier', authenticated: true,
    hosted: false, mode: 'v2_primary_prefix_diagnostic' }), /SCOPE_REJECTED/u);
});

test('local control wrapper delegates action and case routes to the production controller', async () => {
  const source = await readFile(new URL('./v2FullPrefixLocalController.mjs', import.meta.url), 'utf8');
  assert.match(source, /new AuthenticatedHostedController\(/u);
  assert.match(source, /createAuthenticatedHostedPostgresAdapter\(/u);
  assert.match(source, /controller[.]control\(url[.]pathname, input\)/u);
  assert.doesNotMatch(source, /beginBrowserAction\s*\(/u);
  assert.doesNotMatch(source, /recordBrowserCase\s*\(/u);
  assert.match(source, /CREATE TABLE IF NOT EXISTS auth[.]sessions/u);
  assert.match(source, /origin: 'https:\/\/avalaos-pilot[.]netlify[.]app'/u);
  assert.match(source, /authenticatedHostedDigest\(`local-v2-full-prefix:\$\{variant\}`\)/u);
});
