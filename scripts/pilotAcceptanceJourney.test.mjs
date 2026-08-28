import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

const adversarialDenialsPassed = ['wrongTenant','wrongWorkspace','unauthorizedId','revokedBetweenReadMutate','browserClaimsIgnored','serviceRoleWithoutActorAuthority']
  .every(key => matrix[key].ok === false && matrix[key].disclosed === false && matrix[key].delta === 0);
const responseLossReplayPassed = matrix.responseLostExactReplay.receiptId === matrix.restoredExactReplay.receiptId
  && matrix.responseLostExactReplay.effectId === matrix.restoredExactReplay.effectId
  && matrix.changedPayloadReplay.code === 'IDEMPOTENCY_CONFLICT';
const recoveryInvariantsPassed = Object.values(drills).every(drill => (drill.delta ?? drill.effectDelta ?? 0) === 0)
  && drills.workerRetry.claimed === 0 && drills.workerRetry.pending === 0 && drills.rollback.destructiveRewrite === false;
const assertionChecks=[
  ['canonical-journey--score-version-unchanged',journey.scoreVersion==='assess-core-2026-05'&&journey.hardStopLawChanged===false],
  ['canonical-journey--lineage-unique',new Set(journey.lineage).size===journey.lineage.length],
  ['canonical-journey--private-artifact-no-raw-url',journey.artifact.private===true&&journey.artifact.rawUrlDisclosed===false],
  ['canonical-journey--adversarial-and-recovery-invariants',adversarialDenialsPassed&&responseLossReplayPassed&&recoveryInvariantsPassed],
];
const assertionResults=assertionChecks.map(([assertionId,passed])=>({assertionId,status:passed?'PASS':'FAIL'}));
const assertionDisposition=assertionResults.every(item=>item.status==='PASS')?'passed':'failed';
assert.equal(assertionDisposition,'passed','canonical journey assertion artifact must derive from executed model checks');

if (process.env.CANONICAL_JOURNEY_EVIDENCE_OUTPUT) {
  const outputPath = process.env.CANONICAL_JOURNEY_EVIDENCE_OUTPUT;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 'canonical-journey-execution-v1',
    head: process.env.CANDIDATE_SHA ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 0),
    workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH ?? null,
    environment: 'disposable-ci-model',
    scope: { kind: 'synthetic-contract-model' },
    assertionDisposition,
    assertionResults,
  }, null, 2)}\n`, { mode: 0o600 });
}
console.log('Pilot acceptance model: canonical lineage, 11 adversarial cases, and 14 recovery/control drills passed.');
