import { strict as assert } from 'node:assert';
import { decodePilotOperationsProjection, simulateNonLivePromotion } from './operationsModel';

const fixture = () => ({
  release: { candidateLabel: 'candidate-227', commitSha: 'a'.repeat(40), lifecycle: 'approved_for_pilot_promotion' },
  environment: { label: 'Synthetic candidate', type: 'pilot_candidate', lifecycle: 'active', version: 3 },
  controls: { maintenance: false, readOnly: false, disabledFeatures: [] },
  health: { schemaCompatible: true, queueState: 'healthy', reconciliationState: 'healthy' },
  provider: { configured: true, enabled: false },
  recovery: { backupState: 'passed', restoreState: 'passed', evidenceDigest: `sha256:${'b'.repeat(64)}` },
  promotion: { eligible: true, blockers: [], rollbackEligible: true, rollbackTargetLabel: 'candidate-226' },
  truth: 'proven_disposable_or_ci_evidence', liveActivationAuthorized: false,
});

const projection = decodePilotOperationsProjection(fixture());
assert.equal(projection.liveActivationAuthorized, false);
assert.equal(simulateNonLivePromotion(projection, 'dry_run').outcome, 'promoted_non_live');
assert.deepEqual(simulateNonLivePromotion(projection, 'live'), {
  outcome: 'blocked', code: 'LIVE_ACTIVATION_NOT_AUTHORIZED', mutationDelta: 0, externalCallCount: 0,
  orderedChecks: ['fresh_operator_authority', 'exact_candidate_environment_binding', 'schema_compatibility', 'required_evidence', 'current_approval', 'live_activation_stop_gate'],
});

for (const mutation of [
  (value: any) => { value.secretRef = 'AVALA_PROVIDER_SECRET_OPENAI_TENANT_VALUE'; },
  (value: any) => { value.provider.keyRefId = 'infrastructure-reference'; },
  (value: any) => { value.liveActivationAuthorized = true; },
  (value: any) => { value.provider.enabled = true; value.provider.configured = false; },
  (value: any) => { value.promotion.eligible = true; value.promotion.blockers = ['schema_mismatch']; },
  (value: any) => { value.recovery.evidenceDigest = 'sha256:short'; },
]) {
  const input: any = fixture(); mutation(input);
  assert.throws(() => decodePilotOperationsProjection(input));
}

for (const input of [
  { ...fixture(), controls: { ...fixture().controls, maintenance: true } },
  { ...fixture(), controls: { ...fixture().controls, readOnly: true } },
  { ...fixture(), health: { ...fixture().health, schemaCompatible: false } },
  { ...fixture(), promotion: { ...fixture().promotion, eligible: false, blockers: ['missing_evidence'] } },
]) assert.equal(simulateNonLivePromotion(decodePilotOperationsProjection(input), 'dry_run').code, 'PROMOTION_BLOCKED');

console.log('Pilot Operations projection and non-live promotion model: 12 fail-closed scenarios passed.');
