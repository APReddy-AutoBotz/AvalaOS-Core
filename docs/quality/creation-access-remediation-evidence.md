# Creation access remediation — local verification record

Status: local working-tree verification complete; separately approved synthetic
backend and initial Admin Auth checks executed; joined browser acceptance pending.
Source baseline: `a8548ba74651ff997f970947a86b5156a1463b13` on
`controller/governed-delivery-monitor-pr-c-20260831`.

The first complete runtime/test/execution fingerprint was
`a1fd820c94ea3d9f97c2c22313ef49ae203dc4058ad36f3fc56b2232d5318c4e`
over 1,025 source files. All **25/25 canonical commands** passed at that same
fingerprint. This is working-tree evidence, not a claim that uncommitted changes
are present in the baseline Git head. The manifests retain actual argv, independent
command binding, exit codes, timestamps, bounded sanitized logs and their hashes:

| Group | Passed commands | Manifest |
| --- | --- | --- |
| Authority | 4/4 | [Manifest](../../output/creation-access/validation-authority-e1d99fcc-b4d3-4a25-aa70-a7e508946605/manifest.json) |
| Regression | 5/5 | [Manifest](../../output/creation-access/validation-regression-fbb8f013-ba78-4cf7-a29c-b6bcc5623449/manifest.json) |
| Coverage | 1/1 | [Manifest](../../output/creation-access/validation-coverage-e31fec24-4f98-4327-a975-9b6e4ab73c7b/manifest.json) |
| PostgreSQL | 1/1 | [Manifest](../../output/creation-access/validation-postgres-79f0ba79-8825-464a-a7bd-0e6221a6e177/manifest.json) |
| Browser | 6/6 | [Manifest](../../output/creation-access/validation-browser-d4f48d7c-3c8d-4834-a750-555981ac1239/manifest.json) |
| Static/build | 8/8 | [Manifest](../../output/creation-access/validation-static-cedfc281-90a3-423b-b413-8ba471850415/manifest.json) |

These are command-execution records, never synthesized per-Test-ID outcomes.
Documentation and the regenerated PR C source-provenance index are explicitly
outside this runtime/test fingerprint; final current-source provenance is checked
separately after documentation reconciliation. Closed historical evidence is not
rewritten or relabelled as current-head proof.

## Executed integration checks

The first complete local browser regression pass executed **144 tests, all passed**:
Admin 22, Assess 48, Application Portfolio 6, Studio 14, Enterprise 20,
Delivery/Monitor 34. Every suite included desktop and Pixel profiles. These are
synthetic browser/network-fixture assertions, not real hosted Auth or database
login. Assess includes create-process → V1 draft save → reload; existing V2 tests
separately exercise create/save/resume/finalize and the optional approved V1 import.
New modal/Admin assertions include keyboard focus and recovery, busy/error/uncertain
states, no overlapping effects, serious/critical Axe checks and viewport overflow.
They do not constitute complete accessibility certification.

Disposable PostgreSQL 16 passed **166 assertions**: process creation 54, synthetic
Admin 109, populated upgrade 3. All 74 migrations applied. Tests include actual
two-client quota races, audit failure rollback, RLS/ACL isolation, changed replay,
stale/revoked authority and old-data preservation. The runner verified ownership
before removing only its temporary container and memory-backed databases.

Portfolio focused coverage passed at **96.57% lines / 81.59% branches / 95.77%
functions** for its existing four-source domain/client/command/DB inventory.
Its component assertions also passed; this percentage is not React UI coverage.
The new creation-access gate passed **42/42 focused tests**, with all eleven
selected contract/client/handler/adapter/ingress sources reported. Measured
coverage is **96.44% lines / 82.05% branches / 87.88% functions** against 90/80/85.
Three adversarial runner tests reject incomplete or missing coverage inventories.
These percentages do not include App/React integration or all process-service
orchestration; their browser/authority tests are separate. The endpoint's
individual branch coverage is lower than the aggregate and must not be described
as individually meeting the aggregate threshold.

Product-action policy 19/19, process contract/client/command assertions, Admin
contract/endpoint/client/Auth assertions, operator-bootstrap mocks, browser
lifecycle checks, global typecheck, view/navigation guards, tenant authority,
Admin workbench and workflow YAML passed in focused runs. Scoring-integrity passed
with its accepted source unchanged. Secret hygiene passed: zero forbidden hits
and zero tracked environment files. The final canonical reruns include all
bounded-transport, modal scope, ban recovery, role and password-limit corrections.
The combined retained-evidence/identity/provenance/verifier, browser-lifecycle,
runner and committed-patch tests passed **88/88**. Scoring-law adversaries passed
**9/9**. The catalog/traceability/provenance/adversarial/oracle command passed with
108 source-backed catalog branches and ten explicit composites; this is catalog
integrity, **not 108 runtime acceptance passes**. PR C CI and current evidence
contracts passed; the 80-command/218-assertion registry was rebound, not rerun as
an 80-command acceptance campaign.

