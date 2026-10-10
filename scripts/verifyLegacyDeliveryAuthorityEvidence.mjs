import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLegacyDeliveryAcceptanceProducer } from './legacyDeliveryAcceptanceEvidence.mjs';

const input = process.argv[2];
assert.ok(input, 'LEGACY_DELIVERY_EVIDENCE_PATH_REQUIRED');
const identity = {
  releaseSha: process.env.RELEASE_SHA,
  workflowRunId: process.env.GITHUB_RUN_ID,
  workflowAttempt: process.env.GITHUB_RUN_ATTEMPT,
  workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
  environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
};
assert.match(identity.releaseSha ?? '', /^[0-9a-f]{40}$/u);
for (const value of Object.values(identity)) assert.ok(value, 'LEGACY_DELIVERY_EVIDENCE_IDENTITY_REQUIRED');
const emitted = JSON.parse(readFileSync(input, 'utf8'));
const errors = validateLegacyDeliveryAcceptanceProducer({
  emitted, identity, command: 'node scripts/legacyDeliveryAuthorityPostgres.mjs',
});
assert.deepEqual(errors, [], 'LEGACY_DELIVERY_EVIDENCE_INVALID');
assert.ok(emitted.results.every(item => item.status === 'PASS'), 'LEGACY_DELIVERY_ACCEPTANCE_INCOMPLETE');
console.log('Verified both legacy Delivery PostgreSQL cases, exact source/run identity and cleanup.');
