# Post-M5.7 Manual Browser Walkthrough One-Pass Observation Plan

## Milestone Name

Post-M5.7 Manual Browser Walkthrough One-Pass Observation Evidence.

## Accepted Baseline From PR #183

- Latest accepted milestone: Post-M5.7 Manual Browser Walkthrough AP Go/No-Go Decision Record.
- PR: #183.
- Accepted/head commit: `5b40d4ae553765d7adf323bcb1c59c09bd90ea88`.
- Merge commit: `7bc87dcdff8fd1020a25df5d6a6d91bf3583380b`.
- Post-merge verification commit/current main HEAD/tag target: `48fddc716feaad51aac8d03270221dacd403e828`.
- Tag: `avalaos-core-post-m5.7-manual-browser-walkthrough-ap-go-no-go-decision-record`.

## AP Approval Statement

AP approves exactly one manual browser walkthrough observation pass for the Manual Browser Walkthrough Evidence Gate candidate under the strict scope in this plan.

This approval is limited to one redacted manual observation pass only. It does not approve screenshots, browser automation, exports, PDFs, downloads, storage objects, signed URLs, workflow execution, status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, schema inspection, real assertions, readiness evidence, or readiness claims.

## Exact Approved Scope

The approved scope is one manual observation attempt against the local frontend/browser path only, if available without prohibited backend, DB, hosted, provider, deployment, Supabase stack, Docker, schema, workflow, storage, export, or artifact setup.

The pass may observe only the approved buyer/admin evidence surfaces listed below and may record only redacted written observations.

## Exact Run Count

- Approved run count: exactly one manual observation pass.
- Run count used by this milestone: one attempted manual observation pass.
- No retry, rerun, replay, expanded path, second viewport, second device, second browser, or repeated pass is allowed without separate AP approval.
- If the first pass is blocked, the result must be recorded as blocked and the observation must stop.

## Approved Surfaces

1. Buyer-entry or demo-entry surface.
2. Trust Center proof-status surface.
3. Admin Workbench overview surface.
4. Buyer Acceptance Pack or Review Gate surface.
5. Manual Browser Walkthrough plan/runbook/approval-boundary surface if present as read-only content.

## Allowed Observations

Allowed written observations are limited to:

- surface name
- observation status
- short redacted observation summary
- boundary result
- stop condition summary if applicable
- abort result if applicable
- prohibited-output confirmation
- proof-boundary confirmation

## Prohibited Outputs

Do not record raw logs, raw stdout/stderr, stack traces, concrete command strings, absolute local paths, host/port/IP values, DB URLs, row payloads, auth headers, claim values, provider keys, service-role/private tokens, project refs, target values, environment values, deployment URLs, container/image IDs, screenshots, browser output, DOM dumps, export/PDF/download artifacts, storage object references, signed URLs, schema dumps, SQL result sets, policy dumps, migration output, artifact SELECT payloads, provider responses, classifier output, or machine-specific values.

## Stop Conditions

Stop immediately if:

- the local frontend/browser path cannot be opened without prohibited setup.
- browser access is blocked before observation.
- an approved surface is unavailable.
- any navigation would require browser automation, screenshots, DOM dumps, raw browser artifacts, export/PDF/download generation, storage actions, signed URLs, workflow execution, status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, schema inspection, rollback/incident/backup/restore behavior, or real assertions.
- any output risk appears for raw, local, secret, host, port, IP, DB, row, auth, claim, provider, project, target, environment, deployment, browser-output, screenshot, export, PDF, download, storage, signed-URL, schema, SQL, policy, migration, artifact SELECT, provider-response, classifier-output, container, image, or machine-specific values.
- any wording would imply browser verification, walkthrough completion, readiness evidence, or readiness claims.

## Abort Rules

Abort the observation pass before or during observation if scope, run count, allowed observations, prohibited outputs, stop conditions, or proof-boundary wording cannot be preserved.

Do not attempt a workaround after abort. Do not switch to browser automation, scripted navigation, screenshots, crawlers, DOM dumps, raw browser artifacts, hosted validation, DB/RLS/artifact execution, provider/classifier execution, workflow execution, export/storage execution, or real assertions.

## Proof-Boundary Wording

This milestone may state that AP approved exactly one manual observation pass and that one pass was attempted. It must not claim browser verification, walkthrough completion, screenshot proof, readiness evidence, buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, operational readiness, pilot readiness, export/PDF/download readiness, approval-workflow readiness, or compliance certification.

## Explicit Non-Goals

This milestone does not:

- prove browser verification
- complete a walkthrough
- produce readiness evidence
- prove buyer, product, release-candidate, production, hosted, deployment, RLS, tenant-isolation, security, operational, pilot, export/PDF/download, approval-workflow, or compliance readiness
- capture screenshots
- generate browser artifacts
- generate exports/PDFs/downloads
- create storage objects or signed URLs
- execute workflows or change statuses
- run DB/RLS/artifact checks
- inspect schema
- run hosted/deployment validation
- execute provider/classifier behavior
- run rollback, incident, backup, or restore behavior
- run real assertions
- start the next execution milestone

## Observation Evidence Boundary

This is observation evidence only. It is not readiness evidence.