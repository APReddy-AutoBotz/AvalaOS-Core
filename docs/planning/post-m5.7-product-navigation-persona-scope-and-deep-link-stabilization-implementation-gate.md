# Post-M5.7 Product Navigation, Persona Scope, and Deep-Link Stabilization Implementation Gate

## Purpose

This milestone implements bounded source-level stabilization for product navigation, persona/scope handling, selected entity state, and query-state deep links after the accepted Post-M5.7 Demo Static Fixture and Navigation Map Gate.

This is source and static verification work only. It is not browser evidence, not runtime evidence, not database evidence, not hosted evidence, not export/download evidence, not workflow evidence, and not readiness evidence.

## Accepted Baseline

- Latest accepted closure: PR #197 - Post-M5.7 Demo Static Fixture and Navigation Map Gate
- Accepted/head commit: `3c409a5bea38dd07f6c90263acb0982c76e7ab6a`
- Merge commit: `94601445f60f1befc0b81f1e18396d7964f1ddfd`
- Post-merge verification/current main/tag target: `c07e6d3908f43eb58b1f0e483d0ab86c4564a5aa`
- Tag: `avalaos-core-post-m5.7-demo-static-fixture-and-navigation-map-gate`

## Controller And Subagent Model

The controller retained final decisions, consolidation, file ownership, branch, commit, push, PR scope, proof boundaries, and final output. Subagents produced static findings only. No subagent committed, pushed, opened a PR, approved readiness, or executed prohibited runtime/browser/database/deployment/export/provider/workflow actions.

| Workstream | Static finding used | Controller decision |
| --- | --- | --- |
| Navigation Architecture | App had persisted view/scope but selected process and document generation were transient; no route/deep-link model existed. | Add a pure product navigation resolver and bounded query-state parse/build helpers without introducing React Router or demo-only routes. |
| Persona/Scope Guard | Organization workspace bypass was broad; Buyer Viewer could reach more surfaces than the demo map intended; action-level RBAC remains broader future work. | Preserve Platform Admin organization workspace behavior, fail closed for non-admin organization workspace preservation, and record remaining action-policy gaps for later milestones. |
| Entity Selection | Process, project, and document selections needed existence checks; invalid guided assessment process IDs could create draft assessment state. | Validate selected process/project/document IDs before preserving target views and add a guided assessment unavailable state for invalid process IDs. |
| Test/Quality | Existing guard/persistence tests did not cover deep-link state or selected entity resolution. | Add pure TypeScript coverage under the existing view-state persistence test path. |
| Proof/Boundary | Future copy must avoid turning static or source changes into demo/product/production readiness claims. | Use explicit non-readiness and prohibited-action language in planning, evidence, and tracking docs. |

## Implementation Summary

- Added `services/productNavigationState.ts` with pure query-state parsing/building and product navigation resolution.
- Wired `App.tsx` to hydrate explicit query-state intent once, preserve user defaults when no explicit intent exists, and synchronize sanitized product navigation state back to the URL.
- Validated selected process, project, and document generation IDs before preserving detail, guided assessment, project, Docs, Workspace, or Delivery Pack targets.
- Derived project scope from valid project or document-generation selections using generic entity IDs, not AP-specific branches.
- Cleared selected process/document state when the resolved view no longer uses that entity.
- Preserved temporary Studio Workspace state while a document generation save is pending.
- Restricted organization-scope Workspace preservation to Platform Admin/Admin role behavior.
- Moved Assess-to-Studio handoff recording after Docs Forge access is proven by the guard.
- Added a guided assessment unavailable state so an invalid process ID does not create a new draft assessment.

## Stabilized Product Behavior

