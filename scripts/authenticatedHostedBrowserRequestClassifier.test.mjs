import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

import { AuthenticatedHostedBrowserActionTracker,
  createAuthenticatedHostedRequestClassifier } from './authenticatedHostedBrowserRequestClassifier.mjs';

const backendOrigin = 'https://backend.example.invalid';
const appOrigin = 'https://avalaos-pilot.example';
const attest = '/rest/v1/rpc/pr_c_controlled_human_public_attestation';
const classify = createAuthenticatedHostedRequestClassifier({ backendOrigin, appOrigin });
const input = (path, method = 'POST', headers = {}, origin = backendOrigin) => ({
  url: `${origin}${path}`, method, headers,
});

const loadNetworkInstaller = () => {
  const source = readFileSync(new URL('../tests/browser/authenticatedHostedNetwork.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, specifier => {
    assert.equal(specifier, '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs');
    return { AuthenticatedHostedBrowserActionTracker };
  });
  return exports;
};

const networkFixture = async (startAction, options = {}) => {
  const context = new EventEmitter();
  context.close = async value => context.closeHook?.(value);
  let routeHandler;
  context.route = async (_pattern, callback) => { routeHandler = callback; };
  let tail = Promise.resolve();
  const errors = []; const finishes = []; const preparations = []; const dispatches = [];
  const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin, startAction,
    ...(options.prepareAction ? { prepareAction: async value => {
      preparations.push(value);
      return options.prepareAction(value);
    } } : {}),
    finishAction: async value => { finishes.push(value); },
  });
  const lifecycle = await loadNetworkInstaller().installAuthenticatedHostedNetwork({ context, hosted: true,
    allowedOrigins: new Set([appOrigin, backendOrigin]), tracker,
    queueNetworkAction: (operation, ownedWork) => {
      const ownedSettlement = ownedWork
        ? Promise.resolve(ownedWork).then(() => undefined, () => undefined) : Promise.resolve();
      tail = tail.then(async () => { await ownedSettlement; await operation(); })
        .catch(error => { errors.push(error.message); });
    },
    onExternalRequest: () => assert.fail('unexpected external request'), onHttpRequest: () => {},
    onTrackerError: error => { errors.push(error.message); },
    dispatchAllowedRequest: async route => { dispatches.push(route); },
    ...(options.responseBodyTimeoutMs ? { responseBodyTimeoutMs: options.responseBodyTimeoutMs } : {}),
  });
  const drain = async () => {
    for (;;) {
      const snapshot = tail;
      await snapshot;
      if (snapshot === tail) return;
    }
  };
  return { context, errors, finishes, preparations, dispatches, lifecycle, route: value => routeHandler(value), drain };
};

test('response body ownership fails closed and joins context cancellation before returning', async () => {
  const { readAuthenticatedHostedResponseBody } = loadNetworkInstaller();
  let closeCalls = 0;
  const normalContext = { close: async () => { closeCalls += 1; } };
  assert.deepEqual(await readAuthenticatedHostedResponseBody(normalContext, {
    json: async () => ({ outcome: 'committed' }),
  }, 20), { outcome: 'committed' });
  assert.equal(closeCalls, 0);

  await assert.rejects(readAuthenticatedHostedResponseBody(normalContext, {
    json: async () => { throw new Error('private protocol body failure'); },
  }, 20), /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_READ_FAILED$/u);
  assert.equal(closeCalls, 0);

  await assert.rejects(readAuthenticatedHostedResponseBody(normalContext, {
    json: async () => JSON.parse('{'),
  }, 20), /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_INVALID_JSON$/u);
  assert.equal(closeCalls, 0);

  let releaseBody;
  let bodySettled = false;
  const heldBody = new Promise(resolve => { releaseBody = () => { bodySettled = true; resolve({ late: true }); }; });
  const closingContext = { close: async () => { closeCalls += 1; releaseBody(); } };
  await assert.rejects(readAuthenticatedHostedResponseBody(closingContext, { json: () => heldBody }, 10),
    /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_TIMEOUT$/u);
  assert.equal(bodySettled, true);
  assert.equal(closeCalls, 1);
});

