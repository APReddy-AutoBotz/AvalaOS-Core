# Assess supporting-document mapping

Status: native mapping and the subsequent projection-transaction correction passed the final 23-command local gate and 32 Desktop/Pixel scenarios. Head `aba2a8e2011df5e9375cb909f19aecf35b10d950` passed 17 applicable workflows, including the exact-head 23-command native gate; PR C correctly rejected a stale registry migration-tip expectation. The bounded evidence-contract correction below requires fresh exact-head CI. Hosted upload and real-provider proof remain pending.

### Exact-head CI migration-binding correction (2026-09-17)

PR C run `35155097345`, attempt 1, executed the fresh PostgreSQL assertion
`pr-c-postgres | postgres | DELIVERY-TR-006 | FRESH-PG16-DEFAULT-OFF | fresh-pg16`
with actual runtime migration tip `20260916203406`, then rejected the registry's
stale `20260916181916` expectation. Preserve that failed run: suite success does
not override the exact marker mismatch. The other 17 applicable workflows passed;
Hosted Pilot Live Acceptance remained intentionally skipped.

The read-only reviewer closed before the controller resumed the fixed
workspace-write phase. The correction changes this one runtime expectation based
on its actual emitted marker and independently validates the exact marker tuple
against `approvedFullChainTip` over the repository migration inventory. Regressions
cover stale, missing and unapproved future tips; missing/duplicate markers; and
substituted command, owner, Test ID and fixture. Canonical command equality prevents
removing the PostgreSQL command to bypass the check. Historical PR A/B registries,
the frozen human-backend tip, runtime product code and migration bytes are unchanged.

Executed verification: the complete PR C evidence-contract command passed its
migration/CI contracts, 64 tests and 81-command/221-assertion registry validation;
all six migration-tail tests passed. Independent comparison of the retained actual
CI marker matches the corrected expectation and still rejects its stale predecessor.
This reconciliation is not new-head PostgreSQL execution. Current provenance and
patch integrity passed. Planned verification: all 18 applicable workflows and the
complete 81-command PR C pipeline on the new committed head.
Earlier full native/local results remain bound to their own
source/head. No exploratory activation until the new gates pass. Rollback is to
hold release/read-only operation, not weaken evidence validation or reset data.

The next exact-head run (`35156634294`, attempt 1, head
`6b1834fbb47c110a0218dad4c0c1ae6f47209639`) passed this migration binding and
stopped at command 11: the active controlled-human contract still declared 80
commands/218 assertions. The reviewer closed before the controller resumed writes.
Reconcile active definitions and scoring-guard ordinal references to 81/221 and
derive their checks from the canonical registry, including negative mutations.
Preserve all historical counts and the explicitly superseded local-results table;
its old planned 74-command row is historical context, not current authority.
Rerun the complete controlled-human source gate with disposable PostgreSQL and
compare actual PostgREST assertion markers against the current registry before
the next push. No product code, scoring, migration, account or hosted state changes
are part of this evidence-contract continuation.

Executed local continuation: documentation positive/negative tests pass; the full
source command passes 148/148 tests including actual PostgreSQL, then 13/13
synthetic-generation and 11/11 runner self-tests. Its measured coverage child
fails during temporary Git pack construction. An isolated coverage rerun reports
235 tests: 218 passed, 17 failed through the shared startup hook, none skipped.
The fixed diagnostic is `PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:pack-objects:STATUS`;
bounded inspection identifies a write/rename failure in the fixture-owned pack
path, not the source object directory. The local complete-source command therefore
remains failed; do not combine partial suites into a full pass. The prior fixture
attempt with a missing synthetic database password is also retained. Both owned
PostgreSQL containers were removed and no hosted state changed.

