import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnterpriseLifecycleDatabaseUrl } from './enterpriseLifecyclePostgresFixture.mjs';

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
