# Native Assess supporting-document mapping — local evidence

Status: local implementation, bounded reviews, final 22-command matrix, 100 browser scenarios and source-provenance reconciliation complete. Hosted activation and real-provider/human acceptance remain unproven.

## Scope and identity

Approved contract: [Assess supporting-document mapping](../planning/assess-supporting-document-mapping.md). Working branch: `controller/governed-delivery-monitor-pr-c-20260831`; unchanged Git head: `6eee4ee60360db31d0b4280cfecb9bd33a2320bf`. The enhancement is an uncommitted local working-tree change, not proof of that commit's deployed behavior.

Native Assess V2 intake supports bounded TXT/Markdown/transcripts, CSV, DOCX main-document text, limited text-layer PDF and non-macro XLSX. Users explicitly select sources, request governed server-side AI suggestions, inspect citations, accept/edit/reject, resolve conflicts and apply one immutable draft. Source sets for Assess and Studio remain independent. Manual authoring remains available. AI cannot supply arbitrary target paths, deterministic scores, approval state or verified evidence.

All verification here uses synthetic inputs, mocked provider/HTTP transport or a disposable local PostgreSQL 16 database. No production, customer data, real provider key/call, hosted migration/function deployment, preview activation, push or merge was performed. The feature remains default-off. A browser mock proves UI behavior under the specified transport responses, not deployed database or real-provider behavior.

## Corrective review disposition

The initial implementation passed its then-current 20-command matrix and 18 browser scenarios, but independent review found defects. Those results remain intermediate and are not reused as acceptance of the corrective source.

The corrective implementation addresses:

- Exact claimed/staged analysis recovery under the current receipt fence, using persisted targets and source bindings rather than a regenerated catalog or duplicate provider effect.
- Source-set and input-bundle freshness at every unconsumed review/apply boundary, with source-root locking against concurrent version creation.
- Append-only preview manifests binding exact reviewed items and conflict-resolution versions/values; omitted, stale or substituted manifests reject. Partial query projections cannot be ready.
- Current case/head/catalog/bundle-scoped projections, so unrelated workspace history cannot exhaust the current run's child-row limits.
- Canonical `primitive.*` fact aliases, preserving source/status/evidence and rejecting ambiguous duplicate aliases. No scoring formula, weight, threshold, hard stop or score version changed.
- Newest exact-scope UI selection, stage-specific capabilities, explicit uncertainty/reload behavior, populated editor/conflict keyboard and accessibility checks, and safe legacy `name`/`description`/`evidence` targets.
- Test compilation that rewrites only actual module specifiers, preserving hostile archive-path fixture strings. Canonical package-absolute internal XLSX worksheet relationships are supported without allowing absolute ZIP members, traversal or external relationships.

The completed formal security scan describes the frozen **pre-correction** snapshot. It found two low-severity review-integrity issues (stale sources and incomplete projection), plus functional recovery/alias defects that were not classified as security findings. That historical report is not rewritten or represented as a clean post-fix scan. Subsequent independent, bounded architecture/quality source reviews verified the corrections separately. A last review found and then verified fixes for undisplayed final conflict values and omitted mapping-command lifecycle cases; no blocker remained in that bounded review. Reviewers closed before each corrective write phase.

All five mapping commands now participate in the existing handler matrices for revoked authority, persisted 400/403/404/409/503 results, post-execute authority, receipt finalization/response loss, and failed/blocked/in-progress replay. Strict payload, tenant/lineage, result-resource and 18-key manifest fixtures are supplied; compile-time canonical command exhaustiveness and a runtime inventory comparison prevent silent omissions. The UI displays the exact persisted final conflict value before Apply, including after authoritative reload, for retain-manual, selected-candidate and authored resolutions.

## Focused executed checks

These are focused results, not a sum of unique platform tests and not the final stable-source command gate. Coverage invocations repeat tests and must not be double-counted.

