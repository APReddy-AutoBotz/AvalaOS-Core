# KlarityPM Documentation Index

Last Updated: 2026-05-08  
Owner: Product / Engineering

## What This Doc Is

This is the source-of-truth entry point for KlarityPM documentation. It explains which docs are canonical, which files are operational assets, and where historical material lives.

## What This Doc Is Not

This is not a requirements document, technical design, roadmap, or status report. It only routes readers to the right canonical source.

## Canonical Docs

- [01_PRODUCT_STRATEGY.md](01_PRODUCT_STRATEGY.md): product vision, positioning, ICPs, personas, product modes, differentiation, and narrative.
- [02_PRODUCT_REQUIREMENTS.md](02_PRODUCT_REQUIREMENTS.md): product scope and requirements for Home, Assess, Docs, Delivery, Monitor, Admin, and AI Provider Settings.
- [03_TECHNICAL_ARCHITECTURE.md](03_TECHNICAL_ARCHITECTURE.md): recommended stack, architecture principles, frontend/backend rules, AI architecture, file processing, data model, and testing architecture.
- [04_IMPLEMENTATION_ROADMAP.md](04_IMPLEMENTATION_ROADMAP.md): ordered implementation phases from documentation baseline through enterprise GA.
- [05_CURRENT_IMPLEMENTATION_STATUS.md](05_CURRENT_IMPLEMENTATION_STATUS.md): living ledger of what is implemented, migration-ready, pending, blocked, and verified.
- [06_SECURITY_ENTERPRISE_READINESS.md](06_SECURITY_ENTERPRISE_READINESS.md): security blockers, enterprise pilot minimums, GA controls, and AI governance.

## Operational Assets

The following folder remains active and is not an archived documentation source:

- `docs/schema/`: Supabase and PostgreSQL migration SQL, seed SQL, and RLS regression SQL.

## Archive Policy

Superseded narrative docs were removed from the active repository to keep one current source of truth. Historical drafts should not be used to make product or engineering decisions.

## Archived Docs Manifest

| Archived Doc | Replaced By | Reason | Notes |
|---|---|---|---|
| `adr_001_backend_infrastructure_legacy.md` | `03_TECHNICAL_ARCHITECTURE.md` | Architecture decision content consolidated into the canonical architecture doc. | Historical ADR retained for traceability. |
| `current_implementation_status_legacy.md` | `05_CURRENT_IMPLEMENTATION_STATUS.md` | Replaced by the single living implementation status ledger. | Useful completed/pending details were merged. |
| `current_state_against_technical_plan_legacy.md` | `05_CURRENT_IMPLEMENTATION_STATUS.md`, `04_IMPLEMENTATION_ROADMAP.md` | Mixed status and roadmap content created competing sources of truth. | Historical review retained. |
| `demo_personas_and_permissions_legacy.md` | `01_PRODUCT_STRATEGY.md`, `02_PRODUCT_REQUIREMENTS.md`, `06_SECURITY_ENTERPRISE_READINESS.md` | Personas and role expectations consolidated into canonical product docs. | Detailed persona notes can be referenced if needed. |
| `design_system_lock_legacy.md` | `01_PRODUCT_STRATEGY.md`, `02_PRODUCT_REQUIREMENTS.md` | Design principles consolidated without maintaining a separate design source of truth. | UI implementation remains in the app codebase. |
| `enterprise_product_requirements_and_readiness_legacy.md` | `02_PRODUCT_REQUIREMENTS.md`, `06_SECURITY_ENTERPRISE_READINESS.md` | Requirements and enterprise readiness content split into canonical docs. | Retained as historical background. |
| `klaritypm_assess_revised_spec_legacy.md` | `02_PRODUCT_REQUIREMENTS.md`, `03_TECHNICAL_ARCHITECTURE.md` | Assess direction consolidated into the canonical product requirements. | Detailed implementation notes remain historical. |
| `klaritypm_assess_scoring_legacy.md` | `02_PRODUCT_REQUIREMENTS.md`, `03_TECHNICAL_ARCHITECTURE.md`, scoring tests/source | Scoring rules consolidated at requirements/architecture level; code/tests are implementation authority. | Can help engineers understand legacy scoring context. |
| Legacy Assess drafts | `02_PRODUCT_REQUIREMENTS.md`, `03_TECHNICAL_ARCHITECTURE.md`, `05_CURRENT_IMPLEMENTATION_STATUS.md` | Deep Assess requirements merged into canonical docs. | Removed from the active repo to avoid competing Assess versions. |
| `product_flow_review_legacy.md` | `01_PRODUCT_STRATEGY.md`, `02_PRODUCT_REQUIREMENTS.md` | Product flow decisions consolidated around the sacred golden path. | Historical product critique retained. |
| `technical_plan_prod_ready_low_cost_legacy.md` | `03_TECHNICAL_ARCHITECTURE.md`, `04_IMPLEMENTATION_ROADMAP.md`, `05_CURRENT_IMPLEMENTATION_STATUS.md` | Mixed technical plan, status, and roadmap content replaced by separated canonical docs. | Retained as the broad predecessor plan. |

## Product Golden Path

Organization -> Process Catalog -> Guided Assessment -> Deterministic Score -> Recommendation -> Decision Pack -> Docs Handoff -> Generated Document -> Work Items -> Delivery Board -> Monitor Dashboard.

All product, design, and engineering decisions should strengthen this path before adding adjacent features.

## Product Boundary

KlarityPM is not intended to replace Jira, Azure DevOps, or ServiceNow. It owns the governed work before and around delivery execution: assessment, feasibility, documentation, approvals, handoff, traceability, and leadership visibility.

## Demo And Release Modes

- Investor Demo Mode: polished seeded story showing the product narrative and end-to-end flow.
- Enterprise Pilot Mode: real tenant setup, secure AI, role-based access, auditability, export, and buyer-review security notes.
- Enterprise GA Mode: enterprise controls such as SSO, SCIM, SIEM export, retention, data residency, compliance documentation, and operational runbooks.
