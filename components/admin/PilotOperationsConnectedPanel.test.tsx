import assert from 'node:assert/strict';
import { canRequestPilotOperation, commandFor } from './PilotOperationsConnectedPanel';
import type { PilotOperationsProjection } from '../../services/pilotOperations/operationsModel';

const environmentId = '11111111-1111-4111-8111-111111111111';
const releaseId = '22222222-2222-4222-8222-222222222222';
const projection = (release = true): PilotOperationsProjection => ({
  authority: release ? { environmentId, releaseId, releaseVersion: 3 } : { environmentId },
  release: release ? { candidateLabel: 'Candidate 22222222', commitSha: 'a'.repeat(40), lifecycle: 'validated' } : null,
  environment: { label: 'Pilot candidate 11111111', type: 'pilot_candidate', lifecycle: 'active_non_live', version: 7 },
  controls: { maintenance: false, readOnly: true, disabledFeatures: [] },
  health: { schemaCompatible: true, queueState: 'healthy', reconciliationState: 'healthy' },
  provider: { configured: false, enabled: false, status: 'not_configured' },
  recovery: { backupState: 'not_run', restoreState: 'not_run' },
  promotion: { eligible: release, blockers: release ? [] : ['CANDIDATE_NOT_APPROVED'], liveStopGates: ['LIVE_ACTIVATION_NOT_AUTHORIZED'], rollbackEligible: false, rollbackReason: 'READ_ONLY_MODE' },
  truth: 'not_proven_hosted_live',
  liveActivationAuthorized: false,
});

const allCapabilities = ['operations.read', 'operations.manage', 'release.validate', 'release.approve', 'release.promote'];
assert.equal(canRequestPilotOperation('maintenance', projection(false), allCapabilities), true);
assert.equal(canRequestPilotOperation('read_only', projection(false), allCapabilities), true);
for (const action of ['validate', 'approve', 'simulate_promotion', 'rollback'] as const) {
  assert.equal(canRequestPilotOperation(action, projection(false), allCapabilities), false);
  assert.throws(() => commandFor({ action, expectedVersion: 7 }, projection(false), allCapabilities), /PREFLIGHT_BLOCKED|ROLLBACK_NOT_ELIGIBLE/);
}

const capabilityCases = [
  ['validate', 'release.validate'],
  ['approve', 'release.approve'],
  ['simulate_promotion', 'release.promote'],
  ['maintenance', 'operations.manage'],
  ['read_only', 'operations.manage'],
] as const;
for (const [action, capability] of capabilityCases) {
  assert.equal(canRequestPilotOperation(action, projection(), allCapabilities.filter(item => item !== capability)), false);
  assert.throws(() => commandFor({ action, expectedVersion: 3 }, projection(), allCapabilities.filter(item => item !== capability)), /ACCESS_DENIED/);
}
assert.equal(canRequestPilotOperation('maintenance', projection(), allCapabilities.filter(item => item !== 'operations.read')), false);
assert.throws(() => commandFor({ action: 'maintenance', expectedVersion: 7 }, projection(), allCapabilities.filter(item => item !== 'operations.read')), /ACCESS_DENIED/);
assert.equal(canRequestPilotOperation('maintenance', projection(), allCapabilities, 'read_only'), false);
assert.deepEqual(commandFor({ action: 'maintenance', expectedVersion: 7 }, projection(false), allCapabilities), {
  operation: 'set_runtime_control',
  payload: { environmentId, maintenance: true, readOnly: true, disabledFeatures: [] },
});

console.log('Pilot Operations connected controls: 19 target, capability, and session checks passed without transport.');