| Check | Executed result |
| --- | --- |
| CSV/XLSX parser | 58/58 tests passed |
| Parser coverage | 97.72% lines / 86.65% branches / 100% functions |
| Mapping domain | 16/16 tests passed |
| Mapping helper/API | 15/15 tests passed, including two real-handler wrong-workspace negatives |
| Mapping client | 5/5 tests passed |
| UI contracts | 12/12 tests passed |
| Enterprise authority/AST mutation guard | 14/14 tests passed, plus boundary and CI contract checks |
| Query contract | Passed, including complete/omitted/substituted preview and scoped-history cases |
| Mapping contract coverage | 97.22% lines / 93.06% branches / 98.15% functions |
| Mapping adapter coverage | 96.86% lines / 89.93% branches / 100% functions |
| Target-registry coverage | 92.38% lines / 87.69% branches / 100% functions |
| Server mapping-helper coverage | 100% lines / 87.01% branches / 95% functions |
| PostgreSQL 16 mapping scenarios | 10/10 passed |
| Migration contracts | 28/28 passed |
| Exact persisted native draft | Parser and evaluator assertions passed; incomplete graph/exception inputs still reject final evaluation |
| Retained transcript PostgreSQL suite | Passed against the full updated migration chain; owned temporary database dropped |
| Harness contracts | 37/37 passed |
| Extended retained evidence/report/hosted-contract adversarial batch | 64/64 passed; local contract tests, not hosted execution |
| Dependency audit | Zero reported vulnerabilities |

## Final integrated verification

All 22 canonical commands passed at intermediate source digest `46993a6bc485a1b1c2238aa5b6ea9fc985c20dbc35fdae6009c078d0aff3d73d`. Independent final review nevertheless found two blockers: resolved conflicts must display the exact final authored/selected value before Apply, and all five mapping commands must participate in the retained authority/replay/response-loss lifecycle matrix. Both reviewers closed before corrective writes resumed. These results are not acceptance of the subsequent corrected source.

Final effective source digest: `ebf0db64b06a328569044a396594c80a2429e3740a5faedaacb836c6f30028e1`. All 22 canonical commands passed with `sourceStable: true`, no timeout, truncation or spawn failure. The previous complete matrix at `23573834d39d20813ec90df2d10c24ea460463582c9342c573fcde596e73072d` remains intermediate because it preceded the retained transcript fixture correction. These manifests are command-execution records with sanitized emitted test results, not fabricated exact-assertion or hosted proof.

| Group | Result | Manifest under `output/assess-import/validation/` |
| --- | --- | --- |
| Feature, authority, parser, API, UI and coverage | 10/10 commands | `feature-6863fc34-f16e-4d27-a889-690351f278b8/manifest.json` |
| Mapping and full retained PostgreSQL chain | 2/2 commands | `postgres-e554675f-0bbe-41d4-bdde-890494bb23ce/manifest.json` |
| Retained regression | 1/1 command containing 11 subcommands | `regression-3930b4d9-5b64-4fd1-b47e-296e507fa009/manifest.json` |
| Desktop/Pixel mapping browser | 1/1 command; 32/32 scenarios | `browser-24dcad7c-aae7-4ac0-94dd-75804e95d468/manifest.json` |
| Types, YAML, security, scoring and build | 8/8 commands | `static-799047e7-5ed7-4a88-9613-6432971b0f92/manifest.json` |

The final browser report is `output/playwright/assess-import/5e1f34fa7aa0fe1232dc46b9/results.json`: 32 expected, zero unexpected, skipped or flaky. The controller inspected populated desktop authored-resolution and Pixel selected-suggestion screenshots in the complete 32-case run `8207ec7af79f645b02cfd15b`; those runtime/UI files did not change in the final fixture-only correction. Populated editor/unresolved-conflict screenshots were also inspected during corrective verification. Keyboard/focus, overflow and zero serious/critical accessibility violations are asserted in populated states. Focused 4/4 authored/selected checks are retained separately at `d71aaede50d698a428570d35` and are not added to the final scenario count.

The retained browser refresh also passed in full on the final source:

| Suite | Result | Report |
| --- | --- | --- |
| Native Assess Desktop/Pixel | 52/52 | `output/assess-import/retained-browser/pr1d-50c5904ed4d2408db4821b3b6519533a/results.json` |
| Transcript review Desktop/Pixel | 16/16 | `output/assess-import/retained-browser/transcript-c5609096b4de4b80885f0ba25b8b4fbf/results.json` |

Together with the 32 mapping scenarios, these three complete reports contain **100 passed, zero unexpected, zero skipped and zero flaky** scenarios. The suites ran sequentially without overlapping shared build output. Expected aborted/offline/403/409 fixture traffic in the native suite is not a claim of zero console errors. The controller rechecked all report statistics, the 22 command records and the unchanged final source digest after execution.

