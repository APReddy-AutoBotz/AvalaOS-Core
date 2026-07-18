# PR 1D Avala Assess V2 Decision Intelligence Evidence

Status: active acceptance evidence; final correction-head CI and review closure pending

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
| `npm.cmd ci` | Passed in the correction worktree: 200 lockfile-defined packages installed and 0 vulnerabilities reported. |
| `npm.cmd audit --audit-level=moderate` | Passed; 0 vulnerabilities. |
| `npm.cmd run typecheck:edge` | Passed; Edge TypeScript emitted no diagnostics. |
| `npm.cmd test` | Interrupted by a user turn after its completed green sections; no failure was reported. PR-owned suites were rerun directly below, and the final correction-head GitHub Quality Gates workflow remains the authoritative aggregate proof. |
| `npm.cmd run test:pr1a` | Passed; coverage 94.90% lines, 93.10% branches, 92.86% functions. |
| `npm.cmd run test:pr1b` | Passed; coverage 95.65% lines, 82.26% branches, 100.00% functions. |
| `npm.cmd run test:pr1c` | Passed; coverage 80.00% lines, 81.97% branches, 86.96% functions. |
| `npm.cmd run test:pr1d` | Passed; source, migration contract, CI contract, V1 compatibility, V2 model/command/presentation, Govern compatibility, coverage, and docs gates passed. |
| `npm.cmd run test:pr1d-coverage` | Passed; 98.53% lines, 84.49% branches, 96.51% functions. |
| `npm.cmd run test:migrations:pr1a` against isolated PostgreSQL 15 | Passed; fresh, idempotency, supported legacy upgrade, RLS, and failure scenarios passed. |
| `npm.cmd run test:migrations:pr1b` against isolated PostgreSQL 15 | Passed; complete disposable PostgreSQL tenant-authority, privilege, adversarial, concurrency, upgrade, fallback, and forward-fix matrix passed. |
| `npm.cmd run test:migrations:pr1c` against isolated PostgreSQL 15 | Passed; ACL, ancestry, idempotency, lifecycle, atomicity, and rollback scenarios passed. |
| `npm.cmd run test:migrations:pr1d` against isolated PostgreSQL 15 | Passed; ACL/RLS, clone, canonical digest, atomicity, raw/receipt/read-only replay idempotency, absent-receipt and disabled-mode denial, zero-side-effect V2 draft conflicts, V1 requested-change reopen and score clearing, concurrency, compatibility, and immutability passed. |
| `npm.cmd run test:browser:pr1d` | Passed; 24/24 desktop/mobile journeys, including keyboard-accessible V1 requested-change reopen, unrelated-status non-exposure, persisted-draft remount, accessibility, overflow, error, and interaction-budget checks. |
| `npm.cmd run test:browser` | Passed; 24/24 retained PR 1A/PR 1C desktop/mobile journeys in deterministic single-worker mode. |
| `npm.cmd run test:ai-boundary-static` | Passed; 0 forbidden hits and 0 stale allowlist entries. |
| `npm.cmd run test:secret-hygiene` | Passed; 0 forbidden hits and no tracked `.env` files. |
| `npm.cmd run build` | Passed; production Vite build completed. |
| PR 1D Markdown relative-link validation | Passed through `npm.cmd run test:docs:pr1d`. |
| PR 1D buyer-copy/UTF-8 scanner | Passed through `npm.cmd run lint:pr1d`; no changed-file mojibake or legacy `assess.v2.write` references. |
| `git diff --check` | Passed; line-ending conversion warnings only. |
| GitHub PR #209 final correction-head CI | Pending after this evidence-bearing correction commit. The preceding remote head `16a64b4a982d04a67743d753f8412e0becdc01ab` exposed the V2 draft-receipt ordering and V1 requested-change reopen defects corrected and reproduced locally in this commit. Final workflow identifiers and results are tracked in GitHub checks and the PR description to avoid a self-referential evidence cycle. |
| Hosted/live Supabase | Not Run by design. |

No live or hosted infrastructure, production data, logs, secrets, storage objects, deployment controls, or incident actions were accessed. This ledger must not be read as buyer acceptance, deployment readiness, scientific calibration, guaranteed economics, compliance certification, or security certification.

## Rollback and recovery

Set the V2 runtime control to disabled or read-only, leave V1 behavior available, preserve all V2 history, imported facts/evidence, canonical snapshots/text, hashes, receipts, and audits, and ship an additive forward fix. Do not reverse the accepted foundation migration destructively, mutate immutable decisions, reinterpret V2 through V1 scoring, restore browser-side decision authority, or claim that local evidence proves hosted readiness.

## Final correction-head acceptance

