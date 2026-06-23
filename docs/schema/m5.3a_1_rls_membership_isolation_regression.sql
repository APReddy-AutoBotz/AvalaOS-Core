-- M5.3a-1 local RLS membership isolation scenario contract.
--
-- This file is a local-only validation contract for future helper and SELECT
-- policy implementation. It does not create RLS helpers, RLS policies, seed
-- data, durable tables, backfill, or production/demo/runtime data.
--
-- Scope:
-- - profiles
-- - organizations
-- - workspaces
-- - roles
-- - organization_members
-- - workspace_memberships
--
-- Explicitly excluded:
-- - assess_processes
-- - assessments
-- - assessment_review_events
-- - projects
-- - document_generations
-- - delivery_work_items
-- - provider governance tables and policies
-- - legacy draft tables
-- - storage/export, Delivery Pack, Monitor, lineage, and handoff policies
-- - INSERT, UPDATE, DELETE, review, approval, export, and delivery mutations
--
-- Secret-safety:
-- - Use generated local UUIDs only when this contract is later executed by an
--   AP-approved local harness.
-- - Do not print DB targets, connection strings, .env values, service-role
--   values, provider keys, JWT/private tokens, hosted URLs, bucket names, row
--   payload dumps, or personal identifiers.

BEGIN;

CREATE TEMP TABLE m5_3a_1_rls_scenario_contract (
    scenario_id TEXT PRIMARY KEY,
    scenario_kind TEXT NOT NULL CHECK (scenario_kind IN ('negative', 'positive')),
    actor_label TEXT NOT NULL,
    table_scope TEXT NOT NULL,
    expected_result TEXT NOT NULL CHECK (expected_result IN ('denied', 'allowed')),
    sanitized_classification TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO m5_3a_1_rls_scenario_contract (
    scenario_id,
    scenario_kind,
    actor_label,
    table_scope,
    expected_result,
    sanitized_classification
) VALUES
    ('anonymous_denied', 'negative', 'anonymous', 'identity_membership', 'denied', 'anonymous-denied'),
    ('authenticated_non_member_denied', 'negative', 'non_member', 'identity_membership', 'denied', 'non-member-denied'),
    ('disabled_org_member_denied', 'negative', 'disabled_org_member', 'organization_memberships', 'denied', 'disabled-org-member-denied'),
    ('disabled_workspace_member_denied', 'negative', 'disabled_workspace_member', 'workspace_memberships', 'denied', 'disabled-workspace-member-denied'),
    ('cross_org_organization_metadata_denied', 'negative', 'org_a_member', 'organizations', 'denied', 'cross-org-denied'),
    ('cross_org_membership_metadata_denied', 'negative', 'org_a_member', 'organization_members', 'denied', 'cross-org-membership-denied'),
    ('cross_workspace_membership_metadata_denied', 'negative', 'workspace_a_member', 'workspace_memberships', 'denied', 'cross-workspace-membership-denied'),
    ('cross_workspace_role_metadata_denied', 'negative', 'workspace_a_member', 'roles', 'denied', 'cross-workspace-role-denied'),
    ('system_role_visibility_denied', 'negative', 'active_member', 'roles', 'denied', 'system-role-visibility-deferred'),
    ('service_role_not_browser_callable', 'negative', 'browser_client', 'server_only_boundary', 'denied', 'service-role-server-only'),
    ('own_active_profile_readable', 'positive', 'active_member', 'profiles', 'allowed', 'own-profile-readable'),
    ('own_active_org_membership_readable', 'positive', 'active_member', 'organization_members', 'allowed', 'own-org-membership-readable'),
    ('own_active_workspace_membership_readable', 'positive', 'active_member', 'workspace_memberships', 'allowed', 'own-workspace-membership-readable'),
    ('active_org_metadata_readable', 'positive', 'active_member', 'organizations', 'allowed', 'active-org-metadata-readable'),
    ('active_workspace_metadata_readable', 'positive', 'active_member', 'workspaces', 'allowed', 'active-workspace-metadata-readable'),
    ('scoped_role_metadata_readable', 'positive', 'active_member', 'roles', 'allowed', 'scoped-role-metadata-readable');

-- The M5.3a-1b harness is intentionally contract-only. Future AP-approved
-- implementation may replace this summary with executable local assertions
-- after helper functions and SELECT policies exist. Until then, this contract
-- can only prove that the expected local scenarios are declared.
SELECT
    scenario_kind,
    expected_result,
    count(*) AS scenario_count
FROM m5_3a_1_rls_scenario_contract
GROUP BY scenario_kind, expected_result
ORDER BY scenario_kind, expected_result;

ROLLBACK;
