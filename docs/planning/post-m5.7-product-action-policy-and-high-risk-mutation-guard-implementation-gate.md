# Post-M5.7 Product Action Policy and High-Risk Mutation Guard Implementation Gate

## Purpose

This milestone implements a bounded source-level product action policy and high-risk mutation guard after the accepted Post-M5.7 Product Navigation, Persona Scope, and Deep-Link Stabilization Implementation Gate.

This is source implementation and static verification work only. It is not browser evidence, not runtime evidence, not database evidence, not hosted evidence, not export/download evidence, not workflow evidence, and not readiness evidence.

## Accepted Baseline

- Latest accepted closure: PR #198 - Post-M5.7 Product Navigation, Persona Scope, and Deep-Link Stabilization Implementation Gate
- Accepted/head commit: `f74637d13ce08aa9e28d827a80f87c43725cef9a`
- Merge commit: `8fabf8a71984ae3094d252ea33e76819814dcf13`
- Post-merge verification/current main/tag target: `6f9b796397fa69a62b2d6e72af3f3a7680647fda`
- Tag: `avalaos-core-post-m5.7-product-navigation-persona-scope-and-deep-link-stabilization-implementation-gate`

## Controller And Subagent Model

The controller retained final decisions, consolidation, file ownership, branch, commit, push, PR scope, proof boundaries, and final output. Subagents produced static findings only. No subagent committed, pushed, opened a PR, approved readiness, or executed prohibited runtime/browser/database/deployment/export/provider/workflow actions.

| Workstream | Static finding used | Controller decision |
| --- | --- | --- |
| Action Policy Architecture | View access was not enough for create/edit/approve/generate/export/import/status actions. | Add a pure deny-by-default `productActionPolicy` service with module, scope, context, and explicit permission checks. |
| Assess/Docs Action | Docs generation/refinement, approval, and Assess-to-Studio handoff needed action-level authority separate from view access. | Gate Docs Forge generation, Workspace refinement, approval mutation, and docs-to-delivery import before side effects. |
| Delivery/Workflow Action | Task/status/sprint/automation/timesheet mutations were exposed through mixed UI/provider paths. | Guard App-level delivery mutations, workflow status changes, automation CRUD/toggle, reorder, delete, and timesheet writes. |
| Export/Artifact Action | Workspace export/download paths could create local or signed-url artifacts without action-policy checks. | Disable and guard Workspace Word, PDF, Markdown, JSON, and structured export entry points unless explicit export/download permissions exist. |
| Test/Quality | No central product-action policy or focused tests existed. | Add pure TypeScript policy tests for fail-closed actions, persona restrictions, context requirements, export/download boundaries, timesheets, and automation. |
| Proof/Boundary | Copy and evidence must not turn source hardening into demo/product/production readiness. | Preserve explicit non-readiness wording and prohibited-action confirmation in planning, evidence, roadmap, readiness, and ledger updates. |

## Implementation Summary

- Added `services/productActionPolicy.ts` as a pure source-level action policy for high-risk product actions.
- Added `services/productActionPolicy.test.ts` with focused static/unit coverage for fail-closed defaults and explicit permission paths.
- Wired `App.tsx` to resolve action decisions from the current user, organization, enabled modules, scope, and target context.
- Guarded delivery task create/update/delete/reorder, workflow status changes, sprint updates, project lifecycle changes, automations, timesheets, approval mutations, document refinement, and docs-to-delivery imports before side effects.
- Added boolean import-return handling so a denied docs-to-delivery import does not clear temporary document context.
- Wired `DocsForgeView` and `LandingPage` so document generation is blocked before provider invocation when the action policy denies `docs.generate`.
- Wired `WorkspaceView` so export/download controls are disabled and guarded, refinement/edit entry points are policy-gated, approvals are guarded, and backlog import is guarded.
- Wired `ProcessCatalogView` so process creation is guarded by `process.create` instead of relying on view access.

## Guarded Action Categories

