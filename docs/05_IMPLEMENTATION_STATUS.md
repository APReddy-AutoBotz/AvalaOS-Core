# AvalaOS Core Implementation Status

## Enterprise Intelligence Draft PR (in progress)

The isolated implementation worktree is based on exact required baseline `cafed0ba8b4790536c4e1305dbbf1cdf6ef2e4f5` and uses branch `codex/enterprise-intelligence-byok-ingestion-delivery-assemble`. The original dirty checkout and its two existing deck files are outside this worktree and were not modified.

The source candidate implements multi-provider BYOK, bounded document/transcript ingestion into Assess, server-derived Modernization disposition, exact approved Studio handoff to Delivery and Monitor, and draft-only Assemble Phase 1 blueprints. Assess scoring law is unchanged; runtime agents, browser AI, live telemetry, deployment, and live infrastructure access are not included.

Executed evidence now includes the feature-owned source/CI contract, aggregate domain/AI/ingestion/command/query/mocked-lifecycle suites, TypeScript and Edge checks, unchanged scoring regression, AI-boundary and secret-hygiene scans, and 79 strict migration assertions. Disposable PostgreSQL 16 passed fresh, accepted-main upgrade, populated upgrade, atomic dirty rejection, 12 Enterprise authority scenarios, read-only fallback, and cleanup. The retained Studio executable suite also passed its fresh/upgrade/populated/dirty paths, 20 membership scenarios, and 16 Studio scenarios after the guard was corrected to allow additive later migrations. The complete retained repository test command finished with exit 0 in 31m08s, and 16/16 Desktop Chrome and Pixel 7 journeys passed with accessibility and fail-closed checks. Production build, dependency audit, retained Studio lint, Enterprise lint, and diff hygiene passed; exact-head GitHub evidence remains pending. Real providers, live Vault, hosted Supabase/Storage, deployment, telemetry, and infrastructure were not accessed; no pilot, production, security-certification, compliance, or readiness claim is made.

## Studio PR B accepted implementation boundary

Accepted through PR #217 and corrective PR #218 on verified main baseline `bc6dfcde2806bd0ea2067d64baf6fea91d32c207`: deterministic Markdown/PDF/DOCX rendition authority, private create-only storage, brokered downloads, retention-policy snapshots, legal-hold events, governed deletion with independent approval, strict projection/client/UI states, reconciliation, and feature-owned tests/CI. The five PR #217 post-merge findings are closed and both PRs have zero unresolved review threads. No hosted/live, deployment, readiness, security-certification, or compliance proof is claimed.

## Studio PR A implementation boundary

Studio PR A owns exact accepted PR 1E ancestry, immutable structured-JSON versions, durable staged provider attempts, independent review, and separate approval. Provider calls are not cross-system atomic. Accepted Studio PR B private storage and governed rendition/download remain a separate authority boundary; legacy `document_generations` remains unverified. Rollback is mutation/provider disablement with read-only committed projection and additive forward fixes.


Baseline: Studio PR B accepted and post-merge verified on `main` at `bc6dfcde2806bd0ea2067d64baf6fea91d32c207`.

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

PR 1E review, approval, Govern, and Studio-source handoff are accepted. V1 `assess-core-2026-05` scoring is unchanged and PR 1D decisions remain immutable. Hosted/live validation and deployment were not run; readiness remains unproven. PR 1F and PR 1G Application Portfolio Assessment are accepted.


## PR 1F Accepted Closure

PR #212 is accepted with head `f793f9dd9f75adf874fa3ee82b1f4adb2b2734f6`, merge and verified main `480cc9b943e8b51b074873c20c2a9f30dc6521c2`, successful exact-head workflows `29842917740` and `29842914443`, successful main workflow `29844001756`, and zero unresolved threads. Versioned economics, deterministic scenarios, independent review, append-only outcomes, **Insufficient Data** calibration reporting, and tenant/workspace portfolio dispositions are accepted. V1 scoring, PR 1D immutability, and PR 1E authority are unchanged. Deployment/hosted validation were not run; PR 1G Application Portfolio Assessment is accepted; broader Studio/private-artifact work is not started.

PR #214 accepted head `cc741f2d44304c57b493834eaa0219c524819ff8` is merged as `4fd672981b397207d46c8c9ccfe038e98012fe4e`; corrective PR #215 accepted head `8fee4cf23b04e6b89323bf73329b18ac28d65aa7` is merged as `46b860445996f8be5b0e53138d455c60f7b24a5a`. The accepted correction separates detailed and snapshot read capabilities, derives Process × Application Govern/economics ancestry from committed PR 1D/1E/1F records, scopes assessment progression and lifecycle actions to an explicitly selected application, serializes workspace snapshot versions, and prevents cross-workspace receipt replay or disclosure.

Executed post-merge verification passed PostgreSQL 16 with 114 scenarios passed and 0 failed, semantic parity across 13 fixtures, detection of 26 adversarial mutations, PR 1G desktop/mobile browser tests, and focused coverage of 96.53% lines, 80.46% branches, and 95.74% functions. The four late PR #214 findings were verified against merged source and executable tests, replied to, and resolved; PR #214 and PR #215 have zero unresolved review threads. Exact-main workflows passed, with Supabase smoke skipped only under the configured non-live condition. No deployment, hosted/live validation, production certification, scoring formula, weight, threshold, or decision-law change occurred.