Actual PostgREST separately passes all 23 child assertions; its three emitted
markers match the canonical registry, six no-write phases pass, and owned cleanup
is verified. Retained local results are under
`output/assess-import/pr-c-source-closure/` and
`output/assess-import/projection-postgrest/be89c67c-a397-4c40-bfe9-1d5f184d440e/`.
The documentation-only correction may proceed to exact-head CI, which must execute
the entire canonical 81-command pipeline including measured coverage successfully
before release. No fixture-check weakening or repository-object mutation is part
of this correction.

## Approval, baseline and execution boundary

AP approved native document upload, AI-assisted mapping into Assess, and editable human review in this task. This extends the earlier text-only input scope to bounded CSV and XLSX supporting documents. Continue in the existing PR #264 worktree on `controller/governed-delivery-monitor-pr-c-20260831`, baseline `6eee4ee60360db31d0b4280cfecb9bd33a2320bf`. Do not change the working branch to main, split a process-only PR, merge, or treat earlier PR C test results as proof of this enhancement.

The controller completed read-only architecture, quality and security reviews before this write phase. All three reviewers are closed. The fixed workspace-write environment is now used only for the approved implementation. The controller alone delegates, with at most three direct implementation workers and no descendants.

Protect the stash, unrelated `docs/marketing/`, `tools/`, pre-existing `.agent/` outputs and the unrelated recovery-script working-tree change. Inspect exact status/staging before any commit. No production, AvalaOS.com, customer data, real provider keys/calls or hosted infrastructure changes are authorized by this implementation plan.

## Outcome and scope

Inside the current process's Assess V2 workspace, a user can upload one or more supported documents, explicitly select their source set, run governed AI analysis, inspect grounded typed field suggestions, edit/accept/reject them, preview manual/cross-source conflicts, and explicitly apply a reviewed batch. Reload must show the committed immutable Assess draft. A user can continue manual authoring without importing anything. Assess and Studio retain independent source sets; no implicit downstream handoff or approval is introduced.

Supported inputs: TXT, Markdown, text transcripts, CSV, DOCX main-document text, limited text-layer PDF, and bounded non-macro XLSX. Image-only PDF/OCR, audio/video, old DOC/XLS, encrypted/macro/external-data workbooks and automatic formula calculation are excluded. Unsupported or incomplete facts remain unknown or evidence-only, with visible explanations; do not manufacture defaults that imply factual knowledge.

The memory-only browser queue permits at most 20 pending documents and 12,000,000 bytes in aggregate. Excess selections are rejected before reading file bytes, with a visible explanation and no silent truncation. Store/remove pending sources before adding another batch. The server independently enforces each source limit and the smaller complete AI analysis input limit.

Native import targets V2 authoring, not V1 scoring. The existing deterministic field registry, evaluator, formulas, versions, weights, thresholds, hard stops, recommendation and approval authority do not change. AI cannot write computed evaluations, gate results, control requirements, modernization dispositions, scores, verified evidence or approval state.

The catalog addresses one saved draft at a time. After reviewing and applying a newly suggested process step or application, the user can analyze the retained sources again to propose facts or relationships for those newly created entities. The system must not invent cross-batch identities or silently infer missing risk flags. Image-only PDFs require OCR outside this bounded implementation; spreadsheet formulas are not evaluated and cached formula results are not imported as facts.

## Frozen integration decisions

