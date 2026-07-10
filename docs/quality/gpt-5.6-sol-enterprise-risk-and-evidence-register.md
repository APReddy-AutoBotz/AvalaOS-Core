# AvalaOS Core Enterprise Risk And Evidence Register

Baseline: `main` at `6877bd90f5f93e685b5ec47a0fbafa2c57a99e09`

This is the active source for enterprise security, reliability, quality, migration, and readiness risks. Historical evidence remains immutable and does not override this register.

## Status Vocabulary

- **Confirmed source defect:** directly demonstrated by repository source or an executed test.
- **Suspected defect requiring deeper validation:** a plausible defect whose exploitability or runtime effect is not fully established.
- **Deployment status unknown:** no approved deployment inventory or live-system check was executed.
- **Executed evidence:** a command or inspection actually completed in this rebaseline.
- **Planned verification:** required future evidence; not a pass.
- **Blocked:** attempted but unavailable or unauthorized.
- **Not run:** intentionally outside the approved scope.

Evidence must never include secrets, tokens, raw logs, signed URLs, customer data, storage object identifiers, or production infrastructure identifiers.

## P0 Stop Gate

### P0-001 — Service-role Storage URL escape

- **Severity:** P0
- **Classification:** confirmed source defect; deployment status unknown
- **Source evidence:**
  - `supabase/functions/extract-document-text/index.ts:23-32` accepts request-controlled `bucket` and validates only `storagePath`.
  - `supabase/functions/extract-document-text/index.ts:46-60` downloads through the supplied bucket and returns extracted text/chunks.
  - `supabase/functions/_shared/storage.ts:54-64` interpolates `input.bucket` into a privileged URL while authenticating with the service-role key.
- **Impact:** a crafted bucket value may change URL path interpretation and send a service-role-authenticated request outside the intended Storage object route. The code path can return response content to the caller.
- **Deployment state:** unknown. This rebaseline did not inspect deployments, environments, logs, credentials, or live infrastructure.
- **Readiness effect:** blocks pilot, production, hosted, deployment, storage, and security readiness claims.
- **Required next action:** execute the unknown/deployed/not-deployed decision tree at the start of PR 1A under separate authority.
- **Closure evidence:** deployment disposition; containment decision if applicable; allowlisted server-derived bucket authority; canonical URL/path validation; negative traversal and URL-normalization tests; sanitized incident/rotation assessment when applicable.
- **Prohibited action in this PR:** live inspection or mutation, endpoint disablement, log review, credential/key rotation, incident execution, deployment, or source fix.

## Material Risks

