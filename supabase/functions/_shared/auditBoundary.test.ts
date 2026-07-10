import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auditSource = readFileSync('supabase/functions/_shared/audit.ts', 'utf8');
assert.match(auditSource, /REQUIRED_AI_AUDIT_ERROR/);
assert.match(auditSource, /if \(!job\?\.id\) requiredAuditError\(\)/);
assert.match(auditSource, /if \(!event\?\.id\) requiredAuditError\(\)/);
assert.match(auditSource, /export const failAiJobBestEffort/);
assert.match(auditSource, /export const recordAiUsageBestEffort/);
assert.match(auditSource, /export const recordAiUsageRequired/);

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

const usageEndpointSource = readFileSync('supabase/functions/ai-usage-log/index.ts', 'utf8');
assert.match(usageEndpointSource, /recordAiUsageRequired/);
assert.doesNotMatch(usageEndpointSource, /recordAiUsageBestEffort/);

console.log('Required privileged audit source regression suite passed.');
