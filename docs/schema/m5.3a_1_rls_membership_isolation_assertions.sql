-- M5.3a-1 executable local RLS assertion method.
--
-- Local-only assertion SQL for the six approved identity and membership tables.
-- This file creates transaction-scoped local fixtures with generated UUIDs,
-- exercises SELECT-only policies through local session-claim simulation, returns
-- a counts-only summary row, and rolls back all fixture rows.
--
-- It does not create helper functions, RLS policies, migrations, durable seed
-- data, production/demo/runtime data, backfill, constraint validation, artifact
-- assertions, provider assertions, legacy table assertions, mutation checks, or
-- row payload output.

BEGIN;

SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

CREATE TEMP TABLE m5_3a_1_fixture_ids (
    actor_label TEXT PRIMARY KEY,
    local_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO m5_3a_1_fixture_ids (actor_label, local_id)
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
    ('role_system', gen_random_uuid()),
    ('role_workspace_system_flag', gen_random_uuid());

CREATE TEMP TABLE m5_3a_1_metadata_checks (
    check_id TEXT PRIMARY KEY,
    passed BOOLEAN NOT NULL,
    failure_classification TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO m5_3a_1_metadata_checks (check_id, passed, failure_classification)
VALUES
    ('auth_uid_available', to_regprocedure('auth.uid()') IS NOT NULL, 'auth-uid-function-missing'),
    ('authenticated_role_exists', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'), 'authenticated-role-missing'),
    ('profiles_exists', to_regclass('public.profiles') IS NOT NULL, 'profiles-table-missing'),
    ('organizations_exists', to_regclass('public.organizations') IS NOT NULL, 'organizations-table-missing'),
    ('workspaces_exists', to_regclass('public.workspaces') IS NOT NULL, 'workspaces-table-missing'),
    ('roles_exists', to_regclass('public.roles') IS NOT NULL, 'roles-table-missing'),
    ('organization_members_exists', to_regclass('public.organization_members') IS NOT NULL, 'organization-members-table-missing'),
    ('workspace_memberships_exists', to_regclass('public.workspace_memberships') IS NOT NULL, 'workspace-memberships-table-missing'),
    ('org_helper_exists', to_regprocedure('public.is_active_org_member(uuid)') IS NOT NULL, 'org-helper-missing'),
    ('workspace_helper_exists', to_regprocedure('public.is_active_workspace_member(uuid, uuid)') IS NOT NULL, 'workspace-helper-missing');

INSERT INTO m5_3a_1_metadata_checks (check_id, passed, failure_classification)
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
    ('profiles'),
    ('organizations'),
    ('workspaces'),
    ('roles'),
    ('organization_members'),
    ('workspace_memberships')
) AS scoped_tables(table_name);

INSERT INTO m5_3a_1_metadata_checks (check_id, passed, failure_classification)
VALUES
    ('org_helper_stable_definer', EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'is_active_org_member'
          AND p.provolatile = 's'
          AND p.prosecdef = TRUE
    ), 'org-helper-hardening-mismatch'),
    ('workspace_helper_stable_definer', EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'is_active_workspace_member'
          AND p.provolatile = 's'
          AND p.prosecdef = TRUE
    ), 'workspace-helper-hardening-mismatch'),
    ('org_helper_search_path_hardened', EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'is_active_org_member'
          AND COALESCE(p.proconfig @> ARRAY['search_path=pg_catalog']::TEXT[], FALSE)
    ), 'org-helper-search-path-mismatch'),
    ('workspace_helper_search_path_hardened', EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'is_active_workspace_member'
          AND COALESCE(p.proconfig @> ARRAY['search_path=pg_catalog']::TEXT[], FALSE)
    ), 'workspace-helper-search-path-mismatch'),
    ('public_helper_execute_denied', NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE n.nspname = 'public'
          AND p.proname IN ('is_active_org_member', 'is_active_workspace_member')
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ), 'public-helper-execute-leak'),
    ('authenticated_helper_execute', EXISTS (
        SELECT 1
        FROM pg_roles r
        WHERE r.rolname = 'authenticated'
          AND has_function_privilege(r.rolname, 'public.is_active_org_member(uuid)', 'EXECUTE')
          AND has_function_privilege(r.rolname, 'public.is_active_workspace_member(uuid, uuid)', 'EXECUTE')
    ), 'authenticated-helper-execute-missing'),
    ('anon_helper_execute_denied', NOT EXISTS (
        SELECT 1
        FROM pg_roles r
        WHERE r.rolname = 'anon'
          AND (
              has_function_privilege(r.rolname, 'public.is_active_org_member(uuid)', 'EXECUTE')
              OR has_function_privilege(r.rolname, 'public.is_active_workspace_member(uuid, uuid)', 'EXECUTE')
          )
    ), 'anon-helper-execute-leak'),
    ('select_policy_count', (
        SELECT COUNT(*) = 6
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_1_%'
          AND tablename IN ('profiles', 'organizations', 'workspaces', 'roles', 'organization_members', 'workspace_memberships')
          AND cmd = 'SELECT'
    ), 'select-policy-count-mismatch'),
    ('no_m5_3a_1_mutation_policy', NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_1_%'
          AND tablename IN ('profiles', 'organizations', 'workspaces', 'roles', 'organization_members', 'workspace_memberships')
          AND cmd <> 'SELECT'
    ), 'mutation-policy-present'),
    ('no_m5_3a_1_service_policy_target', NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'm5_3a_1_%'
          AND tablename IN ('profiles', 'organizations', 'workspaces', 'roles', 'organization_members', 'workspace_memberships')
          AND 'service_role' = ANY(roles)
    ), 'server-boundary-policy-target-leak');

