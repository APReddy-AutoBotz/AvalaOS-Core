import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
  PR_C_APPROVED_SUCCESSOR_TAIL,
  PR_C_CONTROLLED_HUMAN_FROZEN_TIP,
  assertPrCMigrationTail,
} from './prCMigrationTailContract.mjs';

const frozenPrefix = ['20260831062024_governed_delivery_monitor_pr_c.sql', PR_C_CONTROLLED_HUMAN_FROZEN_TIP];

test('only the exact approved creation-access successor tail is accepted', () => {
  assert.doesNotThrow(() => assertPrCMigrationTail([...frozenPrefix, ...PR_C_APPROVED_SUCCESSOR_TAIL]));
  for (const hostileTail of [
    [],
    PR_C_APPROVED_SUCCESSOR_TAIL.slice(0, 1),
    PR_C_APPROVED_SUCCESSOR_TAIL.slice(0, 2),
    [...PR_C_APPROVED_SUCCESSOR_TAIL].reverse(),
    [PR_C_APPROVED_SUCCESSOR_TAIL[1], PR_C_APPROVED_SUCCESSOR_TAIL[0], PR_C_APPROVED_SUCCESSOR_TAIL[2]],
    [...PR_C_APPROVED_SUCCESSOR_TAIL, PR_C_APPROVED_SUCCESSOR_TAIL[2]],
    [...PR_C_APPROVED_SUCCESSOR_TAIL, '20990101000000_unapproved.sql'],
  ]) {
    assert.throws(() => assertPrCMigrationTail([...frozenPrefix, ...hostileTail]));
  }
  assert.throws(() => assertPrCMigrationTail([frozenPrefix[0], ...PR_C_APPROVED_SUCCESSOR_TAIL]));
  assert.throws(() => assertPrCMigrationTail([...frozenPrefix, PR_C_CONTROLLED_HUMAN_FROZEN_TIP,
    ...PR_C_APPROVED_SUCCESSOR_TAIL]));
});

test('forward identity convergence requires exact frozen marker, predecessors, and non-production flags', () => {
  const sql = readFileSync('supabase/migrations/20260916003000_creation_access_migration_identity_convergence.sql', 'utf8');
  assert.match(sql, /to_regclass\('public\.process_creation_workspace_controls'\)/u);
  assert.match(sql, /to_regclass\('public\.synthetic_admin_accounts'\)/u);
  assert.match(sql, /singleton_count <> 1/u);
  assert.match(sql, /migration_tip <> '20260904120000'/u);
  for (const flag of ['production_authorized', 'customer_data_authorized', 'real_provider_calls_authorized']) {
    assert.match(sql, new RegExp(`marker\\.${flag}`, 'u'));
  }
  assert.match(sql, /SET migration_tip = '20260916003000'/u);
  assert.match(sql, /CHECK \(migration_tip = ''20260916003000''\)/u);
  assert.doesNotMatch(sql.replace(/^--.*$/gmu, ''), /(?:GRANT|CREATE ROLE|ALTER ROLE|DROP TABLE)/iu);
});
