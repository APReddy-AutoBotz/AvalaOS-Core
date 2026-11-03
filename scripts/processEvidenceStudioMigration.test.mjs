import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261103103752_process_evidence_studio_sdd_flows.sql', 'utf8');

for (const required of [
  "'sdd', 'studio-sdd-1', 'studio-artifact-2'",
  '"asIsFlow","toBeFlow"',
  '"openQuestionsAndProposals"',
  'CREATE OR REPLACE FUNCTION public.studio_tenant_template_projection',
  "jsonb_build_object('id','asIsFlow','title','As is flow'",
  "'public.studio_rendition_attempts'::regclass",
  "'public.enterprise_delivery_work_item_versions'::regclass",
  'PROCESS_EVIDENCE_IDENTITY_PRECONDITION',
  'CREATE TABLE public.studio_generation_section_refreshes',
  'CREATE TABLE public.studio_artifact_section_source_bindings',
  'studio_artifact_generation_request_v2_base_20261103',
  'CREATE TRIGGER studio_a_process_evidence_merge_selected_sections',
  "NEW.content:=jsonb_set(parent.content,'{sections}',merged_sections,false)",
  "THEN 'refreshed'",
  "section_id text NOT NULL CHECK(section_id~'^[A-Za-z][A-Za-z0-9_.-]{0,79}$')",
  "COALESCE(section.value->>'id',section.value->>'key')",
  'FOREIGN KEY(origin_version_id,artifact_id,org_id,workspace_id)',
]) assert.ok(migration.includes(required), `migration missing ${required}`);

assert.ok(migration.indexOf('CREATE TRIGGER studio_a_process_evidence_merge_selected_sections')
  < migration.indexOf('CREATE TRIGGER studio_process_evidence_section_source_binding'),
  'selective merge must precede immutable per-section source binding');
assert.equal((migration.match(/CREATE TABLE public\.studio_generation_section_refreshes/gu) ?? []).length, 1,
  'refresh binding must remain a single additive schema boundary');

assert.equal(/UPDATE\s+public\.studio_system_template_versions/iu.test(migration), false,
  'immutable system templates must not be updated');
assert.equal(/DELETE\s+FROM\s+public\.studio_system_template_versions/iu.test(migration), false,
  'immutable system templates must not be deleted');
assert.equal((migration.match(/studio-sdd-1/gu) ?? []).length >= 2, true);

console.log('process evidence Studio migration contract passed');
