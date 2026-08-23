# AvalaOS Exhaustive Acceptance Evidence Closure

Status: controller work package, Draft-only implementation authority.

## Exact release baseline

- Signed `main`: `862351f9150e013a075a630401b9405dd34d0df8`
- Stable pilot Netlify deploy: `6a89a409b6afaf00082eb33f`
- Stable pilot URL: `https://avalaos-pilot.netlify.app`
- Stable deploy `commit_ref`: exactly `862351f9150e013a075a630401b9405dd34d0df8`
- `avalaos.com`: out of scope and must remain untouched.

## Authoritative release evidence already obtained

### Exhaustive release run

Run `32575953193` executed against the exact stable release above.

Observed framework result:

- Overall: `INCOMPLETE_COVERAGE`
- PASS: 25
- FAIL: 0
- BLOCKED: 82
- UNCOVERED: 1
- Retained suites: 13/13 passed
- Assessment oracle: 13/13 passed
- Stable hosted browser executed scenarios: 0 failures
- `SAFETY-004` reload reconstruction: passed Desktop Chrome and Pixel 7
- Horizontal overflow and serious/critical accessibility checks: passed

The framework failure is therefore an evidence/coverage failure, not permission to describe the release as passed.

## PR #255 controller remediation position

The controller remediation based on PR #255 head `8677548c25e8870029bdfb91b36b33ccedcdd7a3` separates three claims that were previously conflated:

- `SOURCE_BACKED` now means a catalog branch is bound through an independently hashed provenance registry to an exact Test ID, repository source, and assertion/scenario/contract owner. All 108 catalog branches satisfy that source-ownership contract; catalog membership alone no longer grants the classification.
- executed evidence now requires exact assertion outcomes, canonical command ownership, release/workflow/run-attempt identity, and an executed fixture scope. The 107 contracts without a currently executed tenant/workspace fixture are explicitly `planned-fixture` with null tenant identifiers and cannot produce PASS evidence.
- composite evidence is explicit for the ten cases that require both server and hosted proof. Missing, skipped, stale, substituted, or partially declared components remain BLOCKED; a hosted PASS cannot promote a missing server component.

The retained controller no longer synthesizes per-Test-ID PASS from aggregate suite success. A clean local controller run records 13/13 aggregate suites passing and zero exact retained Test-ID results, so all 60 retained Test IDs remain honestly BLOCKED until their authoritative suites emit exact scoped assertion artifacts.

The one locally executed server contract, `SAFETY-005`, is bound to the actual disposable PostgreSQL fixture (`97000000-0000-4000-8000-000000000010` / `97000000-0000-4000-8000-000000000011`), exact workflow run attempt, canonical command, four explicit assertion outcomes, and the response-loss branch. Five hosted activation evidence families are derived from PostgreSQL, recovery, provider-simulation, and canonical-journey assertion artifacts rather than hard-coded success values.

Hosted remediation also corrects `SANDBOX-006` to the source-backed accepted-descendant contract, keeps the `SANDBOX-004` observer active through post-entry and sign-out, and executes `SANDBOX-007/008/009` after entry for every bounded persona. Desktop Chrome and Pixel 7 declarations enumerate 68 exact hosted cases locally; live hosted execution remains planned verification until the remediated exact head has a verifiable deployment.

Rollback is the single remediation commit. Reverting it restores the prior schema-2 inventory and permissive evidence behavior, so any rollback must also stop exhaustive/activation evidence publication; schema-3 provenance, schema-2 explicit assertion output, or composite manifests must never be silently downgraded or accepted by an older validator.

### Pilot Operations

Run `32575966445` is fully green and exact-head bound. Its authoritative manifest proves:

- retained authority
- operations source contracts
- PostgreSQL 16 fresh/upgrade
- forced RLS and tenant-table denial
- backup/restore/recovery
- maintenance/rollback controls
- Desktop Chrome
- Pixel 7
- accessibility/performance
- AI-boundary and secret hygiene

The PostgreSQL suites also prove exact replay and stable version/attempt counts, and recovery proves a canonical response-loss receipt survives backup/restore. These results currently use coarse gate IDs and are not sufficiently bound to exhaustive catalog Test IDs.

### Hosted activation evidence producer

Run `32575967334` on the exact signed release has already passed:

- recovery-operations
- hosted-browser
- accessibility-performance

Its database-provider is the exact GitHub-OIDC/database finalization gate and must remain fail-closed. Do not fabricate or bypass its evidence-family requirements.

## Closure problem classes

### A. Existing execution is not bound to exact catalog Test IDs

