# Post-M5.7 Manual Browser Walkthrough AP Go/No-Go Decision Record

## Purpose

This document records the AP decision boundary for the Manual Browser Walkthrough Evidence Gate candidate after accepted M5.7 closure.

It is a docs/model-only decision record. It does not execute the walkthrough, grant AP approval, approve execution, launch a browser, run browser automation, capture screenshots, generate exports/PDFs/downloads, create storage objects, generate signed URLs, execute workflows, change statuses, run DB/RLS/artifact checks, inspect schema, run hosted/deployment validation, call providers/classifiers, run real assertions, produce readiness evidence, or start the next execution milestone.

## Accepted M5.7 Baseline

- Latest accepted milestone: M5.7 First AP-Approved Evidence Execution Gate.
- PR: #182.
- Accepted/head commit: `3bf599f15c971280f18ae2f06c6a15fe74ed8883`.
- Merge commit: `5322a9f29fb3542fec5d6885b81d45201a9b5e60`.
- Post-merge verification commit/current main HEAD/tag target: `caa757eae8bfbc744a414db92980a29ac44556f6`.
- Tag: `avalaos-core-m5.7-first-ap-approved-evidence-execution-gate`.

M5.7 recommended Manual Browser Walkthrough Evidence Gate as the first candidate for AP review only. M5.7 did not grant AP approval, did not approve execution, did not perform execution, and did not produce readiness evidence.

## Manual Browser Walkthrough Candidate Summary

Manual Browser Walkthrough Evidence Gate remains the first candidate track for AP review only.

The candidate is intended to provide buyer-visible, claim-safe observation value before higher-risk proof tracks. It must stay separate from DB/RLS/artifact execution, hosted/deployment validation, provider/classifier execution, export/PDF/download generation, storage-object creation, approval workflow execution, status changes, screenshots, and readiness evidence unless AP later grants a separate explicit approval with exact scope and boundaries.

This candidate remains unapproved and unperformed.

## AP Decision State

Allowed AP decision states:

- `pending`
- `approved`
- `rejected`
- `paused`

Current recorded AP decision state: `pending`.

Current recorded execution approval state: `not approved`.

Rationale: AP has not supplied explicit approval text for Manual Browser Walkthrough execution in this milestone request. The default state must remain pending.

## Decision Rule

Execution still requires AP's separate final go/no-go text unless AP explicitly supplies approval text that identifies:

- selected evidence track
- exact surfaces to observe
- exact run count
- allowed observations
- prohibited outputs
- stop conditions
- abort rules
- reviewer or decision owner
- evidence summary format
- proof-boundary wording

If any required decision field is missing, unclear, expanded, or inconsistent with this boundary, the decision state remains `pending` or must move to `paused`, and execution must not start.

## Future Execution Scope Template

This template is candidate-only. It is not approval to execute.

### Selected Candidate

- Candidate track: Manual Browser Walkthrough Evidence Gate.
- Current candidate state: candidate only.
- Current execution state: not approved and not performed.

### Exact Surfaces To Observe

If AP later supplies final go text, the future manual browser pass may observe only the AP-confirmed version of these surfaces:

1. Buyer-entry or demo-entry surface for claim-safe positioning and no-readiness wording.
2. Trust Center proof-status surface for limitation, evidence, and proof-boundary copy.
3. Admin Workbench overview surface for read-only evidence-control, approval-state, export-boundary, RLS-preparation, hosted/deployment-preparation, and M5.7 gate-selection summaries.
4. Buyer Acceptance Pack or Review Gate surface for boundary-safe buyer-facing summaries.
5. Manual Browser Walkthrough plan/runbook/approval-boundary surface if present as read-only content.

The future pass must not exercise settings, mutations, workflows, status transitions, export/PDF/download controls, storage controls, signed URL flows, DB/RLS/artifact checks, hosted/deployment controls, provider/classifier behavior, schema inspection, or real assertion controls.

### Exact Run Count

- Current approved run count: `0`.
- Future template if AP approves: exactly `1` manual observation pass.
- Any replay, retry, rerun, expanded path, or additional viewport/device pass requires separate AP approval before execution.

### Allowed Observations