| ID | Severity | Classification | Exact source evidence | Risk | Planned verification / closure |
| --- | --- | --- | --- | --- | --- |
| P1-001 | P1 | Confirmed source defect | `services/adapters/authAdapter.ts:12-21`; `services/productActionPolicy.ts:305-357` | A Supabase user is merged with a demo persona by matching email, and client policy consumes the resulting role/permissions. Authenticated identity can therefore inherit demo authorization attributes. | PR 1A removes demo authority from pilot/production; PR 1B proves server-derived roles/permissions and negative email-match tests. |
| P1-002 | P1 | Confirmed source defect | `services/supabaseClient.ts:3-16`; `services/adapters/authAdapter.ts:25-40` | Missing Supabase configuration silently selects placeholder/mock behavior instead of a fail-closed pilot/production state. | PR 1A explicit runtime modes, missing-config negative tests, and no pilot/production mock fallback. |
| P1-003 | P1 | Confirmed source authorization gap | `supabase/functions/export-document/index.ts:16-33`; `supabase/functions/export-decision-pack/index.ts:16-33`; `supabase/functions/_shared/supabase.ts:76-91` | Edge exports verify authentication, active organization membership, and resource organization, but not the complete export permission, workspace, resource-status/deletion, version, evidence, or lineage contract before service-role reads and writes. | PR 1A handler-specific authorization tests; later artifact work adds full scoped export contracts. |
| P1-004 | P1 | Confirmed unsafe rendering primitives; suspected defect requiring deeper validation | `components/delivery/TaskDetailModal.tsx:307`; `components/delivery/WorkspaceView.tsx:88`; `components/docs/RefineSectionModal.tsx:86,101` | Markdown/HTML is placed into `dangerouslySetInnerHTML`. Source-to-sink reachability and sanitizer behavior require deeper validation before exploitability is claimed. | PR 1A traces each input, adds sanitization/escaping, malicious-markup tests, and browser validation. |
| P1-005 | P1 | Confirmed source defect | `supabase/functions/_shared/audit.ts:12-25`; `supabase/functions/_shared/audit.ts:28-44`; `supabase/functions/_shared/audit.ts:60-76` | AI job creation/completion and usage logging can swallow persistence failures. Privileged success can therefore lack required audit evidence. | PR 1A classifies required versus best-effort events and makes required privileged audit fail closed/transactional. |
| P1-006 | P1 | Confirmed source lifecycle bypass | `services/assessmentService.ts:188-205`; `components/assess/GuidedAssessmentView.tsx:201-228`; `components/assess/GuidedAssessmentView.tsx:1064-1069` | Handoff is treated as a special transition from Approved, but the transition method does not require the current state to be Approved; the UI enables handoff for unlocked non-approved states. Govern outcome is not authoritative. | PR 1C server Govern/handoff handlers, required Govern outcome, transition matrix, negative bypass tests, and browser E2E. |
| P1-007 | P1 | Confirmed source durability/false-success defect | `App.tsx:1004-1027`; `components/docs/DocsProvider.tsx:39-54` | Studio moves to the workspace with temporary artifacts before durable save completes. Persistence failure raises an alert but can still leave a success-like generated workspace. | PR 1A removes directly related false success; PR 1C proves atomic handoff/persistence and explicit failed/read-only states. |
| P1-008 | P1 | Confirmed source error-state defect | `services/assessmentService.ts:100-107` | Assessment read errors are logged and converted to `null`, making failure indistinguishable from no assessment. | PR 1C separate loading/empty/error/offline/revoked states and negative service/UI tests. |
| P1-009 | P1 | Confirmed architecture/readiness gap | `services/assessmentService.ts:141-185`; `services/adapters/assessAdapter.ts:441-450` | Deterministic scoring currently executes in the browser; the adapter's server calculation path is a placeholder. The deterministic algorithm is valuable but not yet server-authoritative for enterprise use. | PR 1B typed score/finalize handler and parity against the locked scoring regression corpus. |
| P1-010 | P1 | Confirmed non-uniform revocation/authorization gap | `services/adapters/orgAdapter.ts:31-42`; `components/auth/OrganizationProvider.tsx:34-55`; contrast `supabase/functions/_shared/providerResolver.ts:407-410` | General organization/session projection does not filter membership status or provide authorization-version invalidation, while provider governance does check active membership. Revocation guarantees are therefore not platform-wide. | PR 1B authoritative membership/workspace checks on every privileged request, authorization versions, cache invalidation, stale TenantContext and revoked-session tests. |
| P1-011 | P1 | Confirmed migration-authority/readiness gap | `supabase/migrations/20260607150500_m5_2a_auth_org_workspace_authority.sql`; `supabase/migrations/20260607153500_m5_3a_2_artifact_select_policies.sql`; `docs/schema/initial_schema.sql`; `docs/schema/storage_buckets.sql`; `docs/schema/rls_regression_assess_handoff.sql` | Runtime/schema expectations are split between eight canonical migrations and additional legacy SQL contracts. Fresh reproduction and supported upgrade behavior are not established. | PR 1A reconciles the minimum canonical chain for PR 1B; schema PRs run fresh, upgrade, RLS/policy, failure, and rollback/read-only tests. |
| P1-012 | P1 | Deployment status unknown; readiness gap | `.github/workflows/ci.yml:47-73`; `docs/schema/README.md` | Hosted schema, RLS, storage, Edge deployment, and tenant-isolation status were not inspected in this rebaseline. Optional smoke configuration is not proof. | Separate approved environment/deployment evidence after source controls exist; never infer a pass from authored files. |
| P2-001 | P2 | Confirmed quality gap | `package.json:11`; `package.json:31`; `.github/workflows/ci.yml:26-45` | The default regression/CI path omits the evidence-execution gate and newer product-action, delivery-workflow, artifact-export, and helper-guard suites. | Add feature-owned gates in PR 1A; use a shared tooling PR only if at least two slices need common infrastructure. |
| P2-002 | P2 | Confirmed quality gap | `tsconfig.json:29-36` | Root TypeScript validation excludes `supabase/`, leaving Edge source outside the standard typecheck. | PR 1A adds an Edge-compatible typecheck/test boundary. |
| P2-003 | P2 | Confirmed quality gap | `package.json:6-52`; `.github/workflows/ci.yml:26-73` | No standard lint, coverage threshold, browser E2E, accessibility, performance-budget, or migration fresh/upgrade gate exists. | Add each feature-specific gate to the slice that needs it; consolidate only genuinely shared infrastructure. |

## Existing Positive Controls

- Deterministic scoring regression tests execute in the default suite.
- Product-action, delivery-workflow, artifact-export, and helper-guard source controls have focused tests, although they are omitted from the default chain.
- Provider governance checks active membership at `supabase/functions/_shared/providerResolver.ts:407-410` and blocks allowed operations when audit persistence fails at `supabase/functions/_shared/providerResolverIntegration.ts:163-170`.
- Canonical migrations enable fail-closed groundwork for selected authority tables, but authored controls are not tenant-isolation or deployment proof.

## Rebaseline Executed Evidence

