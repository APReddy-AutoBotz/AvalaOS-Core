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
