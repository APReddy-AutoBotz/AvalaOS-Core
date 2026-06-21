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
| M5.3a-1a | Local RLS validation harness plan | Planned | Next safe milestone; required before verified tenant isolation can be claimed. |
| M5.4 | Audit and evidence operations | Planned | Requires explicit scope and verification. |
| M5.5 | Secure export and storage readiness | Planned | Requires explicit scope and verification. |
| M5.6 | Deployment, runbooks, and pilot evidence | Planned | Required before pilot readiness acceptance. |

## Health Boundary

KlarityFlow Health is not Gate 6 for AvalaOS Core. It remains a separate proof vertical and may only move through Health-specific gates if explicitly approved.
