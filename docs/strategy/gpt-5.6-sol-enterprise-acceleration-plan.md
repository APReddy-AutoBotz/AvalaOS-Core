# AvalaOS Core Enterprise Acceleration Plan

Status: active plan; PR #205 is accepted and PR 1A is an implementation candidate pending review, CI, and merge
Rebaseline source: `main` at `4cf0a8c5c566d5bcf9035c87ce456b354bc0ee68`
Plan date: 2026-07-10

## 1. Maturity Verdict

> AvalaOS Core is a credible deterministic enterprise demo with substantial source-level governance scaffolding, but not yet a coherent server-authoritative, tenant-safe pilot or production platform.

The repository has valuable deterministic scoring, governed lifecycle concepts, policy scaffolding, server-side AI sources, and extensive historical evidence. It does not yet have one reproducible migration authority, uniform server authorization, verified tenant isolation, production-safe runtime modes, atomic audit for all privileged changes, or deployment evidence.

The first selected major slice is **Identity and tenant-safe Assess**, scored 36/40 for business value, risk reduction, platform unlock, pilot relevance, complexity fit, testability, rollback, and evidence. Studio/private artifacts scored 30/40; Delivery scored 29/40.

PR #205 is the explicitly authorized one-time docs/config-only enterprise rebaseline. This plan replaces routine micro-PR chains with substantial vertical PRs after PR #205 is accepted. It does not authorize another plan-only/evidence-only control PR, implementation, deployment, live inspection, or incident action by itself.

## 2. P0 Stop Gate: Service-Role Storage URL Escape

`P0-001` in the active risk register is a confirmed source defect. At the planning baseline, hosted deployment status was unknown; the executed PR 1A disposition below records the later AP classification.

Before normal PR 1A implementation:

1. Determine through separately approved read-only evidence whether the vulnerable `extract-document-text` function/path is deployed.
2. If deployment is **unknown**:
   - Record `UNKNOWN — TREAT AS POTENTIALLY DEPLOYED`.
   - Block pilot, production, deployment, storage, and security readiness claims.
   - Keep the endpoint prohibited or disabled.
   - Permit only the isolated source fix and tests.
   - Do not begin broader PR 1A work until deployment is resolved or the AP explicitly accepts proceeding with the endpoint disabled.
3. If **deployed**:
   - Stop the normal sequence.
   - Request explicit AP approval for containment or endpoint disabling, sanitized log review, key/service-role rotation assessment, and incident evidence.
   - Resume only after containment is confirmed and the AP approves the recovery path.
4. If **not deployed**:
   - Fix and test the defect before broader PR 1A refactoring.
5. Never expose secrets, raw logs, signed URLs, customer data, object identifiers, or production infrastructure identifiers in evidence.

PR #205 did not perform deployment inventory, endpoint changes, log review, rotation, or live-system access.

**Executed PR 1A disposition:** the AP manually inspected the intended Supabase project and reported that `extract-document-text` was not present. Classification: **NOT DEPLOYED**. The repository run did not inspect live infrastructure or request, record, or emit infrastructure identifiers. The isolated P0 source fix and tests remained the first logical commit before broader PR 1A work.

## 3. Locked Target Contracts

### Runtime modes

- `local_demo`: mock identities, local persistence, and clearly labeled demo behavior may be enabled.
- `automated_test`: deterministic fixtures and fakes may be enabled inside tests.
- `pilot`: required server configuration and authority fail closed; no browser AI or demo authority.
- `production`: the same fail-closed authority as pilot with production deployment controls.

### Identity and authorization

- `TenantContext` is a server-issued projection of user, organization, workspace, membership, capabilities, and authorization version. It is not authority by itself.
- Every privileged request revalidates active identity, tenant membership, workspace access, resource ownership, permissions, and revocation state on the server.
- Membership, role, module, permission, or workspace changes increment an authorization version and invalidate affected caches.
- Revocation denies the next request. Client claims, email matching, demo personas, cached permissions, routes, and UI state cannot authorize behavior.
- Cross-tenant reads, lists, counts, mutations, and errors do not reveal resource existence.

### Typed command handling

One `assess-command` Edge entry point may exist only as transport and routing. It delegates to separate typed handlers for assessment creation, response persistence, score/finalize, Govern resolution, and Studio handoff.

