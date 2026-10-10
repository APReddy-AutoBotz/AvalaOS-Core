# Exhaustive hosted product acceptance

## Approved authenticated profile and read-only corrections (2026-10-10)

AP approved the separate `hosted_authenticated_synthetic` profile for the 47 previously blocked hosted requirements and explicit zero-write corrections for EI-003, ADMIN-001/003/004 and MONITOR-001/002/003. Preserve all 108 IDs and business meanings, exact Monitor human outcomes, legacy task/import semantics, AI-004's single synthetic privileged configuration write, and conditional audits for real privileged mutations. The public Sandbox's 18 supported cases retain their existing profile and network boundary.

The executable integration and rollback belong in `docs/planning/authenticated-product-acceptance.md`. Authenticated cases require actual same-run browser actions on Desktop Chrome and Pixel 7 plus independent server state measurements and exact release/deployment/backend/migration/exercise/source/workflow/actor/session bindings. Local `fixture_transport` execution is preparation only, never canonical hosted PASS. Missing evidence, cleanup, source or identity mismatch remains BLOCKED/FAIL. Repository-only PR #282 evidence is 42 PASS / 66 BLOCKED; historical stable evidence remains 58 PASS / 50 BLOCKED. The completed local integration independently verifies all 94 actual-UI records (47 per browser), current source bindings and complete cleanup. Those local results cannot change the canonical hosted dispositions. Exact-candidate CI is pending; no fresh hosted execution is authorized here.

For STUDIO-003, zero business mutation means unchanged artifact content, lifecycle, lineage, current/approved pointers and complete version rows. The existing reservation advances its aggregate concurrency version once and updates its timestamp; explicitly measure that increment separately from the unchanged business target. Its failed attempt, command receipt and terminal audit history must also be reported separately (one attempt, one receipt, two audits). This does not relax the seven approved read-only cases, which require zero writes throughout observation. DELIVERY-009 retains its original saved-result requirement; viewing the computed pack or reusing an earlier import cannot satisfy it.

## Verified stable baseline and connected continuation (2026-10-09)

Merged PR #280 is independently verified on stable run `37891394223`, attempt 1: **58 PASS / 0 FAIL / 50 BLOCKED / 0 UNCOVERED**. All 18 supported cases pass on both required browser projects. Overall acceptance remains `INCOMPLETE_COVERAGE`; this supersedes earlier pending execution statements without rewriting their immutable artifacts. The separate one-run hosted allowance is consumed.

The next substantial workstream is `docs/planning/connected-enterprise-lifecycle-acceptance.md`. Its actual local application/handler/PostgreSQL journey supplies integration evidence for the Assess/Govern/Studio path; it does not alter this catalog, its hosted definition, mutation criteria or current dispositions. Forty-seven blocked cases still require hosted proof, and three disposable cases retain their legacy-authority/criteria gaps. A green local connected artifact cannot promote them to hosted PASS.

## Dispatch identity correction (2026-10-09)

PR #279 is merged and its candidate preview proved all 18 supported browser cases. The subsequent approved stable run `37845645704` stopped before browser execution because the dispatch caller was not recognized by the provenance contract. Its retained producer also recorded the caller path instead of the canonical reusable workflow path; the immutable report therefore records 14 PASS / 94 BLOCKED despite 26 exact retained results executing successfully. The active plan owns a repository-only correction that preserves the real caller ref and consistently binds producer artifacts to `.github/workflows/exhaustive-acceptance.yml`. Planned verification is not a fresh stable PASS; the full release gate remains incomplete and a further hosted attempt needs its own authority.

This suite is the release-bound acceptance layer for the AvalaOS hosted synthetic Sandbox. It does not authorize production, customer data, external users, DNS changes, or real AI-provider/BYOK egress.

## Current approved correction (2026-10-08)

The source/CI baseline is 40 PASS / 68 BLOCKED after merged PR #278. AP approved the focused correction in `docs/planning/hosted-sandbox-acceptance.md`. The 18 supported browser cases require exact same-run measured browser-local fixture attachments as well as valid Playwright results. Static source provenance remains planned; it must not invent tenant UUIDs. ADMIN-001 retains its privileged mutation/audit criterion and has no executable browser binding. Retained-only results cannot satisfy hosted requirements. No corrected stable execution has run.

## Evidence model

The canonical business catalog remains `tests/acceptance/catalog/test-catalog.json`. Execution ownership is separate in `tests/acceptance/execution-bindings.json` so a Test ID is never called a browser test merely because it exists in the catalog.

Three execution dispositions are supported:

- **Retained**: repository-owned server-authority, RLS, replay, lifecycle, Trust, Pilot, AI-boundary and application-policy suites. Retained suites are mandatory framework gates, but an aggregate suite PASS is not automatically Test-ID-level proof.
- **Independent oracle**: Assess scoring/gating outcomes calculated by the QA-only oracle and compared with the production scoring implementation for the same deterministic inputs.
- **Hosted**: behavior demonstrably exposed by the real `/sandbox` route. Playwright uses the actual hosted accessibility/product contract and the exact canonical Test-ID title. Every hosted binding must exactly match the catalog-required desktop/Pixel 7 project set; omissions, duplicates, skipped projects, and partial project success remain non-success. `SAFETY-007` performs a bounded post-entry axe and network-safety pass across all seven canonical persona classes on each required project, rather than treating chooser-only accessibility as product proof. Unsupported hosted requirements are explicit BLOCKED declarations rather than invented selectors or synthetic success.

