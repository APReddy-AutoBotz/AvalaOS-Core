# AvalaOS Core Technical Architecture

The detailed current and target trust architecture is authoritative at `docs/architecture/current-to-target-enterprise-architecture.md`.

## Current State

AvalaOS Core is a React/Vite TypeScript application with deterministic scoring, browser-side domain services, demo adapters, partial Supabase adapters, an incomplete canonical migration chain, and Supabase Edge sources for AI, extraction, export, storage, and provider governance.

Current strengths:

- deterministic scoring and regression coverage;
- explicit product/module policy scaffolding;
- provider-governance code that checks active membership and fails closed on allowed-operation audit failure;
- source-level delivery, export, storage, and signed-URL guards;
- historical evidence and proof-boundary discipline.

Current enterprise gaps:

- browser identity and permission projections remain influential authority;
- missing Supabase configuration silently selects mock behavior;
- privileged authorization is not uniformly revalidated server-side;
- service-role Edge helpers contain a P0 URL escape and incomplete export authorization;
- audit behavior is not uniformly atomic/fail closed;
- Assess scoring and lifecycle remain browser-driven;
- schema authority is split between `supabase/migrations/` and legacy `docs/schema/` contracts;
- tenant isolation and deployment have not been proven.

## Target Request Path

```text
Browser projection
  → Edge/API transport router
  → separate typed command/query handler
  → fresh server identity and tenant/workspace/resource authorization
  → deterministic policy, idempotency, expected-version check
  → one state + audit transaction
  → sanitized, stable, non-disclosing response
```

The browser is not an authorization boundary. Service-role access does not replace application authorization. Storage authority is allowlisted and derived server-side. Pilot and production fail closed.

## Scoring And AI Boundaries

- Deterministic scoring is authoritative for scores, gates, risk tiers, recommendations, business value, and handoff eligibility.
- AI may draft or transform editable content but cannot decide deterministic or regulated outcomes.
- Pilot and production AI runs server-side with governed provider configuration and no browser-held secrets.

## Data Authority

- `supabase/migrations/` is the canonical ordered migration chain.
- `docs/schema/` is legacy design/historical operational reference until required contracts are reconciled.
- Schema-changing PRs require fresh, upgrade, policy/RLS, failure, and rollback/read-only verification.

## Transition

- PR 1A establishes fail-closed runtime and platform safety.
- PR 1B establishes server identity/RBAC/RLS and Assess command authority.
- PR 1C cuts over the enterprise Assess UI and atomic Govern/Studio handoff.

No architecture statement in this document is deployment or readiness proof.
