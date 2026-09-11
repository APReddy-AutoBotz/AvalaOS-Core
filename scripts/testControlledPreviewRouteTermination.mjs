import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium, devices } from '@playwright/test';
import { createControlledPreviewNetworkObserver } from './previewBrowserEvidenceContract.mjs';

const EXPECTED_HEAD = 'a'.repeat(40);
const EXPECTED_DEPLOY = 'b'.repeat(24);
const FETCH_OPTIONS = Object.freeze({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
const PROFILES = Object.freeze([
  Object.freeze({ id: 'desktop-chrome', context: {} }),
  Object.freeze({ id: 'pixel-7', context: devices['Pixel 7'] }),
]);
const FAULTS = Object.freeze([
  Object.freeze({ id: 'native-fetch-reset', phase: 'fetch', category: 'fetch-rejected', path: '/sandbox/reset' }),
  Object.freeze({ id: 'fetch-rejected', phase: 'fetch', category: 'fetch-rejected', path: '/sign-in' }),
  Object.freeze({ id: 'fetch-timeout', phase: 'fetch', category: 'fetch-timeout', path: '/sign-in' }),
  Object.freeze({ id: 'response-identity', phase: 'response-identity', category: 'response-identity', path: '/sign-in' }),
  Object.freeze({ id: 'fulfill-rejected', phase: 'fulfill', category: 'fulfill-rejected', path: '/sign-in' }),
  Object.freeze({ id: 'abort-rejected', phase: 'abort', category: 'abort-rejected', path: '/blocked' }),
  Object.freeze({ id: 'abort-timeout', phase: 'abort', category: 'abort-timeout', path: '/blocked' }),
]);

const createLoopbackServer = async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    if (request.url === '/sandbox/reset') {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'x-avalaos-release': EXPECTED_HEAD,
      'x-avalaos-netlify-deploy-id': EXPECTED_DEPLOY,
      'x-avalaos-environment': 'hosted_nonproduction_pilot',
    });
    response.end('<!doctype html><html><body>synthetic loopback</body></html>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('CONTROLLED_PREVIEW_LOOPBACK_BIND_FAILED');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requestCount: () => requests,
    close: () => new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve()))),
  };
};

const exactFetchOptions = options => {
  assert.deepEqual(options, FETCH_OPTIONS);
};