test('Chromium durable response bodies use bounded browser memory before navigation', async () => {
  const {
    authenticatedHostedConfigureChromiumDurableResponseBodies,
    authenticatedHostedDurableResponseBodyResourceBytes,
    authenticatedHostedDurableResponseBodyTotalBytes,
  } = loadNetworkInstaller();
  const calls = [];
  const page = Object.freeze({ fixture: true });
  const context = {
    newCDPSession: async receivedPage => {
      assert.equal(receivedPage, page);
      return { send: async (method, parameters) => { calls.push({ method, parameters }); } };
    },
  };
  await authenticatedHostedConfigureChromiumDurableResponseBodies(context, page);
  assert.equal(authenticatedHostedDurableResponseBodyResourceBytes, 16 * 1024 * 1024);
  assert.equal(authenticatedHostedDurableResponseBodyTotalBytes, 64 * 1024 * 1024);
  assert.deepEqual(calls, [
    { method: 'Network.enable', parameters: undefined },
    { method: 'Network.configureDurableMessages', parameters: {
      maxTotalBufferSize: 64 * 1024 * 1024,
      maxResourceBufferSize: 16 * 1024 * 1024,
    } },
  ]);
});

test('Chromium durable response body setup fails with a fixed error code', async () => {
  const { authenticatedHostedConfigureChromiumDurableResponseBodies } = loadNetworkInstaller();
  await assert.rejects(authenticatedHostedConfigureChromiumDurableResponseBodies({
    newCDPSession: async () => { throw new Error('private protocol detail'); },
  }, {}), /^Error: AUTHENTICATED_BROWSER_DURABLE_RESPONSE_BODIES_UNAVAILABLE$/u);
});

test('response body close failure returns cleanup-incomplete without fabricating a body', async () => {
  const { readAuthenticatedHostedResponseBody } = loadNetworkInstaller();
  const never = new Promise(() => {});
  await assert.rejects(readAuthenticatedHostedResponseBody({
    close: async () => { throw new Error('private close failure'); },
  }, { json: () => never }, 5), /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_CLEANUP_INCOMPLETE$/u);
});

