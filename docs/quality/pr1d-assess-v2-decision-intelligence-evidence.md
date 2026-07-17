# PR 1D Avala Assess V2 Decision Intelligence Evidence

Status: active acceptance evidence; implementation-head CI completed, final acceptance-record CI pending

Baseline: PR #208 / PR 1C accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`

This evidence belongs to the substantial PR 1D implementation boundary. It does not establish hosted, deployment, pilot, production, security-certification, buyer, compliance, scientific-calibration, or guaranteed-economic readiness.

## Acceptance criteria disposition

- V1 `assess-core-2026-05` formulas, weights, thresholds, hard stops, recommendation logic, records, Govern provenance, and Studio lineage remain unchanged.
- V1 presentation is explicitly marked `Legacy V1`; the final recommendation remains visible. Historical 0-100 evidence metadata and canonical V1 1-5 evidence metadata are normalized only at the Govern compatibility boundary.
- V2 cases, immutable authoring versions, primitives, edges, decision points, exception paths, application facts, evidence, and decision-owned derived results use additive tenant/workspace-owned storage.
- V2 finalization accepts exactly `{ caseId }` from the browser. The server reloads locked facts, applies the versioned deterministic evaluator, builds canonical domain-separated SHA-256 snapshots, and supplies canonical text plus snapshots to the database. PostgreSQL must independently verify snapshot equivalence, bound context, and the recomputed digest before atomically recording the decision, reviewer-ready state, receipt, and privileged audit.
- V2 ends at `reviewer_ready`. V2 approval, Govern resolution, Studio handoff, export, and external sharing are absent and reserved for later approved work.
- V1-to-V2 clone is explicit, preserves the V1 source, and persists allowlisted facts plus submitted/unvalidated evidence as unverified suggestions in the immutable V2 version.
- The AP invoice-exception fixture must prove primitive decomposition, independent component/application evaluation, explicit exception paths, evidence-qualified categorical outcomes, and a composed operating model without a whole-process technology winner.
- Runtime disable and read-only controls provide the safe fallback. Durable rows, receipts, snapshots, hashes, and audits are preserved for a forward fix.

## Correction verification ledger

Results below apply only to commands executed against the correction worktree. Evidence recorded for an earlier PR head is not treated as proof for the corrected head.

| Verification | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed; `tsc --noEmit` emitted no diagnostics. |
| `npm.cmd run test:assess-v2-rule-registry` | Passed; domain, registry, evaluator, AP fixture, immutable decision, and canonical digest tests passed. |
| `npm.cmd run test:assess-v2-command` | Passed; exact nested parsing, server authority, canonical decision construction, and sanitized error tests passed. |
| `npm.cmd ci` | Passed in a disposable detached checkout containing the exact correction: 200 locked dependencies installed and 0 vulnerabilities reported. The original worktree's native Rolldown module remained locally locked by a completed browser process, so it was not used for this clean-install proof. |
| `npm.cmd audit --audit-level=moderate` | Passed; 0 vulnerabilities. |
| `npm.cmd run typecheck:edge` | Passed; Edge TypeScript emitted no diagnostics. |
| `npm.cmd test` | Passed; complete repository suite including PR 1A through PR 1D passed. |
| `npm.cmd run test:pr1a` | Passed; coverage 94.90% lines, 93.10% branches, 92.86% functions. |
| `npm.cmd run test:pr1b` | Passed; coverage 95.65% lines, 82.26% branches, 100.00% functions. |
| `npm.cmd run test:pr1c` | Passed; coverage 80.00% lines, 81.97% branches, 86.96% functions. |
| `npm.cmd run test:pr1d` | Passed; source, migration contract, CI contract, V1 compatibility, V2 model/command/presentation, Govern compatibility, coverage, and docs gates passed. |
| `npm.cmd run test:pr1d-coverage` | Passed; 98.47% lines, 84.27% branches, 95.96% functions. |
| `npm.cmd run test:migrations:pr1d` against isolated PostgreSQL 16 | Passed; ACL/RLS, clone, canonical digest, independent input/evidence/output hash and tenant/workspace/case/source/rule-set/snapshot mismatch atomicity, same-key replay concurrency, audit rollback, compatibility, and immutability passed. |
| `npm.cmd run test:browser:pr1d` | Passed; 14/14 desktop/mobile journeys covering create, real V1 clone/import review, genuine authoring, claim-linked evidence, save/reload, exact Edge parsing, real evaluator/SHA-256 decision construction, structural-finalization denial, final read-only rendering, capability denial, stale authority, version conflict, offline handling, accessibility, overflow, and the retained 5-second decision interaction budget. Local preview teardown suppresses its usual footer; the command completed successfully and the runner registered 14 scenarios. |
| `npm.cmd run test:browser` | Passed; 38/38 desktop/mobile journeys in deterministic CI-equivalent single-worker mode. Local preview teardown suppresses its usual footer; the command completed successfully and the runner registered 38 scenarios. |
| `npm.cmd run test:ai-boundary-static` | Passed; 0 forbidden hits and 0 stale allowlist entries. |
| `npm.cmd run test:secret-hygiene` | Passed; 0 forbidden hits and no tracked `.env` files. |
| `npm.cmd run build` | Passed; production Vite build completed. |
| PR 1D Markdown relative-link validation | Passed through `npm.cmd run test:docs:pr1d`. |
| PR 1D buyer-copy/UTF-8 scanner | Passed through `npm.cmd run lint:pr1d`; no changed-file mojibake or legacy `assess.v2.write` references. |
| `git diff --check` | Passed; line-ending conversion warnings only. |
| GitHub PR #209 implementation-head CI, inspected job by job | Passed for implementation head `f43c98505e0467853e776e993723d8c2f764b508`; push `29548516387` and pull-request `29548518066` completed successfully. Final acceptance-record CI is tracked in GitHub/PR description. |
| Hosted/live Supabase | Not Run by design. |

