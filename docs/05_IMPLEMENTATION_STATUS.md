# AvalaOS Core Implementation Status

Baseline: `main` at `6877bd90f5f93e685b5ec47a0fbafa2c57a99e09` through PR #204.

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

## Confirmed Source Defects And Gaps

- P0 service-role Storage URL escape; deployment status unknown.
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

- Deployment status of the vulnerable extraction function.
- Hosted schema or migration state.
- End-to-end server-authoritative identity, RBAC, workspace authorization, and immediate revocation.
- RLS and two-tenant non-disclosure across pilot paths.
- Server Assess scoring parity and durable Assess lifecycle.
- Private storage, export, signed URL, rollback, incident, backup/restore, observability, pilot, production, buyer, release-candidate, security, or compliance readiness.

## Next Accepted Planning Boundary

After this docs/config-only rebaseline is accepted and merged, PR 1A starts from fresh current `main` and begins with the P0 decision. PR 1B and PR 1C follow only after their predecessor evidence is accepted.

No product source, migration, runtime, environment, deployment, secret, or live-system behavior is changed by the rebaseline PR.
