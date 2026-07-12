# PR 1B Server-Authoritative Identity, RBAC, RLS, And Assess Evidence

Status: implementation candidate; security-critical acceptance correction implemented; corrected local evidence passed; GitHub CI, review, and merge pending

## Scope And Baseline

- Branch: `codex/pr-1b-server-authoritative-identity-rbac-rls-assess`.
- Baseline: refreshed `origin/main` at `3ef9c9ae1b91881d12fab8d753ba152ec078c3fa`.
- PR #206 head `830f70d0449dac4a97921fe8a8e2845755a23c79` is an ancestor of the baseline.
- The initial worktree was clean. P0 remains classified **NOT DEPLOYED** from the accepted PR 1A boundary; no live infrastructure was accessed.

## Delivered Boundary

The first PR 1B candidate exposed its three `SECURITY DEFINER` mutation RPCs to
`authenticated`. That was a **confirmed source defect**: a browser holding a
valid caller JWT could bypass the typed Edge handlers and invoke create,
response-upsert, or finalize directly. In particular, it could submit scores
and a non-empty score version chosen by the caller. Earlier green source gates
did not test actual RPC execution privileges and therefore did not establish
the claimed server-authoritative command boundary.

The correction makes the RPCs an internal server command surface. `PUBLIC`,
`anon`, and `authenticated` receive no execute privilege; only `service_role`
may execute them. The Edge handler authenticates and authorizes with the caller
JWT, derives the actor from that validated identity, then uses the server-held
service credential only for the internal aggregate read and mutation call.
The private transaction receives the explicit validated actor and independently
rechecks active organization/workspace authority, normalized capability,
authorization version, aggregate version, idempotency, and tenant ownership.
The service credential is never command input or client output.

- Caller-JWT server-derived TenantContext with organization, workspace, normalized capabilities, and authorization version.
- Immediate authority invalidation for membership, role, and capability changes.
- Database-enforced tenant/scope role integrity and permission-aware Assess RLS.
- Workspace-complete Assess lineage, optimistic versions, idempotency receipts, append-only privileged audit, and atomic command RPCs.
- Transport-only `assess-command` routing to separate create, response-upsert, and finalize handlers.
- Finalize reloads persisted input through the server-only database client after caller authorization and runs the unchanged `assess-core-2026-05` deterministic engine server-side.
- Stable non-disclosing command outcomes and conflict codes. Govern resolution, Studio handoff, and browser UI cutover remain PR 1C.

## Executed Function Privilege Matrix

| Function surface | `PUBLIC` | `anon` | `authenticated` | `service_role` | Justification |
| --- | --- | --- | --- | --- | --- |
| `pr1b_create_assessment`, `pr1b_upsert_assessment_responses`, `pr1b_finalize_assessment` | Denied | Denied | Denied | Execute | Private mutation boundary called only by trusted Edge code after validation. |
| `get_tenant_context` | Denied | Denied | Execute | Owner/default only | Caller-scoped, non-authoritative tenant projection derived from `auth.uid()`. |
| `has_workspace_capability`, `is_active_workspace_member` | Denied | Denied | Execute | Owner/default only | Required by authenticated RLS/projection evaluation; inputs cannot override `auth.uid()` and tests prove non-disclosure. |
| PR 1B trigger, authorization, receipt, error, and immutability helpers | Denied | Denied | Denied | No direct grant | Internal execution through triggers or security-definer mutation functions only. |

PostgreSQL runtime checks inspected ACLs and attempted all three mutation calls as both `anon` and `authenticated`; every direct call was denied before domain state changed.

## Executed Evidence

| Check | Result | Material signal |
| --- | --- | --- |
| Repository/ancestry preflight | Passed | Clean branch and baseline; PR #206 head is an ancestor of refreshed `origin/main`. |
| `npm ci` | Passed | 171 packages installed; 172 audited; 0 vulnerabilities. |
| `npm run typecheck` | Passed | Exit 0. |
| `npm run typecheck:edge` | Passed | Exit 0. |
| `npm run test:scoring` | Passed | Locked deterministic, validation, golden, monotonic, and polarity corpus passed. |
| `npm run test:pr1b` | Passed | Source/migration contracts, authority, endpoint, command, scoring parity, and coverage passed. |
| PR 1B coverage | Passed | 95.61% lines, 81.42% branches, 100% functions for instrumented critical modules. SQL and fetch adapters are covered by direct and migration suites, not this percentage. |
| `npm run test:migrations:pr1b` | Passed | Disposable PostgreSQL 15 executed the real RPC privilege, forged-input, trusted mutation, replay/conflict, two-client concurrency, rollback, revocation, non-disclosure, unexpected-failure, fresh/reapply/upgrade/dirty/read-only/forward-fix matrix. |
| `npm run test:migrations:pr1a` | Passed after CI harness correction | The older full-chain harness now bootstraps the disposable Supabase `service_role`; fresh, idempotency, upgrade, RLS, and failure scenarios passed without changing an accepted migration. |
| `npm test` | Passed | Full default regression including PR 1A and PR 1B gates exited 0. |
| `npm audit --audit-level=moderate` | Passed | 0 vulnerabilities. |
| `npm run test:ai-boundary-static` | Passed | 15 patterns; 734 allowed classified hits; 0 forbidden; 0 stale. |
| `npm run test:secret-hygiene` | Passed | 5 rules; 757 allowed classified hits; 0 forbidden; 0 tracked environment files. |
| `npm run build` | Passed with warning | 204 modules transformed; production bundle built. Browserslist data warning retained without dependency mutation. |
| Offline Markdown-link validation | Passed | All relative links in the six changed active documentation files resolved locally. |
| `git diff --check` | Passed | No whitespace errors. |

## Planned Verification

- GitHub push and pull-request CI after publication.

## Not Run And Proof Boundary

- Browser E2E, accessibility, and responsive checks are not feature-owned by PR 1B because it changes no UI. The repository-wide PR 1A browser gate was attempted locally; Chromium downloaded, but execution was `blocked` by missing host library `libnspr4.so`, and installing system dependencies required unavailable sudo authentication. GitHub CI remains the authoritative browser execution for this publication.
- A handler/DB performance budget is `not run`; no repository-owned PR 1B budget exists.
- Hosted database, deployment, live RLS, Storage, live Edge invocation, logs, secrets, incident, rotation, backup/restore, pilot, and production checks are `not run` and outside scope.
- Local disposable evidence and authored controls do not prove hosted tenant isolation, deployment, pilot, production, security certification, or compliance readiness.

## Rollback And Residual Risk

Disable the new Edge endpoints or place enterprise commands in read-only maintenance mode. Preserve domain rows, command receipts, authorization versions, and audit history. Use additive forward-fix migrations; do not destructively down-migrate and never fall back to browser/demo authority. Deployed and hosted behavior remains unproven until separately authorized evidence exists.
