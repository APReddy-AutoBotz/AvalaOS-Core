import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  CONTROLLED_PREVIEW_BRANCH,
  CONTROLLED_PREVIEW_ORIGIN,
  CONTROLLED_PREVIEW_PROJECTS,
  CONTROLLED_PREVIEW_SCENARIOS,
  CONTROLLED_PREVIEW_WORKFLOW,
  CONTROLLED_PREVIEW_EVIDENCE_PROFILE,
  classifyControlledPreviewWorkflowSelection,
  createControlledPreviewNetworkObserver,
  controlledPreviewTitle,
  decodeControlledPreviewGitHubRuntime,
  extractControlledPreviewBrowserBinding,
  fetchControlledPreviewBindingResource,
  loadControlledPreviewBrowserBinding,
  selectControlledPreviewApplicationEntries,
} from './previewBrowserEvidenceContract.mjs';
import {
  buildControlledPreviewResultInventory,
  validateControlledPreviewResultInventory,
} from './verifyPreviewBrowserEvidence.mjs';

const head = 'a'.repeat(40);
const deploy = 'b'.repeat(24);
const workflowSha = 'c'.repeat(40);
const workflowRef = `owner/repository/${CONTROLLED_PREVIEW_WORKFLOW}@refs/pull/264/merge`;
const profile = CONTROLLED_PREVIEW_EVIDENCE_PROFILE;
const metadata = {
  schemaVersion: 'acceptance-report-profile-v1',
  ci: {},
  evidenceKind: 'hosted-preview-acceptance',
  executionKind: 'hosted_preview',
  exactCommand: ['npx', 'playwright', 'test', '--config=playwright.controlled-preview-boundary.config.ts', '--workers=1'],
  configPath: profile.configPath,
  sourcePaths: ['tests/browser/controlledPreviewBoundary.spec.ts', 'scripts/previewBrowserEvidenceContract.mjs'],
  exactHead: head,
  targetOrigin: CONTROLLED_PREVIEW_ORIGIN,
  deployId: deploy,
  previewEvidenceKind: profile.evidenceKind,
  titlePrefix: profile.titlePrefix,
  canonicalAlias: CONTROLLED_PREVIEW_ORIGIN,
  immutableDeployOriginDigest: `sha256:${createHash('sha256').update(`https://${deploy}--avalaos-pilot.netlify.app`).digest('hex')}`,
  workflowRuntime: {
    authority: 'github-actions',
    workflowPath: CONTROLLED_PREVIEW_WORKFLOW,
    workflowRef,
    repository: 'owner/repository',
    eventName: 'pull_request',
    runId: '12345',
    runAttempt: '2',
    workflowSha,
    prNumber: 264,
    headRef: CONTROLLED_PREVIEW_BRANCH,
    headRepository: 'owner/repository',
    releaseSha: head,
  },
  actualWorkers: 1,
};
const expected = {
  releaseSha: head,
  deployId: deploy,
  executionKind: 'hosted_preview',
  artifactPath: profile.artifactPath,
  configPath: profile.configPath,
  workflowPath: CONTROLLED_PREVIEW_WORKFLOW,
  githubActions: 'true',
  workflowRef,
  workflowSha,
  eventName: 'pull_request',
  prNumber: 264,
  headRef: CONTROLLED_PREVIEW_BRANCH,
  headRepository: 'owner/repository',
  repository: 'owner/repository',
  runId: '12345',
  runAttempt: '2',
};
const result = (scenario, project, overrides = {}) => ({
  projectName: project,
  expectedStatus: 'passed',
  status: 'expected',
  annotations: [],
  results: [{ status: 'passed', retry: 0, errors: [], attachments: [] }],
  ...overrides,
});
const report = (metadataOverride = metadata, filter = () => true) => ({
  config: { metadata: metadataOverride },
  errors: [],
  suites: [{
    specs: CONTROLLED_PREVIEW_SCENARIOS.flatMap(scenario => CONTROLLED_PREVIEW_PROJECTS
      .filter(project => filter(scenario, project))
      .map(project => ({ title: controlledPreviewTitle(scenario), tests: [result(scenario, project)] }))),
  }],
});

test('exact hosted controlled-preview inventory passes with every scenario on Desktop Chrome and Pixel 7', () => {
  assert.deepEqual(validateControlledPreviewResultInventory({ report: report(), expected }), []);
  const inventory = buildControlledPreviewResultInventory({ report: report(), expected });
  assert.equal(inventory.summary.total, CONTROLLED_PREVIEW_SCENARIOS.length * CONTROLLED_PREVIEW_PROJECTS.length);
  assert.equal(inventory.summary.passed, inventory.summary.total);
  assert.equal(inventory.controlledHumanDisposition, 'not_run');
});

