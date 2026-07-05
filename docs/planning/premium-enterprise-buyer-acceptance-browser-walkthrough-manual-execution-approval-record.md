# Premium Enterprise Buyer Acceptance Browser Walkthrough Manual Execution Approval Record

## 1. Purpose

Define a deterministic Manual Browser Walkthrough Execution Approval Record model that AP must explicitly approve before any future manual browser walkthrough can happen.

This slice defines the approval record structure, required AP confirmations, allowed scope, prohibited scope, evidence rules, redaction checklist, stop conditions, and deferred execution/proof tracks. It does not grant approval, approve browser execution, execute the runbook, launch a browser, run browser automation, capture screenshots, create screenshot folders, generate export/PDF/download artifacts, create browser evidence, create run evidence, or produce readiness evidence.

## 2. Current baseline after PR #173

The current baseline includes:

- Trust Center read-only Admin UI.
- Buyer Acceptance Pack read-only Admin UI.
- Buyer Acceptance Review Gate read-only Admin UI.
- Buyer Acceptance Admin Walkthrough read-only Admin UI.
- Browser Walkthrough Rehearsal Plan.
- Browser Walkthrough Execution Boundary Contract.
- Manual Browser Walkthrough Runbook and Sanitized Evidence Template.

AP approval is still required before any browser execution. No browser execution has been approved. No browser automation exists. No browser has been launched. No screenshot capture exists. No screenshot evidence policy exists. No export/PDF/download exists. No approval workflow exists. No readiness evidence exists.

## 3. Why approval record comes before manual execution

A future manual browser walkthrough is an execution action even if it is manual and read-only. It can expose browser output, local-machine values, screenshots, generated artifacts, or unsupported buyer-facing claims if the approval boundary is unclear.

The approval record comes before manual execution so AP can explicitly approve exact scope, manual browser mode, output policy, evidence template, redaction rules, stop conditions, and closure language before any browser is opened.

## 4. Source models

The approval record derives from:

- `CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_MANUAL_RUNBOOK_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_EXECUTION_BOUNDARY_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_BROWSER_WALKTHROUGH_PLAN_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT`
- `CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT`
- `ADMIN_WORKBENCH_SECTIONS`

It preserves source statuses and does not mutate source snapshots.

## 5. Approval record status and decision status

The approval record status is `approval_record_defined`. The approval decision status is `ap_approval_required`.

The model does not use executed, verified, passed, ready, approved, complete, or success status language for the approval record. AP approval has not been granted.

## 6. Approval placeholders

The approval record uses deterministic non-sensitive placeholders:

- `[AP_APPROVAL_REFERENCE_PENDING]`
- `[APPROVER_PENDING]`
- `[APPROVAL_DECISION_PENDING]`
- `[BROWSER_MODE_PENDING]`
- `[RUN_WINDOW_PENDING]`

The placeholders do not include secrets, env values, local paths, host/port/IP values, DB URLs, auth headers, provider keys, service-role values, private tokens, project refs, target values, container/image IDs, stack traces, or machine-specific values.

## 7. Approval scope items

Approval scope items cover:

- Manual browser walkthrough execution.
- Local app view opening.
- Admin Workbench read-only inspection.
- Trust Center read-only inspection.
- Buyer Acceptance Pack read-only inspection.
- Review Rehearsal Gate read-only inspection.
- Admin Walkthrough read-only inspection.
- Sanitized textual observation only.
- No screenshot capture.
- No browser automation.
- No export/PDF/download.
- No approval/signoff/status change.
- No readiness/certification claims.
- No DB/RLS/artifact/hosted/deployment/provider/classifier/schema/real assertion execution.

Every item records requested scope, what is allowed only after explicit AP approval, what remains prohibited in all cases for this slice, and the proof boundary.

## 8. Approval requirements

The approval record requires AP to explicitly confirm:

- Execution scope.
- Manual browser mode.
- Local app view only.
- Sections to inspect.
- Output capture policy.
- Sanitized textual evidence template.
- Redaction checklist.
- Stop conditions.
- No screenshots unless a future screenshot policy is approved.
- No export/PDF/download.
- No approval/signoff/status change.
- No readiness claims.

## 9. Evidence rules

Evidence rules allow only:

- Sanitized textual observations after future explicit AP approval.
- Sanitized manual run summary after future explicit AP approval.

This slice does not store evidence and does not create browser, screenshot, export, PDF, download, approval, or readiness artifacts.

## 10. Redaction checklist

The redaction checklist excludes:

- Screenshots.
- Screenshot paths.
- Screenshot folders.
- Screenshot comparisons.
- Browser logs.
- Raw logs.
- Raw stdout/stderr.
- Export/PDF/download files.
- Approval artifacts.
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

## 11. Stop conditions

Stop conditions include:

