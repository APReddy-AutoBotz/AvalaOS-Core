# Post-M5.7 Frontend Startup/Access Preflight AP Go/No-Go Decision Gate

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Milestone

Post-M5.7 Frontend Startup/Access Preflight AP Go/No-Go Decision Gate.

## Current Accepted Baseline

| Field | Accepted value |
| --- | --- |
| Latest accepted milestone | Post-M5.7 Local Frontend Access Runbook and Static Surface Inventory Gate |
| PR | #187 |
| Accepted/head commit | `660f9eb336bcd88d8f0cb979bc2423f15acd6e28` |
| Merge commit | `04d8797b3342557de8a18cd20d4ff745bb4d6b2f` |
| Post-merge verification commit/current main HEAD/tag target | `eb1a7a44dee8b220b8e5f130c569b124fc1e1450` |
| Tag | `avalaos-core-post-m5.7-local-frontend-access-runbook-and-static-surface-inventory-gate` |

## Purpose And Scope

This milestone is docs/model-only. It records an AP decision boundary for the post-PR #187 path after the local frontend access runbook and static surface inventory gate.

This decision gate does not approve execution, start an execution milestone, run setup, start the app, perform a startup/readiness check, launch a browser, run browser automation, capture screenshots, generate artifacts, inspect DB/RLS/schema state, validate hosted/deployment state, execute providers/classifiers, run workflows, change statuses, run real assertions, or produce readiness evidence.

## AP Decision State

Current AP decision state: pending.

No AP option is approved by this document. AP must explicitly choose one of the options below before the browser evidence track moves forward.

## AP Decision Options

| Option | Decision | Meaning | Execution impact |
| --- | --- | --- | --- |
| A | Approve a future frontend startup/access preflight execution gate | AP authorizes planning a separate execution milestone that may perform one tightly bounded local frontend startup/access preflight under exact scope and output limits. | Does not itself run anything. A separate milestone/PR is still required before any command is run. |
| B | Pause browser evidence and switch to another proof track | AP pauses the frontend/browser evidence track and chooses another evidence path, such as docs-only proof preparation, DB/RLS preparation, hosted/deployment preparation, or another AP-defined track. | No frontend startup/access preflight execution should be attempted under this path. |

## PR #187 Boundary Preservation

PR #187 remains accepted as docs/model-only local frontend access runbook and static surface inventory planning.

PR #187 did not execute the runbook. PR #187 did not prove frontend access. PR #187 did not prove local startup success, browser verification, walkthrough completion, or readiness evidence.

No root cause has been proven. No frontend fix has been implemented.

## Future Option A Approval Requirements

If AP later selects Option A, execution still requires a separate milestone and PR before any command is run. The future execution gate must define all fields below before execution starts.

| Requirement | Required future approval detail | Boundary |
| --- | --- | --- |
| Allowed setup category | The exact frontend-only setup/access category permitted for the future preflight. | Must exclude DB, Supabase, Docker, hosted/deployment, provider/classifier, workflow, storage, export, screenshot, and browser walkthrough categories unless a later AP approval explicitly changes scope. |
| Run count | Exact approved count for startup/access preflight attempts. | Default must be exactly one attempt unless AP explicitly approves a different count in the future gate. No retry, rerun, replay, workaround, second browser/device/viewport, or expanded path is allowed by default. |
| Stop conditions | Conditions that stop the future preflight immediately. | Stop on missing AP approval, missing scope, ambiguous command category, unexpected prompt for secrets, output exposure risk, generated artifacts, unapproved service dependency, startup/access failure, scope expansion, or wording that implies readiness. |
| Output boundaries | The exact summary-only output that can be recorded. | Future evidence may summarize approved run count, run count used, category-level setup/access result, blocked/stopped state, stop condition, and proof boundaries. |
| Prohibited outputs | Outputs that must not be collected, quoted, stored, or attached. | Must prohibit raw logs, raw stdout/stderr, stack traces, concrete command strings, local paths, host/port/IP values, DB URLs, row payloads, auth headers, claim values, provider keys, private tokens, project refs, target values, environment values, deployment URLs, container/image IDs, screenshots, browser output, DOM dumps, videos, traces, HAR files, console dumps, export/PDF/download artifacts, storage objects, signed URLs, schema dumps, SQL result sets, policy dumps, migration output, artifact SELECT payloads, provider responses, classifier output, and machine-specific values. |
| Allowed evidence summary format | The future evidence format AP authorizes. | Must be summary-only: AP option selected, future execution milestone identifier, allowed setup category, approved run count, run count used, result category, stop condition if any, prohibited-output confirmation, and proof-boundary confirmation. |
| Proof-boundary language | Exact non-claim wording to preserve after the future preflight. | Must state that startup/access preflight evidence, if performed, does not by itself prove production readiness, deployment readiness, hosted readiness, browser verification, walkthrough completion, buyer readiness, product readiness, release-candidate readiness, RLS readiness, tenant-isolation proof, security readiness, operational readiness, pilot readiness, export/PDF/download readiness, approval-workflow readiness, compliance certification, or any readiness domain unless later evidence proves those domains separately. |