test('zero, partial, duplicate, skipped, failed, retried, and attached results reject', () => {
  assert.match(validateControlledPreviewResultInventory({ report: { config: { metadata }, errors: [], suites: [] }, expected }).join(','), /result-count/u);
  assert.match(validateControlledPreviewResultInventory({ report: report(metadata, (scenario, project) => !(scenario.id === 'public-cta-sign-in' && project === CONTROLLED_PREVIEW_PROJECTS[1])), expected }).join(','), /result-count|result-inventory/u);
  const duplicate = report();
  duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
  assert.match(validateControlledPreviewResultInventory({ report: duplicate, expected }).join(','), /result-count|result-inventory/u);
  for (const overrides of [
    { expectedStatus: 'skipped', status: 'skipped', results: [] },
    { status: 'unexpected', results: [{ status: 'failed', retry: 0, errors: [], attachments: [] }] },
    { results: [{ status: 'failed', retry: 0, errors: [], attachments: [] }, { status: 'passed', retry: 1, errors: [], attachments: [] }] },
    { results: [{ status: 'passed', attachments: [{ name: 'trace', path: 'unsafe.zip' }] }] },
    { annotations: [{ type: 'skip' }] },
  ]) {
    const mutation = report();
    Object.assign(mutation.suites[0].specs[0].tests[0], overrides);
    assert.notDeepEqual(validateControlledPreviewResultInventory({ report: mutation, expected }), []);
  }
});

test('workflow selection admits only the exact PR 264 same-repository branch and rejects partial identity', () => {
  const exact = {
    prNumber: 264,
    headRef: CONTROLLED_PREVIEW_BRANCH,
    headRepository: 'owner/repository',
    repository: 'owner/repository',
  };
  assert.equal(classifyControlledPreviewWorkflowSelection(exact), 'selected');
  assert.equal(classifyControlledPreviewWorkflowSelection({ ...exact, prNumber: 263, headRef: 'feature/unrelated' }), 'not_selected');
  for (const mutation of [
    { ...exact, prNumber: 263 },
    { ...exact, headRef: 'feature/substitution' },
    { ...exact, headRepository: 'fork/repository' },
    { ...exact, repository: '' },
  ]) {
    assert.throws(() => classifyControlledPreviewWorkflowSelection(mutation), /PARTIAL_IDENTITY_REJECTED/u);
  }
});

test('GitHub runtime binding derives exact PR head and run attempt from built-ins plus the event payload', () => {
  const environment = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'owner/repository',
    GITHUB_WORKFLOW_REF: workflowRef,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_RUN_ID: '12345',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_SHA: workflowSha,
  };
  const event = { pull_request: { number: 264, head: { ref: CONTROLLED_PREVIEW_BRANCH, sha: head, repo: { full_name: 'owner/repository' } } } };
  assert.deepEqual(decodeControlledPreviewGitHubRuntime(environment, event), metadata.workflowRuntime);
  assert.equal(decodeControlledPreviewGitHubRuntime({}, null), null, 'a local diagnostic remains explicitly non-authoritative');
  for (const mutation of [
    [{ ...environment, GITHUB_RUN_ATTEMPT: '0' }, event],
    [{ ...environment, GITHUB_WORKFLOW_REF: 'owner/repository/.github/workflows/other.yml@refs/pull/264/merge' }, event],
    [environment, { pull_request: { ...event.pull_request, number: 265 } }],
    [environment, { pull_request: { ...event.pull_request, head: { ...event.pull_request.head, repo: { full_name: 'fork/repository' } } } }],
  ]) {
    assert.throws(() => decodeControlledPreviewGitHubRuntime(mutation[0], mutation[1]), /GITHUB_RUNTIME_REJECTED/u);
  }
});

test('minified built-asset binding accepts backtick values and rejects missing or conflicting values', () => {
  const source = `releaseSha:\`${head}\`,reviewHeadSha:\`${head}\`,deployId:\`${deploy}\`,deployOrigin:\`${CONTROLLED_PREVIEW_ORIGIN}\`,exerciseDigest:\`sha256:${'c'.repeat(64)}\`,targetFingerprint:\`sha256:${'d'.repeat(64)}\`,publicTargetDigest:\`sha256:${'e'.repeat(64)}\``;
  assert.deepEqual(extractControlledPreviewBrowserBinding(source), {
    releaseSha: head,
    reviewHeadSha: head,
    deployId: deploy,
    deployOrigin: CONTROLLED_PREVIEW_ORIGIN,
    exerciseDigest: `sha256:${'c'.repeat(64)}`,
    targetFingerprint: `sha256:${'d'.repeat(64)}`,
    publicTargetDigest: `sha256:${'e'.repeat(64)}`,
  });
  assert.throws(() => extractControlledPreviewBrowserBinding(source.replace('publicTargetDigest', 'removedPublicTargetDigest')), /PUBLICTARGETDIGEST_AMBIGUOUS/u);
  assert.throws(() => extractControlledPreviewBrowserBinding(`${source},releaseSha:'${'f'.repeat(40)}'`), /RELEASESHA_AMBIGUOUS/u);
});