| Area | Stabilized behavior | Proof boundary |
| --- | --- | --- |
| Query-state links | Supported keys are parsed and re-emitted in sanitized form: `view`, `scope`, `scopeId`, `scopeName`, `projectId`, `processId`, `assessmentId`, `documentGenerationId`, and `deliveryPackId`. | Static/source only; no browser observation or route-runtime proof. |
| Process detail | `PROCESS_DETAIL` requires a valid process ID in the current organization. Missing or invalid IDs fall back to `PROCESS_CATALOG`. | Unit/static coverage only. |
| Guided assessment | Requires valid process ID and non-organization scope. Invalid process IDs do not create assessment drafts. | Unit/static coverage plus source inspection; no workflow execution. |
| Project-scope views | Project-only views require a resolvable project ID before preserving project scope. Invalid projects fall back through the existing guard. | Unit/static coverage only. |
| Docs Workspace | Workspace document review requires a document generation that belongs to the selected project or derives project scope from the valid generation. Cross-project generation IDs fail closed. | Unit/static coverage only; no export/download/storage proof. |
| Buyer Viewer | Buyer default `MY_WORK` + `PORTFOLIO` is preserved as a real guarded persona/scope path. | Static/source only; no buyer readiness proof. |
| Platform Admin | Admin organization `WORKSPACE` decision path remains preserved; non-admin organization workspace persistence falls back. | Static/source only; no admin workflow proof. |
| Handoff ledger | Assess-to-Studio handoff is recorded only after Docs Forge access is allowed. | Source-level guard sequencing only; no workflow/status execution proof. |

## Demo Gaps Remaining

1. Browser evidence remains paused and the last observation track still has 0 completed observation passes.
2. Query-state support is source-level only and has not been observed in a browser.
3. Persona switching/login profile behavior has not been observed in the app during this gate.
4. Export/PDF/download/storage, workflow/status changes, approvals, Reports, Teams, DB/RLS, hosted/deployment, provider/classifier, and browser-observation behavior remain out of scope.
5. Action-level RBAC remains broader than view-level navigation and needs a separate hardening milestone before high-risk user journeys are treated as controlled.

## Production Readiness Gaps Remaining

1. Real DB/RLS/artifact/schema checks, tenant-isolation checks, SQL execution, migration execution, and Supabase execution remain unperformed.
2. Hosted/deployment/startup/ops/security validation remains unperformed.
3. Export/download/storage/signed URL behavior remains unapproved and unproven.
4. Workflow/status/approval execution remains unapproved and unproven.
5. Provider/classifier behavior and production AI boundaries remain unexecuted beyond existing static checks.

## Recommended Next Grouped Execution Milestones

1. Product Navigation UX Refinement and Observation Script Gate: refine in-app navigation affordances and produce a static observation script using the new product navigation state model, without browser execution.
2. Persona Action Policy Hardening Gate: add service-level and UI-level action policies for process creation, assessment edit/approve, document generation/refine/export, work item import, automation mutation, and export/download controls.
3. Browser Observation AP Decision Gate: decide whether AP approves a compliant human observation channel and exact scope after the source-level navigation stabilization is accepted.
4. Export/Workflow/Approval Boundary Hardening Gate: keep export, workflow/status, and approval execution behind separate model/source hardening before any execution gate.
5. DB/RLS/Hosted Proof Track Gate: keep real DB/RLS/artifact, tenant-isolation, hosted/deployment, provider/classifier, and ops/security proof behind separate AP-approved execution gates.

## What Can Be Safely Done Next

- Review the draft PR for source-level navigation behavior and static tests.
- Continue non-browser static proof hardening.
- Draft a future observation script that consumes the sanitized query-state model without starting observation.
- Plan action-policy hardening as a separate source milestone.

## What Remains Unapproved

Browser retry, browser launch, browser automation, screenshots, screenshot folders, browser artifacts, raw browser output, DOM dumps, console dumps, HAR files, traces, videos, runtime app launch, dev server startup, export/PDF/download artifacts, storage objects, signed URLs, workflow/status changes, approval workflow execution, DB/RLS/artifact/schema checks, artifact SELECT checks, tenant-isolation checks, SQL execution, migration execution, schema/policy dump, Supabase execution, Docker execution, hosted/deployment validation, provider/classifier execution, rollback/incident/backup/restore execution, real assertions, readiness evidence, readiness claims, readiness-domain completion, and next execution milestone start remain unapproved.

## Explicit Non-Readiness Statement

This milestone does not prove demo readiness, buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, security readiness, operational readiness, pilot readiness, compliance certification, RLS readiness, tenant-isolation proof, export/download readiness, approval-workflow readiness, browser verification, walkthrough completion, root-cause proof, frontend-fix proof, or local startup readiness.

## Proof Boundary Summary

The proof boundary is source implementation, static repository inspection, TypeScript compilation, pure unit/static tests, build-only verification, and static guardrail scans. The output is navigation stabilization source code plus evidence/tracking docs. It is not runtime evidence and cannot be used as readiness evidence.