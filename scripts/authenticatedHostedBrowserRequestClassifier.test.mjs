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

const networkFixture = async startAction => {
  const context = new EventEmitter();
  let routeHandler;
  context.route = async (_pattern, callback) => { routeHandler = callback; };
  let tail = Promise.resolve();
  const errors = []; const finishes = []; const dispatches = [];
  const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin, startAction,
    finishAction: async value => { finishes.push(value); },
  });
  await loadNetworkInstaller().installAuthenticatedHostedNetwork({ context, hosted: true,
    allowedOrigins: new Set([appOrigin, backendOrigin]), tracker,
    queueNetworkAction: operation => { tail = tail.then(operation).catch(error => { errors.push(error.message); }); },
    onExternalRequest: () => assert.fail('unexpected external request'), onHttpRequest: () => {},
    onTrackerError: error => { errors.push(error.message); },
    dispatchAllowedRequest: async route => { dispatches.push(route); },
  });
  return { context, errors, finishes, dispatches, route: value => routeHandler(value), drain: () => tail };
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
    json: async () => { throw new Error('private malformed body'); },
  }, 20), /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_READ_FAILED$/u);
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

test('response body close failure returns cleanup-incomplete without fabricating a body', async () => {
  const { readAuthenticatedHostedResponseBody } = loadNetworkInstaller();
  const never = new Promise(() => {});
  await assert.rejects(readAuthenticatedHostedResponseBody({
    close: async () => { throw new Error('private close failure'); },
  }, { json: () => never }, 5), /^Error: AUTHENTICATED_BROWSER_RESPONSE_BODY_CLEANUP_INCOMPLETE$/u);
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
