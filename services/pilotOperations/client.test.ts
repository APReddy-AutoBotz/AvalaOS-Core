import assert from 'node:assert/strict';
import { decodeServerPilotOperationsProjection } from './client';

const environmentId = '11111111-1111-4111-8111-111111111111';
const releaseId = '22222222-2222-4222-8222-222222222222';

// Sanitized field-for-field shape captured from the retained synthetic operator projection.
const emptyReleaseFixture = () => ({
  truthClassification: 'not_proven_hosted_live',
  liveActivationAuthorized: false,
  environment: { id: environmentId, type: 'pilot_candidate', lifecycle: 'active_non_live', version: 7, maintenance: false, readOnly: true, disabledFeatures: [] },
  release: { id: null, gitSha: null, version: null, lifecycle: null },
  promotedRelease: null,
  provider: null,
  health: { schemaCompatible: false, queueState: 'healthy', reconciliationState: 'healthy' },
  recovery: { backupState: 'not_run', restoreState: 'not_run' },
  blockers: ['CANDIDATE_NOT_APPROVED', 'READ_ONLY_MODE', 'SCHEMA_INCOMPATIBLE'],
  liveStopGates: ['HOSTED_LIVE_NOT_PROVEN', 'LIVE_ACTIVATION_NOT_AUTHORIZED'],
  rollback: { eligible: false, reason: 'READ_ONLY_MODE', targetCandidateId: null, targetVersion: null, targetLabel: null },
});

for (const release of [emptyReleaseFixture().release, null]) {
  const decoded = decodeServerPilotOperationsProjection({ ...emptyReleaseFixture(), release });
  assert.equal(decoded.release, null);
  assert.deepEqual(decoded.authority, { environmentId });
  assert.equal(decoded.environment.version, 7);
  assert.equal(decoded.controls.readOnly, true);
  assert.deepEqual(decoded.promotion.liveStopGates, ['HOSTED_LIVE_NOT_PROVEN', 'LIVE_ACTIVATION_NOT_AUTHORIZED']);
}

const populated = emptyReleaseFixture();
populated.release = { id: releaseId, gitSha: 'a'.repeat(40), version: 3, lifecycle: 'validated' } as any;
const populatedDecoded = decodeServerPilotOperationsProjection(populated);
assert.equal(populatedDecoded.release?.commitSha, 'a'.repeat(40));
assert.equal(populatedDecoded.authority?.releaseVersion, 3);

for (const release of [
  { id: releaseId, gitSha: null, version: null, lifecycle: null },
  { id: null, gitSha: null, version: null, lifecycle: null, extra: null },
  { id: releaseId, gitSha: 'short', version: 3, lifecycle: 'validated' },
  {},
]) {
  assert.throws(() => decodeServerPilotOperationsProjection({ ...emptyReleaseFixture(), release }), /OPERATIONS_PROJECTION_UNAVAILABLE/);
}

console.log('Pilot Operations server projection: 7 nullable, populated, and malformed-release cases passed.');