CREATE TEMP TABLE m5_3a_1_scenario_results (
    scenario_id TEXT PRIMARY KEY,
    scenario_kind TEXT NOT NULL CHECK (scenario_kind IN ('negative', 'positive')),
    expected_result TEXT NOT NULL CHECK (expected_result IN ('denied', 'allowed')),
    scenario_status TEXT NOT NULL CHECK (scenario_status IN ('passed', 'failed', 'blocked')),
    sanitized_classification TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT ON TABLE m5_3a_1_fixture_ids TO authenticated;
GRANT INSERT, SELECT ON TABLE m5_3a_1_scenario_results TO authenticated;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT
    local_id,
    'authenticated',
    'authenticated',
    actor_label || '@m5-3a-1.local.invalid',
    '',
    NOW(),
    NOW(),
    NOW()
FROM m5_3a_1_fixture_ids
WHERE actor_label LIKE 'user_%';

INSERT INTO public.profiles (id, email, status, created_at, updated_at)
SELECT
    local_id,
    actor_label || '@m5-3a-1.local.invalid',
    'active',
    NOW(),
    NOW()
FROM m5_3a_1_fixture_ids
WHERE actor_label LIKE 'user_%';

INSERT INTO public.organizations (id, name, slug, status, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), 'M5.3a-1 Local Org A', 'm5-3a-1-local-org-a', 'active', NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b'), 'M5.3a-1 Local Org B', 'm5-3a-1-local-org-b', 'active', NOW(), NOW());

INSERT INTO public.workspaces (id, org_id, name, slug, status, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), 'M5.3a-1 Workspace A', 'm5-3a-1-workspace-a', 'active', NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_b'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), 'M5.3a-1 Workspace B', 'm5-3a-1-workspace-b', 'active', NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_org_b'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b'), 'M5.3a-1 Workspace Org B', 'm5-3a-1-workspace-org-b', 'active', NOW(), NOW());

INSERT INTO public.roles (id, org_id, workspace_id, name, slug, scope, permissions, status, is_system, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), NULL, 'M5.3a-1 Org A Role', 'm5-3a-1-org-a-role', 'organization', '[]'::jsonb, 'active', false, NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'), 'M5.3a-1 Workspace A Role', 'm5-3a-1-workspace-a-role', 'workspace', '[]'::jsonb, 'active', false, NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_b'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_b'), 'M5.3a-1 Workspace B Role', 'm5-3a-1-workspace-b-role', 'workspace', '[]'::jsonb, 'active', false, NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_org_b'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b'), NULL, 'M5.3a-1 Org B Role', 'm5-3a-1-org-b-role', 'organization', '[]'::jsonb, 'active', false, NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_system'), NULL, NULL, 'M5.3a-1 System Role', 'm5-3a-1-system-role', 'system', '[]'::jsonb, 'active', true, NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_system_flag'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'), 'M5.3a-1 Workspace System Flag Role', 'm5-3a-1-workspace-system-flag-role', 'workspace', '[]'::jsonb, 'active', true, NOW(), NOW());

