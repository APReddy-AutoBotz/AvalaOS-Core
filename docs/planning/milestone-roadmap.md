# Milestone Roadmap

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

This roadmap is the active milestone sequence after the documentation consistency audit. It replaces stale Phase 1-4 and Health-as-M5 interpretations while preserving historical evidence as history.

## Gate Roadmap

| Gate | Milestone | Current Status | Outcome |
| --- | --- | --- | --- |
| Gate 0 | M0 Migration | Complete | AvalaOS naming, main branch, foundation tag, historical prototype separation. |
| Gate 1 | M0.2 Build Control Pack | Complete | Agent rules, governance docs, readiness gates, evidence review. |
| Gate 2 | M1 Govern Hardening | Complete | Stronger governance card, registry fields, approval and evidence surfaces. |
| Gate 3 | M2 Governed Delivery Pack | Complete | Traceable handoff from approved decisions to delivery work. |
| Gate 4 | M3 Server-Side AI/BYOK Hardening | Complete | Server-side provider controls and audit-ready key reference model. |
| Gate 5 | M4 Buyer Demo Readiness | Complete | Focused buyer-demo flow with evidence, governance, and claim-safe copy. |
| Gate 6 | M5 Enterprise Readiness | Active | Supabase authority, RLS, audit, export, deployment, runbook, and Premium Enterprise approval-boundary planning evidence. |
| Gate 7 | Pilot Readiness | Planned | Verified controls, runbooks, tenant-isolation proof, and open-risk list. |

## M5 Sequence

