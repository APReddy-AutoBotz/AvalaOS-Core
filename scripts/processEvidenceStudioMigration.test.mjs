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
  "payload?'replaceArtifact'",
  'replaces_source_package_id,source_mode',
  "artifact.current_version_id IS DISTINCT FROM (payload#>>'{replaceArtifact,currentVersionId}')::uuid",
  "artifact.current_approved_version_id IS DISTINCT FROM (payload#>>'{replaceArtifact,currentApprovedVersionId}')::uuid",
  "artifact.case_id IS DISTINCT FROM upstream.case_id",
  "aggregate_version=aggregate_version+1",
  'DROP CONSTRAINT enterprise_module_handoff_consumptions_artifact_id_key',
  'enterprise_module_handoff_consumptions_artifact_package_key',
  'retained.section_id=current_section_key',
  'studio_process_evidence_composite_content_safe(NEW.content,NULL,NEW.parent_version_id)',
  'THEN COALESCE(prior.source_package_id,parent.source_package_id,NEW.source_package_id)',
  "RAISE EXCEPTION 'SELECTIVE_REFRESH_COVERAGE_INCOMPLETE'",
  "'selectedSourceVersionIds',selected_source_ids,'coveredSourceVersionIds',covered_source_ids",
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