1. Reuse private source/version storage, explicit source-set versions, locked input bundles, governed provider routing/budgets, grounded candidates, human review, receipts and atomic transactions. Do not create browser AI authority or a parallel ungoverned upload path.
2. Add a versioned `assess-supporting-document-map-v1` contract. Server-issued finite target descriptors bind exact organization/workspace, case/version, schema, target kind/field/context and current value. Provider output is advisory and cannot supply SQL/JSON paths, arbitrary IDs, capabilities, evidence approval or derived decisions.
3. Allow typed case fields, existing primitive/agent/interaction/asset facts and authoring fields, and bounded structural constructors only where the complete resulting object satisfies the canonical Assess draft parser. Server generates identities, unknown defaults and evidence links. Incomplete structural proposals become evidence-only; no `{id,label}` children or scalar replacement of full CaseFact records.
4. The exact evidence-only target is `evidence`. Correct the existing `evidence.unresolved` mismatch. Legacy structural/fact apply must not remain a bypass around the new typed boundary; reject unsafe legacy operations or forward them through equivalent strict validation without rewriting historical migrations.
5. Mapping review/edit and preview bind source set/bundle/source version, extraction job/candidate version, target schema/catalog, draft version and reviewer. Commit revalidates all bindings and fresh canonical capabilities under a case lock, including Assess read/draft-write in addition to source/apply permissions.
6. Manual values are retained by default. Different proposed values, stale manual values and conflicting sources require explicit resolution and rationale. Preview/edit/cancel does not mutate Assess. One explicit apply creates one complete immutable version or none; identical retries are idempotent. Reload failure or response loss is uncertain, never optimistic success.
7. Mount a scoped `AssessSupportingDocumentIntake` in `AssessV2Workspace`. Scope includes actor, organization, workspace, authorization version, process, case and head. Unsaved local changes block preview/apply. Scope changes clear upload bytes, pending mapping, errors and late async results. Show readable field labels/types, sources and changed/current values, not free-text internal paths.
8. XLSX/CSV parsing is server-side and deterministic. Preserve unambiguous sheet/row/cell coordinates in canonical text and source anchors. Reject macro/external-link/embedded/encrypted/DTD/ZIP ambiguity and bound input/expansion/count/depth/strings. No formula evaluation or use of formula cached values as facts. Hidden sheets are excluded with explicit disclosure. CSV formula-looking strings remain inert text. Repeated values cannot be grounded by first-match guessing.
9. No silent truncation to the provider input cap. Oversized analysis is explicitly blocked before provider effect unless an independently tested coverage-preserving chunk contract is implemented. Upload success is not analysis success.
10. Feature controls default off. Additive migrations only, generated with the CLI. Preserve all historical migration/evidence bytes and the frozen controlled-human backend boundary. Any environment identity convergence requires exact predecessor/preconditions and does not authorize hosted application.

## Work ownership

- Controller: parser/CSV/XLSX and hostile fixtures, isolated test runner, plan/canonical documentation, package/CI wiring, integration and full verification.
- Contract/API worker: typed mapping contract and registry, client, source/AI command/query integration, grounded proposal review/preview/apply adapters and focused tests. No parser, UI, migrations, package or CI edits.
- Database worker: generated forward migration(s), strict database binding and immutable application, RLS/grants/rollback, migration and PostgreSQL test harness. No contract/API/UI/package edits.
- UI worker: native Assess upload/review/conflict UI, scope/async safety, friendly legacy review correction, actual-route Desktop/Pixel/browser/accessibility tests. No contract/API/migration/package edits.

Workers coordinate through controller-owned interface decisions and do not revert others' work. Shared contract must be published before consumers implement its details.

## Verification and acceptance

### Review checkpoint and corrective continuation (2026-09-16)

The first frozen implementation snapshot (`4dc59dfe30fe15aec3bc7b660026d91e237daa90420f8b834bb59c6e0ca6270c`) passed its 20 canonical commands, including 18 Desktop/Pixel scenarios. These are intermediate executed results, not acceptance of the later corrective source. The initial browser launch failed with host `EPERM` before scenario execution; that attempt remains retained alongside the successful permitted rerun.

Independent final architecture, quality and security reviews then closed. The controller reproduced staged-retry failure and post-analysis source staleness against the original migration in a disposable PostgreSQL 16 database. The bounded security review found two low-severity human-review integrity defects (partial projection and stale source applicability); the same review identified recovery and canonical-fact correctness defects, not scoring or authorization bypasses. No hosted or real-provider test was performed.

The approved implementation therefore remains open for one coherent corrective pass:

