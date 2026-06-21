# AvalaOS Core

AvalaOS Core is the governed AI and automation delivery platform. It helps teams evaluate processes, generate delivery-ready documentation, govern agents and automations, manage human approvals, and prove decisions with evidence.

Canonical tagline: Evaluate before you automate. Govern before you execute.

AvalaOS Core is not a generic project management tool. It owns the governed path from process assessment to decision pack, documentation, delivery handoff, approvals, and portfolio visibility.

## Source Of Truth

Start with the canonical documentation set:

- [Source of Truth](docs/00_SOURCE_OF_TRUTH.md)
- [Product Strategy](docs/01_PRODUCT_STRATEGY.md)
- [Product Requirements](docs/02_PRODUCT_REQUIREMENTS.md)
- [Technical Architecture](docs/03_TECHNICAL_ARCHITECTURE.md)
- [MVP Roadmap](docs/04_MVP_ROADMAP.md)
- [Implementation Status](docs/05_IMPLEMENTATION_STATUS.md)
- [Security and Governance](docs/06_SECURITY_AND_GOVERNANCE.md)
- [Avala Govern Framework](docs/07_AVALA_GOVERN_FRAMEWORK.md)
- [Migration from historical prototype naming](docs/08_MIGRATION_FROM_KLARITYPM.md)
- [Task Ledger](docs/task-ledger.md)
- [Readiness Gates](docs/quality/readiness-gates.md)
- [Milestone Roadmap](docs/planning/milestone-roadmap.md)

Historical evidence files under `docs/quality/` are immutable records. They provide proof for closed milestones, but they do not override the canonical source-of-truth docs above.

## Current Baseline

- M0 through M4.5 are closed as migration, build-control, Govern Lite, governed-delivery, server-side AI/BYOK hardening, and buyer-demo readiness milestones.
- M5 enterprise readiness is active. M5.0 through M5.3 planning and M5.2 authority slices through M5.2g-a are present on main.
- M5.2g-a created the `delivery_work_items` authority table with RLS enabled and no policies. This is fail-closed readiness only; it is not tenant-isolation proof or hosted Delivery runtime readiness.
- M5.3 is an RLS policy design and test plan. RLS implementation, tenant-isolation tests, and policy proof require a later approved milestone.
- Avala Govern Lite and Avala Delivery Lite remain canonical scoped module names. "Lite" means governed, intentionally bounded surfaces; it is not stale prototype branding.
- KlarityFlow Health remains a separate proof vertical and must not be merged into core platform scope without explicit approval.

## Platform Modules

- Avala Assess: process intake, deterministic scoring, AI/RPA/workflow/HITL/agentic fitment, and decision packs.
- Avala Studio: BRD, PRD, PDD, SDD, diagrams, work items, and editable governed documents.
- Avala Govern Lite: governance cards for agents and automations with autonomy, risk, approvals, evidence, and blocked actions.
- Avala Delivery Lite: approved work items, board, owners, status, blockers, and handoff lineage.
- Avala Monitor: value, risk, blockers, and portfolio visibility.
- Avala Admin / Avala AI Controls: organization, users, providers, BYOK/key reference, audit, and security settings.

## Golden Path

Organization -> Process Catalog -> Guided Assessment -> Deterministic Score -> Recommendation -> Decision Pack -> Avala Govern Lite -> Avala Studio Handoff -> Generated Document -> Work Items -> Avala Delivery Lite Board -> Avala Monitor Dashboard.

Assess scoring is deterministic. The current Assess engine annualizes business value from annual volume and average effort per case, then exposes annual manual effort, estimated saved hours, savings, build/run cost bands, payback, risk gates, HITL signals, and formula summaries in the Decision Pack.

## Run Locally

Prerequisites:

- Node.js
- npm

Install dependencies:

```powershell
npm install
```

Run the development server:

```powershell
npm run dev
```

Run release checks:

```powershell
npm run typecheck
npm run test
npm run build
npm audit --audit-level=moderate
```

Supabase-backed smoke tests require the correct environment variables and live database access.

Server-side AI migration flag:

- `VITE_AI_EDGE_FUNCTIONS_ENABLED=true` routes supported AI document generation/refinement calls through Supabase Edge Functions.
- Leave it unset or `false` for the current local transitional demo fallback.
- Enterprise pilot and production must use server-side AI; browser-side provider execution is not acceptable for real customer data.

Authored Edge Function source:

- `supabase/functions/ai-generate-document`
- `supabase/functions/ai-refine-section`
- `supabase/functions/ai-provider-test-connection`
- `supabase/functions/ai-usage-log`
- `supabase/functions/extract-document-text`
- `supabase/functions/export-document`
- `supabase/functions/export-decision-pack`

These functions still need Supabase deployment, environment secrets, private storage buckets, RLS policy implementation, and tenant-isolation proof before they can be used in a live pilot.

## Repository Direction

This workspace is the AvalaOS Core repository. Do not push changes from this migration to the historical prototype repository.
