# Studio lifecycle acceptance

## Objective and entry boundary

Make seven currently blocked Studio cases executable through the real disposable-PostgreSQL command boundary, with evidence that proves the named lifecycle behavior. AP authorized continued testing and verified merges without routine reapproval. Baseline is merged PR #275, `e8fdd7047f95665edf594bbf4535692c4d153f56`; its tested tree matches the merge, all applicable candidate workflows passed, and post-merge Core CI `37640299836` passed. Exact acceptance run `37635652518` attempt 1 records 26 PASS / 0 FAIL / 82 BLOCKED.

Read-only architecture, security and quality reviews completed before writes. The fixed workspace-write profile is now used only for this package. One worker owns the focused Studio harness and producer; the root owns shared integration, verification, documentation and the single implementation PR. No nested delegation.

## Scope and source authority

Only STUDIO-004/005/006/008/009/010/011 gain a new evidence producer. Preserve all 108 behavior criteria, existing hosted declarations, runtime authorization, migrations, deterministic scoring and dependencies. Governed and private product authority remain in `docs/architecture/studio-governed-artifact-authority.md` and `docs/architecture/studio-private-artifact-authority.md`.

The retained aggregate Studio suites currently emit no exact database artifacts. The older private harness also aliases several rendition/deletion names to record-existence checks. A new focused harness must prove actual behavior; those labels cannot be reused as PASS evidence. Do not run the large legacy migration suite again locally merely to collect its aggregate count.

## Acceptance and trust boundary

| Case | Required target transition and invariants |
| --- | --- |
| STUDIO-004 | One real descendant revision; prior content/hash/ancestry immutable, exact head advancement, receipt/audit and zero-effect replay or conflict. |
| STUDIO-005 | One final approval by a third active authorized human; author/reviewer self-approval denied, exact approved pointer and receipt/audit, replay adds nothing. |
| STUDIO-006 | One canonical private rendition for the exact approved version; bound hash/size/MIME/renderer/template/schema, private projection and replay without another executable claim. |
| STUDIO-008 | One retention extension; effective retention only lengthens, shortening denied, exact lineage/receipt/audit and zero-effect replay. |
| STUDIO-009 | One legal-hold placement; exact active event, held deletion denied, foreign-scope denial and zero-effect replay. |
| STUDIO-010 | One governed deletion completion; independent request/resolution prerequisites, retained tombstone/lineage, one completion audit and zero-effect replay. |
| STUDIO-011 | One deletion recovery completion after an uncertain outcome; exact current fence/authority, retained tombstone and no duplicate transition on stale/replayed work. |

Each case retains one **logical target mutation**. Setup and supporting receipt/audit/attempt transitions are measured separately. Direct upstream fixture insertion is setup only and establishes no Govern proof. Use real service-role RPC authorization and authenticated tenant-scoped projections; administrative fixture authority must not replace actor checks. Compare scoped state before/after, including denied and replayed calls. Storage effects may be simulated in memory, explicitly labeled; real upload, bucket state, physical deletion and hosted recovery remain **not run**.

Apply the current ordered migration chain once in a unique disposable database. Reuse accepted fixtures only if they work against that chain. Run independent case transactions and roll them back; do not fall back to historical migrations or weaken a criterion if a fixture fails. Preserve database/Storage non-atomicity and fence semantics in simulated lifecycle calls.

## Evidence and integration

Add the narrow `studio-postgres-acceptance` retained owner. Route only the seven cases to `node scripts/testStudioAcceptancePostgres.mjs`, using `STUDIO_ACCEPTANCE_DATABASE_URL` from the existing workflow-owned PostgreSQL 16 service. Keep other Studio owners and hosted cases unchanged.

Require exact Test ID, branch, assertion, scenario, command, candidate SHA, workflow/run/attempt, canonical source digests and fixed executed synthetic scope. Validate both producer ingestion and final-report consumption. Emit measured booleans/counts only; no generated IDs, content, rationales, object coordinates, credentials, connection strings, raw snapshots or logs. Genuine failed assertions are FAIL; absent or invalid proof is BLOCKED.

Close all clients, drop the created database and any roles created by this harness, and verify cleanup before writing the artifact. Cleanup failure fails the suite and cannot leave PASS evidence. No provider call or hosted access is permitted.

## Focused verification

Planned commands: Studio producer adversarial tests, full acceptance report integration once after wiring, retained-evidence tests, `npm.cmd run test:acceptance:catalog`, generated PR C registry refresh/contract, secret hygiene and `git diff --check`. Check changed JavaScript syntax. No UI behavior changes, so additional local browser, accessibility or performance regression is not required.

Local PostgreSQL execution is unavailable. Exact-candidate CI must run the focused harness against PostgreSQL 16, and the root must independently inspect its sanitized artifact. All applicable candidate gates and review findings remain merge requirements. If all seven pass, the expected result is **33 PASS / 0 FAIL / 75 BLOCKED**, with the other 101 statuses unchanged, hosted NOT_EXECUTED and overall INCOMPLETE_COVERAGE. This is a target, not an executed result.

## Local executed verification (2026-10-07)

- Studio producer and adversarial validation: 6/6 tests passed, including identity, scope, source, branch, command, partial/duplicate and malformed-result substitutions.
- Full report integration: all nine tests passed across the full run and one targeted retry. The first run passed eight tests; Windows sandbox temporary-file rename permissions blocked only the oracle subtest, which passed unchanged outside that sandbox. The Studio test exercised nine valid, substitution, missing-evidence and genuine-failure variants.
- Catalog/traceability, metadata, inventory provenance and historical-charter compatibility passed. The final oracle binding check required the same temporary-file permission retry. Independent comparison confirms all 108 behavior criteria unchanged and only the seven Studio cases moved to the new retained owner; hosted/server/oracle declarations remain unchanged.
- Retained-evidence adversarial checks, changed JavaScript syntax, PR C generated registry/evidence contract (85 commands, 241 assertions), secret hygiene (zero forbidden hits) and diff whitespace validation passed.
- An initial local metadata generation error changed two SQL source selectors; correcting those literal selectors restored catalog validation before publication. No runtime source or criterion changed.
- Real PostgreSQL execution is **not run locally**. Exact-candidate CI and artifact verification remain pending. Simulated storage counters and database evidence cannot establish hosted Storage behavior.

## Rollback and remaining boundaries

Revert this slice's harness, producer, tests, binding and provenance together; the seven cases return to BLOCKED. No schema/runtime rollback or hosted change is needed. The other ten unproven PostgreSQL cases and 65 hosted cases remain separate work; EI-003 has a read-only/one-mutation criterion mismatch that cannot be padded with a setup write. Paid AI, production actions, hosted deployment and any criteria correction remain outside this package.