test('mixed hosted HTML selects only the exact same-origin module entry and rejects hostile modules', () => {
  const mixed = [
    '<script defer src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>',
    '<script defer src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js"></script>',
    '<script defer src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>',
    '<script type="module" crossorigin src="/assets/index-Ab_12.js"></script>',
    '<script src="/.netlify/scripts/cdp"></script>',
  ].join('');
  assert.deepEqual(selectControlledPreviewApplicationEntries(mixed), [`${CONTROLLED_PREVIEW_ORIGIN}/assets/index-Ab_12.js`]);
  assert.throws(() => selectControlledPreviewApplicationEntries(mixed.replace(
    '<script type="module" crossorigin src="/assets/index-Ab_12.js"></script>',
    '<script type="module" src="https://hostile.invalid/assets/index-Ab_12.js"></script>',
  )), /MODULE_ENTRY_REJECTED/u);
});

test('binding loader disables redirects, verifies every final response identity, and accounts API context traffic', async () => {
  const bindingSource = `releaseSha:'${head}',reviewHeadSha:'${head}',deployId:'${deploy}',deployOrigin:'${CONTROLLED_PREVIEW_ORIGIN}',exerciseDigest:'sha256:${'c'.repeat(64)}',targetFingerprint:'sha256:${'d'.repeat(64)}',publicTargetDigest:'sha256:${'e'.repeat(64)}'`;
  const bodies = new Map([
    [`${CONTROLLED_PREVIEW_ORIGIN}/sign-in`, '<script type="module" src="/assets/index-safe.js"></script>'],
    [`${CONTROLLED_PREVIEW_ORIGIN}/assets/index-safe.js`, bindingSource],
  ]);
  const calls = [];
  const accounted = [];
  const request = {
    get: async (url, options) => {
      calls.push({ url, options });
      return {
        url: () => url,
        ok: () => true,
        headers: () => ({
          'x-avalaos-release': head,
          'x-avalaos-netlify-deploy-id': deploy,
          'x-avalaos-environment': 'hosted_nonproduction_pilot',
        }),
        text: async () => bodies.get(url),
      };
    },
  };
  assert.deepEqual(await loadControlledPreviewBrowserBinding({
    request,
    expectedHead: head,
    expectedDeployId: deploy,
    accountApiContextRequest: url => accounted.push(url),
  }), extractControlledPreviewBrowserBinding(bindingSource));
  assert.deepEqual(accounted, [...bodies.keys()]);
  assert.deepEqual(calls.map(call => call.options), [
    { maxRedirects: 0, failOnStatusCode: false },
    { maxRedirects: 0, failOnStatusCode: false },
  ]);

  await assert.rejects(
    fetchControlledPreviewBindingResource({
      request: {
        get: async (_url, options) => {
          assert.equal(options.maxRedirects, 0);
          return {
            url: () => 'https://foreign.invalid/stolen.js',
            ok: () => true,
            headers: () => ({}),
            text: async () => 'hostile',
          };
        },
      },
      url: `${CONTROLLED_PREVIEW_ORIGIN}/assets/index-safe.js`,
      expectedHead: head,
      expectedDeployId: deploy,
      accountApiContextRequest: () => {},
    }),
    /CONTROLLED_PREVIEW_BINDING_FINAL_URL_REJECTED/u,
  );
});

const createRouteFaultHarness = async (observerOptions = {}) => {
  const context = new EventEmitter();
  let guard;
  let contextClosed = false;
  context.route = async (_pattern, handler) => { guard = handler; };
  context.routeWebSocket = async () => {};
  context.pages = () => [];
  context.close = async () => { contextClosed = true; };
  const page = { context: () => context };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
    drainQuietMs: 1,
    ...observerOptions,
  });
  return {
    context,
    observer,
    guard: route => guard(route),
    contextClosed: () => contextClosed,
  };
};

const allowedRouteRequest = (pathname = '/brand/logo.png', resourceType = 'image') => ({
  url: () => `${CONTROLLED_PREVIEW_ORIGIN}${pathname}`,
  method: () => 'GET',
  resourceType: () => resourceType,
  postData: () => null,
});

const exactRouteResponse = request => ({
  url: () => request.url(),
  status: () => 200,
  headers: () => ({
    'x-avalaos-release': head,
    'x-avalaos-netlify-deploy-id': deploy,
    'x-avalaos-environment': 'hosted_nonproduction_pilot',
  }),
});

