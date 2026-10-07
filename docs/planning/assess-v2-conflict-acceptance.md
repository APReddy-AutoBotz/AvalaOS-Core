# Next Assess V2 conflict acceptance slice

## Entry boundary

AP approved merge and continuation on 2026-10-07. PR #274 merged as a69707afddc4b17804e37e9bbdaa44f6bf1cb7a2 with the tested f7a8f957 tree unchanged. All 14 applicable candidate workflows passed. Exact acceptance run 37430088371 attempt 1 records 24 PASS / 0 FAIL / 84 BLOCKED. The approved two-case implementation begins from that baseline. Architecture, security and quality reviews are complete and closed; Wave 2 uses the fixed workspace-write profile.

## Objective and scope

Implement ASSESS-021 and ASSESS-022 only, preserving their existing disposable-PostgreSQL criteria and one logical committed mutation each. ASSESS-018 through ASSESS-020 require hosted_sandbox execution and remain BLOCKED. Preserve all 108 behavior criteria, runtime authorization, migrations, scoring, dependency versions, paid limits and hosted settings.

Canonical product authority: docs/architecture/assess-v2-decision-intelligence-architecture.md. Reuse scripts/testPr1dMigrations.mjs and the existing retained-suite/evidence integration. Do not add a general evidence framework.

## Reviewed implementation

- ASSESS-021: create an isolated synthetic baseline, invoke two real service-role draft upserts with the same expected version and distinct keys, require one winner and one VERSION_CONFLICT, exactly one committed head/version transition, one succeeded receipt and one audit. Either request may win. Verify zero loser effects from scoped state, not global counts.
- ASSESS-022: commit a real draft upsert and reuse the same actor/tenant/workspace/command/key with a changed canonical payload. Require IDEMPOTENCY_CONFLICT, an unchanged original request hash/response, no second version/receipt/audit, and one total logical mutation. Never substitute a preinserted receipt for real command execution.
- Restrict the specialized producer and retained binding to exactly 021/022. Keep the existing assess-v2-authority owner where feasible; use the actual PostgreSQL harness command and a dedicated database URL passed only to that child. Remove 018-020 from retained ownership and represent them with existing blocked-hosted declarations. Add a focused guard proving PostgreSQL artifacts cannot promote those hosted cases.
- Correct only relevant source/fixture ownership metadata from the unrelated V1 scoring source to the actual harness and applied V2 command chain. These cases prove the RPC boundary; they do not prove deployed Edge/PostgREST or browser behavior.
- Follow the existing narrow producer pattern: exact candidate/run/attempt/workflow/command, current canonical source hashes, repository-safe synthetic scope, scoped measured outcomes, strict result allowlist and verified cleanup. Validate ingestion and final-report consumption. Bind private fixture records internally; emit no raw generated object identifiers, logs, secrets or connection strings.
- Replace swallowed cleanup errors with bounded tracking of auxiliary/main/admin clients, temporary files, child database and synthetic roles. Emit the artifact only after cleanup succeeds; cleanup failure fails the run. Preserve genuine assertion failures as FAIL and missing/invalid proof as BLOCKED.

## Review and ownership

Architecture, security and quality read-only reviews are complete. No reviewer remains active and no tests ran during review. Security confirmed the current retained execution/provenance gap and swallowed cleanup errors; no product authorization bypass was established. Long-lived fixture contamination is a risk addressed by isolated records and scoped snapshots.

After explicit approval and the merge boundary, one implementation worker owns the PR1D harness, narrow producer/validator/tests, retained runner/workflow integration and focused report test. The controller owns acceptance catalog/bindings/provenance metadata, canonical docs, generated contracts, integration, final checks and the single implementation PR. No nested delegation; no overlapping file ownership. Reuse the existing suite name instead of adding an unnecessary parallel suite when its ownership can be narrowed safely.

## Focused verification and acceptance

Producer substitution/identity/scope/cleanup/failure tests; two-case report integration including partial evidence, aggregate-only evidence and failed assertions; a hosted-case nonpromotion guard; catalog/traceability/provenance and PR1D migration contract; syntax/diff/hygiene; real PostgreSQL 16 execution in the existing exact-candidate acceptance workflow. No additional local browser, performance or broad regression run is needed for evidence-only wiring.

Expected after successful exact execution: 26 PASS / 0 FAIL / 82 BLOCKED, with all other 106 statuses unchanged. This is planned verification, not an achieved result. Hosted execution remains NOT_EXECUTED and overall coverage incomplete.

## Local executed verification (2026-10-07)

- Producer/adversarial checks: `node --test scripts/assessV2AcceptanceEvidence.test.mjs` passed all three tests.
- Focused report integration: `node --test --test-name-pattern="Assess V2 report" scripts/runExhaustiveAcceptanceReport.test.mjs` passed all nine variants: valid two-case evidence, source/result/hosted-case/cleanup substitutions, partial evidence, actual failure, failed aggregate and aggregate-only evidence. Hosted 018/019/020 remain blocked in every variant.
- `node scripts/exhaustiveAcceptanceEvidence.test.mjs` passed retained-evidence validation.
- Catalog and traceability validators passed with 108 cases, 108 source-backed branches and zero uncovered. Independent comparison confirms all 108 behavior criteria unchanged; only 021/022 source and fixture metadata change.
- Acceptance metadata and inventory-provenance adversarial checks passed after the final source-hash refresh.
- PR1D migration and CI contracts, changed JavaScript syntax, secret hygiene (zero forbidden hits) and `git diff --check` passed.
- Real PostgreSQL execution is `not run` locally because this workstation has no available local PostgreSQL engine. The existing workflow-owned PostgreSQL 16 service must execute the candidate before either case is promoted.

The harness compares full scoped case/version/child/receipt/audit snapshots. It binds the winner to its successful receipt and audit and confirms the loser has neither. The evidence carries measured deltas and fixed repository-defined synthetic scope, without raw snapshots or generated identifiers. There are no harness temporary files; all created clients, the disposable database and created roles are tracked for cleanup. Runtime, migrations, dependencies and scoring remain unchanged.

## CI preflight compatibility correction

Candidate `39f958f4` stopped before PostgreSQL execution in run `37629646635`: the historical PR #255 charter test hard-coded the old fifteen hosted exclusions. The current bindings correctly include three additional blocked Assess V2 cases. The test now preserves the immutable charter and its exact fifteen exclusions, while requiring the current bindings to equal those exclusions plus ASSESS-018/019/020. The related report and browser-declaration contracts likewise require 36 explicit skipped project cases (18 cases across two viewports), while the 38 executable declarations remain unchanged. This changes no acceptance criterion and grants no hosted credit.

## Rollback

Revert only this slice's instrumentation, producer/validator, bindings and generated source metadata together. Both cases return to BLOCKED. No runtime schema rollback or hosted change is required. The controller will report exact candidate evidence at the PR boundary under the user-authorized continuation. Hosted operations, production changes and new paid effects remain outside this slice.
