# Assess and Studio AI output correction

## CI follow-up on dependency repair (2026-10-03)

Candidate `3140a93` reached a ready Netlify preview, but CI identified four
confirmed source/test integration defects: the separate acceptance inventory still
hashed the old CSS/package sources; four exact static-scan allowlist entries kept
old line numbers after test edits; Tailwind's changed slate palette altered the
existing modal backdrop; and a delayed-response harness control was covered by
its open confirmation dialog. These are retained separately from paid proof.

Corrections preserve the original modal color, update only existing allowlist line
bindings and affected source hashes, and position only the test harness's response
release control above its modal. No runtime approval behavior or assertion was
weakened. Focused executed evidence: AI boundary and secret hygiene scans passed;
acceptance inventory validation and its negative provenance tests passed; the
cleanup-boundary regression passed; both desktop/mobile modal assertions passed;
and all four selected delayed-baseline browser cases passed. The standalone modal
runner printed both successful cases but hung during local Windows server teardown
and was interrupted afterward; its two assertions are not represented as a clean
runner exit. The dedicated baseline runner completed with exit 0.

Refresh the PR C bindings after these edits. New-head CI and preview are still
required; no additional paid call, hosted mutation or merge is authorized.

## Current dependency and evidence binding repair (2026-10-03)

The user authorized next steps after the completed paid and downstream synthetic
path. Work stays in existing PR #265. The prior exact candidate `89c95ec` passed
provider validation, one joined BRD generation, immutable reopen, source-grounded
agent revision v2, synthetic approval, five accepted Delivery items and exact
read-only Monitor publication. The generated v1 semantic omissions remain a quality
finding. No further paid call is authorized by this repair. Retain USD 4.6409936,
all eight consumed debits, zero unresolved reservations and both runtimes off.

Read-only architecture, security and quality reviews agree: no patched braces
release exists, both Tailwind 3 dependency paths must be removed, and a bounded
Tailwind 4 compatibility migration is necessary within this PR. The latest reviewed
upstream versions are Tailwind and its PostCSS plugin 4.3.3. Do not use a fork,
invented version, audit suppression or weaker CI policy. The stale PR C owner
hashes must be refreshed with the existing canonical generator.