test('network observer keeps its context guard active through unload and context closure', async () => {
  const events = [];
  const context = new EventEmitter();
  let guard;
  const providerRequest = {
    url: () => 'https://api.openai.com/v1/responses',
    method: () => 'POST',
    resourceType: () => 'fetch',
    postData: () => JSON.stringify({ email: 'blocked@dummy.invalid' }),
  };
  const closingImageRequest = {
    url: () => `${CONTROLLED_PREVIEW_ORIGIN}/brand/late.png`,
    method: () => 'GET',
    resourceType: () => 'image',
    postData: () => null,
  };
  const popup = {};
  const page = new EventEmitter();
  let pageClosed = false;
  page.context = () => context;
  page.isClosed = () => pageClosed;
  page.close = async options => {
    events.push(['page-close', options]);
    context.emit('page', popup);
    context.emit('serviceworker', {});
    context.emit('request', providerRequest);
    await guard({
      request: () => providerRequest,
      continue: async () => events.push(['continued']),
      fetch: async () => { throw new Error('provider route must never fetch'); },
      abort: async reason => events.push(['aborted', reason]),
    });
    context.emit('request', closingImageRequest);
    await guard({
      request: () => closingImageRequest,
      fetch: async () => { throw new Error('closing allowed request must never fetch'); },
      fulfill: async () => events.push(['closing-image-fulfilled']),
      abort: async reason => events.push(['closing-image-aborted', reason]),
    });
    pageClosed = true;
    page.emit('close');
  };
  context.route = async (pattern, handler) => {
    events.push(['route-installed', pattern]);
    guard = handler;
  };
  context.routeWebSocket = async (_pattern, _handler) => {
    events.push(['websocket-guard-installed']);
  };
  context.pages = () => [page];
  context.close = async () => {
    events.push(['context-close']);
  };

  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
  });
  const counts = await observer.finish();
  assert.equal(counts.providerRequests, 1);
  assert.equal(counts.credentialBearingRequests, 1);
  assert.equal(counts.unexpectedRequests, 1);
  assert.equal(counts.closingAllowedRequests, 1);
  assert.deepEqual(counts.unexpectedCategories, { 'external:fetch:https:': 1 });
  assert.equal(counts.popups, 1);
  assert.equal(counts.serviceWorkers, 1);
  assert.ok(events.findIndex(event => event[0] === 'aborted') < events.findIndex(event => event[0] === 'context-close'));
  assert.throws(
    () => observer.accountApiContextRequest(`${CONTROLLED_PREVIEW_ORIGIN}/assets/late.js`),
    /CONTROLLED_PREVIEW_API_REQUEST_OUTSIDE_OBSERVER/u,
  );
});

test('context guard rejects a foreign redirect with one fetch and one terminal abort', async () => {
  const context = new EventEmitter();
  let guard;
  let fetchCalls = 0;
  const actions = [];
  context.route = async (_pattern, handler) => { guard = handler; };
  context.routeWebSocket = async () => {};
  context.pages = () => [];
  context.close = async () => {};
  const page = { context: () => context };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
  });
  const allowedUrl = `${CONTROLLED_PREVIEW_ORIGIN}/sign-in`;
  const request = {
    url: () => allowedUrl,
    method: () => 'GET',
    resourceType: () => 'document',
    postData: () => null,
  };
  await assert.rejects(observer.run(() => guard({
    request: () => request,
    fetch: async options => {
      fetchCalls += 1;
      assert.deepEqual(options, { maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
      return {
        url: () => allowedUrl,
        status: () => 302,
        headers: () => ({ location: 'https://foreign.invalid/sign-in' }),
      };
    },
    fulfill: async () => actions.push('fulfilled-redirect'),
    abort: async reason => actions.push(`aborted-${reason}`),
  })), /CONTROLLED_PREVIEW_NETWORK_FAILED:response-identity:response-identity/u);
  assert.equal(fetchCalls, 1);
  assert.deepEqual(actions, ['aborted-blockedbyclient']);
});

