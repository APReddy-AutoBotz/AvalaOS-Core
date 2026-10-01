# Solo-developer synthetic acceptance plan for PR #264

Status: approved by AP on 2026-09-24 for implementation and bounded synthetic
acceptance in the existing Draft PR #264. The approval adopts the PR-specific
replacement for the three-independent-human merge prerequisite. Implementation,
execution, and final evidence remain pending; approval alone is not a PASS.

## 1. Decision and outcome

AP is the sole developer and does not want to grant other developers repository
access. AP has requested a plan to simulate or waive the three-person manual
acceptance requirement so testing and subsequent work can continue.

This is feasible. Use automated acceptance with distinct synthetic application
accounts for requester/author, reviewer, and approver. One controller operates
their isolated browser sessions. Record the absence of independent human review
as an owner-approved exception for this PR's synthetic acceptance. An optional
owner usability walkthrough can supplement the result but is not a prerequisite.

No additional people, GitHub accounts, or repository collaborators are needed.
Separate application identities remain necessary to exercise the application's
existing separation-of-duties rules. Synthetic approval clicks follow predefined
test expectations; they are not AI risk decisions or approval of real work.

Implementation and execution wait for approval of this plan. That approval will
also adopt this replacement acceptance policy for PR #264; another request to
reconfirm the same waiver is unnecessary. Final merge confirmation remains the
owner's separate decision after the resulting evidence is available.

## 2. Baseline and feasibility

The last verified PR head is
`22dfbdd7470510b248375fbcaf309f33e57a99c3`, on
`controller/governed-delivery-monitor-pr-c-20260831` in the existing PR #264.
Previously recorded results include 18 successful applicable workflows, 85
canonical PR C commands, 241 assertion-owned passes, and eight explicit
`not_run` boundaries. These are prior results, not tests executed for this plan.

Source inspection confirms the three-human requirement is enforced in:

- `scripts/prCControlledHumanEvidenceContract.mjs`: three role fragments,
  three distinct signer digests, and `human_attested_plus_server_observed` evidence.
- `testing/process-lifecycle/contracts/pr-c-controlled-human-session.schema.json`:
  the human session's strict evidence shape.
- `.github/workflows/transcript-flow-pr-c.yml`: retrieval and revalidation of
  three immutable comments from distinct GitHub users before finalization.
- The governed transcript plan, controlled-human walkthrough, readiness records,
  and evidence/report consumers: the policy that makes this a merge prerequisite.

It therefore needs a small, coherent acceptance-tooling change, not merely a
documentation waiver or three comments posted by one person. The existing strict
human verifier should continue to reject simulated evidence.

The previous local coverage failure remains a failed local attempt. Disposable
diagnostics indicate Git pack creation is denied with the shared source object
directory in this restricted workspace, while a disposable destination works.
The successful CI measurement remains separately bound to its commit. Repairing
this local fixture is necessary only if it blocks required work in the new slice;
it is not a reason to repeat otherwise successful product tests.

## 3. Acceptance policy and truthful results

Add one explicit policy, scoped to PR #264 and the approved synthetic environment:
`solo-owner-synthetic-v1`. The owner decision records the PR, policy version,
permitted environment, reason for waiving independent human review, and approval
reference. Each final acceptance result binds that decision to its own commit,
preview deployment, exercise, and workflow run/attempt. It cannot be reused as a
global production waiver or applied to another PR.

Use these separate results:

| Result | Meaning |
| --- | --- |
| `SYNTHETIC-ROLE-ACCEPTANCE: passed` | Every required automated journey and server assertion passed for the same candidate and exercise, and cleanup was verified. |
| `CONTROLLED-HUMAN: not_run` | Three independent humans did not execute the human script. The policy record explains why this is not a blocking requirement for this PR. |
| Optional owner usability review | AP's own observations, if performed; never labeled independent human review. |
| Real-provider verification | A separate result per actual provider, model, operation, source, and approved campaign. Mocked output cannot pass this result. |
| Merge decision | AP's final confirmation, requested only after the adopted acceptance conditions are met. |

The readiness decision must explicitly consume the approved policy and verified
synthetic result. Leaving the old gate blocking while changing its label is not
completion. Conversely, changing the old human result to PASS, deleting assertions,
or accepting arbitrary skipped tests would give false evidence.

## 4. Minimal implementation design

Keep the work in the current substantial PR. Add no separate process-only PR,
general waiver platform, new business module, or production test bypass.

1. Add a versioned synthetic session schema and verifier, proposed as
   `testing/process-lifecycle/contracts/pr-c-synthetic-acceptance-session.schema.json`
   and `scripts/prCSyntheticAcceptanceEvidence.mjs`.
2. Reuse the canonical journey/step catalog, server action anchors, receipts,
   authorization checks, absence observations, and lifecycle controls. Share
   only neutral validation helpers where needed; avoid copying the entire human
   framework or passing machine records through a human-attestation function.
3. Add an automated browser runner and an explicitly selected synthetic workflow
   path in the existing PR C workflow. It accepts a trusted controller invocation
   and the scoped owner-policy record instead of three human PR comments.
4. Retain the original human path for future use. No environment variable,
   browser flag, or caller assertion may turn a machine session into a human one.
5. Update the canonical evidence registry, report/readiness decision, workflow
   contracts, source provenance, and active authority documents together.
   Preserve all earlier failed attempts and historical evidence.

The protected exercise ID is a stable namespace. Derive each candidate's
database exercise and fixture IDs from that namespace plus its exact exercise
digest, so a new head can seed alongside immutable deprovisioned history while
an exact retry addresses the same candidate.

Suggested existing integration points are the preparation, checkpoint, and
session tools under `scripts/*PrCControlledHuman*`,
`scripts/prCControlledHumanEvidenceContract.mjs`,
`scripts/runTranscriptFlowPrCEvidence.mjs`, the PR C registry/verifiers,
`.github/workflows/transcript-flow-pr-c.yml`, and the active governed transcript
plan and readiness records. Confirm actual consumer ownership before editing.

Prefer no database schema changes. If source inspection establishes that a
shared server primitive itself asserts human identity, add the smallest explicit
synthetic-only interface or forward migration needed to preserve that distinction.
Do not silently relabel old human rows or change production approval authority.

## 5. Accounts, environment, and execution

Use the already approved provider-free synthetic backend and PR preview after
checking their current identity and state. This plan does not select a new backend,
repurpose a provider-free marker, or authorize a new project.

- Use distinct Auth user IDs and isolated browser contexts for the three business
  roles. Reuse the existing bounded account/role provisioning where compatible.
- Keep Admin provisioning separate from the account that performs business
  actions. Normal actions use the application's real UI, authenticated clients,
  server commands, and least-privilege permissions.
- Retain denied/revoked and other-workspace/other-organization personas for negative
  checks. The same application actor must still be denied where a second actor is
  required, even though one controller operates all sessions.
- Inspect any existing exercise before reusing resources. Preserve its records;
  use the existing scoped recovery/deprovision path if required. Do not reset the
  whole database or delete unrelated users.
- Use synthetic documents and data only. During this acceptance mode, record zero
  external provider calls. Existing keyless fixtures may supply deterministic AI
  outputs only at approved test boundaries, with that origin retained in evidence.
- Reuse current preview controls and account interfaces. No new end-user permission
  bypass, production UI mode, or automatic production approval is part of this work.

