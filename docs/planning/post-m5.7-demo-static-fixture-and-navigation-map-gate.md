# Post-M5.7 Demo Static Fixture and Navigation Map Gate

## Purpose

This milestone creates a static, repository-derived demo fixture and navigation map for the candidate Post-M5.7 demo path. It narrows the practical buyer/admin demo sequence, fixture assumptions, persona/scope/module gating risks, direct-route versus internal view-state gaps, and the next recommended grouped milestone.

This milestone is static inspection only. It is not browser evidence, not runtime evidence, not route proof, not database evidence, not export evidence, not workflow evidence, not hosted evidence, and not readiness evidence.

## Accepted Baseline

- Latest accepted closure: PR #196 - Post-M5.7 Controller/Subagent Static Demo and Production Gap Assessment Execution Gate
- Accepted/head commit: `43a1040c91073186c55b803134198338212b144b`
- Merge commit: `0372b941bb3c656020752f1001680a13f1ed8f23`
- Post-merge verification/current main/tag target: `db7d75283ce43e4d9031d511b8c896213a1fd466`
- Tag: `avalaos-core-post-m5.7-controller-subagent-static-demo-and-production-gap-assessment-execution-gate`

## Preservation Requirements

- PR #196 remains the accepted docs/static-only controller-owned gap assessment.
- Browser evidence remains paused.
- PR #191 remains stopped observation evidence only.
- Completed observation passes remain 0.
- No browser was launched.
- No approved surface was observed.
- No browser evidence was created.
- No readiness evidence was created.
- No readiness domain is complete.
- No next execution milestone is started by this gate.

## Static Demo Navigation Map

| Demo segment | Candidate static path | Required persona and scope | Static repository support | Demo gap |
| --- | --- | --- | --- | --- |
| Start and login fixture | Mock login profile selection or equivalent assumed authenticated state. | Buyer Viewer Sarah Chen for buyer view; Platform Admin Henry Wilson for admin view. | `MOCK_LOGIN_PROFILES` defines Buyer Viewer and Platform Admin profiles; `currentUser.defaultView` and `defaultScope` drive first view after login. | No browser observation or runtime login proof exists in this gate. |
| Buyer overview | Buyer Viewer -> `PORTFOLIO` in `MY_WORK` scope, with possible fallback to `DASHBOARD`. | Sarah Chen, `Buyer`, `MY_WORK`, permissions include `portfolio.read` and `strategy.read`. | `VIEW_ACCESS_METADATA` marks `PORTFOLIO` active for `MY_WORK`; Buyer Viewer default view is `PORTFOLIO`. | Buyer overview is static candidate navigation only, not observed buyer readiness. |
| Assess path | Process owner/analyst or Admin -> `PROCESS_CATALOG` -> selected AP process -> `PROCESS_DETAIL` -> `GUIDED_ASSESSMENT`. | Assess-capable persona or Admin; allowed scopes include `MY_WORK`, `TEAM`, `PROJECT`, and `ORGANIZATION`. | Canonical process `proc-ap-invoice-exception` and assessment `assess-proc-ap-invoice-exception` exist in mock data; Assess views are active. | `PROCESS_DETAIL` and `GUIDED_ASSESSMENT` depend on internal `selectedProcessId`; no durable direct route proof exists. |
| Docs/Studio handoff | Assess handoff -> `DOCS_FORGE`; project-scope document review through `DOCS` or `WORKSPACE`. | Docs-capable persona or Admin; `DOCS_FORGE` supports work scopes; `DOCS` and `WORKSPACE` require `PROJECT` scope. | Canonical document generation `docgen-ap-invoice-exception` and BRD/PDD/FRD/quality-gate artifacts are seeded as review artifacts. | Export/PDF/download/storage behavior is not approved or proven. |
| Delivery path | Project scope -> `BOARDS`, `BACKLOG`, `ROADMAP`, `SPRINT_PLANNING`, `DELIVERY_PACK`. | Delivery-capable persona or Admin; project scope required for several Delivery views and Delivery Pack. | Canonical project `proj-ap-invoice-exception`, delivery pack `pack-ap-invoice-exception`, tasks, epics, sprints, and handoff ledger entries are seeded. | Workflow/status changes and automations remain unapproved; Delivery Pack is static candidate content only. |
| Admin path | Platform Admin -> organization setup/admin surfaces and static Admin Workbench summaries. | Henry Wilson, `Admin`, default `ORGANIZATION` scope, default `WORKSPACE`. | Admin bypasses permission checks; admin/trust-center/buyer-acceptance models exist as static summaries. | `WORKSPACE` with `ORGANIZATION` scope is decision-pending in the view guard; admin path needs a later fixture decision before observation. |
| Trust/readiness surfaces | Trust Center, Buyer Acceptance Pack, Review Gate, and Admin Walkthrough summary surfaces. | Admin or reviewer-style persona depending on future selected path. | Prior accepted static models provide proof-status and limitation language. | These surfaces are proof-boundary summaries only, not readiness evidence or compliance proof. |

