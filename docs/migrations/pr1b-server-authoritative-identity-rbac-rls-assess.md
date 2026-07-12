# PR 1B Identity, RBAC, RLS, and Assess Migration

`20260712120000_pr1b_identity_rbac_rls_assess.sql` is the additive canonical migration for the PR 1B server-authority boundary.

It normalizes named capabilities into `capabilities` and `role_capabilities`, adds per-user/per-organization `authorization_versions`, and bumps those versions after membership, workspace-membership, role, or role-capability changes. `get_tenant_context(org, workspace)` derives the user exclusively from `auth.uid()` and returns a projection, never an authority token. Every command RPC rechecks current membership, workspace, capability, and authorization version.

Assess process, assessment, and review-event lineage becomes workspace-complete. The migration refuses legacy rows with missing workspace authority using `PR1B_PREFLIGHT_ASSESS_WORKSPACE_REQUIRED`; it never invents tenant ownership. Composite foreign keys prevent cross-workspace or cross-organization parentage. Permission-aware RLS exposes Assess rows only to active members with the required normalized capability, and cross-tenant filters return no rows or counts.

The create, response-upsert, and finalize RPCs use optimistic versions, scoped idempotency receipts, and required append-only audit events. State, successful receipt, and audit commit in one PostgreSQL transaction. Finalize persists caller-supplied deterministic results plus an explicit score version; the migration does not define or change scoring behavior.

RPC results are stable JSON envelopes. A first successful transaction returns `{ "ok": true, "outcome": "committed", "resource": { ... } }`; an identical idempotent replay returns the same resource with `outcome` set to `replayed`. Expected failures return `{ "ok": false, "errorCode": "..." }`. Codes are `NOT_FOUND`, `AUTHORIZATION_STALE`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, and `INVALID_SCORE_VERSION`. Missing, revoked, unauthorized, and cross-tenant targets all collapse to `NOT_FOUND` and do not disclose existence.

Verification is split between `node scripts/checkPr1bMigrationContract.mjs` and the disposable PostgreSQL harness `PR1B_MIGRATION_DATABASE_URL=... node scripts/testPr1bMigrations.mjs`. The latter covers fresh application, populated supported upgrade, dirty-data transactional failure, migration reapplication, authorization invalidation, two-tenant RLS/non-disclosure, and a read-only transaction. It uses only disposable local databases and never contacts hosted infrastructure.

Rollback is operational, not destructive: disable the PR 1B command entry point or enter read-only maintenance mode while preserving Assess data, receipts, and audit history. Schema corrections use an additive forward-fix migration. Do not drop the normalized authorization or audit tables as a routine rollback.
