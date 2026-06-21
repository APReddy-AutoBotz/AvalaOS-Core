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
| 8 | M5.3a-1a Local RLS Validation Harness Plan | Planned | Next safe milestone; define repeatable local validation before any RLS implementation claim. |
| 9 | M5.4-M5.6 Audit, export, deployment, runbook readiness | Planned | Requires separate approved milestones and evidence. |

## Sequencing Rule

Later M5.2 authority slices can close after the M5.3 plan because M5.3 is not implementation. M5.3a and M5.3a-1 are also planning-only records. Actual RLS implementation must wait for sufficient authority boundaries, a local validation decision, and explicit approval.

M5.3a-1a is the next safe milestone. It must remain a local validation harness plan unless AP explicitly approves implementation work. No current roadmap entry proves tenant isolation or hosted pilot readiness.

## Health Boundary

KlarityFlow Health remains a separate proof vertical. Historical Health proof-pack planning is not active AvalaOS Core implementation scope.
