import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = 'supabase/migrations/20260809120000_pilot_operations_control_plane.sql';
const sql = await readFile(file, 'utf8');
const correction = await readFile('supabase/migrations/20260809133000_pilot_operations_authority_correction.sql', 'utf8');
const truthClosure = await readFile('supabase/migrations/20260810120000_pilot_operations_truth_closure.sql', 'utf8');

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

console.log('Pilot Operations migration contract: additive authority, RLS, service-only RPCs, and non-live stop gate passed.');
