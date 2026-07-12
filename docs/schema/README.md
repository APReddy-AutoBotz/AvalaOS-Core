# AvalaOS Core Schema Authority

Status: legacy design and historical operational reference; PR 1A minimum AI-audit reconciliation recorded below
Active canonical migration authority: `supabase/migrations/`

## Authority Boundary

Files under `docs/schema/` capture useful historical schema designs, policy proposals, seed contracts, regression SQL, and prior operational notes. They are not an ordered production migration chain and must not be applied as the current canonical path.

Only timestamped files under `supabase/migrations/` are canonical migrations. A schema contract needed by runtime must be reconciled into that ordered chain in the implementation PR that owns the behavior, with fresh-database, supported-upgrade, RLS/policy, failure, and rollback/read-only verification.

Do not use historical applied/live checkboxes from this directory as current deployment or readiness proof. Deployment status, hosted schema state, RLS behavior, tenant isolation, storage configuration, and migration reproducibility are unknown or unproven until separately authorized executed evidence establishes them.

## PR 1A Minimum Reconciliation

`supabase/migrations/20260710120000_pr1a_required_ai_audit.sql` reconciles the minimum `ai_generation_jobs` and `ai_usage_events` contract required by PR 1A. It enables and forces RLS without browser policies, validates constraints, and enforces lifecycle transitions.

`npm run test:migrations:pr1a` passed the complete canonical chain from fresh state, idempotent PR 1A reapplication, and a targeted supported upgrade from `supabase/tests/migration-harness/pr1a_legacy_ai_audit_fixture.sql` using disposable PostgreSQL 15 databases. This is executed local evidence for that narrow migration boundary only; it is not hosted schema, general RLS, tenant-isolation, or deployment proof.

Detailed behavior and rollback notes: `docs/migrations/pr1a-platform-safety-fail-closed-runtime.md`.

## PR 1B Identity, RBAC, RLS, And Assess Reconciliation

`supabase/migrations/20260712120000_pr1b_identity_rbac_rls_assess.sql` adds the canonical normalized capability, authorization-version, permission-aware RLS, workspace-complete Assess, optimistic version, idempotency, and atomic audit contracts. Its disposable PostgreSQL harness is `npm run test:migrations:pr1b`; detailed compatibility and read-only/forward-fix rollback guidance is in `docs/migrations/pr1b-server-authoritative-identity-rbac-rls-assess.md`.

This remains source and disposable-database evidence only. It is not hosted schema, deployment, or production tenant-isolation proof.

## Legacy Reference Files

- `initial_schema.sql`: broad prototype schema reference.
- `platform_rls_membership_policies.sql`: membership-policy design reference.
- `assess_review_audit.sql`: Assess review/audit/RPC design reference.
- `handoff_ledger_entries.sql`: cross-module handoff design reference.
- `delivery_app_id_mapping.sql`, `delivery_comments_activity.sql`, and role-policy files: Delivery mapping and policy references.
- `ai_governance_jobs.sql`: AI governance schema reference.
- `storage_buckets.sql`: private bucket and object-policy design reference.
- `rls_regression_assess_handoff.sql` and `m5.3a_*`: historical/synthetic regression and assertion designs.
- Demo seed files: local/demo fixture references only.

## Reconciliation Rule

Do not edit or execute these files merely to make documentation look complete. For each required contract:

1. Compare runtime assumptions, canonical migrations, and the relevant legacy reference.
2. Define an additive or forward-safe canonical migration.
3. Add two-tenant positive and negative policy tests.
4. Verify fresh and supported upgrade paths.
5. Record exact executed evidence and rollback/read-only behavior in the same implementation PR.

Never commit database passwords, service-role keys, project identifiers, raw database output, signed URLs, or customer data.
