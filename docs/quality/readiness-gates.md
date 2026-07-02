# Readiness Gates

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

No gate passes without evidence, verification, and AP acceptance where required. Historical evidence proves a gate state at the time it was written; current gate status is maintained here and in `docs/task-ledger.md`.

## Core Gates

| Gate | Name | Current Status | Required Evidence |
| --- | --- | --- | --- |
| Gate 0 | Migration complete | Complete | Main normalized, migration docs, no old repo push. |
| Gate 1 | Build Control Pack complete | Complete | M0.2 docs, skills, inventory, wording scan, verification. |
| Gate 2 | Govern Lite hardening complete | Complete | Registry fields, approval/evidence rules, audit status. |
| Gate 3 | Governed Delivery Pack complete | Complete | Handoff lineage, owners, blockers, source evidence. |
| Gate 4 | Server-side AI/BYOK hardening complete | Complete | Server-side execution direction, key references, usage audit, browser-key lockdown. |
| Gate 5 | Buyer demo readiness complete | Complete | Demo story, verified flow, claim-safe copy, M5 readiness gate. |
| Gate 6 | Enterprise readiness track | Active | M5 Supabase, RLS, audit, export, deployment, and runbook evidence. |
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
| M5.3a-11 | M5.3 tracking reconciliation after synthetic boundary closure | Active docs-only reconciliation | Correct tracking drift only; no DB/RLS/artifact execution, local-readiness reopening, or readiness claims. |
| M5.4 | Audit and evidence operations | Planned | Requires explicit scope and verification. |
| M5.5 | Secure export and storage readiness | Planned | Requires explicit scope and verification. |
| M5.6 | Deployment, runbooks, and pilot evidence | Planned | Required before pilot readiness acceptance. |

## Health Boundary

KlarityFlow Health is not Gate 6 for AvalaOS Core. It remains a separate proof vertical and may only move through Health-specific gates if explicitly approved.

## Current M5.3a Proof Boundary

M5.3a-9 and M5.3a-10 do not approve real assertion execution or DB/RLS/artifact execution. No readiness evidence exists from those milestones.

The local-readiness loop remains stopped. Local DB availability remains unresolved, schema is not proven, RLS is not proven, RLS helper behavior is not newly validated, artifact SELECT isolation is not verified, tenant isolation is not newly verified, hosted readiness is not proven, production readiness is not proven, and local startup success is not proven.

Any future real evidence run requires a new explicit AP approval gate before execution.
