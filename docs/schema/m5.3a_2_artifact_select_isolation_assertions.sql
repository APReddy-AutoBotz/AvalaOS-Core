-- M5.3a-2 executable local artifact SELECT assertion contract.
--
-- Local-only assertion SQL for the six approved artifact authority tables:
-- assess_processes, assessments, assessment_review_events, projects,
-- document_generations, and delivery_work_items.
--
-- This file creates transaction-scoped local fixtures with generated UUIDs,
-- exercises SELECT-only policies through local session-claim simulation,
-- returns a counts-only sanitized summary row, and rolls back all fixture rows.
--
-- It does not create helper functions, RLS policies, migrations, durable seed
-- data, production/demo/runtime data, backfill, constraint validation, provider
-- assertions, legacy table assertions, mutation checks, target output, secret
-- output, claim output, or row payload output.

BEGIN;

SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

CREATE TEMP TABLE m5_3a_2_fixture_ids (
    fixture_label TEXT PRIMARY KEY,
    local_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO m5_3a_2_fixture_ids (fixture_label, local_id)
VALUES
    ('org_a', gen_random_uuid()),
    ('org_b', gen_random_uuid()),
    ('workspace_a', gen_random_uuid()),
    ('workspace_b', gen_random_uuid()),
    ('workspace_org_b', gen_random_uuid()),
    ('user_active_member', gen_random_uuid()),
    ('user_disabled_org_member', gen_random_uuid()),
    ('user_disabled_workspace_member', gen_random_uuid()),
    ('user_non_member', gen_random_uuid()),
    ('user_org_b_member', gen_random_uuid()),
    ('role_org_a', gen_random_uuid()),
    ('role_workspace_a', gen_random_uuid()),
    ('role_workspace_b', gen_random_uuid()),
    ('role_org_b', gen_random_uuid()),
    ('process_a', gen_random_uuid()),
    ('process_workspace_b', gen_random_uuid()),
    ('process_org_b', gen_random_uuid()),
    ('process_deleted', gen_random_uuid()),
    ('process_null_workspace', gen_random_uuid()),
    ('assessment_a', gen_random_uuid()),
    ('assessment_workspace_b', gen_random_uuid()),
    ('assessment_org_b', gen_random_uuid()),
    ('assessment_deleted', gen_random_uuid()),
    ('assessment_cross_process', gen_random_uuid()),
    ('assessment_deleted_process', gen_random_uuid()),
    ('assessment_null_workspace', gen_random_uuid()),
    ('review_a', gen_random_uuid()),
    ('review_workspace_b', gen_random_uuid()),
    ('review_org_b', gen_random_uuid()),
    ('review_cross_assessment', gen_random_uuid()),
    ('review_cross_process', gen_random_uuid()),
    ('review_deleted_parent', gen_random_uuid()),
    ('review_null_workspace', gen_random_uuid()),
    ('project_a', gen_random_uuid()),
    ('project_workspace_b', gen_random_uuid()),
    ('project_org_b', gen_random_uuid()),
    ('project_deleted', gen_random_uuid()),
    ('project_cross_source', gen_random_uuid()),
    ('project_null_workspace', gen_random_uuid()),
    ('document_a', gen_random_uuid()),
    ('document_workspace_b', gen_random_uuid()),
    ('document_org_b', gen_random_uuid()),
    ('document_deleted', gen_random_uuid()),
    ('document_cross_project', gen_random_uuid()),
    ('document_cross_source', gen_random_uuid()),
    ('document_json_payload', gen_random_uuid()),
    ('document_null_workspace', gen_random_uuid()),
    ('work_item_a', gen_random_uuid()),
    ('work_item_workspace_b', gen_random_uuid()),
    ('work_item_org_b', gen_random_uuid()),
    ('work_item_deleted', gen_random_uuid()),
    ('work_item_cross_project', gen_random_uuid()),
    ('work_item_cross_document', gen_random_uuid()),
    ('work_item_cross_source', gen_random_uuid()),
    ('work_item_null_workspace', gen_random_uuid());

CREATE TEMP TABLE m5_3a_2_metadata_checks (
    check_id TEXT PRIMARY KEY,
    passed BOOLEAN NOT NULL,
    failure_classification TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO m5_3a_2_metadata_checks (check_id, passed, failure_classification)
VALUES
    ('auth_uid_available', to_regprocedure('auth.uid()') IS NOT NULL, 'auth-uid-function-missing'),
    ('authenticated_role_exists', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'), 'authenticated-role-missing'),
    ('workspace_helper_exists', to_regprocedure('public.is_active_workspace_member(uuid, uuid)') IS NOT NULL, 'workspace-helper-missing');

INSERT INTO m5_3a_2_metadata_checks (check_id, passed, failure_classification)
SELECT
    table_name || '_exists',
    to_regclass('public.' || table_name) IS NOT NULL,
    table_name || '-table-missing'
FROM (VALUES
    ('assess_processes'),
    ('assessments'),
    ('assessment_review_events'),
    ('projects'),
    ('document_generations'),
    ('delivery_work_items')
) AS scoped_tables(table_name);

INSERT INTO m5_3a_2_metadata_checks (check_id, passed, failure_classification)
SELECT
    table_name || '_rls_enabled',
    EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = table_name
          AND c.relrowsecurity = TRUE
    ),
    table_name || '-rls-not-enabled'
FROM (VALUES
    ('assess_processes'),
    ('assessments'),
    ('assessment_review_events'),
    ('projects'),
    ('document_generations'),
    ('delivery_work_items')
) AS scoped_tables(table_name);

INSERT INTO m5_3a_2_metadata_checks (check_id, passed, failure_classification)
VALUES
    ('select_policy_count', (
        SELECT COUNT(*) = 6
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_2_%'
          AND tablename IN (
              'assess_processes',
              'assessments',
              'assessment_review_events',
              'projects',
              'document_generations',
              'delivery_work_items'
          )
          AND cmd = 'SELECT'
    ), 'select-policy-count-mismatch'),
    ('no_m5_3a_2_mutation_policy', NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_2_%'
          AND cmd <> 'SELECT'
    ), 'mutation-policy-present'),
    ('no_m5_3a_2_service_policy_target', NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_2_%'
          AND 'service_role' = ANY(roles)
    ), 'server-boundary-policy-target-leak'),
    ('workspace_helper_used_for_all_artifact_policies', (
        SELECT COUNT(*) = 6
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_2_%'
          AND cmd = 'SELECT'
          AND qual ILIKE '%is_active_workspace_member%'
    ), 'workspace-helper-policy-missing'),
    ('org_helper_not_used_for_artifact_policies', NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_2_%'
          AND qual ILIKE '%is_active_org_member%'
    ), 'org-helper-artifact-path-present'),
    ('json_payloads_not_authority', NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_2_%'
          AND (
              qual ILIKE '%metadata%'
              OR qual ILIKE '%artifacts%'
              OR qual ILIKE '%payload%'
              OR qual ILIKE '%source_lineage%'
          )
    ), 'json-payload-used-as-authority'),
    ('nullable_org_policy_guardrails_present', (
        SELECT COUNT(*) = 6
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_2_%'
          AND cmd = 'SELECT'
          AND qual ILIKE '%org_id IS NOT NULL%'
    ), 'nullable-org-policy-guardrail-missing'),
    ('nullable_workspace_policy_guardrails_present', (
        SELECT COUNT(*) = 6
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_2_%'
          AND cmd = 'SELECT'
          AND qual ILIKE '%workspace_id IS NOT NULL%'
    ), 'nullable-workspace-policy-guardrail-missing');

