# Assess projection transaction correction evidence

Status: confirmed source and operator-harness defects corrected locally; all 23 native commands passed on the implementation snapshot. Final registry-only reconciliation is independently verified below. Commit/push, exact-head CI and exploratory verification remain release gates. No hosted upload or real-provider PASS is claimed.

## Executed predecessor evidence

Head `484ce7a7bc897180043a395254991b57a05bdbc5`, source digest
`7045b572470c2cfca322e58275041954f5b5c721cc298862f9dafa7bc6ede35e`, passed all 18
applicable workflows. Native mapping run `35140127405`, attempt 1, artifact
`10465117418` independently verified 22 commands and 32 Desktop/Pixel cases.
Artifact ZIP SHA-256: `08ac15ebb654d7bb84ded140f3b6753b7fddf5867fb4753c0f49871e255fd701`.
PR C run `35140127373`, attempt 1, artifact `10466147593` independently verified
80 commands, 218 assertions and eight explicit not-run boundaries. Its ZIP SHA-256
is `723d3936fa4c0304f4f2e5ecd28f0519540e8b4c9b57888ee5bf09acc8f9f6be`.

The authorized exploratory migration 78 and six deployed function source graphs
were verified, and all 56 immutable-draft assets matched the build. Published-site
identity, six accounts and account-authority state were preserved. The original
frozen controlled-human backend was not changed.

The actual browser opened the retained case, then failed before any upload:
zero new commands/sources/bundles/provider-usage/mapping-run rows. The failed
attempt is retained under the ignored `output/local-private/assess-mapping-xlsx-release-20260916/`.
It is not promoted to PASS. The original earlier failure and three prior saved
commands also remain immutable.

## Confirmed defects and bounded correction

The Delivery projection's 32 table requests succeeded, while its actual
PostgREST RPC POST returned 405 / SQLSTATE `25006` because STABLE functions run in
read-only transactions and its authority path takes row locks. Monitor has the
same source classification mismatch. Direct PostgreSQL tests missed this API
transaction boundary. Correct only the two volatility attributes through one
atomic forward migration; preserve bodies, locks, privileges and identity gates.

The ignored browser harness inferred actor identity from a synthetic login
reservation ID. Actual Auth and tenant-session identity differ. Correct evidence
must bind the authenticated subject, independent account mapping and exact old
receipts without rewriting previous claims. This is an operator-evidence defect,
not justification to alter roles or weaken server authorization.

## Executed local correction evidence

The executed native source fingerprint is
`a94e530883d44cba66862e1e729e42e3f6a036938d08de78091b51ef6dcf9a3d`.
Command manifests bind the canonical execution and actual test output; a suite
exit is not promoted into an exact assertion result.

- Feature: 10/10 commands, including parser/mapping coverage, API/provider mocks,
  client/UI, migration and authority contracts.
- PostgreSQL: 3/3 native commands. Actual PostgREST: 23/23 child assertions,
  two old STABLE failures reproduced, both new VOLATILE projections verified,
  six no-write phases covering 169 governed tables. The intentional fixture
  revocation/restoration separately observed authorization versions 2, 3 and 4.
  All owned resources were removed and cleanup independently verified.
- Retained regression command passed. Browser: 32/32 actual-route Desktop/Pixel
  scenarios, zero skipped, unexpected or flaky results; synthetic transport only.
- Fresh chain: 79 migrations. Populated 78-to-79 upgrade: 16 exact rejection
  cases, three concurrent-writer lock fences, full identity/constraint/function
  metadata and retained process/source-state rollback checks. Process creation
  54 and synthetic Admin 109 assertions passed; retained Pilot Operations and
  PR C PostgreSQL suites passed. Owned container cleanup verified.
- Recovery: 6/6 clean-restore, corruption, incomplete-backup, version, interruption
  retry and canonical response-loss receipt assertions passed; cleanup verified.
- Focused final contracts: 39/39 passed (13 tracked migration/REST contracts,
  23 ignored actor/receipt/browser contracts and three installed-state/approved
  deployment-plan contracts). Twenty SQL source adversaries reject, including
  an unrelated third function alteration and mixed-case alteration.
- Acceptance catalog/traceability/oracle checks passed: 108 source-backed
  branches, zero uncovered branches and 10 explicit composite cases. This is
  catalog/provenance proof, not 108 hosted scenario passes.
- Dependency audit: zero reported vulnerabilities.
- Static: 8/8 commands passed, including both typechecks, workflow YAML, AI-boundary
  static checks, secret hygiene, scoring regression/law drift and build.