| Category | Implemented source boundary | Remaining static gap |
| --- | --- | --- |
| Process creation | `process.create` decision controls the Process Catalog create entry. | Existing process service authority remains adapter-level and not DB/RLS-backed proof. |
| Assessment actions | `assessment.edit` and `assessment.approve` are registered in policy. | Guided assessment internal status/action controls still need deeper component-level wiring. |
| Document generation | `docs.generate` blocks provider invocation before `aiOrchestrator.generateArtifacts`. | Provider behavior remains unexecuted; no runtime or browser proof exists. |
| Document refinement | `docs.refine` gates Workspace edit/refine entry and App save path. | Full document review history and immutable audit are future work. |
| Export/download | `docs.export` and `artifact.download` gate Workspace Word/PDF/Markdown/JSON controls. | Delivery Pack and assessment decision-pack export surfaces need a follow-up export-control completion gate. |
| Work-item import | `delivery.import` gates docs-to-delivery import before epics/tasks/handoff side effects. | Import policy still allows partial lineage after authorization; AP review-state behavior remains future work. |
| Delivery mutations | Task create/update/delete/reorder, sprint changes, project lifecycle changes, and workflow status changes are guarded in App handlers. | Backlog/SprintPlanning affordance-level disabling and transition-matrix requirements remain future work. |
| Automation | Automation create/update/delete/toggle now requires `automation.edit` in project scope. | Automation copy and rule semantics still need a draft-template/no-runtime cleanup pass. |
| Timesheets | Own logging and manager approval authority are separated in policy. | Week locks, hour limits, assignment validation, and audit trail remain future work. |
| Approvals | Document approval/resubmit mutation is guarded by `approval.execute` or `docs.approve`. | This is source-level mutation gating only, not proof that an approval workflow ran correctly. |

## Top Demo Gaps Remaining

1. Browser evidence remains paused; the last manual observation track still has 0 completed observation passes.
2. Guard behavior is source-level only and has not been observed in a browser or running app.
3. Backlog, Sprint Planning, Guided Assessment, Delivery Pack, and assessment decision-pack affordances still need component-level policy disabling and copy cleanup.
4. Export/download/storage behavior remains blocked or unapproved and cannot be used as demo proof.
5. Persona switching/login and AP fixture traversal remain unobserved after source hardening.

## Top Production Readiness Gaps Remaining

1. Real DB/RLS/artifact/schema checks, tenant-isolation checks, SQL execution, migration execution, and Supabase execution remain unperformed.
2. Delivery authority still uses draft/local adapter paths for current runtime behavior; `delivery_work_items` authority remains fail-closed groundwork, not promoted runtime proof.
3. Export/download/storage/signed URL controls are only partially wired and remain unproven without a future AP-approved export/storage milestone.
4. Workflow transition matrices, immutable audit, evidence requirements, soft-delete/retention, approval gates, and status-change audit contracts remain incomplete.
5. Hosted/deployment/ops/security validation, provider/classifier execution, rollback/incident/backup/restore execution, and real assertions remain unperformed.

## Recommended Next Grouped Execution Milestones

1. Delivery Workflow Transition Matrix and Mutation Audit Guard Gate: implement deterministic status transition rules, delete/soft-delete boundaries, lineage-linked deletion denial, evidence requirements, and component affordance guards.
2. Export Download and Storage Policy Completion Gate: extend source-level export/download gating across Delivery Pack, assessment decision-pack, storage, signed URL, and delivery-pack export surfaces without generating artifacts.
3. Assessment and Docs Approval Review Contract Gate: harden assessment approval, handoff eligibility, document approval state, review history, and submit-for-review behavior without executing workflows as proof.
4. Automation Draft Template and Copy Boundary Gate: rename/guard automation surfaces as draft rule templates unless a later runtime execution milestone is explicitly approved.
5. Browser Observation AP Decision Gate: keep browser observation separate and pending until AP approves exact scope, channel, run count, output boundaries, and stop conditions.

## What Can Be Safely Done Next

- Review the draft PR for source-level action-policy behavior and static tests.
- Continue component-level guard wiring for remaining source surfaces without runtime/browser execution.
- Plan export/download/storage completion as a separate source milestone.
- Keep DB/RLS/hosted/provider/browser proof tracks behind separate AP-approved execution gates.

## What Remains Unapproved

Browser retry, browser launch, browser automation, screenshots, screenshot folders, browser artifacts, raw browser output, DOM dumps, console dumps, HAR files, traces, videos, runtime app launch, dev server startup, export/PDF/download artifacts, storage objects, signed URLs, workflow/status changes as proof, approval workflow execution as proof, DB/RLS/artifact/schema checks, artifact SELECT checks, tenant-isolation checks, SQL execution, migration execution, schema/policy dump, Supabase execution, Docker execution, hosted/deployment validation, provider/classifier execution, rollback/incident/backup/restore execution, real assertions, readiness evidence, readiness claims, readiness-domain completion, and next execution milestone start remain unapproved.

## Explicit Non-Readiness Statement

This milestone does not prove demo readiness, buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, security readiness, operational readiness, pilot readiness, compliance certification, RLS readiness, tenant-isolation proof, export/download readiness, approval-workflow readiness, browser verification, walkthrough completion, root-cause proof, frontend-fix proof, or local startup readiness.

## Proof Boundary Summary

The proof boundary is source implementation, static repository inspection, TypeScript compilation, pure unit/static tests, build-only verification, and static guardrail scans. The output is product action policy source code, guarded source entry points, focused policy tests, and evidence/tracking docs. It is not runtime evidence and cannot be used as readiness evidence.