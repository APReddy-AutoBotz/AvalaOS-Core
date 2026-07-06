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
| M5.5a | Enterprise Completion Control Gate | Complete as docs-only control gate | Grouped remaining enterprise work after PR #176 into larger workstreams; does not approve execution or produce readiness evidence. |
| M5.5b | Evidence Surface, Approval Model, and Audit Contract Hardening | Complete as execution-neutral control hardening | Evidence-surface, approval-state, audit-contract, buyer-copy, and Admin Workbench read-only hardening complete; no approval workflow execution, status changes, or readiness evidence. |
| M5.5c | Secure Export and Artifact Storage Design/Implementation Gate | Complete as execution-neutral export/artifact/storage control hardening | Model-only export artifact contracts, storage-access policy contracts, read-only Admin summary, tests, guardrails, and docs accepted; no export/PDF/download artifacts, storage objects, signed URLs, or readiness evidence. |
| M5.6a | RLS/Tenant-Isolation Implementation Preparation Gate | Complete as execution-neutral RLS/tenant-isolation preparation | Deterministic RLS/tenant-isolation preparation contracts, future assertion categories, redaction rules, read-only summaries, tests, guardrails, and docs accepted only; no DB/RLS/artifact execution approved or performed. |
| M5.6b | Hosted/Deployment/Operations Preparation Gate | Complete as execution-neutral hosted/deployment/operations preparation | Deterministic environment-classification contracts, operational gate matrix contracts, read-only summaries, tests, guardrails, and docs accepted only; no hosted/deployment/startup/readiness execution or readiness evidence. |
| M5.7 | First AP-Approved Evidence Execution Gate | Complete as docs/model-only gate-selection and approval-preparation | Candidate-track comparison, Manual Browser Walkthrough first-candidate recommendation for AP review only, pending AP decision contract, future execution contract, tests, guardrails, read-only summaries, and docs accepted; no AP approval, execution, or readiness evidence. |
| Post-M5.7 | Manual Browser Walkthrough AP Go/No-Go Decision Record | Complete as docs/model-only AP decision-boundary record | AP decision state recorded as pending by default, with candidate-only future scope template, allowed observations, prohibited outputs, stop conditions, abort rules, and evidence summary format; no readiness domain complete and no execution approved or performed. |
| Post-M5.7 | Manual Browser Walkthrough One-Pass Observation Evidence | Complete as blocked one-pass observation evidence | Narrow AP approval allowed exactly one manual observation pass; the pass was blocked before UI surface observation, no approved surfaces were observed, and no readiness domain is complete. |
| Post-M5.7 | Manual Browser Walkthrough One-Pass Observation Retry With Frontend Access Preflight | Complete as stopped frontend-access preflight retry evidence | AP approval allowed exactly one frontend-access preflight before a single retry observation pass; the preflight result was unavailable, observation did not proceed, no approved surfaces were observed, and no readiness domain is complete. |
| Post-M5.7 | Frontend Access Unavailability Triage and Remediation Plan | Draft PR as docs/model-only triage/remediation planning | Static triage and remediation planning after PR #184 and PR #185 blocked/stopped outcomes; no readiness domain complete, no frontend access fixed, no root-cause proof, and no execution approved or performed. |

## Health Boundary

KlarityFlow Health is not Gate 6 for AvalaOS Core. It remains a separate proof vertical and may only move through Health-specific gates if explicitly approved.

## Current M5 Proof Boundary

M5.3a-9, M5.3a-10, and M5.3a-11 do not approve real assertion execution or DB/RLS/artifact execution. No readiness evidence exists from those milestones.

The local-readiness loop remains stopped. Local DB availability remains unresolved, schema is not proven, RLS is not proven, RLS helper behavior is not newly validated, artifact SELECT isolation is not verified, tenant isolation is not newly verified, hosted readiness is not proven, production readiness is not proven, and local startup success is not proven.

M5.4a-M5.4f are enterprise planning evidence-pack records only. They do not prove production, hosted, deployment, security, buyer, product, release-candidate, compliance, RLS, tenant-isolation, schema, artifact SELECT, local-readiness, or local startup readiness.

PR #161-#175 are accepted as the Premium Enterprise approval-boundary track through PR #175. PR #175 remains a pre-execution readiness check for AP go/no-go decision only. AP approval has not been granted. Browser execution has not been approved or performed. No browser launched, no automation ran, no screenshots were captured, no screenshot folders were created, no export/PDF/download artifacts were produced, no browser/run evidence was created, no approval workflow ran, and no statuses changed.

Real DB/RLS/artifact, hosted, deployment, schema, provider, classifier, and real assertion execution remain unperformed. Production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, and compliance readiness remain unproven.

M5.5a is a docs-only enterprise completion control gate. It does not silently overwrite the prior M5.5-M5.6 meaning: prior tracking treated M5.5-M5.6 as planned secure export, deployment, runbook, and pilot evidence work. M5.5a records a grouped realignment into M5.5b, M5.5c, M5.6a, M5.6b, and M5.7, with high-risk proof tracks kept behind separate AP approval gates.

