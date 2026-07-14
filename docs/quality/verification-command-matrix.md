# Verification Command Matrix

Record the exact exit code and material result for every executed command. Unavailable or unauthorized checks are `blocked` or `not run`, never passed.

## PR 1A Required Set

| Command | Purpose | Pass signal |
| --- | --- | --- |
| `npm ci` | Reproducible dependency install when a clean install is required. | Exit 0; lockfile unchanged. |
| `npm audit --audit-level=moderate` | Dependency vulnerability gate. | Exit 0. Do not run `npm audit fix` without approval. |
| `npm run typecheck` | Browser/application TypeScript contracts. | Exit 0. |
| `npm run typecheck:edge` | Edge/shared TypeScript boundary. | Exit 0. |
| `npm run lint:pr1a` | PR 1A fail-closed source invariants. | Exit 0. |
| `npm run test:pr1a` | Runtime, export, audit, rendering, false-success, migration-contract, and owned-module coverage gates. | Exit 0; configured coverage thresholds pass. |
| `npm run test:required-supplemental` | Evidence, product-action, workflow, artifact, and helper-guard suites. | Exit 0. |
| `npm test` | Complete default regression chain, including the supplemental and PR 1A gates. | Exit 0. |
| `npm run test:migrations:pr1a` | Disposable PostgreSQL fresh-chain, targeted upgrade, RLS/constraint, failure, and reapply checks. | Exit 0; temporary state removed. |
| `npm run test:ai-boundary-static` | Browser/provider boundary source scan. | Exit 0; zero forbidden and zero stale entries. |
| `npm run test:secret-hygiene` | Secret and unsafe-output source scan. | Exit 0; zero forbidden hits and zero tracked environment files. |
| `npm run build` | Production bundle compilation. | Exit 0. |
| `codex app-server --strict-config --stdio` | Repository `.codex` schema validation through the supported strict app-server path. | Exit 0 after stdin closes; no unsupported-key error. |
| Markdown link validation | Active and new documentation links. | Repository-supported checker exits 0. |
| `git diff --check` | Patch whitespace integrity. | Exit 0. |
| Changed-file review | Scope and historical-evidence check. | Only approved PR 1A behavior, test, CI, migration, and active evidence files changed; historical evidence remains unchanged. |

## Unavailable Or Separate Gates

Browser E2E, accessibility, responsive-state, and performance execution require an available authorized browser toolchain. In PR 1A the executable Playwright CLI was absent and managed approval denied the third-party package download, so these checks are `blocked`, not passed.

Hosted database, RLS/tenant-isolation, Storage, Edge invocation, deployment, environment, log, secret, incident, rotation, backup/restore, and production checks require separate explicit authority and are not implied by local source or disposable migration evidence.

## PR 1B Required Set

| Command | Purpose | Pass signal |
| --- | --- | --- |
| `npm run lint:pr1b` | Server-authority and canonical migration invariants. | Exit 0. |
| `npm run test:tenant-authority` | Caller-JWT TenantContext, RBAC, revocation, and endpoint negatives. | Exit 0. |
| `npm run test:assess-command` | Typed handlers, concurrency/idempotency contracts, non-disclosure, and locked server scoring parity. | Exit 0. |
| `npm run test:pr1b-coverage` | Changed-critical-module coverage. | At least 90% lines, 85% functions, 80% branches. |
| `npm run test:pr1b` | Complete focused PR 1B source boundary. | Exit 0. |
| `npm run test:migrations:pr1b` | Real PostgreSQL RPC privilege denial and trusted execution; forged input, idempotency, concurrency, version/revocation, non-disclosure, sanitized failure, atomicity/rollback, fresh/upgrade/dirty/reapply/read-only/forward-fix proof. | Exit 0; disposable state removed. |
| `npm run test:scoring` | Locked deterministic scoring regression. | Exit 0; `assess-core-2026-05` unchanged. |

PR 1B also runs the applicable PR 1A required set, full default regression, build, secret/AI-boundary scans, link validation, `git diff --check`, and changed-file review. Browser/accessibility/responsive checks are not applicable unless UI behavior changes. Hosted or live checks remain separately authorized.

## PR 1D Current Authority

PR #208 / PR 1C is accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; Workstream 1A-1C is accepted at source/CI level. PR 1D is the active substantial Avala Assess V2 decision-correctness boundary. V1 `assess-core-2026-05` remains an unchanged legacy deterministic heuristic. PR 1E (review/approval and handoff authority) and PR 1F (calibration and economics) follow before broader Studio/private-artifact expansion. Hosted, deployment, pilot, production, security-certification, buyer, and compliance readiness remain unproven. Routine micro-PRs and plan/evidence/reconciliation/closure-only PRs remain prohibited.

PR 1D feature-owned verification: `npm run test:pr1d`, `npm run test:migrations:pr1d`, `npm run test:browser:pr1d`, and `npm run test:docs:pr1d`, in addition to all retained PR 1A/1B/1C, typecheck, audit, security, build, and diff gates. Unavailable checks are Blocked or Not Run, never passed.

Executed local results and the proof boundary are recorded in [PR 1D Avala Assess V2 Decision Intelligence Evidence](./pr1d-assess-v2-decision-intelligence-evidence.md).
