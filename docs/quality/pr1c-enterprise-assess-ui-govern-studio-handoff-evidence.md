# PR 1C Enterprise Assess UI, Govern, And Studio Handoff Evidence

Status: implementation candidate; local verification complete; GitHub CI, review, and merge pending
Date: 2026-07-13
Accepted dependency: PR 1B on `main` at `de87c86`

## Scope And Proof Boundary

PR 1C cuts the enterprise browser from direct assessment authority into the accepted PR 1B command boundary. It adds server-issued organization/workspace projection, enterprise Assess create/save/finalize, authorized Govern resolution, and an atomic Studio handoff. It does not change scoring formulas, weights, thresholds, hard stops, recommendation logic, or score version.

No live infrastructure, hosted environment, production logs, credentials, secrets, customer data, signed URLs, Storage objects, deployment identifiers, or incident actions were accessed. This evidence is local source, disposable PostgreSQL, and production build-preview evidence only. It is not deployment, pilot, production, storage, security-certification, buyer, compliance, or general readiness proof.

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
| Failed persistence cannot render success | Passed by command error handling, atomic rollback test, and browser false-success check |
| Fresh authorization, ancestry, version, and idempotency | Passed in handler and disposable PostgreSQL adversarial tests |
| Service-role-only mutation RPCs | Passed by source contract and PostgreSQL ACL assertions |
| Explicit enterprise session/failure states | Passed by source/type checks and production-preview stale-state coverage |
| Accessibility and responsive desktop/mobile behavior | Passed in Chromium desktop and Pixel 7 projects with no serious/critical axe findings or viewport overflow |
| Relevant performance budget | Passed; navigation duration below 5000 ms and DOMContentLoaded below 4000 ms on both projects |
| Safe rollback/read-only fallback | Documented in the PR 1C migration notes |

## Executed Verification

| Command | Result | Exact signal |
| --- | --- | --- |
| `npm ci` | Passed | 171 packages installed; 172 audited; 0 vulnerabilities |
| `npm run typecheck` | Passed | `tsc --noEmit` exit 0 |
| `npm run typecheck:edge` | Passed | Edge TypeScript project exit 0 |
| `npm run test:assess-command` | Passed | Assess handlers and locked scoring parity regression passed |
| `npm run test:assess-to-studio-handoff` | Passed | Handoff payload regression passed, including approved-but-not-handed-off denial |
| `npm run test:pr1c` | Passed | Source boundary and tenant/Govern/Studio/false-success suites passed |
| `npm run test:pr1c-coverage` | Passed | 70.20% lines, 64.41% branches, 81.25% functions across changed Assess handlers and tenant-session boundary; enforced floors 70/60/80 |
| `npm run test:migrations:pr1c` | Passed | Disposable PostgreSQL ACL, ancestry, idempotency, lifecycle, atomicity, and rollback suite passed |
| `npm run build` | Passed with warning | Vite production build completed; Browserslist data warning remains non-blocking |
| `npm run test:browser:pr1c` | Passed | 6/6 production build-preview tests passed across Chromium desktop and mobile |
| `git diff --check` | Passed | No whitespace errors after final implementation and evidence changes |
| Full default `npm test` | Passed | Complete chained regression, including PR 1A, PR 1B, and PR 1C coverage gates, exited 0 |
| GitHub Actions | Planned verification | Required after draft PR opens |

The first local browser attempt was blocked by missing WSL Chromium library `libnspr4.so`. Playwright's official Chromium dependencies were installed locally; the rerun executed the application checks and passed 6/6. The first disposable rollback fault-injection constraint incorrectly validated existing fixture rows; it was corrected to `NOT VALID`, after which the intended new-write rollback assertion passed. Neither condition was a product-runtime pass or failure.

The first full regression exposed two predecessor checks that treated PR 1B as the repository's terminal migration and measured additive PR 1C handler branches without their tests. The PR 1B migration check now fixes its boundary at the PR 1B filename, and its shared-handler coverage run includes the additive PR 1C cases; the complete rerun passed.

## Rollback And Fallback

- Disable enterprise Assess command invocation or enter read-only maintenance mode.
- Hide or disable Govern resolution and Studio handoff entry points.
- Preserve assessments, receipts, review events, handoff records, and privileged audit history.
- Do not destructively reverse the additive migration; forward-fix schema defects.
- Never substitute local demo authority in pilot or production.

## Remaining Gates

GitHub quality, browser, and PR 1C migration jobs; code review; normal merge approval. Hosted and live-system verification remain not run and out of scope.