CREATE TEMP TABLE m5_3a_2_scenario_results (
    scenario_id TEXT PRIMARY KEY,
    scenario_kind TEXT NOT NULL CHECK (scenario_kind IN ('negative', 'positive', 'metadata')),
    expected_result TEXT NOT NULL CHECK (expected_result IN ('denied', 'allowed', 'present')),
    scenario_status TEXT NOT NULL CHECK (scenario_status IN ('passed', 'failed', 'blocked')),
    sanitized_classification TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT ON TABLE m5_3a_2_fixture_ids TO authenticated;
GRANT INSERT, SELECT ON TABLE m5_3a_2_scenario_results TO authenticated;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT
    local_id,
    'authenticated',
    'authenticated',
    fixture_label || '@m5-3a-2.local.invalid',
    '',
    NOW(),
    NOW(),
    NOW()
FROM m5_3a_2_fixture_ids
WHERE fixture_label LIKE 'user_%';

INSERT INTO public.profiles (id, email, status, created_at, updated_at)
SELECT
    local_id,
    fixture_label || '@m5-3a-2.local.invalid',
    'active',
    NOW(),
    NOW()
FROM m5_3a_2_fixture_ids
WHERE fixture_label LIKE 'user_%';

INSERT INTO public.organizations (id, name, slug, status, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), 'M5.3a-2 Local Org A', 'm5-3a-2-local-org-a', 'active', NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), 'M5.3a-2 Local Org B', 'm5-3a-2-local-org-b', 'active', NOW(), NOW());

