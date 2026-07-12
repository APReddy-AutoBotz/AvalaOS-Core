# PR 1B Server-Authoritative Identity, RBAC, RLS, And Assess Evidence

Status: implementation candidate; local source acceptance in progress; GitHub CI, review, and merge pending

## Scope And Baseline

- Branch: `codex/pr-1b-server-authoritative-identity-rbac-rls-assess`.
- Baseline: refreshed `origin/main` at `3ef9c9ae1b91881d12fab8d753ba152ec078c3fa`.
- PR #206 head `830f70d0449dac4a97921fe8a8e2845755a23c79` is an ancestor of the baseline.
- The initial worktree was clean. P0 remains classified **NOT DEPLOYED** from the accepted PR 1A boundary; no live infrastructure was accessed.

## Delivered Boundary

- Caller-JWT server-derived TenantContext with organization, workspace, normalized capabilities, and authorization version.
- Immediate authority invalidation for membership, role, and capability changes.
- Database-enforced tenant/scope role integrity and permission-aware Assess RLS.
- Workspace-complete Assess lineage, optimistic versions, idempotency receipts, append-only privileged audit, and atomic command RPCs.
- Transport-only `assess-command` routing to separate create, response-upsert, and finalize handlers.
- Finalize reloads persisted input under caller RLS and runs the unchanged `assess-core-2026-05` deterministic engine server-side.
- Stable non-disclosing command outcomes and conflict codes. Govern resolution, Studio handoff, and browser UI cutover remain PR 1C.

## Executed Evidence

| Check | Result | Material signal |
| --- | --- | --- |
| Repository/ancestry preflight | Passed | Clean branch and baseline; PR #206 head is an ancestor of refreshed `origin/main`. |
| `npm ci` | Passed | 171 packages installed; 172 audited; 0 vulnerabilities. |
| `npm run typecheck` | Passed | Exit 0. |
| `npm run typecheck:edge` | Passed | Exit 0. |
| `npm run test:scoring` | Passed | Locked deterministic, validation, golden, monotonic, and polarity corpus passed. |
| `npm run test:pr1b` | Passed | Source/migration contracts, authority, endpoint, command, scoring parity, and coverage passed. |
| PR 1B coverage | Passed | 95.64% lines, 80.00% branches, 100% functions for instrumented critical modules. SQL and fetch adapters are covered by direct and migration suites, not this percentage. |
| `npm test` | Passed | Full default regression including PR 1A and PR 1B gates exited 0. |
| `npm audit --audit-level=moderate` | Passed | 0 vulnerabilities. |
| `npm run test:ai-boundary-static` | Passed | 15 patterns; 734 allowed classified hits; 0 forbidden; 0 stale. |
| `npm run test:secret-hygiene` | Passed | 5 rules; 754 allowed classified hits; 0 forbidden; 0 tracked environment files. |
| `npm run build` | Passed with warning | 204 modules transformed; production bundle built. Browserslist data warning retained without dependency mutation. |
| `git diff --check` | Passed | No whitespace errors. |

## Planned Verification

- `npm run test:migrations:pr1b` in disposable PostgreSQL 15: fresh chain, populated upgrade, dirty-data transactional failure, reapply, authorization invalidation, two-tenant RLS/non-disclosure, read-only fallback, and forward-fix preservation.
- Documentation-link validation and GitHub CI checks.
- GitHub push and pull-request CI after publication.

## Not Run And Proof Boundary

- Browser E2E, accessibility, and responsive checks are `not run — not applicable` because PR 1B changes no UI; PR 1C owns browser cutover.
- A handler/DB performance budget is `not run`; no repository-owned PR 1B budget exists.
- Hosted database, deployment, live RLS, Storage, Edge invocation, logs, secrets, incident, rotation, backup/restore, pilot, and production checks are `not run` and outside scope.
- Local disposable evidence and authored controls do not prove hosted tenant isolation, deployment, pilot, production, security certification, or compliance readiness.

## Rollback And Residual Risk

Disable the new Edge endpoints or place enterprise commands in read-only maintenance mode. Preserve domain rows, command receipts, authorization versions, and audit history. Use additive forward-fix migrations; do not destructively down-migrate and never fall back to browser/demo authority. Deployed and hosted behavior remains unproven until separately authorized evidence exists.