- Bind a complete displayed preview to its exact server-held item/conflict set; incomplete projections cannot be ready or silently apply omitted changes.
- Recheck exact source/bundle currentness at every unconsumed review/apply boundary; retain successful committed replay history.
- Recover an exact claimed/staged analysis under the current receipt fence without a second provider effect.
- Canonicalize supported legacy primitive-fact aliases without losing provenance or changing scoring rules; reject ambiguous duplicate aliases.
- Select the newest exact-case/bundle/catalog UI state, align safe legacy case fields with database keys, and test populated editing/conflicts for accessibility, keyboard use and mobile overflow.
- Prove wrong-workspace rejection and evaluate the exact persisted mapped draft, including fail-closed incomplete facts; correct platform-independent test cleanup.
- Preserve fixture bytes by restricting test-compiler module rewrites to actual import/export syntax. A new canonical harness gate brought the corrective command inventory to 21. Final integration also adds the retained Enterprise authority/AST-mutation gate, bringing the final inventory to 22; its protected query fingerprint is reconciled only for the reviewed additional scope validation, not weakened or removed.

Root-owned CSV/XLSX parsing now also accepts canonical package-absolute internal worksheet relationships, as shown in the Microsoft format reference, while keeping ZIP member paths, traversal, external URLs and active content rejected. Final stable-source verification must rerun after all corrective workers close; earlier evidence is not reused as proof of these changes.

### Second bounded corrective checkpoint

All 22 canonical commands passed at source digest `46993a6bc485a1b1c2238aa5b6ea9fc985c20dbc35fdae6009c078d0aff3d73d`, including the expanded 28-scenario Desktop/Pixel suite. Independent read-only reviewers then identified two remaining acceptance blockers: the resolved conflict UI did not display the exact final value, and the retained command-lifecycle test inventory omitted the five new mapping commands. Those results are therefore intermediate, not final acceptance. Both reviewers closed before the controller resumed writes.

The bounded correction now displays persisted authored/selected conflict values before Apply, exercises those paths in populated Desktop/Pixel scenarios, and extends revoked/error/reconciliation/replay coverage to all five commands using valid bound fixtures and canonical inventory exhaustiveness. Independent review accepted both corrections. Integration then fixed a disposable compiler-output discovery race and an outdated positive legacy evidence-only fixture, preserving runtime rejection of missing/old-prefixed destinations. Both bounded corrections have adversarial regression checks and independent review. Final effective source digest is `ebf0db64b06a328569044a396594c80a2429e3740a5faedaacb836c6f30028e1`; its complete 22-command matrix passed. Retained attempts, exact manifests, screenshots and external boundaries are recorded in [the local evidence report](../quality/assess-supporting-document-mapping-evidence.md). No hosted activation or real-provider testing follows from these local results.

Feature-owned commands are bound independently in `scripts/assessImportValidationContract.mjs`; exact executed results are retained in the evidence report. Required coverage includes parser limits/OOXML ambiguity/CSV quoting/cell provenance, all mapping target types and unknown-key negatives, real command/provider gateway with mocks, wrong tenant/workspace and revoked role, stale source/case/catalog, prompt injection, repeated citation values, duplicate target conflicts, preservation of manual/provenance fields, response loss/idempotent retry, canonical Assess parse/reload/evaluation and fresh/populated database upgrade.

Browser proof must exercise the actual process Assess route in Desktop and Pixel, upload multiple synthetic inputs including XLSX, review/edit/reject a suggestion, retain a manual conflict, explicitly apply, reload and observe the native field. Include keyboard, accessible labels/live errors, no serious/critical accessibility findings, no mobile overflow, unsaved-state and scope races. Browser transport mocks are disclosed and do not replace real disposable PostgreSQL proof.

Retained relevant gates: transcript/domain/API/provider mocks, Assess V2/scoring regression, migration contracts, typecheck, Edge typecheck, workflow YAML, AI boundary/static security, secret hygiene, dependency audit, build and `git diff --check`. New critical parser/mapping modules must be covered by feature-owned tests; numeric performance budgets are not invented.

