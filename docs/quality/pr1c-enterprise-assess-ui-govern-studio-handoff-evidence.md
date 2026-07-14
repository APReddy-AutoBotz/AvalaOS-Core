# PR 1C Enterprise Assess UI, Govern, And Studio Handoff Evidence

Status: implementation candidate; local non-PostgreSQL and GitHub quality, browser, and disposable PostgreSQL verification complete; review and merge pending
Date: 2026-07-14
Accepted dependency: PR 1B on `main` at `de87c86`

## Scope And Proof Boundary

PR 1C cuts the enterprise browser from direct assessment authority into the accepted PR 1B command boundary. It adds server-issued organization/workspace projection, enterprise Assess create/save/finalize, authorized Govern resolution, and an atomic Studio handoff. It does not change scoring formulas, weights, thresholds, hard stops, recommendation logic, or score version.

No live infrastructure, hosted environment, production logs, credentials, secrets, customer data, signed URLs, Storage objects, deployment identifiers, or incident actions were accessed. This evidence is local source/build-preview and GitHub-hosted disposable PostgreSQL evidence only. It is not deployment, pilot, production, storage, security-certification, buyer, compliance, or general readiness proof.

## Controlled Review Fallback

The mandatory three-reviewer Wave 1 was attempted in the predecessor task under a read-only parent. Each reviewer was blocked before process launch by:

`helper_unknown_error: apply deny-read ACLs`

Fresh fallback reviewers and implementation workers could not launch WSL commands; no files were changed. The AP explicitly authorized the root controller to keep this WSL-native task workspace-write, perform and synthesize the architecture, security, and quality reviews, implement the single PR, and record the blocked reviewer evidence. No subagents or recursive delegation were used in the implementation run.

Root synthesis:

- Architecture: direct browser assessment mutations, missing workspace context, error/null conflation, and client-created Studio handoff were the cut lines.
- Security: each command must bind fresh actor, organization, workspace, exact resource ancestry, authorization version, expected version, and actor-scoped idempotency before one atomic state/receipt/audit commit.
- Quality: the slice owns source/type/coverage/build gates, disposable PostgreSQL ACL/adversarial/rollback tests, and production-preview Chromium desktop/mobile, axe, viewport, false-success, and performance gates.

## Implemented Controls

- `tenant-session` returns a validated server-issued organization/workspace/TenantContext projection and accepts no actor or tenant claim from the browser.
- `assess-command` dispatches `govern.resolve` and `studio_handoff.create` to separate typed handlers.
- One additive PR 1C migration provides service-role-only context and mutation RPCs; `PUBLIC`, `anon`, and `authenticated` cannot execute mutations.
- Immutable successful Govern provenance is bound to the exact receipt, actor, ancestry, decision, and resulting version. Migration preflight fails closed when legacy Approved or handed-off rows lack that trusted provenance.
- Govern and Studio transactions reauthorize through PR 1B, verify exact ancestry and versions, enforce lifecycle rules, claim actor-scoped idempotency, and atomically persist domain state, receipt, review/handoff evidence, and privileged audit.
- Enterprise Assess create/save/finalize uses the typed command client. Direct enterprise assessment and review-event adapter mutations fail closed.
- Assessment reads preserve error state rather than collapsing failure to an empty assessment.
- Enterprise UI represents loading, empty, error, offline, stale, revoked, blocked, read-only maintenance, and expired-session states.
- Studio payload creation requires the server-committed `Handed Off to Docs` state; scoring or approval alone cannot open Studio.
- Local demo authority remains explicitly confined to `local_demo`.

## Acceptance Criteria

| Criterion | Candidate result |
| --- | --- |
| PR 1B and scoring boundaries preserved | Passed; score behavior/version unchanged and regression remained green |
| No UI path bypasses Govern | Passed by server lifecycle enforcement, source gate, payload gate, and handoff regression |
| Two-tenant PR 1C RLS isolation | Passed in GitHub disposable PostgreSQL under real `authenticated` role and `auth.uid()` identities |
| Failed persistence cannot render success | Passed in typed command, production-browser failure paths, and PostgreSQL fault-injection rollback |
| Fresh authorization, ancestry, version, and idempotency | Passed in handler tests, source review, and disposable PostgreSQL adversarial and concurrent execution |
| Service-role-only mutation RPCs | Passed by catalog ACL inspection and runtime execution under `PUBLIC`-equivalent, `anon`, `authenticated`, unprivileged, and `service_role` identities |
| Explicit enterprise session/failure states | Passed by source/type checks and production-preview stale-state coverage |
| Accessibility and responsive desktop/mobile behavior | Passed in Chromium desktop and Pixel 7 projects with no serious/critical axe findings or viewport overflow |
| Relevant performance budget | Passed; navigation duration below 5000 ms and DOMContentLoaded below 4000 ms on both projects |
| Safe rollback/read-only fallback | Documented in the PR 1C migration notes |

## Executed Verification