const injectRouteFault = (route, fault, counters) => new Proxy(route, {
  get(target, property) {
    if (property === 'fetch') {
      return async options => {
        counters.fetch += 1;
        exactFetchOptions(options);
        if (fault.id === 'fetch-rejected') throw new Error('synthetic rejected fetch');
        if (fault.id === 'fetch-timeout') return new Promise(() => {});
        const response = await target.fetch(options);
        if (fault.id !== 'response-identity') return response;
        return new Proxy(response, {
          get(responseTarget, responseProperty) {
            if (responseProperty === 'headers') {
              return () => ({
                ...responseTarget.headers(),
                'x-avalaos-release': 'f'.repeat(40),
              });
            }
            const value = Reflect.get(responseTarget, responseProperty, responseTarget);
            return typeof value === 'function' ? value.bind(responseTarget) : value;
          },
        });
      };
    }
    if (property === 'fulfill') {
      return async options => {
        counters.fulfill += 1;
        if (fault.id === 'fulfill-rejected') throw new Error('synthetic rejected fulfill');
        return target.fulfill(options);
      };
    }
    if (property === 'abort') {
      return async reason => {
        counters.abort += 1;
        if (fault.id === 'abort-rejected') throw new Error('synthetic rejected abort');
        if (fault.id === 'abort-timeout') return new Promise(() => {});
        return target.abort(reason);
      };
    }
    if (property === 'continue') {
      return async options => {
        counters.continue += 1;
        return target.continue(options);
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

const runFaultCase = async ({ browser, loopback, profile, fault }) => {
  const context = await browser.newContext(profile.context);
  const origin = loopback.origin;
  const nativeRoute = context.route.bind(context);
  const counters = { fetch: 0, fulfill: 0, abort: 0, continue: 0 };
  let externalRequests = 0;
  let contextClosed = false;
  context.once('close', () => { contextClosed = true; });
  context.on('request', request => {
    try {
      if (new URL(request.url()).origin !== origin) externalRequests += 1;
    } catch {
      externalRequests += 1;
    }
  });
  context.route = async (matcher, handler, options) => nativeRoute(
    matcher,
    route => handler(injectRouteFault(route, fault, counters)),
    options,
  );
  const page = await context.newPage();
  const observer = await createControlledPreviewNetworkObserver({
    page,
    aliasOrigin: origin,
    immutableOrigin: origin,
    expectedHead: EXPECTED_HEAD,
    expectedDeployId: EXPECTED_DEPLOY,
    fetchGuardTimeoutMs: 100,
    terminalGuardTimeoutMs: 100,
    drainTimeoutMs: 150,
    drainQuietMs: 5,
  });
  const expectedMessage = `CONTROLLED_PREVIEW_NETWORK_FAILED:${fault.phase}:${fault.category}`;
  const startedAt = Date.now();
  const requestsBefore = loopback.requestCount();
  let caseError = null;
  let navigationSettled = false;
  const navigation = page.goto(`${origin}${fault.path}`, { waitUntil: 'domcontentloaded' }).finally(() => {
    navigationSettled = true;
  });
  try {
    await assert.rejects(
      observer.run(() => navigation),
      error => {
        assert.equal(error.message, expectedMessage);
        assert.equal(error.message.includes(origin), false);
        return true;
      },
    );
  } catch (error) {
    caseError = error;
  }
  let cleanupError = null;
  if (!contextClosed) {
    try {
      await context.close();
    } catch {
      cleanupError = new Error('CONTROLLED_PREVIEW_ROUTE_CONTEXT_CLEANUP_FAILED');
    }
  }
  if (cleanupError) throw cleanupError;
  if (caseError) throw caseError;
  assert.equal(navigationSettled, true, 'navigation must settle before the gate returns');
  assert.ok(Date.now() - startedAt < 2_000, 'route failure and cleanup must be bounded');
  assert.equal(counters.continue, 0, 'no request may bypass inspection');
  assert.equal(externalRequests, 0, 'the loopback regression must make no external request');
  if (fault.path === '/sign-in') assert.equal(counters.fetch, 1, 'allowed request must fetch exactly once');
  else if (fault.id === 'native-fetch-reset') assert.equal(counters.fetch, 1, 'native reset must exercise one Route.fetch');
  else assert.equal(counters.fetch, 0, 'blocked request must not fetch');
  if (fault.id === 'fulfill-rejected') assert.equal(counters.fulfill, 1);
  else assert.equal(counters.fulfill, 0);
  assert.equal(counters.abort, 1, 'failed request must receive exactly one abort attempt');
  const serverRequests = loopback.requestCount() - requestsBefore;
  if (fault.id === 'native-fetch-reset' || ['response-identity', 'fulfill-rejected'].includes(fault.id)) {
    assert.equal(serverRequests, 1, 'native transport must perform exactly one HTTP request');
  } else {
    assert.equal(serverRequests, 0, 'injected pre-transport failures must not reach the server');
  }
  return Object.freeze({ externalRequests, serverRequests });
};

const loopback = await createLoopbackServer();
let browser;
let passed = 0;
let externalRequests = 0;
let serverRequests = 0;
let unhandledFrameworkErrors = 0;
let activeCase = 'browser-launch';
const onUnhandledRejection = () => { unhandledFrameworkErrors += 1; };
process.on('unhandledRejection', onUnhandledRejection);
let gateError = null;
try {
  browser = await chromium.launch({ headless: true });
  for (const profile of PROFILES) {
    for (const fault of FAULTS) {
      activeCase = `${profile.id}:${fault.id}`;
      const result = await runFaultCase({ browser, loopback, profile, fault });
      externalRequests += result.externalRequests;
      serverRequests += result.serverRequests;
      passed += 1;
    }
  }
} catch {
  gateError = new Error(`CONTROLLED_PREVIEW_ROUTE_TERMINATION_REGRESSION_FAILED:${activeCase}`);
} finally {
  try {
    if (browser) await browser.close();
  } catch {
    gateError = new Error('CONTROLLED_PREVIEW_ROUTE_BROWSER_CLEANUP_FAILED');
  }
  try {
    await loopback.close();
  } catch {
    gateError = new Error('CONTROLLED_PREVIEW_ROUTE_SERVER_CLEANUP_FAILED');
  }
  process.off('unhandledRejection', onUnhandledRejection);
}
if (gateError) throw gateError;
assert.equal(unhandledFrameworkErrors, 0, 'RouteHandler rejection must be owned by Playwright');
assert.equal(externalRequests, 0, 'only the synthetic loopback server is authorized');

console.log(JSON.stringify({
  contract: 'controlled-preview-route-termination-loopback-v1',
  profiles: PROFILES.length,
  faultsPerProfile: FAULTS.length,
  passed,
  failed: PROFILES.length * FAULTS.length - passed,
  serverRequests,
  externalRequests,
  unhandledFrameworkErrors,
}));