Each handler independently owns:

- schema validation and stable error codes;
- authoritative tenant/workspace/resource authorization;
- transaction boundaries and optimistic version checks;
- idempotency and concurrency behavior;
- deterministic domain rules;
- atomic state and audit persistence;
- independent unit and integration tests.

Command envelopes carry a request ID, idempotency key, command type, expected version when applicable, and requested tenant/workspace context. The server derives or verifies every authority-bearing value.

## 4. Workstream 1: Enterprise Foundation And Assess

### PR 1A — Platform Safety and Fail-Closed Runtime Foundation

Entry: PR #205 is accepted and merged; PR 1A started from fresh `main` at `4cf0a8c5c566d5bcf9035c87ce456b354bc0ee68`; the AP classified P0 as not deployed before broader implementation.

Deliver:

- explicit runtime modes and pilot/production fail-closed configuration;
- removal of demo/mock/browser-AI authority from pilot and production paths;
- P0 Storage URL escape remediation;
- Edge export authorization hardening;
- unsafe HTML remediation after source-to-sink validation;
- fail-closed privileged audit behavior;
- directly related false-success remediation;
- canonical migration-chain reconciliation required for PR 1B;
- directly required CI and security gates.

Acceptance: P0 disposition recorded; negative security tests pass; pilot/production cannot silently use demo authority; directly affected checks run in CI; no score behavior changes.

Current draft status: the corrected implementation candidate has local source, regression, coverage, build, and deterministic Chromium browser/axe/desktop/mobile evidence. The expanded populated fresh/upgrade/dirty-data migration harness passed in both push and pull-request PostgreSQL CI jobs because no disposable local database was configured. The corrected quality jobs, review, and merge remain acceptance gates; no performance, hosted, deployment, or live-system pass is claimed.

Rollback: keep vulnerable endpoints disabled; revert non-security runtime refactors if necessary; never restore service-role URL construction or production fail-open behavior.

### PR 1B — Server-Authoritative Identity, RBAC, RLS, And Assess

Depends on accepted PR 1A evidence.

Deliver:

- tenant membership, normalized roles/permissions, workspace access and revocation, authorization versions, and server-derived TenantContext;
- server reauthorization for every privileged request and mutation;
- Assess persistence and deterministic server scoring parity through separate typed handlers;
- RLS and non-disclosing cross-tenant behavior for reads, lists, counts, writes, and errors;
- concurrency, expected-version, idempotency, audit, fresh/upgrade migration, and rollback coverage.

Acceptance: stale TenantContext and revoked sessions deny immediately; two-tenant tests cover positive and negative paths; server scoring matches the locked regression corpus; migrations reproduce the accepted schema from fresh and upgrade states.

Rollback: disable enterprise commands or enter read-only maintenance mode; preserve data and audit history; forward-fix migrations rather than using destructive rollback.

### PR 1C — Enterprise Assess UI Cutover, Govern Resolution, And Studio Handoff

Depends on accepted PR 1B authorization, migration, and scoring evidence.

Deliver:

- organization/workspace selection and server-issued session context;
- explicit loading, empty, error, offline, stale, revoked, blocked, and expired-session states;
- authorized Govern resolution before handoff;
- atomic Govern and Studio handoff command handlers with false-success prevention;
- accessible, responsive browser journeys and end-to-end tenant isolation coverage.

Acceptance: no UI path bypasses Govern; failed persistence cannot render success; revocation is visible and immediately denies action; browser E2E, accessibility, responsive-state, and relevant performance gates pass.

Rollback: disable handoff and UI cutover flags; enter read-only maintenance mode; preserve server records. Never fall back to demo authority in pilot or production.

## 5. Later Workstreams And Dependencies