The dedicated PR #264 backend resumed with the original controlled-human migration
tip and 72 applied migrations. The first protected synthetic attempt applied four
more canonical files, then stopped at an empty-history precondition. The repaired
[second attempt](https://github.com/APReddy-AutoBotz/AvalaOS-Core/actions/runs/36174691292)
applied and verified the remaining 15 migrations, including synthetic
acceptance, for the exact 91-migration repository chain. Its exercise preparation
and preview identity checks passed, but its first browser login failed before any
checkpoint because the controlled preview disabled session persistence while the
browser runner required a retained session and treated the pre-login banner as
sign-in completion. Bounded abort recovery passed, and a read-only target check
confirmed 91 applied migrations at `20260924113000`, zero live exercises, two
deprovisioned exercises, 24 banned synthetic Auth users, and zero Auth sessions.
Immutable history remains; there is no synthetic acceptance PASS. Before another
run, prove the exact target fingerprint, provider-free marker, full canonical
migration chain, no live exercise, and safe retained history. The three historical
migration guards admitted the first prior safe history before being applied;
active, unbound, or differently staged history remains rejected. Do not reset or
repurpose the backend after a partial failure.

The [third protected attempt](https://github.com/APReddy-AutoBotz/AvalaOS-Core/actions/runs/36214823362)
on exact PR head `10ac1b4c68386b8cafb1fb134ccd02a6b59282c7` passed exercise
preparation and preview identity, then failed at the first Assess browser step:
`PR_C_SYNTHETIC_BROWSER_CONTROL_COUNT:select-two-assess-transcripts`.
Bounded abort recovery and private browser-state erasure passed; no checkpoint or
synthetic acceptance result passed. Source inspection confirms a runner defect:
it looks for a nonexistent `Use in Assess` button and may navigate to Process
Catalog instead of Enterprise Intelligence > Source Library. The following
runner step also names nonexistent `Mapping Review` and `Save assessment draft`
controls; its seeded Assess case is already in review, while the candidate-review
UI selects only editable drafts. Repair the browser actions and their fixture
prerequisites together, then run focused product-backed checks before requesting
another protected exercise. Do not treat a renamed locator or a green local
catalog test as acceptance proof.

The repair candidate adds the forward migration
`20260926053818_pr_c_synthetic_studio_provider_free_fixture.sql` after the
91-migration tip. It recognizes only exact disabled, keyless, attempt-free Studio
extraction provenance in the dedicated synthetic exercise and advances that
environment's marker after checking for live exercises. The fixture supplies
separate Assess and Studio source ownership, an editable Studio transcript
draft, and a blocked Delivery recovery package so the browser can use real
controls. This is a candidate until the focused database and browser checks,
exact-head CI and preview, and a complete protected exercise pass. Rollback
disables the synthetic acceptance path and Studio source integration, retains
the forward migration and immutable exercise history, and leaves the previous
blocking disposition in place.

Focused local execution for this repair passed: PostgreSQL 16 exercised the
fresh migration, a rejected live-exercise tip advance, exact provider-free
Studio provenance, three unmatched-lineage adversarials, both seed/deprovision
cycles, retained history, and the separate revised-item decision (1/1).
Environment and evidence contracts passed 59/59; the 84-step synthetic contract
suite passed 21/21. The Studio and Delivery browser controls, including CH-07,
passed their focused Desktop Chrome and Pixel checks. These results are local
executed evidence. Exact-head CI, preview identity, and a complete protected
synthetic campaign are not run for this candidate.

AP approved one additional CH-07 synthetic observation on 2026-09-26. After
`delivery.package.revision.commit`, the Delivery author must separately arm and
accept the revised descendant through `delivery.item.review` before the
independent reviewer can approve the package. This makes the automated gate
84 steps while preserving every original 83 observation and all 14 checkpoint
identities. It changes acceptance tooling only; the server's review and approval
rules remain unchanged.

The older exercise has been deprovisioned with twelve banned synthetic accounts,
zero sessions and active memberships, and retained history. Its abort receipt
exposed a confirmed source defect: the prior completion function rejected those
deliberately retained disabled users. The synthetic forward migration narrows completion to
exactly bound, banned accounts and still rejects surviving partial pre-seed users.

The exact-head attempt after the retained-history repair was deprovisioned when
its immutable preview served an older browser exercise binding. Retrying the
preview at the same head did not create a new candidate: protected run
`36239852053` correctly rejected replay of the already deprovisioned exercise
before seeding, and recovery found no open apply authority. The browser campaign
was `not run`; no acceptance PASS exists. The next candidate verifies a
public-safe hash commitment to the preview's build-time browser binding before
synthetic preparation. It keeps the stable protected namespace and only a new
exact head receives a fresh exercise digest and database IDs.

At head `908101d338887e6a90876c8b049efd548c8037e0`, exact-head CI and the
retried preview passed. Protected run `36245370899` prepared the exercise and
verified preview identity, then stopped before the first browser journey:
the client attestation still accepted migration tip `20260924113000` while the
prepared synthetic exercise used `20260926053818`. Bounded recovery and private
browser-state cleanup succeeded. The focused repair updates the client tip and
its positive and negative tests. The remaining browser steps were `not run`;
no complete 84-step PASS exists.

At head `5c19a5f6961fc59210e67cfd0ccc4703768076a5`, all 48 applicable
exact-head checks and the retried preview passed. Protected run `36248320301`
prepared the exercise but its first Assess browser step failed; later steps were
`not run`. The deployed nonproduction Enterprise Intelligence query still
selected retired
`created_by`, while this branch and the migrated database require `reviewer_id`.
Bounded recovery and private-state cleanup passed. The dedicated project query
function was updated from this branch and read back with the correct selector.
An exact-head retry (`36249231411`) was rejected during preparation because the
prior deprovisioned exercise already owns that digest; no live exercise or
unbanned synthetic user remains. A fresh candidate is required. The browser
runner now reports an unavailable Assess projection by safe code. No complete
84-step PASS exists.

At head `7a8e71fccf174ecde6f53ca791576b57740a12c9`, all 48 exact-head
checks and its preview passed. Protected run `36252725081` prepared the exercise
and reached CH-01, then rejected the Assess page route while recording the
manual-fields browser artifact. The product navigation query includes
identifier-bearing keys and mixed-case key names; the evidence route admits
only a safe lowercase route. Bounded recovery and private-state cleanup passed;
the dedicated target has no live exercise or unbanned synthetic user. The
focused repair retains only the non-identifying `view` and `scope` navigation
fields in browser evidence. Later steps were `not run`; no complete 84-step
PASS exists.

At head `8a4a0cb8bfff3d7cef1cd92b015ced43ec9b6c8a`, all 48 exact-head
checks and the exact preview passed. Protected run `36256085515` passed
preparation, then the active browser phase timed out waiting
for a locator. The runner's generic error did not identify the catalog step or
control, so the precise UI cause remains a suspected defect requiring deeper
validation. Bounded recovery and private-state cleanup passed; the dedicated
target again has no live exercise or unbanned synthetic user. The next candidate
adds safe checkpoint, step, and control codes to the failure boundary without
publishing page text or identifiers. Later steps were `not run`; no complete
84-step PASS exists.

At head `6226637b72a52d1b044993726b3964d7473a554d`, all 48 exact-head
checks and the exact preview passed. Protected run `36259628158` completed
preparation and the first two CH-01 browser steps, then failed while waiting
for a reviewed candidate's preview checkbox. Bounded recovery and private-state
cleanup passed; the dedicated target has no live exercise or unbanned synthetic
user. The production query omitted the extraction binding's `source_set_id`
even though the candidate and run projections require it for exact lineage.
The focused repair loads that field and scopes preview conflicts to the
selected Assess case and immutable bundle, so a conflict from the separately
seeded case cannot attach to the browser-created draft. Remaining steps were
`not run`; no complete 84-step PASS exists.

At head `3bce70ac6738bae793f953fc243cb702323d176b`, the exact preview
and focused query, synthetic, static, and provenance checks passed. The first
CI attempt for `synthetic-local-feature` was stopped by a Docker image rate
limit. Its retry reached the source inventory harness and found that the
reviewed selected-column hash had not advanced with `source_set_id`; no
protected synthetic run was dispatched. The inventory was reviewed at 66
unchanged query sites with only that added column, and the focused harness now
passes all 78 tests. The full 84-step hosted outcome remains `not run` for
this head.

At head `4a82554dc606dcd6f8cfec33b6e2eee5d32a27f8`, all 48 exact-head
checks and the exact preview passed. Protected run `36286264339` completed
preparation and reached the third CH-01 browser step, but no Assess preview or
material conflict appeared. Bounded recovery and private-state cleanup passed;
read-only inspection found the exercise deprovisioned, zero unbanned synthetic
users, zero apply previews, and zero server step observations. Nonproduction
function metadata showed no preview command request in the failure window. The
controlled client rejected the prerequisite preview before transport because
it only admitted anchored observer actions. The focused repair admits only
unarmed, backend-attested Assess preview and apply prerequisites; observed
actions remain separately anchored. Two preliminary browser interactions ran,
but none of the 84 steps has final verified acceptance evidence. The failed
third step and 81 later steps remain unverified; no complete 84-step PASS exists.

At head `1ad240bd21b6e63cd38dab903673822db722f619`, all 48 exact-head
checks and the exact preview passed. Protected run `36291775105` completed
preparation and reached the same CH-01 step. The Assess preview now reached
the server and created one preview batch and one exact-case material conflict,
but the browser stopped before any server action anchor. Its generic
`BROWSER_ERROR` obscured whether the conflict-count assertion or evidence-panel
interaction failed. Bounded recovery and deprovisioning passed; read-only
inspection found zero live exercises, zero unbanned synthetic users, and zero
observed steps. The focused browser repair preserves safe assertion codes
through Node's multiline assertion format and opens the evidence panel only
when closed, with explicit safe arm-stage failures. The full 84-step outcome
remains `not run` for the repaired head.

At head `6b3fcec4f32da25eb84c9d8c5573053e50cbe84d`, all 48 exact-head
checks and the matching preview passed. Protected run `36296808203` again
reached CH-01 after preparation and the exact Assess preview, then reported
`PR_C_SYNTHETIC_BROWSER_ARM_STEP_MISSING` before any server action anchor.
The requester contract exists in the seeded exercise, but the browser sent no
step-list RPC after preview. A root-path binding hypothesis was tested at head
`66266d8322fe675dfdf45018265fbabfdb8c236c`; preview browser QA rejected
it because the unauthenticated public CTA made one attestation request. The
root allowance is reverted. The next candidate reports only safe route and
refresh/option failure classes at this step, so the cause can be identified
without page text, raw requests, or identifiers. Bounded recovery and
deprovisioning passed: zero live exercises and zero unbanned synthetic users
remain. No full 84-step PASS exists; the new head needs exact-head CI, preview,
and a fresh protected retest.

At head `ef4b7594110ce8c4603ffde187f0e249b2823fbc`, exact-head governed CI
and the matching preview passed. Protected run `36301856823` completed
preparation and reached the third CH-01 browser step, then reported
`PR_C_SYNTHETIC_BROWSER_ARM_STEP_MISSING_OPTION_ABSENT_SIGN_IN`. The retained
exercise has the exact requester step contract, requester persona binding, and
eight eligible requester options, but no action anchor or observed step. A
focused local Playwright check confirmed that the runner's non-exact
`getByLabel('Controlled-human evidence step')` matches both the next-step and
completed-step selects. The runner now selects the exact next-step label;
rollback is the one-line locator revert. Recovery and private-state cleanup
passed, leaving zero live exercises and zero unbanned synthetic users. The
repaired head still needs exact-head CI, preview, and the full protected retest;
no 84-step PASS exists.

Protected GitHub Environment approvals may still require AP's own approval click.
That is an existing platform access control, not a requirement to invite other
developers. The controller should prepare each concrete run before asking for
that click and request a credential only when an approved operation needs it.
During the initial read-only inspection, check actual required PR reviews and
Environment self-review settings for compatibility with owner operation. Those
settings were not inspected for this plan. If they need a configuration change,
present the exact owner-controlled setting and its scope before changing it;
do not treat an application evidence policy as a change to GitHub permissions.

## 6. Journeys to execute after implementation

Preserve the eight canonical journeys and all fourteen checkpoint scenarios.
Keep their existing scenario identities for traceability, while labeling the
executor and resulting evidence as automated. Every former human-only observation
must have an explicit observable browser assertion or remain honestly untested;
there must be no blanket conversion of human attestations into automated PASS.

| Journey | Required automated observations |
| --- | --- |
| Assess only | Upload/select two or more supported synthetic sources, map fields using the declared test provider, edit/reject suggestions, complete manual fields, resolve conflicts, save/reload, evaluate unchanged deterministic logic, perform role-owned decisions, decline Studio handoff, and verify no downstream resource. |
| Studio only | Select sources independently from Assess, lock the exact bundle, review extraction, choose a supported/custom template, generate deterministic fixture output through the test path, edit/save/reload, review/approve through distinct accounts, and stop before Delivery. |
| Assess with different Studio sources | Complete and consume the approved Assess handoff; select disjoint Studio supplements; verify exact source/version ancestry through document generation, editing, review, and approval. |
| Full governed flow | Execute request, changes-requested/rejection, fresh review/approval and consumption; inspect/edit/accept/reject Delivery proposals; revise selected items; approve the package; create/replay the exact read-only Monitor baseline. |
| Direct planning | Studio to Delivery to Monitor retains the visible planning-only/unassessed classification and its distinct source ancestry. |
| Direct Delivery | Create a manual package, perform independent application-role review/approval, and inspect the resulting read-only Monitor baseline. |
| Negative boundaries | Attempt same-actor approval, revoked/stale authority, cross-workspace/cross-organization access, rejected handoff, and unsupported input; assert the expected denial and zero unintended downstream effects. |
| Recovery and usability | Exercise response loss and replay, source changes, stale versions, reload, read-only transition, keyboard use, 200% zoom, error focus/input preservation, and Desktop/Pixel layouts. |

Use existing synthetic transcript/SOP/spreadsheet fixtures where available.
Exercise documented upload formats and their unsupported-file behavior; do not
expand parser scope. Inventory the actual template catalog first: PDD/BRD/FRD and
SDD or other requested templates are tested only where currently supported or
explicitly configured as valid custom templates. Missing functionality is a
finding, not an automatically authorized new feature.

Record the supported Delivery states and transitions. Monitor currently represents
an approved, read-only planning baseline; task execution, live telemetry, and
external tracker synchronization are separate product capabilities.

## 7. Evidence, failure handling, and cleanup

The machine session must contain the execution kind, owner-policy digest, commit
and governed source identity, deployment/exercise/tenant/workspace bindings,
actual role and session identity digests, canonical command, workflow run/attempt,
fixture/source/template versions, per-step assertions and timestamps, causal
server proofs, denied-action/absence proofs, and cleanup results.

Generate assertions from actual browser/server outcomes. A green process exit,
expected fixture values alone, or an aggregate suite result cannot synthesize
missing steps. Browser/API observations must cover the complete workflow through
sign-out and teardown. Retain safe screenshots or projections where useful,
without credentials, raw provider payloads, signed URLs, or sensitive identifiers.

Keep the current ordering: prepare -> execute active steps -> quiesce -> observe
read-only state -> verify evidence -> deprovision -> independently verify cleanup.
Automate formerly manual evidence copying. Machine observations have machine
provenance; they never claim a person perceived or approved the result.

Retain each failed attempt. Classify application defects separately from test
harness/environment failures, fix demonstrated issues within scope, and retest
the affected behavior. Never substitute an unrelated successful action for a
failed step. The final passing session must refer to one unchanged candidate and
exercise; do not combine outcomes across source changes into a session PASS.

If execution fails, preserve immutable history, quiesce the owned exercise where
possible, use bounded recovery, and report any cleanup failure. A source rollback
disables the new synthetic acceptance mode and restores the previous blocking
disposition; it must not manufacture human approval or erase evidence.

## 8. Proportionate verification plan

Do no testing while reviewing this plan. After approval:

1. Complete the repository-required read-only architecture, security, and quality
   findings before implementation. The root controller owns integration; use
   direct subagents only for useful independent work, at most four total agents,
   without descendants. These agent reviews are not human acceptance.
2. Implement the policy, evidence contract, runner, workflow, and active documents
   as one coherent change in PR #264. Assign exclusive ownership if workers help.
3. Run focused positive and adversarial checks for changed acceptance logic:
   wrong/absent policy, wrong PR/target/head/run attempt, skipped assertions under
   green exit, reused role identity, fabricated source/server proof, incomplete
   persona coverage, post-observer egress, accepted-versus-denied confusion,
   cleanup failure, and synthetic-to-human evidence substitution.
4. Run focused browser/server checks during repair. Broaden testing only when a
   change or finding affects another boundary. Do not rerun the full platform for
   every small edit.
5. Once stable, perform the required final validation and one complete automated
   journey campaign for the final candidate. Reuse source-compatible existing
   utilities and fixtures, not historical results labeled as a new execution.
6. When the approved implementation is committed and pushed on the same branch,
   verify the required CI and preview checks on that commit and the independently
   validated acceptance artifact. Let required CI run normally; do not disable
   checks to save time or rerun successful jobs without a new reason.

Preserve the stash, unrelated marketing/tools/.agent state, and the pre-existing
recovery-script edit. Inspect `git status --short` and the intended staged files
before every future commit.

## 9. What this unblocks, and what remains separate

When the new automated gate passes, lack of two external reviewers stops being a
blocker for PR #264's synthetic acceptance. The controller can present the tested
candidate and its limitations for AP's final merge confirmation. Approval of this
plan does not itself merge, publish, or deploy production.

The joined hosted Assess -> Studio path still needs its own real generated
document proof; the separately generated manual-brief BRD is a different journey.
Provider-free automation can verify the joined mechanics but cannot establish
live AI output quality. The prior AI campaign expired; the latest recorded
conservative total is USD 3.6980752 against the original USD 10 cap. Any later paid
verification needs a valid bounded campaign while preserving all prior charges
and operation limits. This plan neither renews that campaign nor spends money.

No external testers are required for that separate AI campaign either. Provider
and template results should be reported individually. OpenAI proof cannot stand
for untested Claude/Gemini/Groq or arbitrary BYOK providers.

## 10. Completion and owner involvement

The implementation is complete when all eight automated journeys and fourteen
checkpoint scenarios have valid per-step results, material defects are fixed and
retested, cleanup passes, the policy consumer accepts only the scoped synthetic
evidence, and the final commit's required CI/preview checks pass. Active documents
and the PR must state that independent human acceptance was waived by the owner.

AP's involvement is limited to approving this plan, any protected Environment
approval that actually appears, supplying/replacing an unavailable credential only
if needed, and final merge confirmation. Personal usability testing is optional.
No invitation of other developers or sharing of repository access is required.

## 11. Current repair evidence (2026-09-27)

Run 36313110606 passed preparation and preview verification, then failed at the
enabled Assess apply control after conflict resolution and proof collection.
Recovery and private-state cleanup succeeded. The complete synthetic result is
still not passed; later catalog steps remain unverified.

A focused local test using the real evidence banner, Assess candidate component,
and application CSS confirmed that expanded proof blocks reduced usable workspace
height to zero. The correction bounds the evidence panel to 40% of viewport height
with its own scrollbar. The focused browser-runner suite passes 11/11, including
proof collection and ordinary Assess apply clicks on desktop and mobile. This is
local layout evidence; the exact-candidate hosted journey must still verify whether
it resolves the recorded click timeout and complete all 84 catalog steps.

Rollback is the two-class banner change plus its focused test/provenance update.
While hosted acceptance is incomplete, keep merge blocked; collapsing the evidence
panel restores workspace space without changing server state or evidence authority.

Run 36316955657 subsequently completed Assess Apply and displayed its confirmation,
then failed at Decision Pack finalization. Recovery and private-state cleanup both
succeeded. Read-only inspection of the recovered exercise confirmed the authored
draft contained two evidence items, one with no claim links, and no finalization
receipt. The runner had omitted the required authoring of the imported evidence;
the application's finalization block was correct.

The runner now links the imported evidence, saves a new immutable version, and
checks the links survive reload before finalizing. The manually authored synthetic
evidence covers the scaffold's decision trace, including explicitly unknown facts;
it does not promote unknown values or change scoring. The separate reviewer
attests both submitted evidence items before attempting approval. The focused local
suite passes 13/13 checks, covering that sequence; a real evaluator check confirms material claim
coverage and preserves unknown agent facts and provisional author confidence.
These are local checks, not a completed hosted campaign. All 84 steps still require
one passing exact-candidate run. Rollback reverts this runner/test change and its
provenance entry; retain the merge block and recovered exercise history.

Candidate 26c5ce1's Pilot Acceptance CI caught an overly restrictive shared helper:
ordinary finalization was incorrectly required to have post-Apply evidence. The
post-Apply preparation is now explicitly selected by the hosted transcript path;
ordinary finalization retains its existing behavior. Six focused real-component
browser scenarios pass across desktop and Pixel 7, including immutable post-Apply
evidence save/reload and one committed finalization. The runner suite remains
13/13 passed. No hosted campaign was dispatched for the rejected CI candidate.

Candidate 9af9131 passed 17 applicable workflows, including Pilot Acceptance, but
governed CI exposed a pre-existing nondeterministic selector in the disposable
PostgreSQL test. Ordering all planning artifacts by UUID could select a newly
created source-only draft with no content version. The test now selects the exact
seeded planning artifact and source package and asserts its approved content
exists. The affected PostgreSQL 16 test passes locally, including both complete
seed/deprovision cycles and retained-history verification. This changes test
selection only; no application authorization or readiness rule changes.

Run 36322582266 completed transcript Apply, claim-linked authoring, and Decision
Pack finalization, then failed at reviewer assignment. The recovered database
contained the new reviewer-ready decision and no assignment for that case.
Recovery and private-state cleanup passed. The runner incorrectly attempted
assignment in the requester session, which has no `assess.v2.review` capability.
Assignment now runs in the existing independent `studio_reviewer` session before
its evidence attestations and approval; persona capabilities and server rules are
unchanged. Six real-component review scenarios pass across desktop and Pixel 7,
including the exact requester denial and reviewer assignment-to-approval path.
All 13 focused runner checks and the AI boundary scan pass. Full exact-candidate
hosted acceptance remains pending. Rollback reverts the orchestration/test change
and its provenance entries, retaining immutable history and the merge block.

Candidate a7f0e53 passed 17 applicable workflows and its bound preview, but
governed CI rejected the disposable PostgreSQL observation fixture before any
hosted run was dispatched. A freshly committed Studio setup write could share
the observation start's millisecond: PostgreSQL preserves microseconds while
the JavaScript driver truncates them. The test now observes the current server
clock and waits beyond that millisecond before starting the inclusive absence
interval. It still queries and rejects actual interval activity. The focused
PostgreSQL 16 test passes both complete seed/deprovision cycles, retained history,
and the deliberate in-interval attempt injection rejection. This is a test-only
timing correction; production observation and acceptance rules are unchanged.
Rollback reverts the test and its provenance entry; hosted acceptance and merge
remain blocked until complete exact-candidate evidence passes.

Run 36326878596 progressed through Assess review and approval, then failed at
CH-02's structured Studio edit. Recovery and private-state cleanup passed.
Read-only inspection confirmed one draft with the expected synthetic title and
two-section content. A real-component reproduction with generic index labels
and delayed artifact responses confirmed the runner counted retained editor
content as a match for the next selected document before its reload completed.
The runner now waits for the exact selected artifact and usable workspace before
inspecting its content, for both direct and hybrid document selection. It also
waits for the exact reviewer option before assignment. Six focused desktop and
Pixel 7 scenarios pass, including immutable edit/submission, selection after a
full reload, delayed reviewer discovery, and rejection of genuinely duplicated
document matches. No application permission, server authority, or acceptance
rule changes. Rollback reverts these runner/test changes and their provenance;
the full 84-step exact-candidate hosted campaign and merge remain pending.

Run 36332397332 passed preparation and preview verification, then stopped at
CH-02's edit confirmation. Recovery and private-state cleanup succeeded. Bounded
read-only inspection found no draft-revision receipt or Studio command invocation.
The confirmed source defect was the client's unconditional capture pre-anchor:
CH-02's browser-only draft preparation has no command anchor, so revision was
rejected before transport. The client now leaves only draft revision, submission,
and reviewer assignment on their ordinary server-authorized command path. Review,
approval, and generation retain their existing capture requirements.

A focused client test first reproduced `RUNTIME_CONTROLLED_HUMAN_PREANCHOR_REQUIRED`
on the old implementation. It now passes all three prerequisites, preserved server
permission denials and version/idempotency fields, unarmed decision rejection, and
anchored independent review/approval completion. Six existing real-component
desktop/Pixel edit, submission, assignment, reload, and selection scenarios pass;
TypeScript also passes. These are local executed evidence, not full hosted PASS.
Rollback reverts the client correction and its focused test/provenance entries;
retain the failed exercise history and merge block until all 84 steps pass on one
exact candidate.

The next protected dispatch is held while the remaining runner sequence is
repaired as one implementation change. Read-only architecture, security, and
quality findings confirmed missing generation selection, independent lifecycle
prerequisites, complete-set decisions, unavailable replay/denial controls, and
observations that incorrectly assumed an empty seeded workspace. The approved
catalog remains 84 steps with 43 server-bound actions.

The runner uses exact captured command identities and ordinary authenticated
public APIs for the approved prerequisites between catalog observations. It
retains final positive catalog decisions in the UI and uses the existing server
anchor/completion protocol for replay and negative attempts. CH-10 still creates
a source-only draft separately from the canonical seeded approved PDD handoff;
its planning package receives an ordinary, independently authorized Monitor
baseline before the exact Monitor observation. No catalog, persona capability,
production authorization, migration, score, or provider permission is changed.

CH-07's Delivery reviewer observes the blocked package and unavailable Monitor
boundary; a separately identified authorized Monitor session provides the
supplementary unchanged-baseline read. CH-11's approver verifies manual Delivery
lineage, and its Monitor-only viewer observes that exact package's baseline.
After quiescence, the Monitor-only viewer verifies retained immutable baseline
versions and absent mutation authority without requesting Delivery privileges.
The recovery step drops one confirmed committed response and checks the normal
client's same-idempotency retry, rather than labeling an ordinary success as
response loss. Opaque selectors and response bodies stay in private runner
memory; published observations contain bounded labels, counts, and digests.

Executed local evidence: all 51 feature-owned synthetic acceptance checks pass,
including the real-browser response-loss route; all 14 affected real-component
scenarios pass across Desktop Chrome and Pixel 7. The disposable PostgreSQL 16
test passes both full seed/deprovision cycles, the 12-persona authority-version
map, and the actual Studio/Delivery prerequisite command/projection paths. Its
raw handoff, item-version, review-state, and pre-approval count mismatches were
corrected in the runner adapter. The 29 focused environment checks, TypeScript,
AI boundary scan, and diff checks also pass. The full protected exact-candidate
campaign remains pending. Rollback reverts
the runner helpers, tests, verification metadata, and provenance together. Keep
the protected run and merge blocked on any failed prerequisite, ambiguous
command outcome, proof mismatch, or incomplete campaign; preserve immutable
exercise history and use the existing recovery/deprovision workflow.

CI additionally caught unclassified dummy hosted-URL and session-storage
fixtures in the new runner tests. The response-loss tests now use a reserved
`.invalid` origin, the API shape test derives its dummy project name, and the
existing exact synthetic-auth storage classification includes that test file.
The secret-hygiene scan passes with zero forbidden hits; all eight affected
API/response-loss checks pass. Runtime secret rejection remains unchanged.

Run 36343457705 passed preparation and exact-preview verification, then failed
at CH-02's edit confirmation. Recovery and private-state cleanup succeeded.
Bounded read-only inspection confirmed one committed draft revision with valid
two-section content and no post-command projection reload. The deployed Studio
handler used bare JSON responses without CORS, while the reviewed candidate
uses the shared CORS response helper. The browser could send the write but could
not read its committed response. This is confirmed deployed-source drift; prior
deployment metadata checks did not prove equality with the candidate source.

The runner now performs an authenticated empty-envelope Studio request before
any catalog business action. It must receive a readable 400 `INVALID_COMMAND`
with `failed_before_commit`; network/CORS failures and unexpected success stop
the campaign immediately. The probe supplies no command selectors and cannot
be counted as command evidence. A native-browser local check verifies that CORS
permits the rejected response without exposing the allow-origin header to
JavaScript, and that missing CORS stops the probe. All 54 feature-owned synthetic
checks pass, including eight focused API checks. Secret hygiene, AI boundary,
diff integrity, and the 85-command/241-assertion provenance contract also pass.

Read-only source comparison identified eight stale functions in the existing
synthetic deployment allowlist; the query function already matches. Their exact
reviewed import graphs and a bounded replacement plan received AP's explicit
deployment approval after the initial automatic approval rejection. All eight
functions were deployed to the approved synthetic project; every downloaded
source file matches the reviewed graph and all eight retain JWT verification.
An actual browser on the PR preview read Studio's 401 `AUTHENTICATION_REQUIRED`
response with `failed_before_commit` using an empty request and the existing
public anonymous key. This proves cross-origin rejection readability without
performing a business command. The authenticated 400 preflight and complete
catalog still require a fresh exact-candidate campaign. Provider settings,
schema, credentials, and immutable exercise history were not changed.
Rollback reverts the preflight/test/provenance change together; the
safe fallback retains the merge block and inactive exercise rather than retrying
business commands against an unverified backend. Full synthetic acceptance is
not passed; original `CONTROLLED-HUMAN` remains `not_run`.

Run 36351581753 passed the authenticated Studio transport preflight and committed
both CH-02 draft revision and review submission. Both projection reloads and
eligible-reviewer queries succeeded. The next timeout was a confirmed runner
contract defect: it expected the profile full-name label, while the Studio RPC
intentionally displays email (actor-ID fallback). Assignment never started.
Recovery and private-state cleanup passed; no active exercise remains.

The runner now obtains the reviewer actor ID from the authenticated synthetic
reviewer session, verifies the requester and reviewer share organization and
workspace and are distinct actors, then selects exactly one eligible option by
that ID. The ID stays private and is not added to published observations or error
messages. Missing or duplicate matches fail closed before assignment. The server
retains its capability, current-authorization, and separation-of-duty checks.
The separate Assess reviewer-label contract remains unchanged.

A production-shaped email-label browser case reproduced the old selector timeout
before the correction. All 12 focused real-component scenarios now pass across
Desktop Chrome and Pixel 7, including duplicate display labels, missing and
duplicate actor options, edit/submission/assignment, and delayed projection reads.
All 55 feature-owned synthetic runner checks and the secret/AI boundary scans
pass. No product SQL, capability, provider, or deployed function change is needed.
Exact-candidate CI, preview, and the full 84-step hosted campaign remain planned
verification. Rollback reverts the runner/helper, focused tests, and provenance
together; keep merge blocked and preserve recovered immutable exercise history
until the complete campaign and independent cleanup proof pass.

CI rejected intermediate candidate 874d429 because TypeScript did not infer the
new JavaScript destructured reviewer option without a default. An empty-string
default restores the caller type while the existing UUID guard still rejects
omitted identities before any action. The repository typecheck passes. Obsolete
unfinished CI runs were cancelled; no protected campaign ran for that candidate.

Run 36358818202 on head 064bb76 passed CH-02 and reached CH-03's exact approved
Assess handoff observation. Its identity, source version, label, and eligible
state checks passed. The runner then incorrectly required a disabled request
button. Canonical server projection omits that action for the Studio approver,
and the component correctly renders no request control. This is a confirmed
runner/fixture contract defect, not a missing handoff or authorization defect.
Recovery and private-state cleanup passed; a bounded read confirmed zero active
exercises and the current candidate's exercise deprovisioned.

The helper now requires zero request controls while retaining every exact
handoff/card/version/state check. The local component fixture derives eligible
request actions from the actor's capability, matching the server contract. The
production-shaped fixture reproduced the original failure before correction.
All 14 focused Desktop/Pixel scenarios pass: approver observation, authorized
requester action, rejection of enabled or disabled leaked controls, and rejection
of wrong identities, wrong versions, and duplicate exact cards. All 55 synthetic
runner checks and TypeScript pass. No schema, capability, component, provider, or
deployed-function change is needed. Current-candidate CI, preview, and the full
84-step protected campaign remain planned verification. Rollback reverts the
helper, fixture, focused cases, and provenance together; retain the merge block
and recovered immutable history until the complete campaign and cleanup verify.

### Remaining-sequence repair after run 36367630313 (2026-09-28)

Run 36367630313 on head 0ac2b59 passed the prior CH-02/CH-03 corrections,
then failed at CH-03 bundle selection. The runner inferred bundle identity by
sampling an unrelated Create-package button while changing a controlled select.
The sanitized failure does not establish whether it counted zero or multiple
eligible options. Bounded recovery and private-state cleanup passed; the current
exercise is deprovisioned and no active exercise remains.

The read-only architecture, security, and quality reviewers completed before
implementation resumed. Their remaining-sequence audit established additional
runner defects: the supplemental source labels did not identify the covered
CH-02 bundle; CH-06/07 did not bind every actionable item to the complete
canonical package; CH-09's legacy observation opened the wrong Monitor surface;
and two CH-14 observations used a Monitor-only actor on Delivery. CH-10 created
a fresh BRD package, then handed off a different preseeded PDD, which could not
prove the intended direct Studio → Delivery → Monitor path.

The coherent repair binds source selection to the authenticated workspace-v2
projection of the approved CH-02 artifact, carries exact handoff/artifact/item/
baseline identities between steps, explicitly creates a PDD, and generates,
independently reviews, and independently approves that same new PDD before
handoff. The full governed journey retains its separately seeded exact assessed
BRD; it is not represented as a continuation of the hybrid journey. CH-07 accepts
the carried proposals only after the real UI accepts the exact revised item.
The catalog remains 84 steps and 43 server-bound actions. Monitor observations
use the authorized Monitor surface; a separately identified Delivery-author read
proves the exact item's textual decision and citation.

Forward migration `20260928060000_pr_c_synthetic_direct_planning_generation.sql`
adds a provider-free CH-10 generation contract bound to the completed exact
source-package catalog action. It requires the active exercise, requester,
current source-only direct PDD, exact bundle and source manifests, and no Assess
ancestry. It preserves the existing CH-03 generation contract and normal
independent approval commands. The exact synthetic migration tip advances with
its preflight, evidence, and fresh-chain consumers. No scoring or production
approval rule changes. Component changes expose existing resource identities
as DOM attributes for exact control selection.

Focused verification covers multiple locked bundles, disabled unrelated create
controls, wrong immutable source versions, fresh BRD-to-PDD selection, full
250-item/three-page editing and recovery, retained resource mismatches, distinct
review/approval actors, and exact migration-state admission. The larger fixture
also exposed and corrected a pagination readiness race and a retained-filter
error before another hosted attempt. Executed results are recorded below after
the checks finish; hosted acceptance remains `not_run` for this new candidate.

Rollback/read-only fallback: revert the runner, helper, fixture, and evidence
changes together before deployment. After migration, retain immutable history
and use a forward correction; disable synthetic generation or Studio mutations
if its verification fails. Do not downgrade the migration identity or substitute
the seeded PDD. Refresh only the changed synthetic-generation Edge bundle from
the verified candidate before exercising the new contract. Keep provider calls
off, merge blocked, and original `CONTROLLED-HUMAN` at `not_run` until full
same-candidate acceptance and cleanup pass.

Executed local evidence for this repair: 63/63 synthetic acceptance checks,
16/16 generation-boundary checks, 11/11 migration/tail checks, 6/6 focused Studio
Desktop/Pixel cases, and 8/8 focused Delivery/Monitor Desktop/Pixel cases passed.
The disposable PostgreSQL 16 migration/lifecycle test passed without a skip:
the new PDD followed submit, independent assignment/review/approval, and Delivery
consumption with the same artifact/version/source-package identities. Wrong
scope, stale state, wrong catalog binding, wrong created identity, and Assess
ancestry substitutions were rejected. TypeScript passed. No broad local
regression run was used; required exact-candidate CI remains separate evidence.

Final seed reconciliation found that the earlier runner hardcoded the separate
250-item stress fixture into the hosted journey, while the actual seeded BRD
had one section. The catalog and controlled walkthrough require the complete
bounded set, without a 250-item hosted minimum. Canonical Studio content allows
at most 100 sections, and Delivery derives one proposal per section. Expanding
that product limit solely for the runner would be an unnecessary scope change.
The hosted fixture now declares three distinct assessed sections, and the runner
requires exact equality between that manifest count, the public complete package,
and every fresh item-decision transition. The existing 250-item/three-page stress
cases remain intact. All 84 steps and 43 catalog actions are retained.

AP explicitly approved the count correction after automatic approval review
interpreted the old hardcoded 250 as a required gate. The prerequisite must bind
the retained canonical count to the complete package and every state transition;
the separate 250-item stress cases remain required. The latest focused rerun passed all
63 synthetic checks, all four affected Desktop/Pixel 250-item cases, and
TypeScript. The new three-item public seed/handoff proof passed its focused PostgreSQL 16
run without skips (1/1, 84.37 seconds): initial public eligibility, independent
review/approval/consumption, exact three-item content and source identity, and
complete public package projection all matched. The direct PDD remained one
section. This closes the seed-to-public-handoff proof gap; hosted acceptance
remains planned verification until the complete new-candidate campaign passes.

Final approved integration: CH-06/07 retain the complete canonical aggregate-ID
set and require exact membership before and after decisions, as well as the
manifest-bound item count. Missing, duplicate, substituted, or count-mismatched
sets fail before any item decision. The focused prerequisite checks pass 19/19,
including three-item hosted cases, retained 250-item cases, and pre-write count
and identity denials. The integrated synthetic suite passes 69/69 and TypeScript
passes. All 84 catalog steps and 43 server-bound actions remain unchanged.

Exact-candidate CI for d6ba755 found an Edge-only TypeScript literal widening
and a renewal-test tail assertion that omitted the preceding synthetic fixture
migration. The shared base command now has its explicit type, and the tail lists
both canonical migrations. Edge TypeScript passes; the isolated renewal
PostgreSQL test passes all eight causal assertions. PR C CI separately stopped
on Docker Hub `toomanyrequests: Data limit exceeded` before executing its suite.
No hosted synthetic campaign ran for this candidate. Corrected-candidate CI
and preview remain required.

The subsequent PR C gate on f104127 exposed the same tail-offset issue in the
Studio populated-upgrade fixture: its fixed slice applied the Studio migration
before inserting legacy bindings, correctly triggering the new owner guard.
The harness now locates the named feature migration, seeds legacy data before
that boundary, and applies every canonical successor afterward. The isolated
PostgreSQL reproduction failed with the old ordering and passes both causal
Studio assertions after correction. Preview QA separately passed 11/12 cases
but timed out in the Desktop malformed-attestation case; no assertion was
weakened or timeout increased. Corrected-head preview QA remains required.

On c29baf2, governed and creation-access browser CI exposed an inconsistent
approved test fixture: it advertised one accepted item while retaining an
incomplete page of proposed items. The new fail-closed baseline builder
correctly rejected that fixture. The approved fixture now contains its complete
one-item accepted milestone DTO. All four failed Desktop/Pixel cases were
reproduced and then passed, together with both full 250-item sequence cases
(6/6). Preview QA's read-only fetch timeout was separately reproduced as a
network-failure outcome; its exact malformed-attestation scenario passed
unchanged on Desktop and Pixel against the canonical hosted preview (2/2).
No preview assertion, network guard, or timeout was weakened. The remaining
15 applicable c29baf2 workflows passed; new-head CI still governs acceptance.

On 8102294, all 17 other applicable workflows passed, including preview QA and
creation access. PR C failed the new three-item PostgreSQL projection assertion:
public pagination orders aggregate identities while the expected rows were
ordered by source-section locator. The assertion now compares complete content
membership in the same locator order, retaining all exact count, identity, and
complete-page checks. The local controlled-human source gate passed 150/150
tests without skips, including real PostgreSQL; generation checks passed 16/16
and coverage-runner checks 11/11. Banner and workflow checks also passed.

The later instrumented local coverage stage did not pass: 220/237 tests passed,
with 17 blocked by the shared Git-fixture startup hook. A bounded setup-only
reproduction identified Git's temporary pack-file rename error, `Improper link`,
on this Windows filesystem. No fixture or coverage guard was weakened. This is
not passing coverage evidence; corrected-head CI must execute and verify the
complete gate. No hosted synthetic campaign ran for these candidates.

Run 36391979894 on a36361d passed the exact preview and migration gates but
stopped before exercise preparation with `PR_C_CONTROLLED_HUMAN_HISTORY_REJECTED`.
The current tip advanced to 20260928060000 while the controller's retained-history
allowlist omitted its predecessor, 20260926053818. Twenty deprovisioned exercises
still correctly retain that predecessor. This is a confirmed source compatibility
defect; fresh-chain CI had not covered that historical transition.

The controller now explicitly accepts that predecessor only as retained history.
The focused regression uses the migration adapter's declared predecessor and
current version alongside older supported history, and still rejects unknown
tips, nonterminal history, substituted identities, and a stale current marker.
It reproduced the original failure before correction. All 33 focused controller
and migration tests pass without skips. No broader local regression was run.

Bounded hosted reads confirm zero active exercises, zero candidate exercises or
recovery authorities, zero unbound Auth users or sessions, and zero unsafe provider
rows, calls, or egress. Recovery rejected the absent authority because preparation
failed before its first mutation; private runner-state erasure passed. The canonical
new migration is installed. Do not delete retained history or rerun recovery.
The already approved generation function remains byte-verified; this controller-only
fix needs no further function deployment or schema change. Corrected-head CI,
preview, and all 84 hosted steps remain required. Rollback reverts the controller
allowlist, regression, and provenance together and leaves the campaign blocked.

Run 36440207222 on 1ed4ec0 passed preparation and independent exercise verification,
then failed at CH-03 `request-studio-handoff` with
`PR_C_SYNTHETIC_BROWSER_EXACT_ENABLED_CONTROL_COUNT`. Recovery and private-state
cleanup passed; a bounded read confirms the exercise is deprovisioned and its
session-revocation event is retained. Full synthetic acceptance remains failed.

A focused browser reproduction confirms a source timing defect: the workspace
and exact bundle selector can render while the independent retained-artifact read
is pending. The handoff card is already present, but its request control remains
disabled. The former runner immediately counted enabled controls and reproduced
the hosted error with zero matches. The runner now requires exactly one button on
the exact bound handoff, waits at most 20 seconds for that button to become enabled,
then rechecks uniqueness before clicking. Missing, duplicate, and persistently
disabled controls still fail closed; no capability, server action, or product
authorization changes. The new error codes distinguish missing/ambiguous controls
from controls that never become ready without exposing page content.

Executed focused verification: 54/54 synthetic browser contract tests passed with
zero skips. All eight selected desktop/Pixel browser cases passed across the final
runs, including delayed-artifact request completion, missing/duplicate control
rejection, and requester authority. Two desktop attempts timed out in local Vite
navigation before feature execution; starting and warming the same existing harness
separately allowed the isolated desktop case to pass in 4.8 seconds. These startup
failures are retained as failed attempts, not passing evidence. No broad local
regression was run. Exact-head CI, preview, and the complete 84-step hosted campaign
remain required. No migration or function deployment is needed. Rollback reverts
the runner readiness change, its fixture/regressions, and provenance together and
leaves the campaign blocked; retained exercise history must not be deleted.

Run 36449569898 on 5058d66 passed the repaired CH-03 handoff request and its
independent review, approval, and consumption. It then stopped at
`generate-source-bound-document` with `PR_C_SYNTHETIC_BROWSER_COMPLETED_STEP_MISSING`.
Recovery and private-state cleanup passed, leaving the exercise deprovisioned.
The retained generation receipt is committed and has one immutable output version;
the generation anchor exists but its completion binding does not. Bounded request
logs show the function returned HTTP 201; no rejected completion RPC appears in
the failure window. Nine read-only checks against the retained receipt, output,
template, audit, source package, and consumed handoff predicates all pass.

The synthetic-generation handler used `Response.json` for actual success and
error responses, while only its OPTIONS response carried CORS headers. This is
a confirmed source defect: a native two-origin browser regression against the
actual handler reproduced one committed effect followed by an unreadable response.
The correction uses the existing shared `jsonResponse` helper for both outcomes,
preserving the existing preflight origin/header policy, status codes, actor checks,
receipt/idempotency semantics, and four-file deployment graph. No migration,
provider behavior, or authorization change is required. All 17 focused generation
tests pass without skips, including native-browser success, replay, authentication
denial, and invalid-envelope responses. The import boundary check and Edge
type-check pass. No broad local regression was run.

AP approved the exact d489a79 four-file function bundle after its 18 applicable
CI workflows and preview passed. Deployment readback matched all four Git blobs
byte for byte, with ACTIVE status and JWT verification enabled. No other function,
migration, or settings were changed by that deployment.

Run 36458157715 passed the repaired generation step and its CH-03 successors,
then failed at CH-04 `preview-approved-studio-handoff` with
`PR_C_SYNTHETIC_BROWSER_EXACT_TEXT_MISSING`. Recovery and private-state cleanup
passed. This is a confirmed runner defect: the preview locator still expected
250 items after the hosted fixture changed to three. The product derives the
visible count from its selected server-authored candidate.

The runner now derives the exact expected count from the canonical hosted fixture
and scopes the observation and activation to the exact selected artifact's handoff
region. The preview must remain unique and its integrity text visible after opening.
A real-component desktop reproduction failed with the old 250-item locator. After
correction, all four focused desktop/Pixel cases pass, including rejection of the
250-item stress fixture and unrelated matching page text. All 54 focused synthetic
runner contract tests pass without skips. Remaining runtime 250-item references are
capacity bounds; the separate 250-item stress coverage is unchanged. No broad local
regression was run, and all 84 catalog steps remain required.

No schema or function deployment is needed for this runner-only correction. Verify
new-head CI and preview before dispatching the full protected campaign. Rollback
reverts the preview observer, focused fixture/tests, and provenance together, leaves
the campaign blocked, and preserves all retained history. Full synthetic acceptance
remains failed pending a complete new-candidate run and verified cleanup.

Run 36465762984 passed the repaired CH-04 preview and handoff request, then
failed `verify-request-creates-no-delivery-package` with
`PR_C_SYNTHETIC_BROWSER_PACKAGE_COUNT_CHANGED`. Recovery and private-state cleanup
passed. Bounded retained-state reads confirm one deprovisioned candidate exercise,
three retained packages, one completed request at unconsumed version 1, and zero
packages created in its target workspace after that request.

The package-count helper immediately counted DOM nodes after navigation, treating
an unloaded workspace as zero. A real-component regression through the actual
snapshot and observer reproduced the hosted failure (one loaded package versus a
zero snapshot). All five count-based absence checks now await the visible, usable
Delivery workspace and its attached exact package list before counting. A rendered
empty list remains valid even when it has zero height on mobile; missing or unusable
projections reject rather than proving absence. Actual count changes still reject.

The initial visibility-only list wait failed the mobile empty-list case; the final
presence boundary corrects that without extending timeouts. Final focused results:
8/8 desktop/Pixel cases and 54/54 runner contract tests pass without skips. Tests
cover delayed snapshots for request, changes, rejection and consumption replay,
negative-side-effect checks, real count changes, empty/missing/unusable projections,
and the preceding preview correction. No broad local regression was run.

This is a runner-only correction. No product, schema, function deployment, scoring,
or authorization change is needed. Current-head CI, preview and all 84 hosted steps
remain required. Rollback reverts the helper, focused fixture/tests and provenance
together and keeps acceptance blocked; retain the recovered exercise history.

Before another protected campaign, focused real-component checks reproduced two
adjacent runner defects: exact handoff cards and baseline selectors were counted
before their delayed projection rendered. Both now await their exact visible bound
element before retaining the existing uniqueness checks. Missing or duplicate
handoff targets still reject. No timeout or authorization boundary changes.

The actual handoff executor also skipped the rationale textarea because its label
includes validation help text. The application correctly preserved the draft and
rejected the empty rationale. The runner now matches that field including its help
text, retaining dialog scope and strict locator uniqueness. The first attempted
regex still missed the concatenated label text; it was corrected and verified
before commit. Other field selectors remain exact.

Final focused verification: 16/16 Desktop/Pixel cases and 54/54 runner contracts
passed with zero skips. The actual executor completes review, approval, consumption, changes and
rejection, with unchanged package counts for the negative decisions. Delayed
baseline creation and all preceding preview/absence cases pass. No broad local
regression was run. The obsolete 6b8f841 governed CI run 36468951172 was cancelled
after these adjacent defects were reproduced; its other 17 workflows passed,
including Native Assess attempt 2 after an image-registry rate-limit failure.
Those results are prior-head evidence only. The combined candidate still requires
its own CI, preview and complete protected campaign. No schema or function
deployment is needed. Rollback reverts the runner, focused tests and provenance
together, preserves retained exercise history, and leaves acceptance blocked.

Run 36477112679 on 5eacf6a passed the corrected package-absence observation,
then timed out at CH-04 `request-handoff-changes`. Recovery and private-state
cleanup passed. A bounded retained-state query confirms exactly one requested,
unconsumed version-1 handoff in the exact target workspace and a deprovisioned
exercise. Its source and target workspace are the same. The authoritative
projection assigns such handoffs to Outbox; target review authority is independent
of that direction. The runner searched only the default Inbox. This is a confirmed
runner source defect, not a missing request or authorization-grant defect.

A real-component fixture with the bound requested handoff in Outbox and an
unrelated actionable Inbox handoff reproduced the exact locator timeout before
the correction. The runner now waits for the usable projection, selects each
named direction tab, waits for its selected state, and finds the exact bound
handoff before activating its authorized control. Missing and duplicate targets
reject with explicit safe codes. No first-record fallback, API mutation bypass,
timeout extension, product behavior or permission change was introduced.

Final focused verification: 18/18 Desktop/Pixel browser cases and 54/54 runner
contracts passed with zero skips. The actual runner completes changes, rejection,
review, approval and consumption from Outbox without acting on the unrelated
Inbox handoff. Negative coverage rejects absent and duplicate records in both
directions. Its duplicate fixture now supplies persistent projection records;
the earlier DOM-clone setup was removed by normal tab rendering and was corrected
before commit. Prior preview, count-absence and delayed-selector cases still pass.
No broad local regression was run. All 84 catalog steps and 43 server actions
remain required. Verify the corrected candidate's CI and preview before its full
protected campaign. No schema or function deployment is needed. Rollback reverts
this runner selection, focused fixture/tests and provenance together and leaves
acceptance blocked while retaining the recovered exercise history.

Run 36485116066 on 8b543bf again timed out at CH-04
`request-handoff-changes`; bounded recovery and private-state erasure passed.
Read-only retained-state aggregates for this and the preceding 5eacf6a candidate
show zero anchors and zero bindings for that action. Neither run reached the
arming boundary. This corrects the preceding timeout attribution: Outbox-only
lookup was a real adjacent runner defect, but it did not explain the observed
pre-arm failure. Prior component-only action tests omitted application navigation.

The confirmed source defect is the runner's Assess route for Delivery personas
whose authoritative capability set intentionally excludes `assess.read`.
An executable reproduction using the real Sidebar, view-access guard and governed
route resolver failed while waiting for the absent Assess button. The runner now
uses the primary Delivery entry, which already mounts governed Delivery. The
initial local attempt via Delivery Pack also correctly rejected the current My
Work scope; that unnecessary subroute was removed before commit. No permission or
scope change is made. Missing navigation now reports a safe route-specific code.

Monitor-only actors likewise enter through primary Monitor. Cross-surface parity
uses the existing independently authenticated Delivery approver for a supplementary
read-only Enterprise Monitor observation; the catalog step remains owned by the
Monitor viewer. It compares the exact bound baseline article, versions, package,
accepted counts/type counts and displayed content. It excludes only the intentionally
different surface headings and records the supplementary actor/session identity.
No API mutation substitutes for a browser action or approval.

Executed focused verification: 56/56 synthetic runner tests pass, zero skips,
including twelve real-sidebar persona/viewport routes and Desktop/Pixel Monitor
parity. Ten deliberate version, count/type-count and displayed-content drifts
reject. The fixture retains real Delivery and both Monitor components, with inert
authentication and server projections and all network requests blocked. No broad
local regression was run. All 84 catalog steps and 43 server actions remain required.

This runner-only correction requires new-head CI, exact preview and the complete
protected campaign; full synthetic acceptance remains failed pending that evidence.
No schema or Edge Function deployment is needed. Rollback reverts this runner,
focused test import/fixture and provenance together, retains recovered history and
leaves acceptance blocked. Original CONTROLLED-HUMAN remains `not_run`; no merge
or production-readiness claim follows.

Candidate c175fea's CI exposed a line-bound static-scan bookkeeping failure:
the new test import shifted two previously allowed synthetic session-fixture
lines. Moving that import after the existing tests preserves their original
locations. The unchanged static guard now passes without adding an allowance.
Native Assess attempt 1 separately failed before feature execution on an image
registry rate limit. These attempts remain retained; superseded running checks
may be cancelled before validating the corrected commit. Final-source runner
contracts and the static/evidence guards must pass before that push.

Before dispatching 12b3c49, inspection found a further confirmed runner defect:
the Monitor viewer retains its already-loaded projection when another actor
creates the next baseline. An actual-step reproduction rejected the new bound
baseline with `PR_C_SYNTHETIC_BROWSER_MONITOR_BASELINE_COUNT:0`. The runner now
uses its existing fresh-page boundary for read-only Monitor steps as well as
server actions; authoring/dialog continuations remain unchanged. The fixture
serves inert UTF-8 pages so a real reload obtains the changed projection without
network access. Its initial missing charset caused two local text-boundary failures
and was corrected before commit. No product refresh or authorization change follows.

The superseded candidate passed 17 workflows, with independently verified Native
Assess evidence (27 commands, 1,145 source files) and its exact preview. Only its
still-running governed workflow was cancelled. Those results do not substitute
for final-source CI. The combined runner correction requires its own complete
exact-head checks and protected campaign, with all 84 steps retained.

Final local evidence for this combined correction: 57/57 focused runner tests
passed with zero skips, including Desktop/Pixel stale-baseline refresh through
the real step executor. The unchanged static AI-boundary guard also passed.

Run 36518999850 on d274876 passed CH-04 and CH-05 but rejected
`CH-06:inspect-deterministic-item-citations` with the safe exact-package-count
code. Bounded recovery and private-state erasure passed; the normal successful
campaign read-only proof and deprovision-verification steps were not run. No
failed-run browser artifact was retained, so its precise DOM/timing is unknown.
Candidate-scoped read-only aggregates confirm one consumed package, three items,
the correct author scope and capabilities, matching consume/replay bindings, and
no CH-06 server binding. Package creation or broader role grants are not indicated.

The next approved repair began with three read-only architecture, authority and
rehearsal reviews. All reviewers closed before root implementation. Confirmed
source defects are a Delivery shell considered ready before its async projection,
preloaded actor pages reused across CH-06 cross-actor commits, and incomplete
exact-member/citation proof. A shared usable-workspace wait and exact package
selection now serve the runner and observation helpers. Only the two cross-actor
CH-06 reads gain a fresh-page boundary; CH-13 reconciliation and CH-14 dialog
continuations retain their state. Complete canonical member identities and every
source citation are checked, with the three hosted members also matched in the UI.

The actual Enterprise screen rehearsal additionally reproduced two adjacent
selector defects before publication: a generic package article selector also
matched its Monitor baseline, and `innerText` uppercased status pills through CSS.
Selection now requires the Delivery article marker, and exact status-label
locators replace CSS-sensitive comparisons in citations, manual selection and
blocked recovery. The existing connected 250-item sequence now invokes the real
runner recovery action instead of separately scripted recovery clicks.
That action reproduced an additional invalid `region` selector for a labeled
recovery `div`; it now targets the exact existing label without changing markup.
During rehearsal, an invalid fixture action name and a `.html` fixture path were
also corrected to the existing action contract and a sanitized local route; no
runtime decoder or evidence route restriction was relaxed.

The local rehearsal uses actual Enterprise/Delivery components and the step
executor with inert authenticated-query fixtures. It proves delayed mounting,
stale actor projections, exact-member rejection and adjacent UI continuity; it
does not prove real Auth/RLS/Edge or the full hosted campaign. No complete local
84-step equivalent exists, and building a second protected-environment bootstrap
is outside this bounded repair. All 84 steps and 43 server actions remain required.
New-head CI, preview, protected campaign, independent observers and cleanup remain
planned verification. Original CONTROLLED-HUMAN remains `not_run`; merge stays NO-GO.

Rollback reverts this runner/helper repair, focused fixtures/tests and provenance
together, retains recovered exercise history, and leaves acceptance blocked. No
schema, product permission or Edge deployment changes are required.

Executed focused verification for this repair: 57/57 runner contracts, six
Desktop/Pixel CH-06 and CH-14 cases, and two final connected 250-item recovery
sequence cases passed, zero skips. Eight adjacent lineage, blocked-Monitor and
retained-history cases also passed during the bounded rehearsal. TypeScript,
the unchanged static AI-boundary guard, source/evidence contract and whitespace
checks passed. Failed local attempts above remain diagnostic history, not passing
evidence. No broad local regression suite was run.

Candidate fc31237's governed CI run 36524295287 caught a helper regression in the
existing Desktop/Pixel package-absence negative check: an explicitly false usable
marker timed out instead of returning `PR_C_SYNTHETIC_BROWSER_DELIVERY_NOT_USABLE`.
The shared helper now waits for the mounted workspace and retains the existing
explicit usable-marker assertion. All 12 affected delayed/stale CH-06, absence,
dialog and connected recovery browser cases pass with zero skips. Subsequent
registry commands did not run after that browser failure; no additional governed
infrastructure failure is established. Native Assess run 36524295136 attempt 1
separately failed at image-cache setup on a pull rate limit; attempt 2 passed and
its five-group, 27-command, 1,145-source-file artifact independently verified.
That earlier-head evidence is retained and does not replace final-head CI.

### CH-06 edit runner reproduction and connected action repair

Run `36528574360` at `54ec73d0bc7b9a3498541d3fc7e97e67df9980f3`
passed preparation and the preceding CH-06 observations, then rejected
`CH-06:edit-one-item-with-rationale` with `LOCATOR_TIMEOUT`. Bounded recovery
and private-state erasure passed; the recovered exercise is deprovisioned with
zero edit anchors and bindings. Normal observers, deprovision verification and
acceptance recomputation did not run. No acceptance artifact was produced.

Read-only architecture, security and quality reviewers completed before writes.
The controller reproduced the failure on Desktop Chrome and Pixel 7 by replacing
the existing connected test's manually scripted edit with the actual runner:
the populated Description textarea is present, but the exact label-text locator
does not resolve it. The prior test only filled title and rationale, bypassing
that failing path. This is a confirmed source defect in the runner and its coverage.

The CH-06 edit now requires the named decision dialog, fills its textboxes by
accessible role/name, confirms, and waits for dismissal. Failures expose only
bounded phase codes. Existing acceptance criteria and non-functional requirements
remain intact. The connected test also uses the real runner for subsequent item
decisions and package review/approval. That rehearsal reproduced two adjacent
selector defects before publication: the remaining item beyond the first 25
rendered members was checked before filtering, and a package action lookup also
matched a handoff action. Preparation now filters the exact bound item before
resolving its button and returns the selected item/package control for activation.
It never chooses an arbitrary first enabled action or broadens authorization.

Executed evidence: the connected 250-item sequence passes on Desktop Chrome and
Pixel 7 with zero skips, including edit, current decision, requested changes,
recovery, revised decision, independent review, approval and baseline creation.
Six affected CH-06 projection and CH-14 dialog-continuity cases also passed.
The final 57/57 focused runner contracts, TypeScript, evidence contract and
whitespace checks passed. These inert local fixtures do not prove hosted Auth/RLS/Edge.
All 84 synthetic steps and 43 server actions remain required; the protected
campaign and independent final observers remain planned verification.

Rollback reverts the runner, connected test and provenance together and leaves
acceptance blocked. This repair changes no product code, schema, provider path,
permissions or deployed Edge function. Original CONTROLLED-HUMAN remains
`not_run`; merge remains NO-GO until the full required evidence is verified.

### CH-07 current-version review state repair

Run `36554585742` at `d27b34234e699457e7c9ff34acf4d1979c601c8b`
failed at `CH-07:decide-revised-descendant` with
`PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_REVIEW_STATE_MISMATCH`.
Read-only server receipts confirm CH-06 edit and acceptance and CH-07 requested
changes and rebuild succeeded. Bounded recovery and private-state erasure passed;
normal final observers, normal deprovision verification and acceptance recomputation
did not run. This remains a failed campaign, not synthetic acceptance evidence.

Three read-only reviewers completed before writes. The confirmed source defect
is the SQL-to-canonical decoder deriving current review/approval state from all
package versions. Rebuild correctly creates a new draft and preserves old events;
the decoder incorrectly presents the prior version's changes-requested review.
The prerequisite normalizer repeats this defect. The connected fixture concealed
it by assigning the expected state directly and omitting review history.

Both decoders now select current-version events while preserving complete history
and server-supplied actions. The existing connected fixture appends real-shaped
versioned decisions and uses the production decoder for review, rebuild and
approval transitions. The runner still requires the exact rebuilt package and
descendant, draft state, and `Review not requested`; no assertion is relaxed.

Executed evidence: before the repair, the focused decoder and prerequisite cases
and both connected desktop/mobile cases reproduced stale review state. After the
repair, decoder contracts, all 20 prerequisite cases, the two connected 250-item
desktop/mobile cases, affected Edge query tests and TypeScript passed. Tests also
retain prior review/approval history and verify current review, pending approval,
approval and rejection without inheriting older-version events. These local
fixtures do not prove hosted acceptance.

Deployment boundary: only `enterprise-intelligence-query` needs refreshing on the
already approved synthetic project because it imports the repaired decoder.
Comparison against the currently deployed 12-file source set found only
`services/deliveryMonitor/contracts.ts` changed. JWT verification remains enabled.
No schema, command authorization, provider execution or scoring change is required.
Exact-head CI, source readback, preview binding and the full protected campaign
remain planned verification. All 84 steps and 43 server actions remain required.

Rollback restores the preceding query source set and reverts the decoder,
normalizer, focused tests and provenance together. Keep acceptance blocked and
the preview read-only if any binding or verification fails. Original
CONTROLLED-HUMAN remains `not_run`; final merge remains NO-GO.

### CH-07 durable-proof refresh race

Run `36564147350` at `34176b13e83ba295d1459bc920cd4e704cbf5d98`
failed at `CH-07:commit-only-explicitly-edited-descendants` with
`PR_C_SYNTHETIC_BROWSER_COMPLETED_STEP_MISSING`. The revision itself succeeded:
read-only server checks found the exact matching actor/step anchor and completed
binding, with completion about 5.4 seconds after anchoring. The package is version
2 in draft. Bounded recovery and private-state erasure passed; the exercise is
deprovisioned. Normal final observers and acceptance recomputation did not run.

Three read-only reviewers completed before writes. Confirmed source defect:
the runner refreshed the evidence list once, then waited on that static DOM
snapshot. An asynchronous application command can finish after that refresh;
`networkidle` does not establish its durable completion. The prior real-banner
fixture supplied completed proof on its first read, and the connected business
flow bypassed proof collection, so neither exercised this race.

The collector now refreshes only the existing authenticated read-only list within
its existing 15-second deadline. Each refresh must settle before the next read.
It explicitly selects the requested checkpoint/step and preserves the exact
anchor/binding checks. A rejected refresh fails immediately; a permanently absent
proof still fails. It never re-arms, replays the business action, invokes completion
directly, or accepts the banner's fallback proof.

Executed evidence: extending the existing production-banner fixture reproduced
the same missing-step failure before the repair. Afterward, Desktop and Pixel
cases passed for an initially anchored then completed step, permanent absence,
and rejected refresh, with an unrelated completed proof present and zero arm or
business-action calls. All 58 focused runner tests passed with zero skips.
No product, schema or Edge function refresh is needed. Exact-head CI, preview
binding and the full protected campaign remain planned verification; all 84 steps
and 43 server actions remain required. These inert tests are not hosted acceptance.

Rollback reverts the collector, focused fixture and provenance together. Keep
acceptance blocked; no database rollback or action replay follows. Original
CONTROLLED-HUMAN remains `not_run`; final merge remains NO-GO.

### CH-08 baseline projection completion repair

Run `36576036099` at `cc39542f3ca3e592780141fadcb8e6169184b705`
passed the five CH-07 server actions and failed at
`CH-08:create-baseline-with-exact-package-selectors` with `BROWSER_ERROR`.
Read-only server verification found a succeeded exact actor/request binding,
the correct approved package version, three accepted items and exactly one
baseline for that version. Bounded recovery and private-state erasure passed;
the exercise is deprovisioned. Final observers, normal cleanup verification and
acceptance recomputation did not run.

Three read-only reviewers closed before writes. Confirmed source defect:
the runner could return from baseline confirmation before the application's
post-command projection reload. It then asserted the rendered count immediately
after collecting durable proof. That unnamed assertion explains the generic
failure, although the old run did not retain the exact assertion location.
The previous proof-refresh fix addressed the earlier durable-binding race;
it did not cover this later screen refresh. The existing connected test used
manual baseline clicks and auto-waiting assertions, concealing this runner gap.

The existing real-component harness now separates committed baseline action
from delayed or failed projection reload. Before repair, the focused Desktop
case reproduced the runner returning while the confirmation dialog remained
open and the baseline remained absent. The runner now waits at most 15 seconds
for that exact dialog to close, the production signal that command and projection
reload succeeded. Both CH-08 and CH-11 baseline actions use this gate. CH-08 then
verifies the exact returned baseline/package and requires exactly one added
baseline with a named error. No command retry or inferred completion is added.

Focused verification covers Desktop and Pixel delayed completion, failed reload
with preserved dialog, a single command invocation, the actual runner in the
connected 250-item sequence, and the existing Enterprise/primary Monitor parity
case. All eight selected Desktop/Pixel browser cases, all 58 runner contracts
and TypeScript passed with zero skips. All 84 steps and 43 server actions remain
required; local fixtures are not hosted acceptance. New-head CI, preview and the
protected campaign remain planned verification.

Rollback reverts this runner, fixture, test and provenance repair together.
No product, schema, Edge function, permission or provider change is required.
Original CONTROLLED-HUMAN remains `not_run`; synthetic acceptance and merge
remain NO-GO until the complete exact-candidate campaign verifies.

### CH-09 mobile navigation startup repair

Run `36586037056` at `18c669c0913caf83e0969e91da23429fd8997624`
passed CH-08 creation and replay, then failed at
`CH-09:compare-enterprise-and-primary-monitor` with `LOCATOR_TIMEOUT`.
Read-only server checks confirm creation and replay bound the same baseline.
Bounded recovery and private-state erasure passed; the exercise is deprovisioned.
Final observers and acceptance recomputation did not run. During the bounded
replay-to-failure log window, Enterprise queries returned HTTP 200, but none was
identified as a Monitor-viewer request. No raw logs or actor identifiers are retained.

Three read-only reviewers closed before writes. The original navigation fixture
used the real Sidebar and Monitor panels but a handwritten two-tab Enterprise
header, synchronous shell mounting, and viewport dimensions without full device
emulation. Its parity case called the observer directly, bypassing the actual
step's page reload. Those differences concealed the failed startup sequence.

The existing fixture now uses the production Header, session toolbar, evidence
banner, Enterprise Intelligence view and primary Monitor loading path. It runs
the actual CH-09 step with a separate Desktop approver and Desktop/Pixel viewer,
expanded proof panel, inert read projections and delayed authenticated shell
mounting. Before repair this reproduced the locator timeout: the runner probed
the mobile menu opener before the shell existed, then waited for navigation
that remained inert until that missing opener action occurred.

The five-line runner repair waits for the existing `primary-navigation` shell
element to be attached before checking and activating the normal mobile opener.
It keeps the existing authorized route, ordinary clicks and exact baseline
comparison. It adds no forced click, capability grant, data fallback, command
replay or product change. The shell wait is bounded and emits a sanitized error.

Executed focused navigation verification: all three cases pass, covering six
authorized personas on Desktop and Pixel, read-only baseline refresh, the full
two-persona CH-09 step and retained attribute/text drift rejection. Neither
persona issues a business command. All 58 shared runner tests passed with zero
skips; source/evidence and whitespace checks passed. Exact-head CI, preview and
the protected campaign remain planned verification. All 84 steps and 43 server
actions remain required; this local reproduction is not full hosted acceptance.

Rollback reverts the runner, focused fixture and provenance together. No schema,
Edge function, permission or provider change is needed. CONTROLLED-HUMAN remains
`not_run`; synthetic acceptance and merge remain NO-GO pending complete evidence.

### Connected remaining-path repair after CH-10 failure

Run `36602319176` at `bff80d45bdc875b12fd9616851e9d60d79c9452c`
advanced beyond CH-09 and stopped at `CH-10:create-direct-studio-plan` with
`BROWSER_ERROR`. Bounded recovery and private-state erasure succeeded. Read-only
inspection of the exact synthetic exercise found it deprovisioned, with 27
earlier server bindings and no CH-10 anchor or binding. Its seeded extraction
remained succeeded with two bindings and two reviewed, accepted candidates.
Bounded Studio projection requests near failure returned HTTP 200; successful
transport does not establish a valid or usable client projection. No raw logs,
actor identifiers, or backend identifiers are retained here.

AP approved replacing the repeated isolated-fix/retry cycle with a focused
connected-path investigation. All three read-only architecture, security and
quality reviewers closed before writes. Under the fixed managed workspace-write
profile, the controller owns runner changes, integration, evidence and the same
PR; two implementation workers own the existing Studio and Delivery browser
fixtures exclusively. No nested delegation, new framework or authority change
is authorized by this repair.

Confirmed coverage gap: the prior direct-PDD test selected a type and bundle but
did not execute the complete catalog action with arming, command, proof and
retained state. Remaining hosted work is 31 steps: CH-10 (4), CH-14 (10), CH-11
(5), CH-12 (7), and CH-13 (5), including 16 server actions. Local connected
fixtures remain separate from hosted identity, authorization and cleanup proof.

Confirmed diagnostic defect: the sanitizer reduced page load-state and predicate
timeouts to `BROWSER_ERROR`. The existing focused test reproduced that loss and
now passes with distinct fixed timeout codes while excluding private text. The
specific hosted CH-10 runtime cause remains unconfirmed because the retained
error omitted its phase. The full-step local reproduction nevertheless confirms
a runner defect: with unrelated background requests, the original helper waits
for global network idleness while the actual PDD workspace and source-package
builder are ready. It never selects the exact available bundle or issues the
create command. The correction removes that global wait and retains the usable
PDD projection, exact bundle selection and enabled create-control checks, with
fixed safe phase failures. No artifact filtering or product eligibility changes
are needed for this reproduced defect.

The connected production-component fixture also reproduced a later CH-14
usability defect: at the author's 412-by-915 viewport and 200 percent document
zoom, the decision dialog's `90vh` maximum exceeded its actual overlay, leaving
Confirm outside the reachable viewport. Replacing that maximum with the parent
overlay's full height preserves ordinary clicks, scrolling, validation focus,
input retention and focus return. No permission or decision rule changes.

Executed focused browser verification: the complete CH-10 catalog action passes
on Desktop and Pixel, with one exact PDD/direct-bundle command, matching proof,
retained state, planning-only lineage and zero provider traffic. The connected
Delivery fixture also passes both profiles through CH-10 handoff, review,
approval, consumption and baseline; nine CH-14 observations; and CH-11 manual
create, item acceptance, review, approval and baseline. It retains committed
fixture state while mirroring the catalog's separate persona viewports and the
document-zoom reset caused by CH-11's reload. Fixture actor labels are not
authorization proof. The existing CH-12/CH-13 API and response-loss contracts
remain the local evidence for those handlers; their exact hosted steps and the
full campaign remain `not run` successfully on the repair candidate.

The first combined owned-contract run passed 112 of 114 executions; both failures
were duplicate executions of the same navigation fixture startup timeout under
concurrent local builds. That exact case passed in isolation. The final isolated
`npm run test:pr-c-synthetic-acceptance` gate passed all 73 tests with zero skips;
`npm run typecheck` passed after the final fixture and dialog changes.

The first exact-head CI attempt on `eb49690` exposed stale static-scan line
references after the five-line diagnostic test addition. The same two existing
authentication-fixture exceptions now reference lines 206 and 215; no exception
scope was added or broadened. The affected static gate passes locally. Native
run `36672649379` separately stopped before tests when its pinned container pull
received a registry data-limit response; no image substitution is authorized.

The same CI attempt exposed two CH-14 runner issues in the new connected
fixture. Focus was sampled before the component's scheduled focus update, and
mobile emulation at 200 percent document zoom reported an intercepted pointer
hit despite the visible button's DOM center resolving to that button. The
pointer failure reproduced in three consecutive local attempts. Alternative
scroll-container and input-size changes did not resolve it and were removed;
no additional product layout change is retained. This is not a claim that all
mobile pointer behavior has been proved.

The keyboard-accessibility sequence now reaches Edit, Confirm and Cancel with
actual Tab navigation and Enter activation, without assigning focus or forcing
controls. Validation and return-focus observations wait for the application's
scheduled focus and still require the exact expected element. The connected
CH-10/CH-14/CH-11 fixture then passed six of six executions: three Desktop and
three Pixel. The final owned synthetic contract gate passed 73/73 with zero
skips; TypeScript and the exact-line static check passed. The normal
pointer-operated lifecycle actions remain in this same
fixture. No catalog step, zoom, profile or assertion was removed.

Core CI also encountered newly published fast-uri advisory
GHSA-hrr3-gc8f-f4qj. The lockfile alone advances the existing compatible
transitive dependency from 3.1.7 to patched 3.1.8; npm reported zero
vulnerabilities after that update. No direct dependency or range changed.

CI run `36674534955` subsequently exposed a fixture-only reload omission:
CH-11 continued after a CSS zoom reset, while the hosted preparation reloads the
document. Mobile viewport state could therefore carry into later pointer
confirmation. The inert connected fixture now snapshots only the projections
actually produced by preceding commands, performs a real page reload, and
verifies that the approved direct package and baseline survive unchanged before
executing CH-11. No expected business state is substituted. Six repeated
connected executions pass (three Desktop, three Pixel), including ordinary
post-reload pointer actions. Application and runner source are unchanged by
this follow-up; rollback removes the fixture snapshot/reload and its bindings.

The external pinned-image registry limit also affected the Native Assess job
before tests. The same image was subsequently downloaded successfully on a
fresh runner, and Native run `36674534972` attempt 3 passed on `ee162bf`; this
is prior-candidate evidence only, not proof for the forthcoming fixture commit.

Planned verification: refresh provenance and verify the final exact
candidate before another protected full campaign. Do not weaken eligibility,
skip steps, grant permissions, force controls, or replay business actions to make
the campaign pass. Rollback reverts the bounded repair and its fixture/evidence
changes together, including the dialog sizing rule; retained immutable exercises
remain unchanged. No database or Edge deployment change is required.

### CH-10 legacy offline-preparation correction (2026-09-30)

Run `36679307899` on `5f27daa71348b3fbbc1c74f50cc680c20272e5d5`
passed preparation and stopped at CH-10 with `COMPLETED_STEP_MISSING`.
Bounded recovery and private-state erasure succeeded. Read-only inspection
confirmed a deprovisioned exercise, 27 earlier bindings, and no CH-10 anchor.
Bounded function-name diagnostics identified the legacy offline preparation
RPC attempting an Assess extraction job for a Studio-private source. The
current owner guard correctly rejected it before the client could anchor.

Confirmed source defect: the client still invoked that obsolete preparation
before the normal Studio package command. The current seeder already creates
exact Studio extraction bindings and accepted decisions for both acceptance
policies. The browser fixture mocked preparation successfully, while the
database fixture called the normal command directly; neither covered this
pre-command failure. All three read-only reviewers closed before the controller
began the bounded correction under the fixed workspace-write profile.

The client now proceeds directly to the existing anchor, canonical Studio
command and completion. The server still validates actor, tenant, locked bundle,
candidate decisions and complete source coverage. No migration, replacement RPC,
permission, provider or eligibility change is introduced. Historical SQL and
the Assess owner guard remain unchanged. Three compiler import contracts track
the removed import and retain their adversarial self-checks.

Executed evidence: the targeted client regression failed before the correction
when the legacy hook rejected, then passed with zero legacy calls and retained
anchor/command/completion assertions. The fresh-chain PostgreSQL 16 harness
passed with zero skips: it reproduced the same legacy rejection, verified no
retained job, receipt, binding, candidate, package, audit, usage or effect changes,
and completed its existing connected server paths and two seed/deprovision
cycles. TypeScript, all 25 compiler-contract self-checks, and the refreshed
85-command/241-assertion evidence contract passed. Exact-head CI, preview and the full hosted campaign remain planned
verification. These results do not establish hosted synthetic acceptance.

Rollback reverts the client and associated tests/import bindings together;
disable new exercise commands if rollback restores the known legacy failure.
Retain immutable exercises and SQL history. CONTROLLED-HUMAN remains `not_run`;
SYNTHETIC-ROLE-ACCEPTANCE and merge remain NO-GO until complete verified evidence.

### Linux connected-fixture viewport correction (2026-09-30)

Creation Access run `36687415600` passed 73/74 Delivery browser cases but failed
the connected Pixel scenario at its CH-11 manual-item Confirm click. Five local
Windows repetitions passed; Linux Chromium reproduced the same interception
in all three repetitions. Viewport diagnostics traced the failure to the fixture
switching from Pixel to desktop dimensions while document zoom remained 200%.
Linux retained a 1.279 page scale, shrinking the 412-pixel visual viewport to
322 pixels even after reload. This combined-page transition is absent from the
hosted runner's separately maintained persona pages. A mobile font-size
experiment did not change the failure and was fully removed.

The fixture now clears document zoom before switching to desktop dimensions,
and explicitly asserts an unscaled visual viewport after its real CH-11 reload.
The correction preserves every interaction, committed-state check and ordinary
pointer click. No application or acceptance-runner behavior changes. Executed
verification: the corrected case first passed on Linux Pixel, then all six
Linux repetitions passed (three Desktop and three Pixel); TypeScript passed.
Rollback reverts the fixture ordering and added viewport assertion together.

Prior candidate `d5de258` also passed 16 applicable workflows and exact-preview
verification, including independently verified Native Assess evidence. Its
required Delivery/Monitor job stopped before tests in three attempts because
the pinned-image registry returned `toomanyrequests: Data limit exceeded`.
No image or gate substitution was made. Those results are prior-candidate
evidence; corrected-head CI, preview and full synthetic acceptance remain
planned verification.

Faster CI on `e1bb935` subsequently caught the same retained scale at the new
assertion despite the reordered operations; the local timing result was not
sufficient. The final fixture therefore follows the hosted page boundary:
separate desktop requester and zoomed Pixel observation pages receive only the
preceding commands' actual committed projections. Every CH-14 observation remains
required, with exact 1280-by-720 and 412-by-915 viewports. Both observation pages
must leave those projections unchanged, and CH-11 continues on the original
page with its real reload, unchanged package/baseline checks, scale assertion,
and ordinary pointer confirmations. No page-scale override or forced control is
used. Final isolated-page verification passed all six Linux executions (three
Desktop and three Pixel); TypeScript passed. The published prior head reached
17/18 green workflows; its negative sign-in boundary timeout passed on the
unchanged fresh-runner retry. Final-head CI and hosted acceptance remain pending.

### CH-10 package-review response binding correction (2026-09-30)

Candidate `89f2b3dc90dd92055f83f84d92ee806a3ffcf68d` passed all 18
applicable CI workflows on their first attempts and exact-preview verification.
Native Assess and governed artifacts were independently verified. Protected run
`36696796888` then completed direct Studio creation, generation, independent
Studio decisions, Delivery handoff review/approval/consumption, item acceptance,
and package review before its prerequisite decoder rejected the review response.
Recovery and private-state erasure succeeded; bounded read-only inspection
confirmed a deprovisioned exercise with 29 anchors, including two CH-10 anchors.

Confirmed source defect: a package review returns its immutable review-event ID
as `resourceId` and the reviewed package ID as `workPackageId`. The runner instead
required `resourceId` to equal the package ID. The retained committed response
and HTTP 200 established this mismatch without another diagnostic campaign.
The unit mock had incorrectly returned a package ID as the event resource, while
the PostgreSQL CH-10 proof manually duplicated commands and bypassed the runner.
All three read-only reviewers closed before this bounded implementation began.

The runner now validates the exact `workPackageId`, a valid distinct review-event
resource, and the existing authoritative post-review projection. Actor, tenant,
version, lineage, accepted-item, and independent-review checks remain intact.
The PostgreSQL proof executes the actual CH-10 prerequisite with real command
responses and the production projection decoder, then retains controlled package
approval and subsequent checks. No schema, Edge, permission, UI, provider, or
catalog change is required. The other prerequisite response identities were
audited against their command contracts; no equivalent mismatch was found.

Executed verification: the faithful response fixture failed before the fix with
`COMMAND_RESULT_delivery.package.review.resolve`; all 21 focused prerequisite
tests passed afterward, including six missing/substituted-identity cases.
The strengthened PostgreSQL 16 integration passed with zero skips (1/1, 40.90
seconds), including the actual CH-10 prerequisite, subsequent controlled approval,
and both seed/deprovision cycles. Its initial adapter wiring was corrected to use
the production decoder and the canonical consumption response field before the
passing run. No broad local regression or browser rerun was needed for this
response-only correction. Final exact-head CI, preview and hosted acceptance
remain planned verification; all 84 steps and 43 server actions are required.

Rollback reverts the runner and its focused tests together, retaining immutable
exercise and command history. Keep the acceptance/merge block if rolled back.
`CONTROLLED-HUMAN` remains `not_run`; final merge still requires AP confirmation.

### CH-11 manual-package authorization version correction (2026-09-30)

Candidate `e404fb830c679c8bc7f45cb949fde945a0541e4a` passed all 18
applicable workflows, independently verified Native Assess and governed
artifacts, and exact-preview verification. Protected run `36707407549` passed
the repaired CH-10 path, then failed before CH-11 manual creation. Recovery and
private-state erasure succeeded. Bounded read-only inspection confirmed a
deprovisioned exercise with 30 anchors and 30 bindings, no CH-11 anchor, and
an anchor rejection at the server's exact-version check before command dispatch.

Confirmed source defect: the browser hardcoded workspace target version `1`
for manual creation, although the catalog requires the actor authorization
version. The current retained actor version was greater than one. The ordinary
client transport tests disabled controlled mode, while the PostgreSQL test
manually supplied the correct version; both bypassed this defective derivation.
All three read-only reviewers closed before implementation began under the
existing fixed workspace-write profile.

The manual-create client now obtains a fresh authenticated tenant session,
requires exactly one matching organization/workspace context, and uses its
positive integer authorization version for the anchor. Missing, ambiguous,
malformed, mismatched and stale authority fail closed. The server still checks
the version itself. Other target dimensions, business payloads, selector hashes,
lineage, permissions and completion rules are unchanged. No schema, Edge,
provider, UI or catalog change is needed.

Executed verification: the new focused client case failed before the fix because
no tenant-session read occurred. It passed after the fix, including version 4,
nine invalid-context cases and a stale-anchor rejection without dispatch/retry.
The PostgreSQL 16 integration now loads the actual production client and its
decoders, replacing only its Supabase transport with real SQL calls. It proves
that version 1 is rejected, the live version completes manual creation, and the
manual review, approval, baseline and both cleanup cycles still pass. The first
adapter attempt incorrectly assumed an initial anchor supplied the client's
business idempotency key; correcting that adapter to accept the existing client
key contract produced a pass (1/1, zero skips, 36.06 seconds). No broad local
regression was run. New exact-head CI, preview and the full protected synthetic
campaign remain planned verification; all 84 steps and 43 server actions remain
required.

Rollback reverts the client correction and its focused tests together, retaining
immutable exercise history and the acceptance/merge block. `CONTROLLED-HUMAN`
remains `not_run`; final merge requires AP confirmation.

The first published correction, `d3c52a8`, reached a verified exact preview,
but CI identified two omitted integration updates: the protected `invokeCommand`
AST fingerprint and a coverage stub whose return type incorrectly excluded
`local` after the client imported the existing session loader. The PR C and
retained PR B coverage stubs now express the compatible union, and PR C exposes
the same explicitly installed anchor-test hook as the focused client compiler.
Unmocked controlled calls still reject. The reviewed fingerprint retains the
unchanged request/idempotency binding, command sinks and same-body retry; four
new mutations verify removal or substitution of the fresh scope/version checks
is rejected. Source-boundary validation and all 15 idempotency mutation tests
passed. The exact failed PR C coverage gate passed (6 governed and 9 integration
test files; governed lines 97.09%, branches 86.00%, functions 96.79%), with no
threshold change. PR B compile-only validation passed without running its broad
suite. Separate container-registry and preview-network failures on that candidate
did not exercise this repair. The final candidate still requires all hosted gates.

### CH-10 Studio source-read isolation (2026-09-30)

Protected run `36721430815` at `4d2dbe6` passed preparation but stopped at
`CH-10:create-direct-studio-plan` with `DIRECT_PACKAGE_CONTROL_NOT_READY`.
Bounded read-only evidence showed the unrelated Delivery workspace projection
timing out (SQLSTATE 57014), causing the full Enterprise query to return 503,
while the independent Studio workspace reads succeeded. No CH-10 package
command was issued. Recovery and private-state erasure succeeded; the exercise
was deprovisioned with 27 anchors and 27 bindings.

Confirmed source defect: Studio obtained its source eligibility through the full
Enterprise projection. An actor with Delivery capabilities therefore depended on
Delivery read availability before creating a Studio package. The component
correctly failed closed when that combined read failed. All three read-only
reviewers closed before implementation under the existing fixed workspace-write
profile.

The existing query now accepts the explicit `studio_source_flow` scope and
loads only the complete Studio source-flow dependency set. Studio uses that scope
on initial load and after a source commit. The default full query is unchanged.
Fresh tenant authority, expected authorization version, the full DTO decoder,
organization/workspace response binding, source ownership, exact locked bundle,
succeeded extraction, reviewed/anchored candidates and complete source coverage
remain required. Unknown or mixed scopes reject; there is no broad-query fallback.
No schema, scoring, permission, provider call, timeout or retry change is needed.

Executed verification: the focused client suite passed scoped serialization and
seven unavailable, mismatched, stale or malformed response cases with no fallback.
The real CH-10 component/runner action passed on Desktop Chrome and Pixel 7 with
the full-query method forced to fail. The source-read failure case kept creation
disabled and enabled it only after an exact successful read on both profiles.
Its first fixture incorrectly expected a reload button in a state without that
control; using the existing artifact-type selector corrected the fixture, and
both cases passed. Client source boundaries and Edge import resolution passed.
The focused Enterprise query suite passed: scoped reads skip Delivery/Monitor
and unrelated rows, produce the same Studio source DTO as the default query,
disclose no source rows without capability, and reject invalid/mixed scope,
stale authority and foreign scope. The default full query remains covered.
New exact-head CI, deployment source readback, preview verification and the full
protected campaign remain planned verification.

Deployment boundary: refresh only `enterprise-intelligence-query` on the already
approved synthetic project, retaining JWT verification. Rollback restores the
previous query source set and reverts the scoped client/component change with
its tests and provenance. Preserve immutable exercise history and keep acceptance
blocked if any binding fails. All 84 steps and 43 server actions remain required;
`CONTROLLED-HUMAN` remains `not_run`, and merge still requires AP confirmation.

Candidate `5b84524` reached a verified exact preview and deployed query source
readback, but Native Assess CI caught an omitted inventory-binding update.
Grouping the Studio loaders changed traversal ordinals in the reviewed projection
inventory. Independent comparison with `4d2dbe6` confirmed all 66 targets,
call kinds, tables and ordered columns are identical. Only the reviewed
fingerprint changes; the extractor, count, database-column checks and negative
mutation guards remain unchanged. All 13 focused inventory contract tests passed,
including the retained negative mutations, before publishing the reconciled
candidate. No further runtime source change or Edge deployment is required.

### CH-12 evidence-panel readiness correction (2026-10-01)

Executed evidence: protected run `36740134899` on `224db4a` passed the earlier
CH-10 Studio path and reached CH-12, then failed at
`revoked-actor-projection-denied` with `PR_C_SYNTHETIC_BROWSER_ARM_PANEL_COUNT`.
Recovery and private browser-state erasure both succeeded. The final read-only
phase, independent full-campaign observation, and acceptance recomputation were
not run; this is not a synthetic acceptance PASS.

Confirmed source defect: the runner reloads before a server action and considers
a visible body usable while the application still renders `Loading workspace`.
Negative API evidence deliberately skips ordinary workspace navigation. The
immediate evidence-panel count can therefore run before the revoked-session
screen mounts its existing controlled-human banner. The revoked actor remains
the required actor for the denial; moving revocation or weakening authorization
would invalidate that check.

The architecture, security, and quality reviewers completed read-only Wave 1
before the controller authorized scoped implementation under the existing
workspace-write profile. The correction waits for the exact evidence surface
before arming and proof readback, preserving bounded failure on missing,
blocked, or duplicate surfaces and the exact durable proof comparison. Generic
page readiness remains unchanged because it also runs before authentication.
No product UI, permission, SQL, migration, or deployed Edge source change is
required.

Executed evidence: the new delayed real-React-banner regression reproduced
`PR_C_SYNTHETIC_BROWSER_ARM_PANEL_COUNT` before the source change. After the
correction, both focused tests passed: the actual CH-12 runner waits across both
reloads, arms before anchoring, obtains the expected denied binding and reads
back the exact proof. Missing, late-blocked, duplicate-banner and duplicate-panel
cases fail closed. The API boundary is a test fixture, not new hosted denial
proof. Existing PostgreSQL denial authority tests remain the server-contract
evidence. Typecheck and the focused synthetic acceptance gate passed (76/76,
zero skips); `git diff --check` passed. Exact-head CI, preview binding and the
full protected 84-step campaign remain planned verification. No unrelated
regression suites or thresholds are added.

Rollback reverts the runner readiness correction and its regression together.
No data or Edge rollback is needed. Preserve failed-run and cleanup history;
acceptance and merge remain blocked until the complete campaign passes and AP
confirms merge. `CONTROLLED-HUMAN` remains `not_run`.