INSERT INTO public.workspaces (id, org_id, name, slug, status, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), 'M5.3a-2 Workspace A', 'm5-3a-2-workspace-a', 'active', NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), 'M5.3a-2 Workspace B', 'm5-3a-2-workspace-b', 'active', NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), 'M5.3a-2 Workspace Org B', 'm5-3a-2-workspace-org-b', 'active', NOW(), NOW());

INSERT INTO public.roles (id, org_id, workspace_id, name, slug, scope, permissions, status, is_system, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), NULL, 'M5.3a-2 Org A Role', 'm5-3a-2-org-a-role', 'organization', '[]'::jsonb, 'active', false, NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'M5.3a-2 Workspace A Role', 'm5-3a-2-workspace-a-role', 'workspace', '[]'::jsonb, 'active', false, NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), 'M5.3a-2 Workspace B Role', 'm5-3a-2-workspace-b-role', 'workspace', '[]'::jsonb, 'active', false, NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), NULL, 'M5.3a-2 Org B Role', 'm5-3a-2-org-b-role', 'organization', '[]'::jsonb, 'active', false, NOW(), NOW());

INSERT INTO public.organization_members (org_id, user_id, role_id, status, joined_at, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_org_a'), 'active', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_disabled_org_member'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_org_a'), 'disabled', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_disabled_workspace_member'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_org_a'), 'active', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_org_b_member'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_org_b'), 'active', NOW(), NOW(), NOW());

INSERT INTO public.workspace_memberships (org_id, workspace_id, user_id, role_id, status, joined_at, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_workspace_a'), 'active', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_disabled_workspace_member'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'role_workspace_a'), 'disabled', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_org_b_member'), NULL, 'active', NOW(), NOW(), NOW());

INSERT INTO public.assess_processes (id, org_id, workspace_id, name, status, created_at, updated_at, deleted_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'M5.3a-2 Process A', 'Not Started', NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), 'M5.3a-2 Process B', 'Not Started', NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_org_b'), 'M5.3a-2 Process Org B', 'Not Started', NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_deleted'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'M5.3a-2 Process Deleted', 'Not Started', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_null_workspace'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), NULL, 'M5.3a-2 Process Null Workspace', 'Not Started', NOW(), NOW(), NULL);

INSERT INTO public.assessments (id, process_id, org_id, workspace_id, status, metadata, responses, evidence_items, assumptions, completion_by_section, review, created_at, updated_at, deleted_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'Not Started', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), 'Not Started', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_org_b'), 'Not Started', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_deleted'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'Not Started', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_cross_process'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'Not Started', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_deleted_process'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_deleted'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'Not Started', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_null_workspace'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), NULL, 'Not Started', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL);

INSERT INTO public.assessment_review_events (id, org_id, workspace_id, assessment_id, process_id, actor_id, event_type, status, payload, created_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), 'Comment', 'Not Started', '{}'::jsonb, NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), 'Comment', 'Not Started', '{}'::jsonb, NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_org_b_member'), 'Comment', 'Not Started', '{}'::jsonb, NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_cross_assessment'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), 'Comment', 'Not Started', '{}'::jsonb, NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_cross_process'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), 'Comment', 'Not Started', '{}'::jsonb, NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_deleted_parent'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_deleted'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_deleted'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), 'Comment', 'Not Started', '{}'::jsonb, NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_null_workspace'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), NULL, (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), 'Comment', 'Not Started', '{}'::jsonb, NOW());

INSERT INTO public.projects (id, org_id, workspace_id, name, source_process_id, source_assessment_id, status, metadata, created_at, updated_at, deleted_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'M5.3a-2 Project A', (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a'), 'active', '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), 'M5.3a-2 Project B', (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), 'active', '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_org_b'), 'M5.3a-2 Project Org B', (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_org_b'), 'active', '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_deleted'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'M5.3a-2 Project Deleted', NULL, NULL, 'active', '{}'::jsonb, NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_cross_source'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), 'M5.3a-2 Project Cross Source', (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), 'active', '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_null_workspace'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), NULL, 'M5.3a-2 Project Null Workspace', NULL, NULL, 'active', '{}'::jsonb, NOW(), NOW(), NULL);