The catalog/traceability/provenance gates passed: 108 catalog branches are independently source-backed, with no declared-only or uncovered branch. This is catalog ownership validation, not 108 newly executed platform or hosted scenarios; 15 hosted catalog entries remain blocked by their existing external requirements. The extended local evidence/report/hosted-contract adversarial batch passed 64/64 on the final source, with zero skipped. PR C CI/migration contracts and dependency audit passed. The active PR C source-provenance index covers 379 governed files (378 file digests plus the index itself), including retained PR C changes, not 379 new enhancement files. Its exact file-set/hash validation passed; historical PR A/B evidence and registries remain unchanged. This reconciliation is source identity, not a newly executed full PR C hosted evidence campaign.

## Cleanup and working-tree boundary

The task-owned disposable PostgreSQL container was removed after verifying its task label and that only the standard databases remained. No persistent volume, backup or unrelated container was removed. Test ports 4183, 4189, 4193 and 60195 were verified free. Failed attempts and successful evidence remain retained.

No commit, staging, push, deployment or merge was performed. The branch and Git head above are unchanged. The stash, `docs/marketing/`, `tools/` and unrelated generated state were not touched. The protected `scripts/testPilotOperationsRecoveryPostgres.mjs` still has an empty content diff; its pre-existing line-ending-only status is preserved. Final patch-integrity and provenance checks complete the local boundary; controlled synthetic preview activation needs a separate authorized release step.

## Retained failed attempts and limits

- The first browser launch hit a host `EPERM` before any scenario ran. Its failure was retained; execution required the normal permitted browser-launch boundary.
- Intermediate command attempts invalidated by source changes are retained as such, not passing results.
- Expanded browser attempts exposed test/fixture integration errors, a conflict-resolution reload sequencing race and a cold lazy-module readiness wait. Failed attempts remain under their unique browser output directories. Isolated reruns are not combined to claim a clean full run.
- A retained server-evidence test correctly rejected stale source-provenance digests during implementation. The later 64-test adversarial batch passed after index reconciliation; further source edits require another reconciliation.
- The added Enterprise static check rejected the old protected query fingerprint after stricter case/bundle input validation was added. The reviewed guard is preserved, with mutation tests for removed validation and substituted scope, and is now a permanent canonical feature gate. Earlier 21-command-inventory results are intermediate, not the final 22-command gate.
- A parallel final attempt at digest `4de68b04663a81954eca18091f5a6036e403f426b28da822601536e6b75b00a4` passed feature, PostgreSQL and retained regression but failed app typecheck with `TS6053`: broad `allowJs` discovery included disposable compiler files while their owning suite cleaned them. The narrowly added `output/test-runs` exclusion fixes that race without excluding application source. A TypeScript virtual-filesystem config test proves normal components/services/scripts remain included and removing the exclusion reintroduces generated-file discovery. Independent review accepted the correction, and the complete final matrix above passed. The failed static attempt remains at `static-866de9ec-ccf0-4b28-b498-23cae392be46/manifest.json`.
- The first retained transcript run passed 10/12 and failed the same Desktop/Pixel journey because its accepted evidence-only fixture omitted the required `evidence` destination. The strict runtime correctly withheld selection. The positive fixture now names the exact destination; two added scenarios per viewport prove omitted and old `evidence.unresolved` targets remain read-only with zero mutation commands. Keyboard editing also asserts replacement rather than accidental concatenation. No runtime restriction changed. The failed run remains at `output/assess-import/retained-browser/transcript-df6c0a6dc8e944ce8367b4e323a2e18d/`; the corrected complete rerun passed 16/16 at `transcript-7e542ff9a2b1432aad3df6b7e2a5c6b2/`. Independent review accepted this bounded fixture/spec correction before final matrix refresh.
- Hosted CI, deployed preview behavior, real providers/Vault, paid inference cost/quality, human acceptance, production readiness and security/compliance certification are not proven here. No unapproved numeric performance budget is claimed.

## Rollback and user guide

Disable new mapping effects while retaining immutable documents, source sets, bundles, proposals, reviews, preview-manifest history, receipts, lineage and committed drafts. Continue manual Assess authoring where independently enabled. Schema repairs are additive; do not restore unsafe legacy structural apply or destructively roll back history.

Synthetic fixtures and the local walkthrough are in [testing/assess-import/README.md](../../testing/assess-import/README.md). No credential or real-provider setup is required for the local synthetic test suite.
