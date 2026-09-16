import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  PROJECTION_RPC_VOLATILITY_MIGRATION_PATH,
  assertProjectionRpcVolatilityMigration,
  buildProjectionRpcVolatilityAdversaries,
} from './projectionRpcVolatilityMigrationContract.mjs';

const sql = readFileSync(PROJECTION_RPC_VOLATILITY_MIGRATION_PATH, 'utf8');

test('projection RPC volatility migration changes exactly two function volatility flags after exact preconditions', () => {
  assert.deepEqual(assertProjectionRpcVolatilityMigration(sql), {
    predecessorTip: '20260916181916',
    currentTip: '20260916203406',
    functionCount: 2,
  });
});

test('projection RPC migration rejects authority, metadata, ordering, missing and extra-function adversaries', () => {
  const adversaries = buildProjectionRpcVolatilityAdversaries(sql);
  assert.equal(adversaries.length, 20);
  for (const adversary of adversaries) {
    assert.throws(() => assertProjectionRpcVolatilityMigration(adversary.sql), undefined, adversary.name);
  }
});
