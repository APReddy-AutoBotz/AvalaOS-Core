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

## Governed Delivery And Monitor PR C Controlled-Human Set

Preparation/execution is separately authorized only for one dedicated synthetic `hosted_nonproduction_pilot` backend and `https://deploy-preview-264--avalaos-pilot.netlify.app`. The commands below prove source contracts locally; they do not execute or pass `CONTROLLED-HUMAN`.

| Command or workflow | Purpose | Pass signal |
| --- | --- | --- |
| `node --test scripts/writeHostedPilotNetlifyHeaders.test.mjs` | Prove controlled activation and headers are exclusive to the exact PR #264 Deploy Preview, while ordinary branches/other PRs stay unactivated and production retains the exact stable non-production authorization gate. | All 59 focused Netlify authority cases pass, including stable/custom/AvalaOS.com, substituted preview negatives, and proof that legacy browser-test environment names cannot enable the internal loopback adapter. |
| `npm run test:runtime-mode` | Validate exact browser head/deploy/origin/exercise/backend binding and exact server-returned controlled-human migration tip before server authentication can proceed. | Runtime boundary suite passes; malformed, stale, foreign, `/sandbox`, missing/extra-field, and wrong-migration attestations reject. |
| `node --test scripts/prCControlledHumanEvidenceContract.test.mjs scripts/prCControlledHumanWorkflowContract.test.mjs` | Validate all eight journey/14 checkpoint contracts, canonical requester/reviewer/approver action ownership, immutable pre-action target/version/request anchors, exact receipt/audit completion through real command/projection paths, unique exact causal server events, explicit browser attestations/attempts, three-human signing, exact run/attempt/artifact/preview/backend/seed/reset binding, active-before-quiesce/read-only-after-quiesce ordering, protected abort/expiry recovery, trusted Edge deployed-source proof, sanitization, zero egress/side effects, and defect invalidation. | All 33 focused contract tests pass; missing anchors, different valid targets, wrong versions/families/requests, evidence-only denials, unexpected success, reused/outside-window events, and other mutations fail closed. This remains source evidence only. |
| `node --test scripts/prCControlledHumanEnvironment.test.mjs scripts/prCControlledHumanEnvironmentMigration.test.mjs` | Exercise exact inventory/authority, canonical action/resource-family ownership, apply/quiesce/deprovision replay, every post-mutation/pre-artifact failure boundary, exact partial-Auth recovery, and migration replay contracts. | All 23 focused controller/migration tests pass, including pre-tip provider inspection generated from the canonical server predicate source. |
| `node --test scripts/prCControlledHumanEnvironmentPostgres.test.mjs` | Execute the controlled-human authority on disposable PostgreSQL 16, deriving all 34 positive step IDs from the canonical catalog and proving exact anchor -> real production command/RPC -> immutable completion coverage, both business-idempotency replay paths, response-loss one-effect recovery, and all eight exact denial attempts. | The exact 34-step positive set and eight negative attempts pass; missing/extra coverage, substituted target/version/selector/effect/receipt/denial, duplicate effects, or fresh-key pseudo-replay fails closed. This is local source evidence and cannot satisfy the signed human gate. |
| `node scripts/checkWorkflowYaml.mjs` | Parse every GitHub workflow, including the five ordered phase workflows and the protected recovery workflow. | Exit 0 with all workflow files listed. |
| `.github/workflows/transcript-flow-pr-c.yml` label phases | Accept only the five ordered phase labels plus the two exact abort/expiry recovery labels from the trusted controller. Normal phases discover only prior terminal exact-head artifacts and re-attest the canonical PR preview; recovery requires four protected exact prior-run bindings and proves the prior head belongs to PR #264 before calling the protected reusable recovery. | Wrong actor/label/head/branch/repository/preview, current or incomplete run, missing/expired artifact, ambiguous comment, non-distinct human comments, or missing/substituted recovery binding fails closed before a phase call. |
| `.github/workflows/pr264-controlled-human-edge-deploy.yml` | On `pr264-controlled-human-edge`, derive/preflight/apply/verify the exact additive controlled-human migration, preflight the dedicated backend and preview, deploy only nine allowlisted Edge functions, suppress/delete raw CLI output, and emit signed local-source/provider-deployment/runtime evidence. | Terminal successful protected-environment run and exact artifact digest; no caller-authored manifest, migration substitution, false provider/local equality, or non-allowlisted function is accepted. |
| `.github/workflows/pr264-controlled-human-prepare.yml` | On `pr264-controlled-human-prepare`, verify exact PR/CI/preview/backend/Edge identity and service-role authority without retaining Admin response data, execute bounded preflight/plan/apply/verify, and emit a sanitized `not_run` preparation plus role templates. | Terminal successful protected run and immutable artifact bound to exact run/attempt; does not pass the human gate. |
| `.github/workflows/pr264-controlled-human-quiesce.yml` | On `pr264-controlled-human-quiesce`, revalidate the exact preparation, preview, target, and active lifecycle before performing the sole server-authoritative transition to read-only. | Terminal successful protected run emits one immutable quiesce artifact with exact transition timestamp, disabled mutation flags, retained immutable history, and no human-comment substitution. |
| `.github/workflows/pr264-controlled-human-checkpoint.yml` | On `pr264-controlled-human-checkpoints`, bind the exact quiesce and capture the requester, approver, and reviewer observation comments in enforced order using read-only backend observers. | One terminal successful phase run emits three separately signed artifacts; active steps predate quiesce, the reviewer read-only step follows it, every server-observable positive binds one unique exact event/resource/version/window, browser-only steps remain explicit attestations, negative attempts bind actual browser bytes, all three comment actors are distinct, and no seeded/aggregate state substitutes for observations. |
| `.github/workflows/pr264-controlled-human-verify.yml` | On `pr264-controlled-human-final`, re-read the unedited comments, validate exact preparation/checkpoint attempts and distinct signers, directly deprovision from frozen read-only state, independently re-inspect, reverify preview, and build the final session. | Terminal successful protected run; exact signed session artifact reports 8 journeys, 14 checkpoints, every step passed, zero failed/blocked/provider/customer/external/side-effect counts, and verified deprovision without a resume interval. |
| `.github/workflows/pr264-controlled-human-recover.yml` | After cancellation, lost output/upload, expiry, or PR-head advance, complete only the exact server-authorized abort/expiry recovery under the protected environment. Before merge it is invoked by the trusted recovery labels through the primary PR workflow; its manual-dispatch surface is additionally available once the workflow exists on the default branch. | The requested head must be a commit of trusted PR #264 and match exact stored deploy/exercise/target authority; abort/expiry removes only exact discoverable synthetic Auth users or deprovisions the one exact exercise, and emits a sanitized terminal receipt. |
| `node scripts/verifyPrCControlledHumanSession.mjs ...` | Independently consume the preparation, quiesce, three signed role files, direct deprovision, post-deprovision inspection, and optional full-retest defect history. | Only an actual complete signed session emits `CONTROLLED-HUMAN=passed`; absent evidence remains `not_run`. |

Production, stable Netlify context, AvalaOS.com/custom domains, customer/external-user data, real provider keys/calls, broad project/database reset, pilot/production promotion, merge, and readiness/certification claims are stop conditions. A material defect invalidates the complete session/head and requires new exact-head CI/preview, a new exercise, and full `CH-01` through `CH-14` retest.

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
