# AvalaOS Core Schema Authority

Status: legacy design and historical operational reference
Active canonical migration authority: `supabase/migrations/`

## Authority Boundary

Files under `docs/schema/` capture useful historical schema designs, policy proposals, seed contracts, regression SQL, and prior operational notes. They are not an ordered production migration chain and must not be applied as the current canonical path.

Only timestamped files under `supabase/migrations/` are canonical migrations. A schema contract needed by runtime must be reconciled into that ordered chain in the implementation PR that owns the behavior, with fresh-database, supported-upgrade, RLS/policy, failure, and rollback/read-only verification.

Do not use historical applied/live checkboxes from this directory as current deployment or readiness proof. Deployment status, hosted schema state, RLS behavior, tenant isolation, storage configuration, and migration reproducibility are unknown or unproven until separately authorized executed evidence establishes them.

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
