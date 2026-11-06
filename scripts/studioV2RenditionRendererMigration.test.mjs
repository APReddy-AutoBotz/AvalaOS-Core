import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'supabase/migrations/20261106040803_studio_v2_rendition_renderer.sql',
  'utf8',
);
const branchSource = readFileSync(
  'supabase/migrations/20261106210205_studio_sdd_pdf_branch_routing.sql',
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

test('renderer-3 is a guarded SDD V2 PDF branch and preserves function authority', () => {
  for (const token of [
    "marker.migration_tip<>'20261106191539'",
    "IF format_name='pdf' AND artifact_type='sdd' THEN",
    "renderer:='studio-pdf-3'",
    'STUDIO_SDD_PDF_BRANCH_SOURCE_MISMATCH',
    'STUDIO_SDD_PDF_BRANCH_AUTHORITY_DRIFT',
    "new_tip text:='20261106210205'",
    "CHECK(migration_tip='20261106210205')",
  ]) assert.ok(branchSource.includes(token), token);
  assert.match(branchSource,
    /IF NOT COALESCE\(is_v2_system_document, false\) THEN[\s\S]+?RETURN public\.studio_private_artifact_command_claim_renderer1_legacy\(p_command\);[\s\S]+?IF format_name='pdf' AND artifact_type='sdd' THEN[\s\S]+?renderer:='studio-pdf-3'/u);
  assert.match(branchSource,
    /metadata_after IS DISTINCT FROM metadata_before[\s\S]+?STUDIO_SDD_PDF_BRANCH_AUTHORITY_DRIFT/u);
});

test('renderer-3 routing is additive and does not rewrite rendition history', () => {
  assert.doesNotMatch(branchSource, /DELETE\s+FROM\s+public\.studio_(?:renditions|rendition_attempts)/iu);
  assert.doesNotMatch(branchSource, /UPDATE\s+public\.studio_(?:renditions|rendition_attempts)/iu);
  assert.doesNotMatch(branchSource, /studio-pdf-1[^']*:=|studio-pdf-2[^']*:=/u);
  assert.match(branchSource, /EXISTS\(SELECT 1 FROM public\.authenticated_synthetic_exercises WHERE lifecycle='active'\)/u);
  assert.match(branchSource, /EXISTS\(SELECT 1 FROM public\.synthetic_ai_campaign_authorities WHERE enabled\)/u);
});
