import assert from 'node:assert/strict';
import {
  LEGACY_DELIVERY_MAX_BODY_BYTES,
  LegacyDeliveryBodyError,
  handleLegacyDeliveryOptions,
  legacyDeliveryError,
  readBoundedLegacyDeliveryJson,
} from './legacyDeliveryHttp';

const main = async () => {
  const parsed = await readBoundedLegacyDeliveryJson(new Request('https://example.test', { method: 'POST', body: '{"ok":true}' }));
  assert.deepEqual(parsed, { ok: true });
  await assert.rejects(readBoundedLegacyDeliveryJson(new Request('https://example.test', {
    method: 'POST', headers: { 'Content-Length': String(LEGACY_DELIVERY_MAX_BODY_BYTES + 1) }, body: '{}',
  })), LegacyDeliveryBodyError);
  await assert.rejects(readBoundedLegacyDeliveryJson(new Request('https://example.test', {
    method: 'POST', body: new Uint8Array([0xff, 0xfe]),
  })), LegacyDeliveryBodyError);
  await assert.rejects(readBoundedLegacyDeliveryJson(new Request('https://example.test', {
    method: 'POST', body: `{"body":"${'x'.repeat(LEGACY_DELIVERY_MAX_BODY_BYTES)}"}`,
  })), LegacyDeliveryBodyError);

  const options = handleLegacyDeliveryOptions(new Request('https://example.test', { method: 'OPTIONS' }));
  assert.equal(options?.status, 200);
  assert.equal(options?.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.match(options?.headers.get('Access-Control-Allow-Headers') ?? '', /x-retry-count/u);
  const error = legacyDeliveryError('RESOURCE_UNAVAILABLE', 404);
  assert.equal(error.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await error.json(), { ok: false, error: { code: 'RESOURCE_UNAVAILABLE', message: 'The requested resource is unavailable.' } });
  console.log('legacy delivery HTTP boundary: bounded UTF-8 JSON, CORS and minimized no-store errors passed');
};

main().catch(error => { console.error(error); process.exitCode = 1; });
