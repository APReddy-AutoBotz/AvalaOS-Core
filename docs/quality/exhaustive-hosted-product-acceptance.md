# Exhaustive hosted product acceptance

This suite is the release-bound acceptance layer for the AvalaOS hosted synthetic Sandbox. It does not authorize production, customer data, external users, DNS changes, or real AI-provider/BYOK egress.

## Evidence model

The canonical business catalog remains `tests/acceptance/catalog/test-catalog.json`. Execution ownership is separate in `tests/acceptance/execution-bindings.json` so a Test ID is never called a browser test merely because it exists in the catalog.

Three execution dispositions are supported:

- **Retained**: repository-owned server-authority, RLS, replay, lifecycle, Trust, Pilot, AI-boundary and application-policy suites. `scripts/runExhaustiveRetainedSuites.mjs` runs named suites and writes one exact-run manifest bound to release SHA, workflow run ID, and workflow attempt.
- **Independent oracle**: Assess scoring/gating and transcript outcomes calculated by the QA-only oracle under `tests/acceptance/oracles/`. The oracle imports no production scoring module.
- **Hosted**: behavior demonstrably exposed by the real `/sandbox` route. Playwright uses the actual `EnterpriseAccessView` accessibility contract and the exact canonical Test-ID title. Unsupported hosted requirements are explicit skipped/BLOCKED declarations rather than invented selectors or synthetic success.

Every canonical Test ID must belong to exactly one execution class. Missing, stale, duplicate, failed or cross-run evidence is BLOCKED or FAIL.

## Inventory and provenance

Covered source/business branches are derived directly from the catalog's `branchIds`. `tests/acceptance/inventory.json` stores only explicit uncovered requirements. This prevents a second hand-maintained copy of covered branches from drifting away from the Test-ID catalog.

`STUDIO-LEASE_CONCURRENCY` was removed because the referenced Studio contract contains no lease concept. The remaining uncovered cross-cutting requirement is `SAFETY-RESPONSE_LOST_AFTER_COMMIT`: the shared `persistBeforeCommit` helper proves persistence-before-local-success ordering, but it does not model a server commit followed by response loss. Existing command-family recovery tests are not promoted to one cross-cutting PASS until a dedicated Test ID binds those proofs.

The report distinguishes:

- **Declared branch coverage**: source branches mapped to Test IDs.
- **Executed branch coverage**: mapped branches whose Test ID actually ran to PASS or FAIL.
- **Proven branch coverage**: mapped branches with a PASS result.
- **Uncovered requirements**: explicit source limitations with a remediation action.

## Current execution ownership

The catalog currently partitions into retained authority tests, independent oracle tests, and hosted browser tests. The hosted layer covers the synthetic access boundary, every seeded persona, public/Sandbox route separation, Process Catalog behavior, Delivery Pack, Monitor, Admin visibility, responsive layout, accessibility, offline behavior and reload reconstruction.

A hosted Test ID remains BLOCKED when the product does not expose a deterministic action for the exact rule. In particular, a different denial or a populated projection cannot be substituted for process-edit denial, unavailable Monitor projection, or server-timeout behavior.

## PR mode versus release mode

Pull requests run framework validation and all retained/oracle evidence, but do not contact the stable hosted pilot. The report remains visibly incomplete for the hosted layer and must not be interpreted as hosted acceptance.

A real release run requires:

1. an exact 40-character release SHA,
2. an exact 24-hex Netlify deployment ID,
3. the canonical origin `https://avalaos-pilot.netlify.app`,
4. the stable deployment serving the same release through `X-AvalaOS-Release`.

Release mode fails closed if any Test ID is FAIL or BLOCKED, or any source/business requirement remains UNCOVERED.

## Controller dispatch

`.github/workflows/exhaustive-acceptance-dispatch-bridge.yml` is the narrow controller bridge. Only `APReddy-AutoBotz` can create `exhaustive-acceptance-dispatch--<24hex-deploy-id>`. The branch must point to exact current `main`; only then does the bridge dispatch the acceptance workflow using that immutable branch, validated release SHA, deployment ID, and canonical hosted URL.

## Safety and artifacts

The hosted suite rejects requests to Supabase authority endpoints or real AI providers and rejects sensitive authorization/API-key headers from the Sandbox. It uses synthetic local product data only.

Retained and oracle manifests are generated in `runner.temp` before browser artifacts exist, then copied into the evidence directory after the authority suites complete. This prevents generated Playwright/report output from contaminating repository static-boundary scans.

Generated `acceptance-results/` and Playwright output are workflow artifacts, not committed proof snapshots. The repository carries definitions and `.gitkeep`; exact-run evidence is uploaded by GitHub Actions with the release SHA, run ID, and attempt in the artifact name.
