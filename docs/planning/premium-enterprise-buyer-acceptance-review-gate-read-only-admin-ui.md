# Premium Enterprise Buyer Acceptance Review Gate Read-Only Admin UI

## 1. Purpose

Add a read-only Admin Workbench section for the existing Premium Enterprise Buyer Acceptance Review Rehearsal Gate model. The UI gives AP, product, security, delivery, and buyer stakeholders a structured rehearsal surface for blockers, reviewer questions, safe answers, evidence references, and export-gating review.

## 2. Current baseline after PR #167

PR #167 added the deterministic Buyer Acceptance Review Rehearsal Gate model and regression tests. The post-merge closure tag is `avalaos-core-premium-enterprise-buyer-acceptance-pack-review-rehearsal-gate`, and current `main` after that closure is `9ece23f88bff4a32b35e27b12edf1aad79bed316`.

The current baseline has:

- Trust Center proof-status foundation.
- Trust Center read-only Admin UI.
- Buyer Acceptance Pack foundation model.
- Buyer Acceptance Pack read-only Admin UI.
- Buyer Acceptance Review Rehearsal Gate model.
- Review Gate status that remains `evidence_required` or `rehearsal_required`, not `review_ready`.
- Export/PDF/download, buyer signoff, AP status changes, and readiness language blocked pending future AP-approved scope and evidence.

## 3. Why Review Gate UI comes before export/PDF

The review gate must be visible before any artifact surface is created. Showing blockers, reviewer questions, expected safe answers, and non-claims first keeps export/PDF/download scope controlled and prevents a buyer-facing artifact from implying approval, readiness evidence, or compliance evidence.

## 4. Admin Workbench placement

The Admin Workbench section order becomes:

1. Overview
2. Organization
3. Modules
4. Trust Center
5. Buyer Acceptance Pack
6. Review Rehearsal Gate
7. Evidence Policy
8. Users / Roles
9. Audit / Security
10. AI Controls

The new section key is `buyer_acceptance_review_gate`, with label `Review Rehearsal Gate` and short label `Review Gate`.

## 5. Panel sections

The read-only panel renders:

- Gate status banner.
- Source pack status.
- Proof-safe summary.
- Export blockers.
- Readiness blockers.
- Reviewer questions grouped by reviewer role.
- Expected safe answers, evidence references, must-not-claim lists, related open gaps, and required-before-export markers.
- Findings.
- Checklist items.
- Prohibited claims and safe alternatives.
- Limitation and proof-boundary disclosure.
- Safe empty states for every repeated section.

## 6. Presentation helper behavior

`services/buyerAcceptanceReviewGatePresentation.ts` provides labels, grouping, blocker selectors, required-before-export selectors, proof-safe summary generation, and assertion helpers for the current baseline.

`review_ready` is treated as an unexpected current-baseline state. The summary states that the panel is a read-only rehearsal gate and that export/PDF/download remains blocked.

## 7. UI safety rules

- Evidence-required and blocked states use amber or red visual treatment, not success treatment.
- No export/PDF/download, signoff, approval, generation, or completion action is added.
- Export/PDF/download appears only as blocked scope.
- Required reviewer questions may ask whether RLS or tenant isolation are verified, but the UI must not present those as positive proof statements.
- The panel must not make the Review Gate look approved or successful.

## 8. Test coverage

The new presentation regression covers:

- Deterministic helpers.
- Non-`review_ready` current gate status.
- Source pack status remaining `evidence_required`.
- Read-only summary and export/PDF/download blocked wording.
- Required reviewer role groups.
- Export blockers.
- Readiness blockers.
- Blocking findings.
- Required-before-export checklist entries.
- Proof-safe copy assertions.
- Rejection of injected unsupported positive readiness wording.
- Rejection of injected old buyer-facing names.
- Summary and label safety.
- Non-mutation of the Review Gate snapshot.

The Admin Workbench model regression covers section existence, label, short label, ordering, and proof-safe disclosure.

## 9. Naming/copy guardrail coverage

The buyer-copy guardrail includes:

- `components/admin/BuyerAcceptanceReviewGatePanel.tsx`
- `services/buyerAcceptanceReviewGatePresentation.ts`
- `services/adminWorkbenchModel.ts`

It confirms the Review Gate UI/presentation includes boundary phrases:

- read-only rehearsal gate
- not an approval
- not an export
- not readiness evidence
- not compliance evidence
- no PDF/download generated
- export/PDF/download remains blocked

## 10. What this slice implements

- Read-only Admin Workbench section metadata.
- Read-only Admin panel rendering of the current deterministic Review Gate snapshot.
- Presentation helper and regression tests.
- Buyer-copy guardrail updates.
- Planning and evidence documentation for this UI slice.

## 11. What this slice does not implement

This slice does not implement PDF/export/download generation, approval workflow, buyer signoff workflow, AP status change workflow, DB-backed persistence, editable buyer controls, Trust Center proof-status changes, Buyer Acceptance Pack status changes, runtime execution, provider behavior, deployment, hosted validation, schema inspection, DB/RLS/artifact execution, or readiness evidence.

## 12. Deferred export/PDF slice

Export/PDF/download remains deferred until a future AP-approved milestone defines exact artifact scope, proof boundaries, allowed commands, output controls, and review status behavior.

## 13. Deferred approval workflow

Buyer signoff, AP approval, status changes, and approval audit workflow remain deferred. This slice shows checklist blockers only.

## 14. Deferred persistence/editable controls

DB-backed persistence and editable buyer controls remain deferred. This slice reads the deterministic in-repo snapshot only.

## 15. Deferred DB/RLS/artifact/hosted/deployment/security proof tracks

DB, RLS, artifact, hosted, deployment, tenant-isolation, security, buyer-readiness, product-readiness, release-candidate, and compliance proof tracks remain deferred until explicitly approved by AP.

## 16. Acceptance criteria

- Admin Workbench includes the Review Rehearsal Gate after Buyer Acceptance Pack and before Evidence Policy.
- The new panel renders the existing Review Gate snapshot as read-only.
- Export/PDF/download remains blocked and appears only as blocked scope.
- Reviewer questions, safe answers, evidence references, findings, checklist items, non-claims, and proof boundaries are visible.
- No approval, signoff, export, PDF, download, generate, or completion action is introduced.
- Review Gate model behavior is unchanged.
- Buyer Acceptance Pack status and Trust Center proof statuses are unchanged.
- Presentation tests and Admin Workbench tests cover the new UI/presentation contract.
- Buyer-copy guardrails include the new UI and presentation helper.
