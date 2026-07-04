# Premium Enterprise Buyer Acceptance Admin Walkthrough Read-Only UI

## Purpose

This slice adds a read-only Admin Workbench section for the existing deterministic Buyer Acceptance Admin Walkthrough rehearsal snapshot.

The UI lets internal reviewers inspect the buyer-review journey, section order, walkthrough steps, expected observations, blockers, findings, and deferred proof tracks before any browser automation, screenshot capture, export/PDF/download, or approval workflow work is approved.

## Current Baseline After PR #169

After PR #169, the deterministic Admin Walkthrough rehearsal model exists and is post-merge verified. The model is internal rehearsal only. Source statuses remain evidence-gated or rehearsal-gated. No browser automation, screenshot capture, export/PDF/download, approval workflow, DB persistence, editable buyer controls, or readiness evidence exists.

## Why Admin Walkthrough UI Comes Before Browser Automation Or Export/PDF

The read-only Admin UI lets AP and internal reviewers inspect the claim-safe walkthrough path before introducing browser automation, screenshots, downloadable artifacts, or buyer-facing export surfaces. It keeps the proof boundary visible while avoiding artifact generation or status changes.

## Admin Workbench Placement

The Admin Workbench adds a new section:

- Key: `buyer_acceptance_admin_walkthrough`
- Label: `Admin Walkthrough`
- Short label: `Walkthrough`
- Position: after `buyer_acceptance_review_gate` and before `evidence_policy`

The section disclosure states that the walkthrough is read-only internal rehearsal only, not browser automation, not screenshot evidence, not an approval, not an export, not readiness evidence, not compliance evidence, and no PDF/download is generated.

## Panel Sections

The Admin Walkthrough panel renders:

- Title and status banner.
- Source Buyer Acceptance Pack status.
- Source Review Gate status.
- Proof-safe summary.
- Admin section order.
- Walkthrough steps grouped by Admin section.
- Expected observations and evidence references.
- Must-confirm, must-not-claim, and blocked-action lists.
- Findings.
- Export blockers.
- Readiness blockers.
- Deferred tracks.
- Limitation and proof-boundary disclosure.
- Safe empty states for every repeated section.

## Presentation Helper Behavior

The presentation helper provides status labels, step labels, finding status labels, step grouping, blocker accessors, deferred-track accessors, required-finding filters, a proof-safe status summary, and assertion helpers that keep the walkthrough from being presented as ready, approved, exportable, browser-verified, screenshot-proven, or certified.

## UI Safety Rules

The UI uses evidence-required, rehearsal-required, and blocked styling. These states are visually distinct from success states. The UI does not add action buttons for export, download, PDF, screenshot capture, browser runs, signoff, approval, generation, or completion. Export/PDF/download, browser automation, and screenshot capture appear only as blocked or deferred scope.

## Test Coverage

Tests cover presentation helper determinism, non-ready status wording, source status preservation, read-only internal rehearsal summary, blocked export/PDF/download summary, browser automation and screenshot capture not implemented wording, grouping by Admin section, blocker accessors, deferred tracks, required findings, proof-safe copy assertions, unsafe wording rejection, old-name rejection, and non-mutation of the walkthrough snapshot.

Admin Workbench tests verify the new section key, label, short label, ordering, and proof-safe disclosure.

## Naming/Copy Guardrail Coverage

The buyer-copy guardrail includes the new panel and presentation helper. It checks that the Admin Walkthrough UI and presentation include proof-safe boundary wording:

- Read-only internal rehearsal.
- Not browser automation.
- Not screenshot evidence.
- Not an approval.
- Not an export.
- Not readiness evidence.
- Not compliance evidence.
- No PDF/download generated.
- Export/PDF/download remains blocked.

## What This Slice Implements

This slice implements:

- Admin Workbench section model update.
- Admin Workbench render slot for the walkthrough panel.
- Organization setup wiring for the panel.
- Read-only Admin Walkthrough panel.
- Admin Walkthrough presentation helper.
- Presentation regression test.
- Admin Workbench model regression updates.
- Buyer-copy guardrail coverage.
- Planning and implementation evidence.

## What This Slice Does Not Implement

This slice does not implement browser automation, screenshot capture, PDF/export/download generation, approval workflow, signoff workflow, status changes, DB-backed persistence, editable buyer controls, Trust Center proof-status changes, Buyer Acceptance Pack status changes, Review Gate status changes, Admin Walkthrough model status changes, DB/RLS/artifact execution, hosted validation, deployment validation, provider behavior, classifier execution, schema inspection, or real assertion execution.

## Deferred Browser Walkthrough Rehearsal

Browser walkthrough rehearsal remains deferred until a future AP-approved slice defines scope, allowed browser actions, evidence boundaries, stop conditions, and output handling.

## Deferred Screenshot Capture

Screenshot capture remains deferred. This slice does not capture, store, compare, or present screenshots as evidence.

## Deferred Export/PDF Slice

Export/PDF/download generation remains deferred until future AP-approved artifact scope defines buyer-facing language, file boundaries, download behavior, storage behavior, and evidence requirements.

## Deferred Approval Workflow

Approval workflow remains deferred. This slice does not add signoff actions, approver roles, status transitions, audit records, or approval persistence.

## Deferred Persistence/Editable Controls

DB-backed persistence and editable buyer controls remain deferred. The panel renders deterministic snapshot data only.

## Deferred DB/RLS/Artifact/Hosted/Deployment/Security Proof Tracks

DB/RLS/artifact proof, hosted validation, deployment validation, and security proof tracks remain deferred until AP explicitly approves real evidence scope, assertion boundaries, run counts, output boundaries, stop conditions, and proof-boundary language.

## Acceptance Criteria

- Admin Workbench includes the read-only Admin Walkthrough section in the required order.
- Panel renders the deterministic Admin Walkthrough snapshot.
- Presentation helper keeps summary and labels proof-safe.
- Tests cover presentation behavior and Admin Workbench section order.
- Buyer-copy guardrail covers the new panel and presentation helper.
- No browser automation, screenshot capture, export/PDF/download, approval workflow, status changes, DB persistence, editable controls, or readiness evidence is introduced.
