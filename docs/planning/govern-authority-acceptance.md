# Govern authority acceptance

## Objective and entry boundary

Prove GOVERN-008, GOVERN-009 and GOVERN-010 through real disposable-PostgreSQL Govern commands while preserving every catalog criterion. AP authorized continued acceptance work and verified merges without routine reapproval. Baseline is PR #276 merge `a317f9b243185751e37b80354796f5b9dd5a2d68`, whose tree matches tested candidate `347a9eeb5ca929665de8817678eeb62596360a34`. All 14 applicable candidate workflows passed. Exact acceptance run `37648815609` attempt 1 proves 33 PASS / 0 FAIL / 75 BLOCKED / 0 UNCOVERED; post-merge Core CI `37654895042` passed.

Architecture, security and quality read-only reviews finished before writes. Wave 2 uses the fixed workspace-write profile only for this package. One implementation worker owns the new Govern harness, producer and focused tests; the root owns shared integration, documentation, verification and one PR. No nested delegation.

## Scope and authority

Product authority stays in `docs/07_AVALA_GOVERN_FRAMEWORK.md` and the PR 1E extension of `docs/architecture/assess-v2-decision-intelligence-architecture.md`. Execute `pr1e_resolve_assess_v2_govern` under the real service-role boundary, including current membership/capability/version checks before receipt lookup. Apply the complete current migration chain, including the later Govern control-alias correction. Do not change runtime, schema, scoring, dependencies, hosted declarations or any of the 108 behavior criteria.

The current `govern-authority` retained owner executes aggregate domain tests without exact database case artifacts. This is an evidence gap, not a confirmed Govern product defect. Directly seeded upstream case/decision/approved-review fixtures are prerequisites only; no target Govern resolution, target receipt or target audit may be preinserted.

DELIVERY-007/008 remain BLOCKED: their current source describes legacy client-side import and retained task-deletion lineage. The modern PR C handoff/package command has different semantics. Substituting it would change the acceptance meaning. EI-003's read-only/one-mutation mismatch also remains outside this package. Hosted access, paid effects, deployments and production actions are not authorized here.

## Exact acceptance

Each case includes one real authorized Govern resolution as its primary successful outcome (`expectedMutationCount: 1`, `expectedDenial: false`). Named denied attempts are secondary safety assertions with zero effects. Administrative fixture/authority setup is never credited as the target mutation.

| Case | Required observations |
| --- | --- |
| GOVERN-008 | Stale authorization before the first command yields AUTHORIZATION_STALE with no resolution/receipt/audit/case transition. Refresh only the authorization precondition and retry the same command identity: one committed resolution, one case version advance, one receipt and one audit. Stale replay discloses no committed response; current replay adds nothing. |
| GOVERN-009 | Commit one real authorized resolution, then revoke that resolver's capability or membership. Same-key attempts with both old and current authorization versions, and a fresh-key attempt, fail without response disclosure or any additional target/receipt/audit/case effect. The original authorized commit remains immutable. The revoked actor never succeeds while revoked. |
| GOVERN-010 | Commit one resolution. Exact replay returns the same resource without effects. Changed payload under the same key yields IDEMPOTENCY_CONFLICT. An equivalent decision under a fresh key and the current post-commit case version is rejected without a second resolution, receipt, audit or case transition. |

Assert exact decision/source/review/tenant/actor/request/receipt/audit binding and the approved-to-govern-resolved transition. Include foreign-tenant selector and non-service-caller denial with zero effects. Privileged audit action must be `assessment_v2.govern.resolve`. Measure scoped row counts and state fingerprints around each attempted command; retain raw snapshots only in process memory. Emit booleans/counts/digests, never rationale, control bodies, generated identifiers, credentials or raw logs.

## Execution and evidence

Use a uniquely named disposable database, apply the ordered current migration chain once with the accepted synthetic migration guard, and isolate each case in a transaction that is rolled back. Reuse existing fixture patterns without running large legacy suites locally. Setup/configuration/migration failures classify unexecuted cases BLOCKED; actual behavioral mismatches classify that case FAIL. A complete artifact preserves independent case results and lets the retained orchestrator fail CI for any emitted FAIL/BLOCKED. Standalone incomplete execution exits unsuccessfully.

Close clients, drop and verify absence of the created database and only the roles created by this harness, then emit evidence exclusively. Any rollback or cleanup failure is fatal and must leave no artifact. Bind evidence to exact source digests, Test ID, branch/assertion/scenario, command, candidate SHA, workflow/run/attempt and fixed synthetic tenant scope. Validate ingestion and final report consumption.

Add `govern-postgres-acceptance` only for the three selected cases; keep GOVERN-001 through GOVERN-007 on their current owner. Pass `GOVERN_ACCEPTANCE_DATABASE_URL` from the existing CI PostgreSQL 16 service. No new infrastructure or provider is needed.

## Focused verification and completion

Run the narrow producer/adversarial tests, report integration including FAIL/BLOCKED transport, retained evidence tests, catalog/traceability/provenance checks, generated PR C registry/contract, secret hygiene and diff validation. No additional local browser/accessibility/performance regression is needed because runtime/UI behavior is unchanged. Local PostgreSQL is unavailable; use exact-candidate CI PostgreSQL 16 for actual command execution. Do not install/start local database services.

Before merge, all applicable candidate checks and review findings must pass. Independently inspect the exact acceptance artifact: target 36 PASS / 0 FAIL / 72 BLOCKED / 0 UNCOVERED, all other 105 statuses unchanged, hosted NOT_EXECUTED and overall INCOMPLETE_COVERAGE. These are planned results until executed and verified. Record actual candidate evidence in the PR without making production-readiness claims.

## Local executed verification (2026-10-07)

Govern producer/adversarial validation passed 9/9, including measured property-order independence with strict value equality. Report integration passed all 14 cases across the full run and the focused three-case Govern rerun after final source-digest refresh. The focused rerun covers valid results, substituted sources/actuals/IDs, partial artifacts, failed cleanup, independent FAIL/BLOCKED outcomes, missing database configuration and retained CI failure propagation. Catalog, all 108 source-backed inventory branches, traceability, provenance, independent oracle, retained evidence adversarial checks, workflow YAML and secret hygiene passed. Initial command-registry omission and Windows sandbox temporary-file rename errors were resolved before publication. No local PostgreSQL or hosted test was run; real Govern execution and exact-candidate CI remain planned verification.

## Rollback

Revert this harness, producer, integration and metadata together to return the three cases to BLOCKED. Product schema/data/runtime remain unchanged; no hosted rollback is needed. Preserve existing local changes, historical evidence and stash.
