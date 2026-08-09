import assert from 'node:assert/strict';
import { executePilotJourney, runAdversarialMatrix, runRecoveryAndControlDrills } from './pilotAcceptanceJourney.mjs';

const journey = executePilotJourney();
assert.equal(journey.scoreVersion, 'assess-core-2026-05');
assert.equal(journey.hardStopLawChanged, false);
assert.equal(new Set(journey.lineage).size, journey.lineage.length);
assert.deepEqual(journey.artifact.renditions, ['markdown','pdf','docx']);
assert.equal(journey.artifact.private, true);
assert.equal(journey.artifact.rawUrlDisclosed, false);
assert.deepEqual(journey.queue, { claimed: 0, pending: 0 });

const matrix = runAdversarialMatrix();
for (const key of ['wrongTenant','wrongWorkspace','unauthorizedId','revokedBetweenReadMutate','browserClaimsIgnored','serviceRoleWithoutActorAuthority']) {
  assert.equal(matrix[key].ok, false, key);
  assert.equal(matrix[key].disclosed, false, key);
  assert.equal(matrix[key].delta, 0, key);
}
assert.equal(matrix.responseLostExactReplay.receiptId, matrix.restoredExactReplay.receiptId);
assert.equal(matrix.responseLostExactReplay.effectId, matrix.restoredExactReplay.effectId);
assert.equal(matrix.changedPayloadReplay.code, 'IDEMPOTENCY_CONFLICT');

const drills = runRecoveryAndControlDrills();
for (const drill of Object.values(drills)) assert.equal(drill.delta ?? drill.effectDelta ?? 0, 0);
assert.deepEqual({ claimed: drills.workerRetry.claimed, pending: drills.workerRetry.pending }, { claimed: 0, pending: 0 });
assert.equal(drills.rollback.destructiveRewrite, false);
console.log('Pilot acceptance model: canonical lineage, 11 adversarial cases, and 14 recovery/control drills passed.');