| Check | Result | Exact signal |
| --- | --- | --- |
| Baseline and repository preflight | Passed | Clean `main`; local `HEAD`, `main`, local `origin/main`, and remote `main` all `6877bd90f5f93e685b5ec47a0fbafa2c57a99e09`; private repository `APReddy-AutoBotz/AvalaOS-Core`; zero open PRs before branching. |
| `npm ci` | Passed | 192 packages installed; 193 packages audited; zero vulnerabilities. |
| `npm audit --audit-level=moderate` | Passed | Zero vulnerabilities. |
| `npm run typecheck` | Passed | `tsc --noEmit` exit 0; does not cover `supabase/` because of the recorded exclusion. |
| `npm run test:ai-boundary-static` | Passed | 15 patterns; 734 allowed classified hits; zero forbidden hits; zero stale allowlist entries. |
| `npm run test:secret-hygiene` | Passed | 5 rules; 746 allowed classified hits; zero forbidden hits; zero tracked `.env*` files. |
| `npm run test` | Passed | Complete default chained regression suite exit 0, including deterministic scoring and provider resolver tests. |
| `npm run test:evidence-execution-gate` | Passed | Model and presentation suites passed. |
| Product action policy supplemental suite | Passed | 13 tests passed; zero failed. |
| Delivery workflow policy supplemental suite | Passed | 12 tests passed; zero failed. |
| Artifact export policy supplemental suite | Passed | 7 tests passed; zero failed. |
| `node scripts/runTypeScriptTest.mjs services/artifactExportHelperGuards.test.ts` | Passed | 5 tests passed; zero failed. |
| Expanded helper dependency invocation | Failed — harness mismatch, not product behavior | Directly passing Vite modules to the test compiler produced `TS1343`/`TS2339` for `import.meta.env`; the supported single-entry helper suite above passed. |
| `npm run build` | Passed with warning | 199 modules transformed; build completed in 22.14s. Browserslist data reported as six months old; no update was authorized. |
| `codex app-server --strict-config --stdio` | Passed | `codex-cli 0.144.0-alpha.4` loaded the project configuration from a disposable detached worktree at `09576a0b073bc46ba7716d289eee13f1e68f0b5c` and exited 0 after stdin closed; no unsupported-key error was emitted. |
| Four-role discovery and limits | Passed | Runtime `config/read` resolved `architecture_explorer`, `security_reviewer`, `quality_reviewer`, and `implementation_worker` from the project layer and loaded `max_threads = 4` and `max_depth = 1`. |
| Model and reasoning compatibility | Passed locally; runtime execution not proven | Runtime `model/list` exposed `gpt-5.6-sol` with both configured efforts, `high` and `max`. Spawned-agent execution metadata was not exposed, so this is not evidence that each agent executed on that model or that no provider fallback occurred. |
| Concurrent reviewer spawning | Passed | `architecture_explorer`, `security_reviewer`, and `quality_reviewer` were spawned with their configured roles before any wait and were observed running concurrently with the controller at `4/4` threads. Their runtime paths were `/root/architecture_explorer`, `/root/security_reviewer`, and `/root/quality_reviewer`. |
| Reviewer read-only sandbox enforcement | Failed | All three unique workspace write probes were stopped before PowerShell execution with `windows sandbox: helper_unknown_error: apply deny-read ACLs`. The same helper error blocked reviewer and controller `Test-Path` and no-op commands, so this was not a valid read-only enforcement pass. An external controller confirmed all reviewer probe paths were absent. |
| `max_depth = 1` enforcement | Failed | After the reviewers finished, `/root/architecture_explorer` successfully spawned `/root/architecture_explorer/depth_probe`; no rejection error was returned. The nested child was interrupted immediately. |
| `implementation_worker` workspace-write probe | Not run | The validation stopped at the required depth-failure gate, so the worker was not spawned and no worker probe was created. An external controller confirmed the worker probe path was absent. |

## Blocked Or Not Run

| Check/action | Status | Reason |
| --- | --- | --- |
| Official Codex manual helper | Blocked | The fetched response lacked the required `x-content-sha256` integrity header. Installing a global docs MCP would have exceeded the repository-only scope. |
| Live deployment/function inventory | Not run | Explicitly outside this PR; P0 deployment status remains unknown. |
| Environment, database, RLS, storage, Edge, log, secret, incident, rotation, hosted, and production checks | Not run | Explicitly unauthorized for the docs/config-only rebaseline. |
| Browser E2E, accessibility, performance, coverage, lint, and migration fresh/upgrade gates | Not run / unavailable | No standard repository commands currently exist; recorded as P2 quality gaps. |

## Readiness Decision

The source-level rebaseline checks support the maturity verdict and implementation plan. They do not close any enterprise readiness domain. P0 remains open, deployment status remains unknown, and PR 1A cannot start until this rebaseline is accepted and merged and a fresh-main execution begins under the stated stop gate.
