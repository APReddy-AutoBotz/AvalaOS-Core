import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildV2FullPrefixResult,
  buildV2FullPrefixVariantResult,
  classifyV2FullPrefixFailure,
  primeV2FullPrefixFixtureSession,
  resolveV2FullPrefixLocalSelection,
  runIndependentV2FullPrefixVariants,
} from './v2FullPrefixReproduction.mjs';
import { AuthenticatedHostedBrowserActionTracker } from './authenticatedHostedBrowserRequestClassifier.mjs';
import { AuthenticatedHostedController } from './authenticatedHostedController.mjs';
import { createV2FullPrefixAdapterQuery } from './v2FullPrefixLocalController.mjs';

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
    setupProbe: 'passed', setupActionCount: 1,
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
  assert.deepEqual(classifyV2FullPrefixFailure(
    new Error('AUTHENTICATED_SYNTHETIC_SESSION_REJECTED'),
    'controller-first-action',
  ), { stage: 'controller-first-action', code: 'AUTHENTICATED_SYNTHETIC_SESSION_REJECTED' });
  assert.deepEqual(classifyV2FullPrefixFailure(
    new Error('SQLSTATE_42501'),
    'controller-first-action',
  ), { stage: 'controller-first-action', code: 'SQLSTATE_42501' });
});

test('local adapter serializes queries and scopes service role to authority RPCs', async () => {
  const calls = [];
  let transactionActive = false;
  let releaseAuthority;
  let authorityStarted;
  let directStarted = false;
  const authorityGate = new Promise(resolve => { releaseAuthority = resolve; });
  const authorityEntered = new Promise(resolve => { authorityStarted = resolve; });
  const client = { query: async (sql, values = []) => {
    calls.push(sql);
    if (sql === 'BEGIN') {
      assert.equal(transactionActive, false);
      transactionActive = true;
    } else if (sql === 'COMMIT' || sql === 'ROLLBACK') {
      assert.equal(transactionActive, true);
      transactionActive = false;
    } else if (sql === 'SET LOCAL ROLE service_role'
      || /^SELECT public[.]authenticated_synthetic_/u.test(sql.trim())) {
      assert.equal(transactionActive, true);
    } else {
      assert.equal(transactionActive, false);
      directStarted = true;
    }
    if (/authenticated_synthetic/u.test(sql)) {
      authorityStarted();
      await authorityGate;
    }
    return { rows: [{ sql, values }] };
  } };
  const query = createV2FullPrefixAdapterQuery(client);
  const firstQuery = query('SELECT public.authenticated_synthetic_observe($1)', ['one']);
  await authorityEntered;
  const secondQuery = query('SELECT * FROM public.enterprise_ai_budget_reservations', ['two']);
  await Promise.resolve();
  assert.equal(directStarted, false);
  releaseAuthority();
  const [first, second] = await Promise.all([firstQuery, secondQuery]);
  assert.deepEqual(calls, [
    'BEGIN', 'SET LOCAL ROLE service_role', 'SELECT public.authenticated_synthetic_observe($1)', 'COMMIT',
    'SELECT * FROM public.enterprise_ai_budget_reservations',
  ]);
  assert.deepEqual(first.rows[0].values, ['one']);
  assert.deepEqual(second.rows[0].values, ['two']);
  assert.equal(transactionActive, false);
});

test('fixture session is present before the controlled first product request', async () => {
  const actorId = '10000000-0000-4000-8000-000000000001';
  const sessionId = '20000000-0000-4000-8000-000000000001';
  const token = `${Buffer.from('{}').toString('base64url')}.${
    Buffer.from(JSON.stringify({ sub: actorId, session_id: sessionId })).toString('base64url')}.${'x'.repeat(48)}`;
  let initScript = null;
  let initValue = null;
  const page = { addInitScript: async (script, value) => { initScript = script; initValue = value; } };
  assert.equal(await primeV2FullPrefixFixtureSession(page, {
    token, user: { id: actorId, email: 'author@fixture.invalid' },
  }, 'sb-127-auth-token'), true);
  assert.equal(await primeV2FullPrefixFixtureSession(page, {
    token, user: { id: actorId, email: 'author@fixture.invalid' },
  }, 'sb-127-auth-token'), false);

  const values = new Map();
  const sessionValues = new Map();
  const priorLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const priorSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => sessionValues.get(key) ?? null,
    setItem: (key, value) => sessionValues.set(key, value),
  } });
  try {
    initScript(initValue);
    const transitioned = JSON.stringify({ access_token: 'reviewer-transition-token' });
    values.set('sb-127-auth-token', transitioned);
    initScript(initValue);
    assert.equal(values.get('sb-127-auth-token'), transitioned);
    values.delete('sb-127-auth-token');
    initScript(initValue);
    assert.equal(values.has('sb-127-auth-token'), false);
    values.set('sb-127-auth-token', initValue.value);
  } finally {
    if (priorLocalStorage) Object.defineProperty(globalThis, 'localStorage', priorLocalStorage);
    else delete globalThis.localStorage;
    if (priorSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', priorSessionStorage);
    else delete globalThis.sessionStorage;
  }
  const stored = JSON.parse(values.get('sb-127-auth-token'));
  assert.equal(stored.access_token, token);

  let bindCalls = 0;
  let observeCalls = 0;
  const controller = new AuthenticatedHostedController({
    config: {},
    identity: { verifySession: async input => {
      if (input.accessToken !== token) throw new Error('AUTHENTICATED_HOSTED_CONTROLLER_SESSION_TOKEN_REJECTED');
      return { actorId, sessionId };
    } },
    adapter: {
      bindSession: async () => { bindCalls += 1; },
      observe: async () => {
        observeCalls += 1;
        return { capturedAt: '2026-10-17T00:00:00.000Z', records: [] };
      },
    },
  });
  controller.projects.set('desktop-chromium-immediate', {
    identities: { author: { id: actorId } },
    lastBoundaryAt: '2026-10-16T23:59:59.000Z',
  });
  const tracker = new AuthenticatedHostedBrowserActionTracker({
    backendOrigin: 'http://127.0.0.1:54321',
    appOrigin: 'http://127.0.0.1:4173',
    startAction: input => controller.beginBrowserAction({ projectName: 'desktop-chromium-immediate', ...input }),
    finishAction: async () => undefined,
  });
  const request = authorization => ({
    url: () => 'http://127.0.0.1:54321/functions/v1/tenant-session',
    method: () => 'POST',
    allHeaders: async () => ({ authorization }),
    postDataJSON: () => ({ method: 'POST', route: '/functions/v1/tenant-session' }),
  });
  await assert.rejects(tracker.begin(request('')), /SESSION_TOKEN_REJECTED/u);
  assert.equal(observeCalls, 0);
  const actionId = await tracker.begin(request(`Bearer ${stored.access_token}`));
  assert.match(actionId, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(bindCalls, 1);
  assert.equal(observeCalls, 1);
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
