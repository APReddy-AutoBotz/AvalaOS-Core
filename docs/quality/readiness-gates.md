# Readiness Gates

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

No gate passes without evidence, verification, and AP acceptance where required. Historical evidence proves a gate state at the time it was written; current gate status is maintained here and in `docs/task-ledger.md`.

## Core Gates

| Gate | Name | Current Status | Required Evidence |
| --- | --- | --- | --- |
| Gate 0 | Migration complete | Complete | Main normalized, migration docs, no old repo push. |
| Gate 1 | Build Control Pack complete | Complete | M0.2 docs, skills, inventory, wording scan, verification. |
| Gate 2 | Govern hardening complete | Complete | Registry fields, approval/evidence rules, audit status. |
| Gate 3 | Governed Delivery Pack complete | Complete | Handoff lineage, owners, blockers, source evidence. |
| Gate 4 | Server-side AI/BYOK hardening complete | Complete | Server-side execution direction, key references, usage audit, browser-key lockdown. |
| Gate 5 | Buyer demo readiness complete | Complete | Demo story, verified flow, claim-safe copy, M5 readiness gate. |
| Gate 6 | Enterprise readiness track | Active | M5 Supabase, RLS, audit, export, deployment, runbook, and Premium Enterprise approval-boundary evidence. |
| Gate 7 | Pilot readiness | Planned | Verified controls, tenant isolation, runbooks, deployment evidence, open-risk list. |

## M5 Enterprise Readiness Sub-Gates

| Sub-Gate | Name | Current Status | Notes |
| --- | --- | --- | --- |
| M5.0 | Enterprise Supabase readiness | Complete | Planning/readiness evidence exists on main. |
| M5.1 | Environment config and secret hygiene | Complete | Evidence and post-merge verification exist on main. |
| M5.2 | Auth, organization, workspace schema planning | Complete | Plan accepted; follow-up authority slices continue under M5.2. |
| M5.2a-M5.2f | Authority and ownership groundwork | Complete through available evidence | Organization/workspace, ownership, artifact, Studio/docs, project, and related authority groundwork exists. |
| M5.2g | Delivery work item ownership migration plan | Complete | Plan and post-merge verification exist on main. |
| M5.2g-a | Delivery work item authority migration | Complete as authority groundwork | Evidence and post-merge verification exist on main; `delivery_work_items` is fail-closed with RLS enabled and no policies, so this is not tenant-isolation proof. |
| M5.3 | RLS policy design and test plan | Complete as plan | Does not implement policies or prove tenant isolation. |
| M5.3a | RLS policy implementation and isolation test plan refresh | Complete as docs-only plan refresh | Narrows future policy scope to applied authority tables; no SQL migrations, RLS policies, helper functions, tests, tenant-isolation proof, or hosted pilot readiness. |
| M5.3a-1 | RLS helper and SELECT policy implementation plan | Complete as docs-only plan | PR #90 accepted planning only for helper functions and identity/org/workspace/membership SELECT policies; no RLS implementation occurred. |
| M5.3a-2 through M5.3a-3r-C | Local DB/local-readiness boundary decisions | Complete as bounded evidence and stop decision records | Local-readiness track stopped; no concrete command documentation, real local readiness execution, local startup success, or readiness evidence accepted. |
| M5.3a-4 through M5.3a-8 | RLS/artifact evidence requirements, approval, and harness-design gates | Complete as docs-only planning/gate records | Evidence requirements and synthetic harness direction exist; no DB/RLS/artifact execution or readiness proof. |
| M5.3a-9 | RLS and artifact evidence harness synthetic boundary implementation | Complete as synthetic/non-executing implementation | Synthetic boundary validator exists and synthetic-only tests passed; no real assertion execution or readiness evidence. |
| M5.3a-10 | RLS and artifact evidence synthetic boundary closure reconciliation gate | Complete as docs-only reconciliation | M5.3a-9 reconciled as synthetic boundary only; local DB, schema, RLS, artifact SELECT isolation, tenant isolation, hosted readiness, production readiness, and local startup success remain unproven. |
| M5.3a-11 | M5.3 tracking reconciliation after synthetic boundary closure | Complete as docs-only reconciliation | Corrected tracking drift only; no DB/RLS/artifact execution, local-readiness reopening, or readiness claims. |
| M5.4a-M5.4f | Enterprise planning evidence pack | Complete as planning evidence pack | Accepted planning records for audit/evidence, security/governance, hosted evidence, deployment/operations, product/buyer, and release-candidate boundaries; not readiness proof. |
| PR #161-#175 | Premium Enterprise Buyer Acceptance / Trust Center / Admin Workbench / Browser Walkthrough approval-boundary track | Complete through PR #175 | PR #175 is a pre-execution readiness check for AP go/no-go decision only; no AP approval, browser execution approval, browser execution, screenshot/export/PDF/download artifact, approval workflow, or status change occurred. |
| M5.5a | Enterprise Completion Control Gate | Current docs-only control gate | Groups remaining enterprise work after PR #176 into larger workstreams; does not approve execution or produce readiness evidence. |
| M5.5b | Evidence Surface, Approval Model, and Audit Contract Hardening | Planned | Read-only/control hardening only; no approval workflow execution or status changes without a separate AP gate. |
| M5.5c | Secure Export and Artifact Storage Design/Implementation Gate | Planned | Realigns prior M5.5 secure export/storage readiness planning into a larger gated track; no export/PDF/download artifacts without a separate AP gate. |
| M5.6a | RLS/Tenant-Isolation Implementation Preparation Gate | Planned | RLS and tenant-isolation preparation only until a later AP-approved DB/RLS/artifact evidence gate. |
| M5.6b | Hosted/Deployment/Operations Preparation Gate | Planned | Realigns prior M5.6 deployment/runbook/pilot evidence planning into a larger operations preparation track; no hosted/deployment validation without a separate AP gate. |
| M5.7 | First AP-Approved Evidence Execution Gate | Planned | Future execution gate only after AP approves exact scope, run count, output boundaries, prohibited artifacts, stop conditions, and proof boundaries. |

