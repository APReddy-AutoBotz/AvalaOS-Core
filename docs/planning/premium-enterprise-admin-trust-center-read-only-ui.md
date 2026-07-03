# Premium Enterprise Admin Trust Center Read-Only UI

## 1. Purpose

Render the accepted Trust Center proof-status foundation inside Avala Admin as a calm, read-only enterprise panel. The UI gives buyers and internal reviewers one place to inspect claim controls, evidence references, module capability states, buyer artifacts, blocked claims, and limitation disclosures without changing any readiness state.

## 2. Current Baseline After PR #162

PR #162 added the typed Trust Center model in `services/trustCenterModel.ts`, its regression coverage, and the `test:trust-center` task. The current baseline is deterministic snapshot metadata only. It does not include editable Trust Center state, persistence, runtime enforcement, hosted validation, deployment validation, DB/RLS execution, or readiness evidence.

## 3. Why This UI Slice Is Safe Now

The UI reads the existing snapshot and renders its current values. It does not create proof statuses, change claim controls, infer readiness, or generate new evidence. The slice stays safe because proof boundaries remain inside the model, presentation helper, limitation disclosures, and tests.

## 4. UI Scope

This slice adds a Trust Center section to the existing Avala Admin / Organization setup area. It displays:

- proof-status legend
- module capability states
- claim controls grouped by readiness domain
- evidence records
- buyer acceptance artifacts
- blocked claims and limitation disclosures

## 5. Read-Only Trust Center Behavior

The panel is read-only. It has no controls for editing claims, proof statuses, proof boundaries, evidence records, buyer artifacts, or readiness states. Future editable workflows require a separate AP-approved milestone.

## 6. Proof-Status Rendering Rules

The panel renders the model vocabulary as buyer-safe labels:

- Demo
- Planned
- Configured
- Evidence Required
- Verified
- Blocked

Verified is visually distinct from Configured and is not styled as generic production readiness. Evidence Required and Blocked are visually distinct and remain warning/constraint states.

## 7. Module Capability Display Rules

Each module card displays the model-provided module name, enabled state, proof status, proof boundary, buyer-safe description, limitation disclosure, evidence reference, and blocked claims. Avala Govern and Avala Delivery remain the buyer-facing names.

## 8. Claim-Control Display Rules

Claim controls are grouped by readiness domain:

- security
- tenant isolation
- AI controls
- evidence
- export
- deployment
- operations
- buyer readiness
- product readiness
- release candidate

The UI must not mark platform readiness domains verified unless the model explicitly provides a verified claim with accepted evidence. Presentation tests guard against verified claims in blocked or evidence-required platform readiness domains.

## 9. Evidence Display Rules

Evidence records display milestone, evidence document reference, accepted status, proof boundary, and what the record does not prove. If the model has no evidence items, the UI shows a safe empty state.

## 10. Buyer Artifact Display Rules

Buyer artifacts display the claim map, evidence index, limitation disclosures, and buyer acceptance pack status from the model. The buyer acceptance pack remains evidence-required until a future AP-approved slice changes that state with evidence.

## 11. What This Slice Implements

- `components/admin/TrustCenterPanel.tsx`
- `services/trustCenterPresentation.ts`
- `services/trustCenterPresentation.test.ts`
- Trust Center panel mount inside `components/auth/OrganizationSetupView.tsx`
- package script for the presentation test
- buyer-copy guardrail inclusion for new Trust Center UI/presentation copy

## 12. What This Slice Does Not Implement

This slice does not implement DB-backed Trust Center persistence, editable claim controls, a full Avala Admin tab split, buyer acceptance pack generation, runtime execution, MCP controls, A2A controls, live runtime enforcement, deployment validation, hosted validation, DB/RLS/artifact execution, schema inspection, provider calls, classifier execution, or real assertion execution.

It does not change deterministic scoring formulas, gates, risk logic, recommendation logic, assessment outputs, Supabase schemas, SQL, migrations, RLS policies, Edge Functions, deployment files, CI, provider behavior, runtime adapters, or generated-output behavior.

## 13. Future Admin Tab Split

A future AP-approved milestone can split Avala Admin into dedicated tabs for Trust Center, AI Controls, organization profile, module configuration, governance policy, members, and audit. This slice intentionally keeps the panel in the existing Admin area to avoid broad navigation changes.

## 14. Future Buyer Acceptance Pack

A future AP-approved milestone can produce a buyer acceptance pack from accepted claims, evidence references, and limitation disclosures. This slice only displays the current buyer artifact status and keeps the buyer acceptance pack evidence-required.

## 15. Future DB/RLS/Artifact/Hosted/Deployment Proof Track

Future proof work requires explicit AP approval before any DB, RLS, artifact, hosted, deployment, schema, runtime, or real assertion evidence is run. This UI slice does not reopen the stopped local-readiness loop and does not create readiness evidence.

## 16. Acceptance Criteria

- Avala Admin displays a read-only Trust Center panel.
- The panel reads from the current Trust Center model snapshot.
- Proof states are visually distinct from operational states.
- Module capability states, claim controls, evidence records, buyer artifacts, blocked claims, and limitation disclosures are visible.
- Empty evidence and claim-control states are safe.
- Presentation helpers are pure and covered by tests.
- Buyer-facing copy does not use Avala Govern Lite or Avala Delivery Lite.
- Proof boundaries remain explicit.
- No readiness evidence or unsupported readiness claim is introduced.