INSERT INTO public.organization_members (org_id, user_id, role_id, status, joined_at, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_org_a'), 'active', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_disabled_org_member'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_org_a'), 'disabled', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_disabled_workspace_member'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_org_a'), 'active', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_org_b_member'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_org_b'), 'active', NOW(), NOW(), NOW());

INSERT INTO public.workspace_memberships (org_id, workspace_id, user_id, role_id, status, joined_at, created_at, updated_at)
VALUES
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_a'), 'active', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_disabled_workspace_member'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_a'), 'disabled', NOW(), NOW(), NOW()),
    ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_org_b'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_org_b_member'), NULL, 'active', NOW(), NOW(), NOW());

SELECT set_config('request.jwt.claim.sub', '', TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_1_scenario_results
SELECT
    'anonymous_denied',
    'negative',
    'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.profiles)
        + (SELECT COUNT(*) FROM public.organizations)
        + (SELECT COUNT(*) FROM public.workspaces)
        + (SELECT COUNT(*) FROM public.roles)
        + (SELECT COUNT(*) FROM public.organization_members)
        + (SELECT COUNT(*) FROM public.workspace_memberships)
    ) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (
        (SELECT COUNT(*) FROM public.profiles)
        + (SELECT COUNT(*) FROM public.organizations)
        + (SELECT COUNT(*) FROM public.workspaces)
        + (SELECT COUNT(*) FROM public.roles)
        + (SELECT COUNT(*) FROM public.organization_members)
        + (SELECT COUNT(*) FROM public.workspace_memberships)
    ) = 0 THEN 'anonymous-denied' ELSE 'anonymous-access-leak' END;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_non_member'), TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_1_scenario_results
SELECT
    'authenticated_non_member_denied',
    'negative',
    'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.organizations)
        + (SELECT COUNT(*) FROM public.workspaces)
        + (SELECT COUNT(*) FROM public.roles)
        + (SELECT COUNT(*) FROM public.organization_members)
        + (SELECT COUNT(*) FROM public.workspace_memberships)
    ) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (
        (SELECT COUNT(*) FROM public.organizations)
        + (SELECT COUNT(*) FROM public.workspaces)
        + (SELECT COUNT(*) FROM public.roles)
        + (SELECT COUNT(*) FROM public.organization_members)
        + (SELECT COUNT(*) FROM public.workspace_memberships)
    ) = 0 THEN 'non-member-denied' ELSE 'non-member-access-leak' END;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_disabled_org_member'), TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_1_scenario_results
SELECT
    'disabled_org_member_denied',
    'negative',
    'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.organizations)
        + (SELECT COUNT(*) FROM public.workspaces)
        + (SELECT COUNT(*) FROM public.roles)
        + (SELECT COUNT(*) FROM public.organization_members)
        + (SELECT COUNT(*) FROM public.workspace_memberships)
    ) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (
        (SELECT COUNT(*) FROM public.organizations)
        + (SELECT COUNT(*) FROM public.workspaces)
        + (SELECT COUNT(*) FROM public.roles)
        + (SELECT COUNT(*) FROM public.organization_members)
        + (SELECT COUNT(*) FROM public.workspace_memberships)
    ) = 0 THEN 'disabled-org-member-denied' ELSE 'disabled-org-member-access-leak' END;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_disabled_workspace_member'), TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_1_scenario_results