## Health Boundary

KlarityFlow Health is not Gate 6 for AvalaOS Core. It remains a separate proof vertical and may only move through Health-specific gates if explicitly approved.

## Current M5 Proof Boundary

M5.3a-9, M5.3a-10, and M5.3a-11 do not approve real assertion execution or DB/RLS/artifact execution. No readiness evidence exists from those milestones.

The local-readiness loop remains stopped. Local DB availability remains unresolved, schema is not proven, RLS is not proven, RLS helper behavior is not newly validated, artifact SELECT isolation is not verified, tenant isolation is not newly verified, hosted readiness is not proven, production readiness is not proven, and local startup success is not proven.

M5.4a-M5.4f are enterprise planning evidence-pack records only. They do not prove production, hosted, deployment, security, buyer, product, release-candidate, compliance, RLS, tenant-isolation, schema, artifact SELECT, local-readiness, or local startup readiness.

PR #161-#175 are accepted as the Premium Enterprise approval-boundary track through PR #175. PR #175 remains a pre-execution readiness check for AP go/no-go decision only. AP approval has not been granted. Browser execution has not been approved or performed. No browser launched, no automation ran, no screenshots were captured, no screenshot folders were created, no export/PDF/download artifacts were produced, no browser/run evidence was created, no approval workflow ran, and no statuses changed.

Real DB/RLS/artifact, hosted, deployment, schema, provider, classifier, and real assertion execution remain unperformed. Production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, and compliance readiness remain unproven.

M5.5a is a docs-only enterprise completion control gate. It does not silently overwrite the prior M5.5-M5.6 meaning: prior tracking treated M5.5-M5.6 as planned secure export, deployment, runbook, and pilot evidence work. M5.5a records a grouped realignment into M5.5b, M5.5c, M5.6a, M5.6b, and M5.7, with high-risk proof tracks kept behind separate AP approval gates.

Any future real evidence run or manual browser execution requires a new explicit AP approval gate before execution.
