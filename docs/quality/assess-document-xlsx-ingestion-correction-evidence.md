# Assess document XLSX ingestion correction

## Scope and retained boundary

This is an additive correction within the approved native Assess supporting-
document work on existing Draft PR #264. It does not authorize merge, production,
customer data, real providers or changes to the frozen controlled-human backend.
The active plan is `docs/planning/assess-supporting-document-mapping.md`.

Previous head `e3ca6930eca8b79f9f03d5178753331eac8d9124` completed all 18
applicable exact-head workflows successfully; Hosted Pilot Live Acceptance was
intentionally skipped. The native mapping artifact independently verified 22
commands and 32 Desktop/Pixel scenarios. Those are prior-source results, not
proof of this correction, and did not establish real XLSX database ingestion.
The prior projection evidence report and failed hosted attempt remain unchanged.

Before replacement deployment or upload, source inspection found that the
database source-version trigger omitted the XLSX MIME mapping. Read-only
exploratory inspection confirmed that the trigger rejected unknown formats and
did not register XLSX, with zero evidence sources and zero provider-usage rows.
This is a **confirmed source defect**, not a provider or account problem.

The earlier mapping PostgreSQL fixture selected CSV and supplied a spreadsheet
parser label; browser transport mocks returned source-create success without
executing the database trigger. These gaps are disclosed rather than treating
green aggregate exits as proof of the missing boundary.

## Correction and ownership

Two read-only reviewers closed before implementation. Two direct implementation
workers own non-overlapping database/static-contract and real-PostgreSQL test
slices. The controller owns integration, evidence/provenance, release tooling
and acceptance. No recursive delegation is permitted.

The CLI-generated forward migration
`20260916181916_assess_document_xlsx_ingestion_authority.sql` follows the
exact `20260916151050` predecessor. It locks and validates the synthetic
identity, empty human-history inventories, source schema, function and trigger;
adds the missing XLSX parser case and native document-evidence classification;
preserves both functions' privileges, metadata and all prior
rules; and atomically advances the migration marker/check.

Source ingestion retains `enterprise-parser-1`. Structured mapping
re-extraction independently reports `spreadsheet-grid-v1`; these are different
boundaries and must not be relabelled as each other. Scoring, account roles,
feature defaults and provider configuration are unchanged.

The first real-database attempt exposed a negative-test helper that could catch
its own failed assertion. The replacement uses `assert.rejects` and separately
proves unexpected success and wrong-error rejection. A source-version-only
foreign-scope fixture correctly normalized to the canonical source; it was
replaced with a genuinely foreign source/version rejection plus an independent
normalization countercontrol. A second attempt then exposed the native Assess
classifier's XLSX omission at Apply. Both failed attempts are retained, not
counted as successful current-source evidence. A further read-only downstream
review closed before the controller extended the same unapplied migration.

The PostgreSQL scenario now binds an actually applied non-conflicting fact to
the real workbook cell, verifies exact persisted document evidence, reparses
the saved native draft and checks replay has no added version or effect.

## Verification status

Executed source snapshot:
`7045b572470c2cfca322e58275041954f5b5c721cc298862f9dafa7bc6ede35e`,
based on committed head `e3ca6930eca8b79f9f03d5178753331eac8d9124`.
All five groups (feature, database, regression, static and browser) passed 22/22 canonical
commands. This includes 15 emitted mapping PostgreSQL scenarios, real old-tip
rejection/corrected receipt-backed ingestion, exact applied XLSX evidence and
native reopen/replay. All six backup/restore/corruption/interruption/response-loss
recovery assertions passed; the owned memory-backed container was removed.

The separate creation-access PostgreSQL run passed the 78-migration fresh chain,
populated upgrade, 54 process-create and 109 synthetic-Admin assertions, retained
Pilot Operations and PR C suites, migration precondition adversaries and five
concurrent-writer lock checks. Its owned container was also removed.

Additional gates passed: 38 migration assertions plus 23 source/migration
substitution adversaries; three strict error-helper tests; 108 source-backed
acceptance catalog branches; catalog/inventory/provenance tests; 33 acceptance
report/PR C evidence contract and verifier tests, plus an independent 54/54
retained PR C contract rerun; dependency audit with zero
reported vulnerabilities; and `git diff --check`.

The first browser attempt could not launch Chromium (`spawn EPERM`) and
retains 32 failed launch results, not application-test passes. An unchanged
source rerun with browser-process permission passed 32/32 scenarios: 16 Desktop
and 16 Pixel, with zero skipped/flaky/unexpected/retried results. Static/build
and browser execution were serialized. Independent quality review validated all
1,081 snapshot file hashes, all five manifests and their exact results. Bounded
architecture review found no remaining source/migration blocker.

Architecture review identified an ignored operator-harness gap before hosted
execution: an inherited allowlist could admit an unrelated synthetic-Admin
request. This attempt now denies every unneeded function endpoint, including
synthetic Admin, and compares a server-computed before/after digest of exact
synthetic identities, memberships, roles, capabilities and authorization
versions. Same-count account substitution fails. No credential fields or login
timestamps enter that digest. These operator-only changes do not alter the
tested feature snapshot. Fresh exact-head CI and exploratory hosted retry remain
**planned verification**, not completed acceptance.

Retained local artifacts:

- `output/assess-import/validation/feature-d4974c96-073d-4f8f-bcca-5595c6adcf81/manifest.json`
- `output/assess-import/validation/postgres-610fd305-d352-440e-8fe4-cac5a962bcdc/manifest.json`
- `output/assess-import/validation/regression-d9cf3017-bf57-4d6a-8b7a-330ac546d904/manifest.json`
- `output/assess-import/validation/static-4bb157b3-b5e2-4ebb-98a4-7c10cb4edb1e/manifest.json`
- `output/assess-import/validation/browser-c6cfd2e4-eafc-4b38-9f57-53a61259a217/manifest.json`
- `output/playwright/assess-import/eacf5085b9346a5de75b8432/results.json`
- `output/assess-import/release-local/0a9a7c64-35b1-4a41-8fe2-3b89603b8ee9/result.json`
- `output/creation-access/postgres-da8fcbd4-1e25-4dcc-b189-db904b88fbf8/result.json`
- Failed browser: `output/playwright/assess-import/06eb2ca366b559ce665c696e/results.json`

The ignored operator harness is separately prepared with unbound commit/source/
artifact constants. Its pure endpoint/account/resumption/source-binding tests passed 40/40;
stage-dependent preview tests correctly refused the unbound release and are
not claimed passed. No hosted mutation was performed by that preparation.

## Rollback and remaining boundaries

Disable new mapping/ingestion effects or use read-only/manual authoring while
retaining sources, receipts and immutable drafts. Repair through additive
migrations; never edit applied migration bytes or destructively reset accounts.
Preserve the six exploratory accounts and saved manual Assess case.

Hosted resumption must bind the corrected committed source, exact CI run/attempt,
installed schema and deployed function source. It must observe actual TXT/CSV/
XLSX uploads, private objects, parser metadata and exact command receipts, then
reopen the same case on Pixel with network observation through signout.

Real-provider mapping, three-distinct-human acceptance, merge and production
remain separate, unproven boundaries. Missing-provider fail-closed behavior is
not evidence of a successful live AI analysis.