Executed local evidence on the final correction worktree includes a clean lockfile install, zero-vulnerability audit, application and Edge typechecks, PR 1A-1D source and package-owned suites, AI-boundary and secret-hygiene scans, all four disposable PostgreSQL migration matrices, 24/24 retained browser journeys, 24/24 PR 1D browser journeys, and the production build.

PR 1D coverage is 98.53% lines, 84.49% branches, and 96.51% functions. Final correction-head push and pull-request workflow results are recorded in GitHub checks and the PR description after this commit. Hosted/live validation was not run.

The correction exercises finalization replay from the immutable pre-finalization source, synchronizes remount testing with the saved-draft acknowledgement, restricts finalizable evidence claims to registered V2 fields or immutable server-projected V1 import provenance, and permits authorized succeeded receipts to replay during read-only maintenance while disabled mode remains fail-closed. It does not alter V1 scoring, V2 formulas, weights, thresholds, hard stops, recommendation logic, capability authority, RLS, hashes, traceability, clone ownership, or audit ownership.


## P1 independent evidence-attestation correction

PR 1D permits only author-controlled evidence submission (suggested or submitted, with validated false). It does not create evidence approval, independent reviewer attestation, reviewer assignment, Govern resolution, Studio handoff, export, or sharing. The Edge parser rejects validated/rejected states, reviewer IDs, and review receipt/attestation fields; an additive database trigger independently rejects author-attestation payloads even if a private RPC is called directly.

Verified confidence is reserved for an immutable, server-authoritative, independently authorized evidence-attestation projection. That projection and its review command are PR 1E work. Consequently the PR 1D authoring/finalization path is reviewer-ready only and submitted claim-linked evidence can be no higher than Partially Evidenced; V1 imports remain submitted, unvalidated, and provenance-linked. Rollback remains the existing V2 disable/read-only fallback; no destructive migration rollback is permitted.

### Final review authoring-completeness correction

The P1 primitive-fact and application-lifecycle editor findings are corrected in the implementation boundary. Executed local evidence includes TypeScript, PR 1D source lint, production build, the focused displayed-controls finalization browser journey, the complete PR 1D browser suite, and the complete PR 1D package-owned suite. Final correction-head CI is required before readiness.


### Final review locked-row clone correction

The final Codex review identified a confirmed source defect: the private clone RPC validated caller-supplied imported fact/evidence shape without proving exact equality to the locked V1 source row. The correction makes PostgreSQL independently derive the canonical projection and reject any mismatch before side effects. Static PR 1D migration/source guards and the complete isolated PostgreSQL 15 migration chain passed locally, including deterministic evidence parity, fabricated fact/evidence rejection, and zero-side-effect assertions. Final correction-head CI is still required before readiness.

### Final acceptance replay and browser synchronization correction

The preceding remote head exposed two acceptance defects. The migration harness attempted a same-key raw finalization replay by reloading a case that had already transitioned to `reviewer_ready`, causing `PR1D_VERSION_CONFLICT` before the database idempotency path could be exercised. The corrected harness reuses the immutable pre-finalization authoritative source for the raw-RPC replay, verifies the service-role receipt replay helper, and proves missing-receipt and cross-case idempotency failures. The exact remote failure reproduced locally before the correction; the complete PR 1D PostgreSQL matrix passed afterward.

The persisted-draft remount browser scenario reloaded immediately after clicking an asynchronous save control, so a slow CI host could reload before the fixture observed the completed save. The test now waits for the visible saved-draft acknowledgement before reloading. The focused remount scenarios passed 2/2 and the complete PR 1D browser suite passed 18/18 across desktop and mobile.

### Final review read-only replay and evidence-claim correction

The final-head Codex review identified two P2 edge cases. First, the receipt replay RPC applied the read-only mutation gate before looking up a previously succeeded finalization receipt. The correction locks the runtime control, preserves disabled-mode fail-closed behavior, revalidates finalize authority, permits only an exact succeeded receipt replay while read-only, and returns `READ_ONLY` for an absent receipt. The isolated PostgreSQL 15 matrix proves the positive replay and both negative controls.

Second, finalization treated any non-empty evidence claim string as meaningful. The locked deterministic validator now rejects every author evidence claim that is not an exact registered V2 field, an exact imported V1 fact field, or a member of the immutable server-projected V1 evidence provenance set. Tests reject typo/default and unbound V1 claims while preserving the canonical fixture and clone-import boundary. This is validation hardening only; the rule set and decision version are unchanged.

Fresh correction-head CI and review-thread closure remain required before readiness.

### Final review draft-receipt and requested-change correction

