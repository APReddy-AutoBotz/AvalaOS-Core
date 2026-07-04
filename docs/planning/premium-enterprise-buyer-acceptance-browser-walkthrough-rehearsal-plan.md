# Premium Enterprise Buyer Acceptance Browser Walkthrough Rehearsal Plan

## Purpose

Define a deterministic, proof-safe plan for a future AP-approved browser walkthrough of the read-only Admin buyer-review journey. This slice creates the model, tests, planning record, and evidence record only.

## Current baseline after PR #170

PR #170 added the read-only Admin Walkthrough UI and deterministic Admin Walkthrough model. The current baseline includes read-only Trust Center, Buyer Acceptance Pack, Review Rehearsal Gate, and Admin Walkthrough Admin sections.

The baseline still has no browser automation, no screenshot capture, no export/PDF/download generation, no approval workflow, no DB-backed buyer persistence, no editable buyer controls, no proof-status changes, and no readiness evidence.

## Why browser walkthrough planning comes before browser execution

Browser execution would create a new evidence surface with additional controls for scope, output boundaries, screenshots, generated artifacts, review handling, and stop conditions. This plan defines those boundaries first so a later AP-approved execution slice can inspect the Admin journey without accidentally creating unsupported readiness, browser-proof, screenshot-proof, export, approval, or certification claims.

## Source models

The deterministic plan derives from:

- `ADMIN_WORKBENCH_SECTIONS`
- `CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT`

The plan does not duplicate or upgrade source statuses. The Buyer Acceptance Pack remains evidence-required. The Review Gate remains not review-ready. The Admin Walkthrough remains not ready or successful.

## Planned browser walkthrough path

The planned path covers:

1. Launch Admin Workbench view.
2. Inspect Trust Center section.
3. Inspect Buyer Acceptance Pack section.
4. Inspect Review Rehearsal Gate section.
5. Inspect Admin Walkthrough section.
6. Confirm no export/download/PDF actions.
7. Confirm no browser or screenshot evidence is produced.
8. Confirm readiness claims remain blocked.
9. Confirm deferred tracks remain visible.
10. Close without status change.

## Allowed inspection-only actions

Allowed actions are limited to future AP-approved inspection:

- open the local app view only when future AP approval exists
- navigate read-only Admin sections
- observe labels, statuses, blockers, and deferred states
- record textual observations in a future evidence document

## Prohibited actions

This plan prohibits:

- browser automation execution in this slice
- screenshot capture
- screenshot comparison
- export generation
- PDF generation
- download generation
- approval, signoff, complete, or status-change actions
- DB/RLS/artifact execution
- hosted or deployment validation
- provider or classifier execution
- schema inspection
- real assertion execution

## Stop conditions

A future browser walkthrough must stop if:

- any export/download/PDF action appears as available
- any approve/signoff/complete/status-change action appears
- any readiness or certification claim appears
- any browser or screenshot evidence is produced in this plan slice
- any generated artifact appears in scope
- any DB/RLS/artifact/hosted/deployment command is required

## Expected safe text

The plan expects safe boundary text such as:

- browser walkthrough remains plan-only
- no browser run was performed
- no screenshot was captured
- no readiness evidence was produced
- export/PDF/download remains blocked
- read-only internal rehearsal
- not an approval
- not an export
- not readiness evidence
- not compliance evidence
- deferred proof tracks remain visible

## Deferred execution tracks

Deferred tracks are:

- AP-approved browser walkthrough execution
- AP-approved screenshot capture
- AP-approved screenshot evidence policy
- export/PDF/download design
- approval workflow design
- DB-backed persistence
- editable buyer controls
- DB/RLS/artifact proof
- hosted/deployment/security proof tracks

## Test coverage

The `test:buyer-acceptance-browser-walkthrough-plan` task verifies deterministic output, source status preservation, section-order derivation, required planned steps, inspection-only allowed actions, prohibited actions, stop conditions, deferred tracks, proof-safe summary text, old-name rejection, unsupported positive wording rejection, and source snapshot non-mutation.

## Naming/copy guardrail coverage

The buyer-demo copy guardrail includes `services/buyerAcceptanceBrowserWalkthroughPlan.ts` and confirms the plan-only browser boundary, no browser run, no screenshot capture, no readiness evidence, blocked export/PDF/download scope, deterministic plan builder presence, and no old buyer-facing Lite names.

## What this slice implements

This slice implements:

- deterministic browser walkthrough rehearsal plan model
- plan snapshot builder and current snapshot export
- model tests
- package test script and aggregate test inclusion
- buyer-copy guardrail coverage
- planning and evidence docs

## What this slice does not implement

This slice does not implement browser automation, browser execution, Playwright/Cypress setup, browser scripts, screenshot capture, screenshot comparison, screenshot folders, PDF/export/download generation, approval workflow, export/download/PDF/screenshot/browser/signoff/approval/complete buttons, DB-backed persistence, editable buyer controls, Trust Center status changes, Buyer Acceptance Pack status changes, Review Gate status changes, Admin Walkthrough status changes, Admin Workbench navigation changes, provider behavior, runtime adapter changes, Supabase changes, SQL changes, RLS changes, deployment changes, or generated-output behavior changes.

## Future AP-approved browser walkthrough execution

A later execution slice must receive explicit AP approval before opening or automating a browser. It must define exact views, selectors or observation method, output boundaries, run count, stop conditions, and evidence format before execution.

## Future AP-approved screenshot capture

Screenshot capture remains deferred. A future screenshot slice must define capture scope, storage policy, redaction boundaries, comparison policy, retention expectations, and whether screenshots are evidence or only review aids.

## Future export/PDF design

Export/PDF/download remains blocked. A future export design slice must define artifact contents, claim controls, limitation disclosures, approval requirements, download behavior, and evidence boundaries before any generation is implemented.

## Future approval workflow

Approval workflow remains deferred. A future approval slice must define roles, permissions, state transitions, audit requirements, revocation behavior, and AP acceptance criteria before any signoff or status-change behavior is implemented.

## Future DB/RLS/artifact/hosted/deployment/security proof tracks

DB, RLS, artifact, hosted, deployment, and security proof tracks remain separate AP-approved milestones. This plan does not inspect schema, execute DB/RLS/artifact checks, run hosted validation, perform deployment validation, or prove security posture.

## Acceptance criteria

- The plan derives from current Admin Workbench, Admin Walkthrough, Buyer Acceptance Pack, and Review Gate models.
- The plan uses a fixed deterministic timestamp.
- The plan remains planned or rehearsal-required, not executed, verified, passed, ready, approved, complete, or successful.
- Required planned steps, allowed actions, prohibited actions, stop conditions, and deferred execution tracks are represented.
- Summary and expected safe text preserve the proof boundary.
- Tests and copy guardrails cover the plan-only browser boundary.
- No browser execution, screenshot evidence, export/PDF/download generation, approval workflow, or readiness evidence is produced.
