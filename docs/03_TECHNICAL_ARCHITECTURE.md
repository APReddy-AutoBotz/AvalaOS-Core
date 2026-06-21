# AvalaOS Core Technical Architecture

## Current Architecture

AvalaOS Core is a React/Vite application with TypeScript domain models, local demo adapters, Supabase-ready services, and Supabase Edge Function sources for AI and export paths.

Core areas:

- React UI shell with module gating.
- Deterministic Assess scoring in `services/scoringEngine.ts`.
- Scoring regression harness in `scripts/runScoringRegression.mjs`.
- Delivery policy checks and tests in `services/deliveryPolicy.ts` and `services/deliveryPolicy.test.ts`.
- Supabase adapters and schema contracts under `services/adapters` and `docs/schema`.
- Supabase Edge Function sources under `supabase/functions`.

## Scoring Boundary

Deterministic scoring is the authority for scores, gates, risk tiers, recommendations, business value, and handoff readiness. AI may draft documentation, summarize context, or refine editable sections, but it must not decide final scoring outputs.

## AI Boundary

Pilot and production AI calls must run server-side through Supabase Edge Functions or equivalent backend services. Browser-side AI provider execution and raw browser-stored provider keys are not acceptable for real customer data.

## Enterprise Persistence Baseline

The M5 enterprise-readiness track is building toward Supabase-backed tenant isolation and deployment readiness. Current accepted architecture state:

- Supabase schema contracts, adapters, and Edge Function source files are authored.
- M5.2 authority slices have added organization/workspace context and ownership groundwork across core domains.
- M5.2f established project authority, and M5.2g-a established the `delivery_work_items` authority table.
- The M5.2g-a `delivery_work_items` table has RLS enabled with no policies. This is fail-closed readiness only and must not be represented as tenant-isolation proof.
- Delivery runtime adapters still require an approved migration path before hosted Delivery runtime behavior can depend on the new `delivery_work_items` authority table.
- M5.3 is a policy design and test plan. RLS policy implementation and isolation tests remain future milestone work.

## Governance Boundary

Avala Govern Lite is a lightweight model and card derived from existing assessment/process data. It does not execute agents, monitor live runtime behavior, or add MCP/A2A controls in this phase.

## Repository Direction

This repository is AvalaOS Core. Existing internal module keys may remain `assess`, `docs`, `delivery`, `monitor`, and `admin` to avoid unnecessary refactor risk.
