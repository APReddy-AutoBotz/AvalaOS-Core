import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthenticatedHostedBrowserActionTracker,
  createAuthenticatedHostedRequestClassifier } from './authenticatedHostedBrowserRequestClassifier.mjs';

const backendOrigin = 'https://backend.example.invalid';
const appOrigin = 'https://avalaos-pilot.example';
const attest = '/rest/v1/rpc/pr_c_controlled_human_public_attestation';
const classify = createAuthenticatedHostedRequestClassifier({ backendOrigin, appOrigin });
const input = (path, method = 'POST', headers = {}, origin = backendOrigin) => ({
  url: `${origin}${path}`, method, headers,
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

test('business requests with no token remain business actions and fail through the authority callback', async () => {
  const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
    startAction: async value => { assert.equal(value.accessToken, ''); throw new Error('SESSION_TOKEN_REJECTED'); },
    finishAction: async () => assert.fail('no finish after rejected action start'),
  });
  const request = { url: () => `${backendOrigin}/rest/v1/rpc/not_the_attestation`, method: () => 'POST',
    allHeaders: async () => ({}), postDataJSON: () => ({}) };
  await assert.rejects(tracker.begin(request), /SESSION_TOKEN_REJECTED/u);
});