test('installed network acquires a business response body before serialized finish work drains', async () => {
  const network = await networkFixture(async () => ({ actionId: 'eager-action' }));
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  let pageClosed = false;
  let bodyReads = 0;
  let releaseBody;
  const body = new Promise(resolve => { releaseBody = () => resolve({ outcome: 'committed' }); });
  const response = { request: () => request, status: () => 200,
    json: () => {
      bodyReads += 1;
      if (pageClosed) return Promise.reject(new Error('page already closed'));
      return body;
    },
  };
  network.context.emit('request', request);
  await new Promise(resolve => setImmediate(resolve));
  network.context.emit('response', response);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodyReads, 1);
  let barrierSettled = false;
  const barrier = network.lifecycle.settleResponseBodies().then(() => { barrierSettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(barrierSettled, false);
  pageClosed = true;
  releaseBody();
  await barrier;
  await network.drain();
  assert.deepEqual(network.errors, []);
  assert.deepEqual(network.finishes, [{ actionId: 'eager-action', status: 200,
    responseBody: { outcome: 'committed' } }]);
});

test('prepared network work starts only after the terminal body and commits with the exact ack', async () => {
  let releasePreparation;
  const preparationGate = new Promise(resolve => { releasePreparation = resolve; });
  const preparationId = `sha256:${'a'.repeat(64)}`;
  const responseDigest = `sha256:${'b'.repeat(64)}`;
  const network = await networkFixture(async () => ({ actionId: 'prepared-action' }), {
    prepareAction: async () => { await preparationGate; return { preparationId, responseDigest }; },
  });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  let releaseBody;
  const body = new Promise(resolve => { releaseBody = resolve; });
  network.context.emit('request', request);
  await new Promise(resolve => setImmediate(resolve));
  network.context.emit('response', { request: () => request, status: () => 202, json: () => body });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(network.preparations.length, 0, 'preparation cannot start before body completion');
  releaseBody({ outcome: 'accepted' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(network.preparations, [{ actionId: 'prepared-action', status: 202,
    responseBody: { outcome: 'accepted' } }]);
  assert.deepEqual(network.finishes, []);
  releasePreparation();
  await network.lifecycle.settleResponseBodies();
  await network.drain();
  assert.deepEqual(network.errors, []);
  assert.deepEqual(network.finishes, [{ actionId: 'prepared-action', status: 202,
    preparationMode: 'server-owned', preparationId, responseDigest }]);
});

test('actor boundary owns a tracker admission before action-start accounting begins', async () => {
  let releaseHeaders;
  let headersPending = false;
  let starts = 0;
  const headers = new Promise(resolve => { releaseHeaders = () => resolve({ authorization: 'Bearer fixture.jwt.token' }); });
  const network = await networkFixture(async () => { starts += 1; return { actionId: 'admitted-action' }; });
  const request = {
    url: () => `${backendOrigin}/functions/v1/tenant-session`,
    method: () => 'POST',
    allHeaders: async () => { headersPending = true; return headers; },
    postDataJSON: () => ({}),
  };
  network.context.emit('request', request);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(headersPending, true);
  assert.equal(starts, 0);
  let boundarySettled = false;
  const boundary = loadNetworkInstaller().authenticatedLifecycleSettleActorNavigationBoundary({
    settleActionAdmissions: network.lifecycle.settleActionAdmissions,
    settleResponseBodies: network.lifecycle.settleResponseBodies,
    drainNetworkActions: network.drain,
    activeActionCount: () => 0,
    waitForNextObservation: () => new Promise(resolve => setImmediate(resolve)),
  }).then(() => { boundarySettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(boundarySettled, false);
  releaseHeaders();
  await boundary;
  assert.equal(starts, 1);
});

test('request and route observations share one owned action admission', async () => {
  let releaseStart;
  const startGate = new Promise(resolve => { releaseStart = resolve; });
  let starts = 0;
  const network = await networkFixture(async () => {
    starts += 1;
    await startGate;
    return { actionId: 'shared-admission' };
  });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', request);
  const route = network.route({ request: () => request, abort: async () => assert.fail('unexpected abort') });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(starts, 1);
  releaseStart();
  await network.lifecycle.settleActionAdmissions();
  await route;
  assert.equal(starts, 1);
  assert.equal(network.dispatches.length, 1);
});

test('a rejected pending admission prevents actor-boundary success', async () => {
  let releaseStart;
  const startGate = new Promise(resolve => { releaseStart = resolve; });
  const network = await networkFixture(async () => {
    await startGate;
    throw new Error('SESSION_TOKEN_REJECTED');
  });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', request);
  const aborts = [];
  const route = network.route({ request: () => request, abort: async reason => { aborts.push(reason); } });
  const boundary = loadNetworkInstaller().authenticatedLifecycleSettleActorNavigationBoundary({
    settleActionAdmissions: network.lifecycle.settleActionAdmissions,
    settleResponseBodies: network.lifecycle.settleResponseBodies,
    drainNetworkActions: network.drain,
    activeActionCount: () => 0,
    waitForNextObservation: () => new Promise(resolve => setImmediate(resolve)),
  });
  releaseStart();
  await assert.rejects(boundary, /SESSION_TOKEN_REJECTED/u);
  await route;
  await network.drain();
  assert.deepEqual(aborts, ['failed']);
  assert.ok(network.errors.length > 0 && network.errors.every(error => error === 'SESSION_TOKEN_REJECTED'));
});

test('an admission rejection remains owned after it settles before terminal settlement begins', async () => {
  const firstFailure = new Error('ALREADY_SETTLED_ADMISSION_REJECTED');
  const network = await networkFixture(async () => { throw firstFailure; });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', request);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(network.lifecycle.settleActionAdmissions(), error => error === firstFailure);
  await assert.rejects(network.lifecycle.settleActionAdmissions(), error => error === firstFailure);
});

test('a retained admission rejection still joins later accepted work before it is reported', async () => {
  let releaseSecond;
  let secondSettled = false;
  const secondGate = new Promise(resolve => { releaseSecond = resolve; });
  const firstFailure = new Error('RETAINED_FIRST_ADMISSION_REJECTED');
  const network = await networkFixture(async ({ route }) => {
    if (route === '/functions/v1/process-command') throw firstFailure;
    await secondGate;
    secondSettled = true;
    return { actionId: 'later-admission' };
  });
  const first = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  const second = { url: () => `${backendOrigin}/functions/v1/tenant-session`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', first);
  await new Promise(resolve => setImmediate(resolve));
  network.context.emit('request', second);
  await new Promise(resolve => setImmediate(resolve));
  let settlement = null;
  const settled = network.lifecycle.settleActionAdmissions().then(
    () => { settlement = { state: 'fulfilled' }; },
    error => { settlement = { state: 'rejected', error }; },
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settlement, null);
  assert.equal(secondSettled, false);
  releaseSecond({ actionId: 'later-admission' });
  await settled;
  assert.equal(secondSettled, true);
  assert.equal(settlement.state, 'rejected');
  assert.equal(settlement.error, firstFailure);
});

test('actor boundary joins every pending admission before reporting the first rejection', async () => {
  let rejectFirst;
  let releaseSecond;
  let secondSettled = false;
  const firstGate = new Promise((_resolve, reject) => { rejectFirst = reject; });
  const secondGate = new Promise(resolve => { releaseSecond = resolve; });
  const network = await networkFixture(async ({ route }) => {
    if (route === '/functions/v1/process-command') return firstGate;
    await secondGate;
    secondSettled = true;
    return { actionId: 'second-admission' };
  });
  const first = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  const second = { url: () => `${backendOrigin}/functions/v1/tenant-session`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', first);
  network.context.emit('request', second);
  await new Promise(resolve => setImmediate(resolve));
  let settlement = null;
  const boundary = loadNetworkInstaller().authenticatedLifecycleSettleActorNavigationBoundary({
    settleActionAdmissions: network.lifecycle.settleActionAdmissions,
    settleResponseBodies: network.lifecycle.settleResponseBodies,
    drainNetworkActions: network.drain,
    activeActionCount: () => 0,
    waitForNextObservation: () => new Promise(resolve => setImmediate(resolve)),
  }).then(
    () => { settlement = { state: 'fulfilled' }; },
    error => { settlement = { state: 'rejected', error }; },
  );
  rejectFirst(new Error('FIRST_ADMISSION_REJECTED'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settlement, null);
  assert.equal(secondSettled, false);
  releaseSecond({ actionId: 'second-admission' });
  await boundary;
  assert.equal(secondSettled, true);
  assert.equal(settlement.state, 'rejected');
  assert.match(settlement.error.message, /^FIRST_ADMISSION_REJECTED$/u);
});

test('installed network records an observed response transport failure without fabricating a body', async () => {
  const network = await networkFixture(async () => ({ actionId: 'transport-action' }));
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', request);
  await new Promise(resolve => setImmediate(resolve));
  network.context.emit('response', { request: () => request, status: () => 200,
    json: async () => { throw new Error('private browser transport failure'); } });
  network.context.emit('requestfailed', request);
  await network.lifecycle.settleResponseBodies();
  await network.drain();
  assert.deepEqual(network.errors, []);
  assert.deepEqual(network.finishes, [{ actionId: 'transport-action', status: 0,
    responseBody: { error: { code: 'BROWSER_TRANSPORT_FAILURE' } } }]);
});

test('installed network keeps an unpaired malformed response fail closed', async () => {
  const network = await networkFixture(async () => ({ actionId: 'malformed-action' }));
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', request);
  await new Promise(resolve => setImmediate(resolve));
  network.context.emit('response', { request: () => request, status: () => 200,
    json: async () => JSON.parse('{') });
  await assert.rejects(network.lifecycle.settleResponseBodies(),
    /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_INVALID_JSON$/u);
  await network.drain();
  assert.deepEqual(network.errors, ['AUTHENTICATED_BROWSER_RESPONSE_BODY_INVALID_JSON']);
  assert.deepEqual(network.finishes, []);
});

test('installed network never reclassifies malformed JSON as a paired transport failure', async () => {
  const network = await networkFixture(async () => ({ actionId: 'paired-malformed-action' }));
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', request);
  await new Promise(resolve => setImmediate(resolve));
  network.context.emit('response', { request: () => request, status: () => 200,
    json: async () => JSON.parse('{') });
  network.context.emit('requestfailed', request);
  await assert.rejects(network.lifecycle.settleResponseBodies(),
    /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_INVALID_JSON$/u);
  await network.drain();
  assert.deepEqual(network.errors, ['AUTHENTICATED_BROWSER_RESPONSE_BODY_INVALID_JSON']);
  assert.deepEqual(network.finishes, []);
});

test('response timeout remains fail closed when context cancellation emits requestfailed', async () => {
  const network = await networkFixture(async () => ({ actionId: 'timeout-action' }), {
    responseBodyTimeoutMs: 5,
  });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  let rejectBody;
  const body = new Promise((_resolve, reject) => { rejectBody = reject; });
  network.context.closeHook = async () => {
    network.context.emit('requestfailed', request);
    rejectBody(new Error('private cancelled body'));
  };
  network.context.emit('request', request);
  await new Promise(resolve => setImmediate(resolve));
  network.context.emit('response', { request: () => request, status: () => 200, json: () => body });
  await assert.rejects(network.lifecycle.settleResponseBodies(),
    /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_TIMEOUT$/u);
  await network.drain();
  assert.ok(network.errors.includes('AUTHENTICATED_BROWSER_RESPONSE_BODY_TIMEOUT'));
});

test('only the exact backend POST attestation is public', () => {
  assert.deepEqual(classify(input(attest)), { kind: 'public-attestation', route: attest });
  for (const candidate of [
    input(attest, 'GET'),
    input(`${attest}?lookalike=true`),
    input('/rest/v1/rpc/other_public_looking_rpc'),
    input(attest, 'POST', {}, appOrigin),
    input(attest, 'POST', {}, 'https://foreign.example'),
  ]) assert.notEqual(classify(candidate).kind, 'public-attestation');
  assert.equal(classify(input(attest, 'POST', {}, appOrigin)).kind, 'rejected-product-origin');
  assert.equal(classify(input('/rest/v1/rpc/other_public_looking_rpc')).kind, 'business-action');
});

test('only an exact-app-origin OPTIONS request with a supported requested method is a preflight', () => {
  const valid = input('/functions/v1/process-command', 'OPTIONS', {
    origin: appOrigin, 'access-control-request-method': 'POST',
  });
  assert.deepEqual(classify(valid), { kind: 'cors-preflight', route: '/functions/v1/process-command' });
  for (const candidate of [
    input('/functions/v1/process-command', 'OPTIONS'),
    input('/functions/v1/process-command', 'OPTIONS', { origin: 'https://foreign.example',
      'access-control-request-method': 'POST' }),
    input('/functions/v1/process-command', 'OPTIONS', { origin: appOrigin,
      'access-control-request-method': 'CONNECT' }),
    input('/other', 'OPTIONS', { origin: appOrigin, 'access-control-request-method': 'POST' }),
    input('/functions/v1/process-command', 'OPTIONS', { origin: appOrigin,
      'access-control-request-method': 'POST' }, appOrigin),
  ]) assert.notEqual(classify(candidate).kind, 'cors-preflight');
  assert.equal(classify(input('/functions/v1/process-command', 'OPTIONS', { origin: appOrigin,
    'access-control-request-method': 'POST' }, appOrigin)).kind, 'rejected-product-origin');
  assert.equal(classify(input('/functions/v1/process-command', 'OPTIONS')).kind, 'business-action');
});

test('the tracker creates and finishes actions only for authenticated business traffic', async () => {
  const starts = []; const finishes = [];
  const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
    startAction: async value => { starts.push(value); return { actionId: `action-${starts.length}` }; },
    finishAction: async value => { finishes.push(value); },
  });
  const request = (path, method, headers, body) => ({
    url: () => `${backendOrigin}${path}`, method: () => method, allHeaders: async () => headers,
    postDataJSON: () => body,
  });
  const publicRequest = request(attest, 'POST', {}, { release: 'fixture' });
  const preflight = request('/functions/v1/process-command', 'OPTIONS', {
    origin: appOrigin, 'access-control-request-method': 'POST',
  });
  assert.equal(await tracker.begin(publicRequest), null);
  assert.equal(await tracker.finish(publicRequest, 200, { ok: true }), null);
  assert.equal(await tracker.reference(preflight), null);
  assert.equal(starts.length, 0);

  const business = request('/functions/v1/process-command', 'POST', { authorization: 'Bearer fixture.jwt.token' },
    { requestId: 'fixture-request', commandType: 'process.update' });
  assert.equal(await tracker.begin(business), 'action-1');
  assert.equal(await tracker.reference(business), 'action-1');
  assert.equal(await tracker.finish(business, 403, { error: { code: 'PERMISSION_DENIED' } }), 'action-1');
  assert.equal(await tracker.finish(business, 500, {}), 'action-1');
  assert.equal(starts.length, 1);
  assert.equal(starts[0].accessToken, 'fixture.jwt.token');
  assert.deepEqual(finishes, [{ actionId: 'action-1', responseBody: { error: { code: 'PERMISSION_DENIED' } }, status: 403 }]);
});

test('prepared tracker is idempotent per request and rejects missing, failed, or mismatched preparation', async () => {
  const preparationId = `sha256:${'c'.repeat(64)}`;
  const responseDigest = `sha256:${'d'.repeat(64)}`;
  let prepares = 0; const finishes = [];
  const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
    startAction: async () => ({ actionId: 'prepared-action' }),
    prepareAction: async () => { prepares++; return { preparationId, responseDigest }; },
    finishAction: async input => finishes.push(input),
  });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  await tracker.begin(request);
  assert.deepEqual(await Promise.all([tracker.prepare(request, 200, { ok: true }),
    tracker.prepare(request, 200, { ignored: true })]), [
    { status: 200, preparationId, responseDigest }, { status: 200, preparationId, responseDigest },
  ]);
  assert.equal(prepares, 1);
  assert.equal(await tracker.finish(request, 200, { changedAfterPreparation: true }), 'prepared-action');
  assert.deepEqual(finishes, [{ actionId: 'prepared-action', status: 200,
    preparationMode: 'server-owned', preparationId, responseDigest }],
  'prepared finish uses the server-owned digest instead of a later caller body');

  const mismatchRequest = { ...request };
  const mismatch = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
    startAction: async () => ({ actionId: 'mismatch-action' }),
    prepareAction: async () => ({ preparationId, responseDigest }),
    finishAction: async () => assert.fail('status mismatch cannot finish'),
  });
  await mismatch.begin(mismatchRequest);
  await mismatch.prepare(mismatchRequest, 200, {});
  await assert.rejects(mismatch.finish(mismatchRequest, 201, {}), /ACTION_PREPARATION_MISMATCH/u);

  const missingRequest = { ...request };
  const missing = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
    startAction: async () => ({ actionId: 'missing-action' }), prepareAction: async () => assert.fail('not called'),
    finishAction: async () => assert.fail('missing preparation cannot finish'),
  });
  await missing.begin(missingRequest);
  await assert.rejects(missing.finish(missingRequest, 200, {}), /ACTION_PREPARATION_MISSING/u);

  const failedRequest = { ...request };
  const failure = new Error('PREPARATION_FAILED');
  const failed = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
    startAction: async () => ({ actionId: 'failed-action' }), prepareAction: async () => { throw failure; },
    finishAction: async () => assert.fail('failed preparation cannot finish'),
  });
  await failed.begin(failedRequest);
  await assert.rejects(failed.prepare(failedRequest, 500, {}), error => error === failure);
  await assert.rejects(failed.finish(failedRequest, 500, {}), error => error === failure);
});

