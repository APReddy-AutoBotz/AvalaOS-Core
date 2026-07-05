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

- M0 through M4.5 are closed as migration, build-control, governance hardening, governed-delivery, server-side AI/BYOK hardening, and buyer-demo readiness milestones.
- M5 enterprise readiness is active. M5.0 through M5.3 planning, M5.2 authority slices through M5.2g-a, M5.3a synthetic-boundary reconciliation, and M5.4a-M5.4f enterprise planning evidence-pack records are present on main.
- M5.2g-a created the `delivery_work_items` authority table with RLS enabled and no policies. This is fail-closed readiness only; it is not tenant-isolation proof or hosted Delivery runtime readiness.
- M5.3 is an RLS policy design and test plan. RLS implementation, tenant-isolation tests, and policy proof require a later approved milestone.
- M5.4a-M5.4f are closed as an enterprise planning evidence pack, not as production, hosted, deployment, security, buyer, product, release-candidate, compliance, RLS, or tenant-isolation readiness proof.
- PR #161-#175 are accepted as the Premium Enterprise Buyer Acceptance, Trust Center, Admin Workbench, and Browser Walkthrough approval-boundary track through PR #175. PR #175 is a manual browser pre-execution readiness check for AP go/no-go decision only.
- AP approval has not been granted for manual browser execution. Browser execution has not been approved or performed; no browser launched, automation ran, screenshots were captured, export/PDF/download artifacts were produced, browser/run evidence was created, approval workflow ran, or statuses changed.
- Real DB/RLS/artifact, hosted, deployment, schema, provider, classifier, and real assertion execution remain unperformed. Production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, and compliance readiness remain unproven.
- Avala Govern and Avala Delivery are the buyer-facing canonical module names. Scope and proof boundaries are carried by claim controls, evidence gates, limitation disclosures, and Trust Center proof statuses, not by module names.
- KlarityFlow Health remains a separate proof vertical and must not be merged into core platform scope without explicit approval.

## Platform Modules

- Avala Assess: process intake, deterministic scoring, AI/RPA/workflow/HITL/agentic fitment, and decision packs.
- Avala Studio: BRD, PRD, PDD, SDD, diagrams, work items, and editable governed documents.
- Avala Govern: governance and control-plane surfaces for agents and automations with autonomy, risk, approvals, evidence, allowed actions, blocked actions, AI/provider controls, and audit posture. It does not execute bots, agents, RPA jobs, or external-system actions in the current baseline.
- Avala Delivery: governed delivery workbench for approved work items, owners, status, blockers, handoff lineage, delivery packs, and downstream delivery handoff. It is not a Jira replacement.
- Avala Monitor: value, risk, blockers, and portfolio visibility.
- Avala Admin / Avala AI Controls: organization, users, providers, BYOK/key reference, audit, and security settings.

## Golden Path

Organization -> Process Catalog -> Guided Assessment -> Deterministic Score -> Recommendation -> Decision Pack -> Avala Govern -> Avala Studio Handoff -> Generated Document -> Work Items -> Avala Delivery Board -> Avala Monitor Dashboard.

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