| Sequence | Milestone | Status | Next Rule |
| --- | --- | --- | --- |
| 1 | M5.0 Enterprise Supabase readiness | Complete | Use as planning baseline only. |
| 2 | M5.1 Environment config and secret hygiene | Complete | Keep browser-side secrets out of pilot/production. |
| 3 | M5.2 Auth/org/workspace schema planning | Complete | Use as authority planning baseline. |
| 4 | M5.2a-M5.2g-a Authority/ownership groundwork | Complete through current evidence | Treat as prerequisites for RLS, not as RLS proof. |
| 5 | M5.3 RLS policy design/test plan | Complete as plan | Use as the durable RLS design baseline; it does not implement policies. |
| 6 | M5.3a RLS policy implementation and isolation test plan refresh | Complete as docs-only plan refresh | Narrows future RLS scope to applied authority tables; no implementation or tenant-isolation proof. |
| 7 | M5.3a-1 RLS helper and SELECT policy implementation plan | Complete as docs-only plan | PR #90 accepted the helper/SELECT policy plan only; no SQL migrations, policies, helper functions, or tests were implemented. |
| 8 | M5.3a-2 through M5.3a-3r-C Local DB/local-readiness boundary decisions | Complete as bounded evidence and decision records | Local-readiness track stopped; no concrete command documentation, real local readiness execution, local startup success, or readiness evidence accepted. |
| 9 | M5.3a-4 through M5.3a-8 RLS/artifact readiness planning and approval gates | Complete as docs-only planning/gate records | Defines evidence requirements and synthetic harness direction only; no DB/RLS/artifact execution or readiness proof. |
| 10 | M5.3a-9 RLS and artifact evidence harness synthetic boundary implementation | Complete as synthetic/non-executing implementation | Synthetic boundary validator and synthetic-only tests exist and passed; no real assertion execution or readiness evidence. |
| 11 | M5.3a-10 RLS and artifact evidence synthetic boundary closure reconciliation gate | Complete as docs-only reconciliation | Reconciles M5.3a-9 as synthetic boundary only; local DB, schema, RLS, artifact SELECT isolation, tenant isolation, hosted readiness, production readiness, and local startup success remain unproven. |
| 12 | M5.3a-11 M5.3 tracking reconciliation after synthetic boundary closure | Complete as docs-only reconciliation | Corrected tracking drift only; no DB/RLS/artifact execution, local-readiness reopening, or readiness claims. |
| 13 | M5.4a-M5.4f Enterprise planning evidence pack | Complete as planning evidence pack | Accepted as audit/evidence, security/governance, hosted evidence, deployment/operations, product/buyer, and release-candidate planning only; not readiness proof. |
| 14 | PR #161-#175 Premium Enterprise Buyer Acceptance / Trust Center / Admin Workbench / Browser Walkthrough approval-boundary track | Complete through PR #175 | PR #175 is a pre-execution readiness check for AP go/no-go decision only; no AP approval or browser execution is granted. |
| 15 | M5.5a Enterprise Completion Control Gate | Complete as docs-only control gate | Grouped remaining enterprise work after PR #176 into larger workstreams; does not approve execution or produce readiness evidence. |
| 16 | M5.5b Evidence Surface, Approval Model, and Audit Contract Hardening | Complete as execution-neutral control hardening | Evidence-surface, approval-state, audit-contract, buyer-copy, and Admin Workbench read-only hardening complete; no workflow execution, status changes, or readiness evidence. |
| 17 | M5.5c Secure Export and Artifact Storage Design/Implementation Gate | Complete as execution-neutral export/artifact/storage control hardening | Deterministic export/artifact control model, storage-access policy model, read-only Admin summary, tests, guardrails, and docs accepted; no export/PDF/download artifacts, storage access, signed URLs, or readiness evidence. |
| 18 | M5.6a RLS/Tenant-Isolation Implementation Preparation Gate | Complete as execution-neutral RLS/tenant-isolation preparation | Prepared deterministic RLS/tenant-isolation authority surfaces, future assertion categories, redaction rules, read-only summaries, tests, guardrails, and docs; no DB/RLS/artifact execution approved or performed. |
| 19 | M5.6b Hosted/Deployment/Operations Preparation Gate | Complete as execution-neutral hosted/deployment/operations preparation | Deterministic environment-classification contracts, operational gate matrix contracts, read-only summaries, tests, guardrails, and docs accepted; no hosted/deployment/startup/readiness execution or readiness evidence. |
| 20 | M5.7 First AP-Approved Evidence Execution Gate | Complete as docs/model-only gate-selection and approval-preparation | Candidate-track comparison, Manual Browser Walkthrough first-candidate recommendation for AP review only, pending AP decision/future execution contracts, tests, guardrails, read-only summaries, and docs accepted; no AP approval, execution, or readiness evidence. |
| 21 | Post-M5.7 Manual Browser Walkthrough AP Go/No-Go Decision Record | Complete as docs/model-only AP decision-boundary record | Records Manual Browser Walkthrough candidate decision state as pending by default, defines future scope template, stop conditions, abort rules, and evidence summary format; no AP approval, execution, browser launch, screenshots, artifacts, workflow/status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, real assertions, or readiness evidence. |
| 22 | Post-M5.7 Manual Browser Walkthrough One-Pass Observation Evidence | Complete as blocked one-pass observation evidence | Closed under the narrow AP approval for exactly one manual observation pass; the pass was blocked before UI surface observation, no approved surfaces were observed, and no screenshots, browser artifacts, export/PDF/download artifacts, workflow/status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, real assertions, readiness evidence, or readiness claims were produced. |
| 23 | Post-M5.7 Manual Browser Walkthrough One-Pass Observation Retry With Frontend Access Preflight | Complete as stopped frontend-access preflight retry evidence | Closed under AP approval for exactly one frontend-access preflight before a single retry observation pass; the preflight result was unavailable, observation did not proceed, no approved surfaces were observed, and no screenshots, browser artifacts, export/PDF/download artifacts, workflow/status changes, DB/RLS/artifact checks, hosted/deployment validation, provider/classifier execution, real assertions, readiness evidence, or readiness claims were produced. |
| 24 | Post-M5.7 Frontend Access Unavailability Triage and Remediation Plan | Complete as docs/model-only triage/remediation planning | Reviews PR #184 and PR #185 blocked/stopped outcomes and defines non-executing remediation options before any further browser retry; no root-cause proof, frontend fix, startup/readiness check, browser execution, hosted/deployment validation, DB/RLS/artifact/schema execution, provider/classifier execution, workflow/status change, readiness evidence, or next execution milestone. |
| 25 | Post-M5.7 Local Frontend Access Runbook and Static Surface Inventory Gate | Complete as docs/model-only local frontend access runbook and static surface inventory gate | Defines a future local frontend access runbook template, static buyer/admin surface inventory, unresolved ambiguity register, AP approval requirements, and stop conditions; no root-cause proof, frontend fix, startup/readiness check, browser execution, hosted/deployment validation, DB/RLS/artifact/schema execution, provider/classifier execution, workflow/status change, readiness evidence, or next execution milestone. |

## Sequencing Rule

Later M5.2 authority slices can close after the M5.3 plan because M5.3 is not implementation. M5.3a through M5.3a-11 are planning, boundary, synthetic-only, and reconciliation records. Actual RLS implementation or real DB/RLS/artifact evidence execution must wait for a new explicit AP approval gate with exact scope, run count, output boundaries, stop conditions, and proof boundaries.

M5.4a-M5.4f are closed as enterprise planning evidence-pack records only. They do not prove production, hosted, deployment, security, buyer, product, release-candidate, compliance, RLS, tenant-isolation, local-readiness, schema, or artifact SELECT readiness.