INSERT INTO public.document_generations (id, org_id, workspace_id, project_id, template_id, artifacts, status, source_process_id, source_assessment_id, created_at, updated_at, deleted_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), 'm5-3a-2-template', '{}'::jsonb, 'generated', (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a'), NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_workspace_b'), 'm5-3a-2-template', '{}'::jsonb, 'generated', (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_org_b'), 'm5-3a-2-template', '{}'::jsonb, 'generated', (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_org_b'), NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_deleted'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), 'm5-3a-2-template', '{}'::jsonb, 'generated', NULL, NULL, NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_cross_project'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_workspace_b'), 'm5-3a-2-template', '{}'::jsonb, 'generated', NULL, NULL, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_cross_source'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), 'm5-3a-2-template', '{}'::jsonb, 'generated', (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_json_payload'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_workspace_b'), 'm5-3a-2-template', '{"workspace_hint":"workspace_a"}'::jsonb, 'generated', NULL, NULL, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_null_workspace'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), NULL, (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), 'm5-3a-2-template', '{}'::jsonb, 'generated', NULL, NULL, NOW(), NOW(), NULL);

INSERT INTO public.delivery_work_items (id, org_id, workspace_id, project_id, document_generation_id, source_process_id, source_assessment_id, title, status, priority, type, source_lineage, metadata, created_at, updated_at, deleted_at)
VALUES
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a'), 'M5.3a-2 Work Item A', 'To Do', 'Medium', 'Task', '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), 'M5.3a-2 Work Item B', 'To Do', 'Medium', 'Task', '{"workspace_hint":"workspace_a"}'::jsonb, '{"workspace_hint":"workspace_a"}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_org_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_org_b'), 'M5.3a-2 Work Item Org B', 'To Do', 'Medium', 'Task', '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_deleted'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), NULL, NULL, NULL, 'M5.3a-2 Work Item Deleted', 'To Do', 'Medium', 'Task', '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_cross_project'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_workspace_b'), NULL, NULL, NULL, 'M5.3a-2 Work Item Cross Project', 'To Do', 'Medium', 'Task', '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_cross_document'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_workspace_b'), NULL, NULL, 'M5.3a-2 Work Item Cross Document', 'To Do', 'Medium', 'Task', '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_cross_source'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'workspace_a'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), NULL, (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'), 'M5.3a-2 Work Item Cross Source', 'To Do', 'Medium', 'Task', '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL),
    ((SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_null_workspace'), (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'org_a'), NULL, (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a'), NULL, NULL, NULL, 'M5.3a-2 Work Item Null Workspace', 'To Do', 'Medium', 'Task', '{}'::jsonb, '{}'::jsonb, NOW(), NOW(), NULL);

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), TRUE);
SET LOCAL ROLE authenticated;

INSERT INTO m5_3a_2_scenario_results
SELECT 'active_member_reads_assess_processes', 'positive', 'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.assess_processes WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.assess_processes WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_a')) = 1 THEN 'assess-process-readable' ELSE 'assess-process-not-readable' END;

INSERT INTO m5_3a_2_scenario_results
SELECT 'active_member_reads_assessments', 'positive', 'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.assessments WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.assessments WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_a')) = 1 THEN 'assessment-readable' ELSE 'assessment-not-readable' END;

INSERT INTO m5_3a_2_scenario_results
SELECT 'active_member_reads_review_events', 'positive', 'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.assessment_review_events WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_a')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.assessment_review_events WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_a')) = 1 THEN 'review-event-readable' ELSE 'review-event-not-readable' END;

INSERT INTO m5_3a_2_scenario_results
SELECT 'active_member_reads_projects', 'positive', 'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.projects WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.projects WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_a')) = 1 THEN 'project-readable' ELSE 'project-not-readable' END;

INSERT INTO m5_3a_2_scenario_results
SELECT 'active_member_reads_document_generations', 'positive', 'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_a')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_a')) = 1 THEN 'document-generation-readable' ELSE 'document-generation-not-readable' END;

INSERT INTO m5_3a_2_scenario_results
SELECT 'active_member_reads_delivery_work_items', 'positive', 'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_a')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_a')) = 1 THEN 'delivery-work-item-readable' ELSE 'delivery-work-item-not-readable' END;

