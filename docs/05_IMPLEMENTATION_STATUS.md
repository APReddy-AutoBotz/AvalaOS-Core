# AvalaOS Core Implementation Status

Baseline: PR #211 / PR 1E accepted and post-merge verified on `main` at `d3074e5b99b3d40f33a472679b7a861bcac1700a`.

## Honest Maturity Verdict

> AvalaOS Core is a credible deterministic enterprise demo with substantial source-level governance scaffolding, but not yet a coherent server-authoritative, tenant-safe pilot or production platform.

## Implemented And Source-Accepted

- React/Vite application shell and module journeys.
- Avala Assess catalog, guided assessment, deterministic scoring, Decision Pack, review concepts, and handoff scaffolding.
- Deterministic scoring regression harness.
- Avala Studio document-generation/review workspace and work-item preparation.
- Avala Govern governance/control-plane models and human approval concepts.
- Avala Delivery workbench, policy checks, retained-lineage scaffolding, and delivery packs.
- Supabase adapters, eight canonical migrations, legacy schema contracts, and seven Edge entry-point sources plus shared helpers.
- Provider-governance resolver controls with active-membership checks and allowed-operation audit fail-closed behavior.
- Product-action, workflow, artifact export, storage, and signed-URL source guards through PR #204.
- Historical milestone/evidence corpus preserved as immutable records.

## PR 1C Implementation Candidate

- PR 1B identity, RBAC, RLS, Assess commands, and unchanged `assess-core-2026-05` scoring parity are accepted at `de87c86`.
- Server-issued organization/workspace projection and explicit loading, empty, error, offline, stale, revoked, blocked, read-only, and expired-session states.
- Enterprise Assess create/save/finalize uses the typed command boundary; direct browser assessment/review mutations fail closed.
- Separate Govern resolution and Studio handoff handlers use service-role-only RPCs with fresh authorization, exact ancestry, expected versions, actor-scoped idempotency, and atomic state/receipt/audit.
- Studio payload generation requires the server-committed `Handed Off to Docs` state.
- Local source/type/Edge/coverage/build, disposable PostgreSQL ACL/adversarial/rollback, and production-preview Chromium desktop/mobile/axe/performance gates passed.

## Confirmed Accepted-Baseline Defects And Gaps

The following describes the accepted baseline and is reconciled by the PR 1A candidate only where stated above; later PR 1B/1C and deployment evidence remain required.

- P0 service-role Storage URL escape; deployment was unknown at the accepted baseline and the AP later classified the intended function as not deployed.
- Supabase users can inherit demo-persona role/permissions through email matching.
- Missing Supabase configuration silently falls back to mock behavior.
- Browser action policies consume client user role/permission projections.
- Edge exports verify active organization membership and resource organization but not the complete permission/workspace/resource-status contract.
- Privileged AI job/usage audit can be swallowed.
- Govern/handoff lifecycle checks permit paths that are not uniformly server-authoritative.
- Studio generation can transition to a success workspace before durable persistence completes.
- Assess read errors collapse to `null`.
- Canonical migrations do not reproduce all schema assumed by runtime and legacy SQL guidance.
- The default test/CI chain omits newer critical policy suites; TypeScript excludes Edge source; lint, coverage, browser E2E, accessibility, performance, and migration reset/upgrade gates are not standard.

Unsafe HTML rendering primitives are confirmed in three UI sinks; exploitability and data-flow reachability remain a suspected defect requiring deeper validation.

## Not Proven

- Repository-side deployment inventory was not run. The AP supplied the bounded P0 classification **NOT DEPLOYED**, without infrastructure identifiers.
- Hosted schema or migration state.
- End-to-end server-authoritative identity, RBAC, workspace authorization, and immediate revocation.
- RLS and two-tenant non-disclosure across pilot paths.
- Server Assess scoring parity and durable Assess lifecycle.
- Private storage, export, signed URL, rollback, incident, backup/restore, observability, pilot, production, buyer, release-candidate, security, or compliance readiness.

## PR 1E Accepted Implementation

PR #211 accepted immutable evidence attestation and review history, independent approval, action-specific Govern resolution, and a durable governed Studio source package. Browser state is projection only; privileged mutations reauthorize and persist state, receipt, and audit atomically.

Accepted head `be502c9faf4f768d3a60e2f9debd5ffc40b6b66e` merged as `d3074e5b99b3d40f33a472679b7a861bcac1700a`. Exact-head workflow `29760010656` and post-merge main workflow `29802046983` succeeded; review threads unresolved: 0. No deployment, live-system inspection, secret action, incident action, readiness claim, or later-workstream implementation occurred.

## PR 1D Current Authority

PR 1D closure baseline `779a4801aa7c6660ad4581f8e334f5ad422519e7` remains retained and its decisions remain immutable.

### PR 1E Accepted Closure

PR 1E review, approval, Govern, and Studio-source handoff are accepted. V1 `assess-core-2026-05` scoring is unchanged and PR 1D decisions remain immutable. Hosted/live validation and deployment were not run; readiness remains unproven. PR 1F and Application Portfolio Assessment are not started.
