# Verification Command Matrix

Record the exact exit code and material result for every executed command. Unavailable or unauthorized checks are `blocked` or `not run`, never passed.

## Governed Multi-Source Transcript PR A Required Set

| Command | Purpose | Pass signal |
| --- | --- | --- |
| `npm run test:transcript-flow:domain` | Immutable source-set, input-bundle, conflict, apply, and idempotency contracts. | Exit 0 with explicit owned Test-ID assertions. |
| `npm run test:transcript-flow:api` | Strict command/query projection and selector boundaries, including exact `AUTH-001/002` request and assertion-completion ledgers with omitted/substituted producer-trace rejection. | Exit 0. |
| `npm run test:transcript-flow:providers` | Six mocked adapters, Groq parity, atomic budgets, and cleanup recovery. | Exit 0 with explicit provider/budget assertions. |
| `npm run test:transcript-flow:coverage` | Governed PR A source coverage, with the difficult orchestration surface disclosed separately. | At least 90% lines, 85% functions, and 80% branches for the governed set; do not hide the command/query orchestration observation. |
| `npm run test:transcript-flow:postgres` | Full-chain disposable PostgreSQL 16 RLS/ACL/source/apply/budget/rollback scenarios. | Exit 0; explicit assertions pass; temporary database removed. |
| `npm run test:transcript-flow:browser` | Desktop Chrome and Pixel 7 exact-lineage source/review/apply and adverse-state behavior. | Twelve tests pass, six per profile; owned Test-ID assertions emitted. |
| `npm run test:transcript-flow:adversarial` | Browser/provider boundary, hostile-source, and secret-hygiene gates. | Exit 0; zero forbidden/stale/secret hits. |
| `npm run test:transcript-flow:a11y` | Keyboard, focus, accessible relationships, axe, zoom, and overflow on Desktop Chrome and Pixel 7. | Six tests pass, three per profile; zero serious/critical axe findings and no horizontal overflow. |
| `npm run test:transcript-flow:performance` | The implemented 200-candidate half of the interaction budget. | Two `PERF-002-A` tests pass, one per profile; `PERF-002-B` remains explicit `not_run`. |
| `npm run test:transcript-flow:evidence-contract` | Independent evidence/provenance mutation rejection. | 19/19 evidence-contract tests pass: one positive registry-contract case plus 18/18 adversarial rejection cases. |
| `node scripts/runTranscriptFlowEvidence.mjs` | Execute the canonical 33-command matrix and generate Test-ID-native sanitized machine evidence bound to base/head SHA, scoped working-tree digest, workflow identity, source owner/hash, assertion-emitted persona/capabilities/tenant/fixtures, and exact exercised lineage. | Exit 0; 194 exact markers and six truthful `not_run` results are written under `output/process-lifecycle/<base-sha>/<digest>/<attempt>/`; no suite exit synthesizes a Test-ID result. |
| `npm run test:transcript-flow:evidence` | Independently verify assertion completeness, ownership, uniqueness, exact result cardinality, sanitization, exact commands, sources/hashes, emitted runtime context, Git/workflow identity, digest, and truthful not-run boundaries. | Exit 0 with 200 per-assertion results and 33 exact commands. |

The evidence runner also executes browser and Edge typecheck, deterministic scoring, build, dependency audit, workflow YAML validation, retained Enterprise Intelligence/Assess/Studio source and PostgreSQL suites, retained Enterprise Intelligence/Assess/Studio browser suites, mocked full-platform provider tests, the 108-case campaign, boundary/secret checks, and `git diff --check`. Exact-head CI is a separate required acceptance gate and cannot be claimed by a local working-tree run.

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
