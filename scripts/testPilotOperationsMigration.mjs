import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = 'supabase/migrations/20260809120000_pilot_operations_control_plane.sql';
const sql = await readFile(file, 'utf8');
const correction = await readFile('supabase/migrations/20260809133000_pilot_operations_authority_correction.sql', 'utf8');
const truthClosure = await readFile('supabase/migrations/20260810120000_pilot_operations_truth_closure.sql', 'utf8');
const operationalClosure = await readFile('supabase/migrations/20260810140000_pilot_operations_operational_closure.sql', 'utf8');
const lifecycleTruth = await readFile('supabase/migrations/20260810160000_pilot_operations_lifecycle_truth_convergence.sql', 'utf8');
const rollbackProjectionCorrection = await readFile('supabase/migrations/20260810180000_pilot_operations_rollback_projection_correction.sql', 'utf8');
const promotionSerialization = await readFile('supabase/migrations/20260810200000_pilot_operations_promotion_history_serialization.sql', 'utf8');
const pendingSerialization = await readFile('supabase/migrations/20260810220000_pilot_operations_pending_candidate_serialization.sql', 'utf8');

for (const required of [
  'pilot_operations_environments',
  'pilot_operations_release_candidates',
  'pilot_operations_command_receipts',
  'pilot_operations_command',
  'pilot_operations_projection',
  'LIVE_ACTIVATION_NOT_AUTHORIZED',
  'ENABLE ROW LEVEL SECURITY',
  'FORCE ROW LEVEL SECURITY',
]) assert.ok(sql.includes(required), `missing pilot operations migration boundary: ${required}`);

assert.match(sql, /REVOKE ALL[\s\S]+authenticated/i);
assert.doesNotMatch(sql, /DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);
for (const required of ['pilot_operations_evidence_manifests','pg_advisory_xact_lock','EXPECTED_VERSION_REQUIRED','TENANT_DEPROVISIONED','EVIDENCE_NOT_VERIFIED','disabled_features']) {
  assert.ok(correction.includes(required), `missing additive Pilot Operations correction: ${required}`);
}
assert.doesNotMatch(correction, /DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);
for (const required of ['pilot_operations_ingest_recovery_evidence','EVIDENCE_NOT_VERIFIED','PROVIDER_REFERENCE_STALE','pilot_operations_tenant_rebind_results','liveStopGates','LIVE_ACTIVATION_NOT_AUTHORIZED']) {
  assert.ok(truthClosure.includes(required), `missing Pilot Operations truth closure: ${required}`);
}
assert.doesNotMatch(truthClosure, /DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);

assert.match(operationalClosure, /pilot_operations_rollback_events/);
assert.match(operationalClosure, /rollback_non_live_promotion/);
assert.match(operationalClosure, /ROLLBACK_NOT_ELIGIBLE/);
assert.match(operationalClosure, /env\.maintenance[\s\S]*MAINTENANCE_MODE[\s\S]*env\.read_only[\s\S]*READ_ONLY_MODE[\s\S]*disabled_features \? 'recovery'/);
for (const required of ['pilot_operations_ingest_recovery_evidence_v3','tenant.lifecycle=\'deprovisioned\'','prior.actor_id IS DISTINCT FROM p_actor','approval_authorization_version','promotedRelease','schemaCompatible','backupState','provider_current']) {
  assert.ok(lifecycleTruth.includes(required), `missing lifecycle/truth convergence boundary: ${required}`);
}
assert.match(lifecycleTruth, /pr1b_assert_command_authority[\s\S]*TENANT_DEPROVISIONED[\s\S]*pilot_operations_command_receipts/);
assert.doesNotMatch(lifecycleTruth, /DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);
for (const required of ["e.event_type='promoted_non_live' AND c.id<>promoted.id", "WHEN promoted.id IS NULL THEN 'ROLLBACK_CURRENT_NOT_PROMOTED'", 'ROLLBACK_PRIOR_CANDIDATE_NOT_FOUND', 'LIVE_ACTIVATION_NOT_AUTHORIZED']) {
  assert.ok(rollbackProjectionCorrection.includes(required), `missing rollback projection correction boundary: ${required}`);
}
assert.doesNotMatch(rollbackProjectionCorrection, /DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);
for (const required of ['pilot_operations_promotion_sequences','pilot_operations_promotion_history','promotion_ordinal','legacy_ambiguous','AMBIGUOUS_PROMOTION_HISTORY','pilot_operations_record_promotion','LIVE_ACTIVATION_NOT_AUTHORIZED']) {
  assert.ok(promotionSerialization.includes(required), `missing serialized promotion-history boundary: ${required}`);
}
assert.match(promotionSerialization, /FOR UPDATE[\s\S]*next_ordinal[\s\S]*promotion_ordinal/);
assert.match(promotionSerialization, /FORCE ROW LEVEL SECURITY/);
assert.doesNotMatch(promotionSerialization, /ORDER BY e\.created_at DESC,e\.id DESC/);
assert.doesNotMatch(promotionSerialization, /DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);
for (const required of ['pilot_operations_candidate_sequences','pilot_operations_candidate_history','candidate_ordinal','AMBIGUOUS_PENDING_CANDIDATE_HISTORY','pilot_operations_current_actionable_candidate','LIVE_ACTIVATION_NOT_AUTHORIZED']) {
  assert.ok(pendingSerialization.includes(required), `missing serialized pending-candidate boundary: ${required}`);
}
assert.match(pendingSerialization, /FOR UPDATE[\s\S]*next_ordinal[\s\S]*candidate_ordinal/);
assert.match(pendingSerialization, /FORCE ROW LEVEL SECURITY/);
assert.doesNotMatch(pendingSerialization, /release_candidates[\s\S]{0,300}ORDER BY created_at DESC,id DESC/);
assert.doesNotMatch(pendingSerialization, /DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);
assert.match(sql, /LIVE_ACTIVATION_NOT_AUTHORIZED/);
console.log('Pilot Operations migration contract: additive authority, RLS, service-only RPCs, and non-live stop gate passed.');
