# Application Portfolio Acceptance Evidence

## Objective

Promote `APPS-001` through `APPS-005` only when the exact candidate runs assertion-derived Application Portfolio behavior against the workflow-owned disposable PostgreSQL 16 database. The existing `application-portfolio` retained owner now executes the accepted PR 1G migration harness through the service-role-only command boundary.

## Bounded behavior

- `APPS-001` proves one authorized application creation, its exact persisted resource, one command receipt, and one semantically matching audit event.
- `APPS-002` proves one assessment aggregate bound to its metadata version, all seven exact canonical dimension names, and one server-derived modernization recommendation.
- `APPS-003` proves one dedicated assessment save produces the exact native-interface disposition, confidence, empty hard gates and prerequisites, and exact rejected-alternatives value.
- `APPS-004` proves a non-disclosing cross-workspace denial while complete source and target Application Portfolio, receipt, and audit fingerprints remain unchanged.
- `APPS-005` proves one creation, an exact replay, and a changed-payload conflict with one total resource, receipt, and audit and no in-place state changes after the original commit.

The five cases preserve their existing mutation counts of `1,1,1,0,1`. Asserted commands run under `SET LOCAL ROLE service_role`; administrative access is limited to fixture setup and observation. The fixed repository-safe scope is `synthetic-application-portfolio-postgresql-v1`. No runtime, migration, scoring, schema, provider, hosted environment, customer data, or production system changes are included.

## Evidence contract

Every exact result binds the release SHA, workflow run and attempt, retained command, workflow path, environment, case branch and assertion IDs, executed fixture scope, cleanup confirmation, and canonical SHA-256 bytes for:

- `scripts/testPr1gMigrations.mjs`
- `scripts/applicationPortfolioAcceptanceEvidence.mjs`
- `services/assessV2/applicationPortfolio.ts`
- `supabase/migrations/20260712120000_pr1b_identity_rbac_rls_assess.sql`
- `supabase/migrations/20260722120000_pr1g_application_portfolio.sql`
- `supabase/migrations/20260726120000_pr1g_authority_concurrency_correction.sql`
- `supabase/migrations/20260727090000_pr1b_membership_role_scope_trigger_forward_fix.sql`

The result set must contain all five Test IDs exactly once. Validation runs during retained-result ingestion and again when the final report is assembled. It rejects stale identity, substituted source bytes, wrong scope or command, incomplete or duplicate results, altered measurements, and missing cleanup. An executed assertion failure remains `FAIL`; missing or invalid evidence remains `BLOCKED`.

The harness tracks its main and transient PostgreSQL clients and its parity/projection temporary files. It writes the sanitized producer artifact only after cleanup succeeds. The artifact includes no connection string, secret, raw log, or generated database object identifier.

## Verification

Focused verification for this slice is:

1. Application Portfolio producer and adversarial validator tests.
2. The APPS-only report integration variants.
3. Catalog, traceability, provenance, and migration-contract checks.
4. Syntax checks for the changed harness, helper, retained runner, and evidence validator.
5. The existing PR workflow's PostgreSQL 16 execution, followed by exact artifact inspection.

Local PostgreSQL execution is `not run` because the managed workstation has no available Docker Linux engine or native PostgreSQL server, as already established for this acceptance program. The existing workflow-owned PostgreSQL 16 service is required before any APPS case is promoted.

### Focused results on 2026-10-06

- Application Portfolio producer and adversarial validator: `PASS` (3/3 producer, substitution, and genuine-failure cases).
- Retained evidence adversarial validator: `PASS`.
- APPS-only report integration: `PASS` (8/8 valid, substituted, partial, aggregate-only, and genuine-failure variants).
- Catalog and traceability: `PASS` (108 catalog cases, 108 source-backed branches, 0 uncovered, 0 errors).
- Inventory provenance and acceptance metadata: `PASS`.
- PR 1G migration contract: `PASS`.
- Changed JavaScript syntax checks: `PASS`.
- `git diff --check`: `PASS` (line-ending notices only).
- Disposable PostgreSQL 16 harness: `not run` locally; exact-candidate CI required.

The merged PR #273 tree is the source-identical baseline. Its post-merge Core CI dependency-audit failure is a separate inherited package-lock maintenance matter pending its own approval and owned by the controller; it does not change this slice's behavior or evidence criteria.

### First CI fixture correction

PR #274 candidate `00f423e7` executed 118 PostgreSQL scenarios successfully, including APPS-001, APPS-002, APPS-004 and APPS-005. APPS-003 failed with `PR1G_INVALID_COMMAND` because its new metadata fixture used unsupported enum values. The fixture now uses the existing contract values `current`, `executable_acceptance` and `strong`; no runtime rule, expected recommendation or acceptance criterion changed. A new exact-head database run is required.

## Proof limits

Successful exact execution would move only these five cases from `BLOCKED` to `PASS`, producing 24 `PASS`, 0 `FAIL`, and 84 `BLOCKED` while the other 103 case definitions and statuses remain unchanged. This does not prove hosted execution, production configuration, external providers, availability, performance, or overall product readiness.

## Rollback

Revert the APPS harness assertions, producer/validator, five metadata bindings, retained-suite database environment, workflow wiring, focused tests, and this plan together. The five cases then return to `BLOCKED` because exact assertion artifacts are absent. No product database rollback is required because this slice changes no runtime migration or schema.
