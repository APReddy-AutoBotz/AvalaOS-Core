import assert from 'node:assert/strict';
import test from 'node:test';
import { expectDatabaseError } from './assessDocumentPostgresTestGuards.mjs';

test('database error guard rejects a matching database failure', async () => {
  await expectDatabaseError(async () => { throw new Error('EXPECTED_DATABASE_FAILURE'); }, /EXPECTED_DATABASE_FAILURE/u);
});

test('database error guard cannot accept a resolved operation', async () => {
  await assert.rejects(
    expectDatabaseError(async () => ({ ok: true }), /EXPECTED_DATABASE_FAILURE/u),
    error => error?.code === 'ERR_ASSERTION' && /Missing expected rejection/u.test(error.message),
  );
});

test('database error guard cannot accept a different failure', async () => {
  await assert.rejects(
    expectDatabaseError(async () => { throw new Error('DIFFERENT_DATABASE_FAILURE'); }, /EXPECTED_DATABASE_FAILURE/u),
    error => error?.code === 'ERR_ASSERTION' && /DIFFERENT_DATABASE_FAILURE/u.test(error.message),
  );
});
