# Post-M5.7 Manual Browser Walkthrough One-Pass Observation Retry With Frontend Access Preflight Plan

## Milestone Name

Post-M5.7 Manual Browser Walkthrough One-Pass Observation Retry With Frontend Access Preflight.

## Accepted Baseline From PR #184

- Latest accepted milestone: Post-M5.7 Manual Browser Walkthrough One-Pass Observation Evidence.
- PR: #184.
- Accepted/head commit: `2b35e5d23f3dc60188749e1b52ec154ee549405c`.
- Merge commit: `34d167da7962054385ff0529e2e3a81163b96f11`.
- Post-merge verification commit/current main HEAD/tag target: `2faeebf379f10f7db7b42c507bc26972e44d9fcd`.
- Tag: `avalaos-core-post-m5.7-manual-browser-walkthrough-one-pass-observation-evidence`.

## AP Approval Statement

AP approves exactly one retry attempt for the Manual Browser Walkthrough Evidence Gate candidate, with a narrow frontend-access preflight first.

This approval allows:

1. One frontend-access preflight to determine whether the local frontend/browser observation path is available without prohibited setup.
2. If and only if the frontend-access preflight succeeds, exactly one manual browser observation pass across the approved surfaces.
3. If the frontend-access preflight fails or is blocked, record the blocked result and stop.

This approval does not approve screenshots, browser automation, scripted browser navigation, exports, PDFs, downloads, storage objects, signed URLs, workflow execution, status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, schema inspection, SQL/migration execution, Supabase stack, Docker, real assertions, readiness evidence, or readiness claims.

## Reason For Retry

PR #184 closed the prior one-pass observation milestone as blocked before UI observation. The approved pass was attempted once, completed observation passes were zero, and no approved surfaces were observed.

This retry adds a frontend-access preflight so the single retry observation pass is only used if the local frontend/browser observation path is available without prohibited setup.

## Frontend-Access Preflight Scope

The frontend-access preflight may only determine whether the local frontend/browser observation path can be reached without prohibited setup.

Allowed preflight result values are:

- available
- blocked
- unavailable
- aborted

The preflight must not record local URLs, host values, port values, IP values, local paths, raw logs, browser output, console output, stack traces, or command strings. It must not be treated as startup success, hosted readiness, deployment readiness, browser verification, or readiness evidence.

If the preflight is blocked, unavailable, or aborted, observation must not proceed.

## Exact Approved Observation Scope

If and only if the frontend-access preflight result is available, the milestone may perform exactly one manual browser observation pass across the approved buyer/admin evidence surfaces.

The observation pass must use the existing local frontend/browser observation path only, if available without prohibited setup. It must not use browser automation, scripted navigation, crawler-style navigation, screenshots, DOM extraction, browser artifacts, workflow execution, status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, schema inspection, SQL/migration execution, Supabase stack, Docker, or real assertions.

## Exact Run Count

- Frontend-access preflight: exactly one.
- Manual observation pass: exactly one, only if preflight succeeds.
- No retry, rerun, replay, expanded path, second viewport, second device, second browser, repeated pass, or workaround unless separately approved by AP.
- If the observation is blocked after preflight succeeds, record the blocked result and stop.

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

Do not record raw logs, raw stdout/stderr, stack traces, concrete command strings, local paths, host values, port values, IP values, DB URLs, row payloads, auth headers, claim values, provider keys, service-role/private tokens, project refs, target values, environment values, deployment URLs, container/image IDs, screenshots, browser output, DOM dumps, videos, traces, HAR files, console dumps, export/PDF/download artifacts, storage object references, signed URLs, schema dumps, SQL result sets, policy dumps, migration output, artifact SELECT payloads, provider responses, classifier output, or machine-specific values.

## Stop Conditions

Stop immediately if:

- the frontend-access preflight is blocked, unavailable, or aborted.
- the local frontend/browser observation path cannot be reached without prohibited setup.
- access would require Supabase stack, Docker, DB, hosted deployment, provider/classifier behavior, schema inspection, migration execution, environment secrets, workflow execution, storage access, export/PDF/download generation, screenshots, browser automation, DOM extraction, or any other prohibited setup.
- an approved surface is unavailable during the observation pass.
- any output risk appears for raw, local, secret, host, port, IP, DB, row, auth, claim, provider, project, target, environment, deployment, browser-output, screenshot, export, PDF, download, storage, signed-URL, schema, SQL, policy, migration, artifact SELECT, provider-response, classifier-output, container, image, or machine-specific values.
- any wording would imply browser verification, walkthrough completion, readiness evidence, or readiness claims.

## Abort Rules

Abort before or during preflight or observation if scope, run count, allowed observations, prohibited outputs, stop conditions, or proof-boundary wording cannot be preserved.

Do not attempt a workaround after abort. Do not switch to browser automation, scripted navigation, screenshots, crawlers, DOM dumps, raw browser artifacts, hosted validation, DB/RLS/artifact execution, provider/classifier execution, workflow execution, export/storage execution, or real assertions.

## Proof-Boundary Wording

This milestone may state that AP approved exactly one frontend-access preflight and exactly one manual observation pass only if the preflight succeeds. It may state the preflight result and whether observation proceeded.

It must not claim browser verification, walkthrough completion, screenshot proof, readiness evidence, buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, operational readiness, pilot readiness, export/PDF/download readiness, approval-workflow readiness, or compliance certification.

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
- run SQL or migrations
- run Supabase stack or Docker
- run hosted/deployment validation
- execute provider/classifier behavior
- run rollback, incident, backup, or restore behavior
- run real assertions
- start the next execution milestone

## Observation Evidence Boundary

This is observation evidence only. It is not readiness evidence.