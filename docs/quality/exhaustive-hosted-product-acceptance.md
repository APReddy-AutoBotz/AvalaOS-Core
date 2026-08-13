# Exhaustive Hosted Product Acceptance

## Purpose and evidence boundary

This release-bound QA system reconciles declared source/business branches with stable Test IDs, retained server-authority tests, and deterministic browser tests against the synthetic hosted Sandbox. A passing executed test is not treated as complete acceptance while any declared branch is blocked or uncovered.

The Sandbox proves synthetic browser behavior only. PostgreSQL persistence, RLS, tenant isolation, RPC/session authority, audit, replay, idempotency, revocation, and recovery claims remain bound to their repository-owned disposable PostgreSQL and authority suites. Neither evidence tier is silently substituted for the other.

No customer data, production data, PHI, real BYOK credential, real provider request, external automation execution, production DNS, or `avalaos.com` change is permitted.

## Acceptance criteria

1. The catalog and inventory are valid, deterministic, uniquely identified, and safety flags are false.
2. Every inventory branch references a known Test ID or is explicitly `UNCOVERED` with a reason.
3. The hosted origin and exact release SHA are bound before browser execution.
4. Results preserve `PASS`, `FAIL`, `BLOCKED`, and `UNCOVERED`; skipped or absent evidence never becomes a pass.
5. JSON, JUnit, Markdown, Playwright HTML, screenshots, traces, and failure video are retained as sanitized artifacts when produced.
6. The overall gate is not green when failures, blocked cases, or uncovered branches remain.

## Execution

Run structural validation:

```sh
node scripts/exhaustiveAcceptanceValidate.mjs
```

After Playwright has written `acceptance-results/playwright-results.json`, generate unified evidence:

```sh
RELEASE_SHA=<exact-sha> NETLIFY_DEPLOY_ID=<deploy-id> \
  HOSTED_PILOT_URL=https://avalaos-pilot.netlify.app \
  node scripts/exhaustiveAcceptanceReport.mjs
```

The reporter intentionally exits nonzero for `FAILED` or `INCOMPLETE_COVERAGE`. It calculates executed pass percentage separately from source/business branch coverage.

## Artifacts

- `acceptance-results/acceptance-results.json`
- `acceptance-results/acceptance-junit.xml`
- `acceptance-results/acceptance-report.md`
- `acceptance-results/source-to-test-coverage.json`
- `artifacts/exhaustive-acceptance/playwright-report/`
- `artifacts/exhaustive-acceptance/playwright-output/` failure-only screenshots, traces, and videos

Evidence references must be repository-relative and sanitized. Do not include authorization headers, request/response bodies, signed URLs, provider payloads, database rows, customer identifiers, infrastructure identifiers, or secrets.

## Defect handling

Product failures are recorded rather than repaired in this QA framework. Classify deterministic findings as P0–P3 and group remediation by root cause: Assess rules, Govern authority, Studio lifecycle, cross-module lineage, or UI/accessibility. Unsupported execution is `UNCOVERED`; an unavailable external precondition is `BLOCKED`.

## Safe rollback and fallback

This work changes QA assets only. Safe rollback is to revert the acceptance workflow, scripts, catalog, fixtures, browser suite, and generated evidence. Reverting does not require a schema rollback and does not alter AvalaOS runtime behavior. If hosted execution is unavailable, retain the report as incomplete and use read-only source/catalog validation; never substitute local Sandbox evidence for hosted or PostgreSQL authority proof.
