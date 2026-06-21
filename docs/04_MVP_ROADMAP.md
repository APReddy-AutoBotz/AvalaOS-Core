# AvalaOS Core Roadmap

## Roadmap Authority

This roadmap reconciles the current accepted baseline after the docs consistency audit. Historical evidence files remain records of prior slices. This file, `docs/00_SOURCE_OF_TRUTH.md`, `docs/05_IMPLEMENTATION_STATUS.md`, and `docs/task-ledger.md` are the active roadmap and status authority.

## Completed Baseline

| Milestone | Current Status | Roadmap Meaning |
| --- | --- | --- |
| M0 | Complete | AvalaOS Core migration, naming baseline, and historical prototype separation were established. |
| M0.2 | Complete | Build Control Pack, agent rules, governance docs, planning docs, and evidence rules were established. |
| M1 | Complete | Avala Govern Lite hardening established scoped governance cards and control models. |
| M2 | Complete | Governed Delivery Pack established handoff lineage from decisions to delivery work. |
| M3 | Complete | Server-side AI/BYOK hardening moved the pilot direction away from browser-side provider execution. |
| M4 through M4.5 | Complete | Buyer-demo readiness and M5 readiness gate evidence were closed. |
| M5.0 through M5.2 | Complete as planning/readiness | Enterprise Supabase readiness, secret hygiene, and auth/org/workspace schema planning were accepted. |
| M5.2a through M5.2g-a | Complete or merged as authority groundwork | Authority and ownership groundwork exists on main. M5.2g-a is fail-closed table readiness, not tenant-isolation proof. |
| M5.3 | Complete as design/test plan | RLS policy design and test planning are documented. Policy implementation remains future work. |

## Active Enterprise Readiness Track

| Track | Status | Required Next Evidence |
| --- | --- | --- |
| M5.2 authority groundwork | Complete through M5.2g-a evidence | Confirmation that authority boundaries are sufficient before any RLS implementation. |
| M5.3a RLS policy implementation | Planned, not started | Approved scope, policy migration, tenant-isolation tests, and post-merge evidence. |
| Audit and evidence operations | Planned | Evidence lineage, audit coverage, and export readiness with verification. |
| Secure export and storage | Planned | Private bucket configuration, export checks, and runbook evidence. |
| Deployment and pilot readiness | Planned | Environment runbooks, smoke tests, open-risk list, and AP acceptance. |
| KlarityFlow Health | Separate proof vertical | Separate approval and evidence if Health work is opened. |

## Sequencing Clarification

M5.3 was merged as an RLS design/test-plan milestone before some later M5.2 authority follow-up slices. That does not make the sequence contradictory. The canonical interpretation is:

1. M5.3 design and test planning can exist before all authority-table follow-up slices are complete.
2. M5.3a implementation must wait until the required M5.2 authority boundaries are accepted.
3. Authority slices such as M5.2g-a do not themselves satisfy RLS policy proof.
4. Tenant isolation is not accepted until policy implementation, tests, and post-merge verification are complete.

## Non-Scope Until Approved

- No scoring behavior changes.
- No schema or migration changes from documentation cleanup.
- No runtime AI behavior changes from documentation cleanup.
- No CI changes from documentation cleanup.
- No Health implementation or core-platform merge without explicit approval.