Evidence records canonical commands, actual assertion outputs, source digest, fixture identity and runtime; green suite exit does not fabricate assertion PASS. Do not overwrite historical evidence or include secrets/raw document/provider content, signed URLs or live object identifiers. Test runners must use unique owned output directories and never erase protected pre-existing `.agent/` state.

## Rollout, rollback and remaining unknowns

### PostgREST transaction and operator-identity corrective continuation

Head `484ce7a7bc897180043a395254991b57a05bdbc5` passed all 18 applicable
workflows. The approved exploratory backend received migration 78, exact query
source and a content-verified draft. The browser reopened the saved manual case
but failed before upload. Actual read-only reproduction found all 32 table reads
successful and the Delivery projection RPC failing with HTTP 405 / SQLSTATE
`25006`: it is `STABLE` but takes canonical authorization locks. PostgREST runs
POST to STABLE functions in a read-only transaction. Monitor has the same source
mismatch and requires independent runtime proof.

The ignored operator harness also inferred actor identity from a login reservation
UUID rather than the actual authenticated subject. Preserve this failed
zero-upload attempt and the prior three committed effects without rewriting old
proof. Six accounts and their exact authorization state remain unchanged; no
source, provider-usage or mapping-run rows were created.

Read-only architecture and quality reviews closed before Wave 2. The controller
completed the bounded security synthesis; an additional security-reviewer spawn
hit the configured thread limit. One direct implementation worker owns the
CLI-generated successor, exact migration-tail/static contracts and populated
upgrade tests. The controller owns actual PostgREST tests, canonical CI/evidence,
documentation/provenance and ignored operator-harness correction. No reviewer
runs during this fixed workspace-write phase; descendants remain prohibited.

One atomic successor changes exactly the two public projection RPC attributes
from STABLE to VOLATILE, preserving bodies, OIDs, ownership, ACLs, security-definer
state, search path and all other metadata. Validate exact predecessor
`20260916181916`, frozen bodies, unsafe-flag/history absence and locked identity;
advance the marker/check last. No authorization-lock removal, grant, product
mutation, scoring change, client fallback or frozen-human-backend alteration.
Rollback disables effects/read-only/manual fallback with additive repair, never
destructive reversal or account reset.

Acceptance requires a canonical actual-PostgREST command in both Native Assess
(23 commands) and PR C (81 commands), with assertion-owned fixture/source proof.
Use pinned cached PostgreSQL 16/PostgREST 14.10, tmpfs data, owned isolated network
and loopback ports. Observe each old-tip failure; after migration/cache reload
prove authenticated/service POST success, volatile GET/HEAD and anon denial,
wrong scope/revocation/stale authority/actor-spoof negatives, exact unchanged
business/receipt/effect/audit digests, authority-lock serialization and owned
cleanup. Fresh/populated upgrades and migration precondition/metadata adversaries
must accompany the full retained local matrix. Green exit alone is not proof.

Before resumed hosted mutations, bind the actual Auth subject to the synthetic
account's auth_user_id and fresh tenant-session identity. Independently reconcile
the three old receipts by exact request, command, idempotency, actual actor, scope,
response hash, audit and persisted resource in a corrective addendum retaining
all original digests. Reject reservation-as-actor, wrong/missing/changed subject,
stale authority, substituted/duplicate/missing receipts or responses and wrong
scope. The subsequent five commands require eight independently bound receipts,
unchanged account-authority hashes and network observation through both signouts.

The first complete correction snapshot passed all 23 native commands and 32
Desktop/Pixel cases. Both independent final read-only reviewers then closed with
four bounded verification findings: the static contract accepted an additional
function alteration; the no-write digest omitted core authority/process tables;
the browser observer supplied a literal zero pending-response count; and the
new migration lacked its own real-database missing/duplicate/stale identity and
unsafe-flag negatives. These are corrective test/evidence changes, not additional
product scope. Earlier passing evidence remains retained, not relabelled.

