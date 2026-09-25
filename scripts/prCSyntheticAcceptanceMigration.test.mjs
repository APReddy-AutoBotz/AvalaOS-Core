import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SYNTHETIC_CHAIN_START_NAME, SYNTHETIC_CHAIN_START_VERSION, SYNTHETIC_INTERRUPTED_MARKER_TIP, SYNTHETIC_INTERRUPTED_NAME, SYNTHETIC_INTERRUPTED_VERSION, SYNTHETIC_MIGRATION_NAME, SYNTHETIC_MIGRATION_VERSION, SYNTHETIC_PRIOR_VERSION, classifySyntheticMigrationChain, classifySyntheticMigrationState } from './prCSyntheticAcceptanceMigration.mjs';

const marker = migration_tip => ({ product_key: 'avalaos-core', environment_class: 'hosted_nonproduction_pilot', migration_tip, production_authorized: false, customer_data_authorized: false, real_provider_calls_authorized: false });
const pending = () => ({ marker: marker(SYNTHETIC_PRIOR_VERSION), latestVersion: SYNTHETIC_PRIOR_VERSION, latestName: 'studio_independent_source_integration', executionKindColumn: false, executionKindConstraint: false, sessionBindingTable: false, sessionBindingImmutableTrigger: false, humanExerciseTipAccepted: true, syntheticExerciseTipAccepted: false, markerAssertionTip: SYNTHETIC_CHAIN_START_VERSION, retainedAuthRecoveryAccepted: false, liveExerciseCount: 0 });
const current = () => ({ marker: marker(SYNTHETIC_MIGRATION_VERSION), latestVersion: SYNTHETIC_MIGRATION_VERSION, latestName: SYNTHETIC_MIGRATION_NAME, executionKindColumn: true, executionKindConstraint: true, sessionBindingTable: true, sessionBindingImmutableTrigger: true, humanExerciseTipAccepted: true, syntheticExerciseTipAccepted: true, markerAssertionTip: SYNTHETIC_MIGRATION_VERSION, retainedAuthRecoveryAccepted: true, liveExerciseCount: 0 });

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

test('chain preflight requires the exact provider-free target and canonical migration prefix', () => {
  const fingerprint = `sha256:${'a'.repeat(64)}`;
  const local = Array.from({ length: 72 }, (_, index) => ({ version: String(index).padStart(14, '0'), name: `prior_${index}` }));
  local[71] = { version: SYNTHETIC_CHAIN_START_VERSION, name: SYNTHETIC_CHAIN_START_NAME };
  for (let index = 0; index < 18; index++) local.push({ version: String(20260915142940 + index).padStart(14, '0'), name: `forward_${index}` });
  local[75] = { version: SYNTHETIC_INTERRUPTED_VERSION, name: SYNTHETIC_INTERRUPTED_NAME };
  local.push({ version: SYNTHETIC_MIGRATION_VERSION, name: SYNTHETIC_MIGRATION_NAME });
  const remote = local.slice(0, 72);
  const state = { ...pending(), marker: marker(SYNTHETIC_CHAIN_START_VERSION), latestVersion: SYNTHETIC_CHAIN_START_VERSION, latestName: SYNTHETIC_CHAIN_START_NAME };
  assert.equal(classifySyntheticMigrationChain(state, remote, local, fingerprint, fingerprint).pendingMigrationCount, 19);
  const interrupted = local.slice(0, 76);
  const interruptedState = { ...pending(), marker: marker(SYNTHETIC_INTERRUPTED_MARKER_TIP), latestVersion: SYNTHETIC_INTERRUPTED_VERSION, latestName: SYNTHETIC_INTERRUPTED_NAME };
  assert.equal(classifySyntheticMigrationChain(interruptedState, interrupted, local, fingerprint, fingerprint).pendingMigrationCount, 15);
  assert.equal(classifySyntheticMigrationChain(current(), local, local, fingerprint, fingerprint).pendingMigrationCount, 0);
  assert.throws(() => classifySyntheticMigrationChain(state, remote, local, fingerprint, `sha256:${'b'.repeat(64)}`), /CHAIN_STATE_REJECTED/u);
  assert.throws(() => classifySyntheticMigrationChain({ ...state, liveExerciseCount: 1 }, remote, local, fingerprint, fingerprint), /CHAIN_STATE_REJECTED/u);
  assert.throws(() => classifySyntheticMigrationChain({ ...state, marker: { ...state.marker, real_provider_calls_authorized: true } }, remote, local, fingerprint, fingerprint), /CHAIN_STATE_REJECTED/u);
  assert.throws(() => classifySyntheticMigrationChain(state, [{ ...remote[0], name: 'drift' }, ...remote.slice(1)], local, fingerprint, fingerprint), /CHAIN_HISTORY_REJECTED/u);
  assert.throws(() => classifySyntheticMigrationChain(state, remote.slice(0, -1), local, fingerprint, fingerprint), /CHAIN_STATE_REJECTED/u);
  assert.throws(() => classifySyntheticMigrationChain(interruptedState, interrupted.slice(0, -1), local, fingerprint, fingerprint), /CHAIN_STATE_REJECTED/u);
  assert.throws(() => classifySyntheticMigrationChain({ ...interruptedState, marker: marker(SYNTHETIC_CHAIN_START_VERSION) }, interrupted, local, fingerprint, fingerprint), /CHAIN_STATE_REJECTED/u);
  assert.throws(() => classifySyntheticMigrationChain(interruptedState, [{ ...interrupted[0], name: 'drift' }, ...interrupted.slice(1)], local, fingerprint, fingerprint), /CHAIN_HISTORY_REJECTED/u);
  assert.throws(() => classifySyntheticMigrationChain(current(), local.slice(0, -1), local, fingerprint, fingerprint), /CHAIN_STATE_REJECTED/u);
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