| Workstream | Substantial PR boundary | Dependency and outcome |
| --- | --- | --- |
| 2. Studio, documents, private artifacts | 1–2 PRs | After 1C: server-controlled generation/approval/versioning, then private storage, scoped export, retention, and download authority. |
| 3. Delivery and lineage | 1–2 PRs | After Workstream 2 contracts stabilize: canonical artifact import, lineage, idempotent handoff, workflow controls, exceptions, audit, and soft deletion. |
| 4. Monitor, Admin, Trust | 1–2 PRs | After tenant-safe source domains exist: server read models, administrative controls, entitlements, and claim-safe evidence presentation. |
| 5. Shared quality infrastructure | 0–1 PR | Only when a shared CI, coverage, migration, browser, or security capability serves at least two slices and cannot sensibly live in either. |
| 6. Deployment and pilot control | 1–2 PRs | After the selected pilot journey is complete: promotion, observability, secrets, rollback automation, operator controls, and controlled cutover. |

Primary order:

`P0 gate → 1A → 1B → 1C → 2 → 3 → 4 → 6`

Workstream 5 is demand-driven, not a bucket for quality deferred from product PRs.

Each workstream may contain one to three substantial vertical PRs only when security, schema, deployment, or rollback isolation requires it. After the one-time PR #205 rebaseline is accepted, routine plan-only, evidence-only, reconciliation-only, post-merge-only, and closure-only PRs are prohibited. Tests, migration notes, acceptance evidence, and rollback travel with the behavior they verify.

## 6. Quality And Evidence Contract

Every implementation PR includes:

- lint, typecheck, build, changed-critical-module coverage, unit, integration, and feature regression tests;
- server authorization and stale/revoked-context negative tests;
- cross-tenant list, count, error, resource-existence, and mutation tests;
- idempotency, concurrency, transaction, audit-failure, and false-success tests;
- fresh database, upgrade, migration-failure, and read-only/rollback tests when schema changes;
- security and secret-hygiene checks for the affected boundary;
- browser E2E, accessibility, responsive-state, and relevant performance checks for UI slices;
- exact results and sanitized evidence in the same PR.

Unavailable, unauthorized, or intentionally omitted checks are recorded as `blocked` or `not run`, never as passed.

## 7. Ready-To-Paste PR 1A Prompt