The controller resumed the fixed workspace-write phase only after both reviewers
closed. One direct implementation worker owns the database negative controls and
complete per-phase no-write digest. The controller owns exact alteration-count
adversaries, actual response-completion validation, integration and this record.
No reviewer runs during writes. Rerun the full stable-source local matrix before
commit, and run the complete canonical 81-command PR C pipeline on the exact
committed head before any exploratory activation. A registry validation alone is
not execution of those 81 commands. Preserve the explicit provider-disabled and
three-human acceptance boundaries.

Executed corrective source
`a94e530883d44cba66862e1e729e42e3f6a036938d08de78091b51ef6dcf9a3d`
passes all 23 native commands, 32 Desktop/Pixel scenarios, 23 actual REST child
assertions over six no-write phases/169 governed tables, six recovery assertions,
and 48 evidence-adversary tests. The fresh/populated upgrade passes 16 rejection
cases with full rollback-state preservation. Final review additionally required
observed fixture authorization versions and an exact approved/current deployment
plan comparison; the controller implemented and tested both after reviewers
closed. Exact manifests and retained unsuccessful attempts are recorded in
`docs/quality/assess-projection-transaction-correction-evidence.md`. The broad
81-command registry will execute in exact-head CI, not be inferred from these
focused local results. No additional product scope or provider authority is added.
Final source reconciliation refreshes only the assertion registry's PostgREST
owner hash, producing fingerprint
`52a3a068304eeb302273ff49a07ef6f5afbd6663ac1810545867cc47e83c5dba`.
An exact reconstruction proves this one-field delta; commands/assertions/tests
are unchanged. Keep the original local manifests bound to their executed source,
validate current provenance separately, and require full exact-head CI for the
reconciled committed tree before exploratory activation.

After final local review, commit/push the same PR, verify new exact-head CI,
apply only the successor on the approved exploratory target, inspect installed
metadata and retry on a new exact-head draft. No new provider route/key, merge or
production action is authorized. Exact results are retained in
`docs/quality/assess-projection-transaction-correction-evidence.md`; unfinished
checks remain planned verification.

### Exact-head CI integration correction

Head `34a04fba17b43468dc84920a660af9b0257386d8` was committed and pushed to the existing PR #264 branch. Its native mapping workflow passed its 22-command gate. Across the 19 triggered workflows, 11 succeeded, seven failed and the separately gated hosted-live workflow was skipped. These are executed old-head results, not acceptance of the corrective source.

Two confirmed integration defects explain the retained failures: the mapping migration added schema without advancing the operational identity marker, and PR 1D's source checker still sought a capability in the specification after its network fixture was extracted. A third stale assumption in the creation-access PostgreSQL harness treated its own convergence migration as globally last. The correct dynamic database identity guard and the exact migration ledger remain unchanged.

The controller completed read-only architecture and quality reviews and synthesized the security boundary before this bounded write phase. Both reviewers closed. One implementation worker owns an additive CLI-generated identity migration, exact successor-tail validation, staged fresh/upgrade harnesses and migration notes. The controller owns the actual-import/symbol-based browser-fixture contract, adversarial tests, canonical command wiring, integration, provenance and release verification. No reviewer runs during implementation; no nested delegation is permitted.

The identity correction must lock exactly one known synthetic predecessor marker, prove mapping authority exists, reject unsafe environment flags and any controlled-human exercise/recovery history, then atomically advance only that marker and its exact constraint. It must not modify previously applied migration bytes, runtime authorization, feature defaults, account roles, scoring or frozen human-backend authority. The source contract must reject a missing/substituted/disconnected fixture, removed canonical capability, comment-only proof, shadowed installer and skipped retained scenario. This is static ownership proof, not executed browser assertion evidence.

Required verification: focused contract mutations, full creation-access fresh/populated-upgrade PostgreSQL with retained Pilot Operations and PR C, mapping/transcript PostgreSQL, recovery/response-loss checks, all 22 current-source mapping commands, retained PR 1D lint/browser, provenance, typechecks, build, static AI/security boundaries, secret hygiene and patch integrity. The corrected committed head then needs fresh applicable CI before any exploratory activation. Keep the current usable preview pinned while these gates run. Rollback remains feature-disabled/read-only with additive forward repair, not a destructive down-migration.