| Command | Result | Exact signal |
| --- | --- | --- |
| `npm ci` | Passed | Clean lockfile installation completed; 201 packages audited with zero vulnerabilities |
| `npm audit --audit-level=high` | Passed | Zero vulnerabilities |
| `npm run typecheck` | Passed | `tsc --noEmit` exit 0 |
| `npm run typecheck:edge` | Passed | Edge TypeScript project exit 0 |
| `npm run test:pr1a-complete` | Passed | PR 1A source/contract/coverage gates passed; 94.90% lines, 93.10% branches, and 92.86% functions |
| `npm run test:pr1b-complete` | Passed | PR 1B source/contract/coverage and locked scoring parity passed; 95.65% lines, 82.26% branches, and 100% functions |
| `npm run lint:pr1c` | Passed | Source, migration, authority, and UI cutover boundaries passed |
| `npm run test:assess-to-studio-handoff` | Passed via `npm test` | Durable handoff ID and approved-but-uncommitted denial regression passed |
| `npm run test:pr1c` | Passed | Source, command, strict response/session contract, and coverage gates passed |
| `npm run test:pr1c-coverage` | Passed | 80.00% lines, 81.97% branches, and 86.96% functions across the PR 1C-owned boundary set |
| `npm run test:migrations:pr1c` locally | Not run | No disposable local PostgreSQL server was available |
| `npm run test:migrations:pr1c` in GitHub | Passed | Disposable PostgreSQL ACL, two-tenant RLS, adversarial ancestry, idempotency, concurrency, atomicity/fault-injection, and rollback suite passed in push job `87055770864` and pull-request job `87055781202` for `b35a356` |
| Live/hosted Supabase | Not run | Explicitly outside this PR's authorization and proof boundary |
| `npm run build` | Passed with warning | Vite production build completed; Browserslist data warning remains non-blocking |
| `npx playwright test pr1c.spec.ts --reporter=line` | Passed | 16/16 production App build-preview tests passed across Chromium desktop and mobile |
| `npm run test:ai-boundary-static` | Passed | Static AI boundary scan exited 0 |
| Secret-hygiene scan | Passed | Five rules evaluated; 758 allowed hits, zero forbidden hits, and zero tracked environment files |
| Markdown relative-link validation | Passed | Seven relative targets across 650 Markdown files; zero broken |
| `git diff --check` | Passed | No whitespace errors after final implementation and evidence edits |
| Full default `npm test` | Passed | Complete chained regression, including PR 1A, PR 1B, and PR 1C coverage gates, exited 0 |
| GitHub Actions | Passed | Push run `29323989068` and pull-request run `29323992400` passed quality, build, browser, PR 1A/1B migration, and PR 1C PostgreSQL migration jobs for `b35a356` |

## Disposable PostgreSQL Acceptance Detail

- Tenant B was provisioned with a distinct organization, workspace, membership/role, process, assessment, authorization version, and authenticated user. Its approved Govern provenance and durable Studio handoff were created only through the service-role mutation RPC path.
- Tenant A assertions ran with `current_user = authenticated` and `auth.uid()` equal to tenant A's actor. Tenant A saw exactly one provenance and one handoff row, could retrieve its own exact IDs, and received zero rows when listing or counting by tenant B organization, retrieving tenant B's exact provenance or handoff IDs, or filtering either table by tenant B's assessment ID.
- Tenant B assertions ran with `current_user = authenticated` and `auth.uid()` equal to tenant B's actor. Tenant B saw exactly one provenance and one handoff row, retrieved both exact tenant B IDs and both rows by tenant B assessment ID, and could not retrieve tenant A's exact IDs.
- Catalog ACL inspection proved no `PUBLIC`-equivalent execute grant on PR 1C mutation functions. `anon`, `authenticated`, and a disposable unprivileged role lacked mutation execution; runtime calls under each identity were rejected. `service_role` retained the intended mutation function execution authority.
- Catalog and runtime checks proved `anon`, `authenticated`, and the disposable unprivileged role could not insert, update, or delete Govern provenance or Studio handoff records. `service_role` also had no direct table DML grant; authenticated access remained SELECT-only and RLS-filtered.
- Separate PostgreSQL connections concurrently submitted identical Govern commands and identical Studio handoff commands. Both callers received the same persisted result, with exactly one state transition, command receipt, provenance or handoff record, review event, and privileged audit event for each command type.
- Separate-connection reuse of the same Govern or Studio idempotency key with different payloads produced one valid commit and one `IDEMPOTENCY_CONFLICT`, with no duplicate receipt, state transition, provenance/handoff, review, or audit effects. Existing different-key expected-version races still produced one success and one `VERSION_CONFLICT`.
- Fault injection proved audit failure rolls back state, receipt, provenance/handoff, review, and audit effects atomically.

## Rollback And Fallback

- Disable enterprise Assess command invocation or enter read-only maintenance mode.
- Hide or disable Govern resolution and Studio handoff entry points.
- Preserve assessments, receipts, review events, handoff records, and privileged audit history.
- Do not destructively reverse the additive migration; forward-fix schema defects.
- Never substitute local demo authority in pilot or production.

## Remaining Gates

Code review and normal merge approval remain. Local PostgreSQL and hosted/live-system verification remain not run and out of scope. P0-001 remains **NOT DEPLOYED**; that disposition is not readiness proof.
