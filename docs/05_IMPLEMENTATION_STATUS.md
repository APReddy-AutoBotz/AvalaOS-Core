# AvalaOS Core Implementation Status

Baseline: accepted `main` at `de87c86` through PR 1B; PR 1C is an implementation candidate pending review, GitHub CI, and merge.

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

## Next Acceptance Boundary

Finish PR 1C GitHub CI and review, then merge only through the normal approval process.

No deployment, tag, live-system inspection, secret action, incident action, readiness claim, or later-workstream implementation is part of this candidate.