M5.5b is closed as an execution-neutral control hardening milestone. It strengthened evidence-surface, approval-state, audit-event, buyer-copy, and Admin Workbench read-only contracts without marking any readiness domain complete. Any future real evidence run or manual browser execution requires a new explicit AP approval gate before execution.

M5.5c is closed as execution-neutral secure export and artifact storage design/implementation hardening. It added model-only export artifact contracts, storage-access policy contracts, read-only Admin summaries, tests, guardrails, and evidence docs without approving or performing export/PDF/download generation, storage access, signed URL generation, workflow execution, browser execution, DB/RLS/artifact execution, hosted/deployment validation, provider/classifier execution, schema inspection, real assertions, or readiness evidence.

M5.6a is closed as execution-neutral RLS/Tenant-Isolation Implementation Preparation Gate. It added deterministic authority-surface preparation contracts, future assertion categories, prohibited-output and redaction rules, stop conditions, read-only Admin summaries, tests, buyer-copy guardrails, and evidence docs without approving or performing schema inspection, SQL execution, migration execution, DB/RLS/artifact execution, artifact SELECT checks, tenant-isolation checks, local startup checks, hosted/deployment validation, provider/classifier execution, browser execution, workflow execution, storage access, export/PDF/download generation, real assertions, status changes, or readiness evidence.

M5.6b is closed as execution-neutral Hosted/Deployment/Operations Preparation Gate. It prepares deterministic environment-classification contracts, operational gate matrix contracts, prohibited-output and redaction rules, stop conditions, read-only Admin summaries, tests, guardrails, and evidence docs without approving or performing hosted validation, deployment validation, startup checks, readiness checks, Supabase stack, Docker, DB/RLS/artifact execution, schema inspection, provider/classifier execution, rollback execution, incident execution, backup/restore execution, browser execution, workflow execution, storage access, export/PDF/download generation, screenshots, real assertions, status changes, pilot evidence, or readiness evidence.

M5.7 is closed as docs/model-only First AP-Approved Evidence Execution Gate. It compared future evidence execution tracks, recommended Manual Browser Walkthrough as the first candidate for AP review only, and defined pending AP decision and future execution contracts without granting AP approval, approving execution, launching a browser, capturing screenshots, generating exports/PDFs/downloads, creating storage objects, generating signed URLs, executing workflows, changing statuses, running DB/RLS/artifact checks, inspecting schema, running hosted/deployment validation, executing provider/classifier behavior, running rollback/incident/backup/restore behavior, running real assertions, producing readiness evidence, or starting any post-M5.7 execution milestone.

The Post-M5.7 Manual Browser Walkthrough AP Go/No-Go Decision Record is closed as docs/model-only decision-boundary work. It records AP decision state as pending, because AP has not supplied explicit approval text. It does not grant AP approval, approve execution, launch a browser, run browser automation, capture screenshots, generate exports/PDFs/downloads, create storage objects, generate signed URLs, execute workflows, change statuses, run DB/RLS/artifact checks, inspect schema, run hosted/deployment validation, execute provider/classifier behavior, run rollback/incident/backup/restore behavior, run real assertions, produce readiness evidence, mark any readiness domain complete, or start the next execution milestone.

The Post-M5.7 Manual Browser Walkthrough One-Pass Observation Evidence milestone is closed as blocked one-pass observation evidence under a narrow AP approval for exactly one manual observation pass. The pass was blocked before UI surface observation, no approved surfaces were observed, and the result does not prove browser verification, walkthrough completion, readiness evidence, buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, operational readiness, pilot readiness, export/PDF/download readiness, approval-workflow readiness, or compliance certification.

The Post-M5.7 Manual Browser Walkthrough One-Pass Observation Retry With Frontend Access Preflight milestone is closed as stopped frontend-access preflight retry evidence under AP approval for exactly one frontend-access preflight before a single retry observation pass. The preflight result was unavailable, observation did not proceed, no approved surfaces were observed, and the result does not prove browser verification, walkthrough completion, readiness evidence, buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, operational readiness, pilot readiness, export/PDF/download readiness, approval-workflow readiness, or compliance certification.

The Post-M5.7 Frontend Access Unavailability Triage and Remediation Plan is the current draft docs/model-only triage/remediation planning milestone. It records that another blind browser retry is not recommended, identifies static triage categories, and recommends a future docs-only local frontend access runbook plus static surface inventory gate before any further browser retry. It does not prove root cause, fix frontend access, start a frontend server, run startup/readiness checks, launch a browser, run browser automation, capture screenshots, generate export/PDF/download artifacts, create storage objects, generate signed URLs, execute workflows, change statuses, run DB/RLS/artifact/schema checks, run hosted/deployment validation, execute providers/classifiers, run real assertions, produce readiness evidence, mark any readiness domain complete, or start any next execution milestone.