test('context guard fulfills one exact first-party response with no retry or substituted response', async () => {
  const context = new EventEmitter();
  let guard;
  let fetchCalls = 0;
  const actions = [];
  context.route = async (_pattern, handler) => { guard = handler; };
  context.routeWebSocket = async () => {};
  context.pages = () => [];
  context.close = async () => {};
  const page = { context: () => context };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
  });
  const allowedUrl = `${CONTROLLED_PREVIEW_ORIGIN}/sign-in`;
  const request = {
    url: () => allowedUrl,
    method: () => 'GET',
    resourceType: () => 'document',
    postData: () => null,
  };
  const successResponse = {
    url: () => allowedUrl,
    status: () => 200,
    headers: () => ({
      'x-avalaos-release': head,
      'x-avalaos-netlify-deploy-id': deploy,
      'x-avalaos-environment': 'hosted_nonproduction_pilot',
    }),
  };
  await guard({
    request: () => request,
    fetch: async options => {
      fetchCalls += 1;
      assert.deepEqual(options, { maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
      return successResponse;
    },
    fulfill: async options => actions.push(options.response === successResponse ? 'fulfilled-exact' : 'fulfilled-substituted'),
    abort: async reason => actions.push(`aborted-success-${reason}`),
  });
  const counts = await observer.finish();
  assert.equal(fetchCalls, 1, 'each browser request must cause exactly one non-redirecting network fetch');
  assert.deepEqual(actions, ['fulfilled-exact']);
  assert.equal(counts.unexpectedRequests, 0);
  assert.deepEqual(counts.unexpectedCategories, {});
});

test('finish drains an already-started allowed image fetch before page and context disposal', async () => {
  const context = new EventEmitter();
  const order = [];
  let guard;
  let resolveFetch;
  const deferredFetch = new Promise(resolve => { resolveFetch = resolve; });
  const imageUrl = `${CONTROLLED_PREVIEW_ORIGIN}/brand/logo.png`;
  const request = {
    url: () => imageUrl,
    method: () => 'GET',
    resourceType: () => 'image',
    postData: () => null,
  };
  const page = new EventEmitter();
  let pageClosed = false;
  page.context = () => context;
  page.isClosed = () => pageClosed;
  page.close = async options => {
    order.push(['page-close', options]);
    pageClosed = true;
    page.emit('close');
  };
  context.route = async (_pattern, handler) => { guard = handler; };
  context.routeWebSocket = async () => {};
  context.pages = () => [page];
  context.close = async () => { order.push(['context-close']); };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
    drainTimeoutMs: 250,
    drainQuietMs: 2,
  });
  context.emit('request', request);
  const routeCompletion = guard({
    request: () => request,
    fetch: async options => {
      assert.deepEqual(options, { maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
      return deferredFetch;
    },
    fulfill: async () => { order.push(['image-fulfilled']); },
    abort: async reason => { order.push(['image-aborted', reason]); },
  });
  const finish = observer.finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(order.some(event => event[0] === 'page-close'), false, 'owned page must remain alive while an active route callback drains');
  resolveFetch({
    url: () => imageUrl,
    status: () => 200,
    headers: () => ({
      'x-avalaos-release': head,
      'x-avalaos-netlify-deploy-id': deploy,
      'x-avalaos-environment': 'hosted_nonproduction_pilot',
    }),
  });
  await routeCompletion;
  const counts = await finish;
  assert.deepEqual(order.map(event => event[0]), ['image-fulfilled', 'page-close', 'context-close']);
  assert.equal(counts.unexpectedRequests, 0);
  assert.equal(counts.closingAllowedRequests, 0);
});

test('callback rejection is reported after owned context cleanup', async () => {
  const context = new EventEmitter();
  let guard;
  let contextClosed = false;
  const page = { context: () => context };
  context.route = async (_pattern, handler) => { guard = handler; };
  context.routeWebSocket = async () => {};
  context.pages = () => [];
  context.close = async () => { contextClosed = true; };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
    drainTimeoutMs: 100,
    drainQuietMs: 2,
  });
  const request = {
    url: () => `${CONTROLLED_PREVIEW_ORIGIN}/brand/logo.png`,
    method: () => 'GET',
    resourceType: () => 'image',
    postData: () => null,
  };
  await guard({
    request: () => request,
    fetch: async () => { throw new Error('synthetic route failure'); },
    fulfill: async () => {},
    abort: async () => {},
  });
  await assert.rejects(observer.finish(), /CONTROLLED_PREVIEW_NETWORK_FAILED:fetch:fetch-rejected/u);
  assert.equal(contextClosed, true);
});

test('run-before-unload close must emit a real page close before context disposal', async () => {
  const context = new EventEmitter();
  let contextClosed = false;
  const page = new EventEmitter();
  page.context = () => context;
  page.isClosed = () => false;
  page.close = async () => {};
  context.route = async () => {};
  context.routeWebSocket = async () => {};
  context.pages = () => [page];
  context.close = async () => { contextClosed = true; };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
    drainTimeoutMs: 20,
    drainQuietMs: 2,
  });
  await assert.rejects(observer.finish(), /CONTROLLED_PREVIEW_NETWORK_FAILED:cleanup:page-close-timeout/u);
  assert.equal(contextClosed, true);
});