## Failed attempts and corrective work

- Sandbox Chromium launch failed with `spawn EPERM`; the approved local suites
  ran successfully outside that spawn restriction. No sandbox run was counted PASS.
- The first Admin browser run stopped after a stale expected message; exact
  active-state assertions were corrected. The complete 16-case rerun passed.
- An old nested Playwright preview teardown hung. The new Admin mode uses the
  retained owned-server runner; only the verified task-owned preview was stopped.
- PostgreSQL preflight found test expectation drift and actual SQL issues
  (`max(uuid)`, search-path-dependent hashing and lock-order concerns). Corrections
  preceded the successful complete 106-assertion run; failed attempt logs remain.
- A stale user-profile npm shim failed before tests; the installed Node/npm path
  ran the canonical scripts. Injected terminal Git settings caused the strict
  scoring check to reject; a child-only clean environment passed unchanged source.
- AI-boundary fixture line references and synthetic bootstrap selector literals
  were corrected without broadening production secret/storage permissions.
- Coverage setup initially matched no Windows source files. The new gate requires
  every mandatory source row and refuses empty-inventory “100%” results. It exposed
  genuine untested failure paths; meaningful transport/ingress tests were added
  before the eleven-source gate passed.
- Deeper transport tests found unbounded new Admin RPC waiting/body consumption.
  Both new mutation adapters now have eight-second deadlines and 32KiB response
  caps. New endpoint ingress is also deadline/byte bounded before Auth/SQL effects;
  tests cover stalls, unresolved cancellation, invalid UTF-8/JSON, oversized
  streams/headers and valid escaped Unicode. Retained shared transports were not
  changed. The new process receipt SHA-256 uses built-in PostgreSQL primitives,
  independent of extension schema; the complete 106-assertion database rerun passed.
- Final review found lost-response Auth-ban recovery, missing governed role
  capabilities, and unaudited uncertainty/confirmation transitions. The correction
  adds max-three exact-ID claims, fenced leases, observed Auth ban confirmation,
  duplicate-safe correlated audits, and least-privilege Studio/Delivery presets.
  PostgreSQL executes the revoked subject's next process command with its old
  authority and proves denial with zero process, receipt or audit effects.
- The first corrective PostgreSQL run expected a thrown exception where the
  command correctly returned a fixed `PERMISSION_DENIED` envelope. The test now
  requires that exact envelope and zero effects; the complete 166-assertion rerun
  passed and its owned container was removed.
- Official Auth validation revealed a 72-byte maximum while the new form accepted
  128 ASCII characters. Shared UI/server limits now reject 73/128-character values
  before identity, SQL claim or Auth effects; boundary and browser assertions pass.
- The initial command runner checked script names against mutable package contents.
  Independent reviewed content now binds top-level and nested scripts, rejects
  pre/post hooks and substituted/skip commands, strips ambient secrets/injection,
  and redacts before console emission. Exact committed-patch CI validation rejects
  a committed whitespace defect even when bare worktree diff reports clean.
- Joined-flow preparation exposed a real Admin navigation defect: the sidebar
  opened Enterprise Intelligence, while navigation persistence accepted only a
  legacy Admin label. Two actual-App Desktop/Pixel positive tests failed before
  correction; the denied-role tests passed. Sidebar-only correction still failed
  the positive tests. Admin now opens Organization Workspace/Admin Workbench and
  persistence uses supplied server capabilities, including empty-projection
  denial. The corrected actual-App tests also require reload, fresh roster fetch,
  serious/critical Axe clearance and no viewport overflow. Original failed browser
  artifacts remain under `output/creation-access/admin-navigation-before-fix/`.

## Independent final review

Architecture, quality and security reviewers completed read-only after writers
froze the corrective source. All three found no remaining local-source blocker
in the bounded repair. Quality's remaining count/provenance reconciliation is
handled by this active record and the final current-source checks. Their source
reviews do not promote hosted, human, provider or deployment readiness.

The exploratory rollout must retain zero provider configurations and real keys.
`studio.artifacts.generate` is governed action authority, not proof that a
provider is configured or that generation is provider-free. The synthetic Admin
target's no-provider marker is not a Studio gateway egress control. Any later
synthetic generation needs a separately verified server-enforced provider-free
path at the approved target; otherwise generation stays `not run`. Existing
PR264 controlled-human generation/evidence endpoints must not be repurposed.

## Boundaries

