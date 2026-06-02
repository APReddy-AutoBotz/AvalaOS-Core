# KlarityPM

KlarityPM is the AI Delivery Brain for enterprise automation and AI teams. It helps organizations assess automation and AI opportunities, generate governed documentation, create traceable delivery work, and give leadership visibility from idea to execution.

Enterprise tagline: Governed automation and AI delivery workspace.

Investor framing: Cursor for Automation and AI Delivery Teams.

The product is currently a production-transition build. It demonstrates the Assess -> Docs -> Delivery -> Monitor lifecycle, but it is not yet production ready for enterprise pilot or GA use.

## Source Of Truth

Start with the canonical documentation index:

- [docs/00_DOCS_INDEX.md](docs/00_DOCS_INDEX.md)

The active narrative docs are:

- [Product Strategy](docs/01_PRODUCT_STRATEGY.md)
- [Product Requirements](docs/02_PRODUCT_REQUIREMENTS.md)
- [Technical Architecture](docs/03_TECHNICAL_ARCHITECTURE.md)
- [Implementation Roadmap](docs/04_IMPLEMENTATION_ROADMAP.md)
- [Current Implementation Status](docs/05_CURRENT_IMPLEMENTATION_STATUS.md)
- [Security And Enterprise Readiness](docs/06_SECURITY_ENTERPRISE_READINESS.md)

Historical and superseded docs are kept in `docs/archive/`.

## Golden Path

Organization -> Process Catalog -> Guided Assessment -> Deterministic Score -> Recommendation -> Decision Pack -> Docs Handoff -> Generated Document -> Work Items -> Delivery Board -> Monitor Dashboard.

KlarityPM should not drift into a generic project management tool. Its value is the governed handoff from assessment to documentation to delivery to executive monitoring.

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

These functions still need Supabase deployment, environment secrets, and private storage buckets before they can be used in a live pilot. The AI governance migration has been applied to the live Supabase project.

## Production Readiness Note

Do not treat this build as production ready until the blockers in [docs/05_CURRENT_IMPLEMENTATION_STATUS.md](docs/05_CURRENT_IMPLEMENTATION_STATUS.md) and [docs/06_SECURITY_ENTERPRISE_READINESS.md](docs/06_SECURITY_ENTERPRISE_READINESS.md) are resolved, especially server-side AI execution, BYOK handling, RLS enforcement, audit coverage, document export, and E2E coverage.