test('context close rejection and hang remain sanitized and bounded', async () => {
  for (const mode of ['reject', 'hang']) {
    const context = new EventEmitter();
    const page = { context: () => context };
    let closeCalls = 0;
    context.route = async () => {};
    context.routeWebSocket = async () => {};
    context.pages = () => [];
    context.close = async () => {
      closeCalls += 1;
      if (mode === 'reject') throw new Error('raw close failure must be sanitized');
      return new Promise(() => {});
    };
    const observer = await createControlledPreviewNetworkObserver({
      page,
      aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
      immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
      expectedHead: head,
      expectedDeployId: deploy,
      drainTimeoutMs: 30,
      drainQuietMs: 1,
    });
    await assert.rejects(
      observer.finish(),
      new RegExp(`CONTROLLED_PREVIEW_NETWORK_FAILED:cleanup:context-close-${mode === 'reject' ? 'rejected' : 'timeout'}`, 'u'),
    );
    assert.equal(closeCalls, 1);
  }
});

test('hanging callback drain fails boundedly and still attempts owned context cleanup', async () => {
  const context = new EventEmitter();
  let guard;
  let contextClosed = false;
  const page = { context: () => context };
  context.route = async (_pattern, handler) => { guard = handler; };
  context.routeWebSocket = async () => {};
  context.pages = () => [];
  context.close = async () => { contextClosed = true; };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
    drainTimeoutMs: 20,
    drainQuietMs: 2,
  });
  const request = {
    url: () => `${CONTROLLED_PREVIEW_ORIGIN}/brand/logo.png`,
    method: () => 'GET',
    resourceType: () => 'image',
    postData: () => null,
  };
  void guard({
    request: () => request,
    fetch: async () => new Promise(() => {}),
    fulfill: async () => {},
    abort: async () => {},
  });
  await assert.rejects(observer.finish(), /CONTROLLED_PREVIEW_NETWORK_FAILED:cleanup:active-drain-timeout/u);
  assert.equal(contextClosed, true);
});

test('throwing response accessors abort once and expose only the fixed response-inspection category', async () => {
  for (const accessor of ['url', 'status', 'headers']) {
    const harness = await createRouteFaultHarness({ drainTimeoutMs: 30, terminalGuardTimeoutMs: 20 });
    const request = allowedRouteRequest();
    const response = exactRouteResponse(request);
    response[accessor] = () => { throw new Error('raw response failure must be sanitized'); };
    const actions = [];
    await assert.rejects(harness.observer.run(() => harness.guard({
      request: () => request,
      fetch: async () => response,
      fulfill: async () => actions.push('fulfill'),
      abort: async () => actions.push('abort'),
    })), error => {
      assert.equal(error.message, 'CONTROLLED_PREVIEW_NETWORK_FAILED:response-identity:response-inspection');
      assert.equal(error.message.includes('raw response'), false);
      return true;
    });
    assert.deepEqual(actions, ['abort']);
  }
});

test('request fetched before closing is rechecked and aborted instead of fulfilled during cleanup', async () => {
  let releaseFetch;
  const fetchResponse = new Promise(resolve => { releaseFetch = resolve; });
  const context = new EventEmitter();
  let guard;
  const actions = [];
  const request = allowedRouteRequest();
  const page = { context: () => context };
  context.route = async (_pattern, handler) => { guard = handler; };
  context.routeWebSocket = async () => {};
  context.pages = () => [];
  context.close = async () => {
    actions.push('context-close');
    releaseFetch(exactRouteResponse(request));
  };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
    fetchGuardTimeoutMs: 500,
    terminalGuardTimeoutMs: 20,
    drainTimeoutMs: 20,
    drainQuietMs: 1,
  });
  const routeCompletion = guard({
    request: () => request,
    fetch: async () => fetchResponse,
    fulfill: async () => actions.push('fulfill'),
    abort: async () => actions.push('abort'),
  }).catch(error => error);
  await assert.rejects(observer.finish(), /CONTROLLED_PREVIEW_NETWORK_FAILED:cleanup:active-drain-timeout/u);
  assert.equal(await routeCompletion, undefined);
  assert.deepEqual(actions, ['context-close', 'abort']);
});

