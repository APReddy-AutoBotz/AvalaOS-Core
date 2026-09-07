export const CONTROLLED_PREVIEW_WORKFLOW = '.github/workflows/preview-exhaustive-browser-qa.yml';
export const CONTROLLED_PREVIEW_PR = 264;
export const CONTROLLED_PREVIEW_BRANCH = 'controller/governed-delivery-monitor-pr-c-20260831';
export const CONTROLLED_PREVIEW_ORIGIN = 'https://deploy-preview-264--avalaos-pilot.netlify.app';
const SHA = /^[0-9a-f]{40}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const RUN_ATTEMPT = /^[1-9][0-9]{0,9}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export const CONTROLLED_PREVIEW_PROJECTS = Object.freeze([
  'controlled-preview-desktop-chrome',
  'controlled-preview-pixel-7',
]);

export const CONTROLLED_PREVIEW_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'sandbox-root-blocked', title: 'canonical Sandbox root blocks before backend access' }),
  Object.freeze({ id: 'sandbox-descendant-blocked', title: 'canonical Sandbox descendant is blocked and is not denied-route proof' }),
  Object.freeze({ id: 'immutable-sign-in-blocked', title: 'immutable deploy sign-in blocks before backend access' }),
  Object.freeze({ id: 'malformed-attestation-blocked', title: 'malformed attestation blocks dummy sign-in before credentials leave the browser' }),
  Object.freeze({ id: 'wrong-tip-attestation-blocked', title: 'wrong migration tip blocks dummy sign-in before credentials leave the browser' }),
  Object.freeze({ id: 'public-cta-sign-in', title: 'public access CTA routes to canonical sign-in without a Sandbox persona' }),
]);

export const CONTROLLED_PREVIEW_EVIDENCE_PROFILE = Object.freeze({
  evidenceKind: 'controlled_preview_hosted',
  executionKind: 'hosted_preview',
  titlePrefix: '[CONTROLLED-PREVIEW-HOSTED]',
  configPath: 'playwright.controlled-preview-boundary.config.ts',
  artifactPath: 'artifacts/controlled-preview-boundary/playwright-results.json',
  inventoryPath: 'artifacts/controlled-preview-boundary/result-inventory.json',
  projects: CONTROLLED_PREVIEW_PROJECTS,
  scenarios: CONTROLLED_PREVIEW_SCENARIOS,
});

export const controlledPreviewTitle = scenario =>
  `${CONTROLLED_PREVIEW_EVIDENCE_PROFILE.titlePrefix} ${scenario.id} - ${scenario.title}`;

const extractOne = (source, field, pattern) => {
  const matches = [...source.matchAll(pattern)].map(match => match[1]);
  const unique = [...new Set(matches)];
  if (unique.length !== 1) throw new Error(`CONTROLLED_PREVIEW_BINDING_${field.toUpperCase()}_AMBIGUOUS`);
  return unique[0];
};