These retained suites are green but the exhaustive framework receives no exact Test-ID results from them:

- `assess-v2-authority`: ASSESS-018..022
- `application-portfolio`: APPS-001..005
- `govern-authority`: GOVERN-001..010
- `studio-governed`: STUDIO-001..005
- `studio-private`: STUDIO-006..011
- `delivery-policy`: DELIVERY-001..008
- `pilot-operations`: ADMIN-004
- `trust-authority`: TRUST-001..005
- `ai-boundary`: AI-001..006
- `enterprise-intelligence`: EI-001..005
- `canonical-pilot-journey`: E2E-001, E2E-003, E2E-004
- `cross-cutting-false-success`: SAFETY-002

Required approach: emit exact per-Test-ID evidence from authoritative retained executions, with source/run/head binding. Never map a suite-level PASS blindly to catalog IDs unless the retained test actually proves each declared rule.

### B. Hosted checks that are currently UI-only, synthetic-only, or incomplete

Current blocked hosted cases include:

- SANDBOX-003: observe local synthetic authority through a bounded post-entry workflow and sign-out, not only persona entry.
- SANDBOX-004: observe delayed/retried/lazy provider traffic through bounded post-entry workflow and sign-out.
- SANDBOX-005: perform a real state/identity transition before reload and prove reconstruction.
- SANDBOX-006: `/sandbox` descendants are intentionally accepted. Either identify a real source-backed denied branch or correct the catalog contract; do not manufacture denial evidence.
- SANDBOX-007/008/009: post-entry Desktop/mobile/keyboard coverage for all declared sandbox personas.
- ASSESS-002: authoritative process-edit denial, not process-create denial used as a proxy.
- ASSESS-003: drive discovery transition and production scoring, not merely read seeded Completed/High data.
- DELIVERY-009: exact Delivery Pack ancestry plus negative tenant boundary.
- MONITOR-001..004: exact lineage/outcome/blocker/unavailable projection assertions with tenant boundaries and deterministic fixtures.
- ADMIN-002: server-authoritative non-admin denial, not hidden navigation.
- ADMIN-003: exact role/capability matrix.
- E2E-002: full requested-changes hosted ledger journey, not only domain regression.
- E2E-005/006/007: full low-suitability, strong-automation, and HITL classification/handoff journeys.
- SAFETY-001: server-authoritative offline mutation false-success proof.
- SAFETY-003: server mutation timeout proof through an authorized disposable/test boundary.

Use realistic synthetic data only. No customer data or PHI.

### C. Response lost after durable commit

Catalog branch `SAFETY-RESPONSE_LOST_AFTER_COMMIT` points to `services/persistenceTransition.ts`.

Existing Pilot Operations evidence is related but not yet a single exact proof of the required invariant:

1. durable mutation commits server-side;
2. client response is deliberately lost;
3. retry uses the same idempotency identity;
4. exact canonical response is recovered;
5. zero duplicate mutation/audit/version effects occur.

Implement an authorized disposable PostgreSQL/server test for this exact sequence if the existing command/recovery harness cannot already prove it in one scenario. Bind the result to an exact acceptance Test ID/branch evidence record.

## Acceptance evidence rules

1. Evidence must bind exact Git SHA, workflow/run identity, environment, and relevant tenant/entity IDs.
2. Retained suite PASS is insufficient unless exact Test-ID proof is emitted or independently mapped from explicit assertions.
3. UI visibility is never accepted as server authority or tenant denial.
4. Oracle/scoring checks are not substitutes for an E2E product journey.
5. URL/localStorage are reconstruction evidence only, never authority.
6. No real provider/BYOK calls.
7. No external users, customer data, PHI, `avalaos.com`, DNS, or production authorization.
8. Disposable PostgreSQL and synthetic tenant/org/workspace/process/project fixtures are allowed.
9. Any invalid/misdeclared catalog case must be corrected transparently rather than forced to PASS.
10. Keep release gating fail-closed: the final exhaustive report must not say PASS with any unresolved FAIL/BLOCKED/UNCOVERED entry.

## Target closure

The implementation is complete only when a fresh exact-head exhaustive run can legitimately produce:

- FAIL = 0
- BLOCKED = 0
- UNCOVERED = 0
- exact Test-ID provenance for all retained/hosted/oracle evidence
- Desktop Chrome + Pixel 7 hosted acceptance green
- RLS/tenant/provider/BYOK/replay/recovery boundaries preserved

If some catalog entry is invalid by design, change the catalog/coverage model with explicit rationale and tests rather than hiding or skipping the mismatch.