test('async fetch rejection aborts exactly once, signals the observed operation, and cleans the context', async () => {
  const harness = await createRouteFaultHarness({ drainTimeoutMs: 30, terminalGuardTimeoutMs: 20 });
  const request = allowedRouteRequest();
  const actions = [];
  await assert.rejects(harness.observer.run(() => harness.guard({
    request: () => request,
    fetch: async options => {
      assert.deepEqual(options, { maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
      throw new Error('must be sanitized');
    },
    fulfill: async () => actions.push('fulfill'),
    abort: async reason => actions.push(`abort-${reason}`),
  })), /CONTROLLED_PREVIEW_NETWORK_FAILED:fetch:fetch-rejected/u);
  assert.deepEqual(actions, ['abort-blockedbyclient']);
  assert.equal(harness.contextClosed(), true);
});

test('ignored fetch timeout is bounded, invokes one fallback abort, and exposes no raw diagnostic', async () => {
  const harness = await createRouteFaultHarness({
    fetchGuardTimeoutMs: 15,
    terminalGuardTimeoutMs: 15,
    drainTimeoutMs: 20,
  });
  const request = allowedRouteRequest();
  const actions = [];
  const started = Date.now();
  await assert.rejects(harness.observer.run(() => harness.guard({
    request: () => request,
    fetch: async options => {
      assert.deepEqual(options, { maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
      return new Promise(() => {});
    },
    fulfill: async () => actions.push('fulfill'),
    abort: async reason => actions.push(`abort-${reason}`),
  })), error => {
    assert.equal(error.message, 'CONTROLLED_PREVIEW_NETWORK_FAILED:fetch:fetch-timeout');
    assert.equal(error.message.includes('https:'), false);
    return true;
  });
  assert.ok(Date.now() - started < 250, 'fault cleanup must remain bounded');
  assert.deepEqual(actions, ['abort-blockedbyclient']);
  assert.equal(harness.contextClosed(), true);
});

test('fulfill rejection cannot become success and falls back to exactly one abort', async () => {
  const harness = await createRouteFaultHarness({ drainTimeoutMs: 30, terminalGuardTimeoutMs: 20 });
  const request = allowedRouteRequest();
  const actions = [];
  const response = exactRouteResponse(request);
  await assert.rejects(harness.observer.run(() => harness.guard({
    request: () => request,
    fetch: async () => response,
    fulfill: async () => {
      actions.push('fulfill');
      throw new Error('must be sanitized');
    },
    abort: async reason => actions.push(`abort-${reason}`),
  })), /CONTROLLED_PREVIEW_NETWORK_FAILED:fulfill:fulfill-rejected/u);
  assert.deepEqual(actions, ['fulfill', 'abort-blockedbyclient']);
  assert.equal(harness.contextClosed(), true);
});

test('abort rejection and abort hang fail boundedly without continuing or fabricating a response', async () => {
  for (const mode of ['reject', 'hang']) {
    const harness = await createRouteFaultHarness({ terminalGuardTimeoutMs: 15, drainTimeoutMs: 20 });
    const request = allowedRouteRequest('/blocked', 'document');
    const actions = [];
    const started = Date.now();
    await assert.rejects(harness.observer.run(() => harness.guard({
      request: () => request,
      fetch: async () => { actions.push('fetch'); },
      fulfill: async () => { actions.push('fulfill'); },
      continue: async () => { actions.push('continue'); },
      abort: async () => {
        actions.push('abort');
        if (mode === 'reject') throw new Error('must be sanitized');
        return new Promise(() => {});
      },
    })), new RegExp(`CONTROLLED_PREVIEW_NETWORK_FAILED:abort:abort-${mode === 'reject' ? 'rejected' : 'timeout'}`, 'u'));
    assert.ok(Date.now() - started < 250, 'abort failure cleanup must remain bounded');
    assert.deepEqual(actions, ['abort']);
    assert.equal(harness.contextClosed(), true);
  }
});

test('a timed-out fulfill is aborted, drained during context cleanup, and never reported as success', async () => {
  let releaseFulfill;
  const fulfill = new Promise(resolve => { releaseFulfill = resolve; });
  const harness = await createRouteFaultHarness({ terminalGuardTimeoutMs: 15, drainTimeoutMs: 30 });
  const request = allowedRouteRequest();
  const actions = [];
  harness.context.close = async () => {
    actions.push('context-close');
    releaseFulfill();
  };
  await assert.rejects(harness.observer.run(() => harness.guard({
    request: () => request,
    fetch: async () => exactRouteResponse(request),
    fulfill: async () => {
      actions.push('fulfill-start');
      await fulfill;
      actions.push('fulfill-settled');
    },
    abort: async () => actions.push('abort'),
  })), /CONTROLLED_PREVIEW_NETWORK_FAILED:fulfill:fulfill-timeout/u);
  assert.deepEqual(actions, ['fulfill-start', 'abort', 'context-close', 'fulfill-settled']);
});

test('post-closure provider callback aborts once and rejects as a sanitized late callback', async () => {
  const harness = await createRouteFaultHarness({ drainTimeoutMs: 100, terminalGuardTimeoutMs: 15 });
  await harness.observer.finish();
  const actions = [];
  const providerRequest = {
    url: () => 'https://api.openai.com/v1/responses',
    method: () => 'POST',
    resourceType: () => 'fetch',
    postData: () => null,
  };
  await harness.guard({
    request: () => providerRequest,
    fetch: async () => actions.push('fetch'),
    fulfill: async () => actions.push('fulfill'),
    continue: async () => actions.push('continue'),
    abort: async () => actions.push('abort'),
  });
  assert.deepEqual(harness.observer.failure(), {
    phase: 'post-closure',
    category: 'post-closure-callback',
  });
  assert.deepEqual(actions, ['abort']);
});

test('combined fetch, abort, page-close, and context-close hangs share one bounded cleanup deadline', async () => {
  const context = new EventEmitter();
  let guard;
  const actions = [];
  const request = allowedRouteRequest();
  const page = new EventEmitter();
  page.context = () => context;
  page.isClosed = () => false;
  page.close = async () => {
    actions.push('page-close');
    return new Promise(() => {});
  };
  context.route = async (_pattern, handler) => { guard = handler; };
  context.routeWebSocket = async () => {};
  context.pages = () => [page];
  context.close = async () => {
    actions.push('context-close');
    return new Promise(() => {});
  };
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
    immutableOrigin: `https://${deploy}--avalaos-pilot.netlify.app`,
    expectedHead: head,
    expectedDeployId: deploy,
    fetchGuardTimeoutMs: 20,
    terminalGuardTimeoutMs: 20,
    drainTimeoutMs: 40,
    drainQuietMs: 1,
  });
  const started = Date.now();
  await assert.rejects(observer.run(() => guard({
    request: () => request,
    fetch: async () => new Promise(() => {}),
    fulfill: async () => actions.push('fulfill'),
    abort: async () => {
      actions.push('abort');
      return new Promise(() => {});
    },
  })), /CONTROLLED_PREVIEW_NETWORK_FAILED:fetch:fetch-timeout/u);
  assert.ok(Date.now() - started < 150, 'combined failure must use one cleanup deadline');
  assert.deepEqual(actions, ['abort', 'page-close', 'context-close']);
});

test('concurrent assertion failure still closes the context and cannot leave a route detached', async () => {
  const harness = await createRouteFaultHarness({
    fetchGuardTimeoutMs: 15,
    terminalGuardTimeoutMs: 15,
    drainTimeoutMs: 20,
  });
  const request = allowedRouteRequest();
  let routeCompletion;
  await assert.rejects(harness.observer.run(async () => {
    routeCompletion = harness.guard({
      request: () => request,
      fetch: async () => new Promise(() => {}),
      fulfill: async () => {},
      abort: async () => {},
    }).catch(error => error);
    throw new Error('synthetic assertion failure');
  }), /CONTROLLED_PREVIEW_SCENARIO_CLEANUP_FAILED/u);
  assert.equal(await routeCompletion, undefined);
  assert.equal(harness.contextClosed(), true);
});

test('local, unknown, cross-substituted, wrong-head, wrong-deploy, wrong-config, wrong-path, and foreign-source evidence reject', () => {
  const mutations = [
    [{ ...metadata, executionKind: 'local_source_fixture', evidenceKind: 'exact-head-synthetic-regression' }, expected],
    [{ ...metadata, previewEvidenceKind: 'unknown' }, expected],
    [{ ...metadata, titlePrefix: '[LOCAL-SANDBOX-REGRESSION]' }, expected],
    [{ ...metadata, exactHead: 'c'.repeat(40) }, expected],
    [{ ...metadata, deployId: 'd'.repeat(24) }, expected],
    [{ ...metadata, configPath: 'playwright.local-sandbox-regression.config.ts' }, expected],
    [{ ...metadata, ci: { branch: 'refs/heads/private' } }, expected],
    [{ ...metadata, gitCommit: { id: 'c'.repeat(40) } }, expected],
    [{ ...metadata, gitDiff: 'private patch content' }, expected],
    [{ ...metadata, workflowRuntime: null }, expected],
    [{ ...metadata, workflowRuntime: { ...metadata.workflowRuntime, runId: '12344' } }, expected],
    [{ ...metadata, workflowRuntime: { ...metadata.workflowRuntime, runAttempt: '1' } }, expected],
    [{ ...metadata, workflowRuntime: { ...metadata.workflowRuntime, workflowRef: 'owner/repository/.github/workflows/other.yml@refs/pull/264/merge' } }, expected],
    [metadata, { ...expected, artifactPath: 'output/playwright/pr264-synthetic-regression/a/sandbox/playwright-results.json' }],
    [metadata, { ...expected, headRepository: 'fork/repository' }],
    [metadata, { ...expected, prNumber: 265 }],
    [metadata, { ...expected, workflowPath: '.github/workflows/other.yml' }],
  ];
  for (const [mutatedMetadata, mutatedExpected] of mutations) {
    assert.notDeepEqual(validateControlledPreviewResultInventory({ report: report(mutatedMetadata), expected: mutatedExpected }), []);
  }
});