PR #161-#175 are accepted as the Premium Enterprise Buyer Acceptance, Trust Center, Admin Workbench, and Browser Walkthrough approval-boundary track through PR #175. PR #175 remains a pre-execution readiness check for AP go/no-go decision only. AP approval has not been granted; browser execution has not been approved or performed; no browser launched, automation ran, screenshots were captured, export/PDF/download artifacts were produced, browser/run evidence was created, approval workflow ran, or statuses changed.

M5.5a is a docs-only enterprise completion control gate after accepted PR #176 closure. It does not silently overwrite the prior M5.5-M5.6 meaning. Before M5.5a, current tracking treated M5.5-M5.6 as planned secure export, deployment, runbook, and pilot evidence work. M5.5a records a proposed grouped realignment into M5.5b, M5.5c, M5.6a, M5.6b, and M5.7 so future implementation can use fewer larger workstreams while keeping high-risk execution tracks separately approved.

The M5.3a local-readiness loop remains stopped. No current roadmap entry proves local readiness, schema availability, RLS behavior, artifact SELECT isolation, tenant isolation, hosted pilot readiness, production readiness, deployment readiness, security readiness, buyer readiness, product readiness, release-candidate readiness, compliance readiness, or local startup success.

## Next Safe Path

M5.7 is closed as docs/model-only First AP-Approved Evidence Execution Gate. It compared candidate evidence tracks, recommended Manual Browser Walkthrough as the first candidate for AP review only, and defined pending AP decision and future execution contracts without granting AP approval, approving execution, launching a browser, capturing screenshots, generating exports/PDFs/downloads, creating storage objects, generating signed URLs, executing workflows, changing statuses, running DB/RLS/artifact checks, inspecting schema, running hosted/deployment validation, executing provider/classifier behavior, running real assertions, producing readiness evidence, or starting any post-M5.7 execution milestone.

The Post-M5.7 Manual Browser Walkthrough AP Go/No-Go Decision Record is closed as a docs/model-only decision-boundary record. It records AP decision state as pending because AP has not supplied explicit approval text. It defines a future execution scope template, allowed observations, prohibited outputs, stop conditions, abort rules, and evidence summary format without approving or performing browser execution.

The Post-M5.7 Manual Browser Walkthrough One-Pass Observation Evidence milestone is closed as blocked one-pass observation evidence under a narrow AP approval for exactly one manual observation pass. The pass was blocked before UI surface observation, no approved surfaces were observed, and the result remains observation evidence only, not readiness evidence.

The Post-M5.7 Manual Browser Walkthrough One-Pass Observation Retry With Frontend Access Preflight milestone is closed as stopped frontend-access preflight retry evidence under AP approval for exactly one frontend-access preflight before a single retry observation pass. The preflight result was unavailable, observation did not proceed, no approved surfaces were observed, and the result remains observation evidence only, not readiness evidence.

The Post-M5.7 Frontend Access Unavailability Triage and Remediation Plan is closed as a docs/model-only control milestone. It records that another blind browser retry is not recommended after PR #184 and PR #185, identifies static triage categories, and recommends a future docs-only local frontend access runbook plus static surface inventory gate before AP considers any further execution. It does not prove root cause, fix frontend access, start a frontend server, run startup/readiness checks, launch a browser, run browser automation, capture screenshots, generate export/PDF/download artifacts, execute workflows, change statuses, run DB/RLS/artifact/schema checks, run hosted/deployment validation, execute providers/classifiers, run real assertions, produce readiness evidence, or start any next execution milestone.

The Post-M5.7 Local Frontend Access Runbook and Static Surface Inventory Gate is closed as a docs/model-only control milestone. It converts PR #186 recommended remediation into a static runbook template and surface inventory only. It does not execute the runbook, prove root cause, fix frontend access, start a frontend server, run startup/readiness checks, launch a browser, run browser automation, capture screenshots, generate export/PDF/download artifacts, execute workflows, change statuses, run DB/RLS/artifact/schema checks, run hosted/deployment validation, execute providers/classifiers, run real assertions, produce readiness evidence, or start any next execution milestone.

Direct browser execution, DB/RLS/artifact execution, hosted/deployment validation, provider/classifier execution, approval workflow execution, screenshots, exports, PDFs, downloads, and readiness evidence remain unapproved unless a later separate AP gate defines exact execution scope, run count, output boundaries, prohibited artifacts, stop conditions, and proof boundaries before execution.

## Health Boundary

KlarityFlow Health remains a separate proof vertical. Historical Health proof-pack planning is not active AvalaOS Core implementation scope.