- AP approval missing.
- Approval decision marked approved in this slice.
- Browser execution attempted in this slice.
- Browser automation attempted.
- Screenshot captured.
- Screenshot path/folder generated.
- Export/download/PDF action appears available.
- Approval/signoff/status-change action appears.
- Readiness/certification claim appears.
- Generated artifact appears in scope.
- Sensitive/local-machine values appear.
- DB/RLS/artifact/hosted/deployment command required.

## 12. Required before approval

Before approval can be granted in a future AP-approved execution slice, AP must confirm:

- Exact execution scope.
- Manual browser mode.
- Output capture policy.
- Sanitized evidence template.
- Redaction checklist.
- Stop conditions.
- No screenshots are in scope unless future screenshot policy is approved.
- No export/PDF/download is in scope.
- No approval/status change is in scope.
- No readiness claim is made.

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

The approval-record regression test verifies deterministic output, safe status values, source status preservation, Admin section order derivation, deterministic placeholders, required approval scope, required AP confirmations, evidence rules, prohibited evidence and redaction exclusions, stop conditions, required-before-approval checks, deferred items, proof-safe summary text, old-name rejection, unsupported positive wording rejection, and source snapshot non-mutation.

## 15. Naming/copy guardrail coverage

The buyer-demo copy guardrail includes the approval-record model and checks that the manual execution approval record remains template-only, AP approval has not been granted, no browser was launched, no browser automation was run, no screenshot was captured, no evidence artifact was generated, no readiness evidence was produced, export/PDF/download remains blocked, the deterministic approval builder exists, and old buyer-facing Lite names are not introduced.

## 16. What this slice implements

This slice implements:

- Deterministic manual browser walkthrough execution approval record model.
- Approval placeholders.
- Approval scope items.
- Approval requirements.
- Evidence rules and redaction checklist.
- Stop conditions.
- Required-before-approval checks.
- Deferred item list.
- Regression tests.
- Package test script and aggregate test inclusion.
- Buyer-copy guardrail coverage.
- Planning and evidence docs.

## 17. What this slice does not implement

This slice does not grant approval, mark AP approval granted, mark execution approved, implement browser automation, run browser automation, launch a browser, add Playwright/Cypress/browser dependencies, create browser scripts, capture screenshots, compare screenshots, create screenshot folders, create browser evidence files, create evidence output files from a run, implement PDF/export/download generation, implement approval workflow, add buttons/actions for export/download/PDF/screenshot/browser/signoff/approval/complete, approve browser execution, change statuses, implement DB-backed persistence, implement editable buyer controls, change Trust Center proof statuses, change Buyer Acceptance Pack model status, change Review Gate model status logic, change Buyer Acceptance Admin Walkthrough model status logic, change Browser Walkthrough Plan model status logic, change Browser Walkthrough Execution Boundary model status logic, change Manual Runbook model status logic, change Admin Workbench navigation or UI, implement new role-management behavior, implement new AI provider behavior, implement audit persistence, change deterministic scoring, or change generated-output behavior.

## 18. Future AP-approved manual browser execution

A future manual execution slice must explicitly reference this approval record, record the AP approval decision, confirm the exact scope and output policy, and preserve all stop conditions before a browser is opened.

## 19. Future screenshot evidence policy

Screenshot evidence remains deferred. A future screenshot policy must define capture scope, redaction, storage, retention, comparison rules, whether screenshots are evidence or review aids, and stop conditions before any screenshot is captured.

## 20. Future export/PDF design

Export/PDF/download remains blocked. A future design must define artifact contents, limitation disclosures, claim controls, approval requirements, evidence boundaries, and blocked-readiness language before generation exists.

## 21. Future approval workflow

Approval workflow remains deferred. A future workflow must define roles, permissions, state transitions, audit records, revocation behavior, AP acceptance criteria, and status-change proof before signoff or approval behavior exists.

## 22. Future DB/RLS/artifact/hosted/deployment/security proof tracks

DB, RLS, artifact, hosted, deployment, and security proof tracks remain separate AP-approved work. This approval record does not inspect schema, execute DB/RLS/artifact checks, validate hosted environments, perform deployment validation, or prove security posture.

## 23. Acceptance criteria

- The approval record derives from the current Manual Runbook, Execution Boundary, Browser Walkthrough Plan, Admin Walkthrough, Buyer Acceptance Pack, Review Gate, and Admin Workbench section models.
- The approval record uses a deterministic timestamp and deterministic placeholders.
- Approval record and decision statuses do not imply approval, execution, verification, completion, success, or readiness.
- Approval scope items, approval requirements, evidence rules, redaction checklist, stop conditions, required-before-approval checks, and deferred items are represented.
- Tests and copy guardrails preserve the template-only approval-record boundary.
- No browser execution, screenshot evidence, export/PDF/download generation, approval workflow, evidence artifact, or readiness evidence is produced.