The final-head Codex review identified two additional P2 defects. The V2 draft upsert claimed an idempotency receipt before checking the locked case status and expected version, so its normal `VERSION_CONFLICT` return could commit an `in_progress` receipt for a command that made no domain mutation. The correction preserves exact successful replay checks before and after the case lock, but validates mutable draft status and version before `pr1b_claim_command`. The isolated PostgreSQL 15 matrix proves stale-version and reviewer-ready conflicts leave the case, immutable authoring versions, child rows, decisions, receipts, and privileged audits unchanged; a valid same-key race still yields one commit, one exact replay, one succeeded receipt, and one audit.

The V1 `Changes Requested` surface contained a reopen handler but no rendered control, and the accepted enterprise response-upsert RPC neither changed the database status to `Draft` nor cleared the prior score. The UI now exposes an authorization-aware, keyboard-operable **Revise requested changes** control only for that status. The service-role-only response-upsert correction locks the tenant-owned assessment, permits only `Draft` or `Changes Requested`, and atomically persists requested corrections, clears `scores` and `score_version`, increments the version, returns `Draft`, records sanitized audit metadata, and supports exact replay. Other lifecycle states and stale versions fail before receipt creation. The PostgreSQL matrix proves committed reopen, score clearing, exact replay, and `Approved` denial with zero side effects; Playwright proves invocation and non-exposure in `Ready for Review` and `Approved` across desktop and mobile.

These corrections do not change V1 `assess-core-2026-05` formulas, weights, thresholds, hard stops, recommendation logic, or score version. They do not add V2 approval, evidence attestation, Govern resolution, Studio handoff, export, sharing, hosted proof, or deployment claims. Fresh correction-head CI and a final-head review with zero unresolved threads remain required before readiness.

### Final P1 imported-V1 evidence provenance correction

The final-head Codex review found that syntax alone still allowed a fabricated `v1.evidence.*` claim whenever `sourceV1` existed. The correction adds `sourceV1.importedEvidenceClaimIds` to the locked server projection and derives it only from evidence attached to the immutable version-1 `v1_clone`. The deterministic evaluator now requires exact set membership; it does not trust current author-editable evidence, the identifier prefix, or a client-recomputed evidence UUID.

Executed focused evidence includes domain validation that accepts the actual imported claim and rejects fabricated or absent-projection claims, an Edge finalization regression that rejects the fabricated claim before `executeAtomicCommand`, and the isolated PostgreSQL 15 migration regression. The database test replaces a real imported evidence claim with a syntactically valid fabricated author claim in a later draft and proves the immutable ordered provenance set remains the original real claim in both the loaded case and finalized input snapshot. This changes no scoring formula, weight, threshold, hard stop, recommendation logic, rule-set version, or decision version. Fresh correction-head CI and review-thread closure remain required before readiness.

### Final P2 create and clone receipt replay correction

The final-head Codex review found that `assessment_v2.create` checked the mutable parent process before looking for an already-succeeded receipt, so a retry could report `NOT_FOUND` after the original committed parent was soft-deleted. The same ordering risk existed in the corrected V1 clone RPC. The additive correction now locks runtime control and revalidates current capabilities before exact receipt replay, but performs mutable process/source checks only for a receipt miss. Exact committed replay is permitted during read-only maintenance; disabled mode remains fail-closed.

Executed isolated PostgreSQL 15 evidence covers exact create and clone replay after parent/source soft deletion, unchanged case/version/evidence/receipt/audit counts, missing and mismatched receipts, foreign workspace scope, failed and in-progress receipt states, read-only and disabled modes, current authority revocation, and a genuine two-session create race producing one commit and one replay. New create work row-locks the active process before receipt claim. The accepted foundation migration remains unchanged, and no live or hosted system was accessed. Fresh correction-head CI and review-thread closure remain required before readiness.

### Final P2 create-case agent-necessity compatibility correction

The final-head review found that the foundation default created a version-1 case with five null `agent_necessity` entries while the browser editor reads each entry as a `CaseFact`. The additive correction now gives future rows the canonical five unknown, user-sourced facts and explicitly persists that same shape for every new create command.

Executed isolated PostgreSQL 15 evidence proves a fresh unsaved V2 case stores and loads all five canonical facts with safe `.value` access. It also seeds an exact legacy version-1 `create` all-null row before applying the correction and proves the read projection normalizes it without mutating the immutable raw row. A near-match malformed row remains unnormalized, preventing the compatibility boundary from silently repairing unrelated data. The foundation migration remains unchanged, no scoring or decision rule changed, and no live or hosted system was accessed. Rollback remains V2 disable/read-only with history preserved and another additive forward fix.

### Final P1 Edge/Deno import-resolution correction

