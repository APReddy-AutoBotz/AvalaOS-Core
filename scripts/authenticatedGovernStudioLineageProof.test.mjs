import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticatedGovernStudioLineageProofDigest as digest,
  AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SCHEMA,
  validateAuthenticatedGovernStudioLineageProof,
} from './authenticatedGovernStudioLineageProof.mjs';

const proof = () => ({
  schemaVersion: AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SCHEMA,
  status: 'PASS',
  source: { releaseSha: 'a'.repeat(40), runId: '42', attempt: '1',
    workflow: 'Authenticated Product Acceptance Preparation', job: 'connected-browser', sourceDigest: digest('source') },
  runtime: { postgresql: true, productionHandlers: true, providersEnabled: false, providerCalls: 0, paidCalls: 0 },
  positive: { verified: true, actionCount: 8, lineageDigest: digest('lineage'),
    observationReaderVerified: true, ownershipSchemaVerified: true,
    nonExerciseOwnedRowsExcluded: true, immutableHistoryPreserved: true },
  negative: { resourceSubstitutionRejected: true, receiptSubstitutionRejected: true,
    actorSubstitutionRejected: true, extraScopedRowRejected: true,
    foreignScopeExcluded: true, foreignMutationDetected: true },
  cleanup: { databaseRemoved: true },
});

test('validates bounded PostgreSQL Govern Studio lineage proof', () => {
  const value = proof();
  assert.deepEqual(validateAuthenticatedGovernStudioLineageProof(value), value);
});

for (const [name, mutate] of [
  ['extra key', value => { value.database = 'omitted'; }],
  ['provider enablement', value => { value.runtime.providersEnabled = true; }],
  ['provider call', value => { value.runtime.providerCalls = 1; }],
  ['missing negative', value => { value.negative.actorSubstitutionRejected = false; }],
  ['missing cleanup', value => { value.cleanup.databaseRemoved = false; }],
  ['unsafe source', value => { value.source.url = 'https://invalid.example'; }],
  ['legacy fabricated-frame schema', value => { value.schemaVersion = 'authenticated-govern-studio-lineage-postgres-proof-v1'; }],
  ...['observationReaderVerified', 'ownershipSchemaVerified', 'nonExerciseOwnedRowsExcluded', 'immutableHistoryPreserved']
    .flatMap(key => [
      [`absent ${key}`, value => { delete value.positive[key]; }],
      [`false ${key}`, value => { value.positive[key] = false; }],
    ]),
  ...['foreignScopeExcluded', 'foreignMutationDetected'].flatMap(key => [
    [`absent ${key}`, value => { delete value.negative[key]; }],
    [`false ${key}`, value => { value.negative[key] = false; }],
  ]),
]) test(`rejects ${name}`, () => {
  const value = proof(); mutate(value);
  assert.equal(validateAuthenticatedGovernStudioLineageProof(value), null);
});
