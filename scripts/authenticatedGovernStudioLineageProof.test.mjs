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
  positive: { verified: true, actionCount: 8, lineageDigest: digest('lineage') },
  negative: { resourceSubstitutionRejected: true, receiptSubstitutionRejected: true,
    actorSubstitutionRejected: true, extraScopedRowRejected: true },
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
]) test(`rejects ${name}`, () => {
  const value = proof(); mutate(value);
  assert.equal(validateAuthenticatedGovernStudioLineageProof(value), null);
});