Upstream references: [reviewed braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
and [Tailwind 4 compatibility guide](https://tailwindcss.com/docs/upgrade-guide).

In scope: dependency/lockfile, PostCSS configuration, CSS entry and compatibility,
existing JS theme, two programmatic CSS browser builders, active documentation,
generated registry/provenance. Preserve repository-owned source scanning; excluded
private/output files must not become class sources. No Health feature edits,
provider/schema/authorization changes, new campaign, hosted mutation or production.
Tailwind 4 requires Safari 16.4+, Chrome 111+, Firefox 128+; no older-browser support
contract was found. Existing browser proof covers Chromium Desktop/Pixel only.

Acceptance: clean lock install; braces absent; unchanged moderate audit gate passes;
production build succeeds; directly affected desktop/mobile CSS harnesses pass with
the existing layout/focus/behavior assertions; custom theme/dark rendering preserved;
canonical PR C contract passes with unchanged assertion inventory. Refresh source
bindings only after the final edits. A refresh itself proves no command execution.
Do not run unrelated database or paid-provider regressions. Record exact commands,
failures, final results and proof limits here before committing the same branch.

Rollback: revert dependency, configuration, CSS and harness compatibility together.
That restores the old toolchain and its known advisory, so it restores the merge
blocker too. Keep providers off, preserve all historical data/evidence and use the
existing read-only Monitor baseline. New-head CI/preview require separate evidence;
previous hosted success is not transferable. No merge or production authorization.

The preview workflow exposed a second confirmed source mismatch: all ordinary PR
builds exited without identity headers, while ordinary preview QA required the
release/deploy/environment tuple. Closed read-only architecture/security/quality
review approved an exact ordinary-preview metadata path. It emits only the public
identity and existing security headers; no controlled-human binding, runtime
activation or backend/provider change occurs. PR #264 partial claims still fail
closed before generic handling; stable production authorization is unchanged.

Executed local verification:

- `npm ci --ignore-scripts`: passed; only the CSS dependency chain changed.
- `npm ls braces --all`: empty; npm's empty-tree exit is 1.
- `npm audit --audit-level=moderate`: passed, exit 0. Only the pre-existing low
  DOMPurify advisory remains; it is not represented as fixed.
- `npm run build`: passed. The actual Netlify `--build` router also passed on
  final CSS with synthetic local ordinary-preview metadata and demo mode, emitted
  exact generic identity and no preview binding, and performed no hosted action.
- `node --test scripts/prCSyntheticAcceptanceBrowser.test.mjs`: 69/69 passed.
  After correcting v4's changed outline semantics, the final-source CSS-owning
  `completed evidence leaves workspace actions clickable` case passed again (1/1).
- Navigation scenarios in `scripts/prCSyntheticBrowserNavigation.test.mjs`: 3/3
  passed. The final real Chromium computed-style theme/dark/responsive/focus/legacy
  compatibility check passed (1/1). No old-browser or all-engine claim follows.
- `npm run test:transcript-flow:delivery-monitor-evidence-contract`: migration
  and CI static checks plus 75/75 adversarial contract checks passed.
- Canonical `--refresh-bindings` preserves all 85 commands, 241 assertions,
  15 owners and 10 explicit not-run boundaries. Three stale owner hashes changed;
  assertion inventory and requirements did not.
- `node --test scripts/writeHostedPilotNetlifyHeaders.test.mjs`: 84/84 passed,
  including ordinary metadata substitutions and retained controlled/stable guards.
- `node tests/browser/previewExhaustiveBrowserQaWorkflowContract.test.mjs`:
  passed with no workflow semantic changes.

Final source/provenance validation and diff review precede same-branch commit/push.
New-head GitHub CI and actual Netlify preview proof remain pending. No paid call,
database migration, broad local regression or hosted mutation was performed.

## Current terminal failure-journal correction (2026-10-03)

Executed evidence: candidate `58cd46e` reached source-verified deployment on the
approved dedicated synthetic target: five pending migrations and four JWT-verified
Edge functions. The four AP-approved private-test workflow gates passed their
relevant non-audit checks under the exact-candidate dependency-risk exception.
Aggregate CI remains red and PR #265 remains unmergeable.

Hosted recovery returned `SYNTHETIC_AI_MAPPING_RECONCILIATION_UNSAFE` before
activation or spending. The historical failed command has exactly one immutable
terminal journal row: matching receipt, tenant, operation, response, canonical
hash, fence and completion time; no resource, debit, output or proposals. The
recovery predicate and earlier fixture incorrectly assumed zero journal rows.
This is a confirmed source defect; the earlier eight-scenario pass omitted the
actual historical shape.

Preserve deployed migration `20261003015246` unchanged. Forward successor
`20261003055918_synthetic_ai_terminal_effect_journal_reconciliation.sql` requires
empty recovery/continuation authorities and both provider runtimes off. It binds
exactly one matching failed-command journal by immutable FK and full-row canonical
hash, rejecting missing, additional or mismatched rows before recovery or replay.
Every existing identity, no-debit/no-output and spending guard remains. Only
mechanical migration-tip bindings advance; historical rows remain unchanged.

Executed local evidence: all eight focused PostgreSQL scenarios passed, including
fresh/populated migration, reproduced predecessor failure, journal-field/missing/
extra/canonical-hash denials, replay, concurrency, complete history preservation,
unchanged effect limits and reapply. Both disposable databases were dropped and
confirmed absent. The tail contract passed 8/8 and the affected migration contract
passed. An initial fixture provider-on precondition failure is retained; the
fixture now disables providers during migration and restores only its prior local
state afterward. Corrected exact-candidate CI and hosted execution remain pending.

Candidate `403c5ad` passed the new recovery cases in CI, but retained full-chain
database runners failed while installing the successor with their historical
provider-on defaults. This is a confirmed test-setup defect, not a paid-provider
failure. The shared disposable-test helper now disables both provider flags only
while installing that exact successor and restores each fixture's previous flags
afterward. Full-chain callers use that helper; production SQL and provider guards
are unchanged. The failed runners passed locally: Studio Artifact 16/16,
Enterprise Intelligence 30/30, and all retained Transcript Flow assertions. All
disposable databases were cleaned. Their test loaders normalize Windows line
endings for migration-source drift checks. All 17 affected scripts parsed and
the diff check passed. New exact-head CI and hosted execution remain pending.

The private browser now waits for the selected artifact/package/hash/assessed
lineage. A delayed-projection check observed generation disabled until the exact
empty joined BRD loaded, with zero paid requests. The earlier screen showing the
previous selection is retained as failed inspection evidence.

No continuation is activated and no new paid effect occurred. Both runtimes are
off; six consumed debits plus carry retain USD 3.6980752 under the original USD 10
cap. The successor is not deployed. Its new candidate needs the dependency-risk
exception rebound before hosted recovery and paid execution. The two-effect limit
and no-automatic-paid-retry rule remain. Rollback withholds activation or disables
provider execution while preserving every historical row.

## Joined paid-AI validation continuation (2026-10-03)

AP explicitly approved using the retained assessed-handoff BRD draft after live
readback corrected the initial mixed-source/PDD assumption. The binding requires
`source_mode=assess_handoff`, assessed lineage, the exact accepted handoff and
package hash, and an empty BRD aggregate; mixed and independent packages are
excluded. This does not authorize another effect or increase the original cap.

AP authorized real paid AI validation with a maximum USD 10 on 2026-10-03.
This continuation conservatively retains the ORIGINAL cumulative USD 10 ceiling,
all historical charges and the same campaign. PR #264 is merged as
`2f8208420ec3b40c03ea50f92e7bb9746142eef9`; its 84-step provider-free acceptance
and post-merge CI passed. Those results are not real-provider quality proof.

The first paid pass is exactly one fresh provider validation followed by one BRD
generation from the retained Assess → Govern → Studio source package. It uses the
existing first-party OpenAI configuration and pinned model only. The maximum new
conservative charge is USD 0.9429184, giving an aggregate ceiling of USD 4.6409936
for this pass, below the unchanged USD 10 campaign cap. Assess remapping,
independent Studio extraction, other document types/providers and automatic paid
retries are outside this two-effect window.

Read-only architecture, security and quality reviews closed before writes.
The dedicated `avalaos-ai-synthetic` project was resumed under this authorization.
Hosted preflight confirmed migration tip `20260923190853`, one expired enabled
campaign, one expired renewal, six consumed currency debits, exactly
USD 3.6980752 retained, both provider runtimes off, and one joined source package
with no generated version. Existing provider-free projects remain untouched.

Preflight also found one historical uncertain Assess mapping token reservation
from the 2026-09-23 output-limit mismatch. Its receipt is terminal failed, the
mapping run is claimed, and it has no currency debit, staged output, proposals or
applications. The mapping-specific API cannot reconcile that state. Implement a
service-only, fresh-admin, exact-target no-effect reconciliation with locked
identity and durable no-effect checks, preserving the reservation and failed
history. Only its state/reconciliation metadata may change; no currency charge is
refunded and no old mapping run becomes executable. Any effect, output, identity
mismatch or different uncertainty rejects. Record an append-only reconciliation
record and support exact replay without a second transition.

Read-only preflight additionally confirmed that the historical mapping author
differs from the current Admin operator. Reconciliation authorizes the fresh
operator independently, then binds the original receipt/run/reservation actor,
historical authorization version, token, fence and provider route to one another.
Both identities are retained in immutable evidence. Distinct-actor positive cases,
cross-row identity/version/token/fence denials, and replay lineage-drift denials
passed in the eight-scenario PostgreSQL suite; historical receipt/run data remain
unchanged. No hosted reconciliation or paid effect has occurred.

In the same implementation slice, add one immutable second-and-final approval
window for the original campaign, limited to the two effects above and at most
24 hours. Activation requires the exact retained debit multiset, unchanged carry
and cap, no unresolved reservation or pending ownership transfer, runtimes off,
and fresh exact admin/target/provider/key/route bindings. Installation creates no
paid authority. Reserve and consume bind each new debit to the active window,
reject old permits and operation substitution, serialize concurrent allocation,
and retain the token budgets and irreversible disable control.

Acceptance: focused disposable PostgreSQL fresh/populated recovery and
continuation checks, negative identity/budget/expiry/concurrency/replay cases,
affected contracts/typechecks/static checks, then required exact-head CI and
source-attested synthetic deployment. Apply the canonical pending migrations in
order, with provider execution off. Reconcile the historical no-effect reservation
through the new RPC, independently read it back, and activate the two-effect window
only immediately before actual business testing.

The retained input is a manually declared synthetic AP case with two primitives
(capture and human policy review), an approve/escalate decision, and an incomplete-
request exception. It explicitly does not derive from the earlier AI-ingested
transcript or SOP. The paid BRD must preserve that distinction and its unknown
agent-necessity, volume, effort, and technical-health facts. This pass does not
prove useful Assess extraction or a complete AI-assisted intake journey.

For the paid BRD, verify the exact joined package/handoff/template and source
versions; strict sections and valid citations; grounded roles and rules;
explicit unknowns; no invented interfaces, thresholds or compliance claims.
Reopen the committed immutable draft and compare its version, content and lineage.
Provider HTTP success alone is insufficient. Keep the draft unapproved and do not
perform downstream handoffs. Record actual usage separately from conservative
charges; an invoice is not independently verified.

Stop on the first unexpected or ambiguous result; retain its charge and reconcile
the same operation without a new paid attempt. Disable provider runtimes at the
end or on failure and preserve all data. Rollback withholds activation or disables
the new window/campaign using its existing controls; do not reverse immutable
ledger history. Production deployment and broader readiness are not authorized.
Executed local evidence: all eight focused PostgreSQL 16 scenarios passed,
covering fresh/populated migration, immutable history, guarded concurrent
recovery/activation, identity and runtime denial, ordered effect allocation and
consumption, generation-permit replay denial with both final debits consumed,
expiry, third-effect denial, and migration reapply. Both disposable databases
were dropped and independently confirmed absent. The CI command contract also
passed all 12 checks, and the migration-tail contract passed 8/8. No provider
call or hosted mutation occurred in these tests.
Required exact-head CI, hosted recovery/activation, and the real paid BRD remain
`not run`. No new paid effect has occurred.

## Studio independent-source integration correction (2026-09-24)

Objective: make the already-approved direct Studio source journey operable for a
business author: upload or paste a bounded text source, select exact immutable
Studio-owned versions, lock a bundle, extract grounded facts, review each
candidate, and create a planning-only source package only after complete accepted
coverage. This is a corrective slice in existing Draft PR #264, based on
`a379cf63835654ef8ba383a192df02675e68fc6e`; it is not a new product mode
or a separate documentation PR. The read-only architecture, security, and quality
reviews closed before implementation writes.

Scope is a Studio-specific server command/projection contract, one additive
forward migration, strict client decoder and source/candidate UI, focused
PostgreSQL/API/browser tests, and feature-owned evidence/rollback. Do not reuse
Assess-labelled extraction or candidate-review commands for Studio, grant broad
Assess permissions to Studio roles, relax the existing accepted-candidate
manifest, rewrite accepted migrations, fabricate candidates, or alter Assess
scoring. Provider execution remains disabled during implementation and local
verification. No hosted schema/function/flag/secret mutation, paid retry,
campaign renewal, human approval, PR Ready, merge, or production action follows
from this source correction.

The trust boundary is exact actor/organization/workspace/authorization-version
authority plus a Studio-owned locked bundle, its ordered source-set and source
versions, extraction job and binding, candidate ID/version, and actor-scoped
idempotency receipt. The server derives provider routing/budget authority and
returns only bounded safe status, candidate value, locator and review metadata;
raw documents, storage paths, provider transport, and secrets remain private.
Upload, extraction, review, and package creation are distinct durable actions;
the UI reloads the committed projection before claiming success. Concurrent or
stale operations fail closed, with uncertain provider effects retained for
fenced reconciliation rather than automatic retry. Wrong module, tenant,
workspace, selector, role, revoked session, partial coverage, rejected candidate,
and unselected source must not create a package or extra provider effect.

Acceptance requires a real production-command PostgreSQL chain from exact Studio
bundle through accepted candidate manifest to direct planning-only package;
negative authorization, substitution, replay and response-loss tests; Desktop
Chrome and Pixel 7 browser upload/review/package and scope-switch checks; labelled
file input, live status, focused errors, and zero serious/critical accessibility
findings. Run focused affected tests during edits, then one integrated typecheck,
edge typecheck, workflow/scoring/static-security/build/diff and existing PR C
evidence pass on frozen source. Record exact commands and sanitized results in
this PR. Existing numeric performance budgets remain unchanged; unapproved
provider latency and real-provider semantic quality are `not run`.

Rollout remains default-off and limited to the separately approved synthetic
target only after exact-head CI, source attestation and a distinct guarded
release decision. Rollback disables new Studio source/extraction/review/package
mutations and provider routing while preserving committed sources, candidates,
sets, bundles, packages, receipts, budgets, and audit for read-only recovery and
an additive forward fix. The existing same-campaign sixth effect is not a
Studio-generation allowance: three Studio effects have already been consumed,
and no additional paid attempt is authorized by this correction.

## Focused hosted correction (2026-09-23)

The first renewed-campaign Assess Analyze UI attempt on the approved synthetic
target failed before currency reservation/provider egress because the token
budget reserved 4,096 output tokens while the request used the gateway's
2,000-token default. Preserve its failed receipt and uncertain token
reservation. Keep both runtimes off. The one-line handler correction makes the
request limit equal the existing reservation limit; run focused Assess API,
Edge typecheck, source provenance and exact-head CI once, then deploy only the
changed function with source verification. A fresh user-visible attempt must
use a new operation identity and pass the unchanged aggregate USD 10 guard.
Do not replay, refund or erase the first attempt. Studio's approved-target
author role has separately received only its missing source/template read
permissions; this does not authorize approvals or handoffs.

## Business-workflow-first continuation (2026-09-22)

AP explicitly renewed approval to proceed with the actual synthetic Assess and
Studio workflow, spending conservatively within the ORIGINAL USD 10 aggregate
ceiling. This authorizes a bounded renewal implementation and synthetic-only
rollout, not a reset, new USD 10 allowance, production access, document approval,
handoff, merge, or waiver of the existing exact-head deployment gates.

Read-only hosted preflight found the approved AI project healthy, runtime off,
the original campaign expired, and migration tip `20260917173445`. Retained
charge is exactly 1,340,779,200 USD nanos: 869,320,000 carried plus one consumed
471,459,200 provider-validation debit. The existing process, case, transcript,
source set and input bundle remain; two failed mapping runs have no mapping
debit. There are no Studio artifacts or accepted transcript candidates. Provider
validation is stale. The saved key exists under its approved server-secret name;
the absence of a variable literally named OPENAI_API_KEY is not a missing key.

Architecture, security and quality read-only reviews closed before writes. The
root resolved the proposed three-call shortcut against the actual Studio
prerequisites: independent Studio sources require extraction before document
generation. One implementation worker owns an additive renewal migration and
focused tests; root owns integration, source bindings and the business exercise.
No descendants and no parallel reviewer writes are permitted.

### Minimal renewal and release

Add one append-only renewal window for the SAME campaign ID, at most 24 hours
from its explicit invocation. Do not change the original row, expiry, carry,
cap, debits, failure history or transferred local ledger. Fresh canonical Admin
authority, exact synthetic target/provider/scope bindings, provider-off controls,
the reconciled retained charge and no uncertain outstanding effect are required.
Use forced RLS and service-only execution; reject direct DML, second renewal,
identity substitution and old-permit revival. Reserve and consume must both
enforce the same active window, aggregate cap and one-use authority. Limit this
renewal to SIX additional effects, including validation. At the fixed debit,
the maximum aggregate after this pass is USD 4.1695344, not USD 10 of new spend.

Verify the actual migration on fresh and populated disposable PostgreSQL,
including unchanged history, authority negatives, expiry, replay and final-slot
concurrency. Run only affected tests while editing. Integrate one coherent
candidate with the retained contrast repair and run the applicable boundary/CI
gates once; do not repeat broad suites for each edit. No expired paid call or
deployment around the known CI failure is allowed. After exact-head gates pass,
apply the existing domain-budget migration and the renewal migration to ONLY the
approved AI synthetic project, attest the affected command-function sources and
UI build, then start the renewal immediately before the business walkthrough.
Keep the other synthetic projects and all production targets untouched.

### Observable business acceptance, not proxy test totals

Final read-only quality review confirmed a current UI gap: the Studio source
builder has no upload/exact-bundle extraction/candidate-review controls, while
direct package creation requires accepted candidates bound to every source in
that exact Studio bundle. Legacy single-source extraction cannot stand in for
this binding. Record the uploaded independent-Studio journey as blocked by a
confirmed integration gap; do not insert accepted database rows or claim it
passed. For useful bounded AI output testing, the supported manual-brief path
may instead take the different Studio workshop text and create type-specific
PDD/BRD/FRD planning packages. That proves independent text input, generation and
draft editing only, not uploaded-source lineage or extraction/candidate/source
citation proof. Leave the extraction slot unused: five paid effects at most
would yield a conservative aggregate USD 3.6980752. The six-effect server ceiling
does not require consuming every slot. The missing Studio UI remains an explicit
follow-up implementation finding, not a reason to silently expand this renewal.

1. Reuse the saved Assess process/case/transcript. Upload the missing synthetic
   SOP and existing CSV fixture; create one explicitly selected source set and
   locked bundle. Save one minimal authored primitive first if scalar primitive
   fields are to be tested; a blank-case catalog cannot address not-yet-created
   entity fields. Record this setup rather than claiming AI created it.
2. Validate the existing provider once, then analyze the exact Assess bundle
   once. Compare suggestions to source facts and cell/text citations. Preserve
   unknown values; record missing coverage as unmet rather than regenerate.
3. Edit one grounded suggestion with a reason, accept/reject other appropriate
   suggestions, preview without mutation, explicitly resolve any real manual
   conflict, and apply one batch. Reopen and independently verify the immutable
   version increment, edited values, provenance and unchanged unrelated fields.
4. Use the DIFFERENT retained Studio workshop fixture in an independent Studio
   source set/bundle. Extract once and review candidates; do not substitute
   fabricated accepted rows. Verify actual route/module compatibility before
   paying. Create type-specific packages and generate PDD, BRD and FRD once each,
   reusing the same approved source selection. Edit and reopen draft revisions.
   SDD is unsupported and must be reported as such, not relabelled FRD.
   The confirmed UI gap above prevents this direct-bundle branch currently;
   execute only the explicitly labelled manual-brief alternative for this pass.
5. Check grounded roles, the strict greater-than-USD-5,000 approval rule, no
   payment execution, correct template sections, real source citations and no
   invented interfaces, service targets or compliance claims. No final document
   approval, review-role impersonation, task handoff or Monitor baseline follows.

Six is a maximum for this first pass, not a target to consume. Reconcile the
durable debit after every effect. Stop at the first unexpected failure or
ambiguous result; recover the same receipt/state without an automatic new paid
attempt. Do not perform another validation if the window expires mid-run.
Retain sanitized screen/field expected-versus-actual results, source membership,
versions, receipt outcomes and charge counts. Component outputs and mocked
browser passes are useful expectations, never hosted business-success proof.

Rollback disables only the renewed campaign/routes/provider runtimes and retains
all data, authority and spending history. No further paid call was made during
the read-only preflight; the known CI/contrast and font issues remain separately
recorded release constraints, not fabricated AI failures.

## Resumed execution boundary (2026-09-22)

The immutable campaign expired at `2026-09-19T05:07:16.751Z`. Continue the local,
provider-free implementation and verification below, followed by the authorized
same-branch commit/push and exact-head CI. Do not execute the previously planned
paid UI retry under the expired campaign. A generic continuation does not extend
expiry, reset charges, or authorize a replacement campaign. Runtime remains off;
any further paid acceptance requires explicit bounded approval preserving all
prior charges and the aggregate USD 10 limit. No hosted mutation or paid call was
performed in this resumed local verification phase.

## Post-push browser evidence repair (2026-09-22)

### Subsequent enabled-state Studio contrast repair

The navigation correction was pushed as `c08f42c`. Seventeen applicable exact-head
workflows passed, but retained PR C run `35713213779/1` failed command 48,
`studio-private-browser`: 51/52 browser cases passed; Pixel rendition accessibility
found enabled download text at 3.89:1 against the unchanged 4.5:1 requirement.
The remaining 33 commands did not run. This is not a successful PR C campaign.

Root architecture inspection and completed read-only quality/security reviews
identify a confirmed source defect: `.btn-ghost` animates all properties, so a
native disabled-to-enabled transition retains disabled opacity for 180 ms.
A deterministic production-CSS reproduction captured enabled opacity 0.5 and
3.41:1 contrast without network traffic. All reviewers closed before the managed
workspace-write phase. One worker owns the shared CSS rule, actual Studio browser
fixture/regression and component contract; root owns documentation, provenance,
integration, verification and the existing PR. No nested delegation is permitted.

Limit the shared ghost-button transition to background-color, border-color and
color, preserving their 180 ms easing. Preserve native disabled state and every
capability, loading, read-only, stale, committed-availability and reload-failure
guard. No migration, provider, deterministic-score or authorization change is
needed. Prove the actual held-projection component regression rejects the old
rule before accepting the fix: capture the first enabled frame, assert opacity
one and no opacity transition, then retain the original Axe check. Do not add a
settling delay, retries, reduced-motion override, injected transition suppression,
contrast exception or target exclusion. Source-rule adversaries must reject
restored `all` or explicit opacity transitions.

Require the complete private-artifact client/browser suites, shared Sandbox and
navigation regressions, preview/evidence contracts, catalog, eight static gates,
provenance refresh, patch integrity and independent final review. Then commit one
coherent correction on this branch and require all new exact-head checks. Preserve
the failed c08 artifact and historical font anomalies. Rollback withholds candidate
acceptance and keeps provider execution disabled; it never changes permissions or
loosens contrast checks. No hosted-backend mutation, paid renewal, Ready or merge
follows. Current results are in `docs/quality/studio-enabled-contrast-correction-evidence.md`.

Exact head `0bf6571` passed native Assess CI, independently verified against its
artifact. Preview QA run `35703883723`, attempt 1, failed the local Pixel
`SAFETY-004` reload assertion: an immediate absent-opener probe silently returned
before the shell was ready, then the test waited on the hidden desktop identity.
Three bounded read-only reviews confirmed a harness synchronization defect, not
a product persona or authorization regression. All reviewers closed before writes.

Use one shared test helper for exhaustive Sandbox and controller-navigation
specs. Poll within the unchanged 15-second bound for actual visible mobile
identity, mobile opener or desktop identity, in that priority. Open and verify
mobile navigation when needed, explicitly verify desktop readiness otherwise,
and reject a permanently absent shell. Persona/sign-out consumers must use the
selected branch, never repeat an eager visibility guess. Preserve exact persona,
project durability, denied routes, observer/sign-out/quiescence and source-owned
skips. Bind the helper into affected report source inventories. Add executable
delayed-shell, absent-shell, desktop, open-mobile, tablet-priority and failed-open
regressions; run affected contracts, typechecks, full 38-case Sandbox and two-case
navigation suites before final read-only review and a same-branch corrective
commit. Require fresh exact-head CI; do not rerun away the known defect or change
timeouts, retries, product components or authorization. The expired paid boundary
above and provider-disabled/read-only rollback remain unchanged.

The first full corrected-source local run exposed an additional unattributed
GET/font anomaly, while both reload cases passed. Preserve that failed 37/1 run
and its 30 unchanged skips. The bounded diagnostic addition may return only fixed
known-origin/path/redirect enums after an enforcement rejection; it must not
affect allowlist decisions, observer lifetime, sample bounds or zero-violation
assertions. Execute the actual classifier/diagnostic source in adversarial tests,
reject raw-data mutations, then perform one fresh no-retry full invocation. A
non-reproduction remains an unresolved historical anomaly, not a fabricated
root cause or permission to broaden allowed traffic. No product changes follow.

The diagnostic full run retained 36 passes, two failures and 30 skips: direct
Google font-asset `/l/font` requests were rejected in both accessibility projects.
Their declaration ancestry is not established. Subsequent actual-source Desktop
and Pixel journey diagnostics observed only already-permitted declared assets.
Quality/security reviews agree not to add a path-wide exception. Preserve both
failed attempts and the unresolved anomaly. Complete final-source canonical
validation with enforcement unchanged; stop on a recurrence and investigate its
same-run dependency evidence rather than retrying until green. A clean run proves
only that invocation and does not close the historical font question.

Final local execution passed 38 active Sandbox cases with the unchanged 30 skips,
both navigation projects, 78 contracts, catalog/oracle/observer checks and the
eight static gates. Refresh derived provenance after final documentation freeze,
validate the canonical contract, inspect the exact staged allowlist and commit
the coherent correction on the existing branch. Fresh exact-head CI is required.
If it fails, keep the draft/acceptance hold; do not disable checks or promote the
local result to hosted acceptance. Rollback withholds candidate acceptance and
keeps provider runtime disabled, preserving all failed attempts and prior charges.

## Active domain-budget integration correction (2026-09-18)

Baseline `ca6a616a659ea678a3b5d9a556d916d96d1b50f2` passed all 18 applicable
exact-head workflows and its changed command function was source-verified on the
dedicated AI target. The one subsequent mapping UI attempt failed before provider
access: mapping owns a mapping run, but the shared token RPCs require a legacy
Enterprise job. Independent read-only architecture, security and quality reviews
also confirmed that Studio's committed Studio receipt cannot satisfy the campaign
ledger's Enterprise-only receipt FK/assertion. Earlier green checks and claim-only
bridges do not prove either complete production chain. Both failures are confirmed
source defects; no external authorization bypass was demonstrated.

All three reviewers closed before the workspace-write implementation phase. One
worker owns one CLI-created forward migration and the narrow mapping runtime
adapter; a second owns provider-free real-SQL production-chain regressions. The
root owns integration, migration-tail reconciliation, CI, active documentation,
full validation and acceptance. No descendants or concurrent reviewer writes.

The frozen remediation matrix is:

- Add `assess_mapping` to the shared token ledger's exclusive identity union,
  backed by the actual mapping run and Enterprise receipt. Preserve legacy and
  Studio identities and the same daily/monthly aggregate limits. A dedicated
  reserve/settle/uncertain/release quartet must bind exact scope, actor, receipt,
  authorization version, run, execution fence and provider plan. Reserve checks
  current case/bundle/source lineage, flags, route, key, validation and role;
  post-effect accounting must remain possible after mutable authorization changes.
- Make mapping recovery budget-aware. Reserved/uncertain/settled authority cannot
  grant another provider effect. Staged output finalizes without a paid retry.
  Only proven released-before-effect ownership with no campaign debit may transfer
  to the current fence once. A lost response before consuming that pending grant
  must remain recoverable on the exact same or a newer valid fence; atomic budget
  reserve consumes the grant once. Recovery cannot recreate a consumed grant.
  Existing currency debits remain immutable and may
  conservatively prevent transfer; no refund or inferred no-effect outcome.
- Add an explicit campaign identity union for Enterprise, mapping and Studio,
  with real foreign keys. Derive the kind from exact server-bound operation and
  command type, never a caller flag or fallback. Mapping and Studio currency
  reserve/consume recheck the matching reserved token authority and domain
  currentness. Studio binds its committed request to the actual generating
  attempt, source package, template and execution fence.
- Preserve the single aggregate currency cap across all kinds, existing debit
  contents, carry, fixed charge, expiry, consume-once semantics and provider-free
  targets. Do not fabricate a legacy job/Enterprise bridge receipt, relax generic
  RPC checks, grant approval capability to authors or change deterministic scores.

Acceptance requires actual TXT ingestion/catalog/claim through mapping budget,
campaign permit, mocked production provider, stage, settle and commit; and actual
Studio request/claim through its corresponding complete chain. Assert exactly one
effect/debit and zero additions on replay. Adversarial cases cover scope/identity/
fence/provider/source substitution, missing token authority, shared cap and
concurrency, cancelled/no-effect transfer, transport ambiguity, invalid output,
stage failure and settlement/finalization response loss. Fresh and populated
upgrade, predecessor rejection, reapply rejection, immutable debit preservation,
grants and RLS must be tested. Run focused suites plus canonical feature,
PostgreSQL, retained regression, Desktop/Pixel, typechecks, YAML, AI boundary,
secret hygiene, scoring, build and patch checks. Serialize browser/static builds.

The pre-review frozen source passed all 25 canonical commands, 32 Desktop/Pixel
cases, full fresh/populated migration checks and six retained recovery assertions.
Final reviews found two omitted response-loss cases: unconsumed mapping transfer
recovery and Studio terminal replay after mutable template/provider changes.
Both are now corrected without new effect authority. Actual SQL/runtime regressions
013 and 014 cover those cases; adapter, database decoder and terminal-orchestration
coverage are mandatory. The final frozen source passed all 25 canonical commands,
32 Desktop/Pixel cases and 14 explicit pipeline assertions, plus the full migration
and local recovery checks. Final architecture, quality and security reviews closed
with no remaining blocker in this correction. The active correction evidence
preserves the earlier green boundary rather than relabelling it to the new repairs.
Runtime is disabled, and conservative
aggregate charge remains USD 1.3407792 with zero analysis debit. The immutable
campaign expiry is not extended. After local gates and independent final review,
commit/push this same branch and require new exact-head CI. The resumed expiry
boundary above supersedes the earlier immediate hosted-retry sequence: stop
before hosted changes or paid execution and obtain bounded renewed authority
that preserves the existing aggregate cap, charges and failed-attempt history.
Rollback is provider-disabled/read-only retention, never ledger or failed-record
deletion. Merge, document approval/handoff and production remain unauthorized.

## Active mapping claim correction (2026-09-18)

Executed synthetic UI evidence now proves TXT upload, a locked Assess source set
and input bundle, and one real OpenAI validation. The mapping attempt failed
closed before provider debit: PostgreSQL-owned JSONB hashes were compared with
incompatible compact TypeScript hashes, and SQL omitted null-valued target keys.
The failed receipt, run and catalog are retained; no proposals were created.
Three read-only architecture, security and quality reviews have closed.

The bounded correction introduces a production claim decoder shared by initial
and recovery paths. Preserve database hash authority without changing SQL hashes
or migrations. Validate exact run/catalog identity, coherent state, every target
semantic field and ordered source metadata; normalize only an omitted value whose
expected value is null. Reject substitution before any permit, secret or network
effect. Add a real TXT-parser/request-binding/PostgreSQL/decoder bridge and
adversarial tests, then run the canonical local gates and independent review.

Provider execution is disabled during repair. The local paid ledger is sealed;
the hosted aggregate conservative charge is USD 1.3407792 of USD 10, including
one USD 0.4714592 validation debit and the USD 0.86932 carry. Invoice cost is not
proven. Preserve the immutable campaign expiry and budget; no reset or refund.
Retry only after corrected exact-head checks and synthetic-only source deployment,
using a fresh idempotency key. Do not rewrite the failed history. Rollback is
provider-disabled/read-only mapping with retained data, not destructive cleanup.
Full hosted mapping and Studio UI acceptance remain not run successfully.

## Approved hosted campaign safeguards continuation

AP approved implementing target authority and aggregate-budget safeguards. The
read-only architecture and security reviews are closed; the root owns quality
synthesis and integration. Implementation remains local until the new gates pass.
Preserve all existing provider-free authority rows and false flags. A separate,
initially empty database authority governs only the separately approved AI target.
The separately approved exploratory pause does not authorize deleting its data.
The frozen controlled-human backend remains untouched.

Immutable USD nanos: cap 10,000,000,000; prior charge 869,320,000; debit 471,459,200
per attempted provider effect, including validation. The debit covers pinned-model
full input context (1,047,576 tokens at 400 nanos) and maximum output (32,768 at
1,600 nanos). Nineteen attempts fit at aggregate 9,827,044,800; attempt twenty
must reject at 10,298,504,000. This is authorization, not invoice proof. No refund,
reset, deletion, daily rollover or usage-based reduction. Local paid execution
stays stopped after carry transfer; preserve its original ledger and limits.

Only first-party OpenAI, model `gpt-4.1-mini-2025-04-14`, is allowed. Bind exact
server target, organization/workspace, fresh actor authority, configuration,
route where applicable, private key reference, endpoint, model, operation and
durable attempt identity. Allow only provider validation, Assess extraction and
Studio generation. Legacy arbitrary-key callbacks and environment flags cannot
supply authority. Missing RPC, malformed response, wrong scope or stale authority
blocks before secret access. Reserve a one-use permit before secret resolution;
consume it before network egress, including lifecycle validation/rotation paths.
Existing token budgets remain additional controls.

Integration finding: the retained token-reservation capability mapping expects
`evidence.write` / `docs.approve`, while the intended author has
`assess.v2.draft.write` / `studio.artifacts.generate`. Do not grant authors review
or approval authority to make generation pass. The forward correction must select
the authoring capabilities only for the exact active campaign binding, preserving
ordinary mapping. Token reservation alone never grants provider egress: the
independently atomic currency permit remains mandatory before secret/network.
Failure between the two reservations is conservative, not permission to refund
or bypass either control. Verify the real chained path with the intended role.

One implementation worker owns the CLI-created forward migration, permit module,
runtime integration and focused tests. The root owns active docs, migration-tail
and full-chain integration, and broader verification. No nested delegation.
Verify real disposable PostgreSQL fresh/upgrade and fail-closed reapply rejection
(exact predecessor rejection, transaction rollback, unchanged data and authority metadata), concurrent final-slot
reservation, replay/substitution/double consumption, immutable carry/debits,
wrong target/tenant/workspace/model/endpoint/key/route, expiry, missing RPC and
transport ambiguity. Spies must show zero secret access/fetch on denied calls.
Post-reservation failures retain the debit. Retain gateway/lifecycle/token-budget
regressions, typechecks, static security, secret hygiene and canonical provenance.
Hosted installation and paid browser tests stay not run until these gates and new
exact-head CI pass. Rollback disables only the new campaign/routes and retains
all attempts and evidence. These approved schema/runtime changes supersede the
earlier local-only no-schema scope below, not its historical evidence boundaries.

## Subsequent release approval and execution gates

AP approved same-branch commit/push, exact-head CI and a separate AI-enabled
synthetic environment, then confirmed `avalaos-ai-synthetic` in the existing
organization, Mumbai, at USD 0/month. This supersedes only the initial release,
provisioning and new-target configuration prohibitions below. No merge, document
approval/handoff, production, customer data or existing-backend changes are allowed.

Root read-only release review closed before release writes. Reconcile active
authority, use the canonical PR C builder to refresh current provenance, verify
registry/staged scope, commit and push the same branch, and require exact-head CI
before application deployment. Preserve immutable PR A/B and failed evidence.
Provision the approved empty separate project, then verify isolation before schema,
account, secret or provider setup. Never use a default or production target.

Before real-provider activation, verify server target binding, private key storage,
synthetic identity isolation and durable aggregate budget reservation/settlement,
timeout and replay controls carrying the USD 0.86932 conservative prior charge.
The USD 10 cap applies across local and hosted testing; the local ledger is not a
hosted budget and its call limit remains unchanged. Prefer mocked negatives and
few real calls. Retain uncertain charges and stop before exceeding the cap.
Screen/field evidence must be observed independently of component passes. SDD
remains unsupported and drafts remain unapproved. Hosted results stay not run
until observed; CI is not hosted proof.

Rollback disables new generation/provider routes only on the new target, retaining
records, audit, evidence and charged reservations. Do not reset any backend or
change existing preview bindings. Stop if isolation or budget enforcement fails.

## Approval and objective

AP approved correction of the two real-provider component failures and a safely budgeted synthetic AI test configuration on 2026-09-17. Reuse the saved OpenAI key in memory; aggregate campaign allowance remains USD 10, including USD 0.8460608 conservatively retained from the first attempt. This is one coherent continuation in the existing PR #264 worktree, base `94f318c44d59b20212efe329bca09ab959e0ca63`, not a new PR or a merge/deployment authorization.

The outcome is useful grounded Assess proposals and template-conformant Studio drafts, without relaxing human review, deterministic scoring or provenance validation. The read-only architecture/security/quality wave closed before implementation. One implementation worker owns Studio prompt/template validation and focused tests; the root owns Assess prompting, local campaign controls, integration, documentation and verification. No descendants.

## Scope and interfaces

- Clarify Assess proposal types, exact selector/source binding, confidence/relationship values, source excerpts, and the legitimate empty-result case. Preserve the decoder and BASE64URL default for every non-Studio capability.
- After confirmed live semantic failures and a completed read-only architecture/security review, Studio alone uses privately selected JSON-string source framing: well-formed UTF-16, 120 KB decoded/160 KB serialized bounds, escaped line separators, no caller flag, and no source data in system instructions. This is a fidelity experiment, not prompt-injection immunity or a change to server authorization.
- Normalize system and tenant Studio template structures transiently; describe exact JSON coverage and section schema; validate required IDs/titles/content against the selected template before staging. Preserve legacy readability, strict anchors, selected-source coverage, versioning and all server authorization.
- Correct the observed citation-copy failure with bounded server-assigned anchor references. The provider selects only known references; the adapter expands them to the exact canonical source/locator/hash triples. Unknown, substituted or malformed references reject. Arbitrary titles, source text and locators remain untrusted, and final canonical membership validation is unchanged.
- OpenAI Studio requests additionally use a strict response schema with exact section count and allowlisted IDs/labels. The schema contains no tenant-authored titles or source prose. Other providers do not receive this OpenAI-specific field. The shared gateway rejects its use outside OpenAI Studio before secret lookup; reservation includes serialized schema overhead. Refusal, malformed output, wrong ordering, foreign citations and semantic fixture failures still fail closed, with no automatic paid fallback.
- Add a local-only Node campaign runner. It calls production prompt/adapter/validator functions with synthetic fixtures, not hosted routes or database authority. No HTTP listener, browser secrets, background paid jobs or automatic retries.
- A single locked, durable campaign ledger uses integer USD nanos and carries previous uncertain cost. Reserve full-context worst-case cost before any network effect; retain uncertain reservations across failure/crash; settle validated usage before business-output assertions; reject replay/payload substitution, cap overflow and incompatible model/endpoint/usage.
- Real testing is explicitly opt-in and serialized. CI runs only mocked safety/regression tests. Credentials remain in memory and only the confirmed local key may be bootstrapped; no copied env file, credential logs or provider-response diagnostics.

## Prohibited / preserved state

No schema changes, backend provisioning, hosted provider configuration, deployment, account reset, document approval, handoff, production, AvalaOS.com, customer data, push or merge. The existing exploratory and frozen controlled-human targets remain provider-free. Their marker-to-provider-lifecycle enforcement gap is a residual risk, not permission to add a route. Preserve stash, unrelated marketing/tools/.agent files and the recovery-script edit.

## Failure, concurrency and recovery

Provider output is untrusted. Never coerce invalid coverage or invent missing mappings/sections. Unsupported Assess facts may legitimately yield no proposal. Provider HTTP 200 is not success. Local ledger lock acquisition is exclusive; no automatic stale-lock deletion. Reservation is durable before fetch. Response/model/usage ambiguity retains full reservation and blocks duplicate effects. Same operation/payload replays evidence only; a changed payload requires a distinct attempt and budget. Secret/backend absence blocks before effect. No product/database idempotency proof is inferred from this harness.

## Gates / acceptance

Run focused production Assess, Studio provider/generation/template, and shared gateway suites; ledger endpoint/model/usage/cap/replay/concurrency/failure tests; native feature/regression suites; app/edge typechecks; workflow YAML; AI boundary; secret hygiene; scoring drift; build; patch integrity. Desktop/Pixel retained mapping tests are required where runnable, without provider keys. Record unavailable or not-run gates honestly. No migration test is necessary because no schema changes are planned.

Then rerun bounded real OpenAI checks using frozen synthetic facts, actual Studio material-loading shape, exact model and source fingerprint. Validate grounded descriptions and valid section-specific PDD output before expanding to BRD/FRD and adversarial cases. Retain failed attempts separately. Record input/output usage independently from assertion outcomes; actual provider invoice remains unverified. Full hosted field-by-field integration and controlled-human acceptance remain separate.

## Rollback / evidence

Stop the local runner or withhold its explicit execute flag; preserve its ledger, charged uncertain entries and immutable reports. Disable production generation using existing controls if a later approved rollout fails; never remove validation or restore browser authority. No migration or data rollback is involved. Working-tree evidence does not claim deployed behavior or exact-head CI. Implementation notes and sanitized results travel with this correction; prior output/testing/assess-studio-openai-20260917 remains immutable.
