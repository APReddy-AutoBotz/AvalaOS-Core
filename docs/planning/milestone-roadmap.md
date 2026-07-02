# Milestone Roadmap

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

This roadmap is the active milestone sequence after the documentation consistency audit. It replaces stale Phase 1-4 and Health-as-M5 interpretations while preserving historical evidence as history.

## Gate Roadmap

| Gate | Milestone | Current Status | Outcome |
| --- | --- | --- | --- |
| Gate 0 | M0 Migration | Complete | AvalaOS naming, main branch, foundation tag, historical prototype separation. |
| Gate 1 | M0.2 Build Control Pack | Complete | Agent rules, governance docs, readiness gates, evidence review. |
| Gate 2 | M1 Govern Lite Hardening | Complete | Stronger governance card, registry fields, approval and evidence surfaces. |
| Gate 3 | M2 Governed Delivery Pack | Complete | Traceable handoff from approved decisions to delivery work. |
| Gate 4 | M3 Server-Side AI/BYOK Hardening | Complete | Server-side provider controls and audit-ready key reference model. |
| Gate 5 | M4 Buyer Demo Readiness | Complete | Focused buyer-demo flow with evidence, governance, and claim-safe copy. |
| Gate 6 | M5 Enterprise Readiness | Active | Supabase authority, RLS, audit, export, deployment, and runbook readiness. |
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
| 12 | M5.3a-11 M5.3 tracking reconciliation after synthetic boundary closure | Active docs-only reconciliation | Correct tracking drift only; no DB/RLS/artifact execution, local-readiness reopening, or readiness claims. |
| 13 | M5.4-M5.6 Audit, export, deployment, runbook readiness | Planned | Requires separate approved milestones and evidence. |

## Sequencing Rule

Later M5.2 authority slices can close after the M5.3 plan because M5.3 is not implementation. M5.3a through M5.3a-10 are planning, boundary, synthetic-only, and reconciliation records. Actual RLS implementation or real DB/RLS/artifact evidence execution must wait for a new explicit AP approval gate with exact scope, run count, output boundaries, stop conditions, and proof boundaries.

The M5.3a local-readiness loop remains stopped. No current roadmap entry proves local readiness, schema availability, RLS behavior, artifact SELECT isolation, tenant isolation, hosted pilot readiness, production readiness, or local startup success.

## Health Boundary

KlarityFlow Health remains a separate proof vertical. Historical Health proof-pack planning is not active AvalaOS Core implementation scope.
