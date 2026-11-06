import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'supabase/migrations/20261106040803_studio_v2_rendition_renderer.sql',
  'utf8',
);

test('renderer-2 is selected only by the service RPC for exact system-template V2 content', () => {
  for (const token of [
    'studio_private_artifact_command_claim_renderer1_legacy',
    "v.content ->> 'contractVersion' = 'studio-artifact-2'",
    "template.template_version = 'studio-' || aggregate.artifact_type || '-1'",
    "WHEN 'sdd' THEN 'studio-artifact-2'",
    "ELSE 'studio-artifact-1'",
    "WHEN 'pdf' THEN 'studio-pdf-2'",
    "WHEN 'markdown' THEN 'studio-markdown-2'",
    "WHEN 'docx' THEN 'studio-docx-2'",
    'studio_rendition_generation_lock',
  ]) assert.ok(source.includes(token), token);
  assert.match(
    source,
    /REVOKE ALL ON FUNCTION public\.studio_private_artifact_command_claim_renderer1_legacy\(jsonb\)[\s\S]+?FROM PUBLIC, anon, authenticated, service_role/u,
  );
  assert.match(
    source,
    /REVOKE ALL ON FUNCTION public\.studio_private_artifact_command_claim\(jsonb\)[\s\S]+?GRANT EXECUTE ON FUNCTION public\.studio_private_artifact_command_claim\(jsonb\)[\s\S]+?TO service_role/u,
  );
});

test('renderer-2 preserves historical rows and advances only the nonproduction identity', () => {
  assert.doesNotMatch(source, /DELETE\s+FROM\s+public\.studio_(?:renditions|rendition_attempts)/iu);
  assert.doesNotMatch(source, /UPDATE\s+public\.studio_(?:renditions|rendition_attempts)/iu);
  assert.match(source, /migration_tip = '20261106040803'/u);
  assert.match(source, /NOT production_authorized/u);
  assert.match(source, /NOT customer_data_authorized/u);
  assert.match(source, /NOT real_provider_calls_authorized/u);
  assert.match(source, /EXISTS \([\s\S]+authenticated_synthetic_exercises WHERE lifecycle = 'active'/u);
});

test('renderer-2 generation keeps replay, tuple, and authorization controls', () => {
  for (const token of [
    'studio_assert_actor',
    'IDEMPOTENCY_CONFLICT',
    'request_hash',
    'current_approved_version_id = version.id',
    "aggregate.lifecycle = 'approved'",
    "version.lifecycle = 'approved'",
    "expected_rendition IS NOT NULL",
    'studio_private_artifact_command_receipts',
    'privileged_audit_events',
  ]) assert.ok(source.includes(token), token);
});
