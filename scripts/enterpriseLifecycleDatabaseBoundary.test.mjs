import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import {
  readEnterpriseLifecycleRequestBody,
  validateEnterpriseLifecycleDatabaseUrl,
} from './enterpriseLifecyclePostgresFixture.mjs';

test('disposable database runner rejects remote targets and connection overrides before connecting', () => {
  for (const value of [
    'postgresql://fixture:fixture@database.example.invalid/postgres',
    'postgresql://fixture:fixture@localhost/postgres',
    'postgresql://fixture:fixture@127.0.0.1/postgres?host=database.example.invalid',
    'postgresql://fixture:fixture@127.0.0.1/postgres?options=-csearch_path=other',
    'postgresql://fixture:fixture@127.0.0.1/postgres#override',
    'postgresql://fixture:fixture@127.0.0.1/customer_database',
    'https://127.0.0.1/postgres',
    'invalid',
  ]) {
    assert.throws(() => validateEnterpriseLifecycleDatabaseUrl(value), /ENTERPRISE_LIFECYCLE_DATABASE_URL_REJECTED/u);
  }
});

test('disposable database runner accepts only explicit loopback with the declared local or CI admin database', () => {
  for (const value of [
    'postgresql://fixture:fixture@127.0.0.1:55471/postgres',
    'postgres://fixture:fixture@127.0.0.1:5432/avalaos_pilot_synthetic',
    'postgresql://fixture:fixture@[::1]:55471/postgres',
  ]) assert.equal(validateEnterpriseLifecycleDatabaseUrl(value), value);
});

test('aborted fixture request bodies release the serialized request tail', async () => {
  let releasePrevious;
  let requestTail = new Promise(resolve => { releasePrevious = resolve; });
  const aborted = new PassThrough();
  const bodyResult = readEnterpriseLifecycleRequestBody(aborted).then(
    body => ({ body, error: null }),
    error => ({ body: null, error }),
  );
  const abortedRun = requestTail.then(async () => {
    const result = await bodyResult;
    if (result.error) throw result.error;
    return result.body;
  });
  requestTail = abortedRun.catch(() => {});
  aborted.write('{"partial":');
  aborted.emit('aborted');
  aborted.emit('error', new Error('ECONNRESET'));
  releasePrevious();
  await assert.rejects(abortedRun, /ENTERPRISE_LIFECYCLE_REQUEST_ABORTED/u);
  await requestTail;

  const next = new PassThrough();
  const nextRead = readEnterpriseLifecycleRequestBody(next);
  next.end('{"next":true}');
  assert.equal((await nextRead).toString('utf8'), '{"next":true}');
});