A future AP-approved summary may record only:

- AP decision reference.
- selected track and run count.
- observed surface names.
- redacted step labels.
- redacted pass/fail/blocked observation summaries.
- stop-condition and abort-rule outcomes.
- prohibited-output confirmation.
- proof-boundary confirmation.
- readiness-claim exclusion summary.

### Prohibited Outputs

A future AP-approved summary must not include:

- raw logs, raw stdout/stderr, stack traces, or console dumps
- local paths, host values, port values, IP values, target values, project refs, or machine-specific values
- DB URLs, row payloads, auth headers, claim values, service-role/private tokens, provider keys, or environment values
- browser output, DOM dumps, screenshots, screenshot paths, screenshot folders, videos, traces, or browser-run artifacts
- export, PDF, download, storage-object, signed-URL, or public-URL artifacts
- approval workflow output, status-change output, schema dumps, SQL result sets, policy dumps, migration output, artifact SELECT payloads, hosted/deployment output, provider responses, classifier output, real assertion output, container IDs, image IDs, rollback output, incident output, backup output, or restore output

### Stop Conditions

Any future work must stop before execution if:

- AP final go/no-go text is absent, pending, unclear, rejected, paused, or incomplete.
- selected track, surfaces, run count, allowed observations, prohibited outputs, stop conditions, abort rules, reviewer, evidence summary format, or proof-boundary wording is unclear.
- a request expands scope beyond manual observation of the exact AP-approved surfaces.
- a request asks for screenshots, exports/PDFs/downloads, storage objects, signed URLs, browser automation, workflow execution, status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, schema inspection, rollback/incident/backup/restore behavior, or real assertions.
- any raw, local, secret, host, port, IP, DB, row, auth, claim, provider, project, target, environment, deployment, browser-output, screenshot, export, PDF, download, storage, signed-URL, schema, SQL, policy, migration, artifact SELECT, provider-response, classifier-output, container, image, or machine-specific output risk appears.
- any wording implies production readiness, hosted readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, operational readiness, pilot readiness, buyer readiness, product readiness, release-candidate readiness, compliance certification, browser verification, screenshot proof, export/PDF/download readiness, walkthrough completion, approval-workflow readiness, or readiness evidence.

### Abort Rules

A future run must abort:

- before execution if AP approval is missing or unclear.
- before execution if exact scope, run count, output boundaries, stop conditions, abort rules, reviewer, or proof-boundary wording is missing.
- during execution if an unapproved surface appears.
- during execution if a prohibited output would be produced or captured.
- during execution if browser automation, screenshots, exports/PDFs/downloads, storage, signed URLs, workflows, status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, schema inspection, or real assertions are requested or triggered.
- after abort, without attempting compensating workflow, rollback, incident, backup, restore, DB, storage, or provider actions.

### Evidence Summary Format

Any later AP-approved execution summary must use a redacted, no-artifact format:

- milestone and AP decision reference
- selected candidate track
- exact AP-approved run count
- exact AP-approved surfaces observed
- allowed redacted observation summary
- blocked or skipped areas
- stop-condition and abort-rule summary
- prohibited-output confirmation
- proof-boundary confirmation
- explicit readiness exclusions
- final confirmation that no unapproved execution occurred

## Decision Outcome

AP decision state remains `pending`.

Recommendation: pause until AP supplies explicit go/no-go text. If AP supplies `approved`, a later separate execution milestone must still preserve the exact approved scope, run count, output boundaries, prohibited artifacts, stop conditions, abort rules, reviewer, evidence summary format, and proof-boundary wording before any browser launch or observation begins.

## Proof-Boundary Preservation

This decision record preserves these boundaries:

- no AP approval unless explicitly stated by AP
- no execution performed
- no browser launch
- no browser automation
- no screenshots
- no screenshot folders
- no exports/PDF/downloads
- no storage objects
- no signed URLs
- no workflow execution
- no approval, signoff, source, workflow, or readiness status changes
- no DB/RLS/artifact checks
- no schema inspection
- no hosted/deployment validation
- no provider/classifier execution
- no rollback, incident, backup, or restore execution
- no real assertions
- no readiness evidence
- no next execution milestone started