The first local verification phase performed no hosted action. AP subsequently
approved the isolated exploratory target, bootstrap and necessary preview setup;
its separately executed work is recorded below. The existing PR264 exact-count
backend and historical signed evidence remain unchanged. Production, customer
data, real-provider calls, AvalaOS.com and merge are outside this approval. Human
acceptance still requires actual people; simulated personas do not replace them.
The stash and unrelated marketing/tools/generated user state remain outside this
work. Joined Admin → real author Auth login → process → V2 save/reopen, exact
new-head CI/preview and final AP merge confirmation remain separate requirements.

## Approved exploratory preparation and deployment preflight

AP confirmed the quoted $0/month new synthetic project in the selected organization
and Mumbai region, and authorized pausing MockMate while preserving its data.
MockMate was confirmed paused; the existing PR264 backend was untouched. A separate
Netlify draft-only site was created with only public `dev`/`builds` settings.
No provider key or service-role credential was put in Netlify or browser state.

Independent empty-target verification ran before writes: zero Auth users, public
application data, provider configurations, synthetic Admin targets or PR264 exercise
history. The canonical CLI migration run initially stopped at the retained Studio
migration because hosted pgcrypto lives in `extensions`. The existing reviewed
`ensureHostedPgcryptoCompatibility` behavior was applied through a narrowly gated
private transaction: native extension checks, known digest vectors, two wrappers,
no PUBLIC/anon/authenticated execute, service-role only. No extension moved and no
canonical migration or history record was rewritten. Resume applied all 74 exact
migrations, tip `20260915142942`; staged bytes and canonical history matched.

The independent post-migration preflight is retained at
[preflight](../../output/creation-access/exploratory-preflight-a6c83860-69b7-4366-a339-2674631e8d39.json).
Its helpers passed seven adversaries. One exact initial Auth UUID was then created
through Auth Admin API, followed once by the service-only operator bootstrap.
Private durable claims precede each effect; uncertain responses require exact-ID
observation, never a new identity. Only Windows CurrentUser DPAPI-encrypted login
material is retained locally. Independent SQL verified one Auth user/profile/org/
workspace, four non-Admin presets, one enabled exact target, zero provider configs
and no fixed-exercise records. The one-time bootstrap helper passed seven mocks.

Only `tenant-session`, `synthetic-admin`, `process-command` and `assess-v2-command`
were deployed, with JWT verification enabled. The deployment source graph contains
41 sources, digest `df82d49fac33e9c69f53dd0fde2be4633e1c987278b2ef5f2f4767f29efbe85b`.
Import preflight caught a type-only extensionless `../types` in the new process
contract. The explicit `../types.ts` correction and real four-entrypoint graph
regression passed with the retained resolver tests, 30/30. This is source packaging
and deployment evidence, not browser or provider execution proof.