```text
You are implementing AvalaOS Core Workstream 1, PR 1A: Platform Safety and Fail-Closed Runtime Foundation.

PR 1A may begin only after the AvalaOS Enterprise Rebaseline PR has been accepted and merged. Start from a fresh, clean current main; do not continue from the rebaseline branch.

## P0 STOP CONDITION — SERVICE-ROLE STORAGE URL ESCAPE

Before normal implementation, determine through separately approved read-only evidence whether the vulnerable extract-document-text function/path is deployed.

- If DEPLOYED: stop the normal sequence. Report sanitized evidence and request explicit AP approval for containment or endpoint disabling, log review, key/service-role rotation assessment, and incident handling. Do not perform production mutations or continue broader refactoring.
- If NOT DEPLOYED: fix and test the URL escape before any broader PR 1A changes.
- If UNKNOWN: record `UNKNOWN — TREAT AS POTENTIALLY DEPLOYED`, block all readiness/deployment claims, keep the endpoint prohibited or disabled, and implement only the isolated source fix and tests. Do not continue broader PR 1A work unless deployment is resolved or the AP explicitly accepts proceeding with the endpoint disabled.
- Never expose secrets, tokens, raw logs, signed URLs, customer data, storage identifiers, or production infrastructure identifiers in evidence.

## AUTHORITATIVE READING ORDER

Read only:
1. docs/00_SOURCE_OF_TRUTH.md
2. AGENTS.md
3. docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md
4. docs/architecture/current-to-target-enterprise-architecture.md
5. docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md
6. PLANS.md
7. Domain documents explicitly routed by docs/architecture/document-authority-map.md

Do not inventory or read the full historical planning/evidence corpus unless a current artifact links to specific evidence required for this PR.

## CONTROLLED PERMISSION AND DELEGATION PHASES

The root controller retains final authority for scope, plan, integration, acceptance, and the single PR. Only the root controller may spawn agents. Recursive or nested delegation is prohibited.

- If any child creates or attempts to create a descendant, interrupt it immediately and mark the orchestration run failed.
- Keep `max_threads = 4` as the effective tested concurrency cap.
- Keep `max_depth = 1` configured, but do not rely on it as the only containment control until https://github.com/openai/codex/issues/32027 is fixed and retested.
- Treat per-agent `sandbox_mode` values as defaults; the live parent permission selection is reapplied to spawned children.
- Never use `--yolo` or `danger-full-access` for this controlled workflow.

After the P0 gate permits broader work, start Wave 1 with the live parent/controller permission set to read-only and run the findings-only reviewers concurrently:

- `architecture_explorer`: map affected trust boundaries, dependencies, and file ownership.
- `security_reviewer`: validate attack paths, authorization boundaries, negative tests, and residual risk.
- `quality_reviewer`: define feature-owned CI, migration, coverage, accessibility, performance, rollback, and evidence requirements.

All Wave 1 reviewers must finish and close before the root controller changes permissions. The controller must synthesize and resolve conflicting findings before implementation begins.

Only after Wave 1 is complete and no reviewer remains active may the root controller explicitly switch to workspace-write. Wave 2 may then use up to three `implementation_worker` instances only for independent, non-overlapping, substantial tracks. No reviewer may run during the write-enabled phase. Every assignment must include its behavior, focused tests, documentation updates, and rollback notes; micro-tasks are prohibited.

Suggested PR 1A ownership:

- Track A: explicit runtime modes and removal of demo/mock/browser-AI authority from pilot and production paths.
- Track B: P0 Storage remediation, Edge export authorization, privileged audit behavior, and affected Edge tests.
- Track C: validated unsafe-rendering remediation and directly related false-success UI behavior with tests.

Assign exclusive file ownership before workers edit. Workers must not create branches or PRs independently. Serialize any materially overlapping portion.

The root controller owns migration-chain reconciliation, CI integration, conflict resolution, full verification, final security/quality review, and the one draft PR.

## OBJECTIVE

Deliver one substantial vertical PR that establishes a fail-closed runtime and resolves directly related P0/P1 safety defects without changing deterministic scoring behavior or expanding product scope.

## REQUIRED IMPLEMENTATION

- Introduce explicit `local_demo`, `automated_test`, `pilot`, and `production` runtime modes.
- Permit demo identities, mock persistence, browser AI, and fallback success only in local demo or controlled tests.
- Make pilot and production fail closed when required server configuration or authority is unavailable.
- Fix the service-role Storage URL escape with allowlisted storage authority, canonical path handling, strict input validation, and negative traversal/URL-normalization tests.
- Correct directly related Edge export authorization weaknesses.
- Replace unsafe HTML rendering at validated user-controlled sinks.
- Make privileged audit persistence transactional or fail closed.
- Remove directly related false-success behavior.
- Reconcile the canonical migration chain only as required to make PR 1B safe and reproducible.
- Add the CI and security checks directly required by these changes.

Do not implement PR 1B identity/RBAC/Assess persistence or PR 1C UI/Govern/handoff behavior.

## ENGINEERING RULES

- One Edge entry point may route commands, but business behavior must live in separate typed handlers with independent validation, authorization, transactions, idempotency, audit, stable errors, and tests.
- No client claim, email match, demo persona, cached permission, route, or UI state may become server authority.
- Do not change scoring formulas, weights, thresholds, hard stops, or recommendation logic.
- Do not add browser-side provider secrets, browser AI authority, AGS, MCP, A2A, or autonomous agent execution.
- Do not modify KlarityFlow Health.
- Preserve historical evidence. After the accepted one-time PR #205 rebaseline, do not create routine plan-only, evidence-only, reconciliation-only, post-merge-only, or closure-only PRs.

## VERIFICATION AND EVIDENCE

Run the repository baseline checks plus feature-specific lint, typecheck, tests, coverage, security, secret-hygiene, migration, and build checks. Include negative tests for traversal, malformed URLs, missing configuration, unauthorized export, audit failure, and production-mode fallback.

Update the active plan, risk register, migration notes, and acceptance evidence inside this PR. Evidence must be sanitized.

Document:
- P0 deployment determination and evidence basis
- changed trust boundaries
- acceptance results
- known unknowns
- rollback or endpoint-disable procedure
- residual risks and the exact PR 1B entry gate

Create one intentional branch from current main, a small number of logical and reviewable commits, and one draft PR. Do not merge, deploy, rotate keys, disable a live endpoint, or begin PR 1B without the required approval and accepted PR 1A evidence.
```
