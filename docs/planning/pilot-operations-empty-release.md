# Pilot Operations empty-release correction

## Objective and authority

AP's next-step instruction on 2026-10-05 authorizes completing the existing synthetic operator path. Source baseline is merged PR #269, `0f7df5dc91100bb3401e612aa2d05afe7d03e747`, whose tree equals tested head `9f89ebd29f4aea43262e4e8ca7d4cfb55c32372f`. The operator exercise reached a valid configured environment with no release candidate; the frontend rejected that projection and hid environment status.

All three read-only architecture, security and quality reviewers finished before writes. The controller resolved their scope difference in favor of a frontend-only correction: normalize the existing exact empty-release representation without changing SQL or introducing a migration. An absent environment remains fail-closed. Under the fixed permission profile, Wave 2 begins only after those reviews close. One implementation worker owns the frontend, focused tests and operator runbook; the controller owns integration, evidence and the single PR. No nested delegation.

## Scope and trust boundary

- Accept a literal null release or the exact legacy four-field all-null release object as no candidate. Preserve strict populated-release validation and reject partial, malformed or extra-field identities.
- Keep environment identity and version authoritative. Never invent release IDs, versions, lifecycle or commit identity.
- Show an accessible empty-release state while retaining environment controls, health, recovery, blockers and hosted/live stop gates.
- Disable candidate actions without candidate authority. Require `release.validate`, `release.approve`, `release.promote`, or `operations.manage` for the corresponding controls, in both presentation and the connected request handler.
- Preserve current server authorization, version checks, idempotency, immutable receipts/audit, tenant-switch fences and bounded errors. UI capability checks are presentation safeguards, not authorization.

No schema, command RPC, role, scoring, AI runtime, budget, approval, deployment, production or hosted setting change is included. No new paid effect or fabricated release is needed. This PR does not attempt the broader no-environment UI redesign.

## Acceptance and verification

1. The configured-environment/no-candidate projection renders without an unavailable alert.
2. Literal null and exact all-null release shapes normalize identically; partial identities and unexpected fields fail closed.
3. Missing release authority or action capability prevents transport calls. Authorized environment controls retain the server version; populated candidate behavior remains supported.
4. Read-only, denied transport, tenant changes and stale authority retain their existing fail-closed behavior.
5. Dedicated Desktop Chrome and Pixel 7 checks cover empty state, control availability, keyboard access, overflow and accessibility.

Focused local commands: `npm run test:pilot-operations`, `npm run test:browser:pilot-operations`, and integration typecheck/build when needed for the changed nullable TypeScript contract. Existing CI requirements remain unchanged. No unrelated local regression or PostgreSQL rerun is required for this frontend-only change.

Verification results are recorded below only after execution. Candidate CI and preview must remain pending until verified on the final head. Browser harness results are synthetic frontend evidence, not hosted UI or independent human acceptance.

## Recovery evidence and limits

The retained Pilot Operations run `37200371040` artifact for tested head `9f89ebd29f4aea43262e4e8ca7d4cfb55c32372f` matches its manifest digest, workflow, run, attempt and disposable environment. Clean restore, corruption rejection, incomplete-backup rejection, wrong-version rejection, interrupted retry and canonical receipt checks passed. This is retained executed disposable PostgreSQL 16 evidence, not new-head execution or a restore of the retained hosted synthetic database. That target's backup/restore state remains `not_run`.

## Rollout, rollback and remaining gates

The parser is compatible with the deployed projection; no migration order or data rewrite is needed. Roll back the frontend commit or keep the panel read-only/unavailable. Preserve all backend records and server denials. Do not enable providers or operations mutations to verify presentation.

Merge and deployment require their own authority at the PR boundary. Production readiness, hosted-target recovery, performance proof and broader human acceptance remain outside this correction.

## Executed verification

- `npm run test:pilot-operations` — PASS: 17 model cases, seven server decoder cases, ten panel assertions and 19 connected capability/target checks, plus the retained command, CI-contract and manifest-verifier checks.
- `npm run test:browser:pilot-operations` — PASS: 10/10 cases across Desktop Chrome and Pixel 7. The production-mode Vite build includes the main app and dedicated harness. Empty-release and observer cases prove disabled commands emit no transport request; the retained panel checks cover keyboard access, overflow and serious/critical axe findings.
- `npm run typecheck` — PASS. Its first attempt found a new React props inference error; explicit props typing corrected it before the passing run.
- Offline replay of the retained synthetic operator response — PASS, ten sanitized assertions. The baseline decoder rejects the same input; the corrected decoder preserves environment identity/version, read-only mode, recovery `not_run`, live stop gates and absent release authority. No network access or hosted write was used.
- `git diff --check` — PASS. Root integration review confirmed no migration, workflow or backend-source changes and preserved tenant-generation guards.

Private replay output is retained under `output/local-private/pilot-empty-state-20261005/replay-final-result.json`; browser runner status is `.agent/pilot-operations-playwright/.last-run.json`. These local files are not repository acceptance artifacts. The sanitized fixtures and focused checks are committed with the implementation so CI can reproduce them.

Candidate CI and preview are pending at publication. Corrected hosted UI verification, hosted-target restore and production deployment are **not run**. The retained disposable recovery evidence remains bound to its original head; it is not relabeled as this candidate's execution.

## Candidate CI integration follow-up

On initial head `770d9d69e3944b0dca19c3a4cf34693eb702d472`, Pilot Operations, Core CI and preview/browser QA passed. The governed Delivery/Monitor evidence workflow failed with `PR_C_PROVENANCE_FILE_SET`: the generated source manifest had not been refreshed for this implementation's files. Refresh only the existing registry/provenance bindings with `node scripts/buildTranscriptFlowPrCRegistry.mjs --refresh-bindings`; preserve assertion expectations, runtime code, workflow requirements and historical execution results. Run the affected `test:transcript-flow:delivery-monitor-evidence-contract` checks before publishing the corrected head. This regeneration records source identity, not an executed acceptance pass. Final-head CI remains required.

Executed evidence: the affected contract command passed 75/75 tests plus migration, workflow and final registry validation. All 241 assertion expectations, 85 command definitions and 15 owners are retained. Only source provenance and this implementation note changed in the follow-up; no feature regression rerun was needed locally.