## Demo Fixture Map

| Fixture area | Static fixture decision | Repository-derived candidate | Gap before observation |
| --- | --- | --- | --- |
| Organization | Use the canonical demo organization. | `org-1`, `Avala Demo Enterprise`, with Assess, Docs, Delivery, and Monitor modules enabled. | Future observation must confirm whether mock/local or Supabase-backed org state is in scope. |
| Buyer persona | Use Buyer Viewer for buyer-facing overview only. | Sarah Chen, `user-1`, `Buyer`, default `MY_WORK`, default `PORTFOLIO`. | Buyer permissions do not imply Admin, Assess, Docs, or Delivery execution authority. |
| Admin persona | Use Platform Admin for setup/admin/static proof surfaces only. | Henry Wilson, `user-8`, `Admin`, default `ORGANIZATION`, default `WORKSPACE`. | Organization-scope `WORKSPACE` is decision-pending; later demo work must decide whether to change scope, path, or UI fixture behavior. |
| Canonical process | Use the AP invoice exception process as the primary demo thread. | `proc-ap-invoice-exception`, `AP Invoice Exception Handling`. | Process detail and guided assessment require internal selected-process state. |
| Canonical assessment | Use the accepted mock completed/approved assessment data for static story continuity. | `assess-proc-ap-invoice-exception`. | Static seeded assessment is not DB proof, scoring proof beyond existing tests, or runtime form proof. |
| Canonical project | Use AP Invoice Exception Workflow for Delivery continuity. | `proj-ap-invoice-exception`, `AP Invoice Exception Workflow`. | Project scope must be set before project-only views can be shown. |
| Canonical document generation | Use generated BRD/PDD/FRD/quality-gate review artifacts as read-only demo content. | `docgen-ap-invoice-exception`. | No export, PDF, download, storage object, or signed URL is approved or proven. |
| Canonical delivery pack | Use delivery pack and handoff ledger as static lineage content. | `pack-ap-invoice-exception`; `handoff-ap-assess-docs`; `handoff-ap-docs-delivery`. | Delivery pack review is not workflow execution, approval execution, or artifact-storage proof. |

## Direct-Route Versus Internal View-State Gaps

The static inspection found that candidate demo navigation is controlled by React view state, persisted scope/view values, guarded transitions, selected entity IDs, and callbacks. The inspected code references `usePersistentState` for view and scope, `applyGuardedView` for access-controlled transitions, and internal selected IDs such as `selectedProcessId` for process-detail and guided-assessment views.

This means a future browser observation cannot rely on this milestone as direct URL-route proof. A later AP-approved observation gate must either define deterministic in-app setup steps or first authorize a code-level demo navigation stabilization milestone that adds approved route, deep-link, or fixture controls.

## Persona And Scope Gating Risks

| Risk | Static finding | Impact |
| --- | --- | --- |
| Buyer path is narrow | Buyer Viewer has buyer-facing portfolio/reporting permissions, not broad Assess/Docs/Delivery/Admin authority. | Buyer demo should not assume access to admin or build-workbench surfaces without a role change. |
| Admin default is decision-sensitive | Platform Admin defaults to `ORGANIZATION` scope and `WORKSPACE`, but organization-scope `WORKSPACE` is marked decision-pending. | Admin path may fall back or warn unless a future fixture decision changes scope or allowed route. |
| Project-only views require project scope | `DOCS`, `WORKSPACE`, Delivery Pack, Backlog, Roadmap, Gantt, Workload, Sprint Planning, Automations, and Timesheets have project-scope requirements. | Future observation needs deterministic project scope setup for AP workflow views. |
| Reports and Teams are not stable demo targets | `REPORTS` is deferred; `TEAMS` is decision-pending. | These views should stay outside the next demo path unless a later milestone explicitly resolves them. |
| Guard fallbacks can change the visible surface | Denied view access can fall back to module home views or Dashboard. | Future demo scripts must account for guard outcomes instead of assuming a requested view appears. |