### Exploratory projection corrective checkpoint

Head `a0f914ff2f3a35359806b2a088df8b9701e9a03f` passed all 18 applicable CI workflows
before approved exploratory activation. Actual Author testing saved a manual
case but failed before upload: the relationship-review query selected a nonexistent
`created_by` column instead of canonical `reviewer_id`. The original failed
attempt and exact CI/artifact boundary are retained in
`docs/quality/assess-document-mapping-projection-correction-evidence.md`.

Both read-only architecture and quality reviewers closed before this write phase.
The controller owns the one-column production correction, full-path query-unit
regression, canonical harness wiring, active documentation, provenance and release
verification. One direct implementation worker owns the AST schema contract,
its adversarial unit tests and its retained PostgreSQL harness integration.
No schema/grant/scoring changes, descendants, account resets, provider calls or
frozen human-backend changes are authorized. Preserve the saved synthetic case.

Acceptance requires all 51 production selections to match the applied schema;
restoring `created_by` must fail independently against PostgreSQL. The full
22-command local matrix, recovery, evidence/provenance checks and fresh exact-head
CI precede replacement exploratory source deployment and the resumed real browser
journey. Compare actual command receipts and committed source/set/bundle rows,
observe the network through signout, and independently reopen on Pixel. Keep the
old failed attempt; do not label provider-disabled upload proof as AI success.

Final local source `67aaf71183553f1b3ae224d80135bba22c69c747d5aee35cb4f62743f3cf6ccd`
passed all 22 canonical commands, 32 Desktop/Pixel cases and six recovery checks.
The independent schema-guard closure review reproduced the newly rejected
substitution adversaries. Exact results and the retained intermediate failed
browser/build-overlap attempt are in the corrective evidence report above.
Commit/push, fresh exact-head CI and exploratory resumption remain the next gates.

### XLSX ingestion corrective checkpoint

The projection correction was committed and pushed as
`e3ca6930eca8b79f9f03d5178753331eac8d9124`. Its native mapping CI passed, but
the controller's final release inspection found a second **confirmed source
defect** before any replacement deployment or upload: the source-version
database trigger does not register the XLSX MIME type. The table constraints,
UI and Edge parser accept XLSX; actual receipt-backed source creation still
rejects it before extraction. Read-only inspection confirmed that installed
behavior, with zero exploratory sources and zero provider-usage rows.

Both read-only architecture and quality reviewers closed before implementation.
The controller synthesized their findings: the existing mapping PostgreSQL
fixture relabelled CSV metadata, and browser transport mocks bypassed real
source creation. Neither is proof of the missing ingestion boundary.

Wave 2 has two direct, non-recursive implementation workers with exclusive
ownership: one owns the CLI-generated
`20260916181916_assess_document_xlsx_ingestion_authority.sql`, static adversarial
contracts and the exact migration tail; the other owns real receipt-backed
PostgreSQL source creation and fresh/populated upgrade tests. The controller
owns integration, active documentation, evidence/provenance and release gates.
The fixed workspace-write profile is used only for this approved correction;
no read-only reviewer remains active during writes.

The forward migration must preserve all existing formats, source scope/storage
rules, invoker security, privileges, scoring and feature defaults. It validates
the exact predecessor marker/constraint, trigger/function and XLSX schema,
locks the synthetic identity and both controlled-human history inventories,
rejects unsafe identity/history, and atomically advances only the parser
registration, native document classification and marker/check. It must preserve both an enabled exploratory
workspace and a default-disabled fresh workspace.