Initial login failed because the CLI's provider-specific email `enable_signup=false`
disables email login too. Public settings confirmed that state; Auth user checks
showed an actual confirmed, password-bearing, unbanned account. Only the email
provider flag was enabled; global signup, anonymous login and phone login stayed
disabled. See [the upstream configuration explanation](https://github.com/supabase/supabase/issues/40582).
The failed attempt is retained, not relabelled. The subsequent real operator check
passed eleven owned assertions: exact Auth grant/user, exact tenant/Admin authority,
private target match, empty roster, signout and rejection of the retired refresh
token, plus bounded setup/egress assertions. Its evidence is
[operator login](../../output/creation-access/exploratory-login-e8b66b5b-2946-4d41-94b3-246c28bf0321.json).
Seven helper mocks reject substituted scope/subject, fake roster and leaked error
payloads. This is real API verification, **not** browser PASS or an assertion that
logout immediately revokes every previously issued JWT.

Hosted security advisors returned zero ERROR notices, 143 closed-RLS INFO notices
and 36 security-definer execution WARN notices (two anonymous, 34 authenticated).
Intentional guarded projection/attestation and trigger functions require individual
classification; do not remove authorization or grant table policies to silence
these warnings. They do not justify a security-clean claim. Remediation references:
[anonymous execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Complete post-packaging local rerun

All **25/25 canonical commands** passed again at the corrected fingerprint
`cc9d532a8bbfd9d72ba53c5c23d40e03aeba348af371f484a841f6bb0f70c73e`.
Counts remain 144 browser tests, 166 PostgreSQL assertions and 42 critical-source
coverage tests (96.44% lines / 82.05% branches / 87.88% functions). The disposable
PostgreSQL container and memory-backed databases were verified and removed.
No old manifest is promoted to the new fingerprint.

| Group | Passed commands | Manifest |
| --- | --- | --- |
| Authority | 4/4 | [Manifest](../../output/creation-access/validation-authority-99ce310e-a992-4f52-9d19-5c05f1d8b611/manifest.json) |
| Regression | 5/5 | [Manifest](../../output/creation-access/validation-regression-7eba5e78-8ce9-4a19-bde0-e0cf64d8ebfd/manifest.json) |
| Coverage | 1/1 | [Manifest](../../output/creation-access/validation-coverage-c079d864-b2c8-44f1-97ac-07d40731ca0b/manifest.json) |
| PostgreSQL | 1/1 | [Manifest](../../output/creation-access/validation-postgres-1960b68b-1a78-42cd-bf7b-d637daf4345d/manifest.json) |
| Browser | 6/6 | [Manifest](../../output/creation-access/validation-browser-df186a94-fa83-4551-ae7c-b3ce8bd6b022/manifest.json) |
| Static/build | 8/8 | [Manifest](../../output/creation-access/validation-static-04c23fa4-14b7-477d-8cdb-1cf5e0ce0dc2/manifest.json) |

## Complete Admin-navigation corrective rerun

All **26/26 canonical commands** passed at runtime/test/execution fingerprint
`9ae4bf626eb2dd35be2ffe50fadd7d0cd9a14d20fd25c46d81a8ee6dd2672319`.
The added regression command tests persisted view authority. Browser counts are
now **148/148**: Admin 22, Assess 52, Portfolio 6, Studio 14, Enterprise 20 and
Delivery/Monitor 34. Four added actual-App Desktop/Pixel tests cover reachable
Admin Users / Roles with reload and denied navigation with zero roster requests.
Database and critical-source coverage counts remain 166 and 42 respectively,
with measured coverage unchanged at 96.44% / 82.05% / 87.88%.
Typecheck, Edge typecheck, YAML, AI boundary, secret hygiene, scoring and build
all passed. These are local source-bound results; exact committed-head CI and
the real hosted joined browser journey are still separate gates.

| Group | Passed commands | Manifest |
| --- | --- | --- |
| Authority | 4/4 | [Manifest](../../output/creation-access/validation-authority-f9178f9f-0723-4ce1-942f-b0d07e468ff6/manifest.json) |
| Regression | 6/6 | [Manifest](../../output/creation-access/validation-regression-21e7ba5c-4f48-4f23-ad5f-63471e8cc4c1/manifest.json) |
| Coverage | 1/1 | [Manifest](../../output/creation-access/validation-coverage-b7b737fd-bd7e-4460-a687-dc5c8bf05205/manifest.json) |
| PostgreSQL | 1/1 | [Manifest](../../output/creation-access/validation-postgres-7d9e2361-5daf-4d4b-9aa4-ee2b5bc7d211/manifest.json) |
| Browser | 6/6 | [Manifest](../../output/creation-access/validation-browser-f8c74237-3647-4ac2-a5b9-0b7a9bf7c4b9/manifest.json) |
| Static/build | 8/8 | [Manifest](../../output/creation-access/validation-static-11e4cd8f-8379-4d21-b989-baac96608953/manifest.json) |

## Exact committed-head CI corrective continuation — 2026-09-16

Commit `03592bba35fd79c65155c04c48b6d52e4dc86298` was pushed on the existing
PR #264 branch after explicit staged-file inspection (92 intended files). Protected
unrelated local state and the stash were not changed. The working-tree local results
above remain bound to their original fingerprint; they are not relabelled as the
corrective continuation's exact source proof.

Four CI workflows exposed three confirmed source defects. PR C's migration contract
still required the frozen human tip to be globally last. Pilot Operations rejected
the new ledger tip because the identity marker was stale. Exhaustive acceptance and
preview contracts assumed `id` was the first input attribute, despite a valid label
association. Artifact failures in these runs were downstream, not independent causes.

Correction uses one shared exact successor allowlist, label/field matching that
preserves missing/mismatched/data-id negatives, and a new strict forward identity
migration. No already-applied SQL is rewritten. Feature-owned validation expands
to 27 commands and includes retained Pilot Operations in the disposable PostgreSQL
runner. New-source local results and exact-head CI must be recorded separately.

The final source security review covered 70 intended source files with no introduced
finding; 74 unrelated generated files were explicitly excluded. The scan tool's
sealed coverage artifact retained an earlier deferred discovery marker, so that
artifact is partial and is not represented as complete security certification.
Independent reviewer findings are retained separately. The private browser harness
has 12 passing mocked tests but has not executed the joined hosted journey.

The first isolated Netlify draft upload timed out. Read-only reconciliation returned
zero deploys; a later preflight also timed out before a second claim. Both outcomes
remain unsuccessful. No app was published, no user browser seed was created, and no
old PR #264 or production backend was changed.

## Complete retained-CI corrective local rerun

All **27/27 canonical commands** passed at runtime/test/execution fingerprint
`6aaa866e7f2fd63c8f52737941812bed1e6996b521c8b7402fd9e5af9c533687`.
Independent readback verified all 27 log digests, canonical command bindings,
successful exit codes and stable-source flags. Browser results are **148/148**;
critical-source coverage is **42/42** tests with 96.44% lines, 82.05% branches and
87.88% functions. PostgreSQL executed **172 counted feature assertions** (54 process,
109 synthetic Admin, three upgrade and six forward-migration rejection/no-effect
assertions), plus the retained Pilot Operations fresh/upgrade suite. The complete
75-migration chain passed locally; the owned disposable container was removed.

| Group | Passed commands | Manifest |
| --- | --- | --- |
| Authority | 5/5 | [Manifest](../../output/creation-access/validation-authority-1286ab82-5840-4057-9ceb-d2533248c673/manifest.json) |
| Regression | 6/6 | [Manifest](../../output/creation-access/validation-regression-f0c12478-3135-429d-9e07-01e3c0c51ec4/manifest.json) |
| Coverage | 1/1 | [Manifest](../../output/creation-access/validation-coverage-7cbc3e3b-a5ec-497b-a3a9-5da8f33eb4d9/manifest.json) |
| PostgreSQL | 1/1 | [Manifest](../../output/creation-access/validation-postgres-506c2ce8-48e9-4c40-91ab-68692b2cbb18/manifest.json) |
| Browser | 6/6 | [Manifest](../../output/creation-access/validation-browser-85fec8c8-31ef-4b3f-8400-aad62386545a/manifest.json) |
| Static/build | 8/8 | [Manifest](../../output/creation-access/validation-static-8e9c8208-59e4-4f49-ab6a-279b7b1c4a4d/manifest.json) |

Additional evidence/scope/browser-runner adversarial tests passed **75/75**.
Private deployment-gate and browser-harness mocks passed **20/20**, including
exact current workflow attempt, skipped-step rejection, full immutable asset
binding and order-independent unique saved-primitive readback. These mocked
tests do not establish hosted execution. Final independent corrective quality
and security reviews found no remaining source blocker within this delta.

This is local source-bound evidence, not exact committed-head CI, joined hosted
browser, three-human acceptance, whole-platform or production proof. The existing
controlled-human backend and its evidence remain untouched. The new forward
migration still requires independent hosted verification on the approved separate
exploratory target; no already-applied migration is edited or replayed.

## Subsequent executed exploratory proof — exact head 3352f5ff

The preceding records retain their original boundaries. Subsequently, commit
`3352f5ffeb08d493ec6202ce65dae28608e07502` passed creation-access workflow
`35012042565`, attempt 1, job `104526137204`. The approved separate synthetic target
received only the new forward migration after an exact one-migration dry run;
independent SQL readback confirmed all 75 migrations, the final marker and false
production/customer/provider authorization flags. The old PR264 target was not
changed. No production site or custom domain was published.

The isolated draft's complete 56 public build assets were independently bound to
that head, source fingerprint `6aaa866e7f2fd63c8f52737941812bed1e6996b521c8b7402fd9e5af9c533687`,
the exact successful CI attempt and the draft's unpublished deployment metadata.
The real browser then executed Admin login, bounded author reservation/activation,
Admin signout, fresh author login, process creation, V2 creation, draft save,
fresh-context saved-draft reopening and final signout. Thirteen facts passed;
observed requests were 71 site and 60 backend, with zero violations. Twenty known
external static resource requests were blocked, never treated as provider access.

Independent SQL readback matched two Auth users, one active author, one process,
one V2 case, two versions, one authored primitive at the current saved head, three
successful command receipts, six successful audit actions and zero provider
configurations. The verifier compared actual tenant/workspace/login digests,
request/idempotency digests and process/case/version ownership against the observed
browser ledger. Six synthetic verifier tests additionally rejected wrong scope,
stale source, missing/fake receipts/audits, provider configuration and stale saves.

- Browser: `output/creation-access/exploratory-browser-0e76bc3f-a1cc-4399-8c6f-b208b3ee27be.json`
- SQL: `output/creation-access/exploratory-database-readback-3352f5ff.json`
- Cross-check: `output/creation-access/exploratory-database-verification-b7123534-653e-4a2c-a29f-292d76d83aab.json`
- SQL proof SHA256: `359dcbb35f65901ac9816eb9ab7c8bdd760a5b070e5ba2325158537d8c3a3fa7`
- Browser report SHA256: `ea3f93393b56b8f126ecf7e10eb19d388f789bea8a0ca7a0c73608c79bebe327`

Earlier CLI draft-upload timeouts/argument rejection, a pre-execution module-cycle
failure, and the first browser static-resource guard rejection remain failed or
not-run attempts. The latter stopped after Admin login; independent SQL proved
zero account/process/case mutations before a fresh attempt. Its unused encrypted
author fixture and ledger were quarantined, not deleted or promoted. The corrected
observer still rejects unknown/provider requests and remains active through signout.
Credentials remain local encrypted artifacts; the manual viewer requires a real
interactive terminal and explicitly identifies the tested immutable build.

This proves the narrow exploratory Admin/author/Assess journey only. Studio,
Delivery, provider execution, whole-platform hosted acceptance and the distinct
three-human controlled exercise remain unproven on this target. Fifteen applicable
workflows passed on this head, two failed, and hosted-live acceptance was skipped.
The failures exposed an App presentation exception on intentionally blocked routes
and a retained fresh-chain PostgreSQL assertion expecting the old migration tip.
The newer corrections require their own verification; the 3352f5ff hosted proof
is immutable and must not be relabelled to them. No merge or readiness is claimed.

## Blocked-route and fresh-chain corrective verification

Read-only quality/security findings completed before implementation. The full-chain
assertion now derives its expected marker only after strict approved-tail validation;
the old controlled-human and partial-upgrade tips remain unchanged. The retained
PR C PostgreSQL suite also runs inside the bounded creation-access PG16 container.
Its first corrected run passed all feature, retained Pilot Operations and PR C
fresh/upgrade/populated/dirty-history checks; the emitted fresh marker was actually
`20260916003000` before the registry expectation was updated. All owned databases
and the memory-backed container were removed. Result:
`output/creation-access/postgres-53a62941-580b-4959-9933-3c62a11d73af/result.json`.
This focused run does not substitute for the final stable-source matrix or CI.

The final corrective local matrix subsequently passed **28/28 commands**, all
bound to `cea443771d67540f39c6bd60b611ee4af742d4e5842c0a02ea50ab8455ca0997`.
Independent readback reconstructed the entire current source inventory and checked
each canonical script/dependency/argv, successful exit, stable-source flag and log
SHA256 against it. Browser totals are **156/156**: Admin 22, controlled-route 8,
Assess 52, Portfolio 6, Studio 14, Enterprise 20 and Delivery/Monitor 34.
Critical-source coverage remains 42/42 tests at 96.44% lines, 82.05% branches and
87.88% functions. PostgreSQL includes all 172 counted feature assertions plus
retained Pilot Operations and PR C suites. Typecheck, Edge typecheck, workflow YAML,
AI boundary, secret hygiene, frozen scoring regression/drift and build passed.

| Group | Passed commands | Manifest |
| --- | --- | --- |
| Authority | 5/5 | [Manifest](../../output/creation-access/validation-authority-47d730b7-23fd-41dd-a728-3c04f14590c0/manifest.json) |
| Regression | 6/6 | [Manifest](../../output/creation-access/validation-regression-de2554bc-301b-4e7d-bbe3-c498db8b51b1/manifest.json) |
| Coverage | 1/1 | [Manifest](../../output/creation-access/validation-coverage-04e55025-e1af-4989-aaca-9d87a5403e80/manifest.json) |
| PostgreSQL | 1/1 | [Manifest](../../output/creation-access/validation-postgres-55e94c93-4d2b-4c5d-8c9d-c3d546e68b10/manifest.json) |
| Browser | 7/7 | [Manifest](../../output/creation-access/validation-browser-fd83a09f-49d2-4b31-b2fb-e78bdc7b9fff/manifest.json) |
| Static/build | 8/8 | [Manifest](../../output/creation-access/validation-static-3e1e1d11-85d7-4dd3-8f9c-88c32ed59352/manifest.json) |

The first new local route test attempt passed 7/8 and exceeded its 45-second cold
Vite timeout on the remaining desktop case. That fixed-path JSON was overwritten
by its rerun; only the tool/session output retains the failure. Subsequent runs
use unique invocation paths and a 90-second test containment limit, not a product
performance claim. Hardened reruns and the final matrix passed 8/8; signal/timeout
and unconfirmed child cleanup cannot report success. The spec runs the real App,
asserts the blocked banner/disabled sign-in/no workspace, and denies backend and
external network requests with repository env loading disabled.

Final independent quality/security reviewers found no confirmed blocker in this
delta. An already-restored-user denial case and unexpected post-readiness Vite
exit were noted as optional coverage refinements, not weakened authority gates.
Catalog/provenance adversarial checks still validate 108 source-backed branches
and ten explicit composite cases; this is source ownership, not 108 hosted passes.
The source hash changed for App only; ownership and coverage labels were not
promoted. No original evidence was relabelled. New committed-head CI/preview and
the three-human gate remain separate pending boundaries at this local handoff.

Final evidence-contract reconciliation found that the newly added browser config
was absent from PR C's exact root-config inventory. The only post-matrix
runtime/test source change is `scripts/checkTranscriptFlowPrCCiContract.mjs`:
register that exact file and advance the inventory count from 22 to 23. A fresh
independent per-file comparison confirmed every other matrix source byte is
unchanged. Current fingerprint:
`953fa38adc71384ff9b459045646680d514499e23dc44833c49ce1826a3be0d6`.
The prior 28-command artifacts retain their original fingerprint, not this one.
The inventory still rejects unknown/missing/duplicate configs and requires literal
disabled Git capture in all 23 configs; independent quality review found no
weakening. Focused follow-up passed PR C evidence contracts **54/54**, preview
profile/evidence contracts **77/77**, and real loopback route-failure checks
**14/14** across Desktop/Pixel, with zero external requests. A restricted browser
launch was denied before those route checks; the permitted isolated rerun passed.
These are local checks. Exact committed-head CI will execute the complete current
source again and remains required before PR acceptance.

## Exact c038bbd CI and retained Sandbox fixture diagnosis

Commit `c038bbd2a6c3c8ff861fd0dcc22d46eea5cb364c` was pushed to the existing Draft
PR #264. Creation-access run `35019735662`, attempt 1, job `104552148602` passed
all 28 canonical commands. Independent artifact readback verified all six groups,
the exact committed head, complete source inventory, canonical commands and argv,
zero exit codes, stable-source flags and every log SHA256 against fingerprint
`953fa38adc71384ff9b459045646680d514499e23dc44833c49ce1826a3be0d6`.
The downloaded artifact is retained under
`output/creation-access/ci-c038bbd-creation-run35019735662-attempt1/`.

Fifteen workflows passed, two failed and hosted-live acceptance was skipped.
The previously failing hosted blocked-route assertions passed on the exact new
preview. Preview run `35019735541` and PR C run `35019735530`, both attempt 1,
failed the same local Sandbox step: 10 failed, 28 passed, 30 existing explicit
server-scenario skips. Each project failed SANDBOX-003/004, ASSESS-004, ADMIN-001
and SAFETY-007. Eight failures expected the removed `Admin / Intelligence`
navigation label. Two expected Draft from a newly created Not Started process.
The preview's missing navigation upload was secondary: that later suite never
executed after the failed Sandbox command. These failures are not retried or
relabelled as success. The preview failure artifact is retained under
`output/creation-access/ci-c038bbd-preview-sandbox-run35019735541-attempt1/`.

Independent architecture, quality and security findings agreed on fixture drift.
The correction must prove actual Admin Workbench / Users / Roles access and the
separate Assess -> Enterprise Intelligence unavailable boundary. It must also
exercise an actual saved incomplete legacy assessment, with Draft after reopen,
no deterministic score and no decision pack. Merely changing Draft to Not Started
would not satisfy the original discovery branch. Product/scoring code, all seven
personas, observer coverage through signout, denied-route semantics and existing
server-only skips remain unchanged. Corrective browser and contract execution is
planned, not yet passed in this record; the immutable 3352f5ff exploratory proof
and the distinct three-human gate are not promoted by this work.

### Local execution exposed the actual Sandbox Admin reconciliation defect

The corrected-fixture diagnostic run is retained at
`output/playwright/pr264-synthetic-regression/c038bbd2a6c3c8ff861fd0dcc22d46eea5cb364c/sandbox/64b782a66e8049a26c67f9b684361873/`.
It finished **30 passed, eight failed, 30 unchanged explicit skips**. The real
incomplete-assessment transition passed on Desktop and Pixel. All eight remaining
failures occurred after the actual Admin click: reconciliation returned to
Studio / My Work instead of Admin Workbench. Initial stale-scope suspicion was
not the confirmed cause: App supplied defined empty capabilities in local mode;
the persistence resolver correctly interpreted those as server-only denial.

A second read-only review wave completed before the bounded App/Sidebar fix.
Canonical local data access alone now supplies undefined presentation capabilities;
all server modes retain bound capabilities, including empty denial. All navigation
reconciliation paths share this memo. One guarded Admin callback replaces the
two-callback Sidebar click. Existing server-role forgery negatives remain, with
additional navigation-resolver checks for empty/unrelated/revoked capabilities.
Browser proof must cover the committed tuple, scope changes, reload/history and
non-Admin denial. No runtime scores, server authority, schema or hosted deployment
changed. The general organization-scope rendering path was separately noted as a
suspected defect requiring deeper validation; no data-exposure or mutation bypass
was established by the bounded review. It is not a security certification.

### Executed local Admin navigation correction

The frozen runtime/test/execution source fingerprint is
`7b9a4bf074611e5a162a5b9cae7730cefe03d2a8202a514cfef60f57fd4d52f8`.
These are working-tree candidate results based on `c038bbd2a6c3c8ff861fd0dcc22d46eea5cb364c`,
not results for that unchanged committed head. All five browser invocations used
isolated environments, one worker and separate retained output directories:

| Local suite | Executed result | Retained report |
| --- | --- | --- |
| Sandbox/Desktop + Pixel | 38 passed; 30 unchanged explicit server-scenario `not_run`; zero failures/retries | `output/playwright/pr264-synthetic-regression/c038bbd2a6c3c8ff861fd0dcc22d46eea5cb364c/sandbox/2ccc26ef9bd530956e0f5496c67a1656/playwright-results.json` |
| Navigation history/Desktop + Pixel | 2/2 passed | `output/playwright/pr264-synthetic-regression/c038bbd2a6c3c8ff861fd0dcc22d46eea5cb364c/navigation/e816438a6225e31deae275aa1207ba0a/playwright-results.json` |
| Full-platform local fixture | 16/16 passed; all seven personas plus route boundary on both devices | `output/playwright/pr264-admin-navigation-1ee8fa1b-776f-4cdf-970f-27a834ad3591/playwright-results.json` |
| Synthetic Admin account harness | 22/22 passed | `output/playwright/creation-access/d0561c3639b129135014c6ae/results.json` |
| Real-App blocked controlled binding | 8/8 passed; runner contracts 4/4 | `output/playwright/local-controlled-boundary/b7def086-6b9f-45a7-a8cf-168dd54952bf/results.json` |

The 86 executed passes do not include the 30 skips. The full-platform campaign is
deterministic fixture-only proof, not connected full-platform or human acceptance.
ADMIN-001 proves one actual Admin click from Studio/My Work, project/Delivery and
already-organization scope, exact committed URL/storage without stale selectors,
active navigation, reload/Back/Forward, Users / Roles, and forged non-Admin
URL/storage rejection. Observation remains active through the final signout and
quiescence. Full-platform Workbench, Users and denied Intelligence surfaces retain
their existing accessibility, overflow and navigation-budget assertions.
ASSESS-004 now saves and reopens an actual incomplete V1 Draft, without a score
or decision pack. Its earlier failed diagnostic attempt remains retained.

Authority (5/5) and regression (6/6) canonical groups passed at the same
fingerprint; independent readback checked every command result and log digest:
`validation-authority-d5817dc0-8d31-46f3-ae39-4d1368b0b41d` and
`validation-regression-d726a633-180d-4080-bf56-b64068c342fe` under
`output/creation-access/`. Preview/profile contracts passed 77/77, hosted evidence
contracts 21/21 and PR C evidence contracts 54/54. Full-platform transport/storage
contracts and late post-signout HTTP/WebSocket observation passed. Catalog,
independent oracle and adversarial provenance checks retained 108 source-backed
branches and ten explicit composite cases; no catalog branch was promoted to
hosted PASS. A bare scoring-law check rejected its ambient environment; the
canonical sanitized invocation passed without changing scoring or its guard.

Final independent read-only architecture, security and quality reviewers found
no confirmed blocker in the frozen correction. The React review retained a
canonical local/server dependency in the capability memo and a guarded event
callback instead of effect-based navigation repair. Server empty/stale authority,
runtime modes and server mutation controls are not weakened. Static/build and
coverage completion are recorded separately below before commit. New-head CI
must execute the committed correction; the prior hosted exploratory proof remains
bound only to `3352f5ffeb08d493ec6202ce65dae28608e07502`. The original backend,
provider-free boundary and separate three-human/merge gate remain unchanged.

Static/build (8/8) and critical-source coverage (1/1) subsequently passed at that
same fingerprint, bringing the selected canonical groups to **20/20 commands**.
Manifests are `validation-static-3ebdab7c-a259-42ce-af2d-c0fca69dc5a8` and
`validation-coverage-7d30f412-6565-4205-89d5-3f494eb27531` under
`output/creation-access/`. Both typechecks, workflow YAML, deterministic scoring,
the frozen scoring-law check and build passed. AI-boundary and secret-hygiene
scans found zero forbidden hits and zero tracked env files. Coverage executed
42/42 cases over the unchanged 11 critical TypeScript sources at 96.44% lines,
82.05% branches and 87.88% functions; React and SQL are outside that V8 gate.

No schema, SQL or command implementation changed in this UI/navigation delta.
The separately retained c038bbd PostgreSQL/28-command CI proof is not relabelled;
the new committed-head pipelines must repeat the full relevant database and
retained suites. Final documentation reconciliation refreshes only source hashes,
not assertion ownership, scoring, thresholds or coverage labels. Patch-integrity
and final current-source provenance checks are required before staging the
intended corrective files; protected local state stays outside the commit.