## Candidate Demo Sequence

1. Buyer overview: Buyer Viewer Sarah Chen, `MY_WORK` scope, `PORTFOLIO`, with `DASHBOARD` as a fallback only.
2. AP Assess story: Assess-capable persona or Admin, `PROCESS_CATALOG`, select `AP Invoice Exception Handling`, then `PROCESS_DETAIL` and `GUIDED_ASSESSMENT` only through deterministic selected-process setup.
3. Docs/Studio handoff: Docs-capable persona or Admin, `DOCS_FORGE`, then AP project scope for document review surfaces.
4. Delivery lineage: Delivery-capable persona or Admin, AP project scope, `BOARDS` and `DELIVERY_PACK` as static lineage surfaces only.
5. Admin/proof surfaces: Platform Admin, static Admin Workbench, Trust Center, Buyer Acceptance Pack, Review Gate, and Admin Walkthrough summaries with limitation wording preserved.

## Must Be Fixed Or Decided Before Browser Observation Can Resume

- AP must decide whether to approve a future browser-observation channel or continue non-browser static proof hardening.
- AP must decide whether the demo fixture is mock/local only, Supabase-backed, or split by proof class.
- AP must decide the exact persona sequence and whether profile selection itself is in observation scope.
- The project/process selected-entity setup must be deterministic before observing process detail, guided assessment, docs handoff, or Delivery Pack surfaces.
- Organization-scope Admin `WORKSPACE`, deferred `REPORTS`, and decision-pending `TEAMS` must either be excluded or resolved by a later approved milestone.
- Export, PDF, download, storage, signed URL, workflow/status-change, approval-workflow, provider/classifier, DB/RLS, hosted/deployment, and ops/security actions must remain out of scope unless separately approved.

## Top Remaining Demo Blockers

1. Browser evidence remains paused and the latest observation path has 0 completed observation passes.
2. Direct route/deep-link proof is absent for process-detail, guided-assessment, docs-handoff, project-scope, and Delivery Pack surfaces.
3. Persona/scope gating can redirect, hide, warn, or fall back before the intended demo surface appears.
4. The fixture environment class is unresolved between mock/local and Supabase-backed behavior.
5. Export/download/storage, workflow/status changes, approvals, Reports, Teams, DB/RLS, hosted/deployment, and provider/classifier behavior remain unapproved and unproven.

## Recommended Next Grouped Milestone

The recommended next grouped milestone is a Post-M5.7 Demo Navigation Stabilization Decision Gate.

That gate should decide whether AP wants a docs-only observation script using the existing internal view-state model, or a code-level demo navigation stabilization milestone that adds bounded direct routes, deep links, fixture selectors, or deterministic selected-entity setup before any future browser observation is considered. It must preserve that no observation, browser retry, runtime execution, export/download generation, workflow/status change, DB/RLS check, hosted validation, provider/classifier execution, readiness evidence, or readiness claim begins unless AP separately approves that exact execution scope.

## Explicit Non-Readiness Statement

This milestone does not prove demo readiness, buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, security readiness, operational readiness, pilot readiness, compliance certification, RLS readiness, tenant-isolation proof, export/download readiness, approval-workflow readiness, browser verification, walkthrough completion, root-cause proof, frontend-fix proof, or local startup readiness.

## Proof Boundary Summary

The proof boundary is static repository inspection and planning only. The outputs are a candidate navigation map, fixture map, gating-risk map, blocker list, and recommended next grouped decision milestone. They are not runtime evidence and cannot be used as readiness evidence.

## What Remains Unapproved

Browser retry, browser launch, browser automation, screenshots, screenshot folders, browser artifacts, raw browser output, DOM dumps, console dumps, HAR files, traces, videos, runtime app launch, dev server startup, export/PDF/download artifacts, storage objects, signed URLs, workflow/status changes, approval workflow execution, DB/RLS/artifact/schema checks, artifact SELECT checks, tenant-isolation checks, SQL execution, migration execution, schema/policy dump, Supabase execution, Docker execution, hosted/deployment validation, provider/classifier execution, rollback/incident/backup/restore execution, real assertions, readiness evidence, readiness claims, readiness-domain completion, and next execution milestone start remain unapproved.