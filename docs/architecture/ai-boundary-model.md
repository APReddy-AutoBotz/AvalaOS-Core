# AI Boundary Model

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Allowed AI Role

- Draft editable documents.
- Summarize approved source material.
- Refine language with human review.
- Explain deterministic outputs without changing them.

## Prohibited AI Role

- Decide scores, gates, risk tiers, approvals, or regulated decisions.
- Override deterministic engines.
- Invent missing evidence.
- Execute live agent or automation actions in M0.2.

## Execution Boundary

Pilot and production AI execution must be server-side through Supabase Edge Functions or equivalent backend services. Local demo fallbacks remain transitional and must not be treated as pilot-ready behavior.
