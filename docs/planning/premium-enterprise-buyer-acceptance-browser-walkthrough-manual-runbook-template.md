# Premium Enterprise Buyer Acceptance Browser Walkthrough Manual Runbook Template

## 1. Purpose

Define a deterministic manual browser walkthrough runbook and sanitized evidence template for a future AP-approved manual browser walkthrough.

This slice defines future manual execution steps, observation fields, redaction rules, stop conditions, required pre-execution checks, and proof-safe closure language. It does not execute the runbook, approve browser execution, launch a browser, run browser automation, capture screenshots, create screenshot folders, generate export/PDF/download artifacts, create browser evidence files, or produce readiness evidence.

## 2. Current baseline after PR #172

The current baseline includes:

- Trust Center read-only Admin UI.
- Buyer Acceptance Pack read-only Admin UI.
- Buyer Acceptance Review Gate read-only Admin UI.
- Buyer Acceptance Admin Walkthrough read-only Admin UI.
- Browser Walkthrough Rehearsal Plan.
- Browser Walkthrough Execution Boundary Contract.

AP approval is still required before any browser execution. No browser execution has been approved. No browser automation exists. No browser has been launched. No screenshot capture exists. No screenshot evidence policy exists. No export/PDF/download exists. No approval workflow exists. No readiness evidence exists.

## 3. Why manual runbook/template comes before execution

A manual browser walkthrough can expose browser output, local-machine details, screenshots, generated artifacts, and unsupported buyer-facing claims if it runs before evidence boundaries exist. This runbook defines exactly what a future AP-approved manual run may inspect, how observations must be recorded, what must be redacted, and when the reviewer must stop.

## 4. Source models

The runbook template derives from:

- `CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT`
- `ADMIN_WORKBENCH_SECTIONS`

It preserves source statuses and does not mutate source snapshots.

## 5. Runbook status and execution status

The runbook status is `template_defined`. The execution status is `ap_approval_required`.

The runbook does not use executed, verified, passed, ready, approved, complete, or success status language. Future manual browser execution remains not approved.

## 6. Future manual execution steps

The future manual steps are:

- Confirm AP approval before future execution.
- Confirm browser mode and output policy before future execution.
- Open Admin Workbench only in future AP-approved execution.
- Inspect Trust Center.
- Inspect Buyer Acceptance Pack.
- Inspect Review Rehearsal Gate.
- Inspect Admin Walkthrough.
- Confirm export/PDF/download remains blocked.
- Confirm approval/signoff/status-change actions remain unavailable.
- Confirm browser/screenshot evidence is not produced by this template slice.
- Confirm readiness/certification claims remain blocked.
- Record sanitized textual observations only.
- Close without status change.

## 7. Sanitized evidence template fields

The sanitized evidence template supports only textual placeholders and proof-safe observations:

- Run date placeholder.
- Reviewer placeholder.
- Execution approval reference placeholder.
- Section inspected.
- Expected observation.
- Actual sanitized observation placeholder.
- Blockers observed placeholder.
- Stop condition triggered placeholder.
- Redaction checklist confirmation.
- Proof-boundary confirmation.
- Deferred items confirmation.

The template explicitly prohibits raw logs, raw stdout/stderr, screenshots, screenshot paths, screenshot folders, browser logs, export/PDF/download files, local paths, host/port/IP values, DB URLs, row payloads, auth headers, provider keys, service-role values, private tokens, project refs, target values, container/image IDs, stack traces, and machine-specific values.

## 8. Redaction checklist

The redaction checklist excludes:

- Raw logs and raw stdout/stderr.
- Screenshots, screenshot paths, and screenshot folders.
- Browser logs.
- Export/PDF/download files.
- Local paths.
- Host/port/IP values.
- DB URLs.
- Row payloads.
- Auth headers.
- Provider keys.
- Service-role values.
- Private tokens.
- Project refs.
- Target values.
- Container/image IDs.
- Stack traces.
- Machine-specific values.

## 9. Allowed evidence

Allowed future evidence is limited to:

- Sanitized textual observation template only.
- Future AP-approved manual run summary only.

This slice creates no browser evidence and no evidence artifact from a run.

## 10. Prohibited evidence

Prohibited evidence includes:

- Screenshots.
- Screenshot comparisons.
- Screenshot folders.
- Browser logs.
- Raw logs.
- Raw stdout/stderr.
- Exports.
- PDFs.
- Downloads.
- Approval artifacts.
- Any sensitive or local-machine data.

## 11. Stop conditions

Stop conditions include:

- AP approval missing.
- Browser execution attempted by this slice.
- Screenshot captured.
- Screenshot path/folder generated.
- Export/download/PDF action appears available.
- Approval/signoff/status-change action appears.
- Readiness/certification claim appears.
- Generated artifact appears in scope.
- Sensitive/local-machine values appear.
- DB/RLS/artifact/hosted/deployment command required.

## 12. Required before execution

Future manual execution cannot proceed until:

- Explicit AP approval exists.
- Browser mode is selected.
- Output policy is accepted.
- Redaction rules are accepted.
- Stop conditions are accepted.
- Screenshot policy exists if screenshots are requested in a future slice.
- No export/PDF/download is in scope.
- No approval/status change is in scope.

## 13. Deferred items

Deferred items include:

- Actual manual browser walkthrough execution.
- Browser automation implementation.
- Screenshot capture.
- Screenshot evidence policy.
- Export/PDF/download design.
- Approval workflow design.
- DB-backed persistence.
- Editable buyer controls.
- DB/RLS/artifact proof.
- Hosted/deployment/security proof tracks.

## 14. Test coverage

The manual-runbook regression test verifies deterministic output, safe statuses, source status preservation, Admin section order derivation, required manual steps, evidence field structure, redaction exclusions, allowed/prohibited evidence, stop conditions, required-before-execution checks, deferred items, proof-safe summary text, old-name rejection, unsupported positive wording rejection, and source snapshot non-mutation.

## 15. Naming/copy guardrail coverage

The buyer-demo copy guardrail includes the manual runbook model and checks that the runbook remains template-only, AP approval is still required before execution, no browser was launched, no browser automation was run, no screenshot was captured, no evidence artifact was generated, no readiness evidence was produced, export/PDF/download remains blocked, the deterministic runbook builder exists, and old buyer-facing Lite names are not introduced.

## 16. What this slice implements

This slice implements:

- Deterministic manual browser walkthrough runbook model.
- Sanitized evidence template structure.
- Manual runbook regression tests.
- Package test script and aggregate test inclusion.
- Buyer-copy guardrail coverage.
- Planning and evidence docs.

## 17. What this slice does not implement

This slice does not implement browser automation, browser launch, browser execution, Playwright/Cypress dependencies, browser scripts, screenshot capture, screenshot comparison, screenshot folders, browser evidence files, run evidence output files, PDF/export/download generation, approval workflow, UI buttons/actions, execution approval, status changes, DB-backed persistence, editable buyer controls, Trust Center proof status changes, Buyer Acceptance Pack status changes, Review Gate status changes, Admin Walkthrough status changes, Browser Walkthrough Plan status changes, Browser Walkthrough Execution Boundary status changes, Admin Workbench navigation or UI changes, provider behavior, runtime adapters, Supabase changes, SQL changes, RLS changes, deployment changes, CI changes, or generated-output behavior changes.

## 18. Future AP-approved manual browser execution

A future manual execution slice must explicitly define AP-approved execution scope, browser mode, exact observation path, output policy, redaction rules, stop conditions, evidence handling, and closure language before a browser is opened.

## 19. Future screenshot evidence policy

Screenshot policy remains deferred. A future policy must define capture scope, redaction, storage, retention, comparison rules, and whether screenshots are evidence or review aids before any screenshot is captured.

## 20. Future export/PDF design

Export/PDF/download remains blocked. A future design must define artifact contents, limitation disclosures, claim controls, approval requirements, and evidence boundaries before generation exists.

## 21. Future approval workflow

Approval workflow remains deferred. A future workflow must define roles, permissions, state transitions, audit records, revocation behavior, and AP acceptance criteria before signoff or status-change behavior exists.

## 22. Future DB/RLS/artifact/hosted/deployment/security proof tracks

DB, RLS, artifact, hosted, deployment, and security proof tracks remain separate AP-approved work. This runbook template does not inspect schema, execute DB/RLS/artifact checks, validate hosted environments, perform deployment validation, or prove security posture.

## 23. Acceptance criteria

- The runbook derives from the current execution boundary, browser walkthrough plan, Admin Walkthrough, Buyer Acceptance Pack, Review Gate, and Admin Workbench section models.
- The runbook uses a deterministic timestamp.
- Runbook and execution statuses do not imply execution approval.
- Future manual steps, sanitized evidence fields, redaction checklist, allowed/prohibited evidence, stop conditions, required-before-execution checks, and deferred items are represented.
- Tests and copy guardrails preserve the template-only boundary.
- No browser execution, screenshot evidence, export/PDF/download generation, approval workflow, evidence artifact, or readiness evidence is produced.