The final-head review identified a confirmed source defect: the Assess V2 Edge graph reached extensionless TypeScript imports that native Deno resolution would reject. The new recursive TypeScript-AST guard was executed before the complete correction and failed on `services/assessV2/evaluator.ts -> ./types`. After explicit `.ts` specifiers were applied across the reachable graph, the guard passed 19 TypeScript modules and 40 relative edges, including the shared command boundary, V1 compatibility converter, and complete deterministic V2 evaluator.

Executed focused evidence passed `node --check` for both import/transpiler guards, `npm.cmd run typecheck:edge`, `npm.cmd run typecheck`, `npm.cmd run test:assess-v1-compatibility`, `npm.cmd run test:assess-v2-rule-registry`, and `npm.cmd run test:assess-v2-command`. The local Deno CLI was not installed, so an actual `deno check` was not run and is not claimed; the recursive graph guard and Edge TypeScript compiler are source/CI evidence, not hosted or deployed Edge proof.

The CommonJS test transpiler now uses `rewriteRelativeImportExtensions`, preserving existing Node execution while Deno receives resolvable source specifiers. No scoring/version/rule, command authority, persistence, migration, snapshot, hash, review, Govern, Studio, export, or sharing behavior changed.

Rollback remains V2 disable/read-only plus an additive forward fix; do not restore extensionless Edge imports or alter accepted migration history.

### Final P2 Edge clone-replay preflight correction

The final-head review found that the Edge clone handler still loaded the mutable V1 source before invoking the corrected clone RPC. A committed retry therefore could not reach the SQL receipt replay path after source deletion or during read-only maintenance. The correction adds a private replay-only RPC and invokes it after fresh authority checks but before any V1 source read.

Executed focused Edge evidence proves exact succeeded replay returns without calling `loadFrozenV1AssessmentForClone`; `IDEMPOTENCY_CONFLICT`, `READ_ONLY`, and `FEATURE_DISABLED` also fail before that loader. A normal `NOT_FOUND` preflight alone falls through to the existing server projection and locked full clone RPC.

The complete disposable PostgreSQL 15.8 PR 1D matrix passed. It proves private-RPC ACL, exact replay after source deletion, zero additional case, immutable version, evidence, receipt, or privileged-audit side effects, normal/read-only misses, disabled fail-closed behavior, wrong source/name/case conflicts, and current `assess.read` revocation. Static source/migration guards and root plus Edge typechecks also passed.

No live or hosted system was accessed. The correction changes no score, rule, recommendation, approval, evidence-attestation, Govern, Studio, export, or sharing behavior. Fresh correction-head CI and final review-thread closure remain required before human-review readiness.

### Final P2 Govern Lite missing-quality and database status-null correction

The final-head review found two additional compatibility-boundary defects. A legacy or incomplete assessment with absent `metadata.evidenceQuality` reached the strict V1 normalizer through Govern Lite and could throw instead of reporting the established low-confidence gap. The correction treats only missing or `undefined` quality as insufficient evidence, requires evidence review, and prevents L4 autonomy; present malformed values still throw through the canonical normalizer. The focused Govern Lite regression and application typecheck passed.

The author-evidence trigger used `NOT IN` without first rejecting a missing status, allowing SQL `NULL` to make the PL/pgSQL condition non-true. The correction explicitly rejects omitted and JSON-null status. The complete disposable PostgreSQL 15.8 PR 1D matrix passed, including a compatible submitted/unvalidated row preserved across the additive migration, direct rejection of omitted and null status, and acceptance of a new exact submitted/unvalidated row. Static migration/source guards and harness syntax checks also passed.

No live or hosted system was accessed. These corrections change no score, formula, evidence threshold, rule-set, decision version, recommendation, approval, attestation authority, Govern resolution, Studio handoff, export, or sharing behavior. Fresh correction-head CI and another final-head review with zero unresolved threads remain required before human-review readiness.

### Final P1 normal-draft atomic audit correction

The final-head review found that the V1 response-upsert correction supplied SQL `NULL` audit metadata for an ordinary Draft save even though `privileged_audit_events.metadata` is non-null. The database would roll back the valid save, receipt, and audit and return an unavailable envelope. The correction supplies an empty JSON object for the normal path while preserving the explicit requested-change reopen metadata.

Executed static guards, harness syntax, and the complete disposable PostgreSQL 15.8 PR 1D matrix passed. The new regression proves a normal Draft save commits, remains Draft, increments the version, persists its response, writes exactly one succeeded receipt and one audit with an empty metadata object, and replays identically. Existing requested-change reopen, approved denial, and Govern resubmission assertions remain green.

No live or hosted system was accessed. This correction changes no V1 score, formula, threshold, hard stop, recommendation, score version, Govern authority, V2 rule, decision version, approval, attestation, handoff, export, or sharing behavior. Fresh correction-head CI and one more final-head review with zero unresolved threads remain required before human-review readiness.
