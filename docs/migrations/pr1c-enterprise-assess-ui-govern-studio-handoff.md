# PR 1C Enterprise Assess UI, Govern, And Studio Handoff Migration

Migration: `20260713120000_pr1c_enterprise_assess_ui_govern_studio_handoff.sql`
Dependency: accepted PR 1B migration chain at `de87c86`

## Additive Contract

The migration adds:

- `govern.resolve` and `studio.handoff.create` capabilities;
- immutable `assessment_studio_handoffs` with exact organization, workspace, process, and assessment ancestry;
- immutable receipt-bound Govern provenance plus a fail-closed legacy Approved/handed-off preflight;
- `pr1c_list_tenant_contexts` for the authenticated user's server-issued UI projection;
- `pr1c_govern_resolve` for human review lifecycle decisions; and
- `pr1c_create_studio_handoff` for approved, version-matched, one-time Studio handoff creation.

The mutation RPCs are callable only by `service_role`. They independently invoke the accepted PR 1B authorization and command-receipt controls, enforce expected versions and lifecycle state, and commit state, review/handoff evidence, receipt, and privileged audit in one transaction.

## Verification

`npm run test:migrations:pr1c` creates a disposable PostgreSQL database, applies the pre-PR 1B baseline, PR 1B fixtures and migration, then PR 1C. It asserts:

- `anon` and `authenticated` mutation execution is denied while `service_role` is allowed;
- available tenant contexts are actor-scoped;
- dirty legacy Approved or handed-off rows fail preflight without partially applying the migration;
- Studio handoff requires immutable, successful, receipt-bound Govern approval at the exact assessment version;
- exact ancestry and cross-tenant access fail without resource disclosure;
- positive and negative RLS/ACL behavior, expected-version, and actor-scoped idempotency;
- separate-connection Govern and Studio concurrency races produce one commit and one conflict;
- Govern approval and Studio handoff lifecycle;
- immutable provenance, one durable handoff, and matching privileged audit events; and
- injected Govern and Studio audit failures roll back state, provenance/handoff, and receipt.

Local execution status on 2026-07-14: not run because no disposable PostgreSQL server was available in the authorized workspace. Both GitHub push and pull-request PR 1C PostgreSQL jobs passed the suite in runs `29308403238` and `29308405309`. No hosted or live application database was accessed.

## Rollback And Recovery

This is an additive forward-only migration.

- Preferred operational fallback: disable enterprise commands or use read-only maintenance mode.
- Preserve all assessment, receipt, review, handoff, and audit records.
- Do not drop tables, functions, capabilities, or evidence as routine rollback.
- If a schema defect is found, ship a reviewed forward-fix migration.
- Never restore browser-direct enterprise mutation authority or demo fallback.
