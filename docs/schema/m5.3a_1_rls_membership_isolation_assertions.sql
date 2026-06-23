-- M5.3a-1d executable local RLS assertion method.
--
-- This file is local-only assertion plumbing for the M5.3a-1 harness. It is
-- intentionally limited to membership/identity scope and current baseline
-- checks. It does not create RLS helpers, RLS policies, tenant policy SQL,
-- migrations, durable seed data, production/demo/runtime rows, backfill, or
-- constraint validation.
--
-- The current M5.3a-1d baseline can prove that the runner executes sanitized,
-- transaction-scoped local SQL assertions. It cannot prove final tenant
-- isolation until AP-approved helpers and SELECT policies exist.
--
-- Output rules are enforced by the JS runner. This SQL must not return row
-- payloads, fixture values, local target values, session claims, or secrets.

BEGIN;

SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

CREATE TEMP TABLE m5_3a_1_local_fixture_ids (
    actor_label TEXT PRIMARY KEY,
    local_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO m5_3a_1_local_fixture_ids (actor_label, local_id)
VALUES
    ('active_member', gen_random_uuid()),
    ('disabled_org_member', gen_random_uuid()),
    ('disabled_workspace_member', gen_random_uuid()),
    ('non_member', gen_random_uuid()),
    ('workspace_a_member', gen_random_uuid()),
    ('org_a_member', gen_random_uuid());

CREATE TEMP TABLE m5_3a_1_auth_simulation_checks (
    check_id TEXT PRIMARY KEY,
    passed BOOLEAN NOT NULL,
    failure_classification TEXT NOT NULL
) ON COMMIT DROP;

SELECT set_config(
    'request.jwt.claim.sub',
    (SELECT local_id::TEXT FROM m5_3a_1_local_fixture_ids WHERE actor_label = 'active_member'),
    TRUE
);

INSERT INTO m5_3a_1_auth_simulation_checks (check_id, passed, failure_classification)
VALUES (
    'local_session_claim_can_be_set',
    current_setting('request.jwt.claim.sub', TRUE) IS NOT NULL,
    'local-session-claim-simulation-unavailable'
);

SELECT set_config('request.jwt.claim.sub', '', TRUE);

INSERT INTO m5_3a_1_auth_simulation_checks (check_id, passed, failure_classification)
VALUES (
    'anonymous_claim_can_be_cleared',
    COALESCE(current_setting('request.jwt.claim.sub', TRUE), '') = '',
    'anonymous-session-simulation-unavailable'
);

CREATE TEMP TABLE m5_3a_1_metadata_checks (
    check_id TEXT PRIMARY KEY,
    passed BOOLEAN NOT NULL,
    failure_classification TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO m5_3a_1_metadata_checks (check_id, passed, failure_classification)
VALUES
    ('auth_uid_available', to_regprocedure('auth.uid()') IS NOT NULL, 'auth-uid-function-missing'),
    ('profiles_exists', to_regclass('public.profiles') IS NOT NULL, 'profiles-table-missing'),
    ('organizations_exists', to_regclass('public.organizations') IS NOT NULL, 'organizations-table-missing'),
    ('workspaces_exists', to_regclass('public.workspaces') IS NOT NULL, 'workspaces-table-missing'),
    ('roles_exists', to_regclass('public.roles') IS NOT NULL, 'roles-table-missing'),
    ('organization_members_exists', to_regclass('public.organization_members') IS NOT NULL, 'organization-members-table-missing'),
    ('workspace_memberships_exists', to_regclass('public.workspace_memberships') IS NOT NULL, 'workspace-memberships-table-missing');

INSERT INTO m5_3a_1_metadata_checks (check_id, passed, failure_classification)
SELECT
    table_name || '_rls_enabled' AS check_id,
    EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = table_name
          AND c.relrowsecurity = TRUE
    ) AS passed,
    table_name || '-rls-not-enabled' AS failure_classification
FROM (VALUES
    ('profiles'),
    ('organizations'),
    ('workspaces'),
    ('roles'),
    ('organization_members'),
    ('workspace_memberships')
) AS scoped_tables(table_name);

CREATE TEMP TABLE m5_3a_1_scenario_results (
    scenario_id TEXT PRIMARY KEY,
    scenario_kind TEXT NOT NULL CHECK (scenario_kind IN ('negative', 'positive')),
    expected_result TEXT NOT NULL CHECK (expected_result IN ('denied', 'allowed')),
    scenario_status TEXT NOT NULL CHECK (scenario_status IN ('passed', 'failed', 'blocked')),
    sanitized_classification TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO m5_3a_1_scenario_results (
    scenario_id,
    scenario_kind,
    expected_result,
    scenario_status,
    sanitized_classification
) VALUES
    ('anonymous_denied', 'negative', 'denied', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('authenticated_non_member_denied', 'negative', 'denied', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('disabled_org_member_denied', 'negative', 'denied', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('disabled_workspace_member_denied', 'negative', 'denied', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('cross_org_organization_metadata_denied', 'negative', 'denied', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('cross_org_membership_metadata_denied', 'negative', 'denied', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('cross_workspace_membership_metadata_denied', 'negative', 'denied', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('cross_workspace_role_metadata_denied', 'negative', 'denied', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('system_role_visibility_denied', 'negative', 'denied', 'blocked', 'system-role-visibility-deferred'),
    ('service_role_not_browser_callable', 'negative', 'denied', 'blocked', 'service-boundary-not-db-asserted'),
    ('own_active_profile_readable', 'positive', 'allowed', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('own_active_org_membership_readable', 'positive', 'allowed', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('own_active_workspace_membership_readable', 'positive', 'allowed', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('active_org_metadata_readable', 'positive', 'allowed', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('active_workspace_metadata_readable', 'positive', 'allowed', 'blocked', 'rls-helper-policy-not-implemented-baseline'),
    ('scoped_role_metadata_readable', 'positive', 'allowed', 'blocked', 'rls-helper-policy-not-implemented-baseline');

WITH scenario_counts AS (
    SELECT
        COUNT(*)::INT AS scenarios_declared,
        COUNT(*) FILTER (WHERE scenario_status <> 'blocked')::INT AS scenarios_executed,
        COUNT(*) FILTER (WHERE scenario_status = 'passed')::INT AS pass_count,
        COUNT(*) FILTER (WHERE scenario_status = 'failed')::INT AS scenario_fail_count,
        COUNT(*) FILTER (WHERE scenario_status = 'blocked')::INT AS blocked_count
    FROM m5_3a_1_scenario_results
), metadata_counts AS (
    SELECT
        COUNT(*) FILTER (WHERE passed = FALSE)::INT AS metadata_fail_count
    FROM (
        SELECT passed FROM m5_3a_1_metadata_checks
        UNION ALL
        SELECT passed FROM m5_3a_1_auth_simulation_checks
    ) checks
), classifications AS (
    SELECT sanitized_classification
    FROM m5_3a_1_scenario_results
    WHERE scenario_status <> 'passed'
    UNION
    SELECT failure_classification
    FROM m5_3a_1_metadata_checks
    WHERE passed = FALSE
    UNION
    SELECT failure_classification
    FROM m5_3a_1_auth_simulation_checks
    WHERE passed = FALSE
)
SELECT
    scenario_counts.scenarios_declared,
    scenario_counts.scenarios_executed,
    scenario_counts.pass_count,
    (scenario_counts.scenario_fail_count + metadata_counts.metadata_fail_count)::INT AS fail_count,
    scenario_counts.blocked_count,
    FALSE AS tenant_isolation_verified,
    CASE
        WHEN metadata_counts.metadata_fail_count = 0 THEN 'local-db-assertions-executed-baseline-no-isolation'
        ELSE 'local-db-assertions-executed-with-metadata-failures'
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