test('response and explicit observers cannot create a missing business-action start', async () => {
  const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
    startAction: async () => ({ actionId: 'unexpected' }), finishAction: async () => undefined,
  });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  await assert.rejects(tracker.reference(request), /AUTHENTICATED_BROWSER_ACTION_START_MISSING/u);
  await assert.rejects(tracker.finish(request, 200, {}), /AUTHENTICATED_BROWSER_ACTION_START_MISSING/u);
});

test('installed network records a cancelled request before completion when no route callback runs', async () => {
  let releaseStart;
  const startGate = new Promise(resolve => { releaseStart = resolve; });
  let starts = 0;
  const network = await networkFixture(async () => { starts += 1; await startGate; return { actionId: 'primed-action' }; });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', request);
  network.context.emit('requestfailed', request);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(network.errors, []);
  assert.deepEqual(network.finishes, []);
  releaseStart();
  await network.drain();
  assert.equal(starts, 1);
  assert.deepEqual(network.finishes,[{ actionId: 'primed-action', status: 0,
    responseBody: { error: { code: 'BROWSER_TRANSPORT_FAILURE' } } }]);
  assert.deepEqual(network.dispatches, []);
});

test('request failure uses server-owned preparation for the exact synthetic transport terminal', async () => {
  const preparationId = `sha256:${'e'.repeat(64)}`;
  const responseDigest = `sha256:${'f'.repeat(64)}`;
  const network = await networkFixture(async () => ({ actionId: 'prepared-transport-action' }), {
    prepareAction: async () => ({ preparationId, responseDigest }),
  });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({ authorization: 'Bearer fixture.jwt.token' }), postDataJSON: () => ({}) };
  network.context.emit('request', request);
  network.context.emit('requestfailed', request);
  await network.drain();
  assert.deepEqual(network.preparations, [{ actionId: 'prepared-transport-action', status: 0,
    responseBody: { error: { code: 'BROWSER_TRANSPORT_FAILURE' } } }]);
  assert.deepEqual(network.finishes, [{ actionId: 'prepared-transport-action', status: 0,
    preparationMode: 'server-owned', preparationId, responseDigest }]);
  assert.deepEqual(network.errors, []);
  assert.deepEqual(network.dispatches, []);
});