SELECT
    'disabled_workspace_member_denied',
    'negative',
    'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.workspaces WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'))
        + (SELECT COUNT(*) FROM public.workspace_memberships WHERE workspace_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'))
        + (SELECT COUNT(*) FROM public.roles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_a'))
    ) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (
        (SELECT COUNT(*) FROM public.workspaces WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'))
        + (SELECT COUNT(*) FROM public.workspace_memberships WHERE workspace_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a'))
        + (SELECT COUNT(*) FROM public.roles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_a'))
    ) = 0 THEN 'disabled-workspace-member-denied' ELSE 'disabled-workspace-member-access-leak' END;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT local_id::TEXT FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member'), TRUE);
SET LOCAL ROLE authenticated;
INSERT INTO m5_3a_1_scenario_results
SELECT
    'cross_org_organization_metadata_denied',
    'negative',
    'denied',
    CASE WHEN (SELECT COUNT(*) FROM public.organizations WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b')) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.organizations WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b')) = 0 THEN 'cross-org-denied' ELSE 'cross-org-access-leak' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'cross_org_membership_metadata_denied',
    'negative',
    'denied',
    CASE WHEN (SELECT COUNT(*) FROM public.organization_members WHERE org_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b')) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.organization_members WHERE org_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_b')) = 0 THEN 'cross-org-membership-denied' ELSE 'cross-org-membership-leak' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'cross_workspace_membership_metadata_denied',
    'negative',
    'denied',
    CASE WHEN (SELECT COUNT(*) FROM public.workspace_memberships WHERE workspace_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_b')) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.workspace_memberships WHERE workspace_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_b')) = 0 THEN 'cross-workspace-membership-denied' ELSE 'cross-workspace-membership-leak' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'cross_workspace_role_metadata_denied',
    'negative',
    'denied',
    CASE WHEN (SELECT COUNT(*) FROM public.roles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_b')) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.roles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_b')) = 0 THEN 'cross-workspace-role-denied' ELSE 'cross-workspace-role-leak' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'system_role_visibility_denied',
    'negative',
    'denied',
    CASE WHEN (
        (SELECT COUNT(*) FROM public.roles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_system'))
        + (SELECT COUNT(*) FROM public.roles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_system_flag'))
    ) = 0 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (
        (SELECT COUNT(*) FROM public.roles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_system'))
        + (SELECT COUNT(*) FROM public.roles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_system_flag'))
    ) = 0 THEN 'system-role-and-flag-denied' ELSE 'system-role-flag-leak' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'own_active_profile_readable',
    'positive',
    'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.profiles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.profiles WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member')) = 1 THEN 'own-profile-readable' ELSE 'own-profile-not-readable' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'own_active_org_membership_readable',
    'positive',
    'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.organization_members WHERE org_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a') AND user_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.organization_members WHERE org_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a') AND user_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member')) = 1 THEN 'own-org-membership-readable' ELSE 'own-org-membership-not-readable' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'own_active_workspace_membership_readable',
    'positive',
    'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.workspace_memberships WHERE workspace_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a') AND user_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.workspace_memberships WHERE workspace_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a') AND user_id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'user_active_member')) = 1 THEN 'own-workspace-membership-readable' ELSE 'own-workspace-membership-not-readable' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'active_org_metadata_readable',
    'positive',
    'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.organizations WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.organizations WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'org_a')) = 1 THEN 'active-org-metadata-readable' ELSE 'active-org-metadata-not-readable' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'active_workspace_metadata_readable',
    'positive',
    'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.workspaces WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a')) = 1 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.workspaces WHERE id = (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'workspace_a')) = 1 THEN 'active-workspace-metadata-readable' ELSE 'active-workspace-metadata-not-readable' END;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'scoped_role_metadata_readable',
    'positive',
    'allowed',
    CASE WHEN (SELECT COUNT(*) FROM public.roles WHERE id IN ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_a'))) = 2 THEN 'passed' ELSE 'failed' END,
    CASE WHEN (SELECT COUNT(*) FROM public.roles WHERE id IN ((SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_org_a'), (SELECT local_id FROM m5_3a_1_fixture_ids WHERE actor_label = 'role_workspace_a'))) = 2 THEN 'scoped-role-metadata-readable' ELSE 'scoped-role-metadata-not-readable' END;
RESET ROLE;

INSERT INTO m5_3a_1_scenario_results
SELECT
    'service_role_not_browser_callable',
    'negative',
    'denied',
    CASE WHEN (
        NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('profiles', 'organizations', 'workspaces', 'roles', 'organization_members', 'workspace_memberships')
              AND policyname LIKE 'm5_3a_1_%'
              AND 'service_role' = ANY(roles)
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_roles r
            WHERE r.rolname = 'anon'
              AND (
                  has_function_privilege(r.rolname, 'public.is_active_org_member(uuid)', 'EXECUTE')
                  OR has_function_privilege(r.rolname, 'public.is_active_workspace_member(uuid, uuid)', 'EXECUTE')
              )
        )
    ) THEN 'passed' ELSE 'failed' END,
    CASE WHEN (
        NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('profiles', 'organizations', 'workspaces', 'roles', 'organization_members', 'workspace_memberships')
              AND policyname LIKE 'm5_3a_1_%'
              AND 'service_role' = ANY(roles)
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_roles r
            WHERE r.rolname = 'anon'
              AND (
                  has_function_privilege(r.rolname, 'public.is_active_org_member(uuid)', 'EXECUTE')
                  OR has_function_privilege(r.rolname, 'public.is_active_workspace_member(uuid, uuid)', 'EXECUTE')
              )
        )
    ) THEN 'server-boundary-not-browser-callable' ELSE 'server-boundary-leak' END;

WITH scenario_counts AS (
    SELECT
        COUNT(*)::INT AS scenarios_declared,
        COUNT(*) FILTER (WHERE scenario_status <> 'blocked')::INT AS scenarios_executed,
        COUNT(*) FILTER (WHERE scenario_status = 'passed')::INT AS pass_count,
        COUNT(*) FILTER (WHERE scenario_status = 'failed')::INT AS scenario_fail_count,
        COUNT(*) FILTER (WHERE scenario_status = 'blocked')::INT AS blocked_count
    FROM m5_3a_1_scenario_results
), metadata_counts AS (
    SELECT COUNT(*) FILTER (WHERE passed = FALSE)::INT AS metadata_fail_count
    FROM m5_3a_1_metadata_checks
), classifications AS (
    SELECT sanitized_classification
    FROM m5_3a_1_scenario_results
    WHERE scenario_status <> 'passed'
    UNION
    SELECT failure_classification
    FROM m5_3a_1_metadata_checks
    WHERE passed = FALSE
)
SELECT
    scenario_counts.scenarios_declared,
    scenario_counts.scenarios_executed,
    scenario_counts.pass_count,
    (scenario_counts.scenario_fail_count + metadata_counts.metadata_fail_count)::INT AS fail_count,
    scenario_counts.blocked_count,
    (
        scenario_counts.scenarios_declared = 16
        AND scenario_counts.scenarios_executed = 16
        AND scenario_counts.pass_count = 16
        AND scenario_counts.scenario_fail_count = 0
        AND scenario_counts.blocked_count = 0
        AND metadata_counts.metadata_fail_count = 0
    ) AS tenant_isolation_verified,
    CASE
        WHEN scenario_counts.scenarios_declared = 16
         AND scenario_counts.scenarios_executed = 16
         AND scenario_counts.pass_count = 16
         AND scenario_counts.scenario_fail_count = 0
         AND scenario_counts.blocked_count = 0
         AND metadata_counts.metadata_fail_count = 0
            THEN 'local-tenant-isolation-verified'
        ELSE 'local-db-assertions-executed-with-failures'
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