Acceptance requires a real old-tip XLSX rejection with no database effects,
then actual receipt-backed XLSX create/extract/complete/replay at the new tip;
the mapping source set must use that persisted XLSX version, and an actually
applied non-conflicting proposal must bind its cell value and persisted evidence.
Unsupported MIME,
wrong scope/storage binding, forged parser metadata, stale receipt and migration
precondition mutations are negative controls. Fresh and populated upgrades,
retained formats, Pilot Operations/PR C, all 22 current-source commands and exact
head CI must pass before applying the correction to the exploratory target.
Serialize static build and browser validation to avoid shared-output interference.
Prior attempts remain historical, not relabelled current-source proof.

The real-database continuation exposed a further XLSX omission in
`enterprise_assess_v2_source_type`: creation succeeded after the trigger
correction, but native Apply rejected its document evidence. A closed read-only
downstream review found no other MIME-specific gate on this path. The controller
extends the same unapplied migration with exactly this classifier correction,
preserving its complete metadata, invoker/STRICT/IMMUTABLE semantics and all
retained formats. No third function or grant is allowed. Both old bodies are
hash-bound before either replacement, and identity advances only after both
postconditions pass. Direct classifier and evidence-builder checks accompany
full XLSX application, fresh-session native parsing and no-extra-effect replay.

The earlier negative-test helper could catch its own assertion failure. It is
replaced by `assert.rejects`, with independent tests for matching failure,
unexpected success and wrong failure. A version-only foreign-scope input is
canonically normalized by the existing source RPC; actual rejection tests now
substitute source and version scope together, and normalization has a separate
positive countercontrol. Neither fixture expectation changes product authority.

Rollback is feature disablement/read-only operation with retained source and
receipt history; never edit applied migration bytes or reset accounts/data.
The frozen human backend, real providers, production and merge remain outside
this correction. Hosted upload proof remains pending.

### Subsequent release approval

After local completion AP approved commit/push on the existing PR #264 branch, exact-head CI verification and activation in the separately approved exploratory synthetic preview. This narrow approval supersedes the implementation-only hosted-action prohibition above, but not the production, AvalaOS.com, real-provider, customer-data, merge or frozen controlled-human-backend boundaries. Keep the existing usable draft pinned until a replacement is independently verified. Confirm the exact exploratory project, installed predecessor migration and function source before any mutation; preserve existing synthetic accounts and data. Apply only the reviewed forward migration and required Edge dependencies, verify installed schema/authorization and use an immutable preview bound to the committed source. Upload/manual and missing-provider fail-closed checks may run with synthetic documents; do not invent AI success, enable real keys/routes or bypass provider authority to make analysis appear ready. If a live AI path is required, stop for separate capped-budget approval. Preserve sanitized exact-head/run/attempt/deploy evidence without rewriting the completed local report or historical human evidence. Rollback disables new effects and preserves immutable history; no destructive reset or new branch/PR is authorized.

The staged patch check found one extra blank line at EOF in the new retained `tests/browser/pr1dNetworkFixture.ts`. Only that trailing blank line was removed, with source identity checked against the completed local snapshot after accounting for this exact whitespace difference. The historical local digest/results remain unchanged, not relabelled. Release metadata and source-provenance digests are refreshed; the committed source still requires the full exact-head CI gate before hosted activation.

Rollback: disable the new native mapping feature and new effects; preserve sources, candidate/edit records, previews, receipts, lineage and immutable drafts. Continue existing manual Assess authoring where independently enabled. Repair schema with additive forward migrations, never destructive down-migrations or restored legacy unsafe apply.

At initial review Docker's Linux engine pipe was unavailable. Local PostgreSQL 16 verification subsequently used only controller-owned loopback disposable containers, not unrelated Kootha containers. Full ordered migrations, all ten mapping scenarios and exact persisted native parser/evaluator checks passed on the final source. Disposable cleanup is recorded in the evidence report. Local disks have limited free capacity; no broad cleanup/prune/move is authorized here. The existing exploratory preview does not deploy this new implementation. Live AI verification, preview activation, human acceptance, merge and production remain separate gates; real provider calls remain prohibited under the current synthetic-only boundary.

Reference formats: [Microsoft SpreadsheetML structure](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document). Migration tooling: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations). These are implementation references, not readiness evidence.