Every canonical Test ID must have exactly one truthful execution disposition. Missing, stale, duplicate, failed or cross-run evidence is BLOCKED or FAIL.

Retained evidence has two layers. Aggregate suite results remain mandatory framework gates. Canonical retained Test IDs can PASS only when the suite process emits an exact machine-readable `(suiteId, testId)` result bound to the same release SHA, workflow run and attempt. A green suite with no exact result leaves its configured Test IDs BLOCKED. The runner gives every retained suite its own result file and suite identity and rejects results that claim a different producer suite or a Test ID not owned by that suite.

## Inventory and provenance

The catalog's `branchIds` are **declarations**, not proof that the referenced production source implements the declared business contract. `tests/acceptance/inventory.json` stores the explicitly discovered requirements and known unsupported requirements, while the derived inventory marks catalog mappings `DECLARED` until a separate machine-verifiable source-provenance contract exists.

A DECLARED branch does not contribute to source/business coverage, even if its Test ID executes successfully. Only a future `SOURCE_BACKED` branch may contribute to executed or proven source/business coverage. This deliberately prevents file existence, a copied branch name, or a green unrelated test suite from becoming source proof.

`STUDIO-LEASE_CONCURRENCY` was removed because the referenced Studio contract contains no lease concept. The explicit cross-cutting uncovered requirement `SAFETY-RESPONSE_LOST_AFTER_COMMIT` remains visible because the shared persistence helper does not itself prove a server commit followed by response loss.

The report distinguishes:

- **Declared branches**: catalog requirements awaiting independent source proof.
- **Source-backed branches**: requirements whose production contract has been independently and machine-verifiably bound.
- **Executed source-backed coverage**: source-backed branches whose exact bound Test ID ran to PASS or FAIL.
- **Proven source-backed coverage**: source-backed branches whose required exact evidence passed.
- **Uncovered requirements**: explicit known source/behavior limitations with a remediation action.

All 108 current catalog branches have reviewed source provenance. Source mapping is still distinct from execution: the current exact source/CI artifact proves 40 cases, while 68 remain blocked. The framework must prefer a lower truthful number over an inflated coverage percentage.

## Current execution ownership

The catalog currently partitions into retained authority gates, independent oracle cases, and hosted browser declarations. A hosted Test ID remains BLOCKED when the current product does not expose a deterministic action for the exact rule. A different denial, route reload, populated projection, or other proxy behavior cannot be substituted for the declared requirement.

The requested-changes domain regression is a framework gate only; it does not by itself promote the hosted requested-changes E2E Test ID to PASS.

## PR mode versus release mode

Pull requests run framework validation and retained/oracle gates, but do not contact the stable hosted pilot. The report remains visibly incomplete for the hosted layer and must not be interpreted as hosted acceptance.

A real release run requires:

1. an exact 40-character release SHA,
2. an exact 24-hex Netlify deployment ID,
3. the canonical origin `https://avalaos-pilot.netlify.app`,
4. the stable deployment serving the same release through `X-AvalaOS-Release`,
5. the tested response serving the exact controller-selected 24-hex deployment identity through `X-AvalaOS-Netlify-Deploy-ID`.

Release mode verifies the response release, environment, and deployment identity before Playwright starts. A missing, malformed, stale, or syntactically valid-but-wrong deployment identity fails closed. Release mode also fails closed if any Test ID is FAIL or BLOCKED, any required project is absent or duplicated, or source/business requirements remain declared-only or uncovered.

## Controller dispatch

`.github/workflows/exhaustive-acceptance-dispatch-bridge.yml` is the narrow controller bridge. Only `APReddy-AutoBotz` can create `exhaustive-acceptance-dispatch--<24hex-deploy-id>`. The branch must point to exact current `main`; only then does the bridge call the reusable acceptance workflow using that immutable branch, validated release SHA, deployment ID, and canonical hosted URL.

## Safety and artifacts

The hosted suite rejects requests to Supabase authority endpoints or real AI providers and rejects sensitive authorization/API-key headers from the Sandbox. It uses synthetic local product data only.

Retained and oracle manifests are generated outside repository source paths before browser artifacts are generated, then copied into the evidence directory after the authority suites complete. This prevents generated Playwright/report output from contaminating repository static-boundary scans.

Generated `acceptance-results/` and Playwright output are workflow artifacts, not committed proof snapshots. The repository carries definitions and `.gitkeep`; exact-run evidence is uploaded by GitHub Actions with the release SHA, run ID, and attempt in the artifact name.

## Rollback and read-only fallback

If deployment identity, required-project execution, post-entry accessibility, reporter generation, or artifact upload cannot be proven, stop release acceptance and retain the sanitized result as BLOCKED/INCOMPLETE. Do not retry against localhost, a preview, another stable deployment, or a synthetic-only substitute; keep the hosted pilot unchanged and use repository-only/read-only verification until an exact candidate is available.
