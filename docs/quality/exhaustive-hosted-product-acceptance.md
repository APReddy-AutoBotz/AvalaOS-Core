# Exhaustive hosted product acceptance

This suite is the release-bound acceptance layer for the AvalaOS hosted synthetic Sandbox. It does not authorize production, customer data, external users, DNS changes, or real AI-provider/BYOK egress.

## Evidence model

The canonical business catalog remains `tests/acceptance/catalog/test-catalog.json`. Execution ownership is separate in `tests/acceptance/execution-bindings.json` so a Test ID is never called a browser test merely because it exists in the catalog.

Three execution dispositions are supported:

- **Retained**: repository-owned server-authority, RLS, replay, lifecycle, Trust, Pilot, AI-boundary and application-policy suites. Retained suites are mandatory framework gates, but an aggregate suite PASS is not automatically Test-ID-level proof.
- **Independent oracle**: Assess scoring/gating outcomes calculated by the QA-only oracle and compared with the production scoring implementation for the same deterministic inputs.
- **Hosted**: behavior demonstrably exposed by the real `/sandbox` route. Playwright uses the actual hosted accessibility/product contract and the exact canonical Test-ID title. Unsupported hosted requirements are explicit BLOCKED declarations rather than invented selectors or synthetic success.

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

Current source-backed coverage is intentionally zero until provenance is added defensibly. The framework must prefer a lower truthful number over an inflated coverage percentage.

## Current execution ownership

The catalog currently partitions into retained authority gates, independent oracle cases, and hosted browser declarations. A hosted Test ID remains BLOCKED when the current product does not expose a deterministic action for the exact rule. A different denial, route reload, populated projection, or other proxy behavior cannot be substituted for the declared requirement.

The requested-changes domain regression is a framework gate only; it does not by itself promote the hosted requested-changes E2E Test ID to PASS.

## PR mode versus release mode

Pull requests run framework validation and retained/oracle gates, but do not contact the stable hosted pilot. The report remains visibly incomplete for the hosted layer and must not be interpreted as hosted acceptance.

A real release run requires:

1. an exact 40-character release SHA,
2. an exact 24-hex Netlify deployment ID,
3. the canonical origin `https://avalaos-pilot.netlify.app`,
4. the stable deployment serving the same release through `X-AvalaOS-Release`.

Release mode fails closed if any Test ID is FAIL or BLOCKED, or if source/business requirements remain declared-only or uncovered.

## Controller dispatch

`.github/workflows/exhaustive-acceptance-dispatch-bridge.yml` is the narrow controller bridge. Only `APReddy-AutoBotz` can create `exhaustive-acceptance-dispatch--<24hex-deploy-id>`. The branch must point to exact current `main`; only then does the bridge call the reusable acceptance workflow using that immutable branch, validated release SHA, deployment ID, and canonical hosted URL.

## Safety and artifacts

The hosted suite rejects requests to Supabase authority endpoints or real AI providers and rejects sensitive authorization/API-key headers from the Sandbox. It uses synthetic local product data only.

Retained and oracle manifests are generated outside repository source paths before browser artifacts are generated, then copied into the evidence directory after the authority suites complete. This prevents generated Playwright/report output from contaminating repository static-boundary scans.

Generated `acceptance-results/` and Playwright output are workflow artifacts, not committed proof snapshots. The repository carries definitions and `.gitkeep`; exact-run evidence is uploaded by GitHub Actions with the release SHA, run ID, and attempt in the artifact name.