export const extractControlledPreviewBrowserBinding = source => ({
  releaseSha: extractOne(source, 'releaseSha', /(?:^|[,{])\s*(?:releaseSha|["'`]releaseSha["'`])\s*:\s*["'`]([0-9a-f]{40})["'`]/gu),
  reviewHeadSha: extractOne(source, 'reviewHeadSha', /(?:^|[,{])\s*(?:reviewHeadSha|["'`]reviewHeadSha["'`])\s*:\s*["'`]([0-9a-f]{40})["'`]/gu),
  deployId: extractOne(source, 'deployId', /(?:^|[,{])\s*(?:deployId|["'`]deployId["'`])\s*:\s*["'`]([0-9a-f]{24})["'`]/gu),
  deployOrigin: extractOne(source, 'deployOrigin', /(?:^|[,{])\s*(?:deployOrigin|["'`]deployOrigin["'`])\s*:\s*["'`](https:\/\/deploy-preview-264--avalaos-pilot\.netlify\.app)["'`]/gu),
  exerciseDigest: extractOne(source, 'exerciseDigest', /(?:^|[,{])\s*(?:exerciseDigest|["'`]exerciseDigest["'`])\s*:\s*["'`](sha256:[0-9a-f]{64})["'`]/gu),
  targetFingerprint: extractOne(source, 'targetFingerprint', /(?:^|[,{])\s*(?:targetFingerprint|["'`]targetFingerprint["'`])\s*:\s*["'`](sha256:[0-9a-f]{64})["'`]/gu),
  publicTargetDigest: extractOne(source, 'publicTargetDigest', /(?:^|[,{])\s*(?:publicTargetDigest|["'`]publicTargetDigest["'`])\s*:\s*["'`](sha256:[0-9a-f]{64})["'`]/gu),
});

const EXPECTED_EXTERNAL_CLASSIC_SCRIPTS = new Set([
  '/npm/mermaid@10/dist/mermaid.min.js',
  '/npm/js-yaml@4.1.0/dist/js-yaml.min.js',
  '/npm/marked/marked.min.js',
]);

export const selectControlledPreviewApplicationEntries = html => {
  const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*>/gu)].map(match => {
    const attributes = match[1] ?? '';
    const typeMatch = attributes.match(/\btype=(?:"([^"]+)"|'([^']+)')/u);
    return {
      type: typeMatch?.[1] ?? typeMatch?.[2] ?? null,
      url: new URL(match[2] ?? match[3], CONTROLLED_PREVIEW_ORIGIN),
    };
  });
  const applicationEntries = [];
  for (const script of scripts) {
    if (script.type === 'module') {
      if (script.url.origin !== CONTROLLED_PREVIEW_ORIGIN
        || !/^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(script.url.pathname)) {
        throw new Error('CONTROLLED_PREVIEW_MODULE_ENTRY_REJECTED');
      }
      applicationEntries.push(script.url.href);
      continue;
    }
    if (script.url.origin === CONTROLLED_PREVIEW_ORIGIN) {
      if (script.url.pathname !== '/.netlify/scripts/cdp') throw new Error('CONTROLLED_PREVIEW_PLATFORM_SCRIPT_REJECTED');
      continue;
    }
    if (script.url.origin !== 'https://cdn.jsdelivr.net' || !EXPECTED_EXTERNAL_CLASSIC_SCRIPTS.has(script.url.pathname)) {
      throw new Error('CONTROLLED_PREVIEW_EXTERNAL_SCRIPT_REJECTED');
    }
  }
  if (applicationEntries.length !== 1) throw new Error('CONTROLLED_PREVIEW_MODULE_ENTRY_COUNT');
  return Object.freeze(applicationEntries);
};

const CONTROLLED_PREVIEW_ATTESTATION_PATH = '/rest/v1/rpc/pr_c_controlled_human_public_attestation';
const CONTROLLED_PREVIEW_PROVIDER_PATTERN = /(?:openai|groq|anthropic|gemini|provider|ai-gateway|generate|completion)/iu;
const CONTROLLED_PREVIEW_EXTERNAL_STATIC_ORIGINS = new Set([
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://aistudiocdn.com',
]);

export const createControlledPreviewNetworkCounts = () => ({
  totalRequests: 0,
  apiContextRequests: 0,
  attestationRequests: 0,
  authRequests: 0,
  tokenRequests: 0,
  credentialBearingRequests: 0,
  workspaceRequests: 0,
  providerRequests: 0,
  blockedExternalStaticRequests: 0,
  blockedPlatformStaticRequests: 0,
  closingAllowedRequests: 0,
  unexpectedRequests: 0,
  unexpectedCategories: {},
  webSockets: 0,
  popups: 0,
  serviceWorkers: 0,
});

const inspectControlledPreviewRequest = (counts, request) => {
  counts.totalRequests += 1;
  let pathname = '';
  try {
    pathname = new URL(request.url()).pathname;
  } catch {
    counts.unexpectedRequests += 1;
    counts.unexpectedCategories['invalid-url'] = (counts.unexpectedCategories['invalid-url'] ?? 0) + 1;
    return;
  }
  if (pathname === CONTROLLED_PREVIEW_ATTESTATION_PATH) counts.attestationRequests += 1;
  else if (pathname.startsWith('/auth/v1/')) {
    counts.authRequests += 1;
    if (pathname === '/auth/v1/token') counts.tokenRequests += 1;
  } else if (pathname.startsWith('/rest/v1/') || pathname.startsWith('/functions/v1/')) {
    counts.workspaceRequests += 1;
  }
  if (CONTROLLED_PREVIEW_PROVIDER_PATTERN.test(request.url())) counts.providerRequests += 1;
  const body = request.postData?.();
  if (body && /dummy\.invalid|preview-boundary-password/iu.test(body)) counts.credentialBearingRequests += 1;
};

const controlledPreviewRequestDisposition = ({ request, aliasOrigin, immutableOrigin }) => {
  let url;
  try {
    url = new URL(request.url());
  } catch {
    return Object.freeze({ action: 'abort', category: 'invalid-url' });
  }
  const method = request.method();
  const resourceType = request.resourceType();
  const allowedOrigin = url.origin === aliasOrigin || url.origin === immutableOrigin;
  const allowedDocument = resourceType === 'document'
    && (url.pathname === '/'
      || url.pathname === '/sign-in'
      || url.pathname === '/sandbox'
      || url.pathname.startsWith('/sandbox/'));
  const allowedStatic = (
    ['script', 'stylesheet', 'font'].includes(resourceType) && url.pathname.startsWith('/assets/')
  ) || (
    resourceType === 'image' && /^\/[A-Za-z0-9_./-]+\.(?:avif|ico|jpe?g|png|svg|webp)$/u.test(url.pathname)
  );
  if (allowedOrigin && (method === 'GET' || method === 'HEAD') && (allowedDocument || allowedStatic)) {
    return Object.freeze({ action: 'continue', category: 'allowed' });
  }
  if ((method === 'GET' || method === 'HEAD')
    && ['script', 'stylesheet', 'image', 'font'].includes(resourceType)
    && CONTROLLED_PREVIEW_EXTERNAL_STATIC_ORIGINS.has(url.origin)) {
    return Object.freeze({ action: 'abort-external-static', category: 'external-static' });
  }
  if (allowedOrigin && (method === 'GET' || method === 'HEAD')
    && resourceType === 'script' && url.pathname.startsWith('/.netlify/scripts/')) {
    return Object.freeze({ action: 'abort-platform-static', category: 'platform-static' });
  }
  return Object.freeze({
    action: 'abort',
    category: `${allowedOrigin ? 'first-party' : 'external'}:${resourceType}:${url.protocol}`,
  });
};

export const createControlledPreviewNetworkObserver = async ({
  page,
  aliasOrigin,
  immutableOrigin,
  expectedHead,
  expectedDeployId,
  drainTimeoutMs = 5_000,
  drainQuietMs = 25,
  fetchGuardTimeoutMs = 30_000,
  terminalGuardTimeoutMs = 5_000,
  now = Date.now,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
}) => {
  const context = page.context();
  const counts = createControlledPreviewNetworkCounts();
  let lifecycle = 'active';
  let finishStarted = false;
  let callbackGeneration = 0;
  const pendingCallbacks = new Set();
  const pendingRouteOperations = new Set();
  const routeOperationCancellers = new Set();
  let firstFailure = null;
  let resolveFailureSignal;
  const failureSignal = new Promise(resolve => { resolveFailureSignal = resolve; });
  const fixedFailure = (phase, category) => Object.freeze({ phase, category });
  const failureError = failure => {
    const error = new Error(`CONTROLLED_PREVIEW_NETWORK_FAILED:${failure.phase}:${failure.category}`);
    error.code = 'CONTROLLED_PREVIEW_NETWORK_FAILED';
    error.phase = failure.phase;
    error.category = failure.category;
    return error;
  };
  const recordFailure = (phase, category) => {
    if (firstFailure) return firstFailure;
    firstFailure = fixedFailure(phase, category);
    resolveFailureSignal(firstFailure);
    return firstFailure;
  };
  const boundedRouteOperation = async ({ operation, timeoutMs, phase, rejectedCategory, timeoutCategory }) => {
    let timer;
    let cancel;
    const started = Promise.resolve().then(operation);
    pendingRouteOperations.add(started);
    started.then(
      () => pendingRouteOperations.delete(started),
      () => pendingRouteOperations.delete(started),
    );
    const outcome = await Promise.race([
      started.then(
        value => ({ kind: 'settled', value }),
        () => ({ kind: 'rejected' }),
      ),
      new Promise(resolve => {
        timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
        cancel = () => {
          clearTimeout(timer);
          resolve({ kind: 'cancelled' });
        };
        routeOperationCancellers.add(cancel);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (cancel) routeOperationCancellers.delete(cancel);
    if (outcome.kind === 'settled') return outcome.value;
    const category = outcome.kind === 'timeout'
      ? timeoutCategory
      : outcome.kind === 'cancelled'
        ? 'late-callback'
        : rejectedCategory;
    throw failureError(recordFailure(phase, category));
  };
  const cancelPendingRouteOperations = () => {
    for (const cancel of [...routeOperationCancellers]) cancel();
  };
  const abortRoute = async route => boundedRouteOperation({
    operation: () => route.abort('blockedbyclient'),
    timeoutMs: terminalGuardTimeoutMs,
    phase: 'abort',
    rejectedCategory: 'abort-rejected',
    timeoutCategory: 'abort-timeout',
  });
  const abortAfterFailure = async route => {
    try {
      await abortRoute(route);
    } catch {
      // The first sanitized failure remains authoritative. Context disposal is
      // the bounded last resort when Playwright cannot settle the route.
    }
  };
  const trackCallback = (kind, callback) => {
    callbackGeneration += 1;
    let invoked;
    try {
      invoked = Promise.resolve(callback());
    } catch {
      invoked = Promise.reject(new Error('callback-rejected'));
    }
    const pending = invoked.catch(() => {
      throw failureError(recordFailure(kind, 'callback-rejected'));
    });
    pendingCallbacks.add(pending);
    pending.then(
      () => pendingCallbacks.delete(pending),
      () => {
        recordFailure(kind, 'callback-rejected');
        pendingCallbacks.delete(pending);
      },
    );
    // Playwright 1.61 reports a rejected RouteHandler promise as an unhandled
    // framework error. The guard itself owns terminal action or bounded cleanup;
    // the observer's failure signal and finish() remain the test authority.
    return pending.catch(() => undefined);
  };
  const drainCallbacks = async (code, deadline) => {
    while (now() < deadline) {
      if (pendingCallbacks.size > 0) {
        await sleep(Math.min(drainQuietMs, Math.max(1, deadline - now())));
        continue;
      }
      const observedGeneration = callbackGeneration;
      await sleep(Math.min(drainQuietMs, Math.max(1, deadline - now())));
      if (pendingCallbacks.size === 0 && callbackGeneration === observedGeneration) return;
    }
    throw new Error(code);
  };
  const settleCleanupBounded = async (operation, categoryPrefix, deadline) => boundedRouteOperation({
    operation,
    timeoutMs: Math.max(1, deadline - now()),
    phase: 'cleanup',
    rejectedCategory: `${categoryPrefix}-rejected`,
    timeoutCategory: `${categoryPrefix}-timeout`,
  });
  const inspect = request => inspectControlledPreviewRequest(counts, request);
  const inspectPopup = openedPage => {
    if (openedPage === page) return;
    counts.popups += 1;
  };
  const inspectServiceWorker = () => {
    counts.serviceWorkers += 1;
  };
  context.on('request', inspect);
  context.on('page', inspectPopup);
  context.on('serviceworker', inspectServiceWorker);
  const guard = async route => {
    if (lifecycle === 'finished') {
      recordFailure('post-closure', 'post-closure-callback');
      await abortAfterFailure(route);
      throw failureError(firstFailure);
    }
    const disposition = controlledPreviewRequestDisposition({
      request: route.request(),
      aliasOrigin,
      immutableOrigin,
    });
    if (disposition.action === 'continue') {
      if (lifecycle !== 'active') {
        counts.closingAllowedRequests += 1;
        await abortRoute(route);
        return;
      }
      const requestUrl = route.request().url();
      let response;
      try {
        response = await boundedRouteOperation({
          operation: () => route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 }),
          timeoutMs: fetchGuardTimeoutMs,
          phase: 'fetch',
          rejectedCategory: 'fetch-rejected',
          timeoutCategory: 'fetch-timeout',
        });
      } catch {
        await abortAfterFailure(route);
        throw failureError(firstFailure);
      }
      if (lifecycle !== 'active') {
        counts.closingAllowedRequests += 1;
        await abortRoute(route);
        return;
      }
      let responseUrl;
      let responseStatus;
      let headers;
      try {
        responseUrl = response.url();
        responseStatus = response.status();
        headers = response.headers();
      } catch {
        recordFailure('response-identity', 'response-inspection');
        await abortAfterFailure(route);
        throw failureError(firstFailure);
      }
      if (responseUrl !== requestUrl || responseStatus < 200 || responseStatus >= 300) {
        counts.unexpectedRequests += 1;
        const category = responseUrl !== requestUrl ? 'redirect-final-url' : 'response-status';
        counts.unexpectedCategories[category] = (counts.unexpectedCategories[category] ?? 0) + 1;
        recordFailure('response-identity', 'response-identity');
        await abortAfterFailure(route);
        throw failureError(firstFailure);
      }
      if (headers['x-avalaos-release'] !== expectedHead
        || headers['x-avalaos-netlify-deploy-id'] !== expectedDeployId
        || headers['x-avalaos-environment'] !== 'hosted_nonproduction_pilot') {
        counts.unexpectedRequests += 1;
        counts.unexpectedCategories['response-identity'] = (counts.unexpectedCategories['response-identity'] ?? 0) + 1;
        recordFailure('response-identity', 'response-identity');
        await abortAfterFailure(route);
        throw failureError(firstFailure);
      }
      try {
        await boundedRouteOperation({
          operation: () => route.fulfill({ response }),
          timeoutMs: terminalGuardTimeoutMs,
          phase: 'fulfill',
          rejectedCategory: 'fulfill-rejected',
          timeoutCategory: 'fulfill-timeout',
        });
      } catch {
        await abortAfterFailure(route);
        throw failureError(firstFailure);
      }
      return;
    }
    if (disposition.action === 'abort-external-static') counts.blockedExternalStaticRequests += 1;
    else if (disposition.action === 'abort-platform-static') counts.blockedPlatformStaticRequests += 1;
    else {
      counts.unexpectedRequests += 1;
      counts.unexpectedCategories[disposition.category] = (counts.unexpectedCategories[disposition.category] ?? 0) + 1;
    }
    await abortRoute(route);
  };
  await context.route('**/*', route => trackCallback('http-route', () => guard(route)));
  await context.routeWebSocket(/.*/u, socket => trackCallback('websocket-route', async () => {
    counts.webSockets += 1;
    await socket.close({ code: 1008, reason: 'controlled-preview-boundary' });
  }));

  const accountApiContextRequest = requestUrl => {
    if (lifecycle !== 'active') throw new Error('CONTROLLED_PREVIEW_API_REQUEST_OUTSIDE_OBSERVER');
    const url = new URL(requestUrl);
    if (url.origin !== aliasOrigin
      || (url.pathname !== '/sign-in' && !/^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(url.pathname))
      || url.search || url.hash) {
      throw new Error('CONTROLLED_PREVIEW_API_REQUEST_TARGET_REJECTED');
    }
    counts.apiContextRequests += 1;
    inspectControlledPreviewRequest(counts, {
      url: () => url.href,
      postData: () => null,
    });
  };

  const finish = async () => {
    if (finishStarted || lifecycle !== 'active') throw new Error('CONTROLLED_PREVIEW_OBSERVER_ALREADY_FINISHED');
    finishStarted = true;
    const cleanupDeadline = now() + drainTimeoutMs;
    let terminalFailure = null;
    const captureFailure = async (operation, category = null) => {
      try {
        await operation();
      } catch (error) {
        terminalFailure ??= error instanceof Error ? error.message : 'CONTROLLED_PREVIEW_OBSERVER_FINISH_FAILED';
        if (category) recordFailure('cleanup', category);
      }
    };
    const closeOwnedPage = async ownedPage => {
      if (ownedPage.isClosed()) return;
      let closeObserved = false;
      let resolveClose;
      const closed = new Promise(resolve => { resolveClose = resolve; });
      const onClose = () => {
        closeObserved = true;
        resolveClose();
      };
      ownedPage.once('close', onClose);
      await ownedPage.close({ runBeforeUnload: true });
      if (!ownedPage.isClosed()) await closed;
      if (!closeObserved) ownedPage.off('close', onClose);
    };
    if (!firstFailure) await captureFailure(
      () => drainCallbacks('CONTROLLED_PREVIEW_CALLBACK_ACTIVE_DRAIN_TIMEOUT', cleanupDeadline),
      'active-drain-timeout',
    );
    lifecycle = 'closing';
    if (!firstFailure) await captureFailure(
      () => drainCallbacks('CONTROLLED_PREVIEW_CALLBACK_PRE_CLOSE_DRAIN_TIMEOUT', cleanupDeadline),
      'pre-close-drain-timeout',
    );
    await captureFailure(() => settleCleanupBounded(
      () => Promise.all(context.pages()
        .filter(ownedPage => !ownedPage.isClosed())
        .map(closeOwnedPage)),
      'page-close',
      cleanupDeadline,
    ));
    await captureFailure(() => drainCallbacks('CONTROLLED_PREVIEW_CALLBACK_POST_PAGE_DRAIN_TIMEOUT', cleanupDeadline));
    await captureFailure(() => settleCleanupBounded(
      () => context.close(),
      'context-close',
      cleanupDeadline,
    ));
    if (pendingRouteOperations.size > 0) recordFailure('cleanup', 'late-callback');
    cancelPendingRouteOperations();
    await captureFailure(() => drainCallbacks('CONTROLLED_PREVIEW_CALLBACK_POST_CONTEXT_DRAIN_TIMEOUT', cleanupDeadline));
    lifecycle = 'finished';
    cancelPendingRouteOperations();
    if (firstFailure) throw failureError(firstFailure);
    if (terminalFailure) throw new Error(terminalFailure);
    return Object.freeze({
      ...counts,
      unexpectedCategories: Object.freeze({ ...counts.unexpectedCategories }),
    });
  };

  const run = async operation => {
    if (typeof operation !== 'function') throw new Error('CONTROLLED_PREVIEW_OBSERVER_OPERATION_REQUIRED');
    const started = Promise.resolve().then(operation);
    const operationOutcome = started.then(
      value => ({ kind: 'success', value }),
      error => ({ kind: 'operation-failure', error }),
    );
    const networkOutcome = failureSignal.then(failure => ({ kind: 'network-failure', error: failureError(failure) }));
    const outcome = await Promise.race([operationOutcome, networkOutcome]);
    let countsResult;
    let cleanupError = null;
    try {
      countsResult = await finish();
    } catch (error) {
      cleanupError = error;
    }
    if (outcome.kind === 'network-failure') {
      let timer;
      const postCleanupOutcome = await Promise.race([
        operationOutcome,
        new Promise(resolve => {
          timer = setTimeout(() => resolve({ kind: 'post-cleanup-timeout' }), terminalGuardTimeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (postCleanupOutcome.kind === 'post-cleanup-timeout') {
        recordFailure('cleanup', 'observed-operation-timeout');
      }
    }
    if (outcome.kind === 'success' && cleanupError) throw cleanupError;
    if (outcome.kind === 'network-failure') throw outcome.error;
    if (cleanupError) throw new Error('CONTROLLED_PREVIEW_SCENARIO_CLEANUP_FAILED');
    if (outcome.kind === 'operation-failure') throw outcome.error;
    return Object.freeze({ value: outcome.value, counts: countsResult });
  };

  const failure = () => firstFailure;

  return Object.freeze({ accountApiContextRequest, failure, finish, run });
};

const validateControlledPreviewBindingResourceUrl = value => {
  const url = new URL(value);
  if (url.origin !== CONTROLLED_PREVIEW_ORIGIN
    || (url.pathname !== '/sign-in' && !/^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(url.pathname))
    || url.search || url.hash) {
    throw new Error('CONTROLLED_PREVIEW_BINDING_RESOURCE_URL_REJECTED');
  }
  return url.href;
};

export const fetchControlledPreviewBindingResource = async ({
  request,
  url,
  expectedHead,
  expectedDeployId,
  accountApiContextRequest,
}) => {
  const expectedUrl = validateControlledPreviewBindingResourceUrl(url);
  accountApiContextRequest(expectedUrl);
  const response = await request.get(expectedUrl, { maxRedirects: 0, failOnStatusCode: false });
  if (response.url() !== expectedUrl) throw new Error('CONTROLLED_PREVIEW_BINDING_FINAL_URL_REJECTED');
  if (!response.ok()) throw new Error('CONTROLLED_PREVIEW_BINDING_RESPONSE_REJECTED');
  const headers = response.headers();
  if (headers['x-avalaos-release'] !== expectedHead
    || headers['x-avalaos-netlify-deploy-id'] !== expectedDeployId
    || headers['x-avalaos-environment'] !== 'hosted_nonproduction_pilot') {
    throw new Error('CONTROLLED_PREVIEW_BINDING_RESPONSE_IDENTITY_REJECTED');
  }
  return response.text();
};

export const loadControlledPreviewBrowserBinding = async ({
  request,
  expectedHead,
  expectedDeployId,
  accountApiContextRequest,
}) => {
  const entryUrl = `${CONTROLLED_PREVIEW_ORIGIN}/sign-in`;
  const html = await fetchControlledPreviewBindingResource({
    request,
    url: entryUrl,
    expectedHead,
    expectedDeployId,
    accountApiContextRequest,
  });
  const pending = selectControlledPreviewApplicationEntries(html).map(value => new URL(value));
  const visited = new Set();
  const sources = [];
  let totalBytes = 0;
  while (pending.length > 0) {
    const current = pending.shift();
    if (visited.has(current.href)) continue;
    visited.add(current.href);
    if (visited.size > 96) throw new Error('CONTROLLED_PREVIEW_BINDING_SOURCE_COUNT');
    const text = await fetchControlledPreviewBindingResource({
      request,
      url: current.href,
      expectedHead,
      expectedDeployId,
      accountApiContextRequest,
    });
    totalBytes += Buffer.byteLength(text, 'utf8');
    if (totalBytes > 8_000_000) throw new Error('CONTROLLED_PREVIEW_BINDING_SOURCE_BYTES');
    sources.push(text);
    for (const match of text.matchAll(/["'`]((?:\.\/|\/assets\/)[A-Za-z0-9._-]+\.js)["'`]/gu)) {
      const child = new URL(match[1], current);
      validateControlledPreviewBindingResourceUrl(child.href);
      if (!visited.has(child.href)) pending.push(child);
    }
  }
  return extractControlledPreviewBrowserBinding(sources.join('\n'));
};

export const classifyControlledPreviewWorkflowSelection = ({
  prNumber,
  headRef,
  headRepository,
  repository,
}) => {
  const normalizedPrNumber = String(prNumber ?? '');
  const targetedByNumber = normalizedPrNumber === String(CONTROLLED_PREVIEW_PR);
  const targetedByBranch = headRef === CONTROLLED_PREVIEW_BRANCH;
  if (!targetedByNumber && !targetedByBranch) return 'not_selected';
  if (
    targetedByNumber
    && targetedByBranch
    && typeof repository === 'string'
    && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)
    && headRepository === repository
  ) {
    return 'selected';
  }
  throw new Error('CONTROLLED_PREVIEW_PARTIAL_IDENTITY_REJECTED');
};

export const decodeControlledPreviewGitHubRuntime = (environment, eventPayload) => {
  if (environment.GITHUB_ACTIONS !== 'true') return null;
  const repository = environment.GITHUB_REPOSITORY;
  const workflowRef = environment.GITHUB_WORKFLOW_REF;
  const runtime = {
    authority: 'github-actions',
    workflowPath: CONTROLLED_PREVIEW_WORKFLOW,
    workflowRef,
    repository,
    eventName: environment.GITHUB_EVENT_NAME,
    runId: environment.GITHUB_RUN_ID,
    runAttempt: environment.GITHUB_RUN_ATTEMPT,
    workflowSha: environment.GITHUB_SHA,
    prNumber: eventPayload?.pull_request?.number ?? eventPayload?.number,
    headRef: eventPayload?.pull_request?.head?.ref,
    headRepository: eventPayload?.pull_request?.head?.repo?.full_name,
    releaseSha: eventPayload?.pull_request?.head?.sha,
  };
  if (!REPOSITORY.test(repository ?? '')
    || runtime.eventName !== 'pull_request'
    || !RUN_ID.test(runtime.runId ?? '')
    || !RUN_ATTEMPT.test(runtime.runAttempt ?? '')
    || !SHA.test(runtime.workflowSha ?? '')
    || !SHA.test(runtime.releaseSha ?? '')
    || runtime.prNumber !== CONTROLLED_PREVIEW_PR
    || runtime.headRef !== CONTROLLED_PREVIEW_BRANCH
    || runtime.headRepository !== repository
    || typeof workflowRef !== 'string'
    || !workflowRef.startsWith(`${repository}/${CONTROLLED_PREVIEW_WORKFLOW}@refs/`)) {
    throw new Error('CONTROLLED_PREVIEW_GITHUB_RUNTIME_REJECTED');
  }
  return Object.freeze(runtime);
};