test('installed network still aborts a rejected primed start before dispatch', async () => {
  const network = await networkFixture(async () => { throw new Error('SESSION_TOKEN_REJECTED'); });
  const request = { url: () => `${backendOrigin}/functions/v1/process-command`, method: () => 'POST',
    allHeaders: async () => ({}), postDataJSON: () => ({}) };
  const aborts = [];
  network.context.emit('request', request);
  await network.route({ request: () => request, abort: async reason => { aborts.push(reason); } });
  network.context.emit('requestfailed', request);
  await network.drain();
  assert.deepEqual(aborts, ['failed']);
  assert.ok(network.errors.length > 0 && network.errors.every(error => error === 'SESSION_TOKEN_REJECTED'));
  assert.deepEqual(network.dispatches, []);
  assert.deepEqual(network.finishes, []);
});

test('business requests with no token remain business actions and fail through the authority callback', async () => {
  const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
    startAction: async value => { assert.equal(value.accessToken, ''); throw new Error('SESSION_TOKEN_REJECTED'); },
    finishAction: async () => assert.fail('no finish after rejected action start'),
  });
  const request = { url: () => `${backendOrigin}/rest/v1/rpc/not_the_attestation`, method: () => 'POST',
    allHeaders: async () => ({}), postDataJSON: () => ({}) };
  await assert.rejects(tracker.begin(request), /SESSION_TOKEN_REJECTED/u);
});
