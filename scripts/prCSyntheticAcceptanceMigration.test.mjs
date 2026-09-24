import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SYNTHETIC_MIGRATION_NAME, SYNTHETIC_MIGRATION_VERSION, SYNTHETIC_PRIOR_VERSION, classifySyntheticMigrationState } from './prCSyntheticAcceptanceMigration.mjs';

const marker = migration_tip => ({ product_key: 'avalaos-core', environment_class: 'hosted_nonproduction_pilot', migration_tip, production_authorized: false, customer_data_authorized: false, real_provider_calls_authorized: false });
const pending = () => ({ marker: marker(SYNTHETIC_PRIOR_VERSION), latestVersion: SYNTHETIC_PRIOR_VERSION, latestName: 'studio_independent_source_integration', executionKindColumn: false, executionKindConstraint: false, sessionBindingTable: false, sessionBindingImmutableTrigger: false, humanExerciseTipAccepted: true, syntheticExerciseTipAccepted: false, markerAssertionTip: '20260904120000', liveExerciseCount: 0 });
const current = () => ({ marker: marker(SYNTHETIC_MIGRATION_VERSION), latestVersion: SYNTHETIC_MIGRATION_VERSION, latestName: SYNTHETIC_MIGRATION_NAME, executionKindColumn: true, executionKindConstraint: true, sessionBindingTable: true, sessionBindingImmutableTrigger: true, humanExerciseTipAccepted: true, syntheticExerciseTipAccepted: true, markerAssertionTip: SYNTHETIC_MIGRATION_VERSION, liveExerciseCount: 0 });

test('migration state admits only the exact empty forward edge or exact current state', () => {
  assert.equal(classifySyntheticMigrationState(pending()), 'pending');
  assert.equal(classifySyntheticMigrationState(current()), 'current');
  for (const mutate of [
    value => { value.liveExerciseCount = 1; }, value => { value.marker.migration_tip = '20260923190853'; },
    value => { value.executionKindColumn = true; }, value => { value.sessionBindingTable = true; }, value => { value.latestName = 'other'; },
  ]) {
    const left = pending(); mutate(left); assert.throws(() => classifySyntheticMigrationState(left), /PR_C_SYNTHETIC_MIGRATION/u);
  }
});

test('forward migration adds immutable execution provenance and advances only the exact hosted marker', async () => {
  const sql = await readFile('supabase/migrations/20260924113000_pr_c_synthetic_acceptance_execution_kind.sql', 'utf8');
  assert.match(sql, /ADD COLUMN execution_kind text NOT NULL DEFAULT 'human'/u);
  assert.match(sql, /execution_kind IN \('human', 'synthetic'\)/u);
  assert.match(sql, /safe_record ->> 'executionKind' = 'synthetic'/u);
  assert.match(sql, /CREATE TABLE public\.pr_c_synthetic_acceptance_session_bindings/u);
  assert.match(sql, /pr_c_synthetic_acceptance_session_bindings_immutable/u);
  assert.match(sql, /CHECK\(migration_tip IN \('20260904120000','20260924113000'\)\)/u);
  assert.match(sql, /pr_c_controlled_human_assert_marker/u);
  assert.match(sql, /marker\.migration_tip='20260924052038'/u);
  assert.match(sql, /migration_tip='20260924113000'/u);
  assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT)\s*;/imu);
});
