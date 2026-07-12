import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const auditSource = readFileSync('supabase/functions/_shared/audit.ts', 'utf8');
assert.match(auditSource, /REQUIRED_AI_AUDIT_ERROR/);
assert.match(auditSource, /status: 'eq\.running'/);
assert.match(auditSource, /jobs\.length !== 1/);
assert.match(auditSource, /Number\.isSafeInteger/);
assert.match(auditSource, /totalTokens !== inputTokens \+ outputTokens/);
assert.match(auditSource, /export const failAiJobBestEffort/);
assert.match(auditSource, /export const recordAiUsageBestEffort/);
assert.match(auditSource, /export const recordAiUsageRequired/);

const supabaseSource = readFileSync('supabase/functions/_shared/supabase.ts', 'utf8');
assert.match(supabaseSource, /export const updateRows/);
assert.match(supabaseSource, /new URLSearchParams\(filters\)/);

for (const endpoint of [
  'supabase/functions/ai-generate-document/index.ts',
  'supabase/functions/ai-refine-section/index.ts',
]) {
  const source = readFileSync(endpoint, 'utf8');
  assert.match(source, /recordAiUsageBestEffort/);
  assert.match(source, /completeAiJob\(jobId, 'succeeded'/);
  assert.match(source, /failAiJobBestEffort\(jobId, message\)/);
  assert.doesNotMatch(source, /recordAiUsage\b/);
}

const extractionSource = readFileSync('supabase/functions/extract-document-text/index.ts', 'utf8');
assert.match(extractionSource, /completeAiJob\(jobId, 'succeeded'/);
assert.match(extractionSource, /failAiJobBestEffort\(jobId, message\)/);

assert.equal(existsSync('supabase/functions/ai-usage-log/index.ts'), false,
  'The unused caller-controlled AI usage endpoint must remain removed.');

const migration = readFileSync('supabase/migrations/20260710120000_pr1a_required_ai_audit.sql', 'utf8');
assert.match(migration, /FOREIGN KEY \(job_id, org_id, user_id\)/);
assert.match(migration, /total_tokens = input_tokens \+ output_tokens/);
assert.match(migration, /Terminal AI audit jobs are immutable/);
assert.match(migration, /AI usage audit events are immutable/);
assert.match(migration, /PR1A_PREFLIGHT_AI_USAGE_JOB_AUTHORITY_MISMATCH/);

console.log('Required privileged audit source regression suite passed.');