INSERT INTO m5_3a_2_scenario_results
SELECT 'cross_org_artifacts_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assess_processes WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_org_b'))
        + (SELECT COUNT(*) FROM public.assessments WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_org_b'))
        + (SELECT COUNT(*) FROM public.assessment_review_events WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_org_b'))
        + (SELECT COUNT(*) FROM public.projects WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_org_b'))
        + (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_org_b'))
        + (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_org_b'))
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'cross-org-denied';

INSERT INTO m5_3a_2_scenario_results
SELECT 'cross_workspace_artifacts_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assess_processes WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_workspace_b'))
        + (SELECT COUNT(*) FROM public.assessments WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_workspace_b'))
        + (SELECT COUNT(*) FROM public.assessment_review_events WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_workspace_b'))
        + (SELECT COUNT(*) FROM public.projects WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_workspace_b'))
        + (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_workspace_b'))
        + (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_workspace_b'))
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'cross-workspace-denied';

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_2_scenario_results
SELECT 'anonymous_artifacts_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assess_processes)
        + (SELECT COUNT(*) FROM public.assessments)
        + (SELECT COUNT(*) FROM public.assessment_review_events)
        + (SELECT COUNT(*) FROM public.projects)
        + (SELECT COUNT(*) FROM public.document_generations)
        + (SELECT COUNT(*) FROM public.delivery_work_items)
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'anonymous-denied';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_non_member'), TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_2_scenario_results
SELECT 'authenticated_non_member_artifacts_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assess_processes)
        + (SELECT COUNT(*) FROM public.assessments)
        + (SELECT COUNT(*) FROM public.assessment_review_events)
        + (SELECT COUNT(*) FROM public.projects)
        + (SELECT COUNT(*) FROM public.document_generations)
        + (SELECT COUNT(*) FROM public.delivery_work_items)
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'non-member-denied';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_disabled_org_member'), TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_2_scenario_results
SELECT 'disabled_org_member_artifacts_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assess_processes)
        + (SELECT COUNT(*) FROM public.assessments)
        + (SELECT COUNT(*) FROM public.assessment_review_events)
        + (SELECT COUNT(*) FROM public.projects)
        + (SELECT COUNT(*) FROM public.document_generations)
        + (SELECT COUNT(*) FROM public.delivery_work_items)
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'disabled-org-member-denied';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_disabled_workspace_member'), TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_2_scenario_results
SELECT 'disabled_workspace_member_artifacts_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assess_processes)
        + (SELECT COUNT(*) FROM public.assessments)
        + (SELECT COUNT(*) FROM public.assessment_review_events)
        + (SELECT COUNT(*) FROM public.projects)
        + (SELECT COUNT(*) FROM public.document_generations)
        + (SELECT COUNT(*) FROM public.delivery_work_items)
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'disabled-workspace-member-denied';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_2_fixture_ids WHERE fixture_label = 'user_active_member'), TRUE);
SET LOCAL ROLE authenticated;

INSERT INTO m5_3a_2_scenario_results
SELECT 'nullable_workspace_artifacts_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assess_processes WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_null_workspace'))
        + (SELECT COUNT(*) FROM public.assessments WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_null_workspace'))
        + (SELECT COUNT(*) FROM public.assessment_review_events WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_null_workspace'))
        + (SELECT COUNT(*) FROM public.projects WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_null_workspace'))
        + (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_null_workspace'))
        + (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_null_workspace'))
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'nullable-workspace-denied';

INSERT INTO m5_3a_2_scenario_results
SELECT 'deleted_artifacts_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assess_processes WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'process_deleted'))
        + (SELECT COUNT(*) FROM public.assessments WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_deleted'))
        + (SELECT COUNT(*) FROM public.assessment_review_events WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_deleted_parent'))
        + (SELECT COUNT(*) FROM public.projects WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_deleted'))
        + (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_deleted'))
        + (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_deleted'))
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'deleted-artifacts-denied';

INSERT INTO m5_3a_2_scenario_results
SELECT 'cross_workspace_parent_source_denied', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.assessments WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_cross_process'))
        + (SELECT COUNT(*) FROM public.assessments WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'assessment_deleted_process'))
        + (SELECT COUNT(*) FROM public.assessment_review_events WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_cross_assessment'))
        + (SELECT COUNT(*) FROM public.assessment_review_events WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'review_cross_process'))
        + (SELECT COUNT(*) FROM public.projects WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'project_cross_source'))
        + (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_cross_project'))
        + (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_cross_source'))
        + (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_cross_project'))
        + (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_cross_document'))
        + (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_cross_source'))
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'cross-workspace-parent-source-denied';

INSERT INTO m5_3a_2_scenario_results
SELECT 'json_payloads_and_lineage_do_not_grant_access', 'negative', 'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.document_generations WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'document_json_payload'))
        + (SELECT COUNT(*) FROM public.delivery_work_items WHERE id = (SELECT local_id FROM m5_3a_2_fixture_ids WHERE fixture_label = 'work_item_workspace_b'))
    ) = 0 THEN 'passed' ELSE 'failed' END,
    'json-lineage-non-authority';

RESET ROLE;

INSERT INTO m5_3a_2_scenario_results
SELECT 'nullable_org_policy_guardrails_present', 'metadata', 'present',
    CASE WHEN EXISTS (
        SELECT 1
        FROM m5_3a_2_metadata_checks
        WHERE check_id = 'nullable_org_policy_guardrails_present'
          AND passed = TRUE
    ) THEN 'passed' ELSE 'failed' END,
    'nullable-org-policy-guardrail';

INSERT INTO m5_3a_2_scenario_results
SELECT 'orphan_parent_policy_guardrails_present', 'metadata', 'present',
    CASE WHEN (
        SELECT COUNT(*) = 5
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname IN (
              'm5_3a_2_assessments_select_workspace_member',
              'm5_3a_2_assessment_review_events_select_workspace_member',
              'm5_3a_2_document_generations_select_workspace_member',
              'm5_3a_2_delivery_work_items_select_workspace_member',
              'm5_3a_2_projects_select_workspace_member'
          )
          AND qual ILIKE '%EXISTS%'
    ) THEN 'passed' ELSE 'failed' END,
    'parent-source-policy-guardrail';

WITH scenario_counts AS (
    SELECT
        COUNT(*)::INT AS scenarios_declared,
        COUNT(*) FILTER (WHERE scenario_status <> 'blocked')::INT AS scenarios_executed,
        COUNT(*) FILTER (WHERE scenario_status = 'passed')::INT AS pass_count,
        COUNT(*) FILTER (WHERE scenario_status = 'failed')::INT AS scenario_fail_count,
        COUNT(*) FILTER (WHERE scenario_status = 'blocked')::INT AS blocked_count
    FROM m5_3a_2_scenario_results
), metadata_counts AS (
    SELECT COUNT(*) FILTER (WHERE passed = FALSE)::INT AS metadata_fail_count
    FROM m5_3a_2_metadata_checks
), classifications AS (
    SELECT sanitized_classification
    FROM m5_3a_2_scenario_results
    WHERE scenario_status <> 'passed'
    UNION
    SELECT failure_classification
    FROM m5_3a_2_metadata_checks
    WHERE passed = FALSE
)
SELECT
    scenario_counts.scenarios_declared,
    scenario_counts.scenarios_executed,
    scenario_counts.pass_count,
    (scenario_counts.scenario_fail_count + metadata_counts.metadata_fail_count)::INT AS fail_count,
    scenario_counts.blocked_count,
    (
        scenario_counts.scenarios_declared = 18
        AND scenario_counts.scenarios_executed = 18
        AND scenario_counts.pass_count = 18
        AND scenario_counts.scenario_fail_count = 0
        AND scenario_counts.blocked_count = 0
        AND metadata_counts.metadata_fail_count = 0
    ) AS artifact_select_isolation_verified,
    CASE
        WHEN scenario_counts.scenarios_declared = 18
         AND scenario_counts.scenarios_executed = 18
         AND scenario_counts.pass_count = 18
         AND scenario_counts.scenario_fail_count = 0
         AND scenario_counts.blocked_count = 0
         AND metadata_counts.metadata_fail_count = 0
            THEN 'local-artifact-select-isolation-verified'
        ELSE 'local-artifact-assertions-executed-with-failures'
    END AS harness_status,
    COALESCE(string_agg(classifications.sanitized_classification, ',' ORDER BY classifications.sanitized_classification), '') AS sanitized_classifications
FROM scenario_counts
CROSS JOIN metadata_counts
LEFT JOIN classifications ON TRUE
GROUP BY
    scenario_counts.scenarios_declared,
    scenario_counts.scenarios_executed,
    scenario_counts.pass_count,
    scenario_counts.scenario_fail_count,
    scenario_counts.blocked_count,
    metadata_counts.metadata_fail_count;

ROLLBACK;
