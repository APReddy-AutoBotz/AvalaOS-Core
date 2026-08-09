import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = 'supabase/migrations/20260809120000_pilot_operations_control_plane.sql';
const sql = await readFile(file, 'utf8');

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

console.log('Pilot Operations migration contract: additive authority, RLS, service-only RPCs, and non-live stop gate passed.');
