import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = 'supabase/migrations';
const migrations = fs.readdirSync(migrationsDir)
  .filter(name => name.endsWith('.sql'))
  .sort();
const migrationName = '20260710120000_pr1a_required_ai_audit.sql';

assert.equal(migrations.at(-1), migrationName, 'PR 1A audit migration must be the latest canonical migration.');
assert.equal(new Set(migrations.map(name => name.slice(0, 14))).size, migrations.length, 'Migration timestamps must be unique.');

const source = fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
for (const required of [
  'CREATE TABLE IF NOT EXISTS public.ai_generation_jobs',
  'CREATE TABLE IF NOT EXISTS public.ai_usage_events',
  'pr1a_ai_generation_jobs_required_check',
  'pr1a_ai_generation_jobs_lifecycle_check',
  'pr1a_ai_usage_events_required_check',
  'pr1a_enforce_ai_job_transition',
  'VALIDATE CONSTRAINT pr1a_ai_generation_jobs_lifecycle_check',
  'VALIDATE CONSTRAINT pr1a_ai_usage_events_required_check',
  'DROP POLICY IF EXISTS "Members can create org AI jobs"',
  'DROP POLICY IF EXISTS "Members can create org AI usage events"',
  'ALTER TABLE public.ai_generation_jobs FORCE ROW LEVEL SECURITY',
  'ALTER TABLE public.ai_usage_events FORCE ROW LEVEL SECURITY',
]) {
  assert.equal(source.includes(required), true, `Missing migration contract: ${required}`);
}

assert.doesNotMatch(source, /CREATE POLICY/i);
assert.doesNotMatch(source, /DROP TABLE|TRUNCATE|DELETE FROM/i);

const auditSource = fs.readFileSync('supabase/functions/_shared/audit.ts', 'utf8');
for (const runtimeColumn of [
  'org_id', 'user_id', 'job_type', 'status', 'model', 'input_refs', 'started_at',
  'output_ref', 'error_message', 'completed_at', 'provider', 'input_tokens',
  'output_tokens', 'total_tokens', 'metadata',
]) {
  assert.equal(source.includes(runtimeColumn), true, `Migration does not cover runtime column: ${runtimeColumn}`);
  assert.equal(auditSource.includes(runtimeColumn), true, `Audit runtime does not reference canonical column: ${runtimeColumn}`);
}

console.log(`PR 1A canonical migration contract passed across ${migrations.length} ordered migrations.`);
