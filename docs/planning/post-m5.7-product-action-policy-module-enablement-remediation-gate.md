# Post-M5.7 Product Action Policy Module Enablement Remediation Gate

## Purpose

Fix the product action policy module-enable fallback bug that blocked PR #199 post-merge verification.

This is source/test/docs remediation only. It does not reopen PR #199 tag closure and does not create readiness evidence.

## Blocked Baseline

- Merged PR: #199, Post-M5.7 Product Action Policy and High-Risk Mutation Guard Implementation Gate.
- Accepted/head commit: `a0a83b0cb8a1327a36f010025abdde0bcc05863e`.
- Merge commit/current main at failed closure: `9c4f92522b78b8fe67d317d183c5ef03f519025e`.
- Blocking check: focused product action policy tests.
- Failure: `docs.generate` returned `allowed` when organization module settings excluded `docs`; the expected result was `disabled_module`.

## Root Cause

`resolveProductActionPolicy` resolved enabled modules from `input.enabledModules` only when the array was non-empty, then fell back to `DEFAULT_ENABLED_MODULES`. That skipped `input.organization.enabledModules`, so organization-level disabled modules could be silently re-enabled by defaults. An explicit empty `input.enabledModules` array was also treated as missing input.

## Remediation Scope

Allowed source/test remediation:

- Use `input.enabledModules` as the explicit override whenever it is provided, including an empty array.
- Use `input.organization.enabledModules` when the explicit override is absent.
- Use `DEFAULT_ENABLED_MODULES` only when neither explicit nor organization module settings are available.
- Add focused tests for docs, delivery, explicit override, explicit empty override, and default fallback behavior.

## Changed Files

- `services/productActionPolicy.ts`
- `services/productActionPolicy.test.ts`
- `docs/planning/post-m5.7-product-action-policy-module-enablement-remediation-gate.md`
- `docs/quality/post-m5.7-product-action-policy-module-enablement-remediation-gate-evidence.md`
- `docs/planning/milestone-roadmap.md`
- `docs/quality/readiness-gates.md`
- `docs/task-ledger.md`

## Non-Readiness Boundary

This remediation does not approve or perform browser retry, browser launch, browser automation, screenshots, runtime app launch, dev server startup, export/PDF/download generation, storage object creation, signed URL generation, workflow/status execution, approval workflow execution, DB/RLS/artifact/schema checks, SQL or migration execution, schema or policy dump, Supabase execution, Docker execution, hosted/deployment validation, provider/classifier execution, real assertions against live/local services, readiness evidence, readiness claims, readiness-domain completion, or PR #199 tag creation or movement.

PR #199 tag closure remains pending until this remediation is merged and post-merge verification passes.

## Acceptance Criteria

- Focused product action policy tests pass.
- Typecheck passes.
- Required static guardrail tasks pass.
- Documentation records the blocked baseline, fix scope, and proof boundary without readiness claims.
