# Premium Enterprise Admin Workbench Tabs Read-Only Structure

## 1. Purpose

Refactor the existing Avala Admin / Organization setup area into a calm, premium enterprise Admin Workbench with focused read-only navigation sections. This slice improves structure and review ergonomics without changing underlying organization, module, evidence policy, users, audit, Trust Center, or AI-control behavior.

## 2. Current Baseline After PR #163

PR #163 added the read-only Trust Center panel inside the existing Avala Admin / Organization setup area. The Trust Center proof-status foundation exists, Avala Govern and Avala Delivery are the buyer-facing canonical names, and proof boundaries remain evidence-gated.

No readiness evidence exists for production, hosted, deployment, RLS, tenant isolation, security readiness, buyer readiness, product readiness, release-candidate readiness, or compliance certification.

## 3. Why Admin Workbench Structure Comes Next

The previous Admin area was a single long configuration page. The next safe improvement is organizing existing content into clear sections so enterprise reviewers can inspect organization setup, module access, Trust Center posture, evidence policy, users, audit signals, and AI-control direction without new backend behavior or readiness claims.

## 4. UI Scope

This slice adds a read-only Admin Workbench shell with section navigation. Existing editable controls remain in their current behavior boundaries:

- company profile save
- module access save
- Assess governance settings
- evidence policy settings
- capture taxonomy settings

The slice does not add editable Trust Center controls or new backend persistence.

## 5. Admin Sections

The Admin Workbench sections are:

1. Overview
2. Organization
3. Modules
4. Trust Center
5. Evidence Policy
6. Users / Roles
7. Audit / Security
8. AI Controls

## 6. Overview Behavior

The Overview section summarizes the current organization name, plan label, enabled module count, Trust Center proof-state counts, evidence-gated claim count, workspace limits, and next admin decisions:

- Review Trust Center blocked/evidence-required claims
- Confirm module access
- Keep evidence policy aligned with approval requirements
- Review users/roles

The Overview section must not claim readiness.

## 7. Trust Center Section Behavior

The Trust Center section keeps using the existing read-only `TrustCenterPanel`. It remains a view over the Trust Center model snapshot. It does not create or mutate proof statuses, claim controls, evidence records, buyer artifacts, or readiness state.

## 8. Existing Behavior Preservation

The workbench reorganizes existing Admin content without changing save handlers, deterministic scoring, module configuration semantics, organization profile persistence, evidence-policy controls, role display behavior, audit display behavior, Trust Center model data, or AI provider behavior.

## 9. Proof-Safe Copy Rules

Admin Workbench copy must not say:

- production ready
- security ready
- compliance certified
- tenant isolation verified
- RLS active, verified, or ready
- deployment ready
- buyer ready
- product ready

Trust Center proof states are evidence-gated. AI Controls copy may state that server-side AI/BYOK direction is documented, but must not imply provider implementation, hosted enforcement, or accepted security proof.

## 10. What This Slice Implements

- `components/admin/AdminWorkbench.tsx`
- `components/admin/AdminSectionNav.tsx`
- `components/admin/AdminOverviewPanel.tsx`
- `services/adminWorkbenchModel.ts`
- `services/adminWorkbenchModel.test.ts`
- Admin Workbench wiring in `components/auth/OrganizationSetupView.tsx`
- `test:admin-workbench`
- buyer-copy guardrail coverage for new Admin Workbench sources

## 11. What This Slice Does Not Implement

This slice does not implement DB-backed Admin settings persistence, editable Trust Center controls, new role management behavior, new AI provider behavior, audit persistence, buyer acceptance pack generation, runtime behavior, DB/RLS/artifact execution, hosted validation, deployment validation, provider calls, classifier execution, schema inspection, or real assertion execution.

It does not change deterministic scoring formulas, gates, risk logic, recommendation logic, assessment outputs, Supabase schemas, SQL, migrations, RLS policies, Edge Functions, deployment files, CI, provider behavior, runtime adapters, generated-output behavior, internal Lite identifiers, or JSON wire keys.

## 12. Future Editable Admin Controls

A future AP-approved milestone can add editable Admin controls for role management, AI provider governance, policy administration, audit settings, and Trust Center claim workflows. Those controls require separate proof-boundary review before implementation.

## 13. Future Buyer Acceptance Pack

A future AP-approved milestone can generate a buyer acceptance pack from accepted claims, evidence references, limitation disclosures, and Trust Center proof statuses. This slice only preserves the workbench structure needed to review that future artifact.

## 14. Future DB/RLS/Artifact/Hosted/Deployment Proof Track

Future DB, RLS, artifact, hosted, and deployment proof work requires explicit AP approval before any real evidence run. This slice does not reopen the stopped local-readiness loop and does not produce readiness evidence.

## 15. Acceptance Criteria

- Admin content is organized into the required workbench sections.
- Trust Center is a first-class section.
- Existing save behaviors are preserved.
- Overview summarizes organization, module count, evidence-gated proof posture, and next admin decisions without readiness claims.
- AI Controls is a read-only direction summary only.
- Admin Workbench model tests cover ordering, default section, labels, proof-safe copy, old-name exclusion, valid keys, and invalid keys.
- Buyer-copy guardrails include the new Admin Workbench sources.
- No readiness evidence or unsupported readiness claim is introduced.