## Future Option B Requirements

If AP selects Option B, the browser evidence track remains paused. The next milestone should identify the replacement proof track and preserve the PR #184, PR #185, PR #186, and PR #187 boundaries.

Option B does not approve DB/RLS/artifact/schema checks, hosted/deployment validation, provider/classifier execution, workflow execution, export/PDF/download generation, screenshots, browser automation, or real assertions. Any replacement proof track needs its own AP decision boundary and execution scope.

## Stop Conditions Before Any Future Execution

Stop before execution if any of the following is true:

- AP has not explicitly selected Option A in a later approval record.
- The future execution milestone/PR does not exist.
- Allowed setup category, run count, output boundaries, prohibited outputs, stop conditions, or proof-boundary language are incomplete.
- The proposed action would start a browser walkthrough rather than a frontend startup/access preflight.
- The proposed action would inspect DB/RLS/schema/SQL/policies, run Supabase or Docker, validate hosted/deployment state, call providers/classifiers, run workflows, change statuses, generate storage/export/PDF/download artifacts, capture screenshots, or run real assertions.
- The proposed action could expose secrets, raw logs, local paths, host/port/IP values, environment values, project refs, DB output, schema output, provider responses, browser output, screenshots, generated artifacts, or machine-specific values.
- Any wording would imply root cause proven, frontend access fixed, local startup success proven, browser verification proven, walkthrough completion proven, readiness evidence produced, or any readiness claim.

## Explicit Non-Goals

- No AP approval for execution.
- No frontend startup or app startup.
- No startup/readiness check.
- No browser launch or browser automation.
- No screenshots, screenshot folders, browser output, videos, traces, HAR files, DOM dumps, or console dumps.
- No export, PDF, download, storage object, or signed URL generation.
- No approval workflow execution and no approval/signoff/source/workflow/readiness status changes.
- No DB/RLS/artifact/schema checks, SQL inspection, migration inspection, policy inspection, Supabase execution, or Docker execution.
- No hosted validation or deployment validation.
- No provider/classifier execution.
- No rollback, incident, backup, or restore execution.
- No real assertions.
- No readiness evidence or readiness claims.
- No next execution milestone started.

## Proof-Boundary Confirmation

Root cause is not proven. Frontend access is not fixed. Local startup success is not proven. Browser verification is not proven. Walkthrough completion is not proven. Screenshot proof is not produced. Readiness evidence is not produced. Buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, operational readiness, pilot readiness, export/PDF/download readiness, approval-workflow readiness, and compliance certification remain unproven or unclaimed.

## Next Milestone Status

This decision gate does not start any execution milestone. If AP chooses Option A, the next work must be a separate AP-approved frontend startup/access preflight execution milestone and PR. If AP chooses Option B, the next work must be a separate AP-selected replacement proof-track milestone.