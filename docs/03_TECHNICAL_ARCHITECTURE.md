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

## Governance Boundary

Avala Govern Lite is a lightweight model and card derived from existing assessment/process data. It does not execute agents, monitor live runtime behavior, or add MCP/A2A controls in this phase.

## Repository Direction

The codebase is being prepared for `APReddy-AutoBotz/AvalaOS-Core`. Existing internal module keys may remain `assess`, `docs`, `delivery`, `monitor`, and `admin` to avoid unnecessary refactor risk.