- Evidence/registry/scope/verifier/migration adversarial tests: 48/48 passed.
- Full PR C evidence-contract command passed: migration and CI contracts,
  54 retained-checkout/identity/scope/evidence adversaries, and final registry
  validation (81 commands, 221 assertions, 12 owners; nine local not-run entries).

Native manifests under `output/assess-import/validation/`:

- `feature-d774f311-715e-4e4f-a058-60ee2f755785/manifest.json`
- `postgres-21531422-0e6c-4900-9c87-321259f69faa/manifest.json`
- `regression-4697a306-44f5-4cb9-a0a7-0af9e332a937/manifest.json`
- `browser-309b5d22-93fe-4bee-adcb-d68066d2c0dd/manifest.json`
- `static-7b0093f0-34ab-46de-9f03-6c7a6ed02d38/manifest.json`

Actual REST result: `output/assess-import/projection-postgrest/dce10ecc-0015-4357-b39e-2354552cef74/result.json`.
Upgrade result: `output/creation-access/postgres-c912fd8b-65b9-4257-94cd-500547f9fb40/result.json`.
Recovery result: `output/assess-import/release-local/6307b6c3-c119-417d-abb7-649e5710eabc/result.json`.
Browser result: `output/playwright/assess-import/89c8d3524c0e0c894e04010b/results.json`.
The upgrade harness is unchanged from its executed result; the final source
subsequently changes only the separate REST version observation and a retained
static adversary-count expectation. It is not relabelled as a later invocation.

Final registry reconciliation changes the source fingerprint to
`52a3a068304eeb302273ff49a07ef6f5afbd6663ac1810545867cc47e83c5dba`.
Only `testing/process-lifecycle/contracts/pr-c-assertion-registry.json` differs
within the native snapshot: its PostgREST owner hash now binds the final tested
file. Replacing only that hash with the prior
`16332c8c8641109d4679082802fd49315a8820b4d410706fec4c2e7a3d3b4684`
reconstructs the exact executed registry SHA-256
`4d89eb26867bf8f74a148687b793aad940172d62edcb969c6b06bb0843d926bc`.
No runtime, test, command, assertion or scenario selection changed. The current
registry/provenance validator passed after reconciliation; local manifests retain
their original fingerprint. Fresh CI must execute all commands on the committed
fingerprint before deployment; this index-only comparison is not a new execution.

## Independent review and retained attempts

Both final read-only reviewers closed before each corrective write phase. They
identified and the controller corrected: extra-function acceptance by the static
contract; incomplete no-write table inventory; missing new-migration identity and
unsafe-flag negatives; literal pending-response success; an unobserved fixture
version-advance claim; and apply not comparing the complete approved preflight
state. The final helpers derive actual response completion, read authorization
versions, bind the complete stable deployment plan (including database and
projection metadata digests), and preserve old three-command evidence before
permitting five new writes. Root focused regression checks close these findings;
the reviewers' earlier results are not represented as execution of later source.

Earlier complete local source `ca1523efe2ca715e0c90439cf179d3d220039b3de99e76e235a085b0056b638e`
passed 23 commands before review strengthening. Source
`ee7dd092445e71deeb7383a92f2ff341e0852c3c3c0d94886954c9723c5f3e2d`
then failed a retained expectation of 18 rather than 20 adversaries. Its failed
manifest remains retained; no product or migration change was needed.
Earlier network-pool exhaustion, Docker internal-network port isolation, actual
GET error-code mismatch, stale migration-tail expectation, bounded REST startup
failure and source-changed concurrent attempts remain unsuccessful evidence.
No unrelated networks, containers, files or historical evidence were removed.
Pre-commit release/build helper invocations correctly failed for unbound head or
absent build artifacts; they are not claimed as release verification.

## Planned external verification

- Refresh source provenance, inspect exact staging and
  commit/push this coherent correction on the existing PR #264 branch.
- New exact-head CI: all 23 native commands and the complete 81-command/221-assertion
  PR C registry. The entire 81-command pipeline was not rerun locally; its full
  execution and exact run-attempt artifact verification are mandatory before
  exploratory activation. Local relevant gates above do not replace it.
- Apply only migration 79 on the approved exploratory target, proving installed
  function metadata unchanged except volatility; verify a new immutable draft,
  then real browser uploads and independent eight-receipt database reconciliation.

Rollback is disabled new effects/read-only/manual operation with retained
history and additive repair. Real providers, three-human acceptance, merge,
production and security/compliance certification remain unproven/out of scope.

Reference: [PostgREST transaction access modes](https://docs.postgrest.org/en/stable/references/transactions.html#access-mode-on-functions).
