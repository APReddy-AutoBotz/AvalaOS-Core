import assert from 'node:assert/strict';
import { handleOptions } from './http';
import { trustAssuranceCommandResponse, trustAssuranceQueryResponse } from './trustAssuranceHttp';

const cors = {
  origin: '*',
  headers: 'authorization, x-client-info, apikey, content-type',
  methods: 'POST, OPTIONS',
};

const assertCors = (response: Response, status: number, cacheControl: string, vary: string | null) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('access-control-allow-origin'), cors.origin);
  assert.equal(response.headers.get('access-control-allow-headers'), cors.headers);
  assert.equal(response.headers.get('access-control-allow-methods'), cors.methods);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('cache-control'), cacheControl);
  assert.equal(response.headers.get('vary'), vary);
};

for (const status of [200, 400, 403, 404, 409, 503]) {
  assertCors(trustAssuranceCommandResponse({ ok: status === 200 }, status), status, 'no-store', null);
  assertCors(trustAssuranceQueryResponse({ ok: status === 200 }, status), status, 'private, no-store', 'authorization');
}

const options = handleOptions(new Request('https://fixture.invalid', { method: 'OPTIONS' }));
assert.ok(options);
assert.equal(options.headers.get('access-control-allow-origin'), cors.origin);
assert.equal(options.headers.get('access-control-allow-headers'), cors.headers);
assert.equal(options.headers.get('access-control-allow-methods'), cors.methods);
console.log('Trust Assurance actual-response CORS tests passed');