No live or hosted infrastructure, production data, logs, secrets, storage objects, deployment controls, or incident actions were accessed. This ledger must not be read as buyer acceptance, deployment readiness, scientific calibration, guaranteed economics, compliance certification, or security certification.

## Rollback and recovery

Set the V2 runtime control to disabled or read-only, leave V1 behavior available, preserve all V2 history, imported facts/evidence, canonical snapshots/text, hashes, receipts, and audits, and ship an additive forward fix. Do not reverse the accepted foundation migration destructively, mutate immutable decisions, reinterpret V2 through V1 scoring, restore browser-side decision authority, or claim that local evidence proves hosted readiness.

## Final implementation-head CI

Implementation head: `f43c98505e0467853e776e993723d8c2f764b508`. Push workflow `29548516387` and pull-request workflow `29548518066` completed successfully. Quality Gates, Chromium/accessibility/viewport/performance, and PR 1A-1D migration jobs passed; hosted Supabase smoke was skipped by the intended non-live condition.

The implementation head recorded 98.47% lines, 84.27% branches, and 95.96% functions; 38/38 complete browser journeys and 14/14 focused PR 1D browser journeys passed. Dependency audit found zero vulnerabilities; application and Edge typechecks, PR 1A-1D gates, AI-boundary and secret-hygiene scans, and production build passed. Live/hosted validation was not run.

This final acceptance-record update changes only current evidence/status. It does not alter product behavior, V1 scoring, V2 decision logic, capability authority, RLS, hashes, traceability, clone behavior, audit behavior, or browser behavior. Its own CI is recorded in the PR description and GitHub checks to avoid a self-referential evidence-commit cycle.


## P1 independent evidence-attestation correction

PR 1D permits only author-controlled evidence submission (suggested or submitted, with validated false). It does not create evidence approval, independent reviewer attestation, reviewer assignment, Govern resolution, Studio handoff, export, or sharing. The Edge parser rejects validated/rejected states, reviewer IDs, and review receipt/attestation fields; an additive database trigger independently rejects author-attestation payloads even if a private RPC is called directly.

Verified confidence is reserved for an immutable, server-authoritative, independently authorized evidence-attestation projection. That projection and its review command are PR 1E work. Consequently the PR 1D authoring/finalization path is reviewer-ready only and submitted claim-linked evidence can be no higher than Partially Evidenced; V1 imports remain submitted, unvalidated, and provenance-linked. Rollback remains the existing V2 disable/read-only fallback; no destructive migration rollback is permitted.
